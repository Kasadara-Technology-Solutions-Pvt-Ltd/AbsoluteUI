/**
 * Theme import (SPEC section 10.7). Imported files are untrusted: size and count limits,
 * strict names, the safe CSS value grammar, known tokens only, and every problem
 * reported at once with its JSON path. Accepts schema 2 families, schema 1 single
 * themes (migrated: the other modes are derived from the seeds), and the schema 1
 * `tokens.json` bundle that `@absoluteui/theme` ships.
 */
import { componentTokenNames } from '../component-tokens.js';
import { optionalTokenNames, optionalTokenProblem } from '../optional-tokens.js';
import { webFontProblem, type WebFont } from '../web-fonts.js';
import { isSafeTokenValue } from '../serialize.js';
import { requiredTokenNames, type ThemeMode, type TokenMap } from '../tokens.js';
import { defaultFoundation, deriveMode } from './derive.js';
import {
  FAMILY_SCHEMA_VERSION,
  RESPONSIVE_TOKEN_RE,
  breakpointNames,
  densityNames,
  familyModes,
  type BreakpointName,
  type DensityName,
  type FamilyMode,
  type ThemeFamily,
  builtInFamily,
} from './model.js';
import { configurationError } from '@absoluteui/core';

export const MAX_IMPORT_BYTES = 1_000_000;
const MAX_TOKENS_PER_MAP = 1000;
const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const TOKEN_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
// Semantic Versioning 2.0.0, without build metadata.
const SEMVER_RE = /^(0|[1-9]\d*)\.(0|[1-9]\d*)\.(0|[1-9]\d*)(?:-[0-9A-Za-z-]+(?:\.[0-9A-Za-z-]+)*)?$/;

export interface ImportIssue {
  /** JSON path of the offending value, for example `modes.dark.tokens.color-text`. */
  readonly path: string;
  readonly message: string;
}

export type ImportResult =
  | { readonly ok: true; readonly family: ThemeFamily; readonly format: 'family-v2' | 'theme-v1' | 'bundle-v1'; readonly warnings: readonly string[] }
  | { readonly ok: false; readonly errors: readonly ImportIssue[] };

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);
const isMode = (v: unknown): v is ThemeMode => familyModes.some((m) => m === v);
const isDensity = (v: unknown): v is DensityName => densityNames.some((d) => d === v);
const isBreakpoint = (v: unknown): v is BreakpointName => breakpointNames.some((b) => b === v);
const isName = (v: unknown): v is string => typeof v === 'string' && NAME_RE.test(v);
const isVersion = (v: unknown): v is string => typeof v === 'string' && SEMVER_RE.test(v);

class Collector {
  readonly errors: ImportIssue[] = [];
  add(path: string, message: string): void {
    if (this.errors.length < 200) this.errors.push({ path, message });
  }
}

const known = new Set(requiredTokenNames);
const optional = new Set(optionalTokenNames);
const knownComponent = new Set(componentTokenNames);

function tokenMap(value: unknown, path: string, c: Collector, accept: (name: string, value: string) => string | null): Record<string, string> {
  const out: Record<string, string> = {};
  if (!isRecord(value)) {
    c.add(path, 'expected an object of token name to value');
    return out;
  }
  const entries = Object.entries(value);
  if (entries.length > MAX_TOKENS_PER_MAP) {
    c.add(path, `more than ${String(MAX_TOKENS_PER_MAP)} entries`);
    return out;
  }
  for (const [k, v] of entries) {
    const at = `${path}.${k}`;
    if (!TOKEN_NAME_RE.test(k)) {
      c.add(at, 'token names are lowercase kebab-case, at most 64 characters');
      continue;
    }
    if (!isSafeTokenValue(v)) {
      c.add(at, 'value must be a safe CSS value (colors, lengths, numbers, font stacks, shadows, cubic-bezier); url(), braces, and semicolons are rejected');
      continue;
    }
    const problem = accept(k, v);
    if (problem) {
      c.add(at, problem);
      continue;
    }
    out[k] = v;
  }
  return out;
}

