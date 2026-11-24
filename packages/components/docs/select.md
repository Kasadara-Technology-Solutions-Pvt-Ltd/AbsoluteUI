# Select

> Package: `@absoluteui/components/select` | Styles: `@absoluteui/components/select/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Single choice from a known, flat list of options. `Select` implements the WAI-ARIA APG select-only combobox: a focusable `role="combobox"` element shows the selected label (or a placeholder) and opens a `role="listbox"` popup in the top layer. It adds typeahead, option descriptions, localized required validation through the shared validation engine, and native form submission through a hidden input.

## 2. Anatomy

```text
<div class="aui-field aui-select" data-aui-control>              (consumer host)
  <label class="aui-field__label" id=label>Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-select__combobox" role="combobox" tabindex="0" aria-haspopup="listbox"
       aria-expanded aria-controls=listbox aria-labelledby="label combobox">
    <span class="aui-select__value">Selected label or placeholder</span>
    <span class="aui-select__chevron"><svg aria-hidden="true"></span>
  </div>
  <div class="aui-field__description">                             (optional)
  <div class="aui-field__error aui-validation-message">            (when shown)
  <input type="hidden" name>                                        (value for native forms)
  <div class="aui-select__popup" popover="manual">                  (top layer when open)
    <div class="aui-select__listbox" role="listbox" aria-labelledby=label>
      <div class="aui-select__option" role="option" aria-selected [aria-disabled]>
        <span class="aui-select__option-label"> <span class="aui-select__option-description"> <svg class="aui-select__check">
</div>
```

## 3. When to use

- Choosing exactly one value from a known list of roughly 5 to 1,000 options.
- Space is limited and the options do not need to stay visible.
- A consistent alternative to the native `<select>` with option descriptions and localized validation.

## 4. When not to use

- Two to five options that should stay visible: use Radio Group.
- Users need to type to filter a long list: use Combobox.
- Multiple selection: use Checkbox Group.
- Actions rather than values: use Menu.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `combobox` | `HTMLDivElement` | The focusable `role="combobox"` element. |
| `listbox` | `HTMLDivElement` | The listbox. |
| `value` | `string \| null` | Selected value. |
| `selectedOption` | `SelectOption \| null` | Selected option. |
| `isOpen` | `boolean` | Whether the listbox is shown. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `validity` | `FieldValidity` | `{ valid, error, message }`, recomputed on every change. |
| `dirty` | `boolean` | Value differs from the initial value. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<SelectOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `options` (required), `value`, `name`, `placeholder`, `description`, `required`, `disabled`, `readOnly`, `validate`, `icons`, and since 0.9.0 `renderOption` and `renderValue`. Full table: `metadata/select/api.json`.

Custom content (since 0.9.0): `renderOption(option, { doc })` returns the content of an option and `renderValue(option, { doc })` the content shown for the selected value. Both are decorative: the option label stays the accessible name, the typeahead text, and the announced value (kept as visually hidden text next to custom value content). Nodes are reused per option object and released with `releaseNode()` (`@absoluteui/core`) when the option or the select is dropped.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Select.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic selection; no events. Unknown values clear the selection. Clears an external custom error. |
| `update(options)` | Merge and apply options. A value whose option was removed is cleared (no event). |
| `open()` / `close()` | Show or hide the listbox. Opening activates the selected option, or the first enabled one. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user selects a new value. `null` clears it. |
| `getFormValue()` | Selected value or `null`. |
| `focus()` | Focus the combobox. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close, remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, option, validity }` | Yes | The user selected a different option. |
| `aui-open` | `null` | No | The listbox opened. |
| `aui-close` | `null` | No | The listbox closed. |

Programmatic changes (`setValue`, `update`, `reset`) emit no `aui-change`. Re-selecting the current option emits nothing.

## 8. Slots/content areas

