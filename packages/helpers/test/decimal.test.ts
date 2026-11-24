import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { HelperError, LimitError, ValidationError, isHelperError } from '@absoluteui/helpers/error';
import { Decimal, compareDecimals, decimal, formatDecimal, fromMinorUnits, isDecimal, maxDecimal, minDecimal, parseDecimal, sumDecimals, type RoundingMode } from '@absoluteui/helpers/decimal';

const s = (d: Decimal): string => d.toString();

/** Arbitrary decimal as (unscaled bigint, scale). */
const arbDec = fc.tuple(fc.bigInt({ min: -(10n ** 30n), max: 10n ** 30n }), fc.integer({ min: 0, max: 12 })).map(([u, sc]) => new Decimal(u, sc));

describe('decimal: construction and parsing', () => {
  it('parses strings strictly', () => {
    expect(s(decimal('19.99'))).toBe('19.99');
    expect(s(decimal('-0.50'))).toBe('-0.50');
    expect(s(decimal('+7'))).toBe('7');
    expect(s(decimal('-0'))).toBe('0');
    expect(s(decimal('000123.4500'))).toBe('123.4500');
    for (const bad of ['', ' 1', '1 ', '1.', '.5', '1e5', '1,000', 'abc', '0x10', '1..2', 'Infinity', 'NaN', '--1', '1_000']) {
      expect(() => decimal(bad), bad).toThrow(ValidationError);
      expect(parseDecimal(bad), bad).toBeUndefined();
    }
  });
  it('accepts exponents and locale grouping only with options', () => {
    expect(s(decimal('1e5', { allowExponent: true }))).toBe('100000');
    expect(s(decimal('1.5E-3', { allowExponent: true }))).toBe('0.0015');
    expect(s(decimal('1,000.25', { locale: 'en-US' }))).toBe('1000.25');
    expect(s(decimal('1.234.567,891', { locale: 'de-DE' }))).toBe('1234567.891');
    expect(() => decimal('1,2,3', { locale: 'en-US' })).toThrow(ValidationError);
    expect(() => decimal('5%', { locale: 'en-US' })).toThrow(ValidationError);
  });
  it('converts numbers via their shortest representation', () => {
    expect(s(decimal(0.1))).toBe('0.1');
    expect(s(decimal(0.1 + 0.2))).toBe('0.30000000000000004');
    expect(s(decimal(1e21))).toBe('1000000000000000000000');
    expect(s(decimal(1.5e-7))).toBe('0.00000015');
    expect(s(decimal(-0))).toBe('0');
    expect(s(decimal(12345678901234567890n))).toBe('12345678901234567890');
    expect(() => decimal(Number.NaN)).toThrow(ValidationError);
    expect(() => decimal(Infinity)).toThrow(ValidationError);
    expect(() => decimal({} as unknown as string)).toThrow(ValidationError);
  });
  it('applies scale and rounding on creation', () => {
    expect(s(decimal('2.345', { scale: 2 }))).toBe('2.35');
    expect(s(decimal('2.345', { scale: 2, rounding: 'half-even' }))).toBe('2.34');
    expect(s(decimal('2', { scale: 3 }))).toBe('2.000');
  });
  it('enforces digit and scale limits', () => {
    expect(() => decimal('1'.repeat(1001))).toThrow(LimitError);
    expect(() => decimal('1'.repeat(3000))).toThrow(LimitError);
    expect(() => decimal(`0.${'1'.repeat(1001)}`)).toThrow(LimitError);
    expect(() => decimal('1e2000', { allowExponent: true })).toThrow(LimitError);
    expect(() => parseDecimal('1'.repeat(1001))).toThrow(LimitError);
    expect(() => new Decimal(1n, -1)).toThrow(ValidationError);
    expect(() => new Decimal(1n, 1.5)).toThrow(ValidationError);
    expect(() => decimal('9'.repeat(600)).multiply('9'.repeat(600))).toThrow(LimitError);
    const t0 = performance.now();
    expect(parseDecimal(`${'1'.repeat(1000)}x`)).toBeUndefined();
    expect(performance.now() - t0).toBeLessThan(200);
  });
  it('is immutable', () => {
    const d = decimal('1.5');
    expect(Object.isFrozen(d)).toBe(true);
    expect(() => {
      (d as unknown as { scale: number }).scale = 3;
    }).toThrow(TypeError);
    d.add(1);
    expect(s(d)).toBe('1.5');
    expect(isDecimal(d)).toBe(true);
    expect(isDecimal('1.5')).toBe(false);
  });
});

