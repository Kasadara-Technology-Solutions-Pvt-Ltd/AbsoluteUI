// R11 Data Grid page (docs/PLAN-R11-G1.md), bundled against the built packages.
import { configureAbsoluteUI, plainDate } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { DataGrid, type DataGridRowsRequest } from '@absoluteui/components/data-grid';
import { comboboxEditor } from '@absoluteui/components/data-grid/editors';
import { toXlsx } from '@absoluteui/components/data-grid/export';
import { toPdf } from '@absoluteui/components/data-grid/pdf';
import { formulaBar, formulaEngine } from '@absoluteui/components/data-grid/formulas';
import { chartRange, sparklineColumn } from '@absoluteui/components/data-grid/charts';
import { columnChooser, columnMenu, contextMenu, find, notes, sideBar, statusBar, toolbar, tooltips, type DataGridNote } from '@absoluteui/components/data-grid/accessories';

const params = new URLSearchParams(location.search);
const direction = params.get('dir') === 'rtl' ? 'rtl' : 'ltr';
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', locale: 'en-US', direction, timezone: 'Europe/Berlin' });
document.documentElement.dir = direction;
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

interface Employee {
  id: string;
  name: string;
  department: string;
  city: string;
  salary: number;
  hired: ReturnType<typeof plainDate>;
  active: boolean;
  manager: string | null;
}

const DEPARTMENTS = ['Engineering', 'Finance', 'Sales', 'Support', 'People'];
const CITIES = ['Berlin', 'Pune', 'Lima', 'Oslo'];
const rows: Employee[] = Array.from({ length: Number(params.get('rows') ?? 500) }, (_, i) => ({
  id: `e${String(i)}`,
  name: `Employee ${String(i).padStart(6, '0')}`,
  department: DEPARTMENTS[i % DEPARTMENTS.length] ?? '',
  city: CITIES[i % CITIES.length] ?? '',
  salary: 40000 + ((i * 7919) % 90000),
  hired: plainDate(2010 + (i % 15), 1 + (i % 12), 1 + (i % 28)),
  active: i % 7 !== 0,
  manager: i === 0 ? null : `e${String(Math.floor((i - 1) / 5))}`,
}));

