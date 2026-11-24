/** ZIP reader: central directory (with ZIP64), zip-bomb guards, CRC verification, native inflate. */
import { AbortError, HelperError, LimitError, ValidationError } from '../error/index.js';
import { crc32 } from '../encoding/index.js';
import {
  EXTRA_TIMESTAMP,
  EXTRA_ZIP64,
  FLAG_ENCRYPTED,
  FLAG_STRONG_ENCRYPTION,
  FLAG_UTF8,
  METHOD_AES,
  METHOD_DEFLATE,
  METHOD_STORE,
  SIG_CENTRAL,
  SIG_EOCD,
  SIG_LOCAL,
  SIG_ZIP64_EOCD,
  SIG_ZIP64_LOCATOR,
  U16_MAX,
  U32_MAX,
  corrupt,
  decodeCp437,
  fromDosDateTime,
  ownBytes,
  readU64,
  sanitizeEntryName,
  streamToIterator,
  unsupported,
} from './internal.js';

export interface ReadZipOptions {
  /** Maximum number of entries. Default 10,000. */
  readonly maxEntries?: number;
  /** Zip-bomb guard: maximum sum of declared uncompressed sizes. Default 1 GiB. */
  readonly maxTotalUncompressed?: number;
  /**
   * Zip-bomb guard: maximum uncompressed/compressed ratio for entries of 1 MiB or more.
   * Default 100.
   */
  readonly maxCompressionRatio?: number;
  /** Return names exactly as stored in `name` instead of sanitized ones. Default false. */
  readonly rawNames?: boolean;
  readonly signal?: AbortSignal;
}

/** One entry of an archive opened with `readZip`. */
export interface ZipEntry {
  /** Safe relative path (see `rawNames`); directories end with `/`. */
  readonly name: string;
  /** Name exactly as stored. Never use it as a file-system path without validation. */
  readonly rawName: string;
  readonly size: number;
  readonly compressedSize: number;
  readonly lastModified: Date;
  readonly isDirectory: boolean;
  readonly encrypted: boolean;
  /** Compression method (0 store, 8 deflate). Others cannot be read. */
  readonly method: number;
  readonly crc32: number;
  readonly comment: string;
  /** Reads and verifies the content (CRC-32 and size). */
  read(options?: { readonly signal?: AbortSignal }): Promise<Uint8Array<ArrayBuffer>>;
  /** Streams the content; the stream errors on CRC or size mismatch at the end. */
  stream(): ReadableStream<Uint8Array<ArrayBuffer>>;
}

/** An opened archive. */
export interface ZipArchive {
  readonly entries: readonly ZipEntry[];
  readonly comment: string;
  /** Finds an entry by (sanitized, unless `rawNames`) name. */
  get(name: string): ZipEntry | undefined;
}

const RATIO_MIN_SIZE = 1024 * 1024;
const MAX_COMMENT = U16_MAX;

async function bytesAt(blob: Blob, start: number, end: number): Promise<Uint8Array<ArrayBuffer>> {
  if (start < 0 || end > blob.size || end < start) throw corrupt();
  return new Uint8Array(await blob.slice(start, end).arrayBuffer());
}

const dv = (b: Uint8Array): DataView => new DataView(b.buffer, b.byteOffset, b.byteLength);

function checkAbort(signal: AbortSignal | undefined): void {
  if (signal?.aborted === true) throw new AbortError('HLP_ZIP_ABORTED', 'Reading the ZIP archive was aborted.', { cause: signal.reason });
}

interface Directory {
  readonly count: number;
  readonly cdOffset: number;
  readonly cdSize: number;
  readonly comment: Uint8Array;
}

