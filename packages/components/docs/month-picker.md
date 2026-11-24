# Month Picker

> Package: `@absoluteui/components/month-picker` | Styles: `@absoluteui/components/month-picker/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Entry of a calendar month without a day. `MonthPicker` renders locale-ordered month and year segments inside a labelled group, plus a "Choose month" button that opens a non-modal dialog popup with a grid of the twelve months of a year (paged by year). The value is a `PlainYearMonth` (`{ kind: 'PlainYearMonth', year, month }`, created with `plainYearMonth(year, month)`); it has no day and no timezone. Validation is localized and a hidden input submits ISO 8601 `YYYY-MM`. Month, Year, and Quarter Picker share one engine and behave the same apart from the period.

## 2. Anatomy

```text
<div class="aui-field aui-period-picker aui-month-picker" data-aui-control>   (consumer host; registered with Form)
  <label class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-month-picker__group aui-period-picker__group" role="group" aria-labelledby=label aria-describedby>
    <div class="aui-period-picker__fields">                                (LTR-isolated run)
      <input class="aui-period-picker__segment aui-period-picker__segment--month" aria-label="Month" placeholder="mm">
      <span class="aui-period-picker__separator" aria-hidden="true">/</span>
      <input class="aui-period-picker__segment aui-period-picker__segment--year" aria-label="Year" placeholder="yyyy">
    </div>
    <button class="aui-period-picker__button" aria-haspopup="dialog" aria-expanded aria-controls=popup aria-label="Choose month">
  </div>
  <div class="aui-field__description">                                     (hidden when empty)
  <div class="aui-field__error aui-validation-message">                    (hidden when no message is shown)
  <input type="hidden" name>
  <div class="aui-period-picker__popup" role="dialog" aria-modal="false" aria-label="Choose month" popover="manual">
    <div class="aui-period-picker__header">
      <button class="aui-period-picker__nav aui-period-picker__prev" aria-label="Previous year">
      <div class="aui-period-picker__heading" aria-live="polite">2026</div>
      <button class="aui-period-picker__nav aui-period-picker__next" aria-label="Next year">
    </div>
    <div class="aui-period-picker__grid aui-month-picker__grid" role="grid" aria-labelledby=heading>
      <div class="aui-period-picker__row" role="row">                       (4 rows of 3)
        <div class="aui-period-picker__cell" role="gridcell" aria-label="January 2026" tabindex="-1">
          <span class="aui-period-picker__cell-text">Jan</span>
        </div> ...
      </div> ...
    </div>
  </div>
</div>
```

The popup sits inside the host in the DOM (it renders in the top layer), so moving focus between the segments, the button, and the popup does not mark the field touched, and a picker inside a modal Dialog stays inside the dialog's subtree.

## 3. When to use

- A month without a day: billing or reporting periods, card expiry, a month of employment, a monthly budget.
- Users should be able to type a month quickly and also look it up in a grid.
- Month fields with bounds or unavailable months (for example months already closed).

## 4. When not to use

- A specific day: use Date Picker or Date Input.
- A whole year: use Year Picker. A calendar quarter: use Quarter Picker.
- A range of months: use two Month Pickers and a cross-field rule.
- A handful of fixed months that should stay visible: use Radio Group or Select.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. Registered with `Form`. |
| `group` | `HTMLDivElement` | The labelled `role="group"`; control boundary and popup anchor. |
| `button` | `HTMLButtonElement` | Opens the popup. |
| `popup` | `HTMLDivElement` | `role="dialog"` popup (`popover="manual"`). |
| `grid` | `HTMLDivElement` | The `role="grid"` of months. |
| `value` | `PlainYearMonth \| null` | Current value; `null` when empty, incomplete, or failing a built-in check. |
| `validity` | `MonthPickerValidity` | `{ valid, error, message }`, recomputed on every change. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `dirty` | `boolean` | Value differs from the initial value, or the segments hold an entry that does not parse to a value. |
| `touched` | `boolean` | Focus has left the whole control at least once. |
| `options` | `Readonly<MonthPickerOptions>` | Current options. |
| `focusedValue` | `PlainYearMonth` | The month holding the roving tab stop in the grid. |
| `current` | `PlainYearMonth` | The month containing today in the configured timezone (or the `today` option). |

Options: `label` (required), `hideLabel`, `value`, `min`, `max`, `name`, `description`, `required`, `disabled`, `readOnly`, `validate`, `isMonthDisabled`, `today` (advanced), and `icons`. Full table: `metadata/month-picker/api.json`.

| Global option | Type | Default | Mutability |
|---|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | dynamic |
| `closeOnSelect` | `boolean` | `true` | dynamic |
| `locale` (inherited) | BCP 47 | `'en-US'` | dynamic |
| `timezone` (inherited) | IANA | `'UTC'` | dynamic |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` | dynamic |

