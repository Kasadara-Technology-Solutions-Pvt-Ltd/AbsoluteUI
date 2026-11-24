# Dashboard

> Package: `@absoluteui/components/dashboard` (add-ons `dashboard/widgets`, `dashboard/builder`, `dashboard/schema`) | Styles: `@absoluteui/components/dashboard/style.css`, `@absoluteui/components/dashboard-grid/style.css`, `@absoluteui/components/dashboard-widget/style.css`, `@absoluteui/components/button/style.css`, `@absoluteui/components/switch/style.css`, `@absoluteui/components/select/style.css`, `@absoluteui/components/multi-select/style.css`, `@absoluteui/components/text-input/style.css`, `@absoluteui/components/number-input/style.css`, `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, `@absoluteui/components/date-range-picker/style.css`, `@absoluteui/components/tabs/style.css`; with the builder also the drawer, textarea, file-upload, and inline-message stylesheets; with the built-in widgets the stylesheets of the components they render | Since 0.13.0 | Status: R18

## 1. Purpose

Renders a configurable, API-driven dashboard from one versioned JSON definition. The definition describes the layout per breakpoint, the widgets, their data sources, dashboard variables, pages, and style; the dashboard renders it with Dashboard Grid and Dashboard Widget and keeps it as the single source of truth. Users switch between view and edit mode when the host allows editing, move and resize widgets by pointer or keyboard, add, edit, and remove widgets, and undo every change. Every change emits the new validated definition (`aui-dashboard-change`) for the host to store.

Widget data comes from same-origin or allow-listed cross-origin APIs through a host fetcher that owns authentication, from static data, or from mock data. Definitions never carry code: widget types and custom transforms are registered in code, mapping uses JSON Pointer, and data shaping uses a fixed set of declarative transforms.

## 2. Anatomy

```text
<div class="aui-dashboard-root" data-aui-density="compact">
  <div class="aui-dashboard-kiosk">pause toggle, exit</div>                       (kiosk mode only)
  <div class="aui-dashboard-toolbar" role="group" aria-label="Sales controls">
    <div class="aui-dashboard-toolbar__variables">date range, select, text, number controls</div>
    <div class="aui-dashboard-toolbar__actions">Refresh, Undo, Redo, Reset, Add widget, JSON, Edit switch</div>
  </div>
  <div class="aui-dashboard-root__pages">Tabs (pages only); the grid sits in the selected tab panel</div>
  <div class="aui-dashboard-root__grid aui-dashboard" role="region" aria-label="Sales widgets">
    <section class="aui-dashboard-widget aui-widget" data-aui-item="revenue" data-aui-status="ready" role="region">
      <div class="aui-widget__header">title, subtitle, refresh/edit/collapse/maximize/remove</div>
      <div class="aui-dashboard-widget__body">rendered by the widget type</div>
      <div class="aui-dashboard-widget__state" role="status">Loading | No data | error + Retry</div>
      <div class="aui-dashboard-widget__footer"><time>Updated 10:42</time></div>
    </section>
  </div>
