import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions, type DataGridRowDropDetail, type DataGridRowZoneDetail } from '@absoluteui/components/data-grid';
import { contextMenu } from '@absoluteui/components/data-grid/accessories';

// docs/PLAN-R11-G7.md (G7e1): row dragging, keyboard row moves, undo of moves.
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
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap;position:relative}',
    '.aui-data-grid__spacer{flex:none}',
    '.aui-data-grid__drag-handle{display:inline-block;inline-size:16px;block-size:16px}',
  ].join('\n');
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface R {
  id: string;
  name: string;
  boss?: string | null;
}
const flat = (): R[] => Array.from({ length: 6 }, (_, i) => ({ id: `r${String(i)}`, name: `Row ${String(i)}` }));

function mount(options: Partial<DataGridOptions<R>> = {}): DataGrid<R> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<R>(host, {
    label: 'Rows',
    locale: 'en-US',
    rowHeight: 30,
    rows: flat(),
    rowId: (r) => r.id,
    rowDragging: { managed: true },
    columns: [
      { id: 'name', header: 'Name', field: 'name' },
      { id: 'id', header: 'Id', field: 'id' },
    ],
    ...options,
  });
}

/** Row ids of the rendered body rows, in display order. */
const order = (g: DataGrid<R>): string[] =>
  [...g.host.querySelectorAll<HTMLElement>('.aui-data-grid__body .aui-data-grid__row')]
    .sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex')))
    .map((r) => r.dataset.rowId ?? '');
const cell = (g: DataGrid<R>, id: string, column = 'name'): HTMLElement => g.host.querySelector<HTMLElement>(`[data-row-id="${id}"] [data-column="${column}"]`)!;
const level = (g: DataGrid<R>, id: string): string | null => g.host.querySelector(`.aui-data-grid__body [data-row-id="${id}"]`)?.getAttribute('aria-level') ?? null;
const drops = (g: DataGrid<R>): DataGridRowDropDetail[] => {
  const seen: DataGridRowDropDetail[] = [];
  g.host.addEventListener('aui-row-drop', (e) => seen.push((e as CustomEvent<DataGridRowDropDetail>).detail));
  return seen;
};

function drag(g: DataGrid<R>, from: string, to: string | HTMLElement, fraction: number, into: DataGrid<R> = g): void {
  const handle = cell(g, from).querySelector<HTMLElement>('.aui-data-grid__drag-handle')!;
  const h = handle.getBoundingClientRect();
  const target = (typeof to === 'string' ? into.host.querySelector<HTMLElement>(`.aui-data-grid__body [data-row-id="${to}"]`)! : to).getBoundingClientRect();
  const x = h.left + h.width / 2;
  const init = { bubbles: true, pointerId: 1, isPrimary: true, pointerType: 'mouse' } as const;
  handle.dispatchEvent(new PointerEvent('pointerdown', { ...init, button: 0, clientX: x, clientY: h.top + h.height / 2 }));
  const y = target.top + target.height * fraction;
  handle.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: x, clientY: y }));
  handle.dispatchEvent(new PointerEvent('pointermove', { ...init, clientX: x + 1, clientY: y }));
  handle.dispatchEvent(new PointerEvent('pointerup', { ...init, clientX: x + 1, clientY: y }));
}

