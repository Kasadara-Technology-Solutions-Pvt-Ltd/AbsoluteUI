import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions, type DataGridPivotChangeDetail } from '@absoluteui/components/data-grid';
import { parsePivot } from '../src/data-grid/pivot.js';

// docs/PLAN-R11-G5.md (G5e): pivot mode.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:500px;inline-size:900px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
    '.aui-data-grid__spacer{flex:none}',
  ].join('\n');
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface S {
  id: string;
  region: string;
  city: string;
  year: number;
  amount: number;
}
const sales: S[] = [
  { id: '1', region: 'East', city: 'Oslo', year: 2025, amount: 10 },
  { id: '2', region: 'East', city: 'Oslo', year: 2026, amount: 20 },
  { id: '3', region: 'East', city: 'Lima', year: 2026, amount: 5 },
  { id: '4', region: 'West', city: 'Pune', year: 2025, amount: 7 },
];

function mount(options: Partial<DataGridOptions<S>> = {}): DataGrid<S> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<S>(host, {
    label: 'Sales',
    locale: 'en-US',
    rowHeight: 30,
    rows: sales,
    rowId: (r) => r.id,
    groupDefaultExpanded: -1,
    columns: [
      { id: 'region', header: 'Region', field: 'region', filter: 'text' },
      { id: 'city', header: 'City', field: 'city' },
      { id: 'year', header: 'Year', field: 'year' },
      { id: 'amount', header: 'Amount', field: 'amount', type: 'number' },
    ],
    pivot: { rows: ['region', 'city'], columns: ['year'], values: [{ column: 'amount', aggregate: 'sum' }] },
    ...options,
  });
}

