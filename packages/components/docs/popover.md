# Popover

> Package: `@absoluteui/components/popover` | Styles: `@absoluteui/components/popover/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A non-modal dialog anchored to a trigger button: the WAI-ARIA APG Disclosure pattern for the trigger, plus a non-modal dialog for the popup. The popup renders in the top layer through the Popover API, so overflow containers never clip it. It sits immediately after the trigger in the DOM, so Tab moves from the trigger into the popup and then on through the page. Escape and outside-pointer dismissal go through the shared overlay stack, so only the topmost overlay responds.

## 2. Anatomy

```text
<button aria-haspopup="dialog" aria-expanded aria-controls=popup>  (consumer trigger)
<div class="aui-popover" role="dialog" popover="manual" tabindex="-1" aria-labelledby=title | aria-label>
  <div class="aui-popover__header">                  (title and/or close button)
    <h2 class="aui-popover__title">Title</h2>
    <button class="aui-button aui-popover__close" aria-label="Close">   (showCloseButton)
  </div>
  <div class="aui-popover__body">content</div>
</div>
```

## 3. When to use

- Contextual content or controls tied to a trigger: filters, quick settings, details, a small form.
- Interactive content that should not block the rest of the page.

## 4. When not to use

- Tasks that must be completed or dismissed first: use Dialog.
- Short, non-interactive hints on hover or focus: use Tooltip.
- A list of commands or choices: use Menu or Select.
- Essential content users must not miss: keep it inline.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLDivElement` | The popup (`div.aui-popover[role=dialog]`). Lifecycle events are dispatched here. |
| `body` | `HTMLDivElement` | Content container. |
| `trigger` | `HTMLElement` | The trigger. |
| `isOpen` | `boolean` | Whether the popup is open. |
| `options` | `Readonly<PopoverOptions>` | Current options. |

Options: `content` (required), `title` or `label` (one is required), `icons`, and the configurable options below. Full table: `metadata/popover/api.json`.

