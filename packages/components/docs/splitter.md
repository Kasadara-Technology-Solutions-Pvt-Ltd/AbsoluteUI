# Splitter

> Package: `@absoluteui/components/splitter` | Styles: `@absoluteui/components/splitter/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Two or more resizable panes, side by side (`horizontal`) or stacked (`vertical`), following the WAI-ARIA APG window splitter pattern. Each separator is a focusable `role="separator"` whose value is the size of the pane before it; it moves by dragging, by the arrow keys, and to its limits with Home and End. Enter collapses and restores a collapsible pane, dragging a collapsible pane below half its minimum collapses it, and a double-click resets the sizes. Minimum and maximum sizes take pixels or percentages, and splitters nest. The component stores nothing: sizes are reported in `aui-change` for the application to persist and pass back as `sizes`.

## 2. Anatomy

```text
<div class="aui-splitter aui-splitter--horizontal">
  <div class="aui-splitter__pane" id="aui-splitter-1-pane-0">content</div>
  <div class="aui-splitter__separator" role="separator" tabindex="0" aria-orientation="vertical"
       aria-label="Folders" aria-controls="aui-splitter-1-pane-0" aria-valuenow="25" aria-valuemin="0" aria-valuemax="50"></div>
  <div class="aui-splitter__pane" id="aui-splitter-1-pane-1">content</div>
</div>
```

## 3. When to use

- Master-detail layouts where users want to choose the proportions.
- Tool layouts with a sidebar, an editor, and a preview or console.
- Comparing two documents side by side.

## 4. When not to use

- Fixed page layouts: use Layout (Grid, Flex) or Sidebar.
- Small screens where panes cannot be usefully side by side: stack them or use Tabs.
- Showing and hiding a single region: use Collapsible or Drawer.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `sizes` | `number[]` | Every pane's size in percent of the space between separators. |
| `collapsed` | `boolean[]` | Which panes are collapsed. |
| `paneElements` | `readonly HTMLElement[]` | The pane elements, in order. |
| `options` | `Readonly<SplitterOptions>` | Current options. |

Options (`SplitterOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `panes` | `readonly SplitterPane[]` | - (required) | No | Two to ten panes (below). |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | No | `horizontal`: panes side by side with vertical separators; `vertical`: stacked. |
| `sizes` | `readonly number[] \| null` | `null` | No | Restored sizes in percent per pane (from `aui-change`). |
| `step` | `number` | `16` | Yes | Pixels per arrow key press (1 to 500). |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the collapsed-state text. |

`SplitterPane`: `content` (Node, required), `label` (required; names the separator after the pane), `size`, `min`, `max` (pixels as a number or `'240px'`, or a percentage such as `'30%'`), `collapsible`, `collapsed`.

## 6. Methods

| Method | Description |
|---|---|
| `Splitter.create(host, options)` | Render into `host` (children are replaced by the panes). |
| `collapse(index)` / `expand(index)` | Collapse or restore a collapsible pane (no event). |
| `reset()` | Back to the initial sizes and collapsed states (no event). |
| `update(options)` | Merge and apply options; new `sizes` are applied. |
| `destroy()` | Remove the panes, separators, observers, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ sizes: number[], collapsed: boolean[], index: number, reason }` | The user finished a drag (`drag`), moved a separator with the keyboard (`keyboard`), collapsed or expanded a pane (`collapse`, `expand`), or double-clicked a separator (`reset`). Programmatic changes do not emit. |

## 8. Slots/content areas

`panes[].content`: each pane's content (a Node, which may be another splitter's host).

## 9. CSS parts/hooks

`aui-splitter`, `aui-splitter--horizontal`, `aui-splitter--vertical`, `aui-splitter--dragging`, `aui-splitter__pane`, `aui-splitter__pane--collapsed`, `aui-splitter__separator`, `aui-splitter__separator--collapsed`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/splitter/tokens.json` (verified in CI). Component tokens: `--aui-splitter-size` (separator thickness; `space-3`), `--aui-splitter-line-color` (`color-border`, decorative), and `--aui-splitter-grip-color` (the grip and hovered line; `color-border-strong`, 3:1 against the surface).

## 11. States

Horizontal or vertical; dragging; a pane at its minimum or maximum; a pane collapsed; nested.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| sizes | drag, arrow keys, Home, End | new sizes; `aui-change` (`drag` on release, `keyboard` per key) |
| expanded | Enter, or dragging a collapsible pane below half its minimum | collapsed; `aui-change` (`collapse`, or `drag`) |
| collapsed | Enter, or dragging the separator | expanded; `aui-change` |
| any | double-click a separator | initial sizes; `aui-change` (`reset`) |
| dragging | Escape | sizes before the drag (no event) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Splitter | Each separator is a tab stop between the panes' content. |
| Left / Right Arrow | Separator (horizontal) | Move by `step` pixels (mirrored in RTL). |
| Up / Down Arrow | Separator (vertical) | Move by `step` pixels. |
| Home / End | Separator | Smallest or largest allowed size of the pane before it. |
| Enter | Separator | Collapse the collapsible pane next to it, or restore it. |
| Escape | While dragging | Cancel the drag. |

## 14. ARIA contract

