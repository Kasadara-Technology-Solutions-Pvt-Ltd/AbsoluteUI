# Date Picker

> Package: `@absoluteui/components/date-picker` | Styles: `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, and `@absoluteui/components/date-picker/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A date field with a calendar popup (WAI-ARIA APG date picker dialog, non-modal variant). `DatePicker` composes a Date Input (date granularity) with a calendar button inside the field boundary; the button opens a Calendar in a `role="dialog"` popup in the top layer. Typing and picking produce the same `PlainDate` value (SPEC section 8.4). The picker, not its inner Date Input, is the form control that `Form` discovers.

## 2. Anatomy

```text
<div class="aui-date-picker" data-aui-control>                      (consumer host; registered with Form)
  <div class="aui-date-picker__field aui-date-input">                 (inner Date Input host; not registered)
    <div class="aui-date-input__label">
    <div class="aui-date-input__group" role="group">
      <div class="aui-date-input__fields"> segments ... </div>
      <div class="aui-date-picker__trailing">                          (Date Input `trailing` option)
        <button class="aui-date-picker__button" aria-haspopup="dialog" aria-expanded aria-controls aria-label="Choose date">
        <div class="aui-date-picker__popup" role="dialog" aria-modal="false" aria-label="Choose date" popover="manual">
          <div class="aui-calendar"> ... </div>
        </div>
      </div>
    </div>
    <div class="aui-date-input__description"> <div class="aui-date-input__hint"> <div class="aui-date-input__error">
    <input type="hidden" name>
  </div>
</div>
```

The popup sits inside the field group in the DOM (it renders in the top layer), so moving focus between the segments, the button, and the calendar does not mark the field touched, and a picker inside a modal Dialog stays inside the dialog's subtree.

## 3. When to use

- Dates users may either type or look up by day of the week (appointments, travel, deadlines).
- Date fields with bounds or unavailable days.

Business calendar (since 0.9.0): pass `businessCalendar: createBusinessCalendar({ ... })` (from `@absoluteui/components/business-calendar`) to mark non-working days and holidays in the calendar. They are named in each day's accessible name (for example "Friday, 2 October 2026, Founders day, non-working day"), not only colored. With `disableNonWorking: true` they cannot be picked, and a typed non-working day is reported like a day rejected by `isDateDisabled`.

## 4. When not to use

- Well-known dates such as birth dates: use Date Input.
- An always-visible calendar: use Calendar.
- A time of day: use Date Input with minute granularity.
- Date ranges: use Date Range Picker.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; registered with `Form`. |
| `input` | `DateInput` | Inner Date Input (date granularity); not registered with `Form`. |
| `calendar` | `Calendar` | Calendar inside the popup (created once, reused). |
| `button` | `HTMLButtonElement` | Calendar button. |
| `popup` | `HTMLDivElement` | Dialog popup (`popover="manual"`). |
| `value` | `PlainDate \| null` | Valid value, or `null` when empty or invalid. |
| `validity` | `DateInputValidity` | `{ valid, error, message, localTimeStatus }`. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `name`, `label`, `disabled` | | Form control contract. |
| `dirty` | `boolean` | Value differs from the initial value. |
| `touched` | `boolean` | Focus has left the whole field at least once. |
| `options` | `Readonly<DatePickerOptions>` | Current options. |

Options: `label` (required), `value`, `min`, `max`, `name`, `description`, `required`, `disabled`, `readOnly`, `isDateDisabled`, `businessCalendar`, `disableNonWorking` (since 0.9.0), `firstDayOfWeek`, `icons`, and (advanced, since 0.6.0) `formControl: false` for composite controls that register themselves with Form (Schedule Picker, Recurrence Picker). Full table: `metadata/date-picker/api.json`.

