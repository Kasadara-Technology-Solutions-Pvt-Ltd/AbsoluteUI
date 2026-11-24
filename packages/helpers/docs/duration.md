ISO 8601 durations (`PT7H30M`, `P1M`, `P2W`) as immutable values: parse and format them, add them to dates calendar-aware, add them to instants DST-aware, and turn milliseconds into readable text. Reach for it for working-time totals, notice periods, SLA displays, and any length of time exchanged with a server. Calendar lengths (months, days across a clock change) are not fixed, so this module asks for a reference point where it matters. The [Dates and time zones guide](/docs/guides/dates-and-time-zones/) covers the value types; for durations counted in working time, see the [Business calendars guide](/docs/guides/business-calendars/).

### How do I total a timesheet and compare it with the contract?

Sum the worked milliseconds, split them into hours and minutes with `millisecondsToDuration`, and compare with the contracted hours from the server (ISO text) using `compareDurations`. `formatClock` gives stopwatch text for a running timer.

```ts
import { compareDurations, formatClock, formatIsoDuration, millisecondsToDuration, parseIsoDuration } from '@absoluteui/helpers/duration';

const entries = [
  { in: '2026-10-05T09:02:00Z', out: '2026-10-05T12:30:00Z' },
  { in: '2026-10-05T13:15:00Z', out: '2026-10-05T17:45:00Z' },
];
const workedMs = entries.reduce((sum, e) => sum + (Date.parse(e.out) - Date.parse(e.in)), 0);
const worked = millisecondsToDuration(workedMs);
formatIsoDuration(worked); // => 'PT7H58M'
formatClock(workedMs); // => '07:58:00'

const contracted = parseIsoDuration('PT7H30M');
contracted === undefined ? undefined : compareDurations(worked, contracted); // => 1 // overtime
```

### How do I show a length of time in the user's language?

`formatDuration` writes every unit of a `Duration`; `humanizeDuration` rounds milliseconds to the largest one or two units for summaries such as "time to approve".

```ts
import { duration, formatDuration, humanizeDuration } from '@absoluteui/helpers/duration';

formatDuration(duration({ hours: 7, minutes: 58 }), { locale: 'en' }); // => '7 hours, 58 minutes'
formatDuration(duration({ hours: 7, minutes: 58 }), { locale: 'de', style: 'short' }); // => '7 Std., 58 Min.'
humanizeDuration(2 * 86_400_000 + 5 * 3_600_000 + 20 * 60_000, { locale: 'en', largestUnit: 'days' }); // => '2 days, 5 hours'
humanizeDuration(95 * 60_000, { locale: 'en', largestUnits: 1 }); // => '2 hours'
```

### How do I add a notice period, and how is that different from business days?

`addDuration` adds calendar units to a date: months first (clamped to the month end), then weeks and days. A notice period "in working days" is a different rule: count it with `addBusinessDays`, which skips weekends and holidays.

```ts
import { formatPlainDate } from '@absoluteui/helpers/date';
import { addDuration, parseIsoDuration } from '@absoluteui/helpers/duration';
import { addBusinessDays, createBusinessCalendar, fixedHoliday } from '@absoluteui/helpers/business-calendar';

const resigned = '2026-11-30';
const oneMonth = parseIsoDuration('P1M');
oneMonth === undefined ? undefined : formatPlainDate(addDuration(resigned, oneMonth)); // => '2026-12-30'
oneMonth === undefined ? undefined : formatPlainDate(addDuration('2027-01-31', oneMonth)); // => '2027-02-28' // clamped

const cal = createBusinessCalendar({ holidays: [fixedHoliday('Christmas Day', 12, 25), fixedHoliday('New Year', 1, 1)] });
formatPlainDate(addBusinessDays(resigned, 20, cal)); // => '2026-12-29' // 20 working days
```

### How do I add days across a daylight-saving change?

In a zone with daylight saving, "one day later" and "24 hours later" differ on the change day. `addDurationInZone` keeps the wall-clock time for calendar units and adds exact time for clock units.

```ts
import { duration, addDurationInZone } from '@absoluteui/helpers/duration';
import { formatZonedIso } from '@absoluteui/helpers/timezone';

const shift = Date.parse('2026-10-24T22:00:00+01:00'); // Saturday 22:00 in London, clocks go back that night
formatZonedIso(addDurationInZone(shift, duration({ days: 1 }), 'Europe/London'), 'Europe/London'); // => '2026-10-25T22:00:00+00:00' // same wall time, 25 h later
formatZonedIso(addDurationInZone(shift, duration({ hours: 24 }), 'Europe/London'), 'Europe/London'); // => '2026-10-25T21:00:00+00:00'
```

### How do I show how long a ticket took in working time?

`diffBusinessHours` measures only the time inside working hours; ask for milliseconds and turn them into a duration for display.

```ts
import { formatDuration, millisecondsToDuration } from '@absoluteui/helpers/duration';
import { createBusinessCalendar, diffBusinessHours } from '@absoluteui/helpers/business-calendar';

const support = createBusinessCalendar({ timeZone: 'Europe/London', workingHours: { default: [['09:00', '17:00']] } });
const opened = Date.parse('2026-10-09T15:30:00+01:00'); // Friday 15:30
const resolved = Date.parse('2026-10-12T10:15:00+01:00'); // Monday 10:15
const ms = diffBusinessHours(opened, resolved, support, { unit: 'milliseconds' });
formatDuration(millisecondsToDuration(ms), { locale: 'en' }); // => '2 hours, 45 minutes' // not 66 h 45 min
```

### What goes wrong?

Durations have one sign, and years or months have no fixed length: converting them needs `relativeTo`. `parseIsoDuration` returns `undefined` for anything outside ISO 8601 (it does not accept `1h30m`).

```ts
import { duration, durationToMilliseconds, parseIsoDuration } from '@absoluteui/helpers/duration';

duration({ hours: 1, minutes: -30 }); // => throws HLP_DURATION_MIXED_SIGNS
durationToMilliseconds(duration({ months: 1 })); // => throws HLP_DURATION_RELATIVE_TO_REQUIRED
durationToMilliseconds(duration({ months: 1 }), { relativeTo: '2026-02-01' }); // => 28 * 86_400_000
parseIsoDuration('1h30m'); // => undefined
```