| Global option | Type | Default |
|---|---|---|
| `placement` | `Placement` | `'bottom-start'` |
| `offset` | `number` (0 to 64 px) | `8` |
| `closeOnEscape` | `boolean` | `true` |
| `closeOnOutsidePointer` | `boolean` | `true` |
| `initialFocus` | `'first' \| 'container' \| 'none'` | `'first'` |
| `showCloseButton` | `boolean` | `false` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Popover.create(trigger, options)` | Insert the popup after `trigger` and wire it. Throws on invalid options before rendering. |
| `open()` | Show, position, and move focus per `initialFocus`. |
| `close()` | Close programmatically (not cancelable). If focus was inside the popup, it moves to the trigger. |
| `toggle()` | Open or close programmatically. |
| `update(options)` | Merge and apply options; repositions when open. |
| `destroy()` | Close if open; remove the popup, trigger ARIA attributes, listeners, and subscriptions. |

## 7. Events

All are dispatched on `element` and do not bubble.

| Event | Detail | Cancelable | Description |
|---|---|---|---|
| `aui-open` | `null` | No | After the popup opened. |
| `aui-cancel` | `{ reason }` | Yes | Before a user-initiated close (`escape`, `outside-pointer`, `focus-out`, `trigger`, `close-button`). `preventDefault()` keeps it open. |
| `aui-close` | `{ reason }` | No | After the popup closed; `reason` is also `programmatic` for `close()`, `toggle()`, and `destroy()`. |

## 8. Slots/content areas

`body` (or the `content` option). Strings are rendered as text; pass a `Node` for rich content.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-popover` | Popup element; `data-placement` holds the final placement after flipping. |
| `aui-popover--static` | Set when global `animation` is `'none'`. |
| `aui-popover__header` | Title row with the close button. |
| `aui-popover__title` | Heading (`h2`). |
| `aui-popover__close` | Close button. |
| `aui-popover__body` | Content container. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/popover/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `color-text`, `radius-md`, `shadow-md`, `space-3`, `space-4`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-popover-radius` (popover corner radius; falls back to `radius-md`), `--aui-popover-bg` (popover background; falls back to `color-surface`), `--aui-popover-border-color` (popover boundary (decorative); falls back to `color-border`), `--aui-popover-shadow` (popover elevation; falls back to `shadow-md`).

## 11. States

closed, open, closing (`aui-cancel` pending).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | trigger click, Enter, or Space; `open()` | open; focus per `initialFocus`; `aui-open` |
| open | trigger click | `aui-cancel`, then closed (`trigger`) |
| open | Escape while topmost | `aui-cancel`, then closed (`escape`); focus to trigger |
| open | pointer down outside popup and trigger | `aui-cancel`, then closed (`outside-pointer`); focus not moved |
| open | focus moves outside popup and trigger | `aui-cancel`, then closed (`focus-out`) |
| open | close button | `aui-cancel`, then closed (`close-button`); focus to trigger |
| open | `close()`, `toggle()`, `destroy()` | closed (`programmatic`), not cancelable |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Trigger focused | Toggles the popup. |
| Tab / Shift+Tab | Popup open | Moves through the popup in DOM order after the trigger; leaving popup and trigger closes it. |
| Escape | Popup open and topmost | Closes and returns focus to the trigger (with `closeOnEscape`). |
| Escape | Popup open inside a Dialog | Closes only the popover; the next Escape closes the dialog. |
| Enter / Space | Close button focused | Closes and returns focus to the trigger. |

## 14. ARIA contract

- Trigger: `aria-haspopup="dialog"`, `aria-expanded`, `aria-controls` (popup id). Removed on `destroy()`.
- Popup: `role="dialog"` (non-modal, no `aria-modal`); named by `aria-labelledby` (title) or `aria-label` (label).
- Close button: localized `aria-label` ("Close").

## 15. Accessibility notes

- A missing accessible name is a configuration error.
- DOM order matches the visual relationship, so reading and tab order continue naturally (WCAG 1.3.2, 2.4.3).
- The background stays interactive: this is not a focus trap.
- With `initialFocus: 'first'` and no focusable content, focus moves to the popup itself (`tabindex="-1"`).
- The trigger should be a native `<button>`.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Content width up to `min(24rem, 100vw - 2rem)`. The block size is capped at the space available on the chosen side, and the popup scrolls. The positioning engine flips and shifts to stay in the viewport.

## 17. RTL behavior

`start` and `end` placements are logical. With `direction: 'rtl'`, `bottom-start` aligns the popup to the trigger's right edge. Header spacing uses logical properties.

## 18. Theme behavior

Colors come from role tokens only. Verified in the light, dark, and high-contrast themes. In forced-colors mode the popup has a `CanvasText` border. The open fade uses `@starting-style` and is removed under reduced motion or `animation: 'none'`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { popover: { placement: 'bottom-end', showCloseButton: true } } });
```

Changes apply to existing instances immediately (open popovers are repositioned).

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.close` (default `close`).

## 23. Security behavior

Title, label, and string content use `textContent`; they are never parsed as HTML. `Node` content is inserted as given, so the consumer owns its safety. CSP-safe: positioning uses the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Three listeners while closed (trigger click, two focusout) and one configuration subscription. While open: one overlay-stack entry plus resize observers and scroll/resize listeners from the positioning engine, all released on close. Budget: open to positioned within one frame.

## 26. Supported data scale

Any number of closed instances per page. Keep one popover open at a time; nesting one level (a popover in a Dialog, or a tooltip in a popover) is tested.

## 27. Usage examples

```ts
import { Popover } from '@absoluteui/components/popover';

