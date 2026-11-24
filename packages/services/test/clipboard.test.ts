import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { copyBlob, copyRich, copyText, describeCopyStatus, readItems, readText } from '@absoluteui/services/clipboard';

type Stub = Partial<Record<'writeText' | 'write' | 'readText' | 'read', (...args: never[]) => Promise<unknown>>>;

const original = Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard');
function stubClipboard(stub: Stub | undefined): void {
  Object.defineProperty(navigator, 'clipboard', { value: stub, configurable: true });
}
const domError = (name: string): DOMException => new DOMException('x', name);

/** Mocks execCommand('copy') by dispatching a real copy event and capturing what the fallback sets. */
function mockExecCommand(result = true): { captured: Record<string, string>; calls: () => number } {
  const captured: Record<string, string> = {};
  const spy = vi.spyOn(document, 'execCommand').mockImplementation(() => {
    const dt = new DataTransfer();
    document.dispatchEvent(new ClipboardEvent('copy', { clipboardData: dt, cancelable: true }));
    for (const t of dt.types) captured[t] = dt.getData(t);
    captured.selection = document.getSelection()?.toString() ?? '';
    return result;
  });
  return { captured, calls: () => spy.mock.calls.length };
}

beforeEach(() => {
  document.body.replaceChildren();
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  // Remove the own-property stub so the prototype getter is used again.
  delete (navigator as unknown as Record<string, unknown>).clipboard;
  if (original) expect(Object.getOwnPropertyDescriptor(Navigator.prototype, 'clipboard')).toBeDefined();
});

describe('copyText', () => {
  it('uses the async Clipboard API in secure contexts', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    const { calls } = mockExecCommand();
    expect(await copyText('secret-token')).toEqual({ ok: true, method: 'clipboard-api' });
    expect(writeText).toHaveBeenCalledWith('secret-token');
    expect(calls()).toBe(0);
  });

  it('falls back to execCommand without moving focus or losing the selection', async () => {
    stubClipboard({ writeText: () => Promise.reject(domError('NotAllowedError')) });
    const input = document.createElement('input');
    input.value = 'hello world';
    const para = document.createElement('p');
    para.textContent = 'page text';
    document.body.append(input, para);
    input.focus();
    input.setSelectionRange(2, 5);
    const { captured } = mockExecCommand();
    const status = await copyText('line 1\nline 2');
    expect(status).toEqual({ ok: true, method: 'exec-command' });
    expect(captured['text/plain']).toBe('line 1\nline 2');
    expect(captured.selection).toBe('line 1\nline 2');
    expect(document.activeElement).toBe(input);
    expect([input.selectionStart, input.selectionEnd]).toEqual([2, 5]);
    expect(document.body.children).toHaveLength(2);
  });

  it('restores a document selection', async () => {
    vi.stubGlobal('isSecureContext', false);
    const para = document.createElement('p');
    para.textContent = 'keep me selected';
    document.body.append(para);
    const range = document.createRange();
    range.selectNodeContents(para);
    document.getSelection()!.removeAllRanges();
    document.getSelection()!.addRange(range);
    mockExecCommand();
    expect((await copyText('x')).ok).toBe(true);
    expect(document.getSelection()!.toString()).toBe('keep me selected');
  });

  it('reports the failure reason when every path fails', async () => {
    stubClipboard({ writeText: () => Promise.reject(domError('NotAllowedError')) });
    mockExecCommand(false);
    expect(await copyText('x')).toEqual({ ok: false, method: 'exec-command', reason: 'denied' });
    stubClipboard(undefined);
    expect(await copyText('x')).toEqual({ ok: false, method: 'exec-command', reason: 'error' });
  });

  it('skips the Clipboard API in insecure contexts', async () => {
    const writeText = vi.fn(() => Promise.resolve());
    stubClipboard({ writeText });
    vi.stubGlobal('isSecureContext', false);
    mockExecCommand();
    expect((await copyText('x')).method).toBe('exec-command');
    expect(writeText).not.toHaveBeenCalled();
  });

  it('never logs clipboard contents', async () => {
    const log = vi.spyOn(console, 'log');
    const error = vi.spyOn(console, 'error');
    stubClipboard({ writeText: () => Promise.reject(new Error('boom')) });
    mockExecCommand(false);
    await copyText('p@ssw0rd');
    expect(log).not.toHaveBeenCalled();
    expect(error).not.toHaveBeenCalled();
  });
});

