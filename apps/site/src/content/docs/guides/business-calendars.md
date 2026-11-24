---
title: Business calendars
description: Weekends, holidays, business days, business hours, SLA deadlines, and how day differences count calendar days, weekdays, or business days.
---

`@absoluteui/helpers/business-calendar` answers the questions every scheduling, HR, and finance screen asks: *is this a weekend? is it a business day? how many working days are between these dates? when is this due?* It works on date-only values, so no answer can shift by a day because of a time zone.

## Create a calendar

A calendar is an immutable object you create once and pass to every function:

```ts
import { createBusinessCalendar, easterHoliday, fixedHoliday, lastWeekdayHoliday, nthWeekdayHoliday, oneOffHoliday } from '@absoluteui/helpers/business-calendar';

export const officeCalendar = createBusinessCalendar({
  name: 'Head office',
  weekend: [6, 7], // ISO weekdays: 6 = Saturday, 7 = Sunday
  timeZone: 'America/New_York',
  workingHours: { default: [['09:00', '12:30'], ['13:30', '17:30']], '5': [['09:00', '13:00']] },
  holidays: [
    fixedHoliday("New Year's Day", 1, 1, { observed: 'nearest-weekday' }),
    lastWeekdayHoliday('Memorial Day', 5, 1),
    nthWeekdayHoliday('Thanksgiving', 11, 4, 4),
    easterHoliday('Good Friday', -2),
    fixedHoliday('Christmas Day', 12, 25, { observed: 'nearest-weekday' }),
    oneOffHoliday('Office move', '2026-06-19'),
  ],
  halfDays: [fixedHoliday('Christmas Eve', 12, 24)],
  fiscalYearStartMonth: 4,
});
```

| Option | Meaning |
|---|---|
| `weekend` | Non-working ISO weekdays. Any set works: Saturday and Sunday, Friday and Saturday, Friday only, Sunday only, or none. |
| `locale` | Fills `weekend` and `firstDayOfWeek` from the locale when you omit them (`weekendForLocale('ar-SA')` gives `[5, 6]`). |
| `holidays` | Holiday rules (below). |
| `halfDays` | Days with shorter hours, counted as `halfDayValue` (default 0.5). |
| `exceptions` | Per-date overrides, for example a compensatory working Saturday or a one-day closure. An exception always wins over holidays and the weekend. |
| `workingHours` | Working intervals per day, `default` plus per-weekday keys `'1'`-`'7'`. `'24:00'` is allowed as an end. |
| `timeZone` | IANA zone used whenever an instant (a moment in time) is turned into a date or working hours are applied. Default `UTC`. |
| `fiscalYearStartMonth` | For fiscal-year and fiscal-quarter periods. |
| `providers` | Objects that supply holidays per year, for data you load from a server. |

No holiday data ships with the package. Holiday lists change every year and differ by region and organization, so they belong to your application.

## Holiday rules

| Builder | Example |
|---|---|
| `fixedHoliday(name, month, day)` | 25 December every year |
| `nthWeekdayHoliday(name, month, weekday, n)` | Fourth Thursday of November (`n` from 1 to 5, or -1 for the last) |
| `lastWeekdayHoliday(name, month, weekday)` | Last Monday of May |
| `easterHoliday(name, offsetDays, { method })` | Good Friday is Easter - 2; `method: 'orthodox'` for Orthodox Easter |
| `oneOffHoliday(name, date)` | A single date |
| `holidayRange(name, start, end)` | A shutdown period, both ends included |
| `customHoliday(name, (year) => dates)` | Lunar or regional holidays your application computes |

Every rule accepts `observed` (`'nearest-weekday'` moves Saturday to Friday and Sunday to Monday; `'next-weekday'`, `'previous-weekday'`, or a custom map by weekday), `tags` for regional or departmental scope (see `withTags`), `halfDay`, and `fromYear`/`toYear`. If an observed day collides with another holiday or a weekend, it keeps moving in the same direction. `mergeCalendars` combines national, regional, and company calendars.

## Weekend, weekday, business day

```ts
import { createBusinessCalendar, describeBusinessDay, fixedHoliday, getBusinessDay, isBusinessDay, isHoliday, isWeekend } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({ weekend: [5, 6], holidays: [fixedHoliday('National Day', 12, 2)] });

isWeekend('2026-10-02', cal); // true (Friday)
isBusinessDay('2026-10-04', cal); // true (Sunday is a working day here)
isHoliday('2026-12-02', cal)?.name; // 'National Day'

const info = getBusinessDay('2026-12-02', cal);
console.log(info.working, info.reasonCode, describeBusinessDay(info)); // false 'holiday' 'Holiday: National Day'
```

