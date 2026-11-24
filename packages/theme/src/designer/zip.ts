/**
 * Minimal ZIP writer (PKWARE APPNOTE 6.3.x): stored (uncompressed) entries, UTF-8
 * names, fixed timestamps so the same input always produces the same bytes. Enough
 * for small theme packages without a dependency (SPEC section 10.6).
 */

export interface ZipEntry {
  /** Forward-slash relative path; no leading slash, no `..` segments. */
  readonly path: string;
  readonly content: string | Uint8Array;
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    table[n] = c >>> 0;
  }
  return table;
})();

export function crc32(bytes: Uint8Array): number {
  let c = 0xffffffff;
  for (const b of bytes) c = (CRC_TABLE[(c ^ b) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

const SAFE_PATH_RE = /^(?!\/)(?!.*(?:^|\/)\.\.?(?:\/|$))[A-Za-z0-9._@/-]{1,200}$/;

/** 1980-01-01 00:00 in MS-DOS date/time format. */
const DOS_TIME = 0;
const DOS_DATE = (0 << 9) | (1 << 5) | 1;

export function createZip(entries: readonly ZipEntry[]): Uint8Array {
  const encoder = new TextEncoder();
  const seen = new Set<string>();
  const files = entries.map((e) => {
    if (!SAFE_PATH_RE.test(e.path) || seen.has(e.path)) throw new TypeError(`Invalid or duplicate zip path: ${e.path}`);
    seen.add(e.path);
    const data = typeof e.content === 'string' ? encoder.encode(e.content) : e.content;
    return { name: encoder.encode(e.path), data, crc: crc32(data) };
  });
  const localSize = files.reduce((n, f) => n + 30 + f.name.length + f.data.length, 0);
  const centralSize = files.reduce((n, f) => n + 46 + f.name.length, 0);
  const out = new Uint8Array(localSize + centralSize + 22);
  const view = new DataView(out.buffer);
  let p = 0;
  const u16 = (v: number): void => {
    view.setUint16(p, v, true);
    p += 2;
  };
  const u32 = (v: number): void => {
    view.setUint32(p, v >>> 0, true);
    p += 4;
  };
  const bytes = (b: Uint8Array): void => {
    out.set(b, p);
    p += b.length;
  };
  const offsets: number[] = [];
  for (const f of files) {
    offsets.push(p);
    u32(0x04034b50);
    u16(20); // version needed
    u16(0x0800); // UTF-8 names
    u16(0); // stored
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0);
    bytes(f.name);
    bytes(f.data);
  }
  const centralStart = p;
  files.forEach((f, i) => {
    u32(0x02014b50);
    u16(20); // version made by
    u16(20);
    u16(0x0800);
    u16(0);
    u16(DOS_TIME);
    u16(DOS_DATE);
    u32(f.crc);
    u32(f.data.length);
    u32(f.data.length);
    u16(f.name.length);
    u16(0);
    u16(0);
    u16(0);
    u16(0);
    u32(0);
    u32(offsets[i] ?? 0);
    bytes(f.name);
  });
  u32(0x06054b50);
  u16(0);
  u16(0);
  u16(files.length);
  u16(files.length);
  u32(centralSize);
  u32(centralStart);
  u16(0);
  return out;
}

/** Read a stored-only zip produced by `createZip` (for tests and round trips). */
export function readZip(zip: Uint8Array): Map<string, Uint8Array> {
  const view = new DataView(zip.buffer, zip.byteOffset, zip.byteLength);
  const decoder = new TextDecoder();
  const out = new Map<string, Uint8Array>();
  let p = 0;
  while (p + 30 <= zip.length && view.getUint32(p, true) === 0x04034b50) {
    const method = view.getUint16(p + 8, true);
    const size = view.getUint32(p + 18, true);
    const nameLength = view.getUint16(p + 26, true);
    const extra = view.getUint16(p + 28, true);
    if (method !== 0) throw new TypeError('Only stored zip entries are supported.');
    const name = decoder.decode(zip.subarray(p + 30, p + 30 + nameLength));
    const start = p + 30 + nameLength + extra;
    out.set(name, zip.subarray(start, start + size));
    p = start + size;
  }
  return out;
}
