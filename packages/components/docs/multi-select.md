# Multi Select

> Package: `@absoluteui/components/multi-select` | Styles: `@absoluteui/components/multi-select/style.css` | Since 0.9.0

## 1. Purpose

An editable combobox with a multi-selectable listbox (WAI-ARIA 1.2) for choosing several values.
- Selected values appear as chips with remove buttons; typing filters (or loads) options.
- Activating an option toggles it, and the list stays open for further choices unless `closeOnSelect` is set.
- DOM focus stays on the input; the active option is conveyed through `aria-activedescendant`.
- The listbox renders in the browser top layer (Popover API) and is positioned by the positioning engine.

## 2. Anatomy

```text
<div class="aui-multi-select">                     (consumer host)
  <label class="aui-multi-select__label" for=input>
  <div class="aui-multi-select__control">
    <ul class="aui-multi-select__chips" aria-label="Selected: {label}">
      <li class="aui-multi-select__chip"><span class="aui-multi-select__chip-label"> <button class="aui-multi-select__remove">
    </ul>
    <input role="combobox" class="aui-multi-select__input">
    <button class="aui-multi-select__toggle" tabindex="-1" aria-label="Show options">
  </div>
  <div class="aui-multi-select__description"> <div class="aui-multi-select__error">
  <input type="hidden" name> ...                   (one per selected value)
  <div class="aui-multi-select__popup" popover="manual">
    <div role="listbox" aria-multiselectable="true" class="aui-multi-select__listbox">
      <div role="option" class="aui-multi-select__option aui-multi-select__option--all">Select all</div>
      <div role="option" class="aui-multi-select__option"><span class="aui-multi-select__check"> ... </div>
    </div>
    <div class="aui-multi-select__empty">No results</div>
  </div>
</div>
```

## 3. When to use

- Choosing several values from a list long enough to benefit from filtering (roughly 7 or more options).
- Tags, skills, recipients, or teams from a known or searchable set.

## 4. When not to use

- A few options that fit on screen: use Checkbox Group.
- One value: use Combobox or Select.
- Free-text tags that are not in a list: custom values are not supported.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `input` | `HTMLInputElement` | Combobox input. |
| `listbox` | `HTMLDivElement` | Multi-selectable listbox. |
| `value` | `string[]` | Selected values in selection order (a copy). |
| `selectedOptions` | `MultiSelectOption[]` | Options of the selected values. |
| `isOpen` | `boolean` | Whether the listbox is shown. |

Options: `label` (required), `options` (required, unique values), `value`, `name`, `placeholder`, `description`, `required`, `disabled`, `readOnly`, `invalid`, `errorMessage`, `maxSelected`, `selectAll`, `renderOption`, `loadOptions`, `loadDelay`, and `icons`. The globally configurable options are listed below. Full table: `metadata/multi-select/api.json`.

- `maxSelected` (integer, at least 1): once reached, unselected options become unavailable (`aria-disabled`) and "You can select up to {max}." is announced.
- `selectAll`: adds a "Select all" option that toggles every enabled option shown (after filtering or loading), up to `maxSelected`. It is selected when every enabled option shown is selected.
- `loadOptions(query, { signal })`: typing loads the matching options instead of filtering `options`, as in Combobox. Requests are debounced by `loadDelay` (default 250 ms) and aborted by a newer query or closing. Loading and load errors are shown and announced. Selected options stay known, so their chips keep their labels after new results arrive.
- `renderOption(option, { doc })`: custom, decorative option content; the label stays the accessible name. Nodes are released with `releaseNode()` when dropped.

| Global option | Type | Default |
|---|---|---|
| `filter` | `'contains' \| 'startsWith' \| 'none'` | `'contains'` |
| `closeOnSelect` | `boolean` | `false` |
| `openOnFocus` | `boolean` | `false` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `MultiSelect.create(host, options)` | Render into an empty host. Validates options before touching the DOM. |
| `setValue(values)` | Programmatic selection; no `aui-change`. Unknown and duplicate values are dropped. |
| `update(options)` | Merge and apply options. |
| `open()` / `close()` | Show or hide the listbox. |
| `reportValidity()` | Show messages now (for example on submit); returns whether the value is valid. |
| `setCustomError(message)` | External error; cleared when the user changes the value. `null` clears it. |
| `getFormValue()` | The selected values, for form serialization (`Form`, SPEC section 18.8). |
| `focus()` | Focus the input. |
| `reset()` | Restore the initial value and clear touched/submitted state; no `aui-change`. |
| `destroy()` | Close, then remove listeners, subscriptions, released nodes, and rendered children. |

