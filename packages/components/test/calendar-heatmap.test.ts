import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CalendarHeatmap, type CalendarHeatmapOptions } from '@absoluteui/components/calendar-heatmap';

// R20 P11 (docs/PLAN-R20.md): Calendar Heatmap. Written with the component; run in P12 (R20-9).
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(width = 900): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('width', `${String(width)}px`);
  document.body.append(el);
  return el;
}

const focused = (): string | null | undefined => document.activeElement?.getAttribute('aria-label');
const cells = (el: SVGSVGElement): SVGRectElement[] => [...el.querySelectorAll<SVGRectElement>('.aui-calendar-heatmap__cell')];

const base: CalendarHeatmapOptions = {
  label: 'Absences',
  from: plainDate(2026, 1, 1),
  to: plainDate(2026, 1, 31),
  data: [
    { date: plainDate(2026, 1, 5), value: 3 },
    { date: plainDate(2026, 1, 6), value: 9 },
    { date: plainDate(2026, 1, 7), value: null },
  ],
  locale: 'en-GB',
};

describe('CalendarHeatmap', () => {
  it('draws one labelled cell per day, weeks as columns from the locale week start', () => {
    const chart = CalendarHeatmap.create(host(), base);
    const all = cells(chart.element);
    expect(all).toHaveLength(31);
    expect(all[4]?.getAttribute('aria-label')).toBe('Mon, 5 Jan 2026: 3');
    expect(all[6]?.getAttribute('aria-label')).toBe('Wed, 7 Jan 2026: No value');
    // en-GB weeks start on Monday: 1 January 2026 (a Thursday) is in row 3.
    const y = (i: number): number => Number(all[i]?.getAttribute('y'));
    expect(y(4)).toBeLessThan(y(0));
    expect(chart.summary).toContain('2 days with values');
    expect(chart.summary).toContain('Total 12.');
  });

  it('marks non-working days and holidays from a business calendar', () => {
    const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 1, 1), name: 'New Year' }] });
    const chart = CalendarHeatmap.create(host(), { ...base, businessCalendar: calendar, dataTable: 'visible' });
    const all = cells(chart.element);
    expect(all[0]?.classList.contains('aui-calendar-heatmap__cell--holiday')).toBe(true);
    expect(all[0]?.getAttribute('aria-label')).toBe('Thu, 1 Jan 2026: No value, Holiday: New Year');
    expect(all[2]?.classList.contains('aui-calendar-heatmap__cell--off')).toBe(true);
    expect(chart.summary).toContain('Non-working days: 10; holidays: 1.');
    expect(chart.host.querySelector('.aui-chart__table thead')?.textContent).toBe('DateValueDay type');
    expect(chart.host.querySelectorAll('.aui-chart__legend-entry').length).toBe(5 + 3);
  });

  it('moves by day, week, and month with the keyboard', async () => {
    const chart = CalendarHeatmap.create(host(), { ...base, to: plainDate(2026, 3, 31) });
    // Roving tabindex: only the first day is focusable; reach Mon 5 Jan with the keyboard.
    chart.element.querySelector<SVGElement>('[tabindex="0"]')?.focus();
    expect(focused()).toMatch(/^Thu, 1 Jan 2026/);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(focused()).toMatch(/^Mon, 5 Jan 2026/);
    await userEvent.keyboard('{ArrowDown}');
    expect(focused()).toMatch(/^Tue, 6 Jan 2026/);
    await userEvent.keyboard('{ArrowRight}');
    expect(focused()).toMatch(/^Tue, 13 Jan 2026/);
    await userEvent.keyboard('{Home}');
    expect(focused()).toMatch(/^Mon, 12 Jan 2026/);
    await userEvent.keyboard('{PageDown}');
    expect(focused()).toMatch(/^Thu, 12 Feb 2026/);
  });

  it('swaps week keys in RTL, validates options, and keeps state on invalid updates', async () => {
    const chart = CalendarHeatmap.create(host(), { ...base, direction: 'rtl' });
    // Roving tabindex: only the first day is focusable; reach Mon 5 Jan with the keyboard.
    chart.element.querySelector<SVGElement>('[tabindex="0"]')?.focus();
    expect(focused()).toMatch(/^Thu, 1 Jan 2026/);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(focused()).toMatch(/^Mon, 5 Jan 2026/);
    await userEvent.keyboard('{ArrowLeft}');
    expect(focused()).toMatch(/^Mon, 12 Jan 2026/);
    expect(() => CalendarHeatmap.create(host(), { ...base, from: plainDate(2026, 2, 1) })).toThrow(AbsoluteUIError);
    expect(() => CalendarHeatmap.create(host(), { ...base, firstDayOfWeek: 8 })).toThrow(AbsoluteUIError);
    expect(() => { chart.update({ colorScale: { steps: 12 } }); }).toThrow(AbsoluteUIError);
    expect(cells(chart.element)).toHaveLength(31);
  });

  it('shows a whole year and an empty state without data', () => {
    const year = CalendarHeatmap.create(host(), { label: 'Year', year: 2026, data: [{ date: plainDate(2026, 6, 1), value: 1 }] });
    expect(cells(year.element)).toHaveLength(365);
    const empty = CalendarHeatmap.create(host(), { label: 'Nothing', data: [] });
    expect(empty.host.querySelector('.aui-chart__empty')?.textContent).toBe('No data');
  });
});
