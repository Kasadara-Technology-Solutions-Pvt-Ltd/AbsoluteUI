import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { Calendar, isoWeekNumber, type CalendarChangeDetail, type CalendarNavigateDetail, type CalendarOptions } from '@absoluteui/components/calendar';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const TODAY = plainDate(2026, 9, 27);

function mount(options: CalendarOptions = {}): Calendar {
  const host = document.createElement('div');
  document.body.append(host);
  return Calendar.create(host, { today: TODAY, locale: 'en-US', ...options });
}

const days = (c: Calendar): HTMLTableCellElement[] => Array.from(c.grid.querySelectorAll<HTMLTableCellElement>('td.aui-calendar__day:not(.aui-calendar__day--empty)'));
const cell = (c: Calendar, label: string): HTMLTableCellElement => {
  const td = days(c).find((d) => d.getAttribute('aria-label') === label);
  if (!td) throw new Error(`No cell ${label}`);
  return td;
};
const focusedLabel = (): string | null => (document.activeElement instanceof HTMLTableCellElement ? document.activeElement.getAttribute('aria-label') : null);
const weekdays = (c: Calendar): string[] => Array.from(c.grid.querySelectorAll('th.aui-calendar__weekday')).map((th) => th.textContent);
const heading = (c: Calendar): string => c.host.querySelector('.aui-calendar__heading')!.textContent;
const iso = (d: PlainDate | null): string | null => (d ? plainDateToString(d) : null);

describe('Calendar: structure and ARIA', () => {
  it('renders an APG date grid with localized headers and full-date cell names', () => {
    const c = mount({ value: plainDate(2026, 9, 10) });
    expect(c.grid.getAttribute('role')).toBe('grid');
    expect(heading(c)).toBe('September 2026');
    expect(c.host.querySelector('.aui-calendar__heading')!.getAttribute('aria-live')).toBe('polite');
    expect(document.getElementById(c.grid.getAttribute('aria-labelledby')!)!.textContent).toBe('September 2026');
    const ths = Array.from(c.grid.querySelectorAll<HTMLTableCellElement>('th.aui-calendar__weekday'));
    expect(ths.every((th) => th.scope === 'col')).toBe(true);
    expect(ths[0]!.textContent).toBe('Sun');
    expect(ths[0]!.abbr).toBe('Sunday');
    const selected = cell(c, 'Thursday, September 10, 2026');
    expect(selected.getAttribute('aria-selected')).toBe('true');
    expect(selected.textContent).toBe('10');
    expect(c.grid.querySelectorAll('[aria-selected="true"]')).toHaveLength(1);
    expect(cell(c, 'Sunday, September 27, 2026').getAttribute('aria-current')).toBe('date');
    expect(c.grid.querySelectorAll('[aria-current]')).toHaveLength(1);
  });

  it('keeps exactly one day tabbable (roving tabindex) on the selected day', () => {
    const c = mount({ value: plainDate(2026, 9, 10) });
    const tabbable = days(c).filter((d) => d.tabIndex === 0);
    expect(tabbable).toHaveLength(1);
    expect(tabbable[0]!.getAttribute('aria-label')).toBe('Thursday, September 10, 2026');
    expect(days(c).every((d) => d === tabbable[0] || d.tabIndex === -1)).toBe(true);
  });

  it('labels navigation buttons and uses an explicit grid label when given', () => {
    const c = mount({ label: 'Departure date' });
    expect(c.host.querySelector('.aui-calendar__prev')!.getAttribute('aria-label')).toBe('Previous month');
    expect(c.host.querySelector('.aui-calendar__next')!.getAttribute('aria-label')).toBe('Next month');
    expect(c.grid.getAttribute('aria-label')).toBe('Departure date');
    expect(c.grid.hasAttribute('aria-labelledby')).toBe(false);
  });

  it('hides outside days when configured, and shows them by default', () => {
    const shown = mount({ focusedDate: plainDate(2026, 9, 1) });
    // September 2026 starts on a Tuesday: two leading August days in en-US.
    expect(days(shown)[0]!.getAttribute('aria-label')).toBe('Sunday, August 30, 2026');
    expect(days(shown)[0]!.classList.contains('aui-calendar__day--outside')).toBe(true);
    configureAbsoluteUI({ components: { calendar: { showOutsideDays: false } } });
    expect(days(shown)[0]!.getAttribute('aria-label')).toBe('Tuesday, September 1, 2026');
    expect(shown.grid.querySelectorAll('td.aui-calendar__day--empty').length).toBeGreaterThan(0);
  });

  it('shows ISO week numbers as row headers', () => {
    const c = mount({ focusedDate: plainDate(2026, 1, 1), showWeekNumbers: true, firstDayOfWeek: 1 });
    const rows = Array.from(c.grid.querySelectorAll<HTMLTableCellElement>('tbody tr:not([hidden]) th.aui-calendar__week-number'));
    expect(rows[0]!.scope).toBe('row');
    // 2026-01-01 is a Thursday in ISO week 1; 2025-12-29 (Monday) starts that week.
    expect(rows.map((r) => r.textContent)).toEqual(['1', '2', '3', '4', '5']);
    expect(rows[0]!.getAttribute('aria-label')).toBe('Week 1');
    expect(isoWeekNumber(plainDate(2020, 12, 31))).toBe(53);
    expect(isoWeekNumber(plainDate(2021, 1, 3))).toBe(53);
    expect(isoWeekNumber(plainDate(2021, 1, 4))).toBe(1);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Calendar.create(host, { min: plainDate(2026, 5, 1), max: plainDate(2026, 4, 1) })).toThrow(AbsoluteUIError);
    expect(() => Calendar.create(host, { firstDayOfWeek: 8 as 7 })).toThrow(/firstDayOfWeek/);
    expect(() => Calendar.create(host, { label: ' ' })).toThrow(/label/);
    expect(() => Calendar.create(host, { timezone: 'Mars/Olympus' })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
  });
});

