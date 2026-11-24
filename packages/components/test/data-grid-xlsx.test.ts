import { afterEach, describe, expect, it } from 'vitest';
import { plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { readZip } from '@absoluteui/helpers/zip';
import { DataGrid, type DataGridOptions } from '@absoluteui/components/data-grid';
import { currencyFormat, protectionHash, toXlsx, writeXlsx, xlsxSheet } from '@absoluteui/components/data-grid/export';

// docs/PLAN-R11-G8.md (G8b): Excel export.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface S {
  id: string;
  region: string;
  name: string;
  amount: number;
  day: ReturnType<typeof plainDate>;
  note: string;
  site: string;
}
const sales: S[] = [
  { id: '1', region: 'East', name: 'Oslo', amount: 10, day: plainDate(2026, 1, 2), note: '=HYPERLINK("x")', site: 'https://example.com/a?b=1&c=2' },
  { id: '2', region: 'East', name: 'Lima <b>', amount: -5, day: plainDate(2026, 2, 3), note: 'bell' + String.fromCharCode(7), site: 'javascript:alert(1)' },
  { id: '3', region: 'West', name: 'Pune', amount: 1234.5, day: plainDate(2026, 3, 4), note: '', site: 'mailto:a@example.com' },
];
const PNG = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);

function mount(options: Partial<DataGridOptions<S>> = {}): DataGrid<S> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<S>(host, {
    label: 'Sales',
    locale: 'en-US',
    rows: sales,
    rowId: (r) => r.id,
    columns: [
      { id: 'region', header: 'Region', field: 'region', pinned: 'start' },
      { id: 'name', header: 'Name', field: 'name', excel: { link: (r) => r.site } },
      { id: 'amount', header: 'Amount', field: 'amount', type: 'currency', currency: 'EUR', aggregate: 'sum', excel: { cellStyle: (r) => (r.amount < 0 ? 'negative' : undefined) } },
      { id: 'day', header: 'Day', field: 'day', type: 'date' },
      { id: 'note', header: 'Note', field: 'note', excel: { image: (r) => (r.id === '3' ? { bytes: PNG, type: 'png', width: 16, height: 16, alt: 'Logo' } : null) } },
      { id: 'double', header: 'Double', accessor: (r) => r.amount * 2, type: 'number', excel: { formula: (_r, ref) => `${ref('amount')}*2` } },
    ],
    ...options,
  });
}

/** The parts of an .xlsx as text, each checked to be well-formed XML. */
async function parts(blob: Blob): Promise<Map<string, string>> {
  const zip = await readZip(blob);
  const out = new Map<string, string>();
  for (const entry of zip.entries) {
    const bytes = await entry.read();
    if (!entry.name.endsWith('.xml') && !entry.name.endsWith('.rels')) {
      out.set(entry.name, String(bytes.length));
      continue;
    }
    const text = new TextDecoder().decode(bytes);
    const doc = new DOMParser().parseFromString(text, 'application/xml');
    expect(doc.querySelector('parsererror'), entry.name).toBeNull();
    out.set(entry.name, text);
  }
  return out;
}

