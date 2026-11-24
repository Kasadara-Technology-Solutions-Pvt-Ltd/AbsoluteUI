# Date Range Picker

> Package: `@absoluteui/components/date-range-picker` | Styles: `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, and `@absoluteui/components/date-range-picker/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

An inclusive date range field with a calendar popup (WAI-ARIA APG date picker dialog, non-modal variant). `DateRangePicker` composes two Date Inputs (start and end, date granularity) inside one labelled `role="group"`, plus a calendar button inside the end field; the button opens a range-selecting Calendar (one or two months) in a `role="dialog"` popup in the top layer. The value is a `Range<PlainDate>` (SPEC section 8.4), set only when both dates are valid and every range constraint passes. Typing and picking produce the same value. The picker, not its inner Date Inputs, is the form control that `Form` discovers.

## 2. Anatomy

```text
<div class="aui-date-range-picker" data-aui-control>                 (consumer host; registered with Form)
  <div class="aui-date-range-picker__group" role="group" aria-labelledby=label aria-describedby=description>
    <div class="aui-date-range-picker__label" id>Stay</div>
    <div class="aui-date-range-picker__fields">
      <div class="aui-date-range-picker__start aui-date-input">         (start Date Input; not registered)
        <div class="aui-date-input__label">Start date</div>             (visually hidden)
        <div class="aui-date-input__group" role="group"> segments ... </div>
        <div class="aui-date-input__description"> <div class="aui-date-input__hint"> <div class="aui-date-input__error">
        <input type="hidden" name=startName>
      </div>
      <span class="aui-date-range-picker__separator" aria-hidden="true">-</span>
      <div class="aui-date-range-picker__end aui-date-input">           (end Date Input; not registered)
        <div class="aui-date-input__label">End date</div>               (visually hidden)
        <div class="aui-date-input__group" role="group">
          <div class="aui-date-input__fields"> segments ... </div>
          <div class="aui-date-range-picker__trailing">                  (Date Input `trailing` option)
            <button class="aui-date-range-picker__button" aria-haspopup="dialog" aria-expanded aria-controls aria-label="Choose dates">
            <div class="aui-date-range-picker__popup" role="dialog" aria-modal="false" aria-label="Choose dates" popover="manual">
              <div class="aui-calendar"> ... </div>                        (selectionMode 'range')
            </div>
          </div>
        </div>
        <div class="aui-date-input__description"> <div class="aui-date-input__hint"> <div class="aui-date-input__error">
        <input type="hidden" name=endName>
      </div>
    </div>
    <div class="aui-date-range-picker__description" id hidden>
    <input type="hidden" name>                                         (ISO 8601 interval)
  </div>
</div>
```

The group label names both fields; each field keeps its own accessible name ("Start date", "End date", or `startLabel`/`endLabel`), visually hidden. The button and popup sit inside the end field's group in the DOM (the popup renders in the top layer), so moving focus between the end segments, the button, and the calendar does not mark the end field touched, and a picker inside a modal Dialog stays inside the dialog's subtree.

## 3. When to use

- Inclusive date ranges: stays, trips, leave requests, report periods.
- Ranges with bounds, unavailable days, or a minimum or maximum length in days.

Business calendar (since 0.9.0): pass `businessCalendar: createBusinessCalendar({ ... })` (from `@absoluteui/components/business-calendar`) to mark non-working days and holidays in the calendar. They are named in each day's accessible name (for example "Friday, 2 October 2026, Founders day, non-working day"), not only colored. With `disableNonWorking: true` they cannot be picked, and a typed non-working day is reported like a day rejected by `isDateDisabled`.

## 4. When not to use

- A single date: use Date Picker.
- Two unrelated dates that do not form a range: use two Date Pickers.
- Ranges of exact moments with a time of day: not supported.
- An always-visible range calendar: use Calendar with `selectionMode: 'range'`.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; registered with `Form`. |
| `group` | `HTMLDivElement` | The labelled `role="group"` around both fields. |
| `startInput`, `endInput` | `DateInput` | Inner Date Inputs (date granularity); not registered with `Form`. |
| `calendar` | `Calendar` | Range Calendar inside the popup (created once, reused). |
| `button` | `HTMLButtonElement` | Calendar button inside the end field. |
| `popup` | `HTMLDivElement` | Dialog popup (`popover="manual"`). |
| `value` | `Range<PlainDate> \| null` | Inclusive range, or `null` when empty, incomplete, or failing a field or range check. A custom error (`validate`, `setCustomError`) keeps the range, as in Date Input. |
| `validity` | `DateRangePickerValidity` | `{ valid, error, message, field }`; `field` is the field that shows the message. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `name`, `label`, `disabled` | | Form control contract. |
| `dirty` | `boolean` | Either date differs from its initial value. |
| `touched` | `boolean` | Focus has left either date field at least once. |
| `options` | `Readonly<DateRangePickerOptions>` | Current options. |

