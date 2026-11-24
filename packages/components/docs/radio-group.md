# Radio Group

> Package: `@absoluteui/components/radio-group` | Styles: `@absoluteui/components/radio-group/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Exactly one choice from a short set of mutually exclusive options. `RadioGroup` renders a `<fieldset role="radiogroup">` and `<legend>` around native radios that share one name (generated when `name` is absent), so the browser provides the single tab stop and arrow-key selection. It adds group help text, `required` validation, and one localized validation message.

## 2. Anatomy

```text
<div class="aui-field aui-radio-group" data-aui-control>           (consumer host)
  <fieldset class="aui-radio-group__fieldset" role="radiogroup" aria-labelledby=legend aria-required aria-invalid aria-describedby>
    <legend class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></legend>
    <div class="aui-field__description">                            (optional)
    <div class="aui-radio-group__options">
      <div class="aui-radio-group__option">                         (per option)
        <span class="aui-radio-group__box">
          <input type="radio" class="aui-radio-group__input" name value>
          <span class="aui-radio-group__dot" aria-hidden="true">
        </span>
        <div class="aui-radio-group__text">
          <label class="aui-radio-group__label" for=input>
          <div class="aui-radio-group__option-description">         (optional)
        </div>
      </div>
    </div>
    <div class="aui-field__error aui-validation-message">           (when shown)
  </fieldset>
</div>
```

## 3. When to use

- One option from about 2 to 7 visible options where comparing them matters.
- A required choice with no sensible default.

## 4. When not to use

- Several independent choices: use Checkbox Group.
- Long or searchable lists: use Select or Combobox.
- A binary setting that applies immediately: use Switch.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `fieldset` | `HTMLFieldSetElement` | The fieldset with `role="radiogroup"`. |
| `inputs` | `HTMLInputElement[]` | Native radios, in option order. |
| `value` | `string \| null` | Selected value, or `null`. |
| `name` | `string \| null` | Consumer form field name (`null` when generated). |
| `label` | `string` | Legend text. |
| `disabled` | `boolean` | Group disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Selection differs from the initial selection. |
| `touched` | `boolean` | Focus has left the group at least once. |
| `options` | `Readonly<RadioGroupOptions>` | Current options. |

Options: `label` (required), `options` (required; `{ value, label, description?, disabled? }`, unique values), `hideLabel`, `value`, `name`, `description`, `required`, `orientation`, `disabled`, `validate`, and `icons`. Full table: `metadata/radio-group/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `RadioGroup.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic selection; no events. `null` clears it; unknown values throw. Clears an external custom error. |
| `update(options)` | Merge and apply options. A new option list keeps the selection if it still exists. |
| `reportValidity()` | Show messages now and return whether the selection is valid. |
| `setCustomError(message)` | External error; cleared when the selection changes. `null` clears it. |
| `getFormValue()` | Selected value or `null`. |
| `focus()` | Focus the selected radio, else the first enabled radio. |
| `reset()` | Restore the initial selection; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value: string \| null, validity }` | Yes | The user selected an option (click, Space, or arrow keys). |

Programmatic changes (`setValue`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. The legend, option labels, and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-radio-group` | Host. |
| `aui-radio-group--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome (the label is the legend). |
| `aui-radio-group__fieldset` | Fieldset with `role="radiogroup"`. |
| `aui-radio-group__options`, `__options--horizontal` | Option list and horizontal layout. |
| `aui-radio-group__option` | One option row. |
| `aui-radio-group__box`, `__input`, `__dot` | Radio wrapper, native input, selected dot. |
| `aui-radio-group__text`, `__label`, `__option-description` | Option text. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/radio-group/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-primary`, `color-on-primary`, `color-error-fg`, `color-focus-ring`, `color-text-muted`, `icon-size-md`, `touch-target-min`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-radio-group-size` (radio size; falls back to `icon-size-md`), `--aui-radio-group-border-color` (unchecked radio boundary; falls back to `color-border-strong`), `--aui-radio-group-checked-bg` (checked radio fill; falls back to `color-primary`), `--aui-radio-group-dot-fg` (checked radio dot; falls back to `color-on-primary`).

## 11. States

default, hover, focus-visible, selected, disabled (group), disabled (option), required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | click, label click, Space, or arrow key | new selection; `aui-change`; dirty |
| any | focus leaves the group | touched; messages shown (`blur` timing) |
| any | `reportValidity()` | submitted; messages shown for every timing |
| invalid (custom error) | selection changes | custom error cleared |
| any | `reset()` | initial selection; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Enters the group on the selected radio (else the first enabled radio) and leaves it; one tab stop. |
| ArrowDown / ArrowRight | Radio focused | Moves to and selects the next enabled radio, wrapping (native). |
| ArrowUp / ArrowLeft | Radio focused | Moves to and selects the previous enabled radio, wrapping (native). |
| Space | Unselected radio focused | Selects it (native). |

## 14. ARIA contract

- `role="radiogroup"` on the fieldset, named by the legend through `aria-labelledby`.
- `aria-required="true"` on the radiogroup when required; each radio also has native `required`.
- `aria-invalid="true"` on the radiogroup only while an error message is shown.
- `aria-describedby` on the radiogroup: group help text, then the visible error message. Each radio references its option help text.
- The selected dot is `aria-hidden`.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`; `aria-required` conveys the state.
- Selection is shown by an inner dot, not only color.
- Native keyboard behavior is used, so it matches platform conventions and skips disabled radios.
- Errors appear after focus leaves the whole group, not when moving between radios.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Vertical by default. `orientation: 'horizontal'` wraps options in a row. Labels and help text wrap; rows are at least `touch-target-min` tall.

## 17. RTL behavior

Logical properties and flex layout: radios are at the inline start and horizontal options flow from the inline start. Arrow keys follow the browser's native direction handling.

## 18. Theme behavior

Colors come from role tokens only. In forced-colors mode rings use `Canvas`/`CanvasText`, the selected ring and dot use `Highlight`, and disabled uses `GrayText`, with `forced-color-adjust: none`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { radioGroup: { validationTiming: 'submit' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic; changing `options` or `name` rebuilds the radios.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`). The selected dot is a CSS shape, not an icon.

