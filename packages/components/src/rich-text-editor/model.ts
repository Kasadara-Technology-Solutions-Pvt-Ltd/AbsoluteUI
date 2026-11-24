/**
 * Rich text document model (SPEC section 18.21). A document is a flat list of blocks
 * (paragraph, heading, quote, code, list item with depth); each block holds runs
 * of text with marks (bold, italic, underline, strike, code) and an optional link.
 * Soft line breaks are "\n" inside a run. Positions are UTF-16 offsets within a
 * block's text. Every operation is pure: it returns a new document and selection,
 * so undo is a stack of snapshots and nothing depends on the browser's editing
 * engine (`document.execCommand` is deprecated and not used).
 */

export type RteMark = 'bold' | 'italic' | 'underline' | 'strike' | 'code';
export type RteBlockType = 'paragraph' | 'heading' | 'quote' | 'code' | 'list';
export type RteAlign = 'start' | 'center' | 'end' | 'justify';
export type RteListType = 'bullet' | 'ordered';
export type RteHeadingLevel = 1 | 2 | 3;

export const MARKS: readonly RteMark[] = ['bold', 'italic', 'underline', 'strike', 'code'];
export const MAX_DEPTH = 4;

export interface RteRun {
  readonly text: string;
  /** Canonical order (MARKS order), no duplicates. */
  readonly marks: readonly RteMark[];
  readonly link?: string;
}

export interface RteBlock {
  readonly type: RteBlockType;
  /** Heading level. */
  readonly level?: RteHeadingLevel;
  /** List kind of a list item. */
  readonly list?: RteListType;
  /** Nesting depth of a list item, 0-4. */
  readonly depth?: number;
  readonly align?: RteAlign;
  readonly runs: readonly RteRun[];
}

export interface RteDoc {
  /** Never empty. */
  readonly blocks: readonly RteBlock[];
}

export interface RtePos {
  readonly block: number;
  readonly offset: number;
}

export interface RteSelection {
  readonly anchor: RtePos;
  readonly focus: RtePos;
}

export interface RteRange {
  readonly start: RtePos;
  readonly end: RtePos;
}

export interface RteEdit {
  readonly doc: RteDoc;
  readonly selection: RteSelection;
}

export interface RteInlineStyle {
  readonly marks: readonly RteMark[];
  readonly link?: string;
}

export const EMPTY_STYLE: RteInlineStyle = { marks: [] };

export function paragraph(text = ''): RteBlock {
  return { type: 'paragraph', runs: text ? [{ text, marks: [] }] : [] };
}

export function emptyDoc(): RteDoc {
  return { blocks: [paragraph()] };
}

export function caret(pos: RtePos): RteSelection {
  return { anchor: pos, focus: pos };
}

export function comparePos(a: RtePos, b: RtePos): number {
  return a.block - b.block || a.offset - b.offset;
}

export function toRange(sel: RteSelection): RteRange {
  return comparePos(sel.anchor, sel.focus) <= 0 ? { start: sel.anchor, end: sel.focus } : { start: sel.focus, end: sel.anchor };
}

export function isCollapsed(sel: RteSelection | RteRange): boolean {
  const [a, b] = 'anchor' in sel ? [sel.anchor, sel.focus] : [sel.start, sel.end];
  return comparePos(a, b) === 0;
}

export function blockText(block: RteBlock): string {
  let s = '';
  for (const r of block.runs) s += r.text;
  return s;
}

export function blockLength(block: RteBlock): number {
  let n = 0;
  for (const r of block.runs) n += r.text.length;
  return n;
}

export function docText(doc: RteDoc): string {
  return doc.blocks.map(blockText).join('\n');
}

function canonicalMarks(marks: readonly RteMark[]): RteMark[] {
  return MARKS.filter((m) => marks.includes(m));
}

function sameStyle(a: RteInlineStyle, b: RteInlineStyle): boolean {
  return a.link === b.link && a.marks.length === b.marks.length && a.marks.every((m, i) => m === b.marks[i]);
}

function run(text: string, style: RteInlineStyle): RteRun {
  const marks = canonicalMarks(style.marks);
  return style.link === undefined ? { text, marks } : { text, marks, link: style.link };
}

/** Merge neighbors with the same style and drop empty runs. */
export function normalizeRuns(runs: readonly RteRun[]): RteRun[] {
  const out: RteRun[] = [];
  for (const r of runs) {
    if (r.text === '') continue;
    const last = out[out.length - 1];
    const style: RteInlineStyle = r.link === undefined ? { marks: canonicalMarks(r.marks) } : { marks: canonicalMarks(r.marks), link: r.link };
    if (last && sameStyle(last, style)) out[out.length - 1] = run(last.text + r.text, style);
    else out.push(run(r.text, style));
  }
  return out;
}

