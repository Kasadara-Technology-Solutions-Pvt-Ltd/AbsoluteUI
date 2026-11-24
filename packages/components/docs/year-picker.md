# Year Picker

> Package: `@absoluteui/components/year-picker` | Styles: `@absoluteui/components/year-picker/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Entry of a calendar year. `YearPicker` renders one four-digit year segment inside a labelled group, plus a "Choose year" button that opens a non-modal dialog popup with a grid of the ten years of a decade (paged by decade). The value is a plain `number` (an integer from 1 to 9999); a hidden input submits it as four zero-padded digits (`YYYY`). It shares its engine with Month and Quarter Picker; this page states every behavior in full, and year-specific details are marked.

## 2. Anatomy

```text
<div class="aui-field aui-period-picker aui-year-picker" data-aui-control>    (consumer host; registered with Form)
  <label class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-year-picker__group aui-period-picker__group" role="group" aria-labelledby=label aria-describedby>
    <div class="aui-period-picker__fields">
      <input class="aui-period-picker__segment aui-period-picker__segment--year" aria-label="Year" placeholder="yyyy">
    </div>
    <button class="aui-period-picker__button" aria-haspopup="dialog" aria-expanded aria-controls=popup aria-label="Choose year">
  </div>
  <div class="aui-field__description">                                     (hidden when empty)
  <div class="aui-field__error aui-validation-message">                    (hidden when no message is shown)
  <input type="hidden" name>
  <div class="aui-period-picker__popup" role="dialog" aria-modal="false" aria-label="Choose year" popover="manual">
    <div class="aui-period-picker__header">
      <button class="aui-period-picker__nav aui-period-picker__prev" aria-label="Previous 10 years">
      <div class="aui-period-picker__heading" aria-live="polite">2020 - 2029</div>
      <button class="aui-period-picker__nav aui-period-picker__next" aria-label="Next 10 years">
    </div>
    <div class="aui-period-picker__grid aui-year-picker__grid" role="grid" aria-labelledby=heading>
      <div class="aui-period-picker__row" role="row">                       (2 rows of 5)
        <div class="aui-period-picker__cell" role="gridcell" aria-label="2020" tabindex="-1">
          <span class="aui-period-picker__cell-text">2020</span>
        </div> ...
      </div>
    </div>
  </div>
</div>
```

The popup sits inside the host in the DOM (it renders in the top layer), so moving focus between the segment, the button, and the popup does not mark the field touched.

## 3. When to use

- A calendar year on its own: a model year, a graduation year, a tax or reporting year.
- Users should be able to type a year quickly and also browse nearby years.
- Year fields with bounds or unavailable years.

## 4. When not to use

- A month or a specific day: use Month Picker, Date Picker, or Date Input.
- A calendar quarter: use Quarter Picker.
- An arbitrary number that is not a year: use Number Input.
- A fiscal year that does not start in January: the value is a calendar year; map it yourself and label the field accordingly.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. Registered with `Form`. |
| `group` | `HTMLDivElement` | The labelled `role="group"`; control boundary and popup anchor. |
| `button` | `HTMLButtonElement` | Opens the popup. |
| `popup` | `HTMLDivElement` | `role="dialog"` popup (`popover="manual"`). |
| `grid` | `HTMLDivElement` | The `role="grid"` of years. |
| `value` | `number \| null` | Current value; `null` when empty, incomplete, or failing a built-in check. |
| `validity` | `YearPickerValidity` | `{ valid, error, message }`, recomputed on every change. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `dirty` | `boolean` | Value differs from the initial value, or the segment holds an entry that does not parse to a value. |
| `touched` | `boolean` | Focus has left the whole control at least once. |
| `options` | `Readonly<YearPickerOptions>` | Current options. |
| `focusedValue` | `number` | The year holding the roving tab stop in the grid. |
| `current` | `number` | The year containing today in the configured timezone (or the `today` option). |

Options: `label` (required), `hideLabel`, `value`, `min`, `max` (integer years), `name`, `description`, `required`, `disabled`, `readOnly`, `validate`, `isYearDisabled`, `today` (advanced), and `icons`. Full table: `metadata/year-picker/api.json`.

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
| `YearPicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. |
| `update(options)` | Merge, validate, and apply options. An open popup closes when the picker becomes disabled or read-only, and re-renders otherwise. |
| `open()` | Open the popup and focus the selected year, else the current year, clamped to `min`/`max`. No-op when open, disabled, or read-only. |
| `close()` | Close the popup; if focus was inside it, it returns to the button. |
| `reportValidity()` | Show messages now (every timing) and return whether the value is valid. |
| `setCustomError(message)` | External error; cleared when the user edits. `null` or `''` clears it. |
| `getFormValue()` | Zero-padded `YYYY` (for example `0005`), or `null` when the value is `null`. |
| `focus()` | Focus the year segment. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close, remove rendering, host classes, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | The user changed the value or its validity error (typing, stepping, or picking a year). |
| `aui-open` | `null` | No | The popup opened. |
| `aui-close` | `null` | No | The popup closed. |

