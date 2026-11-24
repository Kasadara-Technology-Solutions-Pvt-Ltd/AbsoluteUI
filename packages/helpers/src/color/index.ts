/**
 * Colour parsing, conversion (sRGB, HSL, OKLCH), WCAG 2.x contrast and readable-text selection
 * (docs/PLAN-HELPERS.md section 2, section 6: WCAG 1.4.3, 1.4.6, 1.4.11).
 */
import { ValidationError } from '../error/index.js';
import { namedColor, namedColorNames } from './named.js';

/** sRGB colour: channels 0-255 (may be fractional), alpha 0-1. */
export interface Rgb {
  readonly r: number;
  readonly g: number;
  readonly b: number;
  readonly alpha: number;
}
/** Hue 0-360 (0 for greys), saturation and lightness 0-100, alpha 0-1. */
export interface Hsl {
  readonly h: number;
  readonly s: number;
  readonly l: number;
  readonly alpha: number;
}
/** OKLCH: lightness 0-1, chroma >= 0 (~0-0.4 for sRGB), hue 0-360, alpha 0-1. */
export interface Oklch {
  readonly l: number;
  readonly c: number;
  readonly h: number;
  readonly alpha: number;
}

/** A CSS colour string or an RGB object (alpha defaults to 1). */
export type ColorInput = string | { readonly r: number; readonly g: number; readonly b: number; readonly alpha?: number };

const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);
const mod360 = (h: number): number => ((h % 360) + 360) % 360;

// ---------------------------------------------------------------------------
// Parsing

// Number with optional unit. Alternatives are disjoint, so matching is linear; input length is capped.
const TOKEN_RE = /^([+-]?(?:\d+(?:\.\d*)?|\.\d+)(?:e[+-]?\d+)?)(%|deg|rad|grad|turn)?$/;
const FN_RE = /^([a-z]+)\(([^()]*)\)$/;
const MAX_COLOR_LENGTH = 256;

interface Token {
  readonly v: number;
  readonly unit: string;
}

function token(s: string): Token | 'none' | undefined {
  if (s === 'none') return 'none';
  const m = TOKEN_RE.exec(s);
  if (!m) return undefined;
  const v = Number(m[1]);
  return Number.isFinite(v) ? { v, unit: m[2] ?? '' } : undefined;
}

function hueOf(t: Token | 'none'): number | undefined {
  if (t === 'none') return 0;
  switch (t.unit) {
    case '':
    case 'deg':
      return mod360(t.v);
    case 'rad':
      return mod360((t.v * 180) / Math.PI);
    case 'grad':
      return mod360(t.v * 0.9);
    case 'turn':
      return mod360(t.v * 360);
    default:
      return undefined;
  }
}

function alphaOf(t: Token | 'none' | undefined): number | undefined {
  if (t === undefined) return 1;
  if (t === 'none') return 0;
  if (t.unit === '%') return clamp(t.v / 100, 0, 1);
  return t.unit === '' ? clamp(t.v, 0, 1) : undefined;
}

function hexToRgb(hex: string): Rgb | undefined {
  if (!/^[\da-f]+$/.test(hex)) return undefined;
  const n = hex.length;
  if (n === 3 || n === 4) {
    const d = (i: number): number => Number.parseInt(hex.charAt(i) + hex.charAt(i), 16);
    return { r: d(0), g: d(1), b: d(2), alpha: n === 4 ? d(3) / 255 : 1 };
  }
  if (n === 6 || n === 8) {
    const d = (i: number): number => Number.parseInt(hex.slice(i, i + 2), 16);
    return { r: d(0), g: d(2), b: d(4), alpha: n === 8 ? d(6) / 255 : 1 };
  }
  return undefined;
}

function splitArgs(body: string): [string[], string | undefined] | undefined {
  if (body.includes(',')) {
    const parts = body.split(',').map((p) => p.trim());
    if (parts.length !== 3 && parts.length !== 4) return undefined;
    return [parts.slice(0, 3), parts[3]];
  }
  const slash = body.split('/');
  if (slash.length > 2) return undefined;
  const main = (slash[0] ?? '').trim().split(/\s+/);
  if (main.length !== 3) return undefined;
  const alpha = slash[1]?.trim();
  if (alpha === '') return undefined;
  return [main, alpha];
}

