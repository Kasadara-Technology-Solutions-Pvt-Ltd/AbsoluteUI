import { afterEach, describe, expect, it, vi } from 'vitest';
import fc from 'fast-check';
import {
  collectDroppedFiles,
  fileChecksum,
  filesFromClipboardEvent,
  formatFileSize,
  getExtension,
  openFilePicker,
  readAsArrayBuffer,
  readAsBytes,
  readAsDataUrl,
  readAsText,
  readChunks,
  readLines,
  splitFileName,
  streamFile,
  withExtension,
} from '@absoluteui/services/file';
import { crc32 } from '@absoluteui/helpers/encoding';

const collect = async <T>(it: AsyncIterable<T>): Promise<T[]> => {
  const out: T[] = [];
  for await (const x of it) out.push(x);
  return out;
};

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  document.body.replaceChildren();
});

describe('readAsText', () => {
  it('decodes UTF-8 and honours byte-order marks', async () => {
    expect(await readAsText(new Blob(['héllo €']))).toBe('héllo €');
    expect(await readAsText(new Blob([Uint8Array.of(0xef, 0xbb, 0xbf, 0x61)]))).toBe('a');
    expect(await readAsText(new Blob([Uint8Array.of(0xff, 0xfe, 0x61, 0x00, 0xac, 0x20)]))).toBe('a€');
    expect(await readAsText(new Blob([Uint8Array.of(0xfe, 0xff, 0x00, 0x61)]), { encoding: 'windows-1252' })).toBe('a');
    expect(await readAsText(new Blob([Uint8Array.of(0x80)]), { encoding: 'windows-1252' })).toBe('€');
  });

  it('applies fatal decoding, encoding validation and size limits', async () => {
    const bad = new Blob([Uint8Array.of(0x61, 0xff)]);
    expect(await readAsText(bad)).toBe('a�');
    await expect(readAsText(bad, { fatal: true })).rejects.toMatchObject({ code: 'SVC_FILE_DECODE' });
    await expect(readAsText(bad, { encoding: 'not-a-charset' })).rejects.toMatchObject({ code: 'SVC_FILE_ENCODING' });
    await expect(readAsText(new Blob(['12345']), { maxBytes: 4 })).rejects.toMatchObject({ code: 'SVC_FILE_TOO_LARGE', kind: 'limit' });
    const ac = new AbortController();
    ac.abort();
    await expect(readAsText(new Blob(['x']), { signal: ac.signal })).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('binary reads', () => {
  it('reads buffers, bytes and data URLs with limits', async () => {
    const blob = new Blob([Uint8Array.of(1, 2, 3)], { type: 'application/x-test' });
    expect(new Uint8Array(await readAsArrayBuffer(blob))).toEqual(Uint8Array.of(1, 2, 3));
    expect(await readAsBytes(blob)).toEqual(Uint8Array.of(1, 2, 3));
    expect(await readAsDataUrl(new Blob(['hi'], { type: 'text/plain' }))).toBe('data:text/plain;base64,aGk=');
    await expect(readAsBytes(blob, { maxBytes: 2 })).rejects.toMatchObject({ code: 'SVC_FILE_TOO_LARGE' });
    await expect(readAsDataUrl(blob, { maxBytes: 2 })).rejects.toMatchObject({ code: 'SVC_FILE_TOO_LARGE' });
  });

  it('aborts a data URL read', async () => {
    const ac = new AbortController();
    const p = readAsDataUrl(new Blob([new Uint8Array(5_000_000)]), { signal: ac.signal });
    ac.abort();
    await expect(p).rejects.toMatchObject({ name: 'AbortError' });
  });
});

describe('readChunks and streamFile', () => {
  it('yields fixed-size slices covering the range', async () => {
    const data = Uint8Array.from({ length: 10 }, (_, i) => i);
    const chunks = await collect(readChunks(new Blob([data]), { chunkSize: 4 }));
    expect(chunks.map((c) => Array.from(c))).toEqual([[0, 1, 2, 3], [4, 5, 6, 7], [8, 9]]);
    const part = await collect(readChunks(new Blob([data]), { chunkSize: 3, start: 2, end: 7 }));
    expect(part.map((c) => Array.from(c))).toEqual([[2, 3, 4], [5, 6]]);
    expect(await collect(readChunks(new Blob([])))).toEqual([]);
    await expect(collect(readChunks(new Blob([data]), { chunkSize: 0 }))).rejects.toMatchObject({ code: 'SVC_FILE_OPTION' });
  });

  it('stops on abort between chunks', async () => {
    const ac = new AbortController();
    const it = readChunks(new Blob([new Uint8Array(100)]), { chunkSize: 10, signal: ac.signal });
    await it.next();
    ac.abort();
    await expect(it.next()).rejects.toMatchObject({ code: 'SVC_FILE_ABORTED' });
  });

  it('streams with back pressure', async () => {
    const stream = streamFile(new Blob(['abcdefghij']), { chunkSize: 3 });
    const parts = await collect(stream as unknown as AsyncIterable<Uint8Array>);
    expect(parts.map((p) => new TextDecoder().decode(p))).toEqual(['abc', 'def', 'ghi', 'j']);
    await streamFile(new Blob(['abc'])).cancel();
  });
});

describe('readLines', () => {
  it('splits LF, CRLF and CR, including across chunk boundaries', async () => {
    const text = 'one\r\ntwo\nthree\rfour\r\n\r\nsix';
    for (const chunkSize of [1, 2, 3, 4, 5, 64]) {
      expect(await collect(readLines(new Blob([text]), { chunkSize }))).toEqual(['one', 'two', 'three', 'four', '', 'six']);
    }
    expect(await collect(readLines(new Blob(['a\n'])))).toEqual(['a']);
    expect(await collect(readLines(new Blob(['a\r'])))).toEqual(['a']);
    expect(await collect(readLines(new Blob([''])))).toEqual([]);
    expect(await collect(readLines(new Blob(['\n'])))).toEqual(['']);
  });

  it('decodes multi-byte characters split across chunks and strips the BOM', async () => {
    const blob = new Blob([Uint8Array.of(0xef, 0xbb, 0xbf), 'é€😀\n日本']);
    expect(await collect(readLines(blob, { chunkSize: 1 }))).toEqual(['é€😀', '日本']);
  });

  it('enforces the maximum line length', async () => {
    await expect(collect(readLines(new Blob(['short\n', 'x'.repeat(100)]), { maxLineLength: 50, chunkSize: 7 }))).rejects.toMatchObject({ code: 'SVC_FILE_LINE_TOO_LONG' });
    await expect(collect(readLines(new Blob(['x'.repeat(60), '\n']), { maxLineLength: 50, chunkSize: 1000 }))).rejects.toMatchObject({ code: 'SVC_FILE_LINE_TOO_LONG' });
  });

  it('matches a split oracle for any text and chunk size (property)', async () => {
    await fc.assert(
      fc.asyncProperty(fc.array(fc.constantFrom('a', 'é', '😀', '\n', '\r', '\r\n', ' '), { maxLength: 40 }), fc.integer({ min: 1, max: 9 }), async (parts, chunkSize) => {
        const text = parts.join('');
        const expected = text.split(/\r\n|\r|\n/);
        if (expected.at(-1) === '') expected.pop();
        expect(await collect(readLines(new Blob([text]), { chunkSize }))).toEqual(expected);
      }),
      { numRuns: 150 },
    );
  });
});

describe('names and sizes', () => {
  it('splits names with compound extensions', () => {
    expect(splitFileName('archive.tar.gz')).toEqual({ base: 'archive', extension: 'tar.gz' });
    expect(splitFileName('my.report.v2.PDF')).toEqual({ base: 'my.report.v2', extension: 'PDF' });
    expect(splitFileName('.env')).toEqual({ base: '.env', extension: '' });
    expect(splitFileName('noext')).toEqual({ base: 'noext', extension: '' });
    expect(splitFileName('trailing.')).toEqual({ base: 'trailing.', extension: '' });
    expect(splitFileName('dir/sub\\file.txt')).toEqual({ base: 'file', extension: 'txt' });
    expect(getExtension('Photo.JPG')).toBe('jpg');
    expect(getExtension('backup.TAR.GZ')).toBe('tar.gz');
    expect(getExtension('.gitignore')).toBeUndefined();
    expect(withExtension('report.csv', 'xlsx')).toBe('report.xlsx');
    expect(withExtension('archive.tar.gz', '.zip')).toBe('archive.zip');
    expect(withExtension('report.csv', '')).toBe('report');
  });

  it('formats sizes, including a spoken style', () => {
    expect(formatFileSize(2_400_000)).toBe('2.4 MB');
    expect(formatFileSize(2_400_000, { style: 'long' })).toBe('2.4 megabytes');
    expect(formatFileSize(10_000_000, { style: 'long', locale: 'de' })).toBe('10 Megabyte');
  });
});

describe('fileChecksum', () => {
  it('computes streaming CRC-32 and SHA digests', async () => {
    expect(await fileChecksum(new Blob(['123456789']), 'crc32')).toBe('cbf43926');
    expect(await fileChecksum(new Blob([]), 'SHA-256')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await fileChecksum(new Blob(['abc']))).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    const big = new Uint8Array(3 * 1024 * 1024 + 5).map((_, i) => i & 0xff);
    const progress: number[] = [];
    expect(await fileChecksum(new Blob([big]), 'crc32', { onProgress: (n) => progress.push(n) })).toBe(crc32(big).toString(16).padStart(8, '0'));
    expect(progress.at(-1)).toBe(big.length);
    expect(progress.length).toBe(4);
  });

  it('refuses SHA over the in-memory limit and recommends crc32', async () => {
    const err = await fileChecksum(new Blob(['12345']), 'SHA-256', { maxBytes: 4 }).catch((e: unknown) => e);
    expect(err).toMatchObject({ code: 'SVC_FILE_CHECKSUM_TOO_LARGE', kind: 'limit' });
    expect((err as Error).message).toContain('crc32');
    await expect(fileChecksum(new Blob(['x']), 'MD5' as 'crc32')).rejects.toMatchObject({ code: 'SVC_FILE_CHECKSUM_ALGORITHM' });
  });
});

// ---------------------------------------------------------------------------
// Drag and drop, paste, picker

function fileEntry(path: string, content = 'x') {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return { isFile: true, isDirectory: false, name, fullPath: `/${path}`, file: (ok: (f: File) => void) => { ok(new File([content], name)); } };
}
function dirEntry(path: string, children: unknown[], batch = 2) {
  const name = path.slice(path.lastIndexOf('/') + 1);
  return {
    isFile: false,
    isDirectory: true,
    name,
    fullPath: `/${path}`,
    createReader() {
      let i = 0;
      return { readEntries: (ok: (e: unknown[]) => void) => { ok(children.slice(i, (i += batch))); } };
    },
  };
}
const itemFor = (entry: unknown, file: File | null = null) => ({ kind: 'file', getAsFile: () => file, webkitGetAsEntry: () => entry as never });

describe('collectDroppedFiles', () => {
  it('walks folders in batches with relative paths', async () => {
    const tree = dirEntry('photos', [fileEntry('photos/a.jpg'), dirEntry('photos/2026', [fileEntry('photos/2026/b.jpg'), fileEntry('photos/2026/c.jpg'), fileEntry('photos/2026/d.jpg')]), fileEntry('photos/e.jpg')]);
    const { files, truncated } = await collectDroppedFiles({ items: [itemFor(tree), itemFor(fileEntry('top.txt')), { kind: 'string', getAsFile: () => null }] });
    expect(files.map((f) => f.path)).toEqual(['photos/a.jpg', 'photos/2026/b.jpg', 'photos/2026/c.jpg', 'photos/2026/d.jpg', 'photos/e.jpg', 'top.txt']);
    expect(files[0]!.file).toBeInstanceOf(File);
    expect(truncated).toBe(false);
  });

  it('applies file and depth limits', async () => {
    const many = dirEntry('d', Array.from({ length: 10 }, (_, i) => fileEntry(`d/${i}.txt`)));
    const limited = await collectDroppedFiles({ items: [itemFor(many)] }, { maxFiles: 3 });
    expect(limited.files).toHaveLength(3);
    expect(limited.truncated).toBe(true);
    const deep = dirEntry('a', [dirEntry('a/b', [dirEntry('a/b/c', [fileEntry('a/b/c/x.txt')])]), fileEntry('a/y.txt')]);
    const shallow = await collectDroppedFiles({ items: [itemFor(deep)] }, { maxDepth: 2 });
    expect(shallow.files.map((f) => f.path)).toEqual(['a/y.txt']);
    expect(shallow.truncated).toBe(true);
  });

  it('falls back to getAsFile and the files list', async () => {
    const f = new File(['1'], 'plain.txt');
    expect((await collectDroppedFiles({ items: [{ kind: 'file', getAsFile: () => f }] })).files).toEqual([{ file: f, path: 'plain.txt' }]);
    expect((await collectDroppedFiles({ files: [f] })).files).toEqual([{ file: f, path: 'plain.txt' }]);
    const real = new DataTransfer();
    real.items.add(f);
    expect((await collectDroppedFiles(real)).files[0]!.file.name).toBe('plain.txt');
  });
});

describe('filesFromClipboardEvent', () => {
  it('returns pasted files', () => {
    const dt = new DataTransfer();
    dt.items.add('text', 'text/plain');
    dt.items.add(new File(['png'], 'image.png', { type: 'image/png' }));
    const files = filesFromClipboardEvent(new ClipboardEvent('paste', { clipboardData: dt }));
    expect(files.map((f) => f.name)).toEqual(['image.png']);
    expect(filesFromClipboardEvent({ clipboardData: null })).toEqual([]);
  });
});

describe('openFilePicker', () => {
  it('uses a hidden input, resolves the chosen files, removes the input and restores focus', async () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    let seen: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      const el = document.querySelector<HTMLInputElement>('input[type=file]')!;
      seen = el;
      const dt = new DataTransfer();
      dt.items.add(new File(['a'], 'a.pdf', { type: 'application/pdf' }));
      el.files = dt.files;
      document.body.focus();
      el.dispatchEvent(new Event('change'));
    });
    const files = await openFilePicker({ accept: 'image/*,.pdf', multiple: true });
    expect(files.map((f) => f.name)).toEqual(['a.pdf']);
    expect(seen).toMatchObject({ type: 'file', accept: 'image/*,.pdf', multiple: true, hidden: true });
    expect(seen!.isConnected).toBe(false);
    expect(document.activeElement).toBe(button);
  });

  it('resolves [] on cancel and supports folders and abort', async () => {
    let input: HTMLInputElement | undefined;
    vi.spyOn(HTMLInputElement.prototype, 'click').mockImplementation(() => {
      const el = document.querySelector<HTMLInputElement>('input[type=file]')!;
      input = el;
      if (!el.webkitdirectory) el.dispatchEvent(new Event('cancel'));
    });
    expect(await openFilePicker()).toEqual([]);
    const ac = new AbortController();
    const pending = openFilePicker({ directory: true, signal: ac.signal });
    expect(input!.webkitdirectory).toBe(true);
    ac.abort();
    await expect(pending).rejects.toMatchObject({ code: 'SVC_FILE_ABORTED' });
    expect(input!.isConnected).toBe(false);
  });

  it('prefers showOpenFilePicker and maps accept to picker types', async () => {
    const calls: unknown[] = [];
    vi.stubGlobal('showOpenFilePicker', (o: unknown) => {
      calls.push(o);
      return Promise.resolve([{ getFile: () => Promise.resolve(new File(['x'], 'x.png')) }]);
    });
    expect((await openFilePicker({ accept: 'image/*,.pdf' })).map((f) => f.name)).toEqual(['x.png']);
    expect(calls[0]).toEqual({ multiple: false, types: [{ accept: { 'image/*': [], 'application/octet-stream': ['.pdf'] } }], excludeAcceptAllOption: true });
    vi.stubGlobal('showOpenFilePicker', () => Promise.reject(new DOMException('cancelled', 'AbortError')));
    expect(await openFilePicker()).toEqual([]);
  });
});
