/**
 * Boolean helpers (docs/PLAN-HELPERS.md section 2 `boolean`): lenient parsing, logic operators,
 * counting and text labels.
 */

export interface ParseBooleanOptions {
  /** Only accept booleans and `'true'`/`'false'` (case-insensitive, trimmed). Default false. */
  readonly strict?: boolean;
  /** Extra accepted words for `true` (compared case-insensitively after trimming), e.g. `['ja']`. */
  readonly trueValues?: readonly string[];
  /** Extra accepted words for `false`, e.g. `['nein']`. */
  readonly falseValues?: readonly string[];
}

const TRUE_WORDS = new Set(['true', 'yes', 'y', 'on', '1']);
const FALSE_WORDS = new Set(['false', 'no', 'n', 'off', '0']);
const MAX_TEXT = 64;

/**
 * Parses `true/false/yes/no/y/n/on/off/1/0` (case-insensitive, trimmed), booleans and the numbers 1/0.
 * Returns `undefined` for anything else.
 * @example parseBoolean(' Yes ') // => true
 * @example parseBoolean('maybe') // => undefined
 */
export function parseBoolean(value: unknown, options: ParseBooleanOptions = {}): boolean | undefined {
  if (typeof value === 'boolean') return value;
  const { strict = false } = options;
  if (typeof value === 'number') {
    if (strict) return undefined;
    return value === 1 ? true : value === 0 ? false : undefined;
  }
  if (typeof value !== 'string' || value.length > MAX_TEXT) return undefined;
  const t = value.trim().toLowerCase();
  if (strict) return t === 'true' ? true : t === 'false' ? false : undefined;
  if (TRUE_WORDS.has(t) || options.trueValues?.some((w) => w.trim().toLowerCase() === t)) return true;
  if (FALSE_WORDS.has(t) || options.falseValues?.some((w) => w.trim().toLowerCase() === t)) return false;
  return undefined;
}

/** Exclusive or. @example xor(true, false) // => true */
export function xor(a: boolean, b: boolean): boolean {
  return a !== b;
}

/** Equivalence (not xor). @example xnor(true, true) // => true */
export function xnor(a: boolean, b: boolean): boolean {
  return a === b;
}

/** Not and. @example nand(true, true) // => false */
export function nand(a: boolean, b: boolean): boolean {
  return !(a && b);
}

/** Not or. @example nor(false, false) // => true */
export function nor(a: boolean, b: boolean): boolean {
  return !(a || b);
}

/** Material implication `a → b`. @example implies(true, false) // => false */
export function implies(a: boolean, b: boolean): boolean {
  return !a || b;
}

/** Negation. @example toggle(false) // => true */
export function toggle(value: boolean): boolean {
  return !value;
}

/** A boolean or a lazily evaluated boolean. */
export type BooleanLike = boolean | (() => boolean);

const evaluate = (v: BooleanLike): boolean => (typeof v === 'function' ? v() : v);

/**
 * True when every item is true (thunks are evaluated lazily, short-circuiting). Empty -> true.
 * @example all([true, () => 1 < 2]) // => true
 */
export function all(values: Iterable<BooleanLike>): boolean {
  for (const v of values) if (!evaluate(v)) return false;
  return true;
}

/**
 * True when at least one item is true (short-circuiting). Empty -> false.
 * @example any([false, true]) // => true
 */
export function any(values: Iterable<BooleanLike>): boolean {
  for (const v of values) if (evaluate(v)) return true;
  return false;
}

/**
 * True when no item is true (short-circuiting). Empty -> true.
 * @example none([false, false]) // => true
 */
export function none(values: Iterable<BooleanLike>): boolean {
  return !any(values);
}

/**
 * Counts `true` items, or items passing `predicate`.
 * @example countTrue([true, false, true]) // => 2
 */
export function countTrue<T = boolean>(values: Iterable<T>, predicate: (value: T) => boolean = (v) => v === true): number {
  let n = 0;
  for (const v of values) if (predicate(v)) n++;
  return n;
}

/**
 * True when strictly more than half of the items are `true`. Empty or tied -> false.
 * @example majority([true, true, false]) // => true
 */
export function majority(values: Iterable<boolean>): boolean {
  let t = 0;
  let f = 0;
  for (const v of values) {
    if (v) t++;
    else f++;
  }
  return t > f;
}

/** Labels for `booleanToLabel`. */
export interface BooleanLabels {
  readonly true: string;
  readonly false: string;
  /** Used for `null`/`undefined`. */
  readonly null?: string;
}

/**
 * Text label for a boolean (never an icon alone; pass localized labels). The default labels are
 * the locale-neutral JSON literals `'true'`/`'false'`, and `''` for nullish.
 * @example booleanToLabel(true, { true: 'Active', false: 'Inactive', null: 'Unknown' }) // => 'Active'
 */
export function booleanToLabel(value: boolean | null | undefined, labels: BooleanLabels = { true: 'true', false: 'false' }): string {
  if (value === null || value === undefined) return labels.null ?? '';
  return value ? labels.true : labels.false;
}

/**
 * `'Yes'`/`'No'` (English defaults; pass localized labels for other languages), `''` for nullish.
 * @example booleanToYesNo(false) // => 'No'
 * @example booleanToYesNo(true, { true: 'Oui', false: 'Non' }) // => 'Oui'
 */
export function booleanToYesNo(value: boolean | null | undefined, labels: BooleanLabels = { true: 'Yes', false: 'No' }): string {
  return booleanToLabel(value, labels);
}

/** JavaScript truthiness as a type-friendly predicate. @example [0, 1, ''].filter(isTruthy) // => [1] */
export function isTruthy<T>(value: T): value is Exclude<T, false | 0 | '' | null | undefined | 0n> {
  return Boolean(value);
}

/** JavaScript falsiness. @example isFalsy(0) // => true */
export function isFalsy(value: unknown): boolean {
  return !value;
}

/** `1` for true, `0` for false. @example boolToInt(true) // => 1 */
export function boolToInt(value: boolean): 0 | 1 {
  return value ? 1 : 0;
}
