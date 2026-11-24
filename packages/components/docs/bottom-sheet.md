# Bottom Sheet

> Package: `@absoluteui/components/bottom-sheet` | Styles: `@absoluteui/components/bottom-sheet/style.css` (requires `@absoluteui/components/button/style.css` for the close button) | Since 0.3.0 | Status: R2

## 1. Purpose

A panel attached to the bottom edge of the viewport, built on native `<dialog>` like Dialog and Drawer.
- Modal (default): `showModal()` gives top-layer rendering, an inert background, a backdrop, and native focus containment. AbsoluteUI adds scroll lock and focus restoration.
- Non-modal (`modal: false`): `show()` keeps the page interactive. Focus moves into the sheet on open, and Escape closes it when it is the topmost overlay.

Optional snap points set the height as fractions of the viewport height. The drag handle resizes the sheet and, dragged down, dismisses it. Dragging is never the only way: with two or more snap points the handle is a keyboard-operable slider and a single click cycles the heights (WCAG 2.5.7), and Escape and the close button dismiss. Close reasons and cancelable close events mirror Drawer.

## 2. Anatomy

```text
<dialog class="aui-bottom-sheet aui-bottom-sheet--{modal|non-modal} [aui-bottom-sheet--snapped]
               [aui-bottom-sheet--dragging] [aui-bottom-sheet--static]"
        aria-labelledby aria-describedby style="--aui-bottom-sheet-snap (CSSOM)">
  <header class="aui-bottom-sheet__header">
    <h2 class="aui-bottom-sheet__title">title</h2>
    <button class="aui-button aui-bottom-sheet__close" aria-label="Close">icon</button>
  </header>
  <div class="aui-bottom-sheet__handle"                 (shown first through CSS order: -1)
       role="slider" tabindex="0" aria-label="Sheet height" aria-orientation="vertical"
       aria-valuemin aria-valuemax aria-valuenow aria-valuetext>    (two or more snap points)
       | aria-hidden="true">                                         (otherwise)
    <span class="aui-bottom-sheet__grip"></span>
  </div>
  <p class="aui-bottom-sheet__description" hidden?>description</p>
  <div class="aui-bottom-sheet__body">content</div>
</dialog>
```

The header precedes the handle in DOM order so the native initial focus lands on the close button, not the handle. The element is appended to `document.body` at creation.

## 3. When to use

- Short, contextual tasks on small screens, such as share targets, quick actions, or filters.
- Supplementary detail that users resize while keeping page context visible, such as a result list over a map (non-modal, with snap points).
- Mobile-first flows where a panel within thumb reach is preferable to a centered dialog.

## 4. When not to use

- Short confirmations or destructive prompts: use Dialog with `role: 'alertdialog'`.
- Long forms or multi-step flows: use a page or a Drawer.
- Content anchored to a trigger: use a popover or menu.
- Command menus on desktop layouts: use Menu.
- Tasks that must be completed before continuing: do not use a non-modal sheet.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLDialogElement` | Native dialog. |
| `body` | `HTMLDivElement` | Content area for consumer nodes. |
| `handle` | `HTMLDivElement` | Drag handle strip (slider with two or more snap points). |
| `isOpen` | `boolean` | Open state. |
| `modal` | `boolean` | Whether the sheet was created modal. |
| `snap` | `number` | Current snap point index (`0` without snap points). |

Options (`BottomSheetOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `title` | `string` | - (required) | No | Accessible name / heading. Non-empty after trimming. |
| `description` | `string` | - | No | `aria-describedby` text. |
| `content` | `Node \| string` | - | No | Body; strings render as text. Inserted at creation and when `update()` passes `content`. |
| `snapPoints` | `readonly number[]` | - | No | Viewport-height fractions, strictly ascending, each in `(0, 1]`. |
| `snap` | `number` | `0` | No | Snap index used on open. Must be `0` without snap points. |
| `modal` | `boolean` | `true` | No | Init-only. `false` uses `show()`; for supplementary panels only. |
| `icons` | `Partial<{ close: IconRef }>` | - | No | Icon slot overrides. |
| `closeOnEscape` | `boolean` | `true` | Yes | Escape requests close when topmost. |
| `closeOnBackdrop` | `boolean` | `true` | Yes | Backdrop click requests close (modal only). |
| `showCloseButton` | `boolean` | `true` | Yes | Header close button. |
| `closeOnDragDown` | `boolean` | `true` | Yes | Dragging the handle down past the threshold requests close. |

## 6. Methods

