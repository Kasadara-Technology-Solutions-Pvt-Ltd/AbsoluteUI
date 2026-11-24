# Transfer List

> Package: `@absoluteui/components/transfer-list` | Styles: `@absoluteui/components/transfer-list/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Moves items between two lists, **Available** and **Selected**: team members, permissions, report columns. Each list is a WAI-ARIA multi-select listbox with a search box and an item count. Four buttons move the checked or all visible items; Enter and double-click move too, and pointer drag between the lists is optional (`draggable`). Long lists are windowed, so 10,000 items stay fast. `TransferList` is a Form control: it validates, serializes, and resets with Form, and native forms receive one hidden input per selected value.

## 2. Anatomy

```text
<div class="aui-field aui-transfer-list">
  <label class="aui-field__label">Project team</label>
  <div class="aui-field__description">help</div>
  <div class="aui-transfer-list__body" role="group" aria-labelledby="label">
    <div class="aui-transfer-list__panel aui-transfer-list__panel--available">
      <div class="aui-transfer-list__head"><span class="aui-transfer-list__title">Available</span><span class="aui-transfer-list__count" role="status">3 of 120</span></div>
      <input type="search" class="aui-transfer-list__search" aria-label="Search Available">
      <ul class="aui-transfer-list__list" role="listbox" aria-multiselectable="true" aria-activedescendant>
        <li class="aui-transfer-list__option" role="option" aria-selected aria-setsize aria-posinset>(check) label description</li>  (visible rows only)
      </ul>
      <div class="aui-transfer-list__empty" aria-hidden="true">No matches</div>
    </div>
    <div class="aui-transfer-list__actions">4 x <button class="aui-transfer-list__move" aria-label="Move checked items to Selected"></button></div>
    <div class="aui-transfer-list__panel aui-transfer-list__panel--selected">(same)</div>
  </div>
  <div class="aui-field__error">error</div>
  <div hidden><input type="hidden" name="members" value="e2"> (one per selected value)</div>
</div>
```

## 3. When to use

- Choosing a subset from a long list where users benefit from seeing both what is chosen and what is left.
- Selections of tens to thousands of items that need search on both sides.

## 4. When not to use

- A few options: use Checkbox Group.
- Several items inline in a form row: use Multi Select.
- Ordering items: use Sortable List.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `value` | `TransferListValue` (`string[]`) | Selected values in Selected-list order (a copy). |
| `validity` | `FieldValidity` | Current validity. |
| `dirty` / `touched` | `boolean` | Changed from the initial value / focus has left once. |
| `options` | `Readonly<TransferListOptions>` | Current options. |

Options (`TransferListOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label; names the group. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the label. |
| `description` | `string` | - | No | Help text. |
| `items` | `readonly TransferListItem[]` | - (required) | No | `{ value, label, description?, disabled? }`; unique values. |
| `value` | `readonly string[]` | `[]` | No | Selected values; unknown values are dropped. |
| `name` | `string` | - | No | One hidden input per selected value. |
| `required` | `boolean` | `false` | No | At least one item selected. |
| `minSelected` | `number` | - | No | At least this many (when any are selected, or required). |
| `maxSelected` | `number` | - | No | Hard limit; moves beyond it are refused and announced. |
| `disabled` | `boolean` | `false` | No | Disable the control. |
| `readOnly` | `boolean` | `false` | No | Browse and search only. |
| `searchable` | `boolean` | `true` | No | Search box above each list. |
| `draggable` | `boolean` | `false` | No | Pointer drag between the lists. |
| `titles` | `{ available?, selected? }` | Available / Selected | No | List titles. |
| `visibleRows` | `number` | `8` | No | Rows visible before scrolling (3 to 50). |
| `validate` | `(value) => string \| null` | - | No | Consumer validation. |
| `icons` | `Partial<TransferListIcons>` | - | No | Icon overrides. |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Yes | When messages appear. |
| `locale` | `string` | common `locale` | Yes (inherited) | Counts, messages, search matching. |

## 6. Methods

