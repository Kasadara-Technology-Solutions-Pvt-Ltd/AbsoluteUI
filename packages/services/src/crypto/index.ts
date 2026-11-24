/**
 * Web Crypto wrappers: digests, HMAC, AES-GCM, PBKDF2, ECDSA and timing-safe comparison
 * (docs/PLAN-HELPERS.md section 3, section 5). All operations are async and accept `string` (UTF-8) or bytes.
 * Web Crypto requires a secure context (HTTPS or localhost) in browsers; without it every
 * operation rejects with `SVC_CRYPTO_UNAVAILABLE`.
 */
import { HelperError, LimitError, ValidationError } from '@absoluteui/helpers/error';
import { base64UrlDecode, base64UrlEncode, hexEncode, utf8Encode } from '@absoluteui/helpers/encoding';
import { randomBytes } from '@absoluteui/helpers/random';
import { safeJsonParse } from '@absoluteui/helpers/json';

/** Text (encoded as UTF-8) or bytes. */
export type CryptoInput = string | BufferSource;

/** SHA family digests supported by Web Crypto. */
export type DigestAlgorithm = 'SHA-1' | 'SHA-256' | 'SHA-384' | 'SHA-512';

/** Hashes allowed for HMAC, PBKDF2 and ECDSA. SHA-1 is kept only for interoperability. */
export type HashAlgorithm = DigestAlgorithm;

const HASHES: readonly string[] = ['SHA-1', 'SHA-256', 'SHA-384', 'SHA-512'];
const AES_LENGTHS: readonly number[] = [128, 192, 256];
const CURVES: readonly string[] = ['P-256', 'P-384', 'P-521'];

/**
 * True when `crypto.subtle` is usable (secure context in browsers).
 * @example
 * const canEncrypt = isWebCryptoAvailable(); // false on plain HTTP pages
 */
export function isWebCryptoAvailable(): boolean {
  return (globalThis.crypto as Partial<Crypto> | undefined)?.subtle != null;
}

function subtle(): SubtleCrypto {
  const s = (globalThis.crypto as Partial<Crypto> | undefined)?.subtle;
  if (!s) throw new HelperError('SVC_CRYPTO_UNAVAILABLE', 'Web Crypto is not available (a secure context is required).', { kind: 'unsupported' });
  return s;
}

function assertHash(hash: string): void {
  if (!HASHES.includes(hash)) throw new ValidationError('SVC_CRYPTO_INVALID_HASH', 'Unsupported hash algorithm.');
}

/** Converts input to a fresh-or-viewed `Uint8Array` backed by an `ArrayBuffer`. */
function bytes(input: CryptoInput): Uint8Array<ArrayBuffer> {
  if (typeof input === 'string') return utf8Encode(input);
  if (input instanceof ArrayBuffer) return new Uint8Array(input);
  if (ArrayBuffer.isView(input)) {
    const view = new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
    return input.buffer instanceof ArrayBuffer ? view : new Uint8Array(view);
  }
  throw new ValidationError('SVC_CRYPTO_INVALID_INPUT', 'Input must be a string, ArrayBuffer or typed array.');
}

// ---------------------------------------------------------------------------
// Digests

/**
 * Hashes `data` with a SHA algorithm.
 * @example
 * const d = await digest('SHA-256', 'abc');
 * d.length; // => 32
 */
export async function digest(algorithm: DigestAlgorithm, data: CryptoInput): Promise<Uint8Array<ArrayBuffer>> {
  assertHash(algorithm);
  return new Uint8Array(await subtle().digest(algorithm, bytes(data)));
}

/**
 * Hashes `data` and returns lowercase hex.
 * @example
 * await digestHex('SHA-1', 'abc'); // => 'a9993e364706816aba3e25717850c26c9cd0d89d'
 */
export async function digestHex(algorithm: DigestAlgorithm, data: CryptoInput): Promise<string> {
  return hexEncode(await digest(algorithm, data));
}

