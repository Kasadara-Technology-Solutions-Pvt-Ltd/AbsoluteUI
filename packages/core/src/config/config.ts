/**
 * Configuration engine (SPEC section 6).
 *
 * Precedence (most specific wins, section 6.3):
 *   built-in default -> theme common -> theme component -> global common -> global component -> instance
 */
import { configurationError, setDiagnosticsMode, type DiagnosticsMode } from '../errors.js';
import type { TimeZoneEngine } from '../timezone/engine.js';
import { isLocale, isRecord, isTimeZone, isNonEmptyString, nullable, oneOf, type Guard } from './validators.js';

export type Density = 'compact' | 'comfortable' | 'spacious';
export type Direction = 'ltr' | 'rtl';
export type AnimationMode = 'none' | 'subtle';
export type Disambiguation = 'compatible' | 'earlier' | 'later' | 'reject';

/** Settings shared by all components (section 6.1). */
export interface CommonConfig {
  locale: string;
  timezone: string;
  density: Density;
  direction: Direction;
  animation: AnimationMode;
  theme: string;
  disambiguation: Disambiguation;
  diagnostics: DiagnosticsMode;
  /** Optional authoritative offset resolver (section 8.7). `null` uses the built-in Intl engine. */
  timeZoneEngine: TimeZoneEngine | null;
}

export type Mutability = 'dynamic' | 'init-only';

export interface OptionSpec<T> {
  readonly default: T;
  /** Expected contract, used in diagnostics. Must not describe received values. */
  readonly expected: string;
  readonly validate: Guard<T>;
  /** `init-only` options cannot change on an existing instance (section 6.5). Default: `dynamic`. */
  readonly mutability?: Mutability;
}

export type ConfigSchema<T> = { readonly [K in keyof T]-?: OptionSpec<T[K]> };

/**
 * Component configuration registry. Components augment this interface:
 *
 * ```ts
 * declare module '@absoluteui/core' {
 *   interface ComponentConfigMap { dialog: DialogConfig }
 * }
 * ```
 */
// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- augmentation target
export interface ComponentConfigMap {}

export type ComponentConfigInput = {
  [K in keyof ComponentConfigMap]?: Partial<ComponentConfigMap[K]>;
};

/** Mode B (section 6.1): common and component-specific settings. */
export interface StructuredConfigInput {
  common?: Partial<CommonConfig>;
  components?: ComponentConfigInput;
}

/** Mode A (flat common settings) or Mode B (structured). */
export type GlobalConfigInput = Partial<CommonConfig> | StructuredConfigInput;

const isTimeZoneEngine: Guard<TimeZoneEngine> = (v): v is TimeZoneEngine =>
  isRecord(v) && typeof v.getOffsetMs === 'function' && typeof v.isValidTimeZone === 'function';

export const commonSchema: ConfigSchema<CommonConfig> = {
  locale: { default: 'en-US', expected: 'BCP 47 locale tag', validate: isLocale },
  timezone: { default: 'UTC', expected: 'IANA timezone identifier', validate: isTimeZone },
  density: { default: 'comfortable', expected: '"compact" | "comfortable" | "spacious"', validate: oneOf(['compact', 'comfortable', 'spacious'] as const) },
  direction: { default: 'ltr', expected: '"ltr" | "rtl"', validate: oneOf(['ltr', 'rtl'] as const) },
  animation: { default: 'subtle', expected: '"none" | "subtle"', validate: oneOf(['none', 'subtle'] as const) },
  theme: { default: 'absolute-default', expected: 'non-empty theme name', validate: isNonEmptyString },
  disambiguation: { default: 'compatible', expected: '"compatible" | "earlier" | "later" | "reject"', validate: oneOf(['compatible', 'earlier', 'later', 'reject'] as const) },
  diagnostics: { default: 'production', expected: '"production" | "development"', validate: oneOf(['production', 'development'] as const) },
  timeZoneEngine: { default: null, expected: 'TimeZoneEngine object or null', validate: nullable(isTimeZoneEngine) },
};

type AnyRecord = Record<string, unknown>;

interface Layer {
  common: AnyRecord;
  components: Record<string, AnyRecord>;
}

interface Registration {
  schema: ConfigSchema<AnyRecord>;
  inherits: readonly (keyof CommonConfig)[];
}

const emptyLayer = (): Layer => ({ common: {}, components: {} });

/**
 * Configuration is page-global state. Two copies of @absoluteui/core (e.g. a bundler
 * resolving both src and dist, or mismatched versions) would silently split it, so a
 * second instance is reported. Known limitation: exactly one core instance per page.
 */