</div>
```

## 3. When to use

- Dashboards whose layout and widgets users or administrators configure, saved per user or tenant as JSON.
- Pre-canned dashboards shipped as JSON and rendered without page code, with data from your APIs.
- Letting users build widgets in the browser (type, data source, mapping, style) and keep the result as JSON.

## 4. When not to use

- A fixed page of a few charts written in code: compose Dashboard Grid, Dashboard Widget, and the chart components directly.
- Free-form canvases with overlapping items or pixel positions.
- Business logic in the dashboard: compute it in your API or register a custom transform.

## 5. Public properties

| Option | Type | Default | Notes |
|---|---|---|---|
| `definition` | `unknown` (DashboardDefinition JSON) | required | Migrated and validated; invalid input throws `DASHBOARD_DEFINITION`. |
| `registry` | `WidgetRegistry` | `defaultWidgetRegistry` | Widget types by name. |
| `transforms` | `TransformRegistry` | `defaultTransformRegistry` | Custom transforms. |
| `fetcher` | `DashboardFetcher` | `defaultFetcher` | Performs requests; add authentication here. |
| `allowedOrigins` | `readonly string[]` | `[]` | Exact origins besides the page origin. |
| `baseUrl` | `string` | `location.href` | Base for root-relative URLs. |
| `editable` | `boolean` | `false` | Allows edit mode. |
| `mode` | `'view' \| 'edit'` | `'view'` | Initial mode. |
| `toolbar` | `boolean \| DashboardToolbarOptions` | `true` | Toolbar and its items. |
| `timeZone` | `string` | runtime zone | Date presets and times. |
| `businessCalendars` | `Record<string, BusinessCalendarEngine>` | none | For business-day presets. |
| `headingLevel` | `2`-`6` | `3` | Widget headings. |
| `label` | `string` | `'{title} widgets'` | Name of the widget region. |
| `lazy` | `boolean` | `true` | Global: load widgets as they scroll into view. |
| `historyLimit` | `number` | `100` | Global: undo steps. |
| `retries` | `number` | `2` | Global: GET retries. |
| `locale`, `direction` | | common config | |

Read-only properties: `host`, `definition`, `savedDefinition`, `dirty`, `mode`, `editable`, `page`, `variables`, `canUndo`, `canRedo`, `kiosk`, `grid`, `registry`.

### The definition

```json
{
  "schemaVersion": 1,
  "id": "sales",
  "title": "Sales",
  "grid": { "columns": 12, "rowHeight": 80, "gap": 16, "compaction": "vertical" },
  "style": { "density": "comfortable" },
  "pages": [{ "id": "overview", "title": "Overview" }],
  "variables": [{ "id": "period", "kind": "dateRange", "label": "Period", "default": { "preset": "thisQuarter" } }],
  "dataSources": {
    "revenue": { "url": "/api/revenue", "params": { "from": "{{period.from}}", "to": "{{period.to}}" }, "ttl": 60, "refresh": 300 }
  },
  "widgets": [
    {
      "id": "total", "type": "kpi", "title": "Revenue", "page": "overview", "source": "revenue",
      "map": { "value": "/total", "previous": "/previousTotal" },
      "options": { "format": { "style": "currency", "currency": "EUR" }, "thresholds": [{ "below": 0, "tone": "danger" }] },
      "style": { "accent": "chart-2" },
      "layout": { "x": 0, "y": 0, "w": 3, "h": 2 }
    }
  ]
}
```

- **Widgets**: `id`, `type` (a registered name), `title`, optional `subtitle`, `page`, `source`, `map` (input name to JSON Pointer), `transforms`, `options` (validated by the type), `style`, `actions` (`collapsible`, `maximizable`, `removable`, `refreshable`), `interactions` (`{ on: 'select', set, from }`), and `layout` at the widest breakpoint. Narrower layouts live in `layouts` by breakpoint name.
- **Data sources**: `http` (default; `url`, `method` GET or POST, `params`, `headers`, `body`, `credentials`, `select`, `ttl`, `refresh`, `timeout`, `maxBytes`), `static` (`data`), and `mock` (`data`, `delay`, `failStatus`). Placeholders `{{variable}}`, `{{variable.from}}`, and `{{variable.to}}` are allowed in parameter and body values only.
- **Variables**: `dateRange` (preset or from/to, optional `businessCalendar`), `select` (options, `multiple`), `text`, `number`.
- **Transforms**: `pick`, `rename`, `filter` (`eq`, `ne`, `gt`, `gte`, `lt`, `lte`, `in`, `contains`), `sort` (nulls last), `limit`, `groupBy` with `sum`, `avg`, `min`, `max`, `count`, and `custom` (registered in code).
- **Style**: `accent` (primary, neutral, info, success, warning, danger, chart-1 to chart-8), `surface` (default, subtle, transparent), `border`, `shadow`, `header`, `density`, `padding` (0 to 4).

### Built-in widget types (`dashboard/widgets`)

| Type | Inputs (`map`) | Options |
|---|---|---|
| `kpi` | `value`, `previous`, `delta`, `trend` | `format`, `comparisonLabel`, `description`, `trendColor`, `thresholds` |
| `line-chart` | `rows` (or the data array) | `x`, `series` [{ field, label, color }], `area`, `format`, `hideLabel` |
| `bar-chart` | `rows` | `category`, `series`, `orientation`, `layout`, `format`, `hideLabel` |
| `pie-chart` | `rows` | `label`, `value`, `donut`, `format`, `hideLabel` |
| `bullet-chart` | `rows` | `label`, `value`, `target`, `format`, `hideLabel` |
| `gauge` | `value` | `min`, `max`, `target`, `bands`, `format`, `hideLabel` |
| `sparkline` | `values` or `rows` | `field`, `variant`, `color`, `format` |
| `table` | `rows` | `columns` [{ field, header, type, currency }], `pageSize`, `searchable`, `selectable` |
| `list` | `rows` | `label`, `value`, `format`, `selectable` |
| `progress` | `value` | `min`, `max`, `tone`, `description`, `thresholds` |
| `text` | none | `text` (plain text, paragraphs split by blank lines) |

`format` accepts presentation keys of `Intl.NumberFormat` options (style, currency, unit, notation, digits, sign display, grouping).

## 6. Methods

| Method | Description |
|---|---|
| `setDefinition(definition, reason?)` | Validate and apply (undoable); loaded data of unchanged sources is kept. |
| `check(definition)` | Issues of a candidate without applying it. |
| `markSaved()` | The current definition becomes the one `reset()` returns to. |
| `setMode(mode)` | `'view'` or `'edit'` (needs `editable`). |
| `setVariable(id, value)` | Validate and set; dependent sources reload. Returns `false` when invalid. |
| `refresh(source?)` | Reload one source or all on the page, bypassing the cache. |
| `setPage(id)` | Show a page. |
| `addWidget(widget)` | Add (first free spot when `layout` is omitted); returns issues. |
| `updateWidget(id, widget)` | Replace a widget; returns issues. |
| `removeWidget(id)` | Remove a widget and its layout entries. |
| `undo()`, `redo()`, `reset()` | Definition history. |
| `startKiosk(options?)`, `stopKiosk()` | Kiosk mode. |
| `widgetStatus(id)`, `widgetElement(id)` | Status and host of a widget. |
| `destroy()` | Abort requests, stop timers, and remove everything the dashboard added. |

Functions: `checkDefinition`, `parseDefinition`, `migrateDefinition`, `registerWidgetType`, `registerTransform`, `applyTransforms`, `resolveInputs`, `resolvePreset`, `resolveDateRange`, `defaultFetcher`; `registerBuiltInWidgets` and each `*Widget` type from `dashboard/widgets`; `enableDashboardBuilder` from `dashboard/builder`; `definitionSchema` from `dashboard/schema`.

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-dashboard-change` | `{ reason, definition }` | yes | Any definition change: layout, add, remove, widget, definition, undo, redo, reset, import. |
| `aui-mode-change` | `{ mode }` | yes | View or edit mode changed. |
| `aui-variables-change` | `{ variables, id }` | yes | A variable changed. |
| `aui-widget-error` | `{ widget, source, kind, status }` | yes | A widget shows an error (no response bodies). |
| `aui-widget-select` | `{ widget, datum }` | yes | A user selected a list item or table row. |
| `aui-page-change` | `{ page }` | yes | Another page is shown. |
| `aui-kiosk-change` | `{ kiosk }` | yes | Kiosk mode started or stopped. |

