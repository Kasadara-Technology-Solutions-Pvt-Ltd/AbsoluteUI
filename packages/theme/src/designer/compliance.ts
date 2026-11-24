/**
 * Compliance scoring (SPEC section 10.4, section 10.5). Separate assessments per category, each
 * finding naming its rule, status, severity, measured and required values, affected
 * tokens and components, and remediation. Contrast reuses `evaluateThemeContrast`
 * (section 9.1.2). Assessments are token-level: they check theme values against the ways
 * AbsoluteUI components use them, not a rendered page.
 */
import { componentTokens, getComponentToken } from '../component-tokens.js';
import { contrastRatio, evaluateThemeContrast, parseColor, type ContrastResult, type Severity } from '../contrast.js';
import { absoluteDefault, type ContrastPair, type ThemeMode, type TokenMap } from '../tokens.js';
import { breakpointNames, densityNames, familyModes, resolveToken, type FamilyMode, type ThemeFamily } from './model.js';
import { tokenUsage } from './token-usage.js';

export type ComplianceCategory =
  | 'text-contrast'
  | 'large-text-contrast'
  | 'non-text-contrast'
  | 'focus-visibility'
  | 'state-differentiation'
  | 'target-size'
  | 'zoom-reflow'
  | 'reduced-motion'
  | 'high-contrast';

export type RuleStatus = 'pass' | 'fail' | 'warn' | 'not-measurable';

export interface ComplianceFinding {
  /** Stable id: `<category>:<mode|all>:<subject>`. */
  readonly id: string;
  readonly category: ComplianceCategory;
  /** WCAG success criterion or AbsoluteUI guideline the rule checks. */
  readonly rule: string;
  readonly status: RuleStatus;
  readonly severity: Severity;
  /** A failing required rule makes the theme non-compliant (section 10.5); others are advisories. */
  readonly required: boolean;
  readonly mode: ThemeMode | 'all';
  readonly message: string;
  readonly measured: string | null;
  readonly expected: string | null;
  readonly tokens: readonly string[];
  readonly components: readonly string[];
  readonly remediation: string | null;
}

export interface CategorySummary {
  readonly category: ComplianceCategory | 'contrast';
  readonly label: string;
  readonly passed: number;
  readonly failed: number;
  readonly warnings: number;
  readonly notMeasurable: number;
  readonly requiredFailures: number;
}

export interface ComplianceReport {
  readonly family: string;
  /** True only when no required rule fails. Never true by omission: unmeasurable required rules count as failures. */
  readonly compliant: boolean;
  readonly statement: string;
  readonly categories: readonly CategorySummary[];
  readonly findings: readonly ComplianceFinding[];
}

export const categoryLabels: Readonly<Record<ComplianceCategory | 'contrast', string>> = {
  contrast: 'WCAG 2.2 AA color contrast',
  'text-contrast': 'Text contrast',
  'large-text-contrast': 'Large-text contrast',
  'non-text-contrast': 'Non-text / UI component contrast',
  'focus-visibility': 'Focus indicator visibility',
  'state-differentiation': 'Disabled and interactive state differentiation',
  'target-size': 'Touch target size',
  'zoom-reflow': 'Zoom and reflow risks',
  'reduced-motion': 'Reduced-motion compatibility',
  'high-contrast': 'High-contrast compatibility',
};

/** Headings and titles rendered at large-text size (WCAG: 18.66px bold / 24px regular). */
const largeTextPairs: readonly ContrastPair[] = [
  { foreground: 'color-text', background: 'color-bg', kind: 'large-text', usage: 'Page and section headings' },
  { foreground: 'color-text', background: 'dialog-bg', kind: 'large-text', usage: 'Dialog title' },
  { foreground: 'color-text', background: 'drawer-bg', kind: 'large-text', usage: 'Drawer title' },
  { foreground: 'color-text', background: 'card-bg', kind: 'large-text', usage: 'Card title' },
  { foreground: 'color-text-muted', background: 'color-surface', kind: 'large-text', usage: 'Stat card and chart secondary headings' },
];

const WCAG_TEXT = 'WCAG 2.2 1.4.3';
const WCAG_NON_TEXT = 'WCAG 2.2 1.4.11';

