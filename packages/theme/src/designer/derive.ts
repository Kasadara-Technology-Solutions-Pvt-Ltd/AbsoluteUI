/**
 * Seed-to-role derivation (SPEC section 9.1.1, section 10.1). Seeds are brand hues; every role
 * token is solved in OKLCH to meet its WCAG 2.2 AA pairing (text 4.5:1, non-text 3:1;
 * high contrast 7:1 and 4.5:1) against every surface it is drawn on. The built-in
 * themes stay hand-tuned; derivation is the designer's starting point, and a derived
 * family must pass the required compliance rules for any seed set.
 */
import { composite, contrastRatio, parseColor, type RGBA } from '../contrast.js';
import { absoluteDefault, densities, type ThemeMode, type TokenMap } from '../tokens.js';
import { oklchToRgb, rgbToOklch, solveLightness, toHex, toRgba, type Oklch } from './color.js';
import { FAMILY_SCHEMA_VERSION, type FamilyMode, type ThemeFamily } from './model.js';
import { defaultWebFonts, type WebFont } from '../web-fonts.js';

export interface ThemeSeeds {
  readonly primary: string;
  /** Neutral hue for text, borders, and surfaces. */
  readonly secondary: string;
  /** Links, focus ring, first chart color. */
  readonly accent: string;
  readonly success: string;
  readonly error: string;
  readonly warning: string;
  readonly info: string;
  /** Light-mode page background and surface. */
  readonly background: string;
  readonly surface: string;
}

export const defaultSeeds: ThemeSeeds = {
  primary: '#1E40AF',
  secondary: '#475569',
  accent: '#2563EB',
  success: '#10B981',
  error: '#EF4444',
  warning: '#F59E0B',
  info: '#2563EB',
  background: '#F8FAFC',
  surface: '#FFFFFF',
};

export const seedNames: readonly (keyof ThemeSeeds)[] = ['primary', 'secondary', 'accent', 'success', 'error', 'warning', 'info', 'background', 'surface'];

/** Seeds from a token map, filling unknown or unparseable entries from the defaults. */
export function normalizeSeeds(seeds: TokenMap): ThemeSeeds {
  const pick = (name: keyof ThemeSeeds, fallback: string): string => {
    const v = seeds[name];
    return v !== undefined && parseColor(v)?.a === 1 ? v : fallback;
  };
  const accent = pick('accent', defaultSeeds.accent);
  return {
    primary: pick('primary', defaultSeeds.primary),
    secondary: pick('secondary', defaultSeeds.secondary),
    accent,
    success: pick('success', defaultSeeds.success),
    error: pick('error', defaultSeeds.error),
    warning: pick('warning', defaultSeeds.warning),
    info: pick('info', accent),
    background: pick('background', defaultSeeds.background),
    surface: pick('surface', defaultSeeds.surface),
  };
}

// Solver targets carry a small margin over the minimum because the gate floors ratios to 0.01.
const TEXT = 4.55;
const NON_TEXT = 3.05;
const HC_TEXT = 7.05;
const HC_NON_TEXT = 4.55;

const WHITE: RGBA = { r: 255, g: 255, b: 255, a: 1 };
const BLACK: RGBA = { r: 0, g: 0, b: 0, a: 1 };

function seed(value: string): Oklch {
  const rgb = parseColor(value);
  return rgbToOklch(rgb ?? BLACK);
}

const at = (c: Oklch, l: number, chroma = c.c): Oklch => ({ l, c: chroma, h: c.h });
const rgb = (c: Oklch): RGBA => oklchToRgb(c);
const hex = (c: RGBA): string => toHex(c);

/** Non-color foundation tokens (typography, spacing, shape, motion) of the built-in family. */
export function defaultFoundation(): TokenMap {
  return Object.fromEntries(Object.entries(absoluteDefault.tokens).filter(([k]) => !k.startsWith('color-')));
}

function darkShadow(value: string): string {
  return value.replace(/rgba?\([^)]*\)/g, (m) => {
    const a = parseColor(m)?.a ?? 0.1;
    return `rgba(0, 0, 0, ${String(Math.round(Math.min(0.6, 0.34 + a * 1.6) * 100) / 100)})`;
  });
}

type Colors = Record<string, string>;

function chartHues(accent: Oklch, success: Oklch): readonly number[] {
  return [accent.h, 45, success.h, 350, 205, 295, 85];
}

