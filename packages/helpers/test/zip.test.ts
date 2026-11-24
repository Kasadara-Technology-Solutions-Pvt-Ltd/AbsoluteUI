import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { createZipWriter, readZip, zipFiles } from '@absoluteui/helpers/zip';
import { crc32 } from '@absoluteui/helpers/encoding';
import { createZip } from '@absoluteui/theme/designer';
import { CP437_TABLE_LENGTH, decodeCp437, fromDosDateTime, normalizeEntryName, sanitizeEntryName, toDosDateTime } from '../src/zip/internal.js';
import { endRecords } from '../src/zip/writer.js';

const enc = new TextEncoder();
const dec = new TextDecoder();
const bytesOf = async (b: Blob): Promise<Uint8Array> => new Uint8Array(await b.arrayBuffer());
const u32 = (b: Uint8Array, o: number): number => new DataView(b.buffer, b.byteOffset).getUint32(o, true);
const u16 = (b: Uint8Array, o: number): number => new DataView(b.buffer, b.byteOffset).getUint16(o, true);

/** Offset of the first central directory header (from the classic EOCD). */
function centralOffset(b: Uint8Array): number {
  for (let i = b.length - 22; i >= 0; i--) if (u32(b, i) === 0x06054b50) return u32(b, i + 16);
  throw new Error('no EOCD');
}

function indexOfSig(b: Uint8Array, sig: number): number {
  for (let i = 0; i + 4 <= b.length; i++) if (u32(b, i) === sig) return i;
  return -1;
}

/** Hand-built stored archive (no data descriptors) with arbitrary raw names. */
function storedArchive(files: readonly { name: string; data: Uint8Array; flags?: number }[]): Uint8Array<ArrayBuffer> {
  const locals: Uint8Array[] = [];
  const centrals: Uint8Array[] = [];
  let offset = 0;
  for (const f of files) {
    const name = enc.encode(f.name);
    const crc = crc32(f.data);
    const lh = new Uint8Array(30 + name.length + f.data.length);
    const lv = new DataView(lh.buffer);
    lv.setUint32(0, 0x04034b50, true);
    lv.setUint16(4, 20, true);
    lv.setUint16(6, f.flags ?? 0x800, true);
    lv.setUint32(14, crc, true);
    lv.setUint32(18, f.data.length, true);
    lv.setUint32(22, f.data.length, true);
    lv.setUint16(26, name.length, true);
    lh.set(name, 30);
    lh.set(f.data, 30 + name.length);
    const ch = new Uint8Array(46 + name.length);
    const cv = new DataView(ch.buffer);
    cv.setUint32(0, 0x02014b50, true);
    cv.setUint16(4, 20, true);
    cv.setUint16(6, 20, true);
    cv.setUint16(8, f.flags ?? 0x800, true);
    cv.setUint32(16, crc, true);
    cv.setUint32(20, f.data.length, true);
    cv.setUint32(24, f.data.length, true);
    cv.setUint16(28, name.length, true);
    cv.setUint32(42, offset, true);
    ch.set(name, 46);
    locals.push(lh);
    centrals.push(ch);
    offset += lh.length;
  }
  const cdSize = centrals.reduce((n, c) => n + c.length, 0);
  const eocd = new Uint8Array(22);
  const ev = new DataView(eocd.buffer);
  ev.setUint32(0, 0x06054b50, true);
  ev.setUint16(8, files.length, true);
  ev.setUint16(10, files.length, true);
  ev.setUint32(12, cdSize, true);
  ev.setUint32(16, offset, true);
  const out = new Uint8Array(offset + cdSize + 22);
  let p = 0;
  for (const part of [...locals, ...centrals, eocd]) {
    out.set(part, p);
    p += part.length;
  }
  return out;
}

/** Deterministic pseudo-random bytes (xorshift) for incompressible payloads. */
function noise(n: number, seed = 1): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(n);
  let x = seed;
  for (let i = 0; i < n; i++) {
    x ^= x << 13;
    x ^= x >>> 17;
    x ^= x << 5;
    out[i] = x & 0xff;
  }
  return out;
}

