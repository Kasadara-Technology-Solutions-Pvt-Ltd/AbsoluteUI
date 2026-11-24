# Tree View

> Package: `@absoluteui/components/tree-view` | Styles: `@absoluteui/components/tree-view/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Shows hierarchical data following the WAI-ARIA APG tree pattern: expand and collapse, single or multiple selection, checkboxes with tri-state (mixed) parents, lazy children loaded through an async hook with loading and error states, type-ahead, Home/End, `*` to expand siblings, drag-and-drop reordering and reparenting with a keyboard alternative (Ctrl+X / Ctrl+V and Alt+Up / Alt+Down), inline rename in a text input, icons per node, and a filter that keeps the paths to matches visible. The visible nodes are rendered as a flat, virtualized list on the shared windowing engine (the same one as Virtual List), so trees with 10,000+ visible nodes stay fast.

## 2. Anatomy

```text
<div class="aui-tree-view aui-tree-view--checkboxes">
  <div class="aui-tree-view__viewport" role="tree" aria-label="Documents">                (scroll container)
    <div class="aui-tree-view__canvas" role="none">                                      (full height of all visible nodes)
      <div class="aui-tree-view__item aui-tree-view__item--open" role="treeitem" aria-level="1" aria-posinset="1" aria-setsize="3" aria-expanded="true" aria-checked="mixed" tabindex="0">
        <span class="aui-tree-view__twisty" aria-hidden="true">chevron</span>
        <span class="aui-tree-view__check" aria-hidden="true"></span>
        <span class="aui-tree-view__icon" aria-hidden="true">icon</span>
        <span class="aui-tree-view__label">Pol<mark class="aui-tree-view__match">ic</mark>ies</span>
      </div>
      <div class="aui-tree-view__item" role="treeitem" aria-level="2" aria-busy="true" tabindex="-1">...</div>
      <div class="aui-tree-view__drop" aria-hidden="true"></div>                            (drop line while dragging)
    </div>
  </div>
  <div class="aui-tree-view__empty" role="status" hidden>No items</div>
</div>
```

## 3. When to use

- Folders and documents, organization units, categories, or any data with parent-child relationships.
- Navigation through a deep hierarchy where users expand only what they need.
- Picking several items of a hierarchy with tri-state checkboxes (permissions, locations).

## 4. When not to use

- Flat lists: use Virtual List, Select, or Multi Select.
- Site navigation with a few levels: use Sidebar or Menu Bar.
- Picking one value of a hierarchy in a form: use Tree Select.
- Hierarchical data with columns: use Data Grid tree data.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `nodes` | `TreeNode[]` | The current tree, including loaded children, moves, and renames. |
| `selected` | `string[]` | Ids of the selected nodes. |
| `checked` | `string[]` | Ids of the checked nodes. |
| `indeterminate` | `string[]` | Ids of parents in the mixed state. |
| `expanded` | `string[]` | Ids of the expanded nodes. |
| `matches` | `string[]` | Ids of the nodes matching `filter`, in visible order. |
| `visibleCount` | `number` | Number of visible nodes. |
| `activeId` | `string \| null` | Id of the focusable node. |
| `range` | `WindowRange` | The visible rows `{ start, end }`. |
| `options` | `Readonly<TreeViewOptions>` | Current options. |

Options (`TreeViewOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the tree. |
| `nodes` | `readonly TreeNode[]` | - (required) | No | `{ id, label, icon?, expandedIcon?, children?, hasChildren?, disabled? }`; ids are unique. |
| `selection` | `'none' \| 'single' \| 'multiple'` | `'none'` | No | Selection mode. |
| `selected` | `readonly string[]` | `[]` | No | Selected ids. |
| `checkboxes` | `boolean` | `false` | No | A checkbox per node; Space toggles it. |
| `checked` | `readonly string[]` | `[]` | No | Checked ids. |
| `cascade` | `boolean` | `true` | No | Checking a parent checks its descendants; parents show the mixed state. |
| `expanded` | `readonly string[]` | `[]` | No | Expanded ids. |
| `loadChildren` | `(node, { signal }) => Promise<TreeNode[]>` | - | No | Loads the children of a node with `hasChildren` on first expansion. |
| `draggable` | `boolean` | `false` | No | Move nodes by dragging and with the keyboard. |
| `canDrag` | `(node) => boolean` | every enabled node | No | Which nodes may move. |
| `canDrop` | `(source, target, position) => boolean` | allowed | No | Whether a drop `before`, `inside`, or `after` a target (null: the top level) is allowed. |
| `renamable` | `boolean \| (node) => boolean` | `false` | No | F2 or a double click on the label renames. |
| `filter` | `string` | `''` | No | Show matches and the paths to them; matches are highlighted. |
| `filterBy` | `(node, query) => boolean` | label contains | No | Custom match. |
| `itemHeight` | `number` | 32 / 40 / 48 by density | No | Row height (24 to 200). |
| `height` | `string \| null` | `'20rem'` | No | Block size, or `null` to fill the host. |
| `empty` | `string` | `'No items'` | No | Text when there are no nodes. |
| `direction` | `'ltr' \| 'rtl'` | computed | No | Writing direction for the arrow keys. |
| `icons` | `Partial<TreeViewIcons>` | - | No | `expand`, `loading`, `error`. |
| `overscan` | `number` | `8` | Yes | Rows rendered beyond each edge. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages, filtering, type-ahead. |
| `density` | `'compact' \| 'comfortable' \| 'spacious'` | common `density` | Yes (inherited) | Default row height. |