| Global option | Type | Default |
|---|---|---|
| `closeOnSelect` | `boolean` | `true` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `timezone` (inherited) | IANA | `'UTC'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

The resolved `locale`, `timezone`, and `direction` are forwarded to both children. `showOutsideDays` and `showWeekNumbers` come from the `calendar` configuration.

## 6. Methods

| Method | Description |
|---|---|
| `DatePicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `open()` | Open the calendar and focus the selected day, else today. No-op when disabled or read-only. |
| `close()` | Close the calendar; if focus was inside the popup, it returns to the calendar button. |
| `setValue(value)` | Programmatic value; no events. |
| `update(options)` | Merge and apply options to the field and the calendar. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error; cleared when the user types or picks. `null` clears it. |
| `getFormValue()` | `YYYY-MM-DD`, or `null` when empty or invalid. |
| `focus()` | Focus the first date segment. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close and remove rendering, listeners, form registration, and subscriptions, including the children's. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | Typing or picking changed the value or validity. Dispatched from the picker host (the inner Date Input and Calendar events are not exposed). |
| `aui-navigate` | `{ month: { year, month } }` | Yes | From the inner Calendar: the user changed the visible month. |
| `aui-open` | `null` | No | The popup opened. |
| `aui-close` | `null` | No | The popup closed. |

Programmatic changes emit no `aui-change`.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-date-picker` | Host; `--disabled` modifier. |
| `aui-date-picker__field` | Inner Date Input host; all `aui-date-input*` classes apply inside. |
| `aui-date-picker__trailing` | Button and popup container inside the Date Input group. |
| `aui-date-picker__button` | Calendar button. |
| `aui-date-picker__popup` | Top-layer dialog popup; all `aui-calendar*` classes apply inside. |

Load the Date Input and Calendar stylesheets as well. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/date-picker/tokens.json` for this stylesheet (verified in CI), plus the Date Input and Calendar tokens. Key tokens: `color-surface`, `color-border`, `shadow-md`, `radius-md` (popup); `color-text-muted`, `color-hover`, `color-focus-ring`, `control-height-md` (button).

## 11. States

empty, partial (incomplete), valid, invalid (Date Input errors, unavailable day, custom), open, disabled, read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | button, or Alt+ArrowDown on a segment | open; focus on the selected day or today; `aui-open` |
| open | pick a day | value written; `aui-change` if changed; closed and focus on the button (`closeOnSelect`) |
| open | Escape | closed; focus on the button; `aui-close` |
| open | pointer outside, or Tab out of the popup | closed |
| any | user types | `aui-change`; the calendar follows the typed date while open |
| any | `reset()` | closed, initial value, pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Calendar button | Open or close the calendar. |
| Alt+ArrowDown | Date segment | Open the calendar (the segment does not change). |
| Arrows, Home/End, PageUp/PageDown, Shift+PageUp/PageDown | Day | Calendar navigation (see Calendar). |
| Enter / Space | Day | Pick the day. |
| Escape | Popup | Close and return focus to the button. Inside a Dialog, only the popup closes. |
| Tab / Shift+Tab | Popup | Month buttons, then the day; leaving the popup closes it. |
| Date Input keys | Segment | As in Date Input. |

## 14. ARIA contract

- The field is the Date Input's labelled `role="group"`.
- Button: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id), `aria-label` "Choose date", or "Change date, {long date}" when a value is set (APG).
- Popup: `role="dialog"`, `aria-modal="false"`, `aria-label` "Choose date".
- Calendar grid: see Calendar.

## 15. Accessibility notes

- The segments stay the primary input; the calendar is an alternative.
- The popup is non-modal: focus is not trapped and the page stays reachable. Escape and outside presses close it through the shared overlay stack, so only the topmost overlay responds.
- A typed day rejected by `isDateDisabled` gets a localized message, so the typed and picked paths agree.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The field fits its content like Date Input. The popup is positioned under the field (`bottom-start`), flips above when there is no room, and scrolls when taller than the available height (`--aui-available-height`).

## 17. RTL behavior

Segment order follows the locale; the button sits at the inline end of the field; the popup aligns to the field's inline start; the calendar mirrors arrows and chevrons.

## 18. Theme behavior

Role tokens only; verified in the light, dark, and high-contrast themes. In forced-colors mode the popup has a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'Europe/London' }, components: { datePicker: { closeOnSelect: false } } });
```

Changes apply to existing instances immediately. Configuration changes that do not change locale, timezone, or direction do not rebuild the field, so partially typed input is kept.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Values are `PlainDate` and never shift. The configured `timezone` (default UTC, never the host zone, SPEC section 8.1) only determines "today" in the calendar, which is focused when the field is empty.

## 22. Icon customization points

`icons.calendar` (default `calendar`).

## 23. Security behavior

All text uses `textContent` and `Intl` formatting; no HTML parsing. The popup uses the Popover API; no inline styles or handlers. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, the inner Date Input's hidden input carries `YYYY-MM-DD`.

## 25. Performance characteristics

One Date Input and one Calendar per picker, created once; opening re-renders only the calendar month. Budget: under 10 ms average per `DatePicker.create` across 100 instances.

## 26. Supported data scale

100 pickers per page.

## 27. Usage examples

```ts
import { plainDate } from '@absoluteui/core';
import { DatePicker } from '@absoluteui/components/date-picker';

