/**
 * Descriptive statistics (docs/PLAN-HELPERS.md section 2). Every function returns `undefined` (never `NaN`)
 * when the statistic is undefined for the input: empty data, too few values, or zero variance.
 * Non-finite values throw `HLP_STATS_NOT_FINITE` unless `nonFinite: 'ignore'` drops them.
 * Summation is compensated (Neumaier); variance uses Welford's algorithm.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { kahanSum } from '../number/index.js';

export interface StatsOptions {
  /** `throw` (default) rejects `NaN`/`+/-Infinity`; `ignore` drops them (pairs are dropped together). */
  readonly nonFinite?: 'throw' | 'ignore';
}

export interface VarianceOptions extends StatsOptions {
  /** Population statistic (divide by n) instead of the sample statistic (n - 1, Excel `VAR.S`). Default false. */
  readonly population?: boolean;
}

function clean(values: readonly number[], options: StatsOptions = {}): readonly number[] {
  let bad = false;
  for (const v of values) {
    if (!Number.isFinite(v)) {
      bad = true;
      break;
    }
  }
  if (!bad) return values;
  if (options.nonFinite === 'ignore') return values.filter((v) => Number.isFinite(v));
  throw new ValidationError('HLP_STATS_NOT_FINITE', 'Values must be finite numbers.');
}

function cleanPairs(xs: readonly number[], ys: readonly number[], options: StatsOptions = {}): [readonly number[], readonly number[]] {
  if (xs.length !== ys.length) throw new ValidationError('HLP_STATS_LENGTH', 'Both series must have the same length.');
  const ok = (i: number): boolean => Number.isFinite(xs[i]) && Number.isFinite(ys[i]);
  let bad = false;
  for (let i = 0; i < xs.length; i++) {
    if (!ok(i)) {
      bad = true;
      break;
    }
  }
  if (!bad) return [xs, ys];
  if (options.nonFinite !== 'ignore') throw new ValidationError('HLP_STATS_NOT_FINITE', 'Values must be finite numbers.');
  const fx: number[] = [];
  const fy: number[] = [];
  for (let i = 0; i < xs.length; i++) {
    if (ok(i)) {
      fx.push(xs[i] ?? 0);
      fy.push(ys[i] ?? 0);
    }
  }
  return [fx, fy];
}

const sorted = (values: readonly number[]): Float64Array => Float64Array.from(values).sort();

/**
 * Arithmetic mean.
 * @example mean([1, 2, 3, 4]) // => 2.5
 */
export function mean(values: readonly number[], options?: StatsOptions): number | undefined {
  const v = clean(values, options);
  return v.length ? kahanSum(v) / v.length : undefined;
}

/**
 * Weighted mean; weights must be finite and non-negative. `undefined` when all weights are 0.
 * @example weightedMean([80, 90], [1, 3]) // => 87.5
 */
export function weightedMean(values: readonly number[], weights: readonly number[], options?: StatsOptions): number | undefined {
  const [v, w] = cleanPairs(values, weights, options);
  let total = 0;
  const products: number[] = [];
  for (let i = 0; i < v.length; i++) {
    const wi = w[i] ?? 0;
    if (wi < 0) throw new ValidationError('HLP_STATS_WEIGHT', 'Weights must not be negative.');
    total += wi;
    products.push((v[i] ?? 0) * wi);
  }
  return total > 0 ? kahanSum(products) / kahanSum(w) : undefined;
}

/**
 * Median (mean of the two middle values for even counts).
 * @example median([3, 1, 4, 2]) // => 2.5
 */
export function median(values: readonly number[], options?: StatsOptions): number | undefined {
  return quantileSorted(sorted(clean(values, options)), 0.5, 'linear');
}

/**
 * All most-frequent values, ascending (several for multi-modal data).
 * @example mode([1, 2, 2, 3, 3]) // => [2, 3]
 */
export function mode(values: readonly number[], options?: StatsOptions): number[] | undefined {
  const v = clean(values, options);
  if (!v.length) return undefined;
  const counts = new Map<number, number>();
  let best = 0;
  for (const x of v) {
    const c = (counts.get(x) ?? 0) + 1;
    counts.set(x, c);
    if (c > best) best = c;
  }
  const out: number[] = [];
  for (const [x, c] of counts) if (c === best) out.push(x);
  return out.sort((a, b) => a - b);
}

/**
 * `[min, max]` in one pass (no spread, safe for huge arrays).
 * @example extent([3, 1, 4]) // => [1, 4]
 */