function componentsUsing(tokens: readonly string[]): string[] {
  const owners = tokens.flatMap((t) => {
    const spec = getComponentToken(t);
    return spec ? [spec.component] : [];
  });
  if (owners.length > 0) return [...new Set(owners)].sort();
  const lists = tokens.map((t) => tokenUsage[t] ?? []);
  const [first = [], ...rest] = lists;
  return first.filter((c) => rest.every((l) => l.includes(c)));
}

function flatten(mode: FamilyMode): TokenMap {
  const out: Record<string, string> = { ...mode.tokens };
  for (const [component, group] of Object.entries(componentTokens)) {
    for (const property of Object.keys(group.tokens)) {
      const name = `${component}-${property}`;
      const v = resolveToken(mode, name);
      if (v !== undefined) out[name] = v;
    }
  }
  return out;
}

const componentPairs: readonly ContrastPair[] = Object.values(componentTokens).flatMap((g) => g.contrastPairs);

function contrastFindings(family: ThemeFamily, mode: ThemeMode): ComplianceFinding[] {
  const tokens = flatten(family.modes[mode]);
  const pairs = [...absoluteDefault.contrastPairs, ...componentPairs, ...largeTextPairs];
  const report = evaluateThemeContrast({ schemaVersion: 1, name: family.name, mode, seeds: family.seeds, tokens, contrastPairs: pairs });
  const findings: ComplianceFinding[] = [];
  const seen = new Set<string>();
  const add = (r: ContrastResult): void => {
    const p = r.pair;
    const category: ComplianceCategory = p.kind === 'text' ? 'text-contrast' : p.kind === 'large-text' ? 'large-text-contrast' : 'non-text-contrast';
    const subject = `${p.foreground}/${p.background}${p.backdrop ? `@${p.backdrop}` : ''}`;
    const id = `${category}:${mode}:${subject}`;
    if (seen.has(id)) return;
    seen.add(id);
    const names = [p.foreground, p.background, ...(p.backdrop ? [p.backdrop] : [])];
    findings.push({
      id,
      category,
      rule: r.rule,
      status: r.pass ? 'pass' : 'fail',
      severity: r.severity,
      required: true,
      mode,
      message: `${p.usage}: ${p.foreground} on ${p.background}`,
      measured: `${r.ratio.toFixed(2)}:1`,
      expected: `${String(r.required)}:1`,
      tokens: names,
      components: componentsUsing(names),
      remediation: r.remediation,
    });
    if (mode === 'high-contrast') {
      const hcRequired = p.kind === 'non-text' ? 4.5 : 7;
      findings.push({
        id: `high-contrast:${mode}:${subject}`,
        category: 'high-contrast',
        rule: p.kind === 'non-text' ? 'AbsoluteUI high contrast (non-text 4.5:1)' : 'WCAG 2.2 1.4.6 (AAA)',
        status: r.ratio >= hcRequired ? 'pass' : 'fail',
        severity: 'serious',
        required: false,
        mode,
        message: `High-contrast theme pairing: ${p.usage}`,
        measured: `${r.ratio.toFixed(2)}:1`,
        expected: `${String(hcRequired)}:1`,
        tokens: names,
        components: componentsUsing(names),
        remediation: r.ratio >= hcRequired ? null : `Increase the difference between ${p.foreground} and ${p.background} to at least ${String(hcRequired)}:1; high-contrast users expect more than the AA minimum.`,
      });
    }
  };
  for (const r of [...report.failed, ...report.passed]) add(r);
  for (const e of report.errors) {
    findings.push({
      id: `text-contrast:${mode}:error:${e}`,
      category: 'text-contrast',
      rule: WCAG_TEXT,
      status: 'not-measurable',
      severity: 'critical',
      required: true,
      mode,
      message: e,
      measured: null,
      expected: null,
      tokens: [],
      components: [],
      remediation: 'Use a hex, rgb(), or rgba() color value so contrast can be verified.',
    });
  }
  return findings;
}

/** Length in CSS px (rem and em at a 16px root); null when the unit is not measurable. */
export function toPx(value: string | undefined): number | null {
  if (value === undefined) return null;
  const m = /^(-?[\d.]+)(px|rem)?$/.exec(value.trim());
  if (!m?.[1]) return value.trim() === '0' ? 0 : null;
  const n = Number(m[1]);
  if (!Number.isFinite(n)) return null;
  return m[2] === 'rem' ? n * 16 : m[2] === 'px' || n === 0 ? n : null;
}