Options: `label` (required), `startLabel`, `endLabel`, `value`, `min`, `max`, `minDays`, `maxDays`, `name`, `startName`, `endName`, `description`, `required`, `disabled`, `readOnly`, `isDateDisabled`, `businessCalendar`, `disableNonWorking` (since 0.9.0), `validate`, `firstDayOfWeek`, and `icons`. Full table: `metadata/date-range-picker/api.json`.

| Global option | Type | Default |
|---|---|---|
| `closeOnSelect` | `boolean` | `true` |
| `months` | `'auto' \| 1 \| 2` | `'auto'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `timezone` (inherited) | IANA | `'UTC'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

`months: 'auto'` shows two months when the viewport is at least 40rem wide at the moment the popup opens, else one. The resolved `locale`, `timezone`, and `direction` are forwarded to all children. `showWeekNumbers` comes from the `calendar` configuration; outside days are never shown with two months.

## 6. Methods

| Method | Description |
|---|---|
| `DateRangePicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `open()` | Open the calendar and focus the range start, else the typed start date, else today. No-op when disabled or read-only. |
| `close()` | Close the calendar; an unfinished pick is discarded. If focus was inside the popup, it returns to the calendar button. |
| `setValue(value)` | Programmatic range; writes both fields; no events. Clears an external custom error. Throws when `start > end`. |
| `update(options)` | Merge and apply options to both fields and the calendar; closes the popup when disabled or read-only. |
| `reportValidity()` | Show both fields' messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, shown on the end field; cleared when the user types or picks. `null` or `''` clears it. |
| `getFormValue()` | `YYYY-MM-DD/YYYY-MM-DD` of `value`, or `null` when `value` is `null`. |
| `focus()` | Focus the first segment of the start date. |
| `reset()` | Close, restore the initial range, and clear the custom error, dirty, touched, and submitted state. |
| `destroy()` | Close and remove rendering, listeners, form registration, and subscriptions, including the children's. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | Typing or a completed calendar pick changed the value or validity. Dispatched from the picker host (the inner Date Input and Calendar change events are not exposed). |
| `aui-navigate` | `{ month: { year, month } }` | Yes | From the inner Calendar: the user changed the visible months; `month` is the first visible month. |
| `aui-open` | `null` | No | The popup opened. |
| `aui-close` | `null` | No | The popup closed. |

The first calendar pick emits no `aui-change`; only the completed range does. Programmatic changes emit no `aui-change`.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-date-range-picker` | Host; `--disabled` modifier. |
| `aui-date-range-picker__group` | Labelled `role="group"`. |
| `aui-date-range-picker__label` | Visible group label with the required indicator. |
| `aui-date-range-picker__fields` | Start field, separator, end field; wraps when narrow. |
| `aui-date-range-picker__start`, `__end` | Inner Date Input hosts; all `aui-date-input*` classes apply inside (their labels are visually hidden). |
| `aui-date-range-picker__separator` | Decorative en dash (`aria-hidden`). |
| `aui-date-range-picker__description` | Help text. |
| `aui-date-range-picker__trailing` | Button and popup container inside the end Date Input group. |
| `aui-date-range-picker__button` | Calendar button. |
| `aui-date-range-picker__popup` | Top-layer dialog popup; all `aui-calendar*` classes apply inside. |