export function extent(values: readonly number[], options?: StatsOptions): [number, number] | undefined {
  const v = clean(values, options);
  if (!v.length) return undefined;
  let lo = Infinity;
  let hi = -Infinity;
  for (const x of v) {
    if (x < lo) lo = x;
    if (x > hi) hi = x;
  }
  return [lo, hi];
}

/**
 * Range `max - min` (named `rangeOf` to avoid clashing with the array module's `range`).
 * @example rangeOf([3, 1, 4]) // => 3
 */
export function rangeOf(values: readonly number[], options?: StatsOptions): number | undefined {
  const e = extent(values, options);
  return e ? e[1] - e[0] : undefined;
}

function welford(v: readonly number[]): { n: number; mean: number; m2: number } {
  let n = 0;
  let m = 0;
  let m2 = 0;
  for (const x of v) {
    n++;
    const d = x - m;
    m += d / n;
    m2 += d * (x - m);
  }
  return { n, mean: m, m2 };
}

/**
 * Variance (sample by default; `population: true` for n). Sample variance needs >= 2 values.
 * @example variance([2, 4, 4, 4, 5, 5, 7, 9], { population: true }) // => 4
 */
export function variance(values: readonly number[], options: VarianceOptions = {}): number | undefined {
  const { n, m2 } = welford(clean(values, options));
  const d = options.population ? n : n - 1;
  return d > 0 ? m2 / d : undefined;
}

/**
 * Standard deviation (sample by default).
 * @example stdDev([2, 4, 4, 4, 5, 5, 7, 9], { population: true }) // => 2
 */
export function stdDev(values: readonly number[], options: VarianceOptions = {}): number | undefined {
  const v = variance(values, options);
  return v === undefined ? undefined : Math.sqrt(v);
}

/** Percentile interpolation methods (NumPy names); `linear` equals Excel `PERCENTILE.INC`. */
export type PercentileMethod = 'linear' | 'nearest' | 'lower' | 'higher' | 'midpoint';

function quantileSorted(s: Float64Array, q: number, method: PercentileMethod): number | undefined {
  const n = s.length;
  if (!n) return undefined;
  const h = (n - 1) * q;
  const lo = Math.floor(h);
  const hi = Math.ceil(h);
  const a = s[lo] ?? 0;
  const b = s[hi] ?? 0;
  switch (method) {
    case 'lower':
      return a;
    case 'higher':
      return b;
    case 'midpoint':
      return (a + b) / 2;
    case 'nearest': {
      const f = h - lo;
      return f < 0.5 ? a : f > 0.5 ? b : lo % 2 === 0 ? a : b; // ties to even index, like NumPy
    }
    case 'linear':
      return a + (b - a) * (h - lo);
  }
}

export interface PercentileOptions extends StatsOptions {
  /** Default `linear`. */
  readonly method?: PercentileMethod;
}

function checkUnit(q: number, max: number): void {
  if (!(q >= 0 && q <= max)) throw new ValidationError('HLP_STATS_PERCENTILE', 'The percentile is out of range.');
}

/**
 * Percentile for `p` in `[0, 100]`.
 * @example percentile([1, 2, 3, 4, 5], 90) // => 4.6 // Excel PERCENTILE.INC
 */
export function percentile(values: readonly number[], p: number, options: PercentileOptions = {}): number | undefined {
  checkUnit(p, 100);
  return quantileSorted(sorted(clean(values, options)), p / 100, options.method ?? 'linear');
}

/**
 * Quantile for `q` in `[0, 1]` (same methods as `percentile`).
 * @example quantile([1, 2, 3, 4], 0.25) // => 1.75
 */
export function quantile(values: readonly number[], q: number, options: PercentileOptions = {}): number | undefined {
  checkUnit(q, 1);
  return quantileSorted(sorted(clean(values, options)), q, options.method ?? 'linear');
}

/**
 * The `n - 1` cut points dividing the data into `n` equal-probability groups (`n` in 2..1000).
 * @example quantiles([1, 2, 3, 4, 5], 4) // => [2, 3, 4]
 */
export function quantiles(values: readonly number[], n: number, options: PercentileOptions = {}): number[] | undefined {
  if (!Number.isInteger(n) || n < 2 || n > 1000) throw new ValidationError('HLP_STATS_QUANTILES', 'The group count must be an integer between 2 and 1000.');
  const s = sorted(clean(values, options));
  if (!s.length) return undefined;
  const out: number[] = [];
  for (let i = 1; i < n; i++) out.push(quantileSorted(s, i / n, options.method ?? 'linear') ?? 0);
  return out;
}

