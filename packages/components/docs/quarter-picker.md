# Quarter Picker

> Package: `@absoluteui/components/quarter-picker` | Styles: `@absoluteui/components/quarter-picker/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Entry of a calendar quarter. `QuarterPicker` renders quarter and year segments, ordered by a localizable `pattern` message (English `Q{quarter} {year}`), inside a labelled group, plus a "Choose quarter" button that opens a non-modal dialog popup with one row of the four quarters of a year (paged by year); each cell shows its month range. The value is a `PlainYearQuarter` (`{ kind: 'PlainYearQuarter', year, quarter }`, created with `plainYearQuarter(year, quarter)`); Q1 is January to March. A hidden input submits `YYYY-Qn`. It shares its engine with Month and Year Picker; this page states every behavior in full.

## 2. Anatomy

```text
<div class="aui-field aui-period-picker aui-quarter-picker" data-aui-control>  (consumer host; registered with Form)
  <label class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-quarter-picker__group aui-period-picker__group" role="group" aria-labelledby=label aria-describedby>
    <div class="aui-period-picker__fields">                                (LTR-isolated run)
      <span class="aui-period-picker__separator" aria-hidden="true">Q</span>
      <input class="aui-period-picker__segment aui-period-picker__segment--quarter" aria-label="Quarter" placeholder="q">
      <span class="aui-period-picker__separator" aria-hidden="true"> </span>
      <input class="aui-period-picker__segment aui-period-picker__segment--year" aria-label="Year" placeholder="yyyy">
    </div>
    <button class="aui-period-picker__button" aria-haspopup="dialog" aria-expanded aria-controls=popup aria-label="Choose quarter">
  </div>
  <div class="aui-field__description">                                     (hidden when empty)
  <div class="aui-field__error aui-validation-message">                    (hidden when no message is shown)
  <input type="hidden" name>
  <div class="aui-period-picker__popup" role="dialog" aria-modal="false" aria-label="Choose quarter" popover="manual">
    <div class="aui-period-picker__header">
      <button class="aui-period-picker__nav aui-period-picker__prev" aria-label="Previous year">
      <div class="aui-period-picker__heading" aria-live="polite">2026</div>
      <button class="aui-period-picker__nav aui-period-picker__next" aria-label="Next year">
    </div>
    <div class="aui-period-picker__grid aui-quarter-picker__grid" role="grid" aria-labelledby=heading>
      <div class="aui-period-picker__row" role="row">                       (1 row of 4)
        <div class="aui-period-picker__cell" role="gridcell" aria-label="Q2 2026, April to June" tabindex="-1">
          <span class="aui-period-picker__cell-text">Q2</span>
          <span class="aui-period-picker__cell-hint">Apr-Jun</span>
        </div> ...
      </div>
    </div>
  </div>
