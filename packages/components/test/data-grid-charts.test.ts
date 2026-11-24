import { afterEach, describe, expect, it } from 'vitest';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid } from '@absoluteui/components/data-grid';
import { sparklineColumn } from '@absoluteui/components/data-grid/charts';

// docs/PLAN-R11-G10.md (G10a): sparklines in cells.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface T {
  id: string;
  name: string;
  trend: number[];
}
const rows: T[] = [
  { id: 'a', name: 'North', trend: [4, 6, 9] },
  { id: 'b', name: 'South', trend: [9, 2, 1] },
  { id: 'c', name: 'East', trend: [] },
];

function mount(): DataGrid<T> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<T>(host, {
    label: 'Trends',
    locale: 'en-US',
    rows,
    rowId: (r) => r.id,
    columns: [
      { id: 'name', header: 'Region', field: 'name' },
      { id: 'trend', header: 'Trend', ...sparklineColumn<T>({ values: (r) => r.trend, label: (r) => `${r.name} sales`, sortBy: 'last' }) },
    ],
  });
}

describe('sparklines in cells (G10a)', () => {
  it('draws a named sparkline per cell, exports the numbers as text, sorts by the last value, and destroys sparklines it drops', () => {
    const g = mount();
    const svg = g.host.querySelector('[data-row-id="a"] [data-column="trend"] svg[role="img"]');
    expect(svg?.getAttribute('aria-label')).toMatch(/^North sales: 3 values, from 4 to 9/);
    expect(g.toCsv({ columns: ['name', 'trend'] }).split('\r\n')).toEqual(['Region,Trend', 'North,"4, 6, 9"', 'South,"9, 2, 1"', 'East,']);
    g.update({ sort: [{ column: 'trend', direction: 'descending' }] });
    expect(g.toCsv({ columns: ['name'], header: false }).split('\r\n')).toEqual(['North', 'South', 'East']);
    const before = g.host.querySelectorAll('.aui-data-grid__sparkline').length;
    g.setRows([rows[0]!]);
    expect(g.host.querySelectorAll('.aui-data-grid__sparkline').length).toBeLessThan(before);
    expect(() => sparklineColumn<T>({ values: (r) => r.trend, label: 'x', sortBy: 'median' as 'sum' })).toThrow(/sortBy/);
  });
});

describe('range and pivot charts (G10b, G10c)', () => {
  interface S {
    id: string;
    region: string;
    q1: number;
    q2: number;
  }
  const sales: S[] = [
    { id: '1', region: 'North', q1: 10, q2: 12 },
    { id: '2', region: 'South', q1: 7, q2: 9 },
    { id: '3', region: 'East', q1: 4, q2: 8 },
  ];
  function setup(options: Record<string, unknown> = {}): DataGrid<S> {
    const host = document.createElement('div');
    document.body.append(host);
    return DataGrid.create<S>(host, {
      label: 'Sales',
      locale: 'en-US',
      rows: sales,
      rowId: (r) => r.id,
      cellSelection: true,
      columns: [
        { id: 'region', header: 'Region', field: 'region' },
        { id: 'q1', header: 'Q1', field: 'q1', type: 'number', editable: true },
        { id: 'q2', header: 'Q2', field: 'q2', type: 'number' },
      ],
      ...options,
    });
  }

  it('charts a range in a docked region, switches type and series direction, follows edits, and closes with Escape', async () => {
    const { chartRange } = await import('@absoluteui/components/data-grid/charts');
    const g = setup();
    g.addCellRange({ startRow: '1', endRow: '3', startColumn: 'region', endColumn: 'q2' });
    const panel = chartRange(g, { title: 'Quarterly sales' });
    expect(g.host.nextElementSibling).toBe(panel.element);
    expect(panel.element.getAttribute('aria-label')).toBe('Chart of Quarterly sales');
    const svg = (): Element | null => panel.element.querySelector('svg[role="img"], svg [role="img"], [role="img"]');
    expect(svg()).not.toBeNull();
    expect(panel.element.textContent).toContain('North');
    panel.update({ type: 'line', seriesBy: 'rows' });
    expect(panel.element.querySelector('select')?.value).toBe('line');
    panel.update({ type: 'pie' });
    expect(svg()).not.toBeNull();
    g.applyTransaction({ update: [{ id: '1', region: 'North', q1: 50, q2: 12 }] });
    panel.update({ type: 'bar', seriesBy: 'columns' });
    expect(panel.element.textContent).toContain('50');
    panel.element.querySelector('select')!.focus();
    panel.element.querySelector('select')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    expect(panel.element.isConnected).toBe(false);
    // Without a range option the active range is charted.
    chartRange(g).close();
  });

  it('a range without numbers shows a message; chartPivot needs pivot mode and charts its results', async () => {
    const { chartPivot, chartRange } = await import('@absoluteui/components/data-grid/charts');
    const g = setup();
    const text = chartRange(g, { range: { startRow: '1', endRow: '2', startColumn: 'region', endColumn: 'region' } });
    expect(text.element.querySelector('.aui-data-grid-chart__empty')?.textContent).toBe('The cells hold no numbers to chart');
    text.close();
    expect(() => chartPivot(g)).toThrow(/pivot/);
    const p = setup({ pivot: { rows: ['region'], columns: [], values: [{ column: 'q1', aggregate: 'sum' }] } });
    const panel = chartPivot(p);
    expect(panel.element.textContent).toContain('South');
    expect(panel.element.querySelectorAll('select')).toHaveLength(1);
    panel.close();
  });
});