/**
 * `[Q1, median, Q3]` (linear method).
 * @example quartiles([1, 2, 3, 4, 5]) // => [2, 3, 4]
 */
export function quartiles(values: readonly number[], options: PercentileOptions = {}): [number, number, number] | undefined {
  const q = quantiles(values, 4, options);
  return q ? [q[0] ?? 0, q[1] ?? 0, q[2] ?? 0] : undefined;
}

/**
 * Interquartile range `Q3 - Q1`.
 * @example iqr([1, 2, 3, 4, 5]) // => 2
 */
export function iqr(values: readonly number[], options: PercentileOptions = {}): number | undefined {
  const q = quartiles(values, options);
  return q ? q[2] - q[0] : undefined;
}

export interface OutlierOptions extends StatsOptions {
  /** Fence multiplier. Default 1.5 (Tukey); 3 flags "far out" values. */
  readonly k?: number;
}

export interface OutlierResult {
  readonly lowerFence: number;
  readonly upperFence: number;
  /** Outliers in input order. */
  readonly outliers: number[];
  /** Input indexes of the outliers. */
  readonly indexes: number[];
}

/**
 * Tukey fences `[Q1 - k|IQR, Q3 + k|IQR]` and the values outside them.
 * @example outliers([1, 2, 3, 4, 100])?.outliers // => [100]
 */
export function outliers(values: readonly number[], options: OutlierOptions = {}): OutlierResult | undefined {
  const { k = 1.5 } = options;
  const q = quartiles(values, options);
  if (!q) return undefined;
  const spread = q[2] - q[0];
  const lowerFence = q[0] - k * spread;
  const upperFence = q[2] + k * spread;
  const out: number[] = [];
  const indexes: number[] = [];
  values.forEach((v, i) => {
    if (Number.isFinite(v) && (v < lowerFence || v > upperFence)) {
      out.push(v);
      indexes.push(i);
    }
  });
  return { lowerFence, upperFence, outliers: out, indexes };
}

/**
 * Standard score `(value - mean) / stdDev`; `undefined` when `stdDev` is 0.
 * @example zScore(130, 100, 15) // => 2
 */
export function zScore(value: number, meanValue: number, stdDevValue: number): number | undefined {
  return stdDevValue === 0 || !Number.isFinite(stdDevValue) ? undefined : (value - meanValue) / stdDevValue;
}

/**
 * Z-scores of every value (sample standard deviation unless `population`). `undefined` when constant.
 * @example standardize([1, 2, 3]) // => [-1, 0, 1]
 */
export function standardize(values: readonly number[], options: VarianceOptions = {}): number[] | undefined {
  const v = clean(values, options);
  const m = mean(v);
  const sd = stdDev(v, options);
  if (m === undefined || sd === undefined || sd === 0) return undefined;
  return v.map((x) => (x - m) / sd);
}

/**
 * Min-max scaling to `[0, 1]`; a constant series maps to all zeros.
 * @example normalize([10, 15, 20]) // => [0, 0.5, 1]
 */
export function normalize(values: readonly number[], options?: StatsOptions): number[] | undefined {
  const v = clean(values, options);
  const e = extent(v);
  if (!e) return undefined;
  const [lo, hi] = e;
  return v.map((x) => (hi === lo ? 0 : (x - lo) / (hi - lo)));
}

export interface HistogramBin {
  /** Inclusive lower edge. */
  readonly x0: number;
  /** Exclusive upper edge (inclusive for the last bin). */
  readonly x1: number;
  readonly count: number;
}

export interface HistogramOptions extends StatsOptions {
  /** Number of equal-width bins. Default: Sturges' rule. */
  readonly bins?: number;
  /** Bin width; edges align to multiples of the width. Overrides `bins`. */
  readonly binWidth?: number;
  /** Fixed `[min, max]`; values outside are ignored. */
  readonly domain?: readonly [number, number];
}

/** Largest bin count `histogram` produces. */
export const MAX_HISTOGRAM_BINS = 10_000;

/**
 * Equal-width histogram.
 * @example histogram([1, 2, 2, 3, 9], { bins: 2 }) // => [{ x0: 1, x1: 5, count: 4 }, { x0: 5, x1: 9, count: 1 }]
 */