</div>
```

The popup sits inside the host in the DOM (it renders in the top layer), so moving focus between the segments, the button, and the popup does not mark the field touched.

## 3. When to use

- A calendar quarter: quarterly reports, targets, filings, or reviews.
- Users should be able to type a quarter quickly and also see which months each quarter covers.
- Quarter fields with bounds or unavailable quarters (for example quarters not yet closed).

## 4. When not to use

- Fiscal quarters of a year that does not start in January: values and month hints are calendar quarters.
- A month or a specific day: use Month Picker, Date Picker, or Date Input.
- A whole year: use Year Picker.
- A range of quarters: use two Quarter Pickers and a cross-field rule.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. Registered with `Form`. |
| `group` | `HTMLDivElement` | The labelled `role="group"`; control boundary and popup anchor. |
| `button` | `HTMLButtonElement` | Opens the popup. |
| `popup` | `HTMLDivElement` | `role="dialog"` popup (`popover="manual"`). |
| `grid` | `HTMLDivElement` | The `role="grid"` of quarters. |
| `value` | `PlainYearQuarter \| null` | Current value; `null` when empty, incomplete, or failing a built-in check. |
| `validity` | `QuarterPickerValidity` | `{ valid, error, message }`, recomputed on every change. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `dirty` | `boolean` | Value differs from the initial value, or the segments hold an entry that does not parse to a value. |
| `touched` | `boolean` | Focus has left the whole control at least once. |
| `options` | `Readonly<QuarterPickerOptions>` | Current options. |
| `focusedValue` | `PlainYearQuarter` | The quarter holding the roving tab stop in the grid. |
| `current` | `PlainYearQuarter` | The quarter containing today in the configured timezone (or the `today` option). |

Options: `label` (required), `hideLabel`, `value`, `min`, `max`, `name`, `description`, `required`, `disabled`, `readOnly`, `validate`, `isQuarterDisabled`, `today` (advanced), and `icons`. Full table: `metadata/quarter-picker/api.json`.

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
| `QuarterPicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. |
| `update(options)` | Merge, validate, and apply options. An open popup closes when the picker becomes disabled or read-only, and re-renders otherwise. |
| `open()` | Open the popup and focus the selected quarter, else the current quarter, clamped to `min`/`max`. No-op when open, disabled, or read-only. |
| `close()` | Close the popup; if focus was inside it, it returns to the button. |
| `reportValidity()` | Show messages now (every timing) and return whether the value is valid. |
| `setCustomError(message)` | External error; cleared when the user edits. `null` or `''` clears it. |
| `getFormValue()` | `YYYY-Qn` (for example `2026-Q3`), or `null` when the value is `null`. |
| `focus()` | Focus the first segment. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close, remove rendering, host classes, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | The user changed the value or its validity error (typing, stepping, a separator, or picking a quarter). |
| `aui-open` | `null` | No | The popup opened. |
| `aui-close` | `null` | No | The popup closed. |

Programmatic changes (`setValue`, `update`, `reset`) emit no `aui-change`. Re-picking the current value emits nothing.

## 8. Slots/content areas

