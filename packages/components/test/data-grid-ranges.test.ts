import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid, type DataGridOptions, type DataGridRangeChangeDetail } from '@absoluteui/components/data-grid';
import { toHtmlTable, toTsv } from '../src/data-grid/ranges.js';

// docs/PLAN-R11-G3.md (G3b): cell ranges, column selection, and copy.
beforeAll(() => {
  const style = document.createElement('style');
  style.textContent = [
    '.aui-data-grid{display:flex;flex-direction:column;block-size:400px;inline-size:700px}',
    '.aui-data-grid__viewport{flex:1 1 auto;overflow:auto;min-block-size:0;position:relative}',
    '.aui-data-grid__head{position:sticky;top:0;z-index:3;background:#fff}',
    '.aui-data-grid__header-row{display:flex;block-size:40px}',
    '.aui-data-grid__header-cell{flex:none;box-sizing:border-box;overflow:hidden;position:relative}',
    '.aui-data-grid__body{position:relative}',
    '.aui-data-grid__row{position:absolute;display:flex;inset-inline-start:0;box-sizing:border-box}',
    '.aui-data-grid__cell{flex:none;box-sizing:border-box;overflow:hidden;white-space:nowrap}',
    '.aui-data-grid__spacer{flex:none}',
    '.aui-data-grid__cell--pinned-start{position:sticky;z-index:1;background:#fff}',
  ].join('\n');
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface P {
  id: string;
  name: string;
  age: number;
  city: string;
}
const people: P[] = ['Ann', 'Bob', 'Cid', 'Dee', 'Eve'].map((name, i) => ({ id: String.fromCharCode(97 + i), name, age: 1000 + i, city: ['Oslo', 'Lima'][i % 2] ?? '' }));

function mount(options: Partial<DataGridOptions<P>> = {}): DataGrid<P> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create(host, {
    label: 'People',
    rows: people,
    rowId: (r) => r.id,
    rowHeight: 30,
    locale: 'en-US',
    cellSelection: true,
    columns: [
      { id: 'name', header: 'Name', field: 'name', width: 150 },
      { id: 'age', header: 'Age', field: 'age', type: 'number', width: 120 },
      { id: 'city', header: 'City', field: 'city', width: 150, copyValue: (v) => `[${String(v)}]` },
    ],
    ...options,
  });
}
const cell = (g: DataGrid<P>, id: string, column: string): HTMLElement => g.host.querySelector<HTMLElement>(`.aui-data-grid__row[data-row-id="${id}"] [data-column="${column}"]`)!;
const selected = (g: DataGrid<P>): string[] => [...g.host.querySelectorAll<HTMLElement>('[role="gridcell"][aria-selected="true"]')].map((c) => `${c.closest<HTMLElement>('.aui-data-grid__row')?.dataset.rowId ?? ''}:${c.dataset.column ?? ''}`).sort();
function copyText(): { text: string; html: string } {
  const data = new DataTransfer();
  document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: data, bubbles: true, cancelable: true }));
  return { text: data.getData('text/plain'), html: data.getData('text/html') };
}

describe('clipboard text', () => {
  it('quotes tab-separated values only when needed and escapes HTML', () => {
    expect(toTsv([['a', 'b\tc'], ['say "x"', 'line\nbreak']])).toBe('a\t"b\tc"\r\n"say ""x"""\t"line\nbreak"');
    expect(toHtmlTable([['H'], ['<b>&']], 1)).toBe('<table><tr><th>H</th></tr><tr><td>&lt;b&gt;&amp;</td></tr></table>');
  });
});

