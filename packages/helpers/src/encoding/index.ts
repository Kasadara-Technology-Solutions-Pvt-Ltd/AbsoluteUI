/**
 * Byte and text encodings: UTF-8, base64/base64url, hex, data URLs, CRC-32, Adler-32, FNV-1a
 * (docs/PLAN-HELPERS.md section 2). Native `Uint8Array` base64/hex methods are used when present.
 */
import { LimitError, ValidationError } from '../error/index.js';

/** Anything that can be viewed as bytes. */
export type BytesLike = Uint8Array | ArrayBuffer | ArrayBufferView;

/** Bytes, or a string that is encoded as UTF-8 first. */
export type BinaryInput = BytesLike | string;

// Native ES2026 typed-array base64/hex (Chrome 140+, Firefox 133+, Safari 18.2+). Typed locally: not in the ES2023 lib.
interface NativeBase64Ctor {
  fromBase64?: (s: string, o?: { alphabet?: 'base64' | 'base64url'; lastChunkHandling?: 'loose' | 'strict' | 'stop-before-partial' }) => Uint8Array<ArrayBuffer>;
  fromHex?: (s: string) => Uint8Array<ArrayBuffer>;
}
interface NativeBase64Proto {
  toBase64?: (this: Uint8Array, o?: { alphabet?: 'base64' | 'base64url'; omitPadding?: boolean }) => string;
  toHex?: (this: Uint8Array) => string;
}
const nativeCtor = Uint8Array as unknown as NativeBase64Ctor;
const nativeProto = Uint8Array.prototype as unknown as NativeBase64Proto;

/** Views any bytes-like value as a `Uint8Array` without copying. */
function view(input: BytesLike): Uint8Array {
  if (input instanceof Uint8Array) return input;
  if (ArrayBuffer.isView(input)) return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
  return new Uint8Array(input);
}

function bytesOf(input: BinaryInput): Uint8Array {
  return typeof input === 'string' ? utf8Encode(input) : view(input);
}

let encoder: TextEncoder | undefined;
const decoders = new Map<boolean, TextDecoder>();

// ---------------------------------------------------------------------------
// UTF-8

/**
 * Encodes a string as UTF-8. Lone surrogates become U+FFFD.
 * @example
 * utf8Encode('€'); // => new Uint8Array([226, 130, 172])
 */
export function utf8Encode(text: string): Uint8Array<ArrayBuffer> {
  encoder ??= new TextEncoder();
  return encoder.encode(text);
}

export interface Utf8DecodeOptions {
  /** Throw `HLP_ENCODING_INVALID_UTF8` on malformed input instead of inserting U+FFFD. Default false. */
  readonly fatal?: boolean;
  /** Keep a leading byte-order mark. Default false (the BOM is stripped). */
  readonly keepBom?: boolean;
}

/**
 * Decodes UTF-8 bytes to a string.
 * @example
 * utf8Decode(new Uint8Array([226, 130, 172])); // => '€'
 */
export function utf8Decode(bytes: BytesLike, options: Utf8DecodeOptions = {}): string {
  const fatal = options.fatal ?? false;
  const u8 = view(bytes);
  if (options.keepBom === true) {
    try {
      return new TextDecoder('utf-8', { fatal, ignoreBOM: true }).decode(u8);
    } catch (e) {
      throw new ValidationError('HLP_ENCODING_INVALID_UTF8', 'The bytes are not valid UTF-8.', { cause: e });
    }
  }
  let d = decoders.get(fatal);
  if (!d) {
    d = new TextDecoder('utf-8', { fatal });
    decoders.set(fatal, d);
  }
  try {
    return d.decode(u8);
  } catch (e) {
    throw new ValidationError('HLP_ENCODING_INVALID_UTF8', 'The bytes are not valid UTF-8.', { cause: e });
  }
}

// ---------------------------------------------------------------------------
// Base64

const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
const B64URL = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const lookupCache = new Map<string, Int16Array>();
function lookup(alphabet: string): Int16Array {
  let t = lookupCache.get(alphabet);
  if (!t) {
    t = new Int16Array(128).fill(-1);
    for (let i = 0; i < 64; i++) t[alphabet.charCodeAt(i)] = i;
    lookupCache.set(alphabet, t);
  }
  return t;
}

