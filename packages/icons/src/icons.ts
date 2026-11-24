/**
 * Icon system (SPEC section 7). No third-party icon dependency; consumers integrate
 * any icon set through the provider contract, factories, or icon-font classes.
 * Icons are built with DOM APIs only (no HTML parsing, CSP/Trusted Types safe).
 */
import { configurationError } from '@absoluteui/core';
import { createNode, isNodeTag, nodeAttributeProblem, NODE_GEOMETRY, PATH_RE, SVG_NS, type SvgNode, type SvgNodeTag } from './nodes.js';

import { assertVectorIcon, renderVector, updateVector, type IconLayerName, type IconVariantName, type VectorIcon, type VectorRenderOptions } from './vector.js';
import { builtInVectorIcons } from './set/builtins.js';

export type { SvgNode, SvgNodeTag } from './nodes.js';

/** Colours a layer can take from the theme. */
export type IconTone = 'primary' | 'success' | 'warning' | 'error' | 'muted';

/** Corner or centre of a layered icon, for badges and counters. */
export type IconLayerPosition = 'center' | 'top-start' | 'top-end' | 'bottom-start' | 'bottom-end';

/**
 * One layer of a `layers` icon: an icon or a short text (a counter), optionally transformed,
 * placed, and coloured. Offsets `x`/`y` are in em (fractions of the icon size).
 */
export interface IconLayer {
  /** A name or a definition (not another `layers` definition). */
  readonly icon?: IconRef;
  /** Up to 4 characters, for counters such as `'3'` or `'99+'`. */
  readonly text?: string;
  /** 0.1 to 4. Default 1. */
  readonly scale?: number;
  /** -1 to 1 em. */
  readonly x?: number;
  readonly y?: number;
  /** Degrees, -360 to 360. */
  readonly rotate?: number;
  readonly flip?: 'horizontal' | 'vertical' | 'both';
  /** Default `'center'`. */
  readonly position?: IconLayerPosition;
  readonly tone?: IconTone;
  readonly className?: string;
}

export type IconDefinition =
  /**
   * Inline SVG from path data and/or shape nodes. `stroke` renders outlines with currentColor
   * (`strokeWidth`, default 2); otherwise shapes are filled with currentColor.
   */
  | { readonly kind: 'svg'; readonly viewBox: string; readonly paths?: readonly string[]; readonly nodes?: readonly SvgNode[]; readonly stroke?: boolean; readonly strokeWidth?: number }
  /** Custom template or adapter for an external icon library. Must return a new element per call. */
  | { readonly kind: 'factory'; readonly create: (doc: Document) => Element }
  /** Icon-font adapter, when consumers explicitly choose one (section 7.1). */
  | { readonly kind: 'class'; readonly className: string }
  /** Ligature icon font (Material Symbols, Material Icons): the element gets `className` and `text` as its content. */
  | { readonly kind: 'ligature'; readonly className: string; readonly text: string }
  /** Several icons (and counters) stacked into one icon, e.g. a bell with a badge. */
  | { readonly kind: 'layers'; readonly layers: readonly IconLayer[] }
  /** An AbsoluteUI icon: separately drawn variants, named layers, overlays, animation metadata (`@absoluteui/icons/set`). */
  | VectorIcon;

/** An icon name resolved through the provider/registry, or an inline definition. */
export type IconRef = string | IconDefinition;

/** Theme icon sizes (`icon-size-xs` 0.75rem ... `icon-size-xl` 2rem), or a CSS length such as `'1.125rem'` or `'20px'`. */
export type IconSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl' | `${number}${'px' | 'rem' | 'em' | 'pt' | '%'}`;

export interface IconProvider {
  resolve(name: string): IconDefinition | undefined;
}

const VIEWBOX_RE = /^-?\d+(\.\d+)?(\s+-?\d+(\.\d+)?){3}$/;
const CLASS_RE = /^[A-Za-z_][\w-]*(\s+[A-Za-z_][\w-]*)*$/;
const LIGATURE_RE = /^[\w-]{1,64}$/;
const LENGTH_RE = /^(\d+(\.\d+)?|\.\d+)(px|rem|em|pt|%)$/;
const SIZES = ['xs', 'sm', 'md', 'lg', 'xl'] as const;
const TONES: Readonly<Record<IconTone, string>> = { primary: 'color-primary', success: 'color-success-fg', warning: 'color-warning-fg', error: 'color-error-fg', muted: 'color-text-muted' };
const POSITIONS: ReadonlySet<string> = new Set<IconLayerPosition>(['center', 'top-start', 'top-end', 'bottom-start', 'bottom-end']);

