/**
 * Data Grid filter UI (docs/PLAN-R11-G2.md, G2b): the filter panel (a non-modal dialog with
 * native, labelled controls per filter kind), floating filter controls, and readable filter
 * summaries. Controls build plain filter models; the grid validates them (`parseFilter`)
 * before applying, so nothing here is trusted.
 */
import { createId, formatNumber, formatPlainDate, getMessage, parsePlainDate, registerMessages } from '@absoluteui/core';
import { BUSINESS_OPERATORS, DATE_OPERATORS, normalizer, NUMBER_OPERATORS, operatorNeedsCount, operatorNeedsValue, TEXT_OPERATORS, type DataGridFilter, type DataGridFilterKind } from './filter.js';

registerMessages('dataGrid', 'en', {
  filterColumn: 'Filter {column}',
  filterTitle: '{column} filter',
  filtered: 'filtered',
  condition: 'Condition {n}',
  conditionOperator: 'Condition {n} operator',
  conditionValue: 'Condition {n} value',
  conditionTo: 'Condition {n} end value',
  conditionCount: 'Condition {n} number of days',
  combine: 'Combine conditions',
  joinAnd: 'AND',
  joinOr: 'OR',
  groupDates: 'Dates',
  groupRelative: 'Relative dates',
  groupBusiness: 'Business days',
  show: 'Show',
  any: 'Any',
  searchValues: 'Search values',
  selectAll: 'Select all',
  blanks: '(Blanks)',
  values: 'Values',
  valuesLimited: 'Showing {shown} of {count} values. Refine the search to see the rest.',
  noValues: 'No values match',
  clearFilter: 'Clear filter',
  selectedCount: '{count} selected',
  range: '{from} and {to}',
  numberSyntax: 'A number, or a comparison such as >5, <=10, !=0, or a range such as 5..10',
  search: 'Search',
  searchLandmark: 'Search {label}',
  opContains: 'Contains',
  opNotContains: 'Does not contain',
  opEquals: 'Equals',
  opNotEquals: 'Does not equal',
  opStartsWith: 'Starts with',
  opEndsWith: 'Ends with',
  opBlank: 'Blank',
  opNotBlank: 'Not blank',
  opLessThan: 'Less than',
  opLessThanOrEqual: 'Less than or equal to',
  opGreaterThan: 'Greater than',
  opGreaterThanOrEqual: 'Greater than or equal to',
  opBetween: 'Between',
  opOn: 'On',
  opNotOn: 'Not on',
  opBefore: 'Before',
  opAfter: 'After',
  opOnOrBefore: 'On or before',
  opOnOrAfter: 'On or after',
  opToday: 'Today',
  opYesterday: 'Yesterday',
  opTomorrow: 'Tomorrow',
  opThisWeek: 'This week',
  opLastWeek: 'Last week',
  opNextWeek: 'Next week',
  opThisMonth: 'This month',
  opLastMonth: 'Last month',
  opNextMonth: 'Next month',
  opThisQuarter: 'This quarter',
  opLastQuarter: 'Last quarter',
  opNextQuarter: 'Next quarter',
  opThisYear: 'This year',
  opLastYear: 'Last year',
  opNextYear: 'Next year',
  opYearToDate: 'Year to date',
  opLastDays: 'Last number of days',
  opNextDays: 'Next number of days',
  opWorkingDay: 'Working day',
  opNonWorkingDay: 'Non-working day',
  opHoliday: 'Holiday',
  opLastBusinessDays: 'Last number of business days',
  opNextBusinessDays: 'Next number of business days',
  countLastDays: 'Last {count} days',
  countNextDays: 'Next {count} days',
  countLastBusinessDays: 'Last {count} business days',
  countNextBusinessDays: 'Next {count} business days',
});

/** What the filter UI needs to know about a filterable column. */
export interface FilterUiColumn {
  readonly id: string;
  readonly header: string;
  readonly kind: DataGridFilterKind;
  /** The column has a business calendar (business date operators are offered). */
  readonly business: boolean;
}

