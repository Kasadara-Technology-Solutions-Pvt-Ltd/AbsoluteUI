/**
 * Color math for Color Picker (R20 P9): parsing of hex, rgb(), and hsl() text, conversions
 * between RGB, HSV, and HSL, hex formatting, and the WCAG 2.2 contrast ratio. Pure functions;
 * internal to the component folder.
 */

/** sRGB channels 0-255 (fractional while converting) and alpha 0-1. */
export interface Rgba {
  r: number;
  g: number;
  b: number;
  a: number;
}

/** Hue 0-360, saturation and value 0-100, alpha 0-1. */
export interface Hsva {
  h: number;
  s: number;
  v: number;
  a: number;
}

export type ColorFormat = 'hex' | 'rgb' | 'hsl';

const clamp = (n: number, min: number, max: number): number => Math.min(max, Math.max(min, n));
const round = (n: number, digits = 0): number => {
  const f = 10 ** digits;
  return Math.round(n * f) / f;
};

const HEX_RE = /^#?([0-9a-f]{3}|[0-9a-f]{4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

/** `#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa` (the `#` is optional). */
export function parseHex(text: string): Rgba | null {
  const m = HEX_RE.exec(text.trim());
  if (!m?.[1]) return null;
  let hex = m[1];
  if (hex.length <= 4) hex = hex.replace(/./g, (c) => c + c);
  const n = (i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
  return { r: n(0), g: n(2), b: n(4), a: hex.length === 8 ? round(n(6) / 255, 3) : 1 };
}

/** One number token: plain or percentage. */
function num(token: string | undefined, percentOf: number): number | null {
  if (token === undefined) return null;
  const t = token.trim();
  const m = /^(-?\d+(?:\.\d+)?|-?\.\d+)(%?)$/.exec(t);
  if (!m?.[1]) return null;
  const v = Number(m[1]);
  return m[2] === '%' ? (v / 100) * percentOf : v;
}

/** Splits `fn(a, b, c[, d])` or `fn(a b c[ / d])` into its tokens. */
function args(text: string, names: readonly string[]): string[] | null {
  const m = /^([a-z]+)\(\s*([^)]*)\)$/i.exec(text.trim());
  if (!m?.[1] || m[2] === undefined || !names.includes(m[1].toLowerCase())) return null;
  const body = m[2].trim();
  const parts = body.includes(',') ? body.split(',').map((s) => s.trim()) : body.replace(/\s*\/\s*/, ' / ').split(/\s+/).filter((s) => s !== '/');
  return parts.length === 3 || parts.length === 4 ? parts : null;
}

function alphaOf(token: string | undefined): number | null {
  if (token === undefined) return 1;
  const a = num(token, 1);
  return a === null || a < 0 || a > 1 ? null : a;
}

/** `rgb(30, 64, 175)`, `rgb(30 64 175 / 50%)`, `rgba(...)`. */
export function parseRgb(text: string): Rgba | null {
  const p = args(text, ['rgb', 'rgba']);
  if (!p) return null;
  const [r, g, b] = [num(p[0], 255), num(p[1], 255), num(p[2], 255)];
  const a = alphaOf(p[3]);
  if (r === null || g === null || b === null || a === null) return null;
  if ([r, g, b].some((c) => c < 0 || c > 255)) return null;
  return { r, g, b, a };
}

/** `hsl(224, 71%, 40%)`, `hsl(224 71% 40% / 0.5)`, `hsla(...)`. */
export function parseHsl(text: string): Rgba | null {
  const p = args(text, ['hsl', 'hsla']);
  if (!p) return null;
  const h = num(p[0]?.replace(/deg$/i, ''), 360);
  const s = p[1]?.endsWith('%') ? num(p[1], 100) : null;
  const l = p[2]?.endsWith('%') ? num(p[2], 100) : null;
  const a = alphaOf(p[3]);
  if (h === null || s === null || l === null || a === null) return null;
  if (s < 0 || s > 100 || l < 0 || l > 100) return null;
  return { ...hslToRgb(((h % 360) + 360) % 360, s, l), a };
}

