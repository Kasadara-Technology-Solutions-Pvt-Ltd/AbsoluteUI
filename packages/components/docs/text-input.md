# Text Input

> Package: `@absoluteui/components/text-input` | Styles: `@absoluteui/components/text-input/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Single-line text entry. `TextInput` renders a native `<input>` with its field chrome: label, required indicator, help text, validation message, optional character counter, and text addons. Validation runs in the shared validation engine, so messages are localized and identical in every browser. For passwords it adds a reveal toggle and a clipboard policy (SPEC section 14.3).

## 2. Anatomy

```text
<div class="aui-field aui-text-input" data-aui-control>      (consumer host)
  <label class="aui-field__label" for=input>Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-text-input__control">
    <span class="aui-text-input__addon aui-text-input__prefix">   (optional)
    <input class="aui-text-input__input">
    <span class="aui-text-input__addon aui-text-input__suffix">   (optional)
    <button class="aui-text-input__reveal" aria-pressed>        (password only)
  </div>
  <div class="aui-field__description">                         (optional)
  <div class="aui-field__counter">                             (showCounter)
  <div class="aui-field__error aui-validation-message">        (when shown)
</div>
```

## 3. When to use

- Short free-text values: names, email addresses, URLs, phone numbers, passwords, search terms.
- Fields that need consistent, localized validation messages.
- Values with a fixed prefix or suffix, such as a URL scheme or a unit.

## 4. When not to use

- Multi-line text: use Textarea.
- Numbers that need stepping or locale-aware parsing: use Number Input.
- Choosing from a known list: use Select, Combobox, or Radio Group.
- Dates and times: use Date Input or Date Picker.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `input` | `HTMLInputElement` | The native input. |
| `value` | `string` | Current value. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Value differs from the initial value. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<TextInputOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `type`, `value`, `name`, `placeholder`, `description`, `required`, `disabled`, `readOnly`, `minLength`, `maxLength`, `pattern`, `showCounter`, `autocomplete`, `inputMode`, `spellcheck`, `prefix`, `suffix`, `revealable`, `clipboard`, `validate`, and `icons`. Full table: `metadata/text-input/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `TextInput.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. |
| `update(options)` | Merge and apply options. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user edits. `null` clears it. |
| `getFormValue()` | Value for form serialization. |
| `focus()` | Focus the input. |
| `reset()` | Restore the initial value; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-input` | `{ value, validity }` | Yes | The user edited the value. |
| `aui-change` | `{ value, validity }` | Yes | The user committed the value (native `change`). |

Programmatic changes (`setValue`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. Label, help text, and addons are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-text-input` | Host. |
| `aui-text-input--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__counter`, `__error` | Shared field chrome. |
| `aui-text-input__control` | Control boundary; shows the focus indicator. |
| `aui-text-input__input` | Native input. |
| `aui-text-input__addon`, `__prefix`, `__suffix` | Text addons. |
| `aui-text-input__reveal` | Password reveal toggle. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/text-input/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-error-fg`, `color-surface-sunken`, `color-text-muted`, `control-height-md`, `control-padding-x`, `radius-md`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-text-input-radius` (text input corner radius; falls back to `radius-md`), `--aui-text-input-bg` (text input background; falls back to `color-surface`), `--aui-text-input-border-color` (text input boundary; falls back to `color-border-strong`), `--aui-text-input-padding-x` (text input inline padding; falls back to `control-padding-x`), `--aui-text-input-height` (text input height; falls back to `control-height-md`).

## 11. States

default, focus-visible, filled, disabled, read-only, required, invalid (message shown), over limit, password revealed.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| pristine | user types | dirty; message shown only with `validationTiming: 'input'` |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| any | `reset()` | initial value; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves focus to and from the input, then the reveal button when present. |
| Enter / Space | Reveal button focused | Toggles password visibility. |
| Editing keys | Input focused | Native text editing. |

## 14. ARIA contract

- Native `<label for>` names the input.
- `aria-describedby`: help text, counter, and the visible error message, then addons.
- `aria-invalid="true"` only while an error message is shown.
- Reveal toggle: `aria-pressed`, a constant name ("Show password"), and `aria-controls` pointing at the input.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; the native `required` attribute conveys the state.
- Errors appear after the first blur by default (SPEC section 16.1), then update live.
- The counter is announced through a polite live region only near or over the limit, 750 ms after typing stops.
- Password visibility changes are announced.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Full width of its container. Addons do not wrap; the input shrinks. Density tokens change the control height.

## 17. RTL behavior

Logical properties throughout. The prefix is at the inline start and the suffix at the inline end.

## 18. Theme behavior

Colors come from role tokens only. Verified in the light, dark, and high-contrast themes. In forced-colors mode, focus draws a `Highlight` outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { textInput: { validationTiming: 'input' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`), `icons.reveal` (default `eye`), and `icons.conceal` (default `eye-off`).