const globalOnly = (k: string): string | null => (known.has(k) ? null : 'unknown token');
/** Mode token maps: role tokens plus optional tokens (scrollbar). */
const modeToken = (k: string, v: string): string | null => (known.has(k) ? null : optional.has(k) ? optionalTokenProblem(k, v) : 'unknown token');
const componentOnly = (k: string): string | null => (knownComponent.has(k) ? null : 'unknown component token');

function text(value: unknown, path: string, max: number, c: Collector): string {
  if (value === undefined) return '';
  if (typeof value !== 'string' || value.length > max || /[<>]/.test(value)) {
    c.add(path, `expected text up to ${String(max)} characters without < or >`);
    return '';
  }
  return value;
}

const MAX_FONTS = 10;

function fontList(value: unknown, path: string, c: Collector): WebFont[] {
  if (!Array.isArray(value)) {
    c.add(path, 'expected an array of { provider, family, stylesheet }');
    return [];
  }
  if (value.length > MAX_FONTS) {
    c.add(path, `at most ${String(MAX_FONTS)} web fonts`);
    return [];
  }
  const out: WebFont[] = [];
  value.forEach((font: unknown, i) => {
    const problem = webFontProblem(font);
    if (problem || !isRecord(font)) {
      c.add(`${path}[${String(i)}]`, problem ?? 'invalid web font');
      return;
    }
    const { provider, family, stylesheet } = font;
    if ((provider === 'google' || provider === 'bunny' || provider === 'custom') && typeof family === 'string' && typeof stylesheet === 'string') out.push({ provider, family, stylesheet });
  });
  return out;
}

/** Fonts of the base family whose names appear in the given font stacks (for migrated themes). */
function fontsUsedBy(tokens: TokenMap, candidates: readonly WebFont[]): WebFont[] {
  const stacks = Object.entries(tokens)
    .filter(([k]) => k.startsWith('font-family-'))
    .map(([, v]) => v)
    .join(',');
  return candidates.filter((f) => stacks.includes(f.family));
}

function validateFamily(input: Record<string, unknown>, c: Collector): ThemeFamily | null {
  const { name, version } = input;
  if (!isName(name)) c.add('name', 'lowercase kebab-case name, at most 64 characters');
  if (!isVersion(version)) c.add('version', 'semantic version such as 1.0.0');
  const description = text(input.description, 'description', 500, c);
  const author = text(input.author, 'author', 200, c);
  const seeds = tokenMap(input.seeds ?? {}, 'seeds', c, () => null);
  const fonts = fontList(input.fonts ?? [], 'fonts', c);
  const modes: Partial<Record<ThemeMode, FamilyMode>> = {};
  if (!isRecord(input.modes)) c.add('modes', 'expected { light, dark, high-contrast }');
  else {
    for (const key of Object.keys(input.modes)) if (!isMode(key)) c.add(`modes.${key}`, 'unknown mode');
    for (const mode of familyModes) {
      const m = input.modes[mode];
      if (!isRecord(m)) {
        c.add(`modes.${mode}`, 'missing mode');
        continue;
      }
      const tokens = tokenMap(m.tokens, `modes.${mode}.tokens`, c, modeToken);
      for (const r of requiredTokenNames) if (!(r in tokens) && isRecord(m.tokens) && !(r in m.tokens)) c.add(`modes.${mode}.tokens.${r}`, 'required token is missing (theme completeness, SPEC section 9.2)');
      const componentTokens = tokenMap(m.componentTokens ?? {}, `modes.${mode}.componentTokens`, c, componentOnly);
      modes[mode] = { tokens, componentTokens };
    }
  }
  const dens: Record<DensityName, TokenMap> = { compact: {}, spacious: {} };
  const rawDensities = input.densities ?? {};
  if (!isRecord(rawDensities)) c.add('densities', 'expected { compact, spacious }');
  else {
    for (const key of Object.keys(rawDensities)) if (!isDensity(key)) c.add(`densities.${key}`, 'unknown density');
    for (const d of densityNames) dens[d] = tokenMap(rawDensities[d] ?? {}, `densities.${d}`, c, globalOnly);
  }
  const responsive: Partial<Record<BreakpointName, TokenMap>> = {};
  const rawResponsive = input.responsive ?? {};
  if (!isRecord(rawResponsive)) c.add('responsive', 'expected { sm?, md?, lg?, xl? }');
  else {
    for (const [key, value] of Object.entries(rawResponsive)) {
      if (!isBreakpoint(key)) {
        c.add(`responsive.${key}`, 'unknown breakpoint (sm, md, lg, xl)');
        continue;
      }
      responsive[key] = tokenMap(value, `responsive.${key}`, c, (k) =>
        !known.has(k) ? 'unknown token' : RESPONSIVE_TOKEN_RE.test(k) ? null : 'only typography, spacing, control-size, and layout-width tokens vary by breakpoint',
      );
    }
  }
  const { light, dark } = modes;
  const hc = modes['high-contrast'];
  if (c.errors.length > 0 || !isName(name) || !isVersion(version) || !light || !dark || !hc) return null;
  return {
    schemaVersion: FAMILY_SCHEMA_VERSION,
    name,
    version,
    description,
    author,
    seeds,
    fonts,
    modes: { light, dark, 'high-contrast': hc },
    densities: dens,
    responsive,
  };
}

