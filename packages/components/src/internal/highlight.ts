/**
 * Text matching and highlighting shared by Tree View, Tree Select, and Command Palette
 * (R20 P4). Matches are found on accent- and case-folded text and mapped back to positions
 * in the original label; highlights are <mark> elements built from text nodes, never HTML.
 */

/** Half-open `[start, end)` ranges in UTF-16 code units of the original text. */
export type MatchRange = readonly [number, number];

export function foldText(text: string, locale: string): string {
  return text.normalize('NFD').replace(/\p{Diacritic}/gu, '').toLocaleLowerCase(locale);
}

/** Per code point of `text`: its folded form and its offset in `text`. */
function foldChars(text: string, locale: string): { folded: string[]; offsets: number[]; lengths: number[] } {
  const folded: string[] = [];
  const offsets: number[] = [];
  const lengths: number[] = [];
  let at = 0;
  for (const ch of text) {
    folded.push(foldText(ch, locale));
    offsets.push(at);
    lengths.push(ch.length);
    at += ch.length;
  }
  return { folded, offsets, lengths };
}

/** The first case- and accent-insensitive occurrence of `query` in `text`, or null. */
export function findSubstring(text: string, query: string, locale: string): MatchRange | null {
  const q = foldText(query, locale);
  if (q === '') return null;
  const { folded, offsets, lengths } = foldChars(text, locale);
  const joined = folded.join('');
  const at = joined.indexOf(q);
  if (at < 0) return null;
  let pos = 0;
  let start = -1;
  for (let i = 0; i < folded.length; i++) {
    const len = folded[i]?.length ?? 0;
    if (start < 0 && pos + len > at) start = offsets[i] ?? 0;
    if (pos + len >= at + q.length) return [start < 0 ? 0 : start, (offsets[i] ?? 0) + (lengths[i] ?? 1)];
    pos += len;
  }
  return null;
}

/** A fuzzy (subsequence) match: a score (higher is better) and the matched ranges. */
export interface FuzzyResult {
  readonly score: number;
  readonly ranges: MatchRange[];
}

const SEPARATOR = /[\s\-_./\\:,()]/u;

/**
 * Subsequence match of `query` in `text`: every query character must appear in order.
 * Consecutive characters, matches at word starts, and a match at the start score higher;
 * gaps score lower. Returns null when the query does not match.
 */
export function fuzzyMatch(text: string, query: string, locale: string): FuzzyResult | null {
  const q = Array.from(foldText(query.trim(), locale)).filter((c) => c !== ' ');
  if (q.length === 0) return { score: 0, ranges: [] };
  const { folded, offsets, lengths } = foldChars(text, locale);
  // A contiguous substring wins over a scattered subsequence.
  const exact = findSubstring(text, query.trim(), locale);
  const chars = Array.from(text);
  const hits: number[] = [];
  let qi = 0;
  let score = 0;
  let prev = -2;
  for (let i = 0; i < folded.length && qi < q.length; i++) {
    const f = folded[i] ?? '';
    if (f === '' || f !== q[qi]) continue;
    const wordStart = i === 0 || SEPARATOR.test(chars[i - 1] ?? ' ');
    score += 1;
    if (i === prev + 1) score += 4;
    if (wordStart) score += 3;
    if (i === 0) score += 2;
    if (prev >= 0) score -= Math.min(3, i - prev - 1) * 0.5;
    hits.push(i);
    prev = i;
    qi++;
  }
  if (qi < q.length) return null;
  if (exact) {
    const bonus = exact[0] === 0 ? 20 : 12;
    return { score: q.length * 6 + bonus - text.length * 0.01, ranges: [exact] };
  }
  const ranges: [number, number][] = [];
  for (const i of hits) {
    const start = offsets[i] ?? 0;
    const end = start + (lengths[i] ?? 1);
    const last = ranges[ranges.length - 1];
    if (last?.[1] === start) last[1] = end;
    else ranges.push([start, end]);
  }
  return { score: score - text.length * 0.01, ranges };
}

/** `text` with `ranges` wrapped in <mark class="className"> elements (text nodes only). */
export function highlightText(doc: Document, text: string, ranges: readonly MatchRange[], className: string): DocumentFragment {
  const frag = doc.createDocumentFragment();
  let at = 0;
  for (const [start, end] of ranges) {
    if (start < at || end <= start) continue;
    if (start > at) frag.append(doc.createTextNode(text.slice(at, start)));
    const mark = doc.createElement('mark');
    mark.className = className;
    mark.textContent = text.slice(start, end);
    frag.append(mark);
    at = end;
  }
  if (at < text.length) frag.append(doc.createTextNode(text.slice(at)));
  return frag;
}
