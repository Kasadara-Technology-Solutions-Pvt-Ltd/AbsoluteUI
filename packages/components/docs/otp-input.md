# OTP Input

> Package: `@absoluteui/components/otp-input` | Styles: `@absoluteui/components/otp-input/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Entry for one-time passcodes, PINs, MFA codes, and recovery codes. It provides:
- numeric or alphanumeric codes of 1-32 characters, shown in visual cells;
- paste distribution: a pasted code fills every cell, spaces and dashes are dropped;
- `autocomplete="one-time-code"` for SMS and authenticator autofill;
- overwrite typing, Backspace, and arrow-key navigation (native editing);
- masking for PINs, visual grouping for recovery codes, optional upper-casing;
- an `aui-complete` event and the `FormControl` contract.

**Design choice: one input, not N inputs.** One native `<input>` holds the whole code; the cells are `aria-hidden` presentation above it that let pointer events through. N single-character inputs break `one-time-code` autofill and password managers (they fill one field), need focus juggling that loses characters when typing fast, and make screen readers announce N unlabelled boxes. One input keeps paste, undo, selection, and editing native, and is announced once: "Verification code, 6 digits".

## 2. Anatomy

```text
<div class="aui-field aui-otp-input [--focused] [--invalid] [--disabled]">
  <label class="aui-field__label" for="I">Verification code</label>
  <div class="aui-field__description" id="D">help text</div>
  <div class="aui-otp-input__control" dir="ltr">              (--aui-otp-length: 6)
    <input id="I" class="aui-otp-input__input" inputmode="numeric" autocomplete="one-time-code" dir="ltr" aria-describedby="D H E">
    <div class="aui-otp-input__cells" aria-hidden="true">
      <span class="aui-otp-input__cell aui-otp-input__cell--filled">1</span> ... <span class="aui-otp-input__separator">-</span> ...
    </div>
  </div>
  <span class="aui-visually-hidden" id="H">6 digits</span>
  <div class="aui-field__error" id="E">...</div>
</div>
```

## 3. When to use

- SMS, email, or authenticator codes.
- Numeric PINs (`mask: true`).
- Recovery codes (`type: 'alphanumeric'`, `groupSize`).

## 4. When not to use

- Passwords: use Password Input.
- Identifiers of varying length: use Text Input.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLInputElement` | Native input. |
| `value` | `string` | Current code. |
| `complete` | `boolean` | Every cell filled. |
| `validity` | `FieldValidity` | `{ valid, error, message }`. |
| `name`, `label`, `disabled`, `dirty`, `touched` | | Form-control contract. |
| `options` | `Readonly<OtpInputOptions>` | Current options. |

