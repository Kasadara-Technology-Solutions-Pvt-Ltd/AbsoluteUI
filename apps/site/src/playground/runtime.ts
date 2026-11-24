// Playground runtime (R20-7, R20-8): one control per public option, generated from the
// component's API metadata, applied live (update when the option is dynamic, a fresh
// mount otherwise), the resulting code, and an event log. Every control is an AbsoluteUI
// component; theme, density, direction, and locale come from the docs bar (runtime.ts).
import { Alert } from '@absoluteui/components/alert';
import { Button } from '@absoluteui/components/button';
import { NumberInput } from '@absoluteui/components/number-input';
import { Select } from '@absoluteui/components/select';
import { Switch } from '@absoluteui/components/switch';
import { TextInput } from '@absoluteui/components/text-input';
import { Textarea } from '@absoluteui/components/textarea';
import { createShowcase } from '../showcases/kit.js';
import type { Mounted, PlaygroundSeed } from './seed.js';

export type OptionKind = 'boolean' | 'number' | 'string' | 'enum' | 'json' | 'code';

/** One option, from api.json (written by the docs generator). */
export interface OptionSpec {
  readonly name: string;
  readonly type: string;
  readonly kind: OptionKind;
  readonly values?: readonly string[];
  readonly default?: unknown;
  readonly description: string;
  readonly initOnly: boolean;
}

export interface PlaygroundSpec {
  readonly displayName: string;
  readonly import: string;
  readonly options: readonly OptionSpec[];
  readonly events: readonly string[];
}

/** JSON-compatible: primitives, arrays, and plain objects only. */
export function isPlain(value: unknown): boolean {
  if (value === null || ['string', 'number', 'boolean'].includes(typeof value)) return true;
  if (Array.isArray(value)) return value.every(isPlain);
  if (typeof value !== 'object') return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return (proto === Object.prototype || proto === null) && Object.values(value).every(isPlain);
}

const IDENT = /^[A-Za-z_$][\w$]*$/;

/** A value as TypeScript source (JSON with bare keys where possible). */
export function literal(value: unknown, indent = ''): string {
  if (Array.isArray(value)) {
    if (value.length === 0) return '[]';
    const inner = value.map((v) => literal(v, `${indent}  `));
    const flat = `[${inner.join(', ')}]`;
    return flat.length <= 72 && !flat.includes('\n') ? flat : `[\n${inner.map((v) => `${indent}  ${v}`).join(',\n')},\n${indent}]`;
  }
  if (typeof value === 'object' && value !== null) {
    const entries = Object.entries(value).filter(([, v]) => v !== undefined);
    if (entries.length === 0) return '{}';
    const inner = entries.map(([k, v]) => `${IDENT.test(k) ? k : JSON.stringify(k)}: ${literal(v, `${indent}  `)}`);
    const flat = `{ ${inner.join(', ')} }`;
    return flat.length <= 72 && !flat.includes('\n') ? flat : `{\n${inner.map((v) => `${indent}  ${v}`).join(',\n')},\n${indent}}`;
  }
  return typeof value === 'string' ? `'${value.replace(/\\/g, '\\\\').replace(/'/g, "\\'").replace(/\n/g, '\\n')}'` : String(value);
}

const same = (a: unknown, b: unknown): boolean => JSON.stringify(a) === JSON.stringify(b);

