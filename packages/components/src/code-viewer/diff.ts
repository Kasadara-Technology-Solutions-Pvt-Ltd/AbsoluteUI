/**
 * Line diff for the Code Viewer (R20 P10): Myers' O(ND) algorithm ("An O(ND) Difference
 * Algorithm and Its Variations", 1986) over interned lines, after trimming the common prefix
 * and suffix. The trace keeps only the live diagonals of each step (O(D^2) memory); when the
 * edit distance exceeds `maxEdits`, the changed middle is reported as one deletion followed
 * by one insertion, so pathological inputs stay bounded in time and memory.
 */
import { splitLines } from './tokenize.js';

export type DiffOp = 'equal' | 'insert' | 'delete';

export interface DiffLine {
  readonly op: DiffOp;
  readonly text: string;
  /** 1-based line in the original text (null for insertions). */
  readonly originalLine: number | null;
  /** 1-based line in the modified text (null for deletions). */
  readonly modifiedLine: number | null;
}

export interface DiffOptions {
  /** Upper bound on the edit distance searched (default 2000). */
  maxEdits?: number;
  /** Compare lines ignoring leading and trailing whitespace (default false). */
  ignoreWhitespace?: boolean;
}

/** Edit script between two sequences of interned ids: 'e', 'd', or 'i' per step. */
function myers(a: Int32Array, b: Int32Array, maxEdits: number): string[] | null {
  const n = a.length;
  const m = b.length;
  const max = n + m;
  const offset = max + 1;
  const v = new Int32Array(2 * max + 3);
  const trace: Int32Array[] = [];
  for (let d = 0; d <= Math.min(max, maxEdits); d++) {
    // Snapshot of the diagonals -(d-1)..(d-1) as they were before step d.
    const snap = new Int32Array(Math.max(0, 2 * d - 1));
    for (let k = -(d - 1); k <= d - 1; k++) snap[k + d - 1] = v[k + offset] ?? 0;
    trace.push(snap);
    for (let k = -d; k <= d; k += 2) {
      let x: number;
      if (d === 0) x = 0;
      else if (k === -d || (k !== d && (v[k - 1 + offset] ?? 0) < (v[k + 1 + offset] ?? 0))) x = v[k + 1 + offset] ?? 0;
      else x = (v[k - 1 + offset] ?? 0) + 1;
      let y = x - k;
      while (x < n && y < m && a[x] === b[y]) {
        x++;
        y++;
      }
      v[k + offset] = x;
      if (x >= n && y >= m) return backtrack(trace, n, m, d);
    }
  }
  return null;
}

function backtrack(trace: readonly Int32Array[], n: number, m: number, depth: number): string[] {
  const steps: string[] = [];
  let x = n;
  let y = m;
  for (let d = depth; d > 0; d--) {
    const snap = trace[d];
    const at = (k: number): number => snap?.[k + d - 1] ?? 0;
    const k = x - y;
    const down = k === -d || (k !== d && at(k - 1) < at(k + 1));
    const prevK = down ? k + 1 : k - 1;
    const prevX = at(prevK);
    const prevY = prevX - prevK;
    while (x > prevX && y > prevY) {
      steps.push('e');
      x--;
      y--;
    }
    steps.push(down ? 'i' : 'd');
    x = prevX;
    y = prevY;
  }
  while (x > 0 && y > 0) {
    steps.push('e');
    x--;
    y--;
  }
  return steps.reverse();
}

/** Line-by-line diff of two texts. Line endings are normalized; a final newline is ignored. */
export function diffLines(original: string, modified: string, options: DiffOptions = {}): DiffLine[] {
  const a = original === '' ? [] : splitLines(original);
  const b = modified === '' ? [] : splitLines(modified);
  const maxEdits = options.maxEdits ?? 2000;
  const key = options.ignoreWhitespace === true ? (s: string): string => s.trim() : (s: string): string => s;
  const ids = new Map<string, number>();
  const intern = (s: string): number => {
    const k = key(s);
    let id = ids.get(k);
    if (id === undefined) {
      id = ids.size;
      ids.set(k, id);
    }
    return id;
  };
  const ia = Int32Array.from(a, intern);
  const ib = Int32Array.from(b, intern);
  let start = 0;
  while (start < ia.length && start < ib.length && ia[start] === ib[start]) start++;
  let endA = ia.length;
  let endB = ib.length;
  while (endA > start && endB > start && ia[endA - 1] === ib[endB - 1]) {
    endA--;
    endB--;
  }
  const out: DiffLine[] = [];
  let ai = 0;
  let bi = 0;
  const equal = (): void => {
    out.push({ op: 'equal', text: b[bi] ?? '', originalLine: ai + 1, modifiedLine: bi + 1 });
    ai++;
    bi++;
  };
  const del = (): void => {
    out.push({ op: 'delete', text: a[ai] ?? '', originalLine: ai + 1, modifiedLine: null });
    ai++;
  };
  const ins = (): void => {
    out.push({ op: 'insert', text: b[bi] ?? '', originalLine: null, modifiedLine: bi + 1 });
    bi++;
  };
  for (let i = 0; i < start; i++) equal();
  const steps = myers(ia.subarray(start, endA), ib.subarray(start, endB), Math.max(0, maxEdits));
  if (steps === null) {
    while (ai < endA) del();
    while (bi < endB) ins();
  } else {
    for (const s of steps) {
      if (s === 'e') equal();
      else if (s === 'd') del();
      else ins();
    }
  }
  while (ai < a.length && bi < b.length) equal();
  return out;
}

/** Counts of inserted and deleted lines. */
export function diffStats(lines: readonly DiffLine[]): { added: number; removed: number } {
  let added = 0;
  let removed = 0;
  for (const l of lines) {
    if (l.op === 'insert') added++;
    else if (l.op === 'delete') removed++;
  }
  return { added, removed };
}
