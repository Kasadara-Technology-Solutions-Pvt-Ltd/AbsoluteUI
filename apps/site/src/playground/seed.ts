// Playground seeds (R20-7): per component, the initial options and how to mount it.
// The option controls are generated from the component's API metadata at build time;
// a seed only supplies what metadata cannot: realistic required values and the call.

/** A mounted component as the playground runtime sees it. */
export interface Mounted {
  /** Where the component dispatches its `aui-*` events. */
  readonly events: EventTarget;
  /** Applies changed options; absent when the component only takes options at creation. */
  update?(patch: Record<string, unknown>): void;
  destroy(): void;
}

export interface PlaygroundSeed {
  readonly options: Readonly<Record<string, unknown>>;
  mount(stage: HTMLElement, options: Readonly<Record<string, unknown>>): Mounted;
  /** The call shown in the generated code; `$` is replaced by the options object. */
  readonly call: string;
  /** Source text for option values that are not JSON (functions, nodes, dates). */
  readonly codeValues: Readonly<Record<string, string>>;
  /** Options left out of the panel (for example, ones the seed's mount sets itself). */
  readonly hide: readonly string[];
  /** One sentence shown above the stage (for example, "Press the button to open the dialog"). */
  readonly note?: string;
  /**
   * Options that must change together with another one (for example `value` when `multiple`
   * changes): returns the extra changes for a new `value` of option `name`; `undefined` removes an option.
   */
  adjust?(name: string, value: unknown, current: Readonly<Record<string, unknown>>): Readonly<Record<string, unknown>> | undefined;
}

export interface SeedInput<O extends object> {
  readonly options: O;
  mount(stage: HTMLElement, options: O): { readonly events: EventTarget; update?(patch: Partial<O>): void; destroy(): void };
  readonly call: string;
  readonly codeValues?: Partial<Record<keyof O & string, string>>;
  readonly hide?: readonly (keyof O & string)[];
  readonly note?: string;
  adjust?(name: keyof O & string, value: unknown, current: Readonly<Partial<O>>): Partial<Record<keyof O & string, unknown>> | undefined;
}

/**
 * Types a seed against the component's options and erases the type for the runtime.
 * The runtime builds option values only from controls generated from the same options
 * type (api.json), so the casts below restore the type the values were made from.
 */
export function seed<O extends object>(input: SeedInput<O>): PlaygroundSeed {
  const codeValues: Record<string, string> = {};
  for (const [k, v] of Object.entries(input.codeValues ?? {})) if (typeof v === 'string') codeValues[k] = v;
  return {
    options: input.options as Readonly<Record<string, unknown>>,
    mount(stage, options) {
      const m = input.mount(stage, options as O);
      const update = m.update?.bind(m);
      return {
        events: m.events,
        destroy: () => {
          m.destroy();
        },
        ...(update ? { update: (patch: Record<string, unknown>) => { update(patch as Partial<O>); } } : {}),
      };
    },
    call: input.call,
    codeValues,
    hide: input.hide ?? [],
    ...(input.note === undefined ? {} : { note: input.note }),
    ...(input.adjust ? { adjust: (name: string, value: unknown, current: Readonly<Record<string, unknown>>) => input.adjust?.(name as keyof O & string, value, current as Readonly<Partial<O>>) } : {}),
  };
}

/** An element appended to `parent`, used as a component host. */
export function host<K extends keyof HTMLElementTagNameMap = 'div'>(parent: HTMLElement, tag?: K): HTMLElementTagNameMap[K] {
  const el = document.createElement(tag ?? 'div') as HTMLElementTagNameMap[K];
  parent.append(el);
  return el;
}
