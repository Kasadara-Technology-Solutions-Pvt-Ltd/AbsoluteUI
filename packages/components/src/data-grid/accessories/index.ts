/**
 * Data Grid accessories (docs/PLAN-R11-G7.md, G7b; decision R11-16): the column menu, the cell
 * context menu, and the column chooser. A separate entry point
 * (`@absoluteui/components/data-grid/accessories`), so the core grid bundle does not include
 * Context Menu or Dialog. Pass the factories in the grid's `accessories` option:
 *
 *   DataGrid.create(host, { ..., accessories: [columnMenu(), contextMenu(), columnChooser()] });
 *
 * One Context Menu per grid serves both menus: a header (its menu button, a right-click, Shift+F10,
 * or the ContextMenu key) opens the column menu; a cell opens the cell menu. Every action is also
 * reachable by keyboard and through the grid's API.
 */
import { getMessage, registerMessages } from '@absoluteui/core';
import { ContextMenu, type ContextMenuSelectDetail } from '../../context-menu/context-menu.js';
import { Dialog } from '../../dialog/dialog.js';
import { Menu } from '../../menu/menu.js';
import { renderIcon } from '@absoluteui/icons';
import { addAriaReference, autoPosition, removeAriaReference } from '@absoluteui/utilities';
import type { MenuItem, MenuSelectDetail } from '../../menu/engine.js';
import type { DataGrid, DataGridAccessory, DataGridAccessoryColumn, DataGridAccessoryContext, DataGridCsvOptions } from '../data-grid.js';
import { downloadCsv } from '../../data-table/csv.js';

registerMessages('dataGridMenu', 'en', {
  columnMenu: 'Column menu',
  columnMenuFor: 'Column menu, {column}',
  cellMenu: 'Cell menu',
  sortAscending: 'Sort ascending',
  sortDescending: 'Sort descending',
  clearSort: 'Clear sort',
  filter: 'Filter',
  pin: 'Pin column',
  pinStart: 'Pin to start',
  pinEnd: 'Pin to end',
  unpin: 'Unpin',
  autoSize: 'Autosize this column',
  autoSizeAll: 'Autosize all columns',
  group: 'Group by {column}',
  ungroup: 'Ungroup by {column}',
  expandAll: 'Expand all groups',
  collapseAll: 'Collapse all groups',
  hide: 'Hide column',
  rename: 'Rename column',
  chooser: 'Choose columns',
  resetColumns: 'Reset columns',
  copy: 'Copy',
  copyWithHeaders: 'Copy with headers',
  cut: 'Cut',
  paste: 'Paste',
  pinRow: 'Pin row',
  pinRowTop: 'Pin to top',
  pinRowBottom: 'Pin to bottom',
  unpinRow: 'Unpin row',
  moveRow: 'Move row',
  moveRowUp: 'Move up',
  moveRowDown: 'Move down',
  sendTo: 'Send to',
  export: 'Export',
  exportCsv: 'CSV (.csv)',
  exportExcel: 'Excel (.xlsx)',
  exportPdf: 'PDF (.pdf)',
  exportFailed: 'The export failed',
  columns: 'Columns',
  groups: 'Groups',
  chooserTitle: 'Choose columns',
  chooserSearch: 'Search columns',
  chooserAll: 'Show all columns',
  chooserEmpty: 'No matching columns',
  moveUp: 'Move {column} up',
  moveDown: 'Move {column} down',
  done: 'Done',
  status: 'Grid status',
  rows: 'Rows: {total}',
  rowsFiltered: 'Rows: {shown} of {total}',
  selected: 'Selected: {count}',
  aggCount: 'Count: {value}',
  aggSum: 'Sum: {value}',
  aggAvg: 'Average: {value}',
  aggMin: 'Min: {value}',
  aggMax: 'Max: {value}',
  toolbar: 'Grid actions',
  groupShort: 'Group',
  filters: 'Filters',
  filtered: 'Filtered',
  find: 'Find in grid',
  findPrevious: 'Previous match',
  findNext: 'Next match',
  findNone: 'No matches',
  findCount: 'Match {index} of {total}',
  findCurrent: 'current match',
  hasNote: 'has a note',
  noteTitle: 'Note',
  noteText: 'Note',
  addNote: 'Add note',
  editNote: 'Edit note',
  save: 'Save',
  cancel: 'Cancel',
  close: 'Close',
  deleteNote: 'Delete note',
  noteSaved: 'Note saved',
  noteDeleted: 'Note deleted',
  noteFailed: 'The note could not be saved or read',
});

/** A menu entry of your own. */
export interface DataGridMenuAction {
  readonly id: string;
  readonly label: string;
  readonly action?: () => void;
  readonly disabled?: boolean;
  /** Displayed hint only (for example "Ctrl+C"). */
  readonly shortcut?: string;
  readonly icon?: string;
  /** A submenu. */
  readonly items?: readonly DataGridMenuEntry[];
}

/** Built-in column menu entries. */
export type DataGridColumnMenuItem = 'sortAscending' | 'sortDescending' | 'clearSort' | 'filter' | 'pin' | 'autoSize' | 'autoSizeAll' | 'group' | 'groups' | 'expandAll' | 'collapseAll' | 'hide' | 'rename' | 'chooser' | 'resetColumns' | 'columns';
/** Built-in cell menu entries. */
export type DataGridCellMenuItem = 'copy' | 'copyWithHeaders' | 'cut' | 'paste' | 'note' | 'pinRow' | 'moveRow' | 'moveUp' | 'moveDown' | 'sendTo' | 'export' | 'exportCsv' | 'exportExcel' | 'exportPdf' | 'autoSizeAll' | 'groups' | 'expandAll' | 'collapseAll' | 'resetColumns' | 'columns';
export type DataGridMenuEntry = DataGridColumnMenuItem | DataGridCellMenuItem | 'separator' | DataGridMenuAction;

export interface DataGridColumnMenuOptions {
  /** The entries of a column's menu (receives the defaults; return them changed or your own). */
  readonly items?: (column: string, defaults: readonly DataGridMenuEntry[]) => readonly DataGridMenuEntry[];
  /** Add a menu button to each data column's header (default true). */
  readonly button?: boolean;
}

export interface DataGridCellMenuTarget<Row> {
  readonly rowId: string;
  readonly column: string;
  readonly row: Row | undefined;
}

/** The cell menu's Export submenu: CSV always, Excel when `excel` is given (for example `toXlsx` from `data-grid/export`). */
export interface DataGridMenuExport<Row> {
  /** File name without the extension (default: the grid's label). */
  readonly filename?: string;
  readonly csv?: DataGridCsvOptions<Row>;
  readonly excel?: (grid: DataGrid<Row>) => Promise<Blob>;
  /** A PDF export (for example `toPdf` from `data-grid/pdf`); adds "PDF (.pdf)". */
  readonly pdf?: (grid: DataGrid<Row>) => Promise<Blob>;
}

export interface DataGridContextMenuOptions<Row> {
  /** The entries of a cell's menu (receives the defaults). */
  readonly items?: (target: DataGridCellMenuTarget<Row>, defaults: readonly DataGridMenuEntry[]) => readonly DataGridMenuEntry[];
  /** The Export submenu (default: CSV with the default options); false leaves it out. */
  readonly export?: DataGridMenuExport<Row> | false;
}

/** A provider of menu entries for a header (`rowId` null) or a cell. */
type Provider = (cell: { rowId: string | null; column: string }) => readonly DataGridMenuEntry[];

