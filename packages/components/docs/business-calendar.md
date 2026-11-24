# Business Calendar

> Package: `@absoluteui/components/business-calendar` | Styles: `@absoluteui/components/business-calendar/style.css` | Since 0.6.0 | Status: R3

## 1. Purpose

Defines and shows which days count as working time. A `BusinessCalendarDefinition` lists working weekdays (default Monday to Friday), working hours (default 09:00 to 17:00, optionally per weekday), holidays (one-off or yearly), and exceptions (a date made working or non-working, with optional hours and reason).

`BusinessCalendar` shows one to twelve months of that definition: working days, non-working days (weekends), holidays, and changed days, with a legend and a list of the holidays in view. In edit mode Enter, Space, or a click toggles a day between working and non-working; the updated definition is emitted for saving. The same subpath exports the pure engine `createBusinessCalendar`, used by Scheduler (work weeks, business-hours shading, holiday headers) and by application code for working-day arithmetic.

## 2. Anatomy

```text
<div class="aui-business-calendar [--editable]">                                   (consumer host)
  <div class="aui-business-calendar__header">
    <button class="aui-business-calendar__nav aui-business-calendar__prev" aria-label="Previous months">
    <div class="aui-business-calendar__range" aria-live="polite">January 2026 to March 2026</div>
    <button class="aui-business-calendar__nav aui-business-calendar__next" aria-label="Next months">
  <div class="aui-business-calendar__months">
    <div class="aui-business-calendar__month">                                          (one per month)
      <h3 class="aui-business-calendar__heading">January 2026</h3>
      <table class="aui-business-calendar__grid" role="grid" aria-label="{label}, January 2026" [aria-readonly="true"]>
        <thead><tr><th class="aui-business-calendar__weekday" scope="col" abbr="Monday">Mon</th>...
        <tbody><tr><td class="aui-business-calendar__day --working|--non-working [--holiday] [--changed] [--today]"
                     aria-label="Thursday, January 1, 2026, holiday: New Year's Day" tabindex="-1|0">
                   <span class="aui-business-calendar__number" aria-hidden="true">1</span>
  <ul class="aui-business-calendar__legend" aria-label="Legend">...
  <div class="aui-business-calendar__holidays"><h3>Holidays</h3><ul class="aui-business-calendar__holiday-list">...
```

## 3. When to use

- Maintaining office days, public holidays, and one-off closures or extra working days.
- Showing a team or site which days count as working days (for SLAs, deliveries, or support hours).
- Working-day arithmetic in code with the engine alone (`addWorkingDays`, `workingDaysBetween`, `workingIntervals`).

## 4. When not to use

- Picking a date: use Date Picker or Calendar.
- Scheduling events: use Scheduler (it reads the same definition through `businessCalendar`).
- Per-person availability, shifts, or rotations: a definition describes one calendar.

## 5. Public properties

`BusinessCalendarOptions`:

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Accessible name; each grid is "{label}, {month year}". |
| `definition` | `BusinessCalendarDefinition` | `{}` | Validated (`BUSINESS_CALENDAR_DEFINITION`). |
| `month` | `PlainYearMonth` | month of the focused day | First visible month. |
| `focusedDate` | `PlainDate` | today | Roving tab stop. |
| `editable` | `boolean` | `false` | Toggle days. |
| `firstDayOfWeek` | `IsoWeekday` | locale | 1 = Monday. |
| `today` | `PlainDate` | today in `timezone` | Advanced: fixed clock. |
| `icons` | `{ previous, next }` | chevrons | |
| `months` | `number` | `3` | Global. 1 to 12; paging moves by this many. |
| `showLegend` / `showHolidays` | `boolean` | `true` | Global. |
| `locale`, `timezone`, `direction` | | common | Inherited. |

