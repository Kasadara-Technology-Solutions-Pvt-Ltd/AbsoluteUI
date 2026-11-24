# Cascader

> Package: `@absoluteui/components/cascader` | Styles: `@absoluteui/components/cascader/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Selects a node in a hierarchy through cascading columns: country > state > city, division > department > team, category > subcategory. The trigger is a select-only combobox whose popup is a non-modal dialog with a search box and one listbox per level. Children can load lazily (`loadChildren`) with a loading state, abort, and retry. Search lists the matching paths of every loaded node. Single or multiple selection; the trigger shows the selected path. `Cascader` is a Form control: it validates, serializes, and resets with Form, and native forms receive the selected leaf values.

## 2. Anatomy

```text
<div class="aui-field aui-cascader [--multiple]">
  <label class="aui-field__label" for="trigger">Work location</label>
  <div class="aui-cascader__control">
    <button class="aui-cascader__trigger" role="combobox" aria-haspopup="dialog" aria-expanded aria-controls="popup" aria-labelledby="label text">
      <span class="aui-cascader__text">India / Karnataka / Bengaluru</span><span class="aui-cascader__caret">(chevron)</span>
    </button>
    <button class="aui-cascader__clear" aria-label="Clear selection"></button>
  </div>
  <ul class="aui-cascader__chips"><li class="aui-cascader__chip">path <button class="aui-cascader__chip-remove" aria-label="Remove path"></button></li></ul>  (multiple)
  <div class="aui-field__description">help</div>
  <div class="aui-field__error">error</div>
  <div class="aui-cascader__popup" role="dialog" popover="manual" aria-labelledby="label">
    <input type="search" class="aui-cascader__search" aria-label="Search">
    <div class="aui-cascader__columns">
      <div class="aui-cascader__column">
        <ul class="aui-cascader__list" role="listbox" aria-label="Country" aria-activedescendant>
          <li class="aui-cascader__option" role="option" aria-selected>India<span class="aui-visually-hidden">, has more levels</span>(chevron)</li>
        </ul>
        <div class="aui-cascader__status" role="status">Loading... | Could not load options. <button>Retry</button></div>
      </div>
      ... one column per open level
    </div>
    <div class="aui-cascader__results" hidden><ul role="listbox">paths</ul><div role="status">3 results</div></div>
  </div>
  <div hidden><input type="hidden" name="city" value="blr"></div>
</div>
```

## 3. When to use

- Locations, organization units, product categories: hierarchies of two to five levels.
- Large hierarchies loaded level by level from a server.

## 4. When not to use

- A flat list: use Select or Combobox.
- Deep or irregular trees where users must see the whole structure: use a tree view.
- Two levels with few options: two dependent Selects are simpler.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `trigger` | `HTMLButtonElement` | The trigger. |
| `value` | `CascaderValue` | A path or `null`; a list of paths with `multiple` (copies). |
| `open` | `boolean` | Whether the popup is open. |
| `validity` | `FieldValidity` | Current validity. |
| `dirty` / `touched` | `boolean` | Changed from the initial value / focus has left once. |
| `options` | `Readonly<CascaderOptions>` | Current options. |

Options (`CascaderOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `options` | `readonly CascaderOption[]` | - (required) | No | `{ value, label, children?, isLeaf?, disabled? }`; sibling values are unique. |
| `value` | `CascaderValue` | `null` / `[]` | No | A path (or `null`); a list of paths with `multiple`. |
| `multiple` | `boolean` | `false` | No | Several paths, shown as removable chips. |
| `changeOnSelect` | `boolean` | `false` | No | Any node can be selected, not only leaves. |
| `loadChildren` | `(option, { signal, path }) => Promise<CascaderOption[]>` | - | No | Lazy children; aborted on close and destroy. |
| `searchable` | `boolean` | `true` | No | Search box in the popup. |
| `maxResults` | `number` | `50` | No | Maximum search results (1 to 1000). |
| `levelLabels` | `readonly string[]` | Level n | No | Names of the level listboxes. |
| `placeholder` | `string` | Select | No | Trigger text when empty. |
| `clearable` | `boolean` | `true` | No | Clear button for an optional single selection. |
| `name` | `string` | - | No | Hidden inputs carrying the leaf values. |
| `required` | `boolean` | `false` | No | A selection is required. |
| `disabled` | `boolean` | `false` | No | Disable the control. |
| `readOnly` | `boolean` | `false` | No | Show the value; the popup does not open. |
| `validate` | `(value) => string \| null` | - | No | Consumer validation. |
| `icons` | `Partial<CascaderIcons>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and search matching. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Arrow keys and popup alignment. |

## 6. Methods

| Method | Description |
|---|---|
| `Cascader.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the value (no event). |
| `show()` / `close(restoreFocus?)` | Open or close the popup; closing aborts pending loads. |
| `getFormValue()` | Leaf value (`string \| null`), or leaf values with `multiple`. |
| `reportValidity()` | Show messages now and return validity. |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `focus()` | Focus the trigger. |
| `reset()` | Restore the initial value and clear messages. |
| `update(options)` | Merge and apply options; new `options` or `loadChildren` collapse the open levels. |
| `destroy()` | Close, abort loads, remove rendering, listeners, and the form registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: CascaderValue, labels: string[] \| string[][] \| null, validity }` | A path was selected, toggled, removed, or cleared. |
| `aui-open` / `aui-close` | `null` (not bubbling) | The popup opened or closed. |

## 8. Slots/content areas

None. Options are text.

## 9. CSS parts/hooks

`aui-cascader`, `--multiple|--disabled|--invalid`, `__control`, `__trigger`, `__text`, `__text--placeholder`, `__caret`, `__clear`, `__chips`, `__chip`, `__chip-remove`, `__popup`, `__search`, `__columns`, `__column`, `__list`, `__option`, `__option--active|expanded`, `__option-label`, `__next`, `__results`, `__result-list`, `__status`, `__status--loading|error`, `__spinner`, `__retry`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/cascader/tokens.json` (verified in CI). No component tokens: the trigger uses the shared control surface, the popup `color-surface`, `color-border`, and `shadow-md`, selected options `color-selected` and `color-selected-text`, and the expanded node `color-surface-sunken`.

