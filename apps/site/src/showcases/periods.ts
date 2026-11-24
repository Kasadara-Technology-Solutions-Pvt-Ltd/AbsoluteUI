// Periods showcase: a reporting period selector with month, quarter, and year pickers,
// bounds, months that are not closed yet, and a summary of the chosen periods.
import { plainDate, plainYearMonth, plainYearMonthToString, plainYearQuarter, plainYearQuarterToString, type PlainYearMonth, type PlainYearQuarter } from '@absoluteui/core';
import { MonthPicker } from '@absoluteui/components/month-picker';
import { QuarterPicker } from '@absoluteui/components/quarter-picker';
import { YearPicker } from '@absoluteui/components/year-picker';
import { createShowcase, hostIn, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Reporting periods',
  description: 'Pick a month, quarter, or fiscal year for a report. Periods after the last closed month cannot be chosen.',
});

const today = plainDate(2026, 11, 22);
const lastClosed = plainYearMonth(2026, 10);
const after = (m: PlainYearMonth): boolean => m.year > lastClosed.year || (m.year === lastClosed.year && m.month > lastClosed.month);

// One section per picker, side by side.
const grid = hostIn(sc.stage);
grid.className = 'sc-grid';
const inGrid = (s: HTMLElement): HTMLElement => {
  grid.append(s);
  return s;
};
const monthSection = inGrid(section(sc, 'Month', ['month-picker']));
const month = MonthPicker.create(hostIn(monthSection), {
  label: 'Month',
  value: lastClosed,
  min: plainYearMonth(2022, 1),
  max: plainYearMonth(2026, 12),
  isMonthDisabled: after,
  today,
  description: 'Closed months only.',
});
const quarterSection = inGrid(section(sc, 'Quarter', ['quarter-picker']));
const quarter = QuarterPicker.create(hostIn(quarterSection), {
  label: 'Quarter',
  value: plainYearQuarter(2026, 3),
  min: plainYearQuarter(2022, 1),
  max: plainYearQuarter(2026, 4),
  isQuarterDisabled: (q: PlainYearQuarter) => q.year === 2026 && q.quarter === 4,
  today,
});
const yearSection = inGrid(section(sc, 'Fiscal year', ['year-picker']));
const year = YearPicker.create(hostIn(yearSection), { label: 'Fiscal year', value: 2026, min: 2018, max: 2027, isYearDisabled: (y) => y > 2026, today });

const monthOut = status(monthSection);
const quarterOut = status(quarterSection);
const yearOut = status(yearSection);
const render = (): void => {
  const m = month.value;
  const q = quarter.value;
  const y = year.value;
  monthOut.textContent = `Report month: ${m ? plainYearMonthToString(m) : 'not set'}.`;
  quarterOut.textContent = `Report quarter: ${q ? plainYearQuarterToString(q) : 'not set'}.`;
  yearOut.textContent = `Fiscal year: ${y === null ? 'not set' : String(y)}.`;
};
render();
for (const [name, c] of [
  ['month', month],
  ['quarter', quarter],
  ['year', year],
] as const) {
  c.host.addEventListener('aui-change', render);
  sc.listen(c.host, ['aui-change', 'aui-open', 'aui-close'], name);
}

toggle(sc, 'Required', false, (required) => {
  for (const c of [month, quarter, year]) c.update({ required });
});
toggle(sc, 'Read-only', false, (readOnly) => {
  for (const c of [month, quarter, year]) c.update({ readOnly });
});
toggle(sc, 'Disabled', false, (disabled) => {
  for (const c of [month, quarter, year]) c.update({ disabled });
});
toggle(sc, 'Allow open months', false, (open) => {
  month.update({ isMonthDisabled: open ? () => false : after });
}, ['month-picker']);