// `?filters=1`: filter kinds per column, the floating filter row, and the search box (G2b).
// `?advanced=1`: the same filterable columns with the advanced filter (expression bar and builder).
const advanced = params.get('advanced') === '1';
const filtering = params.get('filters') === '1' || advanced;
// `?select=1`: multiple row selection with checkboxes (G3a).
const selecting = params.get('select') === '1';
// `?ranges=1`: cell ranges with column selection (G3b).
// `?rowedit=1`: the editable columns of `?ranges=1` with full-row editing (G4b).
const rowEditing = params.get('rowedit') === '1';
// `?listedit=1`: the editable columns with a Combobox list editor for Department (G4c).
const listEditing = params.get('listedit') === '1';
// `?group=1`: grouped by department with a salary sum and a grand total (G5a).
const grouping = params.get('group') === '1';
// `?tree=1`: tree data by manager (each employee manages up to five), labeled by name (G5c).
const treeing = params.get('tree') === '1';
// `?detail=1`: master/detail with a nested grid of reviews per employee (G5d).
const detailing = params.get('detail') === '1';
// `?pivot=1`: pivot mode with the pivot panel: department rows, city columns, salary sums (G5e).
const pivoting = params.get('pivot') === '1';
// `?rownumbers=1`: resizable row numbers (G7a1).
const numbering = params.get('rownumbers') === '1';
// `?pinned=1`: a static pinned top row and a pinned grand total (G7a2).
const pinning = params.get('pinned') === '1';
// `?grouprows=1` (with `&group=1`): full-width group rows; `?fullwidth=1`: every tenth row is a full-width section row (G7a3).
const groupRows = params.get('grouprows') === '1';
const fullWidth = params.get('fullwidth') === '1';
// `?spans=1`: rows sorted by department with merged department cells (G7a4).
const spanning = params.get('spans') === '1';
// `?menus=1`: the column menu and the cell menu (G7b).
const menus = params.get('menus') === '1';
// `?panels=1` (with `&ranges=1`): the status bar and a toolbar (G7c).
const panels = params.get('panels') === '1';
// `?side=1` (with `&filters=1`): the side bar with the Columns and Filters panels (G7c2).
const side = params.get('side') === '1';
// `?g7d=1`: cell tooltips (Name), find, and notes in memory (G7d).
const g7d = params.get('g7d') === '1';
// `?drag=1`: managed row dragging of the selected rows (G7e1); with `&tree=1` rows move between parents.
const dragging = params.get('drag') === '1';
// `?formulas=1`: calculated columns (G9b): a share of the salary total and a division that fails on row e1.
const calculating = params.get('formulas') === '1';
// `?sparklines=1`: a sparkline column of six monthly values per employee (G10a).
const sparklines = params.get('sparklines') === '1';
const noteStore = new Map<string, DataGridNote>([['e2|salary', { text: 'Raise pending', author: 'HR' }]]);
// `?server=1`: the server row model over the same rows (sorted on the "server", 50 ms per block); `&fail=1` fails the first request (G6a).
const serving = params.get('server') === '1';
let failNext = params.get('fail') === '1';
const groupCounts = new Map<string, number>();
const datasource = {
  getRows(request: DataGridRowsRequest, signal: AbortSignal): Promise<{ rows: Employee[]; rowCount: number }> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        if (failNext) {
          failNext = false;
          reject(new Error('Service unavailable'));
          return;
        }
        if (request.groupBy.length > request.groupKeys.length) {
          // Server groups (`&group=1`): one row per department with its count and salary sum.
          const groups = DEPARTMENTS.map((department) => {
            const members = rows.filter((r) => r.department === department);
            const row: Employee = { id: `g-${department}`, name: '', department, city: '', salary: members.reduce((s, r) => s + r.salary, 0), hired: plainDate(2026, 1, 1), active: true, manager: null };
            groupCounts.set(row.id, members.length);
            return row;
          });
          resolve({ rows: groups.slice(request.start, request.end), rowCount: groups.length });
          return;
        }
        const scope = request.groupKeys.length > 0 ? rows.filter((r) => r.department === request.groupKeys[0]) : rows;
        const sort = request.sort[0];
        const sorted = sort ? [...scope].sort((a, b) => (sort.direction === 'descending' ? -1 : 1) * (sort.column === 'salary' ? a.salary - b.salary : a.name.localeCompare(b.name))) : rows;
        resolve({ rows: (sort ? sorted : scope).slice(request.start, request.end), rowCount: scope.length });
      }, 50);
      signal.addEventListener('abort', () => {
        clearTimeout(timer);
        reject(new DOMException('Aborted', 'AbortError'));
      });
    });
  },
};
interface Review {
  id: string;
  year: number;
  rating: string;
}
const nestedGrids = new WeakMap<Node, DataGrid<Review>>();
const ranging = params.get('ranges') === '1' || rowEditing || listEditing;
const last = byId('last-event');
const host = byId('grid');
const grid = DataGrid.create<Employee>(host, {
  label: 'Employees',
  description: 'Arrow keys move between cells; Shift+arrows on a header move columns; Alt+arrows resize.',
  rows,
  rowId: (r) => r.id,
  ...(filtering ? { floatingFilters: true, searchBox: true } : {}),
  ...(advanced ? { advancedFilter: true } : {}),
  ...(ranging ? { cellSelection: { columnSelection: true, fillHandle: true } } : {}),
  ...(rowEditing ? { editMode: 'row' as const } : {}),
  ...(grouping ? { groupBy: ['department'], grandTotal: 'bottom' as const, groupPanel: true } : {}),
  ...(calculating ? { formulas: formulaEngine(), accessories: [formulaBar<Employee>()], cellSelection: true } : {}),
  ...(dragging ? { rowDragging: { managed: true, multiRow: true } } : {}),
  ...(treeing ? { treeData: { parentIdField: 'manager', label: 'name' } } : {}),
  ...(menus ? { accessories: [columnMenu<Employee>(), contextMenu<Employee>({ export: { excel: (g) => toXlsx(g, { autoFilter: true }), pdf: (g) => toPdf(g, { columns: ['name', 'department', 'salary', 'hired'] }) } }), columnChooser<Employee>()] } : {}),
  ...(g7d
    ? {
        accessories: [
          tooltips<Employee>({ showDelay: 100 }),
          find<Employee>(),
          contextMenu<Employee>(),
          notes<Employee>({
            store: {
              get: (rowId: string, column: string) => Promise.resolve(noteStore.get(`${rowId}|${column}`) ?? null),
              set: (rowId: string, column: string, note: DataGridNote | null) => {
                if (note) noteStore.set(`${rowId}|${column}`, note);
                else noteStore.delete(`${rowId}|${column}`);
                return Promise.resolve();
              },
              index: () => Promise.resolve([...noteStore.keys()].map((k) => ({ rowId: k.split('|')[0] ?? '', column: k.split('|')[1] ?? '' }))),
            },
          }),
        ],
      }
    : {}),
  ...(side ? { accessories: [sideBar<Employee>({ open: 'columns' })] } : {}),
  ...(panels ? { accessories: [columnChooser<Employee>(), statusBar<Employee>(), toolbar<Employee>({ items: ['chooser', 'autoSizeAll', 'separator', { id: 'more', label: 'More', items: ['resetColumns'] }] })] } : {}),
  ...(spanning ? { sort: [{ column: 'department', direction: 'ascending' as const }] } : {}),
  ...(groupRows ? { groupDisplay: 'rows' as const, groupDefaultExpanded: -1 } : {}),
  ...(fullWidth ? { fullWidthRow: { isFullWidth: (r: Employee) => Number(r.id.slice(1)) % 10 === 9, render: (r: Employee, context: { doc: Document }) => Object.assign(context.doc.createElement('strong'), { textContent: `Section after ${r.name}` }) } } : {}),
  ...(pinning ? { pinnedTopRows: [{ ...rows[0], id: 'pinned-target', name: 'Target' } as Employee], grandTotal: 'pinnedBottom' as const } : {}),
  ...(numbering ? { rowNumbers: { resizable: true } } : {}),
  ...(serving ? { datasource, blockSize: 50, getChildCount: (r: Employee) => groupCounts.get(r.id) ?? null } : {}),
  ...(pivoting ? { pivot: { rows: ['department'], columns: ['city'], values: [{ column: 'salary', aggregate: 'sum' as const }] }, pivotPanel: true, grandTotal: 'bottom' as const } : {}),
  ...(detailing
    ? {
        detail: {
          height: 200,
          render: (row: Employee, context: { doc: Document }) => {
            const box = context.doc.createElement('div');
            box.className = 'detail-grid';
            const reviews: Review[] = [2024, 2025, 2026].map((year) => ({ id: `${row.id}-${String(year)}`, year, rating: ['Meets', 'Exceeds', 'Outstanding'][(year + row.salary) % 3] ?? '' }));
            nestedGrids.set(box, DataGrid.create<Review>(box, { label: `Reviews of ${row.name}`, rows: reviews, rowId: (r) => r.id, columns: [{ id: 'year', header: 'Year', field: 'year', type: 'number', width: 100 }, { id: 'rating', header: 'Rating', field: 'rating', width: 160 }] }));
            return box;
          },
          destroy: (node: Node) => {
            nestedGrids.get(node)?.destroy();
          },
        },
      }
    : {}),
  ...(selecting ? { rowSelection: { mode: 'multiple' as const, selectable: (r: Employee) => r.active } } : {}),
  columns: [
    { id: 'name', header: 'Name', field: 'name', pinned: 'start', width: 200, ...(g7d ? { tooltip: true as const } : {}), ...(filtering ? { filter: 'text' as const } : {}) },
    {
      id: 'org',
      header: 'Organization',
      collapsible: true,
      children: [
        { id: 'department', header: 'Department', field: 'department', width: 160, groupable: true, editable: ranging, ...(spanning ? { spanRows: true } : {}), ...(listEditing ? { editor: comboboxEditor<Employee>({ values: DEPARTMENTS.map((d) => ({ value: d, label: d })) }) } : {}), ...(filtering ? { filter: 'set' as const } : {}) },
        { id: 'city', header: 'City', field: 'city', width: 120, visibleWhen: 'expanded' },
      ],
    },
    { id: 'salary', header: 'Salary', field: 'salary', type: 'currency', currency: 'EUR', width: 140, editable: ranging, editor: { min: 0 }, aggregate: 'sum' as const, ...(filtering ? { filter: 'number' as const } : {}) },
    ...(calculating
      ? [
          { id: 'share', header: 'Share', type: 'number' as const, width: 120, pinned: 'start' as const, formula: 'ROUND([Salary] / SUM([Salary]) * 100, 2)' },
          { id: 'ratio', header: 'Ratio', type: 'number' as const, width: 120, pinned: 'start' as const, formula: 'IF([@Salary] > 0, 1000 / ([Salary] - [Salary]), 0)' },
          { id: 'bonus', header: 'Bonus', field: 'bonus', type: 'number' as const, width: 140, pinned: 'start' as const, editable: true, formulas: true },
        ]
      : []),
    ...(sparklines ? [{ id: 'trend', header: 'Trend', width: 140, pinned: 'start' as const, ...sparklineColumn<Employee>({ values: (r) => Array.from({ length: 6 }, (_, i) => (r.salary * (i + 3)) % 997), label: (r) => `${r.name}, last 6 months`, locale: 'en-US' }) }] : []),
    { id: 'hired', header: 'Hired', field: 'hired', type: 'date', width: 140, groupable: true, groupHierarchy: ['year', 'quarter'] as const, ...(filtering ? { filter: 'date' as const } : {}) },
    { id: 'active', header: 'Active', field: 'active', type: 'boolean', width: 100, pinned: 'end', ...(filtering ? { filter: 'boolean' as const } : {}) },
    ...Array.from({ length: 30 }, (_, i) => ({ id: `m${String(i)}`, header: `Metric ${String(i + 1)}`, accessor: (r: Employee) => (r.salary * (i + 1)) % 1000, type: 'number' as const, width: 120 })),
  ],
});
for (const type of ['aui-sort-change', 'aui-columns-change', 'aui-cell-activate', 'aui-page-change', 'aui-filter-change', 'aui-selection-change', 'aui-range-change', 'aui-cells-change', 'aui-row-group-toggle', 'aui-group-change', 'aui-detail-toggle', 'aui-pivot-change', 'aui-row-resize', 'aui-row-pin']) {
  host.addEventListener(type, () => {
    last.textContent = type;
  });
}