describe('Excel export (G8b)', () => {
  it('writes a valid package: typed cells, text never as formulas, escaped and cleaned strings, formats, links, images, formulas', async () => {
    const g = mount({ grandTotal: 'bottom' });
    const blob = await toXlsx(g, { styles: { negative: { color: '#C00000' } }, title: 'Q1 <sales>' });
    expect(blob.type).toBe('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
    const p = await parts(blob);
    for (const name of ['[Content_Types].xml', '_rels/.rels', 'xl/workbook.xml', 'xl/styles.xml', 'xl/sharedStrings.xml', 'xl/worksheets/sheet1.xml', 'xl/worksheets/_rels/sheet1.xml.rels', 'xl/drawings/drawing1.xml', 'xl/media/image1.png', 'docProps/core.xml']) expect(p.has(name), name).toBe(true);
    const sheet = p.get('xl/worksheets/sheet1.xml') ?? '';
    const sst = p.get('xl/sharedStrings.xml') ?? '';
    // The formula-like note is a shared string; the only formula is the column's.
    expect(sst).toContain('=HYPERLINK(&quot;x&quot;)');
    expect(sst).toContain('Lima &lt;b&gt;');
    expect(sst).toContain('<t xml:space="preserve">bell</t>');
    expect(sheet.match(/<f>/g)?.length).toBe(3);
    expect(sheet).toContain('<c r="F2"');
    expect(sheet).toContain('<f>C2*2</f>');
    // Dates are serials (2026-01-02 is 46024), amounts numbers, totals included.
    expect(sheet).toContain('<v>46024</v>');
    expect(sheet).toContain('<v>-5</v>');
    expect(sheet).toContain('<v>1239.5</v>');
    expect(p.get('xl/styles.xml')).toContain('formatCode="&quot;€&quot;#,##0.00"'.replace('€', String.fromCharCode(0x20ac)));
    expect(p.get('xl/styles.xml')).toContain('formatCode="yyyy-mm-dd"');
    expect(p.get('xl/styles.xml')).toContain('rgb="FFC00000"');
    // Links: http and mailto kept, javascript dropped.
    const rels = p.get('xl/worksheets/_rels/sheet1.xml.rels') ?? '';
    expect(rels).toContain('https://example.com/a?b=1&amp;c=2');
    expect(rels).toContain('mailto:a@example.com');
    expect(rels).not.toContain('javascript');
    expect(p.get('xl/drawings/drawing1.xml')).toContain('descr="Logo"');
    // Frozen header row and the start-pinned column; sheet named after the grid.
    expect(sheet).toContain('xSplit="1" ySplit="1" topLeftCell="B2"');
    expect(p.get('xl/workbook.xml')).toContain('<sheet name="Sales"');
    expect(p.get('docProps/core.xml')).toContain('<dc:title>Q1 &lt;sales&gt;</dc:title>');
  });

  it('groups as outlines collapsed like the grid, column group headers merged, several sheets, protection, and bad input', async () => {
    const g = mount({ groupBy: ['region'], groupDefaultExpanded: -1 });
    g.setExpanded(g.getGroups().find((x) => x.key === 'West')?.id ?? '', false);
    const sheet = xlsxSheet(g, { columns: ['aui-group', 'name', 'amount'], styles: { negative: { italic: true } } });
    const levels = sheet.rows.map((r) => [r.outlineLevel ?? 0, r.hidden === true, r.collapsed === true]);
    expect(levels).toEqual([[0, false, false], [0, false, false], [1, false, false], [1, false, false], [0, false, true], [1, true, false]]);
    expect(sheet.rows[1]?.cells[0]?.value).toBe('East');
    const grouped = mount({ columns: [{ id: 'where', header: 'Where', children: [{ id: 'region', header: 'Region', field: 'region' }, { id: 'name', header: 'Name', field: 'name' }] }, { id: 'amount', header: 'Amount', field: 'amount', type: 'number' }] });
    const two = xlsxSheet(grouped, { sheetName: 'Bad/Name:[x]', protection: { password: 'secret', spinCount: 3, allow: ['sort'] } });
    expect(two.merges).toEqual([{ top: 0, left: 0, bottom: 0, right: 1 }]);
    const p = await parts(await writeXlsx({ sheets: [sheet, two, { name: 'Raw', rows: [{ cells: [{ value: 'a' }, { value: 1 }] }] }] }));
    expect(p.get('xl/workbook.xml')).toContain('<sheet name="Bad Name  x"');
    expect(p.get('xl/worksheets/sheet1.xml')).toContain('<outlinePr summaryBelow="0"/>');
    expect(p.get('xl/worksheets/sheet1.xml')).toContain('hidden="1"');
    expect(p.get('xl/worksheets/sheet2.xml')).toMatch(/<sheetProtection algorithmName="SHA-512" hashValue="[A-Za-z0-9+/]{86}==" saltValue="[A-Za-z0-9+/]{22}==" spinCount="3" sheet="1" objects="1" scenarios="1" sort="0" selectLockedCells="1"\/>/);
    expect(p.get('xl/worksheets/sheet2.xml')).toContain('<mergeCell ref="A1:B1"/>');
    expect(await protectionHash('x', new Uint8Array(16), 2)).toBe(await protectionHash('x', new Uint8Array(16), 2));
    expect(await protectionHash('x', new Uint8Array(16), 2)).not.toBe(await protectionHash('y', new Uint8Array(16), 2));
    expect(() => xlsxSheet(mount({ columns: [{ id: 'n', header: 'N', field: 'name', excel: { style: 'missing' } }] }))).toThrow(/missing/);
    await expect(writeXlsx({ sheets: [{ name: 'x', rows: [{ cells: [{ value: 'a', style: { color: 'red' } }] }] }] })).rejects.toThrow(/color/);
    await expect(writeXlsx({ sheets: [{ name: 'x', rows: [], images: [{ row: 0, column: 0, bytes: new Uint8Array([1, 2, 3]), type: 'png', width: 1, height: 1 }] }] })).rejects.toThrow(/PNG or JPEG/);
  });

  it('currency formats follow the locale', () => {
    const euro = String.fromCharCode(0x20ac);
    expect(currencyFormat('EUR', 'en-US')).toBe(`"${euro}"#,##0.00`);
    expect(currencyFormat('EUR', 'de-DE')).toBe(`#,##0.00" ${euro}"`);
    expect(currencyFormat('JPY', 'ja-JP')).toMatch(/#,##0$|#,##0"/);
  });
});
