// Token editing panels (SPEC section 10.1, section 10.2): global tokens grouped by design dimension,
// component overrides, densities, responsive overrides, and seeds with theme metadata.
import { Accordion } from '@absoluteui/components/accordion';
import { Select } from '@absoluteui/components/select';
import { TextInput } from '@absoluteui/components/text-input';
import {
  componentTokens,
  densities,
  getComponentToken,
  optionalTokenProblem,
  optionalTokens,
  requiredTokenNames,
  webFontProblem,
  webFontProviderOf,
  type ThemeMode,
  type WebFont,
} from '@absoluteui/theme';
import {
  RESPONSIVE_TOKEN_RE,
  breakpointNames,
  breakpoints,
  deriveMode,
  familyModes,
  overriddenTokens,
  resolveToken,
  seedNames,
  type BreakpointName,
  type DensityName,
  type ThemeFamily,
} from '@absoluteui/theme/designer';
import { modeLabels, type DesignerContext } from './context.js';
import { dimensions, isColorToken } from './dimensions.js';
import { announce, button, detail, el, hasNullableValue, hasValue, host, omit } from './dom.js';
import { foundationOf, resetToDerived, withComponentToken, withSeeds, withToken } from './store.js';
import { isPreviewableFont } from './protocol.js';
import { tokenRow, type TokenRow } from './token-row.js';

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
const hasExpanded = (v: unknown): v is { value: string[] } => isRecord(v) && Array.isArray(v.value);

/** Global tokens, grouped by dimension, for the mode being edited. Rows render when a group first opens. */
export function tokensPanel(parent: HTMLElement, ctx: DesignerContext): { reveal(name: string): boolean } {
  parent.append(el('p', { className: 'td-hint', text: 'Edit the tokens of the mode selected at the top. Values that differ from the seed derivation are kept when seeds change; the built-in theme is hand-tuned, so most of its colors differ.' }));
  const rows = new Map<string, TokenRow>();
  const bodies = new Map<string, HTMLElement>();
  let derived: Record<string, string> = {};
  let overridden = new Set<string>();
  const recompute = (): void => {
    const f = ctx.store.family;
    derived = { ...deriveMode(f.seeds, ctx.mode(), foundationOf(f)) };
    overridden = new Set(overriddenTokens(f, ctx.mode()));
  };
  recompute();

  const render = (id: string): void => {
    const body = bodies.get(id);
    const dim = dimensions.find((d) => d.id === id);
    if (!body || !dim || body.childElementCount > 0) return;
    if (dim.note) body.append(el('p', { className: 'td-hint', text: dim.note }));
    if (dim.id === 'fonts') fontsEditor(body, ctx);
    for (const name of dim.tokens) {
      const optional = optionalTokens[name];
      const row = tokenRow({
        name,
        description: optional?.usage ?? (derived[name] !== undefined && isColorToken(name) ? `Derived: ${derived[name]}` : ''),
        color: isColorToken(name),
        clearable: optional !== undefined,
        placeholder: optional ? 'unset (native)' : '',
        read: () => ctx.store.family.modes[ctx.mode()].tokens[name],
        write: (value) => {
          ctx.store.set(withToken(ctx.store.family, ctx.mode(), name, value), `edit ${name}`);
        },
        ...(optional ? { check: (v: string) => (optionalTokenProblem(name, v) === null ? null : `Use ${optional.values?.join(' or ') ?? 'a color'}.`) } : {}),
        ...(optional
          ? {}
          : {
              reset: () => {
                ctx.store.set(resetToDerived(ctx.store.family, ctx.mode(), name), `reset ${name}`);
                announce(`${name} reset to the derived value.`);
              },
              isOverridden: () => overridden.has(name),
            }),
      });
      rows.set(name, row);
      body.append(row.element);
    }
  };

  const items = dimensions
    .filter((d) => d.tokens.length > 0 || !['density', 'responsive', 'component'].includes(d.id))
    .map((d) => {
      const body = el('div', { className: 'td-group' });
      bodies.set(d.id, body);
      return { id: d.id, title: `${d.label}${d.tokens.length ? ` (${String(d.tokens.length)})` : ''}`, content: body };
    });
  const accordion = Accordion.create(host(parent), { items, multiple: true, collapsible: true, headingLevel: 3 });
  accordion.host.addEventListener('aui-change', (event) => {
    const d = detail(event, hasExpanded);
    for (const id of d?.value ?? []) render(id);
  });

  const refreshAll = (): void => {
    recompute();
    for (const row of rows.values()) row.refresh();
  };
  ctx.store.subscribe(refreshAll);
  ctx.onModeChange(refreshAll);

  return {
    reveal(name) {
      const dim = dimensions.find((d) => d.tokens.includes(name));
      if (!dim) return false;
      accordion.expand(dim.id);
      render(dim.id);
      const row = rows.get(name);
      row?.element.scrollIntoView({ block: 'center' });
      row?.focus();
      return row !== undefined;
    },
  };
}

