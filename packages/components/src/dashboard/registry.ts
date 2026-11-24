/**
 * Widget type registry (R18-4). A definition only names a `type`; the code that renders it is registered
 * here by the application (or by `registerBuiltInWidgets` from `dashboard/widgets`). JSON never carries code.
 */
import { configurationError, type Direction } from '@absoluteui/core';
import { WIDGET_TYPE_PATTERN, type JsonObject, type JsonValue, type WidgetDefinition } from './definition.js';

/** One problem with a widget's `options`, as a JSON Pointer relative to `options`. */
export interface WidgetOptionIssue {
  readonly path: string;
  readonly expected: string;
}

/** What a widget renderer receives when created. */
export interface WidgetContext {
  /** Element to render into (the widget body). The renderer owns its children. */
  readonly body: HTMLElement;
  readonly definition: WidgetDefinition;
  readonly locale: string;
  readonly direction: Direction;
  /** Report a user selection (chart point, table row) for cross-widget interactions (S4). */
  select(datum: JsonValue): void;
}

/** Data delivered to a widget after the data source, transforms, and `map`. */
export interface WidgetData {
  /** The transformed source data (`undefined` for widgets without a source). */
  readonly data: unknown;
  /** Values of the `map` inputs, by input name. */
  readonly inputs: Readonly<Record<string, unknown>>;
  /** The widget's validated options (`{}` when none). */
  readonly options: JsonObject;
}

export interface WidgetInstance {
  /** Called with fresh data; called once right after `create`, also for widgets without a source. */
  update(data: WidgetData): void;
  destroy(): void;
}

/** A named input the builder offers for mapping, for example `value` of a KPI. */
export interface WidgetInputSpec {
  readonly name: string;
  readonly label: string;
  /** What the input expects, for the builder's field picker. */
  readonly kind: 'number' | 'text' | 'numbers' | 'rows' | 'any';
  readonly required?: boolean;
}

/** A field of `options` the widget builder can edit as a form control. */
export interface WidgetOptionSpec {
  readonly name: string;
  readonly label: string;
  readonly kind: 'text' | 'number' | 'boolean' | 'field' | 'fields' | 'enum';
  readonly values?: readonly string[];
}

export interface WidgetType {
  /** Display name in the catalog and builder. */
  readonly label: string;
  readonly description?: string;
  readonly category?: string;
  /** Size used when the widget is added from the catalog or builder. */
  readonly defaultSize: { readonly w: number; readonly h: number };
  readonly inputs?: readonly WidgetInputSpec[];
  readonly optionFields?: readonly WidgetOptionSpec[];
  /** Validates `options`; return no issues when valid. Runs before `create` and on every change. */
  checkOptions?(options: JsonObject): readonly WidgetOptionIssue[];
  create(context: WidgetContext): WidgetInstance;
}

const TYPE_RE = new RegExp(WIDGET_TYPE_PATTERN);

export class WidgetRegistry {
  readonly #types = new Map<string, WidgetType>();

  /** Registers (or replaces) a widget type under `name`. */
  register(name: string, type: WidgetType): void {
    if (!TYPE_RE.test(name)) throw configurationError('DASHBOARD_WIDGET_TYPE', 'Invalid widget type name.', { component: 'dashboard', property: 'registerWidgetType.name', expected: `name matching ${WIDGET_TYPE_PATTERN}` });
    if (typeof type !== 'object' || typeof type.create !== 'function' || typeof type.label !== 'string') {
      throw configurationError('DASHBOARD_WIDGET_TYPE', 'Invalid widget type.', { component: 'dashboard', property: `registerWidgetType.${name}`, expected: 'an object with label, defaultSize, and create()' });
    }
    this.#types.set(name, type);
  }

  unregister(name: string): void {
    this.#types.delete(name);
  }

  get(name: string): WidgetType | undefined {
    return this.#types.get(name);
  }

  has(name: string): boolean {
    return this.#types.has(name);
  }

  /** Registered names in registration order. */
  names(): string[] {
    return [...this.#types.keys()];
  }
}

/** The registry dashboards use when no `registry` option is given. */
export const defaultWidgetRegistry = new WidgetRegistry();

/** Registers a widget type in the default registry. */
export function registerWidgetType(name: string, type: WidgetType): void {
  defaultWidgetRegistry.register(name, type);
}
