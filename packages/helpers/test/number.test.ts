import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';
import {
  approximatelyEqual, ceil, clamp, factorial, floor, formatBytes, formatCompact, formatCurrency, formatNumber, formatOrdinal, formatPercent, formatUnit,
  fromRoman, gcd, gcdBigInt, inRange, inverseLerp, isEven, isNegativeZero, isOdd, isPrime, isSafeNumberString, kahanSum, lcm, lcmBigInt, lerp, normalizeZero,
  numberToWords, parseBytes, parseNumber, parseNumberString, percent, percentChange, product, ratio, remap, round, roundHalfEven, roundTo, sign, sum,
  toFixedSafe, toRoman, trunc,
} from '@absoluteui/helpers/number';

const cp = (...codes: number[]): string => String.fromCodePoint(...codes);
const NBSP = cp(0xa0);
const NNBSP = cp(0x202f);

describe('number: basics', () => {
  it('clamp and inRange', () => {
    expect(clamp(15, 0, 10)).toBe(10);
    expect(clamp(-1, 0, 10)).toBe(0);
    expect(clamp(5, 0, 10)).toBe(5);
    expect(() => clamp(1, 10, 0)).toThrow(ValidationError);
    expect(inRange(10, 0, 10)).toBe(true);
    expect(inRange(10, 0, 10, { inclusive: false })).toBe(false);
    expect(inRange(10, 0, 10, { inclusive: 'min' })).toBe(false);
    expect(inRange(0, 0, 10, { inclusive: 'max' })).toBe(false);
    expect(inRange(5, 10, 0)).toBe(true);
    expect(inRange(Number.NaN, 0, 10)).toBe(false);
  });
  it('parity and sign helpers', () => {
    expect(isEven(-4)).toBe(true);
    expect(isOdd(-3)).toBe(true);
    expect(isEven(2.5)).toBe(false);
    expect(isOdd(Number.NaN)).toBe(false);
    expect(sign(-0)).toBe(0);
    expect(Object.is(sign(-0), 0)).toBe(true);
    expect(sign(-5)).toBe(-1);
    expect(sign(Number.NaN)).toBeNaN();
    expect(isNegativeZero(-0)).toBe(true);
    expect(isNegativeZero(0)).toBe(false);
    expect(Object.is(normalizeZero(-0), 0)).toBe(true);
  });
  it('percent, change, ratio', () => {
    expect(percent(1, 3, { places: 2 })).toBe(33.33);
    expect(percent(1, 0)).toBeUndefined();
    expect(percentChange(80, 100)).toBe(25);
    expect(percentChange(-100, -50)).toBe(50);
    expect(percentChange(0, 5)).toBeUndefined();
    expect(ratio(3, 4)).toBe(0.75);
    expect(ratio(1, 0)).toBeUndefined();
    expect(ratio(Infinity, 1)).toBeUndefined();
  });
  it('lerp family', () => {
    expect(lerp(10, 20, 0.25)).toBe(12.5);
    expect(lerp(0.1, 0.7, 1)).toBe(0.7);
    expect(inverseLerp(10, 20, 15)).toBe(0.5);
    expect(inverseLerp(5, 5, 7)).toBe(0);
    expect(remap(5, 0, 10, 0, 100)).toBe(50);
    expect(remap(20, 0, 10, 0, 100, { clamp: true })).toBe(100);
  });
  it('approximatelyEqual', () => {
    expect(approximatelyEqual(0.1 + 0.2, 0.3)).toBe(true);
    expect(approximatelyEqual(1e20, 1e20 + 1e5)).toBe(true);
    expect(approximatelyEqual(1, 1.001)).toBe(false);
    expect(approximatelyEqual(0, 1e-15)).toBe(true);
    expect(approximatelyEqual(Number.NaN, Number.NaN)).toBe(false);
    expect(approximatelyEqual(Infinity, Infinity)).toBe(true);
    expect(approximatelyEqual(1, 1.001, { relative: 0.01 })).toBe(true);
  });
});

