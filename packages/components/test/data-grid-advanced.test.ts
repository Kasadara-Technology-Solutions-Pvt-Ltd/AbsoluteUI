import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridFilterChangeDetail, type DataGridOptions } from '@absoluteui/components/data-grid';
import {
  compileAdvancedFilter,
  formatAdvancedExpression,
  parseAdvancedExpression,
  parseAdvancedFilter,
  suggestAdvanced,
  type AdvancedColumn,
  type DataGridAdvancedFilter,
} from '../src/data-grid/advanced-filter.js';
import type { FilterColumn, FilterEnvironment } from '../src/data-grid/filter.js';

// docs/PLAN-R11-G2.md (G2c): advanced filter model, expression language, and completion.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const columns: AdvancedColumn[] = [
  { id: 'name', header: 'Name', kind: 'text' },
  { id: 'age', header: 'Age', kind: 'number' },
  { id: 'city', header: 'City', kind: 'set' },
  { id: 'active', header: 'Active', kind: 'boolean' },
  { id: 'hired', header: 'Hired [UTC]', kind: 'date' },
  { id: 'big', header: 'Big', kind: 'bigint' },
];
const parse = (s: string): DataGridAdvancedFilter | null => {
  const r = parseAdvancedExpression(s, columns);
  if (!r.ok) throw new Error(`${r.error.code} at ${String(r.error.start)}`);
  return r.filter;
};
const error = (s: string): [string, number, number] => {
  const r = parseAdvancedExpression(s, columns);
  if (r.ok) throw new Error('expected an error');
  return [r.error.code, r.error.start, r.error.end];
};

