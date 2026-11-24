# Form Field

> Package: `@absoluteui/components/form-field` | Styles: `@absoluteui/components/form-field/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Field chrome and validation for a consumer-owned native `<input>`, `<textarea>`, or `<select>` (SPEC section 18.8). `FormField` adds the label, required indicator, help text, and validation message, maps the browser's `ValidityState` to AbsoluteUI's localized messages, applies the shared message timing, and registers the field with Form. The control element stays yours: it is not cloned or re-created, and only its ARIA wiring and the surrounding chrome are managed.

## 2. Anatomy

```text
<div class="aui-field aui-form-field" data-aui-control>          (consumer host; children replaced)
  <label class="aui-field__label" for=control>Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <input|textarea|select class="aui-form-field__control">        (consumer's element, moved into the host)
  <div class="aui-field__description">                          (optional)
  <div class="aui-field__error aui-validation-message">         (when shown)
</div>
```

## 3. When to use

- Native controls AbsoluteUI does not render itself: `type="number"`, text-like input types, a native `<select>` or `<select multiple>`, or a `<textarea>` with native attributes.
- Progressive enhancement of server-rendered inputs that must keep their element and attributes.
- Making a plain native element take part in Form validation and the error summary.

## 4. When not to use

- Text entry with counters, addons, or password reveal: use Text Input or Textarea.
- Checkboxes, radios, and switches: use Checkbox, Radio Group, or Switch (Form Field rejects them).
- Dates and times: use Date Input, Date Picker, or Time Picker (date, time, datetime-local, month, and week inputs are rejected).
- Range sliders and color pickers: `range` and `color` inputs are rejected.
- File uploads: use File Upload.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are replaced by the chrome and the control. |
| `control` | `FormFieldControl` | The wrapped native control. |
| `value` | `string \| string[]` | Current value; `string[]` for `<select multiple>`. |
| `name` | `string \| null` | The control's `name`, or `null` when empty. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | The control's `disabled` property. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on each render. |
| `dirty` | `boolean` | Value differs from the value at creation. |
| `touched` | `boolean` | Focus has left the control at least once. |

Options: `label` (required), `control` (required, init-only), `hideLabel`, `description`, `required`, `validate`, and `icons`. Constraints come from the control's native attributes (`required`, `minlength`, `maxlength`, `pattern`, `type`, `min`, `max`, `step`) and from `setCustomValidity()`. Full table: `metadata/form-field/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `FormField.create(host, options)` | Wrap `options.control` in `host` (children are replaced). Throws on invalid options before rendering. |
| `refresh()` | Re-read native constraints, `setCustomValidity()` state, and the value after changing them in code. |
| `update(options)` | Merge and apply options (`control` cannot change). |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user types. `null` or `''` clears it. |
| `getFormValue()` | Value for form serialization. |
| `focus()` | Focus the control. |
| `reset()` | Restore the value (or selected options) captured at creation; clear dirty, touched, submitted, and custom-error state. |
| `destroy()` | Remove the chrome, listeners, registration, and subscription. The control stays in the host. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-input` | `{ value, validity }` | Yes | Native `input` on the control. |
| `aui-change` | `{ value, validity }` | Yes | Native `change` on the control. |

Events are emitted on the host. Programmatic changes (`control.value = ...`, `refresh`, `update`, `reset`) emit nothing.

## 8. Slots/content areas

One content area: the consumer's native control, placed between the label and the help text.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-form-field` | Host. |
| `aui-form-field--invalid` | Host modifier while a message is shown. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-form-field__control` | Added to the native control: AbsoluteUI control surface and states. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/form-field/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-error-fg`, `color-disabled-bg`, `control-height-md`, `control-padding-x`, `radius-md`.

## 11. States

default, focus-visible, filled, disabled, read-only, required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| pristine | user edits | dirty; message shown only with `validationTiming: 'input'` |
| any | control blurs | touched; messages shown (`blur` timing), deferred until pointer release when a pointer caused the blur |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user types | custom error cleared, validity recomputed |
| any | `reset()` | value at creation; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves focus to and from the control. |
| Native keys | Control focused | Native behavior: editing, arrow stepping for number, the `<select>` picker. |

## 14. ARIA contract

- Native `<label for>` names the control (an id is generated if it has none).
- `aria-describedby`: help text and the visible error, followed by ids the consumer set before creation (restored on `destroy()`).
- `aria-invalid="true"` only while an error message is shown.
- The `required` option sets the native `required` property.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; the native `required` attribute conveys the state.
- Native validation bubbles are suppressed (the `invalid` event is prevented), so only the AbsoluteUI message is shown and read.
- Errors appear after the first blur by default (SPEC section 16.1). When the blur was caused by pressing a pointer elsewhere, the message renders after the pointer is released so a click on Submit is not displaced.
- Missing values on a `<select>` use "Select an option."; text-like controls use "This field is required."
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The control fills its container (`inline-size: 100%`, `min-inline-size: 0`). Textareas resize vertically. Density tokens change the control height.

## 17. RTL behavior

Follows the document direction; the chrome uses logical properties.

## 18. Theme behavior

Role tokens through the shared `control-surface` and `text-control-states` mixins; a `<select>` keeps its native picker and only the closed control is styled. In forced-colors mode, focus draws a `Highlight` outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { formField: { validationTiming: 'input' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options except `control` are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent`. Validation messages never include the entered value (SPEC section 14.4), only constraint parameters. The consumer's element is not cloned, so its listeners and attributes survive. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. The native control carries its own value for form submission.

## 25. Performance characteristics

Four listeners on the control (input, change, blur, invalid) and one configuration subscription. Each event re-renders the chrome once. No dedicated performance budget.

## 26. Supported data scale

One control per field. Unit tests cover each supported element type; large forms are expected to scale linearly.

## 27. Usage examples

```ts
import { FormField } from '@absoluteui/components/form-field';

const control = document.createElement('input');
control.name = 'zip';
control.pattern = '[0-9]{5}';
const host = document.createElement('div');
document.body.append(host);
FormField.create(host, { label: 'ZIP code', control, required: true, description: 'Five digits' });
```

More examples, type-checked in CI: `metadata/form-field/examples.json`.

## 28. Edge cases

- Native `minlength`/`maxlength` apply only after user edits in browsers; Form Field also enforces them for programmatic values (counted in code points).
- `<select multiple>` values are `string[]`; `dirty` compares the selected values with those at creation.
- `required` omitted keeps the control's own attribute; `required: false` removes it.
- `destroy()` leaves the generated id and the `required` value on the control.
- Numeric `min`, `max`, and `step` are read from the attributes; `step="any"` disables step checking. The step base follows HTML: `min`, else the `value` attribute, else 0.
- A native `setCustomValidity(message)` takes precedence over every other check and yields error `custom` with the native `validationMessage` (the consumer `validate` callback does not run). Call `setCustomValidity('')` and then `refresh()` to clear it.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FORM_FIELD_OPTIONS` | configuration | Missing or blank `label`; `control` is not an input, textarea, or select; or the input type is checkbox, radio, file, hidden, button, submit, reset, image, date, time, datetime-local, month, week, range, or color (use Checkbox, Radio Group, Switch, Date Input, Date Picker, or Time Picker). |
| Validation (`validity.error`) | validation | `value-missing`, `type-mismatch`, `too-short`, `too-long`, `pattern-mismatch`, `bad-input`, `range-underflow`, `range-overflow`, `step-mismatch`, `custom`. |

A failed construction leaves the host and the control untouched.

## 30. Known limitations

- After changing constraint attributes or the value in code, call `refresh()`.
- The initial value for `dirty` and `reset()` is captured at creation.
- No character counter.
- Screen-reader behavior across native input types has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- checkbox, radio, file, hidden, button, submit, reset, image, date, time, datetime-local, month, week, range, and color inputs.
- More than one control per field.
- HTML in the label, help text, or messages.

## 32. TypeScript definitions

```ts
type FormFieldControl = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement;
type FormFieldValue = string | string[];
interface FormFieldIcons { error: IconRef }
interface FormFieldChangeDetail { value: FormFieldValue; validity: FieldValidity }
interface FormFieldOptions {
  label: string;
  control: FormFieldControl;
  hideLabel?: boolean;
  description?: string;
  required?: boolean;
  validate?: (value: FormFieldValue) => string | null;
  validationTiming?: ValidationTiming;
  locale?: string;
  icons?: Partial<FormFieldIcons>;
}
```

## 33. Vanilla JS example

```ts
import { FormField } from '@absoluteui/components/form-field';
import '@absoluteui/components/form-field/style.css';

const host = document.querySelector<HTMLElement>('#guests-field');
const control = host?.querySelector<HTMLInputElement>('input[name="guests"]');
if (host && control) {
  const guests = FormField.create(host, { label: 'Number of guests', control, required: true, description: 'Up to 8 people' });
  host.addEventListener('aui-change', () => {
    if (!guests.validity.valid) guests.reportValidity();
  });
}
```

## 34. Angular example

The directive wraps the native control inside its host, which keeps Angular's own value accessor for `[formControl]`. AbsoluteUI adds the label, help text, and localized validation messages.

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiFormField } from '@absoluteui/angular/form-field';

@Component({
  selector: 'app-guests',
  imports: [ReactiveFormsModule, AuiFormField],
  template: `
    <aui-form-field label="Number of guests" description="Up to 8 people" [required]="true">
      <input type="number" name="guests" min="1" max="8" [formControl]="guests" />
    </aui-form-field>`,
})
export class GuestsComponent {
  readonly guests = new FormControl<number | null>(null, { validators: [Validators.required, Validators.min(1), Validators.max(8)] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiFormField } from '@absoluteui/react/form-field';

export function Example() {
  const [zip, setZip] = useState('');
  return (
    <AuiFormField label="ZIP code" description="5 digits">
      <input name="zip" required pattern="[0-9]{5}" value={zip} onChange={(e) => { setZip(e.target.value); }} />
    </AuiFormField>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiFormField } from '@absoluteui/vue/form-field';
const zip = ref('');
</script>

<template>
  <AuiFormField label="ZIP code" description="5 digits">
    <input v-model="zip" name="zip" required pattern="[0-9]{5}" />
  </AuiFormField>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