Multi Select implements the form-control contract (`name`, `label`, `disabled`, `validity`, `dirty`, `touched`), so `Form` validates it. With `required`, an empty selection is `value-missing`, shown after blur or `reportValidity()`. Consumer-managed `invalid`/`errorMessage` take precedence and show immediately.

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-change` | `{ value, added, removed }` | Yes | The user changed the selection (option, Select all, chip remove, or Backspace). |
| `aui-input` | `{ query }` | Yes | The user edited the text. |
| `aui-open` / `aui-close` | `null` | No | The listbox was shown or hidden. |

## 8. Slots/content areas

None. Options are data (`{ value, label, disabled?, description? }`); `renderOption` supplies decorative option content.

## 9. CSS parts/hooks

See the anatomy above. State modifiers: `aui-multi-select--invalid` and `--disabled`. The active option is marked with `aui-multi-select__option--active`, and Select all with `aui-multi-select__option--all`. The positioning engine publishes `--aui-available-height` on the popup.

## 10. Design tokens

See `metadata/multi-select/tokens.json` (verified in CI). Key tokens: `color-selected`, `color-selected-text`, `color-selected-indicator`, `color-hover`, `color-focus-ring`, `popover-max-height`, `touch-target-min`, and the control-surface tokens.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-multi-select-radius` (control corner radius; falls back to `radius-md`), `--aui-multi-select-bg` (control background; falls back to `color-surface`), `--aui-multi-select-border-color` (control boundary; falls back to `color-border-strong`), `--aui-multi-select-padding-x` (control inline padding around chips; falls back to `space-1`), `--aui-multi-select-height` (control minimum height and toggle width; falls back to `control-height-md`), `--aui-multi-select-popup-radius` (listbox corner radius; falls back to `radius-md`), `--aui-multi-select-popup-shadow` (listbox elevation; falls back to `shadow-md`), `--aui-multi-select-option-radius` (option corner radius; falls back to `radius-sm`), `--aui-multi-select-chip-bg` (chip background; falls back to `color-surface-sunken`), `--aui-multi-select-chip-fg` (chip label; falls back to `color-text`), `--aui-multi-select-chip-radius` (chip corner radius; falls back to `radius-sm`).

## 11. States

closed, open, filtering, loading, load error, empty results, option active, option selected, option disabled, maximum reached, disabled, read-only, invalid, required.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | ArrowDown/ArrowUp, typing, toggle click | open |
| open | Enter on an active option / option click | option toggled (`aui-change`); stays open unless `closeOnSelect` |
| open | Escape, Tab, outside pointer, blur | closed (the typed text is cleared on blur) |
| any (empty input) | Backspace | last value removed (`aui-change`) |
| selection below maximum | value reaches `maxSelected` | unselected options unavailable; announced |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowDown / ArrowUp | Closed | Open; activate the first / last enabled option. |
| Alt+ArrowDown | Closed | Open without activating an option. |
| ArrowDown / ArrowUp | Open | Move the active option (skip unavailable, wrap). |
| PageDown / PageUp | Open | Move by 10. |
| Ctrl+Home / Ctrl+End | Open | First / last option. |
| Enter | Open, option active | Toggle it (Select all toggles the options shown). |
| Backspace | Empty input | Remove the last selected value. |
| Escape | Open / closed with text | Close / clear the text. |
| Tab | Any | Close and move focus. Chip remove buttons are tab stops before the input. |
| Characters | Any | Edit, open, filter (or load). |

## 14. ARIA contract

- The input has `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` -> listbox, and `aria-activedescendant` -> active option.
- The listbox has `aria-multiselectable="true"`. Options carry `aria-selected` and `aria-disabled`.
- Selected values are a list labelled "Selected: {label}"; each remove button is labelled "Remove {label}".
- The input reflects state through `aria-invalid`, `aria-required`, and `aria-describedby` (description and error).

## 15. Accessibility notes

- No automatic selection: typing never changes the value until the user toggles an option.
- Selections and removals ("{label} selected", "{label} removed"), result counts, loading errors, and reaching the maximum are announced in the shared polite live region.
- Selection is shown with a check mark and `aria-selected`, never by color alone; the active option is outlined (WCAG 1.4.1).
- Remove buttons meet the minimum target size (`touch-target-min`, WCAG 2.5.8). After removing a value, focus returns to the input.
- Verified with axe (WCAG 2.2 AA) with chips and the listbox open in 3 themes; the create budget is checked in `tests/e2e/perf-forms.spec.ts`.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The control fills its container and wraps chips onto new lines. The listbox matches the control width, flips above when space below is insufficient, and caps its height to `min(popover-max-height, available space)`.

## 17. RTL behavior

Logical properties throughout. Popup alignment follows the `direction` option or configuration.

## 18. Theme behavior