/** Component token overrides for the mode being edited (SPEC section 10.2). */
export function componentsPanel(parent: HTMLElement, ctx: DesignerContext): { reveal(name: string): boolean } {
  parent.append(el('p', { className: 'td-hint', text: 'Override a global token for one component. Leave a field empty to follow the global token.' }));
  // Chart tokens have their own section with a live chart preview (charts-panel.ts).
  const names = Object.keys(componentTokens).filter((n) => n !== 'chart');
  let current = names[0] ?? 'button';
  const picker = Select.create(host(parent), { label: 'Component', options: names.map((n) => ({ value: n, label: n })), value: current });
  const list = host(parent, 'td-group');
  const rows = new Map<string, TokenRow>();
  const render = (): void => {
    list.replaceChildren();
    rows.clear();
    const group = componentTokens[current];
    if (!group) return;
    for (const [property, spec] of Object.entries(group.tokens)) {
      const name = `${current}-${property}`;
      const row = tokenRow({
        name,
        description: `${spec.usage}. Falls back to ${spec.fallback}.`,
        color: spec.kind === 'color',
        clearable: true,
        placeholder: `${spec.fallback}: ${resolveToken(ctx.store.family.modes[ctx.mode()], spec.fallback) ?? ''}`,
        read: () => ctx.store.family.modes[ctx.mode()].componentTokens[name],
        write: (value) => {
          ctx.store.set(withComponentToken(ctx.store.family, ctx.mode(), name, value), `edit ${name}`);
        },
      });
      rows.set(name, row);
      list.append(row.element);
    }
  };
  picker.host.addEventListener('aui-change', (event) => {
    const d = detail(event, hasNullableValue);
    if (d?.value) {
      current = d.value;
      render();
    }
  });
  render();
  const refresh = (): void => {
    for (const row of rows.values()) row.refresh();
  };
  ctx.store.subscribe(refresh);
  ctx.onModeChange(render);
  return {
    reveal(name) {
      const spec = getComponentToken(name);
      if (!spec || spec.component === 'chart') return false;
      if (spec.component !== current) {
        current = spec.component;
        picker.setValue(current);
        render();
      }
      const row = rows.get(name);
      row?.focus();
      return row !== undefined;
    },
  };
}

const densityTokenNames = [...new Set([...Object.keys(densities.compact), ...Object.keys(densities.spacious)])];

/** Density overrides (SPEC section 10.1 component density, section 10.3 density previews). */
export function densitiesPanel(parent: HTMLElement, ctx: DesignerContext): void {
  parent.append(el('p', { className: 'td-hint', text: 'Comfortable is the base token set. Compact and spacious override these tokens for every mode.' }));
  const rows: TokenRow[] = [];
  for (const d of ['compact', 'spacious'] as const satisfies readonly DensityName[]) {
    parent.append(el('h3', { className: 'td-subheading', text: d === 'compact' ? 'Compact' : 'Spacious' }));
    for (const name of densityTokenNames) {
      const row = tokenRow({
        name,
        description: `Comfortable: ${ctx.store.family.modes.light.tokens[name] ?? ''}`,
        color: false,
        clearable: true,
        placeholder: 'same as comfortable',
        read: () => ctx.store.family.densities[d][name],
        write: (value) => {
          const f = ctx.store.family;
          const map = value === null ? omit(f.densities[d], name) : { ...f.densities[d], [name]: value };
          ctx.store.set({ ...f, densities: { ...f.densities, [d]: map } }, `edit ${d} ${name}`);
        },
      });
      rows.push(row);
      parent.append(row.element);
    }
  }
  ctx.store.subscribe(() => {
    for (const r of rows) r.refresh();
  });
}