/** Ids of the rendered result columns, in display order. */
const pivotIds = (g: DataGrid<S>): string[] => [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__header-cell[data-column^="aui-pivot:"]')].map((h) => h.dataset.column ?? '');

/** Text of the rendered body rows by column id, in display order. */
function table(g: DataGrid<S>, columns: readonly string[]): string[][] {
  return [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__body .aui-data-grid__row')]
    .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
    .map((r) => columns.map((c) => r.querySelector(`[data-column="${c}"]`)?.textContent ?? ''));
}

describe('pivot mode (G5e)', () => {
  it('validates the model', () => {
    expect(() => parsePivot({ rows: [], columns: [], values: [{ column: 'a', aggregate: 'median' }] })).toThrow();
    expect(parsePivot({ rows: ['a'], columns: [], values: [] })).toEqual({ rows: ['a'], columns: [], values: [] });
  });

  it('rows by the row fields, a column group per column key with totals; the data columns hide', () => {
    const g = mount({ grandTotal: 'bottom' });
    expect(g.element.getAttribute('role')).toBe('treegrid');
    const headers = [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__header-cell')].map((h) => h.textContent);
    expect(headers).toEqual(['Group', '2025', '2026', 'Total', 'Sum of Amount', 'Sum of Amount', 'Sum of Amount']);
    const ids = ['aui-group', ...pivotIds(g)];
    expect(ids).toHaveLength(4);
    expect(table(g, ids)).toEqual([
      ['East (3)', '10', '25', '35'],
      ['Lima (1)', '', '5', '5'],
      ['Oslo (2)', '10', '20', '30'],
      ['West (1)', '7', '', '7'],
      ['Pune (1)', '7', '', '7'],
      ['Total', '17', '25', '42'],
    ]);
    // The last row level cannot expand.
    const lima = [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__row--group')].find((r) => r.textContent.startsWith('Lima'))!;
    expect(lima.hasAttribute('aria-expanded')).toBe(false);
    expect(lima.getAttribute('aria-level')).toBe('2');
  });

  it('filters apply before aggregation; no row fields shows one total row; setPivot(null) leaves pivot mode', () => {
    const g = mount({ pivot: { rows: [], columns: [], values: [{ column: 'amount', aggregate: 'avg' }, { column: 'city', aggregate: 'distinctCount' }] } });
    const ids = pivotIds(g);
    expect(table(g, ids)).toEqual([['10.5', '3']]);
    g.setFilter('region', { kind: 'text', conditions: [{ operator: 'equals', value: 'East' }] });
    expect(table(g, ids)).toEqual([['11.667', '2']]);
    g.setPivot(null);
    expect(g.element.getAttribute('role')).toBe('grid');
    expect(g.host.querySelectorAll('.aui-data-grid__body .aui-data-grid__row')).toHaveLength(3);
  });

  it('pivotMaxColumns leaves columns out and reports it', () => {
    const g = mount({ pivot: { rows: ['region'], columns: ['city'], values: [{ column: 'amount', aggregate: 'sum' }] }, pivotMaxColumns: 2 });
    expect(g.getPivotTruncation()).toEqual({ shown: 2, total: 3 });
    expect(pivotIds(g)).toHaveLength(3);
  });

  it('the pivot panel edits rows, columns, and values; changes emit', () => {
    const g = mount({ pivotPanel: true });
    const seen: DataGridPivotChangeDetail[] = [];
    g.host.addEventListener('aui-pivot-change', (e) => seen.push((e as CustomEvent<DataGridPivotChangeDetail>).detail));
    const panel = g.host.querySelector<HTMLElement>('.aui-data-grid__pivot-panel')!;
    expect(panel.getAttribute('aria-label')).toBe('Pivot');
    panel.querySelector<HTMLButtonElement>('[aria-label="Remove City from Rows"]')!.click();
    expect(seen.at(-1)?.pivot?.rows).toEqual(['region']);
    const aggregate = panel.ownerDocument.querySelector<HTMLSelectElement>('[aria-label="Aggregate of Amount"]')!;
    aggregate.value = 'count';
    aggregate.dispatchEvent(new Event('change', { bubbles: true }));
    expect(g.getPivot()?.values).toEqual([{ column: 'amount', aggregate: 'count' }]);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Aggregate of Amount');
    const add = g.host.querySelector<HTMLSelectElement>('[aria-label="Add to Columns"]')!;
    add.value = 'city';
    add.dispatchEvent(new Event('change', { bubbles: true }));
    expect(g.getPivot()?.columns).toEqual(['year', 'city']);
    expect([...g.host.querySelectorAll('.aui-data-grid__header-cell')].map((h) => h.textContent)).toContain('Oslo');
  });
});

describe('pill dragging (G7e3)', () => {
  beforeAll(() => {
    const style = document.createElement('style');
    style.textContent = '.aui-data-grid__group-pills{display:flex;flex-wrap:wrap;gap:4px;margin:0;padding:0;list-style:none}.aui-data-grid__group-pill{display:inline-flex;align-items:center}.aui-data-grid__drag-ghost{position:fixed;pointer-events:none}';
    document.head.append(style);
  });

  /** Drag a pill (by its text) to a point, or to just before or after another element. */
  function dragPill(g: DataGrid<S>, zone: string, column: string, to: HTMLElement, side: 'before' | 'after' | 'center'): void {
    const scope = zone === 'group' ? '.aui-data-grid__group-panel' : `[data-zone="${zone}"]`;
    const text = g.host.querySelector<HTMLElement>(`${scope} .aui-data-grid__group-pill[data-column="${column}"] > span`)!;
    const from = text.getBoundingClientRect();
    const r = to.getBoundingClientRect();
    const x = side === 'before' ? r.left + 2 : side === 'after' ? r.right - 2 : r.left + r.width / 2;
    const y = r.top + r.height / 2;
    const init = { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' } as const;
    text.dispatchEvent(new PointerEvent('pointerdown', { ...init, button: 0, clientX: from.left + 2, clientY: from.top + 2 }));
    text.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: x, clientY: y }));
    text.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: x + 1, clientY: y }));
    text.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: x + 1, clientY: y }));
  }
  const pill = (g: DataGrid<S>, zone: string, column: string): HTMLElement => g.host.querySelector<HTMLElement>(`[data-zone="${zone}"] .aui-data-grid__group-pill[data-column="${column}"]`)!;

  it('pivot pills reorder within a zone, move between zones (values keep or get an aggregate), and are removed when dropped outside', () => {
    const g = mount({ pivotPanel: true });
    const seen: DataGridPivotChangeDetail[] = [];
    g.host.addEventListener('aui-pivot-change', (e) => seen.push((e as CustomEvent<DataGridPivotChangeDetail>).detail));
    dragPill(g, 'rows', 'city', pill(g, 'rows', 'region'), 'before');
    expect(g.getPivot()?.rows).toEqual(['city', 'region']);
    dragPill(g, 'rows', 'region', pill(g, 'columns', 'year'), 'after');
    expect(g.getPivot()).toMatchObject({ rows: ['city'], columns: ['year', 'region'] });
    dragPill(g, 'columns', 'year', pill(g, 'values', 'amount'), 'after');
    expect(g.getPivot()?.values).toEqual([{ column: 'amount', aggregate: 'sum' }, { column: 'year', aggregate: 'count' }]);
    expect(g.getPivot()?.columns).toEqual(['region']);
    dragPill(g, 'values', 'year', document.body, 'after');
    expect(g.getPivot()?.values).toEqual([{ column: 'amount', aggregate: 'sum' }]);
    expect(seen).toHaveLength(4);
    expect(g.host.querySelector('.aui-data-grid__drag-ghost')).toBeNull();
  });

  it('group pills reorder and are removed when dropped outside the group panel', () => {
    const g = mount({ pivot: null, groupPanel: true, groupBy: ['region', 'city'] });
    const panel = g.host.querySelector<HTMLElement>('.aui-data-grid__group-panel')!;
    dragPill(g, 'group', 'city', panel.querySelector<HTMLElement>('[data-column="region"]')!, 'before');
    expect(g.getGroups().length).toBeGreaterThan(0);
    expect([...panel.querySelectorAll<HTMLElement>('.aui-data-grid__group-pill')].map((p) => p.dataset.column)).toEqual(['city', 'region']);
    dragPill(g, 'group', 'region', document.body, 'after');
    expect([...panel.querySelectorAll<HTMLElement>('.aui-data-grid__group-pill')].map((p) => p.dataset.column)).toEqual(['city']);
  });
});
