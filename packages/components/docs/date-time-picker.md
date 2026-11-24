# DateTime Picker

> Package: `@absoluteui/components/date-time-picker` | Styles: `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, and `@absoluteui/components/date-time-picker/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A field for an exact moment (date and time of day) with a picker popup. `DateTimePicker` composes a Date Input (minute granularity) with a trigger button inside the field boundary. The button opens a non-modal `role="dialog"` popup in the top layer (WAI-ARIA APG date picker dialog) with a Calendar, a listbox of suggested times, and a Done button. The value is an `Instant` (SPEC section 8.4). Typed and picked wall-clock times are resolved the same way: in the configured timezone, using the `disambiguation` policy for daylight-saving transitions (section 8.5). The picker, not its inner Date Input, is the form control that `Form` discovers.

## 2. Anatomy

```text
<div class="aui-date-time-picker" data-aui-control>                     (consumer host; registered with Form)
  <div class="aui-date-time-picker__field aui-date-input">                (inner Date Input host; not registered)
    <div class="aui-date-input__label">
    <div class="aui-date-input__group" role="group">
      <div class="aui-date-input__fields"> date and time segments ... </div>
      <div class="aui-date-time-picker__trailing">                        (Date Input `trailing` option)
        <button class="aui-date-time-picker__button" aria-haspopup="dialog" aria-expanded aria-controls aria-label="Choose date and time">
        <div class="aui-date-time-picker__popup" role="dialog" aria-modal="false" aria-label="Choose date and time" popover="manual">
          <div class="aui-date-time-picker__body">
            <div class="aui-date-time-picker__calendar aui-calendar"> ... </div>
            <div class="aui-date-time-picker__time">
              <div class="aui-date-time-picker__time-label">Time</div>
              <div class="aui-date-time-picker__listbox" role="listbox" tabindex="0" aria-labelledby aria-activedescendant>
                <div class="aui-date-time-picker__option" role="option" aria-selected [aria-disabled]>9:00 AM</div> ...
          <div class="aui-date-time-picker__footer"><button class="aui-date-time-picker__done">Done</button></div>
    <div class="aui-date-input__description"> <div class="aui-date-input__hint"> <div class="aui-date-input__error">
    <input type="hidden" name>
```

The popup sits inside the field group in the DOM (it renders in the top layer). Moving focus between the segments, the button, and the popup therefore does not mark the field touched, and a picker inside a modal Dialog stays inside the dialog's subtree.

## 3. When to use

- Exact moments users may type or look up: appointments, departures, deadlines with a time.
- Scheduling forms that need `min`/`max` instants, unavailable days, and explicit timezone handling.

Business calendar (since 0.9.0): pass `businessCalendar: createBusinessCalendar({ ... })` (from `@absoluteui/components/business-calendar`) to mark non-working days and holidays in the calendar. They are named in each day's accessible name (for example "Friday, 2 October 2026, Founders day, non-working day"), not only colored. With `disableNonWorking: true` they cannot be picked, and a typed non-working day is reported like a day rejected by `isDateDisabled`.

## 4. When not to use

- A date without a time: use Date Picker.
- A time of day without a date or timezone (for example opening hours): use Time Picker.
- When users pick the timezone per value: pair the picker with a timezone Select and `update({ timezone })`.
- Date-time ranges: not supported yet (use a Date Range Picker with Time Pickers).

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; registered with `Form`. |
| `input` | `DateInput` | Inner Date Input (minute granularity); not registered with `Form`. |
| `calendar` | `Calendar` | Calendar inside the popup (created once, reused). |
| `button` | `HTMLButtonElement` | Trigger button. |
| `popup` | `HTMLDivElement` | Dialog popup (`popover="manual"`). |
| `listbox` | `HTMLDivElement` | Listbox of suggested times. |
| `doneButton` | `HTMLButtonElement` | Done button. |
| `value` | `Instant \| null` | Valid value, or `null` when empty or invalid. |
| `validity` | `DateInputValidity` | `{ valid, error, message, localTimeStatus }`. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `name`, `label`, `disabled` | | Form control contract. |
| `dirty` | `boolean` | Value differs from the initial value. |
| `touched` | `boolean` | Focus has left the whole field at least once. |
| `options` | `Readonly<DateTimePickerOptions>` | Current options. |

Options: `label` (required), `value`, `min`, `max` (all `Instant`), `name`, `description`, `required`, `disabled`, `readOnly`, `isDateDisabled`, `businessCalendar`, `disableNonWorking` (since 0.9.0), `firstDayOfWeek`, `icons`, and (advanced, since 0.6.0) `formControl: false` for composite controls that register themselves with Form (Schedule Picker). Full table: `metadata/date-time-picker/api.json`.

