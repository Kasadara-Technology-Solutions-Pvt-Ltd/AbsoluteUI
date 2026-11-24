# Accordion

> Package: `@absoluteui/components/accordion` | Styles: `@absoluteui/components/accordion/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Vertically stacked headers that each show or hide a section of content, following the WAI-ARIA APG Accordion pattern. Every header is a native heading containing a native `<button>`, so Tab, Enter, and Space work without scripting tricks. Supports single or multiple expansion, an optional "always one open" mode, and an animated height transition that is removed under reduced motion.

## 2. Anatomy

```text
<div class="aui-accordion">                                   (consumer host)
  <div class="aui-accordion__item [--expanded] [--disabled]">
    <h3 class="aui-accordion__heading">                       (headingLevel)
      <button class="aui-accordion__trigger" aria-expanded aria-controls=panel id=trigger>
        <span class="aui-accordion__title">Title</span>
        <svg class="aui-icon aui-accordion__icon" aria-hidden="true">
      </button>
    </h3>
    <div class="aui-accordion__panel" id=panel role="region" aria-labelledby=trigger hidden>
      <div class="aui-accordion__clip">
        <div class="aui-accordion__content">content</div>
      </div>
    </div>
  </div>
</div>
```

## 3. When to use

- Long pages where users need only some sections at a time, such as FAQs or settings groups.
- Progressive disclosure of secondary details in a constrained space.

## 4. When not to use

- Content users must read or compare side by side: show it on the page.
- Switching between peer views of the same content: use Tabs.
- A single show/hide toggle: a native `<details>` element is enough.
- Navigation menus.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `value` | `string[]` | Expanded item ids, in item order. |
| `options` | `Readonly<AccordionOptions>` | Current options. |

Options: `items` (required; `{ id, title, content, disabled? }` with unique ids), `value`, `icons`, plus the global options below. Full table: `metadata/accordion/api.json`.

| Global option | Type | Default |
|---|---|---|
| `multiple` | `boolean` | `false` |
| `collapsible` | `boolean` | `true` |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6` | `3` |

## 6. Methods

| Method | Description |
|---|---|
| `Accordion.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `panel(id)` | The content container of an item's panel, or `null` for an unknown id. |
| `expand(id)` | Expand programmatically; in single mode the others collapse. No events. |
| `collapse(id)` | Collapse programmatically, even when `collapsible` is false. No events. |
| `toggle(id)` | Expand or collapse programmatically. No events. |
| `update(options)` | Merge and apply options. Passing `value` replaces the expanded set. |
| `destroy()` | Remove rendering, listeners, and subscriptions. |

`expand`, `collapse`, and `toggle` throw `ACCORDION_ITEM` for an unknown id.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value: string[], id, expanded }` | Yes | The user expanded or collapsed an item. |

Programmatic changes (`expand`, `collapse`, `toggle`, `update`) emit no events.

## 8. Slots/content areas

