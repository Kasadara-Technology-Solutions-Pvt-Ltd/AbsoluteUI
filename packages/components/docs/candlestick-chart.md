# Candlestick Chart

> Package: `@absoluteui/components/candlestick-chart` | Styles: `@absoluteui/components/candlestick-chart/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Accessible SVG candlestick chart: daily open-high-low-close prices as candles (rising hollow, falling filled, so direction never depends on color alone) or OHLC bars, an optional volume pane, and simple moving-average overlays. The time axis is a day axis; with a business calendar it counts trading days only, skipping weekends and holidays. Crosshair, zoom and pan, keyboard navigation along the sessions, tooltips, a generated summary, and the data table are built in.

## 2. Anatomy

```text
<div class="aui-chart aui-candlestick-chart [aui-chart--zoomable aui-chart--zoomed]">
  <div class="aui-chart__header">title, description, <div class="aui-chart__toolbar">zoom buttons</div></div>
  <ul class="aui-chart__legend">moving-average toggle buttons</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="candlestick chart" aria-labelledby="T" aria-describedby="S">
      <g class="aui-chart__grid" aria-hidden="true"/> <g class="aui-chart__axis" aria-hidden="true"/>
      <g class="aui-candlestick-chart__volume" aria-hidden="true">bars</g>
      <g class="aui-candlestick-chart__candles"><path class="aui-candlestick-chart__candle aui-candlestick-chart__candle--up aui-chart__mark" role="img" aria-label="Mar 2, 2026: open 100, ..." tabindex="0"/>...</g>
      <g class="aui-candlestick-chart__averages" aria-hidden="true">lines</g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Daily price movements of a security, commodity, or index, with the range of each session visible.
- Comparing closes against moving averages and volume.

## 4. When not to use

- Intraday (sub-daily) data: dates are PlainDate values, one session per day.
- A single value per day: use Line Chart.
- Many securities at once: use Line Chart with one series each.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The host element. |
| `element` | `SVGSVGElement` | The plot (svg role="group"), named by the title and described by the summary. |
| `summary` | `string` | The generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Ids of hidden items (legend toggles). |
| `zoomRange` | `ChartZoomRange \| null` | Visible axis range, or null. |

Options (`CandlestickChartOptions`):

