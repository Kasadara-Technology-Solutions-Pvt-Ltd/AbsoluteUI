import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { fromEpochDay, isoWeekday, toEpochDay, plainDate, type IsoWeekday } from '@absoluteui/helpers/date';
import {
  addBusinessDays, countHolidays, createBusinessCalendar, diffBreakdown, diffDays, fixedHoliday, isBusinessDay, lastWeekdayHoliday, listBusinessDays,
  nthWeekdayHoliday, oneOffHoliday, easterHoliday, type BusinessCalendar,
} from '@absoluteui/helpers/business-calendar';

type Inclusive = 'none' | 'start' | 'end' | 'both';
const INCLUSIVE: readonly Inclusive[] = ['none', 'start', 'end', 'both'];
const BASE = toEpochDay(plainDate(2025, 11, 1));
const SPAN = 500;

interface Spec {
  readonly weekend: IsoWeekday[];
  readonly holidays: number[];
  readonly halfDays: number[];
  readonly exceptions: { readonly offset: number; readonly working: boolean; readonly half: boolean }[];
}

const arbSpec: fc.Arbitrary<Spec> = fc.record({
  weekend: fc.subarray<IsoWeekday>([1, 2, 3, 4, 5, 6, 7]),
  holidays: fc.array(fc.integer({ min: 0, max: SPAN - 1 }), { maxLength: 40 }),
  halfDays: fc.array(fc.integer({ min: 0, max: SPAN - 1 }), { maxLength: 10 }),
  exceptions: fc.uniqueArray(fc.record({ offset: fc.integer({ min: 0, max: SPAN - 1 }), working: fc.boolean(), half: fc.boolean() }), { selector: (x) => x.offset, maxLength: 15 }),
});

function build(spec: Spec): BusinessCalendar {
  return createBusinessCalendar({
    weekend: spec.weekend,
    holidays: spec.holidays.map((o, i) => oneOffHoliday(`H${String(i)}`, fromEpochDay(BASE + o))),
    halfDays: spec.halfDays.map((o, i) => oneOffHoliday(`Half${String(i)}`, fromEpochDay(BASE + o))),
    exceptions: spec.exceptions.map((x) => ({ date: fromEpochDay(BASE + x.offset), working: x.working, ...(x.working && x.half ? { halfDay: true } : {}) })),
  });
}

/** Independent day-status oracle: 0 non-working, 1 working, 2 half day. */
function oracle(spec: Spec): (e: number) => { status: 0 | 1 | 2; pattern: boolean; holiday: boolean } {
  const holidays = new Set(spec.holidays.map((o) => BASE + o));
  const halves = new Set(spec.halfDays.map((o) => BASE + o));
  const ex = new Map(spec.exceptions.map((x) => [BASE + x.offset, x]));
  return (e) => {
    const pattern = !spec.weekend.includes(isoWeekday(fromEpochDay(e)));
    const holiday = holidays.has(e);
    const x = ex.get(e);
    let status: 0 | 1 | 2;
    if (x) status = x.working ? (x.half ? 2 : 1) : 0;
    else if (holiday) status = 0;
    else if (halves.has(e) && pattern) status = 2;
    else status = pattern ? 1 : 0;
    return { status, pattern, holiday };
  };
}

function* datesIn(a: number, b: number, inclusive: Inclusive): Generator<number> {
  const lo = Math.min(a, b);
  const hi = Math.max(a, b);
  for (let e = lo; e <= hi; e++) {
    if (lo === hi) {
      if (inclusive === 'both') yield e;
      continue;
    }
    if (e === lo && (inclusive === 'none' || inclusive === 'end')) continue;
    if (e === hi && (inclusive === 'none' || inclusive === 'start')) continue;
    yield e;
  }
}

const arbOffset = fc.integer({ min: -30, max: SPAN + 30 });

