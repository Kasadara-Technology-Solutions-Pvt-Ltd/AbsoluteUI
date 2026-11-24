# Calendar

> Package: `@absoluteui/components/calendar` | Styles: `@absoluteui/components/calendar/style.css` | Since 0.2.0 (range selection and multiple months since 0.3.0) | Status: R2

## 1. Purpose

A month grid for browsing and choosing one date or, since 0.3.0, an inclusive date range. `Calendar` follows the WAI-ARIA APG date picker grid: a localized month-year heading, previous/next month buttons, and a `table role="grid"` with a roving tabindex. Since 0.3.0 it can show one to three consecutive months side by side (one grid per month, one roving tab stop across all of them) and select a range: the first pick sets an anchor, the days between the anchor and the hovered or focused day are previewed, and the second pick completes the range. Values are `PlainDate` and `Range<PlainDate>` (SPEC section 8.4). "Today" is the current date in the configured timezone, never the host machine's zone (SPEC section 8.1). Date Picker and Date Range Picker compose it in a popup.

## 2. Anatomy

```text
<div class="aui-calendar">                                         (consumer host)
  <div class="aui-calendar__header" dir>
    <button class="aui-calendar__nav aui-calendar__prev" aria-label="Previous month">
    <div class="aui-calendar__heading" id aria-live="polite">September 2026</div>
    <button class="aui-calendar__nav aui-calendar__next" aria-label="Next month">
  </div>
  <table class="aui-calendar__grid" role="grid" aria-labelledby=heading dir>
    <thead><tr>
      <th class="aui-calendar__week-header" scope="col" abbr="Week">   (showWeekNumbers)
      <th class="aui-calendar__weekday" scope="col" abbr="Sunday">Sun</th> ...
    </tr></thead>
    <tbody><tr>                                                      (4-6 visible weeks)
      <th class="aui-calendar__week-number" scope="row" aria-label="Week 36">
      <td class="aui-calendar__day" tabindex="-1|0" aria-label="Thursday, September 10, 2026"
          aria-selected aria-current="date" aria-disabled>10</td> ...
    </tr></tbody>
  </table>
</div>
```

With `visibleMonths` greater than 1 (since 0.3.0), the host gets `aui-calendar--multi` and holds one panel per month; the previous-month button sits in the first header, the next-month button in the last, and inner headers get a spacer:

```text
<div class="aui-calendar aui-calendar--multi">
  <div class="aui-calendar__months" dir>
    <div class="aui-calendar__month">
      <div class="aui-calendar__header"> prev | heading (aria-live) | <span class="aui-calendar__nav-spacer"> </div>
      <table class="aui-calendar__grid" role="grid" aria-multiselectable="true"> ... </table>   (range mode)
    </div>
    <div class="aui-calendar__month">
      <div class="aui-calendar__header"> <span class="aui-calendar__nav-spacer"> | heading | next </div>
      <table class="aui-calendar__grid" role="grid"> ... </table>
    </div>
  </div>
</div>
```

The focusable element is the `td` itself (the APG pattern), not a button inside it, because `aria-selected` is valid on gridcells but not on buttons.

## 3. When to use

- An always-visible calendar, for example on a booking or scheduling page.
- Browsing dates where the day of the week matters.
- An always-visible range calendar (`selectionMode: 'range'`, for example with `visibleMonths: 2`).

Business calendar (since 0.9.0): pass `businessCalendar: createBusinessCalendar({ ... })` (from `@absoluteui/components/business-calendar`) to mark non-working days and holidays in the calendar. They are named in each day's accessible name (for example "Friday, 2 October 2026, Founders day, non-working day"), not only colored. With `disableNonWorking: true` they cannot be picked, and a typed non-working day is reported like a day rejected by `isDateDisabled`.

## 4. When not to use

- A form field for a known date such as a birth date: use Date Input.
- A field with a calendar popup: use Date Picker.
- A date range field with typing and a popup: use Date Range Picker.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `grid` | `HTMLTableElement` | The `table role="grid"` of the first visible month. |
| `grids` | `readonly HTMLTableElement[]` | Since 0.3.0: all month grids, first to last. |
| `value` | `PlainDate \| null` | Selected day (single mode). |
| `range` | `Range<PlainDate> \| null` | Since 0.3.0, range mode: the selected range (not the pending anchor). |
| `rangeAnchor` | `PlainDate \| null` | Since 0.3.0, range mode: the first picked day while the range is incomplete, else `null`. |
| `focusedDate` | `PlainDate` | The day holding the roving tab stop. |
| `visibleMonth` | `{ year, month }` | First visible month (month 1-12). |
| `today` | `PlainDate` | Current date in the configured timezone, or the `today` option. |
| `options` | `Readonly<CalendarOptions>` | Current options. |

