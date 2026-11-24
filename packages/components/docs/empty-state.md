# Empty State

> Package: `@absoluteui/components/empty-state` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/empty-state/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Explains why a table, list, search, or page has nothing to show and offers the next step. An empty state has a decorative icon or illustration, a title (a heading at a chosen level, or plain text inside tables and lists), a description, and up to two actions rendered as AbsoluteUI buttons or links. Three sizes fit table cells, panels, and whole pages; with `live`, a search that matches nothing is announced.

## 2. Anatomy

```text
<div class="aui-empty-state aui-empty-state--md" role="status">          (role only with live)
  <div class="aui-empty-state__media" aria-hidden="true"><svg class="aui-icon">...</svg></div>
  <h3 class="aui-empty-state__title">No employees match your filters</h3>
  <p class="aui-empty-state__description">Try a different name or clear the filters.</p>
  <div class="aui-empty-state__actions">
    <button class="aui-button aui-empty-state__primary">Clear filters</button>
    <a class="aui-button aui-empty-state__secondary" href="/help">Read the guide</a>
  </div>
</div>
```

## 3. When to use

- A table or list with no rows yet (first use) or no rows for the current filters.
- A search with no results.
- A panel waiting for a selection, such as the detail pane of a master-detail layout.

## 4. When not to use

- Errors that need attention: use Alert or Inline Message.
- Content that is still loading: use Skeleton or Spinner.
- Short hints inside a form field: use help text.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `options` | `Readonly<EmptyStateOptions>` | Current options. |

Options (`EmptyStateOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `title` | `string` | - (required) | No | Short statement of the state. |
| `description` | `string` | - | No | What to do next or why the area is empty. |
| `icon` | `IconRef \| null` | `null` | No | Decorative icon above the title. |
| `illustration` | `Node \| null` | `null` | No | Decorative image or SVG instead of the icon. |
| `headingLevel` | `1 \| 2 \| 3 \| 4 \| 5 \| 6 \| null` | `3` | No | Heading level of the title; `null` renders a paragraph. |
| `primaryAction` | `EmptyStateAction \| null` | `null` | No | `{ label, icon?, href? }`, a primary button (or link with `href`). |
| `secondaryAction` | `EmptyStateAction \| null` | `null` | No | `{ label, icon?, href? }`, a secondary button (or link). |
| `live` | `boolean` | `false` | No | Announce the empty state when it appears (`role="status"`). |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | `sm` in tables and lists, `md` in panels, `lg` for pages. |

## 6. Methods

| Method | Description |
|---|---|
| `EmptyState.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge and apply options; buttons are rebuilt only when the actions change. |
| `destroy()` | Remove rendering, buttons, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-action` | `{ action: 'primary' \| 'secondary' }` | The user activated an action (links also navigate). |

## 8. Slots/content areas

`illustration`: a decorative image or SVG Node in place of the icon.

## 9. CSS parts/hooks

`aui-empty-state`, `aui-empty-state--sm`, `aui-empty-state--md`, `aui-empty-state--lg`, `aui-empty-state__media`, `aui-empty-state__title`, `aui-empty-state__description`, `aui-empty-state__actions`, `aui-empty-state__primary`, `aui-empty-state__secondary`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/empty-state/tokens.json` (verified in CI). Component tokens: `--aui-empty-state-icon-color` (`color-text-muted`) and `--aui-empty-state-icon-size` (`icon-size-xl` at `md`; `sm` uses `icon-size-lg`, `lg` one and a half times the token). Actions use the Button tokens.

## 11. States

With an icon, an illustration, or no media; with or without actions; live; sizes `sm`, `md`, `lg`.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update(options)` | new content; with `live`, the change is announced |
| idle | an action is activated | `aui-action` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Empty state | The primary action, then the secondary action. |
| Enter / Space | Action button | Activate (Enter for links). |

## 14. ARIA contract

- The media is `aria-hidden="true"` (decorative).
- The title is an `h1` to `h6` at `headingLevel`, or a paragraph with `null`.
- With `live`, the host is `role="status"`.
- Actions are native buttons or links.

## 15. Accessibility notes

- Choose `headingLevel` to fit the page outline; inside tables and lists use `null`.
- Use `live` where the empty state appears in response to a user action (a search or filter), so screen-reader users learn that nothing matched.
- Put meaning in the title and description; the icon is never announced.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Centered and fluid; the text wraps at a readable measure and the actions wrap on narrow containers.

## 17. RTL behavior

The layout is centered; the actions follow the writing direction.

## 18. Theme behavior

The title and description colors are in the contrast gate in every theme; forced colors render the icon in `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { emptyState: { size: 'sm' } } });
```

## 20. Component configuration support

Instance `size` overrides configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icon` takes any registered icon (`IconRef`), for example `search` for no results or a set icon after `@absoluteui/icons/set/register`. Action icons go in `primaryAction.icon` and `secondaryAction.icon`.

