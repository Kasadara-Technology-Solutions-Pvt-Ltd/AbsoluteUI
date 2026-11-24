/**
 * Dashboard definition model (R18-2): one versioned, code-free JSON document that describes a whole
 * dashboard. Plain JSON only (no functions, no expressions, no CSS); widget types and transforms that need
 * code are registered by the host in code (R18-4, R18-7). See docs/PLAN-R18-DASHBOARD.md.
 */

/** Current definition version. Older documents are upgraded by `migrateDefinition`. */
export const DASHBOARD_SCHEMA_VERSION = 1;

/** Any JSON value. */
export type JsonValue = string | number | boolean | null | readonly JsonValue[] | { readonly [key: string]: JsonValue };
/** A JSON object. */
export type JsonObject = Readonly<Record<string, JsonValue>>;

/** Ids of widgets, variables, data sources, pages, and breakpoints. */
export const ID_PATTERN = '^[A-Za-z][A-Za-z0-9_-]{0,63}$';
/** Registered widget type names: lower-case words joined by hyphens, optionally namespaced (`acme:sales-map`). */
export const WIDGET_TYPE_PATTERN = '^([a-z][a-z0-9-]{0,31}:)?[a-z][a-z0-9-]{0,47}$';

export const LIMITS = Object.freeze({
  widgets: 200,
  dataSources: 100,
  variables: 50,
  pages: 20,
  breakpoints: 8,
  transforms: 20,
  title: 200,
  text: 2000,
  url: 2048,
  params: 50,
  headers: 20,
  headerValue: 1024,
  jsonDepth: 20,
  jsonNodes: 10_000,
  selectOptions: 500,
  interactions: 10,
});

export const COMPACTIONS = ['vertical', 'none'] as const;
export type DashboardCompactionMode = (typeof COMPACTIONS)[number];

export const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
export type DashboardDensity = (typeof DENSITIES)[number];

/** Accent colors map to theme tokens (R18-12); never raw CSS values. */
export const ACCENTS = ['primary', 'neutral', 'info', 'success', 'warning', 'danger', 'chart-1', 'chart-2', 'chart-3', 'chart-4', 'chart-5', 'chart-6', 'chart-7', 'chart-8'] as const;
export type DashboardAccent = (typeof ACCENTS)[number];

export const SURFACES = ['default', 'subtle', 'transparent'] as const;
export type DashboardSurface = (typeof SURFACES)[number];

export interface DashboardStyle {
  readonly density?: DashboardDensity;
  readonly accent?: DashboardAccent;
}

export interface WidgetStyle {
  readonly accent?: DashboardAccent;
  readonly surface?: DashboardSurface;
  readonly border?: boolean;
  readonly shadow?: boolean;
  /** Show the widget header (title and actions). Default true. */
  readonly header?: boolean;
  readonly density?: DashboardDensity;
  /** Body padding step 0 (none) to 4 (largest), mapped to space tokens. */
  readonly padding?: number;
}

export interface GridSettings {
  /** Columns of the widest breakpoint (1 to 24). Default 12. */
  readonly columns?: number;
  /** Row height in CSS px (24 to 600). Default 80. */
  readonly rowHeight?: number;
  /** Gap in CSS px (0 to 64). Default 16. */
  readonly gap?: number;
  readonly compaction?: DashboardCompactionMode;
}

export interface BreakpointDefinition {
  readonly name: string;
  readonly minWidth: number;
  readonly columns: number;
}

export interface WidgetLayout {
  readonly x: number;
  readonly y: number;
  readonly w: number;
  readonly h: number;
  readonly minW?: number;
  readonly minH?: number;
  readonly maxW?: number;
  readonly maxH?: number;
  readonly locked?: boolean;
}

export interface LayoutEntry extends WidgetLayout {
  /** Widget id. */
  readonly id: string;
}

/* ------------------------------------------------------------------ variables (S1) */

