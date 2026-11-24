/** Reading Blobs and Files: text, bytes, data URLs, chunks, lines and streams. */
import { AbortError, LimitError, ValidationError } from '@absoluteui/helpers/error';
import { toDataUrl } from '@absoluteui/helpers/encoding';

/** Default size limit for whole-file reads (64 MiB). Use `readChunks`/`readLines` for larger files. */
export const DEFAULT_MAX_READ_BYTES = 64 * 1024 * 1024;
const DEFAULT_MAX_DATA_URL_BYTES = 10 * 1024 * 1024;
const DEFAULT_CHUNK = 1024 * 1024;

export interface ReadOptions {
  /** Maximum size in bytes; larger input throws `SVC_FILE_TOO_LARGE`. Default 64 MiB (10 MiB for data URLs). */
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
}

export interface ReadAsTextOptions extends ReadOptions {
  /** WHATWG encoding label. Default `utf-8`. A byte-order mark (UTF-8/16) overrides it. */
  readonly encoding?: string;
  /** Throw `SVC_FILE_DECODE` on malformed input instead of inserting U+FFFD. Default false. */
  readonly fatal?: boolean;
}

export function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new AbortError('SVC_FILE_ABORTED', 'Reading the file was aborted.', { cause: signal.reason });
}

function checkSize(blob: Blob, maxBytes: number): void {
  if (blob.size > maxBytes) throw new LimitError('SVC_FILE_TOO_LARGE', 'The file is larger than the allowed size.', { details: { limit: maxBytes } });
}

/** Encoding named by a byte-order mark, and the BOM length. */
function sniffBom(b: Uint8Array): string | undefined {
  if (b[0] === 0xef && b[1] === 0xbb && b[2] === 0xbf) return 'utf-8';
  if (b[0] === 0xff && b[1] === 0xfe) return 'utf-16le';
  if (b[0] === 0xfe && b[1] === 0xff) return 'utf-16be';
  return undefined;
}

export function createDecoder(encoding: string, fatal: boolean): TextDecoder {
  try {
    return new TextDecoder(encoding, { fatal });
  } catch (e) {
    throw new ValidationError('SVC_FILE_ENCODING', 'The text encoding is not supported.', { cause: e });
  }
}

export function decodeOrThrow(decoder: TextDecoder, bytes: Uint8Array | undefined, stream: boolean): string {
  try {
    return bytes === undefined ? decoder.decode() : decoder.decode(bytes, { stream });
  } catch (e) {
    throw new ValidationError('SVC_FILE_DECODE', 'The file is not valid text in the expected encoding.', { cause: e });
  }
}

/**
 * Reads a Blob as text. A UTF-8 or UTF-16 byte-order mark selects the encoding and is removed.
 * @example
 * const file = new File(['id,name\n1,Ada'], 'employees.csv', { type: 'text/csv' });
 * const text = await readAsText(file, { maxBytes: 5_000_000, fatal: true }); // => 'id,name\n1,Ada'
 */
export async function readAsText(blob: Blob, options: ReadAsTextOptions = {}): Promise<string> {
  const { maxBytes = DEFAULT_MAX_READ_BYTES, encoding = 'utf-8', fatal = false, signal } = options;
  checkAbort(signal);
  checkSize(blob, maxBytes);
  const bytes = new Uint8Array(await blob.arrayBuffer());
  checkAbort(signal);
  const decoder = createDecoder(sniffBom(bytes) ?? encoding, fatal);
  return decodeOrThrow(decoder, bytes, false);
}

/**
 * Reads a Blob into an `ArrayBuffer`, enforcing `maxBytes`.
 * @example
 * const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
 * const buffer = await readAsArrayBuffer(file);
 * buffer.byteLength; // => 5
 */
export async function readAsArrayBuffer(blob: Blob, options: ReadOptions = {}): Promise<ArrayBuffer> {
  const { maxBytes = DEFAULT_MAX_READ_BYTES, signal } = options;
  checkAbort(signal);
  checkSize(blob, maxBytes);
  const buffer = await blob.arrayBuffer();
  checkAbort(signal);
  return buffer;
}

/**
 * Reads a Blob into a `Uint8Array`, enforcing `maxBytes`.
 * @example
 * const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
 * const bytes = await readAsBytes(file.slice(0, 2));
 * Array.from(bytes); // => [104, 101]
 */
export async function readAsBytes(blob: Blob, options: ReadOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  return new Uint8Array(await readAsArrayBuffer(blob, options));
}

/**
 * Reads a Blob as a base64 `data:` URL (default limit 10 MiB; prefer `createObjectUrl` for previews).
 * @example
 * const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
 * await readAsDataUrl(file, { maxBytes: 2_000_000 }); // => 'data:text/plain;base64,aGVsbG8='
 */
export async function readAsDataUrl(blob: Blob, options: ReadOptions = {}): Promise<string> {
  const { maxBytes = DEFAULT_MAX_DATA_URL_BYTES, signal } = options;
  checkAbort(signal);
  checkSize(blob, maxBytes);
  if (typeof FileReader === 'undefined') {
    const type = blob.type.split(';')[0]?.trim() ?? '';
    return toDataUrl(new Uint8Array(await blob.arrayBuffer()), type === '' ? 'application/octet-stream' : type);
  }
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    const onAbort = (): void => {
      reader.abort();
    };
    const done = (): void => {
      signal?.removeEventListener('abort', onAbort);
    };
    reader.onload = () => {
      done();
      resolve(typeof reader.result === 'string' ? reader.result : '');
    };
    reader.onerror = () => {
      done();
      reject(new ValidationError('SVC_FILE_READ', 'The file could not be read.', { cause: reader.error }));
    };
    reader.onabort = () => {
      done();
      reject(new AbortError('SVC_FILE_ABORTED', 'Reading the file was aborted.', { cause: signal?.reason }));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
    reader.readAsDataURL(blob);
  });
}

