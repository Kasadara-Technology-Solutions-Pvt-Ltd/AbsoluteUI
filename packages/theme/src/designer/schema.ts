/**
 * Versioned JSON Schema for theme JSON (SPEC section 10.7), generated from the same token
 * lists the validator uses, so the published schema cannot drift. `importTheme()` is
 * authoritative; the schema serves editors and external tooling.
 */
import { componentTokenNames } from '../component-tokens.js';
import { optionalTokenNames } from '../optional-tokens.js';
import { requiredTokenNames } from '../tokens.js';
import { FAMILY_SCHEMA_VERSION, RESPONSIVE_TOKEN_RE, breakpointNames, densityNames, familyModes } from './model.js';

export const THEME_SCHEMA_ID = `https://absoluteui.dev/schema/theme-family-v${String(FAMILY_SCHEMA_VERSION)}.json`;

/** Mirrors `isSafeTokenValue()` (no url(), braces, semicolons, or angle brackets). */
const VALUE = {
  type: 'string',
  minLength: 1,
  maxLength: 200,
  pattern: '^(?![\\s\\S]*\\b(?:url|expression|image-set|image|element|attr|env)\\s*\\()[a-zA-Z0-9#%.,()\\s"\'/+-]+$',
};

const closedMap = (names: readonly string[], required: boolean, extra: readonly string[] = []): Record<string, unknown> => ({
  type: 'object',
  properties: Object.fromEntries([...names, ...extra].map((n) => [n, { $ref: '#/$defs/value' }])),
  additionalProperties: false,
  ...(required ? { required: [...names] } : {}),
});

export function themeJsonSchema(): Record<string, unknown> {
  const responsiveNames = requiredTokenNames.filter((n) => RESPONSIVE_TOKEN_RE.test(n));
  return {
    $schema: 'https://json-schema.org/draft/2020-12/schema',
    $id: THEME_SCHEMA_ID,
    title: `AbsoluteUI theme family (schema version ${String(FAMILY_SCHEMA_VERSION)})`,
    type: 'object',
    required: ['schemaVersion', 'name', 'version', 'modes'],
    additionalProperties: false,
    properties: {
      schemaVersion: { const: FAMILY_SCHEMA_VERSION },
      name: { type: 'string', pattern: '^[a-z][a-z0-9-]{0,63}$' },
      version: { type: 'string', pattern: '^(0|[1-9]\\d*)\\.(0|[1-9]\\d*)\\.(0|[1-9]\\d*)(?:-[0-9A-Za-z-]+(?:\\.[0-9A-Za-z-]+)*)?$' },
      description: { type: 'string', maxLength: 500, pattern: '^[^<>]*$' },
      author: { type: 'string', maxLength: 200, pattern: '^[^<>]*$' },
      fonts: {
        type: 'array',
        maxItems: 10,
        items: {
          type: 'object',
          additionalProperties: false,
          required: ['provider', 'family', 'stylesheet'],
          properties: {
            provider: { enum: ['google', 'bunny', 'custom'] },
            family: { type: 'string', pattern: '^[A-Za-z0-9][A-Za-z0-9 ]{0,63}$' },
            stylesheet: { type: 'string', pattern: '^https://[^\\s"\'<>\\\\]+$', maxLength: 1600 },
          },
        },
      },
      seeds: { type: 'object', additionalProperties: { $ref: '#/$defs/value' }, propertyNames: { pattern: '^[a-z][a-z0-9-]{0,63}$' } },
      modes: {
        type: 'object',
        additionalProperties: false,
        required: [...familyModes],
        properties: Object.fromEntries(familyModes.map((m) => [m, { $ref: '#/$defs/mode' }])),
      },
      densities: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(densityNames.map((d) => [d, closedMap(requiredTokenNames, false)])),
      },
      responsive: {
        type: 'object',
        additionalProperties: false,
        properties: Object.fromEntries(breakpointNames.map((b) => [b, closedMap(responsiveNames, false)])),
      },
    },
    $defs: {
      value: VALUE,
      mode: {
        type: 'object',
        additionalProperties: false,
        required: ['tokens'],
        properties: { tokens: closedMap(requiredTokenNames, true, optionalTokenNames), componentTokens: closedMap(componentTokenNames, false) },
      },
    },
  };
}
