/**
 * Clipboard: copy and read text, rich content and images, with an isolated fallback for
 * insecure contexts (docs/PLAN-HELPERS.md section 3, section 6). Every function returns a status object the UI
 * announces through a live region; nothing moves focus, and clipboard contents are never logged.
 */

/** How the operation was performed. */
export type ClipboardMethod = 'clipboard-api' | 'exec-command' | 'none';

/** Why an operation failed. */
export type ClipboardFailureReason = 'denied' | 'unsupported' | 'empty' | 'error';

/** Result of a copy. */
export interface CopyStatus {
  readonly ok: boolean;
  readonly method: ClipboardMethod;
  readonly reason?: ClipboardFailureReason;
}

/** Result of `readText`. */
export type ReadTextResult = { readonly ok: true; readonly text: string } | { readonly ok: false; readonly reason: ClipboardFailureReason };

/** Result of `readItems`. */
export type ReadItemsResult = { readonly ok: true; readonly items: readonly ClipboardItem[] } | { readonly ok: false; readonly reason: ClipboardFailureReason };

/** Rich clipboard payload keyed by MIME type. */
export interface RichClipboardData {
  readonly 'text/plain'?: string;
  /** Caller-provided HTML. Sanitize it first (for example with `@absoluteui/core` `sanitizeHtml`); it is not sanitized here. */
  readonly 'text/html'?: string;
}

interface Env {
  readonly clipboard: Clipboard | undefined;
  readonly secure: boolean;
  readonly document: Document | undefined;
}

// Resolved lazily on every call: importing this module never touches globals (SSR safe).
function env(): Env {
  const nav = typeof navigator === 'undefined' ? undefined : navigator;
  const clipboard: Clipboard | undefined = nav?.clipboard;
  return {
    clipboard,
    secure: typeof isSecureContext === 'boolean' ? isSecureContext : false,
    document: typeof document === 'undefined' ? undefined : document,
  };
}

const status = (ok: boolean, method: ClipboardMethod, reason?: ClipboardFailureReason): CopyStatus => (reason === undefined ? { ok, method } : { ok, method, reason });

const isNamed = (e: unknown, name: string): boolean => typeof e === 'object' && e !== null && (e as { name?: unknown }).name === name;

const failureReason = (e: unknown): ClipboardFailureReason => (isNamed(e, 'NotAllowedError') || isNamed(e, 'SecurityError') ? 'denied' : isNamed(e, 'NotSupportedError') || isNamed(e, 'DataError') ? 'unsupported' : 'error');

/**
 * Copies through a `copy` event on an off-screen, `aria-hidden` element selected with a DOM
 * range (no focus change), then restores the previous selection and focus.
 */
function execCommandCopy(doc: Document, data: RichClipboardData): boolean {
  const body = doc.body as HTMLElement | null;
  if (body === null) return false;
  const active = doc.activeElement instanceof HTMLElement ? doc.activeElement : null;
  const field = active instanceof HTMLInputElement || active instanceof HTMLTextAreaElement ? active : null;
  let fieldSel: { start: number | null; end: number | null; dir: 'forward' | 'backward' | 'none' | null } | undefined;
  try {
    if (field) fieldSel = { start: field.selectionStart, end: field.selectionEnd, dir: field.selectionDirection };
  } catch {
    fieldSel = undefined; // input types without selection support
  }
  const selection = doc.getSelection();
  const saved: Range[] = [];
  if (selection) for (let i = 0; i < selection.rangeCount; i++) saved.push(selection.getRangeAt(i).cloneRange());

  const holder = doc.createElement('span');
  holder.textContent = data['text/plain'] ?? '';
  holder.setAttribute('aria-hidden', 'true');
  const s = holder.style;
  s.setProperty('position', 'fixed');
  s.setProperty('top', '0');
  s.setProperty('clip', 'rect(0, 0, 0, 0)');
  s.setProperty('white-space', 'pre');
  s.setProperty('user-select', 'text');
  s.setProperty('-webkit-user-select', 'text');
  s.setProperty('opacity', '0');
  s.setProperty('pointer-events', 'none');

  const onCopy = (event: ClipboardEvent): void => {
    if (!event.clipboardData) return;
    event.preventDefault();
    event.stopImmediatePropagation();
    event.clipboardData.clearData();
    for (const [type, value] of Object.entries(data)) if (typeof value === 'string') event.clipboardData.setData(type, value);
  };
  doc.addEventListener('copy', onCopy, true);
  body.appendChild(holder);
  let ok: boolean;
  try {
    if (selection) {
      const range = doc.createRange();
      range.selectNodeContents(holder);
      selection.removeAllRanges();
      selection.addRange(range);
    }
    // eslint-disable-next-line @typescript-eslint/no-deprecated -- the only copy path outside secure contexts.
    ok = doc.execCommand('copy');
  } catch {
    ok = false;
  } finally {
    doc.removeEventListener('copy', onCopy, true);
    holder.remove();
    if (selection) {
      selection.removeAllRanges();
      for (const r of saved) selection.addRange(r);
    }
    if (active && doc.activeElement !== active && active.isConnected) active.focus({ preventScroll: true });
    if (field && fieldSel?.start != null && fieldSel.end != null) {
      try {
        field.setSelectionRange(fieldSel.start, fieldSel.end, fieldSel.dir ?? undefined);
      } catch {
        // selection unsupported for this input type
      }
    }
  }
  return ok;
}

