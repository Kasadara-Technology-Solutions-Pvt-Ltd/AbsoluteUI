import { afterEach, describe, expect, it } from 'vitest';
import { plainDate, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { DataGrid, type DataGridFilter, type DataGridOptions } from '@absoluteui/components/data-grid';
import { compileFilter, parseFilter, type FilterColumn, type FilterEnvironment } from '../src/data-grid/filter.js';

// docs/PLAN-R11-G2.md (G2b): the filter engine and its grid integration.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface R {
  id: string;
  name: string;
  n: number | null;
  big: bigint | null;
  day: PlainDate | null;
  ok: boolean | null;
}

// "Zoe Angstrom" with diacritics, built from code points so the source stays ASCII.
const ACCENTED = `Zo${String.fromCharCode(0xeb)} ${String.fromCharCode(0xc5)}ngstr${String.fromCharCode(0xf6)}m`;
const rows: R[] = [
  { id: 'a', name: ACCENTED, n: 5, big: 10n, day: plainDate(2026, 10, 14), ok: true },
  { id: 'b', name: 'zoe smith', n: 15, big: 9007199254740993n, day: plainDate(2026, 10, 12), ok: false },
  { id: 'c', name: '', n: null, big: null, day: null, ok: null },
  { id: 'd', name: 'Bob', n: -3, big: -1n, day: plainDate(2026, 10, 3), ok: true },
  { id: 'e', name: 'Alice', n: 100, big: 0n, day: plainDate(2026, 12, 25), ok: false },
];

// Wednesday 14 October 2026; weeks start on Monday.
const env: FilterEnvironment = { locale: 'en-US', timezone: 'UTC', today: plainDate(2026, 10, 14), firstDayOfWeek: 1 };
const calendar = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 12, 25), name: 'Christmas Day' }] });

function column(kind: FilterColumn<R>['kind'], pick: (r: R) => unknown, text: (r: R) => string = (r) => { const v = pick(r); return typeof v === 'string' || typeof v === 'number' || typeof v === 'bigint' ? String(v) : ''; }): FilterColumn<R> {
  return { id: 'x', kind, text, value: pick, caseSensitive: false, accentSensitive: false, calendar };
}

const ids = (col: FilterColumn<R>, filter: DataGridFilter): string[] => {
  const test = compileFilter(col, filter, env);
  return rows.filter((r) => (test ? test(r) : true)).map((r) => r.id);
};

describe('filter engine', () => {
  it('text: case- and accent-insensitive operators, AND/OR, blanks; incomplete conditions are ignored', () => {
    const name = column('text', (r) => r.name);
    expect(ids(name, { kind: 'text', conditions: [{ operator: 'contains', value: 'zoe' }] })).toEqual(['a', 'b']);
    expect(ids(name, { kind: 'text', conditions: [{ operator: 'startsWith', value: 'ZOE A' }] })).toEqual(['a']);
    expect(ids(name, { kind: 'text', conditions: [{ operator: 'endsWith', value: 'strom' }] })).toEqual(['a']);
    expect(ids(name, { kind: 'text', join: 'or', conditions: [{ operator: 'equals', value: 'bob' }, { operator: 'equals', value: 'alice' }] })).toEqual(['d', 'e']);
    expect(ids(name, { kind: 'text', conditions: [{ operator: 'notContains', value: 'o' }] })).toEqual(['c', 'e']);
    expect(ids(name, { kind: 'text', conditions: [{ operator: 'blank' }] })).toEqual(['c']);
    expect(ids(name, { kind: 'text', conditions: [{ operator: 'contains', value: '' }] })).toEqual(['a', 'b', 'c', 'd', 'e']);
    const strict = { ...name, accentSensitive: true, caseSensitive: true };
    expect(ids(strict, { kind: 'text', conditions: [{ operator: 'contains', value: 'zoe' }] })).toEqual(['b']);
  });

  it('number and bigint: comparisons, inclusive between in either order, blanks; BigInt beyond 2^53', () => {
    const n = column('number', (r) => r.n);
    expect(ids(n, { kind: 'number', conditions: [{ operator: 'between', value: 100, to: 5 }] })).toEqual(['a', 'b', 'e']);
    expect(ids(n, { kind: 'number', conditions: [{ operator: 'lessThan', value: 0 }] })).toEqual(['d']);
    expect(ids(n, { kind: 'number', conditions: [{ operator: 'notEquals', value: 5 }] })).toEqual(['b', 'c', 'd', 'e']);
    expect(ids(n, { kind: 'number', conditions: [{ operator: 'blank' }] })).toEqual(['c']);
    const big = column('bigint', (r) => r.big);
    expect(ids(big, { kind: 'bigint', conditions: [{ operator: 'greaterThan', value: '9007199254740992' }] })).toEqual(['b']);
  });

  it('dates: fixed, relative (week from the locale start), counted ranges, and business operators', () => {
    const day = column('date', (r) => r.day);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'onOrAfter', value: '2026-10-12' }] })).toEqual(['a', 'b', 'e']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'between', value: '2026-10-14', to: '2026-10-01' }] })).toEqual(['a', 'b', 'd']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'today' }] })).toEqual(['a']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'thisWeek' }] })).toEqual(['a', 'b']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'lastWeek' }] })).toEqual([]);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'thisMonth' }] })).toEqual(['a', 'b', 'd']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'thisQuarter' }] })).toEqual(['a', 'b', 'd', 'e']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'lastDays', count: 3 }] })).toEqual(['a', 'b']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'holiday' }] })).toEqual(['e']);
    // Saturday 3 October is not a working day; 25 December is a holiday.
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'nonWorkingDay' }] })).toEqual(['d', 'e']);
    // The 3 working days ending today: Monday 12 to Wednesday 14 October.
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'lastBusinessDays', count: 3 }] })).toEqual(['a', 'b']);
    expect(ids(day, { kind: 'date', conditions: [{ operator: 'blank' }] })).toEqual(['c']);
  });

  it('boolean and set (blanks as null)', () => {
    const ok = column('boolean', (r) => r.ok);
    expect(ids(ok, { kind: 'boolean', value: true })).toEqual(['a', 'd']);
    expect(ids(ok, { kind: 'boolean', value: null })).toEqual(['c']);
    const name = column('set', (r) => r.name);
    expect(ids(name, { kind: 'set', values: ['Bob', null] })).toEqual(['c', 'd']);
  });

  it('rejects malformed models with the property path, never the value', () => {
    expect(() => parseFilter({ kind: 'text', conditions: [{ operator: 'like', value: 'x' }] }, 'text', 'filters.name')).toThrow(/filters\.name\.conditions\[0\]\.operator/);
    expect(() => parseFilter({ kind: 'number', conditions: [] }, 'number', 'filters.n')).toThrow(/conditions/);
    expect(() => parseFilter({ kind: 'date', conditions: [{ operator: 'on', value: '14/10/2026' }] }, 'date', 'filters.day')).toThrow(/ISO date/);
    expect(() => parseFilter({ kind: 'text', conditions: [{ operator: 'contains', value: 'x' }] }, 'number', 'filters.n')).toThrow(/kind: "number"/);
    expect(parseFilter({ kind: 'set', values: ['a', null], extra: 1 }, 'set', 'f')).toEqual({ kind: 'set', values: ['a', null] });
  });
});