function encodeB64(bytes: Uint8Array, url: boolean, pad: boolean): string {
  if (nativeProto.toBase64) return nativeProto.toBase64.call(bytes, { alphabet: url ? 'base64url' : 'base64', omitPadding: !pad });
  const abc = url ? B64URL : B64;
  const parts: string[] = [];
  let chunk = '';
  const n = bytes.length;
  let i = 0;
  for (; i + 2 < n; i += 3) {
    const v = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8) | (bytes[i + 2] ?? 0);
    chunk += abc.charAt(v >>> 18) + abc.charAt((v >>> 12) & 63) + abc.charAt((v >>> 6) & 63) + abc.charAt(v & 63);
    if (chunk.length >= 8192) {
      parts.push(chunk);
      chunk = '';
    }
  }
  const rest = n - i;
  if (rest === 1) {
    const v = (bytes[i] ?? 0) << 16;
    chunk += abc.charAt(v >>> 18) + abc.charAt((v >>> 12) & 63) + (pad ? '==' : '');
  } else if (rest === 2) {
    const v = ((bytes[i] ?? 0) << 16) | ((bytes[i + 1] ?? 0) << 8);
    chunk += abc.charAt(v >>> 18) + abc.charAt((v >>> 12) & 63) + abc.charAt((v >>> 6) & 63) + (pad ? '=' : '');
  }
  parts.push(chunk);
  return parts.join('');
}

const isAsciiWhitespace = (c: number): boolean => c === 0x20 || c === 0x09 || c === 0x0a || c === 0x0c || c === 0x0d;

/**
 * Validates and strips whitespace and padding. Returns the data characters or `undefined`.
 * Rules match `Uint8Array.fromBase64` in loose mode: ASCII whitespace ignored, padding optional,
 * but if present it must be correct.
 */
function cleanB64(text: string, url: boolean): string | undefined {
  const table = lookup(url ? B64URL : B64);
  let out = '';
  let pads = 0;
  for (let i = 0; i < text.length; i++) {
    const c = text.charCodeAt(i);
    if (isAsciiWhitespace(c)) continue;
    if (c === 0x3d) {
      pads++;
      continue;
    }
    if (pads > 0 || c > 127 || (table[c] ?? -1) < 0) return undefined;
    out += text.charAt(i);
  }
  const rem = out.length % 4;
  if (rem === 1) return undefined;
  if (pads > 0 && (pads > 2 || (out.length + pads) % 4 !== 0)) return undefined;
  return out;
}

function decodeB64(clean: string, url: boolean): Uint8Array<ArrayBuffer> {
  if (nativeCtor.fromBase64) return nativeCtor.fromBase64(clean, { alphabet: url ? 'base64url' : 'base64' });
  const table = lookup(url ? B64URL : B64);
  const n = clean.length;
  const out = new Uint8Array(Math.floor((n * 3) / 4));
  let o = 0;
  let acc = 0;
  let bits = 0;
  for (let i = 0; i < n; i++) {
    acc = (acc << 6) | (table[clean.charCodeAt(i)] ?? 0);
    bits += 6;
    if (bits >= 8) {
      bits -= 8;
      out[o++] = (acc >>> bits) & 0xff;
    }
    acc &= 0xff;
  }
  return out;
}

/**
 * Base64-encodes bytes, or a string as UTF-8 (never raw `btoa`, so any Unicode is safe).
 * @example
 * base64Encode('héllo ✓'); // => 'aMOpbGxvIOKckw=='
 */
export function base64Encode(input: BinaryInput): string {
  return encodeB64(bytesOf(input), false, true);
}

/**
 * Decodes standard base64 (whitespace ignored, padding optional) to bytes.
 * Throws `HLP_ENCODING_INVALID_BASE64` on malformed input.
 * @example
 * base64Decode('AQID'); // => new Uint8Array([1, 2, 3])
 */
export function base64Decode(text: string): Uint8Array<ArrayBuffer> {
  const clean = cleanB64(text, false);
  if (clean === undefined) throw new ValidationError('HLP_ENCODING_INVALID_BASE64', 'The input is not valid base64.');
  return decodeB64(clean, false);
}

