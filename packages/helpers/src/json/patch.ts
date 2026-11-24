/** JSON Patch (RFC 6902) and JSON Merge Patch (RFC 7396). Atomic and immutable. */
import { HelperError, LimitError, type Result, ValidationError, err, ok } from '../error/index.js';
import { isPlainObject } from '../is/index.js';
import { assertSafeKey, hasOwn } from '../internal/keys.js';
import { type JsonContainer, cloneJson, copyJsonContainer, isJsonContainer, jsonEqual } from './internal.js';
import { arrayIndex, formatPointer, found, parsePointer, resolve } from './pointer.js';

/** One RFC 6902 operation. */
export type JsonPatchOperation =
  | { readonly op: 'add'; readonly path: string; readonly value: unknown }
  | { readonly op: 'remove'; readonly path: string }
  | { readonly op: 'replace'; readonly path: string; readonly value: unknown }
  | { readonly op: 'move'; readonly from: string; readonly path: string }
  | { readonly op: 'copy'; readonly from: string; readonly path: string }
  | { readonly op: 'test'; readonly path: string; readonly value: unknown };

export interface JsonPatchOptions {
  /** Maximum operations per patch. Default 10,000. */
  readonly maxOperations?: number;
}

class PatchFailure extends Error {
  constructor(readonly code: string, readonly text: string) {
    super(text);
  }
}
const fail = (code: string, text: string): never => {
  throw new PatchFailure(code, text);
};
const notFound = (): never => fail('HLP_JSON_PATCH_PATH_NOT_FOUND', 'A patch path does not resolve to a value.');
const invalidOp = (): never => fail('HLP_JSON_PATCH_INVALID', 'A patch operation is not valid.');

/** Copy-on-write document: each container on a changed path is copied at most once. */
class Draft {
  root: unknown;
  private readonly copied = new WeakSet<object>();
  constructor(root: unknown) {
    this.root = root;
  }
  private own(v: unknown): JsonContainer {
    if (!isJsonContainer(v)) return notFound();
    if (this.copied.has(v)) return v;
    const c = copyJsonContainer(v);
    this.copied.add(c);
    return c;
  }
  /** Copied parent container of the location named by `tokens` (non-empty). */
  parent(tokens: readonly string[]): JsonContainer {
    for (const t of tokens) assertSafeKey(t);
    this.root = this.own(this.root);
    let cur = this.root as JsonContainer;
    for (let i = 0; i < tokens.length - 1; i++) {
      const t = tokens[i] ?? '';
      let key: string | number = t;
      if (Array.isArray(cur)) key = arrayIndex(cur, t, false) ?? notFound();
      else if (!hasOwn(cur, t)) notFound();
      const child = this.own((cur as Record<string | number, unknown>)[key]);
      (cur as Record<string | number, unknown>)[key] = child;
      cur = child;
    }
    return cur;
  }
  add(tokens: readonly string[], value: unknown): void {
    if (tokens.length === 0) {
      this.root = value;
      return;
    }
    const parent = this.parent(tokens);
    const t = tokens[tokens.length - 1] ?? '';
    if (Array.isArray(parent)) parent.splice(arrayIndex(parent, t, true) ?? notFound(), 0, value);
    else parent[t] = value;
  }
  remove(tokens: readonly string[]): void {
    if (tokens.length === 0) invalidOp();
    const parent = this.parent(tokens);
    const t = tokens[tokens.length - 1] ?? '';
    if (Array.isArray(parent)) parent.splice(arrayIndex(parent, t, false) ?? notFound(), 1);
    else if (hasOwn(parent, t)) Reflect.deleteProperty(parent, t);
    else notFound();
  }
  replace(tokens: readonly string[], value: unknown): void {
    if (tokens.length === 0) {
      this.root = value;
      return;
    }
    const parent = this.parent(tokens);
    const t = tokens[tokens.length - 1] ?? '';
    if (Array.isArray(parent)) parent[arrayIndex(parent, t, false) ?? notFound()] = value;
    else if (hasOwn(parent, t)) parent[t] = value;
    else notFound();
  }
  get(tokens: readonly string[]): unknown {
    const v = resolve(this.root, tokens);
    return found(v) ? v : notFound();
  }
}

function pointerArg(op: Record<string, unknown>, name: 'path' | 'from'): string[] {
  const p = op[name];
  if (typeof p !== 'string') return invalidOp();
  try {
    return parsePointer(p);
  } catch (e) {
    if (e instanceof HelperError && e.kind === 'limit') throw e;
    return invalidOp();
  }
}

function valueArg(op: Record<string, unknown>): unknown {
  return hasOwn(op, 'value') ? op.value : invalidOp();
}

function run(doc: unknown, patch: readonly unknown[], options: JsonPatchOptions): unknown {
  const { maxOperations = 10_000 } = options;
  if (!Array.isArray(patch)) throw new ValidationError('HLP_JSON_PATCH_INVALID', 'A JSON Patch must be an array.');
  if (patch.length > maxOperations) throw new LimitError('HLP_JSON_PATCH_TOO_LARGE', 'The JSON Patch has too many operations.', { details: { maxOperations } });
  const draft = new Draft(doc);
  patch.forEach((raw: unknown, index) => {
    try {
      if (!isPlainObject(raw)) invalidOp();
      const op = raw as Record<string, unknown>;
      const path = pointerArg(op, 'path');
      switch (op.op) {
        case 'add':
          draft.add(path, valueArg(op));
          break;
        case 'remove':
          draft.remove(path);
          break;
        case 'replace':
          draft.replace(path, valueArg(op));
          break;
        case 'move': {
          const from = pointerArg(op, 'from');
          if (from.length < path.length && from.every((t, i) => t === path[i])) invalidOp();
          const v = draft.get(from);
          if (from.length === path.length && from.every((t, i) => t === path[i])) break;
          draft.remove(from);
          draft.add(path, v);
          break;
        }
        case 'copy':
          draft.add(path, cloneJson(draft.get(pointerArg(op, 'from'))));
          break;
        case 'test':
          if (!jsonEqual(draft.get(path), valueArg(op))) fail('HLP_JSON_PATCH_TEST_FAILED', 'A JSON Patch test operation failed.');
          break;
        default:
          invalidOp();
      }
    } catch (e) {
      const details = { operation: index };
      if (e instanceof PatchFailure) throw new ValidationError(e.code, e.text, { details });
      if (e instanceof HelperError) throw new HelperError(e.code, e.message, { details, kind: e.kind });
      throw e;
    }
  });
  return draft.root;
}

