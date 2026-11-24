# Hover Card

> Package: `@absoluteui/components/hover-card` | Styles: `@absoluteui/components/hover-card/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

A rich, non-modal preview shown while a trigger (usually a link) is hovered or has keyboard focus. It meets WCAG 1.4.13 (Content on Hover or Focus): it is dismissible with Escape, hoverable (the pointer can move onto the card), and persistent until pointer and focus leave both trigger and card. The card is inserted right after the trigger and shown in the top layer, so Tab moves from the trigger into interactive card content and then on through the page; focus inside the card keeps it open. The trigger references the card with `aria-describedby` by default. It never opens on touch (a tap follows the link), and only one hover card is visible at a time. Hover cards are supplementary: never put essential information or actions only in a hover card.

## 2. Anatomy

```text
<a href="/u/ada" aria-describedby=card>Ada</a>                    (consumer trigger)
<div class="aui-hover-card" id=card popover="manual">              (inserted right after the trigger, top layer)
  content                                                          (the content option: text or a Node)
</div>
```

## 3. When to use

- Supplementary previews of a linked object: a user profile, a repository, a document summary.
- Richer content than a Tooltip allows (paragraphs, images, links), where the same information is reachable by following the trigger.

## 4. When not to use

- Essential information or actions: touch users never see hover cards.
- Short text hints: use Tooltip.
- Content opened deliberately or used at length, such as a form: use Popover.
- Triggers that are not focusable: keyboard users could never open the card.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLDivElement` | The card (`div.aui-hover-card`). Lifecycle events are dispatched here. |
| `trigger` | `HTMLElement` | The trigger. |
| `isOpen` | `boolean` | Whether the card is visible. |
| `options` | `Readonly<HoverCardOptions>` | Current options. |

Options: `content` (required: non-empty string or a `Node`), `describe` (default `true`), and the configurable options below. Full table: `metadata/hover-card/api.json`.

| Global option | Type | Default |
|---|---|---|
| `placement` | `Placement` | `'bottom'` |
| `showDelay` | integer, 0 to 5000 ms | `600` |
| `hideDelay` | integer, 0 to 5000 ms | `300` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `HoverCard.create(trigger, options)` | Insert the card after `trigger` and wire it. Throws on an invalid trigger or options before rendering. |
| `show()` | Show immediately and clear an Escape dismissal. Hides any other visible hover card. |
| `hide()` | Hide immediately (reason `programmatic`). If focus was inside the card, it moves to the trigger. |
| `update(options)` | Merge and apply options. Content is replaced only when `content` is passed; `describe` adds or removes the `aria-describedby` reference; an open card is repositioned. A failed update keeps the previous options. |
| `destroy()` | Hide; remove the card, the trigger `aria-describedby` reference, listeners, and subscriptions. |

## 7. Events

Both are dispatched on `element` and do not bubble.

| Event | Detail | Cancelable | Description |
|---|---|---|---|
| `aui-open` | `null` | No | After the card became visible. |
| `aui-close` | `{ reason }` | No | After the card was hidden. `reason` is `escape`, `pointer-leave`, `focus-out`, `outside-pointer`, or `programmatic` (`hide()`, `destroy()`, or another hover card showing). |

## 8. Slots/content areas

`content`: the card's children. Strings are rendered as text; pass a `Node` for rich content. Content is inserted once at construction and again only when `update()` passes `content`, so nodes owned by a framework (for example an Angular embedded view) survive other updates.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-hover-card` | Card element (manual popover, top layer); `data-placement` holds the final placement after flipping. |
| `aui-hover-card--static` | Set on show when global `animation` is `'none'` or reduced motion is preferred; removes the fade. |

Links inside the card use `color-link`; focusable content gets the focus ring on `:focus-visible`. All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/hover-card/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `color-text`, `color-link`, `radius-lg`, `shadow-lg`, `space-4`, `popover-max-height`.

## 11. States