## 6. Methods

| Method | Description |
|---|---|
| `MonthPicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. |
| `update(options)` | Merge, validate, and apply options. An open popup closes when the picker becomes disabled or read-only, and re-renders otherwise. |
| `open()` | Open the popup and focus the selected month, else the current month, clamped to `min`/`max`. No-op when open, disabled, or read-only. |
| `close()` | Close the popup; if focus was inside it, it returns to the button. |
| `reportValidity()` | Show messages now (every timing) and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user edits. `null` or `''` clears it. |
| `getFormValue()` | `YYYY-MM`, or `null` when the value is `null`. |
| `focus()` | Focus the first segment. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close, remove rendering, host classes, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | The user changed the value or its validity error (typing, stepping, a separator, or picking a month). |
| `aui-open` | `null` | No | The popup opened. |
| `aui-close` | `null` | No | The popup closed. |

Programmatic changes (`setValue`, `update`, `reset`) emit no `aui-change`. Re-picking the current value emits nothing.

## 8. Slots/content areas

None. Label, help text, and messages are text options; the grid is generated from the page, `min`, `max`, and `isMonthDisabled`.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-period-picker`, `aui-month-picker` | Host. |
| `aui-period-picker--invalid`, `--disabled`, `--readonly` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-month-picker__group`, `aui-period-picker__group` | Labelled group; shows the focus indicator. |
| `aui-period-picker__fields` | LTR-isolated run of segments. |
| `aui-period-picker__segment`, `__segment--month`, `__segment--year` | Segment inputs. |
| `aui-period-picker__separator` | Locale separator text. |
| `aui-period-picker__button` | Choose month button. |
| `aui-period-picker__popup`, `__header`, `__heading`, `__nav`, `__prev`, `__next` | Popup and its header. |
| `aui-period-picker__grid`, `aui-month-picker__grid`, `aui-period-picker__row` | Grid and rows. |
| `aui-period-picker__cell`, `--selected`, `--current`, `--disabled`, `--empty`, `__cell-text` | Month cells. |

Shared `aui-period-picker__*` classes are the same in Year and Quarter Picker; the `aui-month-picker*` classes scope month-only overrides. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/month-picker/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-selected`, `color-selected-text`, `color-primary`, `color-on-primary`, `color-error-fg`, `color-hover`, `color-text-disabled`, `control-height-md`, `shadow-md`, `radius-md`.

## 11. States