| Method | Description |
|---|---|
| `BottomSheet.create(options, doc?)` | Validate, then create and append a closed sheet to `doc.body`. |
| `open()` | Open, apply the `snap` option (when set), move focus inside, and remember focus for restoration. A modal sheet also locks scroll. Emits `aui-open`. No-op when open. |
| `close()` | Close programmatically. Not cancelable. Emits `aui-close` with reason `programmatic`. No-op when closed. |
| `snapTo(index)` | Set the snap point without an event. Throws `BOTTOM_SHEET_OPTIONS` for a non-integer or out-of-range index. |
| `update(options)` | Merge, validate, and apply options. `modal` cannot be changed. |
| `destroy()` | Close if open (focus and scroll restored, `aui-close` emitted), then remove the element, listeners, drag tracking, overlay registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Cancelable | When |
|---|---|---|---|---|
| `aui-open` | `null` | No | No | After opening. |
| `aui-cancel` | `{ reason }` | No | Yes | Before a user-initiated close (Escape, backdrop, close button, drag). `preventDefault()` keeps the sheet open; a dismissing drag snaps back. |
| `aui-close` | `{ reason }` | No | No | After closing. |
| `aui-snap-change` | `{ index, value }` | No | No | The user changed the snap point (keyboard, handle click, drag release). `value` is the viewport fraction. Not emitted by `snapTo()`, `update()`, or `open()`. |

Reasons: `'escape' | 'backdrop' | 'close-button' | 'drag' | 'programmatic'`. Events are dispatched on `element` and do not bubble.

## 8. Slots/content areas

`body` (or the `content` option) holds the sheet content. It scrolls; the header and handle stay in place.

## 9. CSS parts/hooks