/** An unvalidated filter model built by a control; `null` clears the filter. */
export type FilterDraft = Readonly<Record<string, unknown>> | null;

interface AnyCondition {
  readonly operator: string;
  readonly value?: string | number;
  readonly to?: string | number;
  readonly count?: number;
}

export type ConditionKind = 'text' | 'number' | 'bigint' | 'date';

const FIXED_DATE_OPERATORS: readonly string[] = ['on', 'notOn', 'before', 'after', 'onOrBefore', 'onOrAfter', 'between', 'blank', 'notBlank'];
const BUSINESS: ReadonlySet<string> = BUSINESS_OPERATORS;
const RELATIVE_DATE_OPERATORS: readonly string[] = DATE_OPERATORS.filter((op) => !FIXED_DATE_OPERATORS.includes(op) && !BUSINESS.has(op));
/** Operators the floating number syntax can express, by symbol. */
const SYNTAX: readonly (readonly [string, string])[] = [
  ['>=', 'greaterThanOrEqual'],
  ['<=', 'lessThanOrEqual'],
  ['!=', 'notEquals'],
  ['<>', 'notEquals'],
  ['>', 'greaterThan'],
  ['<', 'lessThan'],
  ['=', 'equals'],
];
/** Date operators a floating date input edits in place (the operator is kept). */
const FLOATING_DATE_OPERATORS: readonly string[] = ['on', 'notOn', 'before', 'after', 'onOrBefore', 'onOrAfter'];
/** Set-filter checkboxes rendered at most (the search narrows the rest). */
const SET_LIMIT = 1000;

const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);
const msg = (locale: string, key: string, params: Readonly<Record<string, string | number>> = {}): string => getMessage('dataGrid', key, params, locale);
export const operatorLabel = (locale: string, operator: string): string => msg(locale, `op${capitalize(operator)}`);
export const isConditionKind = (kind: DataGridFilterKind): kind is ConditionKind => kind === 'text' || kind === 'number' || kind === 'bigint' || kind === 'date';
const conditionsOf = (filter: DataGridFilter | undefined): readonly AnyCondition[] => (filter && 'conditions' in filter ? filter.conditions : []);

function debouncer(view: Window, delay: number, run: () => void): { schedule(): void; flush(): void; cancel(): void; pending(): boolean } {
  let timer = 0;
  const cancel = (): void => {
    if (timer) view.clearTimeout(timer);
    timer = 0;
  };
  return {
    schedule() {
      cancel();
      timer = view.setTimeout(() => {
        timer = 0;
        run();
      }, delay);
    },
    flush() {
      if (!timer) return;
      cancel();
      run();
    },
    cancel,
    pending: () => timer !== 0,
  };
}

/** Parse a condition value typed by the user; null when empty or invalid. */
export function parseValue(kind: ConditionKind, text: string): string | number | null {
  const t = text.trim();
  if (t === '') return null;
  switch (kind) {
    case 'text':
      return text;
    case 'number': {
      const n = Number(t);
      return Number.isFinite(n) ? n : null;
    }
    case 'bigint':
      return /^-?\d+$/.test(t) ? t : null;
    case 'date':
      return parsePlainDate(t) ? t : null;
  }
}

function formatValue(kind: DataGridFilterKind, value: string | number | undefined, locale: string): string {
  if (value === undefined) return '';
  if (kind === 'number' && typeof value === 'number') return formatNumber(value, {}, locale);
  if (kind === 'date' && typeof value === 'string') {
    const d = parsePlainDate(value);
    return d ? formatPlainDate(d, { dateStyle: 'medium' }, locale) : value;
  }
  if (kind === 'text') return `"${String(value)}"`;
  return String(value);
}

const setLabel = (value: string | null, locale: string): string => value ?? msg(locale, 'blanks');