`BusinessCalendarDefinition`: `workingDays?: IsoWeekday[]`, `hours?: WorkingHours[]` (`{ start: PlainTime; end: PlainTime }`, end exclusive, 00:00 = midnight), `weekdayHours?: { '1'..'7': WorkingHours[] }`, `holidays?: { date; name; yearly? }[]`, `exceptions?: { date; working; hours?; name? }[]`.

Controller properties: `host`, `definition` (with edits), `engine`, `focusedDate`, `visibleMonth`, `options`.

## 6. Methods

| Method | Description |
|---|---|
| `BusinessCalendar.create(host, options)` | Validate and render. |
| `update(options)` | Merge options; `definition` replaces the data (and edits). |
| `goTo(date)` | Show a date and focus-track it (no events). |
| `setWorking(date, working)` | Programmatic edit (no events). |
| `focus()` | Focus the focused day. |
| `destroy()` | Remove rendering and listeners. |
| `createBusinessCalendar(definition?)` | Engine: `day(date)`, `isWorkingDay`, `addWorkingDays(date, n)`, `workingDaysBetween(start, end)`, `nextWorkingDay(date, includeSelf?)`, `previousWorkingDay`, `workingIntervals(date, timeZone, disambiguation?)`, `isWorkingTime(instant, timeZone)`, `definition`. |
| `normalizeBusinessCalendar(definition?)` | Validate and apply defaults. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-change` | `BusinessCalendarChangeDetail { date; working; definition }` | Edit mode only. Save `detail.definition`. |
| `aui-day-select` | `BusinessCalendarDaySelectDetail { date; day }` | Click, Enter, Space (both modes). |
| `aui-navigate` | `BusinessCalendarNavigateDetail { month }` | Paging by buttons or keys. |

All events bubble and are not cancelable.

## 8. Slots/content areas

None. Day content is the day number; kinds are expressed by classes and accessible names.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-business-calendar`, `--editable` | Host |
| `aui-business-calendar__header`, `__nav`, `__prev`, `__next`, `__range` | Paging header |
| `aui-business-calendar__months`, `__month`, `__heading`, `__grid`, `__weekday` | Months |
| `aui-business-calendar__day` with `--working`, `--non-working`, `--holiday`, `--changed`, `--today`, `--empty` | Day cells |
| `aui-business-calendar__legend`, `__legend-item`, `__swatch` | Legend |
| `aui-business-calendar__holidays`, `__holidays-heading`, `__holiday-list` | Holiday list |

## 10. Design tokens

See `metadata/business-calendar/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface` and `color-border` (working days), `color-surface-sunken` and `color-text-muted` (non-working), `color-warning-subtle` and `color-warning-fg` (holidays), `color-info-fg` (changed days), `border-width-strong`.

## 11. States

Working, non-working, holiday, changed (exception), today, focused, editable, read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| working day (edit mode) | Enter, Space, click, `setWorking(date, false)` | non-working (changed); `aui-change` (user) |
| changed day | toggle again | exception removed (pattern restored) |
| holiday (edit mode) | toggle | working (changed), the holiday name kept |
| months shown | previous/next, PageUp/PageDown, arrows past the edge | other months; `aui-navigate` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Calendar | Previous, next, then the focused day (one tab stop for all months). |
| ArrowLeft / ArrowRight | Day | Previous / next day (mirrored in RTL). |
| ArrowUp / ArrowDown | Day | Previous / next week. |
| Home / End | Day | First / last day of the week. |
| PageUp / PageDown | Day | Previous / next month; Shift: year. |
| Enter / Space | Day | Select (`aui-day-select`); edit mode: toggle. |

## 14. ARIA contract

- Each month is a `table role="grid"` named "{label}, {month year}", `aria-readonly="true"` unless editable.
- Day cells are gridcells with a full name stating the kind ("..., working day", "..., non-working day", "..., holiday: {name}", "..., working day (changed): {reason}"); today has `aria-current="date"`.
- One day has `tabindex="0"` across all months.
- The visible range is a polite live region; edits are announced ("January 6, 2026 is now a non-working day.").

