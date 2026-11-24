# Number Input

> Package: `@absoluteui/components/number-input` | Styles: `@absoluteui/components/number-input/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Locale-aware numeric entry. `NumberInput` renders a text `<input>` with the `spinbutton` role (not native `type=number`, which ignores the locale's separators and differs across browsers). It parses and formats group and decimal separators, locale digits (for example Arabic-Indic), minus-sign variants, and currency, percent, and unit literals through `Intl.NumberFormat`. It steps with the keyboard and optional stepper buttons, validates range and step with localized messages, and submits a canonical value through a hidden input.

## 2. Anatomy

```text
<div class="aui-field aui-number-input" data-aui-control>          (consumer host)
  <label class="aui-field__label" for=input>Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-number-input__control">
    <input class="aui-number-input__input" type="text" role="spinbutton" inputmode="decimal"
           aria-valuenow aria-valuetext aria-valuemin aria-valuemax>
    <button class="aui-number-input__stepper aui-number-input__decrement" tabindex="-1">   (showSteppers)
    <button class="aui-number-input__stepper aui-number-input__increment" tabindex="-1">   (showSteppers)
  </div>
  <input type="hidden" name value="1234.5">                         (canonical value)
  <div class="aui-field__description">                             (optional)
  <div class="aui-field__error aui-validation-message">            (when shown)
</div>
```

## 3. When to use

- Quantities, amounts, prices, percentages, and measurements users type or adjust in small increments.
- Numbers that must be entered and displayed in the user's locale (`1.234,5` in German, Arabic-Indic digits in Arabic).
- Values constrained by a minimum, maximum, or step.

## 4. When not to use

- Identifiers made of digits (card numbers, postal codes, phone numbers, one-time codes): use Text Input with `inputMode: 'numeric'`.
- Choosing on a continuous range where precision does not matter: use Slider.
- Dates and times: use Date Input or Date Picker.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `input` | `HTMLInputElement` | The visible text input (`role="spinbutton"`). |
| `formInput` | `HTMLInputElement` | Hidden input with `name` and the canonical value. |
| `value` | `number \| null` | Current parsed value; `null` when empty or unparseable. |
| `text` | `string` | Text in the input: raw while typing, formatted after commit. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Value differs from the initial value, or the text is unparseable. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<NumberInputOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `value` (`number | null`), `name`, `placeholder`, `description`, `required`, `disabled`, `readOnly`, `min`, `max`, `step` (default 1, 0.01 for percent style; `null` = any), `format` (`minimumFractionDigits`, `maximumFractionDigits`, `useGrouping`, `style: 'decimal' | 'percent' | 'currency' | 'unit'`, `currency`, `unit`), `validate`, and `icons`. Full table: `metadata/number-input/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `showSteppers` | `boolean` | `true` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `NumberInput.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options or format before rendering. |
| `setValue(value)` | Programmatic value (`number \| null`); reformats the display; no events. Clears an external custom error. |
| `update(options)` | Merge and apply options. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user edits. `null` clears it. |
| `getFormValue()` | `number \| null` for form serialization. |
| `focus()` | Focus the input. |
| `reset()` | Restore the initial value; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-input` | `{ value, text, validity }` | Yes | The user typed, or stepped with the keyboard or the stepper buttons (since 0.9.0, like a native number input); `value` is the parse of the raw `text`. |
| `aui-change` | `{ value, validity }` | Yes | The user committed a changed value: blur, Enter, arrow/page/Home/End keys, or a stepper button. |