## 23. Security behavior

All text uses `textContent`. Validation messages never include the entered value (SPEC section 14.4). Password inputs default to `autocomplete="current-password"` with spellcheck off. `clipboard: 'block-copy'` blocks copy and cut; `'block-all'` also blocks paste. CSP-safe; verified under a strict CSP with Trusted Types enforced.

## 24. Data handling behavior

No persistence, network access, or telemetry. The native input carries the value for form submission when `name` is set.

## 25. Performance characteristics

Five listeners per instance (input, change, focusout, and clipboard) and one configuration subscription. Budget: under 1 ms average per `TextInput.create` across 1,000 instances.

## 26. Supported data scale

1,000 inputs per page in the performance test. Values of any length; counters count code points.

## 27. Usage examples

```ts
import { TextInput } from '@absoluteui/components/text-input';

const host = document.createElement('div');
document.body.append(host);
TextInput.create(host, { label: 'Email', type: 'email', name: 'email', required: true, autocomplete: 'email' });
```

More examples, type-checked in CI: `metadata/text-input/examples.json`.

## 28. Edge cases

- Pasting text longer than `maxLength` keeps the text and shows the over-limit count and message.
- `'😀😀'` has length 2 (code points), matching what users see.
- An invalid `pattern` throws `FIELD_PATTERN` at construction.
- `type: 'url'` requires a scheme: `example.com` is invalid and `https://example.com` is valid.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TEXT_INPUT_OPTIONS` | configuration | Missing label, invalid type or lengths, or `showCounter` without `maxLength`. |
| `FIELD_PATTERN` | configuration | `pattern` is not a valid regular expression. |
| Validation (`validity.error`) | validation | `value-missing`, `type-mismatch`, `too-short`, `too-long`, `pattern-mismatch`, `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- `maxLength` is validated, not truncated.
- Grapheme clusters such as flag emoji count as more than one character.
- The clipboard policy is a deterrent, not a security boundary.
- No input masking.
- Screen-reader behavior of the counter and reveal toggle has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in the label, help text, addons, or messages.
- Native `maxlength` truncation.

## 32. TypeScript definitions

```ts
type TextInputType = 'text' | 'email' | 'url' | 'tel' | 'password' | 'search';
type ClipboardPolicy = 'allow' | 'block-copy' | 'block-all';
type ValidationTiming = 'blur' | 'input' | 'submit';
interface FieldValidity { readonly valid: boolean; readonly error: ValidationErrorCode | null; readonly message: string }
interface TextInputValueDetail { value: string; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { TextInput } from '@absoluteui/components/text-input';
import '@absoluteui/components/text-input/style.css';

const host = document.querySelector<HTMLElement>('#username');
if (host) {
  const username = TextInput.create(host, { label: 'Username', name: 'username', required: true, maxLength: 20, showCounter: true });
  host.addEventListener('aui-change', () => {
    if (!username.validity.valid) username.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiTextInput } from '@absoluteui/angular/text-input';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, AuiTextInput],
  template: `<aui-text-input label="Email" type="email" [required]="true" [formControl]="email"></aui-text-input>`,
})
export class ProfileComponent {
  readonly email = new FormControl('', { nonNullable: true, validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
