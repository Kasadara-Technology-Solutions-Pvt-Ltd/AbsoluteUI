# Calendar Heatmap

> Package: `@absoluteui/components/calendar-heatmap` | Styles: `@absoluteui/components/calendar-heatmap/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Accessible SVG calendar heatmap: one square per day in a week-by-weekday grid (weeks as columns, weekdays as rows starting at the locale's first day of the week) over a calendar year or a range, with month labels. Fills encode values in discrete steps listed in the legend. With a business calendar, non-working days get a dashed outline and holidays a dot and their name, so a quiet weekend never reads as missing activity. Day and week keyboard navigation, value tooltips, a summary, and a data table are built in.

## 2. Anatomy

```text
<div class="aui-chart aui-calendar-heatmap">
  <div class="aui-chart__header">title, description</div>
  <ul class="aui-chart__legend" aria-label="Legend">No value, steps, Non-working day, Holiday</ul>
  <div class="aui-chart__body">
    <svg class="aui-chart__svg" role="group" aria-roledescription="calendar heatmap" aria-labelledby="T" aria-describedby="S">
      <g class="aui-chart__axis" aria-hidden="true">month and weekday labels</g>
      <g class="aui-calendar-heatmap__cells">
        <rect class="aui-calendar-heatmap__cell aui-chart__series--c1 aui-calendar-heatmap__level--60 aui-chart__mark" role="img" aria-label="Mon, Jan 5, 2026: 3" tabindex="0"/>
        <rect class="aui-calendar-heatmap__cell aui-calendar-heatmap__cell--empty aui-calendar-heatmap__cell--off aui-chart__mark" role="img" aria-label="Sat, Jan 3, 2026: No value, Non-working day"/>
      </g>
      <g class="aui-calendar-heatmap__holidays" aria-hidden="true"><circle class="aui-calendar-heatmap__dot"/></g>
    </svg>
    <div class="aui-chart__tooltip" aria-hidden="true" hidden/>
  </div>
  <p class="aui-chart__summary" hidden/>  <div class="aui-chart__data">Show data table, table</div>
