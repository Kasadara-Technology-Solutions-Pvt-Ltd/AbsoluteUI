/** Streaming ZIP writer: data descriptors, UTF-8 names, CRC-32, native deflate, ZIP64. */
import { LimitError, ValidationError } from '../error/index.js';
import { crc32, utf8Encode } from '../encoding/index.js';
import {
  ByteWriter,
  EXTRA_TIMESTAMP,
  EXTRA_ZIP64,
  FLAG_DESCRIPTOR,
  FLAG_UTF8,
  MAX_NAME_BYTES,
  METHOD_DEFLATE,
  METHOD_STORE,
  SIG_CENTRAL,
  SIG_DESCRIPTOR,
  SIG_EOCD,
  SIG_LOCAL,
  SIG_ZIP64_EOCD,
  SIG_ZIP64_LOCATOR,
  U16_MAX,
  U32_MAX,
  iteratorToStream,
  normalizeEntryName,
  ownBytes,
  streamToIterator,
  supportsDeflateRaw,
  toDosDateTime,
  unsupported,
} from './internal.js';

/** `deflate` uses native `CompressionStream('deflate-raw')`; `store` writes bytes as they are. */
export type ZipCompression = 'deflate' | 'store';

/** Entry content. Streams and Blobs are read lazily while the archive is produced. */
export type ZipEntryData = string | Uint8Array | ArrayBuffer | Blob | ReadableStream<Uint8Array>;

export interface ZipWriterOptions {
  /** Default `deflate` when `CompressionStream('deflate-raw')` exists, else `store`. */
  readonly compression?: ZipCompression;
  /** Archive comment (UTF-8, at most 65535 bytes). */
  readonly comment?: string;
  /**
   * `auto` (default) switches to ZIP64 records only when needed (known size >= ~4 GiB, offsets
   * >= 4 GiB, more than 65535 entries). `always` writes ZIP64 for every entry, which lets
   * streams of unknown size exceed 4 GiB.
   */
  readonly zip64?: 'auto' | 'always';
  /** Maximum number of entries. Default 1,000,000. */
  readonly maxEntries?: number;
}

export interface ZipAddOptions {
  /** Modification time. Default: `File.lastModified` for files, else now. */
  readonly lastModified?: Date;
  /** Overrides the writer default (for example `store` for already-compressed JPEGs). */
  readonly compression?: ZipCompression;
  /** Entry comment (UTF-8, at most 65535 bytes). */
  readonly comment?: string;
}

/** Streaming ZIP archive builder. */
export interface ZipWriter {
  /** Queues a file. Throws on unsafe or duplicate names ("zip slip" prevention). */
  add(name: string, data: ZipEntryData, options?: ZipAddOptions): void;
  /** Queues an explicit directory entry. */
  addDirectory(name: string, options?: Pick<ZipAddOptions, 'lastModified' | 'comment'>): void;
  /** Number of queued entries. */
  readonly size: number;
  /** Produces the archive; can be called once. Entries cannot be added afterwards. */
  stream(): ReadableStream<Uint8Array<ArrayBuffer>>;
  /** Produces the archive as a `Blob` (`application/zip`). */
  toBlob(): Promise<Blob>;
}

interface Pending {
  readonly name: Uint8Array<ArrayBuffer>;
  readonly isDirectory: boolean;
  readonly data: ZipEntryData | undefined;
  readonly knownSize: number | undefined;
  readonly compression: ZipCompression;
  readonly date: Date;
  readonly comment: Uint8Array<ArrayBuffer>;
}

interface Written {
  readonly entry: Pending;
  readonly method: number;
  readonly zip64: boolean;
  readonly offset: number;
  readonly crc: number;
  readonly size: number;
  readonly compressedSize: number;
}

const CHUNK = 64 * 1024;
// Deflate can expand incompressible input slightly; switch to ZIP64 well before 4 GiB.
const ZIP64_KNOWN_SIZE = 0xff000000;
const VERSION_DEFAULT = 20;
const VERSION_ZIP64 = 45;
const DOS_DIRECTORY = 0x10;

function knownSizeOf(data: ZipEntryData): number | undefined {
  if (typeof data === 'string') return undefined;
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) return data.byteLength;
  if (data instanceof Blob) return data.size;
  return undefined;
}