`aui-bottom-sheet`, `aui-bottom-sheet--modal|non-modal`, `--snapped`, `--dragging`, `--static`, `aui-bottom-sheet__handle`, `__grip`, `__header`, `__title`, `__close`, `__description`, `__body`, and `::backdrop`. Custom properties set by the component through the CSSOM (`element.style.setProperty`): `--aui-bottom-sheet-snap` (active fraction), `--aui-bottom-sheet-offset` (downward slide in px during a drag), `--aui-bottom-sheet-live-height` (height in px during a drag with snap points). All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/bottom-sheet/tokens.json` (29 tokens, verified in CI). Key tokens: `color-surface`, `color-border`, `color-border-strong` (grip), `color-backdrop`, `shadow-lg`, `radius-lg`, `drawer-width-lg` (maximum width), `control-height-sm` (handle height), `duration-normal`, `easing-standard`, `space-*`.

## 11. States

closed, opening (slide-in), open, open at snap point N, dragging, closing (an `aui-cancel` listener is pending), and closing (slide-out).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | `open()` | open at `snap` (focus moves inside; modal: scroll locked, background inert) |
| open | Escape / backdrop (modal) / close button | `aui-cancel` -> closed, unless prevented |
| open | handle pointer moves more than 4 px | dragging (transitions off) |
| dragging | release, slide below the lowest height > `min(120px, 25% of that height)`, `closeOnDragDown: true` | `aui-cancel` (reason `drag`) -> closed; if prevented, back to open |
| dragging | other release, two or more snap points | open at the nearest snap point by height (`aui-snap-change` when it changed) |
| dragging | other release, fewer than two snap points | open (height unchanged) |
| dragging | Escape, `pointercancel`, lost pointer capture | open (drag canceled, height unchanged) |
| open at N | arrow / Page / Home / End on the handle, or a handle click | open at M (`aui-snap-change`) |
| open | `close()` / `destroy()` | closed (no `aui-cancel`) |
| open | consumer `<form method="dialog">` submit | closed (reason `programmatic`) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Modal open | Cycles through sheet controls; the background is inert. |
| Tab / Shift+Tab | Non-modal open | Follows document order; focus can reach the page. |
| Escape | Topmost overlay, `closeOnEscape: true` | `aui-cancel`, then close and restore focus. |
| Escape | `closeOnEscape: false` | No effect. The native close request is prevented, including repeated presses. |
| Escape | Handle drag in progress | Cancels the drag only; the sheet stays open. |
| Escape | A nested overlay is open | Closes only the topmost overlay. |
| ArrowUp / ArrowRight / PageUp | Handle slider focused | Next larger snap point; stops at the largest. |
| ArrowDown / ArrowLeft / PageDown | Handle slider focused | Next smaller snap point; stops at the smallest. Never closes. |
| Home / End | Handle slider focused | Smallest / largest snap point. |
| Enter / Space | Button focused | Activates. |

Handle keys with Alt, Ctrl, or Meta are ignored. With fewer than two snap points the handle is not focusable and has no keys.

## 14. ARIA contract

- `aria-labelledby` -> title; `aria-describedby` -> description, when provided.
- Native `dialog` role; modal sheets are exposed as modal by `showModal()`.
- Close button: localized `aria-label` ("Close").
- Handle with two or more snap points: `role="slider"`, `tabindex="0"`, `aria-label` "Sheet height", `aria-orientation="vertical"`, `aria-valuemin`/`aria-valuemax` = lowest/highest snap point as a whole percent, `aria-valuenow` = current percent, `aria-valuetext` "{percent}% of screen height".
- Handle otherwise: `aria-hidden="true"`, no role, not focusable. Dragging it only dismisses, which Escape and the close button also do.

## 15. Accessibility notes

- Initial focus follows the native dialog focusing steps: the first focusable element, which is the close button when shown. A non-modal sheet with nothing focusable focuses the dialog (`tabindex="-1"`).
- A modal sheet returns focus to the element focused before `open()`. A non-modal sheet returns focus only when focus was inside the sheet (or on the body) at close.
- Hiding the focused close button through configuration moves focus to the dialog.
- Single-pointer alternative to dragging (WCAG 2.5.7): a click on the handle cycles the snap points; the click after a drag is suppressed.
- The handle strip is full-width and `control-height-sm` tall (WCAG 2.5.8).
- The handle is shown first visually but follows the header in focus order.
- Slide motion is removed under `prefers-reduced-motion` and `data-aui-animation='none'`.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Inline size `min(100vw, drawer-width-lg)`, centered with `margin: 0 auto`; top corners use `radius-lg`. Without snap points the sheet fits its content up to `max-block-size: 90dvh`; with snap points `block-size: calc(100dvh * snap)` (up to `100dvh`). The body scrolls with `overscroll-behavior: contain`. Horizontal padding is `max(space-5, env(safe-area-inset-left|right))` and the body's bottom padding is `max(space-5, env(safe-area-inset-bottom))`, so content clears notches and the home indicator. The handle uses `touch-action: none`.

## 17. RTL behavior

No `direction` option. The sheet is centered and slides vertically, so the writing direction does not change placement. Header layout uses logical properties; the close button sits at the inline end. Slider arrow keys are not mirrored: ArrowRight and ArrowUp always enlarge the sheet.

## 18. Theme behavior

Token-driven surface, border (no bottom border), top radius, shadow, backdrop, and grip color. Forced-colors mode uses `CanvasText` for the border and the grip.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { bottomSheet: { closeOnBackdrop: false, closeOnDragDown: false } } });
```

Globally configurable: `closeOnEscape`, `closeOnBackdrop`, `showCloseButton`, `closeOnDragDown`. Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic through `update()`; `modal` is init-only.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.close` (default `close`), resolved through the global icon provider/registry. The grip is a CSS bar, not an icon.

## 23. Security behavior

Title, description, and string content use `textContent`. No HTML parsing. Drag and snap geometry is written as CSS custom properties through the CSSOM, never as markup style attributes, so the component is CSP-safe (`style-src` without `'unsafe-inline'`).

## 24. Data handling behavior

No persistence, network access, or telemetry. The snap index lives in memory.

## 25. Performance characteristics

Constant work per open/close: one `showModal()`/`show()` call, one overlay-stack entry, one scroll-lock reference (modal), and one focus restore point. During a drag, each `pointermove` reads the viewport height and writes at most two custom properties; the sheet height is measured once at drag start. Budget: `open()` under 16 ms (one frame) in headless Chromium.

## 26. Supported data scale

Not data-driven. Body content size is limited only by the consumer; the body scrolls. Snap point count is unbounded, but more than three or four heights are hard to distinguish by dragging.

## 27. Usage examples

```ts
import { BottomSheet } from '@absoluteui/components/bottom-sheet';