/** A readable, localized summary of a filter (floating filters and descriptions). */
export function summarizeFilter(filter: DataGridFilter, locale: string): string {
  switch (filter.kind) {
    case 'boolean':
      return filter.value === null ? operatorLabel(locale, 'blank') : msg(locale, filter.value ? 'yes' : 'no');
    case 'set': {
      const [only] = filter.values;
      return filter.values.length === 1 && only !== undefined ? setLabel(only, locale) : msg(locale, 'selectedCount', { count: formatNumber(filter.values.length, {}, locale) });
    }
    default: {
      const kind = filter.kind;
      const parts = conditionsOf(filter).map((c) => {
        if (operatorNeedsCount(c.operator)) return msg(locale, `count${capitalize(c.operator)}`, { count: formatNumber(c.count ?? 1, {}, locale) });
        const label = operatorLabel(locale, c.operator);
        if (!operatorNeedsValue(c.operator)) return label;
        if (c.operator === 'between') return `${label} ${msg(locale, 'range', { from: formatValue(kind, c.value, locale), to: formatValue(kind, c.to, locale) })}`;
        return `${label} ${formatValue(kind, c.value, locale)}`;
      });
      return parts.join(` ${msg(locale, filter.join === 'or' ? 'joinOr' : 'joinAnd')} `);
    }
  }
}

/** Parse the floating number syntax: `5`, `>5`, `>=5`, `<5`, `<=5`, `=5`, `!=5`, `<>5`, `5..10`. */
export function parseNumberSyntax(text: string, kind: 'number' | 'bigint'): AnyCondition | null | 'invalid' {
  const t = text.trim();
  if (t === '') return null;
  const value = (s: string): string | number | null => parseValue(kind, s);
  const range = /^(.+?)\s*\.\.\s*(.+)$/.exec(t);
  if (range) {
    const from = value(range[1] ?? '');
    const to = value(range[2] ?? '');
    return from === null || to === null ? 'invalid' : { operator: 'between', value: from, to };
  }
  const symbol = SYNTAX.find(([s]) => t.startsWith(s));
  const v = value(symbol ? t.slice(symbol[0].length) : t);
  if (v === null) return 'invalid';
  return { operator: symbol ? symbol[1] : 'equals', value: v };
}

/** The floating number syntax of a condition, or null when the syntax cannot express it. */
export function formatNumberSyntax(c: AnyCondition): string | null {
  if (c.value === undefined) return null;
  const v = String(c.value);
  if (c.operator === 'between') return c.to === undefined ? null : `${v}..${String(c.to)}`;
  if (c.operator === 'equals') return v;
  const symbol = SYNTAX.find(([, op]) => op === c.operator);
  return symbol ? `${symbol[0]}${v}` : null;
}

// ---- Panel -----------------------------------------------------------------------------------

export interface FilterPanelOptions {
  readonly doc: Document;
  readonly locale: string;
  readonly column: FilterUiColumn;
  readonly filter: DataGridFilter | undefined;
  /** Conditions offered for text, number, and date filters. */
  readonly maxConditions: number;
  /** Debounce for typed values (milliseconds); choices apply at once. */
  readonly delay: number;
  /** Distinct values of a set filter (`null` = blanks), in display order. */
  readonly values: () => readonly (string | null)[];
  readonly commit: (filter: FilterDraft) => void;
}

export interface FilterPanel {
  readonly element: HTMLDivElement;
  /** Apply a pending (debounced) change now. */
  flush(): void;
  destroy(): void;
}

interface Editor {
  readonly element: HTMLElement;
  read(): FilterDraft;
  reset(): void;
}

/** `immediate`: apply now (a choice); otherwise after the debounce (typing). */
type Changed = (immediate: boolean) => void;

export const control = <K extends 'input' | 'select'>(doc: Document, tag: K, label: string): HTMLElementTagNameMap[K] => {
  const el = doc.createElement(tag);
  el.className = 'aui-data-grid__filter-control';
  el.setAttribute('aria-label', label);
  return el;
};

export const option = (doc: Document, value: string, text: string): HTMLOptionElement => {
  const el = doc.createElement('option');
  el.value = value;
  el.textContent = text;
  return el;
};