/**
 * Parses a CSS colour: hex (`#rgb`, `#rgba`, `#rrggbb`, `#rrggbbaa`), `rgb()`/`rgba()` (legacy
 * commas and modern space syntax), `hsl()`/`hsla()`, `oklch()`, the 148 named colours, and
 * `transparent`. Returns `undefined` when invalid (including `currentcolor`).
 * @example
 * parseColor('rgb(255 0 0 / 50%)'); // => { r: 255, g: 0, b: 0, alpha: 0.5 }
 * parseColor('rebeccapurple'); // => { r: 102, g: 51, b: 153, alpha: 1 }
 */
export function parseColor(input: string): Rgb | undefined {
  if (input.length > MAX_COLOR_LENGTH) return undefined;
  const s = input.trim().toLowerCase();
  if (s.startsWith('#')) return hexToRgb(s.slice(1));
  if (s === 'transparent') return { r: 0, g: 0, b: 0, alpha: 0 };
  const named = namedColor(s);
  if (named !== undefined) return { r: named >>> 16, g: (named >>> 8) & 255, b: named & 255, alpha: 1 };
  const m = FN_RE.exec(s);
  if (!m) return undefined;
  const fn = m[1] ?? '';
  const args = splitArgs(m[2] ?? '');
  if (!args) return undefined;
  const toks = args[0].map(token);
  const [t0, t1, t2] = toks;
  if (t0 === undefined || t1 === undefined || t2 === undefined) return undefined;
  const aTok = args[1] === undefined ? undefined : token(args[1]);
  if (args[1] !== undefined && aTok === undefined) return undefined;
  const alpha = alphaOf(aTok);
  if (alpha === undefined) return undefined;
  if (fn === 'rgb' || fn === 'rgba') {
    const ch = (t: Token | 'none'): number | undefined => (t === 'none' ? 0 : t.unit === '%' ? clamp((t.v * 255) / 100, 0, 255) : t.unit === '' ? clamp(t.v, 0, 255) : undefined);
    const r = ch(t0);
    const g = ch(t1);
    const b = ch(t2);
    return r === undefined || g === undefined || b === undefined ? undefined : { r, g, b, alpha };
  }
  if (fn === 'hsl' || fn === 'hsla') {
    const pct = (t: Token | 'none'): number | undefined => (t === 'none' ? 0 : t.unit === '%' || t.unit === '' ? clamp(t.v, 0, 100) : undefined);
    const h = hueOf(t0);
    const sat = pct(t1);
    const l = pct(t2);
    return h === undefined || sat === undefined || l === undefined ? undefined : hslToRgb({ h, s: sat, l, alpha });
  }
  if (fn === 'oklch') {
    const l = t0 === 'none' ? 0 : t0.unit === '%' ? t0.v / 100 : t0.unit === '' ? t0.v : undefined;
    const c = t1 === 'none' ? 0 : t1.unit === '%' ? (t1.v / 100) * 0.4 : t1.unit === '' ? t1.v : undefined;
    const h = hueOf(t2);
    return l === undefined || c === undefined || h === undefined ? undefined : oklchToRgb({ l: clamp(l, 0, 1), c: Math.max(0, c), h, alpha });
  }
  return undefined;
}

/**
 * Like `parseColor` but throws `HLP_COLOR_INVALID`.
 * @example
 * parseColorOrThrow('#fff'); // => { r: 255, g: 255, b: 255, alpha: 1 }
 */
export function parseColorOrThrow(input: string): Rgb {
  const c = parseColor(input);
  if (!c) throw new ValidationError('HLP_COLOR_INVALID', 'The colour is not valid.');
  return c;
}

/** Normalizes any `ColorInput` to `Rgb`, throwing `HLP_COLOR_INVALID`. */
function rgbOf(input: ColorInput): Rgb {
  if (typeof input === 'string') return parseColorOrThrow(input);
  const { r, g, b } = input;
  const alpha = input.alpha ?? 1;
  if (![r, g, b, alpha].every(Number.isFinite)) throw new ValidationError('HLP_COLOR_INVALID', 'The colour is not valid.');
  return { r: clamp(r, 0, 255), g: clamp(g, 0, 255), b: clamp(b, 0, 255), alpha: clamp(alpha, 0, 1) };
}