/**
 * Built-in icons: the names components use, drawn as outline icons of the AbsoluteUI icon set.
 * Directional icons are not mirrored automatically: components pick direction-specific
 * names themselves.
 */
export const builtInIcons: Readonly<Record<string, IconDefinition>> = builtInVectorIcons;

const registry = new Map<string, IconDefinition>(Object.entries(builtInIcons));
let provider: IconProvider | null = null;

/** User-perceived characters (a flag or a family emoji counts once). */
const graphemes = (text: string): number => Array.from(new Intl.Segmenter().segment(text)).length;

const inRange = (v: number | undefined, min: number, max: number): boolean => v === undefined || (Number.isFinite(v) && v >= min && v <= max);

function assertDefinition(name: string, def: IconDefinition, nested = false): void {
  const bad = (expected: string): never => {
    throw configurationError('ICON_INVALID', 'Invalid icon definition.', { property: `icons.${name}`, expected });
  };
  if (def.kind === 'vector') {
    assertVectorIcon(def);
    return;
  }
  if (def.kind === 'svg') {
    if (!VIEWBOX_RE.test(def.viewBox)) bad('viewBox of four numbers');
    const paths = def.paths ?? [];
    const nodes = def.nodes ?? [];
    if (paths.length === 0 && nodes.length === 0) bad('at least one path or node');
    if (paths.some((p) => !PATH_RE.test(p))) bad('SVG path data');
    for (const node of nodes) {
      const [tag, attributes] = node;
      if (!isNodeTag(tag)) bad('circle, ellipse, line, path, polygon, polyline, or rect nodes');
      for (const [attr, value] of Object.entries(attributes)) {
        const problem = nodeAttributeProblem(tag, attr, value);
        if (problem !== null) bad(problem);
      }
    }
    if (!inRange(def.strokeWidth, 0.25, 8)) bad('strokeWidth from 0.25 to 8');
  } else if (def.kind === 'class') {
    if (!CLASS_RE.test(def.className)) bad('space-separated CSS class names');
  } else if (def.kind === 'ligature') {
    if (!CLASS_RE.test(def.className)) bad('space-separated CSS class names');
    if (!LIGATURE_RE.test(def.text)) bad('ligature name of 1 to 64 letters, digits, "_" or "-"');
  } else if (def.kind === 'layers') {
    if (nested) bad('layers without nested layers');
    if (def.layers.length === 0 || def.layers.length > 8) bad('1 to 8 layers');
    for (const layer of def.layers) {
      if ((layer.icon === undefined) === (layer.text === undefined)) bad('each layer with either an icon or a text');
      if (layer.text !== undefined && (layer.text.length === 0 || graphemes(layer.text) > 4)) bad('layer text of 1 to 4 characters');
      if (layer.icon !== undefined && typeof layer.icon !== 'string') assertDefinition(name, layer.icon, true);
      if (!inRange(layer.scale, 0.1, 4) || !inRange(layer.x, -1, 1) || !inRange(layer.y, -1, 1) || !inRange(layer.rotate, -360, 360)) bad('scale 0.1 to 4, x and y -1 to 1, rotate -360 to 360');
      if (layer.position !== undefined && !POSITIONS.has(layer.position)) bad('layer position');
      if (layer.tone !== undefined && !Object.hasOwn(TONES, layer.tone)) bad('layer tone');
      if (layer.className !== undefined && !CLASS_RE.test(layer.className)) bad('space-separated CSS class names');
    }
  } else if (typeof def.create !== 'function') {
    bad('factory function');
  }
}

/** Register or replace named icons in the built-in registry. */
export function registerIcons(icons: Readonly<Record<string, IconDefinition>>): void {
  for (const [name, def] of Object.entries(icons)) {
    assertDefinition(name, def);
    registry.set(name, def);
  }
}

/**
 * Set a global icon provider (section 7.1). It is consulted before the registry, so a
 * corporate icon set can replace every AbsoluteUI icon. `null` removes it.
 */
export function setIconProvider(next: IconProvider | null): void {
  provider = next;
}

export function resolveIcon(ref: IconRef): IconDefinition {
  if (typeof ref !== 'string') {
    assertDefinition('inline', ref);
    return ref;
  }
  const fromProvider = provider?.resolve(ref);
  if (fromProvider) {
    assertDefinition(ref, fromProvider);
    return fromProvider;
  }
  const def = registry.get(ref);
  if (!def) throw configurationError('ICON_UNKNOWN', 'Unknown icon.', { property: `icons.${ref}`, expected: 'registered icon name or provider-resolvable name' });
  return def;
}

