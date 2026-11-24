# Chart Export

> Package: `@absoluteui/components/chart-export` | Styles: none | Since 0.4.0 | Status: R3

## 1. Purpose

Module functions that export a rendered AbsoluteUI chart as a file:
- `chartToSvg(chart, options?)`: a standalone SVG document string;
- `chartToPng(chart, options?)`: a PNG `Blob`, rasterized from that SVG;
- `downloadChart(chart, options)`: exports as SVG or PNG and saves it through a temporary `<a download>` link.

The export contains the chart title (as `<title>` and, by default, as visible text), the description and generated summary (as `<desc>`), the plot, and the visible legend entries (swatch and label). Computed theme colors, fonts, and dash patterns are copied onto the copy as **presentation attributes** (`fill`, `stroke`, `font-family`, ...), so the file looks like the page without any stylesheet. The output has **no `style` attributes and no classes** (and no `tabindex` or `focusable`), and no CSS variables remain.

Works with every frame-based chart (Line, Bar, Pie, Scatter, Combo, Waterfall, Histogram, Heatmap, Radar, Treemap, Funnel, Box Plot, Bullet) plus Gauge and Sparkline: anything with a `host` element and a rendered `element` SVG.

**Nothing is uploaded or stored**: results are a string or Blob for the caller; `downloadChart` saves through a temporary object URL that is revoked afterwards.

It is a separate subpath, so charts that never export do not ship it.

## 2. Anatomy

Exported SVG (`chartToSvg`):

```text
<svg xmlns="http://www.w3.org/2000/svg" width="W+24" height="H" viewBox="0 0 W+24 H">
  <rect width="100%" height="100%" fill="{surface color}"/>        (background: 'surface')
  <title>Chart title</title>
  <desc>Description and generated summary</desc>
  <text ...>Chart title</text>                                         (title: true)
  <svg x="12" y="..." width="W" height="plot" viewBox="...">            copy of the plot, presentation attributes only
    <defs><pattern .../></defs> ... marks keep role="img" and aria-label ...
  </svg>
  <svg ...>swatch</svg> <text ...>Legend label</text> ...                  (legend: true, visible entries)
</svg>
```

## 3. When to use

- Letting users save a chart as an image (SVG for print and editing, PNG for documents and chat).
- Generating an image of a chart on the client for a report the user downloads.

## 4. When not to use

- Exporting the underlying data: use the chart's data table or your own CSV export.
- Server-side rendering of charts (needs a browser with layout and computed styles).
- Charts that are not rendered or not attached to the document (the functions throw).

## 5. Public properties

Not applicable (module functions, no instance). Options:

`ChartExportOptions` (all three functions):

| Option | Type | Default | Description |
|---|---|---|---|
| `title` | `boolean` | `true` | Draw the chart title above the plot (the `<title>` element is always included when the chart has a title). |
| `legend` | `boolean` | `true` | Draw the visible legend entries (not hidden series) below the plot. |
| `background` | `'surface' \| 'transparent'` | `'surface'` | Theme surface color (`--aui-color-surface` on the host, fallback `#ffffff`) or no background. |
| `scale` | `number` | `2` | PNG device-pixel ratio, 1-4 (validated for every function; used by PNG only). |

`ChartDownloadOptions` (`downloadChart`) adds:

| Option | Type | Default | Description |
|---|---|---|---|
| `format` | `'svg' \| 'png'` | - (required) | File format. |
| `fileName` | `string` | - (required) | File name without directories (`/` and `\` are rejected); `.svg` / `.png` is appended when missing (case-insensitive check). |

## 6. Methods

| Function | Returns | Description |
|---|---|---|
| `chartToSvg(chart, options = {})` | `string` | Standalone SVG document (serialized with `XMLSerializer`). Synchronous. |
| `chartToPng(chart, options = {})` | `Promise<Blob>` | `image/png` at the rendered size x `scale`; loads the SVG from a `blob:` URL into an `Image`, draws it on a canvas, revokes the URL. |
| `downloadChart(chart, options)` | `Promise<void>` | Validates `format` and `fileName`, exports, clicks a hidden `<a download>`, removes it, and revokes the object URL after one second. |

`chart` is any `ExportableChart`: `{ readonly host: HTMLElement; readonly element: SVGSVGElement }`, which every AbsoluteUI chart controller satisfies.

## 7. Events

None.

## 8. Slots/content areas

Not applicable.

## 9. CSS parts/hooks

Not applicable (no styles of its own). The export reads the chart's computed styles, so the file follows the theme, custom properties, and CSS overrides active on the page. Elements hidden with `display: none`, `display="none"`, or `visibility: hidden` are left out.

## 10. Design tokens

None directly. Computed values of the chart's tokens are copied; the background reads `--aui-color-surface` from the chart host.

## 11. States

Not applicable (stateless functions).

## 12. State transitions

Not applicable.

## 13. Keyboard matrix

Not applicable (no UI). Wire the functions to your own native `<button>`.

## 14. ARIA contract

Not applicable to the page. In the file: `<title>` holds the chart title (from `.aui-chart__title` or `.aui-gauge__title`, else the plot's `aria-label`, as for Sparkline), `<desc>` holds the text of the plot's `aria-describedby` targets (description and summary). Marks keep `role="img"` and `aria-label`; the plot copy drops `role`, `aria-labelledby`, `aria-describedby`, and `aria-roledescription`.

## 15. Accessibility notes

- Give the export trigger an accessible name that states the format (for example "Download chart as PNG").
- A PNG carries no text alternative; when you place it in a document, use the chart title and, for frame-based charts, `chart.summary` as its alt text. The SVG keeps `<title>`, `<desc>`, and per-mark labels.
- The export reflects the current state: hidden series, the current zoom, and forced-colors or theme colors active at the time of export.

## 16. Responsive behavior

The file uses the plot's rendered width and height (plus 12 px padding each side); legend entries wrap into rows within that width.

## 17. RTL behavior

The plot is copied as rendered, so RTL charts stay mirrored. Title and legend text are drawn from the left edge.

## 18. Theme behavior

Colors, fonts, and dash patterns are resolved from the page at export time (light or dark theme, custom themes). The background is the theme surface unless `background: 'transparent'`.

## 19. Global configuration support

None (no `configureAbsoluteUI` key); pass options per call.

## 20. Component configuration support

Per-call options only (see section 5).

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

None.

## 23. Security behavior

- Nothing is uploaded or stored; no network access or telemetry.
- The copy is built with `createElementNS`, `setAttribute`, and text nodes; no `innerHTML`, no `style` attributes, no classes in the output.
- PNG rasterizing loads the SVG from a `blob:` URL: pages with a Content Security Policy need `img-src blob:`. `downloadChart` also navigates to a `blob:` URL through `<a download>`.
- Object URLs are revoked (PNG: immediately after decoding; downloads: after one second).
- `fileName` must not contain path separators.

## 24. Data handling behavior

The output contains exactly what the chart shows: title, description, summary, mark labels (values), and legend labels. Treat the file with the same sensitivity as the chart data. Nothing is logged; validation errors name the option, never its value.

## 25. Performance characteristics

No performance budget. Cost grows with the number of SVG elements in the plot (one `getComputedStyle` per element); PNG adds image decoding and canvas encoding.

## 26. Supported data scale

Whatever the chart renders. Very large PNGs are bounded by the browser's canvas size limits (lower `scale` for very wide charts).

## 27. Usage examples

```ts
import { BarChart } from '@absoluteui/components/bar-chart';
import { chartToSvg, downloadChart } from '@absoluteui/components/chart-export';

const host = document.createElement('div');
document.body.append(host);
const chart = BarChart.create(host, {
  label: 'Tickets',
  categories: ['North', 'South'],
  series: [{ id: 'open', label: 'Open', values: [3, 5] }],
});

const markup = chartToSvg(chart, { background: 'transparent' });
console.log(markup.length);

const button = document.createElement('button');
button.type = 'button';
button.textContent = 'Download chart as PNG';
button.addEventListener('click', () => {
  void downloadChart(chart, { format: 'png', fileName: 'tickets', scale: 2 });
});
document.body.append(button);
```

## 28. Edge cases

- Chart destroyed or host detached: throws `CHART_EXPORT_OPTIONS` (`chartExport.chart`).
- Chart without a legend (Funnel, Bullet, Gauge, Sparkline) or `legend: 'hide'`: no legend rows. Hidden series are not listed.
- Chart without a description: `<desc>` holds the summary only.
- Empty chart: the empty plot is exported (the "No data" text is HTML outside the SVG and is not included).
- Tooltips, the data table, and toolbars are HTML outside the plot and are never exported.
- A `fileName` that already ends in `.png` / `.svg` (any case) is kept as is.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `CHART_EXPORT_OPTIONS` | configuration | `title` / `legend` not boolean; `background` not `'surface' \| 'transparent'`; `scale` outside 1-4; chart not rendered or not connected; `format` not `'svg' \| 'png'`; `fileName` empty or with `/` or `\`. |
| `CHART_EXPORT_UNAVAILABLE` | runtime | No `window` for the chart's document, or canvas 2D unavailable. |
| `CHART_EXPORT_FAILED` | runtime | The canvas produced no PNG blob. |

`chartToPng` and `downloadChart` reject their promise with these errors; an image decode failure (for example `img-src` blocking `blob:`) rejects with the browser's own error.

## 30. Known limitations

- Needs a browser with layout (rendered size) and computed styles.
- Title and legend text are laid out with an approximate text width; very long legend labels may overlap.
- HTML parts of the chart (tooltip, data table, empty-state text, toolbar) are not included.
- Web fonts are referenced by family name, not embedded; the file renders with the viewer's fonts.

## 31. Unsupported scenarios

- JPEG, WebP, or PDF output.
- Exporting data (CSV, XLSX).
- Server-side or worker export.
- Uploading or sharing (by design; send the returned Blob yourself if needed).

## 32. TypeScript definitions

```ts
type ChartExportFormat = 'svg' | 'png';
interface ChartExportOptions { title?: boolean; legend?: boolean; background?: 'surface' | 'transparent'; scale?: number }
interface ChartDownloadOptions extends ChartExportOptions { format: ChartExportFormat; fileName: string }
interface ExportableChart { readonly host: HTMLElement; readonly element: SVGSVGElement }
function chartToSvg(chart: ExportableChart, options?: ChartExportOptions): string;
function chartToPng(chart: ExportableChart, options?: ChartExportOptions): Promise<Blob>;
function downloadChart(chart: ExportableChart, options: ChartDownloadOptions): Promise<void>;
```

## 33. Vanilla JS example

```ts
import { Gauge } from '@absoluteui/components/gauge';
import { chartToPng } from '@absoluteui/components/chart-export';

const host = document.querySelector<HTMLElement>('#cpu');
if (host) {
  const gauge = Gauge.create(host, { label: 'CPU', value: 40 });
  const blob = await chartToPng(gauge, { scale: 1 });
  const image = document.createElement('img');
  image.alt = 'CPU gauge';
  image.src = URL.createObjectURL(blob);
  document.body.append(image);
}
```

## 34. Angular example

No adapter is needed: import the functions directly and pass the controller from the chart directive's template reference.

```ts
import { Component } from '@angular/core';
import { AuiBarChart } from '@absoluteui/angular/bar-chart';
import { downloadChart } from '@absoluteui/angular/chart-export';
import { AuiButton } from '@absoluteui/angular/button';
import type { ChartSeries } from '@absoluteui/components/bar-chart';

@Component({
  selector: 'app-tickets',
  imports: [AuiBarChart, AuiButton],
  template: `
    <aui-bar-chart #chart="auiBarChart" label="Tickets" [categories]="regions" [series]="series"></aui-bar-chart>
    <button type="button" auiButton (click)="save(chart)">Download chart as SVG</button>
  `,
})
export class TicketsComponent {
  readonly regions = ['North', 'South'];
  readonly series: ChartSeries[] = [{ id: 'open', label: 'Open', values: [3, 5] }];

  save(chart: AuiBarChart): void {
    void downloadChart(chart, { format: 'svg', fileName: 'tickets' });
  }
}
```

## 35. React example

No adapter is needed: import the functions directly and pass the controller from the chart component's `ref`.

```tsx
import { useRef } from 'react';
import { AuiBarChart } from '@absoluteui/react/bar-chart';
import type { BarChart } from '@absoluteui/components/bar-chart';
import { downloadChart } from '@absoluteui/components/chart-export';

const regions = ['North', 'South'];
const series = [{ id: 'open', label: 'Open', values: [3, 5] }];

export function Example() {
  const chart = useRef<BarChart>(null);
  const save = (): void => {
    if (chart.current) void downloadChart(chart.current, { format: 'png', fileName: 'tickets' });
  };
  return (
    <>
      <AuiBarChart ref={chart} label="Tickets" categories={regions} series={series} />
      <button type="button" onClick={save}>Download chart as PNG</button>
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md) for refs and SSR. Call the functions only in the browser (event handlers or effects).

## 36. Vue example

No adapter is needed: import the functions directly and pass the controller exposed by the chart component's template ref.

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { AuiBarChart } from '@absoluteui/vue/bar-chart';
import type { BarChart } from '@absoluteui/components/bar-chart';
import { downloadChart } from '@absoluteui/components/chart-export';

const chart = ref<{ controller: BarChart | null } | null>(null);
const regions = ['North', 'South'];
const series = [{ id: 'open', label: 'Open', values: [3, 5] }];
function save(): void {
  const controller = chart.value?.controller;
  if (controller) void downloadChart(controller, { format: 'svg', fileName: 'tickets' });
}
</script>

<template>
  <AuiBarChart ref="chart" label="Tickets" :categories="regions" :series="series" />
  <button type="button" @click="save">Download chart as SVG</button>
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for template refs and SSR.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped. The export functions work with any rendered chart controller.
