/**
 * Lexical helpers for validate_usage: masks comments and string contents (keeping offsets) so rules
 * can match code structure, and maps offsets to line and column. Linear time; no regular expressions
 * are built from input.
 */

export interface Masked {
  /** Same length as the source; comments and string contents replaced by spaces (quotes kept). */
  readonly code: string;
  /** String and template literals: [start, end) offsets of their contents in the source. */
  readonly strings: readonly { readonly start: number; readonly end: number; readonly quote: string }[];
}

export function mask(source: string): Masked {
  const out = source.split('');
  const strings: { start: number; end: number; quote: string }[] = [];
  const blank = (from: number, to: number): void => {
    for (let k = from; k < to; k++) if (out[k] !== '\n') out[k] = ' ';
  };
  let i = 0;
  const n = source.length;
  while (i < n) {
    const ch = source[i];
    const next = source[i + 1];
    if (ch === '/' && next === '/') {
      const end = source.indexOf('\n', i);
      const stop = end === -1 ? n : end;
      blank(i, stop);
      i = stop;
    } else if (ch === '/' && next === '*') {
      const end = source.indexOf('*/', i + 2);
      const stop = end === -1 ? n : end + 2;
      blank(i, stop);
      i = stop;
    } else if (ch === '"' || ch === "'" || ch === '`') {
      const start = i + 1;
      let j = start;
      while (j < n && source[j] !== ch) {
        if (source[j] === '\\') j++;
        else if (ch !== '`' && source[j] === '\n') break;
        j++;
      }
      strings.push({ start, end: Math.min(j, n), quote: ch });
      blank(start, Math.min(j, n));
      i = j + 1;
    } else i++;
  }
  return { code: out.join(''), strings };
}

/** 1-based line and column of an offset. */
export function position(source: string, offset: number): { readonly line: number; readonly column: number } {
  let line = 1;
  let lineStart = 0;
  for (let k = 0; k < offset && k < source.length; k++) {
    if (source[k] === '\n') {
      line++;
      lineStart = k + 1;
    }
  }
  return { line, column: offset - lineStart + 1 };
}

/** Offset of the bracket that closes the one at `open` (masked code), or -1. */
export function matching(code: string, open: number): number {
  const pairs: Record<string, string> = { '{': '}', '(': ')', '[': ']' };
  const stack: string[] = [];
  for (let k = open; k < code.length; k++) {
    const ch = code[k] ?? '';
    const close = pairs[ch];
    if (close) stack.push(close);
    else if (ch === '}' || ch === ')' || ch === ']') {
      if (stack.pop() !== ch) return -1;
      if (stack.length === 0) return k;
    }
  }
  return -1;
}

/** Top-level property names of an object literal between `open` and its closing brace (masked code). */
export function objectKeys(code: string, open: number, close: number): { readonly names: { readonly name: string; readonly offset: number }[]; readonly spread: boolean } {
  const names: { name: string; offset: number }[] = [];
  let spread = false;
  let depth = 0;
  let expectKey = true;
  for (let k = open + 1; k < close; k++) {
    const ch = code[k] ?? '';
    if (ch === '{' || ch === '(' || ch === '[') depth++;
    else if (ch === '}' || ch === ')' || ch === ']') depth--;
    else if (depth === 0 && ch === ',') expectKey = true;
    else if (depth === 0 && expectKey && !/\s/.test(ch)) {
      if (code.startsWith('...', k)) {
        spread = true;
        expectKey = false;
        continue;
      }
      const match = /^(?:(?:async|get|set)\s+)?([A-Za-z_$][\w$]*)|^(["'])/.exec(code.slice(k, k + 200));
      if (match?.[1]) names.push({ name: match[1], offset: k + match[0].length - match[1].length });
      else if (match?.[2]) {
        // A quoted key: masked, so its name is unknown here; do not flag it.
      }
      expectKey = false;
    }
  }
  return { names, spread };
}
