/**
 * Data Grid cell editors (docs/PLAN-R11-G4.md, G4a; R11-13 write model, R11-14 defaults): the
 * provided editors as native, labelled controls, and the contract for custom editors. Editors
 * only read and convert values; the grid validates, writes (new row objects), and records undo.
 */
import { createId, parsePlainDate, parsePlainTime, plainDateTime, plainDateToString, toInstant, toPlainDateTime } from '@absoluteui/core';
import { isInstantLike, isPlainDate, plainText } from '../data-table/model.js';
import { parseLocaleNumber } from './writes.js';
import type { DataGridColumnType } from './model.js';

export type DataGridEditorKind = 'text' | 'largeText' | 'number' | 'date' | 'datetime' | 'select' | 'checkbox';

/** A choice of the select editor. */
export interface DataGridEditorOption {
  readonly value: unknown;
  readonly label: string;
}

/** Options of a provided editor (`kind` defaults by column type). */
export interface DataGridEditorOptions<Row = unknown> {
  readonly kind?: DataGridEditorKind;
  /** Text editors. */
  readonly maxLength?: number;
  /** Large text: visible lines. Default 5. */
  readonly rows?: number;
  /** Number: bounds and the ArrowUp/ArrowDown step (default 1); date and datetime: ISO bounds. */
  readonly min?: number | string;
  readonly max?: number | string;
  readonly step?: number;
  /** Select: the choices, or a function of the row (dependent lists). */
  readonly options?: readonly DataGridEditorOption[] | ((row: Row) => readonly DataGridEditorOption[]);
}

/** What a custom editor receives. */
export interface DataGridEditorContext<Row = unknown> {
  readonly doc: Document;
  readonly row: Row;
  readonly rowId: string;
  readonly column: string;
  readonly value: unknown;
  /** The printable key that started the edit (it replaces the value), `''` for Backspace, or null. */
  readonly key: string | null;
  readonly locale: string;
  readonly timezone: string;
  /** Accessible name for the editor's control ("{column}, {row}"). */
  readonly label: string;
  /** Id of the validation message element (for aria-describedby). */
  readonly describedBy: string;
  readonly commit: () => void;
  readonly cancel: () => void;
}

/** A cell editor: the provided ones and custom ones share this contract. */
export interface DataGridCellEditor {
  /** Inserted into the cell (or into a popup over it when `popup` is true). */
  readonly element: HTMLElement;
  /** The edited value, or `{ invalid: message }` when the input cannot be converted. */
  getValue(): unknown;
  focus(): void;
  /** The control that carries aria-invalid (default: `element`). */
  readonly control?: HTMLElement;
  readonly popup?: boolean;
  destroy?(): void;
  /** Formula editors: insert a reference for a clicked cell at the caret; false when no operand is expected there. */
  insertReference?(reference: string): boolean;
}

/** A custom editor factory. */
export interface DataGridCustomEditor<Row = unknown> {
  readonly create: (context: DataGridEditorContext<Row>) => DataGridCellEditor;
}

export type DataGridColumnEditor<Row = unknown> = DataGridEditorOptions<Row> | DataGridCustomEditor<Row>;

/** A value an editor could not convert. */
export interface InvalidInput {
  readonly invalid: string;
}
export const isInvalidInput = (v: unknown): v is InvalidInput => typeof v === 'object' && v !== null && 'invalid' in v && typeof v.invalid === 'string';

export const isCustomEditor = <Row>(e: DataGridColumnEditor<Row>): e is DataGridCustomEditor<Row> => 'create' in e;

export const defaultEditorKind = (type: DataGridColumnType): DataGridEditorKind => {
  switch (type) {
    case 'number':
    case 'currency':
      return 'number';
    case 'date':
      return 'date';
    case 'datetime':
      return 'datetime';
    case 'boolean':
      return 'checkbox';
    case 'text':
      return 'text';
  }
};

/** Messages a provided editor needs (localized by the grid). */
export interface EditorMessages {
  readonly invalidNumber: string;
  readonly invalidDate: string;
  readonly invalidTime: string;
  readonly empty: string;
}

const pad = (n: number, width = 2): string => String(n).padStart(width, '0');

