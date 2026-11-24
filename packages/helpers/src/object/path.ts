/**
 * Property paths (`'a.b[0].c'` or `['a', 'b', 0, 'c']`) with a linear, allocation-light parser.
 */
import { LimitError, ValidationError } from '../error/index.js';

/** One path step: a property name or an array index. */
export type PathSegment = string | number;

/** A dotted/bracketed path string or an array of segments. */
export type Path = string | readonly PathSegment[];

/** Maximum path length in characters (string paths) or segments (array paths). */
export const MAX_PATH_LENGTH = 4096;

const invalid = (): never => {
  throw new ValidationError('HLP_OBJECT_INVALID_PATH', 'The property path is not valid.');
};

const isDigit = (code: number): boolean => code >= 48 && code <= 57;

/** Canonical array index text: `0` or digits without a leading zero, within the safe range. */
function indexOf(text: string): number | undefined {
  if (text.length === 0 || text.length > 15) return undefined;
  for (let i = 0; i < text.length; i++) if (!isDigit(text.charCodeAt(i))) return undefined;
  if (text.length > 1 && text.startsWith('0')) return undefined;
  return Number(text);
}

/**
 * Parses a path into segments. Canonical digit segments (`0`, `12`) become numbers;
 * quoted brackets (`["a.b"]`) keep any characters, with `\` escaping.
 * @example parsePath('a.b[0]["x.y"]') // => ['a', 'b', 0, 'x.y']
 */
export function parsePath(path: Path): PathSegment[] {
  if (typeof path !== 'string') {
    if (path.length > MAX_PATH_LENGTH) throw new LimitError('HLP_OBJECT_PATH_TOO_LONG', 'The property path is too long.');
    const out: PathSegment[] = [];
    for (const seg of path as readonly unknown[]) {
      if (typeof seg === 'number') {
        if (!Number.isSafeInteger(seg) || seg < 0) invalid();
        out.push(seg);
      } else if (typeof seg === 'string') out.push(seg);
      else invalid();
    }
    return out;
  }
  if (path.length > MAX_PATH_LENGTH) throw new LimitError('HLP_OBJECT_PATH_TOO_LONG', 'The property path is too long.');
  const out: PathSegment[] = [];
  const n = path.length;
  // prev: 0 = start, 1 = after '.', 2 = after a segment
  let prev = 0;
  let i = 0;
  while (i < n) {
    const c = path[i];
    if (c === '[') {
      if (prev === 1) invalid();
      i++;
      const q = path[i];
      if (q === '"' || q === "'") {
        i++;
        let s = '';
        for (;;) {
          if (i >= n) invalid();
          const ch = path[i];
          if (ch === '\\') {
            if (i + 1 >= n) invalid();
            s += path[i + 1] ?? '';
            i += 2;
          } else if (ch === q) {
            i++;
            break;
          } else {
            s += ch ?? '';
            i++;
          }
        }
        if (path[i] !== ']') invalid();
        out.push(s);
      } else {
        const start = i;
        while (i < n && isDigit(path.charCodeAt(i))) i++;
        if (path[i] !== ']') invalid();
        const index = indexOf(path.slice(start, i));
        if (index === undefined) invalid();
        else out.push(index);
      }
      i++;
      prev = 2;
    } else if (c === '.') {
      if (prev !== 2) invalid();
      i++;
      prev = 1;
    } else {
      if (prev === 2) invalid();
      const start = i;
      while (i < n && path[i] !== '.' && path[i] !== '[') {
        if (path[i] === ']') invalid();
        i++;
      }
      const text = path.slice(start, i);
      out.push(indexOf(text) ?? text);
      prev = 2;
    }
  }
  if (prev === 1) invalid();
  return out;
}

const IDENT = /^[A-Z_$][\w$]*$/i;

/**
 * Formats segments as a path string that `parsePath` reads back exactly.
 * @example formatPath(['a', 0, 'x.y']) // => 'a[0]["x.y"]'
 */
export function formatPath(segments: readonly PathSegment[]): string {
  let out = '';
  for (const seg of segments) {
    if (typeof seg === 'number') out += `[${seg}]`;
    else if (IDENT.test(seg)) out += out === '' ? seg : `.${seg}`;
    else out += `["${seg.replace(/["\\]/g, (m) => `\\${m}`)}"]`;
  }
  return out;
}