/** A labelled radio group (fieldset and legend). */
function radios(doc: Document, legend: string, choices: readonly (readonly [string, string])[], checked: string, onChange: () => void): { element: HTMLFieldSetElement; value(): string; set(value: string): void } {
  const set = doc.createElement('fieldset');
  set.className = 'aui-data-grid__filter-radios';
  const caption = doc.createElement('legend');
  caption.className = 'aui-data-grid__filter-legend';
  caption.textContent = legend;
  set.append(caption);
  const name = createId('aui-data-grid-filter-radio');
  const inputs: HTMLInputElement[] = [];
  for (const [value, text] of choices) {
    const label = doc.createElement('label');
    label.className = 'aui-data-grid__filter-choice';
    const input = doc.createElement('input');
    input.type = 'radio';
    input.name = name;
    input.value = value;
    input.checked = value === checked;
    input.addEventListener('change', onChange);
    inputs.push(input);
    const span = doc.createElement('span');
    span.textContent = text;
    label.append(input, span);
    set.append(label);
  }
  return {
    element: set,
    value: () => inputs.find((i) => i.checked)?.value ?? '',
    set: (value) => {
      for (const i of inputs) i.checked = i.value === value;
    },
  };
}

interface ConditionRow {
  readonly element: HTMLDivElement;
  read(): AnyCondition | null;
  /** A complete condition (the next one is offered). */
  complete(): boolean;
  reset(): void;
  sync(): void;
}

/** Fill an operator select for a condition kind (date operators in groups; business ones when `business`). */
export function fillOperators(select: HTMLSelectElement, doc: Document, locale: string, kind: ConditionKind, business: boolean): void {
  if (kind === 'date') {
    const groups: [string, readonly string[]][] = [
      ['groupDates', FIXED_DATE_OPERATORS],
      ['groupRelative', RELATIVE_DATE_OPERATORS],
    ];
    if (business) groups.push(['groupBusiness', [...BUSINESS]]);
    for (const [key, ops] of groups) {
      const group = doc.createElement('optgroup');
      group.label = msg(locale, key);
      for (const op of ops) group.append(option(doc, op, operatorLabel(locale, op)));
      select.append(group);
    }
    return;
  }
  for (const op of kind === 'text' ? TEXT_OPERATORS : NUMBER_OPERATORS) select.append(option(doc, op, operatorLabel(locale, op)));
}

export const defaultOperator = (kind: ConditionKind): string => (kind === 'text' ? 'contains' : kind === 'date' ? 'on' : 'equals');

/** Configure a value input for a condition kind. */
export function valueInput(el: HTMLInputElement, kind: ConditionKind): HTMLInputElement {
  el.autocomplete = 'off';
  if (kind === 'number') {
    el.type = 'number';
    el.step = 'any';
  } else if (kind === 'date') {
    el.type = 'date';
  } else {
    el.type = 'text';
    if (kind === 'bigint') el.inputMode = 'numeric';
    el.spellcheck = false;
  }
  return el;
}

