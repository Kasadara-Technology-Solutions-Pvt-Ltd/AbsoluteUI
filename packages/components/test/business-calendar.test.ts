import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, instantToString, parseInstant, plainDate, plainDateToString, plainTime, plainYearMonth, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  BusinessCalendar,
  createBusinessCalendar,
  type BusinessCalendarChangeDetail,
  type BusinessCalendarDefinition,
  type BusinessCalendarDaySelectDetail,
} from '@absoluteui/components/business-calendar';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

// Fixed dates only (§23.5). 2026-01-01 is a Thursday.
const definition: BusinessCalendarDefinition = {
  holidays: [
    { date: plainDate(2026, 1, 1), name: "New Year's Day", yearly: true },
    { date: plainDate(2026, 4, 3), name: 'Good Friday' },
    { date: plainDate(2026, 1, 3), name: 'Weekend holiday' },
  ],
  exceptions: [{ date: plainDate(2026, 1, 10), working: true, name: 'Stocktaking' }],
  weekdayHours: { '5': [{ start: plainTime(9), end: plainTime(13) }] },
};
const d = (y: number, m: number, day: number) => plainDate(y, m, day);
const s = (date: { year: number; month: number; day: number }) => plainDateToString(plainDate(date.year, date.month, date.day));

describe('business calendar engine', () => {
  const cal = createBusinessCalendar(definition);

  it('applies exception, then holiday, then the weekday pattern', () => {
    expect(cal.day(d(2026, 1, 1))).toMatchObject({ working: false, holiday: "New Year's Day", weekend: false, exception: false });
    expect(cal.day(d(2027, 1, 1)).holiday).toBe("New Year's Day");
    expect(cal.day(d(2027, 4, 3)).holiday).toBeNull();
    expect(cal.day(d(2026, 1, 3))).toMatchObject({ working: false, holiday: 'Weekend holiday', weekend: true });
    expect(cal.day(d(2026, 1, 10))).toMatchObject({ working: true, exception: true, reason: 'Stocktaking' });
    expect(cal.day(d(2026, 1, 5)).hours.map((h) => [h.start.hour, h.end.hour])).toEqual([[9, 17]]);
    expect(cal.day(d(2026, 1, 9)).hours.map((h) => [h.start.hour, h.end.hour])).toEqual([[9, 13]]);
    expect(cal.day(d(2026, 1, 4)).hours).toEqual([]);
  });

  it('adds and counts working days', () => {
    expect(s(cal.addWorkingDays(d(2025, 12, 31), 1))).toBe('2026-01-02');
    expect(s(cal.addWorkingDays(d(2026, 1, 2), 1))).toBe('2026-01-05');
    expect(s(cal.addWorkingDays(d(2026, 1, 5), -1))).toBe('2026-01-02');
    expect(s(cal.addWorkingDays(d(2026, 1, 9), 1))).toBe('2026-01-10');
    expect(s(cal.addWorkingDays(d(2026, 1, 5), 0))).toBe('2026-01-05');
    expect(cal.workingDaysBetween(d(2026, 1, 1), d(2026, 1, 12))).toBe(7);
    expect(cal.workingDaysBetween(d(2026, 1, 12), d(2026, 1, 1))).toBe(-7);
    expect(s(cal.nextWorkingDay(d(2026, 1, 3)))).toBe('2026-01-05');
    expect(s(cal.previousWorkingDay(d(2026, 1, 5), false))).toBe('2026-01-02');
  });

  it('turns working hours into instants in a timezone (DST day)', () => {
    const intervals = createBusinessCalendar().workingIntervals(d(2026, 3, 30), 'Europe/London');
    expect(intervals.map((r) => [instantToString(r.start), instantToString(r.end)])).toEqual([['2026-03-30T08:00:00.000Z', '2026-03-30T16:00:00.000Z']]);
    const cal2 = createBusinessCalendar({ hours: [{ start: plainTime(22), end: plainTime(0) }], workingDays: [1, 2, 3, 4, 5, 6, 7] });
    const [night] = cal2.workingIntervals(d(2026, 1, 5), 'UTC');
    expect(night && instantToString(night.end)).toBe('2026-01-06T00:00:00.000Z');
    expect(cal.isWorkingTime(parseInstant('2026-01-05T10:00:00Z')!, 'UTC')).toBe(true);
    expect(cal.isWorkingTime(parseInstant('2026-01-05T12:00:00Z')!, 'Asia/Kolkata')).toBe(false);
  });

  it('validates definitions and refuses endless searches', () => {
    expect(() => createBusinessCalendar({ workingDays: [0 as never] })).toThrow(/BUSINESS_CALENDAR_DEFINITION/);
    expect(() => createBusinessCalendar({ hours: [{ start: plainTime(10), end: plainTime(9) }] })).toThrow(AbsoluteUIError);
    expect(() => createBusinessCalendar({ hours: [{ start: plainTime(9), end: plainTime(12) }, { start: plainTime(11), end: plainTime(13) }] })).toThrow(/non-overlapping/);
    expect(() => createBusinessCalendar({ exceptions: [{ date: d(2026, 1, 1), working: true }, { date: d(2026, 1, 1), working: false }] })).toThrow(/one exception per date/);
    expect(() => createBusinessCalendar({ holidays: [{ date: d(2026, 1, 1), name: ' ' }] })).toThrow(/non-empty/);
    expect(() => createBusinessCalendar({ workingDays: [] }).addWorkingDays(d(2026, 1, 1), 1)).toThrow(/BUSINESS_CALENDAR_NO_WORKING_DAYS/);
  });
});

