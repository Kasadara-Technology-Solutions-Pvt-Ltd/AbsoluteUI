import { test, type Page } from '@playwright/test';
import { withinBudget } from './budget.js';

// R3 phase 3a performance budgets (metadata/<component>/component.json, SPEC section 15.2).
// Runs in the "performance" project, after all functional tests, one worker.
// Each measurement is the median of 5 runs after one warm-up.

async function open(page: Page, path: string): Promise<void> {
  await page.goto(path);
  await page.waitForFunction(() => (window as unknown as { __auiReady?: boolean }).__auiReady === true);
}

test.describe('scheduler and scheduling picker performance', () => {
  test('scheduler: week with 300 events < 120 ms; next month with 1,000 events < 120 ms; timeline with 500 resources < 150 ms', async ({ page }) => {
    await open(page, '/scheduling');
    const results = await page.evaluate(() => {
      interface S { next(): void; destroy(): void }
      interface Instant { kind: 'Instant'; epochMilliseconds: number }
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as { __aui: { Scheduler: { create(host: HTMLElement, o: unknown): S }; parseRecurrenceRule(t: string): unknown } }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const at = (ms: number): Instant => ({ kind: 'Instant', epochMilliseconds: ms });
      const base = Date.UTC(2026, 8, 28, 7);
      const make = (n: number, days: number, recurring = 0, resources = 0): unknown[] => Array.from({ length: n }, (_, i) => {
        const start = base + (i % days) * 86_400_000 + ((i * 37) % 600) * 60_000;
        return {
          id: `e${String(i)}`,
          title: `Event ${String(i)}`,
          start: at(start),
          end: at(start + (30 + (i % 4) * 30) * 60_000),
          ...(i < recurring ? { recurrence: aui.parseRecurrenceRule('FREQ=WEEKLY'), timeZone: 'Europe/London' } : {}),
          ...(resources ? { resourceId: `r${String(i % resources)}` } : {}),
        };
      });
      const time = (fn: () => void): number => {
        const t = performance.now();
        fn();
        return performance.now() - t;
      };
      const host = (): HTMLElement => {
        const el = document.createElement('div');
        document.body.append(el);
        return el;
      };
      const week: number[] = [];
      const month: number[] = [];
      const timeline: number[] = [];
      const weekEvents = make(300, 7);
      const monthEvents = make(1000, 60, 200);
      const resources = Array.from({ length: 500 }, (_, i) => ({ id: `r${String(i)}`, label: `Resource ${String(i)}` }));
      const timelineEvents = make(2000, 1, 0, 500);
      const date = { kind: 'PlainDate', year: 2026, month: 9, day: 29 };
      for (let i = 0; i < 6; i++) {
        let s: S | null = null;
        const w = time(() => {
          s = aui.Scheduler.create(host(), { label: 'w', events: weekEvents, date, view: 'week', timezone: 'Europe/London' });
        });
        if (i > 0) week.push(w);
        (s as S | null)?.destroy();
        const m = aui.Scheduler.create(host(), { label: 'm', events: monthEvents, date, view: 'month', timezone: 'Europe/London' });
        const n = time(() => {
          m.next();
        });
        if (i > 0) month.push(n);
        m.destroy();
        let tl: S | null = null;
        const t = time(() => {
          tl = aui.Scheduler.create(host(), { label: 't', events: timelineEvents, resources, date, view: 'timeline', timezone: 'Europe/London' });
        });
        if (i > 0) timeline.push(t);
        (tl as S | null)?.destroy();
      }
      return { week: median(week), month: median(month), timeline: median(timeline) };
    });
    withinBudget(results.week, 120, 'results.week');
    withinBudget(results.month, 120, 'results.month');
    withinBudget(results.timeline, 150, 'results.timeline');
  });

  test('pickers: business calendar with 12 months < 40 ms; recurrence picker < 15 ms; schedule picker with recurrence < 30 ms', async ({ page }) => {
    await open(page, '/scheduling');
    const results = await page.evaluate(() => {
      interface D { destroy(): void }
      interface Factory { create(host: HTMLElement, o: unknown): D }
      // Safe: the harness page exposes the component classes on window.__aui.
      const aui = (window as unknown as { __aui: { BusinessCalendar: Factory; RecurrencePicker: Factory; SchedulePicker: Factory; parseRecurrenceRule(t: string): unknown } }).__aui;
      const median = (runs: number[]): number => runs.sort((a, b) => a - b)[Math.floor(runs.length / 2)] ?? Number.NaN;
      const measure = (factory: Factory, options: unknown): number => {
        const runs: number[] = [];
        for (let i = 0; i < 6; i++) {
          const el = document.createElement('div');
          document.body.append(el);
          const t = performance.now();
          const c = factory.create(el, options);
          const ms = performance.now() - t;
          if (i > 0) runs.push(ms);
          c.destroy();
          el.remove();
        }
        return median(runs);
      };
      const start = { kind: 'PlainDateTime', date: { kind: 'PlainDate', year: 2026, month: 9, day: 29 }, time: { kind: 'PlainTime', hour: 9, minute: 0, second: 0, millisecond: 0 } };
      return {
        business: measure(aui.BusinessCalendar, { label: 'b', months: 12, definition: { holidays: [{ date: { kind: 'PlainDate', year: 2026, month: 12, day: 25 }, name: 'Christmas', yearly: true }] } }),
        recurrence: measure(aui.RecurrencePicker, { label: 'r', start, value: aui.parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TU,TH'), formControl: false }),
        schedule: measure(aui.SchedulePicker, { label: 's', recurrence: true, value: { allDay: false, start: { kind: 'Instant', epochMilliseconds: Date.UTC(2026, 8, 29, 8) }, end: { kind: 'Instant', epochMilliseconds: Date.UTC(2026, 8, 29, 9) }, timeZone: 'Europe/London', recurrence: null } }),
      };
    });
    withinBudget(results.business, 40, 'results.business');
    withinBudget(results.recurrence, 15, 'results.recurrence');
    withinBudget(results.schedule, 30, 'results.schedule');
  });
});