/** Runs the `execCommand` fallback and builds the status (API failure reason wins when both fail). */
function fallback(doc: Document | undefined, data: RichClipboardData, apiReason: ClipboardFailureReason | undefined): CopyStatus {
  if (doc && execCommandCopy(doc, data)) return status(true, 'exec-command');
  if (doc) return status(false, 'exec-command', apiReason ?? 'error');
  return apiReason === undefined ? status(false, 'none', 'unsupported') : status(false, 'clipboard-api', apiReason);
}

/**
 * Copies plain text. Uses the async Clipboard API in secure contexts, else (or when it is
 * denied) an isolated `execCommand('copy')` fallback that keeps focus and selection. Call it from
 * a user gesture.
 * @example
 * const status = await copyText('https://hr.example.com/invite/7Gk2');
 * const liveRegion = document.createElement('div');
 * liveRegion.setAttribute('aria-live', 'polite');
 * liveRegion.textContent = describeCopyStatus(status);
 */
export async function copyText(text: string): Promise<CopyStatus> {
  const { clipboard, secure, document: doc } = env();
  let apiReason: ClipboardFailureReason | undefined;
  if (clipboard && secure && typeof clipboard.writeText === 'function') {
    try {
      await clipboard.writeText(text);
      return status(true, 'clipboard-api');
    } catch (e) {
      apiReason = failureReason(e);
    }
  }
  return fallback(doc, { 'text/plain': text }, apiReason);
}

/**
 * Copies rich content (for example HTML with a plain-text alternative) via `ClipboardItem`,
 * falling back to a `copy` event that sets each type. HTML must already be sanitized.
 * @example
 * await copyRich({ 'text/plain': 'Total: 42', 'text/html': '<b>Total:</b> 42' }); // sanitize any user-supplied HTML first
 */
export async function copyRich(data: RichClipboardData): Promise<CopyStatus> {
  const { clipboard, secure, document: doc } = env();
  const entries = Object.entries(data).filter((e): e is [string, string] => typeof e[1] === 'string');
  if (entries.length === 0) return status(false, 'none', 'empty');
  let apiReason: ClipboardFailureReason | undefined;
  if (clipboard && secure && typeof clipboard.write === 'function' && typeof ClipboardItem === 'function') {
    try {
      const item = new ClipboardItem(Object.fromEntries(entries.map(([type, value]) => [type, new Blob([value], { type })])));
      await clipboard.write([item]);
      return status(true, 'clipboard-api');
    } catch (e) {
      apiReason = failureReason(e);
    }
  }
  return fallback(doc, data, apiReason);
}

/**
 * Copies a binary item such as an `image/png` Blob. There is no fallback; browsers generally
 * accept only `image/png`, `text/plain` and `text/html`.
 * @example
 * const chart = document.createElement('canvas');
 * const png = await new Promise<Blob | null>((resolve) => chart.toBlob(resolve, 'image/png'));
 * if (png) await copyBlob(png);
 */
export async function copyBlob(blob: Blob): Promise<CopyStatus> {
  const { clipboard, secure } = env();
  if (!clipboard || !secure || typeof clipboard.write !== 'function' || typeof ClipboardItem !== 'function') return status(false, 'none', 'unsupported');
  const type = blob.type || 'image/png';
  const supports = (ClipboardItem as { supports?: (t: string) => boolean }).supports;
  if (typeof supports === 'function' && !supports.call(ClipboardItem, type)) return status(false, 'clipboard-api', 'unsupported');
  try {
    await clipboard.write([new ClipboardItem({ [type]: blob })]);
    return status(true, 'clipboard-api');
  } catch (e) {
    return status(false, 'clipboard-api', failureReason(e));
  }
}