export function toMs(value: string | undefined): number | null {
  const m = /^([\d.]+)(ms|s)$/.exec(value?.trim() ?? '');
  if (!m?.[1]) return null;
  return m[2] === 's' ? Number(m[1]) * 1000 : Number(m[1]);
}

interface FindingInput {
  readonly subject: string;
  readonly category: ComplianceCategory;
  readonly rule: string;
  readonly status: RuleStatus;
  readonly severity: Severity;
  readonly required: boolean;
  readonly mode: ThemeMode | 'all';
  readonly message: string;
  readonly measured?: string | null;
  readonly expected?: string | null;
  readonly tokens: readonly string[];
  readonly components?: readonly string[];
  readonly remediation?: string | null;
}

function finding(f: FindingInput): ComplianceFinding {
  return {
    id: `${f.category}:${f.mode}:${f.subject}`,
    category: f.category,
    rule: f.rule,
    status: f.status,
    severity: f.severity,
    required: f.required,
    mode: f.mode,
    message: f.message,
    measured: f.measured ?? null,
    expected: f.expected ?? null,
    tokens: f.tokens,
    components: f.components ?? [...new Set(f.tokens.flatMap((t) => tokenUsage[t] ?? (getComponentToken(t) ? [getComponentToken(t)?.component ?? ''] : [])))].sort(),
    remediation: f.status === 'pass' ? null : (f.remediation ?? null),
  };
}

const ratio = (a: string | undefined, b: string | undefined): number | null => {
  const x = a === undefined ? null : parseColor(a);
  const y = b === undefined ? null : parseColor(b);
  return x && y ? Math.floor(contrastRatio(x, y) * 100) / 100 : null;
};

function focusFindings(family: ThemeFamily, mode: ThemeMode): ComplianceFinding[] {
  const t = family.modes[mode].tokens;
  const width = toPx(t['focus-ring-width']);
  const offset = toPx(t['focus-ring-offset']);
  const out: ComplianceFinding[] = [
    finding({
      subject: 'focus-ring-width',
      category: 'focus-visibility',
      rule: 'WCAG 2.2 2.4.7; 2.4.13 (AAA) recommends a 2px indicator',
      status: width === null ? 'not-measurable' : width < 1 ? 'fail' : width < 2 ? 'warn' : 'pass',
      severity: width !== null && width < 1 ? 'critical' : 'serious',
      required: width === null || width < 1,
      mode,
      message: 'Focus ring thickness',
      measured: t['focus-ring-width'] ?? null,
      expected: 'at least 2px',
      tokens: ['focus-ring-width'],
      components: ['all interactive components'],
      remediation: 'Set focus-ring-width to 2px or more (px or rem).',
    }),
    finding({
      subject: 'focus-ring-offset',
      category: 'focus-visibility',
      rule: 'AbsoluteUI focus ring outside the control',
      status: offset === null ? 'not-measurable' : offset < 0 ? 'warn' : 'pass',
      severity: 'moderate',
      required: false,
      mode,
      message: 'Focus ring offset',
      measured: t['focus-ring-offset'] ?? null,
      expected: '0 or more',
      tokens: ['focus-ring-offset'],
      components: ['button', 'card', 'data-table'],
      remediation: 'A negative offset draws the ring inside the control, where fills and borders can hide it.',
    }),
  ];
  // On selected options and rows components draw focus in color-selected-text (a separate contrast pair).
  const backdrops = ['color-bg', 'color-surface', 'color-surface-sunken', 'color-hover'];
  const ratios = backdrops.map((b) => ({ b, r: ratio(t['color-focus-ring'], t[b]) }));
  const worst = ratios.reduce<{ b: string; r: number | null }>((w, x) => (x.r === null || w.r === null ? { b: x.b, r: null } : x.r < w.r ? x : w), { b: '', r: Infinity });
  out.push(
    finding({
      subject: 'focus-ring-contrast',
      category: 'focus-visibility',
      rule: WCAG_NON_TEXT,
      status: worst.r === null ? 'not-measurable' : worst.r >= 3 ? 'pass' : 'fail',
      severity: 'serious',
      required: true,
      mode,
      message: `Focus ring against the surfaces it is drawn on (worst: ${worst.b})`,
      measured: worst.r === null ? null : `${worst.r.toFixed(2)}:1`,
      expected: '3:1',
      tokens: ['color-focus-ring', ...backdrops],
      components: ['all interactive components'],
      remediation: `Change color-focus-ring so it reaches 3:1 against ${worst.b}.`,
    }),
  );
  return out;
}