export const VARIABLE_KINDS = ['dateRange', 'select', 'text', 'number'] as const;
export type VariableKind = (typeof VARIABLE_KINDS)[number];

/** Date range presets, resolved in the dashboard time zone; business presets use the variable's business calendar. */
export const DATE_RANGE_PRESETS = ['today', 'yesterday', 'last7Days', 'last30Days', 'thisWeek', 'lastWeek', 'thisMonth', 'lastMonth', 'thisQuarter', 'lastQuarter', 'thisYear', 'lastYear', 'yearToDate', 'last5BusinessDays', 'last20BusinessDays'] as const;
export type DateRangePreset = (typeof DATE_RANGE_PRESETS)[number];

export type DateRangeValue = { readonly preset: DateRangePreset } | { readonly from: string; readonly to: string };

export interface SelectOption {
  readonly value: string;
  readonly label: string;
}

interface VariableBase {
  readonly id: string;
  readonly label: string;
}

export interface DateRangeVariable extends VariableBase {
  readonly kind: 'dateRange';
  readonly default?: DateRangeValue;
  /** Name of a business calendar the host registers; used by business-day presets. */
  readonly businessCalendar?: string;
}

export interface SelectVariable extends VariableBase {
  readonly kind: 'select';
  readonly options: readonly SelectOption[];
  readonly multiple?: boolean;
  readonly default?: string | readonly string[];
}

export interface TextVariable extends VariableBase {
  readonly kind: 'text';
  readonly default?: string;
  readonly maxLength?: number;
}

export interface NumberVariable extends VariableBase {
  readonly kind: 'number';
  readonly default?: number;
  readonly min?: number;
  readonly max?: number;
}

export type VariableDefinition = DateRangeVariable | SelectVariable | TextVariable | NumberVariable;

/* ------------------------------------------------------------------ data sources (R18-5 to R18-8, S9, S10) */

export const HTTP_METHODS = ['GET', 'POST'] as const;
export type HttpMethod = (typeof HTTP_METHODS)[number];

export const CREDENTIALS = ['same-origin', 'include', 'omit'] as const;
export type CredentialsMode = (typeof CREDENTIALS)[number];

/** Header names a definition may never set (R18-6): auth stays in the host fetcher. */
export const FORBIDDEN_HEADER_PATTERN = /^(authorization|cookie|cookie2|set-cookie|host|origin|referer|proxy-.*|sec-.*)$/i;

/** Matches `{{variable}}` or `{{variable.from}}` / `{{variable.to}}` placeholders. */
export const PLACEHOLDER_PATTERN = /\{\{\s*([A-Za-z][A-Za-z0-9_-]{0,63})(?:\.(from|to))?\s*\}\}/g;

export type ParamValue = string | number | boolean;

export interface HttpDataSource {
  readonly kind: 'http';
  /** Absolute http(s) URL or a root-relative path (`/api/x`). No placeholders, no user info. */
  readonly url: string;
  readonly method?: HttpMethod;
  /** Query parameters; string values may contain variable placeholders. */
  readonly params?: Readonly<Record<string, ParamValue>>;
  readonly headers?: Readonly<Record<string, string>>;
  /** JSON body (POST only); string values may contain variable placeholders. */
  readonly body?: JsonValue;
  /** Default 'same-origin'. 'include' works only for origins on the host allowlist. */
  readonly credentials?: CredentialsMode;
  /** JSON Pointer applied to the response before widgets map it. */
  readonly select?: string;
  /** Cache lifetime in seconds (0 to 86400). Default 0 (shared while in flight only). */
  readonly ttl?: number;
  /** Auto-refresh interval in seconds: 0 (off) or 10 to 86400. */
  readonly refresh?: number;
  /** Request timeout in seconds (1 to 120). Default 30. */
  readonly timeout?: number;
  /** Maximum response size in bytes (1 KiB to 50 MiB). Default 5 MiB. */
  readonly maxBytes?: number;
}

export interface StaticDataSource {
  readonly kind: 'static';
  readonly data: JsonValue;
}

