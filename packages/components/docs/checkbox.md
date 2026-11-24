# Checkbox

> Package: `@absoluteui/components/checkbox` | Styles: `@absoluteui/components/checkbox/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A single on/off choice submitted with a form. `Checkbox` renders a native `<input type="checkbox">` restyled with `appearance: none`, so the native input stays the focus target, the hit target, and the source of truth for checked and mixed state. It adds a label, required indicator, help text, and a localized validation message. The check and minus marks are icons layered over the box.

## 2. Anatomy

```text
<div class="aui-field aui-checkbox" data-aui-control>          (consumer host)
  <div class="aui-checkbox__row">
    <span class="aui-checkbox__box">
      <input type="checkbox" class="aui-checkbox__input">
      <span class="aui-checkbox__mark aui-checkbox__mark--checked"><svg aria-hidden="true"></span>
      <span class="aui-checkbox__mark aui-checkbox__mark--indeterminate"><svg aria-hidden="true"></span>
    </span>
    <label class="aui-field__label aui-checkbox__label" for=input>Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  </div>
  <div class="aui-field__description">                             (optional)
  <div class="aui-field__error aui-validation-message">            (when shown)
</div>
```

## 3. When to use

- A single independent yes/no choice submitted with a form, such as accepting terms.
- A "select all" parent that shows a mixed state.
- A choice that must be confirmed before continuing (`required`).

## 4. When not to use

- Several related choices: use Checkbox Group.
- One of several mutually exclusive options: use Radio Group.
- A setting that takes effect immediately: use Switch.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `input` | `HTMLInputElement` | The native checkbox. |
| `checked` | `boolean` | Current checked state. |
| `indeterminate` | `boolean` | Current mixed state. |
| `value` | `string` | Submitted value when checked (default `'on'`). |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Checked or mixed state differs from the initial state. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<CheckboxOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `checked`, `indeterminate`, `value`, `name`, `description`, `required`, `disabled`, `validate`, and `icons`. Full table: `metadata/checkbox/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `Checkbox.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setChecked(checked, indeterminate?)` | Programmatic state; no events. Clears the mixed state unless given, and clears an external custom error. |
| `update(options)` | Merge and apply options. |
| `reportValidity()` | Show messages now and return whether the state is valid. |
| `setCustomError(message)` | External error; cleared when the user toggles. `null` clears it. |
| `getFormValue()` | `value` when checked, otherwise `null`. |
| `focus()` | Focus the checkbox. |
| `reset()` | Restore the initial checked and mixed state; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ checked, value, validity }` | Yes | The user toggled the checkbox (native `change`). |

Programmatic changes (`setChecked`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. The label and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-checkbox` | Host. |
| `aui-checkbox--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-checkbox__row` | Box and label row. |
| `aui-checkbox__box` | Positioning wrapper for the input and marks. |
| `aui-checkbox__input` | Native checkbox, restyled as the box. |
| `aui-checkbox__mark`, `__mark--checked`, `__mark--indeterminate` | Decorative marks. |
| `aui-checkbox__label` | The label. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/checkbox/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-primary`, `color-on-primary`, `color-error-fg`, `color-focus-ring`, `color-disabled-bg`, `icon-size-md`, `radius-sm`, `touch-target-min`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-checkbox-size` (box size; falls back to `icon-size-md`), `--aui-checkbox-radius` (box corner radius; falls back to `radius-sm`), `--aui-checkbox-border-color` (unchecked box boundary; falls back to `color-border-strong`), `--aui-checkbox-checked-bg` (checked and indeterminate fill; falls back to `color-primary`), `--aui-checkbox-mark-fg` (check mark; falls back to `color-on-primary`).

## 11. States