None. Label, help text, and messages are text options; cell text, hints, and labels come from localizable messages.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-period-picker`, `aui-quarter-picker` | Host. |
| `aui-period-picker--invalid`, `--disabled`, `--readonly` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-quarter-picker__group`, `aui-period-picker__group` | Labelled group; shows the focus indicator. |
| `aui-period-picker__fields` | LTR-isolated run of segments and literals. |
| `aui-period-picker__segment`, `__segment--quarter`, `__segment--year` | Segment inputs. |
| `aui-period-picker__separator` | Pattern literal text (for example `Q`). |
| `aui-period-picker__button` | Choose quarter button. |
| `aui-period-picker__popup`, `__header`, `__heading`, `__nav`, `__prev`, `__next` | Popup and its header. |
| `aui-period-picker__grid`, `aui-quarter-picker__grid`, `aui-period-picker__row` | Grid and row. |
| `aui-period-picker__cell`, `--selected`, `--current`, `--disabled`, `--empty`, `__cell-text`, `__cell-hint` | Quarter cells and month hints. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/quarter-picker/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-selected`, `color-selected-text`, `color-primary`, `color-on-primary`, `color-error-fg`, `color-hover`, `color-text-muted`, `font-size-xs`, `control-height-md`, `shadow-md`, `radius-md`.

## 11. States

empty, segment focused, partial (incomplete), valid, invalid (message shown), open, cell focused, cell selected, current quarter, cell disabled, disabled, read-only, required.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty | user types part of a quarter | dirty, `incomplete`; message shown only with `validationTiming: 'input'` |
| incomplete | last segment filled | valid, or `invalid` / `range-underflow` / `range-overflow` / `unavailable` / `custom`; `aui-change` |
| closed | button, Alt+ArrowDown, or `open()` | open; focus on the selected (else current) quarter; `aui-open` |
| open | Enter, Space, or click on an enabled quarter | value set, `aui-change` if changed; with `closeOnSelect` closed, focus on the button, `aui-close` |
| open | Escape, the button, or `close()` | closed; value kept; focus inside the popup returns to the button; `aui-close` |
| open | Tab out of the popup, or a pointer press outside the popup and button | closed; focus moves on |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| any | `reset()` | initial value; pristine, untouched, closed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits | Quarter segment | One digit, then advance; `0` and `5`-`9` are `invalid`. Non-digits are removed. |
| Digits | Year segment | Up to four digits; advances when full. Fewer than four digits is `incomplete`. |
| `/` `-` `.` `,` `:` Space | Segment (not read-only) | Advance to the next segment. |
| ArrowUp / ArrowDown | Segment (not read-only) | Quarter wraps 1-4; year stops at 1 and 9999. Empty quarter starts at 1 (Up) or 4 (Down); empty year starts at the current year. |
| ArrowLeft / ArrowRight | Caret at the segment edge, or text selected | Previous or next segment in visual order (not mirrored in RTL). |
| Backspace | Empty segment | Previous segment. |
| Alt+ArrowDown | Segment | Open the popup (the segment does not change). |
| Tab / Shift+Tab | Group | Move through the segments, then the button. |
| Enter / Space | Button | Open (or close) the popup. |
| ArrowRight / ArrowLeft | Quarter cell | Next / previous quarter (mirrored in RTL), across years. |
| ArrowDown / ArrowUp | Quarter cell | Same quarter next / previous year (one row of four). |
| Home / End | Quarter cell | Q1 / Q4 of the shown year. |
| PageDown / PageUp | Quarter cell | Same quarter next / previous year. |
| Shift+PageDown / Shift+PageUp | Quarter cell | Same quarter 10 years later / earlier. |
| Enter / Space | Quarter cell | Pick unless disabled; closes and focuses the button with `closeOnSelect`, else focus stays on the cell. |
| Enter / Space | Previous / next year button | Change the year; no-op while `aria-disabled`. |
| Escape | Popup open | Close without changing the value; focus returns to the button. A surrounding Dialog stays open. |
| Tab / Shift+Tab | Popup | Previous / next year buttons and the focused quarter; leaving the popup (other than to the button) closes it. |

All grid movement is clamped to `min`/`max` and to years 1-9999. Disabled quarters are focusable but not selectable.

## 14. ARIA contract

- The group is `role="group"` with `aria-labelledby` pointing at the label, and `aria-describedby` listing the help text and the visible error.
- Each segment is a native text input with a localized `aria-label` ("Quarter", "Year"), `inputmode="numeric"`, the native `required` state, and `aria-invalid="true"` only while an error is shown. Pattern literals are `aria-hidden`.
- Button: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id), and `aria-label` "Choose quarter", or "Change quarter, {value}" (for example "Change quarter, Q2 2026") when a value is set.
- Popup: `role="dialog"`, `aria-modal="false"`, `aria-label` "Choose quarter".
- Header: the heading (year) is `aria-live="polite"`; the page buttons are labelled "Previous year" / "Next year" and get `aria-disabled="true"` at the bounds.
- Grid: `role="grid"` labelled by the heading, one `role="row"`, `role="gridcell"` cells with a roving `tabindex`, `aria-label` (for example "Q2 2026, April to June"), `aria-selected="true"` on the selected quarter, `aria-current="date"` on the current quarter, and `aria-disabled="true"` on unavailable quarters.

## 15. Accessibility notes

- Each cell's accessible name includes its months, matching the visible hint, so the quarter-to-month mapping is not visual only.
- The segments stay the primary input; the grid is an alternative. A typed quarter rejected by `isQuarterDisabled` gets a localized message, so both paths agree.
- The popup is non-modal: focus is not trapped. Escape and outside presses close it through the shared overlay stack, so only the topmost overlay responds. Focus is moved before the popup hides.
- Errors appear after the whole control loses focus (SPEC section 16.1). The label focuses the first segment when clicked; the required asterisk is `aria-hidden`.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The group hugs its segments and button, up to 100% of the container; segments wrap inside the group in very narrow containers. The popup is positioned under the group (`bottom-start`), is at most the viewport width minus a gutter, caps its height to the available space (`--aui-available-height`), and scrolls when taller.

## 17. RTL behavior

Segment order and literals come from the `pattern` message. Segments render as an LTR-isolated run in every direction, so ArrowLeft and ArrowRight in segments follow that visual order and are not mirrored. The button sits at the inline end. The popup and grid take `direction`: grid ArrowLeft/ArrowRight are mirrored, the chevrons are flipped, and the popup aligns to the inline start of the group.

## 18. Theme behavior

Role tokens only. The focused segment uses `color-selected` / `color-selected-text`; the selected quarter uses `color-primary` / `color-on-primary` (its hint inherits the color); the current quarter is bold with an inset `color-border-strong` border; unavailable quarters are muted and struck through. In forced-colors mode the focused segment and the selected quarter use `Highlight` / `HighlightText`, the current quarter gets a `CanvasText` outline, disabled cells and buttons use `GrayText`, and the popup has a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'Asia/Tokyo' }, components: { quarterPicker: { validationTiming: 'submit' } } });
```