async function findDirectory(blob: Blob): Promise<Directory> {
  if (blob.size < 22) throw corrupt();
  const tailStart = Math.max(0, blob.size - 22 - MAX_COMMENT);
  const tail = await bytesAt(blob, tailStart, blob.size);
  const view = dv(tail);
  let pos = -1;
  let loose = -1;
  // Prefer the record whose comment ends exactly at the end of the file (a comment can contain a fake signature).
  for (let i = tail.length - 22; i >= 0; i--) {
    if (view.getUint32(i, true) !== SIG_EOCD) continue;
    const end = i + 22 + view.getUint16(i + 20, true);
    if (end === tail.length) {
      pos = i;
      break;
    }
    if (loose < 0 && end < tail.length) loose = i;
  }
  if (pos < 0) pos = loose;
  if (pos < 0) throw corrupt();
  const eocdAbs = tailStart + pos;
  const disk = view.getUint16(pos + 4, true);
  const cdDisk = view.getUint16(pos + 6, true);
  let count = view.getUint16(pos + 10, true);
  let cdSize = view.getUint32(pos + 12, true);
  let cdOffset = view.getUint32(pos + 16, true);
  const comment = tail.subarray(pos + 22, pos + 22 + view.getUint16(pos + 20, true));
  let limit = eocdAbs;
  if (eocdAbs >= 20) {
    const loc = await bytesAt(blob, eocdAbs - 20, eocdAbs);
    const lv = dv(loc);
    if (lv.getUint32(0, true) === SIG_ZIP64_LOCATOR) {
      const z64Offset = readU64(lv, 8);
      if (z64Offset + 56 > eocdAbs - 20) throw corrupt();
      const rec = await bytesAt(blob, z64Offset, z64Offset + 56);
      const rv = dv(rec);
      if (rv.getUint32(0, true) !== SIG_ZIP64_EOCD) throw corrupt();
      if (rv.getUint32(16, true) !== 0 || rv.getUint32(20, true) !== 0) throw unsupported('HLP_ZIP_MULTI_DISK', 'Split (multi-disk) archives are not supported.');
      count = readU64(rv, 32);
      cdSize = readU64(rv, 40);
      cdOffset = readU64(rv, 48);
      limit = z64Offset;
    }
  }
  if (disk !== 0 || cdDisk !== 0) throw unsupported('HLP_ZIP_MULTI_DISK', 'Split (multi-disk) archives are not supported.');
  if (cdOffset > limit) throw corrupt();
  // Tolerate an overstated directory size (some writers count part of the EOCD); records are bounds-checked when parsed.
  if (cdOffset + cdSize > limit) cdSize = limit - cdOffset;
  return { count, cdOffset, cdSize, comment };
}

interface Raw {
  readonly rawName: string;
  readonly flags: number;
  readonly method: number;
  readonly crc: number;
  readonly compressedSize: number;
  readonly size: number;
  readonly offset: number;
  readonly lastModified: Date;
  readonly isDirectory: boolean;
  readonly comment: string;
}

let utf8: TextDecoder | undefined;
function decodeName(bytes: Uint8Array, isUtf8: boolean): string {
  if (!isUtf8) return decodeCp437(bytes);
  utf8 ??= new TextDecoder('utf-8');
  return utf8.decode(bytes);
}