describe('Calendar: week start by locale', () => {
  it('starts on Sunday for en-US, Monday for de-DE, Saturday for ar-EG', () => {
    expect(weekdays(mount({ locale: 'en-US' }))[0]).toBe('Sun');
    expect(mount({ locale: 'de-DE' }).grid.querySelector<HTMLTableCellElement>('th.aui-calendar__weekday')!.abbr).toBe('Montag');
    const ar = mount({ locale: 'ar-EG' });
    expect(ar.grid.querySelector<HTMLTableCellElement>('th.aui-calendar__weekday')!.abbr).toBe('السبت');
  });

  it('honours an explicit firstDayOfWeek', () => {
    expect(weekdays(mount({ locale: 'en-US', firstDayOfWeek: 1 }))[0]).toBe('Mon');
  });
});

describe('Calendar: today in the configured timezone (fixed instants)', () => {
  it('uses the configured zone, never the machine zone, around UTC midnight', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 10:30 UTC on 15 March 2026 is 00:30 on 16 March in Kiritimati (UTC+14)
    // and 23:30 on 14 March in Pago Pago (UTC-11).
    vi.setSystemTime(Date.UTC(2026, 2, 15, 10, 30));
    const host = (): HTMLElement => document.body.appendChild(document.createElement('div'));
    const east = Calendar.create(host(), { timezone: 'Pacific/Kiritimati', locale: 'en-US' });
    const west = Calendar.create(host(), { timezone: 'Pacific/Pago_Pago', locale: 'en-US' });
    const utc = Calendar.create(host(), { locale: 'en-US' });
    expect(iso(east.today)).toBe('2026-03-16');
    expect(iso(west.today)).toBe('2026-03-14');
    expect(iso(utc.today)).toBe('2026-03-15');
    expect(east.grid.querySelector('[aria-current="date"]')!.getAttribute('aria-label')).toBe('Monday, March 16, 2026');
    expect(west.grid.querySelector('[aria-current="date"]')!.getAttribute('aria-label')).toBe('Saturday, March 14, 2026');
    // Without a value, today is the initially focused day.
    expect(iso(east.focusedDate)).toBe('2026-03-16');
  });

  it('follows the common timezone from global configuration', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 2, 15, 10, 30));
    configureAbsoluteUI({ common: { timezone: 'Pacific/Kiritimati' } });
    const c = Calendar.create(document.body.appendChild(document.createElement('div')), { locale: 'en-US' });
    expect(iso(c.today)).toBe('2026-03-16');
  });
});