Programmatic changes (`setValue`, `update`, `reset`) emit no `aui-change`. Re-picking the current value emits nothing.

## 8. Slots/content areas

None. Label, help text, and messages are text options; the grid is generated from the decade, `min`, `max`, and `isYearDisabled`.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-period-picker`, `aui-year-picker` | Host. |
| `aui-period-picker--invalid`, `--disabled`, `--readonly` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-year-picker__group`, `aui-period-picker__group` | Labelled group; shows the focus indicator. |
| `aui-period-picker__fields` | LTR-isolated segment container. |
| `aui-period-picker__segment`, `__segment--year` | Year segment. |
| `aui-period-picker__button` | Choose year button. |
| `aui-period-picker__popup`, `__header`, `__heading`, `__nav`, `__prev`, `__next` | Popup and its header. |
| `aui-period-picker__grid`, `aui-year-picker__grid`, `aui-period-picker__row` | Grid and rows. |
| `aui-period-picker__cell`, `--selected`, `--current`, `--disabled`, `--empty`, `__cell-text` | Year cells (`--empty` is the year-0 slot of the first page). |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/year-picker/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-selected`, `color-selected-text`, `color-primary`, `color-on-primary`, `color-error-fg`, `color-hover`, `color-text-disabled`, `control-height-md`, `shadow-md`, `radius-md`.

## 11. States

empty, segment focused, partial (incomplete), valid, invalid (message shown), open, cell focused, cell selected, current year, cell disabled, disabled, read-only, required.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty | user types fewer than four digits | dirty, `incomplete`; message shown only with `validationTiming: 'input'` |
| incomplete | fourth digit typed | valid, or `invalid` / `range-underflow` / `range-overflow` / `unavailable` / `custom`; `aui-change` |
| closed | button, Alt+ArrowDown, or `open()` | open; focus on the selected (else current) year; `aui-open` |
| open | Enter, Space, or click on an enabled year | value set, `aui-change` if changed; with `closeOnSelect` closed, focus on the button, `aui-close` |
| open | Escape, the button, or `close()` | closed; value kept; focus inside the popup returns to the button; `aui-close` |
| open | Tab out of the popup, or a pointer press outside the popup and button | closed; focus moves on |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| any | `reset()` | initial value; pristine, untouched, closed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits | Year segment | Up to four digits; fewer than four is `incomplete` (year 5 is typed `0005`). Non-digits are removed. |
| ArrowUp / ArrowDown | Year segment (not read-only) | Plus / minus one year, stopping at 1 and 9999; an empty segment starts at the current year. |
| Alt+ArrowDown | Year segment | Open the popup (the segment does not change). |
| Tab / Shift+Tab | Group | Segment, then the button. |
| Enter / Space | Button | Open (or close) the popup. |
| ArrowRight / ArrowLeft | Year cell | Next / previous year (mirrored in RTL), across decades. |
| ArrowDown / ArrowUp | Year cell | Plus / minus 5 years (next / previous row), across decades. |
| Home / End | Year cell | First / last year of the row. |
| PageDown / PageUp | Year cell | Plus / minus 10 years (next / previous decade). |
| Shift+PageDown / Shift+PageUp | Year cell | Plus / minus 100 years. |
| Enter / Space | Year cell | Pick unless disabled; closes and focuses the button with `closeOnSelect`, else focus stays on the cell. |
| Enter / Space | Previous / next 10 years button | Change the decade; no-op while `aria-disabled`. |
| Escape | Popup open | Close without changing the value; focus returns to the button. A surrounding Dialog stays open. |
| Tab / Shift+Tab | Popup | Previous / next buttons and the focused year; leaving the popup (other than to the button) closes it. |

All grid movement is clamped to `min`/`max` and to years 1-9999. Disabled years are focusable but not selectable.

## 14. ARIA contract

- The group is `role="group"` with `aria-labelledby` pointing at the label, and `aria-describedby` listing the help text and the visible error.
- The segment is a native text input with the localized `aria-label` "Year", `inputmode="numeric"`, the native `required` state, and `aria-invalid="true"` only while an error is shown.
- Button: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id), and `aria-label` "Choose year", or "Change year, {value}" (for example "Change year, 2026") when a value is set.
- Popup: `role="dialog"`, `aria-modal="false"`, `aria-label` "Choose year".
- Header: the heading (for example "2020 - 2029"; the first page is "1 - 9") is `aria-live="polite"`; the page buttons are labelled "Previous 10 years" / "Next 10 years" and get `aria-disabled="true"` at the bounds.
- Grid: `role="grid"` labelled by the heading, `role="row"` rows, `role="gridcell"` cells with a roving `tabindex`, `aria-label` (the formatted year), `aria-selected="true"` on the selected year, `aria-current="date"` on the current year, and `aria-disabled="true"` on unavailable years. The empty year-0 slot has no label and no `tabindex`.

## 15. Accessibility notes

- The segment stays the primary input; the grid is an alternative. A typed year rejected by `isYearDisabled` gets a localized message, so both paths agree.
- The popup is non-modal: focus is not trapped. Escape and outside presses close it through the shared overlay stack, so only the topmost overlay responds.
- Focus is moved before the popup hides, so it never falls to the document body.
- Errors appear after the whole control loses focus (SPEC section 16.1). The label focuses the segment when clicked; the required asterisk is `aria-hidden`.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The group hugs its segment and button, up to 100% of the container. The popup is positioned under the group (`bottom-start`), is at most the viewport width minus a gutter, caps its height to the available space (`--aui-available-height`), and scrolls when taller.

## 17. RTL behavior

The year segment renders as an LTR-isolated run. The button sits at the inline end. The popup and grid take `direction`: grid ArrowLeft/ArrowRight are mirrored, the chevrons are flipped, and the popup aligns to the inline start of the group.

## 18. Theme behavior

Role tokens only. The focused segment uses `color-selected` / `color-selected-text`; the selected year uses `color-primary` / `color-on-primary`; the current year is bold with an inset `color-border-strong` border; unavailable years are muted and struck through. In forced-colors mode the focused segment and the selected year use `Highlight` / `HighlightText`, the current year gets a `CanvasText` outline, disabled cells and buttons use `GrayText`, and the popup has a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { yearPicker: { closeOnSelect: false, validationTiming: 'input' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic (`update()`); there are no init-only options.

## 21. Timezone behavior

Values are plain year numbers and never shift. The configured `timezone` (default UTC, never the host zone, SPEC section 8.1) only decides the current year: the cell marked `aria-current="date"`, the year focused when the popup opens on an empty field, and the starting year for ArrowUp/ArrowDown in an empty segment. At 2026-12-31 19:00 UTC the current year is 2026 in UTC and `America/New_York`, but 2027 with `timezone: 'Asia/Kolkata'`. The advanced `today` option pins today to a fixed `PlainDate`.

## 22. Icon customization points

`icons.calendar` (default `calendar`), `icons.previous` / `icons.next` (defaults `chevron-left` / `chevron-right`), and `icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent` and `Intl` formatting; no HTML parsing. Validation messages never include the entered value; range messages include only the formatted bounds (SPEC section 14.4). CSP-safe: no inline handlers; positioning writes styles through the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries the zero-padded `YYYY`; it is empty while the entry is empty or fails a built-in check, and disabled (not submitted) while the picker is disabled. A read-only picker is submitted.

## 25. Performance characteristics

The popup and its 10 cells are created once per picker; opening and paging only re-render cell text and state. Listeners are delegated; one configuration subscription per instance. Budget: under 5 ms average per `YearPicker.create` across 100 instances in headless Chromium.

## 26. Supported data scale

100 pickers per page (performance test); years 1 to 9999.

## 27. Usage examples

```ts
import { YearPicker } from '@absoluteui/components/year-picker';

