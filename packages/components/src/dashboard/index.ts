/**
 * @absoluteui/components/dashboard (R18): configurable, API-driven dashboards described by one JSON
 * definition. D0 ships the definition model, validation, and migrations; the runtime follows in D1-D6
 * (docs/PLAN-R18-DASHBOARD.md).
 */
export {
  Dashboard,
  dashboardConfig,
  type DashboardConfig,
  type DashboardKioskOptions,
  type DashboardChangeDetail,
  type DashboardChangeReason,
  type DashboardMode,
  type DashboardModeChangeDetail,
  type DashboardOptions,
  type DashboardVariablesChangeDetail,
  type DashboardWidgetErrorDetail,
  type DashboardWidgetSelectDetail,
  type WidgetStatus,
} from './dashboard.js';
export {
  WidgetRegistry,
  defaultWidgetRegistry,
  registerWidgetType,
  type WidgetContext,
  type WidgetData,
  type WidgetInputSpec,
  type WidgetInstance,
  type WidgetOptionIssue,
  type WidgetOptionSpec,
  type WidgetType,
} from './registry.js';
export { TransformRegistry, TransformError, applyTransforms, resolveInputs, defaultTransformRegistry, registerTransform, type CustomTransform } from './transforms.js';
export type { DashboardToolbarOptions } from './toolbar.js';
export { DashboardDataError, defaultFetcher, type DashboardDataErrorKind, type DashboardFetcher, type DashboardRequest } from './data.js';
export { resolveDateRange, resolvePreset, type DateRange, type VariableValue } from './variables.js';
export { checkDefinition, defaultBreakpoints, type DefinitionCheck, type DefinitionIssue } from './check.js';
export { parseDefinition } from './parse.js';
export { migrateDefinition } from './migrate.js';
export {
  DASHBOARD_SCHEMA_VERSION,
  ACCENTS,
  AGGREGATES,
  DATE_RANGE_PRESETS,
  FILTER_OPERATORS,
  type AggregateFunction,
  type AggregateSpec,
  type BreakpointDefinition,
  type CredentialsMode,
  type DashboardAccent,
  type DashboardCompactionMode,
  type DashboardDefinition,
  type DashboardDensity,
  type DashboardStyle,
  type DashboardSurface,
  type DataSourceDefinition,
  type DateRangePreset,
  type DateRangeValue,
  type FilterOperator,
  type GridSettings,
  type HttpDataSource,
  type HttpMethod,
  type JsonObject,
  type JsonValue,
  type LayoutEntry,
  type MockDataSource,
  type PageDefinition,
  type ParamValue,
  type SelectOption,
  type StaticDataSource,
  type Transform,
  type VariableDefinition,
  type VariableKind,
  type WidgetActions,
  type WidgetDefinition,
  type WidgetInteraction,
  type WidgetLayout,
  type WidgetStyle,
} from './definition.js';
