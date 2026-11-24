/**
 * Chat Markdown (R20 P5): a small, safe Markdown subset rendered straight to DOM nodes.
 * Model output is untrusted, so nothing is ever parsed as HTML: every character ends up in
 * a text node, and the only elements created are the fixed set below. Links render only
 * for http(s) and scheme-less URLs (`isSafeHref`); anything else stays plain text.
 *
 * Blocks: ATX headings (`#` to `######`), paragraphs (single line breaks kept), bullet and
 * numbered lists (nested by indentation), block quotes, horizontal rules, and fenced code
 * blocks (``` or ~~~, shown as text with a copy button supplied by the caller). Inline:
 * `code`, **strong**, *emphasis*, ~~strikethrough~~, [links](https://...), <autolinks>,
 * bare http(s) URLs, and backslash escapes. Raw HTML in the source is shown as text.
 *
 * Unterminated constructs (an open code fence while text is still streaming) render as
 * if they were closed, so a partial message never shows stray markers for long.
 */
import { isSafeHref } from '../internal/href.js';

export interface MarkdownRenderOptions {
  readonly doc: Document;
  /** Heading level of a Markdown `#` heading (`##` is one level lower, up to 6). */
  readonly headingLevel: number;
  /** Builds a fenced code block (the chat adds the language label and the copy button). */
  readonly codeBlock: (code: string, language: string) => HTMLElement;
}

/** Largest source rendered as Markdown; longer text is rendered as plain text (linear time either way). */
export const MAX_MARKDOWN_LENGTH = 200_000;

const FENCE = /^ {0,3}(`{3,}|~{3,})\s*([\w+#.-]*)[^`]*$/;
const HEADING = /^ {0,3}(#{1,6})(?:[ \t]+(.*?))?[ \t#]*$/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const BULLET = /^([ \t]*)([-*+])[ \t]+(.*)$/;
const ORDERED = /^([ \t]*)(\d{1,9})([.)])[ \t]+(.*)$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const ESCAPABLE = '\\`*_{}[]()#+-.!~>|<';
const URL_START = /^https?:\/\/[^\s<]/i;

/** Indentation width (a tab counts as four spaces). */
function indentOf(text: string): number {
  let width = 0;
  for (const ch of text) width += ch === '\t' ? 4 : 1;
  return width;
}

interface ListItem {
  readonly lines: string[];
  readonly children: ListBlock[];
}

interface ListBlock {
  readonly ordered: boolean;
  readonly start: number;
  readonly indent: number;
  readonly items: ListItem[];
}

