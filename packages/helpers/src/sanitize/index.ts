/**
 * Data cleaning: record normalization, de-duplication, type coercion, invisible-character and
 * file-name sanitizing, PII masking and redaction (docs/PLAN-HELPERS.md section 2, section 5).
 * HTML sanitizing is out of scope; it stays in `@absoluteui/core`.
 */
export {
  trimStrings,
  removeNullish,
  removeEmpty,
  normalizeRecord,
  dedupeBy,
  cleanRecords,
  coerceRecordTypes,
  type DeepOptions,
  type RemoveEmptyOptions,
  type NormalizeRecordRules,
  type DedupeOptions,
  type CleanRecordsOptions,
  type CoerceType,
  type CoerceOptions,
} from './records.js';
export {
  stripInvisible,
  stripControl,
  normalizeUnicode,
  collapseWhitespace,
  safeFileName,
  normalizeEmail,
  normalizePhone,
  sanitizeSearchQuery,
  truncateForLog,
  type StripInvisibleOptions,
  type SafeFileNameOptions,
  type NormalizeEmailOptions,
  type NormalizePhoneOptions,
  type SanitizeSearchQueryOptions,
} from './text.js';
export { maskPii, redact, DEFAULT_REDACT_KEYS, type MaskPiiOptions, type RedactOptions } from './pii.js';
