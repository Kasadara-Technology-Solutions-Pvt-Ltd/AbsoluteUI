/**
 * Web fonts (SPEC section 10.1 typography and font stacks). A theme lists the font
 * stylesheets it needs; the font stack tokens name the families. Loading is always
 * opt-in: `absolute-default.css` never requests a third-party font. The default theme's
 * `font-family-sans` starts with "Noto Sans", and `@absoluteui/theme/fonts/noto-sans.css`
 * loads it from Google Fonts for applications that choose to.
 *
 * Privacy and CSP: a hosted font service receives every visitor's IP address and user
 * agent. Applications must allow its hosts in `style-src` and `font-src`, and decide on
 * consent where that applies (for example the GDPR); self-hosting avoids both.
 */

export type WebFontProvider = 'google' | 'bunny' | 'custom';

export interface WebFont {
  readonly provider: WebFontProvider;
  /** CSS font family name as the stylesheet declares it, for example `Noto Sans`. */
  readonly family: string;
  /** HTTPS URL of the provider's CSS (not a font file). */
  readonly stylesheet: string;
}

/** Google Fonts CSS for Noto Sans: italic, width 62.5-100, weight 100-900. */
export const notoSansStylesheet = 'https://fonts.googleapis.com/css2?family=Noto+Sans:ital,wdth,wght@0,62.5..100,100..900;1,62.5..100,100..900&display=swap';

/** The default theme family's web fonts. */
export const defaultWebFonts: readonly WebFont[] = [{ provider: 'google', family: 'Noto Sans', stylesheet: notoSansStylesheet }];

/** Hosts each provider serves from, for Content-Security-Policy `style-src` and `font-src`. */
export const webFontHosts: Readonly<Record<Exclude<WebFontProvider, 'custom'>, { readonly styleSrc: string; readonly fontSrc: string }>> = {
  google: { styleSrc: 'https://fonts.googleapis.com', fontSrc: 'https://fonts.gstatic.com' },
  bunny: { styleSrc: 'https://fonts.bunny.net', fontSrc: 'https://fonts.bunny.net' },
};

const FAMILY_RE = /^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$/;
// No quotes, backslashes, whitespace, or angle brackets, so the URL is inert inside url("...").
const URL_RE = /^https:\/\/([a-z0-9-]+(?:\.[a-z0-9-]+)+)(?::\d{1,5})?\/[A-Za-z0-9._~:/?#[\]@!$&()*+,;=%-]{0,1500}$/;

/** Provider implied by a stylesheet URL. */
export function webFontProviderOf(stylesheet: string): WebFontProvider {
  const host = URL_RE.exec(stylesheet)?.[1];
  if (host === 'fonts.googleapis.com') return 'google';
  if (host === 'fonts.bunny.net') return 'bunny';
  return 'custom';
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Why a web font entry is invalid, or null when it is valid. */
export function webFontProblem(font: unknown): string | null {
  if (!isRecord(font)) return 'expected { provider, family, stylesheet }';
  const f = font;
  if (typeof f.family !== 'string' || !FAMILY_RE.test(f.family)) return 'family: letters, digits, and spaces, at most 64 characters';
  if (typeof f.stylesheet !== 'string' || !URL_RE.test(f.stylesheet)) return 'stylesheet: an https URL without quotes, spaces, or backslashes';
  if (f.provider !== webFontProviderOf(f.stylesheet)) return `provider: "${webFontProviderOf(f.stylesheet)}" for this stylesheet host`;
  return null;
}

/** `@import` rules for the given fonts (valid only at the top of a stylesheet). */
export function webFontsToCss(fonts: readonly WebFont[]): string {
  return fonts.map((f) => `@import url("${f.stylesheet}");`).join('\n');
}
