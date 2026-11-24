# Layout

> Package: `@absoluteui/components/layout` | Styles: `@absoluteui/components/layout/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Layout primitives: Container, Stack, Flex (and Inline), Grid, and Divider. The CSS classes are the primary API and work without JavaScript. The JS helpers (`Stack.apply`, `Flex.apply`, `Grid.apply`, `Container.apply`, `Divider.create`) give frameworks and AI assistants a validated, typed API. They apply the same classes and custom properties to an element you own. Each returns a handle whose `destroy()` removes exactly what it added.

## 2. Anatomy

```text
<main class="aui-container aui-container--lg">                 centered, max-inline-size, inline padding
  <div class="aui-stack aui-gap-6">                            flex column + gap
    <div class="aui-flex aui-gap-2 aui-justify-between">       wrapping row
      ...
      <div class="aui-divider aui-divider--vertical" role="separator" aria-orientation="vertical">
      ...
    </div>
    <hr class="aui-divider">                                   semantic horizontal separator
    <div class="aui-divider aui-divider--labelled" role="separator" aria-label="or">
      <span class="aui-divider__label">or</span>
    </div>
    <div class="aui-grid aui-grid--auto" style="--aui-grid-min: 14rem">   (custom property set via the CSSOM)
      <div>tile</div> ...
    </div>
  </div>
</main>
```

## 3. When to use

- Spacing siblings with token gaps instead of ad-hoc margins.
- Responsive tile and card grids that reflow without media queries (`aui-grid--auto`).
- Centering page content at a token maximum width (`aui-container`).
- Separating groups of content with a semantic or decorative divider.

## 4. When not to use

- Visual grouping with a border or background: use Surface or Card.
- Tabular data: use a table.
- Reordering meaningful content visually (`row-reverse`): the reading and focus order stay in source order.

## 5. Public properties

`LayoutHandle<O>` (returned by every `apply`):

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | The consumer element. |
| `options` | `Readonly<O>` | Current options. |

Options:

| Helper | Option | Type | Default | Global config |
|---|---|---|---|---|
| Stack, Flex, Grid | `gap` | `0 \| 1 \| 2 \| 3 \| 4 \| 5 \| 6 \| 8 \| 10 \| 12` | `defaultGap` | via `defaultGap` |
| Stack, Flex | `align` | `'start' \| 'center' \| 'end' \| 'stretch' \| 'baseline'` | - (CSS default) | No |
| Flex | `justify` | `'start' \| 'center' \| 'end' \| 'between' \| 'around' \| 'evenly'` | - | No |
| Flex | `wrap` | `boolean` | `true` | No |
| Flex | `direction` | `'row' \| 'row-reverse'` | `'row'` | No |
| Grid | `columns` | `1`-`12` \| `'auto'` | `'auto'` | No |
| Grid | `minColumnWidth` | CSS length string | `16rem` | No |
| Container | `size` | `'sm' \| 'md' \| 'lg' \| 'xl'` | `'lg'` | No |
| Divider | `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | No |
| Divider | `label` | `string` | - | No |
| Divider | `decorative` | `boolean` | `false` | No |

| Global option | Type | Default |
|---|---|---|
| `defaultGap` | gap step | `4` |

## 6. Methods

| Method | Description |
|---|---|
| `Stack.apply(el, options?)` | Apply `aui-stack` plus gap and alignment classes. |
| `Flex.apply(el, options?)` | Apply `aui-flex` plus gap, alignment, justify, wrap, and direction classes. |
| `Grid.apply(el, options?)` | Apply `aui-grid` with fixed or auto-fit columns; sets `--aui-grid-min` through `el.style.setProperty`. |
| `Container.apply(el, options?)` | Apply `aui-container` and a size modifier. |
| `Divider.create(options?, doc?)` | Create (not insert) a divider element. |
| `handle.update(options)` | Merge, validate, and apply. Invalid options throw and leave the element unchanged. |
| `handle.destroy()` | Remove the added classes and custom property, restore displaced classes and a previous `--aui-grid-min`, and unsubscribe. Idempotent. |
| `isCssLength(value)` | The strict length check used for `minColumnWidth`. |

## 7. Events

None. Layout primitives are not interactive.

## 8. Slots/content areas

None. The consumer's element and its children are the content; helpers never create or move children.

## 9. CSS parts/hooks

