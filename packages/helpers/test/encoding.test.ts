import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  adler32,
  base64Decode,
  base64DecodeText,
  base64Encode,
  base64UrlDecode,
  base64UrlDecodeText,
  base64UrlEncode,
  bytesEqual,
  concatBytes,
  crc32,
  fnv1a32,
  hexDecode,
  hexEncode,
  isBase64,
  parseDataUrl,
  toDataUrl,
  utf8Decode,
  utf8Encode,
} from '@absoluteui/helpers/encoding';
import { LimitError, ValidationError } from '@absoluteui/helpers/error';

const u8 = (...b: number[]): Uint8Array => new Uint8Array(b);

describe('utf8', () => {
  it('encodes and decodes', () => {
    expect([...utf8Encode('€')]).toEqual([226, 130, 172]);
    expect(utf8Decode(u8(226, 130, 172))).toBe('€');
    expect(utf8Decode(u8(0xef, 0xbb, 0xbf, 0x61))).toBe('a');
    expect(utf8Decode(u8(0xef, 0xbb, 0xbf, 0x61), { keepBom: true })).toBe('\ufeffa');
  });
  it('replaces or rejects malformed input', () => {
    expect(utf8Decode(u8(0xff, 0x61))).toBe('\ufffda');
    expect(() => utf8Decode(u8(0xff), { fatal: true })).toThrow(ValidationError);
    expect(() => utf8Decode(u8(0xc3), { fatal: true, keepBom: true })).toThrow(ValidationError);
  });
  it('accepts any ArrayBufferView', () => {
    const buf = new Uint8Array([0, 0x61, 0x62, 0]).buffer;
    expect(utf8Decode(new DataView(buf, 1, 2))).toBe('ab');
    expect(utf8Decode(buf)).toBe('\u0000ab\u0000');
  });
  it('round-trips any well-formed string', () => {
    fc.assert(fc.property(fc.string({ unit: 'grapheme' }), (s) => utf8Decode(utf8Encode(s)) === s));
  });
});

describe('base64', () => {
  it('matches RFC 4648 vectors', () => {
    const vectors: [string, string][] = [['', ''], ['f', 'Zg=='], ['fo', 'Zm8='], ['foo', 'Zm9v'], ['foob', 'Zm9vYg=='], ['fooba', 'Zm9vYmE='], ['foobar', 'Zm9vYmFy']];
    for (const [plain, enc] of vectors) {
      expect(base64Encode(plain)).toBe(enc);
      expect(base64DecodeText(enc)).toBe(plain);
    }
  });
  it('handles Unicode strings (never raw btoa)', () => {
    expect(base64Encode('héllo ✓')).toBe('aMOpbGxvIOKckw==');
    expect(base64DecodeText('aMOpbGxvIOKckw==')).toBe('héllo ✓');
    expect(base64DecodeText(base64Encode('👨\u200d👩\u200d👧 東京'))).toBe('👨\u200d👩\u200d👧 東京');
  });
  it('decodes loosely (whitespace, missing padding) but rejects garbage', () => {
    expect([...base64Decode('AQ ID\n')]).toEqual([1, 2, 3]);
    expect([...base64Decode('AQ')]).toEqual([1]);
    for (const bad of ['A', 'AQ=', 'AQ===', 'A=Q=', '*AQ=', 'AQ==AQ==', 'Zm9v-_']) expect(() => base64Decode(bad), bad).toThrow(ValidationError);
  });
  it('base64url has no padding and its own alphabet', () => {
    expect(base64UrlEncode(u8(251, 255))).toBe('-_8');
    expect([...base64UrlDecode('-_8')]).toEqual([251, 255]);
    expect([...base64UrlDecode('-_8=')]).toEqual([251, 255]);
    expect(() => base64UrlDecode('+/8')).toThrow(ValidationError);
    expect(base64UrlDecodeText(base64UrlEncode('{"a":"ü"}'))).toBe('{"a":"ü"}');
  });
  it('isBase64', () => {
    expect(isBase64('AQID')).toBe(true);
    expect(isBase64('AQ')).toBe(true);
    expect(isBase64('AQ', { requirePadding: true })).toBe(false);
    expect(isBase64('AQ==', { requirePadding: true })).toBe(true);
    expect(isBase64('AQ I D')).toBe(false);
    expect(isBase64('AQ I D', { allowWhitespace: true })).toBe(true);
    expect(isBase64('-_8', { alphabet: 'base64url' })).toBe(true);
    expect(isBase64('-_8')).toBe(false);
  });
  it('round-trips random bytes against btoa/atob as an oracle', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 300 }), (bytes) => {
        const enc = base64Encode(bytes);
        expect(enc).toBe(btoa(String.fromCharCode(...bytes)));
        expect(bytesEqual(base64Decode(enc), bytes)).toBe(true);
        const url = base64UrlEncode(bytes);
        expect(url).not.toMatch(/[+/=]/);
        expect(bytesEqual(base64UrlDecode(url), bytes)).toBe(true);
      }),
    );
  });
  it('encodes large inputs quickly', () => {
    const big = new Uint8Array(3 * 1024 * 1024).map((_, i) => i & 255);
    const t = performance.now();
    expect(bytesEqual(base64Decode(base64Encode(big)), big)).toBe(true);
    expect(performance.now() - t).toBeLessThan(3000);
  });
});