describe('business-calendar properties', () => {
  it('diffDays matches a day-iterating oracle for every mode and inclusivity', () => {
    fc.assert(fc.property(arbSpec, arbOffset, arbOffset, fc.constantFrom(...INCLUSIVE), fc.constantFrom(0, 0.25, 0.5, 1), (spec, x, y, inclusive, hv) => {
      const cal = build(spec);
      const status = oracle(spec);
      const a = BASE + x;
      const b = BASE + y;
      const sign = b < a ? -1 : 1;
      let calendarDays = 0;
      let weekdays = 0;
      let business = 0;
      for (const e of datesIn(a, b, inclusive)) {
        const s = status(e);
        calendarDays++;
        if (s.pattern) weekdays++;
        business += s.status === 1 ? 1 : s.status === 2 ? hv : 0;
      }
      const opts = { inclusive, calendar: cal } as const;
      expect(diffDays(fromEpochDay(a), fromEpochDay(b), { ...opts, mode: 'calendar' })).toBe(sign * calendarDays || 0);
      expect(diffDays(fromEpochDay(a), fromEpochDay(b), { ...opts, mode: 'weekdays' })).toBe(sign * weekdays || 0);
      expect(diffDays(fromEpochDay(a), fromEpochDay(b), { ...opts, mode: 'business', halfDayValue: hv })).toBeCloseTo(sign * business, 9);
    }), { numRuns: 300 });
  });

  it('diffBreakdown satisfies its identities and matches the oracle', () => {
    fc.assert(fc.property(arbSpec, arbOffset, arbOffset, fc.constantFrom(...INCLUSIVE), (spec, x, y, inclusive) => {
      const cal = build(spec);
      const status = oracle(spec);
      const a = fromEpochDay(BASE + x);
      const b = fromEpochDay(BASE + y);
      const r = diffBreakdown(a, b, cal, { inclusive });
      expect(r.weekdays + r.weekendDays).toBe(r.calendarDays);
      expect(r.businessDays).toBeCloseTo(r.weekdays - r.nonWorkingWeekdays + r.workingWeekendDays - 0.5 * r.halfDays, 9);
      expect(r.businessDays).toBeCloseTo(diffDays(a, b, { mode: 'business', inclusive, calendar: cal }), 9);
      let holidays = 0;
      let onWeekends = 0;
      let halfDays = 0;
      for (const e of datesIn(BASE + x, BASE + y, inclusive)) {
        const s = status(e);
        if (s.holiday && s.pattern) holidays++;
        if (s.holiday && !s.pattern) onWeekends++;
        if (s.status === 2) halfDays++;
      }
      const sign = y < x ? -1 : 1;
      expect(r.holidays).toBe(sign * holidays || 0);
      expect(r.holidaysOnWeekends).toBe(sign * onWeekends || 0);
      expect(r.halfDays).toBe(sign * halfDays || 0);
      expect(countHolidays(a, b, { inclusive, calendar: cal })).toEqual({ total: holidays + onWeekends, onWeekdays: holidays, onWeekends });
    }), { numRuns: 300 });
  });

  it('is antisymmetric under reversed ranges', () => {
    fc.assert(fc.property(arbSpec, arbOffset, arbOffset, fc.constantFrom(...INCLUSIVE), fc.constantFrom('calendar', 'weekdays', 'business'), (spec, x, y, inclusive, mode) => {
      // Equal dates are not a reversed range: `inclusive: 'both'` counts that one day either way.
      fc.pre(x !== y);
      const cal = build(spec);
      const a = fromEpochDay(BASE + x);
      const b = fromEpochDay(BASE + y);
      expect(diffDays(a, b, { mode, inclusive, calendar: cal })).toBe(-diffDays(b, a, { mode, inclusive, calendar: cal }) || 0);
    }), { numRuns: 200 });
  });

  it('counts a single day only when both ends are included', () => {
    fc.assert(fc.property(arbSpec, arbOffset, fc.constantFrom(...INCLUSIVE), (spec, x, inclusive) => {
      const cal = build(spec);
      const a = fromEpochDay(BASE + x);
      const expected = inclusive === 'both' ? diffDays(a, a, { mode: 'calendar', inclusive: 'both' }) : 0;
      expect(diffDays(a, a, { mode: 'calendar', inclusive, calendar: cal })).toBe(expected);
      expect(expected).toBe(inclusive === 'both' ? 1 : 0);
    }), { numRuns: 100 });
  });

  it('addBusinessDays matches stepping and inverts diffDays', () => {
    const withWork = arbSpec.filter((s) => s.weekend.length < 7);
    fc.assert(fc.property(withWork, fc.integer({ min: 0, max: SPAN - 1 }), fc.integer({ min: -40, max: 40 }).filter((n) => n !== 0), (spec, x, n) => {
      const cal = build(spec);
      const status = oracle(spec);
      let e = BASE + x;
      for (let left = Math.abs(n); left > 0;) {
        e += n > 0 ? 1 : -1;
        if (status(e).status !== 0) left--;
      }
      const start = fromEpochDay(BASE + x);
      const result = addBusinessDays(start, n, cal);
      expect(toEpochDay(result)).toBe(e);
      expect(isBusinessDay(result, cal)).toBe(true);
      expect(diffDays(start, result, { mode: 'business', inclusive: n > 0 ? 'end' : 'start', halfDayValue: 1, calendar: cal })).toBe(n);
      expect([...listBusinessDays(start, result, cal)].length - 1).toBeLessThanOrEqual(Math.abs(n));
    }), { numRuns: 300 });
  });

  it('agrees with per-day checks across decades of rule-based holidays and is additive', () => {
    const cal = createBusinessCalendar({
      holidays: [
        fixedHoliday('New Year', 1, 1, { observed: 'nearest-weekday' }),
        lastWeekdayHoliday('Memorial', 5, 1),
        fixedHoliday('Independence', 7, 4, { observed: 'nearest-weekday' }),
        nthWeekdayHoliday('Thanksgiving', 11, 4, 4),
        fixedHoliday('Christmas Eve', 12, 24, { halfDay: true }),
        fixedHoliday('Christmas', 12, 25, { observed: 'next-weekday' }),
        fixedHoliday('Boxing', 12, 26, { observed: 'next-weekday' }),
        easterHoliday('Good Friday', -2),
      ],
      exceptions: [{ date: '2031-03-01', working: true }],
    });
    const arbDay = fc.integer({ min: toEpochDay(plainDate(1990, 1, 1)), max: toEpochDay(plainDate(2060, 12, 31)) });
    fc.assert(fc.property(arbDay, fc.integer({ min: -3000, max: 3000 }), arbDay, (a, len, c) => {
      const b = a + len;
      let n = 0;
      for (const e of datesIn(a, b, 'start')) if (isBusinessDay(fromEpochDay(e), cal)) n++;
      const sign = b < a ? -1 : 1;
      expect(diffDays(fromEpochDay(a), fromEpochDay(b), { mode: 'business', halfDayValue: 1, calendar: cal })).toBe(sign * n || 0);
      const d = (p: number, q: number): number => diffDays(fromEpochDay(p), fromEpochDay(q), { mode: 'business', calendar: cal });
      expect(d(a, c)).toBeCloseTo(d(a, b) + d(b, c), 9);
    }), { numRuns: 60 });
  });
});
