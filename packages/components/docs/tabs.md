# Tabs

> Package: `@absoluteui/components/tabs` | Styles: `@absoluteui/components/tabs/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Switch between peer views of related content. `Tabs` implements the WAI-ARIA APG Tabs pattern: a labelled tablist of native buttons with a roving tabindex, and one tabpanel per tab. Activation is automatic (select on focus) or manual (Enter/Space), orientation is horizontal or vertical, arrow keys are mirrored in RTL, and a horizontal tablist that overflows scrolls with the selected tab kept in view.

## 2. Anatomy

```text
<div class="aui-tabs aui-tabs--horizontal">                     (consumer host)
  <div class="aui-tabs__list" role="tablist" aria-label aria-orientation>
    <button class="aui-tabs__tab" role="tab" id aria-selected aria-controls tabindex>
      <svg class="aui-icon" aria-hidden="true">                  (optional)
      <span class="aui-tabs__label">Label</span>
    </button>
    ...
  </div>
  <div class="aui-tabs__panels">
    <div class="aui-tabs__panel" role="tabpanel" id aria-labelledby tabindex="0">   (selected)
    <div class="aui-tabs__panel" role="tabpanel" hidden>                            (inactive)
  </div>
</div>
```

## 3. When to use

- Switching between peer views of related content in the same context, such as Overview, Activity, and Settings.
- Reducing page length when users need only one section at a time.

## 4. When not to use

- Sequential steps: use a stepper or wizard.
- Navigating between pages or routes: use links (navigation bar, breadcrumb).
- Content users need to compare side by side.
- Many sections read in order: use headings or an accordion.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `tablist` | `HTMLDivElement` | The `role="tablist"` element. |
| `value` | `string` | Selected tab id. |
| `options` | `Readonly<TabsOptions>` | Current options. |

Options: `label` (required), `tabs` (required; `{ id, label, icon?, disabled?, content? }[]` with unique ids), and `value` (default: the first enabled tab). Full table: `metadata/tabs/api.json`.

| Global option | Type | Default |
|---|---|---|
| `activation` | `'automatic' \| 'manual'` | `'automatic'` |
| `orientation` | `'horizontal' \| 'vertical'` | `'horizontal'` |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` |

## 6. Methods

| Method | Description |
|---|---|
| `Tabs.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `panel(id)` | The tabpanel element for a tab id (for consumers to fill), or `null`. |
| `select(id)` | Programmatic selection; no events. Throws `TABS_OPTIONS` for unknown ids. |
| `update(options)` | Merge and apply options. Panels are kept by tab id, so consumer-filled content survives. |
| `destroy()` | Remove rendering, listeners, the panel observer, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, previous }` | Yes | The user selected a different tab (click, arrow key in automatic mode, or Enter/Space in manual mode). |

Programmatic changes (`select`, `update`) emit no events.

## 8. Slots/content areas

One panel per tab. Fill it with the tab's `content` option (a `Node`, or a string rendered as text) or through `tabs.panel(id)`. Content applied through `content` is re-applied only when the `content` value changes, so content added through `panel(id)` is preserved across `update()`.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-tabs` | Host. |
| `aui-tabs--horizontal`, `--vertical` | Orientation modifiers. |
| `aui-tabs__list` | The tablist; scrolls horizontally on overflow. |
| `aui-tabs__tab` | A tab button; state via `[aria-selected]` and `:disabled`. |
| `aui-tabs__label` | Tab label text. |
| `aui-tabs__panels` | Panel container. |
| `aui-tabs__panel` | A tabpanel. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/tabs/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-primary` (indicator), `color-text`, `color-text-muted`, `color-hover`, `color-border`, `color-focus-ring`, `border-width-strong`, `font-weight-semibold`, `touch-target-min`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-tabs-tab-padding-x` (tab inline padding; falls back to `space-4`), `--aui-tabs-tab-fg` (unselected tab label; falls back to `color-text-muted`), `--aui-tabs-tab-selected-fg` (selected tab label; falls back to `color-text`), `--aui-tabs-indicator-color` (selected tab indicator; falls back to `color-primary`), `--aui-tabs-indicator-width` (selected tab indicator thickness; falls back to `border-width-strong`).

## 11. States

default, hover, focus-visible, selected, disabled, overflowing (scrollable tablist).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| tab A selected | click tab B, or arrow to B (automatic) | B selected; `aui-change` |
| tab A selected | arrow to B (manual) | A still selected; B focused with the tab stop |
| B focused (manual) | Enter / Space | B selected; `aui-change` |
| B focused (manual) | focus leaves the tablist | tab stop returns to the selected tab |
| any | `select(id)` / `update({ value })` | selection changes; no event |
| selected tab removed by `update({ tabs })` | re-render | first enabled tab selected; no event |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Focus before the tablist | Focuses the selected tab (single tab stop). |
| Tab | Tab focused | Moves into the active panel, or its first focusable element. |
| ArrowRight / ArrowLeft | Horizontal | Next / previous enabled tab, wrapping. Mirrored in RTL. Automatic mode selects it. |
| ArrowDown / ArrowUp | Vertical | Next / previous enabled tab, wrapping. Automatic mode selects it. |
| Home / End | Tab focused | First / last enabled tab. Automatic mode selects it. |
| Enter / Space | Tab focused, manual | Selects the focused tab. |

Disabled tabs (native `disabled`) are skipped by arrow keys and cannot be clicked.

## 14. ARIA contract

