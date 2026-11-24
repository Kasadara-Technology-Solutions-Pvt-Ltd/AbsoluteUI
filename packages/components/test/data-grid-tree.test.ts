import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions, type DataGridRowsChangeDetail } from '@absoluteui/components/data-grid';
import { buildTree, flattenNested } from '../src/data-grid/tree.js';

// docs/PLAN-R11-G5.md (G5c): tree data.
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

interface F {
  id: string;
  path: string[];
  size: number;
}
const files: F[] = [
  { id: 'a', path: ['Docs', 'Plans', 'budget.xlsx'], size: 30 },
  { id: 'b', path: ['Docs', 'Plans', 'roadmap.md'], size: 10 },
  { id: 'c', path: ['Docs', 'notes.txt'], size: 5 },
  { id: 'd', path: ['Music'], size: 0 },
  { id: 'e', path: ['Music', 'song.mp3'], size: 100 },
];

interface E {
  id: string;
  name: string;
  boss: string | null;
  salary: number;
}
const staff: E[] = [
  { id: '1', name: 'Ada', boss: null, salary: 500 },
  { id: '2', name: 'Ben', boss: '1', salary: 300 },
  { id: '3', name: 'Cy', boss: '2', salary: 200 },
  { id: '4', name: 'Di', boss: '1', salary: 250 },
  { id: '5', name: 'Ed', boss: 'missing', salary: 100 },
];

function mount<Row>(options: DataGridOptions<Row>): DataGrid<Row> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<Row>(host, { locale: 'en-US', rowHeight: 30, groupDefaultExpanded: -1, ...options });
}