hidden, pending (show delay running), visible, hiding (hide delay running), dismissed (after Escape; stays hidden until the pointer or focus leaves and returns).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| hidden | mouse or pen pointer enters the trigger | pending; visible after `showDelay` (`aui-open`) |
| hidden | keyboard focus (`:focus-visible`) on the trigger | pending; visible after `showDelay` |
| pending | pointer leaves the trigger or focus leaves trigger and card | hidden (timer cancelled) |
| visible | pointer leaves trigger and card, no focus inside | hiding; hidden after `hideDelay` (`pointer-leave`) unless the pointer returns |
| visible | focus leaves trigger and card while the pointer is not over them | hidden (`focus-out`) |
| visible | Escape while topmost | dismissed (`escape`); focus moves to the trigger only if it was inside the card |
| dismissed | pointer leaves the trigger, or focus leaves trigger and card | hidden (can open again) |
| visible | pointer down outside trigger and card | hidden (`outside-pointer`); focus not moved |
| visible | another hover card shows, `hide()`, `destroy()` | hidden (`programmatic`) |
| any | `show()` | visible |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Focus moves to the trigger | Shows the card after `showDelay`. |
| Tab | Trigger focused, card visible | Moves into focusable card content; the card stays open. |
| Tab / Shift+Tab | Focus leaves trigger and card | Hides the card unless the pointer is over it. |
| Escape | Card visible and topmost | Hides it without moving focus; it stays hidden until focus or pointer leaves and returns. |
| Escape | Focus inside the card | Hides it and moves focus to the trigger. |
| Escape | Card visible inside a Dialog | Closes only the card; the next Escape closes the dialog. |
| Escape | No card visible | Not handled; reaches enclosing overlays and the page. |

## 14. ARIA contract

- Trigger: unchanged, except `aria-describedby` gains the card id (added to existing ids) while `describe` is `true`. Removed on `describe: false` and `destroy()`.
- Card: a generic `div` with no role or name, placed right after the trigger in the DOM. It is not a dialog or tooltip; interactive content inside keeps its own semantics.
- No `aria-expanded` or `aria-haspopup` is set: the card is supplementary and the trigger keeps its own action.

## 15. Accessibility notes

- WCAG 1.4.13: dismissible (Escape, without moving pointer or focus off the trigger), hoverable (the pointer can cross onto the card within `hideDelay`), and persistent (stays while trigger or card is hovered or focused).
- DOM order matches the visual relationship, so reading and Tab order continue naturally from the trigger into the card (1.3.2, 2.4.3).
- With `describe: true`, the whole card text is announced as the trigger's description on focus. Use `describe: false` for long or highly interactive cards.
- Showing never moves focus; only keyboard focus (`:focus-visible`) opens the card, not focus from a pointer click.
- Touch pointers never open it; the trigger must work on its own (for example the link goes to the full profile).
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Width is `max-content` up to `min(22rem, 100vw - 2 x space-2)`; text wraps anywhere. Height is capped by `popover-max-height` and the available space on the chosen side, then the card scrolls with contained overscroll. The positioning engine flips and shifts to stay in the viewport.

## 17. RTL behavior

`start` and `end` placements are logical. With `direction: 'rtl'` (option or global direction), `bottom-start` aligns the card to the trigger's right edge. An inherited `dir="rtl"` alone does not change placement resolution; set `direction`. Padding uses logical properties.

## 18. Theme behavior

Colors come from role tokens only (`color-surface`, `color-border`, `color-text`, `color-link`, `shadow-lg`). The open fade uses `@starting-style` and is removed under reduced motion or `animation: 'none'`. In forced-colors mode the card has a `CanvasText` border.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { hoverCard: { placement: 'top', showDelay: 800 } } });
```

Changes apply to existing instances: an open card is repositioned; delays apply to the next show or hide.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

String content uses `textContent`; it is never parsed as HTML. `Node` content is inserted as given, so the consumer owns its safety. CSP-safe: positioning uses the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry. The component never fetches content; load it before `create()` or pass it through `update({ content })`.

## 25. Performance characteristics

Four listeners on the trigger, three on the card, and one configuration subscription per instance. While visible: one overlay-stack entry, one capture-phase `pointerdown` listener on the window, and the positioning engine's observers, all released on hide. Budget: `HoverCard.show()` under 16 ms (one frame).

## 26. Supported data scale

Any number of closed instances per page; one visible at a time by design. Keep content short enough to scan in a glance.

## 27. Usage examples

```ts
import { HoverCard } from '@absoluteui/components/hover-card';

