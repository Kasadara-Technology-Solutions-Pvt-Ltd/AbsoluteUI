/**
 * Data Grid advanced filter UI (docs/PLAN-R11-G2.md, G2c): the expression bar (an editable
 * combobox with type-ahead suggestions for columns, operators, set values, and keywords; errors
 * are shown with their position, selected in the field, and announced) and the builder dialog
 * (the same model as a tree of groups and conditions, edited with native labelled controls and
 * buttons for every structural change: add, remove, move up and down).
 */
import { createId, formatNumber, getMessage, registerMessages } from '@absoluteui/core';
import { announce } from '@absoluteui/utilities';
import { Dialog } from '../dialog/dialog.js';
import {
  ADVANCED_MAX_DEPTH,
  formatAdvancedExpression,
  isAdvancedGroup,
  parseAdvancedExpression,
  suggestAdvanced,
  type AdvancedColumn,
  type AdvancedFilterError,
  type AdvancedSuggestion,
  type DataGridAdvancedFilter,
  type DataGridAdvancedGroup,
} from './advanced-filter.js';
import { control, defaultOperator, fillOperators, isConditionKind, operatorLabel, option, parseValue, valueInput, type FilterDraft } from './filter-ui.js';
import { operatorNeedsCount, operatorNeedsValue, type DataGridFilterJoin } from './filter.js';

registerMessages('dataGrid', 'en', {
  advancedLabel: 'Filter',
  advancedGroup: 'Advanced filter',
  advancedHint: 'Columns in brackets, text and dates in quotes, combined with and, or, and parentheses. For example: [Name] contains "ann" and [Age] >= 30',
  advancedApply: 'Apply',
  advancedClear: 'Clear',
  advancedBuilder: 'Builder',
  advancedSuggestions: 'Suggestions',
  advancedApplied: 'Filter applied',
  advancedError: '{message} at character {position}',
  errUnexpectedCharacter: 'Unexpected character "{character}"',
  errUnterminatedColumn: 'Column name is missing its closing ]',
  errUnterminatedString: 'Text is missing its closing quote',
  errExpectedColumn: 'Expected a column in brackets, for example [Name]',
  errUnknownColumn: 'Unknown column "{column}"',
  errExpectedOperator: 'Expected an operator for {column}',
  errExpectedValue: 'Expected a value',
  errInvalidNumber: 'Expected a number',
  errInvalidDate: 'Expected a date in quotes, for example "2026-01-31"',
  errInvalidCount: 'Expected a number of days from 1 to 3660',
  errExpectedAnd: 'Expected "and" between the two values',
  errExpectedJoin: 'Expected "and" or "or"',
  errExpectedClose: 'Expected a closing parenthesis',
  errUnexpectedClose: 'Unexpected closing parenthesis',
  errTooDeep: 'Groups are nested too deeply (at most {depth} levels)',
  errTooLong: 'Too many conditions (at most {count})',
  builderTitle: 'Filter builder',
  builderRoot: 'All rows',
  builderGroup: 'Group {path}',
  builderCondition: 'Condition {path}',
  builderJoin: '{item}: combine with',
  builderAll: 'All conditions (AND)',
  builderAnyOne: 'Any condition (OR)',
  builderColumn: '{item} column',
  builderOperator: '{item} operator',
  builderValue: '{item} value',
  builderTo: '{item} end value',
  builderCount: '{item} number of days',
  builderValues: '{item} values',
  builderBoolean: '{item} value',
  builderAddCondition: 'Add condition',
  builderAddGroup: 'Add group',
  builderAddConditionTo: 'Add condition to {item}',
  builderAddGroupTo: 'Add group to {item}',
  builderUp: 'Up',
  builderDown: 'Down',
  builderRemoveShort: 'Remove',
  builderMoveUp: 'Move {item} up',
  builderMoveDown: 'Move {item} down',
  builderRemove: 'Remove {item}',
  builderEmpty: 'No conditions: every row is shown.',
  builderCancel: 'Cancel',
});

const msg = (locale: string, key: string, params: Readonly<Record<string, string | number>> = {}): string => getMessage('dataGrid', key, params, locale);
const capitalize = (s: string): string => s.charAt(0).toUpperCase() + s.slice(1);