function stateFindings(family: ThemeFamily, mode: ThemeMode): ComplianceFinding[] {
  const t = family.modes[mode].tokens;
  const distinct = (subject: string, a: string, b: string, min: number, message: string, severity: Severity, remediation: string): ComplianceFinding => {
    const r = ratio(t[a], t[b]);
    return finding({
      subject,
      category: 'state-differentiation',
      rule: 'AbsoluteUI state guideline (WCAG 1.4.1: state is never shown by color alone)',
      status: r === null ? 'not-measurable' : r >= min ? 'pass' : 'warn',
      severity,
      required: false,
      mode,
      message,
      measured: r === null ? null : `${r.toFixed(2)}:1`,
      expected: `${String(min)}:1 or more`,
      tokens: [a, b],
      remediation,
    });
  };
  const enabled = ratio(t['color-text'], t['color-surface']);
  const disabled = ratio(t['color-text-disabled'], t['color-disabled-bg']);
  const out = [
    distinct('hover', 'color-hover', 'color-surface', 1.04, 'Hover background differs from the surface', 'minor', 'Make color-hover visibly lighter or darker than color-surface.'),
    distinct('active', 'color-active', 'color-hover', 1.03, 'Pressed background differs from hover', 'minor', 'Separate color-active from color-hover.'),
    distinct('selected', 'color-selected', 'color-surface', 1.1, 'Selected background differs from the surface', 'moderate', 'Increase the difference between color-selected and color-surface; components also add an indicator.'),
    distinct('primary-hover', 'color-primary-hover', 'color-primary', 1.1, 'Primary hover differs from primary', 'minor', 'Separate color-primary-hover from color-primary.'),
    finding({
      subject: 'disabled',
      category: 'state-differentiation',
      rule: 'WCAG 2.2 1.4.3 exempts disabled controls; AbsoluteUI requires them to look inactive',
      status: enabled === null || disabled === null ? 'not-measurable' : disabled < enabled * 0.8 ? 'pass' : 'warn',
      severity: 'moderate',
      required: false,
      mode,
      message: 'Disabled text is visibly weaker than enabled text',
      measured: disabled === null || enabled === null ? null : `disabled ${disabled.toFixed(2)}:1, enabled ${enabled.toFixed(2)}:1`,
      expected: 'disabled below 80% of the enabled ratio',
      tokens: ['color-text-disabled', 'color-disabled-bg', 'color-text', 'color-surface'],
      remediation: 'Lower the contrast of color-text-disabled or change color-disabled-bg so disabled controls cannot be mistaken for enabled ones.',
    }),
  ];
  return out;
}

function scrollbarFindings(family: ThemeFamily, mode: ThemeMode): ComplianceFinding[] {
  const t = family.modes[mode].tokens;
  const thumb = t['scrollbar-thumb'];
  const track = t['scrollbar-track'];
  const out: ComplianceFinding[] = [];
  if (thumb !== undefined || track !== undefined) {
    const r = ratio(thumb, track);
    const both = thumb !== undefined && track !== undefined;
    out.push(
      finding({
        subject: 'scrollbar-thumb/scrollbar-track',
        category: 'non-text-contrast',
        rule: WCAG_NON_TEXT,
        status: !both ? 'warn' : r === null ? 'not-measurable' : r >= 3 ? 'pass' : 'fail',
        severity: 'serious',
        required: both,
        mode,
        message: both ? 'Styled scrollbar thumb against its track' : 'Only one scrollbar color is set, so native scrollbars apply',
        measured: r === null ? null : `${r.toFixed(2)}:1`,
        expected: '3:1',
        tokens: ['scrollbar-thumb', 'scrollbar-track'],
        components: ['all scroll containers'],
        remediation: both ? 'Increase the contrast between scrollbar-thumb and scrollbar-track to 3:1.' : 'Set both scrollbar-thumb and scrollbar-track, or neither.',
      }),
    );
  }
  if (t['scrollbar-width'] === 'thin') {
    out.push(
      finding({
        subject: 'scrollbar-width',
        category: 'target-size',
        rule: 'AbsoluteUI guideline (pointer usability of scrollbars)',
        status: 'warn',
        severity: 'minor',
        required: false,
        mode,
        message: 'Thin scrollbars are harder to grab with a pointer',
        measured: 'thin',
        expected: 'auto',
        tokens: ['scrollbar-width'],
        components: ['all scroll containers'],
        remediation: 'Keep scrollbar-width at auto unless space is critical.',
      }),
    );
  }
  return out;
}