| Global option | Type | Default |
|---|---|---|
| `closeOnSelect` | `boolean` | `true` |
| `step` | integer 1..720 (minutes) | `30` |
| `hourCycle` | `'auto' \| 'h12' \| 'h23'` | `'auto'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `timezone` (inherited) | IANA | `'UTC'` |
| `disambiguation` (inherited) | `'compatible' \| 'earlier' \| 'later' \| 'reject'` | `'compatible'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

The resolved `locale`, `timezone`, `disambiguation`, `direction`, and `hourCycle` are forwarded to the children, so the segments, the calendar, and the time labels always agree. `showOutsideDays` and `showWeekNumbers` come from the `calendar` configuration.

## 6. Methods

| Method | Description |
|---|---|
| `DateTimePicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `open()` | Open the popup and focus the selected day, else today. No-op when disabled or read-only. |
| `close()` | Close the popup; if focus was inside it, focus returns to the trigger button. |
| `setValue(value)` | Programmatic `Instant \| null`; no events. |
| `update(options)` | Merge and apply options to the field, calendar, and listbox. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error; cleared when the user types or picks. `null` clears it. |
| `getFormValue()` | ISO 8601 instant with `Z` (for example `2026-03-08T07:30:00.000Z`), or `null` when empty or invalid. |
| `focus()` | Focus the first segment. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close and remove rendering, listeners, form registration, and subscriptions, including the children's. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | Typing or picking changed the value, validity, or DST status. Dispatched from the picker host; the inner Date Input and Calendar change events are not exposed. |
| `aui-navigate` | `{ month: { year, month } }` | Yes | From the inner Calendar: the user changed the visible month. |
| `aui-open` | `null` | No | The popup opened. |
| `aui-close` | `null` | No | The popup closed. |

Programmatic changes emit no `aui-change`.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-date-time-picker` | Host; `--disabled` modifier. |
| `aui-date-time-picker__field` | Inner Date Input host; all `aui-date-input*` classes apply inside. |
| `aui-date-time-picker__trailing` | Button and popup container inside the Date Input group. |
| `aui-date-time-picker__button` | Trigger button. |
| `aui-date-time-picker__popup` | Top-layer dialog popup. |
| `aui-date-time-picker__body` | Calendar and time column; wraps on narrow viewports. |
| `aui-date-time-picker__calendar` | Calendar host; all `aui-calendar*` classes apply inside. |
| `aui-date-time-picker__time`, `__time-label` | Time column and its visible label. |
| `aui-date-time-picker__listbox` | Scrollable listbox; it grows to the calendar height. |
| `aui-date-time-picker__option` | Suggested time; `--active` modifier; `aria-selected` and `aria-disabled` states. |
| `aui-date-time-picker__footer`, `__done` | Footer and Done button. |