export function histogram(values: readonly number[], options: HistogramOptions = {}): HistogramBin[] {
  const v = clean(values, options);
  const e = options.domain ?? extent(v);
  if (!e) return [];
  const [lo, hi] = e;
  if (!Number.isFinite(lo) || !Number.isFinite(hi) || lo > hi) throw new ValidationError('HLP_STATS_DOMAIN', 'The domain must be a finite [min, max] pair.');
  let start = lo;
  let width: number;
  let count: number;
  if (options.binWidth !== undefined) {
    if (!(options.binWidth > 0) || !Number.isFinite(options.binWidth)) throw new ValidationError('HLP_STATS_BINS', 'The bin width must be a positive finite number.');
    width = options.binWidth;
    start = Math.floor(lo / width) * width;
    count = Math.max(1, Math.floor((hi - start) / width) + 1);
  } else {
    count = options.bins ?? (hi === lo ? 1 : Math.ceil(Math.log2(Math.max(v.length, 1))) + 1);
    if (!Number.isInteger(count) || count < 1) throw new ValidationError('HLP_STATS_BINS', 'The bin count must be a positive integer.');
    width = hi === lo ? 1 : (hi - lo) / count;
  }
  if (count > MAX_HISTOGRAM_BINS) throw new LimitError('HLP_STATS_TOO_MANY_BINS', 'The bin count exceeds the limit.');
  const counts = new Array<number>(count).fill(0);
  for (const x of v) {
    if (x < lo || x > hi) continue;
    const raw = (x - start) / width; // width can underflow to 0 for subnormal spans
    const i = Number.isFinite(raw) ? Math.min(count - 1, Math.floor(raw)) : x > start ? count - 1 : 0;
    counts[i] = (counts[i] ?? 0) + 1;
  }
  return counts.map((c, i) => ({ x0: start + i * width, x1: i === count - 1 && options.binWidth === undefined && hi !== lo ? hi : start + (i + 1) * width, count: c }));
}

/**
 * Occurrence counts in first-seen order (a `Map`, so any value type is safe as a key).
 * @example frequencies(['a', 'b', 'a']) // => new Map([['a', 2], ['b', 1]])
 */
export function frequencies<T>(values: Iterable<T>): Map<T, number> {
  const m = new Map<T, number>();
  for (const v of values) m.set(v, (m.get(v) ?? 0) + 1);
  return m;
}

function coMoments(xs: readonly number[], ys: readonly number[]): { n: number; mx: number; my: number; cxy: number; m2x: number; m2y: number } {
  let n = 0;
  let mx = 0;
  let my = 0;
  let cxy = 0;
  let m2x = 0;
  let m2y = 0;
  for (let i = 0; i < xs.length; i++) {
    const x = xs[i] ?? 0;
    const y = ys[i] ?? 0;
    n++;
    const dx = x - mx;
    mx += dx / n;
    const dy = y - my;
    my += dy / n;
    cxy += dx * (y - my);
    m2x += dx * (x - mx);
    m2y += dy * (y - my);
  }
  return { n, mx, my, cxy, m2x, m2y };
}

/**
 * Covariance of paired series (sample by default).
 * @example covariance([1, 2, 3], [2, 4, 6]) // => 2
 */
export function covariance(xs: readonly number[], ys: readonly number[], options: VarianceOptions = {}): number | undefined {
  const [x, y] = cleanPairs(xs, ys, options);
  const { n, cxy } = coMoments(x, y);
  const d = options.population ? n : n - 1;
  return d > 0 ? cxy / d : undefined;
}

/**
 * Pearson correlation in `[-1, 1]`; `undefined` for fewer than 2 pairs or a constant series.
 * @example correlation([1, 2, 3], [3, 2, 1]) // => -1
 */
export function correlation(xs: readonly number[], ys: readonly number[], options?: StatsOptions): number | undefined {
  const [x, y] = cleanPairs(xs, ys, options);
  const { n, cxy, m2x, m2y } = coMoments(x, y);
  if (n < 2 || m2x === 0 || m2y === 0) return undefined;
  return Math.max(-1, Math.min(1, cxy / Math.sqrt(m2x * m2y)));
}

export interface LinearRegression {
  readonly slope: number;
  readonly intercept: number;
  /** Coefficient of determination; 1 when every y is equal (a perfect horizontal fit). */
  readonly r2: number;
  predict(x: number): number;
}

/**
 * Ordinary least squares fit `y = slope|x + intercept`; `undefined` for < 2 pairs or constant x.
 * @example linearRegression([1, 2, 3], [2, 4, 6])?.predict(4) // => 8
 */