Changes apply to existing instances immediately; a locale change rebuilds the segments from that locale's `pattern` and keeps the entry.

Localize the texts with `registerMessages('quarterPicker', locale, { ... })`. Keys and English defaults: `pattern` "Q{quarter} {year}" (segment order and literals; `{quarter}` and `{year}` become segments), `value` "Q{quarter} {year}", `short` "Q{quarter}", `months` "{start}-{end}", `cellLabel` "Q{quarter} {year}, {start} to {end}", `choose` "Choose quarter", `change` "Change quarter, {value}", `previous` "Previous year", `next` "Next year", plus the validation messages in section 29. Keys missing for a locale fall back to English.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic (`update()`); there are no init-only options.

## 21. Timezone behavior

Values are `PlainYearQuarter` and never shift. The configured `timezone` (default UTC, never the host zone, SPEC section 8.1) only decides the current quarter: the cell marked `aria-current="date"`, the quarter focused when the popup opens on an empty field, and the starting year for ArrowUp/ArrowDown in an empty year segment. At 2026-06-30 20:00 UTC the current quarter is 2026-Q2 in UTC and `America/New_York`, but 2026-Q3 with `timezone: 'Asia/Kolkata'` or `'Australia/Lord_Howe'`. The advanced `today` option pins today to a fixed `PlainDate`.

## 22. Icon customization points

`icons.calendar` (default `calendar`), `icons.previous` / `icons.next` (defaults `chevron-left` / `chevron-right`), and `icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent` and `Intl` formatting; registered messages are treated as text, never HTML. Validation messages never include the entered value; range messages include only the formatted bounds (SPEC section 14.4). CSP-safe: no inline handlers; positioning writes styles through the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries `YYYY-Qn`; it is empty while the entry is empty or fails a built-in check, and disabled (not submitted) while the picker is disabled. A read-only picker is submitted.

## 25. Performance characteristics

The popup and its 4 cells are created once per picker; opening and paging only re-render cell text and state. Listeners are delegated; one configuration subscription per instance. Budget: under 5 ms average per `QuarterPicker.create` across 100 instances in headless Chromium.

## 26. Supported data scale

100 pickers per page (performance test); years 1 to 9999.

## 27. Usage examples

```ts
import { plainYearQuarter } from '@absoluteui/core';
import { QuarterPicker } from '@absoluteui/components/quarter-picker';

const host = document.createElement('div');
document.body.append(host);
QuarterPicker.create(host, { label: 'Reporting quarter', name: 'quarter', required: true, min: plainYearQuarter(2024, 1) });
```

More examples, type-checked in CI: `metadata/quarter-picker/examples.json`.

## 28. Edge cases

- Typing `3` in the quarter segment advances to the year; `5` reports `invalid` ("Enter a valid quarter (1 to 4).").
- Only one segment filled reports `incomplete` ("Enter a complete quarter."); a year with fewer than four digits reports "Enter the year with 4 digits.".
- Range messages format the bound with the `value` message, for example "Enter Q1 2026 or later.".
- Built-in errors set `value` to `null`; a `custom` error keeps the value.
- A registered `pattern` such as `{quarter}e trimestre {year}` changes the segment order and literals for that locale.
- `update({ value })` changes the value but not the value restored by `reset()` (the `value` passed to `create()`).
- Inside a modal Dialog, the first Escape closes the popup and the second closes the dialog.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `QUARTER_PICKER_OPTIONS` | configuration | Missing or blank label; `value`/`min`/`max` not a `PlainYearQuarter` with year 1-9999; `min` after `max`; non-function `validate` or `isQuarterDisabled`; `today` not a `PlainDate`. Details name the property (for example `quarterPicker.value`). |
| `CFG_INVALID_VALUE` | configuration | Invalid `validationTiming`, `closeOnSelect`, `locale`, `timezone`, or `direction`. |
| Validation (`validity.error`) | validation | `incomplete`, `invalid`, `value-missing`, `range-underflow`, `range-overflow`, `unavailable`, `custom`. |