/** Responsive (min-width) overrides for typography, spacing, control size, and layout widths. */
export function responsivePanel(parent: HTMLElement, ctx: DesignerContext): void {
  parent.append(
    el('p', { className: 'td-hint', text: 'Values that apply from a breakpoint up (sm 640px, md 768px, lg 1024px, xl 1280px). Preview at tablet or desktop width to see them.' }),
  );
  const allowed = requiredTokenNames.filter((n) => RESPONSIVE_TOKEN_RE.test(n));
  const form = el('div', { className: 'td-inline-form' });
  parent.append(form);
  let bp: BreakpointName = 'md';
  let token = allowed[0] ?? 'font-size-md';
  const bpSelect = Select.create(host(form), { label: 'Breakpoint', options: breakpointNames.map((b) => ({ value: b, label: `${b} (${String(breakpoints[b])}px)` })), value: bp });
  const tokenSelect = Select.create(host(form), { label: 'Token', options: allowed.map((n) => ({ value: n, label: n })), value: token });
  const value = TextInput.create(host(form), { label: 'Value', placeholder: '1.125rem', spellcheck: false, autocomplete: 'off' });
  bpSelect.host.addEventListener('aui-change', (e) => {
    const d = detail(e, hasNullableValue);
    const next = breakpointNames.find((b) => b === d?.value);
    if (next) bp = next;
  });
  tokenSelect.host.addEventListener('aui-change', (e) => {
    const d = detail(e, hasNullableValue);
    if (d?.value) token = d.value;
  });
  let pending = '';
  value.host.addEventListener('aui-input', (e) => {
    pending = detail(e, hasValue)?.value.trim() ?? '';
  });
  button(form, 'Add override', { variant: 'primary' }, () => {
    const f = ctx.store.family;
    const next: ThemeFamily = { ...f, responsive: { ...f.responsive, [bp]: { ...(f.responsive[bp] ?? {}), [token]: pending } } };
    try {
      ctx.store.set(next, `responsive ${bp} ${token}`);
      value.setCustomError(null);
      value.setValue('');
      pending = '';
      announce(`${token} overridden from ${bp}.`);
    } catch {
      value.setCustomError('Enter a safe CSS value, such as 1.125rem.');
      value.reportValidity();
    }
  });
  const list = el('ul', { className: 'td-list', attrs: { 'aria-label': 'Responsive overrides' } });
  parent.append(list);
  const render = (): void => {
    list.replaceChildren();
    const f = ctx.store.family;
    for (const b of breakpointNames) {
      for (const [name, v] of Object.entries(f.responsive[b] ?? {})) {
        const li = el('li', { className: 'td-list__item' }, el('span', { text: `${b}: ${name} = ${v}` }));
        button(li, 'Remove', { variant: 'ghost', size: 'sm', label: `Remove ${name} at ${b}` }, () => {
          const map = omit(f.responsive[b] ?? {}, name);
          const responsive = Object.fromEntries(Object.entries({ ...f.responsive, [b]: map }).filter(([, m]) => Object.keys(m).length > 0));
          ctx.store.set({ ...f, responsive }, `remove responsive ${b} ${name}`);
        });
        list.append(li);
      }
    }
    if (list.childElementCount === 0) list.append(el('li', { className: 'td-hint', text: 'No responsive overrides.' }));
  };
  render();
  ctx.store.subscribe(render);
}

const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