Load the Date Input and Calendar stylesheets as well. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/date-time-picker/tokens.json` for this stylesheet (verified in CI), plus the Date Input and Calendar tokens. Key tokens: `color-surface`, `color-border`, `shadow-md`, `radius-md` (popup); `color-selected`, `color-selected-text`, `color-hover`, `color-focus-ring`, `control-height-sm` (options); `color-text-muted`, `control-height-md` (trigger).

## 11. States

empty, partial (incomplete), valid, valid with a DST hint (adjusted or repeated time), invalid (Date Input errors including `nonexistent-time`/`ambiguous-time` under `'reject'`, unavailable day, custom), open, disabled, read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | button, or Alt+ArrowDown on a segment | open; focus on the selected day or today; the active time is the field's time (else 09:00); `aui-open` |
| open | pick a day | the date changes and the time of day is kept (09:00, or the first available time, when empty); `aui-change` if changed; stays open |
| open | pick a time | the time changes and the date is kept (the focused day when empty); `aui-change` if changed; closed and focus on the button (`closeOnSelect`) |
| open | Done, or Escape | closed; focus on the button; `aui-close` |
| open | pointer outside, or Tab out of the popup | closed |
| any | user types | `aui-change`; the calendar and listbox follow while open |
| any | `reset()` | closed, initial value, pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Trigger button | Open or close the popup. |
| Alt+ArrowDown | Segment | Open the popup (the segment does not change). |
| Arrows, Home/End, PageUp/PageDown, Shift+PageUp/PageDown | Day | Calendar navigation (see Calendar). |
| Enter / Space | Day | Pick the day; the popup stays open. |
| ArrowUp/ArrowDown, Home/End, PageUp/PageDown | Time listbox | Move the active time. |
| Printable characters | Time listbox | Typeahead to the first matching time ("9", "9:3"). |
| Enter / Space | Time listbox | Pick the active time; closes (`closeOnSelect`). |
| Tab / Shift+Tab | Popup | Month buttons, the day, the time listbox, then Done; leaving the popup closes it. |
| Enter / Space | Done | Close and focus the trigger. |
| Escape | Popup | Close and return focus to the trigger. Inside a Dialog, only the popup closes. |
| Date Input keys | Segment | As in Date Input. |

## 14. ARIA contract

- The field is the Date Input's labelled `role="group"`; `aria-describedby` references the help text, the time-zone/DST hint, and the error.
- Trigger: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id), `aria-label` "Choose date and time", or "Change date and time, {long date and short time}" when a value is set.
- Popup: `role="dialog"`, `aria-modal="false"`, `aria-label` "Choose date and time".
- Calendar grid: see Calendar.
- Time list: `role="listbox"` named by the visible "Time" label; `aria-activedescendant` points at the active `role="option"`; `aria-selected="true"` on the field's time; `aria-disabled="true"` on times outside `min`/`max` for the current date.

## 15. Accessibility notes

- The segments stay the primary input; the popup is an alternative.
- The popup is non-modal: focus is not trapped and the page stays reachable. Escape and outside presses close it through the shared overlay stack, so only the topmost overlay responds.
- The time zone is always stated in the hint (for example "Time zone: Eastern Daylight Time (GMT-04:00)"). DST adjustments are explained in text, the same way for typed and picked input.
- The active time has an outline, and unavailable times are struck through, so neither state relies on color alone.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The field fits its content like Date Input. The popup is positioned under the field (`bottom-start`), flips above when there is no room, and scrolls when taller than the available height (`--aui-available-height`). On narrow viewports the time column wraps below the calendar and keeps a minimum height of four options.

## 17. RTL behavior

Segment order follows the locale. The trigger sits at the inline end of the field. The popup aligns to the field's inline start, the calendar mirrors arrows and chevrons, and the time column follows the calendar in inline order.

## 18. Theme behavior

Role tokens only; verified in the light, dark, and high-contrast themes. In forced-colors mode the popup has a `CanvasText` border, the selected time uses `Highlight`/`HighlightText`, and unavailable times use `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'America/New_York' }, components: { dateTimePicker: { step: 15, hourCycle: 'h23' } } });
```

Changes apply to existing instances immediately. Changes that affect only `step` or `closeOnSelect` do not rebuild the field, so partially typed input is kept.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Values are `Instant`. Wall-clock input is resolved in the configured `timezone` (default UTC, never the host zone, SPEC section 8.1) with `disambiguation`. Picked input goes through the same Date Input code as typed input.

| Case (America/New_York) | `compatible` (default) | `earlier` | `later` | `reject` |
|---|---|---|---|---|
| 2026-03-08 02:30 (does not exist) | 03:30 EDT (`07:30Z`), hint "Adjusted to 3:30 AM..." | 01:30 EST (`06:30Z`) | 03:30 EDT | error `nonexistent-time` |
| 2026-11-01 01:30 (occurs twice) | 01:30 EDT (`05:30Z`), hint "...the earlier occurrence (GMT-4) is used." | 01:30 EDT | 01:30 EST (`06:30Z`) | error `ambiguous-time` |

The segments keep the wall-clock time the user chose, so changing `disambiguation` or `timezone` re-resolves it. `min` and `max` are instants; the calendar disables days whose local date (in `timezone`) is outside them, and the listbox disables times that resolve outside them. "Today" in the calendar is today in `timezone`.

## 22. Icon customization points

`icons.calendar` (default `calendar`).

## 23. Security behavior

All text uses `textContent` and `Intl` formatting; no HTML parsing. The popup uses the Popover API; no inline styles or handlers. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, the inner Date Input's hidden input carries the ISO 8601 instant with `Z`.

## 25. Performance characteristics

One Date Input, one Calendar, and one listbox per picker, created once. The options (1440 / `step`, 48 by default) are rebuilt only when `locale`, the hour cycle, or `step` changes. Picking updates their states in place. Budget: under 15 ms average per `DateTimePicker.create` across 100 instances.

## 26. Supported data scale

100 pickers per page; `step: 1` (1440 options) is supported but slower to scroll.

## 27. Usage examples

```ts
import { parseInstant } from '@absoluteui/core';
import { DateTimePicker } from '@absoluteui/components/date-time-picker';