/** `denied` when the Permissions API already reports the read permission as denied. */
async function readDenied(): Promise<boolean> {
  try {
    const perms = typeof navigator === 'undefined' ? undefined : (navigator.permissions as Permissions | undefined);
    if (!perms) return false;
    const s = await perms.query({ name: 'clipboard-read' as PermissionName });
    return s.state === 'denied';
  } catch {
    return false; // Firefox and Safari do not expose this permission name
  }
}

/**
 * Reads plain text. Checks the permission first so a denied permission does not prompt again.
 * @example
 * const r = await readText();
 * const input = document.createElement('input');
 * if (r.ok) input.value = r.text;
 * else console.info(r.reason === 'denied' ? 'Paste permission is blocked.' : 'Nothing to paste.');
 */
export async function readText(): Promise<ReadTextResult> {
  const { clipboard, secure } = env();
  if (!clipboard || !secure || typeof clipboard.readText !== 'function') return { ok: false, reason: 'unsupported' };
  if (await readDenied()) return { ok: false, reason: 'denied' };
  try {
    const text = await clipboard.readText();
    return text === '' ? { ok: false, reason: 'empty' } : { ok: true, text };
  } catch (e) {
    return { ok: false, reason: failureReason(e) };
  }
}

/**
 * Reads all clipboard items (text, HTML, images). Use `item.types` and `item.getType(type)`.
 * @example
 * const r = await readItems();
 * const img = document.createElement('img');
 * if (r.ok) for (const item of r.items) if (item.types.includes('image/png')) img.src = URL.createObjectURL(await item.getType('image/png'));
 */
export async function readItems(): Promise<ReadItemsResult> {
  const { clipboard, secure } = env();
  if (!clipboard || !secure || typeof clipboard.read !== 'function') return { ok: false, reason: 'unsupported' };
  if (await readDenied()) return { ok: false, reason: 'denied' };
  try {
    const items = await clipboard.read();
    return items.length === 0 ? { ok: false, reason: 'empty' } : { ok: true, items };
  } catch (e) {
    return { ok: false, reason: failureReason(e) };
  }
}

/** Live-region messages; override for localization. */
export interface CopyStatusLabels {
  readonly copied: string;
  /** `{shortcut}` is replaced by `Ctrl+C` or `Command+C`. */
  readonly failed: string;
  readonly denied: string;
  readonly empty: string;
}

export const DEFAULT_COPY_LABELS: CopyStatusLabels = Object.freeze({
  copied: 'Copied to clipboard',
  failed: 'Copy failed. Select the text and press {shortcut}.',
  denied: 'Clipboard access is blocked. Select the text and press {shortcut}.',
  empty: 'Nothing to copy.',
});

function isApple(): boolean {
  if (typeof navigator === 'undefined') return false;
  const uaData = (navigator as { userAgentData?: { platform?: string } }).userAgentData;
  const platform = uaData?.platform ?? navigator.userAgent;
  return /mac|iphone|ipad|ipod/i.test(platform);
}

export interface DescribeCopyStatusOptions {
  readonly labels?: Partial<CopyStatusLabels>;
  /** Keyboard shortcut in failure messages. Default `Command+C` on Apple platforms, else `Ctrl+C`. */
  readonly shortcut?: string;
}

/**
 * Text for a live region describing a copy status.
 * @example
 * describeCopyStatus({ ok: true, method: 'clipboard-api' }); // => 'Copied to clipboard'
 * describeCopyStatus({ ok: false, method: 'none', reason: 'unsupported' }, { shortcut: 'Ctrl+C' }); // => 'Copy failed. Select the text and press Ctrl+C.'
 * describeCopyStatus({ ok: false, method: 'none', reason: 'unsupported' }); // e.g. '… press Command+C.' on Apple platforms
 */
export function describeCopyStatus(value: CopyStatus, options: DescribeCopyStatusOptions = {}): string {
  const labels = { ...DEFAULT_COPY_LABELS, ...options.labels };
  const shortcut = options.shortcut ?? (isApple() ? 'Command+C' : 'Ctrl+C');
  const text = value.ok ? labels.copied : value.reason === 'denied' ? labels.denied : value.reason === 'empty' ? labels.empty : labels.failed;
  return text.replaceAll('{shortcut}', shortcut);
}
