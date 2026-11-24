# Tree Select

> Package: `@absoluteui/components/tree-select` | Styles: `@absoluteui/components/tree-view/style.css` and `@absoluteui/components/tree-select/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

A form control for choosing one or several nodes of a hierarchy: a combobox-style field (`aria-haspopup="tree"`) whose popup is a Tree View. Typing filters the tree while the paths to matches stay visible; Down Arrow moves focus into the tree, where the APG tree keys apply. Single mode closes the popup on choice; multiple mode uses tri-state checkboxes and shows the values as removable tags, like Multi Select. It supports lazy children, a clear button, required validation, Form integration, and hidden inputs for native form submission. The popup renders in the top layer (Popover API) with the shared positioning engine used by Select, Combobox, and Multi Select.

## 2. Anatomy

```text
<div class="aui-tree-select aui-tree-select--multiple">
  <label class="aui-tree-select__label" for="...">Locations</label>
  <div class="aui-tree-select__control">
    <ul class="aui-tree-select__tags" aria-label="Selected: Locations">
      <li class="aui-tree-select__tag"><span class="aui-tree-select__tag-label">Europe</span><button class="aui-tree-select__remove" aria-label="Remove Europe"></button></li>
    </ul>
    <input class="aui-tree-select__input" role="combobox" aria-haspopup="tree" aria-expanded="false" aria-controls="tree-id">
    <button class="aui-tree-select__clear" aria-label="Clear selection"></button>
    <button class="aui-tree-select__toggle" tabindex="-1" aria-label="Show options" aria-expanded="false"></button>
  </div>
  <div class="aui-tree-select__description">...</div>
  <div class="aui-tree-select__error">...</div>
  <span class="aui-tree-select__values" hidden><input type="hidden" name="locations" value="emea"></span>
  <div class="aui-tree-select__popup" popover="manual"><div class="aui-tree-select__tree aui-tree-view">...</div></div>
</div>
```

## 3. When to use

- Picking a department, cost center, location, or category from a hierarchy in a form.
- Choosing several nodes where checking a parent means all of its children (permissions, regions).

## 4. When not to use

- Flat option lists: use Select, Combobox, or Multi Select.
- Browsing or editing a hierarchy outside a form: use Tree View.
- Dependent levels shown side by side: use separate Selects.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `input` | `HTMLInputElement` | The search field (`role="combobox"`). |
| `value` | `string[]` | Selected node ids. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `tree` | `TreeView \| null` | The Tree View in the popup. |
| `name`, `label`, `disabled` | | Form control contract. |
| `validity`, `dirty`, `touched` | | Validation state. |

Options (`TreeSelectOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label (accessible name). |
| `nodes` | `readonly TreeNode[]` | - (required) | No | The tree (see Tree View). |
| `mode` | `'single' \| 'multiple'` | `'single'` | No | One choice, or several with checkboxes and tags. |
| `value` | `readonly string[]` | `[]` | No | Selected ids (at most one in single mode). |
| `name` | `string` | - | No | One hidden input per selected id. |
| `placeholder`, `description` | `string` | - | No | Placeholder and help text. |
| `required`, `disabled`, `readOnly` | `boolean` | `false` | No | Field states. |
| `invalid`, `errorMessage` | `boolean`, `string` | - | No | External error. |
| `clearable` | `boolean` | `true` | No | Clear button. |
| `selectableParents` | `boolean` | `true` | No | Single mode: parents can be chosen; otherwise choosing a parent opens it. |
| `cascade` | `boolean` | `true` | No | Multiple mode: checking a parent checks its descendants. |
| `expanded` | `readonly string[]` | - | No | Ids expanded in the popup (the paths to the value are expanded too). |
| `loadChildren` | `(node, { signal }) => Promise<TreeNode[]>` | - | No | Lazy children. |
| `valueLabels` | `Record<string, string>` | - | No | Labels of selected ids whose nodes are not loaded yet. |
| `popupHeight` | `string` | `'16rem'` | No | Block size of the popup tree. |
| `density` | `Density` | common | No | Row height of the popup tree. |
| `icons` | `Partial<TreeSelectIcons>` | - | No | `expand`, `clear`, `remove`, `error`. |
| `openOnFocus` | `boolean` | `false` | Yes | Open the popup on focus. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and filtering. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Popup placement and tree arrow keys. |

