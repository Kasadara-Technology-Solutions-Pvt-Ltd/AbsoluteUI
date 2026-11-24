// Strict parser for the restricted SVG subset of icon sources (docs/icons/icon-design-spec-draft.md
// section 9, R16-15). Not a general XML parser: it accepts elements, double-quoted attributes,
// comments, and whitespace, and rejects everything else (DOCTYPE, processing instructions, CDATA,
// entities, text content), so no source can smuggle markup into the build. Pure: no I/O.

/**
 * @typedef {{ name: string, attributes: Record<string, string>, children: SvgElement[], line: number }} SvgElement
 */

const NAME_RE = /^[A-Za-z][\w.:-]*$/;
const MAX_SOURCE = 64 * 1024;
const MAX_DEPTH = 8;

/** Error with the 1-based line of the problem. */
export class SvgSourceError extends Error {
  /** @param {string} message @param {number} line */
  constructor(message, line) {
    super(`line ${String(line)}: ${message}`);
    this.name = 'SvgSourceError';
    this.line = line;
  }
}

/**
 * Parse one restricted SVG document into an element tree.
 * @param {string} source
 * @returns {SvgElement}
 */
export function parseSvg(source) {
  if (typeof source !== 'string') throw new SvgSourceError('source must be text', 1);
  if (source.length > MAX_SOURCE) throw new SvgSourceError(`source is larger than ${String(MAX_SOURCE)} characters`, 1);
  let i = 0;
  let line = 1;
  /** @type {SvgElement[]} */
  const stack = [];
  /** @type {SvgElement | null} */
  let root = null;

  const advance = (/** @type {number} */ n) => {
    for (let k = 0; k < n; k++) if (source.charCodeAt(i + k) === 10) line++;
    i += n;
  };
  const skipSpace = () => {
    while (i < source.length && /\s/.test(source[i] ?? '')) advance(1);
  };

  while (i < source.length) {
    const lt = source.indexOf('<', i);
    const text = lt < 0 ? source.slice(i) : source.slice(i, lt);
    if (text.trim() !== '') throw new SvgSourceError('text content is not allowed', line);
    if (text.includes('&')) throw new SvgSourceError('entities are not allowed', line);
    advance(text.length);
    if (lt < 0) break;

    if (source.startsWith('<!--', i)) {
      const end = source.indexOf('-->', i + 4);
      if (end < 0) throw new SvgSourceError('comment is not closed', line);
      advance(end + 3 - i);
      continue;
    }
    if (source.startsWith('<!', i) || source.startsWith('<?', i)) throw new SvgSourceError('DOCTYPE, CDATA, and processing instructions are not allowed', line);

    if (source.startsWith('</', i)) {
      advance(2);
      const start = i;
      while (i < source.length && /[\w.:-]/.test(source[i] ?? '')) advance(1);
      const name = source.slice(start, i);
      skipSpace();
      if (source[i] !== '>') throw new SvgSourceError(`malformed end tag </${name}`, line);
      advance(1);
      const open = stack.pop();
      if (!open || open.name !== name) throw new SvgSourceError(`unexpected end tag </${name}>`, line);
      continue;
    }

    // Start tag.
    advance(1);
    const tagLine = line;
    const start = i;
    while (i < source.length && /[\w.:-]/.test(source[i] ?? '')) advance(1);
    const name = source.slice(start, i);
    if (!NAME_RE.test(name)) throw new SvgSourceError('malformed start tag', line);
    /** @type {Record<string, string>} */
    const attributes = Object.create(null);
    let selfClosing = false;
    for (;;) {
      skipSpace();
      if (i >= source.length) throw new SvgSourceError(`start tag <${name}> is not closed`, line);
      if (source.startsWith('/>', i)) {
        selfClosing = true;
        advance(2);
        break;
      }
      if (source[i] === '>') {
        advance(1);
        break;
      }
      const aStart = i;
      while (i < source.length && /[\w.:-]/.test(source[i] ?? '')) advance(1);
      const attr = source.slice(aStart, i);
      if (!NAME_RE.test(attr)) throw new SvgSourceError(`malformed attribute in <${name}>`, line);
      skipSpace();
      if (source[i] !== '=') throw new SvgSourceError(`attribute ${attr} needs a value`, line);
      advance(1);
      skipSpace();
      if (source[i] !== '"') throw new SvgSourceError(`attribute ${attr} must use double quotes`, line);
      const end = source.indexOf('"', i + 1);
      if (end < 0) throw new SvgSourceError(`attribute ${attr} is not closed`, line);
      const value = source.slice(i + 1, end);
      if (/[<&]/.test(value)) throw new SvgSourceError(`attribute ${attr} contains < or &`, line);
      if (Object.hasOwn(attributes, attr)) throw new SvgSourceError(`duplicate attribute ${attr}`, line);
      attributes[attr] = value;
      advance(end + 1 - i);
    }
    /** @type {SvgElement} */
    const element = { name, attributes, children: [], line: tagLine };
    const parent = stack[stack.length - 1];
    if (parent) parent.children.push(element);
    else if (root) throw new SvgSourceError('only one root element is allowed', tagLine);
    else root = element;
    if (!selfClosing) {
      stack.push(element);
      if (stack.length > MAX_DEPTH) throw new SvgSourceError(`nesting deeper than ${String(MAX_DEPTH)} levels`, tagLine);
    }
  }
  if (stack.length) throw new SvgSourceError(`<${stack[stack.length - 1]?.name ?? ''}> is not closed`, line);
  if (!root) throw new SvgSourceError('no root element', line);
  return root;
}
