import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  createDownloadQueue,
  createObjectUrl,
  describeDownloadStatus,
  downloadBlob,
  downloadCsv,
  downloadDataUrl,
  downloadJson,
  downloadText,
  downloadUrl,
  revokeAll,
  sanitizeDownloadName,
  saveWithPicker,
  type DownloadStatus,
} from '@absoluteui/services/download';

interface Capture {
  anchors: { href: string; download: string; connected: boolean }[];
  blobs: Blob[];
  created: string[];
  revoked: string[];
}

let cap: Capture;
let clickSpy: { mockImplementation(fn: () => void): unknown };
beforeEach(() => {
  cap = { anchors: [], blobs: [], created: [], revoked: [] };
  let n = 0;
  clickSpy = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(function (this: HTMLAnchorElement) {
    cap.anchors.push({ href: this.href, download: this.download, connected: this.isConnected });
  });
  vi.spyOn(URL, 'createObjectURL').mockImplementation((b: Blob | MediaSource) => {
    const url = `blob:test/${++n}`;
    cap.blobs.push(b as Blob);
    cap.created.push(url);
    return url;
  });
  vi.spyOn(URL, 'revokeObjectURL').mockImplementation((u: string) => {
    cap.revoked.push(u);
  });
  document.body.replaceChildren();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const tick = (ms = 5): Promise<void> => new Promise((r) => setTimeout(r, ms));
const lastText = async (): Promise<string> => new TextDecoder().decode(await cap.blobs.at(-1)!.arrayBuffer());

describe('downloadBlob', () => {
  it('clicks a detached anchor, revokes the URL and keeps focus', async () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const status = downloadBlob(new Blob(['abc']), 'report.pdf');
    expect(status).toEqual({ ok: true, method: 'anchor', fileName: 'report.pdf', bytes: 3 });
    expect(cap.anchors).toEqual([{ href: 'blob:test/1', download: 'report.pdf', connected: false }]);
    expect(document.activeElement).toBe(button);
    expect(document.body.children).toHaveLength(1);
    expect(cap.revoked).toEqual([]);
    await tick();
    expect(cap.revoked).toEqual(['blob:test/1']);
  });

  it('sanitizes the name and honours abort', () => {
    expect(downloadBlob(new Blob(['x']), '../../etc/passwd').fileName).toBe('passwd');
    const ac = new AbortController();
    ac.abort();
    expect(downloadBlob(new Blob(['x']), 'a.txt', { signal: ac.signal })).toEqual({ ok: false, method: 'none', fileName: 'a.txt', reason: 'aborted' });
  });

  it('revokes immediately when the click throws', () => {
    clickSpy.mockImplementation(() => {
      throw new Error('blocked');
    });
    const s = downloadBlob(new Blob(['x']), 'a.txt');
    expect(s).toMatchObject({ ok: false, reason: 'error' });
    expect(cap.revoked).toEqual(['blob:test/1']);
  });
});

describe('text, JSON, CSV and data URLs', () => {
  it('downloads text with an optional BOM', async () => {
    downloadText('héllo', 'a.txt');
    expect(await lastText()).toBe('héllo');
    expect(cap.blobs.at(-1)!.type).toBe('text/plain;charset=utf-8');
    downloadText('x', 'b.txt', { bom: true });
    expect(new Uint8Array(await cap.blobs.at(-1)!.arrayBuffer()).slice(0, 3)).toEqual(Uint8Array.of(0xef, 0xbb, 0xbf));
  });

  it('downloads JSON safely', async () => {
    const cyclic: Record<string, unknown> = { n: 1n };
    cyclic.self = cyclic;
    downloadJson(cyclic, 'data.json');
    expect(await lastText()).toBe('{"n":"1","self":"[Circular]"}');
    downloadJson({ a: 1 }, 'p.json', { pretty: true });
    expect(await lastText()).toBe('{\n  "a": 1\n}');
    expect(() => downloadJson(undefined, 'u.json')).toThrow(expect.objectContaining({ code: 'SVC_DOWNLOAD_NOT_SERIALIZABLE' }));
  });

  it('downloads CSV with a BOM and injection protection', async () => {
    const s = downloadCsv([{ name: '=HYPERLINK("http://evil")', score: -5 }], 'scores.csv');
    expect(s.ok).toBe(true);
    const bytes = new Uint8Array(await cap.blobs.at(-1)!.arrayBuffer());
    expect(bytes.slice(0, 3)).toEqual(Uint8Array.of(0xef, 0xbb, 0xbf));
    expect(new TextDecoder().decode(bytes)).toBe('name,score\r\n"\'=HYPERLINK(""http://evil"")",-5\r\n');
    downloadCsv([['a', 'b']], 'x.csv', { bom: false, columns: ['A', 'B'], eol: '\n' });
    expect(await lastText()).toBe('A,B\na,b\n');
  });

  it('downloads data URLs as Blobs', async () => {
    downloadDataUrl('data:text/plain;base64,aGk=', 'hi.txt');
    expect(await lastText()).toBe('hi');
    expect(cap.blobs.at(-1)!.type).toBe('text/plain');
    expect(() => downloadDataUrl('javascript:alert(1)', 'x')).toThrow(expect.objectContaining({ code: 'SVC_DOWNLOAD_INVALID_DATA_URL' }));
    expect(() => downloadDataUrl(`data:;base64,${'A'.repeat(4000)}`, 'x', { maxBytes: 100 })).toThrow(expect.objectContaining({ kind: 'limit' }));
  });
});

describe('sanitizeDownloadName', () => {
  it('strips bidi overrides, paths and reserved names', () => {
    expect(sanitizeDownloadName('invoice\u202Efdp.exe')).toBe('invoicefdp.exe');
    expect(sanitizeDownloadName('a\u2066b\u2069.txt')).toBe('ab.txt');
    expect(sanitizeDownloadName('C:\\Users\\x\\report.csv')).toBe('report.csv');
    expect(sanitizeDownloadName('CON.txt')).toBe('_CON.txt');
    expect(sanitizeDownloadName('   ')).toBe('download');
    expect(sanitizeDownloadName('a:b*c?.txt')).toBe('a_b_c_.txt');
  });

  it('limits length and keeps the extension', () => {
    const long = sanitizeDownloadName(`${'x'.repeat(500)}.xlsx`);
    expect(new TextEncoder().encode(long).length).toBeLessThanOrEqual(200);
    expect(long.endsWith('.xlsx')).toBe(true);
    expect(sanitizeDownloadName(`${'é'.repeat(300)}.pdf`, { maxLength: 50 }).endsWith('.pdf')).toBe(true);
  });
});

describe('object URL registry', () => {
  it('revokes once and revokeAll releases the rest', () => {
    const a = createObjectUrl(new Blob(['a']));
    const b = createObjectUrl(new Blob(['b']));
    a.revoke();
    a.revoke();
    expect(cap.revoked).toEqual([a.url]);
    revokeAll();
    expect(cap.revoked).toEqual([a.url, b.url]);
    b.revoke();
    expect(cap.revoked).toHaveLength(2);
  });
});

function responseOf(chunks: readonly string[], init: ResponseInit & { url?: string } = {}): Response {
  const enc = new TextEncoder();
  let i = 0;
  const body = new ReadableStream<Uint8Array>({
    pull(c) {
      if (i < chunks.length) c.enqueue(enc.encode(chunks[i++]));
      else c.close();
    },
  });
  const r = new Response(body, init);
  if (init.url !== undefined) Object.defineProperty(r, 'url', { value: init.url });
  return r;
}

describe('downloadUrl', () => {
  it('streams with progress and names the file from Content-Disposition', async () => {
    const fetchFn = vi.fn<(url: RequestInfo | URL, init?: RequestInit) => Promise<Response>>(() =>
      Promise.resolve(responseOf(['hello ', 'world'], { headers: { 'content-length': '11', 'content-type': 'text/plain; charset=utf-8', 'content-disposition': `attachment; filename="x.txt"; filename*=UTF-8''r%C3%A9sum%C3%A9%E2%80%AE.pdf` } })),
    );
    const progress: (number | undefined)[] = [];
    const status = await downloadUrl('/files/42', { fetch: fetchFn, onProgress: (p) => progress.push(p.percent) });
    expect(status).toMatchObject({ ok: true, method: 'anchor', fileName: 'résumé.pdf', bytes: 11 });
    expect(progress).toEqual([(6 / 11) * 100, 100]);
    expect(await lastText()).toBe('hello world');
    expect(cap.blobs.at(-1)!.type).toBe('text/plain');
    const [calledUrl, init] = fetchFn.mock.calls[0]!;
    expect(calledUrl).toBe(new URL('/files/42', location.href).href);
    expect(init?.credentials).toBe('same-origin');
  });

  it('falls back to the URL name, then "download"', async () => {
    const fetchFn = (): Promise<Response> => Promise.resolve(responseOf(['x']));
    expect((await downloadUrl('/a/b/report%202026.csv?v=1', { fetch: fetchFn })).fileName).toBe('report 2026.csv');
    expect((await downloadUrl('/a/b/', { fetch: fetchFn })).fileName).toBe('download');
    expect((await downloadUrl('/a/b/', { fetch: fetchFn, fileName: 'mine.txt' })).fileName).toBe('mine.txt');
  });

  it('refuses unsafe and cross-origin URLs', async () => {
    const fetchFn = vi.fn(() => Promise.resolve(responseOf(['x'])));
    await expect(downloadUrl('javascript:alert(1)', { fetch: fetchFn })).rejects.toMatchObject({ code: 'SVC_DOWNLOAD_UNSAFE_URL' });
    await expect(downloadUrl('data:text/plain,hi', { fetch: fetchFn })).rejects.toMatchObject({ code: 'SVC_DOWNLOAD_UNSAFE_URL' });
    await expect(downloadUrl('https://other.example/file.txt', { fetch: fetchFn })).rejects.toMatchObject({ code: 'SVC_DOWNLOAD_CROSS_ORIGIN' });
    expect(fetchFn).not.toHaveBeenCalled();
    expect((await downloadUrl('https://other.example/file.txt', { fetch: fetchFn, allowCrossOrigin: true })).ok).toBe(true);
  });

  it('reports HTTP errors, network errors, aborts and size limits as statuses', async () => {
    const notFound = await downloadUrl('/missing.txt', { fetch: () => Promise.resolve(new Response('nope', { status: 404, statusText: 'Not Found' })) });
    expect(notFound).toMatchObject({ ok: false, reason: 'error', fileName: 'missing.txt' });
    expect(notFound.error).toMatchObject({ name: 'HttpError', status: 404, code: 'SVC_DOWNLOAD_HTTP' });
    const offline = await downloadUrl('/a.txt', { fetch: () => Promise.reject(new TypeError('Failed to fetch')) });
    expect(offline).toMatchObject({ ok: false, reason: 'error' });
    const ac = new AbortController();
    const aborted = await downloadUrl('/a.txt', {
      signal: ac.signal,
      fetch: () => {
        ac.abort();
        return Promise.reject(new DOMException('aborted', 'AbortError'));
      },
    });
    expect(aborted).toMatchObject({ ok: false, reason: 'aborted' });
    const tooBig = await downloadUrl('/a.txt', { maxBytes: 3, fetch: () => Promise.resolve(responseOf(['12', '34'])) });
    expect(tooBig.error).toMatchObject({ code: 'SVC_DOWNLOAD_TOO_LARGE' });
    const declared = await downloadUrl('/a.txt', { maxBytes: 3, fetch: () => Promise.resolve(responseOf(['1234'], { headers: { 'content-length': '4' } })) });
    expect(declared.error).toMatchObject({ code: 'SVC_DOWNLOAD_TOO_LARGE' });
    expect(cap.anchors).toHaveLength(0);
  });
});

describe('saveWithPicker', () => {
  function stubPicker(behaviour: 'ok' | 'cancel' | 'security'): { written: Uint8Array[]; options: unknown[] } {
    const written: Uint8Array[] = [];
    const options: unknown[] = [];
    vi.stubGlobal('showSaveFilePicker', (o: unknown) => {
      options.push(o);
      if (behaviour === 'cancel') return Promise.reject(new DOMException('The user aborted a request.', 'AbortError'));
      if (behaviour === 'security') return Promise.reject(new DOMException('Must be handling a user gesture.', 'SecurityError'));
      return Promise.resolve({ createWritable: () => Promise.resolve(new WritableStream<Uint8Array>({ write(c) { written.push(c); } })) });
    });
    return { written, options };
  }

  it('streams into the chosen file', async () => {
    const { written, options } = stubPicker('ok');
    const status = await saveWithPicker(new Blob(['a,b\n'], { type: 'text/csv' }), { suggestedName: 'data.csv' });
    expect(status).toEqual({ ok: true, method: 'picker', fileName: 'data.csv', bytes: 4 });
    expect(new TextDecoder().decode(written[0])).toBe('a,b\n');
    expect(options[0]).toEqual({ suggestedName: 'data.csv', types: [{ accept: { 'text/csv': ['.csv'] } }] });
    expect(cap.anchors).toHaveLength(0);
  });

  it('opens the picker before producing lazy sources', async () => {
    const { written } = stubPicker('ok');
    const order: string[] = [];
    vi.stubGlobal('showSaveFilePicker', () => {
      order.push('picker');
      return Promise.resolve({ createWritable: () => Promise.resolve(new WritableStream<Uint8Array>({ write(c) { written.push(c); } })) });
    });
    const status = await saveWithPicker(
      () => {
        order.push('source');
        return Promise.resolve(new Blob(['lazy']).stream());
      },
      { suggestedName: 'lazy.txt' },
    );
    expect(order).toEqual(['picker', 'source']);
    expect(status.bytes).toBe(4);
  });

  it('resolves cancellation without throwing', async () => {
    stubPicker('cancel');
    const status = await saveWithPicker(new Blob(['x']), { suggestedName: 'x.txt' });
    expect(status).toEqual({ ok: false, method: 'picker', fileName: 'x.txt', cancelled: true, reason: 'cancelled' });
    expect(describeDownloadStatus(status)).toBe('Download cancelled.');
  });

  it('falls back to an anchor when the picker is blocked or missing', async () => {
    stubPicker('security');
    expect((await saveWithPicker(new Blob(['x']), { suggestedName: 'x.txt' })).method).toBe('anchor');
    vi.unstubAllGlobals();
    const s = await saveWithPicker(new Blob(['stream']).stream(), { suggestedName: 's.txt' });
    expect(s).toMatchObject({ ok: true, method: 'anchor' });
    expect(await lastText()).toBe('stream');
    expect(await saveWithPicker(new Blob(['x']), { suggestedName: 'x.txt', fallback: false })).toMatchObject({ ok: false, reason: 'unsupported' });
  });
});

describe('createDownloadQueue', () => {
  it('limits concurrency and spaces starts', async () => {
    const queue = createDownloadQueue({ concurrency: 1, delayMs: 30 });
    const starts: number[] = [];
    const task = (name: string) => async (): Promise<DownloadStatus> => {
      starts.push(performance.now());
      await tick(1);
      return { ok: true, method: 'anchor', fileName: name };
    };
    const results = await Promise.all([queue.add(task('a')), queue.add(task('b')), queue.add(task('c'))]);
    expect(results.map((r) => r.fileName)).toEqual(['a', 'b', 'c']);
    expect(starts[1]! - starts[0]!).toBeGreaterThanOrEqual(25);
    expect(starts[2]! - starts[1]!).toBeGreaterThanOrEqual(25);
    await queue.onIdle();
    expect(queue.running).toBe(0);
  });

  it('turns rejections into failed statuses and clears pending tasks', async () => {
    const queue = createDownloadQueue({ delayMs: 0 });
    const failed = queue.add(() => Promise.reject(new Error('x')), 'bad.txt');
    const dropped = queue.add(() => ({ ok: true, method: 'anchor', fileName: 'never' }), 'dropped.txt');
    expect(queue.pending).toBe(1);
    queue.clear();
    expect(await dropped).toMatchObject({ ok: false, reason: 'aborted', fileName: 'dropped.txt' });
    expect(await failed).toMatchObject({ ok: false, reason: 'error', fileName: 'bad.txt' });
    await queue.onIdle();
  });
});

describe('describeDownloadStatus', () => {
  it('describes each outcome', () => {
    expect(describeDownloadStatus({ ok: true, method: 'anchor', fileName: 'report.csv' })).toBe('Download started: report.csv');
    expect(describeDownloadStatus({ ok: true, method: 'picker', fileName: 'report.csv' })).toBe('Saved: report.csv');
    expect(describeDownloadStatus({ ok: false, method: 'none', fileName: 'a', reason: 'unsupported' })).toBe('Downloads are not supported in this browser.');
    expect(describeDownloadStatus({ ok: false, method: 'none', fileName: 'a.pdf', reason: 'error' })).toBe('Download failed: a.pdf. Try again.');
    expect(describeDownloadStatus({ ok: false, method: 'none', fileName: 'a.pdf', reason: 'aborted' })).toBe('Download stopped: a.pdf');
    expect(describeDownloadStatus({ ok: true, method: 'anchor', fileName: 'r.csv' }, { labels: { started: 'Téléchargement : {fileName}' } })).toBe('Téléchargement : r.csv');
  });
});
