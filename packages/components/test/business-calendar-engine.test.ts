// R5 H7: navigation and counting delegate to @absoluteui/helpers. They must agree with
// the engine's own day-by-day decision (`day().working`) for any calendar and range.
import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { addDays, comparePlainDate, plainDate, plainDateToString, type IsoWeekday, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar, type BusinessCalendarEngine } from '@absoluteui/components/business-calendar';

const date = fc.integer({ min: 0, max: 3000 }).map((n) => addDays(plainDate(2024, 1, 1), n));
const calendar = fc
  .record({
    workingDays: fc.uniqueArray(fc.integer({ min: 1, max: 7 }), { minLength: 1, maxLength: 7 }),
    holidays: fc.array(fc.record({ date, name: fc.constant('Holiday'), yearly: fc.boolean() }), { maxLength: 12 }),
    exceptions: fc.uniqueArray(fc.record({ date, working: fc.boolean() }), { maxLength: 8, selector: (e) => plainDateToString(e.date) }),
  })
  .map((def) => createBusinessCalendar({ ...def, workingDays: def.workingDays as IsoWeekday[] }));

function naiveBetween(engine: BusinessCalendarEngine, start: PlainDate, end: PlainDate): number {
  const sign = comparePlainDate(start, end) <= 0 ? 1 : -1;
  let a = sign > 0 ? start : end;
  const b = sign > 0 ? end : start;
  let n = 0;
  while (comparePlainDate(a, b) < 0) {
    if (engine.day(a).working) n++;
    a = addDays(a, 1);
  }
  return n * sign;
}

function naiveAdd(engine: BusinessCalendarEngine, from: PlainDate, days: number): PlainDate {
  let d = from;
  const dir = days < 0 ? -1 : 1;
  for (let left = Math.abs(days); left > 0; ) {
    d = addDays(d, dir);
    if (engine.day(d).working) left--;
  }
  return d;
}

describe('business calendar engine on helpers', () => {
  it('counts working days like a day-by-day walk', () => {
    fc.assert(fc.property(calendar, date, date, (engine, a, b) => engine.workingDaysBetween(a, b) === naiveBetween(engine, a, b)), { numRuns: 150 });
  });

  it('moves by working days like a day-by-day walk', () => {
    fc.assert(
      fc.property(calendar, date, fc.integer({ min: -60, max: 60 }), (engine, from, days) => {
        expect(plainDateToString(engine.addWorkingDays(from, days))).toBe(plainDateToString(naiveAdd(engine, from, days)));
      }),
      { numRuns: 150 },
    );
  });

  it('finds the next and previous working day', () => {
    fc.assert(
      fc.property(calendar, date, fc.boolean(), (engine, from, includeSelf) => {
        const next = engine.nextWorkingDay(from, includeSelf);
        const prev = engine.previousWorkingDay(from, includeSelf);
        expect(engine.day(next).working && engine.day(prev).working).toBe(true);
        expect(plainDateToString(next)).toBe(plainDateToString(includeSelf && engine.day(from).working ? from : naiveAdd(engine, from, 1)));
        expect(plainDateToString(prev)).toBe(plainDateToString(includeSelf && engine.day(from).working ? from : naiveAdd(engine, from, -1)));
      }),
      { numRuns: 150 },
    );
  });

  it('counts exactly over ranges longer than the old 100,000-day guard', () => {
    const engine = createBusinessCalendar();
    // 400 Gregorian years = 20,871 weeks: exactly 104,355 weekdays.
    expect(engine.workingDaysBetween(plainDate(2000, 1, 3), plainDate(2400, 1, 3))).toBe(104_355);
  });
});