Stepping emits `aui-change` only. Programmatic changes (`setValue`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. Label and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-number-input` | Host. |
| `aui-number-input--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-number-input__control` | Control boundary; shows the focus indicator. |
| `aui-number-input__input` | Visible text input (tabular numerals). |
| `aui-number-input__stepper`, `__increment`, `__decrement` | Stepper buttons. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/number-input/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-border`, `color-focus-ring`, `color-error-fg`, `color-hover`, `color-surface-sunken`, `control-height-md`, `control-padding-x`, `icon-size-sm`, `radius-md`.

## 11. States

default, focus-visible, empty, filled, disabled, read-only, required, invalid (message shown), bad input, at minimum (decrement disabled), at maximum (increment disabled).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | user types | text kept as typed; value parsed; `bad-input` when unparseable; dirty |
| editing | blur or Enter | committed: value rounded to `maximumFractionDigits` when set; text reformatted unless unparseable; `aui-change` if the value changed |
| any | arrow, page, Home/End key, or stepper | value stepped, clamped, snapped; text reformatted; `aui-change` |
| any | focus leaves the host | touched; messages shown (`blur` timing), after the pointer is released if focus left by a click |
| any | `reportValidity()` | submitted; messages shown for every timing |
| any | locale or format changes while not focused | text reformatted in the new locale |
| any | `reset()` | initial value, formatted; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves focus to and from the input; stepper buttons are skipped. |
| ArrowUp / ArrowDown | Input focused | Increase / decrease by one step. From empty: `min ?? 0`. Clamped to `[min, max]`. |
| PageUp / PageDown | Input focused | Increase / decrease by ten steps. |
| Home / End | Input focused, `min` / `max` set | Set the minimum / the largest on-grid value not above `max`. Without the bound: native caret movement. |
| Enter | Input focused | Commit and reformat; implicit form submission still happens. |
| Editing keys | Input focused | Native text editing. |

Stepping is blocked while read-only.

## 14. ARIA contract

- Native `<label for>` names the input; `role="spinbutton"` (APG Spinbutton pattern).
- `aria-valuenow` is the numeric value and `aria-valuetext` the formatted text (for example `15%`); both are removed when empty or unparseable.
- `aria-valuemin` / `aria-valuemax` mirror `min` / `max` when set.
- `aria-describedby`: help text and the visible error message. `aria-invalid="true"` only while an error message is shown.
- Stepper buttons: localized `aria-label` (Increase / Decrease), `aria-controls` pointing at the input, `tabindex="-1"`, native `disabled` at the bounds.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; the native `required` attribute conveys the state.
- Errors appear after the first blur by default (SPEC section 16.1), then update live.
- Messages format numbers in the locale and style: `Enter a value of 1.000 or more.` in German.
- `inputmode="decimal"` (or `numeric` when `maximumFractionDigits` is 0) selects the virtual keyboard.
- Stepper buttons are a pointer affordance; pressing one keeps focus in the input. Every action is available from the keyboard.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Full width of its container. The stepper buttons keep their size and the input shrinks. Density tokens change the control height and button width.

## 17. RTL behavior

Logical properties: the stepper buttons sit at the inline end in both directions. Bidi control marks that `Intl` inserts in RTL locales are ignored when parsing.

## 18. Theme behavior

Colors come from role tokens only. In forced-colors mode, focus draws a `Highlight` outline and disabled steppers use `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { numberInput: { showSteppers: false, validationTiming: 'input' } } });
```

Changes apply to existing instances immediately. A locale change reformats the text of inputs that are not focused.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`), `icons.increment` (default `plus`), and `icons.decrement` (default `minus`).

## 23. Security behavior

All text uses `textContent` or attributes. Validation messages never include the entered text (SPEC section 14.4); only constraint parameters. No style attributes or HTML sinks. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. The visible input is not named; a hidden input named `name` carries the canonical value (`1234.5`, empty when `null` or unparseable, and not submitted while disabled).

## 25. Performance characteristics

Four listeners per instance (input, blur, keydown, focusout), two per stepper button, and one configuration subscription. `Intl.NumberFormat` instances are built once per locale and format and reused. Budget: under 1 ms average per `NumberInput.create` across 1,000 instances.

## 26. Supported data scale

Values are JavaScript numbers: exact up to 15 significant digits and integers up to 2^53. 1,000 inputs per page is the performance target.

## 27. Usage examples

```ts
import { NumberInput } from '@absoluteui/components/number-input';

const host = document.createElement('div');
document.body.append(host);
NumberInput.create(host, { label: 'Preis', name: 'price', locale: 'de-DE', min: 0, step: 0.01, format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 2 } });
```

More examples, type-checked in CI: `metadata/number-input/examples.json`.

## 28. Edge cases

- Percent style: typed `15` and `15%` are both `0.15`; the default step is `0.01`.
- `de-DE`: `1.234,5` is `1234.5`; a lone `.` is a group separator, so `1.5` is `15`.
- `ar-EG`: `١٬٢٣٤٫٥` and ASCII `1234.5` are both accepted; the display uses Arabic-Indic digits.
- `-5` (U+2212), `-5`, and a leading `+` are accepted.
- Currency: `$1,234.50`, `1234.5`, and `USD 1234.5` parse to the same value.
- Unparseable text (`12abc`, two decimal separators) is `bad-input`: `value` is `null`, the text is kept for correction, and the hidden input is empty.
- Stepping from an off-grid value snaps to the grid in the step direction (`8` with step 5 from min 1 goes up to 11, down to 6); the result is rounded to the step's decimal places (`0.2 + 0.1` steps to `0.3`).
- `maximumFractionDigits` rounds the committed value with decimal (not binary) rounding: `1234.505` becomes `1234.51`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `NUMBER_INPUT_OPTIONS` | configuration | Missing label; non-finite `value`, `min`, or `max`; `min > max`; `step <= 0`; invalid `format` fields (style, missing currency/unit, fraction digits). |
| `NUMBER_INPUT_FORMAT` | configuration | `Intl.NumberFormat` rejected the format for the locale (for example an unknown unit). |
| Validation (`validity.error`) | validation | `value-missing`, `bad-input`, `range-underflow`, `range-overflow`, `step-mismatch`, `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind. A failed `update()` keeps the previous options.

