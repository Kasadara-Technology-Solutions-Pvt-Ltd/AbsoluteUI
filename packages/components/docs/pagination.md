# Pagination

> Package: `@absoluteui/components/pagination` | Styles: `@absoluteui/components/pagination/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Navigate paged data. `Pagination` renders a labelled `<nav>` of native buttons: previous/next, optional first/last, and page numbers with ellipses. It can also show a localized result summary ("Showing 11-20 of 57") and a native "Rows per page" `<select>`. User page changes are announced politely. In narrow containers the page numbers give way to "Page 3 of 10". The pure helper `getPageItems` computes which pages to show, for custom renderers.

## 2. Anatomy

```text
<div class="aui-pagination">                                        (consumer host, size container)
  <nav class="aui-pagination__nav" aria-label="Pagination">
    <p class="aui-pagination__summary">Showing 11-20 of 57</p>        (total known)
    <div class="aui-pagination__controls">
      <button class="aui-pagination__button aui-pagination__first" aria-label="First page">   (showFirstLast)
      <button class="aui-pagination__button aui-pagination__previous" aria-label="Previous page">
      <ul class="aui-pagination__pages">
        <li class="aui-pagination__item"><button class="aui-pagination__page" aria-label="Page 1">1</button></li>
        <li class="aui-pagination__item aui-pagination__ellipsis" aria-hidden="true">...</li>
        <li class="aui-pagination__item"><button class="aui-pagination__page" aria-current="page" aria-label="Page 3">3</button></li>
      </ul>
      <span class="aui-pagination__compact">Page 3 of 10</span>        (narrow containers only)
      <button class="aui-pagination__button aui-pagination__next" aria-label="Next page">
      <button class="aui-pagination__button aui-pagination__last" aria-label="Last page">     (showFirstLast)
    </div>
    <div class="aui-pagination__size">                                  (pageSizes)
      <label class="aui-pagination__size-label" for>Rows per page</label>
      <select class="aui-pagination__size-select">
    </div>
  </nav>
</div>
```

## 3. When to use

- Tables and result lists split into pages, where users need to know and choose their position.
- Server-paged data where the total or page count is known.

## 4. When not to use

- Feeds read sequentially: use "Load more" or infinite scrolling with a clear end.
- Fewer items than one page: render the list without pagination.
- Step-by-step processes: use a stepper.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `nav` | `HTMLElement` | The `<nav>` landmark. |
| `page` | `number` | Current page (1 when there are no pages). |
| `pageCount` | `number` | Number of pages, given or derived from `total` and `pageSize`. |
| `pageSize` | `number \| null` | Items per page, or `null` when only `pageCount` is known. |
| `options` | `Readonly<PaginationOptions>` | Current options. |

Options: `page` (default 1), either `pageCount` or `total` (with `pageSize` or `pageSizes`), `pageSize`, `pageSizes`, `label` (default: localized "Pagination"), and `icons`. Full table: `metadata/pagination/api.json`.

| Global option | Type | Default |
|---|---|---|
| `siblingCount` | integer 0-10 | `1` |
| `boundaryCount` | integer 0-10 | `1` |
| `showFirstLast` | `boolean` | `false` |
| `showSummary` | `boolean` | `true` (shown only when `total` is known) |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Pagination.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setPage(page)` | Programmatic page change; clamped; no events and no announcement. |
| `update(options)` | Merge and apply options. Passing `pageCount` drops `total` and vice versa. The page is clamped when the count shrinks. |
| `destroy()` | Remove rendering, listeners, and subscriptions. |
| `getPageItems(page, pageCount, siblingCount?, boundaryCount?)` | Module export. Returns `(number \| 'ellipsis')[]`. |