function conditionRow(o: FilterPanelOptions, kind: ConditionKind, index: number, initial: AnyCondition | undefined, changed: Changed): ConditionRow {
  const { doc, locale } = o;
  const n = index + 1;
  const row = doc.createElement('div');
  row.className = 'aui-data-grid__filter-condition';
  row.setAttribute('role', 'group');
  row.setAttribute('aria-label', msg(locale, 'condition', { n }));
  const select = control(doc, 'select', msg(locale, 'conditionOperator', { n }));
  fillOperators(select, doc, locale, kind, o.column.business || (initial !== undefined && BUSINESS.has(initial.operator)));
  const fallback = defaultOperator(kind);
  const input = (key: string): HTMLInputElement => valueInput(control(doc, 'input', msg(locale, key, { n })), kind);
  const value = input('conditionValue');
  const to = input('conditionTo');
  const count = control(doc, 'input', msg(locale, 'conditionCount', { n }));
  count.type = 'number';
  count.min = '1';
  count.max = '3660';
  count.step = '1';
  row.append(select, value, to, count);

  const sync = (): void => {
    const op = select.value;
    value.hidden = !operatorNeedsValue(op);
    to.hidden = op !== 'between';
    count.hidden = !operatorNeedsCount(op);
  };
  const fill = (c: AnyCondition | undefined): void => {
    select.value = c?.operator ?? fallback;
    // An operator the list does not offer falls back to the default.
    if (select.value === '') select.value = fallback;
    value.value = c?.value === undefined ? '' : String(c.value);
    to.value = c?.to === undefined ? '' : String(c.to);
    count.value = c?.count === undefined ? '' : String(c.count);
    sync();
  };
  fill(initial);
  select.addEventListener('change', () => {
    sync();
    changed(true);
  });
  for (const el of [value, to, count]) {
    el.addEventListener('input', () => {
      changed(false);
    });
  }
  const read = (): AnyCondition | null => {
    const op = select.value;
    if (operatorNeedsCount(op)) {
      const c = Number(count.value);
      return Number.isInteger(c) && c >= 1 && c <= 3660 ? { operator: op, count: c } : null;
    }
    if (!operatorNeedsValue(op)) return { operator: op };
    const v = parseValue(kind, value.value);
    if (v === null) return null;
    if (op !== 'between') return { operator: op, value: v };
    const t = parseValue(kind, to.value);
    return t === null ? null : { operator: op, value: v, to: t };
  };
  return {
    element: row,
    read,
    complete: () => read() !== null,
    reset: () => {
      fill(undefined);
    },
    sync,
  };
}

function conditionEditor(o: FilterPanelOptions, kind: ConditionKind, changed: Changed): Editor {
  const { doc, locale } = o;
  const existing = conditionsOf(o.filter);
  const count = Math.min(10, Math.max(1, o.maxConditions, existing.length));
  const root = doc.createElement('div');
  root.className = 'aui-data-grid__filter-conditions';
  const update = (immediate: boolean): void => {
    visibility();
    changed(immediate);
  };
  const rows: ConditionRow[] = [];
  for (let i = 0; i < count; i++) rows.push(conditionRow(o, kind, i, existing[i], update));
  const initialJoin = o.filter && 'join' in o.filter && o.filter.join === 'or' ? 'or' : 'and';
  const join = radios(doc, msg(locale, 'combine'), [['and', msg(locale, 'joinAnd')], ['or', msg(locale, 'joinOr')]], initialJoin, () => {
    changed(true);
  });
  join.element.classList.add('aui-data-grid__filter-join');
  const [first, ...rest] = rows;
  if (first) root.append(first.element);
  root.append(join.element, ...rest.map((r) => r.element));
  /** A condition is offered once the one before it is complete. */
  const visibility = (): void => {
    let show = true;
    for (const r of rows) {
      r.element.hidden = !show;
      show = show && r.complete();
    }
    join.element.hidden = rows[1]?.element.hidden !== false;
  };
  visibility();
  return {
    element: root,
    read: () => {
      const conditions = rows.filter((r) => !r.element.hidden).map((r) => r.read()).filter((c): c is AnyCondition => c !== null);
      if (conditions.length === 0) return null;
      return { kind, ...(conditions.length > 1 ? { join: join.value() } : {}), conditions };
    },
    reset: () => {
      for (const r of rows) r.reset();
      join.set('and');
      visibility();
    },
  };
}

function booleanEditor(o: FilterPanelOptions, changed: Changed): Editor {
  const { doc, locale } = o;
  const current = o.filter?.kind === 'boolean' ? (o.filter.value === null ? 'blank' : String(o.filter.value)) : '';
  const group = radios(
    doc,
    msg(locale, 'show'),
    [
      ['', msg(locale, 'any')],
      ['true', msg(locale, 'yes')],
      ['false', msg(locale, 'no')],
      ['blank', operatorLabel(locale, 'blank')],
    ],
    current,
    () => {
      changed(true);
    },
  );
  return {
    element: group.element,
    read: () => {
      const v = group.value();
      return v === '' ? null : { kind: 'boolean', value: v === 'blank' ? null : v === 'true' };
    },
    reset: () => {
      group.set('');
    },
  };
}

