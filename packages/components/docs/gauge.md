# Gauge

> Package: `@absoluteui/components/gauge` | Styles: `@absoluteui/components/gauge/style.css` | Since 0.4.0 | Status: R3

## 1. Purpose

A radial gauge for one value within a known range, drawn on a 240 deg arc: a track, the value arc, optional qualitative bands (for example poor / fair / good) outside the track, an optional target marker, and the formatted value in the center with the current band's name under it. The SVG is `role="meter"` with `aria-valuenow`, `aria-valuemin`, `aria-valuemax`, and a value text that names the band and the target, so the meaning never depends on color. It is a static reading: not focusable, no tooltip. Like Sparkline it does not use the chart frame, so it stays small. No animation.

## 2. Anatomy

```text
<div class="aui-gauge aui-gauge--c2">
  <div class="aui-gauge__title" id="T">CPU</div>
  <svg class="aui-gauge__svg" role="meter" aria-labelledby="T" aria-valuemin="0" aria-valuemax="100" aria-valuenow="72"
       aria-valuetext="72% (0% to 100%), Busy, target 60%" viewBox="0 0 200 150">
    <path class="aui-gauge__track" aria-hidden="true"/>
    <path class="aui-gauge__band aui-gauge__band--c1" aria-hidden="true"/>...
    <path class="aui-gauge__value" aria-hidden="true"/>
    <path class="aui-gauge__target" aria-hidden="true"/>
    <text class="aui-gauge__reading" aria-hidden="true">72%</text>
    <text class="aui-gauge__band-label" aria-hidden="true">Busy</text>
    <text class="aui-gauge__range" aria-hidden="true">0%</text> <text class="aui-gauge__range" aria-hidden="true">100%</text>
  </svg>
  <p class="aui-gauge__description" hidden></p>
</div>
```

## 3. When to use

- One key value against a known range (utilization, score, completion) on dashboards and cards.
- When qualitative bands or a target give the value its meaning.

## 4. When not to use

- Comparing several values: use Bar Chart or Bullet Chart (lengths compare better than angles).
- Progress of a task: use Progress Bar.
- Values without a meaningful range.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `element` | `SVGSVGElement` | The `svg[role="meter"]`. |
| `valueText` | `string` | The accessible value text (`aria-valuetext`). |

