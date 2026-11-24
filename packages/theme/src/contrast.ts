/**
 * WCAG 2.2 contrast engine (SPEC section 9.1.2, section 10.4). Shared by the CI contrast
 * gate and the future Theme Designer compliance scoring.
 */
import type { ContrastKind, ContrastPair, ThemeDefinition } from './tokens.js';

export interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** WCAG 2.2 AA minimums: 1.4.3 (text), 1.4.3 large text, 1.4.11 (non-text). */
export const WCAG_AA_MINIMUM: Readonly<Record<ContrastKind, number>> = { text: 4.5, 'large-text': 3, 'non-text': 3 };

export function parseColor(value: string): RGBA | null {
  const v = value.trim();
  const hex = /^#([0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i.exec(v)?.[1];
  if (hex) {
    const full = hex.length <= 4 ? hex.replace(/./g, (c) => c + c) : hex;
    const n = (i: number): number => parseInt(full.slice(i, i + 2), 16);
    return { r: n(0), g: n(2), b: n(4), a: full.length === 8 ? n(6) / 255 : 1 };
  }
  const fn = /^rgba?\(\s*([\d.]+)[\s,]+([\d.]+)[\s,]+([\d.]+)(?:\s*[,/]\s*([\d.]+%?))?\s*\)$/i.exec(v);
  if (fn) {
    const alphaText = fn[4];
    const alpha = alphaText === undefined ? 1 : alphaText.endsWith('%') ? Number(alphaText.slice(0, -1)) / 100 : Number(alphaText);
    const channels = [fn[1], fn[2], fn[3]].map(Number);
    if (channels.some((c) => !Number.isFinite(c) || c < 0 || c > 255) || !(alpha >= 0 && alpha <= 1)) return null;
    const [r = 0, g = 0, b = 0] = channels;
    return { r, g, b, a: alpha };
  }
  return null;
}

/** Source-over alpha compositing of `top` onto an opaque `bottom`. */
export function composite(top: RGBA, bottom: RGBA): RGBA {
  const a = top.a;
  return { r: top.r * a + bottom.r * (1 - a), g: top.g * a + bottom.g * (1 - a), b: top.b * a + bottom.b * (1 - a), a: 1 };
}

export function relativeLuminance(c: RGBA): number {
  const lin = (v: number): number => {
    const s = v / 255;
    return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * lin(c.r) + 0.7152 * lin(c.g) + 0.0722 * lin(c.b);
}

export function contrastRatio(a: RGBA, b: RGBA): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [number, number];
  return (hi + 0.05) / (lo + 0.05);
}

const toHex = (c: RGBA): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** Nearest foreground (mixed toward black or white) that meets `required` against `bg`. */
export function suggestForeground(fg: RGBA, bg: RGBA, required: number): string | null {
  const towardBlack = relativeLuminance(bg) > 0.18;
  const target = towardBlack ? { r: 0, g: 0, b: 0, a: 1 } : { r: 255, g: 255, b: 255, a: 1 };
  for (let t = 0; t <= 1.0001; t += 0.01) {
    const mixed = { r: fg.r + (target.r - fg.r) * t, g: fg.g + (target.g - fg.g) * t, b: fg.b + (target.b - fg.b) * t, a: 1 };
    if (contrastRatio(mixed, bg) >= required) return toHex(mixed);
  }
  return null;
}

/** axe-core impact levels; contrast results use critical and serious, designer advisories add the others. */
export type Severity = 'critical' | 'serious' | 'moderate' | 'minor';

export interface ContrastResult {
  readonly rule: 'WCAG 2.2 1.4.3' | 'WCAG 2.2 1.4.11';
  readonly pair: ContrastPair;
  readonly ratio: number;
  readonly required: number;
  readonly pass: boolean;
  readonly severity: Severity;
  readonly remediation: string | null;
}

export interface ContrastReport {
  readonly theme: string;
  readonly passed: readonly ContrastResult[];
  readonly failed: readonly ContrastResult[];
  /** Pairs that could not be evaluated (unknown token or unparseable color). */
  readonly errors: readonly string[];
}

/** Evaluate every declared contrast pair of a theme. */
export function evaluateThemeContrast(theme: ThemeDefinition): ContrastReport {
  const passed: ContrastResult[] = [];
  const failed: ContrastResult[] = [];
  const errors: string[] = [];
  const color = (token: string): RGBA | null => {
    const raw = theme.tokens[token];
    return raw === undefined ? null : parseColor(raw);
  };

  for (const pair of theme.contrastPairs) {
    const fg = color(pair.foreground);
    let bg = color(pair.background);
    const backdrop = pair.backdrop === undefined ? null : color(pair.backdrop);
    if (!fg || !bg || (pair.backdrop !== undefined && !backdrop)) {
      errors.push(`${theme.name}: cannot evaluate ${pair.foreground} on ${pair.background}`);
      continue;
    }
    if (bg.a < 1) bg = composite(bg, backdrop ?? { r: 255, g: 255, b: 255, a: 1 });
    const effectiveFg = fg.a < 1 ? composite(fg, bg) : fg;
    const ratio = Math.floor(contrastRatio(effectiveFg, bg) * 100) / 100;
    const required = WCAG_AA_MINIMUM[pair.kind];
    const pass = ratio >= required;
    const result: ContrastResult = {
      rule: pair.kind === 'non-text' ? 'WCAG 2.2 1.4.11' : 'WCAG 2.2 1.4.3',
      pair,
      ratio,
      required,
      pass,
      severity: pair.kind === 'text' ? 'critical' : 'serious',
      remediation: pass ? null : (() => {
        const s = suggestForeground(effectiveFg, bg, required);
        return s ? `Change ${pair.foreground} to ${s} or darker/lighter to reach ${required}:1.` : `Adjust ${pair.background}; no foreground reaches ${required}:1.`;
      })(),
    };
    (pass ? passed : failed).push(result);
  }
  return { theme: theme.name, passed, failed, errors };
}