/** Group column text of the rendered rows, in display order. */
function tree<Row>(g: DataGrid<Row>): string[] {
  return [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__body .aui-data-grid__row')]
    .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
    .map((r) => `${r.getAttribute('aria-level') ?? ''}:${r.querySelector('[data-column="aui-group"]')?.textContent ?? ''}`);
}

describe('tree engine', () => {
  it('parent ids: missing parents and cycles become roots; never loops', () => {
    const rows = [
      { id: 'x', p: 'y' },
      { id: 'y', p: 'x' },
      { id: 'z', p: 'gone' },
    ];
    const items = rows.map((row, index) => ({ row, id: row.id, index }));
    const built = buildTree(items, { kind: 'parent', parentId: (r) => r.p }, { pass: new Set(['x', 'y', 'z']), mode: 'ancestors', rank: new Map(), compareKeys: (a, b) => a.localeCompare(b), aggregates: [] });
    expect(built.orphans.sort()).toEqual(['y', 'z']);
    expect(built.roots.map((n) => n.id).sort()).toEqual(['y', 'z']);
    expect(built.roots.find((n) => n.id === 'y')?.children.map((n) => n.id)).toEqual(['x']);
  });

  it('nested rows flatten once (a repeated object is listed once)', () => {
    interface N {
      id: string;
      kids?: N[];
    }
    const leaf: N = { id: 'c' };
    const out = flattenNested<N>([{ id: 'a', kids: [{ id: 'b', kids: [leaf] }, leaf] }], (r) => r.kids, (r) => r.id);
    expect(out.rows.map((r) => r.id)).toEqual(['a', 'b', 'c']);
    expect([...out.parent]).toEqual([
      ['b', 'a'],
      ['c', 'b'],
    ]);
  });
});

describe('tree data (G5c)', () => {
  it('paths: filler rows for missing levels, labels, levels, sum aggregates of the leaves; treegrid', () => {
    const g = mount<F>({
      label: 'Files',
      rows: files,
      rowId: (r) => r.id,
      treeData: { getPath: (r) => r.path },
      columns: [{ id: 'size', header: 'Size', field: 'size', type: 'number', aggregate: 'sum' }],
    });
    expect(g.element.getAttribute('role')).toBe('treegrid');
    expect(tree(g)).toEqual(['1:Docs (3)', '2:Plans (2)', '3:budget.xlsx', '3:roadmap.md', '2:notes.txt', '1:Music (1)', '2:song.mp3']);
    const docs = g.getGroups().find((x) => x.key === 'Docs')!;
    expect(docs.aggregates.size).toBe(45);
    // Music is a data row with children: its own row, its size replaced by the aggregate.
    const music = g.host.querySelector<HTMLElement>('[data-row-id="d"]')!;
    expect(music.classList.contains('aui-data-grid__row--group')).toBe(false);
    expect(music.getAttribute('aria-expanded')).toBe('true');
    expect(music.querySelector('[data-column="size"]')?.textContent).toBe('100');
  });

  it('parent ids: orphans are reported; sort orders siblings; collapse and expand by API', () => {
    const g = mount<E>({
      label: 'Staff',
      rows: staff,
      rowId: (r) => r.id,
      treeData: { parentIdField: 'boss', label: 'name' },
      sort: [{ column: 'salary', direction: 'ascending' }],
      columns: [
        { id: 'name', header: 'Name', field: 'name' },
        { id: 'salary', header: 'Salary', field: 'salary', type: 'number' },
      ],
    });
    expect(g.getTreeOrphans()).toEqual(['5']);
    expect(tree(g)).toEqual(['1:Ed', '1:Ada (2)', '2:Di', '2:Ben (1)', '3:Cy']);
    expect(g.setExpanded('1', false)).toBe(true);
    expect(tree(g)).toEqual(['1:Ed', '1:Ada (2)']);
  });

  it('filtering keeps ancestors, or whole subtrees with treeFilter subtree', () => {
    const columns = [
      { id: 'name', header: 'Name', field: 'name' as const, filter: 'text' as const },
      { id: 'salary', header: 'Salary', field: 'salary' as const, type: 'number' as const },
    ];
    const g = mount<E>({ label: 'Staff', rows: staff, rowId: (r) => r.id, treeData: { parentIdField: 'boss', label: 'name' }, columns });
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'equals', value: 'Cy' }] });
    expect(tree(g)).toEqual(['1:Ada (1)', '2:Ben (1)', '3:Cy']);
    g.update({ treeFilter: 'subtree' });
    g.setFilter('name', { kind: 'text', conditions: [{ operator: 'equals', value: 'Ben' }] });
    expect(tree(g)).toEqual(['1:Ada (1)', '2:Ben (1)', '3:Cy']);
  });

  it('nested children; parent rows stay editable and selectable', () => {
    interface N {
      id: string;
      name: string;
      children?: N[];
    }
    const g = mount<N>({
      label: 'Nested',
      rows: [{ id: 'r', name: 'Root', children: [{ id: 'k', name: 'Kid' }] }],
      rowId: (r) => r.id,
      treeData: { childrenField: 'children', label: 'name' },
      rowSelection: { mode: 'multiple' },
      columns: [{ id: 'name', header: 'Name', field: 'name', editable: true }],
    });
    expect(tree(g)).toEqual(['1:Root (1)', '2:Kid']);
    const root = g.host.querySelector<HTMLElement>('[data-row-id="r"]')!;
    expect(root.querySelector('.aui-data-grid__select-input')).not.toBeNull();
    root.querySelector<HTMLElement>('.aui-data-grid__select-input')!.click();
    expect(g.getSelected()).toEqual(['r']);
    g.applyTransaction({ update: [{ id: 'r', name: 'Top' }] });
    expect(tree(g)).toEqual(['1:Top (1)', '2:Kid']);
  });

  it('moveRow reparents and reorders without mutating rows; blocks cycles', () => {
    const rows = staff.map((r) => ({ ...r }));
    const g = mount<E>({ label: 'Staff', rows, rowId: (r) => r.id, treeData: { parentIdField: 'boss', label: 'name' }, columns: [{ id: 'name', header: 'Name', field: 'name' }] });
    const seen: DataGridRowsChangeDetail[] = [];
    g.host.addEventListener('aui-rows-change', (e) => seen.push((e as CustomEvent<DataGridRowsChangeDetail>).detail));
    expect(g.moveRow('1', '3', 0)).toBe(false);
    expect(g.moveRow('3', '1', 0)).toBe(true);
    expect(rows[2]?.boss).toBe('2');
    expect(seen.at(-1)).toEqual({ added: [], updated: ['3'], removed: [], missing: [] });
    expect(tree(g)).toEqual(['1:Ada (3)', '2:Cy', '2:Ben', '2:Di', '1:Ed']);
    expect(g.moveRow('3', null, 5)).toBe(true);
    expect(tree(g).at(-1)).toBe('1:Cy');
  });
});
