import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import { hexDecode, hexEncode, base64UrlEncode } from '@absoluteui/helpers/encoding';
import { isHelperError } from '@absoluteui/helpers/error';
import {
  aesGcmDecrypt,
  aesGcmDecryptString,
  aesGcmEncrypt,
  aesGcmEncryptString,
  deriveBitsPbkdf2,
  deriveKeyPbkdf2,
  digest,
  digestHex,
  ecdsaSign,
  ecdsaVerify,
  exportKey,
  generateAesKey,
  generateEcdsaKeyPair,
  hmac,
  hmacHex,
  hmacVerify,
  importAesKey,
  importHmacKey,
  isWebCryptoAvailable,
  jwtDecodeUnsafe,
  packAesGcm,
  randomSalt,
  sha256Hex,
  timingSafeEqual,
  unpackAesGcm,
} from '@absoluteui/services/crypto';

const code = async (p: Promise<unknown>): Promise<string | undefined> => {
  try {
    await p;
    return undefined;
  } catch (e) {
    return isHelperError(e) ? e.code : 'non-helper';
  }
};

describe('crypto digests', () => {
  it('matches FIPS 180 vectors', async () => {
    expect(isWebCryptoAvailable()).toBe(true);
    expect(await sha256Hex('abc')).toBe('ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
    expect(await sha256Hex('')).toBe('e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
    expect(await digestHex('SHA-1', 'abc')).toBe('a9993e364706816aba3e25717850c26c9cd0d89d');
    expect(await digestHex('SHA-512', 'abc')).toBe('ddaf35a193617abacc417349ae20413112e6fa4e89a97ea20a9eeee64b55d39a2192992a274fc1a836ba3c23a3feebbd454d4423643ce80e2a9ac94fa54ca49f');
    expect((await digest('SHA-384', 'abc')).byteLength).toBe(48);
  });
  it('accepts ArrayBuffer, typed-array views and UTF-8 text equally', async () => {
    const bytes = new TextEncoder().encode('héllo');
    const padded = new Uint8Array(bytes.length + 4);
    padded.set(bytes, 2);
    const view = new Uint8Array(padded.buffer, 2, bytes.length);
    const expected = await sha256Hex('héllo');
    expect(await sha256Hex(bytes.buffer)).toBe(expected);
    expect(await sha256Hex(view)).toBe(expected);
    expect(await sha256Hex(new DataView(padded.buffer, 2, bytes.length))).toBe(expected);
  });
  it('rejects unknown algorithms', async () => {
    expect(await code(digest('MD5' as 'SHA-1', 'x'))).toBe('SVC_CRYPTO_INVALID_HASH');
  });
});

describe('crypto HMAC (RFC 4231)', () => {
  it('test case 1', async () => {
    const key = new Uint8Array(20).fill(0x0b);
    expect(await hmacHex(key, 'Hi There')).toBe('b0344c61d8db38535ca8afceaf0bf12b881dc200c9833da726e9376c2e32cff7');
  });
  it('test case 2 and verify', async () => {
    const key = await importHmacKey('Jefe');
    const mac = await hmac(key, 'what do ya want for nothing?');
    expect(hexEncode(mac)).toBe('5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
    expect(await hmacVerify(key, 'what do ya want for nothing?', mac)).toBe(true);
    const bad = mac.slice();
    bad[0] = (bad[0] ?? 0) ^ 1;
    expect(await hmacVerify(key, 'what do ya want for nothing?', bad)).toBe(false);
    expect(await hmacVerify('Jefe', 'other', mac)).toBe(false);
  });
  it('rejects empty keys', async () => {
    expect(await code(importHmacKey(''))).toBe('SVC_CRYPTO_EMPTY_KEY');
  });
});

describe('crypto PBKDF2', () => {
  it('RFC 6070 SHA-1 vectors', async () => {
    const run = async (c: number): Promise<string> => hexEncode(await deriveBitsPbkdf2('password', 'salt', { iterations: c, hash: 'SHA-1', length: 160 }));
    expect(await run(1)).toBe('0c60c80f961f0e71f3a9b524af6012062fe037a6');
    expect(await run(2)).toBe('ea6c014dc72d6f8ccd1ed92ace1d41f0d8de8957');
    expect(await run(4096)).toBe('4b007901b765489abead49d926f721d065a429c1');
  });
  it('SHA-256 vectors', async () => {
    expect(hexEncode(await deriveBitsPbkdf2('password', 'salt', { iterations: 1 }))).toBe('120fb6cffcf8b32c43e7225256c4f837a86548c92ccc35480805987cb70be17b');
    expect(hexEncode(await deriveBitsPbkdf2('password', 'salt', { iterations: 2 }))).toBe('ae4d0c95af6b46d32d0adff928f06dd02a303f8ef3c251dfd6e2d85a95474c43');
  });
  it('derives a usable AES key and validates options', async () => {
    const salt = randomSalt();
    expect(salt.byteLength).toBe(16);
    const k1 = await deriveKeyPbkdf2('pass', salt, { iterations: 1000 });
    const k2 = await deriveKeyPbkdf2('pass', salt, { iterations: 1000 });
    expect(k1.extractable).toBe(false);
    const token = await aesGcmEncryptString(k1, 'data');
    expect(await aesGcmDecryptString(k2, token)).toBe('data');
    expect(await code(deriveBitsPbkdf2('p', 's', { iterations: 0 }))).toBe('SVC_CRYPTO_INVALID_ITERATIONS');
    expect(await code(deriveBitsPbkdf2('p', 's', { iterations: 1e9 }))).toBe('SVC_CRYPTO_TOO_MANY_ITERATIONS');
    expect(await code(deriveBitsPbkdf2('p', 's', { iterations: 1, length: 7 }))).toBe('SVC_CRYPTO_INVALID_LENGTH');
    expect(() => randomSalt(4)).toThrow();
  });
});

describe('crypto AES-GCM', () => {
  it('round-trips with AAD and uses a fresh IV per call', async () => {
    const key = await generateAesKey();
    const a = await aesGcmEncrypt(key, 'secret', { aad: 'user:1' });
    const b = await aesGcmEncrypt(key, 'secret', { aad: 'user:1' });
    expect(a.iv.byteLength).toBe(12);
    expect(hexEncode(a.iv)).not.toBe(hexEncode(b.iv));
    expect(new TextDecoder().decode(await aesGcmDecrypt(key, a, { aad: 'user:1' }))).toBe('secret');
    expect(new TextDecoder().decode(await aesGcmDecrypt(key, packAesGcm(b), { aad: 'user:1' }))).toBe('secret');
  });
  it('detects tampering, wrong AAD and wrong key without leaking detail', async () => {
    const key = await generateAesKey();
    const other = await generateAesKey();
    const p = await aesGcmEncrypt(key, 'secret', { aad: 'a' });
    const tampered = p.ciphertext.slice();
    tampered[0] = (tampered[0] ?? 0) ^ 0xff;
    expect(await code(aesGcmDecrypt(key, { iv: p.iv, ciphertext: tampered }, { aad: 'a' }))).toBe('SVC_CRYPTO_DECRYPT_FAILED');
    expect(await code(aesGcmDecrypt(key, p, { aad: 'b' }))).toBe('SVC_CRYPTO_DECRYPT_FAILED');
    expect(await code(aesGcmDecrypt(other, p, { aad: 'a' }))).toBe('SVC_CRYPTO_DECRYPT_FAILED');
    expect(await code(aesGcmDecryptString(key, '!!not-base64!!'))).toBe('SVC_CRYPTO_DECRYPT_FAILED');
    expect(() => unpackAesGcm(new Uint8Array(10))).toThrow();
    try {
      await aesGcmDecrypt(key, p, { aad: 'b' });
    } catch (e) {
      expect((e as Error).message).toBe('Decryption failed.');
      expect((e as Error).cause).toBeUndefined();
    }
  });
  it('imports and exports keys (NIST SP 800-38D test case 3 style known key)', async () => {
    const raw = hexDecode('feffe9928665731c6d6a8f9467308308feffe9928665731c6d6a8f9467308308');
    const key = await importAesKey(raw, { extractable: true });
    expect(hexEncode(await exportKey(key))).toBe(hexEncode(raw));
    expect((await exportKey(key, 'jwk')).kty).toBe('oct');
    const locked = await importAesKey(raw);
    expect(await code(exportKey(locked))).toBe('SVC_CRYPTO_NOT_EXTRACTABLE');
    expect(await code(importAesKey(new Uint8Array(10)))).toBe('SVC_CRYPTO_INVALID_KEY_LENGTH');
  });
  it('matches a known AES-256-GCM vector (NIST GCM test case 13: zero key, empty plaintext tag)', async () => {
    // Key 0^256, IV 0^96, empty plaintext → tag 530f8afbc74536b9a963b4f1c4cb738b.
    const key = await importAesKey(new Uint8Array(32));
    const plain = await aesGcmDecrypt(key, { iv: new Uint8Array(12), ciphertext: hexDecode('530f8afbc74536b9a963b4f1c4cb738b') });
    expect(plain.byteLength).toBe(0);
  });
  it('property: string encryption round-trips arbitrary unicode', async () => {
    const key = await generateAesKey({ length: 128 });
    await fc.assert(
      fc.asyncProperty(fc.string({ unit: 'grapheme' }), fc.string(), async (text, aad) => {
        expect(await aesGcmDecryptString(key, await aesGcmEncryptString(key, text, { aad }), { aad })).toBe(text);
      }),
      { numRuns: 40 },
    );
  });
});

describe('crypto ECDSA', () => {
  it('signs and verifies', async () => {
    const { privateKey, publicKey } = await generateEcdsaKeyPair('P-256');
    const sig = await ecdsaSign(privateKey, 'payload');
    expect(sig.byteLength).toBe(64);
    expect(await ecdsaVerify(publicKey, sig, 'payload')).toBe(true);
    expect(await ecdsaVerify(publicKey, sig, 'payload!')).toBe(false);
  });
});

describe('timingSafeEqual', () => {
  it('compares by value including length', () => {
    expect(timingSafeEqual('abc', 'abc')).toBe(true);
    expect(timingSafeEqual('abc', 'abd')).toBe(false);
    expect(timingSafeEqual('abc', 'abcd')).toBe(false);
    expect(timingSafeEqual('', '')).toBe(true);
    expect(timingSafeEqual(new Uint8Array([1, 2]), new Uint8Array([1, 2]).buffer)).toBe(true);
    expect(timingSafeEqual('\u0000', '')).toBe(false);
  });
  it('property: equals byte equality', () => {
    fc.assert(
      fc.property(fc.uint8Array({ maxLength: 40 }), fc.uint8Array({ maxLength: 40 }), (a, b) => {
        expect(timingSafeEqual(a, b)).toBe(hexEncode(a) === hexEncode(b));
        expect(timingSafeEqual(a, a.slice())).toBe(true);
      }),
    );
  });
});

describe('jwtDecodeUnsafe', () => {
  const enc = (o: unknown): string => base64UrlEncode(JSON.stringify(o));
  it('decodes header and payload without verifying', () => {
    const token = `${enc({ alg: 'HS256', typ: 'JWT' })}.${enc({ sub: '42', exp: 1700000000 })}.sig`;
    expect(jwtDecodeUnsafe(token)).toEqual({ header: { alg: 'HS256', typ: 'JWT' }, payload: { sub: '42', exp: 1700000000 } });
  });
  it('returns undefined for malformed, oversized or non-object tokens and strips unsafe keys', () => {
    expect(jwtDecodeUnsafe('a.b')).toBeUndefined();
    expect(jwtDecodeUnsafe('!!.!!.x')).toBeUndefined();
    expect(jwtDecodeUnsafe(`${enc([1])}.${enc({})}.x`)).toBeUndefined();
    expect(jwtDecodeUnsafe(`${enc({})}.${'A'.repeat(20_000)}.x`)).toBeUndefined();
    const polluted = jwtDecodeUnsafe(`${enc({ alg: 'none' })}.${base64UrlEncode('{"__proto__":{"admin":true},"sub":"1"}')}.`);
    expect(polluted?.payload).toEqual({ sub: '1' });
    expect(({} as { admin?: boolean }).admin).toBeUndefined();
  });
});