const host = document.createElement('div');
document.body.append(host);
DatePicker.create(host, { label: 'Check-in', name: 'checkIn', required: true, min: plainDate(2026, 1, 1) });
```

More examples, type-checked in CI: `metadata/date-picker/examples.json`.

## 28. Edge cases

- Opening an empty field focuses today in the configured zone: at 2026-03-15 10:30 UTC with `timezone: 'Pacific/Kiritimati'`, 16 March.
- Re-picking the current value closes the popup without `aui-change`.
- Picking a date while the segments hold an incomplete entry replaces it and emits `aui-change`.
- Inside a modal Dialog, the first Escape closes the popup and the second closes the dialog.
- Opening from an empty required field does not show "This field is required." until focus leaves the whole field.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DATE_PICKER_OPTIONS` | configuration | Missing label, or `value`/`min`/`max` not a `PlainDate`. |
| `CALENDAR_OPTIONS` | configuration | `min > max`, `firstDayOfWeek` outside 1-7, or a non-function `isDateDisabled`. |
| `CFG_*` | configuration | Invalid `locale`, `timezone`, `direction`, or `closeOnSelect`. |
| Validation (`validity.error`) | validation | Date Input errors (`incomplete`, `invalid-date`, `value-missing`, `range-underflow`, `range-overflow`) and `custom` (consumer error, or "This date is not available."). |

A failed construction leaves no rendering, listeners, registrations, or subscriptions behind.

## 30. Known limitations

- Gregorian calendar only; years 1 to 9999; single dates only (for ranges use Date Range Picker).
- Validation messages follow Date Input timing; `validationTiming` is not supported.
- A typed unavailable day is reported as `custom`; a consumer custom error takes precedence over it.
- No Cancel/OK buttons: picking commits.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Minute granularity.
- HTML in the label, help text, or messages.

## 32. TypeScript definitions

```ts
interface DatePickerConfig { closeOnSelect: boolean }
interface DatePickerIcons { calendar: IconRef }
interface DatePickerChangeDetail { value: PlainDate | null; validity: DateInputValidity }
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
```

## 33. Vanilla JS example

```ts
import { dayOfWeek } from '@absoluteui/core';
import { DatePicker } from '@absoluteui/components/date-picker';
import '@absoluteui/components/date-input/style.css';
import '@absoluteui/components/calendar/style.css';
import '@absoluteui/components/date-picker/style.css';

const host = document.querySelector<HTMLElement>('#delivery');
if (host) {
  const picker = DatePicker.create(host, { label: 'Delivery date', name: 'delivery', isDateDisabled: (d) => dayOfWeek(d) === 7 });
  host.addEventListener('aui-change', () => {
    if (!picker.validity.valid) picker.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainDate, type PlainDate } from '@absoluteui/core';
import { AuiDatePicker } from '@absoluteui/angular/date-picker';

@Component({
  selector: 'app-trip',
  imports: [ReactiveFormsModule, AuiDatePicker],
  template: `<aui-date-picker label="Departure" [min]="today" [required]="true" [formControl]="departure"></aui-date-picker>`,
})
export class TripComponent {
  readonly today = plainDate(2026, 9, 27);
  readonly departure = new FormControl<PlainDate | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { plainDate, type PlainDate } from '@absoluteui/core';
import { AuiDatePicker } from '@absoluteui/react/date-picker';

const min = plainDate(2026, 1, 1);

export function Example() {
  const [value, setValue] = useState<PlainDate | null>(null);
  return <AuiDatePicker label="Check-in" min={plainDate(2026, 1, 1)} required value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { plainDate, type PlainDate } from '@absoluteui/core';
import { AuiDatePicker } from '@absoluteui/vue/date-picker';
const min = plainDate(2026, 1, 1);
const value = ref<PlainDate | null>(null);
</script>

<template>
  <AuiDatePicker v-model="value" label="Check-in" :min="min" required />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