const trigger = document.querySelector<HTMLButtonElement>('#filters');
if (trigger) Popover.create(trigger, { title: 'Filters', content: 'No filters applied.', showCloseButton: true });
```

More examples, type-checked in CI: `metadata/popover/examples.json`.

## 28. Edge cases

- Clicking the trigger while open closes it with reason `trigger` (the pointer is treated as inside, so no outside-pointer close happens first).
- `closeOnEscape: false` still consumes Escape while the popover is topmost, so an enclosing Dialog does not close.
- Removing the close button (`update({ showCloseButton: false })`) while it has focus moves focus to the popup.
- Focus leaving the browser window (no `relatedTarget`) does not close the popup.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `POPOVER_TRIGGER` | configuration | The trigger is not a connected `HTMLElement`. |
| `POPOVER_OPTIONS` | configuration | Missing or invalid `content`, or neither `title` nor `label`. |
| `CFG_*` | configuration | Invalid `placement`, `offset`, `initialFocus`, or boolean options. |

A failed construction leaves no rendering, trigger attributes, listeners, or subscriptions behind. A failed `update()` keeps the previous options.

## 30. Known limitations

- Enter and Space activation relies on the trigger being a native `<button>`.
- The popup is not portaled; it inherits the trigger's container styles (such as `dir` and font).
- The heading is always an `h2`.
- The close animation is not played.
- Canceling `aui-cancel` for a `focus-out` close leaves the popup open while focus is elsewhere.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Modal behavior (inert background, focus trap): use Dialog.
- HTML strings as content.
- Opening on hover.

## 32. TypeScript definitions

```ts
type Placement = 'top' | 'bottom' | 'left' | 'right' | `${'top' | 'bottom' | 'left' | 'right'}-${'start' | 'end'}`;
type PopoverInitialFocus = 'first' | 'container' | 'none';
type PopoverCloseReason = 'escape' | 'outside-pointer' | 'focus-out' | 'trigger' | 'close-button' | 'programmatic';
interface PopoverCloseDetail { reason: PopoverCloseReason }
interface PopoverOptions extends Partial<PopoverConfig> { content: Node | string; title?: string; label?: string; direction?: 'ltr' | 'rtl'; icons?: Partial<PopoverIcons> }
```

## 33. Vanilla JS example

```ts
import { Popover, type PopoverCloseDetail } from '@absoluteui/components/popover';
import '@absoluteui/components/popover/style.css';

const trigger = document.querySelector<HTMLButtonElement>('#share');
if (trigger) {
  const link = document.createElement('input');
  link.readOnly = true;
  link.value = location.href;
  link.setAttribute('aria-label', 'Link');
  const share = Popover.create(trigger, { title: 'Share', content: link, placement: 'bottom-end' });
  share.element.addEventListener('aui-close', (event) => {
    const { reason } = (event as CustomEvent<PopoverCloseDetail>).detail;
    if (reason === 'escape') trigger.dataset.dismissed = 'true';
  });
}
```

## 34. Angular example

`[auiPopover]` takes a `TemplateRef`; the template is rendered as a live embedded view and becomes the popover content. Options that could clash with other attributes are prefixed: `popoverTitle`, `popoverLabel`, `popoverPlacement`, `popoverOffset`.

```ts
import { Component } from '@angular/core';
import { AuiPopover } from '@absoluteui/angular/popover';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiCheckbox } from '@absoluteui/angular/checkbox';

@Component({
  selector: 'app-toolbar',
  imports: [AuiPopover, AuiButton, AuiCheckbox],
  template: `
    <button type="button" auiButton [auiPopover]="filters" popoverTitle="Filters" popoverPlacement="bottom-start" (closed)="apply()">Filters</button>
    <ng-template #filters><aui-checkbox label="Only active" /></ng-template>
  `,
})
export class ToolbarComponent {
  apply(): void {}
}
```

## 35. React example

```tsx
import { AuiButton } from '@absoluteui/react/button';
import { AuiPopover } from '@absoluteui/react/popover';

export function Example() {
  return (
    <AuiPopover title="Filters" content={<p>Filter controls go here.</p>}>
      <AuiButton variant="secondary">Filters</AuiButton>
    </AuiPopover>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiButton } from '@absoluteui/vue/button';
import { AuiPopover } from '@absoluteui/vue/popover';
</script>

<template>
  <AuiPopover title="Filters">
    <AuiButton variant="secondary">Filters</AuiButton>
    <template #content><p>Filter controls go here.</p></template>
  </AuiPopover>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