/** A localized message for a syntax error, with its 1-based position. */
export function describeAdvancedError(error: AdvancedFilterError, locale: string): string {
  const message = msg(locale, `err${capitalize(error.code)}`, error.params);
  return msg(locale, 'advancedError', { message, position: formatNumber(error.start + 1, {}, locale) });
}

/** Columns for the advanced filter, with whether a business calendar is set. */
export interface AdvancedUiColumn extends AdvancedColumn {
  readonly business: boolean;
}

// ---- Expression bar ----------------------------------------------------------------------------

export interface AdvancedBarOptions {
  readonly doc: Document;
  readonly locale: string;
  readonly columns: () => readonly AdvancedUiColumn[];
  readonly values: (column: string) => readonly (string | null)[];
  /** Apply a parsed model (null clears). */
  readonly commit: (filter: DataGridAdvancedFilter | null) => void;
  readonly openBuilder: () => void;
}

export interface AdvancedBar {
  readonly element: HTMLDivElement;
  readonly input: HTMLInputElement;
  /** Opens the builder; focus returns here when the builder closes. */
  readonly builderButton: HTMLButtonElement;
  /** Show the current model (unless the user is editing the text). */
  sync(filter: DataGridAdvancedFilter | null): void;
  destroy(): void;
}

export function createAdvancedBar(o: AdvancedBarOptions): AdvancedBar {
  const { doc, locale } = o;
  const root = doc.createElement('div');
  root.className = 'aui-data-grid__advanced';
  root.setAttribute('role', 'group');
  root.setAttribute('aria-label', msg(locale, 'advancedGroup'));
  const inputId = createId('aui-data-grid-advanced');
  const listId = createId('aui-data-grid-advanced-list');
  const hintId = createId('aui-data-grid-advanced-hint');
  const errorId = createId('aui-data-grid-advanced-error');
  const label = doc.createElement('label');
  label.className = 'aui-data-grid__advanced-label';
  label.htmlFor = inputId;
  label.textContent = msg(locale, 'advancedLabel');
  const field = doc.createElement('div');
  field.className = 'aui-data-grid__advanced-field';
  const input = doc.createElement('input');
  input.id = inputId;
  input.type = 'text';
  input.className = 'aui-data-grid__filter-control aui-data-grid__advanced-input';
  input.autocomplete = 'off';
  input.spellcheck = false;
  input.setAttribute('role', 'combobox');
  input.setAttribute('aria-autocomplete', 'list');
  input.setAttribute('aria-expanded', 'false');
  input.setAttribute('aria-controls', listId);
  input.setAttribute('aria-describedby', `${hintId} ${errorId}`);
  const list = doc.createElement('div');
  list.id = listId;
  list.className = 'aui-data-grid__advanced-list';
  list.setAttribute('role', 'listbox');
  list.setAttribute('aria-label', msg(locale, 'advancedSuggestions'));
  list.hidden = true;
  field.append(input, list);
  const button = (text: string, onClick: () => void): HTMLButtonElement => {
    const b = doc.createElement('button');
    b.type = 'button';
    b.className = 'aui-data-grid__filter-clear aui-data-grid__advanced-button';
    b.textContent = text;
    b.addEventListener('click', onClick);
    return b;
  };
  const hint = doc.createElement('p');
  hint.id = hintId;
  hint.className = 'aui-data-grid__visually-hidden';
  hint.textContent = msg(locale, 'advancedHint');
  const error = doc.createElement('p');
  error.id = errorId;
  error.className = 'aui-data-grid__advanced-error';
  error.hidden = true;

  let suggestions: { from: number; to: number; items: readonly AdvancedSuggestion[] } | null = null;
  let active = -1;
  /** The text differs from the applied model (sync leaves it alone). */
  let dirty = false;

  const close = (): void => {
    suggestions = null;
    active = -1;
    list.hidden = true;
    list.replaceChildren();
    input.setAttribute('aria-expanded', 'false');
    input.removeAttribute('aria-activedescendant');
  };
  const highlight = (index: number): void => {
    active = index;
    const options = [...list.children];
    options.forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === index));
    });
    const current = options[index];
    if (current) {
      input.setAttribute('aria-activedescendant', current.id);
      current.scrollIntoView({ block: 'nearest' });
    } else input.removeAttribute('aria-activedescendant');
  };
  const open = (): void => {
    const cursor = input.selectionStart ?? input.value.length;
    const next = suggestAdvanced(input.value, cursor, o.columns(), o.values);
    if (!next) {
      close();
      return;
    }
    suggestions = next;
    list.replaceChildren(
      ...next.items.map((item, i) => {
        const el = doc.createElement('div');
        el.id = `${listId}-${String(i)}`;
        el.className = 'aui-data-grid__advanced-option';
        el.setAttribute('role', 'option');
        el.setAttribute('aria-selected', 'false');
        el.textContent = item.label;
        // Keep focus in the field while choosing with a pointer.
        el.addEventListener('pointerdown', (event) => {
          event.preventDefault();
        });
        el.addEventListener('click', () => {
          accept(i);
        });
        return el;
      }),
    );
    list.hidden = false;
    input.setAttribute('aria-expanded', 'true');
    highlight(-1);
  };
  const accept = (index: number): void => {
    const s = suggestions;
    const item = s?.items[index];
    if (!s || !item) return;
    const value = input.value;
    input.value = value.slice(0, s.from) + item.insert + value.slice(s.to);
    const caret = s.from + item.insert.length;
    input.setSelectionRange(caret, caret);
    dirty = true;
    clearError();
    open();
  };
  const clearError = (): void => {
    error.hidden = true;
    error.textContent = '';
    input.removeAttribute('aria-invalid');
  };
  const apply = (): void => {
    close();
    const result = parseAdvancedExpression(input.value, o.columns());
    if (!result.ok) {
      const text = describeAdvancedError(result.error, locale);
      error.textContent = text;
      error.hidden = false;
      input.setAttribute('aria-invalid', 'true');
      // Select the offending text so it can be corrected at once.
      input.focus();
      input.setSelectionRange(result.error.start, Math.max(result.error.end, result.error.start));
      announce(text, 'assertive', doc);
      return;
    }
    clearError();
    dirty = false;
    o.commit(result.filter);
  };
  input.addEventListener('input', () => {
    dirty = true;
    clearError();
    open();
  });
  input.addEventListener('keydown', (event) => {
    const count = suggestions?.items.length ?? 0;
    switch (event.key) {
      case 'ArrowDown':
        event.preventDefault();
        if (!suggestions) open();
        else highlight(count === 0 ? -1 : (active + 1) % count);
        return;
      case 'ArrowUp':
        if (!suggestions) return;
        event.preventDefault();
        highlight(active <= 0 ? count - 1 : active - 1);
        return;
      case 'Enter':
        event.preventDefault();
        if (suggestions && active >= 0) accept(active);
        else apply();
        return;
      case 'Escape':
        if (!suggestions) return;
        event.preventDefault();
        event.stopPropagation();
        close();
        return;
      case 'Tab':
        close();
        return;
      default:
    }
  });
  input.addEventListener('blur', close);
  const builder = button(msg(locale, 'advancedBuilder'), () => {
    close();
    o.openBuilder();
  });
  builder.setAttribute('aria-haspopup', 'dialog');
  root.append(
    label,
    field,
    button(msg(locale, 'advancedApply'), apply),
    builder,
    button(msg(locale, 'advancedClear'), () => {
      input.value = '';
      dirty = false;
      clearError();
      close();
      o.commit(null);
    }),
    hint,
    error,
  );
  return {
    element: root,
    input,
    builderButton: builder,
    sync: (filter) => {
      if (dirty && doc.activeElement === input) return;
      dirty = false;
      input.value = formatAdvancedExpression(filter, o.columns());
      clearError();
    },
    destroy: close,
  };
}

