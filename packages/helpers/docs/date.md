Date-only arithmetic that cannot shift by a day: `PlainDate` values (or `'YYYY-MM-DD'` strings) with month-end-aware adding, differences, weeks under any locale's rules, fiscal years, intervals, calendar grids, and strict parsing and formatting. Reach for it for joining dates, probation periods, leave ranges, and reporting periods. Everything here counts **calendar** days; for weekends, holidays, and business days, combine it with `@absoluteui/helpers/business-calendar` as shown below. The [Dates and time zones guide](/docs/guides/dates-and-time-zones/) explains the value types, and the [Business calendars guide](/docs/guides/business-calendars/) the business-day rules.

### How do I compute probation end, tenure, and anniversaries?

`addMonths` clamps to the month end (31 January + 1 month is 28 or 29 February), and `dateDiff` gives years, months, and days for a tenure label. When the result must be a working day, roll it with `adjustBusinessDay`.

```ts
import { addMonths, dateDiff, differenceInYears, formatPlainDate } from '@absoluteui/helpers/date';
import { adjustBusinessDay, createBusinessCalendar, fixedHoliday } from '@absoluteui/helpers/business-calendar';

const joined = '2026-01-31';
const probationEnds = addMonths(joined, 6);
formatPlainDate(probationEnds); // => '2026-07-31'
formatPlainDate(addMonths(joined, 1)); // => '2026-02-28' // clamped to the month end

const cal = createBusinessCalendar({ holidays: [fixedHoliday('Independence Day', 8, 15)] });
formatPlainDate(adjustBusinessDay(addMonths('2025-02-15', 6), 'following', cal)); // => '2025-08-18' // 15 Aug 2025 is a Friday holiday, then the weekend

dateDiff('2021-04-12', '2026-10-05'); // => { years: 5, months: 5, days: 23 }
differenceInYears('2026-04-11', '2021-04-12'); // => 4 // the fifth anniversary is tomorrow
```

### How do I label and bound fiscal periods?

Pass the fiscal start month; years are named by the calendar year in which they end (India's April 2026 - March 2027 is FY2027) unless you choose `naming: 'start'`.

```ts
import { endOfFiscalYear, fiscalQuarterLabel, fiscalYearLabel, formatPlainDate, startOfFiscalQuarter } from '@absoluteui/helpers/date';

const india = { startMonth: 4 };
fiscalYearLabel('2026-10-05', india); // => 'FY2027'
fiscalYearLabel('2026-10-05', { ...india, style: 'span' }); // => 'FY2026-27'
fiscalQuarterLabel('2026-10-05', india); // => 'Q3'
formatPlainDate(startOfFiscalQuarter('2026-10-05', india)); // => '2026-10-01'
formatPlainDate(endOfFiscalYear('2026-10-05', { startMonth: 10 })); // => '2027-09-30' // US federal
```

### How do I build a month view that marks weekends and holidays?

`calendarMonthGrid` gives the rows of a month (with neighbouring days to fill them) starting on the locale's first weekday. Ask the business calendar about each cell for the weekend, holiday, or half-day marker and an accessible reason.

```ts
import { calendarMonthGrid, formatPlainDate, getWeekInfo } from '@absoluteui/helpers/date';
import { createBusinessCalendar, describeBusinessDay, fixedHoliday, getBusinessDay } from '@absoluteui/helpers/business-calendar';

const week = getWeekInfo('en-IN');
const cal = createBusinessCalendar({ weekend: week.weekend, holidays: [fixedHoliday('Gandhi Jayanti', 10, 2)] });
const grid = calendarMonthGrid(2026, 10, { firstDayOfWeek: week.firstDay, fixedWeeks: false });
const cells = grid.flat().filter((d) => d.inMonth).map((d) => {
  const info = getBusinessDay(d.date, cal);
  return { date: formatPlainDate(d.date), working: info.working, label: describeBusinessDay(info) };
});
week.weekend; // => [7] // Sunday only in India
cells[1]; // => { date: '2026-10-02', working: false, label: 'Holiday: Gandhi Jayanti' }
cells[2]; // => { date: '2026-10-03', working: true, label: '' } // Saturday is a working day here
cells.filter((c) => !c.working).length; // => 5 // four Sundays and one holiday
```

### How do I combine overlapping leave and count the days off?

`mergeIntervals` joins overlapping and back-to-back ranges; `intervalLengthDays` counts calendar days, while `countBusinessDays` counts only the working days the employee is actually away.

```ts
import { formatPlainDate, intervalGaps, intervalLengthDays, mergeIntervals } from '@absoluteui/helpers/date';
import { countBusinessDays, createBusinessCalendar, fixedHoliday } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
const requests = [
  { start: '2026-12-21', end: '2026-12-24' },
  { start: '2026-12-24', end: '2026-12-28' },
  { start: '2026-12-29', end: '2026-12-31' },
];
const [away] = mergeIntervals(requests);
away === undefined ? undefined : [away.start, away.end].map(formatPlainDate); // => ['2026-12-21', '2026-12-31']
away === undefined ? 0 : intervalLengthDays(away); // => 11 // calendar days
away === undefined ? 0 : countBusinessDays(away.start, away.end, { inclusive: 'both', calendar: cal }); // => 8 // without the weekend and Christmas
intervalGaps(requests, { start: '2026-12-01', end: '2026-12-31' }).length; // => 1 // 1-20 December is still free
```

### How do I parse and display dates the user types?

`parseDate` is strict: the text must match the pattern exactly and be a real date, so `31/02/2026` is rejected instead of rolling into March. Display with `formatDateIntl` or `formatDateRange`, which never shift the date by a time zone.

```ts
import { formatDateIntl, formatDateRange, formatPlainDate, parseDate } from '@absoluteui/helpers/date';

const typed = parseDate('05/10/2026', 'dd/MM/yyyy');
typed === undefined ? undefined : formatPlainDate(typed); // => '2026-10-05'
parseDate('31/02/2026', 'dd/MM/yyyy'); // => undefined
formatDateIntl('2026-10-05', { locale: 'de', dateStyle: 'long' }); // => '5. Oktober 2026'
formatDateRange('2026-12-21', '2026-12-31', { locale: 'en' }); // => 'Dec 21 – 31, 2026'
```

### What goes wrong?

- Date strings must be `YYYY-MM-DD`; anything else throws `HLP_INVALID_DATE` instead of being guessed.
- `today()` and `isToday()` use the runtime's zone unless you pass one; pass the user's zone so "today" does not flip at UTC midnight.
- `differenceInDays` and `addDays` count calendar days. A "3-day SLA" usually means business days: use `diffDays` or `addBusinessDays` from the business calendar.

```ts
import { addDays, differenceInDays, formatPlainDate, toPlainDate } from '@absoluteui/helpers/date';
import { addBusinessDays } from '@absoluteui/helpers/business-calendar';

toPlainDate('10/05/2026'); // => throws HLP_INVALID_DATE
differenceInDays('2026-10-12', '2026-10-09'); // => 3 // Friday to Monday
formatPlainDate(addDays('2026-10-09', 3)); // => '2026-10-12' // Monday
formatPlainDate(addBusinessDays('2026-10-09', 3)); // => '2026-10-14' // Wednesday
```