function setEditor(o: FilterPanelOptions, changed: Changed): Editor {
  const { doc, locale } = o;
  const all = o.values();
  const selected = new Set<string | null>(o.filter?.kind === 'set' ? o.filter.values : all);
  const norm = normalizer(locale, false, false);
  // Normalized labels for the search, built on the first search (opening stays fast for many values).
  let labels: string[] | null = null;
  const root = doc.createElement('div');
  root.className = 'aui-data-grid__filter-set';
  const search = control(doc, 'input', msg(locale, 'searchValues'));
  search.type = 'search';
  search.autocomplete = 'off';
  search.spellcheck = false;
  const allLabel = doc.createElement('label');
  allLabel.className = 'aui-data-grid__filter-choice aui-data-grid__filter-select-all';
  const selectAll = doc.createElement('input');
  selectAll.type = 'checkbox';
  const allText = doc.createElement('span');
  allText.textContent = msg(locale, 'selectAll');
  allLabel.append(selectAll, allText);
  const list = doc.createElement('div');
  list.className = 'aui-data-grid__filter-values';
  list.setAttribute('role', 'group');
  list.setAttribute('aria-label', msg(locale, 'values'));
  const note = doc.createElement('p');
  note.className = 'aui-data-grid__filter-note';
  note.setAttribute('aria-live', 'polite');
  root.append(search, allLabel, list, note);

  let matches: number[] = [];
  const boxes = new Map<HTMLInputElement, string | null>();
  const syncAll = (): void => {
    const on = matches.filter((i) => selected.has(all[i] ?? null)).length;
    selectAll.checked = on > 0 && on === matches.length;
    selectAll.indeterminate = on > 0 && on < matches.length;
    selectAll.disabled = matches.length === 0;
  };
  const render = (): void => {
    const q = norm(search.value.trim());
    if (q === '') matches = all.map((_, i) => i);
    else {
      const normalized = (labels ??= all.map((v) => norm(setLabel(v, locale))));
      matches = [];
      for (let i = 0; i < all.length; i++) if ((normalized[i] ?? '').includes(q)) matches.push(i);
    }
    boxes.clear();
    const items: HTMLElement[] = [];
    for (const i of matches.slice(0, SET_LIMIT)) {
      const value = all[i] ?? null;
      const label = doc.createElement('label');
      label.className = 'aui-data-grid__filter-choice';
      const box = doc.createElement('input');
      box.type = 'checkbox';
      box.checked = selected.has(value);
      boxes.set(box, value);
      const text = doc.createElement('span');
      text.textContent = setLabel(value, locale);
      if (value === null) text.className = 'aui-data-grid__filter-blank';
      label.append(box, text);
      items.push(label);
    }
    list.replaceChildren(...items);
    const shown = Math.min(matches.length, SET_LIMIT);
    note.textContent =
      matches.length === 0 ? msg(locale, 'noValues') : matches.length > SET_LIMIT ? msg(locale, 'valuesLimited', { shown: formatNumber(shown, {}, locale), count: formatNumber(matches.length, {}, locale) }) : '';
    note.hidden = note.textContent === '';
    syncAll();
  };
  list.addEventListener('change', (event) => {
    const box = event.target;
    if (!(box instanceof HTMLInputElement) || !boxes.has(box)) return;
    const value = boxes.get(box) ?? null;
    if (box.checked) selected.add(value);
    else selected.delete(value);
    syncAll();
    changed(true);
  });
  selectAll.addEventListener('change', () => {
    for (const i of matches) {
      const value = all[i] ?? null;
      if (selectAll.checked) selected.add(value);
      else selected.delete(value);
    }
    for (const [box, value] of boxes) box.checked = selected.has(value);
    syncAll();
    changed(true);
  });
  search.addEventListener('input', render);
  render();
  return {
    element: root,
    read: () => (all.every((v) => selected.has(v)) ? null : { kind: 'set', values: all.filter((v) => selected.has(v)) }),
    reset: () => {
      for (const v of all) selected.add(v);
      search.value = '';
      render();
    },
  };
}