## 6. Methods

| Method | Description |
|---|---|
| `TreeView.create(host, options)` | Render into `host` (children are replaced). |
| `expand(id)` | Expand a node and its ancestors, loading lazy children; resolves when loaded. |
| `collapse(id)` | Collapse a node. |
| `expandAll()` / `collapseAll()` | Expand every loaded parent / collapse everything. |
| `setSelected(ids)` / `setChecked(ids)` | Set selection or checks (no event). |
| `focusNode(id)` | Focus a node, expanding its ancestors. |
| `scrollToNode(id, align?)` | Scroll a node into view. |
| `reload(id)` | Load a lazy node's children again. |
| `rename(id)` | Start renaming a node. |
| `getNode(id)` / `getParentId(id)` / `getItemElement(id)` | Read the current tree. |
| `update(options)` | Merge and apply options. New `nodes` reset loaded children, moves, and renames. |
| `destroy()` | Remove rendering and listeners; abort loads. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-select` | `{ selected: string[], id }` | The user changed the selection. |
| `aui-change` | `{ checked: string[], indeterminate: string[], id }` | The user toggled a checkbox. |
| `aui-expand` | `{ id, open, expanded: string[] }` | The user expanded or collapsed a node. |
| `aui-move` | `{ id, parentId, index, previousParentId, previousIndex, source }` | Cancelable: a node is about to move by drag or keyboard; `preventDefault()` keeps it in place. |
| `aui-rename` | `{ id, label, previousLabel }` | Cancelable: a node is about to be renamed. |
| `aui-activate` | `{ id, node }` | Enter or a double click on a node. |
| `aui-load-error` | `{ id, error }` | `loadChildren` rejected. |
| `aui-range-change` | `{ start, end }` | The visible rows changed (does not bubble). |

## 8. Slots/content areas

None: nodes are data. Labels are text; icons are icon references.

## 9. CSS parts/hooks

`aui-tree-view`, `aui-tree-view--fill`, `--empty`, `--checkboxes`, `--draggable`, `--dragging`, `aui-tree-view__viewport`, `__canvas`, `__item`, `__item--selected`, `--checked`, `--mixed`, `--open`, `--active`, `--error`, `--cut`, `--dragging`, `--drop-inside`, `__twisty`, `__check`, `__icon`, `__label`, `__match`, `__error`, `__input`, `__drop`, `__empty`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/tree-view/tokens.json` (verified in CI). Component tokens: `--aui-tree-view-radius` (falls back to `radius-md`), `--aui-tree-view-border-color` (`color-border`, decorative), and `--aui-tree-view-indent` (`space-5`, the indent per level). Selected nodes use `color-selected`, `color-selected-text`, and `color-selected-indicator`; checked boxes `color-primary` and `color-on-primary`; matches are semibold and underlined.

## 11. States