/**
 * The CSS named colour keywords (lowercase).
 * @example
 * cssColorNames().length; // => 148
 */
export function cssColorNames(): string[] {
  return namedColorNames();
}

// ---------------------------------------------------------------------------
// Formatting

const fmt = (v: number, digits: number): string => String(Number(v.toFixed(digits)));
const hex2 = (v: number): string => Math.round(clamp(v, 0, 255)).toString(16).padStart(2, '0');

export interface FormatHexOptions {
  /** `auto` (default) appends alpha only when below 1. */
  readonly alpha?: 'auto' | 'always' | 'never';
}

/**
 * Lowercase hex (`#rrggbb` or `#rrggbbaa`).
 * @example
 * formatHex('rgb(255 0 0 / 0.5)'); // => '#ff000080'
 */
export function formatHex(color: ColorInput, options: FormatHexOptions = {}): string {
  const c = rgbOf(color);
  const mode = options.alpha ?? 'auto';
  const withA = mode === 'always' || (mode === 'auto' && c.alpha < 1);
  return `#${hex2(c.r)}${hex2(c.g)}${hex2(c.b)}${withA ? hex2(c.alpha * 255) : ''}`;
}

/**
 * CSS `rgb()` in modern space syntax, or legacy `rgb(r, g, b)`/`rgba(...)` with `{ legacy: true }`.
 * @example
 * formatRgb('#ff000080'); // => 'rgb(255 0 0 / 0.502)'
 */
export function formatRgb(color: ColorInput, options: { readonly legacy?: boolean } = {}): string {
  const c = rgbOf(color);
  const [r, g, b] = [c.r, c.g, c.b].map((v) => Math.round(v));
  const a = fmt(c.alpha, 3);
  if (options.legacy === true) return c.alpha < 1 ? `rgba(${r}, ${g}, ${b}, ${a})` : `rgb(${r}, ${g}, ${b})`;
  return c.alpha < 1 ? `rgb(${r} ${g} ${b} / ${a})` : `rgb(${r} ${g} ${b})`;
}

/**
 * CSS `hsl()` in modern syntax.
 * @example
 * formatHsl('#ff0000'); // => 'hsl(0 100% 50%)'
 */
export function formatHsl(color: ColorInput): string {
  const c = rgbToHsl(rgbOf(color));
  const a = c.alpha < 1 ? ` / ${fmt(c.alpha, 3)}` : '';
  return `hsl(${fmt(c.h, 2)} ${fmt(c.s, 2)}% ${fmt(c.l, 2)}%${a})`;
}

/**
 * CSS `oklch()` with lightness as a percentage.
 * @example
 * formatOklch('#ff0000'); // => 'oklch(62.796% 0.25768 29.234)'
 */
export function formatOklch(color: ColorInput): string {
  const c = rgbToOklch(rgbOf(color));
  const a = c.alpha < 1 ? ` / ${fmt(c.alpha, 3)}` : '';
  return `oklch(${fmt(c.l * 100, 3)}% ${fmt(c.c, 5)} ${fmt(c.h, 3)}${a})`;
}

// ---------------------------------------------------------------------------
// Conversions

/**
 * sRGB to HSL.
 * @example
 * rgbToHsl({ r: 255, g: 0, b: 0, alpha: 1 }); // => { h: 0, s: 100, l: 50, alpha: 1 }
 */
export function rgbToHsl(rgb: Rgb): Hsl {
  const r = rgb.r / 255;
  const g = rgb.g / 255;
  const b = rgb.b / 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  const d = max - min;
  let h = 0;
  let s = 0;
  if (d > 1e-12) {
    s = l === 0 || l === 1 ? 0 : d / (1 - Math.abs(2 * l - 1));
    if (max === r) h = ((g - b) / d) % 6;
    else if (max === g) h = (b - r) / d + 2;
    else h = (r - g) / d + 4;
    h = mod360(h * 60);
  }
  return { h, s: s * 100, l: l * 100, alpha: rgb.alpha };
}

/**
 * HSL to sRGB.
 * @example
 * hslToRgb({ h: 120, s: 100, l: 25, alpha: 1 }); // => { r: 0, g: 127.5, b: 0, alpha: 1 }
 */