// ---- Builder -------------------------------------------------------------------------------------

interface DraftCondition {
  readonly type: 'condition';
  column: string;
  operator: string;
  value: string;
  to: string;
  count: string;
  /** Set values (null = blanks). */
  values: (string | null)[];
  /** Boolean: 'true' | 'false' | 'blank'. */
  flag: string;
}
interface DraftGroup {
  readonly type: 'group';
  join: DataGridFilterJoin;
  items: DraftItem[];
}
type DraftItem = DraftCondition | DraftGroup;

function newCondition(column: AdvancedUiColumn | undefined): DraftCondition {
  const kind = column?.kind ?? 'text';
  return { type: 'condition', column: column?.id ?? '', operator: isConditionKind(kind) ? defaultOperator(kind) : '', value: '', to: '', count: '', values: [], flag: 'true' };
}

function toDraft(model: DataGridAdvancedFilter | null): DraftGroup {
  const group = (g: DataGridAdvancedGroup): DraftGroup => ({
    type: 'group',
    join: g.join,
    items: g.items.map((it): DraftItem => {
      if (isAdvancedGroup(it)) return group(it);
      const f = it.filter;
      const base = newCondition(undefined);
      if (f.kind === 'boolean') return { ...base, column: it.column, flag: f.value === null ? 'blank' : String(f.value) };
      if (f.kind === 'set') return { ...base, column: it.column, values: [...f.values] };
      const parts = (f.conditions as readonly { operator: string; value?: string | number; to?: string | number; count?: number }[]).map(
        (c): DraftCondition => ({ ...base, column: it.column, operator: c.operator, value: c.value === undefined ? '' : String(c.value), to: c.to === undefined ? '' : String(c.to), count: c.count === undefined ? '' : String(c.count) }),
      );
      const [only] = parts;
      return parts.length === 1 && only ? only : { type: 'group', join: f.join ?? 'and', items: parts };
    }),
  });
  return model ? group(model) : { type: 'group', join: 'and', items: [] };
}