const host = document.createElement('div');
document.body.append(host);
DateTimePicker.create(host, { label: 'Departure', name: 'departure', required: true, timezone: 'America/New_York', min: parseInstant('2026-01-01T05:00:00Z') });
```

More examples, type-checked in CI: `metadata/date-time-picker/examples.json`.

## 28. Edge cases

- Picking a day in an empty field uses 09:00 (or the first available time at or after it). Picking a time in an empty field uses the calendar's focused day (today in `timezone` unless the user navigated).
- Picking 2026-03-08 while the field shows 02:30 in New York keeps "02:30" in the segments, stores 03:30 EDT, and shows the adjustment hint. With `'reject'` the value is `null` and the error is shown immediately.
- A time with a DST error under `'reject'` stays listed and pickable, so the user sees why it is invalid. Picking another time keeps the date.
- Re-picking the current day or time emits no `aui-change`.
- Inside a modal Dialog, the first Escape closes the popup and the second closes the dialog.
- Opening from an empty required field does not show "This field is required." until focus leaves the whole field.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DATE_TIME_PICKER_OPTIONS` | configuration | Missing label; `value`/`min`/`max` not an `Instant`; `min > max`; non-function `isDateDisabled`. |
| `CALENDAR_OPTIONS` | configuration | `firstDayOfWeek` outside 1-7. |
| `CFG_*` | configuration | Invalid `locale`, `timezone`, `disambiguation`, `direction`, `step`, `hourCycle`, or `closeOnSelect`. |
| Validation (`validity.error`) | validation | Date Input errors (`incomplete`, `invalid-date`, `value-missing`, `range-underflow`, `range-overflow`, `nonexistent-time`, `ambiguous-time`) and `custom` (consumer error, or "This date is not available."). |

A failed construction leaves no rendering, listeners, registrations, or subscriptions behind.

## 30. Known limitations

- Gregorian calendar only; years 1 to 9999; minute precision.
- Suggested times start at midnight every `step` minutes; they are not offset to `min`.
- Validation messages follow Date Input timing; `validationTiming` is not supported.
- A typed unavailable day is reported as `custom`; a consumer custom error takes precedence over it.
- No Cancel button: picking commits, and Done only closes.
- DST hints are referenced by `aria-describedby` and are not announced live.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Seconds or milliseconds.
- Choosing a timezone inside the picker.
- HTML in the label, help text, or messages.

## 32. TypeScript definitions

```ts
interface DateTimePickerConfig { closeOnSelect: boolean; step: number; hourCycle: HourCycle }
type HourCycle = 'auto' | 'h12' | 'h23';
interface DateTimePickerIcons { calendar: IconRef }
interface DateTimePickerChangeDetail { value: Instant | null; validity: DateInputValidity }
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
```

## 33. Vanilla JS example

```ts
import { instantToString } from '@absoluteui/core';
import { DateTimePicker } from '@absoluteui/components/date-time-picker';
import '@absoluteui/components/date-input/style.css';
import '@absoluteui/components/calendar/style.css';
import '@absoluteui/components/date-time-picker/style.css';

const host = document.querySelector<HTMLElement>('#pickup');
if (host) {
  const picker = DateTimePicker.create(host, { label: 'Pickup', name: 'pickup', timezone: 'Europe/Berlin', step: 15 });
  host.addEventListener('aui-change', () => {
    host.dataset.utc = picker.value ? instantToString(picker.value) : '';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { parseInstant, type Instant } from '@absoluteui/core';
import { AuiDateTimePicker } from '@absoluteui/angular/date-time-picker';

@Component({
  selector: 'app-flight',
  imports: [ReactiveFormsModule, AuiDateTimePicker],
  template: `<aui-date-time-picker label="Departure" timezone="America/New_York" [min]="earliest" [step]="15" [required]="true" [formControl]="departure"></aui-date-time-picker>`,
})
export class FlightComponent {
  readonly earliest = parseInstant('2026-09-27T12:00:00Z');
  readonly departure = new FormControl<Instant | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { type Instant } from '@absoluteui/core';
import { AuiDateTimePicker } from '@absoluteui/react/date-time-picker';

export function Example() {
  const [value, setValue] = useState<Instant | null>(null);
  return <AuiDateTimePicker label="Meeting" timezone="Asia/Kolkata" value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { type Instant } from '@absoluteui/core';
import { AuiDateTimePicker } from '@absoluteui/vue/date-time-picker';
const value = ref<Instant | null>(null);
</script>

<template>
  <AuiDateTimePicker v-model="value" label="Meeting" timezone="Asia/Kolkata" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