function lightColors(s: ThemeSeeds): Colors {
  const n = seed(s.secondary);
  const nc = Math.min(n.c, 0.04);
  const bg = parseColor(s.background) ?? WHITE;
  const surface = parseColor(s.surface) ?? WHITE;
  const sunken = rgb(at(n, 0.968, nc * 0.4));
  const hover = sunken;
  const active = rgb(at(n, 0.929, nc * 0.5));
  const surfaces = [bg, surface, sunken, hover];
  const text = solveLightness(at(n, 0.21, nc * 0.9), [...surfaces, active], 12, -1);
  const muted = solveLightness(at(n, 0.45, nc), surfaces, TEXT, -1);
  const borderStrong = solveLightness(at(n, 0.55, nc), [bg, surface, sunken], NON_TEXT, -1);

  const p = seed(s.primary);
  const primary = solveLightness(p, [bg, surface, sunken, WHITE], TEXT, -1);
  const po = rgbToOklch(primary);
  const primaryHover = solveLightness(at(po, po.l - 0.06), [WHITE], TEXT, -1);
  const primaryActive = solveLightness(at(po, po.l - 0.12), [WHITE], TEXT, -1);
  const selected = rgb(at(p, 0.93, Math.min(p.c, 0.06)));
  const selectedText = solveLightness(at(p, 0.35), [selected], TEXT, -1);
  const selectedIndicator = solveLightness(p, [selected], NON_TEXT, -1);

  // Status tints over the surface. Link and status text are solved against all of them:
  // the Code Viewer draws every syntax color on the added, removed, and highlighted line tints.
  const tint = (value: string, alpha: number): { c: RGBA; subtle: string; on: RGBA } => {
    const c = parseColor(value) ?? BLACK;
    return { c, subtle: toRgba(c, alpha), on: composite({ ...c, a: alpha }, surface) };
  };
  const tints = { success: tint(s.success, 0.12), error: tint(s.error, 0.1), warning: tint(s.warning, 0.1), info: tint(s.info, 0.1) };
  const tinted = Object.values(tints).map((t) => t.on);

  const a = seed(s.accent);
  const link = solveLightness(a, [bg, surface, sunken, ...tinted], TEXT, -1);
  const focus = solveLightness(a, [bg, surface, sunken, hover], NON_TEXT, -1);

  const status = (t: { c: RGBA; subtle: string }): { fg: RGBA; subtle: string } => ({
    fg: solveLightness(rgbToOklch(t.c), [bg, surface, sunken, hover, ...tinted], TEXT, -1),
    subtle: t.subtle,
  });
  const success = status(tints.success);
  const error = status(tints.error);
  const warning = status(tints.warning);
  const info = status(tints.info);
  const dangerFill = solveLightness(seed(s.error), [WHITE, surface], TEXT, -1);
  const df = rgbToOklch(dangerFill);
  const dangerHover = solveLightness(at(df, df.l - 0.07), [WHITE], TEXT, -1);

  const onInverse = bg;
  const inverse = solveLightness(at(n, 0.28, nc), [onInverse], TEXT, -1);

  const charts = chartHues(a, rgbToOklch(success.fg)).map((h, i) =>
    i === 0 ? link : i === 2 ? success.fg : solveLightness({ l: 0.55, c: 0.15, h }, [bg, surface, sunken], NON_TEXT, -1),
  );
  charts.push(solveLightness(at(n, 0.5, nc), [bg, surface, sunken], NON_TEXT, -1));

  return {
    'color-bg': hex(bg),
    'color-surface': hex(surface),
    'color-surface-sunken': hex(sunken),
    'color-text': hex(text),
    'color-text-muted': hex(muted),
    'color-text-disabled': hex(rgb(at(n, 0.72, nc))),
    'color-border': hex(rgb(at(n, 0.87, nc))),
    'color-border-strong': hex(borderStrong),
    'color-link': hex(link),
    'color-primary': hex(primary),
    'color-primary-hover': hex(primaryHover),
    'color-primary-active': hex(primaryActive),
    'color-on-primary': hex(WHITE),
    'color-secondary': hex(muted),
    'color-hover': hex(hover),
    'color-active': hex(active),
    'color-selected': hex(selected),
    'color-selected-text': hex(selectedText),
    'color-selected-indicator': hex(selectedIndicator),
    'color-disabled-bg': hex(sunken),
    'color-focus-ring': hex(focus),
    'color-success-fg': hex(success.fg),
    'color-success-fill': hex(success.fg),
    'color-on-success': hex(WHITE),
    'color-success-subtle': success.subtle,
    'color-error-fg': hex(error.fg),
    'color-danger-fill': hex(dangerFill),
    'color-danger-fill-hover': hex(dangerHover),
    'color-on-danger': hex(WHITE),
    'color-error-subtle': error.subtle,
    'color-warning-fg': hex(warning.fg),
    'color-backdrop': toRgba(text, 0.5),
    'color-warning-subtle': warning.subtle,
    'color-info-fg': hex(info.fg),
    'color-info-subtle': info.subtle,
    'color-inverse': hex(inverse),
    'color-on-inverse': hex(onInverse),
    ...Object.fromEntries(charts.map((c, i) => [`color-chart-${String(i + 1)}`, hex(c)])),
    'color-chart-grid': hex(active),
    'color-chart-axis': hex(borderStrong),
  };
}