## 8. Slots/content areas

The host should be empty: the dashboard appends its toolbar, page tabs, and grid. Each widget type renders into `WidgetContext.body` (`.aui-dashboard-widget__body`) and owns that element's children.

## 9. CSS parts/hooks

`aui-dashboard-root` (`--editing`, `--kiosk`), `aui-dashboard-root__grid`, `aui-dashboard-root__pages`, `aui-dashboard-toolbar` and its `__variables`, `__variable` (`data-aui-variable`), `__actions`, `__button`, `__edit`; `aui-dashboard-widget` with `data-aui-item`, `data-aui-status`, `data-aui-tone`, and the style attributes `data-aui-accent`, `-surface`, `-border`, `-shadow`, `-header`, `-density`, `-padding`; `aui-dashboard-widget__body`, `__state`, `__message`, `__retry`, `__footer` (`data-aui-stale`); `aui-dashboard-kiosk`; the builder's `aui-dashboard-builder` parts; the built-in widget containers `aui-dashboard-kpi`, `-chart`, `-gauge`, `-sparkline`, `-table`, `-progress`, `-list`, `-text`.

## 10. Design tokens

Borders, surfaces, text, focus, spacing, and radius tokens of the theme (see `metadata/dashboard/tokens.json`); accents map to `color-primary`, `color-text-muted`, the `*-fg` status colors, and `color-chart-1` to `color-chart-8`. The dashboard has no component tokens of its own.

