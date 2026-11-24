# Collapsible

> Package: `@absoluteui/components/collapsible` | Styles: `@absoluteui/components/collapsible/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

A single disclosure: a native `<button>` with `aria-expanded` and `aria-controls`, optionally inside a heading, that shows and hides one content region, such as "Show more details" or an advanced-settings section. Accordion is for several related sections; Collapsible is for one.

## 2. Anatomy

```text
<div class="aui-collapsible aui-collapsible--{variant} [aui-collapsible--open]">
  [<h3 class="aui-collapsible__heading">]
    <button class="aui-collapsible__trigger" aria-expanded aria-controls="panel">
      <span class="aui-collapsible__label">label</span>
      icon (rotates when open)
    </button>
  [</h3>]
  <div class="aui-collapsible__panel" id="panel" [hidden]>
    <div class="aui-collapsible__clip"><div class="aui-collapsible__content">content</div></div>
  </div>
</div>
```

## 3. When to use

- Optional or advanced content that most users do not need: details, advanced settings, long explanations.
- One section that the user can expand on its own.

## 4. When not to use

- Several related sections: use Accordion.
- Content the user must see to complete the task: do not hide it.
- Navigation menus: use Menu or Sidebar.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `open` | `boolean` | Whether the content is shown. |
| `trigger` | `HTMLButtonElement` | The trigger button. |
| `content` | `HTMLDivElement` | The content container. |
| `options` | `Readonly<CollapsibleOptions>` | Current options. |

Options (`CollapsibleOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Trigger text. |
| `content` | `Node \| string` | - (required) | No | Region content; strings are rendered as text. |
| `open` | `boolean` | `false` | No | Initial state; with `update()`, sets the state. |
| `disabled` | `boolean` | `false` | No | Blocks toggling; the trigger stays focusable (`aria-disabled`). |
| `headingLevel` | `2 \| 3 \| 4 \| 5 \| 6 \| null` | - | No | Wrap the trigger in a heading of this level. |
| `variant` | `'plain' \| 'bordered'` | `'plain'` | Yes | `plain`: text trigger; `bordered`: full-width trigger in a bordered surface. |
| `icons` | `Partial<CollapsibleIcons>` | - | No | Icon slot overrides. |

## 6. Methods

| Method | Description |
|---|---|
| `Collapsible.create(host, options)` | Render into `host` (children are replaced). |
| `show()` / `hide()` / `toggle()` | Change the state programmatically (no event). |
| `update(options)` | Merge and apply options; `open` sets the state. |
| `destroy()` | Remove rendering, classes, listeners, and subscriptions. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ open: boolean }` | The user toggled the content. Programmatic changes do not emit. |

## 8. Slots/content areas

`content`: a `Node` or text, placed inside the controlled region.

## 9. CSS parts/hooks

`aui-collapsible`, `aui-collapsible--plain|bordered`, `aui-collapsible--open`, `aui-collapsible--disabled`, `aui-collapsible__heading`, `aui-collapsible__trigger`, `aui-collapsible__label`, `aui-collapsible__icon`, `aui-collapsible__panel`, `aui-collapsible__content`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/collapsible/tokens.json` (verified in CI). Component tokens: `--aui-collapsible-border-color` (falls back to `color-border`), `--aui-collapsible-radius` (`radius-md`). The height animation uses `duration-normal` and `easing-standard`.

## 11. States

Closed, open, disabled; plain or bordered; with or without a heading.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed | click, Enter, or Space on the trigger | open (`aui-change` with `open: true`) |
| open | click, Enter, or Space on the trigger | closed (`aui-change` with `open: false`) |
| any | `show()`, `hide()`, `toggle()`, `update({ open })` | the requested state, no event |
| any (disabled) | activation | unchanged |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Trigger | Show or hide the content. |
| Tab | Any | Moves to the trigger, then into the content when it is shown. |

## 14. ARIA contract

