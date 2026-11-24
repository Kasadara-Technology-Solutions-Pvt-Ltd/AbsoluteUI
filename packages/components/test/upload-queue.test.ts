import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { UploadQueue, type UploadContext, type UploadQueueChangeDetail, type UploadQueueCompleteDetail, type UploadQueueOptions } from '@absoluteui/components/upload-queue';

afterEach(() => {
  resetAbsoluteUIConfig();
  vi.useRealTimers();
  document.body.replaceChildren();
});

interface Call {
  file: File;
  ctx: UploadContext;
  resolve: (value: unknown) => void;
  reject: (error: unknown) => void;
}

/** A controllable transport: every attempt is recorded and settled by the test. */
function transport(): { calls: Call[]; upload: UploadQueueOptions['upload'] } {
  const calls: Call[] = [];
  return {
    calls,
    upload: (file, ctx) =>
      new Promise((resolve, reject) => {
        calls.push({ file, ctx, resolve, reject });
      }),
  };
}

function mount(options: Partial<UploadQueueOptions> = {}): UploadQueue {
  const host = document.createElement('div');
  document.body.append(host);
  return UploadQueue.create(host, { label: 'Uploads', upload: transport().upload, ...options });
}

const file = (name: string, size = 100, type = 'text/plain'): File => new File([new Uint8Array(size)], name, { type });
const flush = (): Promise<void> => new Promise((r) => setTimeout(r, 0));
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { r(); })));
const statuses = (q: UploadQueue): string[] => q.items.map((i) => i.status);
const liveText = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';

describe('UploadQueue: rendering', () => {
  it('renders a labelled list with a progress bar per file and an empty state', () => {
    const q = mount();
    const label = q.host.querySelector('.aui-upload-queue__label')!;
    expect(q.list.getAttribute('aria-labelledby')).toBe(label.id);
    expect(q.host.querySelector('.aui-upload-queue__summary')!.textContent).toBe('No files in the queue.');
    q.add([file('report.pdf', 2_000_000)]);
    const bar = q.list.querySelector('[role="progressbar"]')!;
    expect(document.getElementById(bar.getAttribute('aria-labelledby')!)!.textContent).toBe('report.pdf');
    expect(document.getElementById(bar.getAttribute('aria-describedby')!)!.textContent).toBe('2 MB | Uploading');
    expect(q.host.querySelector('.aui-upload-queue__summary')!.textContent).toBe('0 of 1 uploaded');
  });

  it('validates options before rendering', () => {
    const host = document.createElement('div');
    expect(() => UploadQueue.create(host, { label: '', upload: transport().upload })).toThrow(AbsoluteUIError);
    // @ts-expect-error runtime validation of a missing transport
    expect(() => UploadQueue.create(host, { label: 'x' })).toThrow(/upload/);
    expect(() => UploadQueue.create(host, { label: 'x', upload: transport().upload, concurrency: 0 })).toThrow(/concurrency/);
    expect(host.childElementCount).toBe(0);
  });

  it('never renders file names as HTML', () => {
    const q = mount();
    q.add([file('<b>x</b>.txt')]);
    expect(q.list.querySelector('b')).toBeNull();
    expect(q.list.textContent).toContain('<b>x</b>.txt');
  });
});