Options (`GaugeOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | What is measured; title and accessible name. |
| `value` | `number \| null` | - (required) | No | Current value; `null` shows "-" and "No value". |
| `min` / `max` | `number` | `0` / `100` | No | Range; `max` must be greater than `min`. |
| `bands` | `GaugeBand[]` | - | No | `{ to, label, color? }` in ascending `to` order; the first band starts at `min`. |
| `target` | `number` | - | No | Target marker; named in the value text. |
| `color` | `1`-`8` | current band's color, else `1` | No | Palette slot of the value arc. |
| `hideLabel` | `boolean` | `false` | No | Visually hide the title (it stays the accessible name). |
| `description` | `string` | - | No | Visible text below the gauge. |
| `valueFormat` | `Intl.NumberFormatOptions` | - | No | Number format for all printed values and the value text. |
| `formatValue` | `(value) => string` | - | No | Custom value text. |
| `valueText` | `string` | generated | No | Replaces `aria-valuetext`. |
| `theme` | `ChartTheme` | - | No | Look and feel: `palette`, `fontFamily`, `fontSize`, `textColor`, `gridLines`, `gridColor`, `gridDash`, `axisColor`, `lineWidth`, `markerSize`, `cornerRadius`, `barRadius`, `cellRadius`, `sliceRadius`, `boxRadius`, `swatchRadius`, `tooltipRadius`, `controlRadius`, `lineJoin`, `areaOpacity`, `gradient`, `valueLabelColor`, `tooltip`, `legendPosition`, `animation` (opt-in). Written as `--aui-chart-*` custom properties and classes on the host (CSSOM); every value is validated. The gauge uses `palette`, `gridColor` (track), `fontFamily`, `textColor` (range and band labels), and `animation`. |
| `showRange` | `boolean` | `true` | Yes | Print min and max under the arc ends. |
| `locale` | `string` | common `locale` | Yes (inherited) | Number and message locale. |
| `direction` | `'ltr' \| 'rtl'` | common `direction` | Yes (inherited) | Accepted; the gauge is not mirrored. |

## 6. Methods

| Method | Description |
|---|---|
| `Gauge.create(host, options)` | Render into `host` (children are replaced). |
| `update(options)` | Merge, validate, re-render. |
| `destroy()` | Remove rendering, classes, and the configuration subscription. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) also accepts a Gauge.

## 7. Events

None.

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-gauge`, `--c1..8` (sets `--aui-gauge-color`), `__title`, `__title--hidden`, `__description`, `__svg`, `__track`, `__value`, `__band`, `__band--c1..8`, `__target`, `__reading`, `__band-label`, `__range`. Size the host with `inline-size` (default 12rem, max 100%). All rules are in the `aui.components` layer. With `theme.animation`, the host also has `aui-chart--animate`.

## 10. Design tokens

See `metadata/gauge/tokens.json` (verified against the stylesheet in CI): `color-chart-1..8`, `color-chart-grid` (track), `color-text`, `color-text-muted`, typography and `space-1`.

Chart look-and-feel hooks used by the gauge: `--aui-chart-1` ... `--aui-chart-8` (component tokens, default `color-chart-1` ... `color-chart-8`), `--aui-chart-grid-color` (track), `--aui-chart-font-family`, `--aui-chart-text-color` (range and band labels), and `--aui-chart-animation-duration` (with `theme.animation`). The `theme` option writes them on the host. The full list is in the Charts guide.

Corner rounding: `theme.cornerRadius` (`--aui-chart-corner-radius`, px 0-50) sets every cornered element; the element radii below win over it; unset keeps the look shown. Values are clamped to half the element's width or height and written as SVG geometry, so SVG and PNG exports keep them; stylesheet values apply when the chart next renders.

- Arcs: `sliceRadius` (`--aui-chart-slice-radius`, default 0). With a radius, the track, value, and band arcs are drawn as filled ring sectors with rounded corners (`.aui-gauge__arc--filled`); without, as stroked arcs. The target tick keeps its round cap.

## 11. States

default, with bands (current band named), with target, no value (`null`: "-", "No value", no `aria-valuenow`), value out of range (clamped on the arc and in `aria-valuenow`).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | `update({ value })` | re-rendered; new `aria-valuenow` and value text |
| value | `update({ value: null })` | no value |
| any | configuration change (`showRange`, `locale`) | re-rendered |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| - | Any | Not focusable; no keyboard interaction. Screen readers reach the meter in browse mode. |

## 14. ARIA contract

- `svg` is `role="meter"`, `aria-labelledby` -> title.
- `aria-valuemin` / `aria-valuemax` = `min` / `max`; `aria-valuenow` = the value clamped to the range, removed for `null`.
- `aria-valuetext` = "{value} ({min} to {max})", then ", {band}" and ", target {target}" when present, for example "72% (0% to 100%), Busy, target 60%"; `null` reads "No value" (plus the target); `valueText` replaces it.
- All SVG children are `aria-hidden`; the description is not referenced by `aria-describedby`.

## 15. Accessibility notes

- Meaning never depends on color: the reading is printed, the band name is printed and in the value text, and the target is named in the value text.
- Not focusable by design (a static reading, like Progress Bar); put interactive detail elsewhere.
- The value arc meets 3:1 against surfaces; the track only frames it.
- Forced colors: value arc `Highlight`, track `GrayText`, bands, target, and text `CanvasText`.
- `role="meter"` is ARIA 1.2; support varies. No animation. Manual screen-reader verification is pending.

## 16. Responsive behavior

Scales with its inline size through the viewBox (200 x 150 units); text scales with it.

## 17. RTL behavior

Not mirrored: min is always at the lower left and the arc runs clockwise to max at the lower right. `direction` is accepted for configuration consistency. Title and description follow the document direction.

## 18. Theme behavior

Value arc `color-chart-<slot>`; bands `color-chart-<n>`; track `color-chart-grid`; target and reading `color-text`; band name and range `color-text-muted`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { gauge: { showRange: false } } });
```

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

Text uses `textContent` and attribute values; SVG uses `createElementNS`; colors are classes. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: `Gauge.create` < 2 ms per instance in headless Chromium (e2e performance test). No layout reads and no resize observer.

## 26. Supported data scale

One value per instance; dozens of instances per page.

## 27. Usage examples

```ts
import { Gauge } from '@absoluteui/components/gauge';