## 11. States

Closed; open; level loading; level load error; searching; no results; selected path; multiple (chips); read-only; disabled; invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | click, Enter, Space, ArrowDown on the trigger | open; focus in the search box (or the first level); the selected path is expanded |
| open | ArrowRight / click on a node | the next level opens (loads first when needed: spinner, `aria-busy`) |
| loading | children arrive | the level appears and receives focus |
| loading | the load rejects | "Could not load options." and a focused Retry button; announced |
| open | Enter / click on a leaf | single: selected, closed, focus on the trigger; multiple: toggled, stays open; `aui-change` |
| open | type in the search box | the levels are replaced by matching paths |
| open | Escape / outside pointer / Tab out | closed; pending loads aborted |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space / ArrowDown | Trigger | Open the popup. |
| ArrowDown / ArrowUp / Home / End | Level | Move within the level (disabled options are skipped). |
| ArrowRight (ArrowLeft in RTL) | Level | Open the active node's children and move there. |
| ArrowLeft (ArrowRight in RTL) | Level | Back to the previous level. |
| Enter | Level | Select a leaf (or a node with `changeOnSelect`); otherwise open its children. |
| Space | Level | Select a leaf; open a node's children. |
| Printable characters | Level | Type-ahead. |
| ArrowDown | Search box | Into the results (or the levels when empty). |
| Enter | Search box / results | Select the active result. |
| Escape | Popup | Close; focus returns to the trigger. |
| Tab | Popup | Search box, then the current level; tabbing out closes. |

## 14. ARIA contract

- Trigger: `role="combobox"` on a `<button>`, `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls`, `aria-labelledby` (label + selected path), `aria-required`, `aria-readonly`, `aria-invalid`, `aria-describedby` (help and error).
- Popup: `role="dialog"`, labelled by the label, non-modal, in the top layer.
- Levels: `role="listbox"` named by `levelLabels`, `aria-activedescendant`, `aria-multiselectable` with `multiple`; options carry `aria-selected` (on the selected path) and `aria-disabled`.
- Nodes with children include a visually hidden ", has more levels" because options cannot expose `aria-expanded`.
- A loading level is `aria-busy`; loading, errors, and result counts are `role="status"`; selections and removals are announced.

## 15. Accessibility notes

- Name the levels with `levelLabels` so screen readers hear "Country", "State", "City".
- Load errors move focus to Retry; the error is announced assertively.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The trigger fills its container. The popup shows the columns side by side up to 48rem (or the viewport width) and scrolls horizontally beyond that; each level scrolls vertically.

## 17. RTL behavior

Columns run right to left, ArrowLeft opens the next level, ArrowRight goes back, and the chevrons are mirrored.

## 18. Theme behavior

All colors are global tokens. Forced colors use `Highlight`/`HighlightText` for selected options and `CanvasText` for the popup border and the active outline. The loading spinner stops under reduced motion.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { cascader: { validationTiming: 'submit' } } });
```

## 20. Component configuration support

Instance `validationTiming`, `locale`, and `direction` override configuration; configuration changes re-render existing instances.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (`chevron-down`), `icons.next` (`chevron-right`, mirrored in RTL), `icons.remove` (`close`), `icons.loading` (`spinner`), `icons.error` (`alert-circle`).

## 23. Security behavior

Labels and paths use `textContent`. Loaded children are checked (`value` and `label` strings) before use; anything else is treated as a load error.

## 24. Data handling behavior

Loaded children are cached per node for the component's lifetime; interrupted and failed loads are retried the next time the node opens. `loadChildren` receives an `AbortSignal` that aborts when the popup closes or the component is destroyed.

## 25. Performance characteristics

Opening a level renders its options once; search walks the loaded tree and stops at `maxResults`.

## 26. Supported data scale

Levels of up to 1,000 options and up to 32 levels. Columns are not windowed: load very long levels lazily.

## 27. Usage examples

```ts
import { Cascader } from '@absoluteui/components/cascader';