function parseCentral(cd: Uint8Array, count: number, cdOffset: number): Raw[] {
  const view = dv(cd);
  const out: Raw[] = [];
  let p = 0;
  for (let n = 0; n < count; n++) {
    if (p + 46 > cd.length || view.getUint32(p, true) !== SIG_CENTRAL) throw corrupt();
    const flags = view.getUint16(p + 8, true);
    const method = view.getUint16(p + 10, true);
    const time = view.getUint16(p + 12, true);
    const date = view.getUint16(p + 14, true);
    const crc = view.getUint32(p + 16, true);
    let compressedSize = view.getUint32(p + 20, true);
    let size = view.getUint32(p + 24, true);
    const nameLen = view.getUint16(p + 28, true);
    const extraLen = view.getUint16(p + 30, true);
    const commentLen = view.getUint16(p + 32, true);
    const external = view.getUint32(p + 38, true);
    let offset = view.getUint32(p + 42, true);
    const end = p + 46 + nameLen + extraLen + commentLen;
    if (end > cd.length) throw corrupt();
    const isUtf8 = (flags & FLAG_UTF8) !== 0;
    const rawName = decodeName(cd.subarray(p + 46, p + 46 + nameLen), isUtf8);
    let lastModified = fromDosDateTime(date, time);
    let e = p + 46 + nameLen;
    const extraEnd = e + extraLen;
    while (e + 4 <= extraEnd) {
      const id = view.getUint16(e, true);
      const len = view.getUint16(e + 2, true);
      const body = e + 4;
      if (body + len > extraEnd) throw corrupt();
      if (id === EXTRA_ZIP64) {
        let q = body;
        const next = (): number => {
          if (q + 8 > body + len) throw corrupt();
          const v = readU64(view, q);
          q += 8;
          return v;
        };
        if (size === U32_MAX) size = next();
        if (compressedSize === U32_MAX) compressedSize = next();
        if (offset === U32_MAX) offset = next();
      } else if (id === EXTRA_TIMESTAMP && len >= 5 && (view.getUint8(body) & 1) === 1) {
        lastModified = new Date(view.getUint32(body + 1, true) * 1000);
      }
      e = body + len;
    }
    const comment = decodeName(cd.subarray(extraEnd, end), isUtf8);
    if (offset + 30 > cdOffset) throw corrupt();
    out.push({ rawName, flags, method, crc, compressedSize, size, offset, lastModified, isDirectory: rawName.endsWith('/') || rawName.endsWith('\\') || (external & 0x10) !== 0, comment });
    p = end;
  }
  return out;
}

/** Verifies size and CRC-32 of decompressed data; aborts as soon as output exceeds the declared size. */
function verifier(expectedSize: number, expectedCrc: number): TransformStream<Uint8Array, Uint8Array<ArrayBuffer>> {
  let size = 0;
  let crc = 0;
  return new TransformStream<Uint8Array, Uint8Array<ArrayBuffer>>({
    transform(chunk, controller) {
      size += chunk.length;
      if (size > expectedSize) throw new LimitError('HLP_ZIP_SIZE_MISMATCH', 'An entry is larger than its declared size.');
      crc = crc32(chunk, crc);
      controller.enqueue(ownBytes(chunk));
    },
    flush() {
      if (size !== expectedSize) throw new ValidationError('HLP_ZIP_SIZE_MISMATCH', 'An entry is smaller than its declared size.');
      if (crc !== expectedCrc) throw new ValidationError('HLP_ZIP_CRC_MISMATCH', 'An entry failed its CRC-32 check; the archive is damaged.');
    },
  });
}

const mapError = (e: unknown): Error => (e instanceof HelperError ? e : corrupt(e));

function makeEntry(blob: Blob, raw: Raw, name: string, dataLimit: number): ZipEntry {
  const encrypted = (raw.flags & (FLAG_ENCRYPTED | FLAG_STRONG_ENCRYPTION)) !== 0 || raw.method === METHOD_AES;
  const open = async (): Promise<ReadableStream<Uint8Array<ArrayBuffer>>> => {
    if (encrypted) throw unsupported('HLP_ZIP_ENCRYPTED', 'Encrypted ZIP entries are not supported.');
    if (raw.method !== METHOD_STORE && raw.method !== METHOD_DEFLATE) throw unsupported('HLP_ZIP_UNSUPPORTED_METHOD', 'The entry uses an unsupported compression method.');
    if (raw.method === METHOD_STORE && raw.compressedSize !== raw.size) throw corrupt();
    const head = await bytesAt(blob, raw.offset, raw.offset + 30);
    const hv = dv(head);
    if (hv.getUint32(0, true) !== SIG_LOCAL) throw corrupt();
    const start = raw.offset + 30 + hv.getUint16(26, true) + hv.getUint16(28, true);
    const end = start + raw.compressedSize;
    if (end > dataLimit) throw corrupt();
    const data = blob.slice(start, end).stream();
    const inflated = raw.method === METHOD_DEFLATE ? data.pipeThrough(new DecompressionStream('deflate-raw')) : data;
    return inflated.pipeThrough(verifier(raw.size, raw.crc));
  };
  const stream = (): ReadableStream<Uint8Array<ArrayBuffer>> => {
    let reader: ReadableStreamDefaultReader<Uint8Array<ArrayBuffer>> | undefined;
    return new ReadableStream<Uint8Array<ArrayBuffer>>(
      {
        async pull(controller) {
          try {
            reader ??= (await open()).getReader();
            const r = await reader.read();
            if (r.done) controller.close();
            else controller.enqueue(r.value);
          } catch (e) {
            controller.error(mapError(e));
          }
        },
        async cancel(reason: unknown) {
          await reader?.cancel(reason);
        },
      },
      { highWaterMark: 0 },
    );
  };
  return {
    name,
    rawName: raw.rawName,
    size: raw.size,
    compressedSize: raw.compressedSize,
    lastModified: raw.lastModified,
    isDirectory: raw.isDirectory,
    encrypted,
    method: raw.method,
    crc32: raw.crc,
    comment: raw.comment,
    stream,
    async read(opts = {}) {
      checkAbort(opts.signal);
      if (raw.isDirectory && raw.size === 0) return new Uint8Array(0);
      const out = new Uint8Array(raw.size);
      let p = 0;
      for await (const chunk of streamToIterator(stream())) {
        checkAbort(opts.signal);
        out.set(chunk, p);
        p += chunk.length;
      }
      return out;
    },
  };
}

