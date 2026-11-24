# Button Group

> Package: `@absoluteui/components/button-group` | Styles: `@absoluteui/components/button-group/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

A labelled `role="group"` of related native buttons, visually attached (shared borders, no inner radii) or spaced, horizontal or vertical. `ButtonGroup.create` renders Buttons from data; `ButtonGroup.enhance` groups buttons that already exist in the markup. Keyboard interaction stays native: Tab moves through every button. It is not a toolbar; a Toolbar component with arrow-key navigation is planned.

## 2. Anatomy

```text
<div class="aui-button-group aui-button-group--horizontal aui-button-group--attached" role="group" aria-label="Label">
  <button class="aui-button aui-button--secondary aui-button--md">First</button>
  <button class="aui-button ...">Second</button>
  <button class="aui-button aui-button--icon-only" aria-label="More"><svg class="aui-icon" aria-hidden="true"></button>
</div>
```

## 3. When to use

- A small set of related actions that belong together, such as Previous / Next or Copy / Paste.
- Grouping buttons so assistive technologies announce their shared purpose.

## 4. When not to use

- Choosing one or several options: use Radio Group, Checkbox Group, or a segmented control.
- Large command sets with arrow-key navigation: use Toolbar (planned).
- Navigation between pages or views: use links or Tabs.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLElement` | The group element (`role="group"`). |
| `buttons` | `HTMLButtonElement[]` | Direct child buttons, in DOM order. |
| `options` | `Readonly<ButtonGroupOptions>` | Current options. |

Options: `label` (required), `size`, `buttons` (create only; `{ text?, icon?, label?, variant?, value?, disabled? }`), plus the global options below. Full table: `metadata/button-group/api.json`.

| Global option | Type | Default |
|---|---|---|
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` |
| `attached` | `boolean` | `true` |

## 6. Methods

| Method | Description |
|---|---|
| `ButtonGroup.create(host, options)` | Render Buttons from `buttons` into `host` (children are replaced). Throws on invalid options before rendering. |
| `ButtonGroup.enhance(element, options)` | Group the element's existing child buttons. Plain native buttons are enhanced as Buttons until `destroy()`; buttons that already have `aui-button` keep their own controller. |
| `update(options)` | Merge and apply options. A new `buttons` array rebuilds the Buttons; `size` updates them in place. |
| `destroy()` | Remove listeners and subscriptions, destroy the Buttons the group created or enhanced (created buttons are removed), and restore the element's original `role` and `aria-label`. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-action` | `{ value }` | Yes | `create()` groups only: a button was activated (click, Enter, or Space). `value` defaults to the button index as a string. |

Native `click` events are unchanged. `enhance()` groups emit no events; listen for `click`.

## 8. Slots/content areas

The buttons: created from `buttons`, or the element's existing direct child `<button>` elements with `enhance()`.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-button-group` | Group element. |
| `aui-button-group--horizontal`, `--vertical` | Orientation. |
| `aui-button-group--attached` | Shared borders and removed inner radii. |
| `aui-button`, `aui-button--*` | Buttons (see Button). |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/button-group/tokens.json`. The group adds `space-2` (gap), `border-width` (overlap), and the focus-ring tokens; buttons use the Button tokens.

## 11. States

horizontal, vertical, attached, spaced; per button: default, hover, focus-visible, disabled.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ orientation })` or global config | new layout |
| any | `update({ buttons })` | Buttons rebuilt |
| any | `update({ size })` | Buttons resized in place |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves through every enabled button in DOM order (native). |
| Enter / Space | Button focused | Activates the button (native). |

Arrow keys are not handled: this is a group, not a toolbar. For the APG Toolbar pattern (one tab stop, arrow keys between controls), a Toolbar component is planned.

## 14. ARIA contract

- Group element: `role="group"` with `aria-label` from `label`.
- Icon-only buttons: `aria-label` from the button's `label` (required).
- `aria-orientation` is not set: the group role does not support it.

## 15. Accessibility notes

- Screen readers announce the group label when focus enters the group.
- Disabled buttons use native `disabled` and leave the tab order.
- In attached groups the hovered or focused button is raised so its full border and focus ring are visible; the ring is inset so the scroll container cannot clip it.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

Spaced horizontal groups (`attached: false`) wrap at narrow widths. Attached horizontal groups never wrap, because wrapping would break the shared borders; they are limited to the container width and scroll horizontally. Use `attached: false` for groups that must stay fully visible on small screens. Vertical groups stack.

