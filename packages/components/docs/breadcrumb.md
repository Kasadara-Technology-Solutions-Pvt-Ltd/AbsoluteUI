# Breadcrumb

> Package: `@absoluteui/components/breadcrumb` | Styles: `@absoluteui/components/breadcrumb/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Show where the current page sits in a hierarchy and let users jump to its ancestors. `Breadcrumb` implements the WAI-ARIA APG Breadcrumb pattern: a labelled `<nav>` with an ordered list of links, the current page marked with `aria-current="page"`. Long trails can collapse behind an expander. Hrefs are validated (http(s) and relative URLs only), and a cancelable `aui-navigate` event lets client-side routers take over.

## 2. Anatomy

```text
<div class="aui-breadcrumb">                                        (consumer host)
  <nav class="aui-breadcrumb__nav" aria-label="Breadcrumb">
    <ol class="aui-breadcrumb__list">
      <li class="aui-breadcrumb__item"><a class="aui-breadcrumb__link" href="/">Home</a></li>
      <li class="aui-breadcrumb__item aui-breadcrumb__item--collapsed">    (when collapsed)
        <svg class="aui-icon aui-breadcrumb__separator" aria-hidden="true">
        <button class="aui-breadcrumb__expander" aria-label="Show all breadcrumbs"><span aria-hidden="true">...</span></button>
      </li>
      <li class="aui-breadcrumb__item">
        <svg class="aui-icon aui-breadcrumb__separator" aria-hidden="true">
        <span class="aui-breadcrumb__text" aria-current="page">Current</span>
      </li>
    </ol>
  </nav>
</div>
```

## 3. When to use

- Hierarchical sites or apps where users benefit from seeing and jumping to ancestor pages.
- Deep pages reached from search or links, to show where the page sits.

## 4. When not to use

- Flat sites with one or two levels.
- Showing browsing history: breadcrumbs show hierarchy, not the path taken.
- Sequential processes: use a stepper.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `nav` | `HTMLElement` | The `<nav>` landmark. |
| `expanded` | `boolean` | Whether the user expanded a collapsed trail. |
| `options` | `Readonly<BreadcrumbOptions>` | Current options. |

Options: `items` (required; `{ label, href? }[]`, root first, current page last), `label` (default: localized "Breadcrumb"), `linkCurrent` (default `false`), and `icons`. Full table: `metadata/breadcrumb/api.json`.

| Global option | Type | Default |
|---|---|---|
| `maxItems` | `0` or integer 2-1000 | `0` (never collapse) |
| `locale` (inherited) | BCP 47 | `'en-US'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Breadcrumb.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `update(options)` | Merge and apply options. New `items` collapse again. A failed update keeps the previous state. |
| `destroy()` | Remove rendering, listeners, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | Description |
|---|---|---|---|---|
| `aui-navigate` | `{ index, item }` | Yes | Yes | An unmodified primary click (or Enter) on a link. `preventDefault()` stops native navigation so a router can handle it. |

Modified clicks (Ctrl, Meta, Shift, Alt, or a non-primary button) keep native behavior, such as opening a new tab, and are not reported.

## 8. Slots/content areas

None. Items are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-breadcrumb` | Host. |
| `aui-breadcrumb--rtl` | Configured rtl direction. |
| `aui-breadcrumb__nav` | The `<nav>` landmark. |
| `aui-breadcrumb__list` | The `<ol>`. |
| `aui-breadcrumb__item`, `--collapsed` | List items; `--collapsed` holds the expander. |
| `aui-breadcrumb__link` | Item link. |
| `aui-breadcrumb__text` | Text item (current page, or an item without href). |
| `aui-breadcrumb__separator` | Decorative separator icon. |
| `aui-breadcrumb__expander` | Button that reveals collapsed items. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/breadcrumb/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-link`, `color-text`, `color-text-muted`, `color-hover`, `color-focus-ring`, `font-size-sm`, `icon-size-sm`.

## 11. States

default, hover, focus-visible, current page, collapsed, expanded.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| collapsed | expander activated | expanded; focus on the first revealed item |
| expanded | `update({ items })` | collapsed again when the new trail exceeds `maxItems` |
| any | link click | `aui-navigate`; native navigation unless prevented |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves between links and the expander (native tab order). |
| Enter | Link focused | Follows the link; emits `aui-navigate` first. |
| Enter / Space | Expander focused | Reveals the full trail and focuses the first revealed item. |

## 14. ARIA contract

- `<nav aria-label>` landmark (the `label` option or localized "Breadcrumb").
- `<ol>` of `<li>` items; the last item has `aria-current="page"` and is text unless `linkCurrent` is set.
- Separators are `aria-hidden` icons.
- The expander is a native button named "Show all breadcrumbs"; its visible ellipsis is `aria-hidden`.

## 15. Accessibility notes

- The ordered list conveys the number of levels and each item's position.
- After expanding, focus moves to the first revealed item. A revealed text item gets `tabindex="-1"` so it can take focus.
- Links are underlined, so they are not distinguished by color alone.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Items wrap onto multiple lines and long labels break anywhere. Set `maxItems` to collapse long trails, for example through global configuration on small screens.

## 17. RTL behavior

