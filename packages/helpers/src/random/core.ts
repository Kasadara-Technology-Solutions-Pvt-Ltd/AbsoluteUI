/**
 * Crypto-backed entropy source and unbiased integer sampling (internal).
 */
import { HelperError, ValidationError } from '../error/index.js';

/** `getRandomValues` fills at most 65,536 bytes per call. */
const CHUNK = 65_536;
const TWO32 = 4_294_967_296;

function cryptoObject(): Crypto {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof c?.getRandomValues !== 'function') throw new HelperError('HLP_RANDOM_UNAVAILABLE', 'A cryptographic random source (crypto.getRandomValues) is not available.', { kind: 'unsupported' });
  return c;
}

/** Fills `bytes` in 64 KiB chunks. */
export function fillRandom(bytes: Uint8Array<ArrayBuffer>): Uint8Array<ArrayBuffer> {
  const c = cryptoObject();
  for (let i = 0; i < bytes.length; i += CHUNK) c.getRandomValues(bytes.subarray(i, Math.min(bytes.length, i + CHUNK)));
  return bytes;
}

/** Source of uniform 32-bit words. */
export type U32Source = () => number;

/** Buffered crypto word source for one operation (no shared global state). */
export function cryptoSource(expected = 1): U32Source {
  const size = Math.max(1, Math.min(CHUNK / 4, expected));
  const c = cryptoObject();
  const buf = new Uint32Array(size);
  let pos = size;
  return () => {
    if (pos >= size) {
      c.getRandomValues(buf);
      pos = 0;
    }
    return buf[pos++] ?? 0;
  };
}

/** Uniform integer in `[0, n)` for `1 <= n <= 2^53` by masked rejection sampling (no modulo bias). */
export function uniformBelow(next: U32Source, n: number): number {
  if (n <= 1) return 0;
  if (n <= TWO32) {
    let bits = 0;
    while (2 ** bits < n) bits++;
    const mask = bits >= 32 ? 0xffffffff : (2 ** bits) - 1;
    for (;;) {
      const v = (next() & mask) >>> 0;
      if (v < n) return v;
    }
  }
  let hiBits = 0;
  while (2 ** hiBits * TWO32 < n) hiBits++;
  const hiMask = (2 ** hiBits) - 1;
  for (;;) {
    const v = (next() & hiMask) * TWO32 + next();
    if (v < n) return v;
  }
}

/** Uniform float in `[0, 1)` with 53 random bits. */
export function unitFloat(next: U32Source): number {
  return ((next() >>> 5) * 67_108_864 + (next() >>> 6)) / 9_007_199_254_740_992;
}

/** Validates an inclusive integer range whose size is at most 2^53 and returns that size. */
export function rangeSize(min: number, max: number): number {
  if (!Number.isSafeInteger(min) || !Number.isSafeInteger(max)) throw new ValidationError('HLP_RANDOM_RANGE', 'Bounds must be safe integers.');
  if (min > max) throw new ValidationError('HLP_RANDOM_RANGE', 'The minimum must not exceed the maximum.');
  const size = max - min + 1;
  if (size > 2 ** 53) throw new ValidationError('HLP_RANDOM_RANGE', 'The range must not exceed 2^53 values.');
  return size;
}

/** In-place Fisher-Yates using `next`. */
export function fisherYates<T>(arr: T[], next: U32Source): T[] {
  for (let i = arr.length - 1; i > 0; i--) {
    const j = uniformBelow(next, i + 1);
    const t = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = t;
  }
  return arr;
}