## 15. Accessibility notes

- Kinds never rely on color: names state them, holidays have a bottom bar and are listed as text, changed days have a dashed outline.
- Day numbers are `aria-hidden`; the cell name includes the full date.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

Months flow into as many columns as fit (auto-fill grid, 15rem minimum); at 320 px one month per row without horizontal scrolling. The legend wraps. Navigation buttons are `touch-target-min` squares.

## 17. RTL behavior

`direction: 'rtl'` mirrors the grids and chevrons; ArrowLeft moves to the next day.

## 18. Theme behavior

Working days: surface with a border. Non-working: sunken surface, muted text. Holidays: subtle warning fill and a warning-colored bottom bar. Changed days: dashed info-colored outline. Forced colors: CanvasText borders and bars, GrayText for non-working days, Highlight focus.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { businessCalendar: { months: 12, showHolidays: false } } });
```

Global options: `months`, `showLegend`, `showHolidays`, plus inherited `locale`, `timezone`, and `direction`.

## 20. Component configuration support

Instance options override global and theme defaults; all options are dynamic through `update()`.

## 21. Timezone behavior

Dates are `PlainDate` without a timezone. "Today" is the current date in the configured timezone (UTC unless configured, SPEC section 8.1), never the host zone. The engine converts working hours into instants only with an explicit zone and DST policy: `workingIntervals(date, 'Europe/London')` resolves wall-clock hours through the timezone engine (a day with a DST change has correct instants). `isWorkingTime(instant, zone)` reads the wall clock in that zone.

## 22. Icon customization points

`previous` (`chevron-left`) and `next` (`chevron-right`); swapped in RTL.

## 23. Security behavior

Holiday names and reasons render through `textContent` (and `title`). Definitions are validated; no HTML sinks; CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Edits change the in-memory definition (`definition` getter) and are reported by `aui-change`.

## 25. Performance characteristics

Rendering creates at most 12 month tables (about 370 cells). The engine caches day lookups (up to 4,000 dates). Working-day arithmetic and counting use `@absoluteui/helpers/business-calendar`: counts do not depend on the length of the range (full weeks are counted arithmetically, holidays by binary search) and are exact for any range. Budget (e2e): create with 12 months < 40 ms.

## 26. Supported data scale

Up to 12 visible months and a few hundred holidays and exceptions.

## 27. Usage examples

See section 33 and `metadata/business-calendar/examples.json`: editable office calendar, engine-only arithmetic, global configuration.

## 28. Edge cases

- A holiday on a weekend is shown as a holiday; the day stays non-working.
- An exception wins over holidays and the pattern; toggling a changed day back removes the exception when the pattern already gives that state.
- Yearly holidays on 29 February occur only in leap years.
- Working hours ending at 00:00 end at midnight (the next day's start).
- `addWorkingDays(date, 0)` returns the date unchanged, even on a non-working day; use `nextWorkingDay` to move to one.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BUSINESS_CALENDAR_OPTIONS` | configuration | Empty label; invalid `month`, `focusedDate`, `today`, `editable`, `firstDayOfWeek`, or config options. |
| `BUSINESS_CALENDAR_DEFINITION` | configuration | Invalid weekdays, overlapping or reversed hours, holidays without a name, two exceptions on one date, wrong types. |
| `BUSINESS_CALENDAR_NO_WORKING_DAYS` | runtime | The calendar has no working day at all (for example `workingDays: []` without working exceptions). |

A failed construction leaves the host untouched.

## 30. Known limitations

- One hours pattern per weekday; no rotating shifts.
- Movable holidays must be listed per year.
- Editing toggles working state only.
- Timezone accuracy of `workingIntervals` depends on the browser ICU data.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML in holiday names.
- Range selection.
- Several calendars merged in one view.

## 32. TypeScript definitions