describe('hex', () => {
  it('encodes and validates', () => {
    expect(hexEncode(u8(0, 15, 255))).toBe('000fff');
    expect(hexEncode(u8(171), { uppercase: true })).toBe('AB');
    expect(hexEncode('A')).toBe('41');
    expect([...hexDecode('00fFaB')]).toEqual([0, 255, 171]);
    for (const bad of ['0', 'zz', '0g', ' 00']) expect(() => hexDecode(bad)).toThrow(ValidationError);
  });
  it('round-trips', () => {
    fc.assert(fc.property(fc.uint8Array({ maxLength: 200 }), (b) => bytesEqual(hexDecode(hexEncode(b)), b)));
  });
});

describe('bytes', () => {
  it('compares and concatenates', () => {
    expect(bytesEqual(u8(1, 2), u8(1, 2))).toBe(true);
    expect(bytesEqual(u8(1, 2), u8(1, 3))).toBe(false);
    expect(bytesEqual(u8(1), u8(1, 1))).toBe(false);
    expect([...concatBytes(u8(1), new Uint16Array([0x0302]), u8())]).toEqual([1, 2, 3]);
  });
  it('does not mutate inputs', () => {
    const a = u8(1, 2);
    concatBytes(a, a);
    base64Encode(a);
    expect([...a]).toEqual([1, 2]);
  });
});

describe('data URLs', () => {
  it('builds and parses', () => {
    const url = toDataUrl('hi', 'Text/Plain');
    expect(url).toBe('data:text/plain;base64,aGk=');
    const p = parseDataUrl(url);
    expect(p?.mimeType).toBe('text/plain');
    expect(p?.base64).toBe(true);
    expect(utf8Decode(p!.bytes)).toBe('hi');
  });
  it('parses percent-encoded payloads and parameters', () => {
    const p = parseDataUrl('data:text/plain;charset=UTF-8,hi%21%E2%82%AC')!;
    expect(p.parameters.charset).toBe('UTF-8');
    expect(Object.getPrototypeOf(p.parameters)).toBeNull();
    expect(utf8Decode(p.bytes)).toBe('hi!€');
    expect(parseDataUrl('data:,A')?.mimeType).toBe('text/plain');
    expect(parseDataUrl('data:,A')?.parameters.charset).toBe('US-ASCII');
  });
  it('rejects malformed data URLs', () => {
    for (const bad of ['http://x', 'data:text/plain', 'data:bad type;base64,AA==', 'data:text/plain;base64,***']) expect(parseDataUrl(bad), bad).toBeUndefined();
    expect(() => toDataUrl('x', 'not a mime')).toThrow(ValidationError);
    expect(() => toDataUrl('x', 'text/html;x=<script>')).toThrow(ValidationError);
  });
  it('enforces the size limit', () => {
    expect(() => parseDataUrl(toDataUrl(new Uint8Array(2000)), { maxBytes: 1000 })).toThrow(LimitError);
    expect(() => parseDataUrl(`data:,${'a'.repeat(2000)}`, { maxBytes: 1000 })).toThrow(LimitError);
    expect(parseDataUrl(toDataUrl(new Uint8Array(1000)), { maxBytes: 1000 })?.bytes.length).toBe(1000);
  });
  it('does not pollute prototypes through parameters', () => {
    const p = parseDataUrl('data:text/plain;__proto__=x;constructor=y,hi')!;
    expect(({} as Record<string, unknown>).x).toBeUndefined();
    expect(Object.getPrototypeOf(p.parameters)).toBeNull();
  });
});