function darkColors(s: ThemeSeeds): Colors {
  const n = seed(s.secondary);
  const nc = Math.min(n.c, 0.04);
  const bg = rgb(at(n, 0.17, nc * 0.9));
  const surface = rgb(at(n, 0.215, nc));
  const sunken = bg;
  const hover = rgb(at(n, 0.28, nc));
  const active = rgb(at(n, 0.32, nc));
  const surfaces = [bg, surface, sunken, hover];
  const text = solveLightness(at(n, 0.965, nc * 0.3), [...surfaces, active], 12, 1);
  const muted = solveLightness(at(n, 0.76, nc * 0.6), surfaces, TEXT, 1);
  const borderStrong = solveLightness(at(n, 0.62, nc), [bg, surface, sunken], NON_TEXT, 1);

  const p = seed(s.primary);
  const onPrimary = bg;
  const primary = solveLightness(at(p, Math.max(p.l, 0.72)), [bg, surface, sunken, onPrimary], TEXT, 1);
  const po = rgbToOklch(primary);
  const primaryHover = solveLightness(at(po, Math.min(1, po.l + 0.07)), [onPrimary], TEXT, 1);
  const primaryActive = solveLightness(at(po, Math.min(1, po.l + 0.14)), [onPrimary], TEXT, 1);
  const selected = rgb(at(p, 0.36, Math.min(p.c, 0.12)));
  const selectedText = solveLightness(at(p, 0.97, 0.02), [selected], TEXT, 1);
  const selectedIndicator = solveLightness(at(p, 0.88), [selected], NON_TEXT, 1);

  // Status tints over the surface; link and status text are solved against all of them (Code Viewer diff lines).
  const tintBase = (value: string): RGBA => {
    const c = seed(value);
    return oklchToRgb(at(c, Math.max(c.l, 0.72)));
  };
  const tinted = [s.success, s.error, s.warning, s.info].map((v) => composite({ ...tintBase(v), a: 0.14 }, surface));

  const a = seed(s.accent);
  const link = solveLightness(at(a, Math.max(a.l, 0.8)), [bg, surface, sunken, ...tinted], TEXT, 1);
  const focus = solveLightness(at(a, Math.max(a.l, 0.8)), [bg, surface, sunken, hover], NON_TEXT, 1);

  const status = (value: string): { fg: RGBA; fill: RGBA; on: RGBA; subtle: string } => {
    const c = seed(value);
    const base = tintBase(value);
    const subtle = toRgba(base, 0.14);
    const fg = solveLightness(at(c, Math.max(c.l, 0.78)), [bg, surface, sunken, hover, ...tinted], TEXT, 1);
    const on = rgb(at(c, 0.2, Math.min(c.c, 0.05)));
    const fill = solveLightness(rgbToOklch(fg), [on, surface], TEXT, 1);
    return { fg, fill, on, subtle };
  };
  const success = status(s.success);
  const error = status(s.error);
  const warning = status(s.warning);
  const info = status(s.info);
  const dangerFill = solveLightness(at(seed(s.error), 0.7), [error.on, surface], TEXT, 1);
  const df = rgbToOklch(dangerFill);
  const dangerHover = solveLightness(at(df, Math.min(1, df.l + 0.07)), [error.on], TEXT, 1);

  const onInverse = rgb(at(n, 0.21, nc));
  const inverse = solveLightness(at(n, 0.965, nc * 0.3), [onInverse], TEXT, 1);

  const charts = chartHues(a, rgbToOklch(success.fg)).map((h, i) =>
    i === 0 ? link : i === 2 ? success.fg : solveLightness({ l: 0.72, c: 0.14, h }, [bg, surface, sunken], NON_TEXT, 1),
  );
  charts.push(solveLightness(at(n, 0.85, nc), [bg, surface, sunken], NON_TEXT, 1));

  return {
    'color-bg': hex(bg),
    'color-surface': hex(surface),
    'color-surface-sunken': hex(sunken),
    'color-text': hex(text),
    'color-text-muted': hex(muted),
    'color-text-disabled': hex(rgb(at(n, 0.55, nc))),
    'color-border': hex(rgb(at(n, 0.36, nc))),
    'color-border-strong': hex(borderStrong),
    'color-link': hex(link),
    'color-primary': hex(primary),
    'color-primary-hover': hex(primaryHover),
    'color-primary-active': hex(primaryActive),
    'color-on-primary': hex(onPrimary),
    'color-secondary': hex(muted),
    'color-hover': hex(hover),
    'color-active': hex(active),
    'color-selected': hex(selected),
    'color-selected-text': hex(selectedText),
    'color-selected-indicator': hex(selectedIndicator),
    'color-disabled-bg': hex(hover),
    'color-focus-ring': hex(focus),
    'color-success-fg': hex(success.fg),
    'color-success-fill': hex(success.fill),
    'color-on-success': hex(success.on),
    'color-success-subtle': success.subtle,
    'color-error-fg': hex(error.fg),
    'color-danger-fill': hex(dangerFill),
    'color-danger-fill-hover': hex(dangerHover),
    'color-on-danger': hex(error.on),
    'color-error-subtle': error.subtle,
    'color-warning-fg': hex(warning.fg),
    'color-backdrop': toRgba(rgb(at(n, 0.1, nc)), 0.7),
    'color-warning-subtle': warning.subtle,
    'color-info-fg': hex(info.fg),
    'color-info-subtle': info.subtle,
    'color-inverse': hex(inverse),
    'color-on-inverse': hex(onInverse),
    ...Object.fromEntries(charts.map((c, i) => [`color-chart-${String(i + 1)}`, hex(c)])),
    'color-chart-grid': hex(active),
    'color-chart-axis': hex(borderStrong),
  };
}