</div>
```

## 3. When to use

- Daily activity over a year: absences, commits, sales, support tickets.
- Spotting weekly and seasonal patterns, and how they relate to working days and holidays.

## 4. When not to use

- Exact comparison of a few days: use Bar Chart.
- Hourly patterns: use Heatmap (weekday by hour).
- More than three years: aggregate by week or month.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The host element. |
| `element` | `SVGSVGElement` | The plot (svg role="group"), named by the title and described by the summary. |
| `summary` | `string` | The generated (or custom) accessible summary. |
| `hiddenSeries` | `string[]` | Shared chart property; always empty. |

Options (`CalendarHeatmapOptions`):

| Option | Type | Default | Global | Description |
|---|---|---|---|---|
| `label` | `string` | required |  | Chart title: visible text and the accessible name of the plot (aria-labelledby); also the data table caption. |
| `hideLabel` | `boolean` | `false` |  | Visually hide the title; it stays the accessible name. |
| `description` | `string` |  |  | Visible description below the title, also referenced by aria-describedby (text only). |
| `summary` | `string` |  |  | Replaces the generated accessible summary (date range, days with values, total, highest and lowest days, non-working days and holidays). |
| `valueFormat` | `Intl.NumberFormatOptions` |  |  | Number format for day values (tooltips, accessible names, legend, table, summary). |
| `formatValue` | `(value: number) => string` |  |  | Custom value text; overrides valueFormat everywhere. |
| `hiddenSeries` | `readonly string[]` |  |  | Shared chart option; a calendar heatmap has no series, so it has no effect. |
| `theme` | `ChartTheme` |  |  | Look and feel: { palette?: string[] (1-8 CSS colors for slots 1-8); fontFamily?; fontSize? (8-32 px); textColor?; gridLines?: boolean; gridColor?; gridDash?; axisColor?; lineWidth?; markerSize?; cornerRadius?; barRadius?; cellRadius?; sliceRadius?; boxRadius?; swatchRadius?; tooltipRadius?; controlRadius?; lineJoin?; areaOpacity?; gradient?; valueLabelColor?; tooltip?: { background?, color?, borderColor? }; legendPosition?: 'top' \| 'bottom' \| 'start' \| 'end'; animation?: boolean \| { duration?: number } }. Applied as --aui-chart-* custom properties and classes on the host through the CSSOM (CSP-safe); colors are validated with CSS.supports('color'). Animation is opt-in and never runs with prefers-reduced-motion: reduce or [data-aui-animation='none']. |
| `renderTooltip` | `(context: ChartTooltipContext) => Node \| null` |  |  | Custom tooltip content as DOM nodes (never HTML strings). context: { title, rows: { label, value, seriesId }[], column, row, source: "pointer" \| "focus" \| "sync" }. Return null for the default tooltip. The tooltip stays aria-hidden; the focused mark keeps its accessible label. |
| `syncGroup` | `string` |  |  | Synchronized crosshair: charts with the same group show the highlight and tooltip at the same column (week index) when one is hovered or focused. |
| `data` | `readonly CalendarHeatmapDay[]` | required |  | Days: { date: PlainDate; value: number \| null } (null, NaN, and infinities are days without value; later duplicates replace earlier ones). At most 20,000 entries. |
| `year` | `number` |  |  | Show this calendar year (ignored when from and to are both set). |
| `from` | `PlainDate` |  |  | First day shown (inclusive). Default: January 1 of year, else the first data date. |
| `to` | `PlainDate` |  |  | Last day shown (inclusive), at most 1,097 days after from. Default: December 31 of year, else the last data date. |
| `firstDayOfWeek` | `number` |  |  | First row: ISO weekday 1 (Monday) to 7 (Sunday). Default: from the locale (getFirstDayOfWeek). |
| `businessCalendar` | `BusinessCalendarEngine \| null` |  |  | Business calendar (createBusinessCalendar from @absoluteui/components/business-calendar): non-working days are outlined, holidays get a dot and their name in tooltips, accessible names, and the table. |
| `colorScale` | `ChartColorSteps` |  |  | { color?: 1-8 (default 1), min?, max? (fixed domain; default the nice-rounded data extent), steps?: 3-9 (default 5) }. Values outside a fixed domain use the first or last step. |
| `legend` | `'auto' \| 'show' \| 'hide'` | `"auto"` | yes | Legend of the color steps with their ranges, "No value", and (with a business calendar) the non-working-day and holiday keys; auto and show both show it, hide removes it. Entries are not buttons. |
| `dataTable` | `'toggle' \| 'visible' \| 'hidden' \| 'none'` | `"toggle"` | yes | Data table fallback (one row per day: date, value, and (with a business calendar) the day type): behind a Show data table button (built on first open), always visible, visually hidden (screen readers only), or none. |
| `tooltip` | `boolean` | `true` | yes | Tooltip on pointer hover and keyboard focus. |
| `patterns` | `boolean` | `false` | yes | Shared chart option (toggles aui-chart--patterns); day squares are not textured, so it has no visible effect. |
| `height` | `number` | `180` | yes | Plot height in CSS px (integer 120-2000); the width follows the container. |
| `monthLabels` | `boolean` | `true` | yes | Month names above the first week of each month. |
| `weekdayLabels` | `'auto' \| 'all' \| 'none'` | `"auto"` | yes | Weekday names beside the rows: auto (every other row), all, or none. |
| `locale` | `string` | `"en-US"` | yes | Number, date, and message locale. |
| `direction` | `'ltr' \| 'rtl'` | `"ltr"` | yes | rtl puts the first week on the right and swaps ArrowLeft/ArrowRight. |

## 6. Methods

| Method | Description |
|---|---|
| `CalendarHeatmap.create(host, options)` | Render into `host` (children are replaced). |
| `update(options: Partial<CalendarHeatmapOptions>): void` | Merge, validate, and re-render. Invalid options throw and keep the previous state. Keyboard focus stays on the same mark. |
| `setSeriesVisible(id: string, visible: boolean): void` | Shared chart method; no effect beyond a re-render. |
| `destroy(): void` | Remove rendering, host classes, listeners, the resize observer, timers, and the configuration subscription. |

Export: `@absoluteui/components/chart-export` (`chartToSvg`, `chartToPng`, `downloadChart`) serializes a rendered chart to SVG or PNG.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-point-click` | `CalendarHeatmapPointClickDetail = ChartPointClickDetail: { seriesId: string \| null; column: number; row: number; label: string; series: string; value: string; source: 'pointer' \| 'keyboard' }` | Yes | A day was activated: pointer click or tap, or Enter / Space on the focused day. label is the formatted date, column the week, row the weekday row, value the formatted value. Not cancelable. |

## 8. Slots/content areas

None. Tooltip content can be replaced with `renderTooltip` (DOM nodes).

## 9. CSS parts/hooks

