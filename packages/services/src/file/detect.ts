/**
 * Magic-byte file type detection.
 *
 * | Kind | Types |
 * |---|---|
 * | Images | png, jpeg, gif, webp, avif, heic/heif, bmp, ico, cur, tiff, svg (text sniff, `active`) |
 * | Documents and archives | pdf, zip, docx, xlsx, pptx, gzip, 7z, rar, tar, sqlite |
 * | Audio and video | mp3, mp4, m4a, mov, webm, mkv, avi, wav, ogg, flac |
 * | Fonts | woff, woff2, ttf, otf |
 * | Executables (`active`) | exe, dll, elf, wasm; html (text sniff) |
 * | Low confidence | xml, json, csv, text |
 */

/** A detected type. `active` marks content that can execute code (SVG, HTML, executables). */
export interface DetectedFileType {
  readonly mime: string;
  /** Canonical extension without the dot. */
  readonly extension: string;
  /** `high` for magic bytes; `low` for text heuristics (json, csv, xml, text). */
  readonly confidence: 'high' | 'low';
  readonly active: boolean;
}

/** Bytes needed by `detectFileTypeFromBytes` for every rule (the OOXML scan uses up to 64 KiB). */
export const DETECT_SAMPLE_BYTES = 64 * 1024;

const t = (mime: string, extension: string, active = false, confidence: 'high' | 'low' = 'high'): DetectedFileType => ({ mime, extension, confidence, active });

function startsWith(b: Uint8Array, sig: readonly number[], offset = 0): boolean {
  if (b.length < offset + sig.length) return false;
  for (let i = 0; i < sig.length; i++) if (b[offset + i] !== sig[i]) return false;
  return true;
}

const ascii = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
function asciiAt(b: Uint8Array, offset: number, length: number): string {
  let s = '';
  for (let i = offset; i < Math.min(b.length, offset + length); i++) s += String.fromCharCode(b[i] ?? 0);
  return s;
}
const u16le = (b: Uint8Array, o: number): number => (b[o] ?? 0) | ((b[o + 1] ?? 0) << 8);
const u32le = (b: Uint8Array, o: number): number => (u16le(b, o) | (u16le(b, o + 2) << 16)) >>> 0;

function isoBmff(b: Uint8Array): DetectedFileType | undefined {
  if (asciiAt(b, 4, 4) !== 'ftyp') return undefined;
  // Box size is big-endian; compatible brands follow the major brand and minor version.
  const size = (((b[0] ?? 0) << 24) | ((b[1] ?? 0) << 16) | ((b[2] ?? 0) << 8) | (b[3] ?? 0)) >>> 0;
  const brands = [asciiAt(b, 8, 4)];
  for (let o = 16; o + 4 <= Math.min(b.length, size, 64); o += 4) brands.push(asciiAt(b, o, 4));
  const has = (...xs: string[]): boolean => brands.some((x) => xs.includes(x));
  const major = brands[0] ?? '';
  if (major === 'avif' || major === 'avis') return t('image/avif', 'avif');
  if (['heic', 'heix', 'hevc', 'hevx', 'heim', 'heis'].includes(major)) return t('image/heic', 'heic');
  if (major === 'mif1' || major === 'msf1') return has('avif', 'avis') ? t('image/avif', 'avif') : has('heic', 'heix') ? t('image/heic', 'heic') : t('image/heif', 'heif');
  if (major === 'qt  ') return t('video/quicktime', 'mov');
  if (major === 'M4A ' || major === 'M4B ') return t('audio/mp4', 'm4a');
  if (major.startsWith('3g')) return t('video/3gpp', '3gp');
  return t('video/mp4', 'mp4');
}

function mp3Frame(b: Uint8Array): boolean {
  const b1 = b[1] ?? 0;
  const b2 = b[2] ?? 0;
  return b[0] === 0xff && (b1 & 0xe0) === 0xe0 && ((b1 >> 3) & 3) !== 1 && ((b1 >> 1) & 3) !== 0 && b2 >> 4 !== 15 && ((b2 >> 2) & 3) !== 3;
}