export function runPlayground(seed: PlaygroundSeed, spec: PlaygroundSpec): void {
  const sc = createShowcase({
    title: `${spec.displayName} playground`,
    description: 'Every option of the component has a control. Changes apply live; the code below shows the resulting call, and the event log shows what the component dispatches.',
  });
  sc.controls.remove();

  const body = document.createElement('div');
  body.className = 'pg';
  sc.stage.before(body);
  const stageWrap = document.createElement('div');
  stageWrap.className = 'pg__stage-wrap';
  if (seed.note !== undefined) {
    const note = document.createElement('p');
    note.className = 'pg__note';
    note.textContent = seed.note;
    stageWrap.append(note);
  }
  stageWrap.append(sc.stage);
  const panel = document.createElement('section');
  panel.className = 'pg__panel';
  panel.setAttribute('aria-labelledby', 'pg-options');
  const panelTitle = document.createElement('h2');
  panelTitle.id = 'pg-options';
  panelTitle.textContent = 'Options';
  const list = document.createElement('div');
  list.className = 'pg__options';
  // The list scrolls on its own; keyboard users reach it like any scroll region.
  list.tabIndex = 0;
  list.setAttribute('role', 'group');
  list.setAttribute('aria-labelledby', 'pg-options');
  panel.append(panelTitle, list);
  body.append(stageWrap, panel);

  const codeSection = document.createElement('section');
  codeSection.className = 'pg__code';
  codeSection.setAttribute('aria-labelledby', 'pg-code');
  const codeHead = document.createElement('div');
  codeHead.className = 'sc__log-head';
  const codeTitle = document.createElement('h2');
  codeTitle.id = 'pg-code';
  codeTitle.textContent = 'Code';
  const pre = document.createElement('pre');
  pre.className = 'sc-json';
  pre.tabIndex = 0;
  pre.setAttribute('aria-labelledby', 'pg-code');
  const copy = Button.create({ text: 'Copy', variant: 'ghost', size: 'sm' }, document);
  copy.element.addEventListener('click', () => {
    void navigator.clipboard.writeText(pre.textContent).then(
      () => { sc.log('code copied'); },
      () => { sc.log('copy not allowed by the browser'); },
    );
  });
  codeHead.append(codeTitle, copy.element);
  codeSection.append(codeHead, pre);
  body.after(codeSection);

  const current: Record<string, unknown> = { ...seed.options };
  const hidden = new Set(seed.hide);
  const specs = spec.options.filter((o) => !hidden.has(o.name));
  let mounted: Mounted | null = null;
  let errorBox: HTMLElement | null = null;

  const showError = (message: string | null): void => {
    errorBox?.remove();
    errorBox = null;
    if (message === null) return;
    errorBox = document.createElement('div');
    stageWrap.prepend(errorBox);
    Alert.create(errorBox, { tone: 'error', title: 'The component rejected these options', message });
  };

  const mount = (): void => {
    try {
      mounted?.destroy();
    } catch {
      // A failed earlier mount may leave nothing to destroy.
    }
    mounted = null;
    sc.stage.replaceChildren();
    try {
      mounted = seed.mount(sc.stage, { ...current });
      for (const type of spec.events) {
        mounted.events.addEventListener(type, (e) => {
          sc.log(type, e instanceof CustomEvent ? e.detail : undefined);
        });
      }
      showError(null);
    } catch (e) {
      showError(e instanceof Error ? e.message : String(e));
    }
  };

  const renderCode = (): void => {
    const shown: Record<string, unknown> = {};
    const code: string[] = [];
    for (const [name, value] of Object.entries(current)) {
      if (value === undefined) continue;
      const o = spec.options.find((s) => s.name === name);
      if (o && 'default' in o && same(value, o.default)) continue;
      // The seed's source text describes the seed's value only; an edited value is shown as edited.
      const source = value === seed.options[name] ? seed.codeValues[name] : undefined;
      if (source !== undefined) code.push(name);
      else if (isPlain(value)) shown[name] = value;
      else code.push(name);
    }
    let text = literal(shown);
    if (code.length) {
      const extra = code.map((n) => `  ${n}: ${seed.codeValues[n] ?? '/* set in code */ undefined'},`).join('\n');
      text = text === '{}' ? `{\n${extra}\n}` : text.endsWith('}') && text.includes('\n') ? `${text.slice(0, -1)}${extra}\n}` : `{\n  ...${text},\n${extra}\n}`;
    }
    pre.textContent = `${spec.import}\n\n${seed.call.replace('$', text)};`;
  };

  const apply = (name: string, value: unknown): void => {
    const o = spec.options.find((s) => s.name === name);
    const patch: Record<string, unknown> = { [name]: value, ...seed.adjust?.(name, value, current) };
    let remount = false;
    for (const [key, v] of Object.entries(patch)) {
      if (v === undefined) {
        Reflect.deleteProperty(current, key);
        remount = true;
      } else {
        current[key] = v;
      }
      if (spec.options.find((s) => s.name === key)?.initOnly === true) remount = true;
    }
    const target = mounted;
    if (remount || o?.initOnly === true || target?.update === undefined) {
      mount();
    } else {
      try {
        target.update(patch);
        showError(null);
      } catch (e) {
        showError(e instanceof Error ? e.message : String(e));
      }
    }
    sc.log(`option ${name}`, value);
    renderCode();
  };

  const start = (o: OptionSpec): unknown => (o.name in current ? current[o.name] : o.default);
  const codeOnly: OptionSpec[] = [];
  for (const o of specs) {
    const value = start(o);
    const kind = o.kind === 'json' && value !== undefined && !isPlain(value) ? 'code' : o.kind;
    if (kind === 'code') {
      codeOnly.push(o);
      continue;
    }
    const cell = document.createElement('div');
    cell.className = 'pg__option';
    list.append(cell);
    const description = [o.description, o.initOnly ? 'Set at creation: changing it mounts the component again.' : ''].filter(Boolean).join(' ');
    const label = o.name;
    if (kind === 'boolean') {
      Switch.create(cell, { label, description, checked: value === true });
      cell.addEventListener('aui-change', (e) => { apply(o.name, (e as CustomEvent<{ checked: boolean }>).detail.checked); });
    } else if (kind === 'number') {
      NumberInput.create(cell, { label, description, value: typeof value === 'number' ? value : null });
      cell.addEventListener('aui-change', (e) => {
        const v = (e as CustomEvent<{ value: number | null }>).detail.value;
        apply(o.name, v ?? undefined);
      });
    } else if (kind === 'enum') {
      const values = o.values ?? [];
      Select.create(cell, { label, description, options: values.map((v) => ({ value: v, label: v })), value: typeof value === 'string' && values.includes(value) ? value : null, placeholder: 'Not set' });
      cell.addEventListener('aui-change', (e) => {
        const v = (e as CustomEvent<{ value: string | null }>).detail.value;
        apply(o.name, v ?? undefined);
      });
    } else if (kind === 'string') {
      TextInput.create(cell, { label, description, value: typeof value === 'string' ? value : '' });
      cell.addEventListener('aui-change', (e) => {
        const v = (e as CustomEvent<{ value: string }>).detail.value;
        apply(o.name, v === '' ? undefined : v);
      });
    } else {
      const field = Textarea.create(cell, { label, description: `${description} JSON (${o.type}).`.trim(), value: value === undefined ? '' : JSON.stringify(value, null, 2), rows: 4 });
      cell.classList.add('pg__option--wide');
      cell.addEventListener('aui-change', (e) => {
        const text = (e as CustomEvent<{ value: string }>).detail.value.trim();
        if (text === '') {
          field.setCustomError(null);
          apply(o.name, undefined);
          return;
        }
        let parsed: unknown;
        try {
          parsed = JSON.parse(text);
        } catch (err) {
          field.setCustomError(`Not valid JSON: ${err instanceof Error ? err.message : String(err)}`);
          return;
        }
        field.setCustomError(null);
        apply(o.name, parsed);
      });
    }
  }
  if (codeOnly.length) {
    const cell = document.createElement('div');
    cell.className = 'pg__option pg__option--wide pg__code-only';
    const h = document.createElement('h3');
    h.textContent = 'Set in code';
    const p = document.createElement('p');
    p.textContent = 'These options take functions, DOM nodes, or dates; see the API reference.';
    const ul = document.createElement('ul');
    for (const o of codeOnly) {
      const li = document.createElement('li');
      const c = document.createElement('code');
      c.textContent = o.name;
      li.append(c, `: ${o.type}`);
      ul.append(li);
    }
    cell.append(h, p, ul);
    list.append(cell);
  }

  mount();
  renderCode();
}