describe('checksums', () => {
  it('crc32 matches CRC-32/ISO-HDLC', () => {
    expect(crc32('123456789')).toBe(0xcbf43926);
    expect(crc32('')).toBe(0);
    expect(crc32('The quick brown fox jumps over the lazy dog')).toBe(0x414fa339);
  });
  it('crc32 is incremental over any split', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 200 }), fc.nat(), (bytes, cut) => {
        const k = bytes.length ? cut % (bytes.length + 1) : 0;
        expect(crc32(bytes.subarray(k), crc32(bytes.subarray(0, k)))).toBe(crc32(bytes));
      }),
    );
  });
  it('adler32', () => {
    expect(adler32('Wikipedia')).toBe(0x11e60398);
    expect(adler32('')).toBe(1);
    const big = new Uint8Array(20000).fill(255);
    expect(adler32(big.subarray(7000), adler32(big.subarray(0, 7000)))).toBe(adler32(big));
  });
  it('fnv1a32', () => {
    expect(fnv1a32('')).toBe(0x811c9dc5);
    expect(fnv1a32('a')).toBe(0xe40c292c);
    expect(fnv1a32('foobar')).toBe(0xbf9cf968);
    expect(fnv1a32('€')).toBe(fnv1a32(utf8Encode('€')));
  });
});

describe('fallbacks without native Uint8Array base64/hex', () => {
  it('produce identical results', () => {
    const proto = Uint8Array.prototype as unknown as Record<string, unknown>;
    const ctor = Uint8Array as unknown as Record<string, unknown>;
    const saved = [...['toBase64', 'toHex'].map((k) => [proto, k] as const), ...['fromBase64', 'fromHex'].map((k) => [ctor, k] as const)].map(([o, k]) => [o, k, Object.getOwnPropertyDescriptor(o, k)] as const);
    const native = fc.sample(fc.uint8Array({ maxLength: 100 }), 50).map((b) => [b, base64Encode(b), base64UrlEncode(b), hexEncode(b)] as const);
    delete proto.toBase64;
    delete proto.toHex;
    delete ctor.fromBase64;
    delete ctor.fromHex;
    try {
      expect(proto.toBase64).toBeUndefined();
      for (const [b, b64, url, hex] of native) {
        expect(base64Encode(b)).toBe(b64);
        expect(base64UrlEncode(b)).toBe(url);
        expect(hexEncode(b)).toBe(hex);
        expect(bytesEqual(base64Decode(b64), b)).toBe(true);
        expect(bytesEqual(base64UrlDecode(url), b)).toBe(true);
      }
      expect(base64DecodeText('aMOpbGxvIOKckw==')).toBe('héllo ✓');
      expect(() => base64Decode('A')).toThrow(ValidationError);
    } finally {
      for (const [o, k, d] of saved) if (d) Object.defineProperty(o, k, d);
    }
  });
});