describe('advanced filter expressions', () => {
  it('parses conditions of every kind into column filter models', () => {
    expect(parse('[Name] contains "ann"')).toEqual({ join: 'and', items: [{ column: 'name', filter: { kind: 'text', conditions: [{ operator: 'contains', value: 'ann' }] } }] });
    expect(parse('[name] DOES NOT CONTAIN "x"')?.items[0]).toEqual({ column: 'name', filter: { kind: 'text', conditions: [{ operator: 'notContains', value: 'x' }] } });
    expect(parse('[Age] between 30 and 40')?.items[0]).toEqual({ column: 'age', filter: { kind: 'number', conditions: [{ operator: 'between', value: 30, to: 40 }] } });
    expect(parse('[Age] >= -2.5')?.items[0]).toEqual({ column: 'age', filter: { kind: 'number', conditions: [{ operator: 'greaterThanOrEqual', value: -2.5 }] } });
    expect(parse('[Big] < 9007199254740993')?.items[0]).toEqual({ column: 'big', filter: { kind: 'bigint', conditions: [{ operator: 'lessThan', value: '9007199254740993' }] } });
    expect(parse('[City] is any of ("Oslo", blank)')?.items[0]).toEqual({ column: 'city', filter: { kind: 'set', values: ['Oslo', null] } });
    expect(parse('[City] in ("Lima")')?.items[0]).toEqual({ column: 'city', filter: { kind: 'set', values: ['Lima'] } });
    expect(parse('[Active] is false')?.items[0]).toEqual({ column: 'active', filter: { kind: 'boolean', value: false } });
    expect(parse('[Hired [UTC]]] on or before "2026-01-31"')?.items[0]).toEqual({ column: 'hired', filter: { kind: 'date', conditions: [{ operator: 'onOrBefore', value: '2026-01-31' }] } });
    expect(parse('[Hired [UTC]]] is this quarter')?.items[0]).toEqual({ column: 'hired', filter: { kind: 'date', conditions: [{ operator: 'thisQuarter' }] } });
    expect(parse('[Hired [UTC]]] is in last 30 business days')?.items[0]).toEqual({ column: 'hired', filter: { kind: 'date', conditions: [{ operator: 'lastBusinessDays', count: 30 }] } });
    expect(parse('[Name] is not blank')?.items[0]).toEqual({ column: 'name', filter: { kind: 'text', conditions: [{ operator: 'notBlank' }] } });
    expect(parse('[Name] = "say \\"hi\\""')?.items[0]).toEqual({ column: 'name', filter: { kind: 'text', conditions: [{ operator: 'equals', value: 'say "hi"' }] } });
    expect(parse('  ')).toBeNull();
  });

  it('and binds tighter than or; parentheses group', () => {
    const a = '[Age] > 1';
    const model = parse(`${a} or ${a} and ${a}`);
    expect(model?.join).toBe('or');
    expect(model?.items[1]).toMatchObject({ join: 'and' });
    const grouped = parse(`(${a} or ${a}) and ${a}`);
    expect(grouped?.join).toBe('and');
    expect(grouped?.items[0]).toMatchObject({ join: 'or' });
  });

  it('formats canonically and round-trips', () => {
    const source = '[Name] contains "a\\\\b" and ([Age] between 1 and 2 or [City] is any of ("Oslo", blank)) and [Hired [UTC]]] is in next 3 days and [Active] is true';
    const model = parse(source);
    const text = formatAdvancedExpression(model, columns);
    expect(text).toBe(source);
    expect(parse(text)).toEqual(model);
    expect(formatAdvancedExpression({ join: 'and', items: [{ column: 'age', filter: { kind: 'number', join: 'or', conditions: [{ operator: 'lessThan', value: 0 }, { operator: 'greaterThan', value: 9 }] } }] }, columns)).toBe('([Age] < 0 or [Age] > 9)');
  });

  it('reports errors with source positions', () => {
    expect(error('[Nope] = "x"')).toEqual(['unknownColumn', 0, 6]);
    expect(error('[Name] > "x"')).toEqual(['expectedOperator', 7, 8]);
    expect(error('[Age] = "x"')).toEqual(['invalidNumber', 8, 11]);
    expect(error('[Hired [UTC]]] = "14/10/2026"')).toEqual(['invalidDate', 17, 29]);
    expect(error('[Age] between 1 or 2')).toEqual(['expectedAnd', 16, 18]);
    expect(error('[Age] = 1 [Age] = 2')).toEqual(['expectedJoin', 10, 15]);
    expect(error('([Age] = 1')).toEqual(['expectedClose', 10, 10]);
    expect(error('[Age] = 1)')).toEqual(['unexpectedClose', 9, 10]);
    expect(error('[Name] = "open')).toEqual(['unterminatedString', 9, 14]);
    expect(error('[Name')).toEqual(['unterminatedColumn', 0, 5]);
    expect(error('[Age] = 1 ; drop')).toEqual(['unexpectedCharacter', 10, 11]);
    expect(error('[Hired [UTC]]] is in last 0 days')).toEqual(['invalidCount', 26, 27]);
    expect(error('(((((((((([Age] = 1))))))))))')[0]).toBe('tooDeep');
  });

  it('suggests columns, operators, set values, and keywords at the cursor', () => {
    const values = (): (string | null)[] => [null, 'Lima', 'Oslo'];
    const at = (s: string): string[] => suggestAdvanced(s, s.length, columns, values)?.items.map((i) => i.label) ?? [];
    expect(at('')).toEqual(['Name', 'Age', 'City', 'Active', 'Hired [UTC]', 'Big']);
    expect(at('[ag')).toEqual(['Age']);
    expect(at('ci')).toEqual(['City']);
    expect(at('[Name] ')).toContain('does not contain');
    expect(at('[Name] does n')).toEqual(['does not contain', 'does not equal']);
    expect(at('[Age] <')).toEqual(['<>', '<', '<=']);
    expect(at('[City] is any of (')).toEqual(['blank', 'Lima', 'Oslo']);
    expect(at('[City] is any of ("Oslo", "l')).toEqual(['Lima', 'Oslo']);
    expect(at('[City] is any of ("Oslo"')).toEqual([',', ')']);
    expect(at('[Age] = 1 ')).toEqual(['and', 'or']);
    expect(at('([Age] = 1 ')).toEqual(['and', 'or', ')']);
    expect(at('[Age] between 1 ')).toEqual(['and']);
    const s = '[Name] does n';
    const r = suggestAdvanced(s, s.length, columns, values);
    expect(r?.from).toBe(7);
    expect(r?.items[0]?.insert).toBe('does not contain ');
  });
});

