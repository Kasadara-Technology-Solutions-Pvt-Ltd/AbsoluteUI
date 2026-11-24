/**
 * HTML input and output for the rich text model (SPEC section 18.21: sanitized HTML
 * I/O). Input is parsed only through the core sanitizer (inert parse, allowlist
 * rebuild) and then mapped to the model, so only supported structure survives.
 * Output is generated from the model with escaping: it contains only p, h1-h3,
 * blockquote, pre/code, ul/ol/li, strong, em, u, s, code, br, and a[href] with a
 * validated URL. Alignment is written as `data-align` (style attributes are never
 * produced, so the output also renders under a strict CSP).
 */
import { sanitizeHtml, type SanitizePolicy } from '@absoluteui/core';
import { normalizeDoc, normalizeRuns, paragraph, type RteAlign, type RteBlock, type RteDoc, type RteHeadingLevel, type RteMark, type RteRun } from './model.js';

const TAGS: Readonly<Record<RteMark, string>> = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' };
const ALIGNS: readonly RteAlign[] = ['start', 'center', 'end', 'justify'];

/** Sanitizer policy for editor input: the default allowlist plus alignment attributes. */
export const RTE_SANITIZE_POLICY: SanitizePolicy = {
  elements: {
    p: ['data-align', 'align'], div: ['data-align', 'align'], br: [], strong: [], b: [], em: [], i: [], u: [], s: [], del: [], strike: [], code: [], span: [],
    h1: ['data-align', 'align'], h2: ['data-align', 'align'], h3: ['data-align', 'align'], h4: ['data-align', 'align'], h5: ['data-align', 'align'], h6: ['data-align', 'align'],
    ul: [], ol: [], li: ['data-align', 'align'], blockquote: [], pre: [], a: ['href'],
  },
  globalAttributes: [],
  urlSchemes: ['http', 'https', 'mailto', 'tel'],
  allowRelativeUrls: true,
};

export function escapeHtml(text: string): string {
  return text.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] ?? c);
}

function runsToHtml(runs: readonly RteRun[]): string {
  let out = '';
  for (const r of runs) {
    let html = escapeHtml(r.text).replace(/\n/g, '<br>');
    for (const m of [...r.marks].reverse()) html = `<${TAGS[m]}>${html}</${TAGS[m]}>`;
    if (r.link !== undefined) html = `<a href="${escapeHtml(r.link)}">${html}</a>`;
    out += html;
  }
  return out;
}

function alignAttr(block: RteBlock): string {
  return block.align && block.align !== 'start' ? ` data-align="${block.align}"` : '';
}

/** Serialize the model to HTML (lists nest by depth; consecutive quotes share one blockquote). */
export function toHtml(doc: RteDoc): string {
  const out: string[] = [];
  const open: { tag: 'ul' | 'ol'; depth: number }[] = [];
  const closeLists = (depth: number): void => {
    while (open.length > depth) {
      const top = open.pop();
      out.push(`</li></${top?.tag ?? 'ul'}>`);
    }
  };
  let inQuote = false;
  for (const block of doc.blocks) {
    if (block.type !== 'quote' && inQuote) {
      out.push('</blockquote>');
      inQuote = false;
    }
    if (block.type === 'list') {
      const depth = block.depth ?? 0;
      const tag = block.list === 'ordered' ? 'ol' : 'ul';
      if (open.length > depth + 1) closeLists(depth + 1);
      const same = open[depth];
      if (open.length === depth + 1 && same && same.tag !== tag) closeLists(depth);
      if (open.length === depth + 1) out.push('</li>');
      while (open.length < depth + 1) {
        const t = open.length === depth ? tag : 'ul';
        out.push(`<${t}>`);
        open.push({ tag: t, depth: open.length });
        if (open.length < depth + 1) out.push('<li>');
      }
      out.push(`<li${alignAttr(block)}>${runsToHtml(block.runs)}`);
      continue;
    }
    closeLists(0);
    const content = runsToHtml(block.runs);
    switch (block.type) {
      case 'heading': {
        const tag = `h${String(block.level ?? 1)}`;
        out.push(`<${tag}${alignAttr(block)}>${content}</${tag}>`);
        break;
      }
      case 'quote':
        if (!inQuote) {
          out.push('<blockquote>');
          inQuote = true;
        }
        out.push(`<p${alignAttr(block)}>${content}</p>`);
        break;
      case 'code':
        out.push(`<pre><code>${escapeHtml(block.runs.map((r) => r.text).join(''))}</code></pre>`);
        break;
      default:
        out.push(`<p${alignAttr(block)}>${content}</p>`);
    }
  }
  closeLists(0);
  if (inQuote) out.push('</blockquote>');
  return out.join('');
}

interface Ctx {
  readonly marks: readonly RteMark[];
  readonly link?: string;
}

function markFor(tag: string): RteMark | null {
  switch (tag) {
    case 'strong': case 'b': return 'bold';
    case 'em': case 'i': return 'italic';
    case 'u': return 'underline';
    case 's': case 'del': case 'strike': return 'strike';
    case 'code': return 'code';
    default: return null;
  }
}

function alignOf(el: Element): RteAlign | undefined {
  const value = (el.getAttribute('data-align') ?? el.getAttribute('align') ?? '').toLowerCase();
  const mapped = value === 'left' ? 'start' : value === 'right' ? 'end' : value;
  return ALIGNS.includes(mapped as RteAlign) && mapped !== 'start' ? (mapped as RteAlign) : undefined;
}