const INSTANCE_KEY = Symbol.for('absoluteui.core.instance');
{
  const registry = globalThis as { [INSTANCE_KEY]?: boolean };
  if (registry[INSTANCE_KEY]) {
    reportListenerError(
      configurationError('CORE_DUPLICATE_INSTANCE', 'Multiple copies of @absoluteui/core are loaded; configuration will not be shared.', {
        remediation: 'Deduplicate @absoluteui/* packages so every package resolves the same core instance.',
      }),
    );
  }
  registry[INSTANCE_KEY] = true;
}

let globalLayer: Layer = emptyLayer();
let themeLayer: Layer = emptyLayer();
const registry = new Map<string, Registration>();
/** Component names whose stored global/theme config has been validated since the last change. */
const validated = new Set<string>();
const listeners = new Set<() => void>();

function validateOptions(values: AnyRecord, schema: Record<string, OptionSpec<unknown>>, path: string, component?: string): AnyRecord {
  const out: AnyRecord = {};
  for (const [key, value] of Object.entries(values)) {
    const spec = schema[key];
    const property = `${path}.${key}`;
    if (spec === undefined) {
      throw configurationError('CFG_UNKNOWN_OPTION', 'Unknown configuration option.', {
        property,
        ...(component === undefined ? {} : { component }),
        remediation: 'Check the option name against the component documentation.',
      });
    }
    if (value === undefined) continue;
    if (!spec.validate(value)) {
      throw configurationError('CFG_INVALID_VALUE', 'Invalid configuration value.', {
        property,
        expected: spec.expected,
        ...(component === undefined ? {} : { component }),
        remediation: 'Provide a value matching the expected contract.',
      });
    }
    out[key] = value;
  }
  return out;
}

function componentSchema(reg: Registration): Record<string, OptionSpec<unknown>> {
  const schema: Record<string, OptionSpec<unknown>> = { ...reg.schema };
  for (const key of reg.inherits) schema[key] = commonSchema[key];
  return schema;
}

function normalize(input: unknown, path: string): Layer {
  if (!isRecord(input)) {
    throw configurationError('CFG_INVALID_ROOT', 'Configuration must be an object.', { property: path, expected: 'object' });
  }
  const keys = Object.keys(input);
  const structured = keys.includes('common') || keys.includes('components');
  if (structured) {
    const stray = keys.find((k) => k !== 'common' && k !== 'components');
    if (stray !== undefined) {
      throw configurationError('CFG_MIXED_MODES', 'Flat common options cannot be mixed with "common"/"components".', {
        property: `${path}.${stray}`,
        remediation: 'Move common options under "common".',
      });
    }
    const common = input.common ?? {};
    const components = input.components ?? {};
    if (!isRecord(common)) throw configurationError('CFG_INVALID_VALUE', 'Invalid configuration value.', { property: `${path}.common`, expected: 'object' });
    if (!isRecord(components)) throw configurationError('CFG_INVALID_VALUE', 'Invalid configuration value.', { property: `${path}.components`, expected: 'object' });
    const layer: Layer = { common: validateOptions(common, commonSchema, `${path}.common`), components: {} };
    for (const [name, value] of Object.entries(components)) {
      if (!isRecord(value)) throw configurationError('CFG_INVALID_VALUE', 'Invalid configuration value.', { property: `${path}.components.${name}`, expected: 'object' });
      const reg = registry.get(name);
      // Unregistered components are validated when they register and first resolve.
      layer.components[name] = reg ? validateOptions(value, componentSchema(reg), `${path}.components.${name}`, name) : { ...value };
    }
    return layer;
  }
  return { common: validateOptions(input, commonSchema, path), components: {} };
}

function notify(): void {
  validated.clear();
  for (const listener of [...listeners]) {
    // One failing subscriber must not prevent others from updating.
    try {
      listener();
    } catch (error) {
      reportListenerError(error);
    }
  }
}

function reportListenerError(error: unknown): void {
  const report = (globalThis as { reportError?: (e: unknown) => void }).reportError;
  if (report) report(error);
  else queueMicrotask(() => {
    throw error;
  });
}

/**
 * Replace the global configuration layer (section 6.1). Validation is atomic:
 * on error, the previous configuration remains active.
 */
export function configureAbsoluteUI(input: GlobalConfigInput): void {
  const next = normalize(input, 'config');
  globalLayer = next;
  setDiagnosticsMode((next.common.diagnostics as DiagnosticsMode | undefined) ?? commonSchema.diagnostics.default);
  notify();
}

/** @internal Used by the theme runtime to supply theme defaults (section 6.3 layer 2). */
export function setThemeConfigDefaults(input: StructuredConfigInput): void {
  themeLayer = normalize(input, 'theme');
  notify();
}

/** Reset all configuration layers. Intended for tests and full application teardown. */
export function resetAbsoluteUIConfig(): void {
  globalLayer = emptyLayer();
  themeLayer = emptyLayer();
  setDiagnosticsMode('production');
  notify();
}