/** Office Open XML: scans ZIP local-file-header names for `[Content_Types].xml` and the part folder. */
function zipFlavour(b: Uint8Array): DetectedFileType {
  let contentTypes = false;
  let kind: DetectedFileType | undefined;
  let entries = 0;
  for (let p = 0; p + 30 <= b.length && entries < 64; ) {
    if (u32le(b, p) !== 0x04034b50) {
      p++;
      continue;
    }
    entries++;
    const nameLen = u16le(b, p + 26);
    const name = asciiAt(b, p + 30, nameLen);
    if (name === '[Content_Types].xml') contentTypes = true;
    else if (name.startsWith('word/')) kind = t('application/vnd.openxmlformats-officedocument.wordprocessingml.document', 'docx');
    else if (name.startsWith('xl/')) kind = t('application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', 'xlsx');
    else if (name.startsWith('ppt/')) kind = t('application/vnd.openxmlformats-officedocument.presentationml.presentation', 'pptx');
    if (contentTypes && kind) return kind;
    p += 30 + nameLen;
  }
  return t('application/zip', 'zip');
}

function peFlavour(b: Uint8Array): DetectedFileType {
  const pe = u32le(b, 0x3c);
  if (pe > 0 && pe + 24 <= b.length && startsWith(b, [0x50, 0x45, 0, 0], pe) && (u16le(b, pe + 22) & 0x2000) !== 0) return t('application/vnd.microsoft.portable-executable', 'dll', true);
  return t('application/vnd.microsoft.portable-executable', 'exe', true);
}

let fatalUtf8: TextDecoder | undefined;

/** Decodes the sample as text, or `undefined` when it looks binary. */
function sampleText(b: Uint8Array): string | undefined {
  let bytes = b.subarray(0, 8192);
  if (startsWith(bytes, [0xef, 0xbb, 0xbf])) bytes = bytes.subarray(3);
  for (const c of bytes) if (c === 0 || (c < 0x20 && c !== 9 && c !== 10 && c !== 13 && c !== 12)) return undefined;
  fatalUtf8 ??= new TextDecoder('utf-8', { fatal: true });
  try {
    return fatalUtf8.decode(bytes, { stream: true });
  } catch {
    return undefined;
  } finally {
    fatalUtf8.decode(); // reset streaming state
  }
}

/** Skips whitespace, `<?xml ...?>`, comments and a DOCTYPE; returns the rest, lowercased. */
function markupStart(text: string): string {
  let s = text.trimStart();
  for (let guard = 0; guard < 32; guard++) {
    const lower = s.slice(0, 16).toLowerCase();
    let end = -1;
    if (lower.startsWith('<?')) end = s.indexOf('?>') + 2;
    else if (lower.startsWith('<!--')) end = s.indexOf('-->') + 3;
    else if (lower.startsWith('<!doctype') && !lower.startsWith('<!doctype html')) end = s.indexOf('>') + 1;
    if (end <= 0) break;
    s = s.slice(end).trimStart();
  }
  return s.slice(0, 64).toLowerCase();
}

function textType(b: Uint8Array): DetectedFileType | undefined {
  if (startsWith(b, [0xff, 0xfe]) || startsWith(b, [0xfe, 0xff])) return t('text/plain', 'txt', false, 'low');
  const text = sampleText(b);
  if (text === undefined) return undefined;
  const head = markupStart(text);
  if (/^<svg[\s/>]/.test(head)) return t('image/svg+xml', 'svg', true);
  if (/^<!doctype html|^<html[\s>]|^<head[\s>]|^<body[\s>]|^<script[\s>]/.test(head)) return t('text/html', 'html', true);
  if (text.trimStart().startsWith('<?xml')) return t('application/xml', 'xml', false, 'low');
  const first = text.trimStart().charAt(0);
  if (first === '{' || first === '[') return t('application/json', 'json', false, 'low');
  const lines = text.split(/\r?\n/, 6).filter((l) => l !== '');
  if (lines.length >= 2) {
    const counts = lines.slice(0, 5).map((l) => l.split(',').length - 1);
    if ((counts[0] ?? 0) > 0 && counts.every((c) => c === counts[0])) return t('text/csv', 'csv', false, 'low');
  }
  return t('text/plain', 'txt', false, 'low');
}

/**
 * Detects a type from the first bytes of a file (pass at least `DETECT_SAMPLE_BYTES` for
 * OOXML; 4 KiB covers everything else). Returns `undefined` for unknown binary data.
 * @example
 * detectFileTypeFromBytes(Uint8Array.of(0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a));
 * // => { mime: 'image/png', extension: 'png', confidence: 'high', active: false }
 */