/** Runs covering [from, to) of a block. */
export function sliceRuns(runs: readonly RteRun[], from: number, to: number): RteRun[] {
  const out: RteRun[] = [];
  let pos = 0;
  for (const r of runs) {
    const end = pos + r.text.length;
    if (end > from && pos < to) out.push({ ...r, text: r.text.slice(Math.max(0, from - pos), Math.min(r.text.length, to - pos)) });
    pos = end;
    if (pos >= to) break;
  }
  return out;
}

/** Style of the character before `offset` (or after it at the block start). */
export function styleAt(block: RteBlock, offset: number): RteInlineStyle {
  if (block.type === 'code') return EMPTY_STYLE;
  let pos = 0;
  let previous: RteRun | undefined;
  for (const r of block.runs) {
    const end = pos + r.text.length;
    if (offset > pos && offset <= end) return styleOf(r);
    if (offset === 0 && pos === 0) return styleOf(r);
    previous = r;
    pos = end;
  }
  return previous ? styleOf(previous) : EMPTY_STYLE;
}

function styleOf(r: RteRun): RteInlineStyle {
  // A link ends at its edge: typing right after a link does not extend it.
  return r.link === undefined ? { marks: r.marks } : { marks: r.marks, link: r.link };
}

function withBlock(doc: RteDoc, index: number, block: RteBlock): RteDoc {
  const blocks = doc.blocks.slice();
  blocks[index] = block;
  return { blocks };
}

function setRuns(block: RteBlock, runs: readonly RteRun[]): RteBlock {
  if (block.type === 'code') return { ...block, runs: normalizeRuns(runs.map((r) => ({ text: r.text, marks: [] }))) };
  return { ...block, runs: normalizeRuns(runs) };
}

/** A block's attributes without its runs. */
export function blockAttrs(block: RteBlock): Omit<RteBlock, 'runs'> {
  return {
    type: block.type,
    ...(block.level === undefined ? {} : { level: block.level }),
    ...(block.list === undefined ? {} : { list: block.list }),
    ...(block.depth === undefined ? {} : { depth: block.depth }),
    ...(block.align === undefined ? {} : { align: block.align }),
  };
}

export function clampPos(doc: RteDoc, pos: RtePos): RtePos {
  const block = Math.max(0, Math.min(doc.blocks.length - 1, pos.block));
  const b = doc.blocks[block];
  return { block, offset: Math.max(0, Math.min(b ? blockLength(b) : 0, pos.offset)) };
}

/** Delete [start, end); blocks between are removed and the last block's rest joins the first. */
export function deleteRange(doc: RteDoc, range: RteRange): RteEdit {
  const { start, end } = range;
  const first = doc.blocks[start.block];
  const last = doc.blocks[end.block];
  if (!first || !last) return { doc, selection: caret(start) };
  const head = sliceRuns(first.runs, 0, start.offset);
  const tail = sliceRuns(last.runs, end.offset, blockLength(last));
  const merged = setRuns(first, [...head, ...tail]);
  const blocks = [...doc.blocks.slice(0, start.block), merged, ...doc.blocks.slice(end.block + 1)];
  return { doc: { blocks }, selection: caret(start) };
}

/** Replace the range with inline text in one style ("\n" is a soft break). */
export function insertText(doc: RteDoc, range: RteRange, text: string, style: RteInlineStyle): RteEdit {
  const cleared = isCollapsed(range) ? { doc, selection: caret(range.start) } : deleteRange(doc, range);
  const pos = cleared.selection.focus;
  const block = cleared.doc.blocks[pos.block];
  if (!block || text === '') return cleared;
  const runs = [...sliceRuns(block.runs, 0, pos.offset), run(text, block.type === 'code' ? EMPTY_STYLE : style), ...sliceRuns(block.runs, pos.offset, blockLength(block))];
  return { doc: withBlock(cleared.doc, pos.block, setRuns(block, runs)), selection: caret({ block: pos.block, offset: pos.offset + text.length }) };
}

/** Split the block at `pos`; the new second block gets `next` attributes (default: same as the first). */
export function splitBlock(doc: RteDoc, pos: RtePos, next?: (block: RteBlock) => Omit<RteBlock, 'runs'>): RteEdit {
  const block = doc.blocks[pos.block];
  if (!block) return { doc, selection: caret(pos) };
  const len = blockLength(block);
  const head = setRuns(block, sliceRuns(block.runs, 0, pos.offset));
  const tailAttrs = next ? next(block) : blockAttrs(block);
  const tail = setRuns({ ...tailAttrs, runs: [] }, sliceRuns(block.runs, pos.offset, len));
  const blocks = [...doc.blocks.slice(0, pos.block), head, tail, ...doc.blocks.slice(pos.block + 1)];
  return { doc: { blocks }, selection: caret({ block: pos.block + 1, offset: 0 }) };
}

