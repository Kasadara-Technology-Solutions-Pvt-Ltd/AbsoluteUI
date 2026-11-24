The accessibility and interaction primitives AbsoluteUI components are built from: live announcements, focus trapping and restoration, roving focus, keyboard helpers, positioning, the overlay stack, scroll locking, observers, and reduced motion. Use them when your application builds its own widget, so it behaves like, and cooperates with, the built-in ones. [Overlays and focus](/docs/guides/overlays-and-focus/) explains the behavior they implement.

### How do I announce a status change to screen readers?

`announce` writes to a shared, visually hidden live region (inside the topmost modal dialog when one is open). Use `'assertive'` only for errors that need immediate attention.

```ts
import { announce } from '@absoluteui/utilities';

announce('3 leave requests approved.');
await new Promise((resolve) => requestAnimationFrame(resolve));
document.querySelector('[aria-live="polite"]')?.textContent; // => '3 leave requests approved.'
```

### How do I keep focus inside a custom panel?

`createFocusTrap` keeps Tab and Shift+Tab inside the container while active and, on `deactivate`, returns focus to the element that had it. Modal `<dialog>` elements are already inert-backed; use the trap for non-modal panels.

```ts
import { createFocusTrap } from '@absoluteui/utilities';

const trigger = document.createElement('button');
trigger.textContent = 'Filters';
const panel = document.createElement('div');
panel.setAttribute('role', 'region');
panel.setAttribute('aria-label', 'Employee filters');
const department = document.createElement('select');
const apply = document.createElement('button');
apply.textContent = 'Apply';
panel.append(department, apply);
document.body.append(trigger, panel);

trigger.focus();
const trap = createFocusTrap(panel);
trap.activate();
document.activeElement === department; // => true
trap.deactivate();
document.activeElement === trigger; // => true
```

### How do I add arrow-key navigation to a toolbar?

`createRovingTabindex` keeps one item in the Tab sequence and moves between items with the arrow keys, Home, and End. It mirrors left and right for `direction: 'rtl'` and skips items with `disabled` or `aria-disabled="true"`.

```ts
import { createRovingTabindex } from '@absoluteui/utilities';

const toolbar = document.createElement('div');
toolbar.setAttribute('role', 'toolbar');
toolbar.setAttribute('aria-label', 'Timesheet actions');
const buttons = ['Approve', 'Reject', 'Export'].map((label) => {
  const button = document.createElement('button');
  button.textContent = label;
  return button;
});
toolbar.append(...buttons);
document.body.append(toolbar);

const roving = createRovingTabindex(toolbar, { getItems: () => buttons, orientation: 'horizontal', loop: true });
buttons.map((b) => b.tabIndex); // => [0, -1, -1]
buttons[0]?.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
roving.activeIndex; // => 1
document.activeElement === buttons[1]; // => true
roving.dispose();
```

### How do I show a popup next to a button?

`openPopover` puts the element in the top layer and registers it in the shared overlay stack (Escape and outside clicks close only the topmost overlay). `autoPosition` places it next to the anchor, flips it when there is no room, and follows scrolling and resizing until you call its disposer.

```ts
import { autoPosition, computePosition, openPopover } from '@absoluteui/utilities';

const button = document.createElement('button');
button.textContent = 'Leave balance';
const popup = document.createElement('div');
popup.textContent = 'Annual: 12 days';
document.body.append(button, popup);

const stopPositioning = autoPosition(button, popup, { placement: 'bottom-start' });
const handle = openPopover(popup, {
  inside: [button],
  onDismiss: () => {
    handle.close();
    stopPositioning();
  },
});
handle.open; // => true
// Pure geometry, e.g. for a canvas: no room below, so it flips above.
computePosition({ x: 100, y: 700, width: 120, height: 32 }, { width: 200, height: 160 }, { x: 0, y: 0, width: 1024, height: 768 }).placement; // => 'top-start'
handle.close();
stopPositioning();
```

### How do I respect reduced motion?

`shouldAnimate` is false when the user asks for reduced motion or the application sets `animation: 'none'`. Check it before every animation; `observeMediaQuery` reports later changes to the preference.

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { observeMediaQuery, shouldAnimate } from '@absoluteui/utilities';

const toast = document.createElement('div');
document.body.append(toast);
if (shouldAnimate()) toast.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 150 });

const stop = observeMediaQuery('(prefers-reduced-motion: reduce)', (reduce) => {
  toast.dataset.motion = reduce ? 'off' : 'on';
});
configureAbsoluteUI({ common: { animation: 'none' } });
shouldAnimate(); // => false
stop();
```

### What goes wrong?

- **A custom overlay outside the stack.** Escape then closes an AbsoluteUI popover beneath yours. Open it with `openPopover`, or call `registerOverlayLayer` for your own modal, and check `isTopOverlay` before handling keys yourself.
- **Leaked listeners and observers.** `autoPosition`, `registerOverlayLayer`, `lockScroll`, and the `observe*` functions return disposers; call each one when the widget closes.
- **Scroll locks are counted.** The page scrolls again only after every lock is released:

```ts
import { isScrollLocked, lockScroll } from '@absoluteui/utilities';

const releaseDrawer = lockScroll();
const releaseDialog = lockScroll();
releaseDialog();
isScrollLocked(); // => true
releaseDrawer();
isScrollLocked(); // => false
```