## 23. Security behavior

The title and description are set as text. Action `href` values are limited to http(s) and relative URLs (others throw). The illustration Node is inserted as given.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

One small DOM subtree; `update()` rewrites text in place and rebuilds the buttons only when the action objects change.

## 26. Supported data scale

One per table, list, or page.

## 27. Usage examples

```ts
import { EmptyState } from '@absoluteui/components/empty-state';

const host = document.querySelector<HTMLElement>('#inbox-empty');
if (host) {
  const state = EmptyState.create(host, { title: 'No messages', description: 'New messages appear here.', icon: 'search', size: 'sm', headingLevel: null });
  host.addEventListener('aui-action', () => {
    state.update({ title: 'Checking for messages' });
  });
}
```

More examples, type-checked in CI: `metadata/empty-state/examples.json`.

## 28. Edge cases

- An `illustration` wins over `icon`.
- Without actions, the action row is hidden; without a description, the description is hidden.
- Changing `headingLevel` replaces the title element (focus is not inside it).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `EMPTY_STATE_OPTIONS` | configuration | Blank title, a non-string description, an illustration that is not a Node, an invalid heading level, an action without a label, an unsafe action `href`, or a non-boolean `live`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |
| `ICON_UNKNOWN` | configuration | `icon` names an icon that is not registered. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- At most two actions.
- The icon and illustration are decorative.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Rich text (HTML) in the description: compose your own content next to the empty state.

## 32. TypeScript definitions

```ts
type EmptyStateSize = 'sm' | 'md' | 'lg';
type EmptyStateHeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
interface EmptyStateConfig { size: EmptyStateSize }
interface EmptyStateAction { label: string; icon?: IconRef; href?: string }
interface EmptyStateOptions extends Partial<EmptyStateConfig> {
  title: string;
  description?: string;
  icon?: IconRef | null;
  illustration?: Node | null;
  headingLevel?: EmptyStateHeadingLevel | null;
  primaryAction?: EmptyStateAction | null;
  secondaryAction?: EmptyStateAction | null;
  live?: boolean;
}
interface EmptyStateActionDetail { action: 'primary' | 'secondary' }
```

## 33. Vanilla JS example

```ts
import { EmptyState } from '@absoluteui/components/empty-state';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/empty-state/style.css';

const host = document.querySelector<HTMLElement>('#projects-empty');
if (host) EmptyState.create(host, { title: 'No projects yet', description: 'Create one to get started.', primaryAction: { label: 'Create project', icon: 'plus' } });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { EmptyStateActionDetail } from '@absoluteui/components/empty-state';
import { AuiEmptyState } from '@absoluteui/angular/empty-state';

@Component({
  selector: 'app-no-results',
  imports: [AuiEmptyState],
  template: `<aui-empty-state title="No results" description="Try another search." icon="search" [live]="true" [primaryAction]="{ label: 'Clear search' }" (action)="onAction($event)"></aui-empty-state>`,
})
export class NoResultsComponent {
  cleared = false;
  onAction(detail: EmptyStateActionDetail): void {
    this.cleared = detail.action === 'primary';
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