`getPageItems` returns every page when there are at most `2 x boundaryCount + 2 x siblingCount + 3` pages. Beyond that it always returns exactly that many items, so the controls do not jump while paging. An ellipsis always hides at least two pages; a one-page gap shows the page itself. `page` is clamped, and non-integer or negative arguments throw `PAGINATION_ITEMS`.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ page, pageSize }` | Yes | The user changed the page, or the page size through the select. |

Clicking the current page emits nothing. Programmatic changes (`setPage`, `update`) emit no events.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-pagination` | Host; `container-type: inline-size`. |
| `aui-pagination--rtl` | Configured rtl direction. |
| `aui-pagination__nav` | The `<nav>` landmark. |
| `aui-pagination__summary` | Result summary. |
| `aui-pagination__controls` | Buttons row. |
| `aui-pagination__button` | Any pagination button. |
| `aui-pagination__first`, `__previous`, `__next`, `__last` | Direction buttons. |
| `aui-pagination__pages`, `__item`, `__page`, `__ellipsis` | Page list. |
| `aui-pagination__compact` | "Page 3 of 10", shown in narrow containers. |
| `aui-pagination__size`, `__size-label`, `__size-select` | Rows-per-page field. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/pagination/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-selected`, `color-selected-text`, `color-primary`, `color-hover`, `color-text-muted`, `color-focus-ring`, `touch-target-min`, `radius-md`.

## 11. States

default, hover, focus-visible, current page, disabled (at the bounds), compact (narrow container), empty (no pages).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| page n | page button, previous, next, first, or last | new page; `aui-change`; announcement |
| page n, size s | rows-per-page select | size s′; page recomputed so the first item of the old page stays visible; `aui-change` |
| any | `setPage(n)` / `update({ page })` | page clamped to 1..pageCount; no event |
| page n | `update({ total })` makes the count smaller | page clamped; no event |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves between enabled buttons and the select (native tab order). |
| Enter / Space | Button focused | Activates it. |
| Arrow keys, typing | Select focused | Native select behavior. |

## 14. ARIA contract

- `<nav aria-label>` landmark (the `label` option or localized "Pagination").
- Page buttons are named "Page 3" (localized, locale-formatted number). The current one has `aria-current="page"`.
- Direction buttons are icon-only and named "Previous page", "Next page", "First page", and "Last page". They use native `disabled` at the bounds.
- Ellipses and icons are `aria-hidden`.
- The rows-per-page select has a visible `<label for>`.

## 15. Accessibility notes

- User page changes are announced through the shared polite live region: the summary when the total is known, otherwise "Page 3 of 10". Programmatic changes are silent.
- Focus stays on the activated control across re-renders. If that control becomes disabled (for example Previous on page 1), focus moves to the current page button.
- The current page is shown by fill, border, and weight, not by color alone.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The host is a size container. Below 30rem of inline space, page numbers are hidden and "Page 3 of 10" is shown between previous and next. Buttons keep the minimum touch-target size. Summary, controls, and the size select wrap as needed.

## 17. RTL behavior

Layout follows the document direction. Chevron icons are mirrored when `direction` is `'rtl'` or when the element is in an rtl context (`:dir(rtl)`), so "previous" always points against the reading direction.

## 18. Theme behavior

Colors come from role tokens only. Verified in the light, dark, and high-contrast themes. In forced-colors mode the current page uses `Highlight`/`HighlightText` and disabled buttons use `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { pagination: { siblingCount: 2, showFirstLast: true } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.previous` (default `chevron-left`), `icons.next` (`chevron-right`), `icons.first` (`chevrons-left`), and `icons.last` (`chevrons-right`).

## 23. Security behavior

All text uses `textContent`; nothing is parsed as HTML. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. The component never fetches data; load pages on `aui-change`.

## 25. Performance characteristics

Two listeners (a delegated click on the controls, and change on the select) plus one configuration subscription per instance. Rendered page items are bounded by `siblingCount` and `boundaryCount`, not by the page count. Budget: under 1 ms for `Pagination.create` with 10,000 pages.

## 26. Supported data scale

Any page count up to `Number.MAX_SAFE_INTEGER`. `getPageItems` is tested exhaustively for page counts 0 to 30 across seven sibling/boundary combinations.

## 27. Usage examples

```ts
import { Pagination } from '@absoluteui/components/pagination';

const host = document.createElement('div');
document.body.append(host);
Pagination.create(host, { total: 57, pageSize: 10, page: 2 });
```

More examples, type-checked in CI: `metadata/pagination/examples.json`.

## 28. Edge cases

- `total: 0` gives zero pages: no page buttons, previous and next disabled, and the summary "No results".
- One page: a single current page button; previous and next disabled.
- `page` outside 1..pageCount is clamped.
- Changing rows per page from 10 to 25 on page 4 (items 31-40) goes to page 2 (items 26-50).
- `boundaryCount: 0` does not always show the first and last pages; combine it with `showFirstLast`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `PAGINATION_OPTIONS` | configuration | Neither or both of `pageCount`/`total`; negative or non-integer counts; `total` without `pageSize`/`pageSizes`; a `pageSize` not in `pageSizes`; empty `pageSizes`; an empty `label`; a non-integer `page`. |
| `PAGINATION_ITEMS` | configuration | `getPageItems` called with non-integer or negative arguments. |
| `CFG_INVALID_VALUE` | configuration | Invalid `siblingCount`, `boundaryCount`, `showFirstLast`, `showSummary`, `locale`, or `direction`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- No "go to page" input.
- The compact breakpoint (30rem container width) is fixed.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Cursor-based pagination without a known page count.
- Page items as links (`href`).

## 32. TypeScript definitions

```ts
type PageItem = number | 'ellipsis';
function getPageItems(page: number, pageCount: number, siblingCount?: number, boundaryCount?: number): PageItem[];
interface PaginationIcons { previous: IconRef; next: IconRef; first: IconRef; last: IconRef }
interface PaginationChangeDetail { page: number; pageSize: number | null }
```

## 33. Vanilla JS example

```ts
import { Pagination, type PaginationChangeDetail } from '@absoluteui/components/pagination';
import '@absoluteui/components/pagination/style.css';

const host = document.querySelector<HTMLElement>('#orders-pager');
if (host) {
  const pager = Pagination.create(host, { total: 240, pageSize: 25, pageSizes: [25, 50, 100] });
  host.addEventListener('aui-change', (event) => {
    const { page, pageSize } = (event as CustomEvent<PaginationChangeDetail>).detail;
    host.dataset.query = `page=${String(page)}&size=${String(pageSize)}`;
    pager.update({ total: 240 });
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiPagination } from '@absoluteui/angular/pagination';

@Component({
  selector: 'app-orders-pager',
  imports: [AuiPagination],
  template: `<aui-pagination [total]="total" [pageSize]="pageSize" [pageSizes]="[25, 50, 100]" [page]="page" (changed)="onPage($event.page, $event.pageSize)"></aui-pagination>`,
})
export class OrdersPagerComponent {
  total = 240;
  page = 1;
  pageSize = 25;
  onPage(page: number, pageSize: number | null): void {
    this.page = page;
    if (pageSize !== null) this.pageSize = pageSize;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
