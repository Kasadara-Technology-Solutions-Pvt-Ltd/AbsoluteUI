/**
 * Data Grid list editors (docs/PLAN-R11-G4.md, G4c; decision R11-14): a searchable single-value
 * editor built on Combobox and a multiple-value editor built on Multi Select, as custom editors.
 * A separate entry point (`@absoluteui/components/data-grid/editors`), so the core grid bundle
 * does not include those components. Async values, typeahead filtering, loading and error states,
 * and announcements come from the components; the grid validates and writes the value.
 *
 * Choice values are strings, numbers, or booleans (compared by type and value).
 */
import { Combobox, type ComboboxOption } from '../../combobox/combobox.js';
import { MultiSelect, type MultiSelectOption } from '../../multi-select/multi-select.js';
import type { DataGridCustomEditor, DataGridEditorContext } from '../editing.js';

/** A choice of a list editor. */
export interface DataGridChoice {
  readonly value: string | number | boolean;
  readonly label: string;
  readonly disabled?: boolean;
}

/** What `loadValues` receives. */
export interface DataGridChoiceLoadContext<Row> {
  readonly signal: AbortSignal;
  readonly row: Row;
}

export interface DataGridListEditorOptions<Row> {
  /** The choices, or a function of the row (dependent lists). */
  readonly values?: readonly DataGridChoice[] | ((row: Row) => readonly DataGridChoice[]);
  /** Load the choices for the typed text (debounced; a newer query or closing aborts the previous request). */
  readonly loadValues?: (query: string, context: DataGridChoiceLoadContext<Row>) => Promise<readonly DataGridChoice[]>;
  /** Milliseconds between the last keystroke and `loadValues` (default 250). */
  readonly loadDelay?: number;
  readonly placeholder?: string;
}

export interface DataGridMultiEditorOptions<Row> extends DataGridListEditorOptions<Row> {
  /** Most values that can be selected. */
  readonly maxSelected?: number;
  /** A "Select all" option. */
  readonly selectAll?: boolean;
}

/** Stable string keys for choice values (the components use string values). */
const keyOf = (v: unknown): string => `${typeof v}:${String(v)}`;

/** Choices known to an editor: the configured ones plus every loaded one, by key. */
function choiceBook<Row>(options: DataGridListEditorOptions<Row>, row: Row): { list: DataGridChoice[]; byKey: Map<string, DataGridChoice>; add(list: readonly DataGridChoice[]): void } {
  const byKey = new Map<string, DataGridChoice>();
  const list = [...(typeof options.values === 'function' ? options.values(row) : (options.values ?? []))];
  const add = (more: readonly DataGridChoice[]): void => {
    for (const c of more) byKey.set(keyOf(c.value), c);
  };
  add(list);
  return { list, byKey, add };
}

const toOption = (c: DataGridChoice): ComboboxOption & MultiSelectOption => ({ value: keyOf(c.value), label: c.label, ...(c.disabled === true ? { disabled: true } : {}) });

/** Type the key that started the edit into the component's input, so it filters at once; without a key, select the text so typing replaces it. */
function typeKey(input: HTMLInputElement, key: string | null): void {
  if (key === null) {
    input.select();
    return;
  }
  input.value = key;
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

/**
 * A searchable list editor for one value (Combobox): typeahead filtering of `values`, or values
 * loaded per query with `loadValues`. The value is the chosen choice's value, or null.
 */
export function comboboxEditor<Row>(options: DataGridListEditorOptions<Row> = {}): DataGridCustomEditor<Row> {
  return {
    create: (context: DataGridEditorContext<Row>) => {
      const book = choiceBook(options, context.row);
      const current = book.byKey.get(keyOf(context.value));
      // A value set before any load stays known (the component needs it among its options).
      if (!current && context.value !== null && context.value !== undefined && (typeof context.value === 'string' || typeof context.value === 'number' || typeof context.value === 'boolean')) {
        const known = { value: context.value, label: String(context.value) };
        book.list.push(known);
        book.add([known]);
      }
      const host = context.doc.createElement('div');
      host.className = 'aui-data-grid__list-editor';
      const loadValues = options.loadValues;
      const box = Combobox.create(host, {
        label: context.label,
        options: book.list.map(toOption),
        value: context.value === null || context.value === undefined ? null : keyOf(context.value),
        clearOnEscape: false,
        locale: context.locale,
        ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
        ...(options.loadDelay === undefined ? {} : { loadDelay: options.loadDelay }),
        ...(loadValues
          ? {
              loadOptions: async (query, load) => {
                const loaded = await loadValues(query, { signal: load.signal, row: context.row });
                book.add(loaded);
                return loaded.map(toOption);
              },
            }
          : {}),
      });
      box.input.setAttribute('aria-describedby', context.describedBy);
      return {
        element: host,
        control: box.input,
        getValue: () => {
          const key = box.value;
          return key === null ? null : (book.byKey.get(key)?.value ?? null);
        },
        focus: () => {
          box.focus();
          typeKey(box.input, context.key);
          box.open();
        },
        destroy: () => {
          box.destroy();
        },
      };
    },
  };
}

/**
 * A list editor for several values (Multi Select): chips, typeahead, optional Select all and a
 * maximum. The value is an array of the chosen values (in choice order).
 */
export function multiSelectEditor<Row>(options: DataGridMultiEditorOptions<Row> = {}): DataGridCustomEditor<Row> {
  return {
    create: (context: DataGridEditorContext<Row>) => {
      const book = choiceBook(options, context.row);
      const initial = Array.isArray(context.value) ? (context.value as unknown[]) : [];
      for (const v of initial) {
        if ((typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') && !book.byKey.has(keyOf(v))) {
          const known = { value: v, label: String(v) };
          book.list.push(known);
          book.add([known]);
        }
      }
      const host = context.doc.createElement('div');
      host.className = 'aui-data-grid__list-editor';
      const loadValues = options.loadValues;
      const select = MultiSelect.create(host, {
        label: context.label,
        options: book.list.map(toOption),
        value: initial.map(keyOf).filter((k) => book.byKey.has(k)),
        locale: context.locale,
        ...(options.placeholder === undefined ? {} : { placeholder: options.placeholder }),
        ...(options.maxSelected === undefined ? {} : { maxSelected: options.maxSelected }),
        ...(options.selectAll === undefined ? {} : { selectAll: options.selectAll }),
        ...(options.loadDelay === undefined ? {} : { loadDelay: options.loadDelay }),
        ...(loadValues
          ? {
              loadOptions: async (query, load) => {
                const loaded = await loadValues(query, { signal: load.signal, row: context.row });
                book.add(loaded);
                return loaded.map(toOption);
              },
            }
          : {}),
      });
      select.input.setAttribute('aria-describedby', context.describedBy);
      return {
        element: host,
        control: select.input,
        getValue: () => select.value.map((k) => book.byKey.get(k)?.value).filter((v) => v !== undefined),
        focus: () => {
          select.focus();
          typeKey(select.input, context.key);
        },
        destroy: () => {
          select.destroy();
        },
      };
    },
  };
}
