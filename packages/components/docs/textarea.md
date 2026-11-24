# Textarea

> Package: `@absoluteui/components/textarea` | Styles: `@absoluteui/components/textarea/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Multi-line text entry. `Textarea` renders a native `<textarea>` with the same field chrome and constraint set as Text Input: label, required indicator, help text, validation message, and optional character counter. Validation runs in the shared validation engine, so messages are localized and identical in every browser. `resize: 'auto'` grows the control with its content.

## 2. Anatomy

```text
<div class="aui-field aui-textarea" data-aui-control>          (consumer host)
  <label class="aui-field__label" for=textarea>Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <textarea class="aui-textarea__input" rows>
  <div class="aui-field__description">                         (optional)
  <div class="aui-field__counter">                             (showCounter)
  <div class="aui-field__error aui-validation-message">        (when shown)
</div>
```

## 3. When to use

- Free text that may span several lines: comments, descriptions, messages, addresses.
- Long-form values with a length limit users should see while typing.
- Fields that need consistent, localized validation messages.

## 4. When not to use

- Single-line values such as names or email addresses: use Text Input.
- Formatted rich text: use Rich Text Editor.
- Numbers: use Number Input.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `textarea` | `HTMLTextAreaElement` | The native textarea. |
| `value` | `string` | Current value. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Value differs from the initial value. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<TextareaOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `value`, `name`, `placeholder`, `description`, `required`, `disabled`, `readOnly`, `minLength`, `maxLength`, `showCounter`, `rows` (default 3, integer 1..100), `resize` (`'none' | 'vertical' | 'auto'`, default `'vertical'`), `maxRows` (resize `'auto'` only), `autocomplete`, `spellcheck`, `validate`, and `icons`. Full table: `metadata/textarea/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `Textarea.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. |
| `update(options)` | Merge and apply options. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user edits. `null` clears it. |
| `getFormValue()` | Value for form serialization. |
| `focus()` | Focus the textarea. |
| `reset()` | Restore the initial value; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-input` | `{ value, validity }` | Yes | The user edited the value. |
| `aui-change` | `{ value, validity }` | Yes | The user committed the value (native `change`, on blur). |