function commentBytes(comment: string | undefined): Uint8Array<ArrayBuffer> {
  const b = utf8Encode(comment ?? '');
  if (b.length > MAX_NAME_BYTES) throw new ValidationError('HLP_ZIP_COMMENT_TOO_LONG', 'The comment is longer than 65535 bytes.');
  return b;
}

async function* sourceChunks(data: ZipEntryData): AsyncGenerator<Uint8Array, void, undefined> {
  if (typeof data === 'string') {
    yield utf8Encode(data);
    return;
  }
  if (data instanceof Uint8Array || data instanceof ArrayBuffer) {
    const bytes = data instanceof Uint8Array ? data : new Uint8Array(data);
    for (let i = 0; i < bytes.length; i += CHUNK) yield bytes.subarray(i, i + CHUNK);
    return;
  }
  const stream = data instanceof Blob ? data.stream() : data;
  for await (const chunk of streamToIterator<unknown>(stream)) {
    if (!(chunk instanceof Uint8Array)) throw new ValidationError('HLP_ZIP_INVALID_CHUNK', 'Entry streams must produce Uint8Array chunks.');
    yield chunk;
  }
}

/** Computes CRC-32 and size of the uncompressed bytes as they pass. */
async function* tap(source: AsyncIterable<Uint8Array>, stats: { crc: number; size: number }): AsyncGenerator<Uint8Array<ArrayBuffer>, void, undefined> {
  for await (const chunk of source) {
    stats.crc = crc32(chunk, stats.crc);
    stats.size += chunk.length;
    yield ownBytes(chunk);
  }
}

function extraTimestamp(date: Date): Uint8Array<ArrayBuffer> {
  const secs = Math.floor(date.getTime() / 1000);
  if (!Number.isFinite(secs) || secs < 0 || secs > U32_MAX) return new Uint8Array(0);
  return new ByteWriter(9).u16(EXTRA_TIMESTAMP).u16(5).raw(Uint8Array.of(1)).u32(secs).bytes;
}

function localHeader(e: Pending, method: number, zip64: boolean, dos: { date: number; time: number }, ts: Uint8Array): Uint8Array<ArrayBuffer> {
  const z64 = zip64 ? new ByteWriter(20).u16(EXTRA_ZIP64).u16(16).u64(0).u64(0).bytes : new Uint8Array(0);
  const w = new ByteWriter(30 + e.name.length + z64.length + ts.length);
  w.u32(SIG_LOCAL)
    .u16(zip64 ? VERSION_ZIP64 : VERSION_DEFAULT)
    .u16(FLAG_DESCRIPTOR | FLAG_UTF8)
    .u16(method)
    .u16(dos.time)
    .u16(dos.date)
    .u32(0) // CRC-32 and sizes follow in the data descriptor (bit 3)
    .u32(zip64 ? U32_MAX : 0)
    .u32(zip64 ? U32_MAX : 0)
    .u16(e.name.length)
    .u16(z64.length + ts.length)
    .raw(e.name)
    .raw(z64)
    .raw(ts);
  return w.bytes;
}

function descriptor(crc: number, compressedSize: number, size: number, zip64: boolean): Uint8Array<ArrayBuffer> {
  if (zip64) return new ByteWriter(24).u32(SIG_DESCRIPTOR).u32(crc).u64(compressedSize).u64(size).bytes;
  return new ByteWriter(16).u32(SIG_DESCRIPTOR).u32(crc).u32(compressedSize).u32(size).bytes;
}

function centralHeader(w: Written, forceZip64: boolean): Uint8Array<ArrayBuffer> {
  const { entry: e } = w;
  const bigSize = forceZip64 || w.zip64 || w.size >= U32_MAX;
  const bigCompressed = forceZip64 || w.zip64 || w.compressedSize >= U32_MAX;
  const bigOffset = forceZip64 || w.offset >= U32_MAX;
  const fields = [bigSize ? w.size : -1, bigCompressed ? w.compressedSize : -1, bigOffset ? w.offset : -1].filter((v) => v >= 0);
  let z64: Uint8Array<ArrayBuffer> = new Uint8Array(0);
  if (fields.length > 0) {
    const zw = new ByteWriter(4 + fields.length * 8).u16(EXTRA_ZIP64).u16(fields.length * 8);
    for (const f of fields) zw.u64(f);
    z64 = zw.bytes;
  }
  const ts = extraTimestamp(e.date);
  const dos = toDosDateTime(e.date);
  const version = fields.length > 0 || w.zip64 ? VERSION_ZIP64 : VERSION_DEFAULT;
  const out = new ByteWriter(46 + e.name.length + z64.length + ts.length + e.comment.length);
  out
    .u32(SIG_CENTRAL)
    .u16(version) // made by: MS-DOS host, spec version
    .u16(version)
    .u16(FLAG_DESCRIPTOR | FLAG_UTF8)
    .u16(w.method)
    .u16(dos.time)
    .u16(dos.date)
    .u32(w.crc)
    .u32(bigCompressed ? U32_MAX : w.compressedSize)
    .u32(bigSize ? U32_MAX : w.size)
    .u16(e.name.length)
    .u16(z64.length + ts.length)
    .u16(e.comment.length)
    .u16(0) // disk number start
    .u16(0) // internal attributes
    .u32(e.isDirectory ? DOS_DIRECTORY : 0)
    .u32(bigOffset ? U32_MAX : w.offset)
    .raw(e.name)
    .raw(z64)
    .raw(ts)
    .raw(e.comment);
  return out.bytes;
}

