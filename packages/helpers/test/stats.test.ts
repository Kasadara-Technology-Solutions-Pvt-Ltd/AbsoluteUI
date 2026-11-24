import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';
import {
  correlation, covariance, cumulativeSum, extent, frequencies, geometricMean, harmonicMean, histogram, iqr, kurtosis, linearRegression, mean, median, mode,
  movingAverage, normalize, outliers, percentile, quantile, quantiles, quartiles, rangeOf, skewness, standardize, stdDev, variance, weightedMean, zScore,
} from '@absoluteui/helpers/stats';

const close = (a: number | undefined, b: number, eps = 1e-9): void => {
  expect(a).toBeDefined();
  expect(Math.abs((a ?? Number.NaN) - b)).toBeLessThanOrEqual(eps * Math.max(1, Math.abs(b)));
};

describe('stats: empty input returns undefined', () => {
  it('never NaN', () => {
    for (const fn of [mean, median, mode, extent, rangeOf, variance, stdDev, quartiles, iqr, outliers, standardize, normalize, geometricMean, harmonicMean, skewness, kurtosis]) {
      expect(fn([]), fn.name).toBeUndefined();
    }
    expect(percentile([], 50)).toBeUndefined();
    expect(quantiles([], 4)).toBeUndefined();
    expect(weightedMean([], [])).toBeUndefined();
    expect(covariance([], [])).toBeUndefined();
    expect(correlation([], [])).toBeUndefined();
    expect(linearRegression([], [])).toBeUndefined();
    expect(histogram([])).toEqual([]);
    expect(movingAverage([], 2)).toEqual([]);
    expect(cumulativeSum([])).toEqual([]);
  });
});

describe('stats: central tendency', () => {
  it('mean, weighted mean, median, mode', () => {
    expect(mean([1, 2, 3, 4])).toBe(2.5);
    close(mean([0.1, 0.2, 0.3]), 0.2, 1e-15);
    expect(weightedMean([80, 90], [1, 3])).toBe(87.5);
    expect(weightedMean([1, 2], [0, 0])).toBeUndefined();
    expect(() => weightedMean([1, 2], [1])).toThrow(ValidationError);
    expect(() => weightedMean([1, 2], [1, -1])).toThrow(ValidationError);
    expect(median([3, 1, 4, 2])).toBe(2.5);
    expect(median([3, 1, 2])).toBe(2);
    expect(median([5])).toBe(5);
    expect(mode([1, 2, 2, 3, 3])).toEqual([2, 3]);
    expect(mode([4, 1, 1])).toEqual([1]);
    expect(mode([3, 2, 1])).toEqual([1, 2, 3]);
  });
  it('does not mutate input', () => {
    const data = [3, 1, 2];
    median(data);
    percentile(data, 50);
    expect(data).toEqual([3, 1, 2]);
  });
  it('geometric and harmonic means', () => {
    close(geometricMean([1, 4, 16]), 4);
    expect(geometricMean([0, 5])).toBe(0);
    expect(geometricMean([-1, 5])).toBeUndefined();
    close(harmonicMean([1, 4, 4]), 2);
    expect(harmonicMean([0, 1])).toBe(0);
    expect(harmonicMean([-1, 1])).toBeUndefined();
  });
});

describe('stats: dispersion', () => {
  const data = [2, 4, 4, 4, 5, 5, 7, 9];
  it('variance and standard deviation', () => {
    expect(variance(data, { population: true })).toBe(4);
    expect(stdDev(data, { population: true })).toBe(2);
    close(variance(data), 32 / 7);
    expect(variance([5])).toBeUndefined();
    expect(variance([5], { population: true })).toBe(0);
    // Welford stays accurate with a huge offset.
    close(variance(data.map((x) => x + 1e9), { population: true }), 4, 1e-6);
  });
  it('extent and range without spreading', () => {
    const big = Array.from({ length: 300_000 }, (_, i) => i);
    expect(extent(big)).toEqual([0, 299_999]);
    expect(rangeOf([3, 1, 4])).toBe(3);
  });
  it('non-finite handling', () => {
    expect(() => mean([1, Number.NaN])).toThrow(ValidationError);
    expect(() => mean([1, Infinity])).toThrow(ValidationError);
    expect(mean([1, Number.NaN, 3, Infinity], { nonFinite: 'ignore' })).toBe(2);
    expect(correlation([1, 2, Number.NaN, 3], [2, 4, 5, 6], { nonFinite: 'ignore' })).toBe(1);
    expect(() => correlation([1, Number.NaN], [1, 2])).toThrow(ValidationError);
  });
});

