/**
 * Number helpers: exact decimal rounding, compensated sums, integer math, locale-aware
 * parsing and formatting (docs/PLAN-HELPERS.md section 2). Randomness lives in `random`.
 */
export { clamp, inRange, round, roundHalfEven, floor, ceil, trunc, roundTo, isEven, isOdd, sign, isNegativeZero, normalizeZero, percent, percentChange, ratio, lerp, inverseLerp, remap, approximatelyEqual, kahanSum, sum, product, gcd, lcm, gcdBigInt, lcmBigInt, isPrime, factorial, MAX_FACTORIAL, toFixedSafe } from './core.js';
export type { InRangeOptions, PercentOptions, RemapOptions, ApproxOptions } from './core.js';
export { formatNumber, formatCurrency, formatPercent, formatCompact, formatUnit, formatOrdinal, formatBytes } from './format.js';
export type { LocaleInput, NumericValue, FormatNumberOptions, FormatCurrencyOptions, FormatCompactOptions, FormatUnitOptions, FormatOrdinalOptions, FormatBytesOptions } from './format.js';
export { parseNumber, parseNumberString, parseBytes, isSafeNumberString, MAX_NUMBER_TEXT } from './parse.js';
export type { ParseNumberOptions, ParseBytesOptions } from './parse.js';
export { numberToWords, toRoman, fromRoman } from './words.js';
export type { NumberToWordsOptions } from './words.js';