describe('cell ranges', () => {
  it('Shift+arrows extend from the focused cell; cells get aria-selected and edges; a plain move collapses', async () => {
    const g = mount();
    expect(g.element.getAttribute('aria-multiselectable')).toBe('true');
    const seen: DataGridRangeChangeDetail[] = [];
    g.host.addEventListener('aui-range-change', (e) => seen.push((e as CustomEvent<DataGridRangeChangeDetail>).detail));
    cell(g, 'a', 'name').focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowRight}{/Shift}');
    expect(selected(g)).toEqual(['a:age', 'a:name', 'b:age', 'b:name']);
    expect(document.activeElement).toBe(cell(g, 'a', 'name'));
    expect(g.getCellRanges()).toEqual([{ startRow: 'a', startColumn: 'name', endRow: 'b', endColumn: 'age' }]);
    expect(seen.at(-1)?.finished).toBe(true);
    const corner = cell(g, 'b', 'age');
    expect(corner.classList.contains('aui-data-grid__cell--range-bottom')).toBe(true);
    expect(corner.classList.contains('aui-data-grid__cell--range-end')).toBe(true);
    expect(corner.classList.contains('aui-data-grid__cell--range-top')).toBe(false);
    await userEvent.keyboard('{Control>}{Shift>}{ArrowDown}{/Shift}{/Control}');
    expect(g.getCellRanges()[0]?.endRow).toBe('e');
    await userEvent.keyboard('{ArrowRight}');
    expect(g.getCellRanges()).toEqual([]);
    expect(selected(g)).toEqual([]);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(g.getCellRanges()).toEqual([{ startRow: 'a', endRow: 'e', startColumn: 'name', endColumn: 'city' }]);
  });

  it('pointer: press selects a cell, dragging extends, Ctrl adds a range, Shift extends', async () => {
    const g = mount();
    const down = (el: HTMLElement, init: PointerEventInit = {}): void => {
      const r = el.getBoundingClientRect();
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: r.left + 5, clientY: r.top + 5, pointerId: 1, button: 0, isPrimary: true, ...init }));
    };
    const move = (el: HTMLElement): void => {
      const r = el.getBoundingClientRect();
      for (const f of [0.5, 1]) document.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, clientX: r.left + 5 * f + 10, clientY: r.top + 10, pointerId: 1, isPrimary: true }));
    };
    const up = (el: HTMLElement): void => {
      const r = el.getBoundingClientRect();
      document.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, clientX: r.left + 10, clientY: r.top + 10, pointerId: 1, isPrimary: true }));
    };
    down(cell(g, 'b', 'name'));
    move(cell(g, 'c', 'age'));
    up(cell(g, 'c', 'age'));
    expect(g.getCellRanges()).toEqual([{ startRow: 'b', startColumn: 'name', endRow: 'c', endColumn: 'age' }]);
    down(cell(g, 'e', 'city'), { ctrlKey: true });
    up(cell(g, 'e', 'city'));
    expect(g.getCellRanges()).toHaveLength(2);
    down(cell(g, 'd', 'age'), { shiftKey: true });
    up(cell(g, 'd', 'age'));
    expect(g.getCellRanges()[1]).toEqual({ startRow: 'e', startColumn: 'city', endRow: 'd', endColumn: 'age' });
    expect(selected(g)).toEqual(['b:age', 'b:name', 'c:age', 'c:name', 'd:age', 'd:city', 'e:age', 'e:city']);
    // Let the drag's one-shot click suppression expire before the next test clicks.
    await new Promise((r) => setTimeout(r, 10));
  });

  it('column selection by header; sorting moves to Alt', async () => {
    const g = mount({ cellSelection: { columnSelection: true } });
    const header = g.host.querySelector<HTMLElement>('[role="columnheader"][data-column="age"]')!;
    header.click();
    expect(g.getCellRanges()).toEqual([{ startRow: 'a', endRow: 'e', startColumn: 'age', endColumn: 'age' }]);
    expect(g.sort).toEqual([]);
    header.dispatchEvent(new MouseEvent('click', { bubbles: true, altKey: true }));
    expect(g.sort).toEqual([{ column: 'age', direction: 'ascending' }]);
    g.host.querySelector<HTMLElement>('[role="columnheader"][data-column="city"]')!.focus();
    await userEvent.keyboard('{Shift>}{Enter}{/Shift}');
    expect(g.getCellRanges()).toEqual([{ startRow: 'a', endRow: 'e', startColumn: 'age', endColumn: 'city' }]);
  });

  it('copies ranges (stacked), selected rows, or the focused cell as TSV and HTML; copyValue and headers apply', async () => {
    const g = mount({ copyHeaders: true });
    cell(g, 'a', 'name').focus();
    expect(copyText().text).toBe('Name\r\nAnn');
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowRight}{ArrowRight}{/Shift}');
    const { text, html } = copyText();
    expect(text).toBe('Name\tAge\tCity\r\nAnn\t1,000\t[Oslo]\r\nBob\t1,001\t[Lima]');
    expect(html.startsWith('<table><tr><th>Name</th>')).toBe(true);
    const rows = mount({ cellSelection: false, rowSelection: { mode: 'multiple' }, selected: ['c', 'a'] });
    rows.host.querySelector<HTMLElement>('.aui-data-grid__row[data-row-id="b"] [data-column="name"]')!.focus();
    expect(copyText().text).toBe('Ann\t1,000\t[Oslo]\r\nCid\t1,002\t[Oslo]');
    expect(await rows.copySelection().catch(() => 'blocked')).toMatch(/Ann|blocked/);
  });

  it('API: add, read, and clear ranges; invalid ranges are rejected', () => {
    const g = mount();
    g.addCellRange({ startRow: 'a', endRow: 'b', startColumn: 'name', endColumn: 'name' });
    g.addCellRange({ startRow: 'd', endRow: 'd', startColumn: 'city', endColumn: 'city' });
    expect(selected(g)).toEqual(['a:name', 'b:name', 'd:city']);
    expect(() => {
      g.addCellRange({ startRow: 'zz', endRow: 'a', startColumn: 'name', endColumn: 'name' });
    }).toThrow(/cellRange/);
    g.clearCellRanges();
    expect(g.getCellRanges()).toEqual([]);
    const single = mount({ cellSelection: { multiple: false } });
    single.addCellRange({ startRow: 'a', endRow: 'a', startColumn: 'name', endColumn: 'name' });
    single.addCellRange({ startRow: 'b', endRow: 'b', startColumn: 'name', endColumn: 'name' });
    expect(single.getCellRanges()).toHaveLength(1);
  });
});