/** The draft as an unvalidated model (incomplete conditions and empty groups left out). */
function fromDraft(draft: DraftGroup, columns: readonly AdvancedUiColumn[]): FilterDraft {
  const byId = new Map(columns.map((c) => [c.id, c]));
  const item = (it: DraftItem): Record<string, unknown> | null => {
    if (it.type === 'group') {
      const items = it.items.map(item).filter((x): x is Record<string, unknown> => x !== null);
      return items.length === 0 ? null : { join: it.join, items };
    }
    const column = byId.get(it.column);
    if (!column) return null;
    const kind = column.kind;
    if (kind === 'boolean') return { column: it.column, filter: { kind, value: it.flag === 'blank' ? null : it.flag === 'true' } };
    if (kind === 'set') return { column: it.column, filter: { kind, values: it.values } };
    const op = it.operator;
    let condition: Record<string, unknown>;
    if (operatorNeedsCount(op)) {
      const n = Number(it.count);
      if (!(Number.isInteger(n) && n >= 1 && n <= 3660)) return null;
      condition = { operator: op, count: n };
    } else if (!operatorNeedsValue(op)) {
      condition = { operator: op };
    } else {
      const value = parseValue(kind, it.value);
      if (value === null) return null;
      if (op === 'between') {
        const to = parseValue(kind, it.to);
        if (to === null) return null;
        condition = { operator: op, value, to };
      } else condition = { operator: op, value };
    }
    return { column: it.column, filter: { kind, conditions: [condition] } };
  };
  return item(draft);
}

export interface AdvancedBuilderOptions {
  readonly doc: Document;
  readonly locale: string;
  readonly columns: readonly AdvancedUiColumn[];
  readonly filter: DataGridAdvancedFilter | null;
  readonly values: (column: string) => readonly (string | null)[];
  readonly commit: (filter: FilterDraft) => void;
  /** Called after the dialog closed and was removed. */
  readonly closed?: () => void;
}

/** Set values offered in the builder's multiple select (the expression bar accepts any value). */
const BUILDER_VALUE_LIMIT = 1000;