describe('number: rounding', () => {
  it('is exact for decimal inputs', () => {
    expect(round(1.005, 2)).toBe(1.01);
    expect(round(-1.005, 2)).toBe(-1.01);
    expect(round(2.675, 2)).toBe(2.68);
    expect(round(1.45, 1)).toBe(1.5);
    expect(round(1234.5678, -2)).toBe(1200);
    expect(round(0.5)).toBe(1);
    expect(round(-0.5)).toBe(-1);
    expect(Object.is(round(-0.001, 2), 0)).toBe(true);
    expect(round(1e-7, 7)).toBe(1e-7);
    expect(round(1.5e-7, 7)).toBe(2e-7);
    expect(round(1e300, 20)).toBe(1e300);
    expect(round(Infinity, 2)).toBe(Infinity);
    expect(round(Number.NaN, 2)).toBeNaN();
    expect(() => round(1, 1.5)).toThrow(ValidationError);
  });
  it('half-even, floor, ceil, trunc', () => {
    expect(roundHalfEven(2.5)).toBe(2);
    expect(roundHalfEven(3.5)).toBe(4);
    expect(roundHalfEven(-2.5)).toBe(-2);
    expect(roundHalfEven(0.125, 2)).toBe(0.12);
    expect(roundHalfEven(0.135, 2)).toBe(0.14);
    expect(roundHalfEven(1.2351, 2)).toBe(1.24);
    expect(floor(1.99, 1)).toBe(1.9);
    expect(floor(-1.91, 1)).toBe(-2);
    expect(ceil(1.01, 1)).toBe(1.1);
    expect(ceil(4.35, 1)).toBe(4.4);
    expect(floor(4.35, 2)).toBe(4.35);
    expect(trunc(-1.29, 1)).toBe(-1.2);
    expect(trunc(1.29, 1)).toBe(1.2);
  });
  it('roundTo steps without drift', () => {
    expect(roundTo(1.13, 0.25)).toBe(1.25);
    expect(roundTo(0.125, 0.05)).toBe(0.15);
    expect(roundTo(0.3, 0.1)).toBe(0.3);
    expect(roundTo(7, 5)).toBe(5);
    expect(roundTo(7.5, 5)).toBe(10);
    expect(roundTo(-1.13, 0.25)).toBe(-1.25);
    expect(() => roundTo(1, 0)).toThrow(ValidationError);
    expect(() => roundTo(1, -1)).toThrow(ValidationError);
  });
  it('property: round matches a decimal-string oracle', () => {
    fc.assert(fc.property(fc.integer({ min: -10_000_000, max: 10_000_000 }), fc.integer({ min: 0, max: 4 }), (n, places) => {
      // n/1000 has at most 3 decimals; compare against toFixedSafe (BigInt based).
      const v = n / 1000;
      expect(round(v, places)).toBe(Number(toFixedSafe(v, places)));
    }));
  });
  it('property: floor <= value <= ceil', () => {
    fc.assert(fc.property(fc.double({ min: -1e9, max: 1e9, noNaN: true }), fc.integer({ min: 0, max: 6 }), (v, p) => {
      expect(floor(v, p)).toBeLessThanOrEqual(v);
      expect(ceil(v, p)).toBeGreaterThanOrEqual(v);
    }));
  });
});