const host = document.createElement('div');
document.body.append(host);
YearPicker.create(host, { label: 'Model year', name: 'modelYear', required: true, min: 1990, max: 2027 });
```

More examples, type-checked in CI: `metadata/year-picker/examples.json`.

## 28. Edge cases

- Decade pages start at multiples of ten; the first page shows years 1 to 9 (heading "1 - 9") with an empty slot where year 0 would be, and its previous button is `aria-disabled`.
- `0000` reports `invalid` ("Enter a valid year."); `26` reports `incomplete` ("Enter the year with 4 digits.").
- Year 5 is shown and submitted as `0005`; ArrowUp from year 1 in the grid stays on year 1.
- Built-in errors set `value` to `null`; a `custom` error keeps the value.
- `update({ value })` changes the value but not the value restored by `reset()` (the `value` passed to `create()`).
- Inside a modal Dialog, the first Escape closes the popup and the second closes the dialog.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `YEAR_PICKER_OPTIONS` | configuration | Missing or blank label; `value`/`min`/`max` not an integer 1-9999 (for example `2026.5` or `0`); `min` after `max`; non-function `validate` or `isYearDisabled`; `today` not a `PlainDate`. Details name the property (for example `yearPicker.value`). |
| `CFG_INVALID_VALUE` | configuration | Invalid `validationTiming`, `closeOnSelect`, `locale`, `timezone`, or `direction`. |
| Validation (`validity.error`) | validation | `incomplete`, `invalid`, `value-missing`, `range-underflow`, `range-overflow`, `unavailable`, `custom`. |

Built-in checks run in that order: empty (`value-missing` when required), four-digit year (`incomplete`), range 1-9999 (`invalid`), `min`, `max`, `isYearDisabled` (`unavailable`), then `validate`, then an external custom error. English messages: "This field is required.", "Enter the year with 4 digits.", "Enter a valid year.", "Enter {min} or later.", "Enter {max} or earlier.", "This year is not available.". A failed construction leaves nothing behind.

## 30. Known limitations

- Years 1 to 9999 only; no year 0, negative years, or eras.
- The year must be typed with four digits; only ASCII digits are accepted.
- Calendar years only; fiscal years with a non-January start are not modeled.
- Single years only; no Cancel/OK buttons (picking commits).
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in the label, help text, cells, or messages.
- Non-Gregorian calendars or eras.
- Custom cell content or grid layouts.

## 32. TypeScript definitions

```ts
interface YearPickerConfig { validationTiming: ValidationTiming; closeOnSelect: boolean }
type ValidationTiming = 'blur' | 'input' | 'submit';
type YearPickerError = 'incomplete' | 'invalid' | 'value-missing' | 'range-underflow' | 'range-overflow' | 'unavailable' | 'custom';
interface YearPickerValidity { readonly valid: boolean; readonly error: YearPickerError | null; readonly message: string }
interface YearPickerChangeDetail { value: number | null; validity: YearPickerValidity }
interface YearPickerIcons { calendar: IconRef; previous: IconRef; next: IconRef; error: IconRef }
```

## 33. Vanilla JS example

```ts
import { YearPicker, type YearPickerChangeDetail } from '@absoluteui/components/year-picker';
import '@absoluteui/components/year-picker/style.css';

const host = document.querySelector<HTMLElement>('#graduation');
if (host) {
  YearPicker.create(host, { label: 'Graduation year', name: 'graduation', max: 2030 });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<YearPickerChangeDetail>).detail;
    host.dataset.year = value === null ? '' : String(value);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiYearPicker } from '@absoluteui/angular/year-picker';

@Component({
  selector: 'app-vehicle',
  imports: [ReactiveFormsModule, AuiYearPicker],
  template: `<aui-year-picker label="Model year" [min]="1990" [required]="true" [formControl]="year"></aui-year-picker>`,
})
export class VehicleComponent {
  readonly year = new FormControl<number | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