None. The label, options, descriptions, placeholder, and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-select` | Host. |
| `aui-select--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-select__combobox` | Focusable combobox; control boundary and popup anchor. |
| `aui-select__value`, `__value--placeholder` | Selected label or placeholder. |
| `aui-select__chevron` | Decorative expand icon. |
| `aui-select__popup` | Top-layer popover container. |
| `aui-select__listbox` | Listbox. |
| `aui-select__option`, `__option--active` | Option; `--active` marks the active descendant. |
| `aui-select__option-label`, `__option-description` | Option text parts. |
| `aui-select__check` | Check icon on the selected option. |

All rules live in the `aui.components` cascade layer. State selectors use ARIA attributes (`[aria-expanded]`, `[aria-selected]`, `[aria-disabled]`, `[aria-readonly]`, `[aria-invalid]`).

## 10. Design tokens

See `metadata/select/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-error-fg`, `color-selected`, `color-selected-text`, `color-selected-indicator`, `color-hover`, `color-surface-sunken`, `popover-max-height`, `shadow-md`, `control-height-md`, `radius-md`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-select-radius` (select trigger corner radius; falls back to `radius-md`), `--aui-select-bg` (select trigger background; falls back to `color-surface`), `--aui-select-border-color` (select trigger boundary; falls back to `color-border-strong`), `--aui-select-padding-x` (select trigger inline padding; falls back to `control-padding-x`), `--aui-select-height` (select trigger height; falls back to `control-height-md`), `--aui-select-popup-radius` (select listbox corner radius; falls back to `radius-md`), `--aui-select-popup-shadow` (select listbox elevation; falls back to `shadow-md`), `--aui-select-option-radius` (select option corner radius; falls back to `radius-sm`).

## 11. States

default, focus-visible, open, option active, option selected, option disabled, placeholder (no value), disabled, read-only, required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | Enter, Space, ArrowDown/Up, Alt+ArrowDown, Home, End, typing, or click | open, active option set |
| open | Enter, Space, Alt+ArrowUp, Tab, or option click | value set (aui-change if different), closed |
| open | Escape, outside pointer, focus leaves, or click on the combobox | closed, value unchanged |
| pristine | user selects a new value | dirty; message shown only with `validationTiming: 'input'` |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user selects a new value | custom error cleared, validity recomputed |
| any | `reset()` | closed, initial value; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space / Alt+ArrowDown / ArrowDown | Closed | Opens; activates the selected option or the first enabled option. |
| ArrowUp | Closed | Opens; activates the selected option or the last enabled option. |
| Home / End | Any | Opens if needed; activates the first / last enabled option. |
| Printable characters | Any | Typeahead: opens if needed and activates the next matching option; repeating a character cycles; Space continues a query in progress. |
| ArrowDown / ArrowUp | Open | Moves the active option, skipping disabled options, without wrapping. |
| PageDown / PageUp | Open | Moves the active option by 10. |
| Enter / Space / Alt+ArrowUp | Open | Selects the active option and closes. |
| Escape | Open | Closes without changing the value; a surrounding Dialog stays open. |
| Tab / Shift+Tab | Open | Selects the active option, closes, and moves focus. |
| Tab / Shift+Tab | Closed | Moves focus to and from the combobox. |

## 14. ARIA contract

- `role="combobox"` with `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls` pointing at the listbox.
- `aria-labelledby="<label id> <combobox id>"`: the accessible name is the label followed by the selected label.
- `aria-activedescendant` references the active option while open; removed when closed.
- `aria-required`, `aria-readonly`, and `aria-disabled` reflect the options.
- `aria-describedby`: help text and the visible error message. `aria-invalid="true"` only while an error message is shown.
- Listbox: `role="listbox"`, `aria-labelledby` the label. Options: `role="option"`, `aria-selected="true|false"`, `aria-disabled="true"` when disabled.

## 15. Accessibility notes

- DOM focus never leaves the combobox; pointer interaction with the popup does not move focus.
- The active option has an outline (not color alone) and is scrolled into view.
- A `<label>` cannot name a `div`, so it is associated through `aria-labelledby`; clicking it focuses the combobox.
- Disabled selects use `aria-disabled` and leave the tab order (`tabindex="-1"`), as in the APG guidance.
- The required asterisk is `aria-hidden`; `aria-required` conveys the state. Errors appear after the first blur by default (SPEC section 16.1).
- Escape is arbitrated by the overlay stack, so inside a Dialog it closes only the listbox.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Full width of its container; the selected label truncates with an ellipsis. The listbox is at least as wide as the combobox, flips above when there is not enough space below, and caps its height to `popover-max-height` or the available space. Density tokens change the control height.

## 17. RTL behavior

Logical properties throughout: the chevron is at the inline end. The listbox aligns to the inline start of the combobox using the `direction` option or the inherited global direction, read when the listbox opens.

## 18. Theme behavior

Colors come from role tokens only. The selected option uses `color-selected` / `color-selected-text` with a `color-selected-indicator` check. In forced-colors mode the active outline and selected option use `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { select: { validationTiming: 'submit' } } });
```

