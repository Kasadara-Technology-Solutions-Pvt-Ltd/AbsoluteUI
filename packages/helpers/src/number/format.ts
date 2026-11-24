/**
 * Locale-aware number formatting on `Intl` with cached formatters (docs/PLAN-HELPERS.md section 6, section 7).
 */
import { ValidationError } from '../error/index.js';
import { assertFinite } from './internal.js';

/** A BCP 47 locale tag or a list of them; `undefined` uses the runtime default. */
export type LocaleInput = string | readonly string[] | undefined;

/** Values `Intl.NumberFormat` formats exactly, including decimal strings such as `'0.1'`. */
export type NumericValue = number | bigint | Intl.StringNumericLiteral;

const CACHE_MAX = 64;
const nfCache = new Map<string, Intl.NumberFormat>();
const prCache = new Map<string, Intl.PluralRules>();

function cacheKey(locale: LocaleInput, options: object): string {
  const loc = locale === undefined ? '' : typeof locale === 'string' ? locale : locale.join(',');
  const entries = Object.entries(options).filter(([, v]) => v !== undefined);
  entries.sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0));
  return `${loc}|${JSON.stringify(entries)}`;
}

function remember<T>(cache: Map<string, T>, key: string, make: () => T): T {
  let v = cache.get(key);
  if (v === undefined) {
    try {
      v = make();
    } catch (e) {
      throw new ValidationError('HLP_NUMBER_FORMAT_OPTIONS', 'Invalid locale or format options.', { cause: e });
    }
    if (cache.size >= CACHE_MAX) {
      const first = cache.keys().next();
      if (!first.done) cache.delete(first.value);
    }
    cache.set(key, v);
  }
  return v;
}

/** Cached `Intl.NumberFormat` (internal). */
export function numberFormat(locale: LocaleInput, options: Intl.NumberFormatOptions = {}): Intl.NumberFormat {
  return remember(nfCache, cacheKey(locale, options), () => new Intl.NumberFormat(locale, options));
}

function pluralRules(locale: LocaleInput, options: Intl.PluralRulesOptions): Intl.PluralRules {
  return remember(prCache, cacheKey(locale, options), () => new Intl.PluralRules(locale, options));
}

export interface FormatNumberOptions extends Intl.NumberFormatOptions {
  readonly locale?: LocaleInput;
}

/**
 * `Intl.NumberFormat` with a cached formatter per locale and options. Decimal strings format without float loss.
 * @example formatNumber(1234.5, { locale: 'de-DE' }) // => '1.234,5'
 */
export function formatNumber(value: NumericValue, options: FormatNumberOptions = {}): string {
  const { locale, ...rest } = options;
  return numberFormat(locale, rest).format(value);
}

export interface FormatCurrencyOptions extends Omit<FormatNumberOptions, 'style' | 'currency' | 'currencyDisplay'> {
  /** `symbol` (default, "US$" in some locales), `narrowSymbol` ("$"), `code` ("USD"), `name` ("US dollars", best for speech). */
  readonly display?: 'symbol' | 'narrowSymbol' | 'code' | 'name';
}

/**
 * Formats money in an ISO 4217 currency.
 * @example formatCurrency(1234.5, 'EUR', { locale: 'fr-FR' }) // => '1\u202f234,50\u00a0€'
 */
export function formatCurrency(value: NumericValue, currency: string, options: FormatCurrencyOptions = {}): string {
  if (!/^[a-z]{3}$/i.test(currency)) throw new ValidationError('HLP_NUMBER_CURRENCY', 'Expected a three-letter ISO 4217 currency code.');
  const { locale, display, ...rest } = options;
  return numberFormat(locale, { ...rest, style: 'currency', currency: currency.toUpperCase(), ...(display ? { currencyDisplay: display } : {}) }).format(value);
}

/**
 * Formats a ratio as a percentage (`0.256` -> "26%").
 * @example formatPercent(0.256, { maximumFractionDigits: 1 }) // => '25.6%'
 */
export function formatPercent(value: number, options: Omit<FormatNumberOptions, 'style'> = {}): string {
  const { locale, ...rest } = options;
  return numberFormat(locale, { ...rest, style: 'percent' }).format(value);
}

export interface FormatCompactOptions extends Omit<FormatNumberOptions, 'notation' | 'compactDisplay'> {
  /** `short` ("1.2K", default) or `long` ("1.2 thousand", unambiguous for screen readers). */
  readonly display?: 'short' | 'long';
}

/**
 * Compact notation.
 * @example
 * formatCompact(1234, { locale: 'en-US' }); // => '1.2K'
 * formatCompact(1234, { locale: 'en-US', display: 'long' }); // => '1.2 thousand'
 */
export function formatCompact(value: NumericValue, options: FormatCompactOptions = {}): string {
  const { locale, display = 'short', ...rest } = options;
  return numberFormat(locale, { ...rest, notation: 'compact', compactDisplay: display }).format(value);
}