describe('row dragging (G7e1)', () => {
  it('handles sit in the first data column (or the rowDrag column), hidden from assistive technology; canDrag hides them', () => {
    const g = mount({ rowDragging: { managed: true, canDrag: (r) => r.id !== 'r2' } });
    const handle = cell(g, 'r0').querySelector('.aui-data-grid__drag-handle');
    expect(handle?.getAttribute('aria-hidden')).toBe('true');
    expect(cell(g, 'r0', 'id').querySelector('.aui-data-grid__drag-handle')).toBeNull();
    expect(cell(g, 'r2').querySelector('.aui-data-grid__drag-handle--disabled')).not.toBeNull();
    g.update({ columns: [{ id: 'name', header: 'Name', field: 'name' }, { id: 'id', header: 'Id', field: 'id', rowDrag: true }] });
    expect(cell(g, 'r0').querySelector('.aui-data-grid__drag-handle')).toBeNull();
    expect(cell(g, 'r0', 'id').querySelector('.aui-data-grid__drag-handle')).not.toBeNull();
    expect(() => mount({ rowDragging: { managed: 'yes' } as unknown as boolean })).toThrow();
  });

  it('a pointer drag moves the row before or after the target; one undo step restores the order, redo repeats it', () => {
    const g = mount();
    const seen = drops(g);
    drag(g, 'r0', 'r3', 0.75);
    expect(seen.at(-1)).toEqual({ rowIds: ['r0'], targetId: 'r3', position: 'after', source: 'pointer' });
    expect(order(g)).toEqual(['r1', 'r2', 'r3', 'r0', 'r4', 'r5']);
    expect(g.host.querySelector('.aui-data-grid__drag-ghost')).toBeNull();
    drag(g, 'r5', 'r1', 0.25);
    expect(order(g)).toEqual(['r5', 'r1', 'r2', 'r3', 'r0', 'r4']);
    expect(g.undo()).toBe(true);
    expect(order(g)).toEqual(['r1', 'r2', 'r3', 'r0', 'r4', 'r5']);
    expect(g.redo()).toBe(true);
    expect(order(g)).toEqual(['r5', 'r1', 'r2', 'r3', 'r0', 'r4']);
  });

  it('Ctrl+Shift+arrows on a handle cell move the row and keep focus on it; other cells keep range extension', async () => {
    const g = mount();
    cell(g, 'r1').focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowDown}{ArrowDown}{/Shift}{/Control}');
    expect(order(g)).toEqual(['r0', 'r2', 'r3', 'r1', 'r4', 'r5']);
    expect(document.activeElement).toBe(cell(g, 'r1'));
    await userEvent.keyboard('{Control>}{Shift>}{ArrowUp}{/Shift}{/Control}');
    expect(order(g)).toEqual(['r0', 'r2', 'r1', 'r3', 'r4', 'r5']);
    cell(g, 'r0', 'id').focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}');
    expect(order(g)[0]).toBe('r0');
  });

  it('multiRow drags the selected rows as one block; a canceled drop and unmanaged grids only emit', () => {
    const g = mount({ rowDragging: { managed: true, multiRow: true }, rowSelection: { mode: 'multiple' } });
    g.setSelected(['r1', 'r3']);
    drag(g, 'r1', 'r5', 0.75);
    expect(order(g)).toEqual(['r0', 'r2', 'r4', 'r5', 'r1', 'r3']);
    g.host.addEventListener('aui-row-drop', (e) => {
      e.preventDefault();
    });
    drag(g, 'r0', 'r5', 0.75);
    expect(order(g)[0]).toBe('r0');
    const u = mount({ rowDragging: true });
    const seen = drops(u);
    drag(u, 'r0', 'r2', 0.75);
    expect(seen).toHaveLength(1);
    expect(order(u)[0]).toBe('r0');
  });

  it('sorted grids do not move rows (announced); the drop is still emitted', () => {
    const g = mount();
    const seen = drops(g);
    g.update({ sort: [{ column: 'name', direction: 'descending' }] });
    drag(g, 'r5', 'r3', 0.75);
    expect(seen).toHaveLength(1);
    expect(order(g)).toEqual(['r5', 'r4', 'r3', 'r2', 'r1', 'r0']);
  });

  it('tree data: dropping into a row reparents it; Ctrl+Shift+Right and Left indent and outdent', async () => {
    const rows: R[] = [
      { id: 'a', name: 'Ada', boss: null },
      { id: 'b', name: 'Ben', boss: 'a' },
      { id: 'c', name: 'Cy', boss: null },
    ];
    const g = mount({ rows, treeData: { parentIdField: 'boss', label: 'name' }, groupDefaultExpanded: -1 });
    drag(g, 'c', 'b', 0.5);
    expect(level(g, 'c')).toBe('3');
    expect(rows[2]?.boss).toBeNull();
    expect(g.undo()).toBe(true);
    expect(level(g, 'c')).toBe('1');
    cell(g, 'c').focus();
    await userEvent.keyboard('{Control>}{Shift>}{ArrowRight}{/Shift}{/Control}');
    expect(level(g, 'c')).toBe('2');
    await userEvent.keyboard('{Control>}{Shift>}{ArrowLeft}{/Shift}{/Control}');
    expect(level(g, 'c')).toBe('1');
    expect(order(g)).toEqual(['a', 'b', 'c']);
  });

  it('the cell menu offers Move row (up, down) when the grid can move rows', () => {
    const g = mount({ accessories: [contextMenu()] });
    const open = (id: string): HTMLElement[] => {
      cell(g, id).dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
      return [...document.querySelectorAll<HTMLElement>('[role="menu"]')].filter((m) => m.matches(':popover-open')).flatMap((m) => [...m.querySelectorAll<HTMLElement>('[role="menuitem"]')]);
    };
    const find = (items: HTMLElement[], label: string): HTMLElement | undefined => items.find((i) => i.textContent.includes(label));
    find(open('r0'), 'Move row')!.click();
    const items = [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    expect(find(items, 'Move up')?.getAttribute('aria-disabled')).toBe('true');
    find(items, 'Move down')!.click();
    expect(order(g).slice(0, 2)).toEqual(['r1', 'r0']);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    g.update({ sort: [{ column: 'name', direction: 'descending' }] });
    expect(find(open('r2'), 'Move row')).toBeUndefined();
  });
});