export interface ReadChunksOptions {
  /** Chunk size in bytes. Default 1 MiB. */
  readonly chunkSize?: number;
  /** Start offset. Default 0. */
  readonly start?: number;
  /** End offset (exclusive). Default `blob.size`. */
  readonly end?: number;
  readonly signal?: AbortSignal;
}

function chunkSizeOf(value: number | undefined): number {
  const size = value ?? DEFAULT_CHUNK;
  if (!Number.isInteger(size) || size < 1) throw new ValidationError('SVC_FILE_OPTION', 'chunkSize must be a positive integer.');
  return size;
}

/**
 * Yields consecutive slices as `Uint8Array`s without loading the whole file.
 * @example
 * const file = new File(['hello world'], 'a.txt');
 * const sizes: number[] = [];
 * for await (const chunk of readChunks(file, { chunkSize: 4 })) sizes.push(chunk.length);
 * sizes; // => [4, 4, 3]
 */
export async function* readChunks(blob: Blob, options: ReadChunksOptions = {}): AsyncGenerator<Uint8Array<ArrayBuffer>, void, undefined> {
  const size = chunkSizeOf(options.chunkSize);
  const end = Math.min(blob.size, Math.max(0, options.end ?? blob.size));
  for (let offset = Math.max(0, options.start ?? 0); offset < end; offset += size) {
    checkAbort(options.signal);
    const chunk = new Uint8Array(await blob.slice(offset, Math.min(end, offset + size)).arrayBuffer());
    checkAbort(options.signal);
    yield chunk;
  }
}

export interface ReadLinesOptions {
  /** Default `utf-8`; a UTF-8 BOM is removed. */
  readonly encoding?: string;
  readonly fatal?: boolean;
  /** Longest accepted line in UTF-16 code units; longer throws `SVC_FILE_LINE_TOO_LONG`. Default 1,000,000. */
  readonly maxLineLength?: number;
  /** Bytes read per step. Default 1 MiB. */
  readonly chunkSize?: number;
  readonly signal?: AbortSignal;
}

/**
 * Yields lines (without terminators) from a text file, streaming. Handles `\n`, `\r\n` and `\r`,
 * including terminators and multi-byte characters split across chunks. A final empty line after
 * a trailing terminator is not yielded.
 * @example
 * const logFile = new File(['INFO start\nERROR disk full\nERROR retry failed\n'], 'app.log');
 * let errors = 0;
 * for await (const line of readLines(logFile)) if (line.includes('ERROR')) errors++;
 * errors; // => 2
 */
export async function* readLines(blob: Blob, options: ReadLinesOptions = {}): AsyncGenerator<string, void, undefined> {
  const { encoding = 'utf-8', fatal = false, maxLineLength = 1_000_000, signal } = options;
  const decoder = createDecoder(encoding, fatal);
  let buf = '';
  let skipLf = false;
  const tooLong = (): LimitError => new LimitError('SVC_FILE_LINE_TOO_LONG', 'A line is longer than the allowed length.', { details: { limit: maxLineLength } });
  function* drain(text: string): Generator<string, void, undefined> {
    let t = text;
    if (skipLf && t.length > 0) {
      if (t.charCodeAt(0) === 10) t = t.slice(1);
      skipLf = false;
    }
    let start = 0;
    const from = buf.length;
    buf += t;
    for (let i = from; i < buf.length; i++) {
      const c = buf.charCodeAt(i);
      if (c !== 10 && c !== 13) continue;
      if (i - start > maxLineLength) throw tooLong();
      yield buf.slice(start, i);
      if (c === 13) {
        if (i + 1 < buf.length) {
          if (buf.charCodeAt(i + 1) === 10) i++;
        } else {
          skipLf = true;
        }
      }
      start = i + 1;
    }
    buf = buf.slice(start);
    if (buf.length > maxLineLength) throw tooLong();
  }
  for await (const chunk of readChunks(blob, { chunkSize: chunkSizeOf(options.chunkSize), ...(signal ? { signal } : {}) })) {
    yield* drain(decodeOrThrow(decoder, chunk, true));
  }
  yield* drain(decodeOrThrow(decoder, undefined, false));
  if (buf.length > 0) yield buf;
}

/**
 * Exposes a Blob as a back-pressured `ReadableStream` of fixed-size chunks (for uploads or `pipeTo`).
 * @example
 * const file = new File(['hello'], 'a.txt');
 * let total = 0;
 * const writable = new WritableStream<Uint8Array>({ write(chunk) { total += chunk.length; } });
 * await streamFile(file, { chunkSize: 256 * 1024 }).pipeTo(writable);
 * total; // => 5
 */
export function streamFile(blob: Blob, options: ReadChunksOptions = {}): ReadableStream<Uint8Array<ArrayBuffer>> {
  const it = readChunks(blob, options);
  return new ReadableStream<Uint8Array<ArrayBuffer>>(
    {
      async pull(controller) {
        const r = await it.next();
        if (r.done === true) controller.close();
        else controller.enqueue(r.value);
      },
      async cancel() {
        await it.return();
      },
    },
    { highWaterMark: 0 },
  );
}
