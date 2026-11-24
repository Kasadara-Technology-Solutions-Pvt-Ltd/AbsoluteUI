# Toggle Group

> Package: `@absoluteui/components/toggle-group` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/toggle-group/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

A named group of toggle buttons for one setting with a few choices, such as text alignment, a list or grid view, or text styles. Each item is a native button with `aria-pressed` (Button with `pressed`). Single selection keeps at most one item pressed (and with `required`, exactly one); `multiple` lets several be pressed. One button is in the tab sequence and the arrow keys move between the buttons (roving tabindex).

## 2. Anatomy

```text
<div class="aui-toggle-group [--vertical] [--attached]" role="group" aria-label="Text alignment">
  <button class="aui-toggle-group__item aui-button [aui-button--pressed]" aria-pressed="true|false" tabindex="0|-1">icon label</button>
  ...
</div>
```

## 3. When to use

- Switching a view or a formatting state that applies at once: list or grid, bold and italic, alignment.
- Two to about seven short choices shown side by side.

## 4. When not to use

- A form value submitted with other fields: use Radio Group or Checkbox Group.
- Navigation between panels: use Tabs.
- Commands that run once: use Button or Button Group.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element (`role="group"`). |
| `value` | `readonly string[]` | Pressed values, in item order. |
| `options` | `Readonly<ToggleGroupOptions>` | Current options. |

Options (`ToggleGroupOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the group. |
| `items` | `readonly ToggleGroupItem[]` | - (required) | No | `{ value, label, icon?, iconOnly?, disabled? }`; 1 to 100 items with unique values. |
| `value` | `readonly string[]` | `[]` | No | Pressed values; at most one in single mode. |
| `multiple` | `boolean` | `false` | No | Allow several pressed items. |
| `required` | `boolean` | `false` | No | Single mode: one item stays pressed (the first enabled item when `value` is empty). |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` | No | Layout and arrow-key axis. |
| `attached` | `boolean` | `false` | No | Join the buttons into one segmented control. |
| `disabled` | `boolean` | `false` | No | Disable every button. |
| `size` | `'sm' \| 'md' \| 'lg'` | `'md'` | Yes | Button size. |

## 6. Methods

| Method | Description |
|---|---|
| `ToggleGroup.create(host, options)` | Render into `host` (children are replaced). |
| `setValue(value)` | Set the pressed values (no event). |
| `focus()` | Focus the button in the tab sequence. |
| `update(options)` | Merge and apply options; new `items` re-create the buttons. |
| `destroy()` | Destroy the buttons and remove attributes, classes, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: string[]; changed: string }` | The user changed the pressed items. Programmatic changes do not emit; the buttons' own events do not leave the group. |

## 8. Slots/content areas

None. Items are text with an optional icon.

## 9. CSS parts/hooks

`aui-toggle-group`, `aui-toggle-group--vertical`, `aui-toggle-group--attached`, `aui-toggle-group__item` (with the Button classes, including `aui-button--pressed`). All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/toggle-group/tokens.json` (verified in CI). The buttons use the Button tokens; pressed buttons use `color-selected`, `color-selected-text`, and `color-selected-indicator`.

## 11. States

Single or multiple; required; horizontal or vertical; attached; disabled; item disabled; pressed items.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| single, A pressed | user presses B | B pressed, A released; `aui-change` |
| single, A pressed | user presses A | none pressed (or unchanged when `required`) |
| multiple | user presses an item | it toggles; others unchanged |
| any | `setValue()` / `update({ value })` | the given values, no event |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Group | Moves into the group (to the last focused button) and out of it. |
| ArrowRight / ArrowLeft | Horizontal | Next or previous enabled button, in reading direction; wraps. |
| ArrowDown / ArrowUp | Vertical | Next or previous enabled button; wraps. |
| Home / End | Group | First or last enabled button. |
| Enter / Space | Item | Toggle the button. |

## 14. ARIA contract

- Host: `role="group"`, `aria-label` from `label`; `aria-orientation="vertical"` when vertical.
- Items: native buttons with `aria-pressed`; icon-only items are named by their label (`aria-label`).
- One item has `tabindex="0"`, the others `-1`.

## 15. Accessibility notes