/** End records: ZIP64 end of central directory and locator when needed, then the classic EOCD. */
export function endRecords(count: number, cdOffset: number, cdSize: number, comment: Uint8Array, forceZip64: boolean): Uint8Array<ArrayBuffer> {
  const zip64 = forceZip64 || count > U16_MAX - 1 || cdOffset >= U32_MAX || cdSize >= U32_MAX;
  const eocd = new ByteWriter(22 + comment.length);
  eocd
    .u32(SIG_EOCD)
    .u16(0)
    .u16(0)
    .u16(zip64 ? U16_MAX : count)
    .u16(zip64 ? U16_MAX : count)
    .u32(zip64 ? U32_MAX : cdSize)
    .u32(zip64 ? U32_MAX : cdOffset)
    .u16(comment.length)
    .raw(comment);
  if (!zip64) return eocd.bytes;
  const out = new ByteWriter(56 + 20 + eocd.bytes.length);
  out
    .u32(SIG_ZIP64_EOCD)
    .u64(44) // size of the remaining record
    .u16(VERSION_ZIP64)
    .u16(VERSION_ZIP64)
    .u32(0)
    .u32(0)
    .u64(count)
    .u64(count)
    .u64(cdSize)
    .u64(cdOffset)
    .u32(SIG_ZIP64_LOCATOR)
    .u32(0)
    .u64(cdOffset + cdSize) // offset of the ZIP64 end record
    .u32(1)
    .raw(eocd.bytes);
  return out.bytes;
}

async function* generate(entries: readonly Pending[], comment: Uint8Array, forceZip64: boolean): AsyncGenerator<Uint8Array<ArrayBuffer>, void, undefined> {
  let offset = 0;
  const written: Written[] = [];
  for (const e of entries) {
    const hasData = !e.isDirectory && e.data !== undefined && e.knownSize !== 0;
    const method = hasData && e.compression === 'deflate' ? METHOD_DEFLATE : METHOD_STORE;
    const zip64 = forceZip64 || (e.knownSize !== undefined && e.knownSize >= ZIP64_KNOWN_SIZE);
    const header = localHeader(e, method, zip64, toDosDateTime(e.date), extraTimestamp(e.date));
    const start = offset;
    yield header;
    offset += header.length;
    const stats = { crc: 0, size: 0 };
    let compressedSize = 0;
    if (hasData) {
      const raw = tap(sourceChunks(e.data), stats);
      const out = method === METHOD_DEFLATE ? streamToIterator(iteratorToStream(raw).pipeThrough(new CompressionStream('deflate-raw'))) : raw;
      for await (const chunk of out) {
        compressedSize += chunk.length;
        yield ownBytes(chunk);
      }
      offset += compressedSize;
    }
    if (!zip64 && (stats.size >= U32_MAX || compressedSize >= U32_MAX)) {
      throw new LimitError('HLP_ZIP_ENTRY_TOO_LARGE', "An entry of unknown size exceeded 4 GiB. Create the writer with zip64: 'always'.");
    }
    const d = descriptor(stats.crc, compressedSize, stats.size, zip64);
    yield d;
    offset += d.length;
    written.push({ entry: e, method, zip64, offset: start, crc: stats.crc, size: stats.size, compressedSize });
  }
  const cdOffset = offset;
  let cdSize = 0;
  for (const w of written) {
    const h = centralHeader(w, forceZip64);
    cdSize += h.length;
    yield h;
  }
  yield endRecords(written.length, cdOffset, cdSize, comment, forceZip64);
}