Built-in checks run in that order: empty (`value-missing` when required), partial (`incomplete`), four-digit year (`incomplete`), segment range (`invalid`), `min`, `max`, `isQuarterDisabled` (`unavailable`), then `validate`, then an external custom error. English messages: "This field is required.", "Enter a complete quarter.", "Enter the year with 4 digits.", "Enter a valid quarter (1 to 4).", "Enter {min} or later.", "Enter {max} or earlier.", "This quarter is not available.". A failed construction leaves nothing behind.

## 30. Known limitations

- Calendar quarters only (Q1 is January to March); a fiscal-year start is not supported.
- Gregorian calendar only; years 1 to 9999; only ASCII digits are accepted.
- Segment order comes from the `pattern` message, not from `Intl`; locales without registered messages use the English pattern.
- Single quarters only; no Cancel/OK buttons (picking commits).
- Segment arrow navigation is not mirrored in RTL.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Fiscal quarters or custom quarter-to-month mappings.
- HTML in the label, help text, cells, or messages.
- Custom cell content or grid layouts.

## 32. TypeScript definitions

```ts
interface PlainYearQuarter { readonly kind: 'PlainYearQuarter'; readonly year: number; readonly quarter: number }
interface QuarterPickerConfig { validationTiming: ValidationTiming; closeOnSelect: boolean }
type ValidationTiming = 'blur' | 'input' | 'submit';
type QuarterPickerError = 'incomplete' | 'invalid' | 'value-missing' | 'range-underflow' | 'range-overflow' | 'unavailable' | 'custom';
interface QuarterPickerValidity { readonly valid: boolean; readonly error: QuarterPickerError | null; readonly message: string }
interface QuarterPickerChangeDetail { value: PlainYearQuarter | null; validity: QuarterPickerValidity }
interface QuarterPickerIcons { calendar: IconRef; previous: IconRef; next: IconRef; error: IconRef }
```

## 33. Vanilla JS example

```ts
import { plainYearQuarterToString } from '@absoluteui/core';
import { QuarterPicker, type QuarterPickerChangeDetail } from '@absoluteui/components/quarter-picker';
import '@absoluteui/components/quarter-picker/style.css';

const host = document.querySelector<HTMLElement>('#review');
if (host) {
  QuarterPicker.create(host, { label: 'Review quarter', name: 'review' });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<QuarterPickerChangeDetail>).detail;
    host.dataset.quarter = value ? plainYearQuarterToString(value) : '';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainYearQuarter, type PlainYearQuarter } from '@absoluteui/core';
import { AuiQuarterPicker } from '@absoluteui/angular/quarter-picker';

@Component({
  selector: 'app-report',
  imports: [ReactiveFormsModule, AuiQuarterPicker],
  template: `<aui-quarter-picker label="Reporting quarter" [min]="min" [required]="true" [formControl]="quarter"></aui-quarter-picker>`,
})
export class ReportComponent {
  readonly min = plainYearQuarter(2024, 1);
  readonly quarter = new FormControl<PlainYearQuarter | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { type PlainYearQuarter } from '@absoluteui/core';
import { AuiQuarterPicker } from '@absoluteui/react/quarter-picker';

export function Example() {
  const [value, setValue] = useState<PlainYearQuarter | null>(null);
  return <AuiQuarterPicker label="Reporting quarter" value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { type PlainYearQuarter } from '@absoluteui/core';
import { AuiQuarterPicker } from '@absoluteui/vue/quarter-picker';
const value = ref<PlainYearQuarter | null>(null);
</script>

<template>
  <AuiQuarterPicker v-model="value" label="Reporting quarter" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