export function linearRegression(xs: readonly number[], ys: readonly number[], options?: StatsOptions): LinearRegression | undefined {
  const [x, y] = cleanPairs(xs, ys, options);
  const { n, mx, my, cxy, m2x, m2y } = coMoments(x, y);
  if (n < 2 || m2x === 0) return undefined;
  const slope = cxy / m2x;
  const intercept = my - slope * mx;
  const r2 = m2y === 0 ? 1 : Math.min(1, (cxy * cxy) / (m2x * m2y));
  return Object.freeze({ slope, intercept, r2, predict: (v: number) => slope * v + intercept });
}

/**
 * Trailing simple moving average; result has `length - window + 1` entries (empty when window > length).
 * @example movingAverage([1, 2, 3, 4], 2) // => [1.5, 2.5, 3.5]
 */
export function movingAverage(values: readonly number[], window: number, options?: StatsOptions): number[] {
  if (!Number.isInteger(window) || window < 1) throw new ValidationError('HLP_STATS_WINDOW', 'The window must be a positive integer.');
  const v = clean(values, options);
  const out: number[] = [];
  let s = 0;
  let c = 0;
  const add = (x: number): void => {
    const t = s + x;
    c += Math.abs(s) >= Math.abs(x) ? s - t + x : x - t + s;
    s = t;
  };
  for (let i = 0; i < v.length; i++) {
    add(v[i] ?? 0);
    if (i >= window) add(-(v[i - window] ?? 0));
    if (i >= window - 1) out.push((s + c) / window);
  }
  return out;
}

/**
 * Running totals (compensated).
 * @example cumulativeSum([0.1, 0.2, 0.3]) // => [0.1, 0.30000000000000004, 0.6] // naive running addition ends at 0.6000000000000001
 */
export function cumulativeSum(values: readonly number[], options?: StatsOptions): number[] {
  const v = clean(values, options);
  const out: number[] = [];
  let s = 0;
  let c = 0;
  for (const x of v) {
    const t = s + x;
    c += Math.abs(s) >= Math.abs(x) ? s - t + x : x - t + s;
    s = t;
    out.push(s + c);
  }
  return out;
}

/**
 * Geometric mean of non-negative values (0 if any is 0); `undefined` if any is negative.
 * @example geometricMean([1, 4, 16]) // => 4
 */
export function geometricMean(values: readonly number[], options?: StatsOptions): number | undefined {
  const v = clean(values, options);
  if (!v.length || v.some((x) => x < 0)) return undefined;
  if (v.includes(0)) return 0;
  return Math.exp(kahanSum(v.map(Math.log)) / v.length);
}

/**
 * Harmonic mean of non-negative values (0 if any is 0); `undefined` if any is negative.
 * @example harmonicMean([1, 4, 4]) // => 2
 */
export function harmonicMean(values: readonly number[], options?: StatsOptions): number | undefined {
  const v = clean(values, options);
  if (!v.length || v.some((x) => x < 0)) return undefined;
  if (v.includes(0)) return 0;
  return v.length / kahanSum(v.map((x) => 1 / x));
}

function centralMoments(v: readonly number[]): { n: number; m2: number; m3: number; m4: number } {
  const n = v.length;
  const m = kahanSum(v) / n;
  let m2 = 0;
  let m3 = 0;
  let m4 = 0;
  for (const x of v) {
    const d = x - m;
    const d2 = d * d;
    m2 += d2;
    m3 += d2 * d;
    m4 += d2 * d2;
  }
  return { n, m2: m2 / n, m3: m3 / n, m4: m4 / n };
}

/**
 * Skewness: sample-adjusted (Excel `SKEW`, n >= 3) by default, or population `g1`.
 * @example skewness([1, 2, 3]) // => 0
 */
export function skewness(values: readonly number[], options: VarianceOptions = {}): number | undefined {
  const v = clean(values, options);
  const { n, m2, m3 } = centralMoments(v);
  if (n < (options.population ? 1 : 3) || m2 === 0) return undefined;
  const g1 = m3 / m2 ** 1.5;
  return options.population ? g1 : (Math.sqrt(n * (n - 1)) / (n - 2)) * g1;
}

/**
 * Excess kurtosis: sample-adjusted (Excel `KURT`, n >= 4) by default, or population `g2`.
 * @example kurtosis([1, 2, 3, 4]) // => ≈ -1.2
 */
export function kurtosis(values: readonly number[], options: VarianceOptions = {}): number | undefined {
  const v = clean(values, options);
  const { n, m2, m4 } = centralMoments(v);
  if (n < (options.population ? 1 : 4) || m2 === 0) return undefined;
  const g2 = m4 / (m2 * m2) - 3;
  return options.population ? g2 : ((n - 1) / ((n - 2) * (n - 3))) * ((n + 1) * g2 + 6);
}