function migrateTheme(input: Record<string, unknown>, c: Collector, warnings: string[]): ThemeFamily | null {
  const { mode, name } = input;
  if (!isMode(mode)) c.add('mode', '"light" | "dark" | "high-contrast"');
  if (!isName(name)) c.add('name', 'lowercase kebab-case name, at most 64 characters');
  const seeds = tokenMap(input.seeds ?? {}, 'seeds', c, () => null);
  const all = tokenMap(input.tokens, 'tokens', c, (k, v) => (knownComponent.has(k) ? null : modeToken(k, v)));
  for (const r of requiredTokenNames) if (!(r in all) && isRecord(input.tokens) && !(r in input.tokens)) c.add(`tokens.${r}`, 'required token is missing (theme completeness, SPEC section 9.2)');
  if (c.errors.length > 0 || !isMode(mode) || !isName(name)) return null;
  const tokens = Object.fromEntries(Object.entries(all).filter(([k]) => known.has(k) || optional.has(k)));
  const componentTokens = Object.fromEntries(Object.entries(all).filter(([k]) => knownComponent.has(k)));
  const foundation = Object.fromEntries(Object.entries(tokens).filter(([k]) => !k.startsWith('color-')));
  const base = builtInFamily();
  const modeOf = (m: ThemeMode): FamilyMode => (m === mode ? { tokens, componentTokens } : { tokens: deriveMode(seeds, m, { ...defaultFoundation(), ...foundation }), componentTokens: {} });
  const modes = { light: modeOf('light'), dark: modeOf('dark'), 'high-contrast': modeOf('high-contrast') };
  warnings.push(`Schema 1 theme migrated: the ${mode} mode is imported as-is; the other modes are derived from its seeds. Review them before exporting.`);
  return { ...base, name, seeds: { ...base.seeds, ...seeds }, fonts: fontsUsedBy(tokens, base.fonts), modes };
}

