import { describe, expect, it } from 'vitest';
import { fieldsToEpoch, instant, plainDate, plainDateTime, plainTime, toInstant } from '@absoluteui/core';
import { bandScale, linearScale, linearTicks, niceStep, timeTicks } from '../src/internal/chart/scale.js';
import { textWidth, truncateText } from '../src/internal/chart/axis.js';
import { cartesianSummary, seriesStats, tickFormatter } from '../src/internal/chart/model.js';

const iso = (ms: number): string => new Date(ms).toISOString();
const local = (zone: string, y: number, mo: number, d: number, h = 0, mi = 0): number =>
  toInstant(plainDateTime(plainDate(y, mo, d), plainTime(h, mi)), zone, 'compatible').epochMilliseconds;

describe('chart scales: nice steps and linear ticks', () => {
  it('picks 1, 2, 5 x 10^k steps', () => {
    expect(niceStep(100, 5)).toBe(20);
    expect(niceStep(1, 5)).toBe(0.2);
    expect(niceStep(7, 5)).toBe(1);
    expect(niceStep(0.03, 3)).toBe(0.01);
    expect(niceStep(3_000_000, 4)).toBe(1_000_000);
    expect(niceStep(0, 5)).toBe(1);
    expect(niceStep(Number.NaN, 5)).toBe(1);
  });

  it('extends the domain to whole steps and prints ticks without float artifacts', () => {
    const t = linearTicks(3, 97, 5);
    expect(t.min).toBe(0);
    expect(t.max).toBe(100);
    expect(t.values).toEqual([0, 20, 40, 60, 80, 100]);
    const f = linearTicks(0.1, 0.7, 6);
    expect(f.values).toEqual([0.1, 0.2, 0.3, 0.4, 0.5, 0.6, 0.7]);
    expect(f.decimals).toBe(1);
  });

  it('handles negative domains, a single value, zero, and non-finite input', () => {
    expect(linearTicks(-45, 30, 5).values).toEqual([-60, -40, -20, 0, 20, 40]);
    const single = linearTicks(50, 50, 5);
    expect(single.min).toBeLessThan(50);
    expect(single.max).toBeGreaterThan(50);
    expect(linearTicks(0, 0, 5).values).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(linearTicks(Number.NaN, Infinity, 5).values).toEqual([0, 0.2, 0.4, 0.6, 0.8, 1]);
    expect(linearTicks(-5, -5, 5).max).toBeGreaterThan(-5);
  });

  it('keeps an exact domain when nice is false (ticks inside it)', () => {
    const t = linearTicks(3, 97, 5, false);
    expect(t.min).toBe(3);
    expect(t.max).toBe(97);
    expect(t.values).toEqual([20, 40, 60, 80]);
  });

  it('maps linearly and puts a zero-width domain mid-range', () => {
    const s = linearScale([0, 100], [200, 0]);
    expect(s.map(25)).toBe(150);
    expect(linearScale([5, 5], [0, 100]).map(5)).toBe(50);
  });

  it('band scale: padding, reversed (RTL) ranges, and hit-testing', () => {
    const b = bandScale(4, [0, 400], 0.2, 0.1);
    expect(b.step).toBeCloseTo(400 / 4, 5);
    expect(b.bandwidth).toBeCloseTo(80, 5);
    expect(b.start(0)).toBeCloseTo(10, 5);
    expect(b.center(3)).toBeCloseTo(350, 5);
    expect(b.indexAt(5)).toBe(0);
    expect(b.indexAt(395)).toBe(3);
    expect(b.indexAt(-20)).toBe(-1);
    const r = bandScale(4, [400, 0], 0.2, 0.1);
    expect(r.center(0)).toBeCloseTo(350, 5);
    expect(r.start(0)).toBeCloseTo(310, 5);
    expect(r.indexAt(390)).toBe(0);
    expect(r.indexAt(10)).toBe(3);
    expect(bandScale(0, [0, 100]).indexAt(10)).toBe(-1);
  });
});