/** Theme identity (name, version, description, author) and brand seeds. */
export function seedsPanel(parent: HTMLElement, ctx: DesignerContext): void {
  parent.append(el('h3', { className: 'td-subheading', text: 'Theme' }));
  const meta = el('div', { className: 'td-group' });
  parent.append(meta);
  const fields: { input: TextInput; read: () => string }[] = [];
  const metaField = (label: string, read: () => string, apply: (v: string) => ThemeFamily | string, description: string): void => {
    const input = TextInput.create(host(meta), { label, value: read(), description, spellcheck: false });
    input.host.addEventListener('aui-change', (e) => {
      const d = detail(e, hasValue);
      if (!d) return;
      const next = apply(d.value.trim());
      if (typeof next === 'string') {
        input.setCustomError(next);
        input.reportValidity();
        return;
      }
      input.setCustomError(null);
      ctx.store.set(next, `edit ${label}`);
    });
    fields.push({ input, read });
  };
  metaField('Name', () => ctx.store.family.name, (v) => (NAME_RE.test(v) ? { ...ctx.store.family, name: v } : 'Lowercase letters, digits, and hyphens; start with a letter.'), 'Theme names: name, name-dark, name-high-contrast, name-system.');
  metaField('Version', () => ctx.store.family.version, (v) => (SEMVER_RE.test(v) ? { ...ctx.store.family, version: v } : 'Use a semantic version such as 1.2.0.'), 'Semantic version of the exported package.');
  metaField('Description', () => ctx.store.family.description, (v) => (v.length <= 500 && !/[<>]/.test(v) ? { ...ctx.store.family, description: v } : 'Up to 500 characters, without < or >.'), '');
  metaField('Author', () => ctx.store.family.author, (v) => (v.length <= 200 && !/[<>]/.test(v) ? { ...ctx.store.family, author: v } : 'Up to 200 characters, without < or >.'), '');

  parent.append(el('h3', { className: 'td-subheading', text: 'Brand seeds' }));
  parent.append(
    el('p', {
      className: 'td-hint',
      text: 'Seeds are brand hues. Every color role is solved from them to meet WCAG 2.2 AA in light and dark, and 7:1 in high contrast. Changing a seed keeps the tokens you edited by hand.',
    }),
  );
  const seedRows: TokenRow[] = [];
  for (const name of seedNames) {
    const row = tokenRow({
      name,
      description: '',
      color: true,
      clearable: false,
      read: () => ctx.store.family.seeds[name],
      write: (value) => {
        if (value === null) return;
        ctx.store.set(withSeeds(ctx.store.family, { ...ctx.store.family.seeds, [name]: value }), `seed ${name}`);
      },
      check: (v) => (/^#[0-9a-f]{6}$/i.test(v) || /^rgb\(/i.test(v) ? null : 'Use an opaque hex color such as #1E40AF.'),
    });
    seedRows.push(row);
    parent.append(row.element);
  }
  const actions = el('div', { className: 'td-row' });
  parent.append(actions);
  button(actions, 'Derive every color from the seeds', { variant: 'secondary' }, () => {
    ctx.store.set(withSeeds(ctx.store.family, ctx.store.family.seeds, false), 'derive from seeds');
    announce('All modes re-derived from the seeds. Undo restores the previous tokens.');
  });
  const counts = el('p', { className: 'td-hint', attrs: { 'aria-live': 'polite' } });
  parent.append(counts);
  const refresh = (): void => {
    for (const { input, read } of fields) if (!input.host.contains(document.activeElement)) input.setValue(read());
    for (const r of seedRows) r.refresh();
    const f = ctx.store.family;
    counts.textContent = `Edited by hand: ${familyModes.map((m: ThemeMode) => `${modeLabels[m]} ${String(overriddenTokens(f, m).length)}`).join(', ')}.`;
  };
  refresh();
  ctx.store.subscribe(refresh);
}

const providerLabels: Readonly<Record<WebFont['provider'], string>> = { google: 'Google Fonts', bunny: 'Bunny Fonts', custom: 'Self-hosted or other' };

/** Quote a family for a CSS font stack. */
const quoted = (family: string): string => `"${family}"`;

/**
 * Web fonts (SPEC section 10.1 font stacks): the stylesheet URL from the provider's embed
 * code and the family it declares. Adding a font can put it first in a font stack.
 */
function fontsEditor(parent: HTMLElement, ctx: DesignerContext): void {
  parent.append(
    el('p', {
      className: 'td-hint',
      text: 'Paste the stylesheet URL from Google Fonts, Bunny Fonts, or your own host (the CSS link, not a font file). Exports load fonts from a separate fonts.css so applications opt in; hosted services receive the IP address of each visitor.',
    }),
  );
  const list = el('ul', { className: 'td-list', attrs: { 'aria-label': 'Web fonts' } });
  parent.append(list);
  const form = el('div', { className: 'td-inline-form' });
  parent.append(form);
  let url = '';
  let family = '';
  let target = 'font-family-sans';
  const urlInput = TextInput.create(host(form), { label: 'Stylesheet URL', type: 'url', placeholder: 'https://fonts.bunny.net/css?family=inter:400,600', spellcheck: false, autocomplete: 'off' });
  const familyInput = TextInput.create(host(form), { label: 'Font family', placeholder: 'Inter', spellcheck: false, autocomplete: 'off' });
  const stackSelect = Select.create(host(form), {
    label: 'Use in',
    options: [
      { value: 'font-family-sans', label: 'Sans stack (first)' },
      { value: 'font-family-mono', label: 'Mono stack (first)' },
      { value: 'none', label: 'Do not change stacks' },
    ],
    value: target,
  });
  urlInput.host.addEventListener('aui-input', (e) => {
    url = detail(e, hasValue)?.value.trim() ?? '';
  });
  familyInput.host.addEventListener('aui-input', (e) => {
    family = detail(e, hasValue)?.value.trim() ?? '';
  });
  stackSelect.host.addEventListener('aui-change', (e) => {
    target = detail(e, hasNullableValue)?.value ?? 'none';
  });
  button(form, 'Add font', { variant: 'primary' }, () => {
    const font: WebFont = { provider: webFontProviderOf(url), family, stylesheet: url };
    const problem = webFontProblem(font);
    if (problem) {
      (problem.startsWith('family') ? familyInput : urlInput).setCustomError(problem.replace(/^[a-z]+: /, ''));
      (problem.startsWith('family') ? familyInput : urlInput).reportValidity();
      return;
    }
    urlInput.setCustomError(null);
    familyInput.setCustomError(null);
    let f = ctx.store.family;
    f = { ...f, fonts: [...f.fonts.filter((x) => x.family !== family), font] };
    if (target !== 'none') {
      const modes = { ...f.modes };
      for (const m of familyModes) {
        const stack = modes[m].tokens[target] ?? '';
        const rest = stack
          .split(',')
          .map((x) => x.trim())
          .filter((x) => x !== '' && x !== quoted(family) && x !== family);
        modes[m] = { ...modes[m], tokens: { ...modes[m].tokens, [target]: [quoted(family), ...rest].join(', ') } };
      }
      f = { ...f, modes };
    }
    ctx.store.set(f, `font ${family}`);
    urlInput.setValue('');
    familyInput.setValue('');
    url = '';
    family = '';
    announce(`${font.family} added from ${providerLabels[font.provider]}.`);
  });
  const render = (): void => {
    list.replaceChildren();
    for (const font of ctx.store.family.fonts) {
      const note = isPreviewableFont(font.stylesheet) ? providerLabels[font.provider] : `${providerLabels[font.provider]}; not loaded in the preview (its CSP allows Google Fonts and Bunny Fonts only)`;
      const li = el('li', { className: 'td-list__item' }, el('span', { text: `${font.family} | ${note}` }));
      button(li, 'Remove', { variant: 'ghost', size: 'sm', label: `Remove ${font.family}` }, () => {
        const f = ctx.store.family;
        ctx.store.set({ ...f, fonts: f.fonts.filter((x) => x !== font) }, `remove font ${font.family}`);
        announce(`${font.family} removed. The font stacks still name it; edit them if needed.`);
      });
      list.append(li);
    }
    if (list.childElementCount === 0) list.append(el('li', { className: 'td-hint', text: 'No web fonts: the font stacks use installed fonts.' }));
  };
  render();
  ctx.store.subscribe(render);
}
