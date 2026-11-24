# Checkbox Group

> Package: `@absoluteui/components/checkbox-group` | Styles: `@absoluteui/components/checkbox-group/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Several related, independent choices. `CheckboxGroup` renders a `<fieldset>` and `<legend>` around native checkboxes that share one field name, with group help text, `required` and `minSelected`/`maxSelected` validation, and one localized validation message for the group. Checkboxes use the same visuals as Checkbox.

## 2. Anatomy

```text
<div class="aui-field aui-checkbox-group" data-aui-control>       (consumer host)
  <fieldset class="aui-checkbox-group__fieldset" aria-describedby>
    <legend class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span><span class="aui-visually-hidden"> (required)</span></legend>
    <div class="aui-field__description">                          (optional)
    <div class="aui-checkbox-group__options">
      <div class="aui-checkbox-group__option">                    (per option)
        <span class="aui-checkbox-group__box">
          <input type="checkbox" class="aui-checkbox-group__input" name value>
          <span class="aui-checkbox-group__mark"><svg aria-hidden="true"></span>
        </span>
        <div class="aui-checkbox-group__text">
          <label class="aui-checkbox-group__label" for=input>
          <div class="aui-checkbox-group__option-description">   (optional)
        </div>
      </div>
    </div>
    <div class="aui-field__error aui-validation-message">         (when shown)
  </fieldset>
</div>
```

## 3. When to use

- Choosing any number of options from a short, visible list (about 2 to 10).
- Selections with a minimum or maximum count.

## 4. When not to use

- Exactly one choice: use Radio Group.
- Long or searchable lists: use a multi-select Combobox or Listbox.
- A single yes/no choice: use Checkbox.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `fieldset` | `HTMLFieldSetElement` | The grouping fieldset. |
| `inputs` | `HTMLInputElement[]` | Native checkboxes, in option order. |
| `value` | `string[]` | Selected values, in option order. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Legend text. |
| `disabled` | `boolean` | Group disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Selection differs from the initial selection. |
| `touched` | `boolean` | Focus has left the group at least once. |
| `options` | `Readonly<CheckboxGroupOptions>` | Current options. |

Options: `label` (required), `options` (required; `{ value, label, description?, disabled? }`, unique values), `hideLabel`, `value`, `name`, `description`, `required`, `minSelected`, `maxSelected`, `orientation`, `disabled`, `validate`, and `icons`. Full table: `metadata/checkbox-group/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `CheckboxGroup.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(values)` | Programmatic selection; no events. Unknown values throw. Clears an external custom error. |
| `update(options)` | Merge and apply options. A new option list keeps selections that still exist. |
| `reportValidity()` | Show messages now and return whether the selection is valid. |
| `setCustomError(message)` | External error; cleared when the selection changes. `null` clears it. |
| `getFormValue()` | Selected values (`string[]`). |
| `focus()` | Focus the first enabled checkbox. |
| `reset()` | Restore the initial selection; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value: string[], validity }` | Yes | The user toggled an option. |

Programmatic changes (`setValue`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. The legend, option labels, and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-checkbox-group` | Host. |
| `aui-checkbox-group--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome (the label is the legend). |
| `aui-checkbox-group__fieldset` | Grouping fieldset. |
| `aui-checkbox-group__options`, `__options--horizontal` | Option list and horizontal layout. |
| `aui-checkbox-group__option` | One option row. |
| `aui-checkbox-group__box`, `__input`, `__mark` | Box, native input, check mark. |
| `aui-checkbox-group__text`, `__label`, `__option-description` | Option text. |

All rules live in the `aui.components` cascade layer. The box rules duplicate Checkbox's so each stylesheet stands alone.

## 10. Design tokens

See `metadata/checkbox-group/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-primary`, `color-on-primary`, `color-error-fg`, `color-focus-ring`, `color-text-muted`, `icon-size-md`, `radius-sm`, `touch-target-min`.

## 11. States

default, hover, focus-visible, checked, disabled (group), disabled (option), required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | user toggles an option | selection changed; `aui-change`; dirty |
| any | focus leaves the group | touched; messages shown (`blur` timing) |
| any | `reportValidity()` | submitted; messages shown for every timing |
| invalid (custom error) | selection changes | custom error cleared |
| any | `reset()` | initial selection; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves through each enabled checkbox in order. |
| Space | Checkbox focused | Toggles that option (native). |

## 14. ARIA contract

- The native `<fieldset>` (role `group`) is named by its `<legend>`.
- `aria-describedby` on the fieldset: group help text, then the visible error message.
- Each checkbox has a `<label for>` and, when present, `aria-describedby` pointing at its option help text.
- `aria-invalid="true"` is set on every checkbox while the group error is shown; the `group` role does not support `aria-invalid`.

## 15. Accessibility notes

- The required asterisk is `aria-hidden`. Checkboxes and the group role cannot carry `aria-required`, so a visually hidden " (required)" (message `checkboxGroup.required`) is part of the legend.
- Checked state is shown by a check mark, not only color.
- Errors appear after focus leaves the whole group, not when moving between options.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Vertical by default. `orientation: 'horizontal'` wraps options in a row. Labels and help text wrap; rows are at least `touch-target-min` tall.

## 17. RTL behavior

Logical properties and flex layout: boxes are at the inline start and horizontal options flow from the inline start.

## 18. Theme behavior

Colors come from role tokens only. In forced-colors mode boxes use `Canvas`/`CanvasText`, checked uses `Highlight` with a `HighlightText` mark, and disabled uses `GrayText`, with `forced-color-adjust: none`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { checkboxGroup: { validationTiming: 'input' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic; changing `options`, `name`, or `icons` rebuilds the option rows.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.checked` (default `check`) and `icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent`. Validation messages never include selected values (SPEC section 14.4). CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. With `name`, each checked native checkbox submits `name=value`.