function highContrastColors(s: ThemeSeeds): Colors {
  const n = seed(s.secondary);
  const surfaces = [WHITE];
  const strong = (value: string | Oklch, ratio = HC_TEXT, extra: readonly RGBA[] = []): RGBA =>
    solveLightness(typeof value === 'string' ? seed(value) : value, [...surfaces, ...extra], ratio, -1);
  const hover = rgb(at(n, 0.925, 0));
  const active = rgb(at(n, 0.85, 0));
  const primary = strong(s.primary, HC_TEXT, [hover]);
  const po = rgbToOklch(primary);
  const link = strong(s.accent, HC_TEXT, [hover]);
  const muted = strong(at(n, 0.25, Math.min(n.c, 0.02)), HC_TEXT, [hover, active]);
  const errorFg = strong(s.error, HC_TEXT, [hover]);
  const ef = rgbToOklch(errorFg);
  const a = seed(s.accent);
  const charts = chartHues(a, seed(s.success)).map((h, i) => (i === 0 ? link : strong({ l: 0.45, c: 0.15, h }, HC_NON_TEXT)));
  charts[6] = BLACK;
  charts.push(strong(at(n, 0.45, 0), HC_NON_TEXT));
  return {
    'color-bg': '#FFFFFF',
    'color-surface': '#FFFFFF',
    'color-surface-sunken': '#FFFFFF',
    'color-text': '#000000',
    'color-text-muted': hex(muted),
    'color-text-disabled': hex(strong(at(n, 0.5, 0), HC_NON_TEXT)),
    'color-border': '#000000',
    'color-border-strong': '#000000',
    'color-link': hex(link),
    'color-primary': hex(primary),
    'color-primary-hover': hex(strong(at(po, po.l - 0.1))),
    'color-primary-active': '#000000',
    'color-on-primary': '#FFFFFF',
    'color-secondary': hex(muted),
    'color-hover': hex(hover),
    'color-active': hex(active),
    'color-selected': '#000000',
    'color-selected-text': '#FFFFFF',
    'color-selected-indicator': '#FFFFFF',
    'color-disabled-bg': '#FFFFFF',
    'color-focus-ring': '#000000',
    'color-success-fg': hex(strong(s.success)),
    'color-success-fill': hex(strong(s.success)),
    'color-on-success': '#FFFFFF',
    'color-success-subtle': '#FFFFFF',
    'color-error-fg': hex(errorFg),
    'color-danger-fill': hex(errorFg),
    'color-danger-fill-hover': hex(strong(at(ef, ef.l - 0.1))),
    'color-on-danger': '#FFFFFF',
    'color-error-subtle': '#FFFFFF',
    'color-warning-fg': hex(strong(s.warning)),
    'color-backdrop': 'rgba(0, 0, 0, 0.7)',
    'color-warning-subtle': '#FFFFFF',
    'color-info-fg': hex(strong(s.info)),
    'color-info-subtle': '#FFFFFF',
    'color-inverse': '#000000',
    'color-on-inverse': '#FFFFFF',
    ...Object.fromEntries(charts.map((c, i) => [`color-chart-${String(i + 1)}`, hex(c)])),
    'color-chart-grid': hex(strong(at(n, 0.55, 0), HC_NON_TEXT)),
    'color-chart-axis': '#000000',
  };
}

