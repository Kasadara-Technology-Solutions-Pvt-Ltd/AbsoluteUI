Weekends, holidays, half days, and working hours as one immutable calendar object, with the questions HR, payroll, and support screens ask: is this a business day, how many working days are in this leave request, when is the pay date, when is this ticket due. Every count says which mode it uses (calendar days, weekdays, or business days) and which ends it includes. The [Business calendars guide](/docs/guides/business-calendars/) explains the holiday rules, the three counting modes, and SLA deadlines in depth; the recipes below combine them into common tasks.

### How do I count a leave request and explain the days that do not count?

Leave includes both ends, so use `inclusive: 'both'`. List the non-working days in the range with `getBusinessDay` and `describeBusinessDay`, so the form can say why a 9-day request costs fewer days.

```ts
import { eachDayOfInterval, formatPlainDate } from '@absoluteui/helpers/date';
import { createBusinessCalendar, describeBusinessDay, diffDays, fixedHoliday, getBusinessDay } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({
  holidays: [fixedHoliday('Christmas Day', 12, 25), fixedHoliday('Boxing Day', 12, 26, { observed: 'next-weekday' })],
  halfDays: [fixedHoliday('Christmas Eve', 12, 24)],
});
const request = { start: '2026-12-21', end: '2026-12-29' };
diffDays(request.start, request.end, { mode: 'calendar', inclusive: 'both', calendar: cal }); // => 9
diffDays(request.start, request.end, { mode: 'business', inclusive: 'both', calendar: cal }); // => 4.5

const notes = [...eachDayOfInterval(request)]
  .map((d) => ({ date: formatPlainDate(d), info: getBusinessDay(d, cal) }))
  .filter((d) => d.info.businessDayValue < 1)
  .map((d) => `${d.date}: ${describeBusinessDay(d.info)}`);
notes; // => ['2026-12-24: Half day: Christmas Eve', '2026-12-25: Holiday: Christmas Day', '2026-12-26: Holiday: Boxing Day', '2026-12-27: Weekend', '2026-12-28: Holiday: Boxing Day']
```

Boxing Day falls on a Saturday in 2026 and is observed on Monday 28th. Both dates carry its name (the Saturday entry has `movedTo` set), but only the Monday costs a working day.

### How do I set pay dates and payroll cut-offs?

"Paid on the 25th" usually means "or the business day before if the 25th is not one": that is `modifiedPreceding`. Cut-offs count back in business days with a negative `addBusinessDays`, and `lastBusinessDayOfMonth` covers "paid on the last working day".

```ts
import { formatPlainDate, plainDate } from '@absoluteui/helpers/date';
import { addBusinessDays, adjustBusinessDay, createBusinessCalendar, fixedHoliday, lastBusinessDayOfMonth } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25)] });
const payDate = (year: number, month: number) => adjustBusinessDay(plainDate(year, month, 25), 'modifiedPreceding', cal);
formatPlainDate(payDate(2026, 10)); // => '2026-10-23' // Sunday 25th, so Friday
formatPlainDate(payDate(2026, 12)); // => '2026-12-24' // Christmas Day
formatPlainDate(addBusinessDays(payDate(2026, 12), -3, cal)); // => '2026-12-21' // cut-off: three business days earlier
const last = lastBusinessDayOfMonth(2026, 10, cal);
last === undefined ? undefined : formatPlainDate(last); // => '2026-10-30'
```

### How do I give each office its own calendar?

Keep one calendar per country with regional holidays tagged, scope it per office with `withTags`, and merge in company-wide days with `mergeCalendars`. `weekendForLocale` supplies the local weekend when you do not know it.

