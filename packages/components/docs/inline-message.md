# Inline Message

> Package: `@absoluteui/components/inline-message` | Styles: `@absoluteui/components/inline-message/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A compact, one-line status shown next to the content it describes, such as "Saved 2 minutes ago" or "Offline". `InlineMessage` renders a tone icon, a visually hidden localized tone prefix ("Warning:"), and the text. Tone is never conveyed by color alone. It is static by default; set `live` for status that changes while the user works.

## 2. Anatomy

```text
<span class="aui-inline-message aui-inline-message--{tone}" [role=status|alert]>
  <span class="aui-inline-message__icon">icon (aria-hidden)</span>
  <span class="aui-inline-message__tone">Warning: (visually hidden)</span>
  <span class="aui-inline-message__text">message</span>
</span>
```

## 3. When to use

- Short status beside a heading, toolbar, card, or value: save, connection, or sync state.
- Status that changes during use, with `live: 'polite'`.

## 4. When not to use

- Messages that need a title, actions, or dismissal: use Alert.
- Transient confirmations: use Toast.
- Field validation errors: use the field's error message or Validation Message.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element; receives the role and classes. |
| `message` | `string` | Current message. |
| `options` | `Readonly<InlineMessageOptions>` | Current options. |

Options (`InlineMessageOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `message` | `string` | - (required) | No | Message text. |
| `tone` | `'info' \| 'success' \| 'warning' \| 'error'` | `'info'` | No | Icon, colors, and tone prefix. |
| `live` | `'off' \| 'polite' \| 'assertive'` | `'off'` | No | `polite` sets `role="status"`, `assertive` sets `role="alert"`. |
| `icons` | `Partial<InlineMessageIcons>` | - | No | Icon slot overrides. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the tone prefix. |

## 6. Methods

| Method | Description |
|---|---|
| `InlineMessage.create(host, options)` | Render into `host` (children are replaced). A `<span>` or `<div>` host works. |
| `update(options)` | Merge and apply options. The text changes in place, so a live message announces it. |
| `destroy()` | Remove rendering, role, classes, and the configuration subscription. |

## 7. Events

None. Inline messages are output only.

## 8. Slots/content areas

None. The message is text only.

## 9. CSS parts/hooks

`aui-inline-message`, `aui-inline-message--info|success|warning|error`, `aui-inline-message__icon`, `__tone`, `__text`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/inline-message/tokens.json` (17 tokens, verified in CI). Key tokens: `color-{tone}-subtle` (background), `color-{tone}-fg` (icon), `color-text`, `radius-pill`, `icon-size-sm`.

## 11. States

info, success, warning, error; live polite; live assertive.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ tone, message })` | new tone and text (announced when live) |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable. Assistive technology reads it in document order. |

## 14. ARIA contract

- `live: 'off'`: no role.
- `live: 'polite'`: `role="status"`.
- `live: 'assertive'`: `role="alert"`.
- The icon is `aria-hidden`; the tone is conveyed by the visually hidden prefix, followed by a space.

## 15. Accessibility notes

- Live roles only announce changes made after the live region exists. Create the message with `live` set, then change it with `update()`.
- Do not update a live message on every keystroke or timer tick. For example, refresh "Saved 2 minutes ago" without `live`, and use `live` only for state changes such as Saving -> Saved.
- The e2e axe run (WCAG 2.2 AA, 3 themes) and manual screen-reader verification are pending.

## 16. Responsive behavior

An inline-flex pill, limited to the container width; long text wraps.

## 17. RTL behavior

Logical properties: the icon sits at the inline start.

## 18. Theme behavior

`color-{tone}-subtle` background, `color-{tone}-fg` icon, and `color-text` text; these pairs are in the contrast gate. Forced-colors mode adds a `CanvasText` border and icon.

## 19. Global configuration support

Only the inherited `locale` is configurable:

```ts
configureAbsoluteUI({ components: { inlineMessage: { locale: 'de-DE' } } });
```

## 20. Component configuration support

The instance `locale` overrides global and theme configuration. Configuration changes re-render existing messages.

## 21. Timezone behavior

Not applicable. Relative times such as "Saved 2 minutes ago" are formatted by the consumer.

## 22. Icon customization points

`icons.info` (default `info`), `icons.success` (`check-circle`), `icons.warning` (`alert-triangle`), `icons.error` (`alert-circle`).

## 23. Security behavior

The message uses `textContent`; it is never parsed as HTML. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per render: one icon and two text updates.

## 26. Supported data scale

Not data-driven.

## 27. Usage examples

```ts
import { InlineMessage } from '@absoluteui/components/inline-message';

const host = document.querySelector<HTMLElement>('#save-state');
if (host) {
  const state = InlineMessage.create(host, { tone: 'info', message: 'Saving', live: 'polite' });
  state.update({ tone: 'success', message: 'Saved just now' });
}
```

More examples, type-checked in CI: `metadata/inline-message/examples.json`.

## 28. Edge cases

- Changing only `tone` re-announces a live message, because the tone prefix is part of the content.
- Setting `live` on a message that is already displayed does not announce the existing text.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `INLINE_MESSAGE_OPTIONS` | configuration | Missing or blank message, or unknown tone or live value. |
| `ICON_UNKNOWN` | configuration | Unknown icon override. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Text only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML or `Node` content.
- Actions or dismissal: use Alert.

## 32. TypeScript definitions

```ts
type InlineMessageTone = 'info' | 'success' | 'warning' | 'error';
type InlineMessageLive = 'off' | 'polite' | 'assertive';
interface InlineMessageIcons { info: IconRef; success: IconRef; warning: IconRef; error: IconRef }
interface InlineMessageOptions {
  message: string;
  tone?: InlineMessageTone;
  live?: InlineMessageLive;
  locale?: string;
  icons?: Partial<InlineMessageIcons>;
}
```

## 33. Vanilla JS example

```ts
import { InlineMessage } from '@absoluteui/components/inline-message';
import '@absoluteui/components/inline-message/style.css';

const host = document.querySelector<HTMLElement>('#connection');
if (host) {
  const connection = InlineMessage.create(host, { tone: 'success', message: 'Online', live: 'polite' });
  window.addEventListener('offline', () => {
    connection.update({ tone: 'warning', message: 'Offline' });
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiInlineMessage } from '@absoluteui/angular/inline-message';

@Component({
  selector: 'app-save-state',
  imports: [AuiInlineMessage],
  template: `<aui-inline-message live="polite" [tone]="saved ? 'success' : 'info'" [message]="saved ? 'Saved' : 'Saving'"></aui-inline-message>`,
})
export class SaveStateComponent {
  saved = false;
}
```

## 35. React example

```tsx
import { AuiInlineMessage } from '@absoluteui/react/inline-message';

export function Example() {
  return <AuiInlineMessage tone="success" message="Saved 2 minutes ago" />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiInlineMessage } from '@absoluteui/vue/inline-message';
</script>

<template>
  <AuiInlineMessage tone="success" message="Saved 2 minutes ago" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