/** Renders Markdown source into a fragment of safe nodes. */
export function renderMarkdown(source: string, options: MarkdownRenderOptions): DocumentFragment {
  const { doc } = options;
  const fragment = doc.createDocumentFragment();
  if (source.length > MAX_MARKDOWN_LENGTH) {
    const p = doc.createElement('p');
    p.textContent = source;
    fragment.append(p);
    return fragment;
  }
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  let paragraph: string[] = [];
  let quote: string[] | null = null;
  const lists: ListBlock[] = [];

  const flushParagraph = (): void => {
    if (paragraph.length === 0) return;
    const p = doc.createElement('p');
    appendInlineLines(p, paragraph, doc);
    fragment.append(p);
    paragraph = [];
  };
  const flushQuote = (): void => {
    if (quote === null) return;
    const blockquote = doc.createElement('blockquote');
    const inner = renderMarkdown(quote.join('\n'), options);
    blockquote.append(inner);
    fragment.append(blockquote);
    quote = null;
  };
  const flushLists = (): void => {
    const top = lists[0];
    if (top) fragment.append(buildList(top, doc));
    lists.length = 0;
  };
  const flushAll = (): void => {
    flushParagraph();
    flushQuote();
    flushLists();
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i] ?? '';
    const fence = FENCE.exec(line);
    if (fence) {
      flushAll();
      const marker = fence[1] ?? '```';
      const code: string[] = [];
      let j = i + 1;
      for (; j < lines.length; j++) {
        const next = lines[j] ?? '';
        const closing = /^ {0,3}(`{3,}|~{3,})[ \t]*$/.exec(next)?.[1];
        if (closing?.startsWith(marker.charAt(0)) && closing.length >= marker.length) break;
        code.push(next);
      }
      fragment.append(options.codeBlock(code.join('\n'), fence[2] ?? ''));
      i = j;
      continue;
    }
    if (line.trim() === '') {
      // A blank line ends paragraphs and quotes; lists continue across single blank lines.
      flushParagraph();
      flushQuote();
      continue;
    }
    const quoted = QUOTE.exec(line);
    if (quoted) {
      flushParagraph();
      flushLists();
      quote ??= [];
      quote.push(quoted[1] ?? '');
      continue;
    }
    if (quote !== null && paragraph.length === 0) {
      // Lazy continuation of a quote.
      quote.push(line);
      continue;
    }
    const heading = HEADING.exec(line);
    if (heading) {
      flushAll();
      const level = Math.min(6, options.headingLevel + (heading[1] ?? '#').length - 1);
      const h = doc.createElement(`h${String(level)}`);
      h.className = 'aui-chat__md-heading';
      appendInline(h, heading[2] ?? '', doc);
      fragment.append(h);
      continue;
    }
    if (RULE.test(line)) {
      flushAll();
      fragment.append(doc.createElement('hr'));
      continue;
    }
    const bullet = BULLET.exec(line);
    const ordered = bullet ? null : ORDERED.exec(line);
    if (bullet || ordered) {
      flushParagraph();
      const indent = indentOf((bullet ? bullet[1] : ordered?.[1]) ?? '');
      const isOrdered = ordered !== null;
      const text = (bullet ? bullet[3] : ordered?.[4]) ?? '';
      const start = ordered ? Number(ordered[2]) : 1;
      // A different list kind at the outer level starts a new list.
      const top = lists[0];
      if (top && indent <= top.indent && top.ordered !== isOrdered) flushLists();
      addListItem(lists, indent, isOrdered, start, text);
      continue;
    }
    if (lists.length > 0) {
      const last = lists[lists.length - 1];
      const item = last?.items[last.items.length - 1];
      if (item && indentOf(/^[ \t]*/.exec(line)?.[0] ?? '') > 0) {
        // An indented line continues the current list item.
        item.lines.push(line.trim());
        continue;
      }
      flushLists();
    }
    paragraph.push(line.trim());
  }
  flushAll();
  return fragment;
}

function addListItem(stack: ListBlock[], indent: number, ordered: boolean, start: number, text: string): void {
  // Close deeper lists; a less indented item belongs to an outer list.
  while (stack.length > 1 && indent < (stack[stack.length - 1]?.indent ?? 0)) stack.pop();
  let current = stack[stack.length - 1];
  if (current && indent >= current.indent + 2) {
    const parent = current.items[current.items.length - 1];
    if (parent) {
      const child: ListBlock = { ordered, start, indent, items: [] };
      parent.children.push(child);
      stack.push(child);
      current = child;
    }
  }
  if (!current) {
    current = { ordered, start, indent, items: [] };
    stack.push(current);
  }
  current.items.push({ lines: [text], children: [] });
}

function buildList(block: ListBlock, doc: Document): HTMLElement {
  const list = doc.createElement(block.ordered ? 'ol' : 'ul');
  if (block.ordered && block.start !== 1) (list as HTMLOListElement).start = block.start;
  for (const item of block.items) {
    const li = doc.createElement('li');
    appendInlineLines(li, item.lines, doc);
    for (const child of item.children) li.append(buildList(child, doc));
    list.append(li);
  }
  return list;
}

/** Inline content of several source lines, joined by line breaks. */
function appendInlineLines(parent: HTMLElement, lines: readonly string[], doc: Document): void {
  lines.forEach((line, index) => {
    if (index > 0) parent.append(doc.createElement('br'));
    appendInline(parent, line, doc);
  });
}

const isWordChar = (ch: string | undefined): boolean => ch !== undefined && /[\p{L}\p{N}]/u.test(ch);

/** Finds the closing delimiter of an emphasis run, honoring word boundaries for `_`. */
function findClose(text: string, from: number, delimiter: string): number {
  let i = from;
  while (i < text.length) {
    const ch = text.charAt(i);
    if (ch === '\\') {
      i += 2;
      continue;
    }
    if (ch === '`') {
      // Code spans bind tighter than emphasis.
      const run = /^`+/.exec(text.slice(i))?.[0] ?? '`';
      const end = text.indexOf(run, i + run.length);
      i = end === -1 ? i + run.length : end + run.length;
      continue;
    }
    if (text.startsWith(delimiter, i) && i > from && text.charAt(i - 1) !== ' ') {
      const after = text.charAt(i + delimiter.length);
      if (delimiter.startsWith('_') && isWordChar(after)) {
        i += 1;
        continue;
      }
      // `*a**` should close the single delimiter, not swallow a double one.
      if (delimiter.length === 1 && text.charAt(i + 1) === delimiter && text.charAt(i - 1) !== delimiter) {
        i += 2;
        continue;
      }
      return i;
    }
    i += 1;
  }
  return -1;
}

/** Finds the `]` that closes a link label opened at `from` (nested brackets allowed). */
function findLabelEnd(text: string, from: number): number {
  let depth = 0;
  for (let i = from; i < text.length; i++) {
    const ch = text.charAt(i);
    if (ch === '\\') {
      i += 1;
      continue;
    }
    if (ch === '[') depth += 1;
    else if (ch === ']') {
      depth -= 1;
      if (depth === 0) return i;
    }
  }
  return -1;
}

function link(doc: Document, href: string, children: (parent: HTMLElement) => void): HTMLElement {
  const a = doc.createElement('a');
  a.className = 'aui-chat__md-link';
  a.href = href;
  // Links from model output open outside the conversation and never pass the opener or referrer.
  a.target = '_blank';
  a.rel = 'noopener noreferrer nofollow';
  children(a);
  return a;
}

/** Appends the inline Markdown of one line to `parent`. */
export function appendInline(parent: HTMLElement, text: string, doc: Document): void {
  const base = doc.baseURI;
  let buffer = '';
  const flush = (): void => {
    if (buffer !== '') parent.append(doc.createTextNode(buffer));
    buffer = '';
  };
  let i = 0;
  while (i < text.length) {
    const ch = text.charAt(i);
    const rest = text.slice(i);
    if (ch === '\\' && i + 1 < text.length && ESCAPABLE.includes(text.charAt(i + 1))) {
      buffer += text.charAt(i + 1);
      i += 2;
      continue;
    }
    if (ch === '`') {
      const run = /^`+/.exec(rest)?.[0] ?? '`';
      const end = text.indexOf(run, i + run.length);
      if (end !== -1) {
        flush();
        const code = doc.createElement('code');
        code.className = 'aui-chat__md-code';
        const content = text.slice(i + run.length, end);
        code.textContent = content.length > 2 && content.startsWith(' ') && content.endsWith(' ') ? content.slice(1, -1) : content;
        parent.append(code);
        i = end + run.length;
        continue;
      }
      buffer += run;
      i += run.length;
      continue;
    }
    if (ch === '[') {
      const labelEnd = findLabelEnd(text, i);
      const target = labelEnd === -1 ? null : /^\(\s*<?([^\s()<>]*(?:\([^\s()<>]*\)[^\s()<>]*)*)>?(?:\s+"[^"]*")?\s*\)/.exec(text.slice(labelEnd + 1));
      if (labelEnd !== -1 && target) {
        flush();
        const label = text.slice(i + 1, labelEnd);
        const href = target[1] ?? '';
        if (href !== '' && isSafeHref(href, base)) parent.append(link(doc, href, (a) => { appendInline(a, label, doc); }));
        else {
          // Unsafe or empty destinations keep the label as text and drop the URL.
          const span = doc.createElement('span');
          appendInline(span, label, doc);
          parent.append(...span.childNodes);
        }
        i = labelEnd + 1 + target[0].length;
        continue;
      }
    }
    if (ch === '<') {
      const auto = /^<(https?:\/\/[^\s<>]+)>/i.exec(rest);
      if (auto?.[1] && isSafeHref(auto[1], base)) {
        flush();
        const url = auto[1];
        parent.append(link(doc, url, (a) => { a.textContent = url; }));
        i += auto[0].length;
        continue;
      }
    }
    if ((ch === 'h' || ch === 'H') && !isWordChar(text.charAt(i - 1) || undefined) && URL_START.test(rest)) {
      let url = /^\S+/.exec(rest)?.[0] ?? '';
      // Trailing punctuation belongs to the sentence, not the URL (a closing parenthesis only when unbalanced).
      while (/[.,;:!?'"*_~]$/.test(url) || (url.endsWith(')') && (url.match(/\(/g) ?? []).length < (url.match(/\)/g) ?? []).length)) url = url.slice(0, -1);
      if (isSafeHref(url, base)) {
        flush();
        parent.append(link(doc, url, (a) => { a.textContent = url; }));
        i += url.length;
        continue;
      }
    }
    const delimiter = rest.startsWith('**') ? '**' : rest.startsWith('__') ? '__' : rest.startsWith('~~') ? '~~' : ch === '*' || ch === '_' ? ch : null;
    if (delimiter !== null) {
      const opensWord = delimiter.startsWith('_') ? !isWordChar(text.charAt(i - 1) || undefined) : true;
      const nextChar = text.charAt(i + delimiter.length);
      if (opensWord && nextChar !== '' && nextChar !== ' ') {
        const close = findClose(text, i + delimiter.length, delimiter);
        if (close !== -1) {
          flush();
          const el = doc.createElement(delimiter === '~~' ? 's' : delimiter.length === 2 ? 'strong' : 'em');
          appendInline(el, text.slice(i + delimiter.length, close), doc);
          parent.append(el);
          i = close + delimiter.length;
          continue;
        }
      }
      buffer += delimiter;
      i += delimiter.length;
      continue;
    }
    buffer += ch;
    i += 1;
  }
  flush();
}
