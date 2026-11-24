import { afterEach, describe, expect, it } from 'vitest';
import { resetAbsoluteUIConfig } from '@absoluteui/core';
import { DataGrid } from '@absoluteui/components/data-grid';
import { parseFont, toPdf, visualOrder, winAnsiByte } from '@absoluteui/components/data-grid/pdf';

// docs/PLAN-R11-G10.md (G10d): PDF export.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

interface R {
  id: string;
  name: string;
  amount: number;
}
const rows = (n: number): R[] => Array.from({ length: n }, (_, i) => ({ id: String(i), name: `Item (${String(i)}) \\ ${String.fromCharCode(0x20ac)}`, amount: i * 1.5 }));

function mount(n: number): DataGrid<R> {
  const host = document.createElement('div');
  document.body.append(host);
  return DataGrid.create<R>(host, {
    label: 'Ledger',
    locale: 'en-US',
    rows: rows(n),
    rowId: (r) => r.id,
    columns: [
      { id: 'name', header: 'Name', field: 'name', width: 300 },
      { id: 'amount', header: 'Amount', field: 'amount', type: 'number' },
    ],
  });
}

const latin1 = (b: Uint8Array): string => {
  let s = '';
  for (const x of b) s += String.fromCharCode(x);
  return s;
};

async function inflate(bytes: Uint8Array): Promise<string> {
  const stream = new Blob([new Uint8Array(bytes)]).stream().pipeThrough(new DecompressionStream('deflate'));
  return latin1(new Uint8Array(await new Response(stream).arrayBuffer()));
}

/** The PDF's objects by number (checked against the cross-reference table) and its decompressed streams. */
async function read(blob: Blob): Promise<{ text: string; objects: Map<number, string>; streams: string[] }> {
  const bytes = new Uint8Array(await blob.arrayBuffer());
  const text = latin1(bytes);
  const objects = new Map<number, string>();
  const xref = /xref\n0 (\d+)\n([\s\S]*?)trailer/.exec(text);
  const entries = (xref?.[2] ?? '').trim().split('\n').slice(1);
  entries.forEach((e, i) => {
    const offset = Number(e.slice(0, 10));
    // Every offset points at "n 0 obj".
    expect(text.slice(offset, offset + `${String(i + 1)} 0 obj`.length)).toBe(`${String(i + 1)} 0 obj`);
    objects.set(i + 1, text.slice(offset, text.indexOf('endobj', offset)));
  });
  const start = /startxref\n(\d+)\n%%EOF\n$/.exec(text);
  expect(text.slice(Number(start?.[1]), Number(start?.[1]) + 4)).toBe('xref');
  const streams: string[] = [];
  for (const body of objects.values()) {
    const s = body.indexOf('stream\n');
    if (s < 0) continue;
    const e = body.lastIndexOf('\nendstream');
    const raw = bytes.slice(text.indexOf(body) + s + 7, text.indexOf(body) + e);
    streams.push(body.includes('/FlateDecode') ? await inflate(raw) : latin1(raw));
  }
  return { text, objects, streams };
}

/** A minimal TrueType font: head, hhea, hmtx, maxp, and a format 4 cmap (A -> 1, alef -> 2). */
function tinyFont(fsType = 0): Uint8Array {
  const tables: [string, Uint8Array][] = [];
  const u16 = (v: number): number[] => [(v >> 8) & 0xff, v & 0xff];
  const u32 = (v: number): number[] => [(v >>> 24) & 0xff, (v >>> 16) & 0xff, (v >>> 8) & 0xff, v & 0xff];
  const head = new Uint8Array(54);
  head.set(u16(1000), 18);
  head.set([...u16(0), ...u16(0xff38), ...u16(1000), ...u16(900)], 36);
  tables.push(['head', head]);
  const hhea = new Uint8Array(36);
  hhea.set(u16(800), 4);
  hhea.set(u16(0xff38), 6);
  hhea.set(u16(3), 34);
  tables.push(['hhea', hhea]);
  tables.push(['hmtx', new Uint8Array([...u16(500), ...u16(0), ...u16(600), ...u16(0), ...u16(700), ...u16(0)])]);
  tables.push(['maxp', new Uint8Array([...u32(0x00005000), ...u16(3)])]);
  const os2 = new Uint8Array(96);
  os2.set(u16(2), 0);
  os2.set(u16(fsType), 8);
  os2.set(u16(800), 68);
  os2.set(u16(0xff38), 70);
  os2.set(u16(700), 88);
  tables.push(['OS/2', os2]);
  // cmap format 4 with segments [0x41, 0x41], [0x5d0, 0x5d0], [0xffff, 0xffff].
  const seg = (ends: number[], starts: number[], deltas: number[]): number[] => {
    const n = ends.length;
    const body = [...u16(n * 2), ...u16(0), ...u16(0), ...u16(0), ...ends.flatMap(u16), ...u16(0), ...starts.flatMap(u16), ...deltas.flatMap((d) => u16(d & 0xffff)), ...ends.map(() => 0).flatMap(u16)];
    return [...u16(4), ...u16(14 + n * 8), ...u16(0), ...body];
  };
  const sub = seg([0x41, 0x5d0, 0xffff], [0x41, 0x5d0, 0xffff], [1 - 0x41, 2 - 0x5d0, 1]);
  tables.push(['cmap', new Uint8Array([...u16(0), ...u16(1), ...u16(3), ...u16(1), ...u32(12), ...sub])]);
  const offset = 12 + tables.length * 16;
  let at = offset;
  const dir: number[] = [];
  const bodies: number[] = [];
  for (const [tag, data] of tables) {
    dir.push(...Array.from({ length: 4 }, (_, k) => tag.charCodeAt(k)), ...u32(0), ...u32(at), ...u32(data.length));
    const padded = [...data, ...new Array<number>((4 - (data.length % 4)) % 4).fill(0)];
    bodies.push(...padded);
    at += padded.length;
  }
  return new Uint8Array([...u32(0x00010000), ...u16(tables.length), ...u16(0), ...u16(0), ...u16(0), ...dir, ...bodies]);
}