/** Subscribe to any global/theme configuration change. Returns an unsubscribe function. */
export function onConfigChange(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** Validated configuration layer returned by `normalizeConfig`. */
export interface NormalizedConfig {
  readonly common: Partial<CommonConfig>;
  readonly components: ComponentConfigInput;
}

/**
 * Validate a configuration input (Mode A or B) without applying it. Throws the same
 * errors as `configureAbsoluteUI`. Framework integrations use it for scoped configuration
 * that must never touch the page-global layer (for example per-request server rendering).
 */
export function normalizeConfig(input: GlobalConfigInput): NormalizedConfig {
  const layer = normalize(input, 'config');
  return { common: layer.common, components: layer.components };
}

/** Option names of a registered component configuration, or `undefined` when `name` is not registered. */
export function describeComponentConfig(name: string): { readonly optionNames: readonly string[]; readonly inheritedOptionNames: readonly string[] } | undefined {
  const reg = registry.get(name);
  if (!reg) return undefined;
  return { optionNames: Object.freeze(Object.keys(componentSchema(reg))), inheritedOptionNames: Object.freeze([...reg.inherits]) };
}

/** Resolved common configuration. */
export function getCommonConfig(): Readonly<CommonConfig> {
  const out: AnyRecord = {};
  for (const key of Object.keys(commonSchema) as (keyof CommonConfig)[]) {
    out[key] = pick(key, commonSchema[key].default, [themeLayer.common, globalLayer.common]);
  }
  return Object.freeze(out) as unknown as Readonly<CommonConfig>;
}

function pick(key: string, fallback: unknown, layers: readonly AnyRecord[]): unknown {
  let value = fallback;
  for (const layer of layers) if (key in layer) value = layer[key];
  return value;
}

export interface ComponentConfigHandle<R> {
  readonly name: string;
  /** All option names, including inherited common options (for metadata and tooling). */
  readonly optionNames: readonly string[];
  /** Inherited common option names. */
  readonly inheritedOptionNames: readonly string[];
  /** Resolve configuration for one instance. Throws AbsoluteUIError on invalid instance options. */
  resolve(instance?: Partial<R>): Readonly<R>;
  /** Throws if `next` changes an init-only option relative to `previous`. */
  assertUpdatable(previous: Partial<R>, next: Partial<R>): void;
  /** Notified when global or theme configuration changes. */
  subscribe(listener: () => void): () => void;
}

/**
 * Register a component's configuration schema. `inherits` lists common options
 * the component honors; they can be overridden per component and per instance.
 */
export function defineComponentConfig<T extends object, const I extends keyof CommonConfig = never>(
  name: string,
  schema: ConfigSchema<T>,
  inherits: readonly I[] = [],
): ComponentConfigHandle<T & Pick<CommonConfig, I>> {
  type R = T & Pick<CommonConfig, I>;
  if (registry.has(name)) {
    throw configurationError('CFG_DUPLICATE_COMPONENT', 'Component configuration registered twice.', { component: name, property: name });
  }
  const reg: Registration = { schema: schema, inherits };
  registry.set(name, reg);
  const fullSchema = componentSchema(reg);

  const ensureStoredValid = (): void => {
    if (validated.has(name)) return;
    for (const [layerName, layer] of [['theme', themeLayer], ['config', globalLayer]] as const) {
      const stored = layer.components[name];
      if (stored) layer.components[name] = validateOptions(stored, fullSchema, `${layerName}.components.${name}`, name);
    }
    validated.add(name);
  };

  return {
    name,
    optionNames: Object.freeze(Object.keys(fullSchema)),
    inheritedOptionNames: Object.freeze([...inherits]),
    resolve(instance = {}) {
      ensureStoredValid();
      const own = validateOptions(instance, fullSchema, name, name);
      const out: AnyRecord = {};
      for (const key of Object.keys(fullSchema)) {
        const isInherited = (inherits as readonly string[]).includes(key);
        const layers: AnyRecord[] = isInherited
          ? [themeLayer.common, themeLayer.components[name] ?? {}, globalLayer.common, globalLayer.components[name] ?? {}, own]
          : [themeLayer.components[name] ?? {}, globalLayer.components[name] ?? {}, own];
        out[key] = pick(key, fullSchema[key]?.default, layers);
      }
      return Object.freeze(out) as unknown as Readonly<R>;
    },
    assertUpdatable(previous, next) {
      for (const [key, spec] of Object.entries(fullSchema)) {
        if (spec.mutability !== 'init-only') continue;
        const prev = (previous as AnyRecord)[key];
        const nxt = (next as AnyRecord)[key];
        if (key in (next as AnyRecord) && !Object.is(prev, nxt)) {
          throw configurationError('CFG_INIT_ONLY', 'Option cannot change after initialization.', {
            component: name,
            property: `${name}.${key}`,
            remediation: 'Recreate the component instance to change this option.',
          });
        }
      }
    },
    subscribe: onConfigChange,
  };
}