## 17. RTL behavior

Logical properties throughout: the first button keeps the start radii and the last keeps the end radii in both directions.

## 18. Theme behavior

Buttons use their own role tokens. In forced-colors mode focus uses a `Highlight` outline and button borders use `ButtonText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { buttonGroup: { attached: false } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic. `size` falls back to the Button configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None on the group. Each entry in `buttons` takes an `icon`.

## 23. Security behavior

Button text and labels use `textContent`. CSP-safe: no inline styles or handlers.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

One delegated click listener (create only) and one configuration subscription, plus one Button per button. Budget: under 2 ms for 10 buttons (not yet covered by the performance test).

## 26. Supported data scale

Intended for small groups of 2 to 7 buttons. Unit-tested with up to three.

## 27. Usage examples

```ts
import { ButtonGroup } from '@absoluteui/components/button-group';

const host = document.createElement('div');
document.body.append(host);
ButtonGroup.create(host, {
  label: 'Pagination',
  buttons: [
    { icon: 'chevron-left', label: 'Previous page', value: 'prev' },
    { icon: 'chevron-right', label: 'Next page', value: 'next' },
  ],
});
```

More examples, type-checked in CI: `metadata/button-group/examples.json`.

## 28. Edge cases

- An icon-only entry without `label` throws `BUTTON_ICON_ONLY_LABEL`; Buttons already created for that call are discarded.
- `enhance()` only considers direct child buttons; nested buttons are not styled as part of the group.
- Consumer-enhanced Buttons inside an enhanced group keep their own size and variant.
- Disabled buttons emit neither `click` nor `aui-action`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BUTTON_GROUP_OPTIONS` | configuration | Missing label, invalid size, or `buttons` passed to `enhance()`. |
| `BUTTON_ICON_ONLY_LABEL` | configuration | An icon-only button has no `label`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `orientation` or `attached` value. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- No arrow-key navigation; a Toolbar component is planned.
- Attached horizontal groups scroll rather than wrap at narrow widths.
- No pressed/toggle state management.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Split buttons and menu buttons.
- Managing `aria-pressed` toggle state (set it on the buttons yourself).

## 32. TypeScript definitions

```ts
type ButtonGroupOrientation = 'horizontal' | 'vertical';
interface ButtonGroupButton { text?: string; icon?: IconRef; label?: string; variant?: ButtonVariant; value?: string; disabled?: boolean }
interface ButtonGroupOptions { label: string; orientation?: ButtonGroupOrientation; attached?: boolean; size?: ButtonSize; buttons?: readonly ButtonGroupButton[] }
interface ButtonGroupActionDetail { value: string }
```

## 33. Vanilla JS example

```ts
import { ButtonGroup } from '@absoluteui/components/button-group';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/button-group/style.css';

const element = document.querySelector<HTMLElement>('#clipboard-actions');
if (element) {
  ButtonGroup.enhance(element, { label: 'Clipboard', attached: false });
  element.addEventListener('click', (event) => {
    if (event.target instanceof HTMLButtonElement) element.dataset.last = event.target.textContent;
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiButtonGroup } from '@absoluteui/angular/button-group';

@Component({
  selector: 'app-pager',
  imports: [AuiButtonGroup],
  template: `<aui-button-group label="Pagination" size="sm" [buttons]="buttons" (action)="go($event.value)"></aui-button-group>`,
})
export class PagerComponent {
  readonly buttons = [
    { icon: 'chevron-left', label: 'Previous page', value: 'prev' },
    { icon: 'chevron-right', label: 'Next page', value: 'next' },
  ];
  go(direction: string): void {
    void direction;
  }
}
```

## 35. React example

```tsx
import { AuiButtonGroup } from '@absoluteui/react/button-group';

const buttons = [{ text: 'List', value: 'list' }, { text: 'Grid', value: 'grid' }];

export function Example() {
  return <AuiButtonGroup label="View" buttons={buttons} onAction={(d) => { console.log(d); }} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiButtonGroup } from '@absoluteui/vue/button-group';
const buttons = [{ text: 'List', value: 'list' }, { text: 'Grid', value: 'grid' }];
</script>

<template>
  <AuiButtonGroup label="View" :buttons="buttons" @action="(d) => console.log(d)" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