function migrateBundle(input: Record<string, unknown>, c: Collector, warnings: string[]): ThemeFamily | null {
  if (!Array.isArray(input.themes) || input.themes.length === 0 || input.themes.length > 3) {
    c.add('themes', 'expected one to three themes');
    return null;
  }
  const found = new Map<ThemeMode, Record<string, unknown>>();
  input.themes.forEach((t: unknown, i) => {
    if (!isRecord(t) || !isMode(t.mode)) c.add(`themes[${String(i)}]`, 'expected a schema 1 theme with a mode');
    else if (found.has(t.mode)) c.add(`themes[${String(i)}].mode`, 'duplicate mode');
    else found.set(t.mode, t);
  });
  const first = found.get('light') ?? [...found.values()][0];
  if (!first || c.errors.length > 0) return null;
  const family = migrateTheme(first, c, []);
  if (!family) return null;
  const modes: Record<ThemeMode, FamilyMode> = { ...family.modes };
  for (const [mode, theme] of found) {
    const all = tokenMap(theme.tokens, `themes.${mode}.tokens`, c, (k, v) => (knownComponent.has(k) ? null : modeToken(k, v)));
    for (const r of requiredTokenNames) if (!(r in all)) c.add(`themes.${mode}.tokens.${r}`, 'required token is missing');
    modes[mode] = {
      tokens: Object.fromEntries(Object.entries(all).filter(([k]) => known.has(k) || optional.has(k))),
      componentTokens: Object.fromEntries(Object.entries(all).filter(([k]) => knownComponent.has(k))),
    };
  }
  if (c.errors.length > 0) return null;
  const missing = familyModes.filter((m) => !found.has(m));
  if (missing.length > 0) warnings.push(`Bundle migrated: ${missing.join(', ')} derived from the seeds.`);
  const d = input.densities;
  const densities = { ...family.densities };
  if (isRecord(d)) for (const name of densityNames) if (d[name] !== undefined) densities[name] = tokenMap(d[name], `densities.${name}`, c, globalOnly);
  if (c.errors.length > 0) return null;
  return { ...family, modes, densities };
}

/** Validate an already-parsed value. */
export function importThemeValue(input: unknown): ImportResult {
  const c = new Collector();
  const warnings: string[] = [];
  if (!isRecord(input)) return { ok: false, errors: [{ path: '', message: 'expected a JSON object' }] };
  let family: ThemeFamily | null = null;
  let format: 'family-v2' | 'theme-v1' | 'bundle-v1' = 'family-v2';
  if (input.schemaVersion === FAMILY_SCHEMA_VERSION) family = validateFamily(input, c);
  else if (input.schemaVersion === 1 && Array.isArray(input.themes)) {
    format = 'bundle-v1';
    family = migrateBundle(input, c, warnings);
  } else if (input.schemaVersion === 1) {
    format = 'theme-v1';
    family = migrateTheme(input, c, warnings);
  } else c.add('schemaVersion', `unsupported schema version (supported: 1, ${String(FAMILY_SCHEMA_VERSION)})`);
  if (!family || c.errors.length > 0) return { ok: false, errors: c.errors };
  return { ok: true, family, format, warnings };
}

/** Parse and validate theme file text (SPEC section 10.7). */
export function importTheme(textInput: string): ImportResult {
  if (textInput.length > MAX_IMPORT_BYTES) return { ok: false, errors: [{ path: '', message: `file is larger than ${String(MAX_IMPORT_BYTES)} bytes` }] };
  let parsed: unknown;
  try {
    parsed = JSON.parse(textInput);
  } catch {
    return { ok: false, errors: [{ path: '', message: 'not valid JSON' }] };
  }
  return importThemeValue(parsed);
}

/**
 * Validate a family built in memory (for example by a designer UI) before it is
 * exported or applied. Throws a THEME_INVALID configuration error listing the issues.
 */
export function assertValidFamily(family: ThemeFamily): ThemeFamily {
  const c = new Collector();
  const valid = validateFamily(family as unknown as Record<string, unknown>, c);
  if (!valid || c.errors.length > 0) {
    throw configurationError('THEME_INVALID', 'Invalid theme family.', { property: c.errors[0]?.path ?? 'family', expected: c.errors[0]?.message ?? 'valid theme family' });
  }
  return valid;
}
