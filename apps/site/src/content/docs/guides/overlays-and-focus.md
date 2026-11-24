---
title: Overlays and focus
description: How dialogs, drawers, popovers, menus, and tooltips render in the top layer, stack, and manage focus.
---

Overlays are where UI libraries most often break keyboard and screen-reader users. AbsoluteUI builds every overlay on the platform: the native `<dialog>` element for modal surfaces and the Popover API for everything else, with one shared overlay stack.

## Choosing an overlay

| Need | Component | Modality |
|---|---|---|
| A decision the user must make now (confirm, destructive action) | [Dialog](/docs/components/dialog/) (`role: 'alertdialog'`) | Modal: the page behind is inert |
| A task in context (edit a record, filters) | [Drawer](/docs/components/drawer/) | Modal or non-modal |
| Actions on small screens | [Bottom Sheet](/docs/components/bottom-sheet/) | Modal or non-modal |
| Extra controls next to a trigger | [Popover](/docs/components/popover/) | Non-modal |
| A list of commands | [Menu](/docs/components/menu/), [Context Menu](/docs/components/context-menu/), [Menu Bar](/docs/components/menu-bar/) | Non-modal |
| A short label for an icon button | [Tooltip](/docs/components/tooltip/) | Non-interactive |
| A preview of a linked item | [Hover Card](/docs/components/hover-card/) | Non-modal |
| Session about to expire | [Session Warning Dialog](/docs/components/session-warning-dialog/) | Modal, with a countdown |

## Behavior you get everywhere

- **Top layer.** Overlays render above everything without `z-index` tuning, and overflow containers never clip them.
- **Positioning.** Anchored overlays are placed by a shared positioning engine that flips to the other side when there is no room, and scrolls when taller than the viewport.
- **One stack.** Escape and outside clicks close only the topmost overlay, so a date picker inside a dialog closes first, then the dialog.
- **Focus.** Modal overlays move focus inside on open and return it to the element that opened them on close. Non-modal popups sit right after their trigger in the DOM, so Tab order stays natural.
- **Hover and focus content (WCAG 1.4.13).** Tooltips and hover cards appear on keyboard focus as well as hover, stay while the pointer moves onto them, and dismiss with Escape without moving focus.
- **Reduced motion.** Overlays fade in and out; the animation is removed under `prefers-reduced-motion`.

## Guarding unsaved changes

The `aui-cancel` event fires when the user tries to close a dialog with Escape or the close button. Cancel it to keep the dialog open, for example while a form has unsaved changes:

<figure class="aui-live" data-min-height="360"><iframe data-src="/docs/examples/dialog/guard-unsaved.html" title="Live example: Prevent closing with unsaved changes" loading="lazy"></iframe></figure>

## Your own overlays

If you build a custom overlay, use the same primitives from [`@absoluteui/utilities`](/docs/api/utilities/) (overlay stack, positioning, focus trapping and restoration, scroll lock) so it cooperates with AbsoluteUI's overlays.
