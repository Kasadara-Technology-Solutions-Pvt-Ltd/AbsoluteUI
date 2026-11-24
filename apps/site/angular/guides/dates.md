---
title: Dates, time zones, and business calendars
description: Time zone scopes, zone-free date values, daylight saving decisions, and business calendars in the Angular date and time components.
---

## Time zones

Every date and time component uses the time zone of its configuration scope (default UTC, never the host's zone). Change it for a subtree with `provideAbsoluteUIConfig({ timezone: 'Europe/Berlin' })`, or for one component with the `timezone` input.

Values are zone-free: `Instant` for moments (store and send them as UTC), `PlainDate` and `Range<PlainDate>` for days, `PlainTime`, `PlainYearMonth`, and `PlainYearQuarter` for the other pickers. `disambiguation` (scope or input) decides local times that do not exist or repeat when clocks change; with `'reject'`, the form reports `nonexistent-time` through the `aui` error.

## Business calendars

Weekends, holidays, and working days come from a business calendar created with `createBusinessCalendar` from `@absoluteui/components/business-calendar`. Bind it to `<aui-calendar>`, `<aui-date-picker>`, `<aui-date-range-picker>`, or `<aui-date-time-picker>`: non-working days and holidays are marked and named, and `disableNonWorking` makes them unavailable (a typed one is reported as unavailable).

```html
<aui-date-picker label="Delivery date" [businessCalendar]="calendar" disableNonWorking [(value)]="delivery" />
```

See [Business calendars](/docs/guides/business-calendars/) for building calendars (weekends, fixed and movable holidays, half days) and for counting calendar days, weekdays, and business days.

## Searching options

`<aui-combobox>` and `<aui-multi-select>` can load options while the user types: `[loadOptions]="search"`, where `search(query, { signal })` returns a promise of options. Requests are debounced (`[loadDelay]`, default 250 ms), stale requests are aborted, and loading and errors are shown and announced.