/** The shared menu of a grid, with the providers and built-in actions of the accessories attached to it. */
interface SharedMenu<Row> {
  readonly context: DataGridAccessoryContext<Row>;
  readonly menu: ContextMenu;
  header: Provider | null;
  cell: Provider | null;
  chooser: (() => void) | null;
  note: { has: (rowId: string, column: string) => boolean; open: (rowId: string, column: string) => void } | null;
  exports: DataGridMenuExport<Row> | null;
  actions: Map<string, () => void>;
  users: number;
  readonly dispose: () => void;
}

const shared = new WeakMap<HTMLElement, SharedMenu<unknown>>();

const msg = <Row>(context: DataGridAccessoryContext<Row>, key: string, params: Readonly<Record<string, string>> = {}): string => getMessage('dataGridMenu', key, params, context.locale());

const isMenuKey = (event: KeyboardEvent): boolean => (event.key === 'ContextMenu' && !event.ctrlKey && !event.metaKey && !event.altKey) || (event.key === 'F10' && event.shiftKey && !event.ctrlKey && !event.metaKey && !event.altKey);

/** The grid's shared menu (created by the first menu accessory, destroyed with the last). */
function sharedMenu<Row>(context: DataGridAccessoryContext<Row>): SharedMenu<Row> {
  const existing = shared.get(context.element) as SharedMenu<Row> | undefined;
  if (existing) {
    existing.users++;
    return existing;
  }
  const menu = ContextMenu.create(context.element, { items: [], disabled: true, direction: context.direction() });
  const s: SharedMenu<Row> = {
    context,
    menu,
    header: null,
    cell: null,
    chooser: null,
    note: null,
    exports: null,
    actions: new Map(),
    users: 1,
    dispose: () => {
      context.element.removeEventListener('contextmenu', onContext, true);
      context.element.removeEventListener('keydown', onKey, true);
      context.element.removeEventListener('aui-select', onSelect);
      menu.destroy();
      shared.delete(context.element);
    },
  };
  // Before the Context Menu sees the event: fill it for the header or cell (or leave the browser's menu).
  const onContext = (event: Event): void => {
    prepare(s, event.target);
  };
  const onKey = (event: KeyboardEvent): void => {
    if (isMenuKey(event)) prepare(s, event.target);
  };
  const onSelect = (event: Event): void => {
    // Handled here: the grid's host does not see the menu's selection.
    event.stopPropagation();
    const detail = (event as CustomEvent<ContextMenuSelectDetail>).detail;
    s.actions.get(detail.id)?.();
  };
  context.element.addEventListener('contextmenu', onContext, true);
  context.element.addEventListener('keydown', onKey, true);
  context.element.addEventListener('aui-select', onSelect);
  shared.set(context.element, s as SharedMenu<unknown>);
  return s;
}

function release<Row>(s: SharedMenu<Row>): void {
  s.users--;
  if (s.users <= 0) s.dispose();
}

/** Fill the menu for an event target; disabled (the browser's menu) when no provider covers it. */
function prepare<Row>(s: SharedMenu<Row>, target: EventTarget | null): boolean {
  const cell = s.context.cellAt(target);
  return cell ? fill(s, cell) : disable(s);
}

function disable<Row>(s: SharedMenu<Row>): false {
  s.menu.update({ disabled: true });
  return false;
}

function fill<Row>(s: SharedMenu<Row>, cell: { rowId: string | null; column: string }): boolean {
  const provider = cell.rowId === null ? s.header : s.cell;
  if (!provider) return disable(s);
  const entries = provider(cell);
  s.actions = new Map();
  const items = toItems(s, entries, cell, 'm');
  if (items.length === 0) return disable(s);
  const header = s.context.columns().find((c) => c.id === cell.column)?.header ?? cell.column;
  s.menu.update({ items, disabled: false, label: cell.rowId === null ? msg(s.context, 'columnMenuFor', { column: header }) : msg(s.context, 'cellMenu'), direction: s.context.direction() });
  return true;
}

/** Menu items for entries (built-ins resolved for the cell; actions registered by item id). */
function toItems<Row>(s: SharedMenu<Row>, entries: readonly DataGridMenuEntry[], cell: { rowId: string | null; column: string }, prefix: string): MenuItem[] {
  const out: MenuItem[] = [];
  entries.forEach((entry, i) => {
    if (entry === 'separator') {
      // No leading, trailing, or doubled separators.
      if (out.length > 0 && out.at(-1)?.type !== 'separator') out.push({ type: 'separator' });
      return;
    }
    const resolved = typeof entry === 'string' ? builtIn(s, entry, cell) : entry;
    if (!resolved) return;
    const id = `${prefix}-${String(i)}`;
    if (resolved.action) s.actions.set(id, resolved.action);
    out.push({
      id,
      label: resolved.label,
      ...(resolved.disabled === true ? { disabled: true } : {}),
      ...(resolved.shortcut ? { shortcut: resolved.shortcut } : {}),
      ...(resolved.icon ? { icon: resolved.icon } : {}),
      ...(resolved.items ? { items: toItems(s, resolved.items, cell, id) } : {}),
    });
  });
  while (out.at(-1)?.type === 'separator') out.pop();
  return out;
}

