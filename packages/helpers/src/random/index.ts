/**
 * Crypto-backed randomness (docs/PLAN-HELPERS.md section 2, section 5): every function draws from
 * `crypto.getRandomValues` and throws `HLP_RANDOM_UNAVAILABLE` without it. Integer sampling is
 * unbiased (rejection, never modulo). The only non-crypto generator is `createSeededRandom`.
 */
import { LimitError, ValidationError } from '../error/index.js';
import { cryptoSource, fillRandom, fisherYates, rangeSize, uniformBelow, unitFloat } from './core.js';

export { createSeededRandom } from './seeded.js';
export type { SeededRandom } from './seeded.js';

/** Largest `randomBytes` request. */
export const MAX_RANDOM_BYTES = 16 * 1024 * 1024;
/** Longest `randomId` / `randomString` / `generatePassword` result. */
export const MAX_RANDOM_LENGTH = 65_536;

/**
 * Uniform integer in `[min, max]` (inclusive); the range may span up to 2^53 values.
 * @example
 * const roll = randomInt(1, 6); // e.g. 4
 * roll >= 1 && roll <= 6 && Number.isInteger(roll); // => true
 */
export function randomInt(min: number, max: number): number {
  const size = rangeSize(min, max);
  return min + uniformBelow(cryptoSource(2), size);
}

/**
 * Uniform float in `[min, max)` with 53 bits of randomness.
 * @example
 * const pct = randomFloat(0, 100); // e.g. 42.1937
 * pct >= 0 && pct < 100; // => true
 */
export function randomFloat(min = 0, max = 1): number {
  if (!Number.isFinite(min) || !Number.isFinite(max) || !(min < max) || !Number.isFinite(max - min)) throw new ValidationError('HLP_RANDOM_RANGE', 'Expected finite bounds with min < max.');
  const next = cryptoSource(4);
  for (;;) {
    const v = min + unitFloat(next) * (max - min);
    if (v < max) return v; // rounding can reach max for tiny ranges
  }
}

/**
 * `true` with the given probability (default 0.5).
 * @example
 * randomBool(0.1); // e.g. false (true about 10% of the time)
 * randomBool(1); // => true
 */
export function randomBool(probability = 0.5): boolean {
  if (!(probability >= 0 && probability <= 1)) throw new ValidationError('HLP_RANDOM_PROBABILITY', 'The probability must be between 0 and 1.');
  return unitFloat(cryptoSource(2)) < probability;
}

/**
 * Cryptographically random bytes (chunked past the 64 KiB `getRandomValues` limit).
 * @example
 * randomBytes(16).length; // => 16
 */
export function randomBytes(length: number): Uint8Array<ArrayBuffer> {
  if (!Number.isInteger(length) || length < 0) throw new ValidationError('HLP_RANDOM_LENGTH', 'The length must be a non-negative integer.');
  if (length > MAX_RANDOM_BYTES) throw new LimitError('HLP_RANDOM_TOO_LARGE', 'The requested byte count exceeds the limit.');
  return fillRandom(new Uint8Array(length));
}

/**
 * Uniformly chosen element, or `undefined` for an empty array. (Named `randomPick` so it
 * does not clash with the object module's `pick`.)
 * @example
 * randomPick(['red', 'green', 'blue']); // e.g. 'green'
 * randomPick([]); // => undefined
 */
export function randomPick<T>(items: readonly T[]): T | undefined {
  return items.length ? items[uniformBelow(cryptoSource(2), items.length)] : undefined;
}

/**
 * Element chosen with probability proportional to its weight. Weights must be finite and
 * non-negative with a positive total. `undefined` for empty input.
 * @example
 * randomPickWeighted(['common', 'rare'], [9, 1]); // e.g. 'common' (90% of the time)
 * randomPickWeighted(['common', 'rare'], [1, 0]); // => 'common'
 */
export function randomPickWeighted<T>(items: readonly T[], weights: readonly number[]): T | undefined {
  if (items.length !== weights.length) throw new ValidationError('HLP_RANDOM_WEIGHTS', 'Items and weights must have the same length.');
  if (!items.length) return undefined;
  let total = 0;
  for (const w of weights) {
    if (!Number.isFinite(w) || w < 0) throw new ValidationError('HLP_RANDOM_WEIGHTS', 'Weights must be finite and non-negative.');
    total += w;
  }
  if (!(total > 0) || !Number.isFinite(total)) throw new ValidationError('HLP_RANDOM_WEIGHTS', 'The total weight must be positive and finite.');
  const r = unitFloat(cryptoSource(2)) * total;
  let acc = 0;
  let last = -1;
  for (let i = 0; i < weights.length; i++) {
    const w = weights[i] ?? 0;
    if (w <= 0) continue;
    acc += w;
    last = i;
    if (r < acc) return items[i];
  }
  return items[last]; // float accumulation fell short of `total`
}