`getBusinessDay` returns everything about one date: whether it is working, a weekend, its holidays, the exception that decided it, half-day status, working hours, a `reasonCode` (`'weekend'`, `'holiday'`, `'exception'`, `'half-day'`, or `null`), and a `reason` text. Without a calendar argument, functions use a default calendar with a Saturday and Sunday weekend and no holidays.

## Differences: calendar days, weekdays, or business days

`diffDays` counts days between two dates in one of three modes:

| `mode` | Counts | Example: Fri 25 Dec 2026 to Fri 1 Jan 2027 with Christmas and New Year as holidays |
|---|---|---|
| `'calendar'` | Every day | 7 |
| `'weekdays'` | Days that are not weekend days | 5 |
| `'business'` | Weekdays that are not holidays, adjusted by exceptions; half days count `halfDayValue` | 4 |

Which ends are counted is always explicit, through `inclusive`:

| `inclusive` | Range | Mon 5 Oct to Fri 9 Oct 2026, business days |
|---|---|---|
| `'start'` (default) | First date counted, last not: `[start, end)` | 4 |
| `'both'` | Both dates counted: `[start, end]`. Use this for leave requests. | 5 |
| `'end'` | Last date counted, first not: `(start, end]` | 4 |
| `'none'` | Neither end counted | 3 |

The default makes calendar mode equal to simple date subtraction. If the second date is earlier, the result is negative with the same size. A holiday on a weekend is never subtracted twice.

```ts
import { createBusinessCalendar, diffBreakdown, diffDays, fixedHoliday } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({ holidays: [fixedHoliday('Founders Day', 10, 7)] });

const leaveDays = diffDays('2026-10-05', '2026-10-09', { mode: 'business', inclusive: 'both', calendar: cal }); // 4
const breakdown = diffBreakdown('2026-10-01', '2026-11-01', cal);
console.log(leaveDays, breakdown.calendarDays, breakdown.weekendDays, breakdown.holidays, breakdown.businessDays);
```

`diffBreakdown` returns every count at once: calendar days, weekdays, weekend days, holidays, holidays on weekends, half days, non-working weekdays, working weekend days, business days, and nominal business hours.

**Weeks, months, quarters, and years are always calendar units.** A "business month" has no single meaning across calendars, so the package does not invent one. Use `differenceInMonths` and related functions from `@absoluteui/helpers/date` for those units, and business modes only for day and hour counts.

## Moving by business days

```ts
import { addBusinessDays, adjustBusinessDay, createBusinessCalendar, lastBusinessDayOfMonth, nextBusinessDay } from '@absoluteui/helpers/business-calendar';

const cal = createBusinessCalendar({});
addBusinessDays('2026-10-09', 3, cal); // Wed 14 Oct 2026
addBusinessDays('2026-10-09', -3, cal); // Tue 6 Oct 2026
nextBusinessDay('2026-10-10', cal); // Mon 12 Oct 2026
lastBusinessDayOfMonth(2026, 10, cal); // Fri 30 Oct 2026
adjustBusinessDay('2026-10-31', 'modifiedFollowing', cal); // Fri 30 Oct 2026: moving forward would change the month
```

`adjustBusinessDay` supports the finance conventions `'following'`, `'modifiedFollowing'`, `'preceding'`, and `'modifiedPreceding'`, used for payment dates and payroll cut-offs.

## Business hours and SLA deadlines

With `workingHours` and `timeZone`, the calendar computes with real elapsed time:

```ts
import { addBusinessHours, createBusinessCalendar, diffBusinessHours, slaDeadline } from '@absoluteui/helpers/business-calendar';

const support = createBusinessCalendar({ timeZone: 'Europe/London', workingHours: { default: [['09:00', '17:00']] } });

const opened = Date.parse('2026-10-09T15:00:00Z'); // Friday 16:00 in London
const due = slaDeadline(opened, { businessHours: 4 }, support); // Monday 12:00 London time
const worked = diffBusinessHours(opened, due, support); // 4
console.log(new Date(due).toISOString(), worked, addBusinessHours(opened, 1, support));
```

On daylight-saving days, working intervals are converted to real instants, so a day with a clock change is shorter or longer by the real amount.

## Performance

Counting business days does not depend on the length of the range: full weeks are counted arithmetically, and holidays are found by binary search in lists expanded once per year and cached on the calendar. A count over 100 years takes a few milliseconds. `addBusinessDays` jumps instead of stepping day by day, and `isBusinessDay` is a lookup.

## Accessibility

When a date picker disables non-working days, say why. `describeBusinessDay(info)` gives "Weekend", "Holiday: Christmas Day", or "Half day: Christmas Eve", suitable for `aria-description` or a tooltip. Pass `labels` to translate the words; holiday names are shown as you defined them.