- Trigger: native `button` with `aria-expanded` and `aria-controls` (the panel id); `aria-disabled="true"` when disabled.
- With `headingLevel`, the trigger is inside an `h2`-`h6`, so the section appears in the heading outline.
- The panel has `hidden` while closed, which removes its content from the tab order and the accessibility tree.

## 15. Accessibility notes

- Keep the label the same whether open or closed; `aria-expanded` announces the state.
- Do not hide content the user needs to finish the task.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Full width of its container. The region height animates when motion is allowed.

## 17. RTL behavior

Logical properties: the icon follows the label at the inline end.

## 18. Theme behavior

Plain triggers turn `color-link` on hover; bordered triggers use `color-hover`. The focus ring uses `color-focus-ring`. Animation is off with `prefers-reduced-motion` and the animation setting `none`. Forced-colors mode uses `CanvasText` borders and `GrayText` for a disabled trigger.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { collapsible: { variant: 'bordered' } } });
```

## 20. Component configuration support

The instance `variant` overrides configuration; configuration changes re-render existing instances.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.expand` (default `chevron-down`); it rotates 180 degrees when open.

## 23. Security behavior

The label and string content are rendered as text, never parsed as HTML. Node content is inserted as given; the application owns it.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per toggle: attribute and class updates. Content is built once and kept while hidden.

## 26. Supported data scale

Not data-driven.

## 27. Usage examples

```ts
import { Collapsible } from '@absoluteui/components/collapsible';

const host = document.querySelector<HTMLElement>('#shipping-help');
const details = document.querySelector<HTMLTemplateElement>('#shipping-details');
if (host && details) {
  Collapsible.create(host, { label: 'How is the delivery date calculated?', content: details.content.cloneNode(true) });
}
```

More examples, type-checked in CI: `metadata/collapsible/examples.json`.

## 28. Edge cases

- Content open at creation does not animate on load; the animation starts with the first toggle.
- Changing `headingLevel` moves the same trigger into the new heading, so focus is kept.
- Hidden content is not found by the browser's find in page.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `COLLAPSIBLE_OPTIONS` | configuration | Missing or blank label, missing content, a non-boolean `open` or `disabled`, or an invalid heading level. |
| `ICON_UNKNOWN` | configuration | Unknown icon override. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid variant or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- The open state is not remembered across page loads.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Several sections with single-open behavior: use Accordion.
- HTML strings as content: pass a `Node`.

## 32. TypeScript definitions

```ts
type CollapsibleVariant = 'plain' | 'bordered';
type CollapsibleHeadingLevel = 2 | 3 | 4 | 5 | 6;
interface CollapsibleConfig { variant: CollapsibleVariant }
interface CollapsibleIcons { expand: IconRef }
interface CollapsibleOptions extends Partial<CollapsibleConfig> {
  label: string;
  content: Node | string;
  open?: boolean;
  disabled?: boolean;
  headingLevel?: CollapsibleHeadingLevel | null;
  icons?: Partial<CollapsibleIcons>;
}
interface CollapsibleChangeDetail { open: boolean }
```

## 33. Vanilla JS example

```ts
import { Collapsible } from '@absoluteui/components/collapsible';
import '@absoluteui/components/collapsible/style.css';

const host = document.querySelector<HTMLElement>('#more');
if (host) Collapsible.create(host, { label: 'Show more details', content: 'The report includes all closed tickets from the last quarter.' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { CollapsibleChangeDetail } from '@absoluteui/components/collapsible';
import { AuiCollapsible } from '@absoluteui/angular/collapsible';

@Component({
  selector: 'app-delivery-help',
  imports: [AuiCollapsible],
  template: `<aui-collapsible label="How is the delivery date calculated?" [content]="help" [open]="open" (changed)="onToggle($event)"></aui-collapsible>`,
})
export class DeliveryHelpComponent {
  open = false;
  readonly help = 'Orders placed before 14:00 on a business day ship the same day.';

  onToggle(detail: CollapsibleChangeDetail): void {
    this.open = detail.open;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