/** The filter panel: a non-modal dialog whose changes apply live (typed values after `delay`). */
export function createFilterPanel(o: FilterPanelOptions): FilterPanel {
  const { doc, locale, column } = o;
  const view = doc.defaultView ?? window;
  const el = doc.createElement('div');
  el.className = 'aui-data-grid__filter-panel';
  el.id = createId('aui-data-grid-filter');
  el.popover = 'manual';
  el.setAttribute('role', 'dialog');
  el.tabIndex = -1;
  const title = doc.createElement('h2');
  title.className = 'aui-data-grid__filter-title';
  title.id = createId('aui-data-grid-filter-title');
  title.textContent = msg(locale, 'filterTitle', { column: column.header });
  el.setAttribute('aria-labelledby', title.id);
  const form = doc.createElement('form');
  form.className = 'aui-data-grid__filter-form';
  form.noValidate = true;
  el.append(title, form);

  let last = JSON.stringify(o.filter ?? null);
  const send = (draft: FilterDraft): void => {
    const key = JSON.stringify(draft);
    if (key === last) return;
    last = key;
    o.commit(draft);
  };
  const debounce = debouncer(view, o.delay, () => {
    send(editor.read());
  });
  const changed: Changed = (immediate) => {
    if (!immediate) {
      debounce.schedule();
      return;
    }
    debounce.cancel();
    send(editor.read());
  };
  const kind = column.kind;
  // Editors call `changed` only on user input, after `editor` is assigned.
  const editor: Editor = isConditionKind(kind) ? conditionEditor(o, kind, changed) : kind === 'boolean' ? booleanEditor(o, changed) : setEditor(o, changed);
  const clear = doc.createElement('button');
  clear.type = 'button';
  clear.className = 'aui-data-grid__filter-clear';
  clear.textContent = msg(locale, 'clearFilter');
  clear.addEventListener('click', () => {
    debounce.cancel();
    editor.reset();
    send(null);
  });
  const actions = doc.createElement('div');
  actions.className = 'aui-data-grid__filter-actions';
  actions.append(clear);
  form.append(editor.element, actions);
  // Enter in a field applies at once.
  form.addEventListener('submit', (event) => {
    event.preventDefault();
    changed(true);
  });
  return {
    element: el,
    flush: () => {
      debounce.flush();
    },
    destroy: () => {
      debounce.cancel();
    },
  };
}

// ---- Floating filters ------------------------------------------------------------------------

export interface FloatingFilterOptions {
  readonly doc: Document;
  readonly locale: string;
  readonly column: FilterUiColumn;
  readonly delay: number;
  readonly commit: (filter: FilterDraft) => void;
  /** Open the full filter panel from `anchor`. */
  readonly openPanel: (anchor: HTMLElement) => void;
}

export interface FloatingFilter {
  readonly element: HTMLElement;
  /** Show the current filter (an editable value, or a read-only summary of a complex filter). */
  sync(filter: DataGridFilter | undefined): void;
  flush(): void;
  destroy(): void;
}