describe('stats: percentiles', () => {
  const d = [1, 2, 3, 4, 5];
  it('matches Excel PERCENTILE.INC for linear', () => {
    expect(percentile(d, 90)).toBe(4.6);
    expect(percentile([15, 20, 35, 40, 50], 40)).toBe(29);
    expect(percentile(d, 0)).toBe(1);
    expect(percentile(d, 100)).toBe(5);
    expect(quantile([1, 2, 3, 4], 0.25)).toBe(1.75);
  });
  it('supports NumPy methods', () => {
    const v = [1, 2, 3, 4];
    expect(percentile(v, 50, { method: 'lower' })).toBe(2);
    expect(percentile(v, 50, { method: 'higher' })).toBe(3);
    expect(percentile(v, 50, { method: 'midpoint' })).toBe(2.5);
    expect(percentile(v, 50, { method: 'nearest' })).toBe(3); // h = 1.5 rounds to even index 2
    expect(percentile([1, 2, 3, 4, 5, 6], 50, { method: 'nearest' })).toBe(3); // h = 2.5 → index 2
    expect(percentile(v, 40, { method: 'nearest' })).toBe(2);
  });
  it('validates p', () => {
    expect(() => percentile(d, 101)).toThrow(ValidationError);
    expect(() => percentile(d, -1)).toThrow(ValidationError);
    expect(() => percentile(d, Number.NaN)).toThrow(ValidationError);
    expect(() => quantile(d, 1.5)).toThrow(ValidationError);
    expect(() => quantiles(d, 1)).toThrow(ValidationError);
  });
  it('quantiles, quartiles, iqr, outliers', () => {
    expect(quantiles(d, 4)).toEqual([2, 3, 4]);
    expect(quartiles(d)).toEqual([2, 3, 4]);
    expect(iqr(d)).toBe(2);
    const o = outliers([1, 2, 3, 4, 100, -50]);
    expect(o?.outliers).toEqual([100, -50]);
    expect(o?.indexes).toEqual([4, 5]);
    expect(outliers([1, 2, 3, 4, 5])?.outliers).toEqual([]);
  });
  it('property: percentile is monotonic and bounded', () => {
    fc.assert(fc.property(fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 50 }), fc.double({ min: 0, max: 100, noNaN: true }), fc.double({ min: 0, max: 100, noNaN: true }), (v, p1, p2) => {
      const [lo, hi] = p1 <= p2 ? [p1, p2] : [p2, p1];
      const a = percentile(v, lo) ?? 0;
      const b = percentile(v, hi) ?? 0;
      expect(a).toBeLessThanOrEqual(b + 1e-9);
      const [mn, mx] = extent(v) ?? [0, 0];
      expect(a).toBeGreaterThanOrEqual(mn);
      expect(b).toBeLessThanOrEqual(mx);
    }));
  });
});