## 6. Methods

| Method | Description |
|---|---|
| `TreeSelect.create(host, options)` | Render into `host`. |
| `open()` / `close()` | Open or close the popup. |
| `setValue(ids)` | Set the value (no `aui-change`). |
| `getFormValue()` | The id (single) or ids (multiple) for Form. |
| `reportValidity()` / `setCustomError(message)` | Validation. |
| `focus()` / `reset()` | Focus the field; restore the initial value. |
| `update(options)` / `destroy()` | Change options; remove the control. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: string[], added: string[], removed: string[] }` | The user changed the value. |
| `aui-input` | `{ query }` | The search text changed. |
| `aui-open` / `aui-close` | `null` | The popup opened or closed (do not bubble). |

The popup tree's own events stay inside the control.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-tree-select`, `--multiple`, `--invalid`, `--disabled`, `__label`, `__control`, `__input`, `__tags`, `__tag`, `__tag-label`, `__remove`, `__clear`, `__toggle`, `__popup`, `__tree`, `__description`, `__error`, `__values`; the popup tree uses the Tree View classes.

## 10. Design tokens

See `metadata/tree-select/tokens.json` (verified in CI). Component tokens: `--aui-tree-select-radius`, `--aui-tree-select-bg`, `--aui-tree-select-border-color`, `--aui-tree-select-padding-x`, `--aui-tree-select-height`, `--aui-tree-select-popup-radius`, `--aui-tree-select-popup-shadow`, `--aui-tree-select-tag-bg`, and `--aui-tree-select-tag-radius`. The popup tree uses the Tree View tokens.

## 11. States

Closed; open; filtering; no matches; loading children; load failed; selected; multiple tags; required missing; invalid; disabled; read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | typing, Down/Up, open button, focus with `openOnFocus` | open |
| open | choosing a node (single) | closed, value set, `aui-change`, focus on the field |
| open | toggling a checkbox (multiple) | value updated, `aui-change`, popup stays open |
| open | Escape, Tab, outside pointer | closed; the search text is cleared |
| selected | clear button, tag remove button, Backspace on an empty field | value reduced, `aui-change` |
| untouched | leaving the control | touched; a required error shows |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Typing | Field | Filter the tree (opens the popup). |
| Down / Up | Field | Open and move focus into the tree. |
| Alt + Down | Field | Open without moving focus. |
| Enter | Field, popup open | Move focus into the tree. |
| Escape | Field | Close, or clear the search text. |
| Backspace | Empty field, multiple | Remove the last tag. |
| Tree keys | Popup tree | See Tree View; Enter or Space chooses (single), Space toggles (multiple). |
| Escape / Tab | Popup tree | Close and return to the field. |

## 14. ARIA contract

- Input: `role="combobox"`, `aria-haspopup="tree"`, `aria-expanded`, `aria-controls` (the tree), `aria-autocomplete="list"`, `aria-required`, `aria-invalid`, `aria-describedby` (help and error text).
- The popup tree is a Tree View (`role="tree"`, named "<label> options"), with `aria-selected` (single) or `aria-checked` (multiple) on treeitems.
- Tags are a list named "Selected: <label>" with remove buttons named "Remove <label>"; the clear button is named "Clear selection"; the open button is `tabindex="-1"`.

## 15. Accessibility notes

- Additions, removals, and clearing are announced politely (WCAG 4.1.3).
- Validation messages appear after blur or submit (SPEC section 16.1).
- The e2e axe run covers three themes with the popup open; manual screen-reader verification is pending.

## 16. Responsive behavior

Fills its container; tags wrap inside the field. The popup matches the field width, flips above it when there is no room below, and limits its height to the available space.

## 17. RTL behavior

The field, tags, and buttons follow the writing direction; the popup tree mirrors indentation and arrow keys.

## 18. Theme behavior