describe('UploadQueue: transport contract', () => {
  it('respects the concurrency limit and starts the next item when one settles', async () => {
    const t = transport();
    const q = mount({ upload: t.upload, concurrency: 2 });
    q.add([file('a'), file('b'), file('c')]);
    expect(t.calls.map((c) => c.file.name)).toEqual(['a', 'b']);
    expect(statuses(q)).toEqual(['uploading', 'uploading', 'queued']);
    t.calls[0]!.resolve({ id: 'server-1' });
    await flush();
    expect(t.calls.map((c) => c.file.name)).toEqual(['a', 'b', 'c']);
    expect(q.items[0]).toMatchObject({ status: 'done', response: { id: 'server-1' }, attempts: 1 });
  });

  it('reports progress (chunk-friendly: total defaults to the file size) and coalesces renders per frame', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    q.add([file('big.bin', 1000)]);
    const ctx = t.calls[0]!.ctx;
    expect(ctx.attempt).toBe(1);
    expect(ctx.id).toBe(q.items[0]!.id);
    for (let loaded = 100; loaded <= 500; loaded += 100) ctx.onProgress(loaded);
    expect(q.items[0]).toMatchObject({ loaded: 500, total: 1000 });
    await frame();
    expect(q.list.querySelector('[role="progressbar"]')!.getAttribute('aria-valuenow')).toBe('50');
    ctx.onProgress(Number.NaN);
    ctx.onProgress(5000);
    expect(q.items[0]!.loaded).toBe(1000);
  });

  it('cancel aborts the signal, marks the item cancelled, and ignores the late result', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    q.add([file('a')]);
    const { ctx, resolve } = t.calls[0]!;
    q.cancel(q.items[0]!.id);
    expect(ctx.signal.aborted).toBe(true);
    expect(statuses(q)).toEqual(['cancelled']);
    resolve('late');
    await flush();
    expect(q.items[0]).toMatchObject({ status: 'cancelled', response: undefined });
    await frame();
    expect(liveText()).toBe('Upload of a cancelled.');
  });

  it('shows a generic error by default (raw errors are never displayed) and maps errors on request', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    q.add([file('a')]);
    t.calls[0]!.reject(new Error('SQL error at db-7.internal'));
    await flush();
    expect(q.items[0]).toMatchObject({ status: 'failed', error: 'The upload did not complete.' });
    await frame();
    expect(q.list.textContent).not.toContain('db-7');
    expect(q.list.querySelector('[data-status="failed"]')).not.toBeNull();
    expect(liveText()).toBe('a failed to upload.');
    q.update({ errorMessage: (error) => (error instanceof TypeError ? 'You are offline.' : null) });
    q.retry(q.items[0]!.id);
    t.calls[1]!.reject(new TypeError('Failed to fetch'));
    await flush();
    expect(q.items[0]).toMatchObject({ status: 'failed', error: 'You are offline.', attempts: 2 });
  });

  it('treats a synchronous throw from upload() as a failure', async () => {
    const q = mount({
      upload: () => {
        throw new Error('boom');
      },
    });
    q.add([file('a')]);
    await flush();
    expect(statuses(q)).toEqual(['failed']);
  });

  it('retries automatically with exponential backoff, and abort stops a pending retry', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const t = transport();
    const q = mount({ upload: t.upload, retries: 2, retryDelay: 1000 });
    q.add([file('a')]);
    t.calls[0]!.reject(new Error('503'));
    await vi.advanceTimersByTimeAsync(999);
    expect(t.calls).toHaveLength(1);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(2);
    expect(t.calls[1]!.ctx.attempt).toBe(2);
    t.calls[1]!.reject(new Error('503'));
    await vi.advanceTimersByTimeAsync(1999);
    expect(t.calls).toHaveLength(2);
    await vi.advanceTimersByTimeAsync(1);
    expect(t.calls).toHaveLength(3);
    t.calls[2]!.reject(new Error('503'));
    await vi.advanceTimersByTimeAsync(0);
    expect(q.items[0]).toMatchObject({ status: 'failed', attempts: 3 });

    q.retry(q.items[0]!.id);
    t.calls[3]!.reject(new Error('503'));
    await vi.advanceTimersByTimeAsync(0);
    q.cancel(q.items[0]!.id);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(t.calls).toHaveLength(4);
    expect(statuses(q)).toEqual(['cancelled']);
  });

  it('autoStart: false waits for start()', () => {
    const t = transport();
    const q = mount({ upload: t.upload, autoStart: false });
    q.add([file('a')]);
    expect(t.calls).toHaveLength(0);
    q.start();
    expect(t.calls).toHaveLength(1);
  });

  it('emits aui-change (bubbling) for each transition and aui-complete (not bubbling) once per batch', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    const reasons: string[] = [];
    const complete: UploadQueueCompleteDetail[] = [];
    document.body.addEventListener('aui-change', (e) => reasons.push((e as CustomEvent<UploadQueueChangeDetail>).detail.reason));
    document.body.addEventListener('aui-complete', () => complete.push({ succeeded: -1, failed: -1, cancelled: -1 }));
    q.host.addEventListener('aui-complete', (e) => complete.push((e as CustomEvent<UploadQueueCompleteDetail>).detail));
    q.add([file('a'), file('b')]);
    t.calls[0]!.resolve(null);
    t.calls[1]!.reject(new Error('x'));
    await flush();
    expect(reasons).toEqual(['added', 'started', 'started', 'succeeded', 'failed']);
    expect(complete).toEqual([{ succeeded: 1, failed: 1, cancelled: 0 }]);
    await frame();
    expect(liveText()).toBe('Uploads finished: 1 uploaded, 1 failed, 0 cancelled.');
  });
});