describe('stats: transforms', () => {
  it('zScore, standardize, normalize', () => {
    expect(zScore(130, 100, 15)).toBe(2);
    expect(zScore(1, 1, 0)).toBeUndefined();
    expect(standardize([1, 2, 3])).toEqual([-1, 0, 1]);
    expect(standardize([2, 2])).toBeUndefined();
    expect(normalize([10, 15, 20])).toEqual([0, 0.5, 1]);
    expect(normalize([7, 7])).toEqual([0, 0]);
  });
  it('property: standardized data has mean 0 and sd 1', () => {
    fc.assert(fc.property(fc.array(fc.integer({ min: -1000, max: 1000 }), { minLength: 3, maxLength: 40 }).filter((a) => new Set(a).size > 1), (v) => {
      const z = standardize(v) ?? [];
      close(mean(z), 0, 1e-9);
      close(stdDev(z), 1, 1e-9);
    }));
  });
  it('histogram', () => {
    expect(histogram([1, 2, 2, 3, 9], { bins: 2 })).toEqual([{ x0: 1, x1: 5, count: 4 }, { x0: 5, x1: 9, count: 1 }]);
    expect(histogram([0.5, 1, 1.4, 2.6], { binWidth: 1 })).toEqual([{ x0: 0, x1: 1, count: 1 }, { x0: 1, x1: 2, count: 2 }, { x0: 2, x1: 3, count: 1 }]);
    expect(histogram([5, 5, 5])).toEqual([{ x0: 5, x1: 6, count: 3 }]);
    expect(histogram([5, 5, 5], { bins: 2 })).toEqual([{ x0: 5, x1: 6, count: 3 }, { x0: 6, x1: 7, count: 0 }]);
    const h = histogram([1, 2, 3, 100], { domain: [0, 10], bins: 5 });
    expect(h.reduce((a, b) => a + b.count, 0)).toBe(3);
    expect(() => histogram([1, 2], { bins: 0 })).toThrow(ValidationError);
    expect(() => histogram([0, 1e9], { binWidth: 1 })).toThrow(LimitError);
    expect(() => histogram([1], { domain: [5, 1] })).toThrow(ValidationError);
  });
  it('property: histogram counts every in-range value once', () => {
    fc.assert(fc.property(fc.array(fc.double({ min: -1e3, max: 1e3, noNaN: true }), { minLength: 1, maxLength: 200 }), fc.integer({ min: 1, max: 30 }), (v, bins) => {
      const h = histogram(v, { bins });
      expect(h).toHaveLength(bins);
      expect(h.reduce((a, b) => a + b.count, 0)).toBe(v.length);
    }));
  });
  it('frequencies is prototype-safe', () => {
    const f = frequencies(['__proto__', 'a', '__proto__', 'constructor']);
    expect(f.get('__proto__')).toBe(2);
    expect(f.get('constructor')).toBe(1);
    expect([...f.keys()]).toEqual(['__proto__', 'a', 'constructor']);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
  });
  it('moving average and cumulative sum', () => {
    expect(movingAverage([1, 2, 3, 4], 2)).toEqual([1.5, 2.5, 3.5]);
    expect(movingAverage([1, 2], 3)).toEqual([]);
    expect(movingAverage([5], 1)).toEqual([5]);
    expect(() => movingAverage([1], 0)).toThrow(ValidationError);
    expect(cumulativeSum([0.1, 0.2, 0.3])).toEqual([0.1, 0.1 + 0.2, 0.6]);
  });
  it('property: moving average equals direct window mean', () => {
    fc.assert(fc.property(fc.array(fc.double({ min: -1e6, max: 1e6, noNaN: true }), { minLength: 1, maxLength: 60 }), fc.integer({ min: 1, max: 10 }), (v, w) => {
      const ma = movingAverage(v, w);
      expect(ma).toHaveLength(Math.max(0, v.length - w + 1));
      ma.forEach((m, i) => {
        close(m, mean(v.slice(i, i + w)) ?? 0, 1e-6);
      });
    }));
  });
});

describe('stats: relationships', () => {
  it('covariance, correlation, regression', () => {
    expect(covariance([1, 2, 3], [2, 4, 6])).toBe(2);
    close(covariance([1, 2, 3], [2, 4, 6], { population: true }), 4 / 3);
    expect(correlation([1, 2, 3], [3, 2, 1])).toBe(-1);
    expect(correlation([1, 2, 3], [5, 5, 5])).toBeUndefined();
    expect(() => correlation([1, 2], [1])).toThrow(ValidationError);
    const r = linearRegression([1, 2, 3], [2, 4, 6]);
    expect(r?.slope).toBe(2);
    expect(r?.intercept).toBe(0);
    expect(r?.r2).toBe(1);
    expect(r?.predict(4)).toBe(8);
    expect(linearRegression([1, 1], [2, 3])).toBeUndefined();
    expect(linearRegression([1, 2], [3, 3])?.r2).toBe(1);
    const noisy = linearRegression([1, 2, 3, 4, 5], [2, 4, 5, 4, 5]);
    close(noisy?.slope, 0.6);
    close(noisy?.intercept, 2.2);
    close(noisy?.r2, 0.6);
  });
  it('property: correlation in [-1, 1] and symmetric', () => {
    fc.assert(fc.property(fc.array(fc.tuple(fc.integer({ min: -1000, max: 1000 }), fc.integer({ min: -1000, max: 1000 })), { minLength: 2, maxLength: 40 }), (pairs) => {
      const xs = pairs.map((p) => p[0]);
      const ys = pairs.map((p) => p[1]);
      const c = correlation(xs, ys);
      if (c !== undefined) {
        expect(c).toBeGreaterThanOrEqual(-1);
        expect(c).toBeLessThanOrEqual(1);
        close(correlation(ys, xs), c);
      }
    }));
  });
  it('skewness and kurtosis match Excel', () => {
    close(skewness([1, 2, 3]), 0);
    close(skewness([3, 4, 5, 2, 3, 4, 5, 6, 4, 7]), 0.359543071, 1e-8);
    close(kurtosis([3, 4, 5, 2, 3, 4, 5, 6, 4, 7]), -0.151799637, 1e-8);
    close(kurtosis([1, 2, 3, 4]), -1.2);
    close(kurtosis([1, 2, 3, 4], { population: true }), -1.36);
    expect(skewness([1, 2])).toBeUndefined();
    expect(kurtosis([1, 2, 3])).toBeUndefined();
    expect(skewness([2, 2, 2])).toBeUndefined();
  });
});