```ts
import { createBusinessCalendar, fixedHoliday, isBusinessDay, mergeCalendars, weekendForLocale, withTags } from '@absoluteui/helpers/business-calendar';

const india = createBusinessCalendar({
  weekend: weekendForLocale('en-IN'),
  timeZone: 'Asia/Kolkata',
  holidays: [
    fixedHoliday('Gandhi Jayanti', 10, 2),
    fixedHoliday('Maharashtra Day', 5, 1, { tags: ['IN-MH'] }),
    fixedHoliday('Kannada Rajyotsava', 11, 1, { tags: ['IN-KA'], observed: 'next-weekday' }),
  ],
});
const company = createBusinessCalendar({ holidays: [fixedHoliday('Founders Day', 3, 16)] });
const bengaluru = mergeCalendars([withTags(india, ['IN-KA']), company], { name: 'Bengaluru office' });
const mumbai = mergeCalendars([withTags(india, ['IN-MH']), company], { name: 'Mumbai office' });

india.weekend; // => [7]
isBusinessDay('2026-05-01', bengaluru); // => true
isBusinessDay('2026-05-01', mumbai); // => false // Maharashtra Day
isBusinessDay('2026-11-02', bengaluru); // => false // Rajyotsava on Sunday, observed Monday
isBusinessDay('2026-03-16', mumbai); // => false // Founders Day everywhere
```

### How do I use holidays that come from a server?

Providers must be synchronous, so load the data first and then create the calendar. Returned holidays are used as given (no observed shift), and results are cached per year.

```ts
import { createBusinessCalendar, isHoliday, type ProvidedHoliday } from '@absoluteui/helpers/business-calendar';

// e.g. const byYear = await api.get('/holidays?country=IN&from=2026&to=2027');
const byYear: Readonly<Record<number, readonly ProvidedHoliday[]>> = {
  2026: [{ date: '2026-11-08', name: 'Diwali' }, { date: '2026-03-04', name: 'Holi' }],
};
const cal = createBusinessCalendar({ weekend: [7], providers: [{ holidaysFor: (year) => byYear[year] ?? [] }] });
isHoliday('2026-11-08', cal)?.name; // => 'Diwali'
isHoliday('2027-11-08', cal); // => undefined // no data loaded for 2027
```

### How do I report working days per month of a fiscal year?

`businessDaysIn` accepts a month, quarter, calendar year, or fiscal period, and `periodRange` gives its dates. `countHolidays` separates holidays on working days from those on weekends, which cost no working time.

```ts
import { addMonths, formatPlainDate } from '@absoluteui/helpers/date';
import { businessDaysIn, countHolidays, createBusinessCalendar, fixedHoliday, periodRange } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({
  fiscalYearStartMonth: 4,
  holidays: [fixedHoliday('Independence Day', 8, 15), fixedHoliday('Gandhi Jayanti', 10, 2), fixedHoliday('Christmas Day', 12, 25), fixedHoliday('Republic Day', 1, 26)],
});
const [start, end] = periodRange({ fiscalYear: 2027 }, cal);
[formatPlainDate(start), formatPlainDate(end)]; // => ['2026-04-01', '2027-03-31']
const months = Array.from({ length: 12 }, (_, i) => addMonths(start, i));
const perMonth = months.map((m) => businessDaysIn({ year: m.year, month: m.month }, cal));
perMonth.slice(6, 9); // => [21, 21, 22] // Oct (Gandhi Jayanti), Nov, Dec (Christmas)
perMonth.reduce((a, b) => a + b, 0) === businessDaysIn({ fiscalYear: 2027 }, cal); // => true
countHolidays(start, end, { inclusive: 'both', calendar: cal }); // => { total: 4, onWeekdays: 3, onWeekends: 1 } // 15 Aug 2026 is a Saturday
```

### What goes wrong?

- Invalid definitions fail at creation with an `HLP_BIZCAL_*` code, never later during a count.
- A calendar with no working days cannot move to one: `nextBusinessDay` throws `HLP_BIZCAL_NO_WORKING_DAYS`.
- There are no "business months": weeks, months, and years are calendar units (`differenceInMonths` in `@absoluteui/helpers/date`); business modes exist only for days and hours.
- Without a `calendar` argument you get the default: Saturday and Sunday off, **no holidays**, UTC.

```ts
import { createBusinessCalendar, isBusinessDay, nextBusinessDay } from '@absoluteui/helpers/business-calendar';

createBusinessCalendar({ fiscalYearStartMonth: 0 }); // => throws HLP_BIZCAL_INVALID_FISCAL
nextBusinessDay('2026-10-05', createBusinessCalendar({ weekend: [1, 2, 3, 4, 5, 6, 7] })); // => throws HLP_BIZCAL_NO_WORKING_DAYS
isBusinessDay('2026-12-25'); // => true // the default calendar knows no holidays
```
