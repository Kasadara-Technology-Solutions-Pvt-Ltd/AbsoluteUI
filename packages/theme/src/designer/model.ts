/**
 * Theme family model, schema version 2 (SPEC section 10.1, section 10.2, section 10.7). A family is one
 * brand: shared seeds, a complete token set per color mode (light, dark, high
 * contrast), sparse component-token overrides per mode, density overrides, and
 * responsive (min-width) overrides. Schema version 1 single themes migrate on import.
 */
import { componentTokens, getComponentToken } from '../component-tokens.js';
import { absoluteDark, absoluteDefault, absoluteHighContrast, densities, type ThemeDefinition, type ThemeMode, type TokenMap } from '../tokens.js';
import { defaultWebFonts, type WebFont } from '../web-fonts.js';

export const FAMILY_SCHEMA_VERSION = 2;

export const familyModes: readonly ThemeMode[] = ['light', 'dark', 'high-contrast'];

export type DensityName = 'compact' | 'spacious';
export const densityNames: readonly DensityName[] = ['compact', 'spacious'];

export type BreakpointName = 'sm' | 'md' | 'lg' | 'xl';
/** Same values as the SCSS `$aui-breakpoints` map (SPEC section 12.2). */
export const breakpoints: Readonly<Record<BreakpointName, number>> = { sm: 640, md: 768, lg: 1024, xl: 1280 };
export const breakpointNames: readonly BreakpointName[] = ['sm', 'md', 'lg', 'xl'];

/** Tokens a responsive (min-width) override may change: typography, spacing, layout widths. */
export const RESPONSIVE_TOKEN_RE = /^(font-size-|line-height-|space-|container-width-|dialog-width-|drawer-width-|control-height-|control-padding-x$|toast-width$|tooltip-max-width$|popover-max-height$)/;

export interface FamilyMode {
  /** Complete global token set for this mode (SPEC section 9.2). */
  readonly tokens: TokenMap;
  /** Component token overrides (`button-radius`); unset names fall back to their global token. */
  readonly componentTokens: TokenMap;
}

export interface ThemeFamily {
  readonly schemaVersion: typeof FAMILY_SCHEMA_VERSION;
  /** Lowercase kebab-case; the light theme uses it, dark and high contrast add a suffix. */
  readonly name: string;
  /** Semantic version of this theme (SPEC section 10.6 versioned theme packages). */
  readonly version: string;
  readonly description: string;
  readonly author: string;
  readonly seeds: TokenMap;
  /** Web font stylesheets the font stack tokens rely on (Google Fonts, Bunny Fonts, or self-hosted). */
  readonly fonts: readonly WebFont[];
  readonly modes: Readonly<Record<ThemeMode, FamilyMode>>;
  readonly densities: Readonly<Record<DensityName, TokenMap>>;
  readonly responsive: Readonly<Partial<Record<BreakpointName, TokenMap>>>;
}

/** Runtime theme name of one mode (`brand`, `brand-dark`, `brand-high-contrast`). */
export function modeThemeName(familyName: string, mode: ThemeMode): string {
  return mode === 'light' ? familyName : `${familyName}-${mode}`;
}

/** The value a component token resolves to in a mode: its override, else its global fallback. */
export function resolveToken(mode: FamilyMode, name: string): string | undefined {
  const own = mode.tokens[name];
  if (own !== undefined) return own;
  const override = mode.componentTokens[name];
  if (override !== undefined) return override;
  const spec = getComponentToken(name);
  return spec ? mode.tokens[spec.fallback] : undefined;
}

/** Flatten a family into schema-1 theme definitions that `registerTheme()` accepts. */
export function familyToThemes(family: ThemeFamily): ThemeDefinition[] {
  return familyModes.map((mode) => ({
    schemaVersion: 1,
    name: modeThemeName(family.name, mode),
    mode,
    seeds: family.seeds,
    tokens: { ...family.modes[mode].tokens, ...family.modes[mode].componentTokens },
    contrastPairs: absoluteDefault.contrastPairs,
  }));
}

/** The built-in Absolute Default family (light, dark, high contrast), the designer's starting point. */
export function builtInFamily(): ThemeFamily {
  const mode = (t: ThemeDefinition): FamilyMode => ({ tokens: { ...t.tokens }, componentTokens: {} });
  return {
    schemaVersion: FAMILY_SCHEMA_VERSION,
    name: 'absolute-default',
    version: '1.0.0',
    description: 'AbsoluteUI built-in theme family.',
    author: '',
    seeds: { ...absoluteDefault.seeds, warning: '#F59E0B', info: absoluteDefault.seeds.accent ?? '#2563EB' },
    fonts: [...defaultWebFonts],
    modes: { light: mode(absoluteDefault), dark: mode(absoluteDark), 'high-contrast': mode(absoluteHighContrast) },
    densities: { compact: { ...densities.compact }, spacious: { ...densities.spacious } },
    responsive: {},
  };
}

/** Components with component tokens, for UIs that group overrides by component. */
export const componentTokenComponents: readonly string[] = Object.keys(componentTokens);
