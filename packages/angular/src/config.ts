/**
 * Angular configuration layer (docs/PLAN-R9-ANGULAR.md D7). Configuration lives in the
 * injector hierarchy: `provideAbsoluteUI` at the application, `provideAbsoluteUIConfig`
 * on a route or component. Each component instance receives the merged layer as
 * instance options, so scoped configuration never mutates page-global state; only the
 * application layer in the browser is also applied globally (theme runtime, plain
 * AbsoluteUI code). Precedence: defaults -> theme -> application -> nested scopes -> inputs.
 */
import { computed, Injectable, signal, type Signal, type WritableSignal } from '@angular/core';
import {
  describeComponentConfig,
  getCommonConfig,
  normalizeConfig,
  type CommonConfig,
  type ComponentConfigInput,
  type NormalizedConfig,
} from '@absoluteui/core';
import { COMPONENT_CONFIG_KEYS } from './internal/config-keys.js';
import { devWarn } from './internal/diagnostics.js';

/** Configuration accepted by `provideAbsoluteUI`, `provideAbsoluteUIConfig`, and `AuiConfig.set`. */
export interface AbsoluteUIConfig extends Partial<CommonConfig> {
  /** Per-component defaults, keyed by component configuration name (`dataTable`, `datePicker`, ...). */
  components?: ComponentConfigInput;
}

declare const ngDevMode: boolean | undefined;

type Layer = NormalizedConfig;
type AnyRecord = Record<string, unknown>;

const EMPTY: Layer = Object.freeze({ common: {}, components: {} });

/** Validate an Angular-style config (flat common options plus `components`). */
export function toLayer(config: AbsoluteUIConfig): Layer {
  const { components, ...common } = config;
  if (typeof ngDevMode === 'undefined' || ngDevMode) {
    for (const key of Object.keys(components ?? {})) {
      if (!COMPONENT_CONFIG_KEYS.has(key)) devWarn('AUI_NG_CONFIG_KEY', 'config', `"components.${key}" names no AbsoluteUI component (keys are camelCase, for example "dataTable"); it has no effect.`);
    }
  }
  return normalizeConfig({ common, components: components ?? {} });
}

function merge(base: Layer, top: Layer): Layer {
  const components: Record<string, AnyRecord> = { ...(base.components as Record<string, AnyRecord>) };
  for (const [name, value] of Object.entries(top.components as Record<string, AnyRecord | undefined>)) {
    if (value) components[name] = { ...components[name], ...value };
  }
  return { common: { ...base.common, ...top.common }, components };
}

/**
 * The configuration scope of the current injector. Inject it to read the effective
 * settings (`common()`), or to change the scope at run time (`set`, `patch`).
 */
@Injectable({ providedIn: 'root', useFactory: () => new AuiConfig(null, EMPTY) })
export class AuiConfig {
  readonly #parent: AuiConfig | null;
  readonly #own: WritableSignal<Layer>;
  readonly #globalVersion = signal(0);

  /** @internal Created by `provideAbsoluteUI` / `provideAbsoluteUIConfig`; inject it instead. */
  constructor(parent: AuiConfig | null, initial: Layer) {
    this.#parent = parent;
    this.#own = signal(initial);
  }

  /** True for the application scope (no parent scope). */
  get isRoot(): boolean {
    return this.#parent === null;
  }

  /** The merged layer of this scope and its ancestors (validated). */
  readonly layer: Signal<Layer> = computed(() => (this.#parent ? merge(this.#parent.layer(), this.#own()) : this.#own()));

  /** Effective common settings: defaults and global/theme configuration overlaid with this scope. */
  readonly common: Signal<Readonly<CommonConfig>> = computed(() => {
    this.#globalVersion();
    return Object.freeze({ ...getCommonConfig(), ...this.layer().common });
  });

  /** Replace this scope's own settings. Throws `AbsoluteUIError` on invalid values; the previous settings stay active. */
  set(config: AbsoluteUIConfig): void {
    this.#own.set(toLayer(config));
  }

  /** Merge settings into this scope's own settings. */
  patch(config: AbsoluteUIConfig): void {
    this.#own.set(merge(this.#own(), toLayer(config)));
  }

  /** @internal Re-read global configuration (called when it changes). */
  globalChanged(): void {
    this.#globalVersion.update((v) => v + 1);
  }

  /**
   * @internal Instance options contributed by this scope for one component: the common
   * settings the component inherits, then its component settings.
   */
  optionsFor(configKey: string | undefined): AnyRecord {
    if (configKey === undefined) return {};
    const layer = this.layer();
    const info = describeComponentConfig(configKey);
    if (!info) return {};
    const out: AnyRecord = {};
    const common = layer.common as AnyRecord;
    for (const key of info.inheritedOptionNames) if (common[key] !== undefined) out[key] = common[key];
    const own = (layer.components as Record<string, AnyRecord | undefined>)[configKey];
    if (own) Object.assign(out, own);
    return out;
  }
}