empty, segment focused, partial (incomplete), valid, invalid (message shown), open, cell focused, cell selected, current month, cell disabled, disabled, read-only, required.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty | user types part of a month | dirty, `incomplete`; message shown only with `validationTiming: 'input'` |
| incomplete | last segment filled | valid, or `invalid` / `range-underflow` / `range-overflow` / `unavailable` / `custom`; `aui-change` |
| closed | button, Alt+ArrowDown, or `open()` | open; focus on the selected (else current) month; `aui-open` |
| open | Enter, Space, or click on an enabled month | value set, `aui-change` if changed; with `closeOnSelect` closed, focus on the button, `aui-close` |
| open | Escape, the button, or `close()` | closed; value kept; focus inside the popup returns to the button; `aui-close` |
| open | Tab out of the popup, or a pointer press outside the popup and button | closed; focus moves on |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| any | `reset()` | initial value; pristine, untouched, closed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits | Month segment | Up to two digits; a first digit 2-9 is padded (`4` becomes `04`) and advances; a first `1` waits for a second digit. Non-digits are removed. |
| Digits | Year segment | Up to four digits; advances when full. Fewer than four digits is `incomplete`. |
| `/` `-` `.` `,` `:` Space | Segment (not read-only) | Pad a single-digit month and advance. |
| ArrowUp / ArrowDown | Segment (not read-only) | Month wraps 1-12; year stops at 1 and 9999. Empty month starts at 01 (Up) or 12 (Down); empty year starts at the current year. |
| ArrowLeft / ArrowRight | Caret at the segment edge, or text selected | Previous or next segment in visual order (not mirrored in RTL). |
| Backspace | Empty segment | Previous segment. |
| Alt+ArrowDown | Segment | Open the popup (the segment does not change). |
| Tab / Shift+Tab | Group | Move through the segments, then the button. |
| Enter / Space | Button | Open (or close) the popup. |
| ArrowRight / ArrowLeft | Month cell | Next / previous month (mirrored in RTL), across years. |
| ArrowDown / ArrowUp | Month cell | Plus / minus 3 months (next / previous row), across years. |
| Home / End | Month cell | First / last month of the row. |
| PageDown / PageUp | Month cell | Same month next / previous year. |
| Shift+PageDown / Shift+PageUp | Month cell | Same month 10 years later / earlier. |
| Enter / Space | Month cell | Pick unless disabled; closes and focuses the button with `closeOnSelect`, else focus stays on the cell. |
| Enter / Space | Previous / next year button | Change the page; no-op while `aria-disabled`. |
| Escape | Popup open | Close without changing the value; focus returns to the button. A surrounding Dialog stays open. |
| Tab / Shift+Tab | Popup | Previous / next year buttons and the focused month; leaving the popup (other than to the button) closes it. |

All grid movement is clamped to `min`/`max` and to years 1-9999. Disabled months are focusable but not selectable.

## 14. ARIA contract

- The group is `role="group"` with `aria-labelledby` pointing at the label, and `aria-describedby` listing the help text and the visible error.
- Each segment is a native text input with a localized `aria-label` ("Month", "Year"), `inputmode="numeric"`, the native `required` state, and `aria-invalid="true"` only while an error is shown.
- Button: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id), and `aria-label` "Choose month", or "Change month, {value}" (for example "Change month, March 2026") when a value is set.
- Popup: `role="dialog"`, `aria-modal="false"`, `aria-label` "Choose month".
- Header: the heading (year) is `aria-live="polite"`; the page buttons are labelled "Previous year" / "Next year" and get `aria-disabled="true"` at the bounds (not `disabled`, so focus stays on them).
- Grid: `role="grid"` labelled by the heading, `role="row"` rows, `role="gridcell"` cells with a roving `tabindex`, `aria-label` (long month and year), `aria-selected="true"` on the selected month, `aria-current="date"` on the current month, and `aria-disabled="true"` on unavailable months.

## 15. Accessibility notes

- The segments stay the primary input; the grid is an alternative. A typed month rejected by `isMonthDisabled` gets a localized message, so the typed and picked paths agree.
- The popup is non-modal: focus is not trapped and the page stays reachable. Escape and outside presses close it through the shared overlay stack, so only the topmost overlay responds.
- Focus is moved before the popup hides, so it never falls to the document body.
- Moving between segments, the button, and the popup does not count as leaving the field; errors appear after the whole control loses focus (SPEC section 16.1).
- The label is a `<label>` associated through `aria-labelledby`; clicking it focuses the first segment. The required asterisk is `aria-hidden`.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The group hugs its segments and button, up to 100% of the container; segments wrap inside the group in very narrow containers. The popup is positioned under the group (`bottom-start`), is at most the viewport width minus a gutter, caps its height to the available space (`--aui-available-height`), and scrolls when taller. Cells are at least `4rem` wide and one control height tall.

