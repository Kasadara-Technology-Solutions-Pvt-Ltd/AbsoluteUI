# Combobox

> Package: `@absoluteui/components/combobox` | Styles: `@absoluteui/components/combobox/style.css` | Since 0.1.0 | Status: R0 reference component

## 1. Purpose

An editable single-select combobox with list autocomplete (WAI-ARIA 1.2), without automatic selection.
- DOM focus stays on the input; the active option is conveyed through `aria-activedescendant`.
- The listbox renders in the browser top layer (Popover API) and is positioned by the positioning engine.

## 2. Anatomy

```text
<div class="aui-combobox">                         (consumer host)
  <label class="aui-combobox__label" for=input>
  <div class="aui-combobox__control">
    <input role="combobox" class="aui-combobox__input">
    <button class="aui-combobox__toggle" tabindex="-1" aria-label="Show options">
  </div>
  <div class="aui-combobox__description"> <div class="aui-combobox__error">
  <input type="hidden" name>
  <div class="aui-combobox__popup" popover="manual">
    <div role="listbox" class="aui-combobox__listbox"> <div role="option">... </div>
    <div class="aui-combobox__empty">No results</div>
  </div>
</div>
```

## 3. When to use

- Choosing one value from a list long enough to benefit from filtering (roughly 7 or more options).
- Forms that submit a single option value.

## 4. When not to use

- Fewer than about 7 options: use a radio group or native select.
- Free text with suggestions: custom values are not supported.
- Multiple selection: use [Multi Select](multi-select.md), or Checkbox Group for a few options.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `input` | `HTMLInputElement` | Combobox input. |
| `listbox` | `HTMLDivElement` | Listbox. |
| `value` | `string \| null` | Selected value. |
| `selectedOption` | `ComboboxOption \| null` | Selected option. |
| `isOpen` | `boolean` | Whether the listbox is shown. |

Options: `label` (required), `options` (required, unique values), `value`, `name`, `placeholder`, `description`, `required`, `disabled`, `readOnly`, `invalid`, `errorMessage`, `icons`, and since 0.9.0 `renderOption`, `loadOptions`, and `loadDelay`. The globally configurable options are listed below.

Async options (since 0.9.0): with `loadOptions(query, { signal })`, typing loads the matching options instead of filtering `options`. Requests are debounced by `loadDelay` (default 250 ms); a newer query or closing the list aborts the previous request through `signal`. While loading, the list shows and the listbox reports busy state; a failed load shows and announces "Could not load options.". Selection stays strict: the value is always a loaded or known option, so keep the selected option in `options` when the value is set from outside. `renderOption(option, { doc })` gives options custom, decorative content (the label stays the accessible name); nodes are released with `releaseNode()` when dropped. Full table: `metadata/combobox/api.json`.

| Global option | Type | Default |
|---|---|---|
| `filter` | `'contains' \| 'startsWith' \| 'none'` | `'contains'` |
| `openOnFocus` | `boolean` | `false` |
| `clearOnEscape` | `boolean` | `true` |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Combobox.create(host, options)` | Render into an empty host. Validates options before touching the DOM. |
| `setValue(value)` | Programmatic selection; no `aui-change`. Unknown values clear the selection. |
| `update(options)` | Merge and apply options. |
| `open()` / `close()` | Show or hide the listbox. |
| `reportValidity()` | Show messages now (for example on submit); returns whether the value is valid. |
| `setCustomError(message)` | External error (server, cross-field rule); cleared when the user changes the value. `null` clears it. |
| `getFormValue()` | Value for form serialization (`Form`, SPEC section 18.8). |
| `focus()` | Focus the control. |
| `reset()` | Restore the initial value and clear touched/submitted state; no `aui-change`. |
| `destroy()` | Close, then remove listeners, subscriptions, and rendered children. |

Since 0.2.0 Combobox implements the form-control contract (`name`, `label`, `disabled`, `validity`, `dirty`, `touched`), so `Form` validates it. With `required`, an empty value is `value-missing` ("Select an option."), shown after blur or `reportValidity()`. Consumer-managed `invalid`/`errorMessage` still take precedence and show immediately.

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-change` | `{ value, option }` | Yes | The user changed the selection. |
| `aui-input` | `{ query }` | Yes | The user edited the text. |
| `aui-open` / `aui-close` | `null` | No | The listbox was shown or hidden. |

## 8. Slots/content areas

None. Options are data (`{ value, label, disabled?, description? }`).

## 9. CSS parts/hooks

See the anatomy above. State modifiers: `aui-combobox--invalid` and `--disabled`. The active option is marked with `aui-combobox__option--active`. The positioning engine publishes `--aui-available-height` on the popup.

## 10. Design tokens