describe('advanced filter model', () => {
  const kindOf = (id: string): AdvancedColumn['kind'] | null => columns.find((c) => c.id === id)?.kind ?? null;

  it('validates untrusted models, drops unknown columns and empty groups', () => {
    const model = parseAdvancedFilter(
      { join: 'or', items: [{ column: 'gone', filter: { kind: 'text', conditions: [] } }, { join: 'and', items: [] }, { column: 'age', filter: { kind: 'number', conditions: [{ operator: 'lessThan', value: 3 }] } }] },
      kindOf,
      'state.advancedFilter',
    );
    expect(model).toEqual({ join: 'or', items: [{ column: 'age', filter: { kind: 'number', conditions: [{ operator: 'lessThan', value: 3 }] } }] });
    expect(parseAdvancedFilter({ join: 'and', items: [] }, kindOf, 'f')).toBeNull();
    expect(() => parseAdvancedFilter({ join: 'xor', items: [] }, kindOf, 'f')).toThrow(/f\.join/);
    expect(() => parseAdvancedFilter({ join: 'and', items: [{ column: 'age', filter: { kind: 'text', conditions: [] } }] }, kindOf, 'f')).toThrow(/f\.items\[0\]\.filter/);
    let deep: unknown = { column: 'age', filter: { kind: 'number', conditions: [{ operator: 'blank' }] } };
    for (let i = 0; i < 10; i++) deep = { join: 'and', items: [deep] };
    expect(() => parseAdvancedFilter(deep, kindOf, 'f')).toThrow(/nested/);
  });

  it('compiles to a predicate over rows', () => {
    interface R {
      age: number | null;
      day: ReturnType<typeof plainDate> | null;
    }
    const env: FilterEnvironment = { locale: 'en-US', timezone: 'UTC', today: plainDate(2026, 10, 14), firstDayOfWeek: 1 };
    const col = (id: string, pick: (r: R) => unknown): FilterColumn<R> => ({ id, kind: id === 'age' ? 'number' : 'date', text: () => '', value: pick, caseSensitive: false, accentSensitive: false, calendar: undefined });
    const cols: Record<string, FilterColumn<R>> = { age: col('age', (r) => r.age), hired: col('hired', (r) => r.day) };
    const test = compileAdvancedFilter<R>(parse('[Age] < 10 or ([Age] > 50 and [Hired [UTC]]] is this month)')!, (id) => cols[id] ?? null, env)!;
    const rows: R[] = [
      { age: 5, day: null },
      { age: 60, day: plainDate(2026, 10, 2) },
      { age: 60, day: plainDate(2026, 9, 2) },
      { age: null, day: null },
    ];
    expect(rows.map((r) => test(r))).toEqual([true, true, false, false]);
  });
});