Options (`OtpInputOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `length` | `number` | `6` | No | Characters (1-32). |
| `type` | `'numeric' \| 'alphanumeric'` | `'numeric'` | No | Allowed characters (0-9, or A-Z, a-z, 0-9). |
| `mask` | `boolean` | `false` | No | Dots instead of characters; the input becomes a password input. |
| `uppercase` | `boolean` | `false` | No | Alphanumeric only: upper-case letters. |
| `groupSize` | `number` | - | No | Visual groups (less than `length`). |
| `value` | `string` | `''` | No | Initial code (normalized). |
| `name`, `description` | `string` | - | No | Field name, help text. |
| `required`, `disabled`, `readOnly` | `boolean` | `false` | No | Native states. |
| `autocomplete` | `'one-time-code' \| 'off'` | `'one-time-code'` | No | Autofill hint (`off` for recovery codes). |
| `validate` | `(value) => string \| null` | - | No | Validation of a complete code. |
| `icons` | `Partial<{ error: IconRef }>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages first appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and numbers. |

## 6. Methods

| Method | Description |
|---|---|
| `OtpInput.create(host, options)` | Render into `host` (children are replaced). |
| `getFormValue()` | The code. |
| `setValue(value)` | Set the code (normalized, no events). |
| `clear()` | Empty the code and focus the field (after a rejected code). |
| `update(options)` | Merge and apply options; the current code is re-normalized. |
| `reportValidity()`, `setCustomError(message)`, `focus()`, `reset()` | Form-control contract. |
| `destroy()` | Remove rendering, registration, listeners, and the configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-input` | `{ validity, complete }` | Yes | The user edited the code. |
| `aui-change` | `{ validity, complete }` | Yes | Native change (on blur after editing). |
| `aui-complete` | `{ validity }` | Yes | The code became complete through user input (typing, paste, autofill); once per completion. |

The code is not in event details; read `controller.value`.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-otp-input`, `--focused`, `--invalid`, `--disabled`, `__control` (custom property `--aui-otp-length`), `__input`, `__cells`, `__cell` (`--filled`, `--active`), `__separator`.

## 10. Design tokens

See `metadata/otp-input/tokens.json`. Key tokens: `control-height-lg`, `font-family-mono`, `font-size-lg`, `color-border-strong`, `color-focus-ring`, `color-error-fg`.

## 11. States

empty, partially filled, complete, focused (active cell), masked, disabled, read-only, required, invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty / partial | allowed character typed | next cell filled; the active cell moves |
| partial | last cell filled (typing, paste, autofill) | complete; `aui-complete` |
| complete | character typed with the caret inside | the next character is overwritten; stays complete (no new `aui-complete`) |
| complete | Backspace | partial; the next completion emits `aui-complete` again |
| any | paste of a full code | value replaced (separators dropped) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits / letters | Input | Enter a character (others are ignored); overwrites in a full code. |
| Backspace / Delete | Input | Native deletion. |
| ArrowLeft / ArrowRight / Home / End | Input | Native caret movement; the active cell follows. |
| Ctrl/Cmd+V | Input | Paste; a full code replaces the value. |
| Tab / Shift+Tab | Any | One tab stop for the whole code. |

## 14. ARIA contract

- One native input named by `<label for>`; it is a textbox (or a protected text field when masked).
- `aria-describedby`: help text, the length hint ("6 digits" / "8 letters or digits"), then the visible error.
- `aria-invalid="true"` only while an error is shown.
- The cells are `aria-hidden="true"`.

## 15. Accessibility notes

- `inputmode="numeric"` shows a numeric keypad for numeric codes.
- WCAG 3.3.8: paste and autofill work, so users do not transcribe codes character by character.
- If you submit on `aui-complete`, keep a visible submit button and show errors in the field so a mistyped code can be corrected.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Cells share the available width (up to 3rem each); 6 cells fit a 320 CSS px viewport. The input font size is at least 16 px so mobile browsers do not zoom.

## 17. RTL behavior

Codes are left-to-right in every locale: the input and cells use `dir="ltr"`. The label and messages follow the page direction.

## 18. Theme behavior

Cells use the control surface tokens; the active cell uses `color-focus-ring`; invalid cells `color-error-fg`. Forced-colors mode: `CanvasText` borders, `Highlight` outline on the active cell.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { otpInput: { validationTiming: 'submit' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`).

## 23. Security behavior

- Characters are filtered to the allowed set after NFKC normalization and rendered with `textContent`.
- Events never include the code; the component never logs.
- `mask` shows dots and switches the input to `type="password"`.
- Rate limiting, expiry, and verification of codes belong to your server; AbsoluteUI is not an authentication provider.

## 24. Data handling behavior

The code lives only in the native input. No persistence, logging, network access, or telemetry.

## 25. Performance characteristics

One input plus N spans; editing updates text of the cells only. Budget: `OtpInput.create` < 1 ms per instance (1,000 instances, e2e performance suite).

## 26. Supported data scale

Codes of 1-32 characters.

## 27. Usage examples

```ts
import { OtpInput } from '@absoluteui/components/otp-input';

const host = document.createElement('div');
document.body.append(host);
const otp = OtpInput.create(host, { label: 'Verification code', name: 'code', required: true });
otp.host.addEventListener('aui-complete', () => {
  otp.host.closest('form')?.requestSubmit();
});
```

More examples, type-checked in CI: `metadata/otp-input/examples.json`.

## 28. Edge cases

- Full-width digits (１２３) are accepted (NFKC).
- Pasting "123 456" or "123-456" fills all cells; pasting a partial code inserts at the caret.
- `setValue()` drops disallowed characters and truncates to `length`.
- Changing `length` or `type` re-normalizes the current code.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `OTP_INPUT_OPTIONS` | configuration | Missing label, `length` outside 1-32, `groupSize` not less than `length`, `uppercase` without alphanumeric, invalid autocomplete. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Validity error codes: `value-missing` ("Enter the code."), `too-short` ("Enter all 6 digits."), `custom`.

## 30. Known limitations

- ASCII letters and digits only.
- Pointer-drag selection is not mirrored cell by cell.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- N separate inputs (deliberately not offered).
- Custom character sets.

## 32. TypeScript definitions

```ts
type OtpInputType = 'numeric' | 'alphanumeric';
interface OtpInputConfig { validationTiming: ValidationTiming }
interface OtpInputOptions extends Partial<OtpInputConfig> {
  label: string; hideLabel?: boolean; length?: number; type?: OtpInputType; mask?: boolean; uppercase?: boolean;
  groupSize?: number; value?: string; name?: string; description?: string;
  required?: boolean; disabled?: boolean; readOnly?: boolean; autocomplete?: 'one-time-code' | 'off';
  validate?: (value: string) => string | null; locale?: string; icons?: Partial<OtpInputIcons>;
}
interface OtpInputValueDetail { validity: FieldValidity; complete: boolean }
interface OtpInputCompleteDetail { validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { OtpInput } from '@absoluteui/components/otp-input';
import '@absoluteui/components/otp-input/style.css';

const host = document.querySelector<HTMLElement>('#pin');
if (host) OtpInput.create(host, { label: 'PIN', length: 4, mask: true, autocomplete: 'off' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiOtpInput } from '@absoluteui/angular/otp-input';

@Component({
  selector: 'app-verify',
  imports: [ReactiveFormsModule, AuiOtpInput],
  template: `<aui-otp-input label="Verification code" [required]="true" [formControl]="code" (completed)="verify()"></aui-otp-input>`,
})
export class VerifyComponent {
  readonly code = new FormControl('', { nonNullable: true });
  verify(): void {
    // Send this.code.value to your server.
  }
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiOtpInput } from '@absoluteui/react/otp-input';

export function Example() {
  const [value, setValue] = useState<string>('');
  return <AuiOtpInput label="Verification code" length={6} value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiOtpInput } from '@absoluteui/vue/otp-input';
const value = ref<string>('');
</script>

<template>
  <AuiOtpInput v-model="value" label="Verification code" :length="6" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