## 11. States

Dashboard: view, edit, kiosk; page selected; rotation paused. Widget: idle (not yet visible), loading, ready, empty, error (retry unless blocked), stale (last data kept after a failed refresh, footer says so).

## 12. State transitions

- view to edit: the edit switch or `setMode('edit')` (needs `editable`); move handles, remove buttons, and edit actions appear. Edit to view hides them.
- idle to loading: the widget scrolls within 200 px of the viewport (or immediately with `lazy: false`); loading to ready, empty, or error when its source settles.
- ready to stale: a refresh fails while earlier data exists; stale to ready on the next success.
- Any mode to kiosk: `startKiosk()` (switches to view); `stopKiosk()` or the exit button ends it.

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Toolbar controls, page tabs, widgets in reading order. |
| Arrow keys | Page tabs | Move between pages. |
| Enter, arrows, Shift+arrows, Escape | Move handle (edit mode) | Grab, move, resize, drop, cancel. |
| Ctrl/Cmd+Z, Ctrl/Cmd+Shift+Z, Ctrl/Cmd+Y | Edit mode outside text fields | Undo, redo. |
| Space | Edit switch | Toggle edit mode. |
| Escape | Builder or JSON editor | Close without saving. |

## 14. ARIA contract

Toolbar: `role="group"` named '{title} controls'. Pages: Tabs (tablist, tab, tabpanel). Widget area: region named by `label`. Widgets: regions named by their titles, `aria-busy` while loading. Widget state: `role="status"` for loading and empty, `role="alert"` for errors. Kiosk pause: toggle button with `aria-pressed`.

## 15. Accessibility notes

- Every drag has a keyboard alternative (WCAG 2.5.7); keyboard moves are announced, and pointer drops are announced when they change the layout.
- Kiosk rotation can be paused and holds while focus is inside the dashboard (WCAG 2.2.2).
- Threshold tones add a border; the value text carries the meaning (WCAG 1.4.1).
- A hidden widget header keeps the title for assistive technology.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

Breakpoints come from the definition (default lg 1024 px / 12 columns, md 640 px / 6, sm 0 / 1); narrower layouts are derived unless stored in `layouts`. The toolbar wraps; widgets load lazily. Dragging near the top or bottom edge auto-scrolls the page or the nearest scroll container.

## 17. RTL behavior

Logical properties throughout. The grid mirrors columns and keyboard moves; toolbar, tabs, and drawers follow `direction` or the document direction.

## 18. Theme behavior