The shared chart chrome (see Line Chart section 9) plus: `aui-calendar-heatmap`, `aui-calendar-heatmap__cells / __cell / __cell--empty`, `aui-calendar-heatmap__cell--off / __cell--holiday`, `aui-calendar-heatmap__holidays / __dot`, `aui-calendar-heatmap__level--15 ... --100`, `aui-calendar-heatmap__swatch-empty / __swatch-off / __swatch-holiday`, `aui-chart__axis / __tick-label`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/calendar-heatmap/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-chart-1..8` (step hue), `color-surface` (mix base), `color-surface-sunken` (days without value), `color-border-strong` (non-working outline), `color-text` (holiday dots, hover and focus outline).

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

- Cells: `cellRadius` (`--aui-chart-cell-radius`); unset keeps the built-in rounding (a quarter of the cell, at most 3 px). Holiday dots are circles.
- Legend swatches: `swatchRadius` (`--aui-chart-swatch-radius`, 0-8, default 2 px).
- Chrome: the tooltip (`tooltipRadius`, `--aui-chart-tooltip-radius`, default `radius-md`) and the data-table toggle and container, zoom toolbar buttons, and legend buttons (`controlRadius`, `--aui-chart-control-radius`, default `radius-sm`).

## 11. States

default; with business calendar (non-working days and holidays marked); day without value; empty (no data: No data); day focused (tooltip); day hovered; table open.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| plot not focused | Tab | active day focused, tooltip shown |
| day focused | arrow keys, Home, End, PageUp, PageDown | another day focused |
| tooltip visible | Escape | tooltip hidden |
| any | `update()` / configuration change | re-rendered; focus kept on the same day |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| ArrowUp / ArrowDown | Day focused | Previous / next day (crossing weeks). |
| ArrowLeft / ArrowRight | Day focused | Same weekday of the previous / next week (swapped in RTL). |
| Home / End | Day focused | First / last day of the week. |
| PageUp / PageDown | Day focused | Same day of the previous / next month (Shift: year), clamped to the range. |
| Enter / Space | Mark focused | Fires aui-point-click with source "keyboard". |
| Escape | Tooltip visible | Hides the tooltip without moving focus (WCAG 1.4.13); it returns on the next move. |
| Tab / Shift+Tab | Any | One tab stop for the plot (the active mark), then the Show data table button and the table region. |

## 14. ARIA contract

| Element | Role |
|---|---|
| svg.aui-chart__svg | group with aria-roledescription "calendar heatmap" (localized), named by the title |
| days (rect.aui-calendar-heatmap__cell) | img with an aria-label: date, value (or "No value"), and holiday name or "Non-working day" |
| legend | list (ul) named "Legend"; static entries |
| data table | table (native): date, value, day type |
| month and weekday labels, holiday dots, tooltip | aria-hidden (decorative duplicates of the accessible data) |

SVG calendar grid as a named, described group (role="group" with aria-roledescription "calendar heatmap") of role="img" days with roving focus following the APG date grid keys (day and week); a legend of steps and day types; data table fallback.

## 15. Accessibility notes

- Lightness is never the only cue: every day's accessible name and tooltip carry its exact value, the legend lists every step's range, and the data table lists every day.
- Non-working days and holidays are marked by an outline style and a dot, and named in text, not by color.
- The week starts on the locale's first day (getFirstDayOfWeek) unless firstDayOfWeek is set.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver, TalkBack) is pending.
- A year is many key presses; browse-mode users can read the data table instead.

## 16. Responsive behavior

The width follows the container (ResizeObserver); day squares are sized to fit all weeks in the width (and seven rows in the height). Month labels are thinned when crowded; weekday labels show every other row (auto). Wide data tables scroll in a focusable region.

## 17. RTL behavior

direction rtl puts the first week on the right and the weekday labels on the right, and swaps ArrowLeft/ArrowRight (previous / next week).

## 18. Theme behavior

Steps mix color-chart-<slot> into color-surface at 15-100%; days without value use color-surface-sunken; non-working days get a dashed color-border-strong outline; holiday dots use color-text; hover and focus outline color-text. Forced colors: outlined squares (Canvas / CanvasText), Highlight on focus.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { calendarHeatmap: { monthLabels: true, weekdayLabels: 'auto', dataTable: 'visible' } } });
```

Changes apply to existing instances immediately.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Dates are `PlainDate` values (calendar days without a time zone); nothing is converted. Business-calendar awareness comes from `businessCalendar`.

## 22. Icon customization points

None.

## 23. Security behavior

All text uses `textContent`; SVG uses `createElementNS`; colors are classes or CSSOM custom properties. No `innerHTML` or style attributes.

## 24. Data handling behavior

No persistence, network access, or telemetry.

## 25. Performance characteristics

Budget: CalendarHeatmap.create for one year (365 days) with a business calendar, including the first render < 60 ms in headless Chromium. One number formatter per render; the data table is built lazily.

## 26. Supported data scale

One to three years (up to 1,098 days); every day is a focusable SVG rect.

## 27. Usage examples

