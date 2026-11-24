/** Getting files from the user: drag and drop (with folders), paste, and the file picker. */
import { AbortError } from '@absoluteui/helpers/error';

/** A dropped file with its path relative to the drop (folder names included). */
export interface DroppedFile {
  readonly file: File;
  /** Forward-slash relative path, for example `photos/2026/a.jpg`; the file name for top-level files. */
  readonly path: string;
}

export interface CollectDroppedFilesResult {
  readonly files: DroppedFile[];
  /** True when `maxFiles` or `maxDepth` stopped the traversal. */
  readonly truncated: boolean;
}

export interface CollectDroppedFilesOptions {
  /** Default 1000. */
  readonly maxFiles?: number;
  /** Folder nesting depth to descend into. Default 16. */
  readonly maxDepth?: number;
  readonly signal?: AbortSignal;
}

// Minimal structural types so tests and non-standard implementations can supply fakes.
interface EntryLike {
  readonly isFile: boolean;
  readonly isDirectory: boolean;
  readonly name: string;
  readonly fullPath: string;
}
interface FileEntryLike extends EntryLike {
  file(success: (file: File) => void, error?: (err: unknown) => void): void;
}
interface DirectoryEntryLike extends EntryLike {
  createReader(): { readEntries(success: (entries: EntryLike[]) => void, error?: (err: unknown) => void): void };
}
interface ItemLike {
  readonly kind: string;
  getAsFile(): File | null;
  webkitGetAsEntry?: () => EntryLike | null;
}
/** The parts of `DataTransfer` used here. */
export interface DataTransferLike {
  readonly items?: ArrayLike<ItemLike> | null;
  readonly files?: ArrayLike<File> | null;
}

const isFileEntry = (e: EntryLike): e is FileEntryLike => e.isFile && typeof (e as Partial<FileEntryLike>).file === 'function';
const isDirEntry = (e: EntryLike): e is DirectoryEntryLike => e.isDirectory && typeof (e as Partial<DirectoryEntryLike>).createReader === 'function';

const entryFile = (e: FileEntryLike): Promise<File> => new Promise((resolve, reject) => { e.file(resolve, reject); });

async function readAll(dir: DirectoryEntryLike, limit: number): Promise<EntryLike[]> {
  const reader = dir.createReader();
  const out: EntryLike[] = [];
  // readEntries returns batches (100 in Chrome) until an empty batch.
  for (;;) {
    const batch = await new Promise<EntryLike[]>((resolve, reject) => { reader.readEntries(resolve, reject); });
    if (batch.length === 0 || out.length >= limit) return out;
    out.push(...batch);
  }
}

const relative = (fullPath: string, name: string): string => {
  const p = fullPath.replace(/^\/+/, '');
  return p === '' ? name : p;
};

/**
 * Collects files from a drop, walking dropped folders (`webkitGetAsEntry`) with relative paths
 * and limits. Call it synchronously inside the `drop` handler: the browser empties the
 * `DataTransfer` after the handler returns, so entries are captured before the first `await`.
 * @example
 * const zone = document.createElement('div');
 * zone.addEventListener('drop', async (e: DragEvent) => {
 *   e.preventDefault();
 *   if (!e.dataTransfer) return;
 *   const { files, truncated } = await collectDroppedFiles(e.dataTransfer, { maxFiles: 500 });
 * });
 */
export async function collectDroppedFiles(dataTransfer: DataTransferLike, options: CollectDroppedFilesOptions = {}): Promise<CollectDroppedFilesResult> {
  const { maxFiles = 1000, maxDepth = 16, signal } = options;
  // Synchronous capture (see above).
  const roots: EntryLike[] = [];
  const loose: File[] = [];
  const items = dataTransfer.items ? Array.from(dataTransfer.items) : [];
  for (const item of items) {
    if (item.kind !== 'file') continue;
    const entry = typeof item.webkitGetAsEntry === 'function' ? item.webkitGetAsEntry() : null;
    if (entry) roots.push(entry);
    else {
      const f = item.getAsFile();
      if (f) loose.push(f);
    }
  }
  if (items.length === 0 && dataTransfer.files) loose.push(...Array.from(dataTransfer.files));

  const files: DroppedFile[] = [];
  let truncated = false;
  // Called before adding more: reaching the limit with work left means the result is truncated.
  const full = (): boolean => {
    if (files.length < maxFiles) return false;
    truncated = true;
    return true;
  };
  for (const f of loose) {
    if (full()) break;
    files.push({ file: f, path: f.name });
  }
  const walk = async (entry: EntryLike, depth: number): Promise<void> => {
    if (signal?.aborted === true) throw new AbortError('SVC_FILE_ABORTED', 'Reading the dropped files was aborted.', { cause: signal.reason });
    if (full()) return;
    if (isFileEntry(entry)) {
      files.push({ file: await entryFile(entry), path: relative(entry.fullPath, entry.name) });
    } else if (isDirEntry(entry)) {
      if (depth >= maxDepth) {
        truncated = true;
        return;
      }
      for (const child of await readAll(entry, maxFiles)) await walk(child, depth + 1);
    }
  };
  for (const root of roots) await walk(root, 0);
  return { files, truncated };
}

/**
 * Files pasted with Ctrl+V (screenshots, copied files).
 * @example
 * const editor = document.createElement('textarea');
 * const attachments: File[] = [];
 * editor.addEventListener('paste', (e: ClipboardEvent) => { attachments.push(...filesFromClipboardEvent(e)); });
 */
