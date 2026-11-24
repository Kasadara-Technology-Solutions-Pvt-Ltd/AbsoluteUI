/**
 * Runtime theming (SPEC section 11.2). Built-in themes ship as compiled CSS keyed by
 * `data-aui-theme`; custom themes are applied as constructable stylesheets in the
 * `aui.theme` layer (no inline <style>, CSP-safe per section 14.6).
 */
import { configurationError, getCommonConfig, onConfigChange, type Disposer } from '@absoluteui/core';
import { themes, type ThemeDefinition } from './tokens.js';
import { themeToCssText, validateTheme } from './serialize.js';

/** Built-in theme names accepted by the `theme` configuration option. */
export const builtInThemeNames = ['absolute-default', 'absolute-dark', 'absolute-high-contrast', 'absolute-system'] as const;

const custom = new Map<string, { theme: ThemeDefinition; sheet: CSSStyleSheet | null }>();

/** Register a custom theme (validated, section 10.7). Returns the normalized definition. */
export function registerTheme(input: unknown): ThemeDefinition {
  const theme = validateTheme(input);
  if ((builtInThemeNames as readonly string[]).includes(theme.name)) {
    throw configurationError('THEME_RESERVED_NAME', 'Theme name is reserved for a built-in theme.', { property: 'theme.name' });
  }
  custom.set(theme.name, { theme, sheet: null });
  return theme;
}

export function getTheme(name: string): ThemeDefinition | undefined {
  return (themes as Record<string, ThemeDefinition | undefined>)[name] ?? custom.get(name)?.theme;
}

function ensureSheet(doc: Document, name: string): void {
  const entry = custom.get(name);
  if (!entry || entry.sheet) return;
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(themeToCssText(entry.theme));
  doc.adoptedStyleSheets = [...doc.adoptedStyleSheets, sheet];
  entry.sheet = sheet;
}

export interface ApplyThemeOptions {
  target?: HTMLElement;
  density?: 'compact' | 'comfortable' | 'spacious';
  /** Also set the `dir` attribute from configuration. Default false. */
  applyDirection?: boolean;
}

/** Apply a theme by name to a target element (default: the document element). */
export function applyTheme(name: string, options: ApplyThemeOptions = {}): void {
  const target = options.target ?? document.documentElement;
  const isBuiltIn = (builtInThemeNames as readonly string[]).includes(name);
  if (!isBuiltIn && !custom.has(name)) {
    throw configurationError('THEME_UNKNOWN', 'Unknown theme.', { property: 'theme', expected: 'built-in theme name or a registered custom theme' });
  }
  if (!isBuiltIn) ensureSheet(target.ownerDocument, name);
  target.dataset.auiTheme = name;
  if (options.density) target.dataset.auiDensity = options.density;
}

/**
 * Keep the target in sync with global configuration (theme, density, optional
 * direction). Returns a disposer.
 */
export function startThemeRuntime(options: Omit<ApplyThemeOptions, 'density'> = {}): Disposer {
  const target = options.target ?? document.documentElement;
  const sync = (): void => {
    const config = getCommonConfig();
    applyTheme(config.theme, { target, density: config.density });
    // CSS disables transitions under [data-aui-animation="none"] (SPEC section 16.2).
    target.dataset.auiAnimation = config.animation;
    if (options.applyDirection) target.dir = config.direction;
  };
  sync();
  return onConfigChange(sync);
}