## 25. Performance characteristics

Two listeners per instance (delegated change, focusout), a shared document-level pointer tracker, and one configuration subscription. Rendering is linear in the number of options. Target: under 2 ms for 10 options; not yet covered by the performance test.

## 26. Supported data scale

Short lists, up to about 20 options. Unit-tested with 4 options.

## 27. Usage examples

```ts
import { CheckboxGroup } from '@absoluteui/components/checkbox-group';

const host = document.createElement('div');
document.body.append(host);
CheckboxGroup.create(host, {
  label: 'Notifications',
  name: 'notify',
  required: true,
  options: [
    { value: 'email', label: 'Email' },
    { value: 'sms', label: 'SMS' },
  ],
});
```

More examples, type-checked in CI: `metadata/checkbox-group/examples.json`.

## 28. Edge cases

- An empty optional group is valid even with `minSelected` (HTML constraint semantics); add `required` to demand a selection.
- Required and empty reports `value-missing` ("Select an option."), not `too-few-selected`.
- Disabled options keep their checked state and are still reported in `value` and `getFormValue()`; native form submission omits disabled inputs.
- `update({ options })` drops selections whose values no longer exist.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CHECKBOX_GROUP_OPTIONS` | configuration | Missing label, empty or duplicate options, unknown `value`, invalid `minSelected`/`maxSelected`, `minSelected > maxSelected`, invalid `orientation`. |
| Validation (`validity.error`) | validation | `value-missing`, `too-few-selected`, `too-many-selected`, `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Selection-count messages have singular and plural forms only (`tooFewSelectedOne`/`tooFewSelected`, `tooManySelectedOne`/`tooManySelected`); languages with more plural categories need a custom `validate` message.
- Some screen readers announce fieldset descriptions only when entering the group.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in labels or the legend.
- A mixed "select all" row inside the group (compose a Checkbox with the group).
- Nested groups.

## 32. TypeScript definitions

```ts
type CheckboxGroupOrientation = 'vertical' | 'horizontal';
interface CheckboxGroupOption { value: string; label: string; description?: string; disabled?: boolean }
interface CheckboxGroupIcons { checked: IconRef; error: IconRef }
interface CheckboxGroupChangeDetail { value: string[]; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { CheckboxGroup } from '@absoluteui/components/checkbox-group';
import '@absoluteui/components/checkbox-group/style.css';

const host = document.querySelector<HTMLElement>('#topics');
if (host) {
  const topics = CheckboxGroup.create(host, {
    label: 'Topics',
    maxSelected: 3,
    options: [
      { value: 'design', label: 'Design' },
      { value: 'security', label: 'Security' },
      { value: 'performance', label: 'Performance' },
      { value: 'a11y', label: 'Accessibility' },
    ],
  });
  host.addEventListener('aui-change', () => {
    host.dataset.count = String(topics.value.length);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiCheckboxGroup } from '@absoluteui/angular/checkbox-group';

@Component({
  selector: 'app-preferences',
  imports: [ReactiveFormsModule, AuiCheckboxGroup],
  template: `<aui-checkbox-group label="Notifications" [options]="channels" [required]="true" [formControl]="notify"></aui-checkbox-group>`,
})
export class PreferencesComponent {
  readonly channels = [
    { value: 'email', label: 'Email' },
    { value: 'sms', label: 'SMS' },
  ];
  readonly notify = new FormControl<string[]>([], { nonNullable: true });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiCheckboxGroup } from '@absoluteui/react/checkbox-group';

const topics = [{ value: 'news', label: 'News' }, { value: 'offers', label: 'Offers' }];

export function Example() {
  const [value, setValue] = useState<string[]>([]);
  return <AuiCheckboxGroup label="Topics" options={topics} value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiCheckboxGroup } from '@absoluteui/vue/checkbox-group';
const topics = [{ value: 'news', label: 'News' }, { value: 'offers', label: 'Offers' }];
const value = ref<string[]>([]);
</script>

<template>
  <AuiCheckboxGroup v-model="value" label="Topics" :options="topics" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