Each item's panel. Pass `content` as a string (rendered as text) or a `Node`; `panel(id)` returns the container for later changes.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-accordion` | Host. |
| `aui-accordion--animated` | Set after the first toggle; enables the expand transition (panels open at creation do not animate). |
| `aui-accordion__item`, `--expanded`, `--disabled` | Item wrapper and state. |
| `aui-accordion__heading` | Heading element. |
| `aui-accordion__trigger`, `__title`, `__icon` | Header button, its text, and the indicator. |
| `aui-accordion__panel`, `__clip`, `__content` | Panel, clipping grid row, content container. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/accordion/tokens.json`. Key tokens: `color-border`, `color-text`, `color-text-muted`, `color-hover`, `color-focus-ring`, `control-height-lg`, `space-3`, `space-4`, `duration-normal`, `easing-standard`.

## 11. States

collapsed, expanded, expanded and locked (single, non-collapsible), disabled item, hover, focus-visible.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| collapsed | user activates header | expanded; in single mode the open item collapses; `aui-change` |
| expanded | user activates header (collapsible or multiple) | collapsed; `aui-change` |
| expanded (single, non-collapsible) | user activates header | no change (header is `aria-disabled`) |
| any | `expand` / `collapse` / `toggle` / `update({ value })` | new state; no events |
| multiple, several open | global config switches to single | only the first open item stays expanded |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves through header buttons and focusable panel content in document order. |
| Enter / Space | Header focused | Expands or collapses the panel. |
| ArrowDown / ArrowUp | Header focused | Next or previous header, wrapping (APG optional). |
| Home / End | Header focused | First or last header (APG optional). |

Arrow keys inside panel content are never intercepted.

## 14. ARIA contract

- Header button: `aria-expanded`, `aria-controls` -> panel id.
- Panel: `aria-labelledby` -> header button id; `hidden` while collapsed.
- Panel `role="region"` only when there are six items or fewer (APG: avoid landmark proliferation).
- `aria-disabled="true"` on disabled items and on the open header in single, non-collapsible mode.
- The indicator icon is `aria-hidden`.

## 15. Accessibility notes

- Headers are real headings; set `headingLevel` to fit the page outline.
- Disabled and locked headers stay focusable (`aria-disabled`, not `disabled`) so their state is discoverable.
- Re-rendering (for example a new `headingLevel`) keeps focus on the same header.
- The height transition and the icon rotation animation are removed under `prefers-reduced-motion` and `animation: 'none'`; the rotated icon remains as a static indicator.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Full width of its container. Long titles wrap; the indicator stays at the inline end.

## 17. RTL behavior

Logical properties throughout. The title is at the inline start and the indicator at the inline end.

## 18. Theme behavior

Colors come from role tokens only. In forced-colors mode borders use `CanvasText`, focus uses a `Highlight` outline, and disabled headers use `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { accordion: { multiple: true, headingLevel: 2 } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (default `chevron-down`); rotated 180 deg while expanded.

## 23. Security behavior

Titles and string content use `textContent` and are never parsed as HTML. Node content is inserted as-is; sanitizing it is the consumer's responsibility. CSP-safe: no inline styles or handlers.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Two delegated listeners on the host (click, keydown) and one configuration subscription, regardless of item count. State changes update attributes in place; only `items`, `headingLevel`, or `icons` changes re-create the item DOM. Budget: under 5 ms for 50 items (not yet covered by the performance test).

## 26. Supported data scale

Designed for tens of items. Unit-tested with up to seven items.

## 27. Usage examples

```ts
import { Accordion } from '@absoluteui/components/accordion';

const host = document.createElement('div');
document.body.append(host);
Accordion.create(host, {
  headingLevel: 2,
  items: [
    { id: 'shipping', title: 'How long does shipping take?', content: 'Orders ship within two business days.' },
    { id: 'returns', title: 'Can I return an item?', content: 'Returns are free for 30 days.' },
  ],
});
```

More examples, type-checked in CI: `metadata/accordion/examples.json`.

## 28. Edge cases

- `value` with more than one id in single mode throws `ACCORDION_OPTIONS`.
- An empty `items` array renders an empty host.
- Programmatic `collapse` is allowed in non-collapsible mode; only user interaction is locked.
- A disabled item can still be expanded programmatically.
- Node content is moved into the panel, not cloned; passing the same Node to two items keeps it in the last one.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `ACCORDION_OPTIONS` | configuration | Missing or duplicate ids, empty title, unknown ids in `value`, or several ids in single mode. |
| `ACCORDION_ITEM` | configuration | `expand`, `collapse`, or `toggle` with an unknown id. |
| `CFG_INVALID_VALUE` | configuration | Invalid `multiple`, `collapsible`, or `headingLevel` value. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Collapsed content is not found by find-in-page (`hidden`, not `hidden="until-found"`).
- Changing `items` re-creates the item DOM.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML strings as titles or content (pass a Node).
- Interactive content inside headers.

## 32. TypeScript definitions

```ts
type AccordionHeadingLevel = 2 | 3 | 4 | 5 | 6;
interface AccordionItem { id: string; title: string; content: Node | string; disabled?: boolean }
interface AccordionOptions { items: readonly AccordionItem[]; value?: readonly string[]; multiple?: boolean; collapsible?: boolean; headingLevel?: AccordionHeadingLevel; icons?: Partial<{ expand: IconRef }> }
interface AccordionChangeDetail { value: string[]; id: string; expanded: boolean }
```

## 33. Vanilla JS example

```ts
import { Accordion, type AccordionChangeDetail } from '@absoluteui/components/accordion';
import '@absoluteui/components/accordion/style.css';

const host = document.querySelector<HTMLElement>('#settings');
if (host) {
  Accordion.create(host, {
    multiple: true,
    items: [
      { id: 'profile', title: 'Profile', content: 'Name and photo' },
      { id: 'privacy', title: 'Privacy', content: 'Who can see your activity' },
    ],
  });
  host.addEventListener('aui-change', (event) => {
    host.dataset.open = (event as CustomEvent<AccordionChangeDetail>).detail.value.join(',');
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { AccordionItem } from '@absoluteui/components/accordion';
import { AuiAccordion } from '@absoluteui/angular/accordion';

@Component({
  selector: 'app-faq',
  imports: [AuiAccordion],
  template: `<aui-accordion [items]="items" [headingLevel]="2" [value]="open" (changed)="open = $event.value"></aui-accordion>`,
})
export class FaqComponent {
  open: string[] = ['shipping'];
  readonly items: AccordionItem[] = [
    { id: 'shipping', title: 'Shipping', content: 'Orders ship within two business days.' },
    { id: 'returns', title: 'Returns', content: 'Returns are free for 30 days.' },
  ];
}
```

## 35. React example

```tsx
import { AuiAccordion } from '@absoluteui/react/accordion';

const items = [{ id: 'returns', title: 'Returns', content: 'Within 30 days.' }];

export function Example() {
  return <AuiAccordion items={items} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiAccordion } from '@absoluteui/vue/accordion';
const items = [{ id: 'returns', title: 'Returns', content: 'Within 30 days.' }];
</script>

<template>
  <AuiAccordion :items="items" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