/**
 * `k` distinct elements in random order (partial Fisher-Yates on a copy). Throws when `k > length`.
 * @example
 * const picked = sample([1, 2, 3, 4, 5], 2); // e.g. [4, 1]
 * new Set(picked).size; // => 2
 * sample([1, 2], 3); // => throws HLP_RANDOM_SAMPLE_SIZE
 */
export function sample<T>(items: readonly T[], k: number): T[] {
  if (!Number.isInteger(k) || k < 0 || k > items.length) throw new ValidationError('HLP_RANDOM_SAMPLE_SIZE', 'The sample size must be an integer between 0 and the array length.');
  const arr = items.slice();
  const next = cryptoSource(k * 2);
  for (let i = 0; i < k; i++) {
    const j = i + uniformBelow(next, arr.length - i);
    const t = arr[i] as T;
    arr[i] = arr[j] as T;
    arr[j] = t;
  }
  arr.length = k;
  return arr;
}

/**
 * Shuffled copy (unbiased Fisher-Yates); the input is not modified.
 * @example
 * const deck = [1, 2, 3];
 * const mixed = shuffle(deck); // e.g. [3, 1, 2]
 * [...mixed].sort(); // => [1, 2, 3]
 * deck; // => [1, 2, 3] // input unchanged
 */
export function shuffle<T>(items: readonly T[]): T[] {
  return fisherYates(items.slice(), cryptoSource(items.length));
}

/**
 * Shuffles `items` in place and returns it.
 * @example
 * const deck = ['A', 'K', 'Q', 'J'];
 * shuffleInPlace(deck) === deck; // => true
 * deck; // e.g. ['Q', 'A', 'J', 'K']
 */
export function shuffleInPlace<T>(items: T[]): T[] {
  return fisherYates(items, cryptoSource(items.length));
}

const HEX: readonly string[] = Array.from({ length: 256 }, (_, i) => i.toString(16).padStart(2, '0'));

function formatUuid(b: Uint8Array): string {
  let s = '';
  for (let i = 0; i < 16; i++) {
    if (i === 4 || i === 6 || i === 8 || i === 10) s += '-';
    s += HEX[b[i] ?? 0] ?? '00';
  }
  return s;
}

/**
 * Random UUID version 4 (`crypto.randomUUID` when available, e.g. in secure contexts).
 * @example
 * const id = uuidV4(); // e.g. '3b241101-e2bb-4255-8caf-4136c566a962'
 * isUuid(id, 4); // => true
 */
export function uuidV4(): string {
  const c = (globalThis as { crypto?: Crypto }).crypto;
  if (typeof c?.randomUUID === 'function') return c.randomUUID();
  const b = fillRandom(new Uint8Array(16));
  b[6] = ((b[6] ?? 0) & 0x0f) | 0x40;
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(b);
}

const MAX_MS = 2 ** 48 - 1;

function buildV7(ms: number, randA: number, rand: Uint8Array): string {
  const b = new Uint8Array(16);
  let t = ms;
  for (let i = 5; i >= 0; i--) {
    b[i] = t % 256;
    t = Math.floor(t / 256);
  }
  b[6] = 0x70 | ((randA >>> 8) & 0x0f);
  b[7] = randA & 0xff;
  b.set(rand.subarray(0, 8), 8);
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80;
  return formatUuid(b);
}

function checkMs(ms: number): void {
  if (!Number.isInteger(ms) || ms < 0 || ms > MAX_MS) throw new ValidationError('HLP_RANDOM_TIMESTAMP', 'The timestamp must be an integer millisecond value within 48 bits.');
}

/**
 * Time-ordered UUID version 7 (RFC 9562): 48-bit Unix ms timestamp, then 74 random bits.
 * Stateless: two ids in the same millisecond are unordered; use `createUuidV7Generator` for strict order.
 * @example
 * uuidV7(); // e.g. '01922e6a-7c3b-7d4e-9f12-4c1d2e3f4a5b'
 * uuidV7(1700000000000).slice(0, 13); // => '018bcfe5-6800'
 */
export function uuidV7(timestamp: number = Date.now()): string {
  checkMs(timestamp);
  const r = fillRandom(new Uint8Array(10));
  return buildV7(timestamp, ((r[8] ?? 0) << 8) | (r[9] ?? 0), r);
}

