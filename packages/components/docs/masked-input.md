# Masked Input

> Package: `@absoluteui/components/masked-input` | Styles: `@absoluteui/components/masked-input/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

A text field that formats what the user types against a pattern mask: phone numbers, IBANs, postal codes, and other fixed-shape codes. Tokens are `9` (digit), `a` (letter), and `*` (letter or digit), plus custom tokens; `\` escapes a literal; every other character is a literal inserted automatically. Typed and pasted characters fill the next free slots (characters that fit no slot are dropped), Backspace and Delete skip literals, a selection is replaced, and the caret keeps its logical position across reformatting. `value` is the raw text (slot characters only); `formattedValue` adds the literals; placeholder characters are never part of the value. `MaskedInput` is a Form control with a hidden input that submits the raw or the formatted value. Text Input has no masking (see its section 30), which is why this is a separate component.

## 2. Anatomy

```text
<div class="aui-field aui-masked-input">
  <label class="aui-field__label">Mobile phone</label>
  <input class="aui-masked-input__input" type="text" dir="ltr" inputmode="tel" value="(555) 010-____" aria-describedby="hint desc error">
  <span id="hint" class="aui-visually-hidden">Format: (999) 999-9999, for example (555) 010-0199. 9 is a digit.</span>
  <div class="aui-field__description">help</div>
  <div class="aui-field__error">Enter the value in the format (999) 999-9999.</div>
  <input type="hidden" name="phone" value="555010">
</div>
```

## 3. When to use

- Values with one fixed shape: national phone numbers, IBANs, postal codes, account or reference numbers.
- Codes where showing the separators while typing prevents errors.

## 4. When not to use

- Dates and times: use Date Input or Date Picker. They validate real dates, respect the business calendar (weekends and holidays), and handle locales; the `date` presets only shape digits.
- Formats that vary (UK postcodes such as `M1 1AE` and `SW1A 1AA`, addresses, names): use Text Input with `pattern` or `validate`.
- Numbers with grouping and decimals: use Number Input. One-time codes: use OTP Input.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLInputElement` | The native input (shows the formatted value). |
| `value` | `string` | Raw value: slot characters only. |
| `formattedValue` | `string` | The value with literals, up to the last filled slot. |
| `complete` | `boolean` | At least `minLength` (default every) slot is filled. |
| `name` / `label` / `disabled` | | Form control contract. |
| `validity` | `FieldValidity` | `{ valid, error, message }`. |
| `dirty` / `touched` | `boolean` | Form state. |
| `options` | `Readonly<MaskedInputOptions>` | Current options. |