const sheet = BottomSheet.create({ title: 'Share', description: 'Choose where to send the link.' });
sheet.body.append(document.createElement('ul'));
sheet.open();
```

More examples, type-checked in CI: `metadata/bottom-sheet/examples.json`.

## 28. Edge cases

- `closeOnEscape: false` also blocks repeated Escape presses (the native close request is always prevented).
- A non-modal sheet yields Escape to a modal dialog opened elsewhere, because it is inert behind that dialog.
- Escape during a handle drag is consumed by the drag and never reaches the overlay stack.
- With exactly one snap point the height is fixed at that fraction; the handle is decorative and dragging only dismisses.
- Without snap points the dismiss threshold is `min(120px, 25% of the sheet height at drag start)`; with snap points it uses the lowest snap height.
- A prevented `aui-cancel` after a dismissing drag returns the sheet to its current snap point.
- `open()` re-applies the `snap` option when it is set; without it, the last snap index is kept across reopening.
- `update({ snapPoints })` without `snap` clamps both the current index and a kept `snap` option to the new list; an explicit out-of-range `snap` throws.
- Consumer changes to `body` survive re-renders; only `update({ content })` replaces the body.
- Destroying an open sheet releases the scroll lock and overlay registration, and restores focus.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BOTTOM_SHEET_TITLE` | configuration | Missing or blank title. |
| `BOTTOM_SHEET_OPTIONS` | configuration | Invalid `modal`, `content`, `snapPoints` (not strictly ascending numbers in `(0, 1]`), `snap`, or `snapTo()` index. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration value, such as `closeOnEscape: 'yes'`. |

A failed construction leaves nothing behind: no element in the document, listeners, overlay registration, or subscriptions. A failed `update()` keeps the previous options.

## 30. Known limitations

- Non-modal sheets are not in the top layer. They use `z-index: 1000`, so page content with a higher stacking context can cover them.
- Only the handle strip starts a drag; the header and body never drag the sheet.
- Snap points are viewport fractions only.
- Slide animations need `@starting-style` and `transition-behavior: allow-discrete`. Older browsers open and close without animation.
- A `<form method="dialog">` submit in the content closes with reason `programmatic` (there is no `returnValue` in the detail).
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Switching `modal` after creation.
- Sheets on the top or side edges: use Drawer.
- Pixel or content-measured snap heights.
- HTML strings as content: pass a `Node` instead.

## 32. TypeScript definitions

```ts
type BottomSheetCloseReason = 'escape' | 'backdrop' | 'close-button' | 'drag' | 'programmatic';
interface BottomSheetConfig { closeOnEscape: boolean; closeOnBackdrop: boolean; showCloseButton: boolean; closeOnDragDown: boolean }
interface BottomSheetIcons { close: IconRef }
interface BottomSheetOptions extends Partial<BottomSheetConfig> {
  title: string;
  description?: string;
  content?: Node | string;
  snapPoints?: readonly number[];
  snap?: number;
  modal?: boolean;
  icons?: Partial<BottomSheetIcons>;
}
type BottomSheetUpdateOptions = Partial<Omit<BottomSheetOptions, 'modal'>>;
interface BottomSheetCloseDetail { reason: BottomSheetCloseReason }
interface BottomSheetSnapChangeDetail { index: number; value: number }
```

## 33. Vanilla JS example

```ts
import { BottomSheet, type BottomSheetSnapChangeDetail } from '@absoluteui/components/bottom-sheet';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/bottom-sheet/style.css';

const results = BottomSheet.create({ title: 'Nearby places', modal: false, snapPoints: [0.25, 0.5, 0.9], snap: 1 });
results.element.addEventListener('aui-snap-change', (event) => {
  const { value } = (event as CustomEvent<BottomSheetSnapChangeDetail>).detail;
  results.body.classList.toggle('is-expanded', value >= 0.9);
});
document.querySelector('#show-results')?.addEventListener('click', () => {
  results.open();
});
```

## 34. Angular example

`<aui-bottom-sheet>` renders its projected content as the sheet body (a live embedded view). Bind `[(open)]`: it opens and closes the sheet and follows user dismissals. Outputs: `opened`, `cancelled`, `closed`, `snapChange`; `snapTo(index)` moves to a snap point. `modal` is read once at creation.

```ts
import { Component, signal } from '@angular/core';
import { AuiButton } from '@absoluteui/angular/button';
import { AuiBottomSheet } from '@absoluteui/angular/bottom-sheet';

@Component({
  selector: 'app-article',
  imports: [AuiButton, AuiBottomSheet],
  template: `
    <button type="button" auiButton variant="secondary" (click)="sharing.set(true)">Share</button>
    <aui-bottom-sheet title="Share" [open]="sharing()" (closed)="sharing.set(false)">
      <p>Share targets</p>
    </aui-bottom-sheet>`,
})
export class ArticleComponent {
  readonly sharing = signal(false);
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