const TARGET_TOKENS = ['touch-target-min', 'control-height-sm', 'control-height-md', 'control-height-lg'] as const;
const TARGET_COMPONENT_TOKENS = ['button-height', 'text-input-height', 'select-height', 'combobox-height', 'menu-item-height'] as const;

function targetFindings(family: ThemeFamily): ComplianceFinding[] {
  const out: ComplianceFinding[] = [];
  const base = family.modes.light.tokens;
  const variants: { label: string; tokens: TokenMap }[] = [
    { label: 'comfortable', tokens: base },
    ...densityNames.map((d) => ({ label: d, tokens: { ...base, ...family.densities[d] } })),
    ...breakpointNames.flatMap((b) => {
      const r = family.responsive[b];
      return r ? [{ label: `min-width ${b}`, tokens: { ...base, ...r } }] : [];
    }),
  ];
  for (const v of variants) {
    for (const name of TARGET_TOKENS) {
      const px = toPx(v.tokens[name]);
      out.push(targetFinding(`${name}@${v.label}`, name, v.tokens[name], px, `${name} (${v.label} density)`));
    }
  }
  for (const mode of familyModes) {
    for (const name of TARGET_COMPONENT_TOKENS) {
      const own = family.modes[mode].componentTokens[name];
      if (own === undefined) continue;
      out.push(targetFinding(`${name}@${mode}`, name, own, toPx(own), `${name} override (${mode})`));
    }
  }
  return out;
}

function targetFinding(subject: string, token: string, raw: string | undefined, px: number | null, message: string): ComplianceFinding {
  return finding({
    subject,
    category: 'target-size',
    rule: 'WCAG 2.2 2.5.8 (24 x 24 CSS px); 2.5.5 (AAA) recommends 44px',
    status: px === null ? 'not-measurable' : px < 24 ? 'fail' : 'pass',
    severity: 'serious',
    required: true,
    mode: 'all',
    message: px !== null && px >= 24 && px < 44 ? `${message}: meets AA; below the 44px AAA target` : message,
    measured: raw ?? null,
    expected: 'at least 24px (1.5rem)',
    tokens: [token],
    remediation: px === null ? 'Use px or rem so the target size can be verified.' : `Raise ${token} to at least 1.5rem (24px).`,
  });
}

function zoomFindings(family: ThemeFamily): ComplianceFinding[] {
  const out: ComplianceFinding[] = [];
  const maps: { label: string; tokens: TokenMap }[] = [
    { label: 'base', tokens: family.modes.light.tokens },
    ...breakpointNames.flatMap((b) => (family.responsive[b] ? [{ label: b, tokens: family.responsive[b] ?? {} }] : [])),
  ];
  for (const { label, tokens } of maps) {
    for (const [name, value] of Object.entries(tokens)) {
      if (!name.startsWith('font-size-')) continue;
      const px = toPx(value);
      const isPx = value.trim().endsWith('px');
      out.push(
        finding({
          subject: `${name}@${label}`,
          category: 'zoom-reflow',
          rule: 'WCAG 2.2 1.4.4 (resize text)',
          status: px === null ? 'not-measurable' : isPx ? 'warn' : px < 12 ? 'warn' : 'pass',
          severity: isPx ? 'moderate' : 'minor',
          required: false,
          mode: 'all',
          message: isPx ? `${name} is in px and ignores the user's default font size` : `${name}${label === 'base' ? '' : ` at ${label}`}`,
          measured: value,
          expected: 'rem, at least 0.75rem',
          tokens: [name],
          remediation: isPx ? `Express ${name} in rem.` : `Raise ${name} to 0.75rem (12px) or more for legibility.`,
        }),
      );
    }
  }
  const t = family.modes.light.tokens;
  const lh = Number(t['line-height-normal']);
  out.push(
    finding({
      subject: 'line-height-normal',
      category: 'zoom-reflow',
      rule: 'WCAG 2.2 1.4.12 (text spacing) and 1.4.8 (AAA) body line height 1.5',
      status: !Number.isFinite(lh) ? 'not-measurable' : lh >= 1.5 ? 'pass' : 'warn',
      severity: 'moderate',
      required: false,
      mode: 'all',
      message: 'Body line height',
      measured: t['line-height-normal'] ?? null,
      expected: 'unitless, 1.5 or more',
      tokens: ['line-height-normal'],
      remediation: 'Use a unitless line-height-normal of at least 1.5.',
    }),
  );
  const tight = Number(t['line-height-tight']);
  out.push(
    finding({
      subject: 'line-height-tight',
      category: 'zoom-reflow',
      rule: 'WCAG 2.2 1.4.12 (text spacing)',
      status: !Number.isFinite(tight) ? 'not-measurable' : tight >= 1.15 ? 'pass' : 'warn',
      severity: 'minor',
      required: false,
      mode: 'all',
      message: 'Compact line height (labels, buttons, headings) leaves room for descenders and user spacing overrides',
      measured: t['line-height-tight'] ?? null,
      expected: 'unitless, 1.15 or more',
      tokens: ['line-height-tight'],
      remediation: 'Raise line-height-tight to 1.15 or more.',
    }),
  );
  for (const name of Object.keys(t).filter((k) => /^(control-height-|touch-target-min)/.test(k))) {
    const px = t[name]?.trim().endsWith('px') ?? false;
    out.push(
      finding({
        subject: `${name}-unit`,
        category: 'zoom-reflow',
        rule: 'WCAG 2.2 1.4.4 (resize text)',
        status: px ? 'warn' : 'pass',
        severity: 'minor',
        required: false,
        mode: 'all',
        message: `${name} scales with text size`,
        measured: t[name] ?? null,
        expected: 'rem',
        tokens: [name],
        remediation: `Express ${name} in rem so controls grow with enlarged text.`,
      }),
    );
  }
  return out;
}