/**
 * Decodes base64 to a UTF-8 string.
 * @example
 * base64DecodeText('aMOpbGxvIOKckw=='); // => 'héllo ✓'
 */
export function base64DecodeText(text: string, options: Utf8DecodeOptions = {}): string {
  return utf8Decode(base64Decode(text), options);
}

/**
 * Base64url-encodes (RFC 4648 section 5) without padding.
 * @example
 * base64UrlEncode(new Uint8Array([251, 255])); // => '-_8'
 */
export function base64UrlEncode(input: BinaryInput): string {
  return encodeB64(bytesOf(input), true, false);
}

/**
 * Decodes base64url (padding optional). Throws `HLP_ENCODING_INVALID_BASE64` on malformed input.
 * @example
 * base64UrlDecode('-_8'); // => new Uint8Array([251, 255])
 */
export function base64UrlDecode(text: string): Uint8Array<ArrayBuffer> {
  const clean = cleanB64(text, true);
  if (clean === undefined) throw new ValidationError('HLP_ENCODING_INVALID_BASE64', 'The input is not valid base64url.');
  return decodeB64(clean, true);
}

/**
 * Decodes base64url to a UTF-8 string.
 * @example
 * base64UrlDecodeText(base64UrlEncode('{"a":1}')); // => '{"a":1}'
 */
export function base64UrlDecodeText(text: string, options: Utf8DecodeOptions = {}): string {
  return utf8Decode(base64UrlDecode(text), options);
}

export interface IsBase64Options {
  /** Default `'base64'`. */
  readonly alphabet?: 'base64' | 'base64url';
  /** Require canonical `=` padding. Default false. */
  readonly requirePadding?: boolean;
  /** Allow ASCII whitespace. Default false. */
  readonly allowWhitespace?: boolean;
}

/**
 * True when `text` is decodable base64 (strict by default: no whitespace).
 * @example
 * isBase64('AQID'); // => true
 * isBase64('AQI*'); // => false
 */
export function isBase64(text: string, options: IsBase64Options = {}): boolean {
  const url = options.alphabet === 'base64url';
  if (options.allowWhitespace !== true) {
    for (let i = 0; i < text.length; i++) if (isAsciiWhitespace(text.charCodeAt(i))) return false;
  }
  const clean = cleanB64(text, url);
  if (clean === undefined) return false;
  if (options.requirePadding === true) {
    let len = 0;
    for (let i = 0; i < text.length; i++) if (!isAsciiWhitespace(text.charCodeAt(i))) len++;
    return len % 4 === 0;
  }
  return true;
}

// ---------------------------------------------------------------------------
// Hex

const HEX = '0123456789abcdef';

/**
 * Lowercase hex encoding of bytes (or a UTF-8 string).
 * @example
 * hexEncode(new Uint8Array([0, 255])); // => '00ff'
 */
export function hexEncode(input: BinaryInput, options: { readonly uppercase?: boolean } = {}): string {
  const bytes = bytesOf(input);
  let s: string;
  if (nativeProto.toHex) s = nativeProto.toHex.call(bytes);
  else {
    const parts: string[] = new Array<string>(bytes.length);
    for (let i = 0; i < bytes.length; i++) {
      const b = bytes[i] ?? 0;
      parts[i] = HEX.charAt(b >>> 4) + HEX.charAt(b & 15);
    }
    s = parts.join('');
  }
  return options.uppercase === true ? s.toUpperCase() : s;
}

function hexVal(c: number): number {
  if (c >= 48 && c <= 57) return c - 48;
  if (c >= 97 && c <= 102) return c - 87;
  if (c >= 65 && c <= 70) return c - 55;
  return -1;
}

/**
 * Decodes hex (either case, even length). Throws `HLP_ENCODING_INVALID_HEX` otherwise.
 * @example
 * hexDecode('00FF'); // => new Uint8Array([0, 255])
 */