const BLOCK_TAGS = new Set(['p', 'div', 'h1', 'h2', 'h3', 'h4', 'h5', 'h6', 'blockquote', 'pre', 'ul', 'ol', 'li']);

/** Inline content of `node` (stops at nested lists, which the caller handles). */
function inline(node: Node, ctx: Ctx, out: RteRun[]): void {
  for (const child of node.childNodes) {
    if (child.nodeType === 3) {
      // Collapse HTML whitespace like a browser would for normal text.
      const text = (child.textContent ?? '').replace(/[ \t\r\n\f]+/g, ' ');
      if (text !== '') out.push(ctx.link === undefined ? { text, marks: ctx.marks } : { text, marks: ctx.marks, link: ctx.link });
      continue;
    }
    if (!(child instanceof Element)) continue;
    const tag = child.localName;
    if (tag === 'ul' || tag === 'ol') continue;
    if (tag === 'br') {
      out.push(ctx.link === undefined ? { text: '\n', marks: ctx.marks } : { text: '\n', marks: ctx.marks, link: ctx.link });
      continue;
    }
    const mark = markFor(tag);
    const next: Ctx = tag === 'a' && child.getAttribute('href') ? { marks: ctx.marks, link: child.getAttribute('href') ?? '' } : mark ? { ...ctx, marks: [...ctx.marks, mark] } : ctx;
    inline(child, next, out);
  }
}

function trimRuns(runs: RteRun[]): RteRun[] {
  const out = normalizeRuns(runs);
  const first = out[0];
  if (first) out[0] = { ...first, text: first.text.replace(/^ +/, '') };
  const last = out[out.length - 1];
  if (last) out[out.length - 1] = { ...last, text: last.text.replace(/ +$/, '') };
  return normalizeRuns(out);
}

function headingLevel(tag: string, allowed: readonly RteHeadingLevel[]): RteHeadingLevel | null {
  const n = Number(tag.slice(1));
  const level = allowed.filter((l) => l <= n).pop() ?? allowed[0];
  return level ?? null;
}

/** Map sanitized DOM to blocks. */
export function fromDom(root: ParentNode, headings: readonly RteHeadingLevel[] = [1, 2, 3]): RteBlock[] {
  const blocks: RteBlock[] = [];
  let pending: RteRun[] = [];
  const flush = (quote: boolean): void => {
    const runs = trimRuns(pending);
    pending = [];
    if (runs.length) blocks.push({ type: quote ? 'quote' : 'paragraph', runs });
  };
  const list = (el: Element, depth: number): void => {
    const type = el.localName === 'ol' ? 'ordered' : 'bullet';
    for (const li of el.children) {
      if (li.localName === 'ul' || li.localName === 'ol') {
        list(li, Math.min(4, depth + 1));
        continue;
      }
      if (li.localName !== 'li') continue;
      const runs: RteRun[] = [];
      inline(li, { marks: [] }, runs);
      // Block children of a list item (p) contribute their text too.
      const align = alignOf(li);
      blocks.push({ type: 'list', list: type, depth, ...(align ? { align } : {}), runs: trimRuns(runs) });
      for (const nested of li.children) if (nested.localName === 'ul' || nested.localName === 'ol') list(nested, Math.min(4, depth + 1));
    }
  };
  const walk = (parent: ParentNode, quote: boolean): void => {
    for (const node of parent.childNodes) {
      if (node.nodeType === 3 || (node instanceof Element && !BLOCK_TAGS.has(node.localName))) {
        const runs: RteRun[] = [];
        const holder = parent.ownerDocument?.createElement('span');
        if (!holder) continue;
        holder.append(node.cloneNode(true));
        inline(holder, { marks: [] }, runs);
        pending.push(...runs);
        continue;
      }
      if (!(node instanceof Element)) continue;
      flush(quote);
      const tag = node.localName;
      const align = alignOf(node);
      const attrs = align ? { align } : {};
      if (tag === 'ul' || tag === 'ol') {
        list(node, 0);
      } else if (tag === 'pre') {
        const text = node.textContent.replace(/\n$/, '');
        blocks.push({ type: 'code', runs: text ? [{ text, marks: [] }] : [] });
      } else if (tag === 'blockquote') {
        walk(node, true);
      } else if (/^h[1-6]$/.test(tag)) {
        const runs: RteRun[] = [];
        inline(node, { marks: [] }, runs);
        const level = headingLevel(tag, headings);
        blocks.push(level === null ? { type: 'paragraph', ...attrs, runs: trimRuns(runs) } : { type: 'heading', level, ...attrs, runs: trimRuns(runs) });
      } else if ([...node.children].some((c) => BLOCK_TAGS.has(c.localName))) {
        walk(node, quote);
      } else {
        const runs: RteRun[] = [];
        inline(node, { marks: [] }, runs);
        blocks.push({ type: quote ? 'quote' : 'paragraph', ...attrs, runs: trimRuns(runs) });
      }
    }
    flush(quote);
  };
  walk(root, false);
  return blocks;
}

/** Parse untrusted HTML into a document (sanitized first). */
export function fromHtml(html: string, headings: readonly RteHeadingLevel[] = [1, 2, 3], doc: Document = document): RteDoc {
  const fragment = sanitizeHtml(html, RTE_SANITIZE_POLICY, doc);
  const blocks = fromDom(fragment, headings);
  return normalizeDoc({ blocks: blocks.length ? blocks : [paragraph()] });
}