See `metadata/combobox/tokens.json` (35 tokens, verified in CI). Key tokens: `color-selected`, `color-selected-text`, `color-selected-indicator`, `color-hover`, `color-focus-ring`, `popover-max-height`, `shadow-md`, and the control-surface tokens.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-combobox-radius` (combobox input corner radius; falls back to `radius-md`), `--aui-combobox-bg` (combobox input background; falls back to `color-surface`), `--aui-combobox-border-color` (combobox input boundary; falls back to `color-border-strong`), `--aui-combobox-padding-x` (combobox input inline padding; falls back to `control-padding-x`), `--aui-combobox-height` (combobox input height (and toggle width); falls back to `control-height-md`), `--aui-combobox-popup-radius` (combobox listbox corner radius; falls back to `radius-md`), `--aui-combobox-popup-shadow` (combobox listbox elevation; falls back to `shadow-md`), `--aui-combobox-option-radius` (combobox option corner radius; falls back to `radius-sm`).

## 11. States

closed, open, filtering, empty results, option active, option selected, option disabled, disabled, read-only, invalid, required.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | ArrowDown/ArrowUp, typing, toggle click | open |
| open | Enter on an active option / option click | closed + selected (`aui-change`) |
| open | Escape, Tab, outside pointer, blur | closed (value unchanged; text reverts to the selected label) |
| closed (has value) | Escape with `clearOnEscape` | cleared (`aui-change` with `null`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowDown | Closed | Open; activate the selected option or the first enabled option. |
| ArrowUp | Closed | Open; activate the selected option or the last enabled option. |
| Alt+ArrowDown | Closed | Open without activating an option. |
| ArrowDown / ArrowUp | Open | Move the active option (skip disabled, wrap). |
| PageDown / PageUp | Open | Move by 10. |
| Enter | Open, option active | Select, close. |
| Escape | Open | Close. |
| Escape | Closed with a value | Clear (if `clearOnEscape`). |
| Tab | Any | Close; revert free text. |
| Characters | Any | Edit, open, filter. |

## 14. ARIA contract

- The input has `role="combobox"`, `aria-autocomplete="list"`, `aria-expanded`, `aria-controls` -> listbox, and `aria-activedescendant` -> active option.
- Options carry `aria-selected` and `aria-disabled`.
- The input reflects state through `aria-invalid`, `aria-required`, and `aria-describedby` (description and error).

## 15. Accessibility notes

- No automatic selection. Typing never changes the value until the user confirms.
- Result counts are announced in a shared polite live region, 400 ms after typing stops.
- The active option is outlined, so it does not rely on color alone (WCAG 1.4.1).
- Verified with axe (WCAG 2.2 AA) while open in 3 themes.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

The input fills its container, and the listbox matches the input width. The listbox flips above the input when space below is insufficient; this is verified at a 375x667 viewport. Height is capped by `min(popover-max-height, available space)`.

## 17. RTL behavior

Logical properties throughout. Popup alignment follows the `direction` option or configuration.

## 18. Theme behavior

Token-driven. In forced-colors mode, the selected option uses `Highlight`/`HighlightText` and the active outline uses `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { combobox: { filter: 'startsWith', openOnFocus: true } } });
```

## 20. Component configuration support

Instance options override global and theme defaults. All configurable options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (default `chevron-down`), `icons.selected` (default `check`), and `icons.error` (default `alert-circle`, since 0.2.0). Required fields show the shared visual-only asterisk.

## 23. Security behavior

Labels and descriptions use `textContent`. Positioning writes styles through the CSSOM only, so no style attributes are used. Verified under a strict CSP with Trusted Types enforced.

## 24. Data handling behavior

No persistence, network access, or telemetry. The hidden input holds the selected value when `name` is set.

## 25. Performance characteristics

Filtering is O(n) per keystroke using a normalized comparison: NFD form, diacritics removed, locale lowercase. All filtered options are rendered.

Budgets in headless Chromium:
- create with 1,000 options: under 100 ms;
- filter keystroke with 1,000 options: under 50 ms.

## 26. Supported data scale

Tested with 1,000 options. Larger lists need virtualization, which is not available; use `loadOptions` to load matching options instead.

## 27. Usage examples

```ts
import { Combobox } from '@absoluteui/components/combobox';

const host = document.createElement('div');
document.body.append(host);
Combobox.create(host, {
  label: 'Country',
  name: 'country',
  options: [
    { value: 'in', label: 'India' },
    { value: 'jp', label: 'Japan' },
  ],
});
```

More examples, type-checked in CI: `metadata/combobox/examples.json`.

## 28. Edge cases

- The popup is hidden by the browser until its first open, because `popover="manual"` is set at construction.
- Inside a modal dialog, the listbox renders above the dialog, and Escape closes the listbox before the dialog.
- Disabled options cannot be activated with the keyboard or clicked.
- Updating `options` so the selected value no longer exists clears `value`, the input text, and the hidden input. No `aui-change` is emitted, because the change is programmatic.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `COMBOBOX_OPTIONS` | configuration | Missing label, non-array options, malformed option, or duplicate value. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- Strict selection only; no custom values.
- No virtualization or option groups; one value only (use Multi Select for several).
- Substring or prefix matching only; no fuzzy search.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Custom option templates.
- Non-string option values.
- Duplicate values.

## 32. TypeScript definitions

```ts
interface ComboboxOption { readonly value: string; readonly label: string; readonly disabled?: boolean; readonly description?: string }
interface ComboboxChangeDetail { value: string | null; option: ComboboxOption | null }
type ComboboxFilter = 'contains' | 'startsWith' | 'none';
```

## 33. Vanilla JS example

```ts
import { Combobox, type ComboboxChangeDetail } from '@absoluteui/components/combobox';
import '@absoluteui/components/combobox/style.css';

const host = document.querySelector<HTMLElement>('#fruit');
if (host) {
  Combobox.create(host, { label: 'Fruit', options: [{ value: 'apple', label: 'Apple' }] });
  host.addEventListener('aui-change', (e) => {
    console.log((e as CustomEvent<ComboboxChangeDetail>).detail.value);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import type { ComboboxOption } from '@absoluteui/components/combobox';
import { AuiCombobox } from '@absoluteui/angular/combobox';

@Component({
  selector: 'app-assign',
  imports: [ReactiveFormsModule, AuiCombobox],
  template: `<aui-combobox label="Assignee" placeholder="Search people" [options]="people" [required]="true" [formControl]="assignee"></aui-combobox>`,
})
export class AssignComponent {
  readonly people: ComboboxOption[] = [
    { value: 'ada', label: 'Ada Lovelace' },
    { value: 'alan', label: 'Alan Turing' },
  ];
  readonly assignee = new FormControl<string | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