describe('Calendar: keyboard', () => {
  async function focusOn(c: Calendar, label: string): Promise<void> {
    await userEvent.click(cell(c, label));
    expect(focusedLabel()).toBe(label);
  }

  it('moves by day, week, week edges, month, and year', async () => {
    const c = mount({ focusedDate: plainDate(2026, 9, 16) });
    await focusOn(c, 'Wednesday, September 16, 2026');
    const steps: [string, string][] = [
      ['{ArrowRight}', 'Thursday, September 17, 2026'],
      ['{ArrowLeft}', 'Wednesday, September 16, 2026'],
      ['{ArrowDown}', 'Wednesday, September 23, 2026'],
      ['{ArrowUp}', 'Wednesday, September 16, 2026'],
      ['{Home}', 'Sunday, September 13, 2026'],
      ['{End}', 'Saturday, September 19, 2026'],
      ['{PageDown}', 'Monday, October 19, 2026'],
      ['{PageUp}', 'Saturday, September 19, 2026'],
      ['{Shift>}{PageDown}{/Shift}', 'Sunday, September 19, 2027'],
      ['{Shift>}{PageUp}{/Shift}', 'Saturday, September 19, 2026'],
    ];
    for (const [keys, label] of steps) {
      await userEvent.keyboard(keys);
      expect(focusedLabel(), keys).toBe(label);
      expect(days(c).filter((d) => d.tabIndex === 0).map((d) => d.getAttribute('aria-label'))).toEqual([label]);
    }
  });

  it('respects firstDayOfWeek for Home and End', async () => {
    const c = mount({ locale: 'de-DE', focusedDate: plainDate(2026, 9, 16) });
    await userEvent.click(c.grid.querySelector<HTMLElement>('td[tabindex="0"]')!);
    await userEvent.keyboard('{Home}');
    expect(iso(c.focusedDate)).toBe('2026-09-14');
    await userEvent.keyboard('{End}');
    expect(iso(c.focusedDate)).toBe('2026-09-20');
  });

  it('clamps the day when paging months and handles leap years', async () => {
    const c = mount({ focusedDate: plainDate(2024, 1, 31) });
    await focusOn(c, 'Wednesday, January 31, 2024');
    await userEvent.keyboard('{PageDown}');
    expect(focusedLabel()).toBe('Thursday, February 29, 2024');
    expect(heading(c)).toBe('February 2024');
    await userEvent.keyboard('{Shift>}{PageDown}{/Shift}');
    expect(focusedLabel()).toBe('Friday, February 28, 2025');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedLabel()).toBe('Saturday, March 1, 2025');
  });

  it('crosses month boundaries with arrows and emits aui-navigate', async () => {
    const c = mount({ focusedDate: plainDate(2026, 9, 30) });
    const onNavigate = vi.fn();
    c.host.addEventListener('aui-navigate', (e) => {
      onNavigate((e as CustomEvent<CalendarNavigateDetail>).detail);
    });
    await focusOn(c, 'Wednesday, September 30, 2026');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedLabel()).toBe('Thursday, October 1, 2026');
    expect(heading(c)).toBe('October 2026');
    expect(c.visibleMonth).toEqual({ year: 2026, month: 10 });
    expect(onNavigate).toHaveBeenCalledExactlyOnceWith({ month: { year: 2026, month: 10 } });
  });

  it('mirrors Left/Right in RTL', async () => {
    const c = mount({ direction: 'rtl', focusedDate: plainDate(2026, 9, 16) });
    expect(c.grid.dir).toBe('rtl');
    await focusOn(c, 'Wednesday, September 16, 2026');
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedLabel()).toBe('Thursday, September 17, 2026');
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(focusedLabel()).toBe('Tuesday, September 15, 2026');
  });

  it('selects with Enter and Space and emits a bubbling aui-change', async () => {
    const c = mount({ focusedDate: plainDate(2026, 9, 16) });
    const onChange = vi.fn();
    document.body.addEventListener('aui-change', (e) => {
      onChange(iso((e as CustomEvent<CalendarChangeDetail>).detail.value));
    });
    await focusOn(c, 'Wednesday, September 16, 2026');
    expect(onChange).toHaveBeenLastCalledWith('2026-09-16');
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(iso(c.value)).toBe('2026-09-17');
    await userEvent.keyboard('{ArrowRight} ');
    expect(iso(c.value)).toBe('2026-09-18');
    expect(cell(c, 'Friday, September 18, 2026').getAttribute('aria-selected')).toBe('true');
    expect(onChange).toHaveBeenCalledTimes(3);
  });

  it('moves to the adjacent month when an outside day is clicked', async () => {
    const c = mount({ focusedDate: plainDate(2026, 9, 1) });
    await userEvent.click(cell(c, 'Sunday, August 30, 2026'));
    expect(iso(c.value)).toBe('2026-08-30');
    expect(heading(c)).toBe('August 2026');
    expect(focusedLabel()).toBe('Sunday, August 30, 2026');
  });

  it('pages months with the header buttons while keeping focus on them', async () => {
    const c = mount({ focusedDate: plainDate(2026, 9, 16) });
    const next = c.host.querySelector<HTMLButtonElement>('.aui-calendar__next')!;
    await userEvent.click(next);
    expect(heading(c)).toBe('October 2026');
    expect(document.activeElement).toBe(next);
    await userEvent.click(c.host.querySelector<HTMLButtonElement>('.aui-calendar__prev')!);
    expect(heading(c)).toBe('September 2026');
  });
});