/** Any supported text: hex (with or without `#`), rgb(), or hsl(). */
export function parseColor(text: string): Rgba | null {
  return parseHex(text) ?? parseRgb(text) ?? parseHsl(text);
}

export function rgbToHsv({ r, g, b, a }: Rgba): Hsva {
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const d = max - Math.min(rr, gg, bb);
  let h = 0;
  if (d !== 0) {
    if (max === rr) h = ((gg - bb) / d) % 6;
    else if (max === gg) h = (bb - rr) / d + 2;
    else h = (rr - gg) / d + 4;
    h = (h * 60 + 360) % 360;
  }
  return { h, s: max === 0 ? 0 : (d / max) * 100, v: max * 100, a };
}

export function hsvToRgb({ h, s, v, a }: Hsva): Rgba {
  const ss = s / 100;
  const vv = v / 100;
  const f = (n: number): number => {
    const k = (n + h / 60) % 6;
    return (vv - vv * ss * Math.max(0, Math.min(k, 4 - k, 1))) * 255;
  };
  return { r: f(5), g: f(3), b: f(1), a };
}

export function hslToRgb(h: number, s: number, l: number): { r: number; g: number; b: number } {
  const ss = s / 100;
  const ll = l / 100;
  const k = (n: number): number => (n + h / 30) % 12;
  const c = ss * Math.min(ll, 1 - ll);
  const f = (n: number): number => (ll - c * Math.max(-1, Math.min(k(n) - 3, 9 - k(n), 1))) * 255;
  return { r: f(0), g: f(8), b: f(4) };
}

export function rgbToHsl({ r, g, b }: Rgba): { h: number; s: number; l: number } {
  const { h } = rgbToHsv({ r, g, b, a: 1 });
  const [rr, gg, bb] = [r / 255, g / 255, b / 255];
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const l = (max + min) / 2;
  const d = max - min;
  const s = d === 0 ? 0 : d / (1 - Math.abs(2 * l - 1));
  return { h, s: s * 100, l: l * 100 };
}

const hex2 = (n: number): string => Math.round(clamp(n, 0, 255)).toString(16).padStart(2, '0');

/** Lowercase `#rrggbb`, or `#rrggbbaa` when `alpha` is true. */
export function toHex(c: Rgba, alpha: boolean): string {
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${alpha ? hex2(c.a * 255) : ''}`;
}

/** Text in the given format; alpha is included only when `alpha` is true. */
export function formatColor(c: Rgba, format: ColorFormat, alpha: boolean): string {
  if (format === 'hex') return toHex(c, alpha);
  const a = round(c.a, 2);
  if (format === 'rgb') {
    const [r, g, b] = [c.r, c.g, c.b].map((n) => Math.round(clamp(n, 0, 255)));
    return alpha ? `rgb(${String(r)} ${String(g)} ${String(b)} / ${String(a)})` : `rgb(${String(r)}, ${String(g)}, ${String(b)})`;
  }
  const { h, s, l } = rgbToHsl(c);
  const [hh, ss, ll] = [Math.round(h) % 360, Math.round(s), Math.round(l)];
  return alpha ? `hsl(${String(hh)} ${String(ss)}% ${String(ll)}% / ${String(a)})` : `hsl(${String(hh)}, ${String(ss)}%, ${String(ll)}%)`;
}

/** WCAG 2.2 relative luminance of an opaque sRGB color. */
export function luminance({ r, g, b }: { r: number; g: number; b: number }): number {
  const ch = (v: number): number => {
    const c = clamp(v, 0, 255) / 255;
    return c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * ch(r) + 0.7152 * ch(g) + 0.0722 * ch(b);
}

/** WCAG contrast ratio (1-21) of `fg` composited over the opaque `bg`. */
export function contrastRatio(fg: Rgba, bg: Rgba): number {
  const mix = (f: number, b: number): number => f * fg.a + b * (1 - fg.a);
  const top = { r: mix(fg.r, bg.r), g: mix(fg.g, bg.g), b: mix(fg.b, bg.b) };
  const [l1, l2] = [luminance(top), luminance(bg)];
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export { clamp, round };
