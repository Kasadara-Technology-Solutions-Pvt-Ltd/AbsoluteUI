/**
 * Theme export/import (SPEC section 10.6, section 10.7). Token values are validated against a
 * safe grammar so an imported theme cannot inject CSS (no `;`, braces, url(), etc.).
 */
import { configurationError } from '@absoluteui/core';
import { componentTokenNames } from './component-tokens.js';
import { optionalTokenNames, optionalTokenProblem } from './optional-tokens.js';
import { densities, requiredTokenNames, type ContrastKind, type ContrastPair, type ThemeDefinition, type ThemeMode } from './tokens.js';

const NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
const TOKEN_NAME_RE = /^[a-z][a-z0-9-]{0,63}$/;
// Allowed characters for token values: no ; { } < > \ @ and no url()/expression()/image-set().
const SAFE_VALUE_RE = /^[a-zA-Z0-9#%.,()\s"'/+-]{1,200}$/;
const FORBIDDEN_FN_RE = /\b(url|expression|image-set|image|element|attr|env)\s*\(/i;

export function isSafeTokenValue(value: unknown): value is string {
  return typeof value === 'string' && SAFE_VALUE_RE.test(value) && !FORBIDDEN_FN_RE.test(value);
}

function fail(property: string, expected: string): never {
  throw configurationError('THEME_INVALID', 'Invalid theme definition.', { property, expected });
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

function tokenMap(value: unknown, property: string): Record<string, string> {
  if (!isRecord(value)) fail(property, 'object of token name to value');
  const out: Record<string, string> = {};
  for (const [k, v] of Object.entries(value)) {
    if (!TOKEN_NAME_RE.test(k)) fail(`${property}.${k}`, 'lowercase kebab-case token name');
    if (!isSafeTokenValue(v)) fail(`${property}.${k}`, 'safe CSS value (colors, lengths, numbers, font stacks, shadows, cubic-bezier)');
    out[k] = v;
  }
  return out;
}

/** Validate an untrusted theme (e.g. imported JSON) against schema version 1. */
export function validateTheme(input: unknown): ThemeDefinition {
  if (!isRecord(input)) fail('theme', 'object');
  if (input.schemaVersion !== 1) fail('theme.schemaVersion', '1');
  if (typeof input.name !== 'string' || !NAME_RE.test(input.name)) fail('theme.name', 'lowercase kebab-case name, max 64 characters');
  const modes: readonly ThemeMode[] = ['light', 'dark', 'high-contrast'];
  if (!modes.includes(input.mode as ThemeMode)) fail('theme.mode', '"light" | "dark" | "high-contrast"');
  const seeds = tokenMap(input.seeds ?? {}, 'theme.seeds');
  const tokens = tokenMap(input.tokens, 'theme.tokens');
  for (const required of requiredTokenNames) {
    if (!(required in tokens)) fail(`theme.tokens.${required}`, 'required token (theme completeness, SPEC section 9.2)');
  }
  for (const key of Object.keys(tokens)) {
    if (!requiredTokenNames.includes(key) && !componentTokenNames.includes(key) && !optionalTokenNames.includes(key)) fail(`theme.tokens.${key}`, 'known token name, component token (SPEC section 10.2), or optional token');
    const value = tokens[key];
    if (optionalTokenNames.includes(key) && value !== undefined && optionalTokenProblem(key, value)) fail(`theme.tokens.${key}`, optionalTokenProblem(key, value) ?? '');
  }
  if (!Array.isArray(input.contrastPairs)) fail('theme.contrastPairs', 'array');
  const kinds: readonly ContrastKind[] = ['text', 'large-text', 'non-text'];
  const contrastPairs = input.contrastPairs.map((p: unknown, i): ContrastPair => {
    const at = `theme.contrastPairs[${i}]`;
    if (!isRecord(p)) fail(at, 'object');
    const { foreground, background, backdrop, kind, usage } = p;
    if (typeof foreground !== 'string' || !(foreground in tokens)) fail(`${at}.foreground`, 'token name');
    if (typeof background !== 'string' || !(background in tokens)) fail(`${at}.background`, 'token name');
    if (backdrop !== undefined && (typeof backdrop !== 'string' || !(backdrop in tokens))) fail(`${at}.backdrop`, 'token name');
    if (!kinds.includes(kind as ContrastKind)) fail(`${at}.kind`, '"text" | "large-text" | "non-text"');
    if (typeof usage !== 'string' || usage.length > 200) fail(`${at}.usage`, 'string up to 200 characters');
    return { foreground, background, ...(typeof backdrop === 'string' ? { backdrop } : {}), kind: kind as ContrastKind, usage };
  });
  return Object.freeze({ schemaVersion: 1, name: input.name, mode: input.mode as ThemeMode, seeds, tokens, contrastPairs });
}

/** CSS declarations for a token map (custom properties prefixed `--aui-`). */
export function tokensToDeclarations(tokens: Readonly<Record<string, string>>): string {
  return Object.entries(tokens)
    .map(([k, v]) => `--aui-${k}:${v};`)
    .join('');
}

/** Theme as CSS text scoped to a selector, inside the aui.theme cascade layer. */
export function themeToCssText(theme: ThemeDefinition, selector = `[data-aui-theme="${theme.name}"]`): string {
  return `@layer aui.theme{${selector}{${tokensToDeclarations(theme.tokens)}color-scheme:${theme.mode === 'dark' ? 'dark' : 'light'};}}`;
}

function scssValue(v: string): string {
  // Quote values containing commas or quotes so SCSS treats them as single strings.
  return /[,"']/.test(v) ? `string.unquote(${JSON.stringify(v)})` : v;
}

/** SCSS maps for all given themes plus densities (SPEC section 10.6). */
export function tokensToScss(themeList: readonly ThemeDefinition[]): string {
  const lines = ['// Generated from @absoluteui/theme tokens. Do not edit.', "@use 'sass:string';", '$aui-themes: ('];
  for (const t of themeList) {
    lines.push(`  '${t.name}': (`, `    'mode': '${t.mode}',`, `    'tokens': (`);
    for (const [k, v] of Object.entries(t.tokens)) lines.push(`      '${k}': ${scssValue(v)},`);
    lines.push('    ),', '  ),');
  }
  lines.push(');', '$aui-densities: (');
  for (const [name, map] of Object.entries(densities)) {
    lines.push(`  '${name}': (`);
    for (const [k, v] of Object.entries(map)) lines.push(`    '${k}': ${scssValue(v)},`);
    lines.push('  ),');
  }
  lines.push(');', '');
  return lines.join('\n');
}

/** Design-token JSON (SPEC section 10.6, section 21.1). */
export function tokensToJson(themeList: readonly ThemeDefinition[]): string {
  return `${JSON.stringify({ schemaVersion: 1, themes: themeList, densities }, null, 2)}\n`;
}