// Stored 'hello.txt' → 'hello' (CRC-32 0x3610A686, 2025-01-01 12:00), Unix "made by", as written by Info-ZIP.
const KNOWN_ZIP = 'UEsDBAoAAAAAAABgIVqGphA2BQAAAAUAAAAJAAAAaGVsbG8udHh0aGVsbG9QSwECHgMKAAAAAAAAYCFahqYQNgUAAAAFAAAACQAAAAAAAAAAAAAApIEAAAAAaGVsbG8udHh0UEsFBgAAAAABAAEANwAAACwAAAAAAA==';
const fromB64 = (s: string): Uint8Array<ArrayBuffer> => Uint8Array.from(atob(s), (c) => c.charCodeAt(0));

describe('zip: known fixture', () => {
  it('reads a stored archive built per the specification', async () => {
    const zip = await readZip(fromB64(KNOWN_ZIP));
    expect(zip.entries).toHaveLength(1);
    const e = zip.entries[0]!;
    expect(e).toMatchObject({ name: 'hello.txt', size: 5, compressedSize: 5, crc32: 0x3610a686, method: 0, isDirectory: false, encrypted: false });
    expect(e.lastModified.getFullYear()).toBe(2025);
    expect(e.lastModified.getHours()).toBe(12);
    expect(dec.decode(await e.read())).toBe('hello');
    expect(crc32('hello')).toBe(0x3610a686);
  });

  it('reads the Theme Designer ZIP output', async () => {
    const bytes = createZip([
      { path: 'theme/tokens.css', content: ':root{--a:1}' },
      { path: 'theme/readme.txt', content: 'x'.repeat(1000) },
    ]);
    const zip = await readZip(bytes);
    expect(zip.entries.map((e) => e.name)).toEqual(['theme/tokens.css', 'theme/readme.txt']);
    expect(dec.decode(await zip.get('theme/tokens.css')!.read())).toBe(':root{--a:1}');
    expect((await zip.get('theme/readme.txt')!.read()).length).toBe(1000);
  });
});

