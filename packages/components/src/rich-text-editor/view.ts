/**
 * DOM view of the rich text model: renders blocks into the contenteditable
 * surface (reusing the element of every unchanged block) and maps DOM selection
 * points to model positions and back. Text is set with textContent and elements
 * with createElement only (SPEC section 14.5); link hrefs were validated by the model's
 * producers. Internal to the Rich Text Editor.
 */
import { blockLength, type RteBlock, type RteDoc, type RtePos, type RteSelection } from './model.js';

const MARK_TAGS = { bold: 'strong', italic: 'em', underline: 'u', strike: 's', code: 'code' } as const;
const BLOCK_ATTR = 'data-aui-block';
const FILLER = 'data-aui-filler';
const LIST_CLASS = 'aui-rte__list';

interface Rendered {
  readonly block: RteBlock;
  readonly element: HTMLElement;
}

export class RteView {
  readonly root: HTMLElement;
  readonly #doc: Document;
  #rendered: Rendered[] = [];

  constructor(root: HTMLElement) {
    this.root = root;
    this.#doc = root.ownerDocument;
  }

  /** Render the document; elements of unchanged blocks (same object) are reused. */
  render(model: RteDoc): void {
    const cache = new Map<RteBlock, HTMLElement>();
    for (const r of this.#rendered) if (!cache.has(r.block)) cache.set(r.block, r.element);
    const rendered: Rendered[] = [];
    const top: Node[] = [];
    // Open list containers, one per depth.
    const lists: { tag: 'ul' | 'ol'; element: HTMLElement; last: HTMLElement | null }[] = [];
    model.blocks.forEach((block, index) => {
      let el = cache.get(block);
      if (el) cache.delete(block);
      else el = this.#blockElement(block);
      el.setAttribute(BLOCK_ATTR, String(index));
      rendered.push({ block, element: el });
      if (block.type !== 'list') {
        lists.length = 0;
        top.push(el);
        return;
      }
      const depth = block.depth ?? 0;
      const tag = block.list === 'ordered' ? 'ol' : 'ul';
      while (lists.length > depth + 1) lists.pop();
      const current = lists[depth];
      if (lists.length === depth + 1 && current && current.tag !== tag) lists.pop();
      while (lists.length < depth + 1) {
        const level = lists.length;
        const t = level === depth ? tag : 'ul';
        const container = this.#doc.createElement(t);
        container.className = LIST_CLASS;
        const parent = lists[level - 1];
        if (parent?.last) parent.last.append(container);
        else if (parent) parent.element.append(container);
        else top.push(container);
        lists.push({ tag: t, element: container, last: null });
      }
      const list = lists[depth];
      if (!list) return;
      // Remove nested containers from a reused item: they are rebuilt.
      for (const child of [...el.children]) if (child.classList.contains(LIST_CLASS)) child.remove();
      list.element.append(el);
      list.last = el;
    });
    this.root.replaceChildren(...top);
    this.#rendered = rendered;
  }

  #blockElement(block: RteBlock): HTMLElement {
    const doc = this.#doc;
    let el: HTMLElement;
    switch (block.type) {
      case 'heading':
        el = doc.createElement(`h${String(block.level ?? 1)}`);
        break;
      case 'quote':
        el = doc.createElement('blockquote');
        break;
      case 'code': {
        el = doc.createElement('pre');
        const code = doc.createElement('code');
        this.#appendText(code, block.runs.map((r) => r.text).join(''));
        el.append(code);
        this.#filler(code, block);
        el.className = 'aui-rte__block aui-rte__code';
        return el;
      }
      case 'list':
        el = doc.createElement('li');
        break;
      default:
        el = doc.createElement('p');
    }
    el.className = `aui-rte__block${block.align && block.align !== 'start' ? ` aui-rte__align-${block.align}` : ''}`;
    for (const r of block.runs) {
      let node: Node = doc.createDocumentFragment();
      this.#appendText(node, r.text);
      for (const m of [...r.marks].reverse()) {
        const wrap = doc.createElement(MARK_TAGS[m]);
        wrap.append(node);
        node = wrap;
      }
      if (r.link !== undefined) {
        const a = doc.createElement('a');
        a.href = r.link;
        a.className = 'aui-rte__link';
        a.append(node);
        node = a;
      }
      el.append(node);
    }
    this.#filler(el, block);
    return el;
  }

  #appendText(parent: Node, text: string): void {
    const parts = text.split('\n');
    parts.forEach((part, i) => {
      if (i > 0) parent.appendChild(this.#doc.createElement('br'));
      if (part !== '') parent.appendChild(this.#doc.createTextNode(part));
    });
  }

  /** Empty blocks and text ending in a line break need a trailing filler <br> for the caret. */
  #filler(el: Node, block: RteBlock): void {
    const text = block.runs.map((r) => r.text).join('');
    if (text === '' || text.endsWith('\n')) {
      const br = this.#doc.createElement('br');
      br.setAttribute(FILLER, '');
      el.appendChild(br);
    }
  }

  blockElement(index: number): HTMLElement | null {
    return this.#rendered[index]?.element ?? null;
  }