A year of absences with a business calendar:

```ts
import { plainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { CalendarHeatmap } from '@absoluteui/components/calendar-heatmap';

const host = document.createElement('div');
document.body.append(host);
CalendarHeatmap.create(host, {
  label: 'Absences in 2026',
  year: 2026,
  data: [
    { date: plainDate(2026, 1, 5), value: 3 },
    { date: plainDate(2026, 1, 6), value: 5 },
    { date: plainDate(2026, 2, 10), value: 1 },
  ],
  businessCalendar: createBusinessCalendar({ holidays: [{ date: plainDate(2026, 1, 1), name: 'New Year' }] }),
  colorScale: { color: 3, steps: 4 },
});
```

A quarter starting on Sunday:

```ts
import { plainDate } from '@absoluteui/core';
import { CalendarHeatmap } from '@absoluteui/components/calendar-heatmap';

const host = document.querySelector<HTMLElement>('#tickets');
if (host) {
  const chart = CalendarHeatmap.create(host, {
    label: 'Support tickets',
    from: plainDate(2026, 1, 1),
    to: plainDate(2026, 3, 31),
    firstDayOfWeek: 7,
    data: [{ date: plainDate(2026, 1, 2), value: 12 }],
    weekdayLabels: 'all',
  });
  chart.update({ dataTable: 'visible' });
}
```

## 28. Edge cases

- Days outside the range are not drawn; the first and last weeks may be partial.
- Data outside the range is ignored.
- A holiday that is also in the data shows both its value and its name.
- With no values at all but a range, the grid shows every day as "No value".

## 29. Error behavior

Invalid options throw a configuration error (code `CALENDAR_HEATMAP_OPTIONS`) naming the option and the expected value, before anything renders; `update()` with invalid options throws and keeps the previous state. Errors never include option values.

## 30. Known limitations

- Daily values only (PlainDate); no hourly breakdown.
- Discrete sequential steps (3-9) of one palette slot.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- More than 1,098 days.
- Diverging scales.
- Vertical (weeks as rows) layout.

## 32. TypeScript definitions

```ts
type CalendarHeatmapWeekdayLabels = 'auto' | 'all' | 'none';
interface CalendarHeatmapConfig extends ChartBaseConfig { monthLabels: boolean; weekdayLabels: CalendarHeatmapWeekdayLabels }
interface CalendarHeatmapDay { date: PlainDate; value: number | null }
interface ChartColorSteps { color?: ChartColor; min?: number; max?: number; steps?: number }
interface CalendarHeatmapOptions extends ChartCommonOptions, Partial<CalendarHeatmapConfig> {
  data: readonly CalendarHeatmapDay[];
  year?: number;
  from?: PlainDate;
  to?: PlainDate;
  firstDayOfWeek?: number;
  businessCalendar?: BusinessCalendarEngine | null;
  colorScale?: ChartColorSteps;
}
```

## 33. Vanilla JS example

```ts
import { plainDate } from '@absoluteui/core';
import { CalendarHeatmap } from '@absoluteui/components/calendar-heatmap';
import '@absoluteui/components/calendar-heatmap/style.css';

const host = document.querySelector<HTMLElement>('#activity');
if (host) {
  CalendarHeatmap.create(host, {
    label: 'Activity',
    year: 2026,
    data: [{ date: plainDate(2026, 6, 1), value: 4 }, { date: plainDate(2026, 6, 2), value: 9 }],
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { plainDate } from '@absoluteui/core';
import { AuiCalendarHeatmap } from '@absoluteui/angular/calendar-heatmap';
import type { CalendarHeatmapDay } from '@absoluteui/components/calendar-heatmap';

@Component({
  selector: 'app-absences',
  imports: [AuiCalendarHeatmap],
  template: `<aui-calendar-heatmap label="Absences" [year]="2026" [data]="data"></aui-calendar-heatmap>`,
})
export class AbsencesComponent {
  readonly data: CalendarHeatmapDay[] = [{ date: plainDate(2026, 1, 5), value: 3 }];
}
```

## 35. React example

```tsx
import { plainDate } from '@absoluteui/core';
import { AuiCalendarHeatmap } from '@absoluteui/react/calendar-heatmap';

const data = [{ date: plainDate(2026, 1, 5), value: 3 }];

export function Example() {
  return <AuiCalendarHeatmap label="Absences" year={2026} data={data} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { plainDate } from '@absoluteui/core';
import { AuiCalendarHeatmap } from '@absoluteui/vue/calendar-heatmap';
const data = [{ date: plainDate(2026, 1, 5), value: 3 }];
</script>

<template>
  <AuiCalendarHeatmap label="Absences" :year="2026" :data="data" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
