# Stat Card

> Package: `@absoluteui/components/stat-card` | Styles: `@absoluteui/components/stat-card/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

A KPI / metric card. `StatCard` renders a headline value with its label, an optional change against a previous value, a comparison caption, an optional trend Sparkline, and supporting text. The change shows an arrow and a signed amount and is spelled out for assistive technology ("increase of 20%, favorable"; the direction word carries the sign, since 0.9.0), so its meaning never depends on color. `sentiment` decides whether an increase is favorable. The card is a `role="group"` named by its label; with `href` the whole card is one link.

## 2. Anatomy

```text
<div class="aui-stat-card">                                          (consumer host; children replaced)
  <div class="aui-stat-card__body" role="group" aria-labelledby>      (<a class="aui-stat-card__body aui-stat-card__link" href> with href)
    <span class="aui-stat-card__top">[icon.aui-stat-card__icon]<span class="aui-stat-card__label" id>Revenue</span></span>
    <span class="aui-stat-card__value">$48,200</span>
    <span class="aui-stat-card__change">                              (when there is a change)
      <span class="aui-stat-card__delta aui-stat-card__delta--good|--bad|--neutral">
        [arrow.aui-stat-card__arrow]<span aria-hidden="true">+20.2%</span><span class="aui-stat-card__sr">increase of 20.2%, favorable</span>
      </span>
      <span class="aui-stat-card__comparison"> vs last month</span>
    </span>
    <span class="aui-stat-card__trend">(Sparkline)</span>            (trend)
    <span class="aui-stat-card__description">                         (description)
```

## 3. When to use

- Headline dashboard metrics with the change since the previous period.
- KPI tiles that link to a detail page.

## 4. When not to use

- Detailed series or comparisons of many values: use a chart or Data Table.
- Progress toward a goal: use Progress Bar.
- Cards with several controls: use Card.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `delta` | `number \| null` | The change as displayed (ratio for `percent`, units for `absolute`), or `null`. |

Options (`StatCardOptions`):

| Option | Type | Default | Description |
|---|---|---|---|
| `label` | `string` | required | Metric name; names the group and the sparkline. |
| `value` | `number \| string \| null` | required | Number (formatted), preformatted text, or `null` ("No value"). |
| `previous` | `number \| null` | - | Previous value; the change is computed when `value` is a number. |
| `delta` | `number \| null` | - | Explicit change; wins over `previous`. |
| `comparisonLabel` | `string` | - | Caption after the change. |
| `description` | `string` | - | Supporting text. |
| `trend` | `readonly (number \| null)[]` | - | Sparkline values. |
| `trendLabel` | `string` | `label` | Sparkline accessible label. |
| `trendColor` | `SparklineColor` | `1` | Palette slot 1..8. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | Value format. |
| `formatValue` | `(value: number) => string` | - | Custom formatter; wins over `valueFormat`. |
| `icon` | `IconRef` | - | Decorative icon before the label. |
| `href` | `string` | - | Whole card is a link (http(s) or relative). Presence is init-only. |
| `busy` | `boolean` | `false` | "Loading" placeholder; `aria-busy`. |
| `sentiment` | `'higher-is-better' \| 'lower-is-better' \| 'neutral'` | `'higher-is-better'` | Global. |
| `deltaFormat` | `'percent' \| 'absolute'` | `'percent'` | Global. |
| `locale`, `direction` | - | inherited | Formatting and messages; sparkline direction (global, inherited). |

## 6. Methods

| Method | Description |
|---|---|
| `StatCard.create(host, options)` | Render into `host` (children replaced). Throws `STAT_CARD_OPTIONS` before rendering on invalid options. |
| `update(options)` | Merge, validate, re-render. Adding or removing `href` throws. |
| `destroy()` | Destroy the sparkline; remove rendering, host class, and subscription. |

## 7. Events

None. A linked card uses native link navigation.

## 8. Slots/content areas

None. All content comes from options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-stat-card` | Host. |
| `aui-stat-card__body`, `aui-stat-card__link` | Card root; link variant. |
| `aui-stat-card__top`, `__icon`, `__label` | Label row. |
| `aui-stat-card__value` | Headline value. |
| `aui-stat-card__change`, `__delta`, `__delta--good`, `--bad`, `--neutral`, `__arrow`, `__comparison` | Change row. |
| `aui-stat-card__sr` | Visually hidden spelled-out change. |
| `aui-stat-card__trend`, `__description` | Sparkline host; supporting text. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/stat-card/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border`, `radius-lg`, `space-inset`, `font-size-xl`, `color-success-fg`, `color-error-fg`, `color-text-muted`.

## 11. States

default, busy, no value, increase/decrease x favorable/unfavorable, no change or neutral, link hover, link focus-visible.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| busy | `update({ busy: false, value })` | value shown; change computed |
| any | `update({ value, previous })` | re-rendered; change recomputed |
| any | `sentiment` changes (option or global) | favorable/unfavorable wording and color flip |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Card with `href` | One tab stop (the link). |
| Enter | Card link | Follows the link. |
| Tab / Shift+Tab | Card without `href` | Not focusable. |

## 14. ARIA contract

- Without `href`: root `role="group"` with `aria-labelledby` = the label.
- With `href`: a native `<a href>` named by its content.
- The visible signed amount is `aria-hidden`; a visually hidden span reads "{increase | decrease | no change} of {amount}[, favorable | unfavorable]".
- `aria-busy="true"` while busy.

## 15. Accessibility notes

- Meaning never depends on color (WCAG 1.4.1): direction and favorability are text; the arrow shows direction.
- `neutral` sentiment and zero changes omit "favorable"/"unfavorable".
- A linked card's name is its whole text, which can be long; keep descriptions short.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Fills its container (`block-size: 100%`, so it fills a Dashboard Grid cell). Text wraps; numbers use tabular figures. The sparkline spans the card width at 2rem height.

## 17. RTL behavior

Logical properties; the sparkline receives the resolved direction. Intl formats numbers and signs for the locale.

## 18. Theme behavior

Favorable changes use `color-success-fg`, unfavorable `color-error-fg`, neutral `color-text`. Forced colors: `CanvasText` for the border and all change colors.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { statCard: { deltaFormat: 'absolute', sentiment: 'neutral' } } });
```