describe('zip: round trips', () => {
  for (const compression of ['store', 'deflate'] as const) {
    it(`writes and reads back (${compression})`, async () => {
      const when = new Date(Date.UTC(2026, 8, 29, 10, 30, 12));
      const zip = createZipWriter({ compression, comment: 'Quarterly — Q3' });
      zip.add('readme.txt', 'Hello, world! '.repeat(100), { lastModified: when, comment: 'note' });
      zip.add('日本語/ファイル €.txt', 'unicode ✓', { lastModified: when });
      zip.add('empty.txt', '', { lastModified: when });
      zip.add('empty.bin', new Uint8Array(0), { lastModified: when });
      zip.addDirectory('folder', { lastModified: when });
      zip.add('bytes.bin', noise(10_000).buffer, { lastModified: when });
      zip.add('blob.json', new Blob(['{"a":1}']), { lastModified: when });
      zip.add('stream.txt', new Blob(['streamed ', 'text']).stream(), { lastModified: when });
      zip.add('windows\\path.txt', 'normalized', { lastModified: when });
      expect(zip.size).toBe(9);
      const blob = await zip.toBlob();
      expect(blob.type).toBe('application/zip');
      const archive = await readZip(blob);
      expect(archive.comment).toBe('Quarterly — Q3');
      expect(archive.entries.map((e) => e.name)).toEqual(['readme.txt', '日本語/ファイル €.txt', 'empty.txt', 'empty.bin', 'folder/', 'bytes.bin', 'blob.json', 'stream.txt', 'windows/path.txt']);
      const text = async (n: string): Promise<string> => dec.decode(await archive.get(n)!.read());
      expect(await text('readme.txt')).toBe('Hello, world! '.repeat(100));
      expect(await text('日本語/ファイル €.txt')).toBe('unicode ✓');
      expect(await text('empty.txt')).toBe('');
      expect(await text('empty.bin')).toBe('');
      expect(await text('blob.json')).toBe('{"a":1}');
      expect(await text('stream.txt')).toBe('streamed text');
      expect(await text('windows/path.txt')).toBe('normalized');
      expect(await archive.get('bytes.bin')!.read()).toEqual(noise(10_000));
      const dir = archive.get('folder/')!;
      expect(dir.isDirectory).toBe(true);
      expect(await dir.read()).toEqual(new Uint8Array(0));
      const readme = archive.get('readme.txt')!;
      expect(readme.comment).toBe('note');
      expect(readme.lastModified.getTime()).toBe(when.getTime());
      expect(readme.method).toBe(compression === 'deflate' ? 8 : 0);
      if (compression === 'deflate') expect(readme.compressedSize).toBeLessThan(readme.size);
      // Empty entries are always stored.
      expect(archive.get('empty.txt')!.method).toBe(compression === 'deflate' ? 8 : 0);
      expect(archive.get('empty.bin')!.method).toBe(0);
    });
  }

  it('sets the UTF-8 flag and data-descriptor bit in local headers', async () => {
    const bytes = await bytesOf(await zipFiles([{ name: 'é.txt', data: 'x' }], { compression: 'store' }));
    expect(u32(bytes, 0)).toBe(0x04034b50);
    expect(u16(bytes, 6) & 0x808).toBe(0x808);
    expect(indexOfSig(bytes, 0x08074b50)).toBeGreaterThan(0);
  });

  it('streams a 5 MB entry without knowing its size', async () => {
    const total = 5 * 1024 * 1024;
    const chunk = 64 * 1024;
    let sent = 0;
    const source = new ReadableStream<Uint8Array>({
      pull(c) {
        if (sent >= total) {
          c.close();
          return;
        }
        c.enqueue(noise(chunk, sent + 7));
        sent += chunk;
      },
    });
    const expectedCrc = (() => {
      let crc = 0;
      for (let o = 0; o < total; o += chunk) crc = crc32(noise(chunk, o + 7), crc);
      return crc;
    })();
    const zip = createZipWriter();
    zip.add('big.bin', source);
    const archive = await readZip(await zip.toBlob());
    const e = archive.get('big.bin')!;
    expect(e.size).toBe(total);
    expect(e.crc32).toBe(expectedCrc);
    let received = 0;
    const reader = e.stream().getReader();
    for (;;) {
      const r = await reader.read();
      if (r.done) break;
      received += r.value.length;
    }
    expect(received).toBe(total);
  });

  it('uses File.lastModified by default and accepts Uint8Array and ArrayBuffer archives', async () => {
    const file = new File(['abc'], 'abc.txt', { lastModified: Date.UTC(2020, 0, 2, 3, 4, 6) });
    const blob = await zipFiles([{ name: 'abc.txt', data: file }]);
    const bytes = await bytesOf(blob);
    const a = await readZip(bytes);
    const b = await readZip(bytes.buffer as ArrayBuffer);
    expect(a.entries[0]!.lastModified.getTime()).toBe(file.lastModified);
    expect(b.entries[0]!.name).toBe('abc.txt');
  });

  it('round-trips arbitrary entries (property)', async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.uniqueArray(fc.record({ name: fc.stringMatching(/^[a-z0-9]{1,8}(?:\/[a-z0-9]{1,8}){0,2}\.txt$/), data: fc.uint8Array({ maxLength: 2000 }) }), { maxLength: 6, selector: (e) => e.name }),
        fc.constantFrom('store' as const, 'deflate' as const),
        async (files, compression) => {
          const archive = await readZip(await zipFiles(files, { compression }));
          expect(archive.entries.map((e) => e.name)).toEqual(files.map((f) => f.name));
          for (const f of files) expect(await archive.get(f.name)!.read()).toEqual(f.data);
        },
      ),
      { numRuns: 25 },
    );
  });

  it('is single use', async () => {
    const zip = createZipWriter();
    zip.add('a.txt', 'a');
    await zip.stream().cancel();
    expect(() => { zip.add('b.txt', 'b'); }).toThrow(expect.objectContaining({ code: 'HLP_ZIP_WRITER_CLOSED' }));
    expect(() => zip.stream()).toThrow(expect.objectContaining({ code: 'HLP_ZIP_WRITER_CLOSED' }));
  });

  it('rejects invalid data and long comments', () => {
    const zip = createZipWriter();
    expect(() => { zip.add('a', 42 as unknown as string); }).toThrow(expect.objectContaining({ code: 'HLP_ZIP_INVALID_DATA' }));
    expect(() => createZipWriter({ comment: 'x'.repeat(70_000) })).toThrow(expect.objectContaining({ code: 'HLP_ZIP_COMMENT_TOO_LONG' }));
    const limited = createZipWriter({ maxEntries: 1 });
    limited.add('a', 'a');
    expect(() => { limited.add('b', 'b'); }).toThrow(expect.objectContaining({ code: 'HLP_ZIP_TOO_MANY_ENTRIES' }));
  });

  it('fails the stream when a source produces non-bytes', async () => {
    const zip = createZipWriter({ compression: 'store' });
    zip.add('bad', new ReadableStream<Uint8Array>({ start(c) { c.enqueue('text' as unknown as Uint8Array); c.close(); } }));
    await expect(zip.toBlob()).rejects.toMatchObject({ code: 'HLP_ZIP_INVALID_CHUNK' });
  });
});