/** A built-in entry for a cell or header, or null when it does not apply there. */
function builtIn<Row>(s: SharedMenu<Row>, name: DataGridColumnMenuItem | DataGridCellMenuItem, cell: { rowId: string | null; column: string }): DataGridMenuAction | null {
  const c = s.context;
  const t = (key: string, params: Readonly<Record<string, string>> = {}): string => msg(c, key, params);
  const grid = c.grid;
  const column: DataGridAccessoryColumn | undefined = c.columns().find((x) => x.id === cell.column);
  const sorted = grid.sort.find((x) => x.column === cell.column)?.direction ?? null;
  const grouped = grid.getGroups().length > 0;
  switch (name) {
    case 'sortAscending':
      return column?.sortable ? { id: name, label: t('sortAscending'), disabled: sorted === 'ascending', action: () => { c.sort(cell.column, 'ascending'); } } : null;
    case 'sortDescending':
      return column?.sortable ? { id: name, label: t('sortDescending'), disabled: sorted === 'descending', action: () => { c.sort(cell.column, 'descending'); } } : null;
    case 'clearSort':
      // Only while the column is sorted (keeps the menu short).
      return column?.sortable && sorted !== null ? { id: name, label: t('clearSort'), action: () => { c.sort(cell.column, null); } } : null;
    case 'filter':
      return column?.filterable ? { id: name, label: t('filter'), action: () => { c.openFilter(cell.column); } } : null;
    case 'pin':
      return column
        ? {
            id: name,
            label: t('pin'),
            items: [
              { id: 'pin-start', label: t('pinStart'), disabled: column.pinned === 'start', action: () => grid.setColumnPinned(cell.column, 'start') },
              { id: 'pin-end', label: t('pinEnd'), disabled: column.pinned === 'end', action: () => grid.setColumnPinned(cell.column, 'end') },
              { id: 'unpin', label: t('unpin'), disabled: column.pinned === null, action: () => grid.setColumnPinned(cell.column, null) },
            ],
          }
        : null;
    case 'autoSize':
      return column ? { id: name, label: t('autoSize'), action: () => { grid.autoSizeColumns([cell.column]); } } : null;
    case 'autoSizeAll':
      return { id: name, label: t('autoSizeAll'), action: () => { grid.autoSizeColumns(); } };
    case 'group':
      if (!column || !(column.groupable || column.grouped)) return null;
      return { id: name, label: t(column.grouped ? 'ungroup' : 'group', { column: column.header }), action: () => { c.group(cell.column, !column.grouped); } };
    case 'expandAll':
      return grouped ? { id: name, label: t('expandAll'), action: () => { grid.expandAll(); } } : null;
    case 'collapseAll':
      return grouped ? { id: name, label: t('collapseAll'), action: () => { grid.collapseAll(); } } : null;
    case 'hide':
      return column ? { id: name, label: t('hide'), action: () => grid.setColumnHidden(cell.column, true) } : null;
    case 'rename':
      return column ? { id: name, label: t('rename'), action: () => { c.editHeader(cell.column); } } : null;
    case 'chooser': {
      const open = s.chooser;
      return open ? { id: name, label: t('chooser'), action: open } : null;
    }
    case 'groups':
      return grouped
        ? { id: name, label: t('groups'), items: ['expandAll', 'collapseAll'] }
        : null;
    case 'columns':
      return { id: name, label: t('columns'), items: cell.rowId === null ? ['autoSize', 'autoSizeAll', 'rename', 'chooser', 'resetColumns'] : ['autoSizeAll', 'chooser', 'resetColumns'] };
    case 'resetColumns':
      return { id: name, label: t('resetColumns'), action: () => { grid.resetColumns(); } };
    case 'copy':
      return { id: name, label: t('copy'), shortcut: 'Ctrl+C', action: () => void c.copy(false) };
    case 'copyWithHeaders':
      return { id: name, label: t('copyWithHeaders'), action: () => void c.copy(true) };
    case 'cut':
      return { id: name, label: t('cut'), shortcut: 'Ctrl+X', action: () => void c.cut() };
    case 'paste': {
      const clipboard = (c.doc.defaultView ?? window).navigator.clipboard as Clipboard | undefined;
      if (!clipboard) return null;
      return { id: name, label: t('paste'), shortcut: 'Ctrl+V', action: () => void clipboard.readText().then((text) => { c.paste(text); }) };
    }
    case 'note': {
      const rowId = cell.rowId;
      const note = s.note;
      if (rowId === null || !note) return null;
      return { id: name, label: t(note.has(rowId, cell.column) ? 'editNote' : 'addNote'), shortcut: 'Shift+F2', action: () => { note.open(rowId, cell.column); } };
    }
    case 'moveRow': {
      const rowId = cell.rowId;
      if (rowId === null || !(c.canMoveRow(rowId, 'up') || c.canMoveRow(rowId, 'down'))) return null;
      return { id: name, label: t('moveRow'), items: ['moveUp', 'moveDown'] };
    }
    case 'export':
      return s.exports ? { id: name, label: t('export'), items: ['exportCsv', ...(s.exports.excel ? (['exportExcel'] as const) : []), ...(s.exports.pdf ? (['exportPdf'] as const) : [])] } : null;
    case 'exportCsv':
    case 'exportExcel':
    case 'exportPdf': {
      const ex = s.exports;
      if (!ex || (name === 'exportExcel' && !ex.excel) || (name === 'exportPdf' && !ex.pdf)) return null;
      const named = c.element.matches('[role="grid"], [role="treegrid"]') ? c.element : c.element.querySelector('[role="grid"], [role="treegrid"]');
      const label = ex.filename ?? named?.getAttribute('aria-label') ?? 'export';
      // No path separators or characters file systems reject.
      const file = label.replace(/[\\/:*?"<>|]+/g, '-').trim() || 'export';
      return {
        id: name,
        label: t(name),
        action: () => {
          if (name === 'exportCsv') {
            downloadCsv(grid.toCsvBlob(ex.csv), `${file}.csv`, c.doc);
            return;
          }
          const make = name === 'exportPdf' ? ex.pdf : ex.excel;
          void make?.(grid).then(
            (blob) => {
              downloadCsv(blob, `${file}.${name === 'exportPdf' ? 'pdf' : 'xlsx'}`, c.doc);
            },
            () => {
              c.announce(t('exportFailed'));
            },
          );
        },
      };
    }
    case 'sendTo': {
      const rowId = cell.rowId;
      const zones = c.dropZones();
      if (rowId === null || zones.length === 0) return null;
      return { id: name, label: t('sendTo'), items: zones.map((label, i) => ({ id: `send-to-${String(i)}`, label, action: () => { c.sendToZone(i, rowId); } })) };
    }
    case 'moveUp':
    case 'moveDown': {
      const rowId = cell.rowId;
      const direction = name === 'moveUp' ? 'up' : 'down';
      if (rowId === null) return null;
      return { id: name, label: t(direction === 'up' ? 'moveRowUp' : 'moveRowDown'), shortcut: direction === 'up' ? 'Ctrl+Shift+Up' : 'Ctrl+Shift+Down', disabled: !c.canMoveRow(rowId, direction), action: () => { c.moveRow(rowId, direction); } };
    }
    case 'pinRow': {
      const rowId = cell.rowId;
      if (rowId === null) return null;
      const pins = grid.getPinnedRows();
      const side = pins.top.includes(rowId) ? 'top' : pins.bottom.includes(rowId) ? 'bottom' : null;
      return {
        id: name,
        label: t('pinRow'),
        items: [
          { id: 'pin-row-top', label: t('pinRowTop'), disabled: side === 'top', action: () => { c.pinRow(rowId, 'top'); } },
          { id: 'pin-row-bottom', label: t('pinRowBottom'), disabled: side === 'bottom', action: () => { c.pinRow(rowId, 'bottom'); } },
          { id: 'unpin-row', label: t('unpinRow'), disabled: side === null, action: () => { c.pinRow(rowId, null); } },
        ],
      };
    }
  }
}

// Short enough to show without scrolling (less used entries are in the Columns and Groups submenus).
const COLUMN_DEFAULTS: readonly DataGridMenuEntry[] = ['sortAscending', 'sortDescending', 'clearSort', 'separator', 'filter', 'pin', 'group', 'groups', 'separator', 'hide', 'columns'];
const CELL_DEFAULTS: readonly DataGridMenuEntry[] = ['copy', 'copyWithHeaders', 'cut', 'paste', 'separator', 'note', 'pinRow', 'moveRow', 'sendTo', 'groups', 'columns', 'export'];

/** The column menu: a header button, a right-click on a header, or Shift+F10 / the ContextMenu key on a header. */
export function columnMenu<Row>(options: DataGridColumnMenuOptions = {}): DataGridAccessory<Row> {
  return {
    attach(context) {
      const s = sharedMenu(context);
      s.header = (cell) => (options.items ? options.items(cell.column, COLUMN_DEFAULTS) : COLUMN_DEFAULTS);
      if (options.button !== false) {
        context.addHeaderButton({
          key: 'aui-data-grid__column-menu-button',
          icon: 'more-horizontal',
          popup: 'menu',
          label: (header) => msg(context, 'columnMenuFor', { column: header }),
          activate: (column, button) => {
            if (!fill(s, { rowId: null, column })) return;
            // Focus returns to the button's header when the menu closes.
            button.closest<HTMLElement>('[role="columnheader"]')?.focus({ preventScroll: true });
            const r = button.getBoundingClientRect();
            s.menu.open({ x: r.left, y: r.bottom });
          },
        });
      }
      return () => {
        s.header = null;
        release(s);
      };
    },
  };
}

/** The cell menu: a right-click on a cell, or Shift+F10 / the ContextMenu key on a focused cell. */
export function contextMenu<Row>(options: DataGridContextMenuOptions<Row> = {}): DataGridAccessory<Row> {
  return {
    attach(context) {
      const s = sharedMenu(context);
      s.exports = options.export === false ? null : (options.export ?? {});
      s.cell = (cell) => {
        const rowId = cell.rowId ?? '';
        return options.items ? options.items({ rowId, column: cell.column, row: context.row(rowId) }, CELL_DEFAULTS) : CELL_DEFAULTS;
      };
      return () => {
        s.cell = null;
        s.exports = null;
        release(s);
      };
    },
  };
}

export interface DataGridColumnChooser<Row> extends DataGridAccessory<Row> {
  /** Open the chooser (no effect before the grid attached it). */
  open(): void;
}

/**
 * A searchable list of the data columns: a Show all checkbox, and per column a checkbox (shown or
 * hidden), Move up / Move down buttons, and (with `group`) a Group toggle. Changes apply at once;
 * focus stays on the control used. Shared by the column chooser and the side bar's Columns panel.
 */
function columnList<Row>(c: DataGridAccessoryContext<Row>, options: { readonly group: boolean }): { readonly element: HTMLElement; readonly refresh: () => void } {
  const doc = c.doc;
  const t = (key: string, params: Readonly<Record<string, string>> = {}): string => msg(c, key, params);
  const body = doc.createElement('div');
  body.className = 'aui-data-grid__chooser';
  const search = doc.createElement('input');
  search.type = 'search';
  search.className = 'aui-data-grid__chooser-search';
  const allLabel = doc.createElement('label');
  allLabel.className = 'aui-data-grid__chooser-all';
  const all = doc.createElement('input');
  all.type = 'checkbox';
  const allText = doc.createTextNode('');
  allLabel.append(all, allText);
  const list = doc.createElement('ul');
  list.className = 'aui-data-grid__chooser-list';
  const empty = doc.createElement('p');
  empty.className = 'aui-data-grid__chooser-empty';
  body.append(search, allLabel, list, empty);
  interface Focus { kind: 'box' | 'moveUp' | 'moveDown' | 'group'; id: string }
  const render = (focus?: Focus): void => {
    search.setAttribute('aria-label', t('chooserSearch'));
    search.placeholder = t('chooserSearch');
    allText.textContent = ` ${t('chooserAll')}`;
    empty.textContent = t('chooserEmpty');
    const columns = c.columns();
    const needle = search.value.trim().toLocaleLowerCase(c.locale());
    const shown = columns.filter((col) => needle === '' || col.header.toLocaleLowerCase(c.locale()).includes(needle));
    const visible = columns.filter((col) => !col.hidden).length;
    all.checked = visible === columns.length;
    all.indeterminate = visible > 0 && visible < columns.length;
    empty.hidden = shown.length > 0;
    list.replaceChildren(
      ...shown.map((col) => {
        const at = columns.findIndex((x) => x.id === col.id);
        const li = doc.createElement('li');
        li.className = 'aui-data-grid__chooser-item';
        li.dataset.column = col.id;
        const label = doc.createElement('label');
        const box = doc.createElement('input');
        box.type = 'checkbox';
        box.checked = !col.hidden;
        box.disabled = !col.hideable;
        box.dataset.control = 'box';
        box.addEventListener('change', () => {
          c.grid.setColumnHidden(col.id, !box.checked);
          render({ kind: 'box', id: col.id });
        });
        label.append(box, doc.createTextNode(` ${col.header}`));
        li.append(label);
        if (options.group && (col.groupable || col.grouped)) {
          const g = doc.createElement('button');
          g.type = 'button';
          g.className = 'aui-data-grid__chooser-group';
          g.dataset.control = 'group';
          g.textContent = t('groupShort');
          g.setAttribute('aria-label', t('group', { column: col.header }));
          g.setAttribute('aria-pressed', String(col.grouped));
          g.addEventListener('click', () => {
            c.group(col.id, !col.grouped);
            render({ kind: 'group', id: col.id });
          });
          li.append(g);
        }
        const move = (delta: -1 | 1, kind: 'moveUp' | 'moveDown'): HTMLButtonElement => {
          const b = doc.createElement('button');
          b.type = 'button';
          b.className = 'aui-data-grid__chooser-move';
          b.dataset.control = kind;
          b.textContent = String.fromCharCode(delta < 0 ? 0x2191 : 0x2193);
          b.setAttribute('aria-label', t(kind, { column: col.header }));
          const target = columns[at + delta];
          b.disabled = !col.movable || !target?.movable;
          b.addEventListener('click', () => {
            if (!target) return;
            c.grid.moveColumn(col.id, target.id, delta < 0 ? 'before' : 'after');
            render({ kind, id: col.id });
          });
          return b;
        };
        li.append(move(-1, 'moveUp'), move(1, 'moveDown'));
        return li;
      }),
    );
    if (!focus) return;
    const li = list.querySelector<HTMLElement>(`[data-column="${CSS.escape(focus.id)}"]`);
    const control = li?.querySelector<HTMLElement>(`[data-control="${focus.kind}"]`);
    // A move button that became disabled (the column reached an end) leaves focus on the checkbox.
    (control && !(control instanceof HTMLButtonElement && control.disabled) ? control : li?.querySelector<HTMLElement>('input'))?.focus();
  };
  search.addEventListener('input', () => {
    render();
  });
  all.addEventListener('change', () => {
    for (const col of c.columns()) if (col.hideable) c.grid.setColumnHidden(col.id, !all.checked);
    render();
  });
  render();
  return {
    element: body,
    refresh: () => {
      // Never under the user's hands (a refresh would move focus).
      if (!body.contains(doc.activeElement)) render();
    },
  };
}

/**
 * The column chooser: a dialog with the column list (search, Show all, per column a checkbox and
 * Move up / Move down). Opened by the column menu's Columns > Choose columns entry, or by `open()`.
 */
export function columnChooser<Row>(): DataGridColumnChooser<Row> {
  let context: DataGridAccessoryContext<Row> | null = null;
  let dialog: Dialog | null = null;
  const close = (): void => {
    dialog?.destroy();
    dialog = null;
  };
  const open = (): void => {
    const c = context;
    if (!c || dialog) return;
    const doc = c.doc;
    const { element } = columnList(c, { group: false });
    const d = Dialog.create({ title: msg(c, 'chooserTitle'), content: element, actions: [{ label: msg(c, 'done'), value: 'done', variant: 'primary' }] }, doc);
    d.element.addEventListener('aui-close', () => {
      close();
      c.focusGrid();
    });
    (c.element.closest('dialog') ?? doc.body).append(d.element);
    dialog = d;
    d.open();
  };
  return {
    open,
    attach(c) {
      context = c;
      const s = sharedMenu(c);
      s.chooser = open;
      return () => {
        s.chooser = null;
        release(s);
        close();
        context = null;
      };
    },
  };
}

export type DataGridSidePanelName = 'columns' | 'filters';

export interface DataGridSideBarOptions {
  /** Panels in order (default: columns, filters). */
  readonly panels?: readonly DataGridSidePanelName[];
  /** The side of the rows (default `end`). */
  readonly position?: 'start' | 'end';
  /** The panel open at first (default none). */
  readonly open?: DataGridSidePanelName | null;
  /** Width of an open panel in px (default 288). */
  readonly width?: number;
}

/**
 * The side bar: buttons beside the rows open one panel at a time (each button is a disclosure:
 * `aria-expanded`, `aria-controls`). Columns: the column list with Group toggles. Filters: a
 * disclosure per filterable column with its filter editor inline (filtered columns are marked).
 */
let sideCount = 0;

export function sideBar<Row>(options: DataGridSideBarOptions = {}): DataGridAccessory<Row> {
  return {
    attach(context) {
      const doc = context.doc;
      const t = (key: string, params: Readonly<Record<string, string>> = {}): string => msg(context, key, params);
      const slot = context.sideSlot(options.position ?? 'end');
      slot.style.setProperty('--aui-data-grid-side-width', `${String(options.width ?? 288)}px`);
      const tabs = doc.createElement('div');
      tabs.className = 'aui-data-grid__side-tabs';
      slot.replaceChildren(tabs);
      const names = options.panels ?? ['columns', 'filters'];
      let open: DataGridSidePanelName | null = options.open ?? null;
      const cleanups: (() => void)[] = [];
      const filterOpen = new Set<string>();
      const panels = new Map<DataGridSidePanelName, { button: HTMLButtonElement; region: HTMLElement; refresh: () => void }>();
      const filterSection = (region: HTMLElement): (() => void) => {
        const editors = new Map<string, () => void>();
        const render = (): void => {
          for (const remove of editors.values()) remove();
          editors.clear();
          const heading = doc.createElement('h2');
          heading.className = 'aui-data-grid__side-heading';
          heading.textContent = t('filters');
          const parts: HTMLElement[] = [heading];
          for (const col of context.columns().filter((x) => x.filterable)) {
            const section = doc.createElement('div');
            section.className = 'aui-data-grid__filter-section';
            const toggle = doc.createElement('button');
            toggle.type = 'button';
            toggle.className = 'aui-data-grid__filter-section-toggle';
            const expanded = filterOpen.has(col.id);
            toggle.setAttribute('aria-expanded', String(expanded));
            const name = doc.createElement('span');
            name.textContent = col.header;
            toggle.append(name);
            if (context.isFiltered(col.id)) {
              const mark = doc.createElement('span');
              mark.className = 'aui-data-grid__filter-section-mark';
              mark.textContent = t('filtered');
              toggle.append(mark);
            }
            const body = doc.createElement('div');
            body.className = 'aui-data-grid__filter-section-body';
            body.id = `${region.id}-${col.id}`;
            toggle.setAttribute('aria-controls', body.id);
            body.hidden = !expanded;
            toggle.addEventListener('click', () => {
              if (filterOpen.has(col.id)) filterOpen.delete(col.id);
              else filterOpen.add(col.id);
              render();
              region.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(body.id)}"]`)?.focus();
            });
            if (expanded) {
              const remove = context.filterEditor(col.id, body);
              if (remove) editors.set(col.id, remove);
            }
            section.append(toggle, body);
            parts.push(section);
          }
          region.replaceChildren(...parts);
        };
        render();
        cleanups.push(() => {
          for (const remove of editors.values()) remove();
          editors.clear();
        });
        const key = (): string => JSON.stringify(context.columns().filter((x) => x.filterable).map((x) => [x.id, x.header, context.isFiltered(x.id)]));
        let last = key();
        return () => {
          const next = key();
          if (next === last || region.contains(doc.activeElement)) return;
          last = next;
          render();
        };
      };
      for (const name of names) {
        const button = doc.createElement('button');
        button.type = 'button';
        button.className = 'aui-data-grid__side-tab';
        button.dataset.panel = name;
        const region = doc.createElement('section');
        region.className = 'aui-data-grid__side-panel';
        region.id = `aui-data-grid-side-${name}-${String(sideCount++)}`;
        region.setAttribute('role', 'region');
        button.setAttribute('aria-controls', region.id);
        let refresh: () => void;
        if (name === 'columns') {
          const heading = doc.createElement('h2');
          heading.className = 'aui-data-grid__side-heading';
          heading.textContent = t('columns');
          const list = columnList(context, { group: true });
          region.append(heading, list.element);
          refresh = list.refresh;
        } else refresh = filterSection(region);
        button.addEventListener('click', () => {
          open = open === name ? null : name;
          sync();
          if (open === name) region.querySelector<HTMLElement>('input, button')?.focus();
        });
        tabs.append(button);
        slot.append(region);
        panels.set(name, { button, region, refresh });
      }
      const sync = (): void => {
        for (const [name, p] of panels) {
          const label = t(name);
          p.button.textContent = label;
          p.region.setAttribute('aria-label', label);
          p.button.setAttribute('aria-expanded', String(open === name));
          p.region.hidden = open !== name;
        }
      };
      sync();
      cleanups.push(
        context.onUpdate(() => {
          for (const p of panels.values()) if (!p.region.hidden) p.refresh();
        }),
      );
      return () => {
        for (const c of cleanups) c();
        slot.remove();
      };
    },
  };
}

/** A status bar panel of your own: its text (or node), refreshed after every change. */
export interface DataGridStatusPanel<Row> {
  readonly id: string;
  readonly render: (context: DataGridAccessoryContext<Row>) => string | Node;
}

export type DataGridStatusPanelName = 'rows' | 'selected' | 'aggregates';

export interface DataGridStatusBarOptions<Row> {
  /** Panels in order (default: rows, selected, aggregates). */
  readonly panels?: readonly (DataGridStatusPanelName | DataGridStatusPanel<Row>)[];
  /** Number format of the aggregates (default: the locale's, up to 2 fraction digits). */
  readonly format?: (value: number, aggregate: 'sum' | 'avg' | 'min' | 'max' | 'count') => string;
}

/**
 * The status bar: a named group below the grid with row counts ("Rows: 120 of 500"), the
 * selected row count, and the sum, average, minimum, maximum, and count of the numbers in the
 * cell ranges (shown while the ranges cover two cells or more). Not a live region: counts are
 * announced by the grid where they change.
 */
export function statusBar<Row>(options: DataGridStatusBarOptions<Row> = {}): DataGridAccessory<Row> {
  return {
    attach(context) {
      const doc = context.doc;
      const t = (key: string, params: Readonly<Record<string, string>> = {}): string => msg(context, key, params);
      const bar = doc.createElement('div');
      bar.className = 'aui-data-grid__status-bar';
      bar.setAttribute('role', 'group');
      context.host.append(bar);
      const number = (value: number, aggregate: 'sum' | 'avg' | 'min' | 'max' | 'count'): string => (options.format ? options.format(value, aggregate) : new Intl.NumberFormat(context.locale(), { maximumFractionDigits: aggregate === 'count' ? 0 : 2 }).format(value));
      const panel = (id: string, content: string | Node): HTMLElement => {
        const span = doc.createElement('span');
        span.className = 'aui-data-grid__status-panel';
        span.dataset.panel = id;
        span.append(content);
        return span;
      };
      const render = (): void => {
        bar.setAttribute('aria-label', t('status'));
        const counts = context.counts();
        const parts: HTMLElement[] = [];
        for (const p of options.panels ?? ['rows', 'selected', 'aggregates']) {
          if (typeof p !== 'string') {
            parts.push(panel(p.id, p.render(context)));
            continue;
          }
          if (p === 'rows') {
            const total = number(counts.total, 'count');
            parts.push(panel(p, counts.filtered < counts.total ? t('rowsFiltered', { shown: number(counts.filtered, 'count'), total }) : t('rows', { total })));
          } else if (p === 'selected') {
            if (counts.selected > 0) parts.push(panel(p, t('selected', { count: number(counts.selected, 'count') })));
          } else {
            const values = context.rangeValues();
            const numbers = values.filter((v): v is number => typeof v === 'number' && Number.isFinite(v));
            const filled = values.filter((v) => v !== null && v !== undefined && v !== '').length;
            if (values.length === 0) continue;
            parts.push(panel('count', t('aggCount', { value: number(filled, 'count') })));
            if (numbers.length > 0) {
              const sum = numbers.reduce((a, b) => a + b, 0);
              parts.push(panel('sum', t('aggSum', { value: number(sum, 'sum') })), panel('avg', t('aggAvg', { value: number(sum / numbers.length, 'avg') })), panel('min', t('aggMin', { value: number(Math.min(...numbers), 'min') })), panel('max', t('aggMax', { value: number(Math.max(...numbers), 'max') })));
            }
          }
        }
        bar.replaceChildren(...parts);
      };
      render();
      const off = context.onUpdate(render);
      return () => {
        off();
        bar.remove();
      };
    },
  };
}

/** A toolbar entry: a built-in, a button of your own, or a menu button. */
export type DataGridToolbarItem = 'chooser' | 'resetColumns' | 'autoSizeAll' | 'expandAll' | 'collapseAll' | 'separator' | { readonly id: string; readonly label: string; readonly icon?: string; readonly action?: () => void; readonly items?: readonly DataGridMenuEntry[] };

export interface DataGridToolbarOptions {
  readonly items: readonly DataGridToolbarItem[];
  /** The toolbar's accessible name (default "Grid actions"). */
  readonly label?: string;
}

/**
 * Toolbar buttons above the grid (next to the search box and the group and pivot panels): a
 * `role="toolbar"` with one tab stop; arrow keys, Home, and End move between its buttons. A button
 * with `items` opens a menu.
 */
export function toolbar<Row>(options: DataGridToolbarOptions): DataGridAccessory<Row> {
  return {
    attach(context) {
      const doc = context.doc;
      const s = sharedMenu(context);
      const slot = context.toolbarSlot('toolbar');
      const bar = doc.createElement('div');
      bar.className = 'aui-data-grid__toolbar-items';
      bar.setAttribute('role', 'toolbar');
      slot.replaceChildren(bar);
      const menus: Menu[] = [];
      const render = (): void => {
        for (const m of menus.splice(0)) m.destroy();
        bar.setAttribute('aria-label', options.label ?? msg(context, 'toolbar'));
        const parts: HTMLElement[] = [];
        // Menus attach once their buttons are in the document.
        const later: (() => void)[] = [];
        options.items.forEach((entry, i) => {
          if (entry === 'separator') {
            const sep = doc.createElement('span');
            sep.className = 'aui-data-grid__toolbar-separator';
            sep.setAttribute('role', 'separator');
            sep.setAttribute('aria-orientation', 'vertical');
            parts.push(sep);
            return;
          }
          const item = typeof entry === 'string' ? builtIn(s, entry, { rowId: null, column: '' }) : entry;
          if (!item) return;
          const button = doc.createElement('button');
          button.type = 'button';
          button.className = 'aui-data-grid__toolbar-button';
          button.dataset.item = typeof entry === 'string' ? entry : entry.id;
          button.tabIndex = -1;
          if (item.icon) button.append(renderIcon(item.icon, { className: 'aui-data-grid__toolbar-icon', doc }));
          button.append(doc.createTextNode(item.label));
          if ('disabled' in item && item.disabled === true) button.disabled = true;
          if (item.items) {
            const actions = new Map<string, () => void>();
            const sub: SharedMenu<Row> = { ...s, actions };
            const items = toItems(sub, item.items, { rowId: null, column: '' }, `t${String(i)}`);
            later.push(() => {
              menus.push(Menu.create(button, { items, direction: context.direction() }));
            });
            button.addEventListener('aui-select', (event) => {
              event.stopPropagation();
              actions.get((event as CustomEvent<MenuSelectDetail>).detail.id)?.();
            });
          } else {
            const action = item.action;
            button.addEventListener('click', () => {
              action?.();
            });
          }
          parts.push(button);
        });
        bar.replaceChildren(...parts);
        for (const create of later) create();
        const first = bar.querySelector<HTMLButtonElement>('button:not(:disabled)');
        if (first) first.tabIndex = 0;
      };
      // Roving tab stop: arrows, Home, and End move between the buttons.
      bar.addEventListener('keydown', (event) => {
        const buttons = [...bar.querySelectorAll<HTMLButtonElement>('button:not(:disabled)')];
        const at = buttons.indexOf(event.target as HTMLButtonElement);
        if (at < 0) return;
        const rtl = context.direction() === 'rtl';
        const next = event.key === (rtl ? 'ArrowLeft' : 'ArrowRight') ? at + 1 : event.key === (rtl ? 'ArrowRight' : 'ArrowLeft') ? at - 1 : event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : null;
        if (next === null) return;
        event.preventDefault();
        const target = buttons[(next + buttons.length) % buttons.length];
        if (!target) return;
        for (const b of buttons) b.tabIndex = b === target ? 0 : -1;
        target.focus();
      });
      render();
      // Built-ins that apply only sometimes (Expand all while grouped) follow the grid.
      const off = context.onUpdate(() => {
        if (options.items.some((e) => e === 'expandAll' || e === 'collapseAll') && !bar.contains(doc.activeElement)) render();
      });
      return () => {
        off();
        for (const m of menus.splice(0)) m.destroy();
        slot.remove();
        release(s);
      };
    },
  };
}

export interface DataGridTooltipsOptions {
  /** Milliseconds a pointer rests on a cell before its tooltip shows (default 600; keyboard focus shows it at once). */
  readonly showDelay?: number;
  /** `truncated`: only cells whose text does not fit (default `always`: every cell with a tooltip). */
  readonly mode?: 'always' | 'truncated';
  /** `hover-focus` (default) also shows the focused cell's tooltip; `hover` only on pointer hover. */
  readonly trigger?: 'hover' | 'hover-focus';
}

/**
 * Cell tooltips (a column's `tooltip`): one shared tooltip (the Tooltip styles) that meets
 * WCAG 1.4.13: it shows after a delay on hover and at once on keyboard focus, stays while the
 * cell or the tooltip is hovered, and Escape dismisses it without moving focus. The cell
 * references it with aria-describedby while it shows. Never on touch.
 */
export function tooltips<Row>(options: DataGridTooltipsOptions = {}): DataGridAccessory<Row> {
  return {
    attach(context) {
      const doc = context.doc;
      const tip = doc.createElement('div');
      tip.className = 'aui-tooltip aui-data-grid__tooltip';
      tip.id = `aui-data-grid-tooltip-${String(tooltipCount++)}`;
      tip.setAttribute('role', 'tooltip');
      tip.popover = 'manual';
      (context.element.closest('dialog') ?? doc.body).append(tip);
      const win = doc.defaultView ?? window;
      let shownFor: HTMLElement | null = null;
      let stopPosition: (() => void) | null = null;
      let showTimer = 0;
      let hideTimer = 0;
      const clear = (): void => {
        win.clearTimeout(showTimer);
        win.clearTimeout(hideTimer);
        showTimer = 0;
        hideTimer = 0;
      };
      const hide = (): void => {
        clear();
        if (!shownFor) return;
        removeAriaReference(shownFor, 'aria-describedby', tip.id);
        shownFor = null;
        stopPosition?.();
        stopPosition = null;
        if (tip.matches(':popover-open')) tip.hidePopover();
      };
      const textFor = (cell: HTMLElement): string | null => {
        const position = context.cellAt(cell);
        if (position?.rowId == null) return null;
        const text = context.tooltip(position.rowId, position.column);
        // Truncated mode: only when the content does not fit its cell.
        if (text === null || (options.mode === 'truncated' && cell.scrollWidth <= cell.clientWidth)) return null;
        return text;
      };
      const show = (cell: HTMLElement): void => {
        const text = textFor(cell);
        if (text === null) {
          hide();
          return;
        }
        if (shownFor === cell && tip.textContent === text) return;
        hide();
        tip.textContent = text;
        tip.dir = context.direction();
        tip.showPopover();
        stopPosition = autoPosition(cell, tip, { placement: 'top', offset: 6, direction: context.direction() });
        addAriaReference(cell, 'aria-describedby', tip.id);
        shownFor = cell;
      };
      const cellOf = (target: EventTarget | null): HTMLElement | null => (target instanceof Element ? target.closest<HTMLElement>('[role="gridcell"]') : null);
      const onOver = (event: PointerEvent): void => {
        if (event.pointerType === 'touch') return;
        const cell = cellOf(event.target);
        if (!cell || !context.element.contains(cell)) return;
        win.clearTimeout(hideTimer);
        if (cell === shownFor) return;
        win.clearTimeout(showTimer);
        showTimer = win.setTimeout(() => {
          show(cell);
        }, options.showDelay ?? 600);
      };
      const onOut = (event: PointerEvent): void => {
        const to = event.relatedTarget;
        if (to instanceof Node && (tip.contains(to) || shownFor?.contains(to))) return;
        win.clearTimeout(showTimer);
        // A short grace period lets the pointer move onto the tooltip (WCAG 1.4.13 hoverable).
        hideTimer = win.setTimeout(hide, 150);
      };
      const onTipOver = (): void => {
        win.clearTimeout(hideTimer);
      };
      const onFocus = (event: FocusEvent): void => {
        const cell = cellOf(event.target);
        if (cell && event.target === cell) show(cell);
        else hide();
      };
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'Escape' || !shownFor) return;
        // Dismissed without moving focus; this Escape does nothing else.
        event.preventDefault();
        event.stopPropagation();
        hide();
      };
      context.element.addEventListener('pointerover', onOver);
      context.element.addEventListener('pointerout', onOut);
      tip.addEventListener('pointerover', onTipOver);
      tip.addEventListener('pointerout', onOut);
      if (options.trigger !== 'hover') context.element.addEventListener('focusin', onFocus);
      context.element.addEventListener('focusout', hide);
      doc.addEventListener('keydown', onKey, true);
      context.element.addEventListener('scroll', hide, true);
      return () => {
        hide();
        context.element.removeEventListener('pointerover', onOver);
        context.element.removeEventListener('pointerout', onOut);
        context.element.removeEventListener('focusin', onFocus);
        context.element.removeEventListener('focusout', hide);
        context.element.removeEventListener('scroll', hide, true);
        doc.removeEventListener('keydown', onKey, true);
        tip.remove();
      };
    },
  };
}