/** Open the builder as a modal dialog; Apply commits, Cancel and Escape discard. */
export function openAdvancedBuilder(o: AdvancedBuilderOptions): Dialog {
  const { doc, locale, columns } = o;
  const draft = toDraft(o.filter);
  const body = doc.createElement('div');
  body.className = 'aui-data-grid__builder';
  const dialog = Dialog.create(
    {
      title: msg(locale, 'builderTitle'),
      content: body,
      size: 'lg',
      actions: [
        { label: msg(locale, 'builderCancel'), value: 'cancel' },
        { label: msg(locale, 'advancedApply'), value: 'apply', variant: 'primary' },
      ],
    },
    doc,
  );
  dialog.element.classList.add('aui-data-grid__builder-dialog');

  const pathText = (path: readonly number[]): string => path.map((i) => String(i + 1)).join('.');
  const itemName = (it: DraftItem, path: readonly number[]): string => (path.length === 0 ? msg(locale, 'builderRoot') : msg(locale, it.type === 'group' ? 'builderGroup' : 'builderCondition', { path: pathText(path) }));
  const keyed = <T extends HTMLElement>(el: T, key: string): T => {
    el.dataset.focusKey = key;
    return el;
  };
  const smallButton = (text: string, label: string, key: string, onClick: () => void, disabled = false): HTMLButtonElement => {
    const b = keyed(doc.createElement('button'), key);
    b.type = 'button';
    b.className = 'aui-data-grid__builder-button';
    b.textContent = text;
    if (label !== text) b.setAttribute('aria-label', label);
    b.disabled = disabled;
    b.addEventListener('click', onClick);
    return b;
  };

  /** Re-render after a structural change and put focus on the control with `focusKey`. */
  const render = (focusKey?: string): void => {
    body.replaceChildren(group(draft, []));
    if (focusKey === undefined) return;
    const find = (key: string): HTMLElement | null => {
      const el = body.querySelector<HTMLElement>(`[data-focus-key="${key}"]`);
      return el && !(el instanceof HTMLButtonElement && el.disabled) ? el : null;
    };
    // A moved item at the edge has that move button disabled: its opposite button takes focus.
    const opposite = focusKey.endsWith(':up') ? focusKey.replace(/:up$/, ':down') : focusKey.endsWith(':down') ? focusKey.replace(/:down$/, ':up') : focusKey;
    (find(focusKey) ?? find(opposite) ?? body.querySelector<HTMLElement>('select, input, button'))?.focus();
  };

  const conditionRow = (c: DraftCondition, path: readonly number[], name: string): HTMLElement => {
    const key = pathText(path);
    const row = doc.createElement('div');
    row.className = 'aui-data-grid__builder-condition';
    const column = columns.find((x) => x.id === c.column);
    const columnSelect = keyed(control(doc, 'select', msg(locale, 'builderColumn', { item: name })), `${key}:column`);
    for (const col of columns) columnSelect.append(option(doc, col.id, col.header));
    columnSelect.value = c.column;
    columnSelect.addEventListener('change', () => {
      const next = columns.find((x) => x.id === columnSelect.value);
      Object.assign(c, newCondition(next));
      render(`${key}:column`);
    });
    row.append(columnSelect);
    if (!column) return row;
    const kind = column.kind;
    if (kind === 'boolean') {
      const select = control(doc, 'select', msg(locale, 'builderBoolean', { item: name }));
      select.append(option(doc, 'true', msg(locale, 'yes')), option(doc, 'false', msg(locale, 'no')), option(doc, 'blank', operatorLabel(locale, 'blank')));
      select.value = c.flag;
      select.addEventListener('change', () => {
        c.flag = select.value;
      });
      row.append(select);
      return row;
    }
    if (kind === 'set') {
      const select = control(doc, 'select', msg(locale, 'builderValues', { item: name }));
      select.multiple = true;
      select.size = 6;
      const all = o.values(column.id);
      const shown = all.slice(0, BUILDER_VALUE_LIMIT);
      // Values already chosen stay available even beyond the limit.
      for (const v of c.values) if (!shown.includes(v)) shown.push(v);
      for (const v of shown) {
        const opt = option(doc, v ?? '', v ?? msg(locale, 'blanks'));
        opt.dataset.blank = String(v === null);
        opt.selected = c.values.includes(v);
        select.append(opt);
      }
      select.addEventListener('change', () => {
        c.values = [...select.selectedOptions].map((opt) => (opt.dataset.blank === 'true' ? null : opt.value));
      });
      row.append(select);
      return row;
    }
    if (!isConditionKind(kind)) return row;
    const operator = control(doc, 'select', msg(locale, 'builderOperator', { item: name }));
    fillOperators(operator, doc, locale, kind, column.business || ['workingDay', 'nonWorkingDay', 'holiday', 'lastBusinessDays', 'nextBusinessDays'].includes(c.operator));
    operator.value = c.operator;
    if (operator.value === '') operator.value = defaultOperator(kind);
    c.operator = operator.value;
    const input = (labelKey: string, read: () => string, write: (v: string) => void): HTMLInputElement => {
      const el = valueInput(control(doc, 'input', msg(locale, labelKey, { item: name })), kind);
      el.value = read();
      el.addEventListener('input', () => {
        write(el.value);
      });
      return el;
    };
    const value = input('builderValue', () => c.value, (v) => (c.value = v));
    const to = input('builderTo', () => c.to, (v) => (c.to = v));
    const count = input('builderCount', () => c.count, (v) => (c.count = v));
    count.type = 'number';
    count.min = '1';
    count.max = '3660';
    count.step = '1';
    const sync = (): void => {
      value.hidden = !operatorNeedsValue(c.operator);
      to.hidden = c.operator !== 'between';
      count.hidden = !operatorNeedsCount(c.operator);
    };
    operator.addEventListener('change', () => {
      c.operator = operator.value;
      sync();
    });
    sync();
    row.append(operator, value, to, count);
    return row;
  };

  const group = (g: DraftGroup, path: readonly number[]): HTMLElement => {
    const name = itemName(g, path);
    const key = pathText(path) || 'root';
    const set = doc.createElement('fieldset');
    set.className = 'aui-data-grid__builder-group';
    const legend = doc.createElement('legend');
    legend.className = 'aui-data-grid__builder-legend';
    legend.textContent = name;
    const join = keyed(control(doc, 'select', msg(locale, 'builderJoin', { item: name })), `${key}:join`);
    join.append(option(doc, 'and', msg(locale, 'builderAll')), option(doc, 'or', msg(locale, 'builderAnyOne')));
    join.value = g.join;
    join.addEventListener('change', () => {
      g.join = join.value === 'or' ? 'or' : 'and';
    });
    set.append(legend, join);
    const list = doc.createElement('ol');
    list.className = 'aui-data-grid__builder-items';
    g.items.forEach((it, i) => {
      const itemPath = [...path, i];
      const itemKey = pathText(itemPath);
      const itemLabel = itemName(it, itemPath);
      const li = doc.createElement('li');
      li.className = 'aui-data-grid__builder-item';
      const content = it.type === 'group' ? group(it, itemPath) : conditionRow(it, itemPath, itemLabel);
      const tools = doc.createElement('div');
      tools.className = 'aui-data-grid__builder-tools';
      const move = (delta: number): void => {
        const target = i + delta;
        const other = g.items[target];
        if (!other) return;
        g.items[target] = it;
        g.items[i] = other;
        render(`${pathText([...path, target])}:${delta < 0 ? 'up' : 'down'}`);
      };
      tools.append(
        smallButton(msg(locale, 'builderUp'), msg(locale, 'builderMoveUp', { item: itemLabel }), `${itemKey}:up`, () => {
          move(-1);
        }, i === 0),
        smallButton(msg(locale, 'builderDown'), msg(locale, 'builderMoveDown', { item: itemLabel }), `${itemKey}:down`, () => {
          move(1);
        }, i === g.items.length - 1),
        smallButton(msg(locale, 'builderRemoveShort'), msg(locale, 'builderRemove', { item: itemLabel }), `${itemKey}:remove`, () => {
          g.items.splice(i, 1);
          // Focus the item that took its place, else the one before, else the group's Add button.
          const next = g.items[i] ? i : i - 1;
          render(next >= 0 ? `${pathText([...path, next])}:remove` : `${key}:add`);
        }),
      );
      li.append(content, tools);
      list.append(li);
    });
    if (g.items.length === 0) {
      const empty = doc.createElement('p');
      empty.className = 'aui-data-grid__builder-empty';
      empty.textContent = msg(locale, 'builderEmpty');
      set.append(empty);
    } else set.append(list);
    const actions = doc.createElement('div');
    actions.className = 'aui-data-grid__builder-actions';
    actions.append(
      smallButton(msg(locale, 'builderAddCondition'), msg(locale, 'builderAddConditionTo', { item: name }), `${key}:add`, () => {
        g.items.push(newCondition(columns[0]));
        render(`${pathText([...path, g.items.length - 1])}:column`);
      }),
    );
    if (path.length + 1 < ADVANCED_MAX_DEPTH - 1) {
      actions.append(
        smallButton(msg(locale, 'builderAddGroup'), msg(locale, 'builderAddGroupTo', { item: name }), `${key}:addGroup`, () => {
          g.items.push({ type: 'group', join: 'and', items: [newCondition(columns[0])] });
          render(`${pathText([...path, g.items.length - 1, 0])}:column`);
        }),
      );
    }
    set.append(actions);
    return set;
  };

  dialog.element.addEventListener('aui-close', (event) => {
    const detail = (event as CustomEvent<{ returnValue: string }>).detail;
    if (detail.returnValue === 'apply') o.commit(fromDraft(draft, columns));
    dialog.destroy();
    o.closed?.();
  });
  render();
  dialog.open();
  render('root:join');
  return dialog;
}