describe('zip: ZIP64', () => {
  it("writes ZIP64 records with zip64: 'always' that the reader understands", async () => {
    const zip = createZipWriter({ zip64: 'always', compression: 'deflate' });
    zip.add('a.txt', 'alpha '.repeat(50));
    zip.add('b.bin', noise(3000));
    const bytes = await bytesOf(await zip.toBlob());
    expect(indexOfSig(bytes, 0x06064b50)).toBeGreaterThan(0);
    expect(indexOfSig(bytes, 0x07064b50)).toBeGreaterThan(0);
    const eocd = bytes.length - 22;
    expect(u16(bytes, eocd + 10)).toBe(0xffff);
    expect(u32(bytes, eocd + 16)).toBe(0xffffffff);
    // Local header advertises ZIP64 (sizes 0xFFFFFFFF and a ZIP64 extra field).
    expect(u32(bytes, 18)).toBe(0xffffffff);
    expect(u16(bytes, 30 + 5)).toBe(0x0001);
    const archive = await readZip(bytes);
    expect(dec.decode(await archive.get('a.txt')!.read())).toBe('alpha '.repeat(50));
    expect(await archive.get('b.bin')!.read()).toEqual(noise(3000));
  });

  it('computes ZIP64 end records for offsets beyond 4 GiB', () => {
    const cdOffset = 5_000_000_000;
    const rec = endRecords(3, cdOffset, 1234, new Uint8Array(0), false);
    const v = new DataView(rec.buffer);
    expect(v.getUint32(0, true)).toBe(0x06064b50);
    expect(Number(v.getBigUint64(24, true))).toBe(3);
    expect(Number(v.getBigUint64(40, true))).toBe(1234);
    expect(Number(v.getBigUint64(48, true))).toBe(cdOffset);
    expect(v.getUint32(56, true)).toBe(0x07064b50);
    expect(Number(v.getBigUint64(64, true))).toBe(cdOffset + 1234);
    expect(v.getUint32(76, true)).toBe(0x06054b50);
    expect(v.getUint32(76 + 16, true)).toBe(0xffffffff);
    // Small archives keep the classic record only.
    expect(endRecords(2, 100, 50, new Uint8Array(0), false).length).toBe(22);
  });

  it('switches to ZIP64 automatically above 65534 entries', async () => {
    const n = 65_536;
    const zip = createZipWriter({ compression: 'store' });
    for (let i = 0; i < n; i++) zip.add(`f${i}`, new Uint8Array(0));
    const bytes = await bytesOf(await zip.toBlob());
    expect(indexOfSig(bytes.subarray(bytes.length - 200), 0x06064b50)).toBeGreaterThanOrEqual(0);
    const archive = await readZip(bytes, { maxEntries: 70_000 });
    expect(archive.entries).toHaveLength(n);
    expect(archive.entries[n - 1]!.name).toBe(`f${n - 1}`);
  }, 60_000);
});

