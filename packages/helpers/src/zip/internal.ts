/**
 * ZIP format constants and shared helpers (PKWARE APPNOTE 6.3.10). Internal to the zip module.
 */
import { HelperError, ValidationError } from '../error/index.js';
import { utf8Encode } from '../encoding/index.js';

export const SIG_LOCAL = 0x04034b50;
export const SIG_CENTRAL = 0x02014b50;
export const SIG_EOCD = 0x06054b50;
export const SIG_ZIP64_EOCD = 0x06064b50;
export const SIG_ZIP64_LOCATOR = 0x07064b50;
export const SIG_DESCRIPTOR = 0x08074b50;

export const U16_MAX = 0xffff;
export const U32_MAX = 0xffffffff;

export const FLAG_ENCRYPTED = 0x0001;
export const FLAG_DESCRIPTOR = 0x0008;
export const FLAG_STRONG_ENCRYPTION = 0x0040;
export const FLAG_UTF8 = 0x0800;

export const METHOD_STORE = 0;
export const METHOD_DEFLATE = 8;
export const METHOD_AES = 99;

export const EXTRA_ZIP64 = 0x0001;
export const EXTRA_TIMESTAMP = 0x5455;

/** Maximum UTF-8 length of an entry name or comment (16-bit length fields). */
export const MAX_NAME_BYTES = U16_MAX;

/** Little-endian fixed-size record builder. */
export class ByteWriter {
  readonly bytes: Uint8Array<ArrayBuffer>;
  private readonly view: DataView;
  private p = 0;

  constructor(size: number) {
    this.bytes = new Uint8Array(size);
    this.view = new DataView(this.bytes.buffer);
  }
  u16(v: number): this {
    this.view.setUint16(this.p, v, true);
    this.p += 2;
    return this;
  }
  u32(v: number): this {
    this.view.setUint32(this.p, v >>> 0, true);
    this.p += 4;
    return this;
  }
  /** Writes a non-negative safe integer as 64-bit little endian. */
  u64(v: number): this {
    this.view.setUint32(this.p, v % 0x100000000, true);
    this.view.setUint32(this.p + 4, Math.floor(v / 0x100000000), true);
    this.p += 8;
    return this;
  }
  raw(b: Uint8Array): this {
    this.bytes.set(b, this.p);
    this.p += b.length;
    return this;
  }
}

/** Reads a 64-bit little-endian value; throws when it exceeds `Number.MAX_SAFE_INTEGER`. */
export function readU64(view: DataView, offset: number): number {
  const lo = view.getUint32(offset, true);
  const hi = view.getUint32(offset + 4, true);
  const v = hi * 0x100000000 + lo;
  if (!Number.isSafeInteger(v)) throw corrupt();
  return v;
}

export const corrupt = (cause?: unknown): ValidationError => new ValidationError('HLP_ZIP_CORRUPT', 'The ZIP archive is damaged or not a ZIP file.', cause === undefined ? {} : { cause });

export const unsupported = (code: string, message: string): HelperError => new HelperError(code, message, { kind: 'unsupported' });

/** MS-DOS date and time (local time, 2-second resolution), clamped to 1980-2107. */
export function toDosDateTime(date: Date): { readonly date: number; readonly time: number } {
  const t = date.getTime();
  const d = Number.isNaN(t) ? new Date(1980, 0, 1) : date;
  const year = d.getFullYear();
  if (year < 1980) return { date: (0 << 9) | (1 << 5) | 1, time: 0 };
  if (year > 2107) return { date: (127 << 9) | (12 << 5) | 31, time: (23 << 11) | (59 << 5) | 29 };
  return {
    date: ((year - 1980) << 9) | ((d.getMonth() + 1) << 5) | d.getDate(),
    time: (d.getHours() << 11) | (d.getMinutes() << 5) | Math.floor(d.getSeconds() / 2),
  };
}

/** Inverse of `toDosDateTime` (local time). */
export function fromDosDateTime(date: number, time: number): Date {
  const year = ((date >>> 9) & 0x7f) + 1980;
  const month = Math.max(1, (date >>> 5) & 0x0f) - 1;
  const day = Math.max(1, date & 0x1f);
  return new Date(year, month, day, (time >>> 11) & 0x1f, (time >>> 5) & 0x3f, (time & 0x1f) * 2);
}

const isControl = (c: number): boolean => c < 0x20 || c === 0x7f;
const hasDrive = (s: string): boolean => /^[a-z]:/i.test(s);

/**
 * Validates and normalizes a name for writing ("zip slip" prevention): backslashes become `/`,
 * empty and `.` segments are dropped; absolute paths, drive letters, `..` segments and control
 * characters are rejected. Directories get a trailing `/`.
 */