Options: `value`, `min`, `max`, `isDateDisabled`, `businessCalendar`, `disableNonWorking` (since 0.9.0), `focusedDate`, `firstDayOfWeek` (ISO 1-7; default from the locale), `label` (grid name; default is the heading), `today` (advanced override), and `icons`. Since 0.3.0: `selectionMode` (`'single'` default, or `'range'`; `value` is not used in range mode), `range`, `minDays` and `maxDays` (range length in days counting both ends, integers 1-100000), and `visibleMonths` (integer 1-3, default 1). Full table: `metadata/calendar/api.json`.

| Global option | Type | Default |
|---|---|---|
| `showOutsideDays` | `boolean` | `true` |
| `showWeekNumbers` | `boolean` | `false` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `timezone` (inherited) | IANA | `'UTC'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Calendar.create(host, options?)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic selection; no events. A date also becomes the focused day, so its month is shown. |
| `setRange(range)` | Since 0.3.0, range mode: programmatic range; no events. A pending anchor is discarded; the first day becomes the focused day. Throws when `start > end`. |
| `goTo(date)` | Show the month of `date` and make it the focused day; no events. Keeps DOM focus in the grid if it was there. |
| `focus()` | Move DOM focus to the focused day. |
| `update(options)` | Merge and apply options. Changing `range`, `selectionMode`, `minDays`, or `maxDays` discards a pending anchor; changing `visibleMonths` rebuilds the layout. |
| `destroy()` | Remove rendering, listeners, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value: PlainDate; range?: Range<PlainDate> }` | Yes | Single mode: the user selected a day (click, Enter, Space), including re-selecting the current day. Range mode: the user picked the last day; `range` is the completed range and `value` the day just picked. |
| `aui-navigate` | `{ month: { year, month } }` | Yes | The user changed the visible months (keys, month buttons, or an outside day); `month` is the first visible month. |

In range mode the first pick emits no `aui-change` (it is announced instead). Programmatic changes (`setValue`, `setRange`, `goTo`, `update`) emit no events.

## 8. Slots/content areas

None. All text comes from `Intl` formatting and the message catalog.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-calendar` | Host; `--multi` modifier with more than one visible month. |
| `aui-calendar__months`, `__month` | Since 0.3.0: container of the month panels (wraps when narrow) and one panel per month. |
| `aui-calendar__header`, `__heading` | Header and month-year heading (the first heading is live). |
| `aui-calendar__nav`, `__prev`, `__next` | Month buttons (`aria-disabled` at the range edges). |
| `aui-calendar__nav-spacer` | Since 0.3.0: placeholder for the missing month button in inner headers. |
| `aui-calendar__grid` | The grid table. |
| `aui-calendar__weekday`, `__week-header`, `__week-number` | Column headers and week-number row headers. |
| `aui-calendar__day` | Day cell; modifiers `--today`, `--selected`, `--outside`, `--disabled`, `--empty`; since 0.3.0 in range mode `--in-range`, `--range-start`, `--range-end`, and `--preview` (days previewed while a first day is pending). |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/calendar/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-primary` and `color-on-primary` (selected day, range ends, pending first day), `color-selected` and `color-selected-text` (days in a range and the preview edge), `space-4` (gap between months), `color-border-strong` (today ring), `color-hover`, `color-text-muted` (outside days, headers), `color-text-disabled`, `color-focus-ring`, `control-height-sm`, `radius-md`.

## 11. States

default, focused day (focus-visible), selected, today, outside day, disabled day, empty cell (outside days hidden), first/last navigable month; range mode: range selected (start, in range, end), range pending (first day picked, preview).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | arrow, Home/End, PageUp/PageDown key | focused day moves (clamped to min/max); month re-rendered and `aui-navigate` when it changes |
| any | month button | adjacent month shown; focus stays on the button |
| enabled day | click, Enter, Space (single mode) | selected; `aui-change` |
| no pending day | click, Enter, Space (range mode) | first day pending (`rangeAnchor`), announced; days that would break `minDays`/`maxDays` disabled; no `aui-change` |
| first day pending | pointer move or focus move | preview between the first day and the hovered or focused day |
| first day pending | click, Enter, Space on an enabled day | range completed in either order; `aui-change` with `range` |
| first day pending | Escape, `setRange`, or `update` of `range`/`selectionMode`/`minDays`/`maxDays` | pending day discarded; the previous range is shown |
| disabled day | click, Enter, Space | no change |
| outside day | click | selected; its month is shown |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowRight / ArrowLeft | Day | Next / previous day (mirrored in RTL); moves between visible grids. |
| ArrowDown / ArrowUp | Day | Same weekday next / previous week. |
| Home / End | Day | First / last day of the week (respects `firstDayOfWeek`). |
| PageDown / PageUp | Day | Same day next / previous month; the day clamps to the month length. All visible months scroll by one. |
| Shift+PageDown / Shift+PageUp | Day | Same day next / previous year; 29 February clamps to 28. |
| Enter / Space | Day | Single mode: select the day. Range mode: pick the first day, then the last day. Ignored when disabled. |
| Escape | Day, first day pending | Discard the pending first day (not handled otherwise). |
| Enter / Space | Month button | Previous / next month. |
| Tab / Shift+Tab | Any | Previous month button, next month button, then the one tabbable day (one tab stop across all visible months). |