function motionFindings(family: ThemeFamily): ComplianceFinding[] {
  const t = family.modes.light.tokens;
  const out: ComplianceFinding[] = [
    finding({
      subject: 'reduced-motion-structural',
      category: 'reduced-motion',
      rule: 'WCAG 2.2 2.3.3 (AAA); SPEC section 16.2',
      status: 'pass',
      severity: 'minor',
      required: false,
      mode: 'all',
      message: 'Components remove transitions and animations under prefers-reduced-motion and animation: "none"; theme values cannot re-enable them',
      tokens: [],
      components: ['all animated components'],
    }),
  ];
  for (const name of Object.keys(t).filter((k) => k.startsWith('duration-'))) {
    const ms = toMs(t[name]);
    out.push(
      finding({
        subject: name,
        category: 'reduced-motion',
        rule: 'AbsoluteUI motion guideline (short, purposeful transitions)',
        status: ms === null ? 'not-measurable' : ms > 500 ? 'warn' : 'pass',
        severity: 'moderate',
        required: false,
        mode: 'all',
        message: `${name} for users without a reduced-motion preference`,
        measured: t[name] ?? null,
        expected: '500ms or less',
        tokens: [name],
        remediation: ms === null ? 'Use ms or s units.' : `Shorten ${name}; long transitions slow interaction and can cause discomfort.`,
      }),
    );
  }
  for (const name of Object.keys(t).filter((k) => k.startsWith('easing-'))) {
    const m = /^cubic-bezier\(\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*,\s*([-\d.]+)\s*\)$/.exec(t[name] ?? '');
    const ys = m ? [Number(m[2]), Number(m[4])] : null;
    const overshoot = ys ? ys.some((y) => y < 0 || y > 1) : false;
    out.push(
      finding({
        subject: name,
        category: 'reduced-motion',
        rule: 'AbsoluteUI motion guideline (no bounce or overshoot)',
        status: t[name] === undefined ? 'not-measurable' : overshoot ? 'warn' : 'pass',
        severity: 'minor',
        required: false,
        mode: 'all',
        message: `${name} stays within its start and end values`,
        measured: t[name] ?? null,
        expected: 'cubic-bezier y values within 0 to 1, or a keyword',
        tokens: [name],
        remediation: `Keep ${name} y control points between 0 and 1; overshoot reads as bounce, a vestibular trigger.`,
      }),
    );
  }
  return out;
}