/**
 * SHA-256 as lowercase hex.
 * @example await sha256Hex('abc') // => 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad'
 */
export function sha256Hex(data: CryptoInput): Promise<string> {
  return digestHex('SHA-256', data);
}

// ---------------------------------------------------------------------------
// HMAC

/** Options for importing or generating keys. */
export interface KeyOptions {
  /** Whether `exportKey` may read the key material. Default false. */
  readonly extractable?: boolean;
}

/**
 * Imports a raw HMAC secret as a non-extractable `CryptoKey` (sign and verify).
 * @example
 * const key = await importHmacKey('webhook-secret', 'SHA-256');
 * await hmacHex(key, 'payload') === await hmacHex('webhook-secret', 'payload'); // => true
 */
export async function importHmacKey(secret: CryptoInput, hash: HashAlgorithm = 'SHA-256', options: KeyOptions = {}): Promise<CryptoKey> {
  assertHash(hash);
  const raw = bytes(secret);
  if (raw.byteLength === 0) throw new ValidationError('SVC_CRYPTO_EMPTY_KEY', 'HMAC key must not be empty.');
  return subtle().importKey('raw', raw, { name: 'HMAC', hash }, options.extractable ?? false, ['sign', 'verify']);
}

const hmacKey = (key: CryptoKey | CryptoInput, hash: HashAlgorithm): Promise<CryptoKey> => (key instanceof CryptoKey ? Promise.resolve(key) : importHmacKey(key, hash));

/**
 * HMAC signature of `data`. `key` is a `CryptoKey` from {@link importHmacKey} or raw secret material.
 * @example
 * const mac = await hmac('Jefe', 'what do ya want for nothing?', 'SHA-256');
 * mac.length; // => 32
 */
export async function hmac(key: CryptoKey | CryptoInput, data: CryptoInput, hash: HashAlgorithm = 'SHA-256'): Promise<Uint8Array<ArrayBuffer>> {
  const k = await hmacKey(key, hash);
  return new Uint8Array(await subtle().sign('HMAC', k, bytes(data)));
}

/**
 * HMAC as lowercase hex.
 * @example
 * await hmacHex('Jefe', 'what do ya want for nothing?'); // => '5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843' // RFC 4231
 */
export async function hmacHex(key: CryptoKey | CryptoInput, data: CryptoInput, hash: HashAlgorithm = 'SHA-256'): Promise<string> {
  return hexEncode(await hmac(key, data, hash));
}

/**
 * Verifies an HMAC with `crypto.subtle.verify` (constant-time in the platform).
 * @example
 * const body = '{"event":"leave.approved"}';
 * const signature = await hmac('webhook-secret', body);
 * await hmacVerify('webhook-secret', body, signature); // => true
 * await hmacVerify('webhook-secret', body + ' ', signature); // => false
 */
export async function hmacVerify(key: CryptoKey | CryptoInput, data: CryptoInput, signature: BufferSource, hash: HashAlgorithm = 'SHA-256'): Promise<boolean> {
  const k = await hmacKey(key, hash);
  return subtle().verify('HMAC', k, bytes(signature), bytes(data));
}

// ---------------------------------------------------------------------------
// AES-GCM

/** AES key sizes in bits. */
export type AesKeyLength = 128 | 192 | 256;

/** AES-GCM IV length in bytes (96 bits, the recommended size). */
export const AES_GCM_IV_BYTES = 12;

/**
 * Generates a random AES-GCM key (default 256-bit, non-extractable).
 * @example
 * const key = await generateAesKey();
 * key.algorithm.name; // => 'AES-GCM'
 */
export async function generateAesKey(options: KeyOptions & { readonly length?: AesKeyLength } = {}): Promise<CryptoKey> {
  const length = options.length ?? 256;
  if (!AES_LENGTHS.includes(length)) throw new ValidationError('SVC_CRYPTO_INVALID_KEY_LENGTH', 'AES key length must be 128, 192 or 256 bits.');
  return subtle().generateKey({ name: 'AES-GCM', length }, options.extractable ?? false, ['encrypt', 'decrypt']);
}