/**
 * Creates a streaming ZIP writer. Entries stream through without knowing their sizes (local
 * headers use data descriptors), names are UTF-8, and CRC-32 is computed incrementally.
 * @example
 * const zip = createZipWriter();
 * zip.add('reports/q1.csv', 'id,name\n1,Ada');
 * zip.add('photo.jpg', new File([new Uint8Array([0xff, 0xd8, 0xff])], 'photo.jpg'), { compression: 'store' });
 * const blob = await zip.toBlob();
 * (await readZip(blob)).entries.map((e) => e.name); // => ['reports/q1.csv', 'photo.jpg']
 */
export function createZipWriter(options: ZipWriterOptions = {}): ZipWriter {
  const defaultCompression: ZipCompression = options.compression ?? (supportsDeflateRaw() ? 'deflate' : 'store');
  const archiveComment = commentBytes(options.comment);
  const maxEntries = options.maxEntries ?? 1_000_000;
  const forceZip64 = options.zip64 === 'always';
  const entries: Pending[] = [];
  const names = new Set<string>();
  let started = false;

  const push = (rawName: string, isDirectory: boolean, data: ZipEntryData | undefined, opts: ZipAddOptions): void => {
    if (started) throw new ValidationError('HLP_ZIP_WRITER_CLOSED', 'Entries cannot be added after the archive has started.');
    if (entries.length >= maxEntries) throw new LimitError('HLP_ZIP_TOO_MANY_ENTRIES', 'The archive has too many entries.');
    const name = normalizeEntryName(rawName, isDirectory);
    const key = isDirectory ? name.slice(0, -1) : name;
    if (names.has(key)) throw new ValidationError('HLP_ZIP_DUPLICATE_NAME', 'The archive already contains an entry with this name.');
    const compression = opts.compression ?? defaultCompression;
    if (compression === 'deflate' && !supportsDeflateRaw()) throw unsupported('HLP_ZIP_DEFLATE_UNSUPPORTED', 'This browser cannot compress; use compression: "store".');
    if (data !== undefined && !(typeof data === 'string' || data instanceof Uint8Array || data instanceof ArrayBuffer || data instanceof Blob || data instanceof ReadableStream)) {
      throw new ValidationError('HLP_ZIP_INVALID_DATA', 'Entry data must be a string, bytes, a Blob, or a ReadableStream.');
    }
    const fileTime = data instanceof File ? new Date(data.lastModified) : undefined;
    names.add(key);
    entries.push({
      name: utf8Encode(name),
      isDirectory,
      data,
      knownSize: data === undefined ? 0 : knownSizeOf(data),
      compression,
      date: opts.lastModified ?? fileTime ?? new Date(),
      comment: commentBytes(opts.comment),
    });
  };

  const stream = (): ReadableStream<Uint8Array<ArrayBuffer>> => {
    if (started) throw new ValidationError('HLP_ZIP_WRITER_CLOSED', 'The archive can be produced only once.');
    started = true;
    return iteratorToStream(generate(entries.slice(), archiveComment, forceZip64));
  };

  return {
    add(name, data, opts = {}) {
      push(name, false, data, opts);
    },
    addDirectory(name, opts = {}) {
      push(name, true, undefined, opts);
    },
    get size() {
      return entries.length;
    },
    stream,
    async toBlob() {
      const parts: Uint8Array<ArrayBuffer>[] = [];
      for await (const chunk of streamToIterator(stream())) parts.push(chunk);
      return new Blob(parts, { type: 'application/zip' });
    },
  };
}

/** A file for `zipFiles`. */
export interface ZipFileInput extends ZipAddOptions {
  readonly name: string;
  readonly data: ZipEntryData;
}

/**
 * Zips files into a `Blob` in one call.
 * @example
 * const pngBlob = new Blob([new Uint8Array([0x89, 0x50, 0x4e, 0x47])], { type: 'image/png' });
 * const blob = await zipFiles([{ name: 'a.txt', data: 'hello' }, { name: 'img/b.png', data: pngBlob, compression: 'store' }]);
 * blob.type; // => 'application/zip'
 */
export async function zipFiles(files: readonly ZipFileInput[], options: ZipWriterOptions = {}): Promise<Blob> {
  const zip = createZipWriter(options);
  for (const f of files) {
    const { name, data, ...rest } = f;
    zip.add(name, data, rest);
  }
  return zip.toBlob();
}