Changes apply to existing instances immediately. `locale` and `direction` inherit from the common configuration.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic; `direction` applies the next time the listbox opens.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (default `chevron-down`), `icons.selected` (default `check`), and `icons.error` (default `alert-circle`).

## 23. Security behavior

All text uses `textContent`. Validation messages never include the selected value (SPEC section 14.4). Positioning writes styles through the CSSOM; no inline styles or HTML sinks. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. A hidden input carries the selected value (empty string when nothing is selected) for native form submission when `name` is set; it is disabled, and therefore not submitted, while the select is disabled.

## 25. Performance characteristics

All options are rendered once when options change; selection updates `aria-selected` in place. Seven listeners per instance and one configuration subscription; positioning runs only while open. Budget: `Select.create` with 1,000 options under 100 ms.

## 26. Supported data scale

1,000 options per select in the unit test (`Select.testedOptionCount`). Larger lists are untested; consider Combobox with filtering.

## 27. Usage examples

```ts
import { Select } from '@absoluteui/components/select';

const host = document.createElement('div');
document.body.append(host);
Select.create(host, {
  label: 'Country',
  name: 'country',
  required: true,
  options: [
    { value: 'in', label: 'India' },
    { value: 'gb', label: 'United Kingdom' },
  ],
});
```

More examples, type-checked in CI: `metadata/select/examples.json`.

## 28. Edge cases

- An initial or `setValue` value that matches no option selects nothing; the placeholder is shown.
- Removing the selected option through `update({ options })` clears the value without an event.
- A disabled option can still be the programmatic value; users cannot select it.
- Selecting the already-selected option closes the listbox without an `aui-change`.
- With no enabled options, opening shows the list with no active option.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SELECT_OPTIONS` | configuration | Missing label, `options` not an array, an option without string `value`/`label`, duplicate values, or a non-string `value`. |
| Validation (`validity.error`) | validation | `value-missing` (message "Select an option."), `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Flat list only; option groups are not available.
- No virtualization; lists above 1,000 options are untested.
- Single selection only.
- Typeahead matches label prefixes.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, VoiceOver, and TalkBack.

## 31. Unsupported scenarios

- HTML or custom content in options, the label, or messages.
- Free-text entry (use Combobox).
- Multiple selection.

## 32. TypeScript definitions

```ts
interface SelectOption { readonly value: string; readonly label: string; readonly disabled?: boolean; readonly description?: string }
interface SelectIcons { expand: IconRef; selected: IconRef; error: IconRef }
type ValidationTiming = 'blur' | 'input' | 'submit';
interface FieldValidity { readonly valid: boolean; readonly error: ValidationErrorCode | null; readonly message: string }
interface SelectChangeDetail { value: string | null; option: SelectOption | null; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { Select, type SelectChangeDetail } from '@absoluteui/components/select';
import '@absoluteui/components/select/style.css';

const host = document.querySelector<HTMLElement>('#plan');
if (host) {
  const plan = Select.create(host, {
    label: 'Plan',
    name: 'plan',
    required: true,
    options: [
      { value: 'free', label: 'Free', description: 'Up to 3 projects' },
      { value: 'team', label: 'Team', description: 'Unlimited projects' },
    ],
  });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<SelectChangeDetail>).detail;
    if (value === null) plan.reportValidity();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiSelect } from '@absoluteui/angular/select';

@Component({
  selector: 'app-shipping',
  imports: [ReactiveFormsModule, AuiSelect],
  template: `<aui-select label="Country" [options]="countries" [required]="true" [formControl]="country"></aui-select>`,
})
export class ShippingComponent {
  readonly countries = [
    { value: 'in', label: 'India' },
    { value: 'gb', label: 'United Kingdom' },
  ];
  readonly country = new FormControl<string | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiSelect } from '@absoluteui/react/select';

const countries = [{ value: 'in', label: 'India' }, { value: 'us', label: 'United States' }];

export function Example() {
  const [value, setValue] = useState<string | null>(null);
  return <AuiSelect label="Country" options={countries} required value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiSelect } from '@absoluteui/vue/select';
const countries = [{ value: 'in', label: 'India' }, { value: 'us', label: 'United States' }];
const value = ref<string | null>(null);
</script>

<template>
  <AuiSelect v-model="value" label="Country" :options="countries" required />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
