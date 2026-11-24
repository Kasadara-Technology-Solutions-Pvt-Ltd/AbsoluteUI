---
title: Dates and time zones
description: Date-only, time-only, and instant values, the UTC default, and how daylight-saving gaps and overlaps are resolved.
---

Most date bugs come from mixing concepts: a birthday is not a moment in time, and "9:00" means nothing without a zone. AbsoluteUI keeps these apart in its types, never guesses the user's zone, and resolves daylight-saving edge cases by an explicit policy.

## Value types

| Type | Meaning | Created with | Used by |
|---|---|---|---|
| `PlainDate` | A calendar date, no time or zone | `plainDate(2026, 3, 15)` | Date Picker, Calendar, Date Input (date granularity) |
| `PlainTime` | A wall-clock time | `plainTime(9, 30)` | Time Picker |
| `PlainDateTime` | A date and wall-clock time, no zone | `plainDateTime(date, time)` | Intermediate values |
| `Instant` | An exact moment (epoch milliseconds) | `instant(ms)`, `now()`, `toInstant(dateTime, zone)` | Date Time Picker, Scheduler, charts with time axes |
| `ZonedDateTime` | An instant seen in a specific zone | `zonedDateTime(instant, zone)` | Display and arithmetic |
| `PlainYearMonth`, `PlainYearQuarter` | A month or quarter | `plainYearMonth(2026, 3)` | Month and Quarter Pickers |
| `Duration` | A length of time | `duration(ms)` | Duration Picker |
| `Range<T>` | An inclusive start and end | `{ start, end }` | Date Range Picker |

All are immutable plain objects with a `kind` field, so they serialize and compare predictably. `plainDateToString()` and `instantToString()` produce ISO 8601.

## UTC unless you say otherwise

The default time zone is **UTC**, never the machine's. Set the zone your users work in, globally or per component:

```ts
import { configureAbsoluteUI } from '@absoluteui/core';

configureAbsoluteUI({ common: { timezone: 'Asia/Kolkata' } });
```

A Date Time Picker in `America/New_York` shows and accepts New York wall-clock time and produces an `Instant`; the same value shown in `Asia/Kolkata` displays Kolkata time. "Today" in calendars is today in the configured zone.

## Daylight-saving gaps and overlaps

When clocks spring forward, some local times do not exist; when they fall back, some occur twice. The `disambiguation` setting decides, and the user sees a hint whenever a time is adjusted:

| Case (America/New_York) | `compatible` (default) | `earlier` | `later` | `reject` |
|---|---|---|---|---|
| 2026-03-08 02:30 (does not exist) | 03:30 EDT | 01:30 EST | 03:30 EDT | validation error `nonexistent-time` |
| 2026-11-01 01:30 (occurs twice) | 01:30 EDT (the earlier) | 01:30 EDT | 01:30 EST | validation error `ambiguous-time` |

`compatible` matches ECMAScript Temporal. Use `reject` where a wrong hour is costly, such as scheduling medication or trades.

<figure class="aui-live" data-min-height="440"><iframe data-src="/docs/examples/date-time-picker/dst-policy.html" title="Live example: Reject nonexistent and repeated local times" loading="lazy"></iframe></figure>

## Converting and formatting

```ts
import { formatInstant, plainDate, plainDateTime, plainTime, toInstant, zonedDateTime } from '@absoluteui/core';

const meeting = toInstant(plainDateTime(plainDate(2026, 11, 1), plainTime(1, 30)), 'America/New_York', 'later');
const inKolkata = zonedDateTime(meeting, 'Asia/Kolkata');
const label = formatInstant(meeting, { dateStyle: 'medium', timeStyle: 'short' }, 'Europe/London', 'en-GB');
console.log(inKolkata, label);
```

Formatting uses `Intl`, so locale conventions, 12- and 24-hour clocks, and zone names follow the locale.

## Time zone data

AbsoluteUI does not bundle a time zone database. Offsets come from the browser's `Intl` data, which browsers update with their releases; an outdated browser can apply outdated rules. If you need authoritative offsets (for example from your server), register a `timeZoneEngine` in the global configuration.

## Recurrence

Recurring events use RFC 5545 rules (`FREQ`, `INTERVAL`, `COUNT`, `UNTIL`, `BYDAY` with ordinals, `BYMONTHDAY`, `BYMONTH`, `BYSETPOS`, `WKST`, `EXDATE`, `RDATE`). `expandRecurrence()` expands them correctly across daylight-saving changes, and `describeRecurrence()` produces a localized sentence. See [Recurrence Picker](/docs/components/recurrence-picker/) and [Scheduler](/docs/components/scheduler/).