/** Join block `index` into the previous one (previous keeps its attributes). */
export function mergeWithPrevious(doc: RteDoc, index: number): RteEdit {
  const prev = doc.blocks[index - 1];
  const block = doc.blocks[index];
  if (!prev || !block) return { doc, selection: caret({ block: index, offset: 0 }) };
  const offset = blockLength(prev);
  const merged = setRuns(prev, [...prev.runs, ...block.runs]);
  const blocks = [...doc.blocks.slice(0, index - 1), merged, ...doc.blocks.slice(index + 1)];
  return { doc: { blocks }, selection: caret({ block: index - 1, offset }) };
}

/** Insert blocks (a pasted fragment) at the range: first and last fragment blocks join the surrounding text. */
export function insertBlocks(doc: RteDoc, range: RteRange, fragment: readonly RteBlock[]): RteEdit {
  const cleared = isCollapsed(range) ? { doc, selection: caret(range.start) } : deleteRange(doc, range);
  const pos = cleared.selection.focus;
  const [firstFrag, ...rest] = fragment;
  if (!firstFrag) return cleared;
  if (rest.length === 0) {
    const block = cleared.doc.blocks[pos.block];
    if (!block) return cleared;
    const runs = [...sliceRuns(block.runs, 0, pos.offset), ...firstFrag.runs, ...sliceRuns(block.runs, pos.offset, blockLength(block))];
    return { doc: withBlock(cleared.doc, pos.block, setRuns(block, runs)), selection: caret({ block: pos.block, offset: pos.offset + blockLength(firstFrag) }) };
  }
  const split = splitBlock(cleared.doc, pos);
  const headIndex = pos.block;
  const head = split.doc.blocks[headIndex];
  const tail = split.doc.blocks[headIndex + 1];
  if (!head || !tail) return cleared;
  // An empty head takes the first fragment block's type (pasting a list into an empty paragraph).
  const headEmpty = blockLength(head) === 0;
  const newHead = headEmpty ? firstFrag : setRuns(head, [...head.runs, ...firstFrag.runs]);
  const lastFrag = rest[rest.length - 1] ?? firstFrag;
  const middle = rest.slice(0, -1);
  const tailEmpty = blockLength(tail) === 0;
  const newTail = tailEmpty ? lastFrag : setRuns(tail, [...lastFrag.runs, ...tail.runs]);
  const blocks = [...split.doc.blocks.slice(0, headIndex), newHead, ...middle, newTail, ...split.doc.blocks.slice(headIndex + 2)];
  const endBlock = headIndex + 1 + middle.length;
  return { doc: { blocks }, selection: caret({ block: endBlock, offset: blockLength(lastFrag) }) };
}

/** Apply `fn` to every run piece inside the range (other text unchanged). */
function mapRange(doc: RteDoc, range: RteRange, fn: (r: RteRun) => RteRun): RteDoc {
  const blocks = doc.blocks.map((block, i) => {
    if (i < range.start.block || i > range.end.block || block.type === 'code') return block;
    const len = blockLength(block);
    const from = i === range.start.block ? range.start.offset : 0;
    const to = i === range.end.block ? range.end.offset : len;
    if (from >= to) return block;
    return setRuns(block, [...sliceRuns(block.runs, 0, from), ...sliceRuns(block.runs, from, to).map(fn), ...sliceRuns(block.runs, to, len)]);
  });
  return { blocks };
}

/** Pieces of text inside the range (code blocks excluded). */
export function rangeRuns(doc: RteDoc, range: RteRange): RteRun[] {
  const out: RteRun[] = [];
  for (let i = range.start.block; i <= range.end.block; i++) {
    const block = doc.blocks[i];
    if (!block || block.type === 'code') continue;
    const from = i === range.start.block ? range.start.offset : 0;
    const to = i === range.end.block ? range.end.offset : blockLength(block);
    out.push(...sliceRuns(block.runs, from, to));
  }
  return out;
}

/** True when every character in the (non-empty) range has `mark`. */
export function hasMark(doc: RteDoc, range: RteRange, mark: RteMark): boolean {
  const runs = rangeRuns(doc, range);
  return runs.length > 0 && runs.every((r) => r.marks.includes(mark));
}

export function setMark(doc: RteDoc, range: RteRange, mark: RteMark, on: boolean): RteDoc {
  return mapRange(doc, range, (r) => ({ ...r, marks: on ? canonicalMarks([...r.marks, mark]) : r.marks.filter((m) => m !== mark) }));
}