export function hslToRgb(hsl: Hsl): Rgb {
  const s = clamp(hsl.s, 0, 100) / 100;
  const l = clamp(hsl.l, 0, 100) / 100;
  const h = mod360(hsl.h);
  const f = (n: number): number => {
    const k = (n + h / 30) % 12;
    const a = s * Math.min(l, 1 - l);
    return (l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))) * 255;
  };
  return { r: f(0), g: f(8), b: f(4), alpha: clamp(hsl.alpha, 0, 1) };
}

const toLinear = (c: number): number => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = (c: number): number => (c <= 0.0031308 ? c * 12.92 : 1.055 * c ** (1 / 2.4) - 0.055);

interface Lab {
  readonly l: number;
  readonly a: number;
  readonly b: number;
}

function rgbToOklab(rgb: Rgb): Lab {
  return linearToOklab(toLinear(rgb.r / 255), toLinear(rgb.g / 255), toLinear(rgb.b / 255));
}

function linearToOklab(r: number, g: number, b: number): Lab {
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return {
    l: 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    a: 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    b: 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s,
  };
}

/** OKLCH to linear sRGB (may be out of gamut). */
function oklchToLinear(l: number, c: number, h: number): [number, number, number] {
  const hr = (h * Math.PI) / 180;
  const a = c * Math.cos(hr);
  const b = c * Math.sin(hr);
  const l_ = (l + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m_ = (l - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s_ = (l - 0.0894841775 * a - 1.291485548 * b) ** 3;
  return [4.0767416621 * l_ - 3.3077115913 * m_ + 0.2309699292 * s_, -1.2684380046 * l_ + 2.6097574011 * m_ - 0.3413193965 * s_, -0.0041960863 * l_ - 0.7034186147 * m_ + 1.707614701 * s_];
}

const ACHROMATIC = 1e-4;

/**
 * sRGB to OKLCH (hue 0 for greys).
 * @example
 * const white = rgbToOklch({ r: 255, g: 255, b: 255, alpha: 1 });
 * white.l; // => ≈ 1.000
 * white.c; // => ≈ 0.000
 * white.h; // => 0
 */
export function rgbToOklch(rgb: Rgb): Oklch {
  const lab = rgbToOklab(rgb);
  const c = Math.hypot(lab.a, lab.b);
  const h = c < ACHROMATIC ? 0 : mod360((Math.atan2(lab.b, lab.a) * 180) / Math.PI);
  return { l: lab.l, c, h, alpha: rgb.alpha };
}

export interface GamutOptions {
  /** `chroma` (default) reduces chroma at constant lightness and hue until in sRGB; `clip` clamps channels. */
  readonly gamut?: 'chroma' | 'clip';
}

const EPS = 1e-6;
// CSS Color 4 gamut mapping: clipping is acceptable below this ΔEOK (a just-noticeable difference).
const JND = 0.02;

function clipIsUnnoticeable(lin: readonly number[], l: number, c: number, h: number): boolean {
  const [r = 0, g = 0, b = 0] = lin.map((v) => clamp(v, 0, 1));
  const clipped = linearToOklab(r, g, b);
  const hr = (h * Math.PI) / 180;
  return Math.hypot(clipped.l - l, clipped.a - c * Math.cos(hr), clipped.b - c * Math.sin(hr)) < JND;
}
const inGamut = (v: readonly number[]): boolean => v.every((x) => x >= -EPS && x <= 1 + EPS);

/**
 * OKLCH to sRGB with gamut mapping.
 * @example
 * const red = oklchToRgb({ l: 0.628, c: 0.2577, h: 29.23, alpha: 1 });
 * red.r; // => ≈ 255
 * red.g; // => ≈ 0
 * red.b; // => ≈ 0
 */
export function oklchToRgb(lch: Oklch, options: GamutOptions = {}): Rgb {
  const l = clamp(lch.l, 0, 1);
  const alpha = clamp(lch.alpha, 0, 1);
  let c = Math.max(0, lch.c);
  const h = mod360(lch.h);
  if (l >= 1 - EPS) return { r: 255, g: 255, b: 255, alpha };
  if (l <= EPS) return { r: 0, g: 0, b: 0, alpha };
  let lin = oklchToLinear(l, c, h);
  if (!inGamut(lin) && options.gamut !== 'clip' && !clipIsUnnoticeable(lin, l, c, h)) {
    let lo = 0;
    let hi = c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear(l, mid, h))) lo = mid;
      else hi = mid;
    }
    c = lo;
    lin = oklchToLinear(l, c, h);
  }
  const [r, g, b] = lin.map((v) => clamp(fromLinear(clamp(v, 0, 1)), 0, 1) * 255) as [number, number, number];
  return { r, g, b, alpha };
}

