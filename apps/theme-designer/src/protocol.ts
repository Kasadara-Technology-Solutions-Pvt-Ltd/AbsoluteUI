import { webFontProblem, webFontProviderOf } from '@absoluteui/theme';

// Designer <-> preview frame messages. Both documents share one origin; each side checks
// the origin, the source window, and the message shape before acting on it.

export type PreviewDensity = 'comfortable' | 'compact' | 'spacious';

export interface ThemeMessage {
  readonly type: 'aui-designer-theme';
  /** Output of toCss(family); applied as a constructable stylesheet (CSP-safe). */
  readonly css: string;
  /** Runtime theme name to show (`brand`, `brand-dark`, `brand-high-contrast`). */
  readonly theme: string;
  readonly density: PreviewDensity;
  /** Web font stylesheets to load (Google Fonts and Bunny Fonts only; the frame CSP allows those hosts). */
  readonly fonts: readonly string[];
}

export interface ReadyMessage {
  readonly type: 'aui-designer-ready';
}

/** Largest stylesheet the frame accepts (the built-in family exports about 40 KB). */
export const MAX_CSS_LENGTH = 2_000_000;

const NAME_RE = /^[a-z][a-z0-9-]{0,80}$/;
const DENSITIES: readonly PreviewDensity[] = ['comfortable', 'compact', 'spacious'];

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;

export function isThemeMessage(v: unknown): v is ThemeMessage {
  return (
    isRecord(v) &&
    v.type === 'aui-designer-theme' &&
    typeof v.css === 'string' &&
    v.css.length <= MAX_CSS_LENGTH &&
    typeof v.theme === 'string' &&
    NAME_RE.test(v.theme) &&
    DENSITIES.some((d) => d === v.density) &&
    Array.isArray(v.fonts) &&
    v.fonts.length <= 10 &&
    v.fonts.every((u) => typeof u === 'string' && isPreviewableFont(u))
  );
}

/** Hosted providers the preview frame may load (its CSP allows exactly these hosts). */
export function isPreviewableFont(stylesheet: string): boolean {
  const provider = webFontProviderOf(stylesheet);
  return provider !== 'custom' && webFontProblem({ provider, family: 'x', stylesheet }) === null;
}

export function isReadyMessage(v: unknown): v is ReadyMessage {
  return isRecord(v) && v.type === 'aui-designer-ready';
}
