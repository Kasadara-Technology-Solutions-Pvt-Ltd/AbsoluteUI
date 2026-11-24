# Typography

> Package: `@absoluteui/components/typography` | Styles: `@absoluteui/components/typography/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Token-based typography. The CSS classes are the primary API and work without JavaScript: headings, body text, links, inline code, rich-text prose, truncation, and line clamping. The JS helpers create validated elements:
- `Heading.create`: the semantic level (document outline) is independent of the visual size;
- `Text.create`: tone, size, and weight modifiers;
- `Link.create`: only http(s) and relative destinations; links that open a new tab say so in a localized, visually hidden hint;
- `setLineClamp`: a validated line count.

## 2. Anatomy

```text
<h2 class="aui-heading aui-heading--4">Billing</h2>             level 2, size 4
<p class="aui-text aui-text--muted aui-text--sm">Supporting text</p>
<a class="aui-link" href target="_blank" rel="noopener noreferrer">
  Setup guide<span class="aui-link__hint"> (opens in a new tab)</span>   (visually hidden)
</a>
<code class="aui-code">npm install</code>
<div class="aui-prose"> p, ul, ol, h2-h4, a, code, pre, blockquote </div>
<span class="aui-truncate">...</span>
<p class="aui-line-clamp" style="--aui-lines: 2">...</p>          (custom property set via the CSSOM)
```

## 3. When to use

- Headings, body text, and supporting text that follow the theme's type scale.
- Links in content, including links that open a new tab.
- Rich text from a CMS or Markdown renderer (`aui-prose`), after sanitization.
- Truncating single-line labels or clamping previews to a number of lines.

## 4. When not to use

- Actions that do not navigate: use a Button.
- Code blocks that need syntax highlighting: use a highlighter inside `aui-prose pre`.
- Hiding essential information by truncation without another way to read it.

## 5. Public properties

The helpers return plain elements (`HTMLHeadingElement`, `HTMLParagraphElement | HTMLSpanElement`, `HTMLAnchorElement`); there are no controller instances.

| Helper | Option | Type | Default | Description |
|---|---|---|---|---|
| `Heading.create` | `level` (argument) | `1`-`6` | - (required) | Semantic level. |
| `Heading.create` | `size` | `1`-`6` | the level | Visual size. |
| `Text.create` | `tone` | `'default' \| 'muted'` | `'default'` | Color. |
| `Text.create` | `size` | `'xs' \| 'sm' \| 'md' \| 'lg'` | `'md'` | Font size. |
| `Text.create` | `strong` | `boolean` | `false` | Semibold. |
| `Text.create` | `as` | `'p' \| 'span'` | `'p'` | Element. |
| `Link.create` | `href` | `string` | - (required) | http(s) or relative. |
| `Link.create` | `text` | `string` | - (required) | Link text. |
| `Link.create` | `external` | `boolean` | `false` | New tab, `rel`, and hint. |
| `Link.create` | `muted` | `boolean` | `false` | Muted color. |
| `Link.create` | `locale` | BCP 47 | global | Hint locale. |

| Global option | Type | Default |
|---|---|---|
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `Heading.create(level, text, options?, doc?)` | Create `<h{level}>` with `aui-heading aui-heading--{size}`. |
| `Text.create(text, options?, doc?)` | Create a `<p>` or `<span>` with `aui-text` modifiers. |
| `Link.create(options, doc?)` | Create a validated `<a class="aui-link">`. |
| `Heading.enhance(el, options?)` | Since 0.9.0. Style an existing `<h1>`..`<h6>` (level from the tag); returns `{ update, destroy }`. |
| `Text.enhance(el, options?)` | Since 0.9.0. Add `aui-text` modifiers to an existing element; returns `{ update, destroy }`. |
| `Link.enhance(a, options?)` | Since 0.9.0. Style and validate an existing link (`external`, `muted`, `locale`); returns `{ update, check, destroy }`; `destroy()` restores `target` and `rel`. |
| `setLineClamp(el, lines)` | Add `aui-line-clamp` and set `--aui-lines` (integer 1..20). Returns a disposer that removes both. |
| `isSafeHref(value)` | The destination check used by Link and Card. |

## 7. Events

None.

## 8. Slots/content areas

None. Helpers set text only; `aui-prose` styles consumer markup.

## 9. CSS parts/hooks

| Class / property | Purpose |
|---|---|
| `aui-heading`, `aui-heading--1` ... `--6` | Heading base and sizes (`font-size-4xl`, `3xl`, `2xl`, `xl`, `lg`, `md`). |
| `aui-text`, `--muted`, `--lg`, `--sm`, `--xs`, `--strong` | Body text. |
| `aui-link`, `aui-link--muted`, `aui-link__hint` | Links and the new-tab hint. |
| `aui-code` | Inline code. |
| `aui-prose` | Rich-text rhythm (`line-height-relaxed`). |
| `aui-truncate` | Single-line ellipsis. |
| `aui-line-clamp`, `--aui-lines` | Multi-line clamp (default 3 lines). |

All rules live in the `aui.components` cascade layer. Prose rules use `:where()`, so any single consumer class overrides them.

## 10. Design tokens

See `metadata/typography/tokens.json` (verified against the stylesheet in CI). Key tokens: `font-family-sans`, `font-family-mono`, `font-size-xs` ... `font-size-4xl`, `font-weight-semibold`, `line-height-tight|normal|relaxed`, `color-text`, `color-text-muted`, `color-link`, `color-surface-sunken`, `color-focus-ring`.

## 11. States

Links: default, hover (thicker underline), focus-visible (focus ring). Text: truncated, clamped.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| unclamped | `setLineClamp(el, n)` | clamped to n lines |
| clamped | disposer called | previous classes and `--aui-lines` restored |

Heading, Text, and Link elements are static once created.

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Link | Moves focus to and from the link (native). |
| Enter | Link focused | Follows the link (native). |
| - | Headings, text, code | Not applicable: not focusable. |

## 14. ARIA contract

- No ARIA attributes; native semantics only (`<h1>`-`<h6>`, `<p>`, `<a href>`).
- External links: the hint is visually hidden text inside the link, so the accessible name is, for example, "Setup guide (opens in a new tab)".

## 15. Accessibility notes

- Links are always underlined, so they are never identified by color alone (WCAG 1.4.1). This includes `--muted`.
- Choose the heading level for the outline and `size` for appearance (WCAG 1.3.1, 2.4.6).
- Links that open a new tab tell the user in advance (WCAG 3.2.5, technique G201).
- Truncated and clamped text stays in the DOM, so screen readers read it in full. Give sighted users a way to see the full text too.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

All sizes are rem tokens and scale with user font settings (WCAG 1.4.4). Long words wrap (`overflow-wrap`). `aui-truncate` needs a constrained inline size, for example a flex child.

## 17. RTL behavior

Logical properties throughout: list indentation and the blockquote rule sit at the inline start, and the ellipsis appears at the inline end.

## 18. Theme behavior

Colors come from role tokens with verified contrast pairs:
- `color-link` and `color-text-muted` on `color-bg` and `color-surface`;
- `color-text` on `color-surface-sunken` (code).

In forced-colors mode, links use `LinkText` and a `Highlight` focus outline, and inline code keeps a visible border.

## 19. Global configuration support

```ts
registerMessages('typography', 'de', { opensInNewTab: '(öffnet in einem neuen Tab)' });
configureAbsoluteUI({ components: { typography: { locale: 'de-DE' } } });
```

## 20. Component configuration support

`Link.create({ locale })` overrides the global locale for that link. The hint is resolved when the link is created.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None. External links get a text hint for assistive technology, not an icon.

## 23. Security behavior

- All helpers set text with `textContent`.
- `Link.create` checks `href` with the WHATWG URL parser (the one the browser uses to follow the link). Only `http:`, `https:`, and relative references are accepted. `javascript:`, `data:`, `vbscript:`, `file:`, `blob:`, and obfuscated forms (mixed case, leading control characters, embedded tabs or newlines) are rejected.
- External links get `rel="noopener noreferrer"`.
- `setLineClamp` writes one custom property through the CSSOM.
- `aui-prose` styles markup but does not sanitize it: pass untrusted HTML through the core sanitizer (`setSanitizedHtml`) first.
- CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. External links send no referrer (`noreferrer`).

## 25. Performance characteristics

Each helper creates one element (two for external links) and attaches no listeners or subscriptions. There is no dedicated performance budget yet.

## 26. Supported data scale

Not data-driven. `aui-prose` handles documents of any length; layout cost is the browser's.

## 27. Usage examples

```html
<h2 class="aui-heading aui-heading--4">Billing</h2>
<p class="aui-text aui-text--muted">Invoices are issued monthly. <a class="aui-link" href="/billing">Manage billing</a></p>
```

```ts
import { Heading, Link } from '@absoluteui/components/typography';