const host = document.querySelector<HTMLElement>('#category');
if (host) {
  Cascader.create(host, {
    label: 'Expense category',
    levelLabels: ['Group', 'Category'],
    options: [
      { value: 'travel', label: 'Travel', children: [{ value: 'air', label: 'Air fare' }, { value: 'hotel', label: 'Hotel' }] },
      { value: 'office', label: 'Office', children: [{ value: 'supplies', label: 'Supplies' }] },
    ],
  });
}
```

More examples, type-checked in CI: `metadata/cascader/examples.json`.

## 28. Edge cases

- A value whose path is not loaded shows the raw values for the unknown segments until those levels load; include the selected path in `options` to avoid this.
- A lazily loaded node that returns no children becomes a leaf and can be selected.
- Moving within a level collapses the deeper levels of the previous node.
- With `multiple`, the same path is never added twice; selecting it again removes it.
- `getFormValue()` and the hidden inputs carry the leaf values; `value` carries the full paths.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CASCADER_OPTIONS` | configuration | Blank label, an invalid options tree (non-string value or label, duplicate sibling values, deeper than 32 levels), a value of the wrong shape for `multiple`, a non-function `loadChildren` or `validate`, invalid `maxResults` or `levelLabels`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact. A rejected or malformed `loadChildren` result shows the level's error state.

## 30. Known limitations

- Search finds only loaded nodes; it does not call `loadChildren`.
- Columns are not windowed.

## 31. Unsupported scenarios

- Server-side search across unloaded levels (use Combobox with `loadOptions` returning paths).
- Editing or reordering the hierarchy.

## 32. TypeScript definitions

```ts
interface CascaderConfig { validationTiming: 'blur' | 'input' | 'submit' }
interface CascaderOption { value: string; label: string; children?: readonly CascaderOption[]; isLeaf?: boolean; disabled?: boolean }
type CascaderPath = readonly string[];
type CascaderValue = CascaderPath | readonly CascaderPath[] | null;
interface CascaderLoadContext { signal: AbortSignal; path: readonly string[] }
interface CascaderIcons { expand: IconRef; next: IconRef; remove: IconRef; loading: IconRef; error: IconRef }
interface CascaderOptions extends Partial<CascaderConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  options: readonly CascaderOption[];
  value?: CascaderValue;
  multiple?: boolean;
  changeOnSelect?: boolean;
  loadChildren?: (option: CascaderOption, context: CascaderLoadContext) => Promise<readonly CascaderOption[]>;
  searchable?: boolean;
  maxResults?: number;
  levelLabels?: readonly string[];
  placeholder?: string;
  clearable?: boolean;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  validate?: (value: CascaderValue) => string | null;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  icons?: Partial<CascaderIcons>;
}
interface CascaderValueDetail { value: CascaderValue; labels: string[] | string[][] | null; validity: FieldValidity }
```

## 33. Vanilla JS example

```ts
import { Cascader } from '@absoluteui/components/cascader';
import '@absoluteui/components/cascader/style.css';

const host = document.querySelector<HTMLElement>('#location');
if (host) {
  Cascader.create(host, {
    label: 'Location',
    name: 'city',
    levelLabels: ['Country', 'City'],
    options: [
      { value: 'in', label: 'India', children: [{ value: 'blr', label: 'Bengaluru' }, { value: 'pnq', label: 'Pune' }] },
      { value: 'uk', label: 'United Kingdom', children: [{ value: 'lon', label: 'London' }] },
    ],
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { CascaderOption, CascaderValue } from '@absoluteui/components/cascader';
import { AuiCascader } from '@absoluteui/angular/cascader';

@Component({
  selector: 'app-location-field',
  imports: [AuiCascader],
  template: `<aui-cascader label="Location" [options]="tree" [(value)]="location"></aui-cascader>`,
})
export class LocationFieldComponent {
  readonly tree: CascaderOption[] = [{ value: 'in', label: 'India', children: [{ value: 'blr', label: 'Bengaluru' }] }];
  location: CascaderValue = ['in', 'blr'];
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiCascader } from '@absoluteui/react/cascader';
import type { CascaderOption, CascaderValue } from '@absoluteui/components/cascader';

const tree: CascaderOption[] = [{ value: 'in', label: 'India', children: [{ value: 'blr', label: 'Bengaluru' }] }];

export function Example() {
  const [location, setLocation] = useState<CascaderValue>(null);
  return <AuiCascader label="Location" options={tree} value={location} onValueChange={setLocation} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiCascader } from '@absoluteui/vue/cascader';
import type { CascaderOption, CascaderValue } from '@absoluteui/components/cascader';

const tree: CascaderOption[] = [{ value: 'in', label: 'India', children: [{ value: 'blr', label: 'Bengaluru' }] }];
const location = ref<CascaderValue>(null);
</script>

<template>
  <AuiCascader v-model="location" label="Location" :options="tree" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