| Class / property | Purpose |
|---|---|
| `aui-container`, `--sm` / `--md` / `--lg` / `--xl` | Centered region; `max-inline-size` from `container-width-*`, `padding-inline: space-4`. |
| `aui-stack` | Flex column with a gap. |
| `aui-flex`, `aui-inline` | Wrapping flex row; `aui-inline` also centers items on the cross axis. |
| `aui-flex--nowrap`, `aui-flex--reverse` | Flex modifiers. |
| `aui-grid`, `aui-grid--cols-1` ... `--cols-12`, `aui-grid--auto` | Grid modes. |
| `--aui-grid-min` | Minimum column width in auto mode (default `16rem`). |
| `aui-gap-0` ... `aui-gap-12` | Gap steps 0, 1, 2, 3, 4, 5, 6, 8, 10, 12 (`space-N`). |
| `aui-align-*`, `aui-justify-*` | `align-items` and `justify-content` utilities. |
| `aui-divider`, `--vertical`, `--labelled`, `aui-divider__label` | Separators. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/layout/tokens.json` (verified against the stylesheet in CI): `space-1` ... `space-12`, `container-width-sm|md|lg|xl`, `border-width`, `color-border`, `color-text-muted`, `font-family-sans`, `font-size-sm`, `line-height-tight`.

## 11. States

Applied and destroyed. The primitives have no interactive states.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| - | `X.apply(el, options)` | applied (classes added) |
| applied | `update(options)` | applied with new classes; the previous modifiers are removed |
| applied | global `defaultGap` change | gap class updated (when `gap` is omitted) |
| applied | `destroy()` | element restored to its previous classes and custom properties |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Not applicable: layout primitives and dividers are not focusable. Focus follows the source order of the content, including under `aui-flex--reverse`. |

## 14. ARIA contract

- Container, Stack, Flex, and Grid add no roles; the element keeps its own semantics.
- Horizontal divider: native `<hr>` (implicit `separator`).
- Vertical divider: `role="separator"` with `aria-orientation="vertical"`.
- Labelled divider: `role="separator"` with `aria-label` equal to the visible label. Separator children are presentational, so the name carries the text.
- Decorative divider: `aria-hidden="true"`.

## 15. Accessibility notes

- Auto-fit grids and wrapping rows support 320 CSS px reflow (WCAG 1.4.10). Fixed column counts do not collapse; prefer `columns: 'auto'` for content grids.
- Gaps are rem-based, so they scale with user text size and text-spacing overrides.
- `row-reverse` changes only the visual order. Avoid it when order carries meaning (WCAG 1.3.2).
- Screen readers differ in how they announce separators. Do not rely on a divider for structure; use headings or landmarks.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

`aui-grid--auto` uses `repeat(auto-fit, minmax(min(var(--aui-grid-min, 16rem), 100%), 1fr))`: columns are at least the minimum width but never wider than the container. Flex rows wrap by default. Containers keep inline padding at every width.

## 17. RTL behavior

Logical properties throughout (`max-inline-size`, `margin-inline`, `padding-inline`, `border-inline-start`). Flex rows follow the writing direction, so `start`/`end` and row order mirror automatically.

## 18. Theme behavior

Spacing uses `space-*` tokens (identical across built-in themes). Divider lines use `color-border` and labels `color-text-muted`. In forced-colors mode, divider lines are drawn in `CanvasText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { layout: { defaultGap: 3 } } });
```

Existing handles that omit `gap` update immediately.

## 20. Component configuration support

An explicit `gap` option overrides `defaultGap`. All options are dynamic through `update()`. CSS-only usage defaults to `space-4`, which matches the default `defaultGap`.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None. Layout primitives render no icons.

## 23. Security behavior

Helpers only change `classList` and set one custom property (`--aui-grid-min`) through `el.style.setProperty`. They never set a style attribute or parse HTML. `minColumnWidth` must match a strict CSS length pattern: a non-negative number with a known unit, or `0`. This rejects `calc()`, `var()`, and declaration injection such as `'10rem; color: red'`. Divider labels use `textContent`. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per `apply()`/`update()`: a few `classList` operations and at most one custom property. No DOM listeners; one configuration subscription per handle (released by `destroy()`). There is no dedicated performance budget yet.

## 26. Supported data scale

Not data-driven. Grids and stacks hold any number of children; layout cost is the browser's.

## 27. Usage examples

```html
<main class="aui-container aui-container--md">
  <div class="aui-stack aui-gap-6">
    <div class="aui-grid aui-grid--auto aui-gap-4">...tiles...</div>
    <hr class="aui-divider">
    <div class="aui-inline aui-gap-2 aui-justify-end">...buttons...</div>
  </div>