document.body.append(Heading.create(2, 'Billing', { size: 4 }), Link.create({ href: 'https://example.com', text: 'Status page', external: true }));
```

More examples, type-checked in CI: `metadata/typography/examples.json`.

## 28. Edge cases

- `Heading.create(2, 'x', { size: 1 })` is an `<h2>` at the largest size.
- `Link.create({ href: 'java\tscript:alert(1)' })` throws: the URL parser strips the tab, so the scheme is `javascript:`.
- Protocol-relative URLs (`//cdn.example.com`) are accepted; they resolve to the page's http(s) scheme.
- `mailto:` and `tel:` are rejected by `Link.create`; use a plain `<a class="aui-link">` for them.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TYPOGRAPHY_OPTIONS` | configuration | Invalid level, size, tone, `as`, empty text, unsafe href, or line count outside 1..20. |
| `I18N_MISSING_MESSAGE` | configuration | No `opensInNewTab` message for the locale chain (English is always registered). |

Invalid calls create nothing and leave elements unchanged.

## 30. Known limitations

- The external-link hint does not update when the locale changes after creation.
- `aui-line-clamp` relies on `-webkit-line-clamp`; the standard `line-clamp` is declared for forward compatibility.
- `aui-prose` covers p, ul, ol, li, h2-h4, a, code, pre, and blockquote only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML strings as heading, text, or link text.
- Non-http(s) schemes in `Link.create`.
- Fluid (viewport-based) type scales.

## 32. TypeScript definitions

```ts
type HeadingLevel = 1 | 2 | 3 | 4 | 5 | 6;
type TextTone = 'default' | 'muted';
type TextSize = 'xs' | 'sm' | 'md' | 'lg';
interface HeadingOptions { size?: HeadingLevel }
interface TextOptions { tone?: TextTone; size?: TextSize; strong?: boolean; as?: 'p' | 'span' }
interface LinkOptions { href: string; text: string; external?: boolean; muted?: boolean; locale?: string }
declare function setLineClamp(el: HTMLElement, lines: number): () => void;
declare function isSafeHref(value: unknown): value is string;
```

## 33. Vanilla JS example

```ts
import { Heading, Link, Text, setLineClamp } from '@absoluteui/components/typography';
import '@absoluteui/components/typography/style.css';