let tooltipCount = 0;

export interface DataGridFindOptions {
  /** Match letter case (default false). */
  readonly caseSensitive?: boolean;
  /** Ctrl+F (Cmd+F) in the grid moves to the find field instead of the browser's find (default false). */
  readonly shortcut?: boolean;
}

export interface DataGridFind<Row> extends DataGridAccessory<Row> {
  /** Find a text (empty clears); returns the number of matches. */
  find(text: string): number;
  next(): void;
  previous(): void;
}

/**
 * Find in the grid: a search field in the toolbar with Previous and Next buttons. Matching cells
 * of the displayed rows (formatted text) are marked, the current one more strongly; it is
 * scrolled into view (and its page shown) and announced ("Match 2 of 15"). Enter and Shift+Enter
 * in the field, and F3 and Shift+F3 in the grid, move between matches. Focus stays where it is.
 */
export function find<Row>(options: DataGridFindOptions = {}): DataGridFind<Row> {
  let api: { find: (text: string) => number; step: (delta: 1 | -1) => void } | null = null;
  return {
    find: (text) => api?.find(text) ?? 0,
    next: () => api?.step(1),
    previous: () => api?.step(-1),
    attach(context) {
      const doc = context.doc;
      const t = (key: string, params: Readonly<Record<string, string>> = {}): string => msg(context, key, params);
      const slot = context.toolbarSlot('find');
      const box = doc.createElement('div');
      box.className = 'aui-data-grid__find';
      box.setAttribute('role', 'search');
      const input = doc.createElement('input');
      input.type = 'search';
      input.className = 'aui-data-grid__find-input';
      const count = doc.createElement('span');
      count.className = 'aui-data-grid__find-count';
      // The count is announced when it changes; the visible text is not a live region.
      count.setAttribute('aria-hidden', 'true');
      const button = (key: 'findPrevious' | 'findNext', glyph: number, delta: 1 | -1): HTMLButtonElement => {
        const b = doc.createElement('button');
        b.type = 'button';
        b.className = 'aui-data-grid__find-button';
        b.textContent = String.fromCharCode(glyph);
        b.dataset.key = key;
        b.addEventListener('click', () => {
          step(delta);
        });
        return b;
      };
      const prev = button('findPrevious', 0x2191, -1);
      const next = button('findNext', 0x2193, 1);
      box.append(input, count, prev, next);
      slot.replaceChildren(box);
      let text = '';
      let matches: { rowId: string; column: string }[] = [];
      let active = -1;
      const keys = new Set<string>();
      const key = (rowId: string, column: string): string => `${rowId}\u0000${column}`;
      const label = (): void => {
        box.setAttribute('aria-label', t('find'));
        input.setAttribute('aria-label', t('find'));
        input.placeholder = t('find');
        prev.setAttribute('aria-label', t('findPrevious'));
        next.setAttribute('aria-label', t('findNext'));
        count.textContent = text === '' ? '' : matches.length === 0 ? t('findNone') : t('findCount', { index: String(active + 1), total: String(matches.length) });
        prev.disabled = matches.length === 0;
        next.disabled = matches.length === 0;
      };
      const paint = (): void => {
        const current = matches[active];
        context.decorate('find', (rowId, column) => {
          if (!keys.has(key(rowId, column))) return null;
          return current?.rowId === rowId && current.column === column ? { className: 'aui-data-grid__cell--find-active', description: t('findCurrent') } : { className: 'aui-data-grid__cell--find' };
        });
      };
      const announceIt = (): void => {
        context.announce(matches.length === 0 ? t('findNone') : t('findCount', { index: String(active + 1), total: String(matches.length) }));
      };
      const run = (value: string, keepActive: boolean): number => {
        const previous = matches[active];
        text = value;
        matches = text.trim() === '' ? [] : context.search(text.trim(), options.caseSensitive === true);
        keys.clear();
        for (const m of matches) keys.add(key(m.rowId, m.column));
        active = matches.length === 0 ? -1 : keepActive && previous ? Math.max(0, matches.findIndex((m) => m.rowId === previous.rowId && m.column === previous.column)) : 0;
        label();
        if (matches.length === 0 && text.trim() === '') {
          context.decorate('find', null);
          return 0;
        }
        paint();
        const current = matches[active];
        if (current) context.reveal(current.rowId, current.column);
        return matches.length;
      };
      const step = (delta: 1 | -1): void => {
        if (matches.length === 0) return;
        active = (active + delta + matches.length) % matches.length;
        label();
        paint();
        const current = matches[active];
        if (current) context.reveal(current.rowId, current.column);
        announceIt();
      };
      api = {
        find: (value) => {
          input.value = value;
          const n = run(value, false);
          announceIt();
          return n;
        },
        step,
      };
      const win = doc.defaultView ?? window;
      let timer = 0;
      input.addEventListener('input', () => {
        win.clearTimeout(timer);
        timer = win.setTimeout(() => {
          run(input.value, false);
          if (input.value.trim() !== '') announceIt();
        }, 200);
      });
      input.addEventListener('keydown', (event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
          win.clearTimeout(timer);
          if (input.value !== text) run(input.value, false);
          step(event.shiftKey ? -1 : 1);
        }
      });
      const onGridKey = (event: KeyboardEvent): void => {
        if (event.key === 'F3') {
          event.preventDefault();
          step(event.shiftKey ? -1 : 1);
        } else if (options.shortcut === true && (event.ctrlKey || event.metaKey) && !event.altKey && (event.key === 'f' || event.key === 'F')) {
          event.preventDefault();
          input.focus();
          input.select();
        }
      };
      context.element.addEventListener('keydown', onGridKey);
      label();
      // Data changed: matches follow (the current match stays current when it is still there).
      const off = context.onUpdate(() => {
        if (text.trim() !== '') run(text, true);
      });
      return () => {
        off();
        win.clearTimeout(timer);
        context.element.removeEventListener('keydown', onGridKey);
        context.decorate('find', null);
        slot.remove();
        api = null;
      };
    },
  };
}