describe('drop zones and native drag data (G7e2)', () => {
  const side = (): [DataGrid<R>, DataGrid<R>] => {
    const a = mount();
    const b = mount({ label: 'Other', rows: [{ id: 'x0', name: 'X 0' }, { id: 'x1', name: 'X 1' }] });
    a.host.style.blockSize = '240px';
    b.host.style.blockSize = '240px';
    return [a, b];
  };

  it('grid to grid: rows dropped on another grid are added at the drop line; move removes them from the source; ids already there are skipped', () => {
    const [a, b] = side();
    a.addRowDropZone(b.rowDropZone({ move: true }));
    drag(a, 'r1', 'x0', 0.75, b);
    expect(order(b)).toEqual(['x0', 'r1', 'x1']);
    expect(order(a)).not.toContain('r1');
    expect(document.querySelector('.aui-data-grid-drop-zone--active')).toBeNull();
    const c = mount({ label: 'Copy', rows: [{ id: 'r2', name: 'Row 2' }] });
    c.host.style.blockSize = '120px';
    a.addRowDropZone(c.rowDropZone());
    drag(a, 'r2', 'r2', 0.75, c);
    expect(order(c)).toEqual(['r2']);
    expect(order(a)).toContain('r2');
  });

  it('external zones get enter, move, leave, and drop with the rows; the cell menu Send to is the keyboard path; removing a zone stops it', () => {
    const g = mount({ accessories: [contextMenu()] });
    g.host.style.blockSize = '240px';
    const zone = document.createElement('div');
    zone.style.cssText = 'block-size:80px;inline-size:200px';
    document.body.append(zone);
    const seen: string[] = [];
    let last: DataGridRowZoneDetail<R> | null = null;
    const remove = g.addRowDropZone({
      element: zone,
      label: 'Trash',
      onDragEnter: () => seen.push('enter'),
      onDragLeave: () => seen.push('leave'),
      onDrop: (d) => {
        seen.push('drop');
        last = d;
      },
    });
    drag(g, 'r3', zone, 0.5);
    expect(seen).toEqual(['enter', 'drop']);
    expect(last).toMatchObject({ rowIds: ['r3'], rows: [{ id: 'r3', name: 'Row 3' }], grid: g });
    cell(g, 'r4').dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 10, clientY: 10 }));
    const items = (): HTMLElement[] => [...document.querySelectorAll<HTMLElement>('[role="menuitem"]')];
    items().find((i) => i.textContent.includes('Send to'))!.click();
    items().find((i) => i.textContent.includes('Trash'))!.click();
    expect(last).toMatchObject({ rowIds: ['r4'], x: null, y: null });
    remove();
    seen.length = 0;
    drag(g, 'r3', zone, 0.5);
    expect(seen).toEqual([]);
    expect(() => g.addRowDropZone({ element: zone, label: '', onDrop: () => undefined })).toThrow();
  });

  it('nativeData: handles are draggable and a native drag carries the data; a drop on the rows moves them', () => {
    const g = mount({ rowDragging: { managed: true, nativeData: (rows) => ({ 'text/plain': rows.map((r) => r.name).join(',') }) } });
    const handle = cell(g, 'r0').querySelector<HTMLElement>('.aui-data-grid__drag-handle')!;
    expect(handle.draggable).toBe(true);
    const data = new DataTransfer();
    handle.dispatchEvent(new DragEvent('dragstart', { bubbles: true, cancelable: true, dataTransfer: data }));
    expect(data.getData('text/plain')).toBe('Row 0');
    const target = cell(g, 'r2');
    const r = target.getBoundingClientRect();
    const at = { bubbles: true, cancelable: true, dataTransfer: data, clientX: r.left + 5, clientY: r.top + r.height * 0.75 };
    target.dispatchEvent(new DragEvent('dragover', at));
    expect(g.host.querySelector('.aui-data-grid__drop-line')).not.toBeNull();
    target.dispatchEvent(new DragEvent('drop', at));
    handle.dispatchEvent(new DragEvent('dragend', { bubbles: true }));
    expect(order(g).slice(0, 3)).toEqual(['r1', 'r2', 'r0']);
    expect(g.host.querySelector('.aui-data-grid__drop-line')).toBeNull();
  });
});