Layout follows the document direction. The chevron separator is mirrored when `direction` is `'rtl'` or when the element is in an rtl context (`:dir(rtl)`).

## 18. Theme behavior

Colors come from role tokens only. Verified in the light, dark, and high-contrast themes. In forced-colors mode links use `LinkText` and the expander gets a `ButtonText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { breadcrumb: { maxItems: 4 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.separator` (default `chevron-right`).

## 23. Security behavior

Labels use `textContent`. Each `href` is parsed with the URL standard against `document.baseURI`. Only `http:`/`https:` URLs and scheme-less URLs (relative, path-absolute, protocol-relative, query, fragment) are accepted, so `javascript:`, `data:`, `vbscript:`, `file:`, `mailto:` and obfuscations such as `java\tscript:` throw `BREADCRUMB_OPTIONS`. The error names the property but never echoes the value. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Navigation is native link navigation unless `aui-navigate` is prevented.

## 25. Performance characteristics

One click listener on the list and one configuration subscription per instance. Budget: under 1 ms for `Breadcrumb.create` with 10 items.

## 26. Supported data scale

Trails of any practical depth; collapsing is recommended above about 5 items. Tested with trails of up to 6 items.

## 27. Usage examples

```ts
import { Breadcrumb } from '@absoluteui/components/breadcrumb';

const host = document.createElement('div');
document.body.append(host);
Breadcrumb.create(host, {
  items: [
    { label: 'Home', href: '/' },
    { label: 'Products', href: '/products' },
    { label: 'Laptops' },
  ],
});
```

More examples, type-checked in CI: `metadata/breadcrumb/examples.json`.

## 28. Edge cases

- A single-item trail renders one current-page item and no separator.
- `maxItems: 2` shows the first item, the expander, and the current page.
- `maxItems: 1` is rejected, because it would hide the current page.
- Items without `href` render as text, including in the middle of the trail.
- With a `file:` base URL, relative hrefs are still accepted.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BREADCRUMB_OPTIONS` | configuration | Empty `items`, an empty item label, an empty `label`, or an unsafe or unparsable `href`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `maxItems`, `locale`, or `direction`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Collapsing is by item count, not by measured width.
- An expanded trail stays expanded until the items change.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- A dropdown menu of collapsed items (the expander reveals them in place).
- HTML in labels.
- Hrefs with schemes other than http and https.

## 32. TypeScript definitions

```ts
interface BreadcrumbItem { label: string; href?: string }
interface BreadcrumbIcons { separator: IconRef }
interface BreadcrumbNavigateDetail { index: number; item: BreadcrumbItem }
```

## 33. Vanilla JS example

```ts
import { Breadcrumb, type BreadcrumbNavigateDetail } from '@absoluteui/components/breadcrumb';
import '@absoluteui/components/breadcrumb/style.css';

const host = document.querySelector<HTMLElement>('#trail');
if (host) {
  Breadcrumb.create(host, { maxItems: 3, items: [{ label: 'Home', href: '/' }, { label: 'Docs', href: '/docs' }, { label: 'API', href: '/docs/api' }, { label: 'Tabs' }] });
  host.addEventListener('aui-navigate', (event) => {
    const { item } = (event as CustomEvent<BreadcrumbNavigateDetail>).detail;
    if (item.href !== undefined) {
      event.preventDefault();
      history.pushState(null, '', item.href);
    }
  });
}
```

## 34. Angular example

Bind the DOM event `(aui-navigate)` rather than the `(navigate)` output when a router handles navigation: outputs carry only the event `detail`, and `preventDefault()` (which stops the native navigation) needs the event itself.

```ts
import { Component, inject } from '@angular/core';
import { Router } from '@angular/router';
import type { BreadcrumbItem, BreadcrumbNavigateDetail } from '@absoluteui/components/breadcrumb';
import { AuiBreadcrumb } from '@absoluteui/angular/breadcrumb';

@Component({
  selector: 'app-trail',
  imports: [AuiBreadcrumb],
  template: `<aui-breadcrumb [items]="items" [maxItems]="3" (aui-navigate)="go($event)"></aui-breadcrumb>`,
})
export class TrailComponent {
  private readonly router = inject(Router);
  readonly items: BreadcrumbItem[] = [{ label: 'Home', href: '/' }, { label: 'Projects', href: '/projects' }, { label: 'Atlas' }];

  go(event: Event): void {
    const { item } = (event as CustomEvent<BreadcrumbNavigateDetail>).detail;
    if (item.href === undefined) return;
    event.preventDefault();
    void this.router.navigateByUrl(item.href);
  }
}
```

## 35. React example

```tsx
import { AuiBreadcrumb } from '@absoluteui/react/breadcrumb';

const crumbs = [{ label: 'Home', href: '/' }, { label: 'Orders', href: '/orders' }, { label: 'Order 1042' }];

export function Example() {
  return <AuiBreadcrumb items={crumbs} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiBreadcrumb } from '@absoluteui/vue/breadcrumb';
const crumbs = [{ label: 'Home', href: '/' }, { label: 'Orders', href: '/orders' }, { label: 'Order 1042' }];
</script>

<template>
  <AuiBreadcrumb :items="crumbs" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