export function setLink(doc: RteDoc, range: RteRange, href: string | null): RteDoc {
  return mapRange(doc, range, (r) => (href === null ? { text: r.text, marks: r.marks } : { text: r.text, marks: r.marks, link: href }));
}

export function clearFormatting(doc: RteDoc, range: RteRange): RteDoc {
  return mapRange(doc, range, (r) => ({ text: r.text, marks: [] }));
}

/** The link range (extent of the same href) around a position, if any. */
export function linkAround(doc: RteDoc, pos: RtePos): { range: RteRange; href: string } | null {
  const block = doc.blocks[pos.block];
  if (!block) return null;
  let at = 0;
  const runs = block.runs;
  for (let i = 0; i < runs.length; i++) {
    const r = runs[i];
    if (!r) continue;
    const end = at + r.text.length;
    if (r.link !== undefined && pos.offset >= at && pos.offset <= end) {
      const href = r.link;
      let from = at;
      let to = end;
      // Normalized runs can split one link by marks: extend over neighbors with the same href.
      for (let j = i - 1, p = at; j >= 0; j--) {
        const prev = runs[j];
        if (prev?.link !== href) break;
        p -= prev.text.length;
        from = p;
      }
      for (let j = i + 1, p = end; j < runs.length; j++) {
        const next = runs[j];
        if (next?.link !== href) break;
        p += next.text.length;
        to = p;
      }
      return { range: { start: { block: pos.block, offset: from }, end: { block: pos.block, offset: to } }, href };
    }
    at = end;
  }
  return null;
}

/** Update the attributes of every block touched by the range. */
export function mapBlocks(doc: RteDoc, range: RteRange, fn: (block: RteBlock) => RteBlock): RteDoc {
  return { blocks: doc.blocks.map((b, i) => (i >= range.start.block && i <= range.end.block ? fn(b) : b)) };
}

/** Change a block's type, keeping text (marks are dropped for code blocks). */
export function asType(block: RteBlock, type: RteBlockType, extra: { level?: RteHeadingLevel; list?: RteListType } = {}): RteBlock {
  const base: RteBlock = { type, runs: block.runs, ...(block.align && type !== 'code' ? { align: block.align } : {}) };
  if (type === 'heading') return setRuns({ ...base, level: extra.level ?? 1 }, block.runs);
  if (type === 'list') return setRuns({ ...base, list: extra.list ?? 'bullet', depth: block.type === 'list' ? (block.depth ?? 0) : 0 }, block.runs);
  if (type === 'code') return setRuns({ type: 'code', runs: [] }, block.runs.map((r) => ({ text: r.text, marks: [] })));
  return setRuns(base, block.runs);
}

/** Word boundary before/after an offset (Intl.Segmenter word granularity). */
export function wordBoundary(text: string, offset: number, direction: -1 | 1, locale: string): number {
  const segments = [...new Intl.Segmenter(locale, { granularity: 'word' }).segment(text)];
  if (direction < 0) {
    let result = 0;
    for (const s of segments) {
      if (s.index >= offset) break;
      // Skip trailing spaces, then the word before them.
      if (s.isWordLike) result = s.index;
    }
    return result;
  }
  for (const s of segments) {
    const end = s.index + s.segment.length;
    if (end > offset && s.isWordLike) return end;
  }
  return text.length;
}

/** Grapheme boundary before/after an offset (emoji and combining marks stay whole). */
export function graphemeBoundary(text: string, offset: number, direction: -1 | 1, locale: string): number {
  let previous = 0;
  for (const s of new Intl.Segmenter(locale, { granularity: 'grapheme' }).segment(text)) {
    const end = s.index + s.segment.length;
    if (direction > 0 && s.index >= offset) return end;
    if (direction < 0 && end >= offset) return s.index < offset ? s.index : previous;
    previous = s.index;
  }
  return direction > 0 ? text.length : previous;
}

/** Documents are structurally equal (for "dirty" and change detection). */
export function sameDoc(a: RteDoc, b: RteDoc): boolean {
  return a === b || JSON.stringify(a.blocks) === JSON.stringify(b.blocks);
}

/** Ensure a valid document: at least one block, list depths in range, normalized runs. */
export function normalizeDoc(doc: RteDoc): RteDoc {
  const blocks = doc.blocks.map((b) => {
    const runs = b.type === 'code' ? normalizeRuns(b.runs.map((r) => ({ text: r.text, marks: [] }))) : normalizeRuns(b.runs);
    if (b.type === 'list') return { ...b, list: b.list ?? 'bullet', depth: Math.max(0, Math.min(MAX_DEPTH, b.depth ?? 0)), runs };
    if (b.type === 'heading') return { ...b, level: b.level ?? 1, runs };
    return { ...b, runs };
  });
  return { blocks: blocks.length ? blocks : [paragraph()] };
}