/**
 * Options of `renderIcon`. The vector options (variant, colors, layers, overlays, container, stroke,
 * rotation, flips, direction) apply to AbsoluteUI vector icons only.
 */
export interface RenderIconOptions<V extends IconVariantName = IconVariantName, L extends IconLayerName = IconLayerName> extends VectorRenderOptions<V, L> {
  /**
   * Accessible name. Omit for decorative icons (hidden from assistive technology).
   * Interactive icon-only controls must label the control itself (section 7.3).
   */
  label?: string;
  className?: string;
  /**
   * `'xs'` ... `'xl'` (theme tokens `icon-size-*`), a CSS length, or a number of pixels. Sets the icon's
   * font size and `--aui-icon-size`, so it also wins over a size set on a surrounding element.
   * Default: the surrounding `--aui-icon-size`, or `1em`.
   */
  size?: IconSize | number;
  doc?: Document;
}

const VECTOR_OPTIONS = ['variant', 'colors', 'layers', 'overlays', 'container', 'strokeWidth', 'strokeScaling', 'rotate', 'flip', 'dir'] as const;

/** The vector options present in `options`. */
function vectorOptions(options: VectorRenderOptions): VectorRenderOptions {
  const out: Record<string, unknown> = {};
  for (const key of VECTOR_OPTIONS) if (options[key] !== undefined) out[key] = options[key];
  return out;
}

const SIZE_FALLBACK: Readonly<Record<(typeof SIZES)[number], string>> = { xs: '0.75rem', sm: '1rem', md: '1.25rem', lg: '1.5rem', xl: '2rem' };

/** CSS value of an icon size; throws `ICON_INVALID_SIZE` for anything else. */
function sizeValue(size: string | number): string {
  if (typeof size === 'number') {
    if (Number.isFinite(size) && size > 0 && size <= 1024) return `${String(size)}px`;
    throw configurationError('ICON_INVALID_SIZE', 'Invalid icon size.', { property: 'size', expected: 'a number of pixels from 0 to 1024' });
  }
  const token = SIZES.find((s) => s === size);
  if (token) return `var(--aui-icon-size-${token}, ${SIZE_FALLBACK[token]})`;
  if (LENGTH_RE.test(size)) return size;
  throw configurationError('ICON_INVALID_SIZE', 'Invalid icon size.', { property: 'size', expected: '"xs", "sm", "md", "lg", "xl", or a CSS length (px, rem, em, pt, %)' });
}

const hasStyle = (el: Element): el is Element & ElementCSSInlineStyle => 'style' in el;

/** The element for a definition, without the `aui-icon` class and accessibility attributes. */
function renderDefinition(def: IconDefinition, doc: Document, options: VectorRenderOptions = {}): Element {
  if (def.kind === 'vector') return renderVector(def, options, doc);
  if (Object.keys(options).length > 0) {
    throw configurationError('ICON_INVALID_OPTION', 'Invalid icon option.', { property: Object.keys(options).join(', '), expected: 'vector options only with AbsoluteUI vector icons' });
  }
  if (def.kind === 'svg') {
    const svg = doc.createElementNS(SVG_NS, 'svg');
    svg.setAttribute('viewBox', def.viewBox);
    // Intrinsic 1em size: icons stay text-sized even before (or without) component CSS.
    svg.setAttribute('width', '1em');
    svg.setAttribute('height', '1em');
    svg.setAttribute('focusable', 'false');
    if (def.stroke) {
      svg.setAttribute('fill', 'none');
      svg.setAttribute('stroke', 'currentColor');
      svg.setAttribute('stroke-width', String(def.strokeWidth ?? 2));
      svg.setAttribute('stroke-linecap', 'round');
      svg.setAttribute('stroke-linejoin', 'round');
    } else {
      svg.setAttribute('fill', 'currentColor');
    }
    for (const d of def.paths ?? []) {
      const path = doc.createElementNS(SVG_NS, 'path');
      path.setAttribute('d', d);
      svg.appendChild(path);
    }
    for (const node of def.nodes ?? []) svg.appendChild(createNode(doc, node));
    return svg;
  }
  if (def.kind === 'class') {
    const el = doc.createElement('span');
    el.className = def.className;
    return el;
  }
  if (def.kind === 'ligature') {
    const el = doc.createElement('span');
    el.className = def.className;
    el.textContent = def.text;
    // Page translation must not "translate" the ligature name.
    el.setAttribute('translate', 'no');
    return el;
  }
  if (def.kind === 'layers') return renderLayers(def.layers, doc);
  return def.create(doc);
}