describe('PDF export (G10d)', () => {
  it('writes a valid paginated document: header rows on every page, page numbers, escaped WinAnsi text, metadata', async () => {
    const g = mount(120);
    const blob = await toPdf(g, { orientation: 'portrait', fontSize: 10 });
    expect(blob.type).toBe('application/pdf');
    const pdf = await read(blob);
    expect(pdf.text.startsWith('%PDF-1.7\n')).toBe(true);
    const pages = [...pdf.objects.values()].filter((o) => o.includes('/Type /Page '));
    expect(pages.length).toBeGreaterThan(1);
    const contents = pdf.streams.filter((s) => s.includes(' Tj ET'));
    expect(contents).toHaveLength(pages.length);
    for (const [i, c] of contents.entries()) {
      expect(c).toContain('(Name) Tj');
      expect(c).toContain(`(Page ${String(i + 1)} of ${String(pages.length)}) Tj`);
    }
    expect(contents[0]).toContain('(Ledger) Tj');
    // Parentheses and backslashes are escaped; the euro sign is WinAnsi byte 0x80.
    expect(contents[0]).toContain('(Item \\(0\\) \\\\ \\200) Tj');
    expect([...pdf.objects.values()].some((o) => o.includes('/BaseFont /Helvetica-Bold'))).toBe(true);
    expect(pdf.text.toUpperCase()).toContain('/TITLE <FEFF004C00650064006700650072>');
    await expect(toPdf(g, { pageSize: 'a3' as 'a4' })).rejects.toThrow(/pageSize/);
  });

  it('embeds an application font with glyph ids, widths, and a ToUnicode map; refuses fonts that forbid embedding', async () => {
    const g = mount(1);
    g.setRows([{ id: 'x', name: `A${String.fromCharCode(0x5d0)}`, amount: 1 }]);
    const pdf = await read(await toPdf(g, { fonts: { regular: tinyFont() }, columns: ['name'] }));
    const objects = [...pdf.objects.values()];
    expect(objects.some((o) => o.includes('/Subtype /Type0') && o.includes('/Encoding /Identity-H'))).toBe(true);
    expect(objects.some((o) => o.includes('/CIDToGIDMap /Identity') && o.includes('/W [1 [600] 2 [700]]'))).toBe(true);
    expect(pdf.streams.some((s) => s.includes('<0001> <0041>') && s.includes('<0002> <05d0>'))).toBe(true);
    expect(pdf.streams.some((s) => s.includes('<00010002> Tj'))).toBe(true);
    expect(() => parseFont(tinyFont(0x0002))).toThrow(/forbids embedding/);
    expect(() => parseFont(new Uint8Array(20))).toThrow(/not a TrueType/);
    expect(parseFont(tinyFont()).glyph(0x41)).toBe(1);
  });

  it('WinAnsi mapping and right-to-left ordering', () => {
    expect(winAnsiByte(0x20ac)).toBe(0x80);
    expect(winAnsiByte(0xe9)).toBe(0xe9);
    expect(winAnsiByte(0x0416)).toBeNull();
    const he = (s: string): string => s.replace(/[a-e]/g, (c) => String.fromCharCode(0x5d0 + c.charCodeAt(0) - 97));
    // Hebrew letters reverse; digits and Latin keep their order.
    expect(visualOrder(he('abc 12'), true)).toBe(`12 ${he('cba')}`);
    expect(visualOrder('plain', false)).toBe('plain');
  });
});