- `role="tablist"` with `aria-label` (the `label` option) and `aria-orientation`.
- Each tab: `role="tab"`, `aria-selected`, `aria-controls` referencing its panel.
- Each panel: `role="tabpanel"`, `aria-labelledby` referencing its tab; `tabindex="0"` only when it contains no focusable element (tracked with a MutationObserver as content changes). Inactive panels are `hidden`.

## 15. Accessibility notes

- Selection is shown by an indicator bar and semibold weight, not by color alone (WCAG 1.4.1).
- Re-rendering never re-inserts a focused tab, so focus is not lost during automatic activation.
- Icons are decorative; the label text is the accessible name.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The horizontal tablist never wraps. It scrolls horizontally (`overflow-x: auto`, thin scrollbar), and after every selection the tablist, never the page, is scrolled so the selected tab is fully visible. Tabs keep the minimum touch-target height.

## 17. RTL behavior

Logical properties throughout. ArrowLeft/ArrowRight are mirrored when `direction` is `'rtl'` or when the host inherits `dir="rtl"`. The vertical indicator is on the inline-start edge.

## 18. Theme behavior

Colors come from role tokens only. Verified in the light, dark, and high-contrast themes. In forced-colors mode the selected indicator uses `Highlight` and disabled tabs use `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { tabs: { activation: 'manual' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

Each tab accepts an optional decorative `icon` (`IconRef`). There are no built-in icon slots.

## 23. Security behavior

Labels and string content use `textContent`; HTML strings are never parsed. `Node` content is inserted as provided, so the consumer owns its safety. CSP-safe: no inline styles or handlers.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Three listeners on the tablist (click, keydown, focusout), one MutationObserver on the panel container, and one configuration subscription per instance. Re-renders reuse tab and panel elements by id. Budget: under 2 ms for `Tabs.create` with 20 tabs.

## 26. Supported data scale

Tested with 20 tabs in an overflowing tablist. Beyond about 10 tabs, consider a different navigation pattern.

## 27. Usage examples

```ts
import { Tabs } from '@absoluteui/components/tabs';

const host = document.createElement('div');
document.body.append(host);
Tabs.create(host, {
  label: 'Account',
  tabs: [
    { id: 'overview', label: 'Overview', content: 'Plan, usage, and contacts.' },
    { id: 'billing', label: 'Billing', content: 'Invoices and payment methods.' },
  ],
});
```

More examples, type-checked in CI: `metadata/tabs/examples.json`.

## 28. Edge cases

- If every tab is disabled, the first tab is selected and the tablist has no tab stop.
- A selected tab that becomes disabled stays selected; the tab stop moves to the first enabled tab.
- Removing the selected tab through `update({ tabs })` selects the first enabled tab without an event.
- Consumer ids can be any non-empty string; DOM ids are generated separately.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TABS_OPTIONS` | configuration | Missing label, empty `tabs`, duplicate or empty ids, empty tab labels, or a `value`/`select(id)` that is not a tab id. |
| `CFG_INVALID_VALUE` | configuration | Invalid `activation`, `orientation`, or `direction`. |

A failed construction leaves no rendering, listeners, or subscriptions behind. A failed `update()` keeps the previous state.

## 30. Known limitations

- Panels are always in the DOM; lazy loading is the consumer's job (for example on `aui-change`).
- No closable, reorderable, or user-added tabs.
- No scroll buttons for an overflowing tablist.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML strings as labels or content.
- Tabs that navigate to separate URLs.

## 32. TypeScript definitions

```ts
type TabsActivation = 'automatic' | 'manual';
type TabsOrientation = 'horizontal' | 'vertical';
interface TabItem { id: string; label: string; icon?: IconRef; disabled?: boolean; content?: Node | string }
interface TabsChangeDetail { value: string; previous: string }
```

## 33. Vanilla JS example

```ts
import { Tabs, type TabsChangeDetail } from '@absoluteui/components/tabs';
import '@absoluteui/components/tabs/style.css';

const host = document.querySelector<HTMLElement>('#report-tabs');
if (host) {
  const tabs = Tabs.create(host, { label: 'Reports', tabs: [{ id: 'daily', label: 'Daily' }, { id: 'weekly', label: 'Weekly' }] });
  host.addEventListener('aui-change', (event) => {
    const panel = tabs.panel((event as CustomEvent<TabsChangeDetail>).detail.value);
    if (panel && panel.childElementCount === 0) panel.append(document.createElement('table'));
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiTabs } from '@absoluteui/angular/tabs';

@Component({
  selector: 'app-account',
  imports: [AuiTabs],
  template: `<aui-tabs label="Account" [tabs]="tabs" [value]="selected" (changed)="selected = $event.value"></aui-tabs>`,
})
export class AccountComponent {
  readonly tabs = [
    { id: 'overview', label: 'Overview', content: 'Plan, usage, and contacts.' },
    { id: 'billing', label: 'Billing', content: 'Invoices and payment methods.' },
  ];
  selected = 'overview';
}
```

## 35. React example

```tsx
import { AuiTabs } from '@absoluteui/react/tabs';

const tabs = [{ id: 'profile', label: 'Profile', content: 'Profile settings' }, { id: 'billing', label: 'Billing', content: 'Billing settings' }];

export function Example() {
  return <AuiTabs label="Account" tabs={tabs} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiTabs } from '@absoluteui/vue/tabs';
const tabs = [{ id: 'profile', label: 'Profile', content: 'Profile settings' }, { id: 'billing', label: 'Billing', content: 'Billing settings' }];
</script>

<template>
  <AuiTabs label="Account" :tabs="tabs" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