describe('decimal: arithmetic', () => {
  it('adds, subtracts, multiplies exactly', () => {
    expect(s(decimal('0.1').add('0.2'))).toBe('0.3');
    expect(s(decimal('1').subtract('0.9'))).toBe('0.1');
    expect(s(decimal('1.10').add('2.205'))).toBe('3.305');
    expect(s(decimal('19.99').multiply(3))).toBe('59.97');
    expect(s(decimal('1.5').multiply('1.5'))).toBe('2.25');
    expect(s(decimal('1.005').multiply('1.1', { scale: 2 }))).toBe('1.11');
    expect(s(decimal('-2.5').negate())).toBe('2.5');
    expect(s(decimal('-2.5').abs())).toBe('2.5');
  });
  it('divides with scale and rounding', () => {
    expect(s(decimal(1).divide(3, { scale: 4 }))).toBe('0.3333');
    expect(s(decimal(2).divide(3, { scale: 4 }))).toBe('0.6667');
    expect(s(decimal(1).divide(3))).toBe(`0.${'3'.repeat(20)}`);
    expect(s(decimal('10').divide('4', { scale: 0, rounding: 'half-even' }))).toBe('2');
    expect(s(decimal('-10').divide('4', { scale: 0 }))).toBe('-3');
    expect(s(decimal('1.23').divide('0.01', { scale: 0 }))).toBe('123');
    expect(s(decimal('7').divide('-2', { scale: 0, rounding: 'floor' }))).toBe('-4');
    let caught: unknown;
    try {
      decimal(1).divide('0.00');
    } catch (e) {
      caught = e;
    }
    expect(caught).toBeInstanceOf(HelperError);
    expect(isHelperError(caught, 'HLP_DECIMAL_DIVIDE_BY_ZERO')).toBe(true);
  });
  it('rounds in every mode', () => {
    const cases: Record<RoundingMode, [string, string, string, string, string, string]> = {
      // inputs:        2.5    -2.5   2.4    -2.6   2.51   3.5
      'half-up': ['3', '-3', '2', '-3', '3', '4'],
      'half-even': ['2', '-2', '2', '-3', '3', '4'],
      'half-down': ['2', '-2', '2', '-3', '3', '3'],
      up: ['3', '-3', '3', '-3', '3', '4'],
      down: ['2', '-2', '2', '-2', '2', '3'],
      ceiling: ['3', '-2', '3', '-2', '3', '4'],
      floor: ['2', '-3', '2', '-3', '2', '3'],
    };
    const inputs = ['2.5', '-2.5', '2.4', '-2.6', '2.51', '3.5'];
    for (const [mode, expected] of Object.entries(cases) as [RoundingMode, string[]][]) {
      expect(inputs.map((x) => s(decimal(x).round(0, mode))), mode).toEqual(expected);
    }
    expect(s(decimal('1.5').round(3))).toBe('1.500');
    expect(decimal('1.005').toFixed(2)).toBe('1.01');
    expect(s(decimal('1.500').normalize())).toBe('1.5');
    expect(s(decimal('100').normalize())).toBe('100');
  });
  it('compares regardless of scale', () => {
    expect(decimal('1.0').compare('1')).toBe(0);
    expect(decimal('1.50').equals('1.5')).toBe(true);
    expect(decimal('-1').lt('0.001')).toBe(true);
    expect(decimal(2).gt(1)).toBe(true);
    expect(decimal(2).gte(2)).toBe(true);
    expect(decimal(2).lte(2)).toBe(true);
    expect(decimal('0.00').isZero()).toBe(true);
    expect(decimal('-0.01').isNegative()).toBe(true);
    expect(decimal('0.01').isPositive()).toBe(true);
    expect(['2', '10', '1.5', '-3'].map((x) => decimal(x)).sort(compareDecimals).map(s)).toEqual(['-3', '1.5', '2', '10']);
    expect(s(sumDecimals(['0.1', '0.2', 0.3]))).toBe('0.6');
    expect(s(sumDecimals([]))).toBe('0');
    expect(minDecimal('2', '1.5')?.toString()).toBe('1.5');
    expect(maxDecimal('2', '10')?.toString()).toBe('10');
    expect(minDecimal()).toBeUndefined();
  });
  it('converts out', () => {
    expect(decimal('0.1').toNumber()).toBe(0.1);
    expect(decimal('12.345').toMinorUnits(2)).toBe(1235n);
    expect(decimal('12').toMinorUnits(0)).toBe(12n);
    expect(s(fromMinorUnits(1999n, 2))).toBe('19.99');
    expect(s(fromMinorUnits(-5, 3))).toBe('-0.005');
    expect(() => fromMinorUnits(1.5)).toThrow(ValidationError);
    expect(JSON.stringify({ a: decimal('1.10') })).toBe('{"a":"1.10"}');
    const d250: object = decimal('2.50');
    expect(`[${d250 as unknown as string}]`).toBe('[2.50]');
    expect(String(decimal('3'))).toBe('3');
    const coerce = (x: unknown): number => Number(x);
    expect(() => coerce(decimal('1'))).toThrow(HelperError);
  });
  it('percentages', () => {
    expect(s(decimal('200').percent('7.5'))).toBe('15.000');
    expect(s(decimal('19.99').percent(15, { scale: 2 }))).toBe('3.00');
    expect(s(decimal(15).percentageOf(200, { scale: 1 }))).toBe('7.5');
  });
});