Collapsed; expanded; selected; checked; mixed; disabled node; loading children; load failed; filtered; no matches; cut; dragging; renaming; empty.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| collapsed lazy parent | Right Arrow, twisty click, `expand()` | loading (`aria-busy`, spinner), then expanded or load failed |
| load failed | Enter, Right Arrow, twisty click, `reload()` | loading again |
| unchecked | Space, checkbox click | checked; descendants checked and ancestors updated (cascade); `aui-change` |
| any node | Ctrl+X | cut; Ctrl+V moves it inside the focused node, Ctrl+Shift+V after it; Escape cancels |
| any node | drag over a node (top quarter / middle / bottom quarter) | drop before / inside / after; `aui-move` |
| node | F2 or double click on the label | renaming; Enter or blur saves (`aui-rename`), Escape cancels |
| any | `update({ filter })` | matches and their ancestors shown; others hidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Tree | Focus the active node (one tab stop). |
| Down / Up | Tree | Next or previous visible node. |
| Right (Left in RTL) | Node | Collapsed parent: expand. Expanded parent: first child. Failed load: retry. |
| Left (Right in RTL) | Node | Expanded parent: collapse. Otherwise: focus the parent. |
| Home / End | Tree | First or last visible node. |
| Page Down / Page Up | Tree | Move by one visible page. |
| `*` | Node | Expand all siblings. |
| Printable characters | Tree | Type-ahead. |
| Enter | Node | Activate; select in single mode; retry a failed load. |
| Space | Node | Toggle the checkbox, toggle selection (multiple), or select (single). |
| Shift + Down / Up / Space | Multiple selection | Extend the selection from the anchor. |
| Ctrl + A (Cmd + A) | Multiple selection | Select all visible nodes, or clear. |
| F2 | Renamable node | Rename (Enter saves, Escape cancels). |
| Ctrl + X, then Ctrl + V / Ctrl + Shift + V | Draggable tree | Move the cut node inside / after the focused node. |
| Alt + Up / Alt + Down | Draggable tree | Move the node one place among its siblings. |
| Escape | After a cut | Cancel the move. |

## 14. ARIA contract

- Viewport: `role="tree"`, `aria-label`, `aria-multiselectable="true"` with multiple selection.
- Every visible node: `role="treeitem"` directly inside the tree with `aria-level`, `aria-posinset`, and `aria-setsize` (a flat DOM, because the tree is virtualized); `aria-expanded` on parents; `aria-selected` when selection is on; `aria-checked` (`true`, `false`, `mixed`) with checkboxes; `aria-disabled`; `aria-busy` while loading children.
- Twisty, checkbox, and icon are `aria-hidden`; their state is on the treeitem.
- The rename input has `aria-label="Rename <label>"`; the empty message is `role="status"`.

## 15. Accessibility notes

- Drag-and-drop has a keyboard alternative (cut and paste, Alt+Arrow), meeting WCAG 2.5.7.
- Loads, failures, moves, renames, and filter results are announced through the shared live region (WCAG 4.1.3).
- Selection shows a start-edge bar, checks a mark or a dash: never color alone (WCAG 1.4.1).
- The twisty is a 24 px target (WCAG 2.5.8). The e2e axe run covers three themes and RTL; manual screen-reader verification is pending.

## 16. Responsive behavior

Fills the inline size of its host; the block size comes from `height`, or from the host with `height: null` (for example a Splitter pane). Long labels are truncated with an ellipsis.

## 17. RTL behavior

Indentation, the selection bar, and text follow the writing direction; the twisty is mirrored; Left Arrow expands and Right Arrow collapses in RTL (from the host's computed direction, or `direction`).

## 18. Theme behavior

Three themes through the role tokens; forced colors use `Highlight`, `HighlightText`, and `GrayText`, and draw checkboxes with system colors.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { treeView: { overscan: 12 } } });
```

## 20. Component configuration support

Instance `overscan`, `locale`, and `density` override configuration; configuration changes lay out existing trees again.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (default `chevron-right`, mirrored in RTL), `icons.loading` (`spinner`), and `icons.error` (`alert-circle`). Node icons come from `icon` and `expandedIcon` (for example `folder` and `folder-open` from `@absoluteui/icons/set`).

## 23. Security behavior

Labels are rendered as text; renamed labels come from a text input (trimmed, at most 255 characters); filter matches are `<mark>` elements built from text nodes. No HTML is parsed.

## 24. Data handling behavior

No persistence, network access, or telemetry. `loadChildren` is the application's function and receives an `AbortSignal` (aborted on `destroy()`, `reload()`, or new `nodes`). Results are validated (unique ids) before they are added.

## 25. Performance characteristics

The visible nodes are flattened once per structural change; row offsets use the shared windowing engine (typed arrays, binary search). Only `visible + 2 x overscan + 1` treeitems exist; elements are recycled while scrolling. Checks are normalized in one pass per change.

## 26. Supported data scale

Tested with 100,000 nodes and 10,000+ visible nodes (expand all). The option limit is 500,000 nodes. The filter scans loaded nodes.

## 27. Usage examples

```ts
import { TreeView, type TreeViewActivateDetail } from '@absoluteui/components/tree-view';