| Option | Type | Default | Global | Description |
|---|---|---|---|---|
| `label` | `string` | required |  | Chart title: visible text and the accessible name of the plot (aria-labelledby); also the data table caption. |
| `hideLabel` | `boolean` | `false` |  | Visually hide the title; it stays the accessible name. |
| `description` | `string` |  |  | Visible description below the title, also referenced by aria-describedby (text only). |
| `summary` | `string` |  |  | Replaces the generated accessible summary (session count, date range, first and last close with the change, highest high and lowest low, sessions not plotted). |
| `valueFormat` | `Intl.NumberFormatOptions` |  |  | Number format for prices (tooltips, accessible names, table, summary, ticks). |
| `formatValue` | `(value: number) => string` |  |  | Custom value text; overrides valueFormat everywhere. |
| `hiddenSeries` | `readonly string[]` |  |  | Ids of hidden moving averages (legend toggles). |
| `theme` | `ChartTheme` |  |  | Look and feel: { palette?: string[] (1-8 CSS colors for slots 1-8); fontFamily?; fontSize? (8-32 px); textColor?; gridLines?: boolean; gridColor?; gridDash?; axisColor?; lineWidth?; markerSize?; cornerRadius?; barRadius?; cellRadius?; sliceRadius?; boxRadius?; swatchRadius?; tooltipRadius?; controlRadius?; lineJoin?; areaOpacity?; gradient?; valueLabelColor?; tooltip?: { background?, color?, borderColor? }; legendPosition?: 'top' \| 'bottom' \| 'start' \| 'end'; animation?: boolean \| { duration?: number } }. Applied as --aui-chart-* custom properties and classes on the host through the CSSOM (CSP-safe); colors are validated with CSS.supports('color'). Animation is opt-in and never runs with prefers-reduced-motion: reduce or [data-aui-animation='none']. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` |  |  | Custom tooltip content as DOM nodes (never HTML strings). context: { title, rows: { label, value, seriesId }[], column, row, source: "pointer" \| "focus" \| "sync" }. Return null for the default tooltip. The tooltip stays aria-hidden; the focused mark keeps its accessible label. |
| `syncGroup` | `string` |  |  | Synchronized crosshair: charts with the same group show the crosshair and tooltip at the same column (session index) when one is hovered or focused. Use charts with the same sessions. |
| `data` | `readonly CandlestickPoint[]` | required |  | Sessions: { date: PlainDate (strictly increasing); open, high, low, close: finite numbers (high >= open, close, low; low <= open, close); volume?: number >= 0 }. At most 20,000. |
| `type` | `'candle' \| 'ohlc'` | `"candle"` |  | Candles (hollow when rising, filled when falling) or OHLC bars (falling bars dashed). |
| `volume` | `boolean` | `true` |  | Volume pane below the prices when the data has volume. |
| `movingAverages` | `readonly CandlestickMovingAverage[]` |  |  | Up to 4 simple moving averages of the close: { period: 2-250 sessions; id?: string (default "ma<period>"); label?: string; color?: 1-8; style?: ChartSeriesStyle }. |
| `businessCalendar` | `BusinessCalendarEngine \| null` |  |  | Business calendar (createBusinessCalendar from @absoluteui/components/business-calendar): the axis counts trading days only, so weekends and holidays take no space; sessions on non-working days are not plotted and are listed in the summary. Without it the axis is a calendar-day axis with gaps. |
| `priceAxis` | `Omit<ValueAxisInput, 'includeZero'>` |  |  | Price axis: { label?, min?, max?, tickCount? (2-20) }. |
| `volumeFormat` | `Intl.NumberFormatOptions` |  |  | Volume format (tooltips, table, pane label). Default compact notation. |
| `zoom` | `boolean` | `false` |  | Zoom and pan over time: toolbar buttons, + / - / 0 keys, Ctrl/Cmd + wheel, drag to pan, Shift + drag to select. |
| `zoomRange` | `ChartZoomRange \| null` |  |  | Visible axis range { from, to } in axis positions (trading-day or day index from the first session); null shows everything. |
| `legend` | `'auto' \| 'show' \| 'hide'` | `"auto"` | yes | Legend of the moving averages (toggle buttons): auto shows it when there is at least one average, show always, hide never. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `"toggle"` | yes | Data table fallback (date, open, high, low, close, volume, and every moving average): behind a Show data table button (built on first open), always visible, visually hidden (screen readers only), or none. |
| `tooltip` | `boolean` | `true` | yes | Tooltip on pointer hover and keyboard focus. |
| `patterns` | `boolean` | `false` | yes | Dash patterns on the moving averages (WCAG 1.4.1). Candles are always hollow (rising) or filled (falling). Forced-colors mode always shows them. |
| `height` | `number` | `300` | yes | Plot height in CSS px (integer 120-2000); the width follows the container. |
| `crosshair` | `boolean` | `true` | yes | Crosshair lines (time and price) on the hovered or focused session. |
| `locale` | `string` | `"en-US"` | yes | Number, date, and message locale. |
| `direction` | `'ltr' \| 'rtl'` | `"ltr"` | yes | rtl mirrors the time axis and swaps ArrowLeft/ArrowRight. |

## 6. Methods

| Method | Description |
|---|---|
| `CandlestickChart.create(host, options)` | Render into `host` (children are replaced). |
| `update(options: Partial<CandlestickChartOptions>): void` | Merge, validate, and re-render. Invalid options throw and keep the previous state. Keyboard focus stays on the same mark. |
| `setSeriesVisible(id: string, visible: boolean): void` | Show or hide an item programmatically (no event). |
| `destroy(): void` | Remove rendering, host classes, listeners, the resize observer, timers, and the configuration subscription. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) serializes a rendered chart to SVG or PNG.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `CandlestickChartPointClickDetail = ChartPointClickDetail: { seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A candle was activated: pointer click or tap, or Enter / Space on the focused candle. label is the date, column the session index, value the formatted close. Not cancelable. |
| `aui-series-toggle` | `CandlestickChartSeriesToggleDetail: { id: string; visible: boolean; hidden: string[] }` | Yes | A moving average was shown or hidden from the legend. Not cancelable. |
| `aui-zoom` | `CandlestickChartZoomDetail: { x: ChartZoomRange \| null; y: null; reason: 'button' \| 'keyboard' \| 'wheel' \| 'pan' \| 'select' \| 'reset' }` | Yes | The visible range changed (also announced politely). Not cancelable. |

## 8. Slots/content areas

None. Tooltip content can be replaced with `renderTooltip` (DOM nodes).

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus: `aui-candlestick-chart`, `aui-candlestick-chart__candles / __candle / __candle--up / __candle--down`, `aui-candlestick-chart__bar / __bar--up / __bar--down`, `aui-candlestick-chart__volume / __volume-bar--up / --down`, `aui-candlestick-chart__averages / aui-chart__line`, `aui-chart__crosshair / __crosshair-line`, `aui-chart--zoomable / --zoomed / aui-chart__zoom / __tool / __brush`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/candlestick-chart/tokens.json` (verified against the stylesheet in CI). Component tokens: `--aui-candlestick-chart-up-color` (default `color-success-fg`: rising candle outlines, OHLC bars, volume) and `--aui-candlestick-chart-down-color` (default `color-error-fg`: falling candle bodies). Other key tokens: `color-surface` (hollow bodies), `color-chart-1..8` (moving averages), `color-chart-grid`, `color-chart-axis`.

| Component token | Default | Styles |
|---|---|---|
| `--aui-candlestick-chart-down-color` | `color-error-fg` | Falling candles (filled body), OHLC bars, and volume |
| `--aui-candlestick-chart-up-color` | `color-success-fg` | Rising candles (outline of a hollow body), OHLC bars, and volume |

Chart look and feel: these `--aui-chart-*` custom properties restyle every chart; set them in a theme (Theme Designer, Charts section), on any ancestor, or per chart with the `theme` option.

| Custom property | Default (theme token) | Styles |
|---|---|---|
| `--aui-chart-1` ... `--aui-chart-8` | `color-chart-1` ... `color-chart-8` | Palette slots 1-8 (marks, legend and tooltip keys). |
| `--aui-chart-grid-color` | `color-chart-grid` | Gridlines. |
| `--aui-chart-axis-color` | `color-chart-axis` | Axis lines and the crosshair. |
| `--aui-chart-text-color` | `color-text-muted` | Tick labels and axis titles. |
| `--aui-chart-label-color` / `--aui-chart-label-halo-color` | `color-text` / `color-surface` | Value labels and their halo. |
| `--aui-chart-font-family` / `--aui-chart-font-size` | `font-family-sans` / `font-size-xs` | Plot text. |
| `--aui-chart-title-font-size` / `--aui-chart-legend-font-size` / `--aui-chart-legend-gap` | `font-size-md` / `font-size-sm` / `space-3` | Title and legend. |
| `--aui-chart-tooltip-bg` / `-fg` / `-border-color` / `-radius` / `-shadow` | `color-surface` / `color-text` / `color-border-strong` / `radius-md` / `shadow-md` | Tooltip. |

Corner rounding: `theme.cornerRadius` (`--aui-chart-corner-radius`, px 0-50) sets every cornered element; the element radii below win over it; unset keeps the look shown. Values are clamped to half the element's width or height and written as SVG geometry, so SVG and PNG exports keep them; stylesheet values apply when the chart next renders.

- Candle bodies: `boxRadius` (`--aui-chart-box-radius`, default 0); OHLC ticks are lines. Volume bars: `barRadius` (`--aui-chart-bar-radius`) at the top. Moving averages: `lineJoin` (`--aui-chart-line-join`).
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default (candles); OHLC bars; with volume pane; with moving averages; zoomed (pan by drag or arrow keys); empty (no sessions: No data); session focused (crosshair, tooltip); table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active candle focused, crosshair and tooltip shown |
| candle focused | arrow keys, Home, End, PageUp, PageDown | another candle focused (zoomed charts pan past the edge) |
| not zoomed | + / toolbar / Ctrl+wheel / Shift+drag | zoomed (aui-zoom) |
| zoomed | 0 / Reset zoom | full range (aui-zoom) |
| any | legend button | moving average hidden or shown (aui-series-toggle) |
| any | `update()` / configuration change | re-rendered; focus kept on the same session |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowLeft / ArrowRight (also ArrowUp / ArrowDown) | Candle focused | Previous / next session (swapped in RTL); past the window edge a zoomed chart pans. |
| Home / End | Candle focused | First / last visible session. |
| PageUp / PageDown | Candle focused | Ten sessions back / forward (clamped to the visible window). |
| + / = and - / _ | Mark focused, zoom on | Zoom in / out around the focused mark (announced politely, aui-zoom). |
| 0 | Mark focused, zoom on | Reset the zoom. |
| Enter / Space | Mark focused | Fires aui-point-click with source "keyboard". |
| Escape | Tooltip visible | Hides the tooltip without moving focus (WCAG 1.4.13); it returns on the next move. |
| Tab / Shift+Tab | Any | One tab stop for the plot (the active mark), the zoom buttons, the legend buttons, then the Show data table button and the table region. |

## 14. ARIA contract

| Element | Role |
|---|---|
| svg.aui-chart__svg | group with aria-roledescription "candlestick chart" (localized), named by the title |
| candles (path.aui-candlestick-chart__candle) | img with an aria-label: date, open, high, low, close, change |
| legend | list of toggle buttons (aria-pressed) for moving averages |
| zoom toolbar | group "Zoom" of buttons (aria-disabled when unavailable) |
| data table | table (native) with caption, column headers, and row headers |
| axes, volume pane, averages, crosshair, tooltip | aria-hidden (decorative duplicates of the accessible data) |

SVG time-series chart as a named, described group (role="group" with aria-roledescription "candlestick chart") of role="img" candles with roving focus along the sessions; a legend of toggle buttons for moving averages; zoom toolbar; data table fallback.

## 15. Accessibility notes

- Direction is shown by shape (hollow rising, filled falling candles; dashed falling OHLC bars) and named in each accessible name ("up 1.2 %"), never by color alone.
- Zoom and pan have keyboard and button equivalents for every pointer gesture (WCAG 2.5.7).
- The generated summary names the range, the change from first to last close, the extremes, and any sessions not plotted on non-trading days.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver, TalkBack) is pending.
- aria-roledescription support varies; screen readers without it announce "group".

## 16. Responsive behavior

The width follows the container (ResizeObserver); candles share the plot width (body width capped at 24px) and date labels are thinned to fit. The price axis rescales to the visible sessions when zoomed. Wide data tables scroll in a focusable region.

## 17. RTL behavior

direction rtl mirrors the time axis (earliest session on the right), moves the price axis to the right, and swaps ArrowLeft/ArrowRight.

## 18. Theme behavior

Rising candles: color-surface body outlined with --aui-candlestick-chart-up-color (color-success-fg); falling candles: filled with --aui-candlestick-chart-down-color (color-error-fg); falling OHLC bars are dashed. Moving averages use palette slots. Forced colors: hollow and filled CanvasText candles, Highlight on focus.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { candlestickChart: { crosshair: true, dataTable: 'visible' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Dates are `PlainDate` values (calendar days without a time zone); nothing is converted. Business-calendar awareness comes from `businessCalendar`.

## 22. Icon customization points

The zoom toolbar uses the built-in `plus`, `minus`, and `refresh` icons (register replacements through the icon registry).

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes or CSSOM custom properties. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: CandlestickChart.create with 1,000 sessions, volume, and two moving averages, including the first render < 120 ms in headless Chromium. One number formatter per render; the data table is built lazily.

## 26. Supported data scale

Designed for up to about 5,000 sessions (about 20 years of trading days) with zoom; at most 20,000 are accepted. Every visible candle is a focusable SVG path.

## 27. Usage examples

Candles with volume and a moving average:

```ts
import { plainDate } from '@absoluteui/core';
import { CandlestickChart } from '@absoluteui/components/candlestick-chart';

const host = document.createElement('div');
document.body.append(host);
CandlestickChart.create(host, {
  label: 'ACME share price',
  data: [
    { date: plainDate(2026, 3, 2), open: 100, high: 104, low: 99, close: 103, volume: 12000 },
    { date: plainDate(2026, 3, 3), open: 103, high: 105, low: 101, close: 102, volume: 9000 },
    { date: plainDate(2026, 3, 4), open: 102, high: 103, low: 97, close: 98, volume: 15000 },
    { date: plainDate(2026, 3, 5), open: 98, high: 101, low: 97, close: 100, volume: 11000 },
  ],
  movingAverages: [{ period: 2 }],
  valueFormat: { style: 'currency', currency: 'USD' },
});
```

Trading days from a business calendar, zoom on:

```ts
import { plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CandlestickChart } from '@absoluteui/components/candlestick-chart';

const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 4, 3), name: 'Good Friday' }] });
const host = document.querySelector<HTMLElement>('#equity');
if (host) {
  const chart = CandlestickChart.create(host, {
    label: 'Equity',
    data: [
      { date: plainDate(2026, 4, 2), open: 50, high: 52, low: 49, close: 51 },
      { date: plainDate(2026, 4, 6), open: 51, high: 53, low: 50, close: 52.5 },
      { date: plainDate(2026, 4, 7), open: 52.5, high: 53, low: 50.5, close: 51 },
    ],
    businessCalendar: calendar,
    type: 'ohlc',
    zoom: true,
  });
  chart.update({ zoomRange: { from: 0, to: 1 } });
}
```

## 28. Edge cases

- Sessions on non-working days of the business calendar are not plotted and are listed in the summary.
- A doji (open equals close) is drawn with a 1px body and reads "unchanged".
- The first session has no previous close: its change is measured from its open.
- Moving averages start once their period is filled.

## 29. Error behavior

Invalid options throw a configuration error (code `CANDLESTICK_CHART_OPTIONS`) naming the option and the expected value, before anything renders; `update()` with invalid options throws and keeps the previous state. Errors never include option values.

## 30. Known limitations

- Daily sessions only (PlainDate); no intraday or weekly aggregation.
- Simple moving averages of the close only (up to four).
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Logarithmic price axes.
- Drawing tools (trend lines, annotations by pointer).
- Live streaming updates beyond update().

## 32. TypeScript definitions

```ts
type CandlestickChartType = 'candle' | 'ohlc';
interface CandlestickChartConfig extends ChartBaseConfig { crosshair: boolean }
interface CandlestickPoint { date: PlainDate; open: number; high: number; low: number; close: number; volume?: number }
interface CandlestickMovingAverage { period: number; id?: string; label?: string; color?: ChartColor; style?: ChartSeriesStyle }
interface CandlestickChartOptions extends ChartCommonOptions, Partial<CandlestickChartConfig> {
  data: readonly CandlestickPoint[];
  type?: CandlestickChartType;
  volume?: boolean;
  movingAverages?: readonly CandlestickMovingAverage[];
  businessCalendar?: BusinessCalendarEngine | null;
  priceAxis?: Omit<ValueAxisInput, 'includeZero'>;
  volumeFormat?: Intl.NumberFormatOptions;
  zoom?: boolean;
  zoomRange?: ChartZoomRange | null;
}
```

## 33. Vanilla JS example

```ts
import { plainDate } from '@absoluteui/core';
import { CandlestickChart } from '@absoluteui/components/candlestick-chart';
import '@absoluteui/components/candlestick-chart/style.css';

const host = document.querySelector<HTMLElement>('#price');
if (host) {
  CandlestickChart.create(host, {
    label: 'Index',
    data: [
      { date: plainDate(2026, 1, 5), open: 10, high: 11, low: 9.5, close: 10.8 },
      { date: plainDate(2026, 1, 6), open: 10.8, high: 11.2, low: 10.1, close: 10.2 },
    ],
    volume: false,
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { plainDate } from '@absoluteui/core';
import { AuiCandlestickChart } from '@absoluteui/angular/candlestick-chart';
import type { CandlestickPoint } from '@absoluteui/components/candlestick-chart';

@Component({
  selector: 'app-equity',
  imports: [AuiCandlestickChart],
  template: `<aui-candlestick-chart label="Equity" [data]="data" [zoom]="true"></aui-candlestick-chart>`,
})
export class EquityComponent {
  readonly data: CandlestickPoint[] = [
    { date: plainDate(2026, 1, 5), open: 10, high: 11, low: 9.5, close: 10.8 },
    { date: plainDate(2026, 1, 6), open: 10.8, high: 11.2, low: 10.1, close: 10.2 },
  ];
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