export function detectFileTypeFromBytes(bytes: Uint8Array): DetectedFileType | undefined {
  const b = bytes;
  if (b.length === 0) return undefined;
  if (startsWith(b, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return t('image/png', 'png');
  if (startsWith(b, [0xff, 0xd8, 0xff])) return t('image/jpeg', 'jpg');
  if (startsWith(b, ascii('GIF87a')) || startsWith(b, ascii('GIF89a'))) return t('image/gif', 'gif');
  if (startsWith(b, ascii('RIFF'))) {
    const form = asciiAt(b, 8, 4);
    if (form === 'WEBP') return t('image/webp', 'webp');
    if (form === 'WAVE') return t('audio/wav', 'wav');
    if (form === 'AVI ') return t('video/x-msvideo', 'avi');
  }
  const bmff = isoBmff(b);
  if (bmff) return bmff;
  if (startsWith(b, ascii('%PDF-'))) return t('application/pdf', 'pdf');
  if (startsWith(b, [0x50, 0x4b, 0x03, 0x04])) return zipFlavour(b);
  if (startsWith(b, [0x50, 0x4b, 0x05, 0x06]) || startsWith(b, [0x50, 0x4b, 0x07, 0x08])) return t('application/zip', 'zip');
  if (startsWith(b, [0x1f, 0x8b, 0x08])) return t('application/gzip', 'gz');
  if (startsWith(b, [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c])) return t('application/x-7z-compressed', '7z');
  if (startsWith(b, [0x52, 0x61, 0x72, 0x21, 0x1a, 0x07])) return t('application/vnd.rar', 'rar');
  if (asciiAt(b, 257, 5) === 'ustar') return t('application/x-tar', 'tar');
  if (startsWith(b, ascii('SQLite format 3\0'))) return t('application/vnd.sqlite3', 'sqlite');
  if (startsWith(b, [0x1a, 0x45, 0xdf, 0xa3])) return asciiAt(b, 0, 64).includes('webm') ? t('video/webm', 'webm') : t('video/x-matroska', 'mkv');
  if (startsWith(b, ascii('OggS'))) return t('audio/ogg', 'ogg');
  if (startsWith(b, ascii('fLaC'))) return t('audio/flac', 'flac');
  // UTF-16 BOM followed by an ASCII character; FF FE is also a valid MPEG frame sync.
  if ((startsWith(b, [0xff, 0xfe]) && b[3] === 0) || (startsWith(b, [0xfe, 0xff]) && b[2] === 0)) return t('text/plain', 'txt', false, 'low');
  if (startsWith(b, ascii('ID3')) || mp3Frame(b)) return t('audio/mpeg', 'mp3');
  if (startsWith(b, ascii('wOFF'))) return t('font/woff', 'woff');
  if (startsWith(b, ascii('wOF2'))) return t('font/woff2', 'woff2');
  if (startsWith(b, ascii('OTTO'))) return t('font/otf', 'otf');
  if (startsWith(b, [0x00, 0x01, 0x00, 0x00, 0x00]) || startsWith(b, ascii('true'))) return t('font/ttf', 'ttf');
  if (startsWith(b, [0x7f, 0x45, 0x4c, 0x46])) return t('application/x-elf', 'elf', true);
  if (startsWith(b, [0x00, 0x61, 0x73, 0x6d])) return t('application/wasm', 'wasm', true);
  if (startsWith(b, ascii('MZ'))) return peFlavour(b);
  if (startsWith(b, ascii('II*\0')) || startsWith(b, ascii('MM\0*'))) return t('image/tiff', 'tif');
  if (startsWith(b, [0, 0, 1, 0]) && u16le(b, 4) > 0) return t('image/x-icon', 'ico');
  if (startsWith(b, [0, 0, 2, 0]) && u16le(b, 4) > 0) return t('image/x-icon', 'cur');
  if (startsWith(b, ascii('BM')) && b.length >= 14 && u32le(b, 6) === 0) return t('image/bmp', 'bmp');
  return textType(b);
}

/**
 * Detects a Blob's (or bytes') real type from magic bytes, reading only the first 64 KiB.
 * @example
 * const file = new File([Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37)], 'payslip.pdf'); // '%PDF-1.7'
 * const type = await detectFileType(file);
 * type?.mime; // => 'application/pdf'
 * if (type?.active) console.warn('Active content is not allowed.');
 */
export async function detectFileType(input: Blob | Uint8Array | ArrayBuffer): Promise<DetectedFileType | undefined> {
  if (input instanceof Blob) return detectFileTypeFromBytes(new Uint8Array(await input.slice(0, DETECT_SAMPLE_BYTES).arrayBuffer()));
  return detectFileTypeFromBytes(input instanceof Uint8Array ? input : new Uint8Array(input));
}