## 14. ARIA contract

- `table role="grid"` per visible month, named by its heading (`aria-labelledby`) or by `label` (`aria-label`; with several months "{label}, {month}", so each grid has a distinct name).
- Range mode: every grid has `aria-multiselectable="true"`.
- Column headers: `th scope="col"` with abbreviated text and the full weekday in `abbr`.
- Day cells: `aria-label` is the full localized date (`dateStyle: 'full'`); `aria-current="date"` on today; `aria-disabled="true"` on out-of-range and consumer-disabled days and, while a first day is pending, on days that would break `minDays`/`maxDays`.
- `aria-selected="true"`: single mode, on the selected day only; range mode, on every day of a committed range, or only on the pending first day (the preview is not a selection).
- Committed range names: "{date}, start of range", "{date}, end of range", or "{date}, start and end of range".
- The pending first day is announced politely: "{date} selected as the first day. Choose the last day."
- Exactly one day has `tabindex="0"`, across all visible months.
- The first month's heading is an `aria-live="polite"` region, so month changes are announced once.
- Month buttons use `aria-disabled` (not `disabled`) at the range edges so focus is not lost.

## 15. Accessibility notes

- Selected and today are conveyed by ARIA and by shape (fill, ring, bold), not by color alone.
- Disabled days stay focusable so keyboard users can move through them (APG).
- Focus never moves outside `min`/`max`; with several months the view also stops at `min` and `max`, so no visible month is entirely disabled.
- The range preview is marked by an inner edge in addition to its fill, and range ends by the selected-day fill, not by color alone.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Intrinsic size: seven columns of `control-height-sm` cells (eight with week numbers). It does not stretch; give one month roughly 17rem, or let the container scroll horizontally on very narrow screens. Several months sit side by side (`space-4` apart) and wrap one below the other when the container is narrow.

## 17. RTL behavior

`dir` is set on the header, the grid, and (with several months) the months container from the configured `direction`, so columns and months run right to left. ArrowLeft/ArrowRight are mirrored and the chevrons are flipped to point in the reading direction.

## 18. Theme behavior

Role tokens only; verified in the light, dark, and high-contrast themes. In forced-colors mode the selected day and range ends use `Highlight`/`HighlightText`, days in a range a dashed `CanvasText` outline, today a `CanvasText` outline, and disabled days `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'Asia/Kolkata' }, components: { calendar: { showWeekNumbers: true } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Values are `PlainDate` and never shift. The configured `timezone` (default UTC, never the host zone) is used only to find "today", which gets `aria-current="date"` and is the default focused day. Example with a fixed instant of 2026-03-15 10:30 UTC: today is 16 March in `Pacific/Kiritimati` (UTC+14) and 14 March in `Pacific/Pago_Pago` (UTC-11). The advanced `today` option pins the date for tests, server rendering, or demos.

## 22. Icon customization points

`icons.previous` (default `chevron-left`) and `icons.next` (default `chevron-right`). Both are flipped in RTL.

## 23. Security behavior

All text comes from `Intl` and is set with `textContent`; no HTML parsing. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Six rows of seven cells are created once and reused for every month; navigation within a month only moves the tab stop. `isDateDisabled` runs once per visible day per render. Formatters are cached by core. The range preview updates only the range classes, without a full re-render. Budgets: under 5 ms average per `Calendar.create` across 100 instances; under 10 ms with `visibleMonths: 2` and `selectionMode: 'range'`.

## 26. Supported data scale

One to three months per instance (up to 42 day cells each).

## 27. Usage examples

```ts
import { plainDate } from '@absoluteui/core';
import { Calendar } from '@absoluteui/components/calendar';