if (dragging) {
  // An external drop zone (G7e2): rows dragged onto it, or sent with the cell menu, are reported below.
  const zone = document.createElement('section');
  zone.setAttribute('aria-label', 'Archive');
  zone.textContent = 'Archive: drop rows here';
  zone.style.setProperty('padding', '16px');
  zone.style.setProperty('border', '2px dashed currentColor');
  host.after(zone);
  grid.addRowDropZone({
    element: zone,
    label: 'Archive',
    onDrop: (d) => {
      last.textContent = `archived ${d.rowIds.join(',')}`;
    },
  });
}

if (params.get('aligned') === '1') {
  // A totals grid aligned with the main grid (G7f), and a file drop overlay on the main grid.
  const totalsHost = document.createElement('div');
  totalsHost.className = 'demo-grid-host demo-grid-host--short';
  host.after(totalsHost);
  const salary = rows.reduce((sum, r) => sum + r.salary, 0);
  const totals = DataGrid.create<Employee>(totalsHost, {
    label: 'Totals',
    rows: [{ ...rows[0]!, id: 'total', name: 'Total', salary }],
    rowId: (r) => r.id,
    columns: grid.getColumnsState().order.map((id) => ({ id, header: id === 'name' ? 'Name' : id, ...(id === 'salary' ? { field: 'salary' as const, type: 'currency' as const, currency: 'EUR' } : id === 'name' ? { field: 'name' as const } : { accessor: () => '' }) })),
  });
  grid.alignWith(totals);
  grid.update({
    fileDrop: {
      accept: ['.csv'],
      onFiles: (files) => {
        last.textContent = `files ${files.map((f) => f.name).join(',')}`;
      },
    },
  });
}

if (params.get('chart') === '1') {
  // A range chart of the first five rows' salaries (G10b), with cell ranges on.
  grid.update({ cellSelection: true });
  const ids = rows.slice(0, 5).map((r) => r.id);
  grid.addCellRange({ startRow: ids[0] ?? '', endRow: ids[4] ?? '', startColumn: 'name', endColumn: 'salary' });
  chartRange(grid, { title: 'Salaries' });
}

// Exposed for the performance spec only (harness code, not library API).
Object.assign(window, { __auiReady: true, __aui: { DataGrid }, __grid: grid });
