# Tooltip

> Package: `@absoluteui/components/tooltip` | Styles: `@absoluteui/components/tooltip/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A short text hint for a trigger, meeting WCAG 1.4.13 (Content on Hover or Focus). It shows after a delay on pointer hover and immediately on keyboard focus. The pointer can move onto it (hoverable), it stays visible while the trigger is hovered or focused (persistent), and Escape hides it without moving focus (dismissible). The trigger references it through `aria-describedby`, or through `aria-labelledby` for icon-only controls. Only one tooltip is visible at a time.

## 2. Anatomy

```text
<button aria-describedby=tooltip>Save</button>              (consumer trigger)
...
<div class="aui-tooltip" role="tooltip" popover="manual">Ctrl+S</div>   (end of body, or the trigger's <dialog>)
```

## 3. When to use

- Supplementary hints: keyboard shortcuts, the full text of a truncated label, what an icon-only button does.
- Giving an icon-only control a visible name that is also its accessible name (`relation: 'label'`).

## 4. When not to use

- Essential information or instructions: touch users never see tooltips.
- Interactive content (links, buttons): use Popover.
- Validation errors: use the field's validation message.
- Long text: use Popover or inline help.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLDivElement` | The tooltip (`div.aui-tooltip[role=tooltip]`). Lifecycle events are dispatched here. |
| `trigger` | `HTMLElement` | The trigger. |
| `isVisible` | `boolean` | Whether the tooltip is visible. |
| `options` | `Readonly<TooltipOptions>` | Current options. |

Options: `content` (required, text), `relation` (`'description'` by default, or `'label'`), and the configurable options below. Full table: `metadata/tooltip/api.json`.

| Global option | Type | Default |
|---|---|---|
| `placement` | `Placement` | `'top'` |
| `showDelay` | integer, 0 to 5000 ms | `500` |
| `hideDelay` | integer, 0 to 5000 ms | `100` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Tooltip.create(trigger, options)` | Create the tooltip and reference it from `trigger`. Throws on invalid options before rendering. |
| `show()` | Show immediately; hides any other visible tooltip. |
| `hide()` | Hide immediately. |
| `update(options)` | Merge and apply options (content, relation, placement, delays). |
| `destroy()` | Hide; remove the element, the trigger ARIA reference, listeners, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-open` | `null` | No | After the tooltip became visible. |
| `aui-close` | `null` | No | After the tooltip was hidden. |

## 8. Slots/content areas

None. Content is text only.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-tooltip` | Tooltip element; `data-placement` holds the final placement after flipping. |
| `aui-tooltip--static` | Set when global `animation` is `'none'`. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/tooltip/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-inverse`, `color-on-inverse`, `tooltip-max-width`, `radius-sm`, `font-size-sm`, `shadow-md`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-tooltip-radius` (tooltip corner radius; falls back to `radius-sm`), `--aui-tooltip-bg` (tooltip background; falls back to `color-inverse`), `--aui-tooltip-fg` (tooltip text; falls back to `color-on-inverse`), `--aui-tooltip-shadow` (tooltip elevation; falls back to `shadow-md`).

## 11. States

hidden, pending (show delay running), visible, hiding (hide delay running).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| hidden | mouse or pen enters the trigger | pending; visible after `showDelay` |
| pending | pointer leaves the trigger | hidden (never shown) |
| hidden | keyboard focus on the trigger (`:focus-visible`) | visible immediately |
| visible | pointer leaves trigger and tooltip (not keyboard-focused) | hiding; hidden after `hideDelay` |
| hiding | pointer enters the trigger or the tooltip | visible |
| visible | trigger loses focus, Escape, pointer down elsewhere, another tooltip shows | hidden |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Focus arrives on the trigger | Shows the tooltip immediately. |
| Tab / Shift+Tab | Focus leaves the trigger | Hides the tooltip. |
| Escape | Tooltip visible | Hides it without moving focus; the key is consumed. |
| Escape | No tooltip visible | Not handled; reaches enclosing overlays and the page. |

## 14. ARIA contract

- Tooltip: `role="tooltip"`; never focusable.
- Trigger: `aria-describedby` (relation `description`) or `aria-labelledby` (relation `label`) includes the tooltip id. Existing ids are kept, and only the tooltip id is removed on `destroy()`.

## 15. Accessibility notes

- WCAG 1.4.13: dismissible (Escape), hoverable (the pointer can move onto the tooltip within `hideDelay`), persistent (stays while hovered or focused).
- Pointer focus (a click) does not show the tooltip; keyboard focus does.
- Touch pointers never show tooltips, so tooltips must never hold essential information.
- `relation: 'label'` replaces the trigger's accessible name; use it only for controls without visible text.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Width up to `min(tooltip-max-width, 100vw - 1rem)`; text wraps. The positioning engine flips and shifts to stay in the viewport.

## 17. RTL behavior

`start` and `end` placements are logical and mirror in RTL (`direction` option or global `direction`).

## 18. Theme behavior

Inverse surface (`color-inverse` with `color-on-inverse` text), verified in the light, dark, and high-contrast themes. In forced-colors mode the tooltip has a `CanvasText` border. The fade-in uses `@starting-style` and is removed under reduced motion or `animation: 'none'`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { tooltip: { showDelay: 300, hideDelay: 200 } } });
```

Changes apply to existing instances (a visible tooltip is repositioned).

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

Content is set with `textContent` and never parsed as HTML. CSP-safe: positioning uses the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Five listeners on the trigger, two on the tooltip, and one configuration subscription per instance. While visible: one overlay-stack entry, one window pointerdown listener, and the positioning engine's observers, all released on hide.

## 26. Supported data scale

Any number of instances per page; at most one is visible at a time.

## 27. Usage examples

```ts
import { Tooltip } from '@absoluteui/components/tooltip';

const save = document.querySelector<HTMLButtonElement>('#save');
if (save) Tooltip.create(save, { content: 'Ctrl+S' });
```

More examples, type-checked in CI: `metadata/tooltip/examples.json`.

## 28. Edge cases

- Moving the pointer straight from the trigger onto the tooltip keeps it open, even with `hideDelay: 0` (hiding is always asynchronous).
- A tooltip shown by keyboard focus stays visible when the pointer leaves.
- Inside a Popover, the first Escape hides the tooltip and the second closes the popover.
- Pointer down outside the trigger and tooltip hides the tooltip before the overlay stack runs, so the overlay below still gets its outside-pointer dismissal.
- Inside a modal `<dialog>`, the tooltip is appended to that dialog so it stays hoverable (the rest of the page is inert).

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TOOLTIP_TRIGGER` | configuration | The trigger is not a connected `HTMLElement`. |
| `TOOLTIP_OPTIONS` | configuration | Empty or non-string `content`, or an invalid `relation`. |
| `CFG_*` | configuration | Invalid `placement`, `showDelay`, or `hideDelay`. |

A failed construction leaves no element, ARIA reference, listeners, or subscriptions behind. A failed `update()` keeps the previous options.

## 30. Known limitations

- Touch pointers never show the tooltip.
- Disabled native buttons get no pointer or focus events; use `aria-disabled` if they need a tooltip.
- One visible tooltip per loaded copy of the module.
- The trigger gap is fixed at 6 px.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Rich or interactive content (use Popover).
- Showing on tap or long press.

## 32. TypeScript definitions

```ts
type TooltipRelation = 'description' | 'label';
interface TooltipConfig { placement: Placement; showDelay: number; hideDelay: number }
interface TooltipOptions extends Partial<TooltipConfig> { content: string; relation?: TooltipRelation; direction?: 'ltr' | 'rtl' }
```

## 33. Vanilla JS example

```ts
import { Tooltip } from '@absoluteui/components/tooltip';
import '@absoluteui/components/tooltip/style.css';

for (const el of document.querySelectorAll<HTMLElement>('[data-hint]')) {
  Tooltip.create(el, { content: el.dataset.hint ?? '', placement: 'bottom' });
}
```

## 34. Angular example

`auiTooltip` takes the content; the other options are prefixed: `tooltipPlacement`, `tooltipShowDelay`, `tooltipHideDelay`, `tooltipRelation`, `tooltipDirection`.

```ts
import { Component } from '@angular/core';
import { AuiTooltip } from '@absoluteui/angular/tooltip';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-editor-toolbar',
  imports: [AuiTooltip, AuiButton],
  template: `
    <button type="button" auiButton auiTooltip="Ctrl+S" tooltipPlacement="bottom">Save</button>
    <button type="button" auiButton icon="menu" variant="ghost" auiTooltip="Settings" tooltipRelation="label"></button>
  `,
})
export class EditorToolbarComponent {}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