Load the Date Input and Calendar stylesheets as well. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/date-range-picker/tokens.json` for this stylesheet (verified in CI), plus the Date Input and Calendar tokens. Key tokens: `color-surface`, `color-border`, `shadow-md`, `radius-md` (popup); `color-text-muted`, `color-hover`, `color-focus-ring`, `control-height-md` (button, separator); `font-size-sm`, `font-weight-medium` (label).

## 11. States

empty, partial (one date, or an incomplete date), valid, invalid (Date Input errors, incomplete range, reversed, too short, too long, unavailable day, custom), open, open with a pending first day, disabled, read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | button, or Alt+ArrowDown on a segment of either field | open; focus on the range start, the typed start date, or today; `aui-open` |
| open | pick a day (no pending day) | first day pending and announced; no `aui-change` |
| open, first day pending | pick a day | range completed (either order); both fields written; `aui-change` if changed; closed and focus on the button (`closeOnSelect`) |
| open, first day pending | Escape, pointer outside, or Tab out | closed; the pending day is discarded and the previous range stays |
| open | Escape | closed; focus on the button; `aui-close` |
| any | user types in either field | `aui-change` when the value or validity changes |
| any | `reset()` | closed, initial range, pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Calendar button | Open or close the calendar. |
| Alt+ArrowDown | Date segment of either field | Open the calendar (the segment does not change). |
| Arrows, Home/End, PageUp/PageDown, Shift+PageUp/PageDown | Day | Calendar navigation across all visible months (see Calendar). |
| Enter / Space | Day, no pending day | Pick the first day. |
| Enter / Space | Day, first day pending | Pick the last day and commit the range. |
| Escape | Popup | Close (discarding a pending day) and return focus to the button. Inside a Dialog, only the popup closes. |
| Tab / Shift+Tab | Popup | Month buttons, then the day; leaving the popup closes it. |
| Date Input keys | Segment | As in Date Input; Tab moves from the start field to the end field. |

## 14. ARIA contract

- Range: `role="group"` with `aria-labelledby` (visible label) and `aria-describedby` (help text, when set).
- Fields: each Date Input is its own labelled `role="group"`; the label ("Start date"/"End date", or `startLabel`/`endLabel`) is visually hidden.
- Button: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id), `aria-label` "Choose dates", or "Change dates, {start} to {end}" (long dates) when a range is set.
- Popup: `role="dialog"`, `aria-modal="false"`, `aria-label` "Choose dates".
- Calendar grids: `aria-multiselectable="true"`; see Calendar for the range day names and the pending-day announcement.
- The field that shows an error sets `aria-invalid` on its segments and references the message through `aria-describedby` (Date Input).

## 15. Accessibility notes

- The segments stay the primary input; the calendar is an alternative.
- The popup is non-modal: focus is not trapped and the page stays reachable. Escape and outside presses close it through the shared overlay stack, so only the topmost overlay responds.
- Range errors are shown on the field they concern, with that Date Input's message timing.
- A typed start or end day rejected by `isDateDisabled` gets a localized message, so the typed and picked paths agree.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The start and end fields sit on one line and wrap below each other when space runs out. The popup is positioned under the fields (`bottom-start`), flips above when there is no room, and scrolls when taller than the available height (`--aui-available-height`). With `months: 'auto'`, the popup shows two months when the viewport is at least 40rem wide when it opens, else one; the Calendar's months wrap when the popup is narrower than two months.

## 17. RTL behavior

Segment order follows the locale; the button sits at the inline end of the end field; the popup aligns to the fields' inline start; the calendar mirrors arrows and chevrons.

## 18. Theme behavior

Role tokens only; verified in the light, dark, and high-contrast themes. In forced-colors mode the popup has a `CanvasText` border and a disabled button uses `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'Europe/Berlin' }, components: { dateRangePicker: { months: 2, closeOnSelect: false } } });
```

Changes apply to existing instances immediately (`months` on the next open). Configuration changes that do not change locale, timezone, or direction do not rebuild the fields, so partially typed input is kept.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Values are `PlainDate` ranges and never shift. The configured `timezone` (default UTC, never the host zone, SPEC section 8.1) only determines "today" in the calendar, which is focused when the fields are empty.

## 22. Icon customization points

`icons.calendar` (default `calendar`).

## 23. Security behavior

All text uses `textContent` and `Intl` formatting; no HTML parsing. The popup uses the Popover API; no inline styles or handlers. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries the ISO 8601 interval `YYYY-MM-DD/YYYY-MM-DD` (empty when there is no valid range); `Form` gets the same string. `startName` and `endName` give each inner Date Input's hidden input a name (`YYYY-MM-DD`) for native form posts. A disabled picker is not submitted.

## 25. Performance characteristics

Two Date Inputs and one Calendar per picker, created once; opening sets the month count and range and re-renders only the calendar. Budget: under 15 ms average per `DateRangePicker.create` across 100 instances.

## 26. Supported data scale

100 pickers per page.

## 27. Usage examples

```ts
import { plainDate } from '@absoluteui/core';
import { DateRangePicker } from '@absoluteui/components/date-range-picker';

