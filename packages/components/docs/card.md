# Card

> Package: `@absoluteui/components/card` | Styles: `@absoluteui/components/card/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Card and Surface. `.aui-surface` is a bordered panel on `color-surface`, with flat, raised, and sunken variants and optional inset padding. `.aui-card` adds header (title, subtitle), media, body, and footer sections. Both work as CSS-only APIs.

`Card.create` renders the structure with the right semantics:
- an `<article>` named by its title when there is one, otherwise a plain `<div>`;
- an optional block-link mode, where the whole card is clickable, there is exactly one tab stop, and screen readers announce only the title.

## 2. Anatomy

```text
<div>                                                          (consumer host)
  <article class="aui-surface aui-card [aui-surface--raised|--sunken] [aui-card--interactive]" aria-labelledby=title>
    <div class="aui-card__header">
      <h3 class="aui-card__title" id=title>Title              (h2-h6, headingLevel)
        <a class="aui-card__link" href>Title</a>               (interactive only; ::after covers the card)
      </h3>
      <p class="aui-card__subtitle">Subtitle</p>               (optional)
    </div>
    <div class="aui-card__media">                              (visually first; hidden while empty)
    <div class="aui-card__body">                               (content; hidden while empty)
    <div class="aui-card__footer">                             (actions/metadata; hidden while empty)
  </article>                                                   (<div> when there is no title)
</div>
```

## 3. When to use

- Self-contained content: a product, project, article teaser, or summary tile.
- Collections of similar items in a grid, each linking to a detail page (interactive cards).
- Panels that visually separate a region of the page (Surface).

## 4. When not to use

- A single action without content: use a Button or Link.
- Cards with several equally important actions: skip interactive mode and put the actions in the footer.
- Comparable data across items: use a table.
- Cards nested inside cards.

## 5. Public properties

Card:

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are replaced by the card. |
| `element` | `HTMLElement` | Root `<article>` (titled) or `<div>`. Replaced when a title is added or removed. |
| `body` | `HTMLDivElement` | Body content area. |
| `footer` | `HTMLDivElement` | Footer area. |
| `media` | `HTMLDivElement` | Media area. |
| `options` | `Readonly<CardOptions>` | Current options. |

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `title` | `string` | - | No | Heading and accessible name. |
| `subtitle` | `string` | - | No | Supporting line (text). |
| `content` | `Node \| string` | - | No | Body; strings render as text. |
| `footer` | `Node` | - | No | Footer content. |
| `media` | `Node` | - | No | Image or illustration. |
| `interactive` | `{ href: string }` | - | No | Block-link mode; requires `title`. |
| `variant` | `'flat' \| 'raised' \| 'sunken'` | `'flat'` | No | Surface treatment. |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6` | `3` | Yes | Title heading level. |

`SurfaceHandle` (from `Surface.apply`): `element`, `options` (`{ variant?, padded? }`).

## 6. Methods

| Method | Description |
|---|---|
| `Card.create(host, options?)` | Render into `host` (children are replaced). Throws on invalid options before touching the host. |
| `card.update(options)` | Merge and apply options. Content areas are replaced only when their option is passed. Pass `undefined` to remove `title`, `subtitle`, or `interactive`. |
| `card.destroy()` | Remove the card element and the configuration subscription. |
| `Surface.apply(el, options?)` | Apply surface classes to a consumer element. |
| `surface.update(options)` / `surface.destroy()` | Change or remove the classes it added. |

## 7. Events

None. Interactive cards use a native link, so navigation is handled by the browser. Listen for `click` on `card.element` if needed.

## 8. Slots/content areas

`body`, `footer`, and `media`. Each can be filled with an option or by appending to the property directly. Empty areas collapse (`:empty`).

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-surface`, `--raised`, `--sunken`, `--padded` | Surface and modifiers. |
| `aui-card`, `aui-card--interactive` | Card root and block-link mode. |
| `aui-card__header`, `__title`, `__link`, `__subtitle` | Header. |
| `aui-card__media`, `__body`, `__footer` | Sections. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/card/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-surface-sunken`, `color-border`, `color-border-strong`, `color-link`, `color-text-muted`, `radius-md`, `shadow-sm`, `shadow-md`, `space-inset`, `font-size-lg`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-card-radius` (card and surface corner radius; falls back to `radius-md`), `--aui-card-bg` (card background; falls back to `color-surface`), `--aui-card-border-color` (card boundary (decorative); falls back to `color-border`), `--aui-card-padding` (header, body, and footer padding; falls back to `space-inset`), `--aui-card-shadow` (raised surface elevation; falls back to `shadow-sm`).

## 11. States

default, raised, sunken, interactive, hover (interactive), focus-visible (interactive).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| untitled `<div>` | `update({ title })` | `<article>`; content areas move to the new root |
| titled | `update({ title: undefined })` | `<div>`; `interactive` must be removed first or in the same update |
| static | `update({ interactive: { href } })` | block link |
| any | global `headingLevel` change | title heading re-created at the new level |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Interactive card | One tab stop: the title link. Other controls in the card (for example footer buttons) are separate tab stops after it. |
| Enter | Title link focused | Follows the link (native). |
| Tab / Shift+Tab | Non-interactive card | The card is not focusable; focus moves through controls in its content. |

## 14. ARIA contract

- Titled cards: `<article aria-labelledby="{title id}">`.
- Untitled cards: a generic `<div>` with no role.
- Title: native heading at `headingLevel`.
- Interactive: a native `<a href>` inside the heading. Its accessible name is the title only.
- Sections are `<div>`s, not `<header>`/`<footer>`, so cards never create banner or contentinfo landmarks.

## 15. Accessibility notes

- Block-link pattern: wrapping the whole card in `<a>` would make screen readers read the entire card as the link name. Here only the title is the link, stretched with `::after`.
- The focus indicator is drawn around the whole card (`:has(.aui-card__link:focus-visible)`).
- Media is visually first but comes after the header in source order, so heading navigation reaches the title first.
- Give informative images a text alternative, or `alt=""` when decorative.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Cards fill their container. For responsive collections, place them in an `aui-grid aui-grid--auto` (layout). Footer content wraps; media images are fluid.

## 17. RTL behavior

Logical properties throughout; all sections follow the writing direction.

## 18. Theme behavior

Colors, radius, shadow, and padding come from role tokens (`space-inset` follows density). Verified token pairs: `color-text` and `color-text-muted` on `color-surface` and `color-surface-sunken`, and `color-link` on `color-surface`. In forced-colors mode, the border stays, the title link uses `LinkText`, and focus uses a `Highlight` outline.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { card: { headingLevel: 2 } } });
```