## 23. Security behavior

All text uses `textContent`. Validation messages never include the selected value (SPEC section 14.4). CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. With `name`, the selected radio submits `name=value`. Without `name`, a generated name groups the radios; it is not tied to user data.

## 25. Performance characteristics

Two listeners per instance (delegated change, focusout), a shared document-level pointer tracker, and one configuration subscription. Rendering is linear in the number of options. Target: under 2 ms for 7 options; not yet covered by the performance test.

## 26. Supported data scale

Short lists, up to about 20 options. Unit-tested with 4 options.

## 27. Usage examples

```ts
import { RadioGroup } from '@absoluteui/components/radio-group';

const host = document.createElement('div');
document.body.append(host);
RadioGroup.create(host, {
  label: 'Shipping speed',
  name: 'shipping',
  required: true,
  options: [
    { value: 'standard', label: 'Standard' },
    { value: 'express', label: 'Express' },
  ],
});
```

More examples, type-checked in CI: `metadata/radio-group/examples.json`.

## 28. Edge cases

- Once selected, the user cannot clear the selection (native); add a "None" option if needed.
- Two groups with the same consumer `name` in one form become one native group.
- `update({ options })` clears the selection when its value no longer exists.
- A disabled selected option stays selected but is skipped by arrow keys.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `RADIO_GROUP_OPTIONS` | configuration | Missing label, empty or duplicate options, unknown `value`, empty `name`, invalid `orientation`. |
| Validation (`validity.error`) | validation | `value-missing` ("Select an option."), `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- The selection cannot be cleared by the user.
- Screen-reader behavior of `aria-invalid` and descriptions on the radiogroup has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in labels or the legend.
- Custom roving focus.
- Read-only radio groups.

## 32. TypeScript definitions

```ts
type RadioGroupOrientation = 'vertical' | 'horizontal';
interface RadioGroupOption { value: string; label: string; description?: string; disabled?: boolean }
interface RadioGroupIcons { error: IconRef }
interface RadioGroupChangeDetail { value: string | null; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { RadioGroup } from '@absoluteui/components/radio-group';
import '@absoluteui/components/radio-group/style.css';

const host = document.querySelector<HTMLElement>('#size');
if (host) {
  const size = RadioGroup.create(host, {
    label: 'Size',
    orientation: 'horizontal',
    options: [
      { value: 's', label: 'Small' },
      { value: 'm', label: 'Medium' },
      { value: 'l', label: 'Large' },
    ],
  });
  host.addEventListener('aui-change', () => {
    host.dataset.size = size.value ?? '';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiRadioGroup } from '@absoluteui/angular/radio-group';

@Component({
  selector: 'app-shipping',
  imports: [ReactiveFormsModule, AuiRadioGroup],
  template: `<aui-radio-group label="Shipping speed" [options]="speeds" [required]="true" [formControl]="speed"></aui-radio-group>`,
})
export class ShippingComponent {
  readonly speeds = [
    { value: 'standard', label: 'Standard' },
    { value: 'express', label: 'Express' },
  ];
  readonly speed = new FormControl<string | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
