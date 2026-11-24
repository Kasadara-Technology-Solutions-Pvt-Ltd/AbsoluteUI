export { AbsoluteUIError, configurationError, validationError, runtimeError, getDiagnosticsMode } from './errors.js';
export type { ErrorCategory, ErrorDetails, DiagnosticsMode } from './errors.js';

export {
  configureAbsoluteUI,
  resetAbsoluteUIConfig,
  setThemeConfigDefaults,
  onConfigChange,
  getCommonConfig,
  defineComponentConfig,
  commonSchema,
  normalizeConfig,
  describeComponentConfig,
} from './config/config.js';
export type {
  CommonConfig,
  ComponentConfigMap,
  ComponentConfigInput,
  ComponentConfigHandle,
  ConfigSchema,
  OptionSpec,
  Mutability,
  GlobalConfigInput,
  StructuredConfigInput,
  Density,
  Direction,
  AnimationMode,
  Disambiguation,
  NormalizedConfig,
} from './config/config.js';
export * as validators from './config/validators.js';
export type { Guard } from './config/validators.js';

export { intlTimeZoneEngine, fieldsToEpoch } from './timezone/engine.js';
export type { TimeZoneEngine } from './timezone/engine.js';
export * from './timezone/types.js';
export {
  getTimeZoneEngine,
  getPossibleInstants,
  getLocalTimeStatus,
  toInstant,
  toPlainDateTime,
  zonedDateTime,
  formatOffset,
  now,
} from './timezone/convert.js';
export type { LocalTimeStatus } from './timezone/convert.js';

export { recurrenceRule, parseRecurrenceRule, recurrenceRuleToString, isRecurrenceRule } from './recurrence/rule.js';
export type {
  RecurrenceRule,
  RecurrenceRuleInit,
  RecurrenceFrequency,
  RecurrenceWeekday,
  RecurrenceUntil,
  RecurrenceDate,
  IsoWeekday,
} from './recurrence/rule.js';
export { expandRecurrence } from './recurrence/expand.js';
export type { RecurrenceExpandOptions, RecurrenceOccurrence } from './recurrence/expand.js';
export { describeRecurrence } from './recurrence/describe.js';
export type { DescribeRecurrenceOptions } from './recurrence/describe.js';

export {
  registerMessages,
  getMessage,
  localeFallbacks,
  getLocaleDirection,
  getDirection,
  getFirstDayOfWeek,
  formatNumber,
  formatCurrency,
  formatPlainDate,
  formatPlainTime,
  formatPlainDateTime,
  formatInstant,
  formatTimeZoneName,
} from './i18n/i18n.js';
export type { MessageCatalog } from './i18n/i18n.js';

export { sanitizeHtml, sanitizeHtmlToString, setSanitizedHtml, defaultSanitizePolicy } from './sanitize/sanitize.js';
export type { SanitizePolicy } from './sanitize/sanitize.js';

export { createId, emit, DisposableGroup } from './dom.js';
export type { Disposer, EmitOptions } from './dom.js';

export { onNodeRelease, releaseNode, releaseNodes } from './render.js';
