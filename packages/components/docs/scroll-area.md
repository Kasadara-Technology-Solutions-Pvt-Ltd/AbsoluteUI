# Scroll Area

> Package: `@absoluteui/components/scroll-area` | Styles: `@absoluteui/components/scroll-area/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

Enhances an element whose content can overflow. Scrolling stays native (wheel, touch, trackpad, scrollbar, keyboard); the edges fade where more content exists (a CSS mask, so no elements are added and any background works); and while the content overflows, the element is a named, keyboard-focusable region, so keyboard users can scroll it (WCAG 2.1.1). There are no custom-drawn scrollbars.

## 2. Anatomy

```text
<div class="aui-scroll-area aui-scroll-area--{orientation} aui-scroll-area--shadows"
     [role="region" aria-label="Release notes" tabindex="0"]          (while overflowing)
     [data-aui-scroll-top] [data-aui-scroll-bottom] ...>               (edges with hidden content)
  ... the element's own content ...
</div>
```

## 3. When to use

- A bounded panel with long content: release notes, a log, a terms box, a side list.
- A horizontal strip of cards or chips that scrolls sideways.

## 4. When not to use

- The whole page: let the document scroll.
- Large data sets: use Data Table or Data Grid, which virtualize.
- Content that should simply be shorter.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | The enhanced element. |
| `edges` | `ScrollAreaEdges` | Edges with hidden content: `{ top, bottom, left, right }` (physical). |
| `overflowing` | `boolean` | Whether the content overflows; the region is then focusable. |
| `options` | `Readonly<ScrollAreaOptions>` | Current options. |

Options (`ScrollAreaOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the region. |
| `orientation` | `'vertical' \| 'horizontal' \| 'both'` | `'vertical'` | No | Scroll axis. |
| `maxBlockSize` | `string` | - | No | Maximum block size as a CSS length (`'20rem'`, `'50vh'`, `'calc(100vh - 8rem)'`). |
| `shadows` | `boolean` | `true` | Yes | Fade the edges where more content exists. |

## 6. Methods

| Method | Description |
|---|---|
| `ScrollArea.enhance(element, options)` | Enhance an element in place; its content stays where it is. |
| `refresh()` | Recompute the edges now (normally automatic). |
| `update(options)` | Merge and apply options. |
| `destroy()` | Remove classes, data attributes, and observers; restore the element's own `role`, `aria-label`, and `tabindex`. |

## 7. Events

None. Use the native `scroll` event.

## 8. Slots/content areas

The element's own children; they stay in place.

## 9. CSS parts/hooks

`aui-scroll-area`, `aui-scroll-area--vertical|horizontal|both`, `aui-scroll-area--shadows`, and the attributes `data-aui-scroll-top|bottom|left|right`. The custom property `--aui-scroll-area-max-block-size` sets the maximum height. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/scroll-area/tokens.json` (verified in CI). Component token: `--aui-scroll-area-fade-size` (length of the edge fade; falls back to `space-6`).

## 11. States

Overflowing or not; scrolled to the start, the middle, or the end; vertical, horizontal, or both; fades on or off.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| not overflowing | content or size change | overflowing: region role, label, and tab stop added |
| overflowing | scroll | edge attributes follow the position (at most once per frame) |
| overflowing | content shrinks | not overflowing: the element's own attributes restored |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Page | Moves to the region while its content overflows. |
| Arrow keys, Page Up/Down, Home, End, Space | Focused region | Scroll natively. |

## 14. ARIA contract

- While overflowing: `aria-label` from `label` and `tabindex="0"` (an existing `tabindex` is kept); a generic element (a `div` or `span` without a role) also gets `role="region"`. Lists, tables, and other semantic elements keep their own role, so a scrolling `ul` is still a list.
- While not overflowing: the element's own attributes, so a short panel is not a needless tab stop.

## 15. Accessibility notes

- The fades are a visual hint; screen-reader users reach all content in reading order.
- The platform scrollbar, with its accessibility settings, is kept.
- The fades turn off while the region has keyboard focus, so the focus ring is never clipped.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Takes the size its layout gives it; `maxBlockSize` caps the height.

## 17. RTL behavior

Horizontal fades follow the scroll position in right-to-left layouts, where content starts at the right edge.

## 18. Theme behavior

The fades are a mask, so they work on any background color. They are off in forced-colors mode.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { scrollArea: { shadows: false } } });
```

## 20. Component configuration support

The instance `shadows` overrides configuration; configuration changes re-render existing scroll areas.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

`maxBlockSize` accepts only plain CSS lengths and `calc()`, `min()`, `max()`, or `clamp()` expressions, and is set through the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Edge state updates at most once per animation frame while scrolling. Resize observers watch the element and its direct children; a mutation observer re-attaches them when children change.

## 26. Supported data scale

Any amount of content that the browser can render; use the data components for large data sets.

## 27. Usage examples

```ts
import { ScrollArea } from '@absoluteui/components/scroll-area';

const log = document.querySelector<HTMLElement>('#activity');
if (log) {
  const area = ScrollArea.enhance(log, { label: 'Activity', maxBlockSize: '16rem' });
  // After changing content deep inside a child, recompute the edges.
  area.refresh();
}
```

More examples, type-checked in CI: `metadata/scroll-area/examples.json`.

## 28. Edge cases

- A region that stops overflowing is no longer focusable; if it had focus, focus stays on it until the user moves on.
- Size changes deeper than the direct children are noticed when a direct child resizes; call `refresh()` after other changes.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SCROLL_AREA_HOST` | configuration | The target is not an element. |
| `SCROLL_AREA_OPTIONS` | configuration | Blank label, an unknown orientation, or a `maxBlockSize` that is not a plain CSS length. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the element is modified.

## 30. Known limitations

- The fades also fade content at the edges; avoid placing controls right at the edge.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Custom scrollbars.
- Virtualized content.

## 32. TypeScript definitions

```ts
type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';
interface ScrollAreaConfig { shadows: boolean }
interface ScrollAreaOptions extends Partial<ScrollAreaConfig> {
  label: string;
  orientation?: ScrollAreaOrientation;
  maxBlockSize?: string;
}
interface ScrollAreaEdges { readonly top: boolean; readonly bottom: boolean; readonly left: boolean; readonly right: boolean }
```

## 33. Vanilla JS example

```ts
import { ScrollArea } from '@absoluteui/components/scroll-area';
import '@absoluteui/components/scroll-area/style.css';

const terms = document.querySelector<HTMLElement>('#terms');
if (terms) ScrollArea.enhance(terms, { label: 'Terms of service', maxBlockSize: '20rem' });
```

## 34. Angular example

`[auiScrollArea]` enhances any element in place; its content stays Angular-managed.

```ts
import { Component } from '@angular/core';
import { AuiScrollArea } from '@absoluteui/angular/scroll-area';

@Component({
  selector: 'app-activity',
  imports: [AuiScrollArea],
  template: `
    <ul auiScrollArea label="Activity" maxBlockSize="16rem">
      @for (entry of entries; track entry) {
        <li>{{ entry }}</li>
      }
    </ul>`,
})
export class ActivityComponent {
  readonly entries = Array.from({ length: 40 }, (_, i) => `Entry ${String(i + 1)}`);
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