Token-driven. In forced-colors mode, selected options use `Highlight`/`HighlightText`, the active outline uses `Highlight`, and chips and the popup use `CanvasText` boundaries.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { multiSelect: { filter: 'startsWith', closeOnSelect: true } } });
```

## 20. Component configuration support

Instance options override global and theme defaults. All configurable options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (default `chevron-down`), `icons.selected` (default `check`), `icons.remove` (default `close`), and `icons.error` (default `alert-circle`). Required fields show the shared visual-only asterisk.

## 23. Security behavior

Option and chip labels use `textContent`; loaded options are validated as untrusted data. Positioning writes styles through the CSSOM only, so no style attributes are used. CSP-safe.

## 24. Data handling behavior

No persistence or telemetry. With `loadOptions`, the consumer performs requests. With `name`, one hidden input per selected value carries the selection for form submission.

## 25. Performance characteristics

Filtering is O(n) per keystroke using a normalized comparison: NFD form, diacritics removed, locale lowercase. All filtered options are rendered.

Budget in headless Chromium: create with 1,000 options under 100 ms.

## 26. Supported data scale

Tested with 1,000 options. Larger lists should use `loadOptions`; virtualization is not available.

## 27. Usage examples

```ts
import { MultiSelect } from '@absoluteui/components/multi-select';

const host = document.createElement('div');
document.body.append(host);
MultiSelect.create(host, {
  label: 'Skills',
  name: 'skills',
  selectAll: true,
  options: [
    { value: 'ts', label: 'TypeScript' },
    { value: 'sql', label: 'SQL' },
  ],
});
```

More examples, type-checked in CI: `metadata/multi-select/examples.json`.

## 28. Edge cases

- Unknown and duplicate values in `value` or `setValue()` are dropped.
- Selected values stay selected, with their last known labels, when `options` or loaded results change; this keeps chips stable with `loadOptions`. To drop values, call `setValue()` (no `aui-change`).
- Disabled options, and unselected options once `maxSelected` is reached, cannot be activated with the keyboard or clicked.
- Select all with a maximum selects options in list order until the maximum is reached.
- Inside a modal dialog, the listbox renders above the dialog, and Escape closes the listbox before the dialog.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `MULTI_SELECT_OPTIONS` | configuration | Missing label, non-array options, malformed option, duplicate value, or an invalid option (for example `maxSelected` below 1). Messages name the property, never the value. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- Strict selection only; no custom values. Typed text is cleared when focus leaves.
- No virtualization or option groups.
- Chips cannot be reordered.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Non-string option values.
- Duplicate option values.
- Free-text tags.

## 32. TypeScript definitions

```ts
interface MultiSelectOption { readonly value: string; readonly label: string; readonly disabled?: boolean; readonly description?: string }
interface MultiSelectChangeDetail { value: string[]; added: string[]; removed: string[] }
type MultiSelectFilter = 'contains' | 'startsWith' | 'none';
```

## 33. Vanilla JS example

```ts
import { MultiSelect, type MultiSelectChangeDetail } from '@absoluteui/components/multi-select';
import '@absoluteui/components/multi-select/style.css';

const host = document.querySelector<HTMLElement>('#tags');
if (host) {
  MultiSelect.create(host, { label: 'Tags', options: [{ value: 'urgent', label: 'Urgent' }, { value: 'billing', label: 'Billing' }] });
  host.addEventListener('aui-change', (e) => {
    console.log((e as CustomEvent<MultiSelectChangeDetail>).detail.value);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { MultiSelectOption } from '@absoluteui/components/multi-select';
import { AuiMultiSelect } from '@absoluteui/angular/multi-select';

@Component({
  selector: 'app-skills',
  imports: [ReactiveFormsModule, AuiMultiSelect],
  template: `<aui-multi-select label="Skills" [options]="skills" [selectAll]="true" [maxSelected]="5" [formControl]="chosen"></aui-multi-select>`,
})
export class SkillsComponent {
  readonly skills: MultiSelectOption[] = [
    { value: 'ts', label: 'TypeScript' },
    { value: 'sql', label: 'SQL' },
  ];
  readonly chosen = new FormControl<string[]>([], { nonNullable: true, validators: [Validators.required] });
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiMultiSelect } from '@absoluteui/react/multi-select';

const skills = [{ value: 'ts', label: 'TypeScript' }, { value: 'sql', label: 'SQL' }];

export function Example() {
  const [value, setValue] = useState<string[]>([]);
  return <AuiMultiSelect label="Skills" options={skills} value={value} onValueChange={setValue} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiMultiSelect } from '@absoluteui/vue/multi-select';
const skills = [{ value: 'ts', label: 'TypeScript' }, { value: 'sql', label: 'SQL' }];
const value = ref<string[]>([]);
</script>

<template>
  <AuiMultiSelect v-model="value" label="Skills" :options="skills" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
