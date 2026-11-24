# Password Input

> Package: `@absoluteui/components/password-input` | Styles: `@absoluteui/components/password-input/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

A password field built on a native password `<input>`. It provides:
- label, help text, required indicator, and localized validation (length, pattern, custom);
- a show/hide toggle button (`aria-pressed`, constant name "Show password");
- `autocomplete` for password managers: `current-password` (default) or `new-password`;
- an optional Caps Lock warning;
- a clipboard policy (paste is allowed by default);
- the `FormControl` contract.

The value never appears in events, messages, or announcements. **This is an input, not an authentication provider**: AbsoluteUI does not handle credentials, hashing, policy, or sessions.

## 2. Anatomy

```text
<div class="aui-field aui-password-input [--invalid] [--disabled]">
  <label class="aui-field__label" for="I">Password<span aria-hidden="true">*</span></label>
  <div class="aui-password-input__control">
    <input id="I" class="aui-password-input__input" type="password" autocomplete="current-password"
           spellcheck="false" autocapitalize="none" aria-describedby="D E C M">
    <button type="button" class="aui-password-input__reveal" aria-label="Show password" aria-pressed="false" aria-controls="I">
      <svg aria-hidden="true"/>
    </button>
  </div>
  <div class="aui-field__description" id="D">help text</div>
  <div class="aui-password-input__caps" id="C" hidden><svg aria-hidden="true"/><span>Caps Lock is on.</span></div>
  <div class="aui-field__error" id="E">...</div>
</div>
(M = ids passed in describedBy, e.g. a Password Strength Meter)
```

## 3. When to use

- Sign-in, sign-up, and change-password forms.
- Any secret the user types and may want to check visually.

## 4. When not to use

- One-time codes and PINs: use OTP Input.
- Non-secret text: use Text Input.
- As a replacement for server-side password policy or authentication.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLInputElement` | Native input. |
| `value` | `string` | Current value. |
| `validity` | `FieldValidity` | `{ valid, error, message }`. |
| `revealed` | `boolean` | Password shown as text. |
| `name`, `label`, `disabled`, `dirty`, `touched` | | Form-control contract. |
| `options` | `Readonly<PasswordInputOptions>` | Current options. |