Options (`MaskedInputOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label and accessible name. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `mask` | `string` | - (required) | No | `9` digit, `a` letter, `*` letter or digit, custom tokens, `\` escapes; other characters are literals. |
| `tokens` | `Readonly<Record<string, MaskToken>>` | - | No | Custom tokens `{ pattern, transform?, description? }`. |
| `value` | `string` | `''` | No | Initial raw value (formatted text is parsed); restored by `reset()`. |
| `minLength` | `number` | every slot | No | Raw characters needed for a complete value. |
| `name` | `string` | - | No | Form field name. |
| `submit` | `'raw' \| 'formatted'` | `'raw'` | No | What the hidden input and `getFormValue()` carry. |
| `placeholder` | `string` | the template | No | Shown while empty and unfocused. |
| `example` | `string` | - | No | Example read in the format hint. |
| `formatHint` | `string` | generated | No | Replaces the generated format hint. |
| `required` | `boolean` | `false` | No | Empty value is invalid. |
| `disabled` | `boolean` | `false` | No | Disable the field. |
| `readOnly` | `boolean` | `false` | No | Not editable. |
| `inputMode` | `'numeric' \| 'text' \| 'tel' \| 'decimal'` | `numeric` for digit masks | No | Virtual keyboard hint. |
| `autocomplete` | `string` | `'off'` | No | Native autocomplete token. |
| `direction` | `'ltr' \| 'rtl' \| 'auto'` | `'ltr'` | No | Text direction of the value. |
| `validate` | `(value, { formattedValue, complete }) => string \| null` | - | No | Consumer validation (for example a checksum). |
| `icons` | `Partial<{ error: IconRef }>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages first appear. |
| `placeholderChar` | `string` | `'_'` | Yes | Character in empty slots of the template. |
| `showMaskOnFocus` | `boolean` | `true` | Yes | Show the whole template while focused. |
| `locale` | `string` | common `locale` | Yes (inherited) | Message locale. |

Presets (`MASK_PRESETS`, spread them into the options): `phoneUs` `(999) 999-9999`, `phoneInternational` `+99 999 999 9999` (complete from 9 digits), `iban` `AA99 XXXX …` (upper case, complete from 15 characters), `zipUs` `99999`, `zipUs4` `99999-9999` (complete from 5 digits), `dateIso` `9999-99-99`, `date` `99/99/9999`.

## 6. Methods

| Method | Description |
|---|---|
| `MaskedInput.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set from raw or formatted text; characters that fit no slot are dropped (no events). |
| `update(options)` | Merge and apply options; a new mask re-fits the value. |
| `reportValidity()` | Show messages now; returns validity. |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `getFormValue()` | Raw or formatted value, per `submit`. |
| `focus()` | Focus the input. |
| `reset()` | Restore the initial value and clear form state. |
| `destroy()` | Remove rendering, listeners, and the form registration. |

`Mask` (also exported) compiles a mask for use outside the field: `new Mask('(999) 999-9999').format('5550100199', null)`.

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-input` | `MaskedInputValueDetail` `{ value, formattedValue, complete, validity }` | The raw value changed. |
| `aui-change` | `MaskedInputValueDetail` | Focus left with a changed value. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-masked-input`, `aui-masked-input--invalid|disabled`, `aui-masked-input__input`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/masked-input/tokens.json` (verified in CI). Global tokens only: the shared field surface and states (`control-height-md`, `color-border-strong`, `radius-md`, `color-focus-ring`, `color-error-fg`).

## 11. States

Empty; partially filled; complete; template shown (focused); required; disabled; read-only; invalid (incomplete or custom).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| unfocused | focus | template shown (`showMaskOnFocus`), caret at the first empty slot |
| any | a fitting character typed or pasted | slot filled, literals added; `aui-input` |
| any | a character that fits no slot | unchanged |
| any | Backspace / Delete | the slot character before / after the caret removed; following characters move up |
| focused | blur | formatted value without the template; `aui-change` when the value changed |
| partially filled | validation shown | "Enter the value in the format …" |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Printable characters | Field | Fill the next free slot; literals are inserted automatically. |
| Backspace | Field | Delete the slot character before the caret, skipping literals. |
| Delete | Field | Delete the slot character after the caret, skipping literals. |
| Ctrl+V / Cmd+V | Field | Paste: matching characters fill slots from the caret. |
| Arrow keys, Home, End | Field | Native caret movement. |

## 14. ARIA contract

- A native `<input type="text">` (textbox role), labelled by its `<label>`.
- `aria-describedby`: the visually hidden format hint first, then help text and error.
- `aria-invalid="true"` while an error is shown; native `required` when required.

## 15. Accessibility notes

- The input's value is the formatted text, so screen readers read what sighted users see.
- The format hint is generated from the mask ("Format: (999) 999-9999. 9 is a digit.") or from `example` or `formatHint` (WCAG 3.3.2). Give custom tokens a `description`.
- Incomplete values get a message that repeats the format (3.3.3). Set `autocomplete` (presets do) for 1.3.5.
- Set `showMaskOnFocus: false` where screen readers reading the placeholder characters is a concern.

## 16. Responsive behavior

The field fills its container.

## 17. RTL behavior

The label and chrome follow the document direction. The value is left to right by default, because phone numbers, IBANs, and codes are read left to right in every locale; use `direction` for letter masks in right-to-left scripts.

## 18. Theme behavior

Colors come from global tokens in all three themes; numerals are tabular so slots line up. Forced colors keep the native input colors with a `Highlight` focus outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { maskedInput: { placeholderChar: '·', showMaskOnFocus: false } } });
```

## 20. Component configuration support

Instance `validationTiming`, `placeholderChar`, `showMaskOnFocus`, and `locale` override configuration; configuration changes re-render existing fields.

## 21. Timezone behavior

Not applicable. The date presets shape digits only and do not know about time zones or the business calendar; use Date Input for dates.

## 22. Icon customization points

`icons.error` (default `alert-circle`) for the validation message.

## 23. Security behavior

The value is written to a native input as text; no HTML is rendered. Custom token patterns are tested against single characters (global and sticky flags are removed).

## 24. Data handling behavior

No persistence, network access, or telemetry. `autocomplete` is `off` unless set.

## 25. Performance characteristics

Each edit re-fits the raw value and reformats it in one pass over the mask.

## 26. Supported data scale

Masks up to 64 slots; pastes of 1,000 characters are reduced to the slots in one pass.

## 27. Usage examples

```ts
import { MaskedInput, MASK_PRESETS } from '@absoluteui/components/masked-input';