describe('DataGrid advanced filter', () => {
  interface P {
    id: string;
    name: string;
    age: number;
    city: string;
  }
  const people: P[] = [
    { id: 'a', name: 'Ann', age: 31, city: 'Oslo' },
    { id: 'b', name: 'Bob', age: 25, city: 'Lima' },
    { id: 'c', name: 'Cid', age: 47, city: 'Oslo' },
    { id: 'd', name: 'Dee', age: 52, city: 'Pune' },
  ];
  function mount(options: Partial<DataGridOptions<P>> = {}): DataGrid<P> {
    const host = document.createElement('div');
    host.style.setProperty('block-size', '400px');
    document.body.append(host);
    return DataGrid.create(host, {
      label: 'People',
      rows: people,
      rowId: (r) => r.id,
      advancedFilter: true,
      floatingFilters: true,
      columns: [
        { id: 'name', header: 'Name', field: 'name', filter: 'text' },
        { id: 'age', header: 'Age', field: 'age', type: 'number', filter: 'number' },
        { id: 'city', header: 'City', field: 'city', filter: 'set' },
      ],
      ...options,
    });
  }
  const shown = (g: DataGrid<P>): string[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row')].map((r) => r.dataset.rowId ?? '').sort();
  const input = (g: DataGrid<P>): HTMLInputElement => g.host.querySelector<HTMLInputElement>('.aui-data-grid__advanced-input')!;
  const type = (el: HTMLInputElement, value: string): void => {
    el.value = value;
    el.setSelectionRange(value.length, value.length);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  };

  it('replaces the column filter UI; Enter applies an expression, announces, emits, and round-trips through state', async () => {
    const g = mount({ filters: { name: { kind: 'text', conditions: [{ operator: 'equals', value: 'zzz' }] } } });
    expect(g.host.querySelector('.aui-data-grid__filter-button')).toBeNull();
    expect(g.host.querySelector('.aui-data-grid__floating-row')).toBeNull();
    // Column filters are kept but not applied.
    expect(shown(g)).toEqual(['a', 'b', 'c', 'd']);
    const seen: DataGridFilterChangeDetail[] = [];
    g.host.addEventListener('aui-filter-change', (e) => seen.push((e as CustomEvent<DataGridFilterChangeDetail>).detail));
    const field = input(g);
    expect(field.getAttribute('role')).toBe('combobox');
    expect(g.host.querySelector(`label[for="${field.id}"]`)?.textContent).toBe('Filter');
    field.focus();
    type(field, '[Age] > 30 and [City] is any of ("Oslo")');
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}');
    expect(shown(g)).toEqual(['a', 'c']);
    expect(seen.at(-1)?.advancedFilter?.items).toHaveLength(2);
    const state = g.getState();
    const other = mount();
    other.setState(JSON.parse(JSON.stringify(state)));
    expect(shown(other)).toEqual(['a', 'c']);
    expect(input(other).value).toBe('[Age] > 30 and [City] is any of ("Oslo")');
    g.setAdvancedFilter(null);
    expect(shown(g)).toEqual(['a', 'b', 'c', 'd']);
    expect(field.value).toBe('');
  });

  it('shows, selects, and describes syntax errors', async () => {
    const g = mount();
    const field = input(g);
    field.focus();
    type(field, '[Age] > 30 and [Town] = "x"');
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Enter}');
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const error = g.host.querySelector('.aui-data-grid__advanced-error')!;
    expect(error.textContent).toBe('Unknown column "Town" at character 16');
    expect(field.getAttribute('aria-describedby')).toContain(error.id);
    expect([field.selectionStart, field.selectionEnd]).toEqual([15, 21]);
    expect(shown(g)).toEqual(['a', 'b', 'c', 'd']);
  });

  it('suggests with the combobox pattern: arrows move the active option, Enter inserts it', async () => {
    const g = mount();
    const field = input(g);
    field.focus();
    type(field, '[a');
    const list = g.host.querySelector<HTMLElement>('.aui-data-grid__advanced-list')!;
    expect(field.getAttribute('aria-expanded')).toBe('true');
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toEqual(['Name', 'Age']);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(field.getAttribute('aria-activedescendant')).toBe(list.querySelectorAll('[role="option"]')[1]?.id);
    await userEvent.keyboard('{Enter}');
    expect(field.value).toBe('[Age] ');
    // The operators of the chosen column follow.
    expect([...list.querySelectorAll('[role="option"]')].map((o) => o.textContent)).toContain('between');
    await userEvent.keyboard('{Escape}');
    expect(field.getAttribute('aria-expanded')).toBe('false');
    expect(list.hidden).toBe(true);
  });

  it('builder dialog: add, edit, move, and remove items with labelled controls; Apply commits', () => {
    const g = mount({ advancedFilterModel: { join: 'and', items: [{ column: 'age', filter: { kind: 'number', conditions: [{ operator: 'greaterThan', value: 30 }] } }] } });
    expect(shown(g)).toEqual(['a', 'c', 'd']);
    const open = [...g.host.querySelectorAll<HTMLButtonElement>('.aui-data-grid__advanced button')].find((b) => b.textContent === 'Builder')!;
    open.click();
    const dialog = document.querySelector<HTMLDialogElement>('.aui-data-grid__builder-dialog')!;
    expect(dialog.open).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('All rows: combine with');
    const byLabel = (label: string): HTMLElement => dialog.querySelector<HTMLElement>(`[aria-label="${label}"]`)!;
    const button = (label: string): HTMLButtonElement => dialog.querySelector<HTMLButtonElement>(`button[aria-label="${label}"]`)!;
    const select = (label: string): HTMLSelectElement => dialog.querySelector<HTMLSelectElement>(`select[aria-label="${label}"]`)!;
    const field = (label: string): HTMLInputElement => dialog.querySelector<HTMLInputElement>(`input[aria-label="${label}"]`)!;
    expect(field('Condition 1 value').value).toBe('30');
    button('Add condition to All rows').click();
    expect(document.activeElement).toBe(byLabel('Condition 2 column'));
    const column = select('Condition 2 column');
    column.value = 'name';
    column.dispatchEvent(new Event('change', { bubbles: true }));
    const operator = select('Condition 2 operator');
    operator.value = 'startsWith';
    operator.dispatchEvent(new Event('change', { bubbles: true }));
    const value = field('Condition 2 value');
    value.value = 'd';
    value.dispatchEvent(new Event('input', { bubbles: true }));
    button('Move Condition 2 up').click();
    // The moved item is now first: its Up button is disabled, so focus goes to its Down button.
    expect(button('Move Condition 1 up').disabled).toBe(true);
    expect(document.activeElement).toBe(byLabel('Move Condition 1 down'));
    const join = select('All rows: combine with');
    join.value = 'or';
    join.dispatchEvent(new Event('change', { bubbles: true }));
    button('Add group to All rows').click();
    expect(document.activeElement).toBe(byLabel('Condition 3.1 column'));
    button('Remove Group 3').click();
    expect(document.activeElement).toBe(byLabel('Remove Condition 2'));
    [...dialog.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent === 'Apply')!.click();
    expect(document.querySelector('.aui-data-grid__builder-dialog')).toBeNull();
    expect(shown(g)).toEqual(['a', 'c', 'd']);
    expect(input(g).value).toBe('[Name] starts with "d" or [Age] > 30');
    expect(document.activeElement).toBe(open);
  });
});