/**
 * Imports raw AES key bytes (16, 24 or 32) as a non-extractable AES-GCM key.
 * @example
 * import { base64UrlDecode } from '@absoluteui/helpers/encoding';
 * declare const stored: string; // base64url key saved earlier
 * const key = await importAesKey(base64UrlDecode(stored));
 */
export async function importAesKey(raw: BufferSource, options: KeyOptions = {}): Promise<CryptoKey> {
  const b = bytes(raw);
  if (b.byteLength !== 16 && b.byteLength !== 24 && b.byteLength !== 32) throw new ValidationError('SVC_CRYPTO_INVALID_KEY_LENGTH', 'AES key must be 16, 24 or 32 bytes.');
  return subtle().importKey('raw', b, { name: 'AES-GCM' }, options.extractable ?? false, ['encrypt', 'decrypt']);
}

/**
 * Exports an extractable key as raw bytes, or as a JWK with `format: 'jwk'`.
 * @example
 * const key = await generateAesKey({ extractable: true }); // exportKey needs an extractable key
 * const raw = await exportKey(key);
 * raw.length; // => 32 // 256-bit key
 */
export async function exportKey(key: CryptoKey, format?: 'raw'): Promise<Uint8Array<ArrayBuffer>>;
export async function exportKey(key: CryptoKey, format: 'jwk'): Promise<JsonWebKey>;
export async function exportKey(key: CryptoKey, format: 'raw' | 'jwk' = 'raw'): Promise<Uint8Array<ArrayBuffer> | JsonWebKey> {
  if (!key.extractable) throw new ValidationError('SVC_CRYPTO_NOT_EXTRACTABLE', 'The key is not extractable.');
  if (format === 'jwk') return subtle().exportKey('jwk', key);
  return new Uint8Array(await subtle().exportKey('raw', key));
}

/** AES-GCM output: the random IV and the ciphertext with its 128-bit tag appended. */
export interface AesGcmPayload {
  readonly iv: Uint8Array<ArrayBuffer>;
  readonly ciphertext: Uint8Array<ArrayBuffer>;
}

/** Options for AES-GCM operations. */
export interface AesGcmOptions {
  /** Additional authenticated data: bound to the ciphertext but not encrypted (for example a record id). */
  readonly aad?: CryptoInput;
}

const gcmParams = (iv: Uint8Array<ArrayBuffer>, aad: CryptoInput | undefined): AesGcmParams => (aad === undefined ? { name: 'AES-GCM', iv } : { name: 'AES-GCM', iv, additionalData: bytes(aad) });

/**
 * Encrypts with AES-GCM using a fresh random 96-bit IV per call (never reuse an IV with the same key).
 * @example
 * const key = await generateAesKey();
 * const { iv, ciphertext } = await aesGcmEncrypt(key, 'secret', { aad: 'user:42' });
 * iv.length; // => 12
 */
export async function aesGcmEncrypt(key: CryptoKey, plaintext: CryptoInput, options: AesGcmOptions = {}): Promise<AesGcmPayload> {
  const iv = randomBytes(AES_GCM_IV_BYTES);
  const ct = await subtle().encrypt(gcmParams(iv, options.aad), key, bytes(plaintext));
  return { iv, ciphertext: new Uint8Array(ct) };
}

/**
 * Packs a payload as `iv || ciphertext`.
 * @example
 * const key = await generateAesKey();
 * const packed = packAesGcm(await aesGcmEncrypt(key, 'secret'));
 * packed.length; // => 34 // 12-byte IV + 6 bytes + 16-byte tag
 */
export function packAesGcm(payload: AesGcmPayload): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(payload.iv.byteLength + payload.ciphertext.byteLength);
  out.set(payload.iv, 0);
  out.set(payload.ciphertext, payload.iv.byteLength);
  return out;
}