/**
 * Applies an RFC 6902 patch atomically: returns a new document or throws a `HelperError`
 * (`details.operation` is the failing index); the input is never modified or partially patched.
 * @example applyJsonPatch({ a: 1 }, [{ op: 'replace', path: '/a', value: 2 }]) // => { a: 2 }
 */
export function applyJsonPatch(doc: unknown, patch: readonly JsonPatchOperation[] | readonly unknown[], options: JsonPatchOptions = {}): unknown {
  return run(doc, patch, options);
}

/**
 * `applyJsonPatch` returning a `Result` instead of throwing.
 * @example
 * tryApplyJsonPatch({ a: 1 }, [{ op: 'replace', path: '/a', value: 2 }]); // => { ok: true, value: { a: 2 } }
 * const r = tryApplyJsonPatch({ a: 1 }, [{ op: 'remove', path: '/b' }]);
 * r.ok; // => false
 */
export function tryApplyJsonPatch(doc: unknown, patch: readonly JsonPatchOperation[] | readonly unknown[], options: JsonPatchOptions = {}): Result<unknown, HelperError> {
  try {
    return ok(run(doc, patch, options));
  } catch (e) {
    return err(e instanceof HelperError ? e : new HelperError('HLP_JSON_PATCH_FAILED', 'The JSON Patch could not be applied.', { cause: e }));
  }
}

/**
 * Creates an RFC 6902 patch that turns `a` into `b` (objects by key, arrays by index).
 * @example createJsonPatch({ a: 1 }, { a: 1, b: 2 }) // => [{ op: 'add', path: '/b', value: 2 }]
 */
export function createJsonPatch(a: unknown, b: unknown): JsonPatchOperation[] {
  const ops: JsonPatchOperation[] = [];
  const walk = (x: unknown, y: unknown, tokens: (string | number)[]): void => {
    if (Array.isArray(x) && Array.isArray(y)) {
      const common = Math.min(x.length, y.length);
      for (let i = 0; i < common; i++) walk(x[i], y[i], [...tokens, i]);
      for (let i = common; i < y.length; i++) ops.push({ op: 'add', path: formatPointer([...tokens, i]), value: y[i] });
      for (let i = x.length - 1; i >= common; i--) ops.push({ op: 'remove', path: formatPointer([...tokens, i]) });
      return;
    }
    if (isPlainObject(x) && isPlainObject(y)) {
      for (const k of Object.keys(x)) {
        if (hasOwn(y, k)) walk(x[k], y[k], [...tokens, k]);
        else ops.push({ op: 'remove', path: formatPointer([...tokens, k]) });
      }
      for (const k of Object.keys(y)) if (!hasOwn(x, k)) ops.push({ op: 'add', path: formatPointer([...tokens, k]), value: y[k] });
      return;
    }
    if (!jsonEqual(x, y)) ops.push({ op: 'replace', path: formatPointer(tokens), value: y });
  };
  walk(a, b, []);
  return ops;
}

// ---------------------------------------------------------------------------
// Merge Patch (RFC 7396)

/**
 * Applies an RFC 7396 merge patch and returns a new document: `null` deletes, objects merge,
 * everything else (arrays included) replaces. Unsafe keys throw `HLP_UNSAFE_KEY`.
 * @example applyMergePatch({ a: 1, b: 2 }, { b: null, c: 3 }) // => { a: 1, c: 3 }
 */
export function applyMergePatch(target: unknown, patch: unknown): unknown {
  if (!isPlainObject(patch)) return patch;
  const out = isPlainObject(target) ? (copyJsonContainer(target) as Record<string, unknown>) : {};
  for (const k of Object.keys(patch)) {
    assertSafeKey(k);
    const v = patch[k];
    if (v === null) Reflect.deleteProperty(out, k);
    else out[k] = applyMergePatch(hasOwn(out, k) ? out[k] : undefined, v);
  }
  return out;
}

/**
 * Creates an RFC 7396 merge patch turning `source` into `target`. Merge patches cannot express
 * `null` values inside objects (they mean "delete"), so such targets do not round-trip.
 * @example createMergePatch({ a: 1, b: 2 }, { a: 1, c: 3 }) // => { b: null, c: 3 }
 */
export function createMergePatch(source: unknown, target: unknown): unknown {
  if (!isPlainObject(source) || !isPlainObject(target)) return target;
  const patch: Record<string, unknown> = {};
  for (const k of Object.keys(source)) {
    if (hasOwn(target, k)) continue;
    assertSafeKey(k);
    patch[k] = null;
  }
  for (const k of Object.keys(target)) {
    if (hasOwn(source, k) && jsonEqual(source[k], target[k])) continue;
    assertSafeKey(k);
    patch[k] = hasOwn(source, k) ? createMergePatch(source[k], target[k]) : target[k];
  }
  return patch;
}