</main>
```

```ts
import { Grid } from '@absoluteui/components/layout';

const tiles = document.querySelector<HTMLElement>('#tiles');
if (tiles) Grid.apply(tiles, { minColumnWidth: '14rem', gap: 4 });
```

More examples, type-checked in CI: `metadata/layout/examples.json`.

## 28. Edge cases

- Applying Stack, Flex, or Grid to an element that already has one of them throws `LAYOUT_ALREADY_APPLIED`. Container can be combined with any of them.
- Classes that were on the element before `apply()` are never removed on `destroy()`. A conflicting pre-existing modifier (for example `aui-gap-2` when `gap: 6` is applied) is removed while applied and restored on `destroy()`.
- A `--aui-grid-min` value set by the consumer before `Grid.apply` is restored on `destroy()`.
- `minColumnWidth` with a fixed `columns` count throws, because it would be ignored.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `LAYOUT_OPTIONS` | configuration | Invalid gap, alignment, justify, wrap, direction, columns, length, size, orientation, or divider label combination. |
| `LAYOUT_ALREADY_APPLIED` | configuration | A display helper (Stack, Flex, Grid) or Container already owns the element. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid global `layout` configuration. |

Failed `apply()` calls leave the element unchanged.

## 30. Known limitations

- Fixed grid column counts do not collapse at narrow widths.
- Labelled dividers are horizontal only.
- CSS-only usage does not follow `defaultGap`; it uses `space-4` unless a gap class is set.
- Manual screen-reader verification of separators is pending.

## 31. Unsupported scenarios

- Arbitrary gap values (only the documented `space-*` steps).
- `calc()`, `var()`, or other CSS functions as `minColumnWidth`.
- Masonry and subgrid layouts.

## 32. TypeScript definitions

```ts
type LayoutGap = 0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12;
type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
type LayoutJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
type GridColumns = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 'auto';
interface StackOptions { gap?: LayoutGap; align?: LayoutAlign }
interface FlexOptions { gap?: LayoutGap; align?: LayoutAlign; justify?: LayoutJustify; wrap?: boolean; direction?: 'row' | 'row-reverse' }
interface GridOptions { columns?: GridColumns; minColumnWidth?: string; gap?: LayoutGap }
interface ContainerOptions { size?: 'sm' | 'md' | 'lg' | 'xl' }
interface DividerOptions { orientation?: 'horizontal' | 'vertical'; label?: string; decorative?: boolean }
interface LayoutHandle<O> { readonly element: HTMLElement; readonly options: Readonly<O>; update(options: Partial<O>): void; destroy(): void }
```

## 33. Vanilla JS example

```ts
import { Divider, Flex, Stack } from '@absoluteui/components/layout';
import '@absoluteui/components/layout/style.css';

const panel = document.querySelector<HTMLElement>('#settings');
const actions = document.querySelector<HTMLElement>('#settings-actions');
if (panel && actions) {
  const stack = Stack.apply(panel, { gap: 6 });
  panel.insertBefore(Divider.create(), actions);
  Flex.apply(actions, { gap: 2, justify: 'end' });
  window.addEventListener('pagehide', () => {
    stack.destroy();
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiGrid, AuiStack } from '@absoluteui/angular/layout';

@Component({
  selector: 'app-dashboard',
  imports: [AuiStack, AuiGrid],
  template: `
    <div auiStack [gap]="6">
      <h2>Projects</h2>
      <hr class="aui-divider" />
      <div auiGrid columns="auto" minColumnWidth="14rem" [gap]="4">
        @for (p of projects; track p) { <div>{{ p }}</div> }
      </div>
    </div>
  `,
})
export class DashboardComponent {
  readonly projects = ['Alpha', 'Beta', 'Gamma'];
}
```

`AuiStack`, `AuiFlex` (direction input: `flexDirection`), `AuiGrid`, and `AuiContainer` call `apply()` on the host element, forward input changes to `update()`, and call `destroy()` on teardown; children stay Angular-managed. Divider has no directive: use the classes (`aui-divider`, `--vertical`, `--labelled`) directly. The CSS classes also work without the directives.

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. The CSS classes work on any element, including inside custom elements that render light DOM. Custom-element wrappers are not shipped (SPEC section 4.4).