| Method | Description |
|---|---|
| `TransferList.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the selected values (no event). |
| `getFormValue()` | The value for Form serialization. |
| `reportValidity()` | Show messages now and return validity. |
| `setCustomError(message)` | Show or clear (`null`) an external error. |
| `focus()` | Focus the Available list. |
| `reset()` | Restore the initial value; clear searches, checks, and messages. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Remove rendering, listeners, and the form registration. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value, validity, moved: string[], to: 'available' \| 'selected' }` | Items moved by a button, Enter, double-click, or drag. |

## 8. Slots/content areas

None. Items are text (`label`, `description`).

## 9. CSS parts/hooks

`aui-transfer-list`, `--disabled|--invalid|--dragging`, `__body`, `__panel`, `__panel--available|selected|drop`, `__head`, `__title`, `__count`, `__search`, `__list`, `__option`, `__option--active|draggable`, `__check`, `__label`, `__desc`, `__empty`, `__actions`, `__move`, plus the shared field chrome. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/transfer-list/tokens.json` (verified in CI). No component tokens: panels use `color-surface` and `color-border-strong`, checked options `color-selected` and `color-selected-text`, the check box `color-primary`, and the active option `color-focus-ring`. Rows are `control-height-sm` tall, so density changes the row height.

## 11. States

Empty; items checked; filtered; disabled item; dragging; drop target; limit reached; read-only; disabled; invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | type in a search box | the list filters; the count updates (polite) |
| any | Space, click, Shift+click, Shift+arrows, Ctrl/Cmd+A | options checked or unchecked |
| items checked | move button, Enter | items move; announced; `aui-change` |
| any | double-click an item | that item moves; `aui-change` |
| dragging | release over the other list | the dragged items move; `aui-change` |
| dragging | release elsewhere, pointer cancel | nothing moves |
| at `maxSelected` | another move to Selected | refused; "You can select up to N items." (assertive) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowDown / ArrowUp | List | Move the active option. |
| Home / End / Page Up / Page Down | List | First, last, or a page of options. |
| Space | List | Check or uncheck the active option. |
| Shift + ArrowDown / ArrowUp / Space | List | Check the range from the anchor to the active option. |
| Ctrl/Cmd + A | List | Check all visible options (again: uncheck all). |
| Enter | List | Move the checked options, or the active one, to the other list. |
| Printable characters | List | Type-ahead. |
| ArrowDown | Search box | Into the list. |
| Tab | Control | Search, list, buttons, search, list. |

## 14. ARIA contract

- The body is `role="group"` labelled by the label; each list is `role="listbox"` with `aria-multiselectable="true"`, labelled by its title and described by its count.
- Options are `role="option"` with `aria-selected` (checked), `aria-setsize` and `aria-posinset` (windowed rows), and `aria-disabled` for disabled items.
- `aria-activedescendant` names the active option while it is rendered.
- The Selected list carries `aria-required` and `aria-invalid`; both lists carry `aria-readonly` when read-only and `aria-disabled` when disabled.
- Counts are `role="status"`; moves are announced through the shared live region.

## 15. Accessibility notes

- Drag is optional and never the only way: check items and press a move button (WCAG 2.5.7).
- Move buttons have names like "Move checked items to Team"; their icons are mirrored in right-to-left.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Two lists with the buttons between them. In containers narrower than 30rem (container query) the lists stack and the buttons run horizontally, with arrows pointing down and up.

## 17. RTL behavior

The Available list is on the right and the move arrows are mirrored, so they always point toward the target list.

## 18. Theme behavior

Panels, check boxes, selection, and focus use global tokens and follow every theme. Forced colors use `Highlight`/`HighlightText` for checked options and `CanvasText` for the active outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { transferList: { validationTiming: 'submit' } } });
```

## 20. Component configuration support

Instance `validationTiming` and `locale` override configuration; configuration changes re-render existing instances.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.moveChecked` (`chevron-right`), `icons.moveAll` (`chevrons-right`), `icons.removeChecked` (`chevron-left`), `icons.removeAll` (`chevrons-left`), `icons.error` (`alert-circle`). The check mark uses the built-in `check`.

## 23. Security behavior

Labels and descriptions use `textContent`. The window padding is set through the CSSOM, so a strict CSP without `unsafe-inline` styles works.

## 24. Data handling behavior

No persistence, network access, or telemetry. Search runs over the items in memory with locale-aware lowercase matching on label and description.

## 25. Performance characteristics

Only the visible rows plus 6 overscan rows on each side are in the DOM; scrolling re-renders the window once per animation frame. Filtering is linear in the item count.

## 26. Supported data scale

10,000 items per list tested. Rows have one fixed height (`control-height-sm`), measured after the first render, so long labels are truncated.

## 27. Usage examples

```ts
import { TransferList } from '@absoluteui/components/transfer-list';

