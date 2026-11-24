# Badge

> Package: `@absoluteui/components/badge` | Styles: `@absoluteui/components/badge/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

A short, static label such as "Active", "Beta", or "3 new" that classifies the content next to it. `Badge` renders an optional decorative dot or icon and the label. The label carries the meaning; tone colors, the dot, and the icon are decorative, so a badge never depends on color alone. Badges are not interactive: removable or selectable tags are Tag Group.

## 2. Anatomy

```text
<span class="aui-badge aui-badge--{tone} aui-badge--{variant} aui-badge--{size}">
  <span class="aui-badge__dot | aui-badge__icon" aria-hidden="true">(dot or icon, optional)</span>
  <span class="aui-badge__label">label</span>
</span>
```

## 3. When to use

- Status or category of an item in a list, table cell, card, or heading: Active, Draft, Overdue, Beta.
- A count that belongs to a label, such as "3 new" beside a section title.

## 4. When not to use

- Tags the user can remove or select: use Tag Group.
- Status that changes while the user works and must be announced: use Inline Message with `live`.
- Messages that need explanation or actions: use Alert.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element; receives the classes. |
| `label` | `string` | Current label. |
| `options` | `Readonly<BadgeOptions>` | Current options. |

Options (`BadgeOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible text; carries the meaning. |
| `tone` | `'neutral' \| 'info' \| 'success' \| 'warning' \| 'error'` | `'neutral'` | No | Decorative tone color. |
| `variant` | `'subtle' \| 'outline'` | `'subtle'` | Yes | `subtle`: tone fill; `outline`: tone boundary. |
| `size` | `'sm' \| 'md'` | `'md'` | Yes | Badge size. |
| `icon` | `IconRef \| null` | - | No | Decorative icon before the label. |
| `dot` | `boolean` | `false` | No | Decorative status dot before the label; not combined with `icon`. |

## 6. Methods

| Method | Description |
|---|---|
| `Badge.create(host, options)` | Render into `host` (children are replaced). A `<span>` host keeps the badge inline. |
| `update(options)` | Merge and apply options; the label changes in place. |
| `destroy()` | Remove rendering, classes, and the configuration subscription. |

## 7. Events

None. Badges are output only.

## 8. Slots/content areas

None. The label is text only.

## 9. CSS parts/hooks

`aui-badge`, `aui-badge--neutral|info|success|warning|error`, `aui-badge--subtle|outline`, `aui-badge--sm|md`, `aui-badge__dot`, `aui-badge__icon`, `aui-badge__label`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/badge/tokens.json` (23 tokens and 3 component tokens, verified in CI). Component tokens: `--aui-badge-radius` (falls back to `radius-pill`), `--aui-badge-padding-x` (`space-2`), `--aui-badge-font-weight` (`font-weight-medium`). Tone colors: `color-{tone}-subtle` (subtle fill), `color-{tone}-fg` (dot, icon, outline boundary); neutral uses `color-surface-sunken`, `color-border-strong`, and `color-text-muted`.

## 11. States

Tones neutral, info, success, warning, error; variants subtle and outline; sizes sm and md; with a dot or an icon.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ tone, variant, size, label })` | new appearance and label |
| any | global configuration change | variant and size follow the configuration unless set on the instance |
| any | `destroy()` | host restored to empty |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable. Assistive technology reads it in document order. |

## 14. ARIA contract

- The host has no role; the label is plain text.
- The dot and the icon are `aria-hidden="true"`.

## 15. Accessibility notes

- Write labels that make sense without color: "Overdue", not a red dot alone.
- A badge is not announced when it changes. For status that changes while the user works, use Inline Message with `live`.
- The e2e axe run covers the default, dark, and high-contrast themes; manual screen-reader verification is pending.

## 16. Responsive behavior

An inline-flex pill limited to the container width; a long label is truncated with an ellipsis. Keep labels to one or two words.

## 17. RTL behavior

Logical properties: the dot or icon sits at the inline start.

## 18. Theme behavior

Subtle badges pair `color-text` with `color-{tone}-subtle` (or `color-surface-sunken` for neutral); outline badges pair `color-text` with `color-surface`. These pairs are in the contrast gate. Forced-colors mode draws a `CanvasText` boundary and dot.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { badge: { variant: 'outline', size: 'sm' } } });
```

## 20. Component configuration support

Instance `variant` and `size` override global and theme configuration. Configuration changes re-render existing badges.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icon` takes any registered icon name or icon definition; it is decorative.

## 23. Security behavior

The label uses `textContent`; it is never parsed as HTML. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Constant work per render: class toggles, one optional icon, and one text update.

## 26. Supported data scale

Not data-driven. Hundreds of badges on a page (for example one per table row) are fine.

## 27. Usage examples

```ts
import { Badge } from '@absoluteui/components/badge';

const host = document.querySelector<HTMLElement>('#status');
if (host) {
  const status = Badge.create(host, { label: 'Active', tone: 'success', dot: true });
  status.update({ label: 'Suspended', tone: 'warning' });
}
```

More examples, type-checked in CI: `metadata/badge/examples.json`.

## 28. Edge cases

- `dot: true` together with an `icon` is rejected; use one decoration.
- `icon: null` removes the icon; the dot shows again only when `dot` is true.
- Safe in renderers that discard nodes without calling `destroy()`, such as Data Table cells: the configuration subscription holds the instance weakly, so a discarded badge is released.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `BADGE_OPTIONS` | configuration | Missing or blank label, unknown tone, non-boolean dot, or dot combined with icon. |
| `ICON_UNKNOWN` | configuration | Unknown icon. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid variant or size, or unknown configuration. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Text only.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Interactive badges (click, remove, select): use Tag Group or Button.
- HTML or `Node` content.

## 32. TypeScript definitions

```ts
type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
type BadgeVariant = 'subtle' | 'outline';
type BadgeSize = 'sm' | 'md';
interface BadgeConfig { variant: BadgeVariant; size: BadgeSize }
interface BadgeOptions extends Partial<BadgeConfig> {
  label: string;
  tone?: BadgeTone;
  icon?: IconRef | null;
  dot?: boolean;
}
```

## 33. Vanilla JS example

```ts
import { Badge } from '@absoluteui/components/badge';
import '@absoluteui/components/badge/style.css';

const host = document.querySelector<HTMLElement>('#plan');
if (host) Badge.create(host, { label: 'Beta', tone: 'info', variant: 'outline', size: 'sm' });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiBadge } from '@absoluteui/angular/badge';

@Component({
  selector: 'app-invoice-status',
  imports: [AuiBadge],
  template: `<aui-badge [label]="overdue ? 'Overdue' : 'Paid'" [tone]="overdue ? 'error' : 'success'" [dot]="true"></aui-badge>`,
})
export class InvoiceStatusComponent {
  overdue = true;
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