- Separators: `role="separator"`, `tabindex="0"`, `aria-orientation` (`vertical` for horizontal splitters), `aria-label` from the label of the pane before it, `aria-controls` that pane's id.
- `aria-valuenow`: that pane's size in percent; `aria-valuemin` and `aria-valuemax` from its min and max and the neighbor's limits (0 when the pane is collapsible).
- `aria-valuetext` "{label}, collapsed" while the pane before it is collapsed.

## 15. Accessibility notes

- Every drag has a keyboard equivalent (WCAG 2.5.7).
- The grip is a shape cue besides the line color; the grip color meets 3:1 against the surface.
- The separator is 12px thick by default; its target spans the whole length of the panes.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Sizes are fractions of the available space, so proportions hold when the container resizes; pixel minimums and maximums are enforced again after a resize. Until the user changes the sizes, pixel `size` values are recomputed on resize.

## 17. RTL behavior

Horizontal splitters mirror: the first pane is on the right, Left Arrow grows it, and dragging follows the pointer.

## 18. Theme behavior

Three themes through the role tokens; forced colors use `CanvasText` and `ButtonText` for the line and grip.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { splitter: { step: 24 } } });
```

## 20. Component configuration support

Instance `step` and `locale` override configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None (the grip is drawn with CSS).

## 23. Security behavior

Pane content is inserted as given (the application owns it). No HTML parsing.

## 24. Data handling behavior

No persistence, network access, or telemetry. Persist `aui-change` sizes in the application (for example in user preferences) and pass them back as `sizes`.

## 25. Performance characteristics

A drag frame sets one custom property per pane and reads only the host and separator sizes; panes are laid out by flexbox.

## 26. Supported data scale

Up to 10 panes per splitter and three levels of nesting.

## 27. Usage examples

```ts
import { Splitter, type SplitterChangeDetail } from '@absoluteui/components/splitter';

const host = document.querySelector<HTMLElement>('#workspace');
const list = document.querySelector<HTMLElement>('#list');
const detail = document.querySelector<HTMLElement>('#detail');
if (host && list && detail) {
  Splitter.create(host, { panes: [{ content: list, label: 'Employees', size: '30%', min: 200, collapsible: true }, { content: detail, label: 'Details', min: 320 }] });
  host.addEventListener('aui-change', (event) => {
    host.dataset.sizes = (event as CustomEvent<SplitterChangeDetail>).detail.sizes.join(',');
  });
}
```

More examples, type-checked in CI: `metadata/splitter/examples.json`.

## 28. Edge cases

- A separator moves only its two neighbors; other panes keep their size.
- When the container is too small for every minimum, the panes shrink proportionally and the minimums apply again when it grows.
- `sizes` are normalized to 100; zero for a collapsible pane plus `collapsed: true` restores it collapsed.
- With `update({ panes })` and the same pane count, sizes are kept; a different count recomputes them.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SPLITTER_OPTIONS` | configuration | Fewer than 2 or more than 10 panes, a pane without a Node or label, an invalid length, `collapsed` without `collapsible`, an unknown orientation, or `sizes` that do not match the panes. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- A separator moves only its two neighboring panes.
- Pixel sizes in `panes[].size` apply to the first layout; afterwards sizes are percentages.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Storing sizes inside the component: persist them in the application.
- Overlapping or floating panes.

## 32. TypeScript definitions

```ts
type SplitterOrientation = 'horizontal' | 'vertical';
type SplitterLength = number | string;
type SplitterChangeReason = 'drag' | 'keyboard' | 'collapse' | 'expand' | 'reset';
interface SplitterConfig { step: number }
interface SplitterPane {
  content: Node;
  label: string;
  size?: SplitterLength;
  min?: SplitterLength;
  max?: SplitterLength;
  collapsible?: boolean;
  collapsed?: boolean;
}
interface SplitterOptions extends Partial<SplitterConfig> {
  panes: readonly SplitterPane[];
  orientation?: SplitterOrientation;
  sizes?: readonly number[] | null;
  locale?: string;
}
interface SplitterChangeDetail { sizes: number[]; collapsed: boolean[]; index: number; reason: SplitterChangeReason }
```

## 33. Vanilla JS example

```ts
import { Splitter } from '@absoluteui/components/splitter';
import '@absoluteui/components/splitter/style.css';

const host = document.querySelector<HTMLElement>('#compare');
const left = document.querySelector<HTMLElement>('#before');
const right = document.querySelector<HTMLElement>('#after');
if (host && left && right) Splitter.create(host, { panes: [{ content: left, label: 'Before', min: '20%' }, { content: right, label: 'After', min: '20%' }] });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { SplitterPane } from '@absoluteui/components/splitter';
import { AuiSplitter } from '@absoluteui/angular/splitter';

function pane(text: string): HTMLElement {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
}

@Component({
  selector: 'app-workspace',
  imports: [AuiSplitter],
  template: `<aui-splitter [panes]="panes" [(sizes)]="sizes"></aui-splitter>`,
})
export class WorkspaceComponent {
  readonly panes: SplitterPane[] = [{ content: pane('Files'), label: 'Files', size: '25%', min: 160, collapsible: true }, { content: pane('Editor'), label: 'Editor', min: 320 }];
  sizes: number[] | null = null;
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