describe('copyRich and copyBlob', () => {
  it('writes a ClipboardItem with each type', async () => {
    const write = vi.fn<(items: ClipboardItem[]) => Promise<void>>(() => Promise.resolve());
    stubClipboard({ write });
    expect(await copyRich({ 'text/plain': 'Total: 42', 'text/html': '<b>Total:</b> 42' })).toEqual({ ok: true, method: 'clipboard-api' });
    const item = write.mock.calls[0]![0][0]!;
    expect([...item.types].sort()).toEqual(['text/html', 'text/plain']);
    expect(await (await item.getType('text/html')).text()).toBe('<b>Total:</b> 42');
  });

  it('falls back to a copy event carrying every type', async () => {
    stubClipboard(undefined);
    const { captured } = mockExecCommand();
    expect((await copyRich({ 'text/plain': 'a', 'text/html': '<i>a</i>' })).ok).toBe(true);
    expect(captured).toMatchObject({ 'text/plain': 'a', 'text/html': '<i>a</i>' });
  });

  it('reports empty payloads', async () => {
    expect(await copyRich({})).toEqual({ ok: false, method: 'none', reason: 'empty' });
  });

  it('copies images and reports unsupported environments', async () => {
    const write = vi.fn(() => Promise.resolve());
    stubClipboard({ write });
    const png = new Blob([new Uint8Array([137, 80, 78, 71])], { type: 'image/png' });
    expect(await copyBlob(png)).toEqual({ ok: true, method: 'clipboard-api' });
    stubClipboard({ write: () => Promise.reject(domError('NotAllowedError')) });
    expect(await copyBlob(png)).toEqual({ ok: false, method: 'clipboard-api', reason: 'denied' });
    stubClipboard(undefined);
    expect(await copyBlob(png)).toEqual({ ok: false, method: 'none', reason: 'unsupported' });
  });
});

describe('readText and readItems', () => {
  it('returns text, empty, denied and unsupported results', async () => {
    stubClipboard({ readText: () => Promise.resolve('pasted') });
    expect(await readText()).toEqual({ ok: true, text: 'pasted' });
    stubClipboard({ readText: () => Promise.resolve('') });
    expect(await readText()).toEqual({ ok: false, reason: 'empty' });
    stubClipboard({ readText: () => Promise.reject(domError('NotAllowedError')) });
    expect(await readText()).toEqual({ ok: false, reason: 'denied' });
    stubClipboard(undefined);
    expect(await readText()).toEqual({ ok: false, reason: 'unsupported' });
  });

  it('does not prompt when the permission is already denied', async () => {
    const read = vi.fn(() => Promise.resolve('x'));
    stubClipboard({ readText: read });
    vi.spyOn(navigator.permissions, 'query').mockResolvedValue({ state: 'denied' } as PermissionStatus);
    expect(await readText()).toEqual({ ok: false, reason: 'denied' });
    expect(read).not.toHaveBeenCalled();
  });

  it('reads items', async () => {
    const item = new ClipboardItem({ 'text/plain': new Blob(['a'], { type: 'text/plain' }) });
    stubClipboard({ read: () => Promise.resolve([item]) });
    const r = await readItems();
    expect(r.ok && r.items[0]).toBe(item);
    stubClipboard({ read: () => Promise.resolve([]) });
    expect(await readItems()).toEqual({ ok: false, reason: 'empty' });
  });
});

describe('describeCopyStatus', () => {
  it('produces live-region text with a platform shortcut', () => {
    expect(describeCopyStatus({ ok: true, method: 'clipboard-api' })).toBe('Copied to clipboard');
    expect(describeCopyStatus({ ok: false, method: 'none', reason: 'unsupported' }, { shortcut: 'Ctrl+C' })).toBe('Copy failed. Select the text and press Ctrl+C.');
    expect(describeCopyStatus({ ok: false, method: 'none', reason: 'error' }, { shortcut: 'Command+C' })).toContain('Command+C');
    expect(describeCopyStatus({ ok: false, method: 'none', reason: 'denied' })).toMatch(/^Clipboard access is blocked/);
    expect(describeCopyStatus({ ok: true, method: 'exec-command' }, { labels: { copied: 'Copié' } })).toBe('Copié');
  });
});