/**
 * Splits `iv || ciphertext` (throws `SVC_CRYPTO_DECRYPT_FAILED` when too short to hold an IV and tag).
 * @example
 * const key = await generateAesKey();
 * const packed = packAesGcm(await aesGcmEncrypt(key, 'secret'));
 * const { iv, ciphertext } = unpackAesGcm(packed);
 * ciphertext.byteLength; // => 22
 */
export function unpackAesGcm(packed: BufferSource): AesGcmPayload {
  const b = bytes(packed);
  if (b.byteLength < AES_GCM_IV_BYTES + 16) throw decryptFailed();
  return { iv: b.slice(0, AES_GCM_IV_BYTES), ciphertext: b.slice(AES_GCM_IV_BYTES) };
}

function decryptFailed(): HelperError {
  // Deliberately no cause: platform errors could hint at why authentication failed.
  return new HelperError('SVC_CRYPTO_DECRYPT_FAILED', 'Decryption failed.', { kind: 'validation' });
}

/**
 * Decrypts an AES-GCM payload (or packed `iv || ciphertext` bytes). Any failure, including tampering
 * or a wrong key or AAD, rejects with `SVC_CRYPTO_DECRYPT_FAILED` and no further detail.
 * @example
 * const key = await generateAesKey();
 * const payload = await aesGcmEncrypt(key, 'secret', { aad: 'user:42' });
 * const plain = await aesGcmDecrypt(key, payload, { aad: 'user:42' });
 * new TextDecoder().decode(plain); // => 'secret'
 */
export async function aesGcmDecrypt(key: CryptoKey, payload: AesGcmPayload | BufferSource, options: AesGcmOptions = {}): Promise<Uint8Array<ArrayBuffer>> {
  const p = 'iv' in payload && 'ciphertext' in payload ? payload : unpackAesGcm(payload);
  const s = subtle();
  try {
    return new Uint8Array(await s.decrypt(gcmParams(bytes(p.iv), options.aad), key, bytes(p.ciphertext)));
  } catch {
    throw decryptFailed();
  }
}

/**
 * Encrypts text to a compact base64url token (`iv || ciphertext`).
 * @example
 * const key = await generateAesKey();
 * const token = await aesGcmEncryptString(key, JSON.stringify({ reason: 'Annual leave' }));
 * typeof token; // => 'string'
 */
export async function aesGcmEncryptString(key: CryptoKey, plaintext: string, options: AesGcmOptions = {}): Promise<string> {
  return base64UrlEncode(packAesGcm(await aesGcmEncrypt(key, plaintext, options)));
}

/**
 * Decrypts a token from {@link aesGcmEncryptString} back to text.
 * @example
 * const key = await generateAesKey();
 * const token = await aesGcmEncryptString(key, 'Annual leave');
 * await aesGcmDecryptString(key, token); // => 'Annual leave'
 */
export async function aesGcmDecryptString(key: CryptoKey, token: string, options: AesGcmOptions = {}): Promise<string> {
  let packed: Uint8Array<ArrayBuffer>;
  try {
    packed = base64UrlDecode(token);
  } catch {
    throw decryptFailed();
  }
  const plain = await aesGcmDecrypt(key, packed, options);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(plain);
  } catch {
    throw decryptFailed();
  }
}

// ---------------------------------------------------------------------------
// PBKDF2

/** OWASP (2023) minimum PBKDF2 iterations for SHA-256. */
export const PBKDF2_DEFAULT_ITERATIONS = 600_000;
const PBKDF2_MAX_ITERATIONS = 10_000_000;

/** PBKDF2 options. */
export interface Pbkdf2Options {
  /** Default {@link PBKDF2_DEFAULT_ITERATIONS} (OWASP 2023 for SHA-256; use 1,300,000 for SHA-1, 210,000 for SHA-512). */
  readonly iterations?: number;
  /** Default `'SHA-256'`. */
  readonly hash?: HashAlgorithm;
}

