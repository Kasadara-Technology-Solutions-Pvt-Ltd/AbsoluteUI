/**
 * Theme Designer engine (SPEC section 10), `@absoluteui/theme/designer`: theme families
 * (schema version 2), seed-to-role derivation, compliance scoring, exporters, and
 * validated import. Pure functions with no DOM access; runtime-only apps never load it.
 */
export {
  FAMILY_SCHEMA_VERSION,
  familyModes,
  densityNames,
  breakpoints,
  breakpointNames,
  RESPONSIVE_TOKEN_RE,
  modeThemeName,
  resolveToken,
  familyToThemes,
  builtInFamily,
  componentTokenComponents,
} from './model.js';
export type { ThemeFamily, FamilyMode, DensityName, BreakpointName } from './model.js';
export { rgbToOklch, oklchToRgb, parseOklch, solveLightness, toHex, toRgba } from './color.js';
export type { Oklch } from './color.js';
export { defaultSeeds, seedNames, normalizeSeeds, defaultFoundation, deriveMode, deriveFamily, overriddenTokens, ratioOf } from './derive.js';
export type { ThemeSeeds, DeriveFamilyOptions } from './derive.js';
export { assessCompliance, categoryLabels, toPx, toMs } from './compliance.js';
export type { ComplianceCategory, ComplianceFinding, ComplianceReport, CategorySummary, RuleStatus } from './compliance.js';
export { toThemeJson, toCss, toFontsCss, toScss, toTypeScript, toDtcg, dtcgPath, packageFiles, toPackageZip, componentOverrides } from './export.js';
export type { PackageOptions, PackageFile } from './export.js';
export { importTheme, importThemeValue, assertValidFamily, MAX_IMPORT_BYTES } from './import.js';
export type { ImportIssue, ImportResult } from './import.js';
export { themeJsonSchema, THEME_SCHEMA_ID } from './schema.js';
export { createZip, readZip, crc32 } from './zip.js';
export type { ZipEntry } from './zip.js';
export { tokenUsage } from './token-usage.js';