Theme tokens only. Definitions pick accent roles, surfaces, borders, shadows, density (`data-aui-density` on the root or a widget), and padding steps; never CSS values. Forced colors draw the accent strip in CanvasText. Print hides controls and avoids breaking widgets across pages.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { dashboard: { lazy: false, historyLimit: 200, retries: 1 } } });
```

`locale` and `direction` come from the common configuration.

## 20. Component configuration support

Per instance through the create options; global defaults through `dashboard` (`lazy`, `historyLimit`, `retries`). Widget types, transforms, fetcher, allowed origins, and business calendars are per instance (or the default registries).

## 21. Timezone behavior

Date range presets (today, yesterday, last 7 and 30 days, this and last week, month, quarter, year, year to date, last 5 and 20 business days) resolve in `timeZone`. Business-day presets use the variable's business calendar (Monday to Friday without one), so weekends and holidays are skipped. Values are inclusive ISO dates passed as `{{variable.from}}` and `{{variable.to}}`.

## 22. Icon customization points

Toolbar: refresh, undo, redo, close (reset), plus (add), code (JSON). Widget actions: refresh, more-horizontal (edit). Kiosk exit: minimize. JSON download: download. Replace them through the icon registry (`registerIcons`).

## 23. Security behavior

- Definitions are untrusted: closed objects, plain JSON values only, depth and size limits, no `__proto__`, `prototype`, or `constructor` keys or pointer tokens. Issues never echo received values.
- Data source URLs: absolute http(s) or root-relative, no user info, no placeholders. Requests go only to the page origin or `allowedOrigins`; `credentials: 'include'` only to those.
- Definitions cannot set `Authorization`, `Cookie`, `Host`, `Origin`, `Referer`, `Proxy-*`, or `Sec-*` headers: authentication belongs to the fetcher, so tokens never live in JSON.
- The default fetcher refuses redirects, accepts JSON only, enforces `maxBytes` (default 5 MiB) and `timeout` (default 30 s), and strips unsafe keys.
- Text renders with `textContent`; style options map to tokens; no HTML sinks. JSON imports are limited to 1 MB.
- Validate stored definitions on your server too, and add a CSP `connect-src` entry for every allowed origin.

## 24. Data handling behavior

No persistence or telemetry. Responses are cached in memory per source for its `ttl` and shared by widgets; nothing goes to storage. The host stores definitions. Variable values are sent only as data source parameters.

## 25. Performance characteristics

Bundles (minified, `check:treeshake`): dashboard core 255 KiB (grid, widgets, toolbar controls including the date range picker), built-in widgets 226 KiB, `checkDefinition` alone 24 KiB. Requests are shared per source, cached for `ttl`, aborted when superseded, retried with backoff for GET, and refreshed only while the page is visible. Layout-only changes skip re-rendering; other changes re-render with the data already loaded.

## 26. Supported data scale

Validation limits: 200 widgets, 100 data sources, 50 variables, 20 pages, 8 breakpoints, 20 transforms per widget, 10,000 JSON values per embedded value. Dashboard Grid budgets cover 50 items per page. Tables page their rows; lists show the first 100.

## 27. Usage examples

```ts
import { Dashboard } from '@absoluteui/components/dashboard';
import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';
import { enableDashboardBuilder } from '@absoluteui/components/dashboard/builder';