/**
 * Returns a UUID v7 generator that is strictly monotonic (RFC 9562 section 6.2 method 1): within one
 * millisecond, or when the clock moves backwards, the 12-bit `rand_a` field is used as a counter.
 * @example const next = createUuidV7Generator(); next() < next() // => true
 */
export function createUuidV7Generator(clock: () => number = Date.now): () => string {
  let lastMs = -1;
  let counter = 0;
  return () => {
    let ms = clock();
    checkMs(ms);
    const r = fillRandom(new Uint8Array(10));
    if (ms > lastMs) {
      counter = (((r[8] ?? 0) << 8) | (r[9] ?? 0)) & 0x7ff; // leave headroom for increments
    } else {
      ms = lastMs;
      counter++;
      if (counter > 0xfff) {
        ms = lastMs + 1;
        counter = (((r[8] ?? 0) << 8) | (r[9] ?? 0)) & 0x7ff;
        checkMs(ms);
      }
    }
    lastMs = ms;
    return buildV7(ms, counter, r);
  };
}

/**
 * Millisecond timestamp embedded in a UUID v7, or `undefined` for other strings.
 * @example uuidV7Timestamp(uuidV7(1700000000000)) // => 1700000000000
 */
export function uuidV7Timestamp(uuid: string): number | undefined {
  if (!isUuid(uuid, 7)) return undefined;
  return Number.parseInt(uuid.slice(0, 8) + uuid.slice(9, 13), 16);
}

const UUID_RE = /^[\da-f]{8}-[\da-f]{4}-([1-8])[\da-f]{3}-[89ab][\da-f]{3}-[\da-f]{12}$/i;

/**
 * True for an RFC 9562 UUID string (versions 1-8, variant 10xx), optionally of a given version.
 * Without a version, the nil and max UUIDs are also accepted.
 * @example isUuid('01922e6a-7c3b-7d4e-9f12-0123456789ab', 7) // => true
 */
export function isUuid(value: unknown, version?: 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8): boolean {
  if (typeof value !== 'string' || value.length !== 36) return false;
  if (version === undefined && (value === '00000000-0000-0000-0000-000000000000' || value.toLowerCase() === 'ffffffff-ffff-ffff-ffff-ffffffffffff')) return true;
  const m = UUID_RE.exec(value);
  return m !== null && (version === undefined || Number(m[1]) === version);
}

/** URL-safe 64-character alphabet used by `randomId`. */
export const URL_ALPHABET = 'useandom-26T198340PX75pxJACKVERYMINDBUSHWOLF_GQZbfghjklqvwyzrict';

function checkLength(length: number): void {
  if (!Number.isInteger(length) || length < 0) throw new ValidationError('HLP_RANDOM_LENGTH', 'The length must be a non-negative integer.');
  if (length > MAX_RANDOM_LENGTH) throw new LimitError('HLP_RANDOM_TOO_LARGE', 'The requested length exceeds the limit.');
}

function alphabetChars(alphabet: string): string[] {
  const chars = Array.from(alphabet);
  if (chars.length < 2 || chars.length > 256 || new Set(chars).size !== chars.length) throw new ValidationError('HLP_RANDOM_ALPHABET', 'The alphabet must have 2 to 256 unique characters.');
  return chars;
}

function fromAlphabet(chars: readonly string[], length: number): string {
  let bits = 0;
  while (2 ** bits < chars.length) bits++;
  const mask = (2 ** bits) - 1;
  // Expected draws per char < 2; over-allocate so most ids need one getRandomValues call.
  const step = Math.min(65_536, Math.ceil((1.6 * mask * length) / chars.length) + 8);
  let out = '';
  let n = 0;
  while (n < length) {
    const bytes = fillRandom(new Uint8Array(step));
    for (let i = 0; i < step && n < length; i++) {
      const c = chars[(bytes[i] ?? 0) & mask];
      if (c !== undefined) {
        out += c;
        n++;
      }
    }
  }
  return out;
}

/**
 * Unbiased random id (nanoid-style mask and rejection). Default: 21 URL-safe characters (~126 bits).
 * @example
 * randomId(); // e.g. 'V1StGXR8_Z5jdHi6B-myT'
 * randomId(8, '0123456789abcdef').length; // => 8
 */
export function randomId(length = 21, alphabet: string = URL_ALPHABET): string {
  checkLength(length);
  return fromAlphabet(alphabetChars(alphabet), length);
}