describe('chart scales: time ticks in explicit timezones', () => {
  it('UTC months across a year boundary', () => {
    const t = timeTicks(fieldsToEpoch(2025, 11, 15), fieldsToEpoch(2026, 4, 2), 6, 'UTC');
    expect(t.unit).toBe('month');
    expect(t.values.map(iso)).toEqual(['2025-12-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z', '2026-02-01T00:00:00.000Z', '2026-03-01T00:00:00.000Z', '2026-04-01T00:00:00.000Z']);
  });

  it('days align to local midnight in Asia/Kolkata (UTC+05:30)', () => {
    const t = timeTicks(local('Asia/Kolkata', 2026, 3, 1, 9), local('Asia/Kolkata', 2026, 3, 5, 9), 5, 'Asia/Kolkata');
    expect(t.unit).toBe('day');
    expect(t.values.map(iso)).toEqual(['2026-03-01T18:30:00.000Z', '2026-03-02T18:30:00.000Z', '2026-03-03T18:30:00.000Z', '2026-03-04T18:30:00.000Z']);
  });

  it('hours follow wall-clock time across the America/New_York spring-forward gap', () => {
    const t = timeTicks(local('America/New_York', 2026, 3, 8, 0), local('America/New_York', 2026, 3, 8, 6), 8, 'America/New_York');
    expect(t.unit).toBe('hour');
    // 02:00 does not exist on 2026-03-08; its tick maps forward to 03:00 and is not duplicated.
    const hours = t.values.map((v) => new Intl.DateTimeFormat('en-US', { timeZone: 'America/New_York', hour: 'numeric', hourCycle: 'h23' }).format(v));
    expect(hours).toEqual(['00', '01', '03', '04', '05', '06']);
    expect(new Set(t.values).size).toBe(t.values.length);
  });

  it('Europe/London fall-back day and Australia/Lord_Howe 30-minute DST stay midnight-aligned', () => {
    const london = timeTicks(local('Europe/London', 2026, 10, 24), local('Europe/London', 2026, 10, 27), 4, 'Europe/London');
    // BST ends on 2026-10-25: midnights before it are 23:00Z, after it 00:00Z.
    expect(london.values.map(iso)).toEqual(['2026-10-23T23:00:00.000Z', '2026-10-24T23:00:00.000Z', '2026-10-26T00:00:00.000Z', '2026-10-27T00:00:00.000Z']);
    for (const v of london.values) expect(new Intl.DateTimeFormat('en-GB', { timeZone: 'Europe/London', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(v)).toBe('00:00');
    const lh = timeTicks(local('Australia/Lord_Howe', 2026, 4, 3), local('Australia/Lord_Howe', 2026, 4, 7), 5, 'Australia/Lord_Howe');
    expect(lh.values.length).toBeGreaterThanOrEqual(4);
    for (const v of lh.values) expect(new Intl.DateTimeFormat('en-AU', { timeZone: 'Australia/Lord_Howe', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(v)).toBe('00:00');
  });

  it('years, minutes, sub-second spans, and an empty span', () => {
    expect(timeTicks(fieldsToEpoch(2000, 1, 1), fieldsToEpoch(2026, 1, 1), 6, 'UTC').values.map((v) => new Date(v).getUTCFullYear())).toEqual([2000, 2005, 2010, 2015, 2020, 2025]);
    const minutes = timeTicks(fieldsToEpoch(2026, 1, 1, 10, 3), fieldsToEpoch(2026, 1, 1, 11, 0), 5, 'UTC');
    expect(minutes.unit).toBe('minute');
    expect(minutes.values.map(iso)[0]).toBe('2026-01-01T10:15:00.000Z');
    expect(timeTicks(0, 400, 4, 'UTC').unit).toBe('millisecond');
    expect(timeTicks(5, 5, 4, 'UTC').values).toEqual([5]);
    expect(timeTicks(instant(0).epochMilliseconds, Number.NaN, 4, 'UTC').values).toEqual([]);
  });
});

describe('chart text and summary helpers', () => {
  it('estimates width (wide CJK) and truncates by grapheme', () => {
    expect(textWidth('abc', 10)).toBeCloseTo(18);
    expect(textWidth('日本', 10)).toBeCloseTo(20);
    expect(truncateText('Short', 100, 10)).toBe('Short');
    const cut = truncateText('A very long category label', 60, 10);
    expect(cut.endsWith('...')).toBe(true);
    expect(textWidth(cut, 10)).toBeLessThanOrEqual(60);
    // Never splits a grapheme cluster (here a ZWJ family emoji).
    expect(truncateText('👩‍👩‍👧‍👦👩‍👩‍👧‍👦', 80, 10)).toBe('👩‍👩‍👧‍👦...');
  });

  it('series statistics skip gaps', () => {
    expect(seriesStats([null, 3, Number.NaN, -2, 8, null])).toEqual({ count: 3, missing: 3, min: -2, max: 8, minIndex: 3, maxIndex: 4, first: 3, last: 8 });
    expect(seriesStats([null, null])).toBeNull();
  });

  it('tick formatter fixes fraction digits and adapts percent style', () => {
    expect(tickFormatter({}, 1, 'en-US')(0.5)).toBe('0.5');
    expect(tickFormatter({ valueFormat: { style: 'percent' } }, 2, 'en-US')(0.25)).toBe('25%');
    expect(tickFormatter({ valueFormat: { style: 'currency', currency: 'EUR' } }, 0, 'de-DE')(1000)).toBe('1.000 €');
  });

  it('summary covers type, ranges, extremes, trend, gaps, and hidden series', () => {
    const text = cartesianSummary({
      type: 'line chart',
      locale: 'en-US',
      series: [
        { label: 'Revenue', values: [10, null, 30], hidden: false },
        { label: 'Costs', values: [5, 5, 5], hidden: true },
        { label: 'Empty', values: [null, null, null], hidden: false },
      ],
      length: 3,
      lengthKey: 'pointCount',
      xAxis: 'Month',
      xFrom: 'Jan',
      xTo: 'Mar',
      yAxis: 'USD',
      yFrom: '0',
      yTo: '40',
      xLabel: (i) => ['Jan', 'Feb', 'Mar'][i] ?? '',
      format: String,
    });
    expect(text).toBe('line chart, 3 series, 3 data points. Month: Jan to Mar. USD: 0 to 40. Revenue: minimum 10 at Jan, maximum 30 at Mar, trending up from 10 to 30. Costs: minimum 5 at Jan, maximum 5 at Jan, no overall change (5). Empty: no values. 4 missing values. Hidden: Costs.');
  });
});