export function hexDecode(text: string): Uint8Array<ArrayBuffer> {
  if (text.length % 2 !== 0) throw new ValidationError('HLP_ENCODING_INVALID_HEX', 'The input is not valid hex.');
  const out = new Uint8Array(text.length / 2);
  for (let i = 0; i < out.length; i++) {
    const hi = hexVal(text.charCodeAt(2 * i));
    const lo = hexVal(text.charCodeAt(2 * i + 1));
    if (hi < 0 || lo < 0) throw new ValidationError('HLP_ENCODING_INVALID_HEX', 'The input is not valid hex.');
    out[i] = (hi << 4) | lo;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Bytes

/**
 * Byte-wise equality. Not constant-time: use the services `crypto` module to compare secrets.
 * @example
 * bytesEqual(new Uint8Array([1]), new Uint8Array([1])); // => true
 */
export function bytesEqual(a: BytesLike, b: BytesLike): boolean {
  const x = view(a);
  const y = view(b);
  if (x.length !== y.length) return false;
  for (let i = 0; i < x.length; i++) if (x[i] !== y[i]) return false;
  return true;
}

/**
 * Concatenates byte arrays into a new `Uint8Array`.
 * @example
 * concatBytes(new Uint8Array([1]), new Uint8Array([2, 3])); // => new Uint8Array([1, 2, 3])
 */
export function concatBytes(...parts: readonly BytesLike[]): Uint8Array<ArrayBuffer> {
  const views = parts.map(view);
  let total = 0;
  for (const v of views) total += v.length;
  const out = new Uint8Array(total);
  let o = 0;
  for (const v of views) {
    out.set(v, o);
    o += v.length;
  }
  return out;
}

// ---------------------------------------------------------------------------
// Data URLs

// type/subtype with RFC 7230 token characters; length bounded by the caller.
const MIME_RE = /^[\w!#$%&'*+.^`|~-]+\/[\w!#$%&'*+.^`|~-]+$/;

/**
 * Builds a base64 `data:` URL.
 * @example
 * toDataUrl('hi', 'text/plain'); // => 'data:text/plain;base64,aGk='
 */
export function toDataUrl(input: BinaryInput, mimeType = 'application/octet-stream'): string {
  if (mimeType.length > 255 || !MIME_RE.test(mimeType)) throw new ValidationError('HLP_ENCODING_INVALID_MIME', 'The MIME type is not valid.');
  return `data:${mimeType.toLowerCase()};base64,${base64Encode(input)}`;
}

export interface ParsedDataUrl {
  /** Lowercased MIME type; `text/plain` when omitted. */
  readonly mimeType: string;
  /** Media-type parameters (for example `charset`), keys lowercased. Null-prototype object. */
  readonly parameters: Readonly<Record<string, string>>;
  readonly base64: boolean;
  readonly bytes: Uint8Array<ArrayBuffer>;
}

export interface ParseDataUrlOptions {
  /** Maximum decoded size in bytes. Default 10 MiB. Exceeding it throws `HLP_ENCODING_DATA_URL_TOO_LARGE`. */
  readonly maxBytes?: number;
}

/**
 * Parses a `data:` URL. Returns `undefined` when malformed; throws `LimitError` when over `maxBytes`.
 * @example
 * parseDataUrl('data:text/plain;charset=utf-8,hi%21')?.bytes; // => new Uint8Array([104, 105, 33]) // 'hi!'
 */
export function parseDataUrl(url: string, options: ParseDataUrlOptions = {}): ParsedDataUrl | undefined {
  const maxBytes = options.maxBytes ?? 10 * 1024 * 1024;
  // Encoded size bound: base64 is 4/3, percent-encoding up to 3x.
  if (url.length > maxBytes * 3 + 1024) throw new LimitError('HLP_ENCODING_DATA_URL_TOO_LARGE', 'The data URL exceeds the size limit.');
  const trimmed = url.trim();
  if (trimmed.slice(0, 5).toLowerCase() !== 'data:') return undefined;
  const comma = trimmed.indexOf(',');
  if (comma < 0) return undefined;
  const meta = trimmed.slice(5, comma).split(';').map((s) => s.trim());
  const payload = trimmed.slice(comma + 1);
  let base64 = false;
  if (meta.length > 1 && meta[meta.length - 1]?.toLowerCase() === 'base64') {
    base64 = true;
    meta.pop();
  }
  const typePart = (meta.shift() ?? '').toLowerCase();
  if (typePart !== '' && (typePart.length > 255 || !MIME_RE.test(typePart))) return undefined;
  const parameters: Record<string, string> = Object.create(null) as Record<string, string>;
  for (const p of meta) {
    const eq = p.indexOf('=');
    if (eq <= 0) continue;
    const key = p.slice(0, eq).trim().toLowerCase();
    parameters[key] = p.slice(eq + 1).trim();
  }
  if (typePart === '' && !('charset' in parameters)) parameters.charset = 'US-ASCII';
  let bytes: Uint8Array<ArrayBuffer>;
  if (base64) {
    let decoded: string;
    try {
      decoded = decodeURIComponent(payload);
    } catch {
      return undefined;
    }
    const clean = cleanB64(decoded, false);
    if (clean === undefined) return undefined;
    if (Math.floor((clean.length * 3) / 4) > maxBytes) throw new LimitError('HLP_ENCODING_DATA_URL_TOO_LARGE', 'The data URL exceeds the size limit.');
    bytes = decodeB64(clean, false);
  } else {
    bytes = percentDecodeBytes(payload);
    if (bytes.length > maxBytes) throw new LimitError('HLP_ENCODING_DATA_URL_TOO_LARGE', 'The data URL exceeds the size limit.');
  }
  return { mimeType: typePart === '' ? 'text/plain' : typePart, parameters, base64, bytes };
}

/** WHATWG percent-decode: `%XX` to a byte, everything else as UTF-8. Invalid escapes stay literal. */
function percentDecodeBytes(s: string): Uint8Array<ArrayBuffer> {
  const src = utf8Encode(s);
  const out = new Uint8Array(src.length);
  let o = 0;
  for (let i = 0; i < src.length; i++) {
    const c = src[i] ?? 0;
    if (c === 0x25 && i + 2 < src.length) {
      const hi = hexVal(src[i + 1] ?? 0);
      const lo = hexVal(src[i + 2] ?? 0);
      if (hi >= 0 && lo >= 0) {
        out[o++] = (hi << 4) | lo;
        i += 2;
        continue;
      }
    }
    out[o++] = c;
  }
  return out.slice(0, o);
}

// ---------------------------------------------------------------------------
// Checksums

let crcTable: Uint32Array | undefined;
function getCrcTable(): Uint32Array {
  if (crcTable) return crcTable;
  const t = new Uint32Array(256);
  for (let n = 0; n < 256; n++) {
    let c = n;
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
    t[n] = c >>> 0;
  }
  crcTable = t;
  return t;
}

/**
 * CRC-32/ISO-HDLC (zlib, ZIP, PNG). Pass the previous result to continue over chunks.
 * Returns an unsigned 32-bit integer.
 * @example
 * crc32('123456789'); // => 0xcbf43926
 * crc32(' world', crc32('hello')); // => crc32('hello world') // incremental over chunks
 */
export function crc32(data: BinaryInput, previous = 0): number {
  const t = getCrcTable();
  const bytes = bytesOf(data);
  let c = (previous ^ 0xffffffff) >>> 0;
  for (const byte of bytes) c = (t[(c ^ byte) & 0xff] ?? 0) ^ (c >>> 8);
  return (c ^ 0xffffffff) >>> 0;
}

/**
 * Adler-32 (zlib). Pass the previous result to continue over chunks (initial value 1).
 * @example
 * adler32('Wikipedia'); // => 0x11e60398
 */
export function adler32(data: BinaryInput, previous = 1): number {
  const bytes = bytesOf(data);
  let a = previous & 0xffff;
  let b = (previous >>> 16) & 0xffff;
  const MOD = 65521;
  // 5552 is the largest block for which the sums cannot overflow 2^32 before reduction.
  for (let i = 0; i < bytes.length; ) {
    const end = Math.min(i + 5552, bytes.length);
    for (; i < end; i++) {
      a += bytes[i] ?? 0;
      b += a;
    }
    a %= MOD;
    b %= MOD;
  }
  return ((b << 16) | a) >>> 0;
}

/**
 * FNV-1a 32-bit hash (strings are hashed as UTF-8). Non-cryptographic: use for buckets and cache keys.
 * @example
 * fnv1a32('a'); // => 0xe40c292c
 */
export function fnv1a32(data: BinaryInput, previous = 0x811c9dc5): number {
  const bytes = bytesOf(data);
  let h = previous >>> 0;
  for (const byte of bytes) {
    h ^= byte;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h;
}