const host = document.createElement('div');
document.body.append(host);
Calendar.create(host, { label: 'Delivery date', min: plainDate(2026, 10, 1) });
```

More examples, type-checked in CI: `metadata/calendar/examples.json`.

## 28. Edge cases

- PageDown from 31 January 2024 goes to 29 February 2024 (leap year); Shift+PageDown from there goes to 28 February 2025.
- Week starts: Sunday for `en-US`, Monday for `de-DE`, Saturday for `ar-EG` (from `getFirstDayOfWeek`).
- Week numbers are ISO 8601, taken from each row's Monday: 1 January 2026 is in week 1; 31 December 2020 is in week 53.
- `min` equal to `max` shows one selectable day, and both month buttons are `aria-disabled`.
- With `showOutsideDays: false`, leading and trailing cells are empty and not focusable. With more than one visible month, outside days are never shown, so every date appears once.
- Range mode: picking the last day before the first orders the range; picking the same day twice gives a one-day range.
- Range mode: a range may include disabled days; only the first and last day are checked. `minDays: 3` from 5 March allows 7 March as the last day (both ends count).
- With several months and a `max`, the last visible month never goes past the month of `max`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CALENDAR_OPTIONS` | configuration | A date option is not a `PlainDate`, `min > max`, `firstDayOfWeek` outside 1-7, an empty `label`, or a non-function `isDateDisabled`; since 0.3.0 also an invalid `selectionMode`, a `range` that is not a range of `PlainDate` or has `start > end` (also from `setRange`), `minDays`/`maxDays` not an integer 1-100000, `minDays > maxDays`, or `visibleMonths` outside 1-3. |
| `CFG_*` | configuration | Invalid `locale`, `timezone`, `direction`, `showOutsideDays`, or `showWeekNumbers`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Gregorian calendar only; single-date or contiguous-range selection only.
- A range may include disabled days: only the first and last day are checked; `minDays` and `maxDays` count both days.
- At most three visible months; outside days are shown with one month only.
- "Today" is computed on render; a calendar left open across midnight updates on the next navigation or configuration change.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Custom or HTML cell content.
- More than three visible months.
- Multiple non-contiguous dates.

## 32. TypeScript definitions

```ts
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
interface CalendarMonth { readonly year: number; readonly month: number }
interface CalendarChangeDetail { value: PlainDate; range?: Range<PlainDate> }   // range: range mode only
// CalendarOptions since 0.3.0:
//   selectionMode?: 'single' | 'range'; range?: Range<PlainDate> | null;
//   minDays?: number; maxDays?: number; visibleMonths?: number;
interface CalendarNavigateDetail { month: CalendarMonth }
interface CalendarIcons { previous: IconRef; next: IconRef }
function isoWeekNumber(date: PlainDate): number;
```

## 33. Vanilla JS example

```ts
import { plainDateToString } from '@absoluteui/core';
import { Calendar, type CalendarChangeDetail } from '@absoluteui/components/calendar';
import '@absoluteui/components/calendar/style.css';

const host = document.querySelector<HTMLElement>('#calendar');
if (host) {
  Calendar.create(host, { label: 'Appointment date', showWeekNumbers: true });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<CalendarChangeDetail>).detail;
    host.dataset.value = plainDateToString(value);
  });
}
```

Range selection over two months (since 0.3.0):

```ts
import { plainDateToString } from '@absoluteui/core';
import { Calendar, type CalendarChangeDetail } from '@absoluteui/components/calendar';

const host = document.querySelector<HTMLElement>('#stay');
if (host) {
  Calendar.create(host, { label: 'Stay', selectionMode: 'range', visibleMonths: 2, maxDays: 14 });
  host.addEventListener('aui-change', (event) => {
    const { range } = (event as CustomEvent<CalendarChangeDetail>).detail;
    if (range) host.dataset.range = `${plainDateToString(range.start)}/${plainDateToString(range.end)}`;
  });
}
```

## 34. Angular example

`AuiCalendar` is a ControlValueAccessor only (no Validator: the calendar has no validity). The model value is a `PlainDate` or `null` (the single-mode `value`); for a range bound to a form, use `AuiDateRangePicker`.

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { PlainDate } from '@absoluteui/core';
import { AuiCalendar } from '@absoluteui/angular/calendar';

@Component({
  selector: 'app-booking',
  imports: [ReactiveFormsModule, AuiCalendar],
  template: `<aui-calendar label="Appointment date" [firstDayOfWeek]="1" [formControl]="date"></aui-calendar>`,
})
export class BookingComponent {
  readonly date = new FormControl<PlainDate | null>(null);
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { type PlainDate } from '@absoluteui/core';
import { AuiCalendar } from '@absoluteui/react/calendar';

export function Example() {
  const [value, setValue] = useState<PlainDate | null>(null);
  return <AuiCalendar label="Delivery date" value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { type PlainDate } from '@absoluteui/core';
import { AuiCalendar } from '@absoluteui/vue/calendar';
const value = ref<PlainDate | null>(null);
</script>

<template>
  <AuiCalendar v-model="value" label="Delivery date" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