describe('DataGrid filtering', () => {
  function mount(options: Partial<DataGridOptions<R>> = {}): DataGrid<R> {
    const host = document.createElement('div');
    host.style.setProperty('block-size', '300px');
    document.body.append(host);
    return DataGrid.create(host, {
      label: 'Rows',
      rows,
      rowId: (r) => r.id,
      columns: [
        { id: 'name', header: 'Name', field: 'name', filter: 'text' },
        { id: 'n', header: 'N', field: 'n', type: 'number', filter: 'number' },
        { id: 'day', header: 'Day', field: 'day', type: 'date', filter: 'date', businessCalendar: calendar },
      ],
      ...options,
    });
  }
  const shown = (g: DataGrid<R>): string[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row')].map((r) => r.dataset.rowId ?? '').sort();

  it('applies filters, the quick filter, and the external filter together', () => {
    const g = mount({ filters: { n: { kind: 'number', conditions: [{ operator: 'greaterThan', value: 0 }] } } });
    expect(shown(g)).toEqual(['a', 'b', 'e']);
    expect(g.filteredRowCount).toBe(3);
    g.setQuickFilter('zoe 15');
    expect(shown(g)).toEqual(['b']);
    g.setQuickFilter('');
    let allowE = false;
    g.update({ externalFilter: (r) => r.id !== 'e' || allowE });
    expect(shown(g)).toEqual(['a', 'b']);
    allowE = true;
    g.refreshFilters();
    expect(shown(g)).toEqual(['a', 'b', 'e']);
    g.setFilter('n', null);
    expect(g.getFilters()).toEqual({});
  });

  it('shows "No matching rows" when filters exclude everything, and round-trips filters through state', () => {
    const g = mount();
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'equals', value: 'nobody' }] });
    expect(g.host.querySelector('.aui-data-grid__empty')?.textContent).toBe('No matching rows');
    const state = g.getState();
    expect(state.filters).toEqual({ name: { kind: 'text', conditions: [{ operator: 'equals', value: 'nobody' }] } });
    const other = mount();
    other.setState(JSON.parse(JSON.stringify(state)));
    expect(other.filteredRowCount).toBe(0);
    expect(() => { other.setState({ filters: { name: { kind: 'text', conditions: [{ operator: 'nope' }] } } }); }).toThrow(/state\.filters\.name/);
    expect(() => { g.setFilter('ok', { kind: 'boolean', value: true }); }).toThrow(/filterable column/);
  });
});
