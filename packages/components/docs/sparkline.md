# Sparkline

> Package: `@absoluteui/components/sparkline` | Styles: `@absoluteui/components/sparkline/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

A word-sized trend graphic (line or bars) for text, table cells, and KPI tiles. It is a static image (`role="img"`) whose generated accessible name summarizes the data: label, value count, first and last value, minimum, and maximum. It is not focusable and has no tooltip; creating one needs no layout reads, so hundreds per page are cheap. It does not use the chart frame, so importing it does not pull in Line, Bar, or Pie chart code.

## 2. Anatomy

```text
<span class="aui-sparkline aui-sparkline--line aui-sparkline--c1">
  <svg class="aui-sparkline__svg" role="img" aria-label="Weekly sign-ups: 12 values, from 120 to 230, minimum 120, maximum 230." viewBox="0 0 100 24" preserveAspectRatio="none">
    <path class="aui-sparkline__line"/>  <path class="aui-sparkline__last"/>          (line)
    <rect class="aui-sparkline__bar [aui-sparkline__bar--last]"/> <path class="aui-sparkline__baseline"/>   (bar)
  </svg>
</span>
```

## 3. When to use

- Showing the shape of a trend next to a number (KPI tiles, table cells, sentences).
- Many small trends on one page.

## 4. When not to use

- When users need individual values: use Line Chart or Bar Chart (tooltips, keyboard, data table).
- As the only source of important information.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The `svg[role="img"]`. |
| `summary` | `string` | The accessible name. |

Options (`SparklineOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | What the values are; starts the accessible name. |
| `values` | `(number \| null)[]` | - (required) | No | Values in order; `null`/`NaN` are gaps. |
| `variant` | `'line' \| 'bar'` | `'line'` | No | Line or bars. |
| `color` | `1`-`8` | `1` | No | Palette slot (`color-chart-<n>`). |
| `min` / `max` | `number` | data extent | No | Fixed domain (for comparable sparklines). |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Number format of the accessible name. |
| `formatValue` | `(value) => string` | - | No | Custom value text. |
| `valueText` | `string` | generated | No | Replaces the accessible name. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. The sparkline uses `palette`, `lineWidth`, `axisColor` (bar baseline), and `animation`. |
| `highlightLast` | `boolean` | `true` | Yes | Mark the last value. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | `rtl` puts the first value at the right. |

## 6. Methods

| Method | Description |
|---|---|
| `Sparkline.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render. |
| `destroy()` | Remove rendering, classes, and the configuration subscription. |

## 7. Events

None.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-sparkline`, `--line`, `--bar`, `--c1..8`, `__svg`, `__line`, `__dot`, `__last`, `__bar`, `__bar--last`, `__baseline`. The color is `--aui-sparkline-color`. Size the host with `inline-size` / `block-size` (default 6em x 1.5em). All rules are in the `aui.components` layer. With `theme.animation`, the host also has `aui-chart--animate`.

## 10. Design tokens

See `metadata/sparkline/tokens.json`: `color-chart-1..8`, `color-chart-axis`.

Chart look-and-feel hooks used by the sparkline: `--aui-chart-1` ... `--aui-chart-8` (component tokens, default `color-chart-1` ... `color-chart-8`), `--aui-chart-axis-color` (bar baseline, default `color-chart-axis`), `--aui-sparkline-line-width` (default 1.5px; `theme.lineWidth` sets it), and `--aui-chart-animation-duration` (default 400ms, with `theme.animation`). The `theme` option writes them on the host. The full list is in the Charts guide.

Corner rounding: `theme.cornerRadius` (`--aui-chart-corner-radius`, px 0-50) sets every cornered element; the element radii below win over it; unset keeps the look shown. Values are clamped to half the element's width or height and written as SVG geometry, so SVG and PNG exports keep them; stylesheet values apply when the chart next renders.

- Bars: `barRadius` (`--aui-chart-bar-radius`, default 0) at the value end, in viewBox units (the sparkline stretches to its box). The line: `lineJoin` (`--aui-chart-line-join`, default `round`).

## 11. States

line, bar, empty ("{label}: no data."), single value ("{label}: {value}.").

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ values })` | re-rendered, new accessible name |
| line | `update({ variant: 'bar' })` | bars |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable; no keyboard interaction. |

## 14. ARIA contract

- `svg` is `role="img"` with `aria-label` = generated summary or `valueText`.
- No other ARIA; children are presentational.

## 15. Accessibility notes

- Keep the key value in visible text next to the sparkline; individual values are not exposed.
- Meaning is carried by the accessible name and surrounding text, not by color.
- Forced colors draw it in `CanvasText`. No animation.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Scales with its box through the viewBox (`preserveAspectRatio="none"`, non-scaling strokes). The default size is in `em`, so it follows the text size.

## 17. RTL behavior

`direction: 'rtl'` puts the first value at the right.

## 18. Theme behavior

Stroke and bars use `color-chart-<color>` (3:1 against surfaces in all themes); the zero baseline uses `color-chart-axis`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { sparkline: { highlightLast: false } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

The accessible name is an attribute value; SVG is built with `createElementNS`. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: under 1 ms per instance (30 values; e2e performance test, average of 200). No layout reads and no resize observer.

## 26. Supported data scale

One to a few hundred values each; bars create one `rect` per value.

## 27. Usage examples

```ts
import { Sparkline } from '@absoluteui/components/sparkline';

const host = document.createElement('span');
document.body.append(host);
Sparkline.create(host, { label: 'Weekly sign-ups', values: [120, 132, 150, 170] });
```

More examples, type-checked in CI: `metadata/sparkline/examples.json`.

## 28. Edge cases

- Gaps split the line; isolated values are drawn as dots.
- All values equal: a flat line mid-height.
- Bars always include zero; negative bars hang below a baseline.
- Values outside a fixed `min`/`max` are clamped.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SPARKLINE_OPTIONS` | configuration | Missing label, non-numeric values, invalid variant or color, `max <= min`, invalid formatters. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Not interactive; minimum and maximum are not marked visually.
- Manual screen-reader verification is pending.
- `theme` applies only the properties listed in section 5; tooltips, legends, annotations, point events, and synchronized crosshairs do not apply (static images).

## 31. Unsupported scenarios

- Axes, labels, legends, tooltips.
- Win/loss and bullet variants.

## 32. TypeScript definitions

```ts
interface SparklineConfig { highlightLast: boolean }
interface SparklineOptions extends Partial<SparklineConfig> {
  label: string;
  values: readonly (number | null)[];
  variant?: 'line' | 'bar';
  color?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
  min?: number;
  max?: number;
  valueFormat?: Intl.NumberFormatOptions;
  formatValue?: (value: number) => string;
  valueText?: string;
  locale?: string;
  direction?: 'ltr' | 'rtl';
}
```

## 33. Vanilla JS example

```ts
import { Sparkline } from '@absoluteui/components/sparkline';
import '@absoluteui/components/sparkline/style.css';

for (const cell of document.querySelectorAll<HTMLElement>('[data-trend]')) {
  const values = (cell.dataset.trend ?? '').split(',').map(Number);
  Sparkline.create(cell, { label: cell.dataset.label ?? 'Trend', values, variant: 'bar' });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiSparkline } from '@absoluteui/angular/sparkline';

@Component({
  selector: 'app-kpi',
  imports: [AuiSparkline],
  template: `<p>Sign-ups 230 <aui-sparkline label="Weekly sign-ups" [values]="trend"></aui-sparkline></p>`,
})
export class KpiComponent {
  readonly trend = [120, 132, 150, 170, 230];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