async function pbkdf2Base(password: CryptoInput, salt: CryptoInput, options: Pbkdf2Options): Promise<{ base: CryptoKey; params: Pbkdf2Params }> {
  const { iterations = PBKDF2_DEFAULT_ITERATIONS, hash = 'SHA-256' } = options;
  assertHash(hash);
  if (!Number.isInteger(iterations) || iterations < 1) throw new ValidationError('SVC_CRYPTO_INVALID_ITERATIONS', 'Iterations must be a positive integer.');
  if (iterations > PBKDF2_MAX_ITERATIONS) throw new LimitError('SVC_CRYPTO_TOO_MANY_ITERATIONS', 'Iterations exceed the maximum.', { details: { max: PBKDF2_MAX_ITERATIONS } });
  const base = await subtle().importKey('raw', bytes(password), 'PBKDF2', false, ['deriveBits', 'deriveKey']);
  return { base, params: { name: 'PBKDF2', salt: bytes(salt), iterations, hash } };
}

/**
 * Derives raw bits from a password (for example to compare against a stored hash).
 * @example
 * import { hexEncode } from '@absoluteui/helpers/encoding';
 * const bits = await deriveBitsPbkdf2('password', 'salt', { iterations: 1, hash: 'SHA-1', length: 160 });
 * hexEncode(bits); // => '0c60c80f961f0e71f3a9b524af6012062fe037a6' // RFC 6070
 */
export async function deriveBitsPbkdf2(password: CryptoInput, salt: CryptoInput, options: Pbkdf2Options & { readonly length?: number } = {}): Promise<Uint8Array<ArrayBuffer>> {
  const length = options.length ?? 256;
  if (!Number.isInteger(length) || length <= 0 || length % 8 !== 0 || length > 8192) throw new ValidationError('SVC_CRYPTO_INVALID_LENGTH', 'Length must be a positive multiple of 8 bits, at most 8192.');
  const { base, params } = await pbkdf2Base(password, salt, options);
  return new Uint8Array(await subtle().deriveBits(params, base, length));
}

/**
 * Derives a non-extractable AES-GCM key from a password.
 * @example
 * const salt = randomSalt(); // store it with the encrypted data
 * const key = await deriveKeyPbkdf2('correct horse battery staple', salt);
 * key.algorithm.name; // => 'AES-GCM'
 */
export async function deriveKeyPbkdf2(password: CryptoInput, salt: CryptoInput, options: Pbkdf2Options & KeyOptions & { readonly length?: AesKeyLength } = {}): Promise<CryptoKey> {
  const length = options.length ?? 256;
  if (!AES_LENGTHS.includes(length)) throw new ValidationError('SVC_CRYPTO_INVALID_KEY_LENGTH', 'AES key length must be 128, 192 or 256 bits.');
  const { base, params } = await pbkdf2Base(password, salt, options);
  return subtle().deriveKey(params, base, { name: 'AES-GCM', length }, options.extractable ?? false, ['encrypt', 'decrypt']);
}

/**
 * Cryptographically random salt (default 16 bytes).
 * @example
 * const salt = randomSalt();
 * salt.length; // => 16
 */
export function randomSalt(length = 16): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(length) || length < 8 || length > 1024) throw new ValidationError('SVC_CRYPTO_INVALID_LENGTH', 'Salt length must be an integer between 8 and 1024 bytes.');
  return randomBytes(length);
}

// ---------------------------------------------------------------------------
// Comparison

/**
 * Compares two values in time that depends only on the longer length, not on where they differ.
 * Strings are compared as UTF-8 bytes. Prefer {@link hmacVerify} for MACs.
 * @example
 * timingSafeEqual('csrf-token-1', 'csrf-token-1'); // => true
 * timingSafeEqual('csrf-token-1', 'csrf-token-2'); // => false
 */
export function timingSafeEqual(a: CryptoInput, b: CryptoInput): boolean {
  const x = bytes(a);
  const y = bytes(b);
  const n = Math.max(x.byteLength, y.byteLength);
  let diff = x.byteLength ^ y.byteLength;
  for (let i = 0; i < n; i++) diff |= (x[i] ?? 0) ^ (y[i] ?? 0);
  return diff === 0;
}