describe('number: sums and integers', () => {
  it('compensated sums', () => {
    expect(kahanSum([0.1, 0.2, 0.3])).toBe(0.6);
    expect(sum([1e100, 1, -1e100])).toBe(1);
    expect(sum([])).toBe(0);
    expect(sum([Infinity, 1])).toBe(Infinity);
    expect(sum([Infinity, -Infinity])).toBeNaN();
    expect(sum(new Set([1, 2, 3]))).toBe(6);
    expect(sum(Array.from({ length: 10 }, () => 0.1))).toBe(1);
    expect(product([2, 3, 4])).toBe(24);
    expect(product([])).toBe(1);
  });
  it('gcd / lcm', () => {
    expect(gcd(12, -18)).toBe(6);
    expect(gcd(0, 0)).toBe(0);
    expect(gcd(0, 5)).toBe(5);
    expect(lcm(4, 6)).toBe(12);
    expect(lcm(0, 6)).toBe(0);
    expect(() => gcd(1.5, 2)).toThrow(ValidationError);
    expect(() => lcm(2 ** 40 + 1, 2 ** 40 - 1)).toThrow(LimitError);
    expect(gcdBigInt(12n, -18n)).toBe(6n);
    expect(lcmBigInt(2n ** 64n, 3n)).toBe(3n * 2n ** 64n);
  });
  it('property: gcd divides both and lcm*gcd = |a*b|', () => {
    fc.assert(fc.property(fc.integer({ min: -100_000, max: 100_000 }), fc.integer({ min: 1, max: 100_000 }), (a, b) => {
      const g = gcd(a, b);
      expect(Math.abs(a % g)).toBe(0);
      expect(b % g).toBe(0);
      expect(lcm(a, b) * g).toBe(Math.abs(a * b));
    }));
  });
  it('isPrime is deterministic', () => {
    const small = [2, 3, 5, 7, 11, 13, 17, 19, 23, 29, 31, 37, 41, 43, 47];
    for (let i = -3; i < 50; i++) expect(isPrime(i)).toBe(small.includes(i));
    expect(isPrime(2_147_483_647)).toBe(true);
    expect(isPrime(9_007_199_254_740_881)).toBe(true); // largest prime below 2^53
    expect(isPrime(9_007_199_254_740_991)).toBe(false); // 6361 × 69431 × 20394401
    expect(isPrime(3_215_031_751)).toBe(false); // strong pseudoprime to bases 2,3,5,7
    expect(isPrime(1_000_000_007)).toBe(true);
    expect(isPrime(2.5)).toBe(false);
    expect(() => isPrime(2n ** 127n - 1n)).toThrow(LimitError);
    expect(isPrime(18_446_744_073_709_551_557n)).toBe(true); // largest prime below 2^64
    expect(isPrime(3_825_123_056_546_413_051n)).toBe(false); // strong pseudoprime to bases up to 23
    expect(() => isPrime(2 ** 60)).toThrow(ValidationError);
  });
  it('factorial', () => {
    expect(factorial(0)).toBe(1n);
    expect(factorial(20)).toBe(2432902008176640000n);
    expect(factorial(25)).toBe(15511210043330985984000000n);
    expect(() => factorial(-1)).toThrow(ValidationError);
    expect(() => factorial(1.5)).toThrow(ValidationError);
    expect(() => factorial(10_001)).toThrow(LimitError);
  });
});

describe('number: toFixedSafe', () => {
  it('never uses exponent notation', () => {
    expect(toFixedSafe(1e21)).toBe('1000000000000000000000');
    expect(toFixedSafe(1.5e-7)).toBe('0.00000015');
    expect(toFixedSafe(-1e-7)).toBe('-0.0000001');
    expect(toFixedSafe(123.456)).toBe('123.456');
    expect(toFixedSafe(-0)).toBe('0');
    expect(toFixedSafe(1.005, 2)).toBe('1.01');
    expect(toFixedSafe(1, 3)).toBe('1.000');
    expect(toFixedSafe(-0.001, 2)).toBe('0.00');
    expect(toFixedSafe(0.5, 0)).toBe('1');
    expect(toFixedSafe(1e21, 2)).toBe('1000000000000000000000.00');
    expect(toFixedSafe(Infinity)).toBe('Infinity');
    expect(() => toFixedSafe(1, 101)).toThrow(ValidationError);
  });
  it('property: round-trips through Number', () => {
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true }), (v) => {
      const s = toFixedSafe(v);
      expect(s).not.toMatch(/e/i);
      expect(Number(s)).toBe(v === 0 ? 0 : v);
    }));
  });
});

