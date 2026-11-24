/** SVG shape nodes shared by `svg` and `vector` icon definitions: tags, allowed attributes, validation. */

export const SVG_NS = 'http://www.w3.org/2000/svg';

/** SVG shape elements an `svg` definition may contain. */
export type SvgNodeTag = 'circle' | 'ellipse' | 'line' | 'path' | 'polygon' | 'polyline' | 'rect';

/**
 * One SVG shape as `[tag, attributes]`, the format Lucide and many icon sets publish. Geometry
 * attributes are numbers or numeric strings; `fill` and `stroke` may be `'none'` or
 * `'currentColor'`; `fill-rule`/`clip-rule` `'nonzero'` or `'evenodd'`; `opacity` 0 to 1.
 */
export type SvgNode = readonly [SvgNodeTag, Readonly<Record<string, string | number>>];

// Path commands plus numbers (including exponents such as 1e-3).
export const PATH_RE = /^[MmLlHhVvCcSsQqTtAaZzEe0-9.,\s+-]+$/;
const NUMBER_RE = /^-?(\d+(\.\d*)?|\.\d+)(e[-+]?\d+)?$/i;
const POINTS_RE = /^[\d.,\s+eE-]+$/;

/** Geometry attributes per shape; every other attribute is rejected (no events, no URLs, no styles). */
export const NODE_GEOMETRY: Readonly<Record<SvgNodeTag, readonly string[]>> = {
  path: ['d'],
  circle: ['cx', 'cy', 'r'],
  ellipse: ['cx', 'cy', 'rx', 'ry'],
  line: ['x1', 'y1', 'x2', 'y2'],
  polygon: ['points'],
  polyline: ['points'],
  rect: ['x', 'y', 'width', 'height', 'rx', 'ry'],
};
const PAINT = new Set(['none', 'currentColor']);
const RULES = new Set(['nonzero', 'evenodd']);

/** Why an attribute value is invalid, or `null` when it is valid. */
export function nodeAttributeProblem(tag: SvgNodeTag, name: string, value: string | number): string | null {
  const text = String(value).trim();
  if (name === 'd') return PATH_RE.test(text) ? null : 'SVG path data';
  if (name === 'points') return POINTS_RE.test(text) ? null : 'SVG points';
  if (NODE_GEOMETRY[tag].includes(name)) return NUMBER_RE.test(text) ? null : `numeric ${name}`;
  if (name === 'fill' || name === 'stroke') return PAINT.has(text) ? null : `${name} "none" or "currentColor"`;
  if (name === 'fill-rule' || name === 'clip-rule') return RULES.has(text) ? null : `${name} "nonzero" or "evenodd"`;
  if (name === 'opacity') return NUMBER_RE.test(text) && Number(text) >= 0 && Number(text) <= 1 ? null : 'opacity from 0 to 1';
  return `a supported ${tag} attribute, not "${name}"`;
}

/** Whether `tag` is a supported shape. */
export function isNodeTag(tag: string): tag is SvgNodeTag {
  return Object.hasOwn(NODE_GEOMETRY, tag);
}

/** Create the element for one shape node (attributes must already be validated). */
export function createNode(doc: Document, [tag, attributes]: SvgNode): SVGElement {
  const node = doc.createElementNS(SVG_NS, tag);
  for (const [name, value] of Object.entries(attributes)) node.setAttribute(name, String(value).trim());
  return node;
}