const host = document.querySelector<HTMLElement>('#org');
if (host) {
  TreeView.create(host, {
    label: 'Organization',
    selection: 'single',
    expanded: ['company'],
    nodes: [{ id: 'company', label: 'Acme', children: [{ id: 'eng', label: 'Engineering' }, { id: 'ops', label: 'Operations' }] }],
  });
  host.addEventListener('aui-activate', (event) => {
    host.dataset.open = (event as CustomEvent<TreeViewActivateDetail>).detail.id;
  });
}
```

More examples, type-checked in CI: `metadata/tree-view/examples.json`.

## 28. Edge cases

- `loadChildren` resolving with ids that already exist fails the load (the node shows the error state).
- Expanding a lazy node without `loadChildren` turns it into a leaf.
- Dropping into a lazy, unloaded parent loads its children first, then appends the node.
- A node cannot be dropped into itself or its descendants; `canDrop` can forbid more.
- Collapsing the parent of the focused node moves focus to that parent.
- Renaming to an empty or unchanged label keeps the old label.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TREE_VIEW_OPTIONS` | configuration | Blank label, nodes not an array, a node without a string id or label, duplicate ids, more than 500,000 nodes, unknown `selection`, non-string ids in `selected`/`checked`/`expanded`, more than one selected id in single mode, non-function hooks, an `itemHeight` outside 24 to 200, or a `height` that is not a CSS length. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; a failing `loadChildren` sets the node's error state and emits `aui-load-error`.

## 30. Known limitations

- One fixed row height; labels do not wrap.
- The filter and type-ahead see loaded nodes only.
- Only rendered nodes are in the DOM (find-in-page and printing see only those).
- Touch drags start on the node icon.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Columns per node (use Data Grid tree data).
- Dragging between two trees.
- Rich (HTML) labels.

## 32. TypeScript definitions

```ts
type TreeViewSelection = 'none' | 'single' | 'multiple';
type TreeViewDropPosition = 'before' | 'inside' | 'after';
interface TreeNode { readonly id: string; readonly label: string; readonly icon?: IconRef; readonly expandedIcon?: IconRef; readonly children?: readonly TreeNode[]; readonly hasChildren?: boolean; readonly disabled?: boolean }
interface TreeViewLoadContext { readonly signal: AbortSignal }
interface TreeViewOptions extends Partial<TreeViewConfig> {
  label: string;
  nodes: readonly TreeNode[];
  selection?: TreeViewSelection;
  selected?: readonly string[];
  checkboxes?: boolean;
  checked?: readonly string[];
  cascade?: boolean;
  expanded?: readonly string[];
  loadChildren?: ((node: TreeNode, context: TreeViewLoadContext) => Promise<readonly TreeNode[]>) | null;
  draggable?: boolean;
  canDrag?: (node: TreeNode) => boolean;
  canDrop?: (source: TreeNode, target: TreeNode | null, position: TreeViewDropPosition) => boolean;
  renamable?: boolean | ((node: TreeNode) => boolean);
  filter?: string;
  filterBy?: (node: TreeNode, query: string) => boolean;
  itemHeight?: number;
  height?: string | null;
  empty?: string;
  direction?: 'ltr' | 'rtl';
  locale?: string;
  density?: Density;
  icons?: Partial<TreeViewIcons>;
}
interface TreeViewSelectDetail { selected: string[]; id: string }
interface TreeViewChangeDetail { checked: string[]; indeterminate: string[]; id: string }
interface TreeViewExpandDetail { id: string; open: boolean; expanded: string[] }
interface TreeViewMoveDetail { id: string; parentId: string | null; index: number; previousParentId: string | null; previousIndex: number; source: 'pointer' | 'keyboard' }
interface TreeViewRenameDetail { id: string; label: string; previousLabel: string }
interface TreeViewActivateDetail { id: string; node: TreeNode }
```

## 33. Vanilla JS example

```ts
import { TreeView } from '@absoluteui/components/tree-view';
import '@absoluteui/components/tree-view/style.css';

const host = document.querySelector<HTMLElement>('#tree');
if (host) TreeView.create(host, { label: 'Files', nodes: [{ id: 'src', label: 'src', children: [{ id: 'main', label: 'main.ts' }] }], expanded: ['src'] });
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiTreeView } from '@absoluteui/angular/tree-view';
import type { TreeNode } from '@absoluteui/components/tree-view';

@Component({
  selector: 'app-org-tree',
  imports: [AuiTreeView],
  template: `<aui-tree-view label="Organization" selection="single" [nodes]="nodes" [(selected)]="selected" [(expanded)]="expanded"></aui-tree-view>`,
})
export class OrgTreeComponent {
  readonly nodes: TreeNode[] = [{ id: 'acme', label: 'Acme', children: [{ id: 'eng', label: 'Engineering' }, { id: 'ops', label: 'Operations' }] }];
  readonly selected = signal<readonly string[] | undefined>(['eng']);
  readonly expanded = signal<readonly string[] | undefined>(['acme']);
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