/** A 1em inline grid with every layer in the same cell; transforms, placement, and tone per layer. */
function renderLayers(layers: readonly IconLayer[], doc: Document): Element {
  const stack = doc.createElement('span');
  Object.assign(stack.style, { display: 'inline-grid', placeItems: 'center', inlineSize: '1em', blockSize: '1em', lineHeight: '1' });
  for (const layer of layers) {
    let el: Element;
    if (layer.icon !== undefined) el = renderDefinition(resolveIcon(layer.icon), doc);
    else {
      el = doc.createElement('span');
      el.textContent = layer.text ?? '';
      if (hasStyle(el)) Object.assign(el.style, { fontSize: '0.5em', fontWeight: '700', lineHeight: '1', whiteSpace: 'nowrap' });
    }
    el.classList.add('aui-icon__layer');
    if (layer.className) el.classList.add(...layer.className.split(/\s+/).filter(Boolean));
    el.setAttribute('aria-hidden', 'true');
    if (hasStyle(el)) {
      const [block, inline] = (layer.position ?? 'center').split('-');
      el.style.gridArea = '1 / 1';
      el.style.alignSelf = block === 'top' ? 'start' : block === 'bottom' ? 'end' : 'center';
      el.style.justifySelf = inline === 'start' ? 'start' : inline === 'end' ? 'end' : 'center';
      const sx = (layer.scale ?? 1) * (layer.flip === 'horizontal' || layer.flip === 'both' ? -1 : 1);
      const sy = (layer.scale ?? 1) * (layer.flip === 'vertical' || layer.flip === 'both' ? -1 : 1);
      const parts = [];
      if (layer.x !== undefined || layer.y !== undefined) parts.push(`translate(${String(layer.x ?? 0)}em, ${String(layer.y ?? 0)}em)`);
      if (layer.rotate !== undefined) parts.push(`rotate(${String(layer.rotate)}deg)`);
      if (sx !== 1 || sy !== 1) parts.push(`scale(${String(sx)}, ${String(sy)})`);
      if (parts.length) el.style.transform = parts.join(' ');
      if (layer.tone) el.style.color = `var(--aui-${TONES[layer.tone]})`;
    }
    stack.append(el);
  }
  return stack;
}

/**
 * Render an icon element. Decorative by default; semantic when `label` is set (section 7.3).
 * @example
 * const icon = renderIcon('calendar', { size: 'lg' });
 * icon.getAttribute('aria-hidden'); // => 'true'
 * icon instanceof SVGElement ? icon.style.fontSize : ''; // => 'var(--aui-icon-size-lg, 1.5rem)'
 */
export function renderIcon<V extends IconVariantName, L extends IconLayerName>(icon: VectorIcon<V, L>, options?: RenderIconOptions<V, L>): Element;
export function renderIcon(ref: IconRef, options?: RenderIconOptions): Element;
export function renderIcon(ref: IconRef, options: RenderIconOptions = {}): Element {
  const doc = options.doc ?? document;
  const size = options.size === undefined ? undefined : sizeValue(options.size);
  const el = renderDefinition(resolveIcon(ref), doc, vectorOptions(options));
  el.classList.add('aui-icon');
  if (size !== undefined && hasStyle(el)) {
    el.style.setProperty('--aui-icon-size', size);
    el.style.fontSize = size;
  }
  if (options.className) el.classList.add(...options.className.split(/\s+/).filter(Boolean));
  if (options.label) {
    el.setAttribute('role', 'img');
    el.setAttribute('aria-label', options.label);
    el.removeAttribute('aria-hidden');
  } else {
    el.setAttribute('aria-hidden', 'true');
  }
  return el;
}

/** Changes `updateIcon` accepts: accessible name, size, and the vector options. */
export interface UpdateIconOptions<V extends IconVariantName = IconVariantName, L extends IconLayerName = IconLayerName> extends VectorRenderOptions<V, L> {
  /** New accessible name; `null` makes the icon decorative. */
  label?: string | null;
  size?: IconSize | number;
}

/**
 * Update an icon from `renderIcon` in place (the element stays): colors and layer overrides restyle
 * the existing shapes; variant, overlays, container, rotation, flips, and direction rebuild its content.
 * Vector options need an AbsoluteUI vector icon; throws `ICON_INVALID_OPTION` otherwise.
 * @example
 * const icon = renderIcon('check', { label: 'Saved' });
 * updateIcon(icon, { label: null });
 * icon.getAttribute('aria-hidden'); // => 'true'
 */
