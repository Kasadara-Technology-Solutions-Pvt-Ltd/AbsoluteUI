Convert between exact instants and wall-clock times in IANA time zones, with an explicit decision whenever daylight saving skips or repeats a local time. Reach for it when people in different offices see the same event, when a user picks a local time that must become an instant, or when you store times with their offset. Offsets come from the browser's `Intl` data. The [Dates and time zones guide](/docs/guides/dates-and-time-zones/) explains the value types and the disambiguation policy; the [Business calendars guide](/docs/guides/business-calendars/) covers working hours per office.

### How do I show a meeting time in each attendee's zone?

Turn the organiser's wall-clock time into one instant with `zonedToInstant`, then show that instant in every attendee's zone. Combine it with each office's business calendar to flag attendees for whom the slot is outside working hours or on a non-working day.

```ts
import { formatPlainDateTime, plainDateTime, plainTime } from '@absoluteui/helpers/date';
import { formatInZone, instantToZoned, zonedToInstant } from '@absoluteui/helpers/timezone';
import { createBusinessCalendar, fixedHoliday, isWorkingTime } from '@absoluteui/helpers/business-calendar';

const meeting = zonedToInstant(plainDateTime('2026-10-02', plainTime(9, 0)), 'America/New_York');
const offices = [
  { name: 'New York', cal: createBusinessCalendar({ timeZone: 'America/New_York' }) },
  { name: 'London', cal: createBusinessCalendar({ timeZone: 'Europe/London' }) },
  { name: 'Bengaluru', cal: createBusinessCalendar({ timeZone: 'Asia/Kolkata', holidays: [fixedHoliday('Gandhi Jayanti', 10, 2)] }) },
];
const view = offices.map((o) => ({ office: o.name, local: formatPlainDateTime(instantToZoned(meeting, o.cal.timeZone)), working: isWorkingTime(meeting, o.cal) }));
view; // => [{ office: 'New York', local: '2026-10-02T09:00:00', working: true }, { office: 'London', local: '2026-10-02T14:00:00', working: true }, { office: 'Bengaluru', local: '2026-10-02T18:30:00', working: false }]
formatInZone(meeting, { timeZone: 'Asia/Kolkata', locale: 'en-IN', timeStyle: 'short' }); // => '6:30 pm'
```

Bengaluru is out twice over: 18:30 is after hours, and 2 October is a holiday there.

### How do I handle a local time that daylight saving skips or repeats?

Check the picked time with `getWallTimeStatus` before converting. For a skipped time (spring forward) or a repeated one (fall back), either let the user choose or apply a policy: `compatible` (the default, as in Temporal), `earlier`, `later`, or `reject`.

```ts
import { plainDateTime, plainTime } from '@absoluteui/helpers/date';
import { formatZonedIso, getPossibleInstants, getWallTimeStatus, zonedToInstant } from '@absoluteui/helpers/timezone';

const zone = 'America/New_York';
const skipped = plainDateTime('2026-03-08', plainTime(2, 30));
const repeated = plainDateTime('2026-11-01', plainTime(1, 30));
getWallTimeStatus(skipped, zone); // => 'nonexistent'
formatZonedIso(zonedToInstant(skipped, zone), zone); // => '2026-03-08T03:30:00-04:00' // moved forward by the gap

getWallTimeStatus(repeated, zone); // => 'ambiguous'
getPossibleInstants(repeated, zone).map((i) => formatZonedIso(i, zone)); // => ['2026-11-01T01:30:00-04:00', '2026-11-01T01:30:00-05:00'] // offer both
formatZonedIso(zonedToInstant(repeated, zone, { disambiguation: 'later' }), zone); // => '2026-11-01T01:30:00-05:00'
zonedToInstant(skipped, zone, { disambiguation: 'reject' }); // => throws HLP_TZ_NONEXISTENT_TIME
```

### How do I store and exchange a time without losing the zone?

Send instants as RFC 3339 text with the offset (`formatZonedIso`), and keep the IANA zone next to it when the local time matters later, for example for a recurring shift. `parseInstant` reads such text back and rejects text without an offset.

```ts
import { formatPlainDateTime, parseInstant } from '@absoluteui/helpers/date';
import { formatZonedIso, instantToZoned } from '@absoluteui/helpers/timezone';

const shiftStart = Date.UTC(2026, 9, 5, 3, 30);
const payload = { startsAt: formatZonedIso(shiftStart, 'Asia/Kolkata'), timeZone: 'Asia/Kolkata' };
payload.startsAt; // => '2026-10-05T09:00:00+05:30'
parseInstant(payload.startsAt) === shiftStart; // => true
formatPlainDateTime(instantToZoned(shiftStart, 'Europe/Berlin')); // => '2026-10-05T05:30:00'
parseInstant('2026-10-05T09:00:00'); // => undefined // no offset: not an instant
```

### How do I build a time-zone picker and warn about clock changes?

`listTimeZones` gives the zones the runtime supports (current names such as `Asia/Kolkata`), and `timeZoneName` a localized label. `nextTransition` finds the next offset change, useful to warn that a recurring meeting will move for some attendees.

```ts
import { formatZonedIso, isValidTimeZone, listTimeZones, nextTransition, timeZoneName } from '@absoluteui/helpers/timezone';

const options = listTimeZones().filter((z) => z.startsWith('Europe/')).map((z) => ({ value: z, label: timeZoneName(z, { locale: 'en', style: 'longGeneric' }) }));
options.some((o) => o.value === 'Europe/London'); // => true
isValidTimeZone('Mars/Olympus_Mons'); // => false

const change = nextTransition(Date.UTC(2026, 8, 30), 'Europe/London');
change === undefined ? undefined : formatZonedIso(change, 'Europe/London'); // => '2026-10-25T01:00:00+00:00' // clocks go back
nextTransition(Date.UTC(2026, 8, 30), 'Asia/Kolkata'); // => undefined // no daylight saving
```

### What goes wrong?

- The device zone is not the user's work zone: pass zones explicitly and use `getLocalTimeZone()` only as a default.
- A day is not always 24 hours. Add calendar days with `addDurationInZone` from `@absoluteui/helpers/duration`, not `+ 86_400_000`.
- "Which business day is it?" depends on the office's zone: use `businessDayAt` with the calendar's `timeZone`, not the UTC date.

```ts
import { instantToZoned } from '@absoluteui/helpers/timezone';
import { businessDayAt, createBusinessCalendar } from '@absoluteui/helpers/business-calendar';

instantToZoned(Date.UTC(2026, 9, 1), 'Not/AZone'); // => throws HLP_TZ_INVALID_ZONE
const lateFriday = Date.UTC(2026, 9, 2, 20); // Friday 20:00 UTC
businessDayAt(lateFriday, createBusinessCalendar({ timeZone: 'Asia/Kolkata' })).working; // => false // already Saturday in Kolkata
```