describe('decimal: allocation', () => {
  it('allocates with largest remainder and preserves the sum', () => {
    expect(decimal('100').allocate([1, 1, 1], { scale: 2 }).map(s)).toEqual(['33.34', '33.33', '33.33']);
    expect(decimal('10.00').split(3).map(s)).toEqual(['3.34', '3.33', '3.33']);
    expect(decimal('-10.00').split(3).map(s)).toEqual(['-3.34', '-3.33', '-3.33']);
    expect(decimal('0.05').allocate([3, 7]).map(s)).toEqual(['0.02', '0.03']);
    expect(decimal('100').allocate(['0.5', '0.25', '0.25']).map(s)).toEqual(['50', '25', '25']);
    expect(decimal('1').allocate([0, 1, 0]).map(s)).toEqual(['0', '1', '0']);
    expect(decimal('0.01').split(3).map(s)).toEqual(['0.01', '0.00', '0.00']);
    expect(() => decimal('1.005').allocate([1, 1], { scale: 2 })).toThrow(ValidationError);
    expect(() => decimal('1').allocate([])).toThrow(ValidationError);
    expect(() => decimal('1').allocate([0, 0])).toThrow(ValidationError);
    expect(() => decimal('1').allocate([1, -1])).toThrow(ValidationError);
    expect(() => decimal('1').split(0)).toThrow(ValidationError);
  });
  it('property: allocation sums exactly and parts differ by at most one unit for equal ratios', () => {
    fc.assert(fc.property(arbDec, fc.array(fc.integer({ min: 0, max: 1000 }), { minLength: 1, maxLength: 20 }).filter((r) => r.some((x) => x > 0)), (amount, ratios) => {
      const parts = amount.allocate(ratios);
      expect(sumDecimals(parts).equals(amount)).toBe(true);
      ratios.forEach((r, i) => {
        if (r === 0) expect(parts[i]?.isZero()).toBe(true);
      });
    }));
    fc.assert(fc.property(arbDec, fc.integer({ min: 1, max: 50 }), (amount, n) => {
      const parts = amount.split(n);
      expect(sumDecimals(parts).equals(amount)).toBe(true);
      const units = parts.map((p) => p.unscaled);
      const max = units.reduce((a, b) => (a > b ? a : b));
      const min = units.reduce((a, b) => (a < b ? a : b));
      expect(max - min <= 1n).toBe(true);
    }));
  });
});

describe('decimal: algebraic properties', () => {
  it('(a + b) - b === a', () => {
    fc.assert(fc.property(arbDec, arbDec, (a, b) => {
      expect(a.add(b).subtract(b).equals(a)).toBe(true);
    }));
  });
  it('addition is associative and commutative; multiplication distributes', () => {
    fc.assert(fc.property(arbDec, arbDec, arbDec, (a, b, c) => {
      expect(a.add(b).add(c).equals(a.add(b.add(c)))).toBe(true);
      expect(a.add(b).equals(b.add(a))).toBe(true);
      expect(a.multiply(b.add(c)).equals(a.multiply(b).add(a.multiply(c)))).toBe(true);
    }));
  });
  it('compare agrees with a BigInt oracle', () => {
    fc.assert(fc.property(arbDec, arbDec, (a, b) => {
      const sc = Math.max(a.scale, b.scale);
      const x = a.unscaled * 10n ** BigInt(sc - a.scale);
      const y = b.unscaled * 10n ** BigInt(sc - b.scale);
      expect(a.compare(b)).toBe(x < y ? -1 : x > y ? 1 : 0);
      expect(b.compare(a)).toBe(-a.compare(b));
    }));
  });
  it('toString round-trips and matches Number for small values', () => {
    fc.assert(fc.property(arbDec, (a) => {
      expect(decimal(s(a)).equals(a)).toBe(true);
      expect(decimal(s(a)).scale).toBe(a.scale);
    }));
    fc.assert(fc.property(fc.double({ noNaN: true, noDefaultInfinity: true, min: -1e15, max: 1e15 }), (v) => {
      expect(decimal(v).toNumber()).toBe(v === 0 ? 0 : v);
    }));
  });
  it('division result is within half a unit (half-up)', () => {
    fc.assert(fc.property(arbDec, arbDec.filter((b) => !b.isZero()), (a, b) => {
      const q = a.divide(b, { scale: 6 });
      // |q*b - a| <= 0.5e-6 * |b|
      const err = q.multiply(b).subtract(a).abs();
      expect(err.lte(b.abs().multiply('0.0000005'))).toBe(true);
    }));
  });
});

describe('decimal: formatting', () => {
  it('formats exactly via Intl string input', () => {
    expect(formatDecimal(decimal('1234567890123456789.25'), { locale: 'en-US' })).toBe('1,234,567,890,123,456,789.25');
    expect(formatDecimal('0.10', { locale: 'de-DE' })).toBe('0,10');
    expect(formatDecimal('1234.5', { locale: 'en-US', currency: 'USD' })).toBe('$1,234.50');
    expect(formatDecimal('1.005', { locale: 'en-US', currency: 'USD' })).toBe('$1.01');
    expect(formatDecimal('1.005', { locale: 'en-US', maximumFractionDigits: 2, roundingMode: 'halfEven' })).toBe('1');
    expect(formatDecimal('12', { locale: 'en-US', currency: 'EUR', display: 'code' }).replace(/\s/g, ' ')).toBe('EUR 12.00');
  });
});