- Keep item labels the same whether pressed or not; `aria-pressed` announces the state.
- The pressed state differs in more than hue: a selection fill and a stronger boundary.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

Buttons wrap unless `attached`; `vertical` stacks them.

## 17. RTL behavior

Arrow keys follow the reading direction; attached radii use logical properties.

## 18. Theme behavior

Button tokens apply; pressed colors come from the selection tokens (contrast gate pairs). Forced colors draw pressed buttons in `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { toggleGroup: { size: 'sm' } } });
```

## 20. Component configuration support

The instance `size` overrides configuration; configuration changes re-render existing groups.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

Per item `icon`; with `iconOnly`, the label becomes the accessible name.

## 23. Security behavior

Labels are rendered as text, never parsed as HTML.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Pressing updates the state of each button in place; only new `items` re-create buttons.

## 26. Supported data scale

Up to 100 items; intended for a handful.

## 27. Usage examples

```ts
import { ToggleGroup, type ToggleGroupChangeDetail } from '@absoluteui/components/toggle-group';

const host = document.querySelector<HTMLElement>('#view');
if (host) {
  ToggleGroup.create(host, { label: 'View', required: true, attached: true, value: ['list'], items: [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }] });
  host.addEventListener('aui-change', (event) => {
    const [view] = (event as CustomEvent<ToggleGroupChangeDetail>).detail.value;
    document.body.dataset.view = view ?? 'list';
  });
}
```

More examples, type-checked in CI: `metadata/toggle-group/examples.json`.

## 28. Edge cases

- `required` with an empty `value` presses the first enabled item.
- A disabled item keeps its pressed state; the arrow keys skip it.
- Values not among the items are rejected.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TOGGLE_GROUP_OPTIONS` | configuration | Blank label, no items or more than 100, duplicate or blank values, a blank item label, unknown values, or several values in single mode. |
| `ICON_UNKNOWN` | configuration | Unknown item icon. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid size or unknown configuration. |

Invalid options throw before the host is modified.

## 30. Known limitations

- Not a form control: the value is not submitted with a form.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Menus or popups inside the group.
- Rich content in items.

## 32. TypeScript definitions

```ts
interface ToggleGroupConfig { size: 'sm' | 'md' | 'lg' }
interface ToggleGroupItem { value: string; label: string; icon?: IconRef | null; iconOnly?: boolean; disabled?: boolean }
interface ToggleGroupOptions extends Partial<ToggleGroupConfig> {
  label: string;
  items: readonly ToggleGroupItem[];
  value?: readonly string[];
  multiple?: boolean;
  required?: boolean;
  orientation?: 'horizontal' | 'vertical';
  attached?: boolean;
  disabled?: boolean;
}
interface ToggleGroupChangeDetail { value: string[]; changed: string }
```

## 33. Vanilla JS example

```ts
import { ToggleGroup } from '@absoluteui/components/toggle-group';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/toggle-group/style.css';

const host = document.querySelector<HTMLElement>('#density');
if (host) ToggleGroup.create(host, { label: 'Density', required: true, value: ['comfortable'], items: [{ value: 'compact', label: 'Compact' }, { value: 'comfortable', label: 'Comfortable' }] });
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { ToggleGroupItem } from '@absoluteui/components/toggle-group';
import { AuiToggleGroup } from '@absoluteui/angular/toggle-group';

@Component({
  selector: 'app-view-switch',
  imports: [AuiToggleGroup],
  template: `<aui-toggle-group label="View" [items]="views" [required]="true" [attached]="true" [(value)]="view"></aui-toggle-group>`,
})
export class ViewSwitchComponent {
  view: string[] = ['list'];
  readonly views: ToggleGroupItem[] = [{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }];
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { AuiToggleGroup } from '@absoluteui/react/toggle-group';

export function Example() {
  const [view, setView] = useState<string[]>(['list']);
  return <AuiToggleGroup label="View" required items={[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]} value={view} onValueChange={setView} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiToggleGroup } from '@absoluteui/vue/toggle-group';

const view = ref<string[]>(['list']);
</script>

<template>
  <AuiToggleGroup v-model="view" label="View" required :items="[{ value: 'list', label: 'List' }, { value: 'grid', label: 'Grid' }]" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