/**
 * Derive the complete token set of one mode from seeds and the (light) foundation.
 * Dark mode deepens shadows; high contrast thickens borders and focus rings and drops shadows.
 */
export function deriveMode(seedMap: TokenMap, mode: ThemeMode, foundation: TokenMap = defaultFoundation()): TokenMap {
  const s = normalizeSeeds(seedMap);
  if (mode === 'light') return { ...foundation, ...lightColors(s) };
  if (mode === 'dark') {
    const shadows = Object.fromEntries(Object.entries(foundation).filter(([k]) => k.startsWith('shadow-')).map(([k, v]) => [k, darkShadow(v)]));
    return { ...foundation, ...shadows, ...darkColors(s) };
  }
  const px = (v: string | undefined): number => (v?.endsWith('px') ? Number(v.slice(0, -2)) : 0);
  return {
    ...foundation,
    'border-width': `${String(Math.max(2, px(foundation['border-width'])))}px`,
    'focus-ring-width': `${String(Math.max(3, px(foundation['focus-ring-width'])))}px`,
    'shadow-sm': 'none',
    'shadow-md': 'none',
    'shadow-lg': 'none',
    ...highContrastColors(s),
  };
}

export interface DeriveFamilyOptions {
  readonly name: string;
  readonly seeds?: TokenMap;
  readonly foundation?: TokenMap;
  readonly version?: string;
  readonly description?: string;
  readonly author?: string;
  /** Default: the default family's fonts (Noto Sans). */
  readonly fonts?: readonly WebFont[];
}

/** A complete family derived from seeds (no component overrides, built-in densities). */
export function deriveFamily(options: DeriveFamilyOptions): ThemeFamily {
  const seeds = { ...normalizeSeeds(options.seeds ?? {}) };
  const mode = (m: ThemeMode): FamilyMode => ({ tokens: deriveMode(seeds, m, options.foundation), componentTokens: {} });
  return {
    schemaVersion: FAMILY_SCHEMA_VERSION,
    name: options.name,
    version: options.version ?? '1.0.0',
    description: options.description ?? '',
    author: options.author ?? '',
    seeds,
    fonts: [...(options.fonts ?? defaultWebFonts)],
    modes: { light: mode('light'), dark: mode('dark'), 'high-contrast': mode('high-contrast') },
    densities: { compact: { ...densities.compact }, spacious: { ...densities.spacious } },
    responsive: {},
  };
}

/** Which tokens of a mode differ from what the seeds derive (the author's manual overrides). */
export function overriddenTokens(family: ThemeFamily, mode: ThemeMode): readonly string[] {
  const light = family.modes.light.tokens;
  const foundation = Object.fromEntries(Object.entries(light).filter(([k]) => !k.startsWith('color-')));
  const derived = deriveMode(family.seeds, mode, foundation);
  return Object.keys(family.modes[mode].tokens).filter((k) => derived[k] !== family.modes[mode].tokens[k]);
}

/** Contrast ratio helper for UIs (two CSS colors; null when either cannot be parsed). */
export function ratioOf(foreground: string, background: string): number | null {
  const fg = parseColor(foreground);
  const bg = parseColor(background);
  if (!fg || !bg) return null;
  const opaqueBg = bg.a < 1 ? composite(bg, WHITE) : bg;
  return Math.floor(contrastRatio(fg.a < 1 ? composite(fg, opaqueBg) : fg, opaqueBg) * 100) / 100;
}