const LOWER = 'abcdefghijklmnopqrstuvwxyz';
const UPPER = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ';
const DIGITS = '0123456789';
const CHARSETS = { alpha: LOWER + UPPER, numeric: DIGITS, alphanumeric: DIGITS + UPPER + LOWER, hex: '0123456789abcdef' } as const;

export interface RandomStringOptions {
  /** Preset character set. Default `alphanumeric`. */
  readonly charset?: keyof typeof CHARSETS;
  /** Custom alphabet (2-256 unique characters); overrides `charset`. */
  readonly alphabet?: string;
}

/**
 * Unbiased random string from a preset or custom character set.
 * @example
 * const token = randomString(8, { charset: 'hex' }); // e.g. '9f86d081'
 * /^[0-9a-f]{8}$/.test(token); // => true
 */
export function randomString(length: number, options: RandomStringOptions = {}): string {
  checkLength(length);
  return fromAlphabet(alphabetChars(options.alphabet ?? CHARSETS[options.charset ?? 'alphanumeric']), length);
}

/** Characters dropped by `generatePassword({ excludeAmbiguous: true })`. */
export const AMBIGUOUS_CHARACTERS = 'Il1|O0o`\'"';
const DEFAULT_SYMBOLS = '!@#$%^&*()-_=+[]{};:,.<>?/~';

export interface PasswordOptions {
  /** Default 16; at least 4. */
  readonly length?: number;
  /** Include a-z. Default true. */
  readonly lower?: boolean;
  /** Include A-Z. Default true. */
  readonly upper?: boolean;
  /** Include 0-9. Default true. */
  readonly digits?: boolean;
  /** Include symbols; `true` (default) uses a built-in set, a string supplies your own. */
  readonly symbols?: boolean | string;
  /** Drop look-alike characters (I l 1 | O 0 o and quotes). Default false. */
  readonly excludeAmbiguous?: boolean;
  /** Minimum characters from each enabled class. Default 1. */
  readonly minEach?: number;
}

/**
 * Password meeting a character-class policy: `minEach` characters from every enabled class,
 * the rest from their union, then an unbiased shuffle.
 * @example
 * const pw = generatePassword({ length: 20, symbols: false }); // e.g. 'q7GmT2xkR4bNw9LpZs3H'
 * pw.length; // => 20
 */
export function generatePassword(options: PasswordOptions = {}): string {
  const { length = 16, lower = true, upper = true, digits = true, symbols = true, excludeAmbiguous = false, minEach = 1 } = options;
  checkLength(length);
  if (length < 4) throw new ValidationError('HLP_RANDOM_PASSWORD', 'The password length must be at least 4.');
  if (!Number.isInteger(minEach) || minEach < 0) throw new ValidationError('HLP_RANDOM_PASSWORD', 'minEach must be a non-negative integer.');
  const drop = (s: string): string[] => Array.from(new Set(Array.from(s))).filter((c) => !excludeAmbiguous || !AMBIGUOUS_CHARACTERS.includes(c));
  const classes: string[][] = [];
  if (lower) classes.push(drop(LOWER));
  if (upper) classes.push(drop(UPPER));
  if (digits) classes.push(drop(DIGITS));
  if (symbols !== false) classes.push(drop(symbols === true ? DEFAULT_SYMBOLS : symbols));
  if (!classes.length || classes.some((c) => c.length === 0)) throw new ValidationError('HLP_RANDOM_PASSWORD', 'Enable at least one non-empty character class.');
  if (minEach * classes.length > length) throw new ValidationError('HLP_RANDOM_PASSWORD', 'The length is too short for the required characters.');
  const all = Array.from(new Set(classes.flat()));
  const next = cryptoSource(length * 3);
  const out: string[] = [];
  for (const cls of classes) for (let i = 0; i < minEach; i++) out.push(cls[uniformBelow(next, cls.length)] ?? '');
  while (out.length < length) out.push(all[uniformBelow(next, all.length)] ?? '');
  return fisherYates(out, next).join('');
}

/**
 * Numeric one-time code with uniformly random digits (leading zeros kept), 4-12 digits.
 * @example
 * const code = randomOtp(); // e.g. '042917'
 * /^[0-9]{6}$/.test(code); // => true
 */
export function randomOtp(digits = 6): string {
  if (!Number.isInteger(digits) || digits < 4 || digits > 12) throw new ValidationError('HLP_RANDOM_OTP', 'OTP length must be an integer between 4 and 12.');
  return fromAlphabet(Array.from(DIGITS), digits);
}