describe('number: formatting', () => {
  it('formats numbers, currency, percent', () => {
    expect(formatNumber(1234.5, { locale: 'en-US' })).toBe('1,234.5');
    expect(formatNumber(1234.5, { locale: 'de-DE' })).toBe('1.234,5');
    expect(formatNumber('12345678901234567890.123', { locale: 'en-US', maximumFractionDigits: 3 })).toBe('12,345,678,901,234,567,890.123');
    expect(formatNumber(12n ** 20n, { locale: 'en-US' })).toBe('3,833,759,992,447,475,122,176');
    expect(formatCurrency(1234.5, 'USD', { locale: 'en-US' })).toBe('$1,234.50');
    expect(formatCurrency(1234.5, 'eur', { locale: 'de-DE' }).replace(/\s/g, ' ')).toBe('1.234,50 €');
    expect(formatCurrency(1, 'USD', { locale: 'en-US', display: 'name' })).toBe('1.00 US dollars');
    expect(() => formatCurrency(1, 'US')).toThrow(ValidationError);
    expect(formatPercent(0.256, { locale: 'en-US', maximumFractionDigits: 1 })).toBe('25.6%');
    expect(() => formatNumber(1, { locale: 'not a locale!!' })).toThrow(ValidationError);
  });
  it('compact and unit (short and long for a11y)', () => {
    expect(formatCompact(1234, { locale: 'en-US' })).toBe('1.2K');
    expect(formatCompact(1234, { locale: 'en-US', display: 'long' })).toBe('1.2 thousand');
    expect(formatUnit(5, 'kilometer', { locale: 'en-US', unitDisplay: 'long' })).toBe('5 kilometers');
    expect(formatUnit(5, 'kilometer-per-hour', { locale: 'en-US' })).toBe('5 km/h');
    expect(() => formatUnit(5, 'parsec')).toThrow(ValidationError);
  });
  it('ordinals', () => {
    const en = [1, 2, 3, 4, 11, 12, 13, 21, 22, 23, 101, 111, 1001].map((n) => formatOrdinal(n, 'en-US'));
    expect(en).toEqual(['1st', '2nd', '3rd', '4th', '11th', '12th', '13th', '21st', '22nd', '23rd', '101st', '111th', '1,001st']);
    expect(formatOrdinal(1, 'fr')).toBe('1er');
    expect(formatOrdinal(2, 'fr')).toBe('2e');
    expect(formatOrdinal(3, 'de')).toBe('3.');
    expect(formatOrdinal(1, 'sv')).toBe('1:a');
    expect(formatOrdinal(3, 'sv')).toBe('3:e');
    expect(formatOrdinal(5, 'ja')).toBe('5');
    expect(formatOrdinal(5, { locale: 'ja', suffixes: { other: '番目' } })).toBe('5番目');
  });
  it('bytes', () => {
    expect(formatBytes(2_400_000, { locale: 'en-US' })).toBe('2.4 MB');
    expect(formatBytes(2_400_000, { locale: 'en-US', style: 'long' })).toBe('2.4 megabytes');
    expect(formatBytes(1024, { locale: 'en-US', base: 1024 })).toBe('1 kB');
    expect(formatBytes(999_960, { locale: 'en-US' })).toBe('1 MB');
    expect(formatBytes(0, { locale: 'en-US', style: 'long' })).toBe('0 bytes');
    expect(formatBytes(-1500, { locale: 'en-US' })).toBe('-1.5 kB');
    expect(formatBytes(1e20, { locale: 'en-US' })).toBe('100,000 PB');
    expect(() => formatBytes(Number.NaN)).toThrow(ValidationError);
  });
});