/** A compact filter control for the floating filter row. */
export function createFloatingFilter(o: FloatingFilterOptions): FloatingFilter {
  const { doc, locale, column } = o;
  const view = doc.defaultView ?? window;
  const name = msg(locale, 'filterTitle', { column: column.header });
  const kind = column.kind;
  if (kind === 'boolean') {
    const select = control(doc, 'select', name);
    select.classList.add('aui-data-grid__floating-control');
    select.append(option(doc, '', msg(locale, 'any')), option(doc, 'true', msg(locale, 'yes')), option(doc, 'false', msg(locale, 'no')), option(doc, 'blank', operatorLabel(locale, 'blank')));
    select.addEventListener('change', () => {
      const v = select.value;
      o.commit(v === '' ? null : { kind: 'boolean', value: v === 'blank' ? null : v === 'true' });
    });
    return {
      element: select,
      sync: (filter) => {
        select.value = filter?.kind === 'boolean' ? (filter.value === null ? 'blank' : String(filter.value)) : '';
      },
      flush: () => undefined,
      destroy: () => undefined,
    };
  }
  if (kind === 'set') {
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'aui-data-grid__filter-control aui-data-grid__floating-control aui-data-grid__floating-summary';
    button.setAttribute('aria-haspopup', 'dialog');
    button.setAttribute('aria-expanded', 'false');
    const prefix = doc.createElement('span');
    prefix.className = 'aui-data-grid__visually-hidden';
    prefix.textContent = `${name}: `;
    const text = doc.createElement('span');
    button.append(prefix, text);
    button.addEventListener('click', () => {
      o.openPanel(button);
    });
    return {
      element: button,
      sync: (filter) => {
        text.textContent = filter ? summarizeFilter(filter, locale) : msg(locale, 'any');
      },
      flush: () => undefined,
      destroy: () => undefined,
    };
  }
  // Text, number, bigint, date: one input; complex filters show a read-only summary.
  const input = control(doc, 'input', name);
  input.classList.add('aui-data-grid__floating-control');
  input.autocomplete = 'off';
  input.spellcheck = false;
  if (kind === 'number' || kind === 'bigint') input.title = msg(locale, 'numberSyntax');
  const defaultOperator = kind === 'text' ? 'contains' : kind === 'date' ? 'on' : 'equals';
  let operator = defaultOperator;
  const editable = (filter: DataGridFilter | undefined): string | null => {
    if (!filter) return '';
    const conditions = conditionsOf(filter);
    const [c] = conditions;
    if (conditions.length !== 1 || !c) return null;
    if (kind === 'number' || kind === 'bigint') return formatNumberSyntax(c);
    if (kind === 'date') return FLOATING_DATE_OPERATORS.includes(c.operator) && typeof c.value === 'string' ? c.value : null;
    return operatorNeedsValue(c.operator) && c.operator !== 'between' && typeof c.value === 'string' ? c.value : null;
  };
  const read = (): FilterDraft | 'invalid' => {
    const raw = input.value;
    if (kind === 'number' || kind === 'bigint') {
      const c = parseNumberSyntax(raw, kind);
      return c === null || c === 'invalid' ? c : { kind, conditions: [c] };
    }
    if (raw.trim() === '') return null;
    if (kind === 'date') return parsePlainDate(raw) ? { kind, conditions: [{ operator, value: raw }] } : 'invalid';
    return { kind, conditions: [{ operator, value: raw }] };
  };
  let last = 'null';
  const apply = (): void => {
    const draft = read();
    if (draft === 'invalid') input.setAttribute('aria-invalid', 'true');
    else input.removeAttribute('aria-invalid');
    if (draft === 'invalid') return;
    const key = JSON.stringify(draft);
    if (key === last) return;
    last = key;
    o.commit(draft);
  };
  const debounce = debouncer(view, o.delay, apply);
  input.addEventListener('input', () => {
    if (!input.readOnly) debounce.schedule();
  });
  input.addEventListener('keydown', (event) => {
    if (event.key !== 'Enter' || event.altKey || event.ctrlKey || event.metaKey) return;
    event.preventDefault();
    if (input.readOnly) o.openPanel(input);
    else {
      debounce.cancel();
      apply();
    }
  });
  return {
    element: input,
    sync: (filter) => {
      last = JSON.stringify(filter ?? null);
      const value = editable(filter);
      // Do not disturb a value the user is typing (focused, or typed and not yet applied).
      if (debounce.pending() || (doc.activeElement === input && value !== null && !input.readOnly)) return;
      const c = conditionsOf(filter)[0];
      operator = value !== null && c && kind !== 'number' && kind !== 'bigint' ? c.operator : defaultOperator;
      input.readOnly = value === null;
      input.type = kind === 'date' && value !== null ? 'date' : 'text';
      input.value = value ?? (filter ? summarizeFilter(filter, locale) : '');
      input.removeAttribute('aria-invalid');
    },
    flush: () => {
      debounce.flush();
    },
    destroy: () => {
      debounce.cancel();
    },
  };
}