## 17. RTL behavior

Segment order and separators come from the locale's `Intl` year/month pattern. Segments render as an LTR-isolated run in every direction, so ArrowLeft and ArrowRight in segments follow that visual order and are not mirrored. The button sits at the inline end. The popup and grid take `direction`: grid ArrowLeft/ArrowRight are mirrored, the chevrons are flipped, and the popup aligns to the inline start of the group.

## 18. Theme behavior

Role tokens only. The focused segment uses `color-selected` / `color-selected-text`; the selected month uses `color-primary` / `color-on-primary`; the current month is bold with an inset `color-border-strong` border; unavailable months are muted and struck through. In forced-colors mode the focused segment and the selected month use `Highlight` / `HighlightText`, the current month gets a `CanvasText` outline, disabled cells and buttons use `GrayText`, and the popup has a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'Europe/Berlin' }, components: { monthPicker: { closeOnSelect: false, validationTiming: 'submit' } } });
```

Changes apply to existing instances immediately; a locale change rebuilds the segments and keeps the entry.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic (`update()`); there are no init-only options.

## 21. Timezone behavior

Values are `PlainYearMonth` and never shift. The configured `timezone` (default UTC, never the host zone, SPEC section 8.1) only decides the current month: the cell marked `aria-current="date"` and the month focused when the popup opens on an empty field. For example, at 2026-09-30 19:00 UTC the current month is September 2026 in UTC but October 2026 with `timezone: 'Asia/Kolkata'`. The advanced `today` option pins today to a fixed `PlainDate` (tests, server rendering, demos).

## 22. Icon customization points

`icons.calendar` (default `calendar`) for the button, `icons.previous` / `icons.next` (defaults `chevron-left` / `chevron-right`) for the page buttons, and `icons.error` (default `alert-circle`) for the validation message.

## 23. Security behavior

All text uses `textContent` and `Intl` formatting; no HTML parsing. Validation messages never include the entered value; range messages include only the formatted bounds (SPEC section 14.4). The popup uses the Popover API; no inline handlers. CSP-safe: positioning writes styles through the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries `YYYY-MM`; it is empty while the entry is empty or fails a built-in check, and disabled (not submitted) while the picker is disabled. A read-only picker is submitted.

## 25. Performance characteristics

The popup and its 12 cells are created once per picker; opening and paging only re-render cell text and state. Segment keyboard and input handling share one delegated listener each; the grid has one keydown and one click listener. One configuration subscription per instance. Budget: under 5 ms average per `MonthPicker.create` across 100 instances in headless Chromium.

## 26. Supported data scale

100 pickers per page (performance test); years 1 to 9999.

## 27. Usage examples

```ts
import { plainYearMonth } from '@absoluteui/core';
import { MonthPicker } from '@absoluteui/components/month-picker';