// ---------------------------------------------------------------------------
// ECDSA

/** NIST curves supported by Web Crypto ECDSA. */
export type EcdsaCurve = 'P-256' | 'P-384' | 'P-521';

/**
 * Generates an ECDSA key pair (private key non-extractable by default; the public key is always extractable).
 * @example
 * const { privateKey, publicKey } = await generateEcdsaKeyPair();
 * publicKey.type; // => 'public'
 */
export function generateEcdsaKeyPair(curve: EcdsaCurve = 'P-256', options: KeyOptions = {}): Promise<CryptoKeyPair> {
  if (!CURVES.includes(curve)) throw new ValidationError('SVC_CRYPTO_INVALID_CURVE', 'Unsupported curve.');
  return subtle().generateKey({ name: 'ECDSA', namedCurve: curve }, options.extractable ?? false, ['sign', 'verify']);
}

/**
 * Signs with ECDSA (IEEE P1363 `r || s` signature format).
 * @example
 * const { privateKey } = await generateEcdsaKeyPair();
 * const sig = await ecdsaSign(privateKey, 'payroll-2026-09.csv');
 * sig.length; // => 64 // P-256 r||s
 */
export async function ecdsaSign(privateKey: CryptoKey, data: CryptoInput, hash: HashAlgorithm = 'SHA-256'): Promise<Uint8Array<ArrayBuffer>> {
  assertHash(hash);
  return new Uint8Array(await subtle().sign({ name: 'ECDSA', hash }, privateKey, bytes(data)));
}

/**
 * Verifies an ECDSA signature.
 * @example
 * const { privateKey, publicKey } = await generateEcdsaKeyPair();
 * const sig = await ecdsaSign(privateKey, 'payroll-2026-09.csv');
 * await ecdsaVerify(publicKey, sig, 'payroll-2026-09.csv'); // => true
 */
export async function ecdsaVerify(publicKey: CryptoKey, signature: BufferSource, data: CryptoInput, hash: HashAlgorithm = 'SHA-256'): Promise<boolean> {
  assertHash(hash);
  return subtle().verify({ name: 'ECDSA', hash }, publicKey, bytes(signature), bytes(data));
}

// ---------------------------------------------------------------------------
// JWT

/** Decoded, UNVERIFIED JWT parts. */
export interface UnverifiedJwt {
  readonly header: Readonly<Record<string, unknown>>;
  readonly payload: Readonly<Record<string, unknown>>;
}

const MAX_JWT_LENGTH = 16_384;
const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/**
 * Decodes a JWT's header and payload WITHOUT verifying the signature, expiry or issuer.
 * Use only to read display hints (for example `exp` for a session-timeout warning) from a token
 * the server already trusts; never make authorization decisions on the result.
 * Returns `undefined` for malformed or oversized (> 16 KiB) tokens.
 * @example
 * const token = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiI0MiIsImV4cCI6MTc5MDAwMDAwMH0.sig';
 * jwtDecodeUnsafe(token)?.payload['exp']; // => 1790000000
 * jwtDecodeUnsafe('not-a-jwt'); // => undefined
 */
export function jwtDecodeUnsafe(token: string): UnverifiedJwt | undefined {
  if (typeof token !== 'string' || token.length > MAX_JWT_LENGTH) return undefined;
  const parts = token.split('.');
  if (parts.length !== 3) return undefined;
  const part = (s: string | undefined): Record<string, unknown> | undefined => {
    if (s === undefined || s.length === 0) return undefined;
    try {
      const text = new TextDecoder('utf-8', { fatal: true }).decode(base64UrlDecode(s));
      const r = safeJsonParse(text, { maxDepth: 32, maxKeys: 256, unsafeKeys: 'strip' });
      return r.ok && isRecord(r.value) ? r.value : undefined;
    } catch {
      return undefined;
    }
  };
  const header = part(parts[0]);
  const payload = part(parts[1]);
  if (!header || !payload) return undefined;
  return { header, payload };
}