  /** Leaves of a block in order: text nodes and <br> (filler excluded), skipping nested lists. */
  #leaves(el: HTMLElement): (Text | HTMLBRElement)[] {
    const out: (Text | HTMLBRElement)[] = [];
    const walk = (node: Node): void => {
      for (const child of node.childNodes) {
        if (child instanceof Text) out.push(child);
        else if (child instanceof HTMLBRElement) {
          if (!child.hasAttribute(FILLER)) out.push(child);
        } else if (child instanceof HTMLElement && !child.classList.contains(LIST_CLASS) && !child.hasAttribute(BLOCK_ATTR)) walk(child);
      }
    };
    walk(el);
    return out;
  }

  /** Model position of a DOM point inside the surface, or null outside it. */
  domToPos(node: Node, offset: number): RtePos | null {
    if (!this.root.contains(node)) return null;
    if (node === this.root) {
      const child = this.root.childNodes[Math.min(offset, this.root.childNodes.length - 1)];
      const target = child instanceof HTMLElement ? (child.hasAttribute(BLOCK_ATTR) ? child : child.querySelector<HTMLElement>(`[${BLOCK_ATTR}]`)) : null;
      if (!target) return this.#end();
      const index = Number(target.getAttribute(BLOCK_ATTR));
      return offset >= this.root.childNodes.length ? this.#end() : { block: index, offset: 0 };
    }
    const start = node instanceof Element ? node : node.parentElement;
    const blockEl = start?.closest<HTMLElement>(`[${BLOCK_ATTR}]`);
    if (!blockEl || !this.root.contains(blockEl)) return null;
    const index = Number(blockEl.getAttribute(BLOCK_ATTR));
    if (node === blockEl || (node instanceof Element && node.classList.contains(LIST_CLASS))) {
      // Offset counts child nodes: sum the leaves before that child.
      const range = this.#doc.createRange();
      range.setStart(blockEl, 0);
      range.setEnd(node, offset);
      let acc = 0;
      for (const leaf of this.#leaves(blockEl)) {
        if (!range.intersectsNode(leaf)) continue;
        acc += leaf instanceof Text ? leaf.data.length : 1;
      }
      return { block: index, offset: acc };
    }
    let acc = 0;
    const range = this.#doc.createRange();
    range.setStart(blockEl, 0);
    range.setEnd(node, offset);
    for (const leaf of this.#leaves(blockEl)) {
      if (leaf === node) return { block: index, offset: acc + offset };
      if (!range.intersectsNode(leaf)) break;
      // A leaf that contains the end point only partially cannot happen here (leaves are text or br).
      acc += leaf instanceof Text ? leaf.data.length : 1;
    }
    return { block: index, offset: acc };
  }

  #end(): RtePos {
    const last = this.#rendered.length - 1;
    const block = this.#rendered[last]?.block;
    return { block: Math.max(0, last), offset: block ? blockLength(block) : 0 };
  }

  /** DOM point for a model position. */
  posToDom(pos: RtePos): { node: Node; offset: number } {
    const el = this.blockElement(pos.block) ?? this.root;
    const target = el.firstElementChild instanceof HTMLElement && el.firstElementChild.localName === 'code' && el.localName === 'pre' ? el.firstElementChild : el;
    let acc = 0;
    let lastText: Text | null = null;
    for (const leaf of this.#leaves(target)) {
      if (leaf instanceof Text) {
        const len = leaf.data.length;
        if (pos.offset <= acc + len) return { node: leaf, offset: pos.offset - acc };
        acc += len;
        lastText = leaf;
      } else {
        const br = leaf;
        const parent = br.parentNode ?? target;
        if (pos.offset === acc) return { node: parent, offset: [...parent.childNodes].indexOf(br) };
        acc += 1;
        lastText = null;
      }
    }
    // End of the block: before the filler (after a trailing break) or at the end of the last text.
    const filler = [...target.querySelectorAll(`br[${FILLER}]`)].find((b) => b.closest(`[${BLOCK_ATTR}]`) === el);
    if (filler?.parentNode) return { node: filler.parentNode, offset: [...filler.parentNode.childNodes].indexOf(filler) };
    if (lastText) return { node: lastText, offset: lastText.data.length };
    const nested = [...target.children].findIndex((c) => c.classList.contains(LIST_CLASS));
    return { node: target, offset: nested >= 0 ? nested : target.childNodes.length };
  }

  /** The window selection as model positions, when it is inside the surface. */
  readSelection(): RteSelection | null {
    const sel = this.#doc.getSelection();
    if (!sel || sel.rangeCount === 0 || !sel.anchorNode || !sel.focusNode) return null;
    const anchor = this.domToPos(sel.anchorNode, sel.anchorOffset);
    const focus = this.domToPos(sel.focusNode, sel.focusOffset);
    return anchor && focus ? { anchor, focus } : null;
  }

  writeSelection(selection: RteSelection): void {
    const sel = this.#doc.getSelection();
    if (!sel) return;
    const a = this.posToDom(selection.anchor);
    const f = this.posToDom(selection.focus);
    // Unchanged selections are not rewritten: it would reset the IME and the caret's affinity.
    if (sel.anchorNode === a.node && sel.anchorOffset === a.offset && sel.focusNode === f.node && sel.focusOffset === f.offset) return;
    sel.setBaseAndExtent(a.node, a.offset, f.node, f.offset);
  }

  /** Text of a block as currently in the DOM (after the browser changed it, e.g. by IME composition). */
  domText(index: number): string | null {
    const el = this.blockElement(index);
    if (!el?.isConnected) return null;
    const target = el.localName === 'pre' && el.firstElementChild ? el.firstElementChild : el;
    if (!(target instanceof HTMLElement)) return null;
    return this.#leaves(target).map((l) => (l instanceof Text ? l.data : '\n')).join('');
  }

  /** Model position for a StaticRange boundary (beforeinput target ranges). */
  rangeToPositions(range: StaticRange): { start: RtePos; end: RtePos } | null {
    const start = this.domToPos(range.startContainer, range.startOffset);
    const end = this.domToPos(range.endContainer, range.endOffset);
    return start && end ? { start, end } : null;
  }

  /** Model position under a viewport point (drops). */
  posFromPoint(x: number, y: number): RtePos | null {
    const hit = this.#doc.caretPositionFromPoint(x, y);
    return hit ? this.domToPos(hit.offsetNode, hit.offset) : null;
  }
}