export function normalizeEntryName(name: unknown, isDirectory: boolean): string {
  if (typeof name !== 'string') throw new ValidationError('HLP_ZIP_INVALID_NAME', 'The entry name must be a string.');
  const s = name.replaceAll('\\', '/');
  for (let i = 0; i < s.length; i++) if (isControl(s.charCodeAt(i))) throw new ValidationError('HLP_ZIP_INVALID_NAME', 'The entry name must not contain control characters.');
  if (s.startsWith('/') || hasDrive(s)) throw new ValidationError('HLP_ZIP_ABSOLUTE_PATH', 'The entry name must be a relative path.');
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') throw new ValidationError('HLP_ZIP_PATH_TRAVERSAL', 'The entry name must not contain ".." segments.');
    parts.push(seg);
  }
  if (parts.length === 0) throw new ValidationError('HLP_ZIP_INVALID_NAME', 'The entry name is empty.');
  const out = parts.join('/') + (isDirectory ? '/' : '');
  if (utf8Encode(out).length > MAX_NAME_BYTES) throw new ValidationError('HLP_ZIP_INVALID_NAME', 'The entry name is too long.');
  return out;
}

/**
 * Makes a name read from an archive safe to use as a relative path: backslashes become `/`,
 * control characters, drive letters, empty and `.` segments are removed, and `..` segments
 * can never climb above the archive root.
 */
export function sanitizeEntryName(raw: string, isDirectory: boolean): string {
  let s = '';
  for (let i = 0; i < raw.length; i++) {
    const c = raw.charCodeAt(i);
    if (!isControl(c)) s += c === 0x5c ? '/' : raw.charAt(i);
  }
  while (hasDrive(s)) s = s.slice(2);
  const parts: string[] = [];
  for (const seg of s.split('/')) {
    if (seg === '' || seg === '.') continue;
    if (seg === '..') parts.pop();
    else parts.push(seg);
  }
  return parts.join('/') + (isDirectory && parts.length > 0 ? '/' : '');
}

// Code page 437 characters 0x80-0xFF (names without the UTF-8 flag).
const CP437_HIGH =
  '\u00c7\u00fc\u00e9\u00e2\u00e4\u00e0\u00e5\u00e7\u00ea\u00eb\u00e8\u00ef\u00ee\u00ec\u00c4\u00c5\u00c9\u00e6\u00c6\u00f4\u00f6\u00f2\u00fb\u00f9\u00ff\u00d6\u00dc\u00a2\u00a3\u00a5\u20a7\u0192\u00e1\u00ed\u00f3\u00fa\u00f1\u00d1\u00aa\u00ba\u00bf\u2310\u00ac\u00bd\u00bc\u00a1\u00ab\u00bb\u2591\u2592\u2593\u2502\u2524\u2561\u2562\u2556\u2555\u2563\u2551\u2557\u255d\u255c\u255b\u2510\u2514\u2534\u252c\u251c\u2500\u253c\u255e\u255f\u255a\u2554\u2569\u2566\u2560\u2550\u256c\u2567\u2568\u2564\u2565\u2559\u2558\u2552\u2553\u256b\u256a\u2518\u250c\u2588\u2584\u258c\u2590\u2580\u03b1\u00df\u0393\u03c0\u03a3\u03c3\u00b5\u03c4\u03a6\u0398\u03a9\u03b4\u221e\u03c6\u03b5\u2229\u2261\u00b1\u2265\u2264\u2320\u2321\u00f7\u2248\u00b0\u2219\u00b7\u221a\u207f\u00b2\u25a0\u00A0';

/** Decodes code page 437 bytes (the ZIP default when the UTF-8 flag is not set). */
export function decodeCp437(bytes: Uint8Array): string {
  let out = '';
  for (const b of bytes) out += b < 0x80 ? String.fromCharCode(b) : CP437_HIGH.charAt(b - 0x80);
  return out;
}

export const CP437_TABLE_LENGTH = CP437_HIGH.length;

/** Views a chunk as `Uint8Array<ArrayBuffer>` (copies only when backed by a SharedArrayBuffer). */
export function ownBytes(chunk: Uint8Array): Uint8Array<ArrayBuffer> {
  return chunk.buffer instanceof ArrayBuffer ? (chunk as Uint8Array<ArrayBuffer>) : chunk.slice();
}

let deflateSupport: boolean | undefined;

/** True when `CompressionStream('deflate-raw')` exists (resolved lazily, cached). */
export function supportsDeflateRaw(): boolean {
  if (deflateSupport === undefined) {
    try {
      deflateSupport = typeof CompressionStream === 'function' && typeof DecompressionStream === 'function' && new CompressionStream('deflate-raw') instanceof CompressionStream;
    } catch {
      deflateSupport = false;
    }
  }
  return deflateSupport;
}

/** Wraps an async iterator as a pull-based (back-pressured) `ReadableStream`. */
export function iteratorToStream<T>(it: AsyncIterator<T>): ReadableStream<T> {
  return new ReadableStream<T>(
    {
      async pull(controller) {
        const r = await it.next();
        if (r.done === true) controller.close();
        else controller.enqueue(r.value);
      },
      async cancel(reason: unknown) {
        await it.return?.(reason);
      },
    },
    { highWaterMark: 0 },
  );
}

/** Iterates a stream, releasing (and cancelling, on early exit) the reader. */
export async function* streamToIterator<T>(stream: ReadableStream<T>): AsyncGenerator<T, void, undefined> {
  const reader = stream.getReader();
  let done = false;
  try {
    for (;;) {
      const r = await reader.read();
      if (r.done) {
        done = true;
        return;
      }
      yield r.value;
    }
  } finally {
    if (!done) await reader.cancel().catch(() => undefined);
    reader.releaseLock();
  }
}