Options (`PasswordInputOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `value` | `string` | `''` | No | Initial value. |
| `name` | `string` | - | No | Field name. |
| `description` | `string` | - | No | Help text. |
| `required`, `disabled`, `readOnly` | `boolean` | `false` | No | Native states. |
| `minLength`, `maxLength` | `number` | - | No | Validated in code points (not truncated). |
| `pattern` | `string` | - | No | HTML pattern semantics. |
| `autocomplete` | `'current-password' \| 'new-password' \| 'off'` | `'current-password'` | No | Password-manager hint. |
| `revealable` | `boolean` | `true` | No | Show the toggle. |
| `clipboard` | `'allow' \| 'block-copy' \| 'block-all'` | `'allow'` | No | Clipboard policy. |
| `describedBy` | `readonly string[]` | - | No | Extra `aria-describedby` ids. |
| `validate` | `(value) => string \| null` | - | No | Consumer validation (message must not contain the value). |
| `icons` | `Partial<PasswordInputIcons>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages first appear. |
| `capsLockWarning` | `boolean` | `true` | Yes | Caps Lock warning. |
| `locale` | `string` | common `locale` | Yes (inherited) | Message locale. |

## 6. Methods

| Method | Description |
|---|---|
| `PasswordInput.create(host, options)` | Render into `host` (children are replaced). |
| `getFormValue()` | The value. |
| `setValue(value)` | Set the value (no events). |
| `setRevealed(revealed)` | Show or mask (no-op when not revealable). |
| `update(options)` | Merge and apply options. |
| `reportValidity()`, `setCustomError(message)`, `focus()`, `reset()` | Form-control contract (`reset()` also masks the password). |
| `destroy()` | Remove rendering, registration, listeners, and the configuration subscription. |

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-input` | `{ validity }` | Yes | The user edited the value. |
| `aui-change` | `{ validity }` | Yes | The user committed the value (native change). |
| `aui-caps-lock` | `{ on }` | No | The Caps Lock warning appeared or disappeared. |

The value is deliberately not in any event detail; read `controller.value` when you need it.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-password-input`, `--invalid`, `--disabled`, `__control`, `__input`, `__reveal`, `__caps`, plus the shared `aui-field__*` chrome.

## 10. Design tokens

See `metadata/password-input/tokens.json`. Same control tokens as Text Input, plus `color-warning-fg` for the Caps Lock warning.

## 11. States

default, focus-visible, filled, revealed, caps lock on, disabled, read-only, required, invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| masked | toggle (click, Enter, Space) or `setRevealed(true)` | revealed (`type="text"`, `aria-pressed="true"`, announced "Password shown") |
| revealed | toggle, `setRevealed(false)`, or `reset()` | masked (announced "Password hidden" when toggled) |
| any | key or mouse event with Caps Lock on | warning shown, described, announced once |
| warning | Caps Lock off or blur | warning hidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Input, then the toggle. |
| Enter / Space | Toggle | Shows or hides; focus stays on the toggle. |
| Editing keys | Input | Native editing. |

## 14. ARIA contract

- Password inputs have no ARIA role; the native field is exposed as a protected text field named by `<label for>`.
- `aria-describedby`: help text, visible error, Caps Lock warning (while shown), then `describedBy` ids.
- `aria-invalid="true"` only while an error is shown.
- Toggle: native button, `aria-label="Show password"` (constant), `aria-pressed` carries the state, `aria-controls` points to the input. Changing the name as well as `aria-pressed` would read as a contradiction ("Hide password, pressed").

## 15. Accessibility notes

- WCAG 3.3.8 Accessible Authentication: paste and password managers work by default; do not block paste.
- Visibility changes and Caps Lock are announced politely.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Full width of its container; the toggle stays a square at the inline end.

## 17. RTL behavior

Logical properties: the toggle sits at the inline end in both directions.

## 18. Theme behavior

Control surface, border, focus, and error tokens as Text Input; Caps Lock warning in `color-warning-fg` with an icon. Forced-colors mode: `Highlight` outline on focus.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { passwordInput: { capsLockWarning: false, validationTiming: 'submit' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.reveal` (default `eye`), `icons.conceal` (`eye-off`), `icons.capsLock` (`alert-triangle`), `icons.error` (`alert-circle`).

## 23. Security behavior

- The value never appears in events, validation messages, or announcements; the component never logs.
- `spellcheck` is off (spelling services may send text off-device), `autocapitalize` is `none`.
- The clipboard policy is a deterrent, not a security boundary; blocking paste harms security (it discourages password managers).
- Edge's built-in reveal control is hidden (`::-ms-reveal`) to avoid a second toggle.
- Revealing is the user's choice and shows the password on screen.
- AbsoluteUI is not an authentication provider: transport the value over HTTPS, and let the server hash and enforce policy.

## 24. Data handling behavior

The value lives only in the native input (for native form submission when `name` is set) and is returned by `getFormValue()`. No persistence, logging, network access, or telemetry.

## 25. Performance characteristics

Same structure as Text Input. Budget: `PasswordInput.create` < 1 ms per instance (1,000 instances, e2e performance suite).

## 26. Supported data scale

One value per field; tested with 1,000 fields on a page.

## 27. Usage examples

```ts
import { PasswordInput } from '@absoluteui/components/password-input';

const host = document.createElement('div');
document.body.append(host);
PasswordInput.create(host, { label: 'Password', name: 'password', required: true });
```

More examples, type-checked in CI: `metadata/password-input/examples.json`.

## 28. Edge cases

- Caps Lock state is known only after a key or mouse event in the field.
- Revealed passwords are masked again by `reset()` and whenever `revealable` becomes `false`.
- Removing the focused toggle (`update({ revealable: false })`) is safe (regression covered).
- `maxLength` is validated, not truncated, so long pasted values are reported instead of silently cut.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PASSWORD_INPUT_OPTIONS` | configuration | Missing label, invalid lengths, autocomplete, clipboard policy, or `describedBy` ids. |
| `FIELD_PATTERN` | configuration | Invalid `pattern`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- Caps Lock detection depends on `getModifierState`.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML in the label, help text, or messages.
- Remembering passwords (password managers do this).

## 32. TypeScript definitions

```ts
type PasswordAutocomplete = 'current-password' | 'new-password' | 'off';
type PasswordClipboardPolicy = 'allow' | 'block-copy' | 'block-all';
interface PasswordInputConfig { validationTiming: ValidationTiming; capsLockWarning: boolean }
interface PasswordInputOptions extends Partial<PasswordInputConfig> {
  label: string; hideLabel?: boolean; value?: string; name?: string; description?: string;
  required?: boolean; disabled?: boolean; readOnly?: boolean; minLength?: number; maxLength?: number; pattern?: string;
  autocomplete?: PasswordAutocomplete; revealable?: boolean; clipboard?: PasswordClipboardPolicy;
  describedBy?: readonly string[]; validate?: (value: string) => string | null; locale?: string; icons?: Partial<PasswordInputIcons>;
}
interface PasswordInputValueDetail { validity: FieldValidity }
interface PasswordInputCapsLockDetail { on: boolean }
```

## 33. Vanilla JS example

```ts
import { PasswordInput } from '@absoluteui/components/password-input';
import '@absoluteui/components/password-input/style.css';

const host = document.querySelector<HTMLElement>('#new-password');
if (host) {
  PasswordInput.create(host, {
    label: 'New password',
    name: 'newPassword',
    autocomplete: 'new-password',
    minLength: 12,
    description: 'Use 12 or more characters.',
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiPasswordInput } from '@absoluteui/angular/password-input';

@Component({
  selector: 'app-sign-in',
  imports: [ReactiveFormsModule, AuiPasswordInput],
  template: `<aui-password-input label="Password" [required]="true" [formControl]="password"></aui-password-input>`,
})
export class SignInComponent {
  readonly password = new FormControl('', { nonNullable: true });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiPasswordInput } from '@absoluteui/react/password-input';

export function Example() {
  const [value, setValue] = useState<string>('');
  return <AuiPasswordInput label="New password" autocomplete="new-password" required value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiPasswordInput } from '@absoluteui/vue/password-input';
const value = ref<string>('');
</script>

<template>
  <AuiPasswordInput v-model="value" label="New password" autocomplete="new-password" required />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