const host = document.createElement('div');
document.body.append(host);
Gauge.create(host, {
  label: 'CPU',
  value: 72,
  bands: [{ to: 50, label: 'Low' }, { to: 80, label: 'Busy' }, { to: 100, label: 'Critical' }],
  target: 60,
  valueFormat: { style: 'unit', unit: 'percent' },
});
```

More examples, type-checked in CI: `metadata/gauge/examples.json`.

## 28. Edge cases

- `null` or non-finite values: "-" in the center, "No value", no value arc, no band.
- Values below `min` or above `max`: clamped on the arc and in `aria-valuenow`; the reading and value text keep the real value; the first / last band applies.
- A value equal to `min` draws no value arc.
- Bands need not reach `max`; values above the last band's `to` (but within the range) name no band.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `GAUGE_OPTIONS` | configuration | Missing label; value not a number or null; non-finite `min`; `max <= min`; bands without labels or not in ascending `to` order above `min`; invalid colors, target, text options, or formatters. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

A failed construction leaves the host untouched.

## 30. Known limitations

- Fixed 240 deg arc; no needle or intermediate ticks.
- Not interactive; not mirrored in RTL.
- Manual screen-reader verification is pending.
- `theme` applies only the properties listed in section 5; tooltips, legends, annotations, point events, and synchronized crosshairs do not apply (static images).

## 31. Unsupported scenarios

- Several values or needles; semicircle, full-circle, or linear variants.
- Editing the value.

## 32. TypeScript definitions

```ts
type GaugeColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
interface GaugeConfig { showRange: boolean }
interface GaugeBand { to: number; label: string; color?: GaugeColor }
interface GaugeOptions extends Partial<GaugeConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  value: number | null;
  min?: number;
  max?: number;
  bands?: readonly GaugeBand[];
  target?: number;
  color?: GaugeColor;
  valueFormat?: Intl.NumberFormatOptions;
  formatValue?: (value: number) => string;
  valueText?: string;
  locale?: string;
  direction?: 'ltr' | 'rtl';
}
```

## 33. Vanilla JS example

```ts
import { Gauge } from '@absoluteui/components/gauge';
import '@absoluteui/components/gauge/style.css';

const host = document.querySelector<HTMLElement>('#score');
if (host) {
  const gauge = Gauge.create(host, { label: 'Quality score', value: null, bands: [{ to: 40, label: 'Poor' }, { to: 70, label: 'Fair' }, { to: 100, label: 'Good' }] });
  gauge.update({ value: 64 });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { AuiGauge } from '@absoluteui/angular/gauge';
import type { GaugeBand } from '@absoluteui/components/gauge';

@Component({
  selector: 'app-cpu',
  imports: [AuiGauge],
  template: `<aui-gauge label="CPU load" [value]="load" [bands]="bands" [target]="60"></aui-gauge>`,
})
export class CpuComponent {
  readonly load = 72;
  readonly bands: GaugeBand[] = [{ to: 50, label: 'Normal' }, { to: 80, label: 'Busy' }, { to: 100, label: 'Critical' }];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