function mount(options: Partial<Parameters<typeof BusinessCalendar.create>[1]> = {}): { cal: BusinessCalendar; host: HTMLDivElement } {
  const host = document.createElement('div');
  document.body.append(host);
  const cal = BusinessCalendar.create(host, { label: 'Office days', definition, month: plainYearMonth(2026, 1), today: d(2026, 1, 6), locale: 'en-US', firstDayOfWeek: 1, ...options });
  return { cal, host };
}
const cell = (host: HTMLElement, label: RegExp): HTMLElement => [...host.querySelectorAll<HTMLElement>('td[aria-label]')].find((td) => label.test(td.getAttribute('aria-label') ?? ''))!;

describe('business calendar component', () => {
  it('renders one named grid per month with day kinds in the names', () => {
    const { host } = mount();
    const grids = host.querySelectorAll('table[role="grid"]');
    expect([...grids].map((g) => g.getAttribute('aria-label'))).toEqual(['Office days, January 2026', 'Office days, February 2026', 'Office days, March 2026']);
    expect(grids[0]?.getAttribute('aria-readonly')).toBe('true');
    expect(cell(host, /January 1, 2026/).getAttribute('aria-label')).toBe("Thursday, January 1, 2026, holiday: New Year's Day");
    expect(cell(host, /January 3, 2026/).getAttribute('aria-label')).toBe('Saturday, January 3, 2026, holiday: Weekend holiday');
    expect(cell(host, /January 4, 2026/).getAttribute('aria-label')).toBe('Sunday, January 4, 2026, non-working day');
    expect(cell(host, /January 5, 2026/).getAttribute('aria-label')).toBe('Monday, January 5, 2026, working day');
    expect(cell(host, /January 10, 2026/).getAttribute('aria-label')).toBe('Saturday, January 10, 2026, working day (changed): Stocktaking');
    expect(cell(host, /January 6, 2026/).getAttribute('aria-current')).toBe('date');
    expect(host.querySelectorAll('[tabindex="0"]')).toHaveLength(1);
    expect(host.querySelector('.aui-business-calendar__range')?.textContent).toBe('January 2026 to March 2026');
    expect([...host.querySelectorAll('.aui-business-calendar__holiday-list li')].map((li) => li.textContent)).toEqual(["Thu, Jan 1: New Year's Day", 'Sat, Jan 3: Weekend holiday']);
    expect(host.querySelectorAll('.aui-business-calendar__legend li')).toHaveLength(4);
  });

  it('moves the roving focus with arrows across months and pages with PageDown', async () => {
    const { cal, host } = mount({ months: 1 });
    cal.focus();
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/January 6, 2026/);
    await userEvent.keyboard('{ArrowRight}{ArrowDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/January 14, 2026/);
    const navigations: string[] = [];
    host.addEventListener('aui-navigate', (e) => navigations.push(JSON.stringify((e as CustomEvent<{ month: unknown }>).detail.month)));
    await userEvent.keyboard('{PageDown}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/February 14, 2026/);
    expect(navigations).toHaveLength(1);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/Monday, February 9, 2026/);
  });

  it('mirrors Left/Right in RTL', async () => {
    const { cal } = mount({ months: 1, direction: 'rtl' });
    cal.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement?.getAttribute('aria-label')).toMatch(/January 7, 2026/);
  });

  it('edit mode toggles days, emits the updated definition, and removes an exception that matches the pattern', async () => {
    const { cal, host } = mount({ editable: true, months: 1 });
    const changes: BusinessCalendarChangeDetail[] = [];
    const selects: BusinessCalendarDaySelectDetail[] = [];
    host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<BusinessCalendarChangeDetail>).detail));
    host.addEventListener('aui-day-select', (e) => selects.push((e as CustomEvent<BusinessCalendarDaySelectDetail>).detail));
    expect(host.querySelector('table')?.hasAttribute('aria-readonly')).toBe(false);
    cal.focus();
    await userEvent.keyboard('{Enter}');
    expect(changes.at(-1)?.working).toBe(false);
    expect(cal.definition.exceptions?.map((x) => [s(x.date), x.working])).toEqual([['2026-01-06', false], ['2026-01-10', true]]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Tuesday, January 6, 2026, non-working day (changed)');
    await userEvent.keyboard(' ');
    expect(cal.definition.exceptions?.map((x) => s(x.date))).toEqual(['2026-01-10']);
    expect(selects).toHaveLength(2);
    // A holiday made working keeps its name.
    cell(host, /January 1, 2026/).click();
    expect(cell(host, /January 1, 2026/).getAttribute('aria-label')).toBe("Thursday, January 1, 2026, working day (changed): New Year's Day");
    expect(cal.engine.isWorkingDay(d(2026, 1, 1))).toBe(true);
  });

  it('read-only mode only selects', () => {
    const { cal, host } = mount({ months: 1 });
    let changed = false;
    host.addEventListener('aui-change', () => {
      changed = true;
    });
    cell(host, /January 5, 2026/).click();
    expect(changed).toBe(false);
    expect(cal.engine.isWorkingDay(d(2026, 1, 5))).toBe(true);
  });

  it('updates, validates options, and cleans up', () => {
    const { cal, host } = mount({ months: 2, showLegend: false });
    expect(host.querySelector<HTMLElement>('.aui-business-calendar__legend')?.hidden).toBe(true);
    cal.update({ months: 12 });
    expect(host.querySelectorAll('table')).toHaveLength(12);
    cal.update({ definition: { workingDays: [1, 2, 3, 4, 5, 6] } });
    expect(cell(host, /January 3, 2026/).getAttribute('aria-label')).toBe('Saturday, January 3, 2026, working day');
    cal.goTo(d(2027, 6, 1));
    expect(cal.visibleMonth).toEqual(plainYearMonth(2026, 7));
    expect(() => BusinessCalendar.create(document.createElement('div'), { label: '' })).toThrow(/BUSINESS_CALENDAR_OPTIONS/);
    expect(() => { cal.update({ months: 13 }); }).toThrow(AbsoluteUIError);
    cal.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });
});