/** Static data delivered after a delay, optionally failing: for previews, docs, and tests (S9). */
export interface MockDataSource {
  readonly kind: 'mock';
  readonly data: JsonValue;
  /** Delay in milliseconds (0 to 10000). */
  readonly delay?: number;
  /** Fail with this HTTP status instead of returning data. */
  readonly failStatus?: number;
}

export type DataSourceDefinition = HttpDataSource | StaticDataSource | MockDataSource;

/* ------------------------------------------------------------------ transforms (R18-7) */

export const FILTER_OPERATORS = ['eq', 'ne', 'gt', 'gte', 'lt', 'lte', 'in', 'contains'] as const;
export type FilterOperator = (typeof FILTER_OPERATORS)[number];

export const AGGREGATES = ['sum', 'avg', 'min', 'max', 'count'] as const;
export type AggregateFunction = (typeof AGGREGATES)[number];

export type Transform =
  | { readonly op: 'pick'; readonly fields: readonly string[] }
  | { readonly op: 'rename'; readonly fields: Readonly<Record<string, string>> }
  | { readonly op: 'filter'; readonly field: string; readonly operator: FilterOperator; readonly value: JsonValue }
  | { readonly op: 'sort'; readonly field: string; readonly direction?: 'asc' | 'desc' }
  | { readonly op: 'limit'; readonly count: number }
  | { readonly op: 'groupBy'; readonly by: readonly string[]; readonly aggregates: readonly AggregateSpec[] }
  /** A transform the host registered in code under this name. */
  | { readonly op: 'custom'; readonly name: string; readonly options?: JsonObject };

export interface AggregateSpec {
  readonly fn: AggregateFunction;
  /** Field to aggregate; omitted only for `count`. */
  readonly field?: string;
  readonly as: string;
}

/* ------------------------------------------------------------------ widgets */

export interface WidgetActions {
  readonly collapsible?: boolean;
  readonly maximizable?: boolean;
  readonly removable?: boolean;
  readonly refreshable?: boolean;
}

/** Cross-widget interaction (S4): when the user selects a point or row, set a variable from it. */
export interface WidgetInteraction {
  readonly on: 'select';
  readonly set: string;
  /** JSON Pointer into the selected datum. */
  readonly from: string;
}

export interface WidgetDefinition {
  readonly id: string;
  readonly type: string;
  readonly title: string;
  readonly subtitle?: string;
  readonly page?: string;
  /** Data source id. */
  readonly source?: string;
  /** Widget input name to JSON Pointer into the (transformed) source data. */
  readonly map?: Readonly<Record<string, string>>;
  readonly transforms?: readonly Transform[];
  /** Type-specific options, validated by the widget type's own schema at render time. */
  readonly options?: JsonObject;
  readonly style?: WidgetStyle;
  readonly actions?: WidgetActions;
  readonly interactions?: readonly WidgetInteraction[];
  /** Layout at the widest breakpoint. */
  readonly layout: WidgetLayout;
}

export interface PageDefinition {
  readonly id: string;
  readonly title: string;
}

export interface DashboardDefinition {
  readonly schemaVersion: typeof DASHBOARD_SCHEMA_VERSION;
  readonly id: string;
  readonly title: string;
  readonly description?: string;
  readonly grid?: GridSettings;
  /** Custom breakpoints; the widest must have `columns` equal to `grid.columns`. */
  readonly breakpoints?: readonly BreakpointDefinition[];
  /** Saved layouts of narrower breakpoints, by breakpoint name. The widest comes from `widgets[].layout`. */
  readonly layouts?: Readonly<Record<string, readonly LayoutEntry[]>>;
  readonly style?: DashboardStyle;
  readonly pages?: readonly PageDefinition[];
  readonly variables?: readonly VariableDefinition[];
  readonly dataSources?: Readonly<Record<string, DataSourceDefinition>>;
  readonly widgets: readonly WidgetDefinition[];
}