Global options: `sentiment`, `deltaFormat`, plus inherited `locale` and `direction`. Changes apply to existing cards immediately.

## 20. Component configuration support

Instance options override global and theme defaults. All options are dynamic, except that `href` cannot be added or removed after create.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icon` (any `IconRef`, decorative). The change arrow uses `arrow-up` / `arrow-down`.

## 23. Security behavior

All text uses `textContent`. `href` must pass the URL policy (http, https, or scheme-less relative); `javascript:`, `data:`, and other schemes throw `STAT_CARD_OPTIONS`. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. Formatting happens locally.

## 25. Performance characteristics

Each render rebuilds a few spans and updates the sparkline in place. One configuration subscription per card. Budget: `StatCard.create` < 2 ms in headless Chromium (e2e performance test).

## 26. Supported data scale

Tens of cards per dashboard. Trend arrays follow the Sparkline limits.

## 27. Usage examples

```ts
import { StatCard } from '@absoluteui/components/stat-card';

const host = document.querySelector<HTMLElement>('#revenue');
if (host) StatCard.create(host, { label: 'Revenue', value: 48200, previous: 40100, valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 }, comparisonLabel: 'vs last month' });
```

More examples, type-checked in CI: `metadata/stat-card/examples.json`.

## 28. Edge cases

- `previous: 0` with `percent`: no change is shown (division by zero); pass `delta`.
- A string `value` never computes a change; pass `delta`.
- With `formatValue` and `absolute`, positive changes get a "+" prefix; negative ones rely on `formatValue` for the minus sign.
- `comparisonLabel` shows only when there is a change.
- An empty `trend` removes the sparkline.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `STAT_CARD_OPTIONS` | configuration | Empty label; invalid `value`, non-finite `previous`/`delta`, non-string texts, invalid `trend`, unsafe `href`, non-boolean `busy`, invalid `valueFormat` or `formatValue`; adding/removing `href` in `update()`. |

## 30. Known limitations

- The trend needs the Sparkline stylesheet (`@absoluteui/components/sparkline/style.css`) too.
- `href` presence is fixed at create time.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- HTML in texts.
- Controls inside the card.
- Several values per card.

## 32. TypeScript definitions

```ts
type StatCardSentiment = 'higher-is-better' | 'lower-is-better' | 'neutral';
type StatCardDeltaFormat = 'percent' | 'absolute';
interface StatCardConfig { sentiment: StatCardSentiment; deltaFormat: StatCardDeltaFormat }
```

## 33. Vanilla JS example

```ts
import { StatCard } from '@absoluteui/components/stat-card';
import '@absoluteui/components/stat-card/style.css';
import '@absoluteui/components/sparkline/style.css';

const host = document.querySelector<HTMLElement>('#errors');
if (host) {
  StatCard.create(host, {
    label: 'Error rate',
    value: 0.012,
    valueFormat: { style: 'percent', maximumFractionDigits: 1 },
    previous: 0.015,
    sentiment: 'lower-is-better',
    comparisonLabel: 'vs yesterday',
    trend: [0.02, 0.018, 0.015, 0.012],
    href: '/reports/errors',
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiStatCard } from '@absoluteui/angular/stat-card';

@Component({
  selector: 'app-revenue',
  imports: [AuiStatCard],
  template: `<aui-stat-card label="Revenue" [value]="48200" [previous]="40100" [valueFormat]="currency" comparisonLabel="vs last month"></aui-stat-card>`,
})
export class RevenueComponent {
  readonly currency: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 };
}
```

## 35. React example

```tsx
import { AuiStatCard } from '@absoluteui/react/stat-card';

export function Example({ revenue, previous }: { revenue: number; previous: number }) {
  return (
    <AuiStatCard
      label="Revenue"
      value={revenue}
      previous={previous}
      valueFormat={{ style: 'currency', currency: 'USD', maximumFractionDigits: 0 }}
      comparisonLabel="vs last month"
      trend={[31000, 35500, 38200, previous, revenue]}
    />
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for events, refs, and SSR. Load the stylesheets listed in the header of this document (and the Sparkline stylesheet for `trend`); the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiStatCard } from '@absoluteui/vue/stat-card';
const currency: Intl.NumberFormatOptions = { style: 'currency', currency: 'USD', maximumFractionDigits: 0 };
</script>

<template>
  <AuiStatCard label="Revenue" :value="48200" :previous="40100" :value-format="currency" comparison-label="vs last month" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