Three themes through the role tokens; invalid fields use `color-error-fg`; forced colors keep boundaries visible.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { treeSelect: { openOnFocus: true } } });
```

## 20. Component configuration support

Instance `openOnFocus`, `locale`, and `direction` override configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (`chevron-down`), `icons.clear` (`close`), `icons.remove` (`close`), `icons.error` (`alert-circle`). Node icons come from the nodes.

## 23. Security behavior

Labels are text; hidden inputs carry node ids. No HTML is parsed.

## 24. Data handling behavior

No persistence, network access, or telemetry. `loadChildren` is the application's function with an `AbortSignal`.

## 25. Performance characteristics

The popup tree is a virtualized Tree View created once, so loaded children and expansion survive closing and reopening. Filtering is one pass over loaded nodes per keystroke.

## 26. Supported data scale

Tested with 10,000 nodes and 200 tags.

## 27. Usage examples

```ts
import { TreeSelect } from '@absoluteui/components/tree-select';

const host = document.querySelector<HTMLElement>('#location');
if (host) {
  TreeSelect.create(host, {
    label: 'Work location',
    name: 'location',
    nodes: [{ id: 'de', label: 'Germany', children: [{ id: 'ber', label: 'Berlin' }, { id: 'muc', label: 'Munich' }] }],
    selectableParents: false,
  });
}
```

More examples, type-checked in CI: `metadata/tree-select/examples.json`.

## 28. Edge cases

- Ids in `value` whose nodes are not loaded show their `valueLabels` entry, or the id.
- With cascade, setting a parent id checks its loaded descendants, so `value` grows to include them.
- Removing a tag of a fully checked parent unchecks its descendants too.
- Single mode rejects more than one id in `value`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TREE_SELECT_OPTIONS` | configuration | Blank label, nodes not an array, unknown `mode`, non-string ids in `value`, more than one id in single mode, `valueLabels` that is not a record of strings, or non-boolean flags. |
| `TREE_VIEW_OPTIONS` | configuration | Invalid nodes (see Tree View). |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- Filtering searches loaded nodes only.
- Multiple mode with cascade stores parents and children; tags show the topmost fully checked node.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Free-text values that are not nodes.
- Parent-only or leaf-only value modes (filter the value in `aui-change`).

## 32. TypeScript definitions

```ts
type TreeSelectMode = 'single' | 'multiple';
interface TreeSelectConfig { openOnFocus: boolean }
interface TreeSelectOptions extends Partial<TreeSelectConfig> {
  label: string;
  nodes: readonly TreeNode[];
  mode?: TreeSelectMode;
  value?: readonly string[];
  name?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  errorMessage?: string;
  clearable?: boolean;
  selectableParents?: boolean;
  cascade?: boolean;
  expanded?: readonly string[];
  loadChildren?: ((node: TreeNode, context: TreeViewLoadContext) => Promise<readonly TreeNode[]>) | null;
  valueLabels?: Readonly<Record<string, string>>;
  popupHeight?: string;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  density?: Density;
  icons?: Partial<TreeSelectIcons>;
}
interface TreeSelectChangeDetail { value: string[]; added: string[]; removed: string[] }
```

## 33. Vanilla JS example

```ts
import { TreeSelect } from '@absoluteui/components/tree-select';
import '@absoluteui/components/tree-view/style.css';
import '@absoluteui/components/tree-select/style.css';

const host = document.querySelector<HTMLElement>('#dept');
if (host) TreeSelect.create(host, { label: 'Department', name: 'department', nodes: [{ id: 'eng', label: 'Engineering' }, { id: 'ops', label: 'Operations' }] });
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiTreeSelect } from '@absoluteui/angular/tree-select';
import type { TreeNode } from '@absoluteui/components/tree-select';

@Component({
  selector: 'app-department-field',
  imports: [AuiTreeSelect],
  template: `<aui-tree-select label="Department" name="department" [nodes]="nodes" [(value)]="value"></aui-tree-select>`,
})
export class DepartmentFieldComponent {
  readonly nodes: TreeNode[] = [{ id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web' }] }];
  readonly value = signal<string[] | undefined>(['web']);
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