Existing cards re-render their title at the new level.

## 20. Component configuration support

The `headingLevel` option overrides global and theme defaults. All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None. Cards render no icons of their own.

## 23. Security behavior

- Title, subtitle, and string content use `textContent`. `Node` content is appended as-is; the consumer owns it.
- `interactive.href` is checked with the WHATWG URL parser and must be http(s) or relative. `javascript:`, `data:`, and other schemes are rejected, including obfuscated forms such as `java\tscript:`.
- No inline styles. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant DOM per card (root plus five section elements), no event listeners, and one configuration subscription. There is no dedicated performance budget yet.

## 26. Supported data scale

Not data-driven. For long card collections, render only visible cards (virtualize) in the application.

## 27. Usage examples

```html
<article class="aui-surface aui-card" aria-labelledby="c1">
  <div class="aui-card__header"><h3 class="aui-card__title" id="c1">Quarterly report</h3></div>
  <div class="aui-card__body">Revenue grew 4%.</div>
</article>
```

```ts
import { Card } from '@absoluteui/components/card';

const host = document.createElement('div');
document.body.append(host);
Card.create(host, { title: 'Project Alpha', subtitle: 'Owner: Ada', interactive: { href: '/projects/alpha' } });
```

More examples, type-checked in CI: `metadata/card/examples.json`.

## 28. Edge cases

- `interactive` without `title` throws `CARD_OPTIONS`.
- Adding or removing the title replaces `card.element` (the tag changes). `body`, `footer`, and `media` keep their content.
- Controls inside an interactive card are lifted above the overlay (`position: relative; z-index: 1`), so they stay clickable.
- `update()` without `content` keeps whatever the consumer appended to `card.body`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CARD_OPTIONS` | configuration | Blank title, invalid content types, invalid variant, `interactive` without a title, or an unsafe href. |
| `SURFACE_OPTIONS` | configuration | Invalid surface variant or `padded`. |
| `SURFACE_ALREADY_APPLIED` | configuration | `Surface.apply` on an element that already has an active surface handle. |
| `CFG_INVALID_VALUE` | configuration | `headingLevel` outside 2-6. |

A failed construction leaves the host untouched and registers no subscription.

## 30. Known limitations

- Mouse text selection inside interactive cards is limited by the link overlay.
- The root element is replaced when the title is added or removed.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML strings as title, subtitle, or content (pass a `Node`).
- A button (non-navigation action) as the whole-card target.
- Heading level 1 for card titles.

## 32. TypeScript definitions

```ts
type CardHeadingLevel = 2 | 3 | 4 | 5 | 6;
type SurfaceVariant = 'flat' | 'raised' | 'sunken';
interface CardInteractive { href: string }
interface CardOptions {
  title?: string; subtitle?: string; content?: Node | string; footer?: Node; media?: Node;
  interactive?: CardInteractive; variant?: SurfaceVariant; headingLevel?: CardHeadingLevel;
}
interface SurfaceOptions { variant?: SurfaceVariant; padded?: boolean }
interface SurfaceHandle { readonly element: HTMLElement; readonly options: Readonly<SurfaceOptions>; update(o: Partial<SurfaceOptions>): void; destroy(): void }
```

## 33. Vanilla JS example

```ts
import { Card } from '@absoluteui/components/card';
import '@absoluteui/components/card/style.css';

const host = document.querySelector<HTMLElement>('#report');
if (host) {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = 'Download';
  const card = Card.create(host, { title: 'Quarterly report', content: 'Revenue grew 4%.', footer: button, variant: 'raised' });
  button.addEventListener('click', () => {
    card.update({ subtitle: 'Download started' });
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiCard } from '@absoluteui/angular/card';

@Component({
  selector: 'app-project-card',
  imports: [AuiCard],
  template: `<aui-card title="Project Alpha" subtitle="Owner: Ada" content="Launch planned for Q4." [interactive]="{ href: '/projects/alpha' }" [headingLevel]="2"></aui-card>`,
})
export class ProjectCardComponent {}
```

`AuiCard` wraps `Card.create`; the host's children are replaced by the rendered card. `Surface.apply` has no directive: use the classes directly, for example `<section class="aui-surface aui-surface--raised aui-surface--padded">...</section>`.

## 35. React example

```tsx
import { AuiCard } from '@absoluteui/react/card';

export function Example() {
  return <AuiCard title="Invoice 1042" subtitle="Due 30 Sep" content="Amount due: 1,250.00" />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiCard } from '@absoluteui/vue/card';
</script>

<template>
  <AuiCard title="Invoice 1042" subtitle="Due 30 Sep" content="Amount due: 1,250.00" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped. The CSS classes work on any element.