const host = document.createElement('div');
document.body.append(host);
DateRangePicker.create(host, { label: 'Stay', name: 'stay', required: true, min: plainDate(2026, 1, 1), minDays: 2 });
```

More examples, type-checked in CI: `metadata/date-range-picker/examples.json`.

## 28. Edge cases

- Picking the last day before the first one orders the range; picking the same day twice gives a one-day range.
- With a first day pending, days that would make the range shorter than `minDays` or longer than `maxDays` are disabled.
- `minDays` and `maxDays` count both ends: 5 to 7 March is 3 days. `maxDays: 1` gives the message "Choose a single day."
- A range may include disabled days: `isDateDisabled` is checked on the start and end only.
- Closing with a first day pending keeps the previous range; the next open starts fresh.
- Typing a start date only gives `incomplete-range` ("Enter an end date.") on the end field, shown after the end field is touched or on `reportValidity()`.
- `validate` also runs when both fields are empty (value `null`).
- Opening from an empty required field does not show "This field is required." until focus leaves the field.
- Inside a modal Dialog, the first Escape closes the popup and the second closes the dialog.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DATE_RANGE_PICKER_OPTIONS` | configuration | Missing or empty label, empty `startLabel`/`endLabel`, `value` not a range of `PlainDate` or `start > end` (also from `setValue`), `min`/`max` not a `PlainDate`, `min > max`, `minDays`/`maxDays` not an integer 1-100000, `minDays > maxDays`, or a non-function `isDateDisabled`/`validate`. |
| `CALENDAR_OPTIONS` | configuration | `firstDayOfWeek` outside 1-7. |
| `CFG_*` | configuration | Invalid `locale`, `timezone`, `direction`, `closeOnSelect`, or `months`. |
| Validation (`validity.error`) | validation | See below. |

| `validity.error` | Field | Message |
|---|---|---|
| Date Input errors (`incomplete`, `invalid-date`, `value-missing`, `range-underflow`, `range-overflow`) | the field concerned (start first) | Date Input messages |
| `incomplete-range` | the empty field | "Enter a start date." / "Enter an end date." |
| `range-reversed` | end | "Enter an end date on or after the start date." |
| `date-unavailable` | start or end | "This date is not available." |
| `range-too-short` | end | "Choose a range of at least {count} days." |
| `range-too-long` | end | "Choose a range of {count} days or fewer." (`maxDays: 1`: "Choose a single day.") |
| `custom` | end | `validate` result, then the external `setCustomError` message |

Precedence follows the table order. Date Input errors other than `incomplete` and `value-missing` show immediately; incomplete, required, range, and custom messages show after the field is touched or on `reportValidity()`. A failed construction leaves no rendering, listeners, registrations, or subscriptions behind.

## 30. Known limitations

- Gregorian calendar only; years 1 to 9999.
- A range may include disabled days: only the start and end days are checked against `isDateDisabled`.
- `minDays` and `maxDays` count both the start and the end day.
- Validation messages follow Date Input timing; `validationTiming` is not supported.
- `validity` reports one error at a time.
- Closing the popup with only the first day picked discards that pick.
- No Cancel/OK buttons: picking the last day commits.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Time of day in either field.
- Open-ended ranges (one date only) as a valid value.
- More than two months in the popup.
- HTML in the label, help text, or messages.

## 32. TypeScript definitions

```ts
type DateRangePickerMonths = 'auto' | 1 | 2;
interface DateRangePickerConfig { closeOnSelect: boolean; months: DateRangePickerMonths }
interface DateRangePickerIcons { calendar: IconRef }
type DateRangePickerError = DateInputError | 'incomplete-range' | 'range-reversed' | 'range-too-short' | 'range-too-long' | 'date-unavailable';
interface DateRangePickerValidity { readonly valid: boolean; readonly error: DateRangePickerError | null; readonly message: string; readonly field: 'start' | 'end' | null }
interface DateRangePickerChangeDetail { value: Range<PlainDate> | null; validity: DateRangePickerValidity }
type Weekday = 1 | 2 | 3 | 4 | 5 | 6 | 7;
```

## 33. Vanilla JS example

```ts
import { dayOfWeek } from '@absoluteui/core';
import { DateRangePicker } from '@absoluteui/components/date-range-picker';
import '@absoluteui/components/date-input/style.css';
import '@absoluteui/components/calendar/style.css';
import '@absoluteui/components/date-range-picker/style.css';

const host = document.querySelector<HTMLElement>('#leave');
if (host) {
  const picker = DateRangePicker.create(host, { label: 'Leave', name: 'leave', maxDays: 10, isDateDisabled: (d) => dayOfWeek(d) >= 6 });
  host.addEventListener('aui-change', () => {
    if (!picker.validity.valid) picker.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainDate, type PlainDate, type Range } from '@absoluteui/core';
import { AuiDateRangePicker } from '@absoluteui/angular/date-range-picker';

@Component({
  selector: 'app-stay',
  imports: [ReactiveFormsModule, AuiDateRangePicker],
  template: `<aui-date-range-picker label="Stay" [min]="today" [maxDays]="14" [required]="true" [formControl]="stay"></aui-date-range-picker>`,
})
export class StayComponent {
  readonly today = plainDate(2026, 9, 27);
  readonly stay = new FormControl<Range<PlainDate> | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