function highContrastFindings(family: ThemeFamily): ComplianceFinding[] {
  const t = family.modes['high-contrast'].tokens;
  const bw = toPx(t['border-width']);
  return [
    finding({
      subject: 'border-width',
      category: 'high-contrast',
      rule: 'AbsoluteUI high contrast (2px boundaries)',
      status: bw === null ? 'not-measurable' : bw >= 2 ? 'pass' : 'warn',
      severity: 'moderate',
      required: false,
      mode: 'high-contrast',
      message: 'Control boundaries are thick enough to read at a glance',
      measured: t['border-width'] ?? null,
      expected: '2px or more',
      tokens: ['border-width'],
      components: ['all bordered components'],
      remediation: 'Set border-width to 2px in the high-contrast mode.',
    }),
    ...['shadow-sm', 'shadow-md', 'shadow-lg'].map((name) =>
      finding({
        subject: name,
        category: 'high-contrast',
        rule: 'AbsoluteUI high contrast (elevation by boundary, not shadow)',
        status: t[name] === 'none' ? 'pass' : 'warn',
        severity: 'minor',
        required: false,
        mode: 'high-contrast',
        message: `${name} is none, so layers are separated by borders that survive forced colors`,
        measured: t[name] ?? null,
        expected: 'none',
        tokens: [name],
        remediation: `Set ${name} to none in the high-contrast mode.`,
      }),
    ),
    finding({
      subject: 'forced-colors',
      category: 'high-contrast',
      rule: 'CSS forced-colors (Windows contrast themes); SPEC section 13',
      status: 'pass',
      severity: 'minor',
      required: false,
      mode: 'all',
      message: 'Components map borders, focus, and selection to system colors under forced-colors: active, independent of theme values',
      tokens: [],
      components: ['all components'],
    }),
  ];
}

function summarize(findings: readonly ComplianceFinding[], category: ComplianceCategory | 'contrast'): CategorySummary {
  const inCat = findings.filter((f) => (category === 'contrast' ? f.category.endsWith('-contrast') && f.category !== 'high-contrast' : f.category === category));
  return {
    category,
    label: categoryLabels[category],
    passed: inCat.filter((f) => f.status === 'pass').length,
    failed: inCat.filter((f) => f.status === 'fail').length,
    warnings: inCat.filter((f) => f.status === 'warn').length,
    notMeasurable: inCat.filter((f) => f.status === 'not-measurable').length,
    requiredFailures: inCat.filter((f) => f.required && f.status !== 'pass' && f.status !== 'warn').length,
  };
}

const summaryOrder: readonly (ComplianceCategory | 'contrast')[] = [
  'contrast',
  'text-contrast',
  'large-text-contrast',
  'non-text-contrast',
  'focus-visibility',
  'state-differentiation',
  'target-size',
  'zoom-reflow',
  'reduced-motion',
  'high-contrast',
];

const severityOrder: Readonly<Record<Severity, number>> = { critical: 0, serious: 1, moderate: 2, minor: 3 };
const statusOrder: Readonly<Record<RuleStatus, number>> = { fail: 0, 'not-measurable': 1, warn: 2, pass: 3 };

/** Assess a theme family against every section 10.4 category. Findings are sorted most urgent first. */
export function assessCompliance(family: ThemeFamily): ComplianceReport {
  const findings = [
    ...familyModes.flatMap((m) => [...contrastFindings(family, m), ...focusFindings(family, m), ...stateFindings(family, m), ...scrollbarFindings(family, m)]),
    ...targetFindings(family),
    ...zoomFindings(family),
    ...motionFindings(family),
    ...highContrastFindings(family),
  ].sort((a, b) => statusOrder[a.status] - statusOrder[b.status] || severityOrder[a.severity] - severityOrder[b.severity] || a.id.localeCompare(b.id));
  const categories = summaryOrder.map((c) => summarize(findings, c));
  const requiredFailures = findings.filter((f) => f.required && (f.status === 'fail' || f.status === 'not-measurable')).length;
  const advisories = findings.filter((f) => !f.required && (f.status === 'fail' || f.status === 'warn')).length;
  const compliant = requiredFailures === 0;
  return {
    family: family.name,
    compliant,
    statement: compliant
      ? `Meets the AbsoluteUI token-level WCAG 2.2 AA baseline in every mode${advisories > 0 ? ` (${String(advisories)} advisories)` : ''}. Verify rendered pages as well.`
      : `Not compliant: ${String(requiredFailures)} required rule${requiredFailures === 1 ? '' : 's'} fail${requiredFailures === 1 ? 's' : ''}. This theme must not be presented as accessible.`,
    categories,
    findings,
  };
}
