# Organization chart export

> Package: `@absoluteui/components/org-chart-export` | No stylesheet | Since 0.5.0 | Status: R3

Saves the visible (expanded) part of an [Organization Chart](org-chart.md) as a standalone SVG document or a PNG image. A separate subpath, so charts that never export do not ship it (as `chart-export` for charts, engineering decision 29).

## API

| Function | Description |
|---|---|
| `orgChartToSvg(chart, options?)` | SVG document string: the chart label as `<title>` and optional heading, connectors, and one rectangle per visible node with its label and title. |
| `orgChartToPng(chart, options?)` | `Promise<Blob>` (image/png), rasterized from the SVG at `scale` device pixels per CSS px. |
| `downloadOrgChart(chart, { format, fileName, ...options })` | Saves an `svg` or `png` file through a temporary object URL (`.svg` / `.png` added when missing). |

`OrgChartExportOptions`: `title` (default `true`), `background` (`'surface'` default, or `'transparent'`), `scale` (PNG, 1..4, default 2).

## Behavior

- The whole visible chart is exported at 100 % regardless of the current pan and zoom; collapsed teams are not included.
- Colors, fonts, radii, and border widths are read from the rendered cards, connectors, and theme custom properties, and written as presentation attributes: the file needs no stylesheet and contains no `class` or `style` attributes.
- The highlighted path (`reveal()`) is exported with thicker, accent-colored borders and connectors.
- Cards are redrawn with the node's label and title (shortened with an ellipsis to fit); custom `renderNode` content is not exported.
- Nothing is uploaded; PNG rasterizing loads the SVG from a `blob:` URL, so pages with a CSP need `img-src blob:`.

## Errors

| Code | Cause |
|---|---|
| `ORG_CHART_EXPORT_OPTIONS` | Invalid `title`, `background`, `scale`, `format`, or `fileName` (empty or with path separators); a chart that is not connected. |
| `ORG_CHART_EXPORT_UNAVAILABLE` | No window, or Canvas 2D is not available (PNG). |
| `ORG_CHART_EXPORT_FAILED` | The browser could not encode the PNG. |

## Example

```ts
import { OrgChart } from '@absoluteui/components/org-chart';
import { downloadOrgChart, orgChartToSvg } from '@absoluteui/components/org-chart-export';

const host = document.createElement('div');
document.body.append(host);
const chart = OrgChart.create(host, { label: 'Company', nodes: [{ id: 'ceo', parentId: null, label: 'Ada Lovelace', title: 'CEO' }] });
const svg = orgChartToSvg(chart, { background: 'transparent' });
void downloadOrgChart(chart, { format: 'png', fileName: 'company', scale: 3 });
```