/** Create a provided editor. */
export function createProvidedEditor<Row>(kind: DataGridEditorKind, options: DataGridEditorOptions<Row>, context: DataGridEditorContext<Row>, messages: EditorMessages): DataGridCellEditor {
  const { doc, value, key, label, describedBy } = context;
  const name = (el: HTMLElement): void => {
    el.setAttribute('aria-label', label);
    el.setAttribute('aria-describedby', describedBy);
    el.classList.add('aui-data-grid__editor-control');
  };
  switch (kind) {
    case 'largeText':
    case 'text': {
      const el = doc.createElement(kind === 'text' ? 'input' : 'textarea');
      if (el instanceof HTMLInputElement) {
        el.type = 'text';
        el.autocomplete = 'off';
      } else el.rows = options.rows ?? 5;
      name(el);
      if (options.maxLength !== undefined) el.maxLength = options.maxLength;
      el.value = key ?? plainText(value);
      return {
        element: el,
        popup: kind === 'largeText',
        getValue: () => el.value,
        focus: () => {
          el.focus();
          // A typed key replaces the value: the caret goes after it; otherwise the text is selected.
          if (key === null) el.select();
          else el.setSelectionRange(el.value.length, el.value.length);
        },
      };
    }
    case 'number': {
      const el = doc.createElement('input');
      el.type = 'text';
      el.inputMode = 'decimal';
      el.autocomplete = 'off';
      name(el);
      const format = new Intl.NumberFormat(context.locale, { useGrouping: false, maximumFractionDigits: 20 });
      el.value = key ?? (typeof value === 'number' && Number.isFinite(value) ? format.format(value) : '');
      const step = options.step ?? 1;
      const read = (): number | null | InvalidInput => {
        if (el.value.trim() === '') return null;
        // Typed input is stricter than pasted text: only digits, separators, signs, and spaces.
        if (/[^\d\s.,'()+-]/.test(el.value)) return { invalid: messages.invalidNumber };
        const n = parseLocaleNumber(el.value, context.locale);
        return n ?? { invalid: messages.invalidNumber };
      };
      el.addEventListener('keydown', (event) => {
        if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
        event.preventDefault();
        const n = read();
        const base = typeof n === 'number' ? n : 0;
        let next = base + (event.key === 'ArrowUp' ? step : -step);
        if (typeof options.min === 'number') next = Math.max(options.min, next);
        if (typeof options.max === 'number') next = Math.min(options.max, next);
        el.value = format.format(next);
      });
      return {
        element: el,
        getValue: read,
        focus: () => {
          el.focus();
          if (key === null) el.select();
        },
      };
    }
    case 'date': {
      const el = doc.createElement('input');
      el.type = 'date';
      name(el);
      if (typeof options.min === 'string') el.min = options.min;
      if (typeof options.max === 'string') el.max = options.max;
      el.value = isPlainDate(value) ? plainDateToString(value) : '';
      return {
        element: el,
        getValue: () => (el.value === '' ? null : (parsePlainDate(el.value) ?? { invalid: messages.invalidDate })),
        focus: () => {
          el.focus();
        },
      };
    }
    case 'datetime': {
      // Wall-clock time in the grid's time zone (never the machine's).
      const el = doc.createElement('input');
      el.type = 'datetime-local';
      name(el);
      if (isInstantLike(value)) {
        const local = toPlainDateTime(value, context.timezone);
        el.value = `${plainDateToString(local.date)}T${pad(local.time.hour)}:${pad(local.time.minute)}`;
      }
      return {
        element: el,
        getValue: () => {
          if (el.value === '') return null;
          const [d = '', t = ''] = el.value.split('T');
          const date = parsePlainDate(d);
          const time = parsePlainTime(t.length === 5 ? `${t}:00` : t);
          if (!date || !time) return { invalid: messages.invalidDate };
          try {
            return toInstant(plainDateTime(date, time), context.timezone);
          } catch {
            return { invalid: messages.invalidTime };
          }
        },
        focus: () => {
          el.focus();
        },
      };
    }
    case 'select': {
      const el = doc.createElement('select');
      name(el);
      const list = typeof options.options === 'function' ? options.options(context.row) : (options.options ?? []);
      const blank = doc.createElement('option');
      blank.value = '';
      blank.textContent = messages.empty;
      el.append(blank);
      list.forEach((choice, i) => {
        const opt = doc.createElement('option');
        opt.value = String(i);
        opt.textContent = choice.label;
        el.append(opt);
      });
      const current = list.findIndex((choice) => Object.is(choice.value, value));
      el.value = current >= 0 ? String(current) : '';
      return {
        element: el,
        getValue: () => (el.value === '' ? null : list[Number(el.value)]?.value),
        focus: () => {
          el.focus();
        },
      };
    }
    case 'checkbox': {
      const el = doc.createElement('input');
      el.type = 'checkbox';
      name(el);
      el.checked = value === true;
      return {
        element: el,
        getValue: () => el.checked,
        focus: () => {
          el.focus();
        },
      };
    }
  }
}

/** A unique id for an editor's validation message. */
export const editorMessageId = (): string => createId('aui-data-grid-edit-error');