default, hover, focus-visible, checked, indeterminate (mixed), disabled, disabled checked, required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| unchecked | click, label click, or Space | checked; `aui-change` |
| checked | click, label click, or Space | unchecked; `aui-change` |
| indeterminate | user toggle | checked (native), mixed cleared |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` | submitted; messages shown for every timing |
| invalid (custom error) | user toggles | custom error cleared |
| any | `reset()` | initial state; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves focus to and from the checkbox. |
| Space | Checkbox focused | Toggles the checkbox (native). |

## 14. ARIA contract

- Native `<label for>` names the checkbox; the native role is `checkbox`.
- The native `indeterminate` property exposes `aria-checked="mixed"`; no ARIA attribute is set by hand.
- `aria-describedby`: help text, then the visible error message.
- `aria-invalid="true"` only while an error message is shown.
- Marks are `aria-hidden`.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; the native `required` attribute conveys the state.
- Checked and mixed states use a check or minus shape, not only color (WCAG 1.4.1).
- The label is clickable, so the target is the whole row (WCAG 2.5.8); the row is at least `touch-target-min` tall.
- Errors appear after the first blur by default. When focus leaves because of a pointer press, the message appears after the pointer is released so the pending click is not displaced.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The box is fixed-size; the label wraps beside it. Help text and messages align with the label.

## 17. RTL behavior

Logical properties throughout: the box is at the inline start and help text is indented from the inline start. The check mark is not mirrored.

## 18. Theme behavior

Colors come from role tokens only. High-contrast themes widen `border-width`. In forced-colors mode the box uses `Canvas`/`CanvasText`, checked uses `Highlight` with a `HighlightText` mark, and disabled uses `GrayText`, with `forced-color-adjust: none` so the custom box stays visible.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { checkbox: { validationTiming: 'input' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.checked` (default `check`), `icons.indeterminate` (default `minus`), and `icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent`. Validation messages never include the value (SPEC section 14.4). CSP-safe: no inline styles or HTML strings.

## 24. Data handling behavior

No persistence, network access, or telemetry. The native input submits `name=value` when checked and `name` is set.

## 25. Performance characteristics

Two listeners per instance (change, focusout), one document-level pointer tracker shared by all fields, and one configuration subscription. Target: under 1 ms per `Checkbox.create`; not yet covered by the performance test.

## 26. Supported data scale

One value per instance. Not yet included in the 1,000-instance performance test.

## 27. Usage examples

```ts
import { Checkbox } from '@absoluteui/components/checkbox';

const host = document.createElement('div');
document.body.append(host);
Checkbox.create(host, { label: 'I accept the terms and conditions', name: 'terms', value: 'accepted', required: true });
```

More examples, type-checked in CI: `metadata/checkbox/examples.json`.

## 28. Edge cases

- Toggling a mixed checkbox makes it checked and clears the mixed state (native behavior).
- `setChecked(true)` clears the mixed state; `setChecked(false, true)` shows mixed.
- A mixed checkbox that is not checked submits nothing.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CHECKBOX_OPTIONS` | configuration | Missing label, non-string `value`, or non-function `validate`. |
| Validation (`validity.error`) | validation | `value-missing` ("Check this box to continue."), `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- The mixed state is presentational and never submitted.
- The box alone is 1.25rem; the 24px target is met by the row and label.
- Screen-reader behavior of the mixed state and messages has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML (for example links) inside the label.
- Read-only checkboxes.

## 32. TypeScript definitions

```ts
type ValidationTiming = 'blur' | 'input' | 'submit';
interface FieldValidity { readonly valid: boolean; readonly error: ValidationErrorCode | null; readonly message: string }
interface CheckboxIcons { checked: IconRef; indeterminate: IconRef; error: IconRef }
interface CheckboxChangeDetail { checked: boolean; value: string; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { Checkbox } from '@absoluteui/components/checkbox';
import '@absoluteui/components/checkbox/style.css';

const host = document.querySelector<HTMLElement>('#newsletter');
if (host) {
  const newsletter = Checkbox.create(host, { label: 'Send me the monthly newsletter', name: 'newsletter', value: 'monthly' });
  host.addEventListener('aui-change', () => {
    host.dataset.subscribed = String(newsletter.checked);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiCheckbox } from '@absoluteui/angular/checkbox';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, AuiCheckbox],
  template: `<aui-checkbox label="I accept the terms" [required]="true" [formControl]="terms"></aui-checkbox>`,
})
export class SignupComponent {
  readonly terms = new FormControl(false, { nonNullable: true, validators: [Validators.requiredTrue] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