// ---------------------------------------------------------------------------
// WCAG

/**
 * WCAG 2.x relative luminance (0 black - 1 white). Alpha is ignored: composite first with `compositeOver`.
 * @example
 * relativeLuminance('#ffffff'); // => 1
 */
export function relativeLuminance(color: ColorInput): number {
  const c = rgbOf(color);
  return 0.2126 * toLinear(c.r / 255) + 0.7152 * toLinear(c.g / 255) + 0.0722 * toLinear(c.b / 255);
}

/**
 * Alpha-composites `fg` over `bg` (source-over).
 * @example
 * compositeOver('rgb(0 0 0 / 0.5)', '#ffffff'); // => { r: 127.5, g: 127.5, b: 127.5, alpha: 1 }
 */
export function compositeOver(fg: ColorInput, bg: ColorInput): Rgb {
  const f = rgbOf(fg);
  const b = rgbOf(bg);
  const a = f.alpha + b.alpha * (1 - f.alpha);
  if (a <= 0) return { r: 0, g: 0, b: 0, alpha: 0 };
  const mixc = (x: number, y: number): number => (x * f.alpha + y * b.alpha * (1 - f.alpha)) / a;
  return { r: mixc(f.r, b.r), g: mixc(f.g, b.g), b: mixc(f.b, b.b), alpha: a };
}

const WHITE: Rgb = { r: 255, g: 255, b: 255, alpha: 1 };

/**
 * WCAG contrast ratio (1-21), unrounded. A translucent background is composited over white and a
 * translucent foreground over the background.
 * @example
 * contrastRatio('#000', '#fff'); // => 21
 * contrastRatio('#777', '#fff'); // => ≈ 4.48
 */
export function contrastRatio(fg: ColorInput, bg: ColorInput): number {
  let b = rgbOf(bg);
  if (b.alpha < 1) b = compositeOver(b, WHITE);
  let f = rgbOf(fg);
  if (f.alpha < 1) f = compositeOver(f, b);
  const l1 = relativeLuminance(f);
  const l2 = relativeLuminance(b);
  return (Math.max(l1, l2) + 0.05) / (Math.min(l1, l2) + 0.05);
}

export interface MeetsContrastOptions {
  /** Default `AA`. */
  readonly level?: 'AA' | 'AAA';
  /** `normal` text (default), `large` text (>= 24px, or >= 18.66px bold), or `non-text` UI and graphics (1.4.11). */
  readonly size?: 'normal' | 'large' | 'non-text';
}

/**
 * WCAG threshold check: AA 4.5 (large 3), AAA 7 (large 4.5), non-text 3. The ratio is not rounded.
 * @example
 * meetsContrast('#777', '#fff'); // => false // 4.48 < 4.5
 * meetsContrast('#777', '#fff', { size: 'large' }); // => true
 */
export function meetsContrast(fg: ColorInput, bg: ColorInput, options: MeetsContrastOptions = {}): boolean {
  const { level = 'AA', size = 'normal' } = options;
  const need = size === 'non-text' ? 3 : level === 'AAA' ? (size === 'large' ? 4.5 : 7) : size === 'large' ? 3 : 4.5;
  return contrastRatio(fg, bg) >= need;
}

/**
 * The candidate with the highest contrast against `bg` (first wins ties).
 * @example
 * bestTextColor('#1e3a8a'); // => '#ffffff'
 * bestTextColor('#fde68a', ['#1f2937', '#f9fafb']); // => '#1f2937'
 */
export function bestTextColor(bg: ColorInput): '#000000' | '#ffffff';
export function bestTextColor<T extends ColorInput>(bg: ColorInput, candidates: readonly T[]): T;
export function bestTextColor(bg: ColorInput, candidates: readonly ColorInput[] = ['#000000', '#ffffff']): ColorInput {
  let best: ColorInput | undefined;
  let bestRatio = -1;
  for (const c of candidates) {
    const r = contrastRatio(c, bg);
    if (r > bestRatio) {
      bestRatio = r;
      best = c;
    }
  }
  if (best === undefined) throw new ValidationError('HLP_COLOR_NO_CANDIDATES', 'At least one candidate colour is required.');
  return best;
}

