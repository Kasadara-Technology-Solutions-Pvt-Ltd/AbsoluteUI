import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { parseCsv } from '@absoluteui/helpers/csv';
import { DataGrid, coerceCsvValues, inferColumns, type DataGridOptions } from '@absoluteui/components/data-grid';

// docs/PLAN-R11-G7.md (G7f): state additions, auto-generated columns, file drop, aligned grids.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:300px;inline-size:600px;position:relative}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
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

interface R {
  id: string;
  region: string;
  city: string;
  amount: number;
}
const rows: R[] = [
  { id: '1', region: 'East', city: 'Oslo', amount: 10 },
  { id: '2', region: 'East', city: 'Lima', amount: 5 },
  { id: '3', region: 'West', city: 'Pune', amount: 7 },
];
const columns = [
  { id: 'region', header: 'Region', field: 'region' },
  { id: 'city', header: 'City', field: 'city' },
  ...Array.from({ length: 8 }, (_, i) => ({ id: `m${String(i)}`, header: `M${String(i)}`, field: 'amount', type: 'number' as const, width: 120 })),
];

function mount(options: Partial<DataGridOptions<R>> = {}): DataGrid<R> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<R>(host, { label: 'Sales', locale: 'en-US', rowHeight: 30, rows, rowId: (r) => r.id, columns, ...options });
}

describe('state additions (G7f)', () => {
  it('getState and setState carry the pivot, detail expansion, pinned rows, and header names; a bad pivot throws and changes nothing', () => {
    const g = mount({ detail: { render: (r) => document.createTextNode(r.city) } });
    g.setDetailExpanded('2', true);
    g.pinRow('3', 'top');
    g.setColumnHeader('city', 'Town');
    g.setPivot({ rows: ['region'], columns: [], values: [{ column: 'amount', aggregate: 'sum' }] });
    const state = JSON.parse(JSON.stringify(g.getState())) as unknown;
    expect(state).toMatchObject({ details: { '2': true }, pinnedRows: { top: ['3'], bottom: [] }, pivot: { rows: ['region'], columns: [], values: [{ column: 'amount', aggregate: 'sum' }] }, columns: { headers: { city: 'Town' } } });
    const other = mount({ detail: { render: (r) => document.createTextNode(r.city) } });
    other.setState(state);
    expect(other.getPivot()).toEqual(g.getPivot());
    expect(other.getPinnedRows()).toEqual({ top: ['3'], bottom: [] });
    expect(other.getState().details).toEqual({ '2': true });
    expect(other.getColumnsState().headers).toEqual({ city: 'Town' });
    expect(() => {
      other.setState({ pivot: { rows: 'region' } });
    }).toThrow(/dataGrid\.state\.pivot/);
    expect(other.getPivot()).toEqual(g.getPivot());
    other.setState({ pivot: null, pinnedRows: { top: [], bottom: ['1', 'gone'] } });
    expect(other.getPivot()).toBeNull();
    expect(other.getPinnedRows()).toEqual({ top: [], bottom: ['1'] });
  });
});

describe('auto-generated columns and CSV (G7f)', () => {
  it('inferColumns reads own keys, types, and headers; skips objects, exclusions, and reserved keys', () => {
    const cols = inferColumns<Record<string, unknown>>([
      { id: 'a', hireDate: { kind: 'PlainDate', year: 2026, month: 1, day: 2 }, salary: 10, active: true, meta: { x: 1 }, 'aui-x': 1, mixed: 1 },
      { id: 'b', hireDate: null, salary: 20, active: false, meta: { x: 2 }, mixed: 'two' },
    ], { exclude: ['id'] });
    expect(cols).toEqual([
      { id: 'hireDate', header: 'Hire date', field: 'hireDate', type: 'date' },
      { id: 'salary', header: 'Salary', field: 'salary', type: 'number' },
      { id: 'active', header: 'Active', field: 'active', type: 'boolean' },
      { id: 'mixed', header: 'Mixed', field: 'mixed' },
    ]);
    expect(() => inferColumns([], { sample: 0 })).toThrow();
  });

  it('coerceCsvValues types numbers and booleans from helper-parsed CSV, keeps codes as text, and never writes the prototype', () => {
    const parsed = parseCsv(['name,amount,code,ok,big', '"Smith, Ann",12.5,007,true,9007199254740993', '"Say ""hi""",,1e3,false,0.5', ''].join('\n'), { header: true });
    const out = coerceCsvValues(parsed.rows);
    expect(out).toEqual([
      { name: 'Smith, Ann', amount: 12.5, code: '007', ok: true, big: '9007199254740993' },
      { name: 'Say "hi"', amount: null, code: 1000, ok: false, big: 0.5 },
    ]);
    const hostile = coerceCsvValues([Object.fromEntries([['__proto__', '1']])]);
    expect(Object.getPrototypeOf(hostile[0])).toBe(Object.prototype);
    expect(Object.getOwnPropertyNames(hostile[0])).toEqual(['__proto__']);
    expect(() => coerceCsvValues('x' as unknown as Record<string, string>[])).toThrow();
  });

  it('fileDrop shows an overlay while files are over the grid and passes accepted files on; others are announced', () => {
    const got: string[] = [];
    const g = mount({ fileDrop: { accept: ['.csv'], onFiles: (files) => got.push(...files.map((f) => f.name)) } });
    const data = new DataTransfer();
    data.items.add(new File(['a,b\n1,2'], 'sales.csv', { type: 'text/csv' }));
    g.host.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
    expect(g.host.querySelector('.aui-data-grid__file-drop')?.textContent).toBe('Drop files to load');
    g.host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
    expect(got).toEqual(['sales.csv']);
    expect(g.host.querySelector('.aui-data-grid__file-drop')).toBeNull();
    const other = new DataTransfer();
    other.items.add(new File(['x'], 'photo.png', { type: 'image/png' }));
    g.host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: other }));
    expect(got).toEqual(['sales.csv']);
    expect(() => mount({ fileDrop: { onFiles: 'no' } as unknown as DataGridOptions<R>['fileDrop'] & object })).toThrow();
  });
});

describe('aligned grids (G7f)', () => {
  it('alignWith copies columns now and on changes both ways, and keeps horizontal scroll in step; the remover ends it', () => {
    const main = mount();
    const totals = mount({ rows: [{ id: 't', region: 'Total', city: '', amount: 22 }] });
    main.setColumnHidden('city', true);
    const end = main.alignWith(totals);
    expect(totals.getColumnsState().hidden).toEqual(['city']);
    totals.setColumnPinned('m0', 'start');
    totals.host.dispatchEvent(new CustomEvent('aui-columns-change', { detail: {} }));
    expect(main.getColumnsState().pinned).toEqual({ m0: 'start' });
    const mv = main.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!;
    const tv = totals.host.querySelector<HTMLElement>('.aui-data-grid__viewport')!;
    mv.scrollLeft = 200;
    mv.dispatchEvent(new Event('scroll'));
    expect(tv.scrollLeft).toBe(mv.scrollLeft);
    end();
    main.setColumnHidden('region', true);
    main.host.dispatchEvent(new CustomEvent('aui-columns-change', { detail: {} }));
    expect(totals.getColumnsState().hidden).toEqual(['city']);
    expect(() => main.alignWith(main)).toThrow();
  });
});