registerBuiltInWidgets();
const host = document.createElement('div');
document.body.append(host);
const dashboard = Dashboard.create(host, {
  editable: true,
  definition: { schemaVersion: 1, id: 'home', title: 'Home', widgets: [{ id: 'note', type: 'text', title: 'Welcome', options: { text: 'Hello.' }, layout: { x: 0, y: 0, w: 4, h: 2 } }] },
});
enableDashboardBuilder(dashboard);
```

More in `metadata/dashboard/examples.json`: API data with a host fetcher, saving changes, custom widget types, and validation.

## 28. Edge cases

- A widget whose type is not registered shows "Unknown widget type"; invalid options show the first option path.
- Data that does not fit a transform shows "The data does not fit this widget".
- Empty arrays, `null`, or mapped inputs that are all missing show "No data".
- A blocked origin shows an error without a retry button.
- Changing a variable aborts the previous request of each dependent source (latest wins).
- Removing the selected page's last widget keeps the page; deleting a page in JSON selects the first page.

## 29. Error behavior

Invalid definitions throw `AbsoluteUIError` `DASHBOARD_DEFINITION` (validation category; `property` is the first issue's JSON Pointer) or `DASHBOARD_DEFINITION_VERSION`. Invalid options throw `DASHBOARD_OPTIONS`; invalid widget type registrations throw `DASHBOARD_WIDGET_TYPE`. Runtime data failures never throw: they become widget states and `aui-widget-error` events with a kind (blocked, network, http, timeout, too-large, parse, transform, options, unknown-type, render).

## 30. Known limitations

- Chart widgets do not emit point selections; interactions work from list, table, and custom widgets.
- Other charts and the Data Grid need a custom widget type.
- No dashboard PNG or PDF export (charts keep their own export).
- Variable values and page selection are not part of the undo history.
- The builder form covers common fields; transforms, interactions, and thresholds are edited in its JSON tab.
- Kiosk full screen needs a user gesture.

## 31. Unsupported scenarios

Code, expressions, HTML, or CSS in definitions; requests outside the allowed origins; credentials in JSON; dragging widgets between pages or dashboards; horizontal compaction.

## 32. TypeScript definitions

```ts
interface DashboardOptions extends Partial<DashboardConfig> {
  definition: unknown;
  registry?: WidgetRegistry;
  transforms?: TransformRegistry;
  fetcher?: DashboardFetcher;
  allowedOrigins?: readonly string[];
  baseUrl?: string;
  editable?: boolean;
  mode?: 'view' | 'edit';
  toolbar?: boolean | DashboardToolbarOptions;
  timeZone?: string;
  businessCalendars?: Readonly<Record<string, BusinessCalendarEngine>>;
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  label?: string;
  locale?: string;
  direction?: Direction;
}
type DashboardFetcher = (request: DashboardRequest, signal: AbortSignal) => Promise<unknown>;
interface WidgetType {
  readonly label: string;
  readonly defaultSize: { readonly w: number; readonly h: number };
  readonly inputs?: readonly WidgetInputSpec[];
  readonly optionFields?: readonly WidgetOptionSpec[];
  checkOptions?(options: JsonObject): readonly WidgetOptionIssue[];
  create(context: WidgetContext): WidgetInstance;
}
```

## 33. Vanilla JS example

```html
<div id="dashboard"></div>
<script type="module">
  import { Dashboard } from '@absoluteui/components/dashboard';
  import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';
  registerBuiltInWidgets();
  const definition = await (await fetch('/api/dashboards/home')).json();
  const dashboard = Dashboard.create(document.getElementById('dashboard'), { definition, editable: true });
  dashboard.host.addEventListener('aui-dashboard-change', (e) => {
    fetch('/api/dashboards/home', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(e.detail.definition) });
  });
</script>
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import { AuiDashboard } from '@absoluteui/angular/dashboard';

@Component({
  selector: 'app-home-dashboard',
  imports: [AuiDashboard],
  template: `<aui-dashboard [(definition)]="definition" [editable]="true" (dashboardChange)="save()"></aui-dashboard>`,
})
export class HomeDashboardComponent {
  readonly definition = signal<unknown>({ schemaVersion: 1, id: 'home', title: 'Home', widgets: [] });
  save(): void {
    localStorage.setItem('dashboard:home', JSON.stringify(this.definition()));
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

```html
<section id="ops"></section>
<script type="module">
  import { Dashboard } from '@absoluteui/components/dashboard';
  import { registerBuiltInWidgets } from '@absoluteui/components/dashboard/widgets';
  registerBuiltInWidgets();
  Dashboard.create(document.getElementById('ops'), {
    definition: { schemaVersion: 1, id: 'ops', title: 'Operations', widgets: [{ id: 'status', type: 'text', title: 'Status', options: { text: 'All systems normal.' }, layout: { x: 0, y: 0, w: 4, h: 2 } }] },
  });
</script>
```