const host = document.querySelector<HTMLElement>('#zip');
if (host) MaskedInput.create(host, { label: 'ZIP code', name: 'zip', ...MASK_PRESETS.zipUs4 });
```

More examples, type-checked in CI: `metadata/masked-input/examples.json`.

## 28. Edge cases

- Pasting `+1 (555) 010-0199` into `+1 (999) 999-9999` skips the literal prefix, so the `1` is not taken as a digit.
- Typing a literal character (for example `(`) is ignored; the mask adds literals itself.
- Deleting in the middle moves the following characters up; a character that no longer fits its new slot is dropped.
- `update({ mask })` re-fits the current raw value to the new mask.
- Values for `submit: 'formatted'` stop at the last filled slot, without trailing literals or placeholders.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `MASKED_INPUT_OPTIONS` | configuration | Blank label, empty mask or a mask without tokens, invalid custom tokens, `minLength` outside 1..slots, a non-string value, unknown `submit` or `direction`, a non-function `validate`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration (for example a `placeholderChar` longer than one character). |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Edits go through `beforeinput`, so the browser's undo and redo do not apply.
- One shape per mask; optional trailing slots are expressed with `minLength`.
- IME composition is re-parsed after it commits.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Masks that change with the typed value (for example per-country phone formats).
- Locale-aware numbers, currency, or decimals.

## 32. TypeScript definitions

```ts
interface MaskToken { readonly pattern: RegExp; readonly transform?: (char: string) => string; readonly description?: string }
interface MaskPreset { readonly mask: string; readonly tokens?: Readonly<Record<string, MaskToken>>; readonly minLength?: number; readonly inputMode?: 'numeric' | 'text' | 'tel'; readonly autocomplete?: string; readonly example?: string }
interface MaskedInputConfig { validationTiming: 'blur' | 'input' | 'submit'; placeholderChar: string; showMaskOnFocus: boolean }
interface MaskedInputOptions extends Partial<MaskedInputConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  mask: string;
  tokens?: Readonly<Record<string, MaskToken>>;
  value?: string;
  minLength?: number;
  name?: string;
  submit?: 'raw' | 'formatted';
  placeholder?: string;
  example?: string;
  formatHint?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  inputMode?: 'numeric' | 'text' | 'tel' | 'decimal';
  autocomplete?: string;
  direction?: 'ltr' | 'rtl' | 'auto';
  validate?: (value: string, context: { readonly formattedValue: string; readonly complete: boolean }) => string | null;
  locale?: string;
  icons?: Partial<{ error: IconRef }>;
}
interface MaskedInputValueDetail { value: string; formattedValue: string; complete: boolean; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { MaskedInput, MASK_PRESETS } from '@absoluteui/components/masked-input';
import '@absoluteui/components/masked-input/style.css';

const host = document.querySelector<HTMLElement>('#phone');
if (host) MaskedInput.create(host, { label: 'Phone', name: 'phone', submit: 'formatted', ...MASK_PRESETS.phoneUs });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiMaskedInput } from '@absoluteui/angular/masked-input';

@Component({
  selector: 'app-bank-details',
  imports: [AuiMaskedInput],
  template: `<aui-masked-input label="Sort code" mask="99-99-99" [(value)]="sortCode"></aui-masked-input>`,
})
export class BankDetailsComponent {
  sortCode = '';
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
