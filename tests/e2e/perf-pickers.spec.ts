import { test, type Page } from '@playwright/test';
import type { Calendar } from '@absoluteui/components/calendar';
import type { DateRangePicker } from '@absoluteui/components/date-range-picker';
import type { MonthPicker } from '@absoluteui/components/month-picker';
import type { YearPicker } from '@absoluteui/components/year-picker';
import type { QuarterPicker } from '@absoluteui/components/quarter-picker';
import type { DurationPicker } from '@absoluteui/components/duration-picker';
import { withinBudget } from './budget.js';

// R2 picker performance budgets declared in metadata/*/component.json (SPEC section 15.2).
// Headless Chromium, production build, median of 5 runs of 100 instances each.

interface Harness {
  __aui: {
    Calendar: typeof Calendar;
    DateRangePicker: typeof DateRangePicker;
    MonthPicker: typeof MonthPicker;
    YearPicker: typeof YearPicker;
    QuarterPicker: typeof QuarterPicker;
    DurationPicker: typeof DurationPicker;
  };
  __auiReady?: boolean;
}

type Kind = 'Calendar' | 'DateRangePicker' | 'MonthPicker' | 'YearPicker' | 'QuarterPicker' | 'DurationPicker';

async function open(page: Page): Promise<void> {
  await page.goto('/pickers');
  await page.waitForFunction(() => (window as unknown as Harness).__auiReady === true);
}

/** Median over 5 runs of the average create() time per instance, in ms. */
async function perInstance(page: Page, kind: Kind, count: number): Promise<number> {
  const results: number[] = [];
  for (let run = 0; run < 5; run++) {
    results.push(
      await page.evaluate(
        ([k, n]) => {
          const aui = (window as unknown as Harness).__aui;
          const hosts = Array.from({ length: n }, () => document.body.appendChild(document.createElement('div')));
          const start = performance.now();
          const made = hosts.map((h, i): { destroy(): void } => {
            const label = `Field ${i}`;
            switch (k) {
              case 'Calendar':
                return aui.Calendar.create(h, { selectionMode: 'range', visibleMonths: 2, label });
              case 'DateRangePicker':
                return aui.DateRangePicker.create(h, { label, months: 2 });
              case 'MonthPicker':
                return aui.MonthPicker.create(h, { label });
              case 'YearPicker':
                return aui.YearPicker.create(h, { label });
              case 'QuarterPicker':
                return aui.QuarterPicker.create(h, { label });
              case 'DurationPicker':
                return aui.DurationPicker.create(h, { label, fields: ['days', 'hours', 'minutes'] });
            }
          });
          const elapsed = performance.now() - start;
          for (const m of made) m.destroy();
          for (const h of hosts) h.remove();
          return elapsed / n;
        },
        [kind, count] as const,
      ),
    );
  }
  results.sort((a, b) => a - b);
  return results[2] ?? Number.NaN;
}

const budgets: [Kind, number][] = [
  ['Calendar', 10],
  ['DateRangePicker', 15],
  ['MonthPicker', 5],
  ['YearPicker', 5],
  ['QuarterPicker', 5],
  ['DurationPicker', 2],
];

test.describe('picker performance budgets', () => {
  for (const [kind, budget] of budgets) {
    const what = kind === 'Calendar' ? 'Calendar.create (2 months, range mode)' : `${kind}.create`;
    test(`${what}: < ${budget} ms average per instance (100 instances)`, async ({ page }) => {
      await open(page);
      const avg = await perInstance(page, kind, 100);
      test.info().annotations.push({ type: 'perf', description: `${what} avg: ${avg.toFixed(3)} ms` });
      withinBudget(avg, budget, 'avg');
    });
  }
});