export interface FormatUnitOptions extends Omit<FormatNumberOptions, 'style' | 'unit' | 'unitDisplay'> {
  /** `short` (default, "5 km"), `narrow` ("5km"), `long` ("5 kilometers"). */
  readonly unitDisplay?: 'short' | 'narrow' | 'long';
}

/**
 * Formats with an ECMA-402 sanctioned unit (or a `-per-` compound such as `kilometer-per-hour`).
 * @example formatUnit(5, 'kilometer', { unitDisplay: 'long' }) // => '5 kilometers'
 */
export function formatUnit(value: NumericValue, unit: string, options: FormatUnitOptions = {}): string {
  const { locale, unitDisplay = 'short', ...rest } = options;
  return numberFormat(locale, { ...rest, style: 'unit', unit, unitDisplay }).format(value);
}

type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

/** Built-in ordinal suffixes by language. Other languages print the number without a suffix. */
const ORDINAL_SUFFIXES: Readonly<Record<string, Partial<Record<PluralCategory, string>>>> = {
  en: { one: 'st', two: 'nd', few: 'rd', other: 'th' },
  fr: { one: 'er', other: 'e' },
  de: { other: '.' },
  nl: { other: 'e' },
  es: { other: '\u00ba' },
  it: { other: '\u00ba' },
  pt: { other: '\u00ba' },
  sv: { one: ':a', other: ':e' },
  da: { other: '.' },
  nb: { other: '.' },
  fi: { other: '.' },
  pl: { other: '.' },
  cs: { other: '.' },
};

export interface FormatOrdinalOptions {
  readonly locale?: LocaleInput;
  /** Suffix per `Intl.PluralRules` ordinal category; overrides the built-in table. */
  readonly suffixes?: Partial<Record<PluralCategory, string>>;
}

/**
 * Ordinal number ("1st", "2nd"). The category comes from `Intl.PluralRules({ type: 'ordinal' })`;
 * suffixes are built in for en, fr, de, nl, es, it, pt, sv, da, nb, fi, pl, cs. Other languages
 * (whose ordinals depend on grammatical gender or case) return the plain number unless `suffixes` is given.
 * @example
 * formatOrdinal(22, 'en'); // => '22nd'
 * formatOrdinal(1, 'fr'); // => '1er'
 */
export function formatOrdinal(n: number, localeOrOptions?: string | FormatOrdinalOptions): string {
  assertFinite(n);
  const opts: FormatOrdinalOptions = typeof localeOrOptions === 'string' ? { locale: localeOrOptions } : (localeOrOptions ?? {});
  const rules = pluralRules(opts.locale, { type: 'ordinal' });
  const lang = rules.resolvedOptions().locale.split('-')[0] ?? 'en';
  const table = opts.suffixes ?? ORDINAL_SUFFIXES[lang] ?? {};
  const category = rules.select(n);
  const suffix = table[category] ?? table.other ?? '';
  return `${numberFormat(opts.locale).format(n)}${suffix}`;
}

const BYTE_UNITS = ['byte', 'kilobyte', 'megabyte', 'gigabyte', 'terabyte', 'petabyte'] as const;

export interface FormatBytesOptions {
  readonly locale?: LocaleInput;
  /** 1000 (SI, default) or 1024. Intl has no IEC units, so 1024 still prints "KB"/"MB" (JEDEC convention). */
  readonly base?: 1000 | 1024;
  /** `short` ("2.4 MB", default), `narrow`, or `long` ("2.4 megabytes", for screen readers). */
  readonly style?: 'short' | 'narrow' | 'long';
  /** Default 1. */
  readonly maximumFractionDigits?: number;
}

/**
 * Human-readable byte size through `Intl` units.
 * @example
 * formatBytes(2_400_000, { locale: 'en-US' }); // => '2.4 MB'
 * formatBytes(2_400_000, { locale: 'en-US', style: 'long' }); // => '2.4 megabytes'
 */
export function formatBytes(bytes: number, options: FormatBytesOptions = {}): string {
  assertFinite(bytes);
  const { locale, base = 1000, style = 'short', maximumFractionDigits = 1 } = options;
  if (![1000, 1024].includes(base)) throw new ValidationError('HLP_NUMBER_BYTES_BASE', 'The base must be 1000 or 1024.');
  const abs = Math.abs(bytes);
  let exp = abs < 1 ? 0 : Math.min(BYTE_UNITS.length - 1, Math.floor(Math.log(abs) / Math.log(base)));
  if (exp > 0 && abs < base ** exp) exp--; // guard log rounding
  let scaled = abs / base ** exp;
  const f = 10 ** maximumFractionDigits;
  if (Math.round(scaled * f) / f >= base && exp < BYTE_UNITS.length - 1) {
    exp++;
    scaled = abs / base ** exp;
  }
  const unit = BYTE_UNITS[exp] ?? 'byte';
  return formatUnit(Math.sign(bytes) * scaled, unit, { locale, unitDisplay: style, maximumFractionDigits });
}