const section = document.querySelector<HTMLElement>('#release');
if (section) {
  const summary = Text.create('This release adds layout primitives, cards, and typography helpers across the library.');
  section.append(Heading.create(2, 'Release 0.2', { size: 3 }), summary, Link.create({ href: '/changelog', text: 'Full changelog' }));
  setLineClamp(summary, 2);
}
```

## 34. Angular example

Attribute directives from `@absoluteui/angular/typography` (since 0.9.0) apply the classes to your own elements: `h1`..`h6[auiHeading]` (`size`), `[auiText]` (`tone`, `size`, `strong`), `a[auiLink]` (`external`, `muted`; the href is validated, `routerLink` works), `[auiLineClamp]`. Heading, Text, and Line Clamp also apply during server rendering; Link is enhanced in the browser. The CSS classes keep working without the directives.

```ts
import { Component, input } from '@angular/core';
import { AUI_TYPOGRAPHY } from '@absoluteui/angular/typography';

@Component({
  selector: 'app-help',
  imports: [...AUI_TYPOGRAPHY],
  template: `
    <h2 auiHeading size="4">Need help?</h2>
    <p auiText tone="muted" [auiLineClamp]="2">We answer within one business day.</p>
    <a auiLink [href]="supportUrl()" external>Contact support</a>`,
})
export class HelpComponent {
  readonly supportUrl = input('https://example.com/support');
}
```

## 35. React example

```tsx
import { isSafeHref } from '@absoluteui/components/typography';

// Typography is CSS classes (no component): use them in className, and validate dynamic URLs.
export function Example({ href }: { href: string }) {
  return (
    <>
      <h2 className="aui-heading aui-heading--3">Release notes</h2>
      <p className="aui-text aui-text--muted">Updated weekly.</p>
      {isSafeHref(href) ? <a className="aui-link" href={href}>Read more</a> : null}
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { isSafeHref } from '@absoluteui/components/typography';
// Typography is CSS classes (no component): use them in templates, and validate dynamic URLs.
defineProps<{ href: string }>();
</script>

<template>
  <h2 class="aui-heading aui-heading--3">Release notes</h2>
  <p class="aui-text aui-text--muted">Updated weekly.</p>
  <a v-if="isSafeHref(href)" class="aui-link" :href="href">Read more</a>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. The CSS classes work on any element, including inside custom elements that render light DOM. Custom-element wrappers are not shipped (SPEC section 4.4).