// Luminance at which black and white text have equal contrast: sqrt(1.05 x 0.05) - 0.05.
const DARK_THRESHOLD = Math.sqrt(1.05 * 0.05) - 0.05;

/**
 * True when white text contrasts better than black (translucent colours are composited over white).
 * @example
 * isDark('#1e3a8a'); // => true
 */
export function isDark(color: ColorInput): boolean {
  let c = rgbOf(color);
  if (c.alpha < 1) c = compositeOver(c, WHITE);
  return relativeLuminance(c) < DARK_THRESHOLD;
}

/**
 * Opposite of `isDark`.
 * @example
 * isLight('#fef3c7'); // => true
 */
export function isLight(color: ColorInput): boolean {
  return !isDark(color);
}

// ---------------------------------------------------------------------------
// Manipulation

export interface MixOptions extends GamutOptions {
  /** Interpolation space. Default `oklch` (shorter hue arc). `srgb` mixes gamma-encoded channels like CSS `color-mix(in srgb)`. */
  readonly space?: 'oklch' | 'srgb';
}

/**
 * Mixes two colours; `weight` is the share of `b` (0 -> `a`, 1 -> `b`). Alpha is interpolated linearly.
 * @example
 * formatHex(mix('#000', '#fff', 0.5, { space: 'srgb' })); // => '#808080'
 */
export function mix(a: ColorInput, b: ColorInput, weight = 0.5, options: MixOptions = {}): Rgb {
  const w = clamp(Number.isFinite(weight) ? weight : 0.5, 0, 1);
  const x = rgbOf(a);
  const y = rgbOf(b);
  const lerp = (p: number, q: number): number => p + (q - p) * w;
  if (options.space === 'srgb') return { r: lerp(x.r, y.r), g: lerp(x.g, y.g), b: lerp(x.b, y.b), alpha: lerp(x.alpha, y.alpha) };
  const p = rgbToOklch(x);
  const q = rgbToOklch(y);
  let h1 = p.h;
  let h2 = q.h;
  if (p.c < ACHROMATIC) h1 = h2;
  if (q.c < ACHROMATIC) h2 = h1;
  let dh = h2 - h1;
  if (dh > 180) dh -= 360;
  else if (dh < -180) dh += 360;
  return oklchToRgb({ l: lerp(p.l, q.l), c: lerp(p.c, q.c), h: h1 + dh * w, alpha: lerp(x.alpha, y.alpha) }, options);
}

/**
 * Raises OKLCH lightness by `amount` (0-1, absolute).
 * @example
 * formatHex(lighten('#1e3a8a', 0.2));
 */
export function lighten(color: ColorInput, amount = 0.1, options: GamutOptions = {}): Rgb {
  const c = rgbToOklch(rgbOf(color));
  return oklchToRgb({ ...c, l: clamp(c.l + amount, 0, 1) }, options);
}

/**
 * Lowers OKLCH lightness by `amount` (0-1, absolute).
 * @example
 * formatHex(darken('#93c5fd', 0.2));
 */
export function darken(color: ColorInput, amount = 0.1, options: GamutOptions = {}): Rgb {
  return lighten(color, -amount, options);
}

/**
 * Returns the colour with `alpha` (0-1) replaced.
 * @example
 * formatHex(withAlpha('#ff0000', 0.5)); // => '#ff000080'
 */
export function withAlpha(color: ColorInput, alpha: number): Rgb {
  const c = rgbOf(color);
  return { ...c, alpha: clamp(Number.isFinite(alpha) ? alpha : 1, 0, 1) };
}

/**
 * Perceptual distance ΔEOK (Euclidean in Oklab; ~ 0.02 is a just-noticeable difference). Alpha ignored.
 * @example
 * colorDistance('#000', '#fff'); // => ≈ 1.00
 */
export function colorDistance(a: ColorInput, b: ColorInput): number {
  const p = rgbToOklab(rgbOf(a));
  const q = rgbToOklab(rgbOf(b));
  return Math.hypot(p.l - q.l, p.a - q.a, p.b - q.b);
}