describe('Calendar: min, max, and disabled days', () => {
  it('disables out-of-range and consumer-disabled days (focusable, not selectable)', async () => {
    const weekend = (d: PlainDate): boolean => new Date(Date.UTC(d.year, d.month - 1, d.day)).getUTCDay() % 6 === 0;
    const c = mount({ focusedDate: plainDate(2026, 9, 16), min: plainDate(2026, 9, 10), max: plainDate(2026, 9, 25), isDateDisabled: weekend });
    const onChange = vi.fn();
    c.host.addEventListener('aui-change', onChange);
    expect(cell(c, 'Wednesday, September 9, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(c, 'Saturday, September 26, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(c, 'Saturday, September 19, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(c, 'Friday, September 18, 2026').hasAttribute('aria-disabled')).toBe(false);
    await userEvent.click(cell(c, 'Wednesday, September 16, 2026'));
    onChange.mockClear();
    await userEvent.keyboard('{End}');
    expect(focusedLabel()).toBe('Saturday, September 19, 2026');
    await userEvent.keyboard('{Enter}');
    expect(onChange).not.toHaveBeenCalled();
    expect(iso(c.value)).toBe('2026-09-16');
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    cell(c, 'Saturday, September 19, 2026').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(onChange).not.toHaveBeenCalled();
  });

  it('keeps focus within min and max and disables month buttons at the edges', async () => {
    const c = mount({ focusedDate: plainDate(2026, 9, 16), min: plainDate(2026, 9, 10), max: plainDate(2026, 10, 5) });
    const prev = c.host.querySelector<HTMLButtonElement>('.aui-calendar__prev')!;
    const next = c.host.querySelector<HTMLButtonElement>('.aui-calendar__next')!;
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    expect(next.hasAttribute('aria-disabled')).toBe(false);
    await userEvent.click(cell(c, 'Wednesday, September 16, 2026'));
    await userEvent.keyboard('{PageUp}');
    expect(focusedLabel()).toBe('Thursday, September 10, 2026');
    await userEvent.keyboard('{PageDown}');
    expect(focusedLabel()).toBe('Monday, October 5, 2026');
    expect(next.getAttribute('aria-disabled')).toBe('true');
  });
});

describe('Calendar: programmatic API', () => {
  it('setValue and goTo change state without events', () => {
    const c = mount();
    const onEvent = vi.fn();
    c.host.addEventListener('aui-change', onEvent);
    c.host.addEventListener('aui-navigate', onEvent);
    c.setValue(plainDate(2027, 2, 14));
    expect(heading(c)).toBe('February 2027');
    expect(cell(c, 'Sunday, February 14, 2027').getAttribute('aria-selected')).toBe('true');
    c.goTo(plainDate(2020, 2, 29));
    expect(c.visibleMonth).toEqual({ year: 2020, month: 2 });
    expect(iso(c.focusedDate)).toBe('2020-02-29');
    expect(onEvent).not.toHaveBeenCalled();
  });

  it('re-renders on locale configuration changes', () => {
    const c = Calendar.create(document.body.appendChild(document.createElement('div')), { today: TODAY });
    configureAbsoluteUI({ common: { locale: 'de-DE' } });
    expect(heading(c)).toBe('September 2026');
    expect(c.grid.querySelector<HTMLTableCellElement>('th.aui-calendar__weekday')!.abbr).toBe('Montag');
  });

  it('destroy removes rendering, listeners, and subscriptions', async () => {
    const c = mount();
    const host = c.host;
    const grid = c.grid;
    const onChange = vi.fn();
    host.addEventListener('aui-change', onChange);
    c.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-calendar')).toBe(false);
    host.append(grid);
    await userEvent.click(grid.querySelector<HTMLElement>('td[tabindex="0"]')!);
    expect(onChange).not.toHaveBeenCalled();
    configureAbsoluteUI({ common: { locale: 'de-DE' } });
    expect(grid.querySelector('th.aui-calendar__weekday')!.textContent).toBe('Sun');
  });
});

describe('Calendar: several months (R2)', () => {
  const allDays = (c: Calendar): HTMLTableCellElement[] => c.grids.flatMap((g) => Array.from(g.querySelectorAll<HTMLTableCellElement>('td.aui-calendar__day:not(.aui-calendar__day--empty)')));
  const headings = (c: Calendar): string[] => Array.from(c.host.querySelectorAll('.aui-calendar__heading')).map((h) => h.textContent);

  it('renders one grid per month with one roving tab stop and no duplicated outside days', () => {
    const c = mount({ visibleMonths: 2, value: plainDate(2026, 1, 31) });
    expect(c.grids).toHaveLength(2);
    expect(c.grid).toBe(c.grids[0]);
    expect(headings(c)).toEqual(['January 2026', 'February 2026']);
    expect(c.host.querySelectorAll('[aria-live]')).toHaveLength(1);
    expect(allDays(c)).toHaveLength(31 + 28);
    expect(allDays(c).filter((d) => d.tabIndex === 0)).toHaveLength(1);
    expect(c.grids.map((g) => document.getElementById(g.getAttribute('aria-labelledby')!)!.textContent)).toEqual(['January 2026', 'February 2026']);
    expect(c.host.querySelector('.aui-calendar__months .aui-calendar__month:first-child .aui-calendar__prev')).not.toBeNull();
    expect(c.host.querySelector('.aui-calendar__months .aui-calendar__month:last-child .aui-calendar__next')).not.toBeNull();
  });

  it('gives each grid a distinct name when a label is set', () => {
    const c = mount({ visibleMonths: 2, label: 'Stay', value: plainDate(2026, 1, 5) });
    expect(c.grids.map((g) => g.getAttribute('aria-label'))).toEqual(['Stay, January 2026', 'Stay, February 2026']);
  });

  it('moves focus across grids without scrolling, and scrolls one month at the edge', async () => {
    const c = mount({ visibleMonths: 2, value: plainDate(2026, 1, 31) });
    const onNavigate = vi.fn();
    c.host.addEventListener('aui-navigate', onNavigate);
    c.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedLabel()).toBe('Sunday, February 1, 2026');
    expect(c.grids[1]!.contains(document.activeElement)).toBe(true);
    expect(onNavigate).not.toHaveBeenCalled();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(focusedLabel()).toBe('Sunday, March 1, 2026');
    expect(headings(c)).toEqual(['February 2026', 'March 2026']);
    expect((onNavigate.mock.calls[0]![0] as CustomEvent<CalendarNavigateDetail>).detail.month).toEqual({ year: 2026, month: 2 });
  });

  it('pages all months with the buttons and PageUp/PageDown', async () => {
    const c = mount({ visibleMonths: 2, value: plainDate(2026, 1, 10) });
    await userEvent.click(c.host.querySelector<HTMLElement>('.aui-calendar__next')!);
    expect(headings(c)).toEqual(['February 2026', 'March 2026']);
    expect(iso(c.focusedDate)).toBe('2026-02-10');
    c.focus();
    await userEvent.keyboard('{PageUp}{PageUp}');
    expect(headings(c)).toEqual(['December 2025', 'January 2026']);
    expect(focusedLabel()).toBe('Wednesday, December 10, 2025');
  });

  it('stops at max so the last month is never fully disabled', () => {
    const c = mount({ visibleMonths: 2, value: plainDate(2026, 5, 10), max: plainDate(2026, 6, 15) });
    expect(headings(c)).toEqual(['May 2026', 'June 2026']);
    expect(c.host.querySelector('.aui-calendar__next')!.getAttribute('aria-disabled')).toBe('true');
    c.goTo(plainDate(2026, 6, 20));
    expect(headings(c)).toEqual(['May 2026', 'June 2026']);
    expect(iso(c.focusedDate)).toBe('2026-06-15');
    c.goTo(plainDate(2026, 6, 1));
    expect(headings(c)).toEqual(['May 2026', 'June 2026']);
  });

  it('switches between one and several months through update()', () => {
    const c = mount({ value: plainDate(2026, 3, 5) });
    c.update({ visibleMonths: 2 });
    expect(c.grids).toHaveLength(2);
    expect(c.host.classList.contains('aui-calendar--multi')).toBe(true);
    c.update({ visibleMonths: 1 });
    expect(c.grids).toHaveLength(1);
    expect(c.host.firstElementChild!.classList.contains('aui-calendar__header')).toBe(true);
    expect(c.host.querySelector('.aui-calendar__header')!.children).toHaveLength(3);
  });

  it('validates visibleMonths', () => {
    const host = document.createElement('div');
    expect(() => Calendar.create(host, { visibleMonths: 4 })).toThrow(/visibleMonths/);
    expect(() => Calendar.create(host, { visibleMonths: 0 })).toThrow(/visibleMonths/);
  });
});

describe('Calendar: range selection (R2)', () => {
  const inRange = (c: Calendar): string[] => c.grids.flatMap((g) => Array.from(g.querySelectorAll('.aui-calendar__day--in-range'))).map((d) => d.textContent);
  const selected = (c: Calendar): string[] => c.grids.flatMap((g) => Array.from(g.querySelectorAll('[aria-selected="true"]'))).map((d) => d.textContent);

  it('marks a committed range: aria-selected on every day, named first and last days', () => {
    const c = mount({ selectionMode: 'range', range: { start: plainDate(2026, 9, 8), end: plainDate(2026, 9, 11) } });
    expect(c.grid.getAttribute('aria-multiselectable')).toBe('true');
    expect(selected(c)).toEqual(['8', '9', '10', '11']);
    expect(inRange(c)).toEqual(['8', '9', '10', '11']);
    expect(cell(c, 'Tuesday, September 8, 2026, start of range').classList.contains('aui-calendar__day--range-start')).toBe(true);
    expect(cell(c, 'Friday, September 11, 2026, end of range').classList.contains('aui-calendar__day--selected')).toBe(true);
    expect(iso(c.focusedDate)).toBe('2026-09-08');
  });

  it('first pick sets the anchor, the preview follows focus and pointer, the second pick completes', async () => {
    const c = mount({ selectionMode: 'range' });
    const onChange = vi.fn();
    c.host.addEventListener('aui-change', onChange);
    await userEvent.click(cell(c, 'Thursday, September 10, 2026'));
    expect(iso(c.rangeAnchor)).toBe('2026-09-10');
    expect(c.range).toBeNull();
    expect(onChange).not.toHaveBeenCalled();
    expect(selected(c)).toEqual(['10']);
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(inRange(c)).toEqual(['10', '11', '12']);
    expect(c.grid.querySelectorAll('.aui-calendar__day--preview')).toHaveLength(2);
    await userEvent.hover(cell(c, 'Monday, September 14, 2026'));
    expect(inRange(c)).toEqual(['10', '11', '12', '13', '14']);
    await userEvent.click(cell(c, 'Monday, September 14, 2026'));
    expect(c.rangeAnchor).toBeNull();
    expect([iso(c.range!.start), iso(c.range!.end)]).toEqual(['2026-09-10', '2026-09-14']);
    expect(Object.isFrozen(c.range)).toBe(true);
    const detail = (onChange.mock.calls[0]![0] as CustomEvent<CalendarChangeDetail>).detail;
    expect(iso(detail.value)).toBe('2026-09-14');
    expect([iso(detail.range!.start), iso(detail.range!.end)]).toEqual(['2026-09-10', '2026-09-14']);
    expect(c.grid.querySelectorAll('.aui-calendar__day--preview')).toHaveLength(0);
  });

  it('orders a range picked backwards and allows a one-day range', async () => {
    const c = mount({ selectionMode: 'range' });
    c.goTo(plainDate(2026, 9, 20));
    c.focus();
    await userEvent.keyboard('{Enter}{ArrowLeft}{ArrowLeft}{Enter}');
    expect([iso(c.range!.start), iso(c.range!.end)]).toEqual(['2026-09-18', '2026-09-20']);
    await userEvent.keyboard('{Enter}{Enter}');
    expect([iso(c.range!.start), iso(c.range!.end)]).toEqual(['2026-09-18', '2026-09-18']);
    expect(cell(c, 'Friday, September 18, 2026, start and end of range')).toBeTruthy();
  });

  it('disables ends that break minDays/maxDays while the anchor is pending', async () => {
    const c = mount({ selectionMode: 'range', minDays: 3, maxDays: 5 });
    await userEvent.click(cell(c, 'Thursday, September 10, 2026'));
    const disabled = Array.from(c.grid.querySelectorAll('[aria-disabled="true"]:not(.aui-calendar__day--outside)')).map((d) => d.textContent);
    expect(disabled).toEqual(expect.arrayContaining(['9', '10', '11', '15', '5']));
    expect(disabled).not.toContain('12');
    expect(disabled).not.toContain('14');
    expect(disabled).not.toContain('8');
    expect(disabled).not.toContain('6');
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    cell(c, 'Friday, September 11, 2026').click();
    expect(c.range).toBeNull();
    expect(iso(c.rangeAnchor)).toBe('2026-09-10');
    // A day that cannot end the range previews nothing beyond the anchor.
    await userEvent.hover(cell(c, 'Wednesday, September 16, 2026'));
    expect(inRange(c)).toEqual(['10']);
    await userEvent.click(cell(c, 'Saturday, September 12, 2026'));
    expect([iso(c.range!.start), iso(c.range!.end)]).toEqual(['2026-09-10', '2026-09-12']);
    expect(c.grid.querySelectorAll('[aria-disabled="true"]')).toHaveLength(0);
  });

  it('Escape discards a pending anchor; setRange replaces state without events', async () => {
    const c = mount({ selectionMode: 'range', range: { start: plainDate(2026, 9, 1), end: plainDate(2026, 9, 2) } });
    const onChange = vi.fn();
    c.host.addEventListener('aui-change', onChange);
    await userEvent.click(cell(c, 'Thursday, September 10, 2026'));
    await userEvent.keyboard('{Escape}');
    expect(c.rangeAnchor).toBeNull();
    expect(inRange(c)).toEqual(['1', '2']);
    c.setRange({ start: plainDate(2026, 10, 3), end: plainDate(2026, 10, 4) });
    expect(heading(c)).toBe('October 2026');
    expect(selected(c)).toEqual(['3', '4']);
    c.setRange(null);
    expect(selected(c)).toEqual([]);
    expect(onChange).not.toHaveBeenCalled();
  });

  it('validates range options', () => {
    const host = document.createElement('div');
    expect(() => Calendar.create(host, { selectionMode: 'multiple' as 'range' })).toThrow(/selectionMode/);
    expect(() => Calendar.create(host, { range: { start: plainDate(2026, 5, 2), end: plainDate(2026, 5, 1) } })).toThrow(/range/);
    expect(() => Calendar.create(host, { range: { start: plainDate(2026, 5, 2) } as unknown as { start: PlainDate; end: PlainDate } })).toThrow(/range/);
    expect(() => Calendar.create(host, { minDays: 0 })).toThrow(/minDays/);
    expect(() => Calendar.create(host, { minDays: 5, maxDays: 2 })).toThrow(/minDays/);
    expect(host.childElementCount).toBe(0);
  });

  it('keeps single selection unchanged when a range is passed in single mode', async () => {
    const c = mount({ range: { start: plainDate(2026, 9, 1), end: plainDate(2026, 9, 3) } });
    expect(c.grid.hasAttribute('aria-multiselectable')).toBe(false);
    expect(selected(c)).toEqual([]);
    await userEvent.click(cell(c, 'Thursday, September 10, 2026'));
    expect(iso(c.value)).toBe('2026-09-10');
  });
});