Programmatic changes (`setValue`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. Label and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-textarea` | Host. |
| `aui-textarea--invalid`, `--disabled` | Host state modifiers. |
| `aui-textarea--resize-none`, `--auto`, `--auto-native` | Host sizing modifiers (`--auto-native`: `field-sizing: content` is in use). |
| `aui-field__label`, `__required`, `__description`, `__counter`, `__error` | Shared field chrome. |
| `aui-textarea__input` | Native textarea; also the control boundary and focus indicator. |

Custom properties set on the textarea: `--aui-textarea-rows` and `--aui-textarea-max-rows` (auto-grow bounds). All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/textarea/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-error-fg`, `color-surface-sunken`, `color-disabled-bg`, `control-padding-x`, `space-2`, `radius-md`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-textarea-radius` (textarea corner radius; falls back to `radius-md`), `--aui-textarea-bg` (textarea background; falls back to `color-surface`), `--aui-textarea-border-color` (textarea boundary; falls back to `color-border-strong`), `--aui-textarea-padding-x` (textarea inline padding; falls back to `control-padding-x`).

## 11. States

default, focus-visible, filled, disabled, read-only, required, invalid (message shown), over limit, auto-grow.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| pristine | user types | dirty; message shown only with `validationTiming: 'input'` |
| any | focus leaves the host | touched; messages shown (`blur` timing), after the pointer is released if focus left by a click |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| auto-grow | user types or the value is set | height follows content between `rows` and `maxRows` |
| any | `reset()` | initial value; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves focus to and from the textarea. |
| Enter | Textarea focused | Inserts a line break (native). |
| Editing keys | Textarea focused | Native text editing. |

## 14. ARIA contract

- Native `<label for>` names the textarea (native multi-line textbox).
- `aria-describedby`: help text, counter, and the visible error message.
- `aria-invalid="true"` only while an error message is shown.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; the native `required` attribute conveys the state.
- Errors appear after the first blur by default (SPEC section 16.1), then update live.
- The counter is announced through a polite live region only near or over the limit, 750 ms after typing stops.
- Auto-grow keeps the whole value visible up to `maxRows`, so users can review what they wrote without scrolling.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Full width of its container. Height follows `rows`. With `resize: 'vertical'` users can drag the height; with `'auto'` the control grows between `rows` and `maxRows` and then scrolls. Density tokens change font size and padding; the row bounds use `lh` units so they follow them.

## 17. RTL behavior

Logical properties throughout. The native resize handle follows the writing direction.

## 18. Theme behavior

Colors come from role tokens only (light, dark, and high-contrast themes). In forced-colors mode, focus draws a `Highlight` outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { textarea: { validationTiming: 'input' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent`. Validation messages never include the entered value (SPEC section 14.4). Auto-grow sizing is written through the CSSOM (`style.setProperty`), never through a style attribute. CSP-safe (no inline styles or HTML sinks).

## 24. Data handling behavior

No persistence, network access, or telemetry. The native textarea carries the value for form submission when `name` is set.

## 25. Performance characteristics

Three listeners per instance (input, change, focusout) and one configuration subscription. With native `field-sizing` there is no layout work in script; the fallback performs one layout read (`scrollHeight`) per input event. Budget: under 1 ms average per `Textarea.create` across 1,000 instances.

## 26. Supported data scale

1,000 textareas per page is the performance target. Values of any length; counters count code points.

## 27. Usage examples

```ts
import { Textarea } from '@absoluteui/components/textarea';

const host = document.createElement('div');
document.body.append(host);
Textarea.create(host, { label: 'Message', rows: 2, resize: 'auto', maxRows: 8, maxLength: 500, showCounter: true });
```

More examples, type-checked in CI: `metadata/textarea/examples.json`.

## 28. Edge cases

- Pasting text longer than `maxLength` keeps the text and shows the over-limit count and message.
- A line break counts as one character.
- `maxRows` without `resize: 'auto'`, or smaller than `rows`, throws `TEXTAREA_OPTIONS`.
- Auto-grow on a textarea that is not connected (or is hidden) is measured on the next input event.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TEXTAREA_OPTIONS` | configuration | Missing label; invalid lengths, `rows`, `resize`, or `maxRows`; or `showCounter` without `maxLength`. |
| Validation (`validity.error`) | validation | `value-missing`, `too-short`, `too-long`, `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- `maxLength` is validated, not truncated.
- Grapheme clusters such as flag emoji count as more than one character.
- Without native `field-sizing` support, a container resize that rewraps text is applied on the next edit.
- Only vertical resizing is offered.
- Screen-reader behavior of the counter has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in the label, help text, or messages.
- Rich text, mentions, or syntax highlighting.
- Native `maxlength` truncation.

## 32. TypeScript definitions

```ts
type TextareaResize = 'none' | 'vertical' | 'auto';
type ValidationTiming = 'blur' | 'input' | 'submit';
interface FieldValidity { readonly valid: boolean; readonly error: ValidationErrorCode | null; readonly message: string }
interface TextareaValueDetail { value: string; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { Textarea } from '@absoluteui/components/textarea';
import '@absoluteui/components/textarea/style.css';

const host = document.querySelector<HTMLElement>('#feedback');
if (host) {
  const feedback = Textarea.create(host, { label: 'Feedback', name: 'feedback', required: true, maxLength: 1000, showCounter: true, resize: 'auto', maxRows: 10 });
  host.addEventListener('aui-change', () => {
    if (!feedback.validity.valid) feedback.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiTextarea } from '@absoluteui/angular/textarea';

@Component({
  selector: 'app-feedback',
  imports: [ReactiveFormsModule, AuiTextarea],
  template: `<aui-textarea label="Feedback" [rows]="4" resize="auto" [maxRows]="10" [maxLength]="1000" [showCounter]="true" [formControl]="feedback"></aui-textarea>`,
})
export class FeedbackComponent {
  readonly feedback = new FormControl('', { nonNullable: true, validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
