import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { onNodeRelease, resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataTable, type DataTableColumn, type DataTableGroupToggleDetail, type DataTableOptions } from '@absoluteui/components/data-table';

// docs/PLAN-R9-ANGULAR.md D18: grouping and aggregation.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface Employee {
  id: string;
  name: string;
  dept: string;
  team: string;
  salary: number;
}

const STAFF: Employee[] = [
  { id: 'e1', name: 'Ada', dept: 'Engineering', team: 'Core', salary: 100 },
  { id: 'e2', name: 'Bob', dept: 'Sales', team: 'East', salary: 60 },
  { id: 'e3', name: 'Cy', dept: 'Engineering', team: 'Web', salary: 80 },
  { id: 'e4', name: 'Di', dept: 'Engineering', team: 'Core', salary: 120 },
  { id: 'e5', name: 'Ed', dept: 'Sales', team: 'West', salary: 40 },
];

const COLUMNS: DataTableColumn<Employee>[] = [
  { id: 'name', header: 'Name', accessor: (e) => e.name },
  { id: 'dept', header: 'Department', accessor: (e) => e.dept },
  { id: 'team', header: 'Team', accessor: (e) => e.team },
  { id: 'salary', header: 'Salary', accessor: (e) => e.salary, type: 'number', aggregate: 'sum' },
];

function mount(options: Partial<DataTableOptions<Employee>> = {}): DataTable<Employee> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataTable.create<Employee>(host, { caption: 'Staff', columns: COLUMNS, rows: STAFF, rowId: (e) => e.id, locale: 'en-US', ...options });
}

const bodyText = (t: DataTable<Employee>): string[] =>
  Array.from(t.host.querySelectorAll('tbody tr')).map((tr) => (tr.classList.contains('aui-data-table__group-row') ? `# ${tr.textContent.trim()}` : tr.querySelector('td, th')!.textContent.trim()));

describe('Data Table grouping and aggregation (since 0.9.0)', () => {
  it('groups by one column, sorted, with counts and group aggregates', () => {
    const t = mount({ groupBy: ['dept'] });
    expect(bodyText(t)).toEqual([
      '# Department: Engineering (3)Salary total: 300',
      'Ada',
      'Cy',
      'Di',
      '# Department: Sales (2)Salary total: 100',
      'Bob',
      'Ed',
    ]);
    const toggle = t.host.querySelector('.aui-data-table__group-toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    expect(t.host.querySelector('th.aui-data-table__group')!.getAttribute('scope')).toBe('rowgroup');
  });

  it('nests groups, keeps other sorts inside groups, and follows the group column sort direction', () => {
    const t = mount({ groupBy: ['dept', 'team'], sort: [{ column: 'dept', direction: 'descending' }, { column: 'salary', direction: 'descending' }] });
    expect(bodyText(t)).toEqual([
      '# Department: Sales (2)Salary total: 100',
      '# Team: East (1)Salary total: 60',
      'Bob',
      '# Team: West (1)Salary total: 40',
      'Ed',
      '# Department: Engineering (3)Salary total: 300',
      '# Team: Core (2)Salary total: 220',
      'Di',
      'Ada',
      '# Team: Web (1)Salary total: 80',
      'Cy',
    ]);
  });

  it('collapses and expands groups from the toggle, keeping focus and emitting the state', async () => {
    const t = mount({ groupBy: ['dept'] });
    const onToggle = vi.fn<(d: DataTableGroupToggleDetail) => void>();
    t.host.addEventListener('aui-group-toggle', (e) => {
      onToggle((e as CustomEvent<DataTableGroupToggleDetail>).detail);
    });
    await userEvent.click(t.host.querySelector('.aui-data-table__group-toggle')!);
    expect(onToggle).toHaveBeenCalledWith({ key: 'dept=Engineering', collapsed: true, collapsedGroups: ['dept=Engineering'] });
    expect(bodyText(t)).toEqual(['# Department: Engineering (3)Salary total: 300', '# Department: Sales (2)Salary total: 100', 'Bob', 'Ed']);
    expect(document.activeElement?.getAttribute('aria-expanded')).toBe('false');
    t.update({ collapsedGroups: [] });
    expect(bodyText(t)).toHaveLength(7);
  });

  it('getState and setState carry the collapsed groups (since 0.9.0)', async () => {
    const t = mount({ groupBy: ['dept'] });
    await userEvent.click(t.host.querySelector('.aui-data-table__group-toggle')!);
    const state = t.getState();
    expect(state.collapsedGroups).toEqual(['dept=Engineering']);
    t.update({ collapsedGroups: [] });
    expect(bodyText(t)).toHaveLength(7);
    // A saved snapshot (JSON round trip) restores them; unknown keys have no effect.
    t.setState(JSON.parse(JSON.stringify({ ...state, collapsedGroups: ['dept=Engineering', 'dept=Gone'] })) as typeof state);
    expect(bodyText(t)).toHaveLength(4);
    // Older snapshots without the field leave the groups as they are.
    t.setState({ version: 1, search: '' });
    expect(bodyText(t)).toHaveLength(4);
    expect(() => {
      t.setState({ version: 1, collapsedGroups: 'dept=Sales' as unknown as string[] });
    }).toThrow(/collapsedGroups/);
  });

  it('shows a totals row over all filtered rows; server mode uses totals', () => {
    const t = mount({ pageSize: 2 });
    const totals = (): string[] => Array.from(t.host.querySelectorAll('tfoot tr > *')).map((c) => c.textContent.trim());
    expect(totals()).toEqual(['Total', '', '', '400']);
    t.update({ search: 'sales' });
    expect(totals()).toEqual(['Total', '', '', '100']);
    t.update({ showTotals: false });
    expect(t.host.querySelector('tfoot')).toBeNull();
    const s = mount({ mode: 'server', total: 5, totals: { salary: 999 } });
    expect(Array.from(s.host.querySelectorAll('tfoot tr > *')).map((c) => c.textContent.trim())).toEqual(['Total', '', '', '999']);
  });

  it('custom group headers are decorative and released when dropped', () => {
    const live = new Set<string>();
    const t = mount({
      groupBy: ['dept'],
      renderGroupHeader: (g) => {
        live.add(g.key);
        const b = document.createElement('b');
        b.textContent = g.label.toUpperCase();
        return onNodeRelease(b, () => live.delete(g.key));
      },
    });
    expect(t.host.querySelector('.aui-data-table__group-toggle')!.getAttribute('aria-label')).toBe('Department: Engineering (3)');
    expect(live).toEqual(new Set(['dept=Engineering', 'dept=Sales']));
    t.update({ search: 'engineering' });
    expect(live).toEqual(new Set(['dept=Engineering']));
    t.destroy();
    expect(live.size).toBe(0);
  });

  it('rejects grouping in server or virtual mode', () => {
    expect(() => mount({ groupBy: ['dept'], mode: 'server', total: 5 })).toThrow(/groupBy/);
    expect(() => mount({ groupBy: ['dept'], virtual: true })).toThrow(/virtual/);
  });
});