/**
 * Opens a ZIP archive (including ZIP64) by reading its central directory; entry data is read
 * lazily. Guards against zip bombs (entry count, total size, compression ratio, actual output
 * never exceeding the declared size), verifies CRC-32, rejects encrypted entries, and
 * sanitizes names so they cannot escape the extraction root ("zip slip").
 * @example
 * const file = await zipFiles([{ name: 'reports/q1.csv', data: 'id,name\n1,Ada' }]); // or a File from a picker
 * const zip = await readZip(file);
 * zip.entries.map((e) => e.name); // => ['reports/q1.csv']
 * const first = zip.entries[0];
 * const text = first ? new TextDecoder().decode(await first.read()) : ''; // => 'id,name\n1,Ada'
 */
export async function readZip(input: Blob | Uint8Array | ArrayBuffer, options: ReadZipOptions = {}): Promise<ZipArchive> {
  const { maxEntries = 10_000, maxTotalUncompressed = 1024 * 1024 * 1024, maxCompressionRatio = 100, rawNames = false, signal } = options;
  checkAbort(signal);
  const blob = input instanceof Blob ? input : new Blob([input instanceof Uint8Array ? ownBytes(input) : input]);
  const dir = await findDirectory(blob);
  if (dir.count > maxEntries) throw new LimitError('HLP_ZIP_TOO_MANY_ENTRIES', 'The archive has too many entries.', { details: { limit: maxEntries } });
  // Each central record is at least 46 bytes.
  if (dir.count * 46 > dir.cdSize) throw corrupt();
  checkAbort(signal);
  const cd = await bytesAt(blob, dir.cdOffset, dir.cdOffset + dir.cdSize);
  const raws = parseCentral(cd, dir.count, dir.cdOffset);
  let total = 0;
  for (const r of raws) {
    total += r.size;
    if (total > maxTotalUncompressed) throw new LimitError('HLP_ZIP_TOO_LARGE', 'The archive expands beyond the allowed size.', { details: { limit: maxTotalUncompressed } });
    if (r.size > 0 && r.compressedSize === 0 && r.method !== METHOD_STORE) throw corrupt();
    if (r.size >= RATIO_MIN_SIZE && r.compressedSize > 0 && r.size / r.compressedSize > maxCompressionRatio) {
      throw new LimitError('HLP_ZIP_RATIO', 'The archive has a suspicious compression ratio (possible zip bomb).', { details: { limit: maxCompressionRatio } });
    }
  }
  const entries = raws.map((r) => makeEntry(blob, r, rawNames ? r.rawName : sanitizeEntryName(r.rawName, r.isDirectory), dir.cdOffset));
  const byName = new Map<string, ZipEntry>();
  for (const e of entries) if (!byName.has(e.name)) byName.set(e.name, e);
  return {
    entries,
    comment: decodeName(dir.comment, true),
    get: (name) => byName.get(name),
  };
}