## 30. Known limitations

- IEEE 754 doubles: no arbitrary-precision decimals or BigInt.
- Parsing is strict to the locale; group separator positions are not validated.
- Accounting (parenthesized negatives), scientific, engineering, and compact notation are not parsed.
- The hidden canonical value uses JavaScript number serialization (exponent notation below 1e-6 and from 1e21).
- With `inputmode="numeric"` some mobile keyboards have no minus key.
- Stepper buttons do not repeat on press-and-hold.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Native `type=number` behavior (wheel stepping, browser spin buttons).
- HTML in the label, help text, or messages.
- BigInt values.

## 32. TypeScript definitions

```ts
interface NumberInputFormat {
  minimumFractionDigits?: number;
  maximumFractionDigits?: number;
  useGrouping?: boolean;
  style?: 'decimal' | 'percent' | 'currency' | 'unit';
  currency?: string;
  unit?: string;
}
interface NumberInputInputDetail { value: number | null; text: string; validity: FieldValidity }
interface NumberInputValueDetail { value: number | null; validity: FieldValidity }
interface FieldValidity { readonly valid: boolean; readonly error: ValidationErrorCode | null; readonly message: string }
```

## 33. Vanilla JS example

```ts
import { NumberInput } from '@absoluteui/components/number-input';
import '@absoluteui/components/number-input/style.css';

const host = document.querySelector<HTMLElement>('#quantity');
if (host) {
  const quantity = NumberInput.create(host, { label: 'Quantity', name: 'quantity', value: 1, min: 1, max: 99, required: true });
  host.addEventListener('aui-change', () => {
    if (!quantity.validity.valid) quantity.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiNumberInput } from '@absoluteui/angular/number-input';

@Component({
  selector: 'app-order',
  imports: [ReactiveFormsModule, AuiNumberInput],
  template: `<aui-number-input label="Quantity" [min]="1" [max]="99" [step]="1" [required]="true" [formControl]="quantity"></aui-number-input>`,
})
export class OrderComponent {
  readonly quantity = new FormControl<number | null>(1, { validators: [Validators.required, Validators.min(1), Validators.max(99)] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
