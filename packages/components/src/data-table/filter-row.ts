/**
 * Data Table filter row (internal): native, labelled filter controls per column
 * (text search field, number and date ranges, enum select), reading them into
 * filter values and reflecting programmatic filter state back into them.
 */
import { getMessage } from '@absoluteui/core';
import { enumOptions } from './filter.js';
import type { DataTableColumn, DataTableFilter, DataTableFilterKind } from './model.js';

export interface FilterControl {
  readonly kind: DataTableFilterKind;
  readonly a: HTMLInputElement | HTMLSelectElement;
  readonly b: HTMLInputElement | null;
}

/** Marks the synthetic enum option that stands for a programmatic multi-value filter. */
const MULTIPLE = 'multiple';

/**
 * The filter row: one cell per slot, native labelled controls for columns with a
 * `filter`. Returns the row and the controls by column id.
 */
export function buildFilterRow<Row, S extends { readonly column: DataTableColumn<Row> | null }>(
  doc: Document,
  slots: readonly S[],
  locale: string,
  labels: { yes: string; no: string },
  pin: (cell: HTMLTableCellElement, slot: S) => void,
): { row: HTMLTableRowElement; controls: Map<string, FilterControl> } {
  const controls = new Map<string, FilterControl>();
  const tr = doc.createElement('tr');
  tr.className = 'aui-data-table__filter-row';
  for (const slot of slots) {
    const td = doc.createElement('td');
    td.className = 'aui-data-table__filter-cell';
    pin(td, slot);
    tr.append(td);
    const column = slot.column;
    if (!column?.filter) continue;
    const kind = column.filter;
    const input = (type: string, label: string): HTMLInputElement => {
      const el = doc.createElement('input');
      el.type = type;
      el.className = 'aui-data-table__filter-input aui-data-table__control';
      el.dataset.filter = column.id;
      el.autocomplete = 'off';
      el.setAttribute('aria-label', getMessage('dataTable', label, { column: column.header }, locale));
      return el;
    };
    let control: FilterControl;
    if (kind === 'text') {
      const a = input('search', 'filterText');
      a.spellcheck = false;
      td.append(a);
      control = { kind, a, b: null };
    } else if (kind === 'number' || kind === 'date') {
      const type = kind === 'number' ? 'number' : 'date';
      const a = input(type, kind === 'number' ? 'filterMin' : 'filterFrom');
      const b = input(type, kind === 'number' ? 'filterMax' : 'filterTo');
      if (kind === 'number') {
        a.step = 'any';
        b.step = 'any';
      }
      const range = doc.createElement('span');
      range.className = 'aui-data-table__filter-range';
      range.append(a, b);
      td.append(range);
      control = { kind, a, b };
    } else {
      const select = doc.createElement('select');
      select.className = 'aui-data-table__filter-select aui-data-table__control';
      select.dataset.filter = column.id;
      select.setAttribute('aria-label', getMessage('dataTable', 'filterText', { column: column.header }, locale));
      const all = doc.createElement('option');
      all.value = '';
      all.textContent = getMessage('dataTable', 'filterAll', {}, locale);
      select.append(all);
      for (const option of enumOptions(column, labels.yes, labels.no)) {
        const el = doc.createElement('option');
        el.value = option.value;
        el.textContent = option.label;
        select.append(el);
      }
      td.append(select);
      control = { kind, a: select, b: null };
    }
    controls.set(column.id, control);
  }
  return { row: tr, controls };
}

/** The raw filter value of a control (normalize it with normalizeFilter). */
export function readControl(control: FilterControl, current: DataTableFilter | undefined): unknown {
  const a = control.a.value;
  const b = control.b?.value ?? '';
  switch (control.kind) {
    case 'text':
      return current?.type === 'text' && current.operator ? { type: 'text', value: a, operator: current.operator } : { type: 'text', value: a };
    case 'number': {
      const num = (s: string): number | null => (s.trim() === '' || !Number.isFinite(Number(s)) ? null : Number(s));
      return { type: 'number', min: num(a), max: num(b) };
    }
    case 'date':
      return { type: 'date', from: a === '' ? null : a, to: b === '' ? null : b };
    case 'enum':
      // The synthetic "n selected" option keeps a programmatic multi-value filter.
      if (control.a instanceof HTMLSelectElement && control.a.selectedOptions[0]?.dataset.filterOption === MULTIPLE) return current;
      return { type: 'enum', values: a === '' ? [] : [a] };
  }
}

/** Reflect the filter state in the filter row, without disturbing a field that is being edited. */
export function syncFilterControls(
  controls: ReadonlyMap<string, FilterControl>,
  filters: ReadonlyMap<string, DataTableFilter>,
  pending: ReadonlySet<string>,
  doc: Document,
  locale: string,
): void {
  const active = doc.activeElement;
  const set = (el: HTMLInputElement | HTMLSelectElement, value: string): void => {
    if (el !== active && el.value !== value) el.value = value;
  };
  for (const [id, control] of controls) {
    if (pending.has(id)) continue;
    const f = filters.get(id);
    switch (control.kind) {
      case 'text':
        set(control.a, f?.type === 'text' ? f.value : '');
        break;
      case 'number':
        set(control.a, f?.type === 'number' && f.min !== null && f.min !== undefined ? String(f.min) : '');
        if (control.b) set(control.b, f?.type === 'number' && f.max !== null && f.max !== undefined ? String(f.max) : '');
        break;
      case 'date':
        set(control.a, f?.type === 'date' ? (f.from ?? '') : '');
        if (control.b) set(control.b, f?.type === 'date' ? (f.to ?? '') : '');
        break;
      case 'enum': {
        const select = control.a;
        const values = f?.type === 'enum' ? f.values : [];
        const multi = select.querySelector<HTMLOptionElement>('option[data-filter-option]');
        if (values.length > 1) {
          let option = multi;
          if (!option) {
            option = doc.createElement('option');
            option.dataset.filterOption = MULTIPLE;
            select.append(option);
          }
          option.textContent = getMessage('dataTable', 'filterMultiple', { count: values.length }, locale);
          if (select !== active) option.selected = true;
        } else {
          multi?.remove();
          set(select, values[0] ?? '');
        }
        break;
      }
    }
  }
}