describe('UploadQueue: actions and focus', () => {
  it('row actions are labelled per file; focus stays in the row when the focused action is replaced', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    q.add([file('a.txt')]);
    const row = q.list.querySelector('li')!;
    const cancel = row.querySelector<HTMLButtonElement>('.aui-upload-queue__cancel')!;
    expect(cancel.getAttribute('aria-label')).toBe('Cancel upload of a.txt');
    expect(row.querySelector<HTMLButtonElement>('.aui-upload-queue__remove')!.hidden).toBe(true);
    await userEvent.click(cancel);
    const retry = row.querySelector<HTMLButtonElement>('.aui-upload-queue__retry')!;
    expect(retry.hidden).toBe(false);
    expect(retry.getAttribute('aria-label')).toBe('Retry upload of a.txt');
    expect(document.activeElement).toBe(retry);
    await userEvent.keyboard('{Enter}');
    expect(statuses(q)).toEqual(['uploading']);
    expect(document.activeElement).toBe(row.querySelector('.aui-upload-queue__cancel'));
  });

  it('remove aborts, deletes the row, and moves focus to the next row or the list', async () => {
    const t = transport();
    const q = mount({ upload: t.upload, concurrency: 1 });
    q.add([file('a'), file('b')]);
    t.calls[0]!.resolve(null);
    await flush();
    const firstRemove = q.list.querySelector<HTMLButtonElement>('li .aui-upload-queue__remove')!;
    await userEvent.click(firstRemove);
    expect(q.items.map((i) => i.file.name)).toEqual(['b']);
    expect(document.activeElement).toBe(q.list.querySelector('li .aui-upload-queue__cancel'));
    q.remove(q.items[0]!.id);
    expect(t.calls[1]!.ctx.signal.aborted).toBe(true);
    expect(q.list.hidden).toBe(true);
  });
});

describe('UploadQueue: previews and cleanup', () => {
  it('creates object URLs for image previews and revokes them on remove and destroy', () => {
    const created: string[] = [];
    const revoked: string[] = [];
    const create = vi.spyOn(URL, 'createObjectURL').mockImplementation(() => {
      const url = `blob:test/${String(created.length)}`;
      created.push(url);
      return url;
    });
    const revoke = vi.spyOn(URL, 'revokeObjectURL').mockImplementation((url) => {
      revoked.push(url);
    });
    try {
      const t = transport();
      const q = mount({ upload: t.upload, preview: true });
      q.add([file('photo.png', 10, 'image/png'), file('doc.txt'), file('pic.jpg', 10, 'image/jpeg')]);
      expect(created).toEqual(['blob:test/0', 'blob:test/1']);
      const img = q.list.querySelector('img')!;
      expect(img.alt).toBe('');
      expect(img.getAttribute('src')).toBe('blob:test/0');
      q.remove(q.items[0]!.id);
      expect(revoked).toEqual(['blob:test/0']);
      q.destroy();
      expect(revoked).toEqual(['blob:test/0', 'blob:test/1']);
      expect(t.calls.every((c) => c.ctx.signal.aborted)).toBe(true);
      expect(q.host.childElementCount).toBe(0);
    } finally {
      create.mockRestore();
      revoke.mockRestore();
    }
  });

  it('results that arrive after destroy are ignored', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    q.add([file('a')]);
    q.destroy();
    t.calls[0]!.resolve('late');
    await flush();
    expect(q.items).toEqual([]);
    expect(q.add([file('b')])).toEqual([]);
  });

  it('clearCompleted removes only finished items', async () => {
    const t = transport();
    const q = mount({ upload: t.upload });
    q.add([file('a'), file('b')]);
    t.calls[0]!.resolve(null);
    await flush();
    q.clearCompleted();
    expect(q.items.map((i) => i.file.name)).toEqual(['b']);
  });
});