const link = document.querySelector<HTMLAnchorElement>('a[href="/u/ada"]');
if (link) HoverCard.create(link, { content: 'Ada Lovelace, mathematician. Follow the link for the full profile.' });
```

More examples, type-checked in CI: `metadata/hover-card/examples.json`.

## 28. Edge cases

- `showDelay: 0` shows synchronously on hover or focus; `hideDelay: 0` still hides asynchronously, so a direct move from the trigger onto the card keeps it open.
- A card shown under a stationary pointer stays open until the pointer moves out of it.
- Keyboard focus on the trigger keeps the card open even when the pointer leaves.
- After Escape with the pointer still on the trigger, the card stays hidden until the pointer leaves the trigger and enters again.
- `show()` on one card hides any other visible card (reason `programmatic`); if focus was inside that other card, it moves to that card's trigger.
- `update({ content: '<b>text</b>' })` renders the literal text.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `HOVER_CARD_TRIGGER` | configuration | The trigger is not a connected `HTMLElement` with a parent node (elements from another realm fail the `instanceof` check). |
| `HOVER_CARD_OPTIONS` | configuration | `content` missing, not a string or `Node`, or an empty string; non-boolean `describe`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `placement`, `showDelay`, `hideDelay` (integer 0 to 5000), or `direction`. |

A failed construction leaves no card, trigger attributes, listeners, or subscriptions behind. A failed `update()` keeps the previous options.

## 30. Known limitations

- Touch pointers never show the card.
- Keyboard focus uses the same `showDelay` as hover.
- Only one hover card is visible at a time per loaded copy of the module. When another card replaces it while focus is inside, focus returns to its trigger (it is never lost) without reopening it.
- The card is inserted right after the trigger, not portaled: it inherits the trigger's container styles, and a trigger inside inline text puts a `div` into that inline context.
- The gap between trigger and card is fixed at 8px. The close animation is not played.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Opening on tap, long press, or click (use Popover for click).
- HTML strings as content.
- Modal behavior or focus trapping (use Dialog).

## 32. TypeScript definitions

```ts
interface HoverCardConfig { placement: Placement; showDelay: number; hideDelay: number }
type HoverCardCloseReason = 'escape' | 'pointer-leave' | 'focus-out' | 'outside-pointer' | 'programmatic';
interface HoverCardCloseDetail { reason: HoverCardCloseReason }
interface HoverCardOptions extends Partial<HoverCardConfig> {
  content: Node | string;
  describe?: boolean;
  direction?: 'ltr' | 'rtl';
}
```

## 33. Vanilla JS example

```ts
import { HoverCard, type HoverCardCloseDetail } from '@absoluteui/components/hover-card';
import '@absoluteui/components/hover-card/style.css';

const link = document.querySelector<HTMLAnchorElement>('a[href="/u/ada"]');
if (link) {
  const content = document.createElement('div');
  const bio = document.createElement('p');
  bio.textContent = 'Mathematician, London.';
  const follow = document.createElement('button');
  follow.type = 'button';
  follow.textContent = 'Follow';
  content.append(bio, follow);
  const card = HoverCard.create(link, { content, describe: false, placement: 'bottom-start' });
  card.element.addEventListener('aui-close', (event) => {
    const { reason } = (event as CustomEvent<HoverCardCloseDetail>).detail;
    if (reason === 'escape') link.dataset.cardDismissed = 'true';
  });
}
```

## 34. Angular example

`[auiHoverCard]` takes a `TemplateRef`; the template is rendered as the card content. Options are prefixed: `hoverCardPlacement`, `hoverCardShowDelay`, `hoverCardHideDelay`, `hoverCardDescribe`, `hoverCardDirection`. The directive emits `auiOpen` and `auiClose` and exposes `show()` and `hide()`.

```ts
import { Component } from '@angular/core';
import { AuiHoverCard } from '@absoluteui/angular/hover-card';

@Component({
  selector: 'app-author',
  imports: [AuiHoverCard],
  template: `
    <a href="/u/ada" [auiHoverCard]="card" hoverCardPlacement="bottom-start" (closed)="closed()">Ada</a>
    <ng-template #card>
      <p>Ada Lovelace, mathematician.</p>
      <a href="/u/ada/posts">Posts</a>
    </ng-template>
  `,
})
export class AuthorComponent {
  closed(): void {}
}
```

## 35. React example

```tsx
import { AuiHoverCard } from '@absoluteui/react/hover-card';

export function Example() {
  return (
    <AuiHoverCard content={<p>Ada Lovelace, mathematician.</p>}>
      <a href="/people/ada">Ada Lovelace</a>
    </AuiHoverCard>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiHoverCard } from '@absoluteui/vue/hover-card';
</script>

<template>
  <AuiHoverCard>
    <a href="/people/ada">Ada Lovelace</a>
    <template #content><p>Ada Lovelace, mathematician.</p></template>
  </AuiHoverCard>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
