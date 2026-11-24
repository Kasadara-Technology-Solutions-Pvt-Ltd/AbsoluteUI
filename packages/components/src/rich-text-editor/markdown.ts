/**
 * Markdown input and output for the rich text model (SPEC section 18.21). A CommonMark
 * subset: ATX headings, paragraphs, hard breaks (backslash or two spaces), block
 * quotes, fenced code, bullet and ordered lists (nesting by indentation), and
 * inline emphasis (`*`/`_`), strong (`**`/`__`), strike (`~~`), code spans, links,
 * autolinks, backslash escapes, and `<u>...</u>` for underline (the only inline HTML
 * recognized). Alignment has no Markdown form and is dropped on output. Link URLs
 * pass through the editor's URL policy; rejected links keep their text only.
 */
import { MARKS, normalizeDoc, normalizeRuns, paragraph, type RteBlock, type RteDoc, type RteHeadingLevel, type RteMark, type RteRun } from './model.js';

const DELIMS: Readonly<Record<Exclude<RteMark, 'code' | 'underline'>, string>> = { bold: '**', italic: '*', strike: '~~' };

function escapeText(text: string): string {
  return text.replace(/([\\`*_[\]~<>])/g, '\\$1');
}

/** Escape characters that would start a block construct at the beginning of a line. */
function escapeLineStart(line: string): string {
  return line.replace(/^(\s*)(#{1,6}\s|>|[-+*]\s|\d+[.)]\s)/, (_m, space: string, marker: string) => `${space}\\${marker}`);
}

function codeSpan(text: string): string {
  let fence = '`';
  while (text.includes(fence)) fence += '`';
  const pad = text.startsWith('`') || text.endsWith('`') ? ' ' : '';
  return `${fence}${pad}${text}${pad}${fence}`;
}

function inlineMarkdown(runs: readonly RteRun[]): string {
  let out = '';
  let i = 0;
  while (i < runs.length) {
    const link = runs[i]?.link;
    const group: RteRun[] = [];
    while (i < runs.length && runs[i]?.link === link) {
      const r = runs[i];
      if (r) group.push(r);
      i++;
    }
    const text = marksMarkdown(group);
    out += link === undefined ? text : `[${text}](${/[\s()<>]/.test(link) ? `<${link.replace(/[<>]/g, encodeURIComponent)}>` : link})`;
  }
  return out;
}

function marksMarkdown(runs: readonly RteRun[]): string {
  const open: RteMark[] = [];
  let out = '';
  const opener = (m: RteMark): string => (m === 'underline' ? '<u>' : m === 'code' ? '' : DELIMS[m]);
  const closer = (m: RteMark): string => (m === 'underline' ? '</u>' : m === 'code' ? '' : DELIMS[m]);
  for (const r of runs) {
    const want = MARKS.filter((m) => m !== 'code' && r.marks.includes(m));
    // Close from the top of the stack down to the first mark that ends here.
    const keep = open.findIndex((m) => !want.includes(m));
    if (keep >= 0) {
      for (let k = open.length - 1; k >= keep; k--) out += closer(open[k] ?? 'bold');
      open.length = keep;
    }
    for (const m of want) {
      if (!open.includes(m)) {
        out += opener(m);
        open.push(m);
      }
    }
    // Soft breaks become backslash hard breaks.
    const body = r.marks.includes('code') ? codeSpan(r.text) : escapeText(r.text);
    out += body.replace(/\n/g, '\\\n');
  }
  for (let k = open.length - 1; k >= 0; k--) out += closer(open[k] ?? 'bold');
  return out;
}

/** Serialize to Markdown. */
export function toMarkdown(doc: RteDoc): string {
  const parts: string[] = [];
  const counters: number[] = [];
  const kinds: (string | undefined)[] = [];
  let previous: RteBlock | undefined;
  for (const block of doc.blocks) {
    const text = inlineMarkdown(block.runs);
    let md: string;
    switch (block.type) {
      case 'heading':
        md = `${'#'.repeat(block.level ?? 1)} ${text.replace(/\\\n/g, ' ')}`;
        break;
      case 'quote':
        md = text.split('\n').map((l) => `> ${l}`).join('\n');
        break;
      case 'code': {
        const code = block.runs.map((r) => r.text).join('');
        let fence = '```';
        while (code.includes(fence)) fence += '`';
        md = `${fence}\n${code}\n${fence}`;
        break;
      }
      case 'list': {
        const depth = block.depth ?? 0;
        // Numbering continues at a depth until the list kind changes there or a shallower item ends it.
        const prevDepth = previous?.type === 'list' ? (previous.depth ?? 0) : -1;
        if (prevDepth < depth || kinds[depth] !== block.list) counters[depth] = 0;
        counters.length = depth + 1;
        kinds.length = depth + 1;
        kinds[depth] = block.list;
        const n = (counters[depth] ?? 0) + 1;
        counters[depth] = n;
        const marker = block.list === 'ordered' ? `${String(n)}. ` : '- ';
        // Four spaces per level nest under both "- " and "1. " items (CommonMark).
        const indent = '    '.repeat(depth);
        md = `${indent}${marker}${text.split('\n').join(`\n${indent}${' '.repeat(marker.length)}`)}`;
        break;
      }
      default:
        md = text.split('\n').map(escapeLineStart).join('\n');
    }
    if (block.type !== 'list') {
      counters.length = 0;
      kinds.length = 0;
    }
    // List items stay together; everything else is separated by a blank line.
    const tight = previous?.type === 'list' && block.type === 'list';
    const quoteRun = previous?.type === 'quote' && block.type === 'quote';
    if (parts.length) parts.push(tight ? '\n' : quoteRun ? '\n>\n' : '\n\n');
    parts.push(md);
    previous = block;
  }
  return parts.join('');
}

interface InlineCtx {
  readonly marks: readonly RteMark[];
  readonly link?: string;
}

const PUNCT = /[!"#$%&'()*+,\-./:;<=>?@[\\\]^_`{|}~]/;

function isSpace(c: string | undefined): boolean {
  return c === undefined || /\s/.test(c);
}

function isWord(c: string | undefined): boolean {
  return c !== undefined && /[\p{L}\p{N}]/u.test(c);
}

/** Inline Markdown to runs. `validateUrl` returns the URL to keep or null to drop the link. */
export function parseInline(text: string, ctx: InlineCtx, validateUrl: (url: string) => string | null, out: RteRun[] = []): RteRun[] {
  let buf = '';
  const flush = (): void => {
    if (buf) out.push(ctx.link === undefined ? { text: buf, marks: ctx.marks } : { text: buf, marks: ctx.marks, link: ctx.link });
    buf = '';
  };
  const withMark = (m: RteMark): InlineCtx => ({ ...ctx, marks: [...ctx.marks, m] });
  let i = 0;
  while (i < text.length) {
    const c = text[i] ?? '';
    const next = text[i + 1];
    if (c === '\\' && next === '\n') {
      buf += '\n';
      i += 2;
      continue;
    }
    if (c === '\\' && next !== undefined && PUNCT.test(next)) {
      buf += next;
      i += 2;
      continue;
    }
    if (c === '`') {
      let n = 1;
      while (text[i + n] === '`') n++;
      const fence = '`'.repeat(n);
      let j = text.indexOf(fence, i + n);
      while (j >= 0 && text[j + n] === '`') j = text.indexOf(fence, j + n + 1);
      if (j < 0) {
        buf += fence;
        i += n;
        continue;
      }
      flush();
      let code = text.slice(i + n, j).replace(/\n/g, ' ');
      if (code.startsWith(' ') && code.endsWith(' ') && code.trim() !== '') code = code.slice(1, -1);
      out.push(ctx.link === undefined ? { text: code, marks: [...ctx.marks, 'code'] } : { text: code, marks: [...ctx.marks, 'code'], link: ctx.link });
      i = j + n;
      continue;
    }
    if (c === '<') {
      const auto = /^<((?:https?:\/\/|mailto:)[^\s<>]+)>/i.exec(text.slice(i));
      if (auto?.[1] && ctx.link === undefined) {
        flush();
        const url = validateUrl(auto[1]);
        out.push(url === null ? { text: auto[1], marks: ctx.marks } : { text: auto[1], marks: ctx.marks, link: url });
        i += auto[0].length;
        continue;
      }
      if (text.startsWith('<u>', i)) {
        const end = text.indexOf('</u>', i + 3);
        if (end > i) {
          flush();
          parseInline(text.slice(i + 3, end), withMark('underline'), validateUrl, out);
          i = end + 4;
          continue;
        }
      }
    }
    if (c === '[' && ctx.link === undefined) {
      let depth = 1;
      let j = i + 1;
      while (j < text.length && depth > 0) {
        if (text[j] === '\\') j++;
        else if (text[j] === '[') depth++;
        else if (text[j] === ']') depth--;
        j++;
      }
      const target = depth === 0 ? /^\((?:<([^<>\n]*)>|([^\s()]*))(?:\s+"[^"]*")?\)/.exec(text.slice(j)) : null;
      if (target) {
        flush();
        const raw = target[1] ?? target[2] ?? '';
        const url = validateUrl(raw);
        const label = text.slice(i + 1, j - 1);
        parseInline(label, url === null ? ctx : { ...ctx, link: url }, validateUrl, out);
        i = j + target[0].length;
        continue;
      }
    }
    if (c === '*' || c === '_' || c === '~') {
      let n = 1;
      while (text[i + n] === c) n++;
      const before = text[i - 1];
      const after = text[i + n];
      const canOpen = !isSpace(after) && !(c === '_' && isWord(before)) && (c !== '~' || n === 2);
      if (canOpen) {
        const want = c === '~' ? 2 : Math.min(3, n);
        const close = findCloser(text, i + n, c, want);
        if (close >= 0) {
          flush();
          const inner = text.slice(i + want, close);
          const innerCtx: InlineCtx = c === '~' ? withMark('strike') : want === 3 ? { ...ctx, marks: [...ctx.marks, 'bold', 'italic'] } : withMark(want === 2 ? 'bold' : 'italic');
          // Extra opener characters beyond the used delimiter stay literal.
          if (n > want) buf += c.repeat(n - want);
          parseInline(inner, innerCtx, validateUrl, out);
          i = close + want;
          continue;
        }
      }
      buf += c.repeat(n);
      i += n;
      continue;
    }
    buf += c;
    i++;
  }
  flush();
  return out;
}

/** Index of a closing delimiter run of exactly `want` (or >= 3 for 3) characters, or -1. */
function findCloser(text: string, from: number, c: string, want: number): number {
  let i = from;
  while (i < text.length) {
    if (text[i] === '\\') {
      i += 2;
      continue;
    }
    if (text[i] === '`') {
      let n = 1;
      while (text[i + n] === '`') n++;
      const end = text.indexOf('`'.repeat(n), i + n);
      i = end < 0 ? i + n : end + n;
      continue;
    }
    if (text[i] === c) {
      let n = 1;
      while (text[i + n] === c) n++;
      const before = text[i - 1];
      const after = text[i + n];
      const canClose = !isSpace(before) && !(c === '_' && isWord(after));
      if (canClose && (n === want || (want === 3 && n >= 3)) && i > from) return i;
      i += n;
      continue;
    }
    i++;
  }
  return -1;
}

const LIST_ITEM = /^( *)([-*+]|\d{1,9}[.)])( +|$)(.*)$/;
const FENCE = /^ {0,3}(`{3,}|~{3,})/;

/** Parse Markdown into a document. */
export function fromMarkdown(markdown: string, validateUrl: (url: string) => string | null, headings: readonly RteHeadingLevel[] = [1, 2, 3]): RteDoc {
  const lines = markdown.replace(/\r\n?/g, '\n').replace(/\t/g, '    ').split('\n');
  const blocks: RteBlock[] = [];
  let para: string[] = [];
  let paraType: 'paragraph' | 'quote' = 'paragraph';
  const inline = (text: string): RteRun[] => normalizeRuns(parseInline(text, { marks: [] }, validateUrl));
  /** Join paragraph lines: hard breaks become "\n", soft breaks a space. */
  const joinLines = (ls: readonly string[]): string => ls.map((l, k) => {
    const last = k === ls.length - 1;
    if (last) return l.trim();
    if (/ {2,}$/.test(l)) return `${l.trim()}\\\n`;
    if (l.endsWith('\\')) return `${l.slice(0, -1).trim()}\\\n`;
    return `${l.trim()} `;
  }).join('').replace(/\\\n/g, '\\\n');
  const flush = (): void => {
    if (para.length) blocks.push({ type: paraType, runs: inline(joinLines(para)) });
    para = [];
    paraType = 'paragraph';
  };
  /** Indentation of the open list items, one per depth. */
  const indents: number[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (!LIST_ITEM.test(line) && line.trim() !== '') indents.length = 0;
    const fence = FENCE.exec(line);
    if (fence?.[1]) {
      flush();
      const marker = fence[1];
      const code: string[] = [];
      i++;
      while (i < lines.length && !(lines[i] ?? '').trimStart().startsWith(marker)) code.push(lines[i++] ?? '');
      i++;
      const text = code.join('\n');
      blocks.push({ type: 'code', runs: text ? [{ text, marks: [] }] : [] });
      continue;
    }
    if (line.trim() === '') {
      flush();
      i++;
      continue;
    }
    const heading = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?(?:[ \t]+#+)?[ \t]*$/.exec(line);
    if (heading?.[1]) {
      flush();
      const n = heading[1].length;
      const level = headings.filter((l) => l <= n).pop() ?? headings[0];
      const runs = inline(heading[2] ?? '');
      blocks.push(level === undefined ? { type: 'paragraph', runs } : { type: 'heading', level, runs });
      i++;
      continue;
    }
    if (/^ {0,3}([-*_])( *\1){2,} *$/.test(line)) {
      // Thematic breaks have no model equivalent: they separate paragraphs only.
      flush();
      i++;
      continue;
    }
    const quote = /^ {0,3}> ?(.*)$/.exec(line);
    if (quote) {
      if (paraType !== 'quote') flush();
      paraType = 'quote';
      const content = quote[1] ?? '';
      if (content.trim() === '') flush();
      else para.push(content);
      i++;
      continue;
    }
    const item = LIST_ITEM.exec(line);
    if (item && (para.length === 0 || paraType === 'quote' || item[2] === '-' || item[2] === '*' || item[2] === '+' || /^1[.)]$/.test(item[2] ?? ''))) {
      flush();
      const indent = (item[1] ?? '').length;
      const marker = item[2] ?? '-';
      const ordered = /\d/.test(marker);
      const contentIndent = indent + marker.length + Math.max(1, (item[3] ?? ' ').length);
      const content = [item[4] ?? ''];
      i++;
      // Lazy continuation: following non-blank lines that are not new items or blocks.
      while (i < lines.length) {
        const nextLine = lines[i] ?? '';
        if (nextLine.trim() === '' || LIST_ITEM.test(nextLine) || FENCE.test(nextLine) || /^ {0,3}(#{1,6}\s|>)/.test(nextLine)) break;
        content.push(nextLine.length >= contentIndent ? nextLine.slice(contentIndent) : nextLine.trim());
        i++;
      }
      // Depth follows the indentation relative to the open items (like CommonMark nesting).
      while (indents.length && indent < (indents[indents.length - 1] ?? 0)) indents.pop();
      if (indents.length === 0 || indent > (indents[indents.length - 1] ?? 0)) indents.push(indent);
      blocks.push({ type: 'list', list: ordered ? 'ordered' : 'bullet', depth: Math.min(4, indents.length - 1), runs: inline(joinLines(content)) });
      continue;
    }
    if (paraType === 'quote') flush();
    para.push(line);
    i++;
  }
  flush();
  return normalizeDoc({ blocks: blocks.length ? blocks : [paragraph()] });
}