describe('number: parsing', () => {
  it('parses per locale', () => {
    expect(parseNumber('1,234.5', { locale: 'en-US' })).toBe(1234.5);
    expect(parseNumber('1.234,5', { locale: 'de-DE' })).toBe(1234.5);
    expect(parseNumber(`1${NNBSP}234,5`, { locale: 'fr-FR' })).toBe(1234.5);
    expect(parseNumber(`1${NBSP}234,5`, { locale: 'fr-FR' })).toBe(1234.5);
    expect(parseNumber('1 234,5', { locale: 'fr-FR' })).toBe(1234.5);
    expect(parseNumber('12,34,567.8', { locale: 'en-IN', strict: true })).toBe(1234567.8);
    expect(parseNumber(`1${cp(0x2019)}234.5`, { locale: 'de-CH' })).toBe(1234.5);
    expect(parseNumber("1'234.5", { locale: 'de-CH' })).toBe(1234.5);
    expect(parseNumber(`${cp(0x2212)}5`, { locale: 'en' })).toBe(-5);
    expect(parseNumber('+5', { locale: 'en' })).toBe(5);
    expect(parseNumber('.5', { locale: 'en' })).toBe(0.5);
    expect(Object.is(parseNumber('-0', { locale: 'en' }), 0)).toBe(true);
  });
  it('maps non-Latin digits', () => {
    // Arabic-Indic digits with Arabic decimal separator (U+066B).
    const arabic = cp(0x661, 0x662, 0x663, 0x66b, 0x665);
    expect(parseNumber(arabic, { locale: 'ar-EG' })).toBe(123.5);
    // Devanagari digits under a Latin-symbol locale.
    expect(parseNumber(cp(0x967, 0x968, 0x969), { locale: 'hi-IN' })).toBe(123);
    expect(parseNumber(cp(0xff11, 0xff12), { locale: 'ja' })).toBe(12);
    // Round trip through Intl for a native-digit locale.
    const formatted = formatNumber(-98765.25, { locale: 'ar-EG' });
    expect(parseNumber(formatted, { locale: 'ar-EG' })).toBe(-98765.25);
    const bn = formatNumber(1234567.5, { locale: 'bn-IN' });
    expect(parseNumber(bn, { locale: 'bn-IN' })).toBe(1234567.5);
  });
  it('handles percent symbols', () => {
    expect(parseNumber('50%', { locale: 'en' })).toBe(0.5);
    expect(parseNumber(`12${NNBSP}%`, { locale: 'fr' })).toBe(0.12);
    expect(parseNumber('%50', { locale: 'tr' })).toBe(0.5);
    expect(parseNumber(formatPercent(-0.07, { locale: 'tr' }), { locale: 'tr' })).toBe(-0.07);
    expect(parseNumber('7%', { locale: 'en' })).toBe(0.07);
  });
  it('returns undefined for garbage', () => {
    for (const bad of ['', ' ', 'abc', '1.2.3', '12a', '--1', '1-', ',5', '1,,000', '1,', 'NaN', 'Infinity', '1e5', '0x10', '1 2 3', '%', '-']) {
      expect(parseNumber(bad, { locale: 'en-US' }), bad).toBeUndefined();
    }
    expect(parseNumber('9'.repeat(400), { locale: 'en' })).toBeUndefined();
    expect(parseNumber(42 as unknown as string)).toBeUndefined();
  });
  it('strict mode rejects misplaced group separators', () => {
    expect(parseNumber('1,2,3', { locale: 'en-US' })).toBe(123);
    expect(parseNumber('1,2,3', { locale: 'en-US', strict: true })).toBeUndefined();
    expect(parseNumber('1234,567', { locale: 'en-US', strict: true })).toBeUndefined();
    expect(parseNumber('12,34,567', { locale: 'en-US', strict: true })).toBeUndefined();
    expect(parseNumber('1,234,567.5', { locale: 'en-US', strict: true })).toBe(1234567.5);
    expect(parseNumber('1234', { locale: 'en-US', strict: true })).toBe(1234);
    expect(parseNumber('1.5', { locale: 'de', strict: true })).toBeUndefined();
    expect(parseNumber('5.', { locale: 'en', strict: true })).toBeUndefined();
    expect(parseNumber('5.', { locale: 'en' })).toBe(5);
  });
  it('parseNumberString is lossless', () => {
    expect(parseNumberString('12,345,678,901,234,567,890.123456789', { locale: 'en' })).toBe('12345678901234567890.123456789');
    expect(parseNumberString('1.234.567,891', { locale: 'de' })).toBe('1234567.891');
    expect(parseNumberString('0012.50', { locale: 'en' })).toBe('12.50');
    expect(parseNumberString('12.5%', { locale: 'en' })).toBe('0.125');
  });
  it('enforces a length limit and stays linear on adversarial input', () => {
    expect(() => parseNumber('1'.repeat(1001))).toThrow(LimitError);
    const t0 = performance.now();
    for (let i = 0; i < 200; i++) parseNumber(`${'1 '.repeat(499)}x`, { locale: 'fr' });
    expect(performance.now() - t0).toBeLessThan(2000);
  });
  it('property: parse(format(x)) round-trips across locales', () => {
    const locales = ['en-US', 'de-DE', 'fr-FR', 'en-IN', 'ar-EG', 'hi-IN', 'de-CH', 'es-ES', 'ru-RU', 'bn-IN', 'fa-IR'];
    fc.assert(fc.property(fc.integer({ min: -1e12, max: 1e12 }), fc.integer({ min: 0, max: 3 }), fc.constantFrom(...locales), (n, places, locale) => {
      const v = n / 10 ** places;
      const s = formatNumber(v, { locale, maximumFractionDigits: 20 });
      expect(parseNumber(s, { locale })).toBe(v === 0 ? 0 : v);
      expect(parseNumber(s, { locale, strict: true })).toBe(v === 0 ? 0 : v);
    }), { numRuns: 300 });
  });
  it('parseBytes', () => {
    expect(parseBytes('1.5 GB')).toBe(1_500_000_000);
    expect(parseBytes('1.5GB', { base: 1024 })).toBe(1_610_612_736);
    expect(parseBytes('1 KiB')).toBe(1024);
    expect(parseBytes('3 megabytes')).toBe(3_000_000);
    expect(parseBytes('42')).toBe(42);
    expect(parseBytes('42 B')).toBe(42);
    expect(parseBytes('1,5 MB', { locale: 'de' })).toBe(1_500_000);
    expect(parseBytes('0.5 b')).toBe(1);
    for (const bad of ['', 'GB', '-1 MB', '1 XB', '1 GBs', '5% MB', '1e3 KB']) expect(parseBytes(bad), bad).toBeUndefined();
    expect(parseBytes('99999 PB')).toBeUndefined();
    expect(() => parseBytes('1'.repeat(300))).toThrow(LimitError);
  });
  it('isSafeNumberString', () => {
    expect(isSafeNumberString('9007199254740991')).toBe(true);
    expect(isSafeNumberString('9007199254740993')).toBe(false);
    expect(isSafeNumberString('-12.5')).toBe(true);
    expect(isSafeNumberString('0.1')).toBe(true);
    expect(isSafeNumberString('.5')).toBe(true);
    expect(isSafeNumberString('123456789012.345')).toBe(true);
    expect(isSafeNumberString('1234567890123.4567')).toBe(false);
    expect(isSafeNumberString('1.50000000000000000000')).toBe(true);
    expect(isSafeNumberString('1e5')).toBe(false);
    expect(isSafeNumberString('1.')).toBe(false);
    expect(isSafeNumberString('')).toBe(false);
    expect(isSafeNumberString(`0.${'0'.repeat(350)}1`)).toBe(false);
  });
});