const host = document.createElement('div');
document.body.append(host);
MonthPicker.create(host, { label: 'Billing month', name: 'billingMonth', required: true, min: plainYearMonth(2024, 1), max: plainYearMonth(2026, 12) });
```

More examples, type-checked in CI: `metadata/month-picker/examples.json`.

## 28. Edge cases

- A single `1` in the month segment does not advance but already counts as January; `13` or `00` reports `invalid` ("Enter a valid month.").
- A month with only one segment filled reports `incomplete` ("Enter a complete month."); a year with fewer than four digits reports `incomplete` ("Enter the year with 4 digits.").
- Built-in errors (`incomplete`, `invalid`, `range-*`, `unavailable`) set `value` to `null`; a `custom` error keeps the value (and the hidden input value).
- Opening an empty field focuses the current month in the configured zone, clamped to `min`/`max`.
- Clicking a month outside `min`/`max` or rejected by `isMonthDisabled` does nothing; Enter on it keeps the popup open.
- `update({ value })` changes the value but not the value restored by `reset()` (the `value` passed to `create()`).
- Inside a modal Dialog, the first Escape closes the popup and the second closes the dialog.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `MONTH_PICKER_OPTIONS` | configuration | Missing or blank label; `value`/`min`/`max` not a `PlainYearMonth` with year 1-9999; `min` after `max`; non-function `validate` or `isMonthDisabled`; `today` not a `PlainDate`. Details name the property (for example `monthPicker.value`). |
| `CFG_INVALID_VALUE` | configuration | Invalid `validationTiming`, `closeOnSelect`, `locale`, `timezone`, or `direction` (reported by the configuration engine). |
| Validation (`validity.error`) | validation | `incomplete`, `invalid`, `value-missing`, `range-underflow`, `range-overflow`, `unavailable`, `custom`. |

Built-in checks run in that order: empty (`value-missing` when required), partial (`incomplete`), four-digit year (`incomplete`), segment range (`invalid`), `min`, `max`, `isMonthDisabled` (`unavailable`), then `validate`, then an external custom error. English messages: "This field is required.", "Enter a complete month.", "Enter the year with 4 digits.", "Enter a valid month.", "Enter {min} or later.", "Enter {max} or earlier.", "This month is not available.". A failed construction leaves no rendering, listeners, registrations, or subscriptions behind.

## 30. Known limitations

- Gregorian calendar only; years 1 to 9999.
- Only ASCII digits are accepted in segments.
- Single months only; ranges need two pickers.
- No Cancel/OK buttons: picking commits.
- Segment arrow navigation is not mirrored in RTL.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in the label, help text, cells, or messages.
- Non-Gregorian calendars.
- Custom cell content or grid layouts.

## 32. TypeScript definitions

```ts
interface PlainYearMonth { readonly kind: 'PlainYearMonth'; readonly year: number; readonly month: number }
interface MonthPickerConfig { validationTiming: ValidationTiming; closeOnSelect: boolean }
type ValidationTiming = 'blur' | 'input' | 'submit';
type MonthPickerError = 'incomplete' | 'invalid' | 'value-missing' | 'range-underflow' | 'range-overflow' | 'unavailable' | 'custom';
interface MonthPickerValidity { readonly valid: boolean; readonly error: MonthPickerError | null; readonly message: string }
interface MonthPickerChangeDetail { value: PlainYearMonth | null; validity: MonthPickerValidity }
interface MonthPickerIcons { calendar: IconRef; previous: IconRef; next: IconRef; error: IconRef }
```

## 33. Vanilla JS example

```ts
import { plainYearMonthToString } from '@absoluteui/core';
import { MonthPicker, type MonthPickerChangeDetail } from '@absoluteui/components/month-picker';
import '@absoluteui/components/month-picker/style.css';

const host = document.querySelector<HTMLElement>('#expiry');
if (host) {
  MonthPicker.create(host, { label: 'Card expiry', name: 'expiry', required: true });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<MonthPickerChangeDetail>).detail;
    host.dataset.month = value ? plainYearMonthToString(value) : '';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainYearMonth, type PlainYearMonth } from '@absoluteui/core';
import { AuiMonthPicker } from '@absoluteui/angular/month-picker';

@Component({
  selector: 'app-billing',
  imports: [ReactiveFormsModule, AuiMonthPicker],
  template: `<aui-month-picker label="Billing month" [min]="min" [required]="true" [formControl]="month"></aui-month-picker>`,
})
export class BillingComponent {
  readonly min = plainYearMonth(2024, 1);
  readonly month = new FormControl<PlainYearMonth | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { type PlainYearMonth } from '@absoluteui/core';
import { AuiMonthPicker } from '@absoluteui/react/month-picker';

export function Example() {
  const [value, setValue] = useState<PlainYearMonth | null>(null);
  return <AuiMonthPicker label="Billing month" value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { type PlainYearMonth } from '@absoluteui/core';
import { AuiMonthPicker } from '@absoluteui/vue/month-picker';
const value = ref<PlainYearMonth | null>(null);
</script>

<template>
  <AuiMonthPicker v-model="value" label="Billing month" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
