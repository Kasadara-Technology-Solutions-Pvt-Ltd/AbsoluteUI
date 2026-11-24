/**
 * OKLCH color math for theme derivation (SPEC section 10.1). Björn Ottosson's OKLab
 * matrices; sRGB gamut mapping by chroma reduction so hue and lightness are kept.
 */
import { contrastRatio, parseColor, type RGBA } from '../contrast.js';

export interface Oklch {
  readonly l: number;
  readonly c: number;
  /** Hue in degrees, [0, 360). */
  readonly h: number;
}

const toLinear = (v: number): number => {
  const s = v / 255;
  return s <= 0.04045 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
};
const fromLinear = (v: number): number => (v <= 0.0031308 ? 12.92 * v : 1.055 * v ** (1 / 2.4) - 0.055) * 255;

export function rgbToOklch(c: RGBA): Oklch {
  const r = toLinear(c.r);
  const g = toLinear(c.g);
  const b = toLinear(c.b);
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  const L = 0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s;
  const A = 1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s;
  const B = 0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s;
  const chroma = Math.hypot(A, B);
  const hue = chroma < 1e-6 ? 0 : (Math.atan2(B, A) * 180) / Math.PI;
  return { l: L, c: chroma, h: (hue + 360) % 360 };
}

/** Linear-light sRGB channels, unclamped (may fall outside [0, 1] when out of gamut). */
function oklchToLinear({ l: L, c, h }: Oklch): [number, number, number] {
  const rad = (h * Math.PI) / 180;
  const A = c * Math.cos(rad);
  const B = c * Math.sin(rad);
  const l = (L + 0.3963377774 * A + 0.2158037573 * B) ** 3;
  const m = (L - 0.1055613458 * A - 0.0638541728 * B) ** 3;
  const s = (L - 0.0894841775 * A - 1.291485548 * B) ** 3;
  return [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s,
  ];
}

const inGamut = (lin: readonly number[]): boolean => lin.every((v) => v >= -1e-4 && v <= 1 + 1e-4);

/** Convert to sRGB, reducing chroma until the color is inside the sRGB gamut. */
export function oklchToRgb(color: Oklch): RGBA {
  const l = Math.min(1, Math.max(0, color.l));
  let lin = oklchToLinear({ ...color, l });
  if (!inGamut(lin)) {
    let lo = 0;
    let hi = color.c;
    for (let i = 0; i < 24; i++) {
      const mid = (lo + hi) / 2;
      if (inGamut(oklchToLinear({ l, c: mid, h: color.h }))) lo = mid;
      else hi = mid;
    }
    lin = oklchToLinear({ l, c: lo, h: color.h });
  }
  const [r, g, b] = lin.map((v) => Math.round(Math.min(255, Math.max(0, fromLinear(Math.min(1, Math.max(0, v))))))) as [number, number, number];
  return { r, g, b, a: 1 };
}

export const toHex = (c: RGBA): string => `#${[c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('').toUpperCase()}`;

/** `rgba()` text with the given alpha, for translucent role tokens. */
export const toRgba = (c: RGBA, alpha: number): string => `rgba(${String(Math.round(c.r))}, ${String(Math.round(c.g))}, ${String(Math.round(c.b))}, ${String(Math.round(alpha * 100) / 100)})`;

export function parseOklch(value: string): Oklch | null {
  const rgb = parseColor(value);
  return rgb ? rgbToOklch(rgb) : null;
}

/**
 * Move `color` along OKLCH lightness (keeping hue and chroma where the gamut allows)
 * until it reaches `ratio` against every backdrop. `direction` -1 darkens, +1 lightens.
 * Returns the first passing color, or the extreme (black/white end) when none passes.
 */
export function solveLightness(color: Oklch, backdrops: readonly RGBA[], ratio: number, direction: -1 | 1): RGBA {
  const passes = (c: RGBA): boolean => backdrops.every((b) => contrastRatio(c, b) >= ratio);
  let current = oklchToRgb(color);
  if (passes(current)) return current;
  for (let l = color.l; direction < 0 ? l >= 0 : l <= 1; l += 0.0025 * direction) {
    current = oklchToRgb({ ...color, l });
    if (passes(current)) return current;
  }
  return current;
}

/** Whichever of black-ish `dark` or white-ish `light` contrasts more with `bg`. */
export function bestOn(bg: RGBA, dark: RGBA, light: RGBA): RGBA {
  return contrastRatio(dark, bg) >= contrastRatio(light, bg) ? dark : light;
}