```ts
interface WorkingHours { start: PlainTime; end: PlainTime }
interface BusinessHoliday { date: PlainDate; name: string; yearly?: boolean }
interface BusinessDayException { date: PlainDate; working: boolean; hours?: readonly WorkingHours[]; name?: string }
interface BusinessCalendarDefinition { workingDays?: readonly IsoWeekday[]; hours?: readonly WorkingHours[]; weekdayHours?: Partial<Record<'1' | '2' | '3' | '4' | '5' | '6' | '7', readonly WorkingHours[]>>; holidays?: readonly BusinessHoliday[]; exceptions?: readonly BusinessDayException[] }
interface BusinessDay { date: PlainDate; working: boolean; hours: readonly WorkingHours[]; holiday: string | null; exception: boolean; reason: string | null; weekend: boolean }
interface BusinessCalendarChangeDetail { date: PlainDate; working: boolean; definition: BusinessCalendarDefinition }
interface BusinessCalendarDaySelectDetail { date: PlainDate; day: BusinessDay }
interface BusinessCalendarNavigateDetail { month: PlainYearMonth }
```

## 33. Vanilla JS example

```ts
import { plainDate, plainYearMonth } from '@absoluteui/core';
import { BusinessCalendar, type BusinessCalendarChangeDetail } from '@absoluteui/components/business-calendar';
import '@absoluteui/components/business-calendar/style.css';

const host = document.querySelector<HTMLElement>('#office-days');
if (host) {
  BusinessCalendar.create(host, {
    label: 'London office',
    month: plainYearMonth(2026, 12),
    editable: true,
    definition: { holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true }] },
  });
  host.addEventListener('aui-change', (event) => {
    const { definition } = (event as CustomEvent<BusinessCalendarChangeDetail>).detail;
    localStorage.setItem('office-days', JSON.stringify(definition));
  });
}
```

## 34. Angular example

`<aui-business-calendar>` is generated: inputs mirror `BusinessCalendarOptions`; `[(month)]` is two-way; outputs `changed`, `daySelected`, `navigate`; methods `goTo()`, `setWorking()`, `focus()`.

```ts
import { Component } from '@angular/core';
import { plainDate } from '@absoluteui/core';
import type { BusinessCalendarChangeDetail, BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';
import { AuiBusinessCalendar } from '@absoluteui/angular/business-calendar';

@Component({
  selector: 'app-office-days',
  imports: [AuiBusinessCalendar],
  template: `<aui-business-calendar label="Office" [definition]="definition" [editable]="true" [months]="6" (changed)="save($event)"></aui-business-calendar>`,
})
export class OfficeDaysComponent {
  definition: BusinessCalendarDefinition = { holidays: [{ date: plainDate(2026, 1, 1), name: "New Year's Day", yearly: true }] };

  save(detail: BusinessCalendarChangeDetail): void {
    this.definition = detail.definition;
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { plainDate } from '@absoluteui/core';
import type { BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';
import { AuiBusinessCalendar } from '@absoluteui/react/business-calendar';

const initial: BusinessCalendarDefinition = { holidays: [{ date: plainDate(2026, 1, 1), name: "New Year's Day", yearly: true }] };

export function OfficeDays() {
  const [definition, setDefinition] = useState(initial);
  return <AuiBusinessCalendar label="Office" definition={definition} editable months={6} onChange={(d) => { setDefinition(d.definition); }} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for events, refs, and SSR. Load the stylesheet listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { plainDate } from '@absoluteui/core';
import type { BusinessCalendarChangeDetail, BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';
import { AuiBusinessCalendar } from '@absoluteui/vue/business-calendar';

const definition = ref<BusinessCalendarDefinition>({ holidays: [{ date: plainDate(2026, 1, 1), name: "New Year's Day", yearly: true }] });
const save = (detail: BusinessCalendarChangeDetail) => (definition.value = detail.definition);
</script>

<template>
  <AuiBusinessCalendar label="Office" :definition="definition" editable :months="6" @change="save" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for events, template refs, and SSR.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