describe('zip: path safety', () => {
  it('rejects unsafe names when writing', () => {
    const zip = createZipWriter();
    const code = (name: string): unknown => {
      try {
        zip.add(name, 'x');
        return 'ok';
      } catch (e) {
        return (e as { code?: unknown }).code;
      }
    };
    expect(code('../evil.txt')).toBe('HLP_ZIP_PATH_TRAVERSAL');
    expect(code('a/../../evil.txt')).toBe('HLP_ZIP_PATH_TRAVERSAL');
    expect(code('..\\evil.txt')).toBe('HLP_ZIP_PATH_TRAVERSAL');
    expect(code('/etc/passwd')).toBe('HLP_ZIP_ABSOLUTE_PATH');
    expect(code('C:\\Windows\\x.dll')).toBe('HLP_ZIP_ABSOLUTE_PATH');
    expect(code('a\u0000b')).toBe('HLP_ZIP_INVALID_NAME');
    expect(code('')).toBe('HLP_ZIP_INVALID_NAME');
    expect(code('./')).toBe('HLP_ZIP_INVALID_NAME');
    expect(code('ok/./file.txt')).toBe('ok');
    expect(code('ok/file.txt')).toBe('HLP_ZIP_DUPLICATE_NAME');
    expect(code('ok//file.txt')).toBe('HLP_ZIP_DUPLICATE_NAME');
    expect(() => { zip.addDirectory('ok/file.txt'); }).toThrow(expect.objectContaining({ code: 'HLP_ZIP_DUPLICATE_NAME' }));
  });

  it('never puts the name in error messages', () => {
    try {
      createZipWriter().add('../secret-name', 'x');
    } catch (e) {
      expect((e as Error).message).not.toContain('secret-name');
    }
  });

  it('normalizes and sanitizes names', () => {
    expect(normalizeEntryName('a\\b\\c.txt', false)).toBe('a/b/c.txt');
    expect(normalizeEntryName('dir', true)).toBe('dir/');
    expect(sanitizeEntryName('../../etc/passwd', false)).toBe('etc/passwd');
    expect(sanitizeEntryName('C:\\x\\..\\..\\y', false)).toBe('y');
    expect(sanitizeEntryName('/abs/a\u0001b', false)).toBe('abs/ab');
    expect(sanitizeEntryName('..', true)).toBe('');
  });

  it('sanitizes malicious names when reading, keeping the raw name available', async () => {
    const bytes = storedArchive([
      { name: '../../evil.sh', data: enc.encode('#!') },
      { name: '/etc/cron.d/x', data: enc.encode('y') },
      { name: 'C:\\temp\\z.txt', data: enc.encode('z') },
    ]);
    const zip = await readZip(bytes);
    expect(zip.entries.map((e) => e.name)).toEqual(['evil.sh', 'etc/cron.d/x', 'temp/z.txt']);
    expect(zip.entries[0]!.rawName).toBe('../../evil.sh');
    const raw = await readZip(bytes, { rawNames: true });
    expect(raw.entries[0]!.name).toBe('../../evil.sh');
  });

  it('decodes code page 437 names without the UTF-8 flag', async () => {
    expect(CP437_TABLE_LENGTH).toBe(128);
    expect(decodeCp437(Uint8Array.of(0x80, 0x41, 0xe1))).toBe('ÇAß');
    const bytes = storedArchive([{ name: 'plain.txt', data: enc.encode('p'), flags: 0 }]);
    expect((await readZip(bytes)).entries[0]!.name).toBe('plain.txt');
  });
});