describe('number: words and roman', () => {
  it('numberToWords (English only)', () => {
    expect(numberToWords(0)).toBe('zero');
    expect(numberToWords(7)).toBe('seven');
    expect(numberToWords(42)).toBe('forty-two');
    expect(numberToWords(100)).toBe('one hundred');
    expect(numberToWords(105)).toBe('one hundred five');
    expect(numberToWords(105, { and: true })).toBe('one hundred and five');
    expect(numberToWords(1005, { and: true })).toBe('one thousand and five');
    expect(numberToWords(1234)).toBe('one thousand two hundred thirty-four');
    expect(numberToWords(1_000_000)).toBe('one million');
    expect(numberToWords(-1234.05)).toBe('minus one thousand two hundred thirty-four point zero five');
    expect(numberToWords(1e15)).toBe('one quadrillion');
    expect(numberToWords(999_999_999_999_999)).toBe('nine hundred ninety-nine trillion nine hundred ninety-nine billion nine hundred ninety-nine million nine hundred ninety-nine thousand nine hundred ninety-nine');
    expect(numberToWords(0.5)).toBe('zero point five');
    expect(numberToWords(-0)).toBe('zero');
    expect(() => numberToWords(1e16)).toThrow(LimitError);
    expect(() => numberToWords(Number.NaN)).toThrow(ValidationError);
  });
  it('roman numerals', () => {
    expect(toRoman(1)).toBe('I');
    expect(toRoman(4)).toBe('IV');
    expect(toRoman(1999)).toBe('MCMXCIX');
    expect(toRoman(2026)).toBe('MMXXVI');
    expect(toRoman(3999)).toBe('MMMCMXCIX');
    for (const bad of [0, 4000, -1, 1.5, Number.NaN]) expect(() => toRoman(bad)).toThrow(ValidationError);
    expect(fromRoman('mcmxcix')).toBe(1999);
    for (const bad of ['', 'IIII', 'IC', 'VX', 'MMMM', 'ABC', 'IIV', 'M'.repeat(20)]) expect(fromRoman(bad), bad).toBeUndefined();
  });
  it('property: roman round trip', () => {
    fc.assert(fc.property(fc.integer({ min: 1, max: 3999 }), (n) => {
      expect(fromRoman(toRoman(n))).toBe(n);
    }));
  });
});