/** A cell note (stored by your application). */
export interface DataGridNote {
  readonly text: string;
  readonly author?: string;
  /** When the note was last changed (ISO 8601). */
  readonly updated?: string;
  /** Shown, but not changed or deleted. */
  readonly readOnly?: boolean;
}

/** Where notes live: your application reads and writes them; the grid stores nothing. */
export interface DataGridNoteStore {
  get(rowId: string, column: string): Promise<DataGridNote | null>;
  /** Save a note; null deletes it. */
  set(rowId: string, column: string, note: DataGridNote | null): Promise<void>;
  /** The cells that have notes (marks them when the grid starts); optional. */
  index?(): Promise<readonly { readonly rowId: string; readonly column: string }[]>;
}

export interface DataGridNotesOptions {
  readonly store: DataGridNoteStore;
  /** The author written with new and changed notes. */
  readonly author?: string;
}

/**
 * Cell notes: a marked cell has a note (and says "has a note" to assistive technology).
 * Shift+F2 on a cell, the cell menu's Add note / Edit note, or a click on the mark opens a
 * dialog to read, write, or delete the note (read-only notes only show). Changes go to the store.
 */
export function notes<Row>(options: DataGridNotesOptions): DataGridAccessory<Row> {
  return {
    attach(context) {
      const doc = context.doc;
      const t = (key: string, params: Readonly<Record<string, string>> = {}): string => msg(context, key, params);
      const store = options.store;
      const known = new Set<string>();
      const key = (rowId: string, column: string): string => `${rowId}\u0000${column}`;
      let dialog: Dialog | null = null;
      context.decorate('notes', (rowId, column) => (known.has(key(rowId, column)) ? { className: 'aui-data-grid__cell--note', description: t('hasNote') } : null));
      void store.index?.().then(
        (cells) => {
          for (const c of cells) known.add(key(c.rowId, c.column));
          context.refreshDecorations();
        },
        () => {
          context.announce(t('noteFailed'));
        },
      );
      const open = (rowId: string, column: string): void => {
        if (dialog) return;
        void store.get(rowId, column).then(
          (note) => {
            if (dialog) return;
            const header = context.columns().find((c) => c.id === column)?.header ?? column;
            const body = doc.createElement('div');
            body.className = 'aui-data-grid__note';
            const area = doc.createElement('textarea');
            area.className = 'aui-data-grid__note-text';
            area.rows = 5;
            area.maxLength = 10000;
            area.value = note?.text ?? '';
            area.readOnly = note?.readOnly === true;
            area.setAttribute('aria-label', t('noteText'));
            body.append(area);
            if (note && (note.author || note.updated)) {
              const meta = doc.createElement('p');
              meta.className = 'aui-data-grid__note-meta';
              meta.textContent = [note.author, note.updated ? new Intl.DateTimeFormat(context.locale(), { dateStyle: 'medium', timeStyle: 'short' }).format(new Date(note.updated)) : ''].filter(Boolean).join(', ');
              body.append(meta);
            }
            const readOnly = note?.readOnly === true;
            const actions = readOnly
              ? [{ label: t('close'), value: 'cancel', variant: 'primary' as const }]
              : [
                  { label: t('save'), value: 'save', variant: 'primary' as const },
                  ...(note ? [{ label: t('deleteNote'), value: 'delete', variant: 'secondary' as const }] : []),
                  { label: t('cancel'), value: 'cancel', variant: 'secondary' as const },
                ];
            const d = Dialog.create({ title: t('noteTitle'), description: `${header}, ${context.rowLabel(rowId)}`, content: body, actions }, doc);
            d.element.addEventListener('aui-close', (event) => {
              const value = (event as CustomEvent<{ returnValue: string }>).detail.returnValue;
              const text = area.value.trim();
              d.destroy();
              dialog = null;
              context.focusGrid();
              if (value !== 'save' && value !== 'delete') return;
              const next = value === 'delete' || text === '' ? null : { text, ...(options.author ? { author: options.author } : {}), updated: new Date().toISOString() };
              store.set(rowId, column, next).then(
                () => {
                  if (next) known.add(key(rowId, column));
                  else known.delete(key(rowId, column));
                  context.refreshDecorations();
                  context.announce(t(next ? 'noteSaved' : 'noteDeleted'));
                },
                () => {
                  context.announce(t('noteFailed'));
                },
              );
            });
            (context.element.closest('dialog') ?? doc.body).append(d.element);
            dialog = d;
            d.open();
          },
          () => {
            context.announce(t('noteFailed'));
          },
        );
      };
      // Shift+F2 on a cell (before the grid: F2 alone edits).
      const onKey = (event: KeyboardEvent): void => {
        if (event.key !== 'F2' || !event.shiftKey || event.ctrlKey || event.altKey || event.metaKey) return;
        const cell = context.cellAt(event.target);
        if (cell?.rowId == null) return;
        event.preventDefault();
        event.stopPropagation();
        open(cell.rowId, cell.column);
      };
      const onClick = (event: MouseEvent): void => {
        const target = event.target;
        if (!(target instanceof Element) || !target.closest('.aui-data-grid__cell--note')) return;
        // The mark is the cell's corner: a click near the top end corner opens the note.
        const cellEl = target.closest<HTMLElement>('.aui-data-grid__cell--note');
        if (!cellEl) return;
        const r = cellEl.getBoundingClientRect();
        const corner = context.direction() === 'rtl' ? event.clientX - r.left : r.right - event.clientX;
        if (corner > 12 || event.clientY - r.top > 12) return;
        const cell = context.cellAt(cellEl);
        if (cell && cell.rowId !== null) open(cell.rowId, cell.column);
      };
      context.element.addEventListener('keydown', onKey, true);
      context.element.addEventListener('click', onClick);
      const s = sharedMenu(context);
      s.note = { has: (rowId, column) => known.has(key(rowId, column)), open };
      return () => {
        s.note = null;
        release(s);
        context.element.removeEventListener('keydown', onKey, true);
        context.element.removeEventListener('click', onClick);
        context.decorate('notes', null);
        dialog?.destroy();
        dialog = null;
      };
    },
  };
}