const host = document.querySelector<HTMLElement>('#columns');
if (host) {
  TransferList.create(host, {
    label: 'Report columns',
    items: [
      { value: 'name', label: 'Name' },
      { value: 'dept', label: 'Department' },
      { value: 'salary', label: 'Salary' },
      { value: 'start', label: 'Start date' },
    ],
    value: ['name', 'dept'],
    minSelected: 2,
    titles: { available: 'Hidden columns', selected: 'Shown columns' },
  });
}
```

More examples, type-checked in CI: `metadata/transfer-list/examples.json`.

## 28. Edge cases

- Moving with a search active moves only matching items ("Move all" means all visible).
- Checked items stay checked while filtered out and move with "Move checked".
- Disabled items are shown but never checked or moved, also by "Move all".
- Items keep their `items` order when moved to Selected in one batch; later moves append.
- Values in `value` that are not in `items` are dropped; `update({ items })` drops values that disappear.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TRANSFER_LIST_OPTIONS` | configuration | Blank label, `items` not an array of `{ value, label }` with unique values, a non-string value, invalid `minSelected`/`maxSelected`/`visibleRows`, or a non-function `validate`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Fixed row height; long text is truncated.
- The Selected list cannot be reordered.
- When the active option is scrolled out of the window with the mouse, there is no active descendant until the next key.

## 31. Unsupported scenarios

- More than two lists.
- Server-side search or paging.

## 32. TypeScript definitions

```ts
type TransferListValue = string[];
type TransferListSide = 'available' | 'selected';
interface TransferListConfig { validationTiming: 'blur' | 'input' | 'submit' }
interface TransferListItem { value: string; label: string; description?: string; disabled?: boolean }
interface TransferListIcons { error: IconRef; moveChecked: IconRef; moveAll: IconRef; removeChecked: IconRef; removeAll: IconRef }
interface TransferListOptions extends Partial<TransferListConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  items: readonly TransferListItem[];
  value?: readonly string[];
  name?: string;
  required?: boolean;
  minSelected?: number;
  maxSelected?: number;
  disabled?: boolean;
  readOnly?: boolean;
  searchable?: boolean;
  draggable?: boolean;
  titles?: { available?: string; selected?: string };
  visibleRows?: number;
  validate?: (value: readonly string[]) => string | null;
  locale?: string;
  icons?: Partial<TransferListIcons>;
}
interface TransferListValueDetail { value: TransferListValue; validity: FieldValidity; moved: string[]; to: TransferListSide }
```

## 33. Vanilla JS example

```ts
import { TransferList } from '@absoluteui/components/transfer-list';
import '@absoluteui/components/transfer-list/style.css';

const host = document.querySelector<HTMLElement>('#permissions');
if (host) {
  TransferList.create(host, {
    label: 'Permissions',
    name: 'permissions',
    items: [
      { value: 'leave.approve', label: 'Approve leave' },
      { value: 'payroll.view', label: 'View payroll' },
      { value: 'payroll.run', label: 'Run payroll', description: 'Finance only', disabled: true },
    ],
    draggable: true,
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { TransferListItem } from '@absoluteui/components/transfer-list';
import { AuiTransferList } from '@absoluteui/angular/transfer-list';

@Component({
  selector: 'app-team-picker',
  imports: [AuiTransferList],
  template: `<aui-transfer-list label="Project team" [items]="people" [(value)]="team"></aui-transfer-list>`,
})
export class TeamPickerComponent {
  readonly people: TransferListItem[] = [
    { value: 'e1', label: 'Asha Rao' },
    { value: 'e2', label: 'Ben Okafor' },
  ];
  team: string[] = ['e2'];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