describe('zip: guards and integrity', () => {
  const zeros = new Uint8Array(5 * 1024 * 1024);

  it('rejects suspicious compression ratios (zip bomb)', async () => {
    const blob = await zipFiles([{ name: 'zeros.bin', data: zeros }], { compression: 'deflate' });
    await expect(readZip(blob)).rejects.toMatchObject({ code: 'HLP_ZIP_RATIO', kind: 'limit' });
    const ok = await readZip(blob, { maxCompressionRatio: 100_000 });
    expect((await ok.entries[0]!.read()).length).toBe(zeros.length);
  });

  it('enforces total size and entry count limits', async () => {
    const blob = await zipFiles([{ name: 'a', data: noise(1000) }, { name: 'b', data: noise(1000) }], { compression: 'store' });
    await expect(readZip(blob, { maxTotalUncompressed: 1500 })).rejects.toMatchObject({ code: 'HLP_ZIP_TOO_LARGE' });
    await expect(readZip(blob, { maxEntries: 1 })).rejects.toMatchObject({ code: 'HLP_ZIP_TOO_MANY_ENTRIES' });
  });

  it('detects CRC tampering', async () => {
    const bytes = await bytesOf(await zipFiles([{ name: 'a.txt', data: 'hello world' }], { compression: 'store' }));
    const tampered = bytes.slice();
    const dataStart = 30 + u16(bytes, 26) + u16(bytes, 28);
    tampered[dataStart] = tampered[dataStart]! ^ 0xff;
    const zip = await readZip(tampered);
    await expect(zip.entries[0]!.read()).rejects.toMatchObject({ code: 'HLP_ZIP_CRC_MISMATCH' });
  });

  it('stops inflating when output exceeds the declared size', async () => {
    const bytes = await bytesOf(await zipFiles([{ name: 'a.txt', data: 'hello world '.repeat(100) }], { compression: 'deflate' }));
    const tampered = bytes.slice();
    const cd = centralOffset(tampered);
    new DataView(tampered.buffer).setUint32(cd + 24, 10, true);
    const zip = await readZip(tampered);
    await expect(zip.entries[0]!.read()).rejects.toMatchObject({ code: 'HLP_ZIP_SIZE_MISMATCH' });
  });

  it('rejects encrypted entries and unsupported methods', async () => {
    const bytes = storedArchive([{ name: 'secret.txt', data: enc.encode('x'), flags: 0x801 }]);
    const zip = await readZip(bytes);
    expect(zip.entries[0]!.encrypted).toBe(true);
    await expect(zip.entries[0]!.read()).rejects.toMatchObject({ code: 'HLP_ZIP_ENCRYPTED', kind: 'unsupported' });
    const other = storedArchive([{ name: 'bz.txt', data: enc.encode('x') }]);
    const cd = centralOffset(other);
    new DataView(other.buffer).setUint16(cd + 10, 12, true);
    await expect((await readZip(other)).entries[0]!.read()).rejects.toMatchObject({ code: 'HLP_ZIP_UNSUPPORTED_METHOD' });
  });

  it('rejects non-ZIP and truncated input', async () => {
    await expect(readZip(noise(1000))).rejects.toMatchObject({ code: 'HLP_ZIP_CORRUPT' });
    await expect(readZip(new Uint8Array(5))).rejects.toMatchObject({ code: 'HLP_ZIP_CORRUPT' });
    const good = fromB64(KNOWN_ZIP);
    await expect(readZip(good.subarray(20))).rejects.toMatchObject({ code: 'HLP_ZIP_CORRUPT' });
    const badSig = good.slice();
    badSig[0] = 0;
    await expect((await readZip(badSig)).entries[0]!.read()).rejects.toMatchObject({ code: 'HLP_ZIP_CORRUPT' });
  });

  it('honours abort signals', async () => {
    const ac = new AbortController();
    ac.abort();
    await expect(readZip(fromB64(KNOWN_ZIP), { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
    const zip = await readZip(fromB64(KNOWN_ZIP));
    await expect(zip.entries[0]!.read({ signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('zip: DOS time', () => {
  it('round-trips at 2-second resolution and clamps the range', () => {
    const d = new Date(2024, 1, 29, 23, 59, 58);
    const dos = toDosDateTime(d);
    expect(fromDosDateTime(dos.date, dos.time).getTime()).toBe(d.getTime());
    expect(fromDosDateTime(toDosDateTime(new Date(1970, 0, 1)).date, 0).getFullYear()).toBe(1980);
    expect(fromDosDateTime(toDosDateTime(new Date(2200, 0, 1)).date, 0).getFullYear()).toBe(2107);
    expect(toDosDateTime(new Date(Number.NaN)).date).toBe(33);
  });
});