export function filesFromClipboardEvent(event: { readonly clipboardData: DataTransferLike | null }): File[] {
  const data = event.clipboardData;
  if (!data) return [];
  const out: File[] = [];
  for (const item of data.items ? Array.from(data.items) : []) {
    if (item.kind !== 'file') continue;
    const f = item.getAsFile();
    if (f) out.push(f);
  }
  return out.length > 0 || !data.files ? out : Array.from(data.files);
}

export interface OpenFilePickerOptions {
  /** Same syntax as `<input accept>`, for example `'image/*,.pdf'`. */
  readonly accept?: string;
  readonly multiple?: boolean;
  /** Pick a folder; files carry `webkitRelativePath`. Always uses the `<input>` path. */
  readonly directory?: boolean;
  readonly signal?: AbortSignal;
}

interface OpenPickerType {
  description?: string;
  accept: Record<string, string[]>;
}
type ShowOpenFilePicker = (o: { multiple?: boolean; types?: OpenPickerType[]; excludeAcceptAllOption?: boolean }) => Promise<{ getFile(): Promise<File> }[]>;

/** Converts `accept` to File System Access picker types; `undefined` when it cannot be expressed. */
function pickerTypes(accept: string | undefined): OpenPickerType[] | undefined {
  if (accept === undefined || accept.trim() === '') return undefined;
  const map: Record<string, string[]> = {};
  const exts: string[] = [];
  for (const raw of accept.split(',')) {
    const tok = raw.trim().toLowerCase();
    if (tok.startsWith('.')) {
      if (!/^\.[\da-z]{1,15}$/.test(tok)) return undefined;
      exts.push(tok);
    } else if (/^[a-z]+\/(?:\*|[\w.+-]+)$/.test(tok) && tok.length <= 100) {
      map[tok] = [];
    } else if (tok !== '') {
      return undefined;
    }
  }
  if (exts.length > 0) map['application/octet-stream'] = exts;
  return [{ accept: map }];
}

function restoreFocus(previous: Element | null): void {
  if (previous instanceof HTMLElement && previous.isConnected && document.activeElement !== previous) previous.focus({ preventScroll: true });
}

function inputPicker(options: OpenFilePickerOptions, previous: Element | null): Promise<File[]> {
  return new Promise<File[]>((resolve, reject) => {
    const input = document.createElement('input');
    input.type = 'file';
    if (options.accept !== undefined) input.accept = options.accept;
    input.multiple = options.multiple === true || options.directory === true;
    if (options.directory === true) input.webkitdirectory = true;
    input.hidden = true;
    input.tabIndex = -1;
    input.setAttribute('aria-hidden', 'true');
    let settled = false;
    let focusTimer: ReturnType<typeof setTimeout> | undefined;
    const finish = (files: File[] | Error): void => {
      if (settled) return;
      settled = true;
      input.removeEventListener('change', onChange);
      input.removeEventListener('cancel', onCancel);
      window.removeEventListener('focus', onFocus);
      options.signal?.removeEventListener('abort', onAbort);
      if (focusTimer !== undefined) clearTimeout(focusTimer);
      input.remove();
      restoreFocus(previous);
      if (files instanceof Error) reject(files);
      else resolve(files);
    };
    const onChange = (): void => { finish(input.files ? Array.from(input.files) : []); };
    const onCancel = (): void => { finish([]); };
    // Browsers without the 'cancel' event: the window regains focus when the dialog closes.
    const onFocus = (): void => {
      focusTimer = setTimeout(() => { finish(input.files ? Array.from(input.files) : []); }, 1000);
    };
    const onAbort = (): void => { finish(new AbortError('SVC_FILE_ABORTED', 'The file picker was aborted.', { cause: options.signal?.reason })); };
    input.addEventListener('change', onChange);
    input.addEventListener('cancel', onCancel);
    if (!('oncancel' in input)) window.addEventListener('focus', onFocus, { once: true });
    options.signal?.addEventListener('abort', onAbort, { once: true });
    document.body.appendChild(input);
    input.click();
  });
}

/**
 * Opens the system file picker; resolves `[]` when cancelled. Must be called from a user gesture
 * (click, key press). Uses `showOpenFilePicker` when available (not for folders), else a hidden
 * `<input type=file>` that is created, clicked and removed. Focus returns to the previously
 * focused element afterwards.
 * @example
 * const button = document.createElement('button');
 * button.addEventListener('click', async () => {
 *   const files = await openFilePicker({ accept: 'image/*', multiple: true });
 * });
 */
export async function openFilePicker(options: OpenFilePickerOptions = {}): Promise<File[]> {
  if (typeof document === 'undefined') return [];
  if (options.signal?.aborted === true) throw new AbortError('SVC_FILE_ABORTED', 'The file picker was aborted.', { cause: options.signal.reason });
  const previous = document.activeElement;
  const native = (window as unknown as { showOpenFilePicker?: ShowOpenFilePicker }).showOpenFilePicker;
  const types = pickerTypes(options.accept);
  if (options.directory !== true && typeof native === 'function' && (options.accept === undefined || types !== undefined)) {
    try {
      const handles = await native.call(window, { multiple: options.multiple === true, ...(types ? { types, excludeAcceptAllOption: true } : {}) });
      const files = await Promise.all(handles.map((h) => h.getFile()));
      restoreFocus(previous);
      return files;
    } catch (e) {
      if (typeof e === 'object' && e !== null && (e as { name?: unknown }).name === 'AbortError') {
        restoreFocus(previous);
        return [];
      }
      // SecurityError / TypeError: fall back to the input element.
    }
  }
  return inputPicker(options, previous);
}