export function updateIcon(icon: Element, changes: UpdateIconOptions): void {
  const vector = vectorOptions(changes);
  if (Object.keys(vector).length > 0 && !updateVector(icon, vector)) {
    throw configurationError('ICON_INVALID_OPTION', 'Invalid icon option.', { property: Object.keys(vector).join(', '), expected: 'vector options only with AbsoluteUI vector icons' });
  }
  if (changes.size !== undefined && hasStyle(icon)) {
    const size = sizeValue(changes.size);
    icon.style.setProperty('--aui-icon-size', size);
    icon.style.fontSize = size;
  }
  if (changes.label === null || changes.label === '') {
    icon.removeAttribute('role');
    icon.removeAttribute('aria-label');
    icon.setAttribute('aria-hidden', 'true');
  } else if (changes.label !== undefined) {
    icon.setAttribute('role', 'img');
    icon.setAttribute('aria-label', changes.label);
    icon.removeAttribute('aria-hidden');
  }
}

/**
 * Shape of a Font Awesome icon definition (`@fortawesome/*-svg-icons`): `icon` is
 * `[width, height, ligatures, unicode, pathData]`. Typed structurally; no Font Awesome import.
 */
export interface FontAwesomeIconLike {
  readonly icon: readonly [number, number, unknown, unknown, string | readonly string[]];
}

/**
 * Converts a Font Awesome SVG icon definition (for example `faUser` from
 * `@fortawesome/free-solid-svg-icons`) into an AbsoluteUI `svg` definition (filled with the text
 * colour). Duotone definitions become one path per layer.
 * @example
 * fromFontAwesome({ icon: [448, 512, [], 'f007', 'M224 256a128 128 0 1 0 0-256z'] });
 * // => { kind: 'svg', viewBox: '0 0 448 512', paths: ['M224 256a128 128 0 1 0 0-256z'] }
 */
export function fromFontAwesome(definition: FontAwesomeIconLike): IconDefinition {
  const [width, height, , , data] = definition.icon;
  const paths = (typeof data === 'string' ? [data] : [...data]).filter((p) => p !== '');
  const def: IconDefinition = { kind: 'svg', viewBox: `0 0 ${String(width)} ${String(height)}`, paths };
  assertDefinition('fontawesome', def);
  return def;
}

export interface FromSvgNodesOptions {
  /** Default `'0 0 24 24'` (Lucide, Feather, Tabler, Heroicons outline). */
  readonly viewBox?: string;
  /** Outline icons: `true` (default) strokes with the text colour; `false` fills. */
  readonly stroke?: boolean;
  /** Default 2. */
  readonly strokeWidth?: number;
}

/**
 * Converts `[tag, attributes]` shape nodes, the format of Lucide's `lucide` package (`fromSvgNodes(Users)`) and similar
 * icon sets, into an AbsoluteUI `svg` definition. Attributes are validated like every other
 * icon; unsupported ones throw `ICON_INVALID`.
 * @example
 * fromSvgNodes([['circle', { cx: '12', cy: '12', r: '10' }], ['path', { d: 'M12 8v4' }]]).kind; // => 'svg'
 */
export function fromSvgNodes(nodes: readonly (readonly [string, Readonly<Record<string, string | number | undefined>>])[], options: FromSvgNodesOptions = {}): IconDefinition {
  const tags = Object.keys(NODE_GEOMETRY);
  const typed: SvgNode[] = [];
  for (const [tag, attributes] of nodes) {
    const known = tags.find((t): t is SvgNodeTag => t === tag);
    if (known === undefined) throw configurationError('ICON_INVALID', 'Invalid icon definition.', { property: 'icons.nodes', expected: 'circle, ellipse, line, path, polygon, polyline, or rect nodes' });
    // Libraries type attributes as optional; absent ones are simply not set.
    const present: Record<string, string | number> = {};
    for (const [name, value] of Object.entries(attributes)) if (value !== undefined) present[name] = value;
    typed.push([known, present]);
  }
  const def: IconDefinition = { kind: 'svg', viewBox: options.viewBox ?? '0 0 24 24', nodes: typed, stroke: options.stroke ?? true, ...(options.strokeWidth === undefined ? {} : { strokeWidth: options.strokeWidth }) };
  assertDefinition('nodes', def);
  return def;
}
