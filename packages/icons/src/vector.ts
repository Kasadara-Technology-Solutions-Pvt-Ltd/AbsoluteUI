/**
 * AbsoluteUI vector icons (docs/PLAN-R16-ICONS.md, R16-2 to R16-14): variants drawn separately,
 * named layers with color roles, overlays with knockout masks, containers, rotation, flips, RTL
 * mirroring, and stroke control. Built with DOM APIs only; colors go through CSSOM custom
 * properties after validation (CSP and Trusted Types safe). Definitions are plain frozen data.
 */
import { configurationError } from '@absoluteui/core';
import { createNode, isNodeTag, nodeAttributeProblem, SVG_NS, type SvgNode } from './nodes.js';

export type IconVariantName = 'outline' | 'solid' | 'duotone' | 'multicolor';
export type IconLayerName = 'base' | 'secondary' | 'accent' | 'badge' | 'detail';
export type IconColorRole = 'primary' | 'secondary' | 'accent' | 'success' | 'warning' | 'error' | 'info' | 'muted';
export type IconAnchor = 'bottom-end' | 'top-end' | 'center';
export type IconAnimationPreset = 'spin' | 'pulse' | 'bounce' | 'wiggle' | 'shake' | 'draw' | 'reveal' | 'fade' | 'morph';
export type IconAnimationTrigger = 'idle' | 'hover' | 'focus' | 'press' | 'on-change' | 'loading' | 'success' | 'error' | 'manual';

/** One named layer of a variant: shapes painted in one role, in source (painter's) order. */
export interface VectorLayer<L extends IconLayerName = IconLayerName> {
  readonly name: L;
  readonly role: IconColorRole;
  readonly paint: 'stroke' | 'fill';
  /** 0 to 1; duotone secondary fills default to the `--aui-icon-secondary-opacity` token. */
  readonly opacity?: number;
  readonly fillRule?: 'nonzero' | 'evenodd';
  readonly nodes: readonly SvgNode[];
  /** Filled shapes cut out of this layer (the gap where a slash crosses an icon), drawn as a per-instance mask. */
  readonly knockout?: readonly SvgNode[];
}

/** A curated animation an icon supports (only presets listed here can run on it). */
export interface VectorAnimation<L extends IconLayerName = IconLayerName> {
  readonly preset: IconAnimationPreset;
  readonly trigger: IconAnimationTrigger;
  /** Layer the motion applies to; the whole icon when omitted. */
  readonly target?: L;
  /** Rotation or scale origin in icon units; the target's box centre when omitted. */
  readonly origin?: readonly [number, number];
}

/** The variants an icon has (`V`, always including outline) and may have. */
export type VectorVariants<V extends IconVariantName, L extends IconLayerName> = Readonly<Record<V | 'outline', readonly VectorLayer<L>[]>> & Readonly<Partial<Record<Exclude<IconVariantName, V>, readonly VectorLayer<L>[]>>>;

/**
 * An AbsoluteUI icon: 24x24, one or more separately drawn variants. `V` and `L` name the variants and
 * layers it has, so options for missing variants or layers do not type-check; `VectorIcon` alone
 * accepts any icon.
 */
export interface VectorIcon<V extends IconVariantName = 'outline', L extends IconLayerName = IconLayerName> {
  readonly kind: 'vector';
  readonly id: string;
  readonly viewBox: '0 0 24 24';
  readonly variants: VectorVariants<V, L>;
  /** Flip horizontally in right-to-left layouts. */
  readonly mirror?: boolean;
  /** Overlay anchor centres that differ from the defaults. */
  readonly anchors?: Readonly<Partial<Record<IconAnchor, readonly [number, number]>>>;
  readonly animations?: readonly VectorAnimation<L>[];
  /**
   * Curated morph (the `morph` preset): the paths of one outline layer become `paths` (same commands;
   * `null` fades a path out), turning the icon into the icon named `to`. Played in reverse to return.
   */
  readonly morph?: { readonly to: string; readonly layer: L; readonly paths: readonly (string | null)[] };
}

/** A small mark composed onto a vector icon at an anchor (10x10 units, same stroke as the icon). */
export interface IconOverlayDefinition {
  readonly kind: 'overlay';
  readonly id: string;
  readonly viewBox: '0 0 10 10';
  readonly variants: { readonly outline: readonly VectorLayer[]; readonly solid?: readonly VectorLayer[] };
  readonly mirror?: boolean;
}

/** Per-instance override of one layer. */
export interface IconLayerOverride {
  /** A CSS color: hex, a named color, `currentColor`, `rgb()`/`hsl()`/`oklch()`/`oklab()`/`lab()`/`lch()`, or `var(--name)`. */
  readonly color?: string;
  /** 0 to 1. */
  readonly opacity?: number;
  readonly hidden?: boolean;
}

export interface IconOverlayPlacement {
  readonly icon: IconOverlayDefinition;
  /** Default `'bottom-end'`. */
  readonly anchor?: IconAnchor;
}

/** Options that apply to vector icons. */
export interface VectorRenderOptions<V extends IconVariantName = IconVariantName, L extends IconLayerName = IconLayerName> {
  /** Default `'outline'`. */
  readonly variant?: V;
  /** Role colors for this instance (CSS colors, validated). */
  readonly colors?: Readonly<Partial<Record<IconColorRole, string>>>;
  readonly layers?: Readonly<Partial<Record<L, IconLayerOverride>>>;
  /** Up to two overlays, one per anchor. */
  readonly overlays?: readonly IconOverlayPlacement[];
  readonly container?: 'circle' | 'square';
  /** Outline stroke width in icon units, 0.5 to 4. Default: the inherited `--aui-icon-stroke-width`, else 2. */
  readonly strokeWidth?: number;
  /** `'fixed'` keeps strokes at their width in CSS pixels at any size (non-scaling stroke). Default `'scale'`. */
  readonly strokeScaling?: 'scale' | 'fixed';
  readonly rotate?: 0 | 90 | 180 | 270;
  readonly flip?: 'horizontal' | 'vertical' | 'both';
  /** `'auto'` (default) mirrors directional icons in right-to-left layouts through CSS; `'ltr'`/`'rtl'` force a direction. */
  readonly dir?: 'auto' | 'ltr' | 'rtl';
}

const VARIANTS: readonly IconVariantName[] = ['outline', 'solid', 'duotone', 'multicolor'];
const LAYERS: readonly IconLayerName[] = ['base', 'secondary', 'accent', 'badge', 'detail'];
const ROLES: readonly IconColorRole[] = ['primary', 'secondary', 'accent', 'success', 'warning', 'error', 'info', 'muted'];
const PRESETS: readonly IconAnimationPreset[] = ['spin', 'pulse', 'bounce', 'wiggle', 'shake', 'draw', 'reveal', 'fade', 'morph'];
const TRIGGERS: readonly IconAnimationTrigger[] = ['idle', 'hover', 'focus', 'press', 'on-change', 'loading', 'success', 'error', 'manual'];
const ANCHORS: Readonly<Record<IconAnchor, readonly [number, number]>> = { 'bottom-end': [18, 18], 'top-end': [18, 6], center: [12, 12] };
/** Theme colors of multicolor roles (other variants paint every role in the icon color). */
const THEME_ROLE: Readonly<Record<IconColorRole, string>> = {
  primary: 'currentColor',
  secondary: 'currentColor',
  accent: 'var(--aui-color-primary, currentColor)',
  success: 'var(--aui-color-success-fg, currentColor)',
  warning: 'var(--aui-color-warning-fg, currentColor)',
  error: 'var(--aui-color-error-fg, currentColor)',
  info: 'var(--aui-color-info-fg, currentColor)',
  muted: 'var(--aui-color-text-muted, currentColor)',
};
const ID_RE = /^[a-z][a-z0-9]*(-[a-z0-9]+)*$/;
const COLOR_RE = /^(#[0-9a-f]{3,4}|#[0-9a-f]{6}|#[0-9a-f]{8}|[a-z]{3,20}|currentcolor|(rgba?|hsla?|oklch|oklab|lab|lch)\([0-9a-z.,%\s/+-]{1,80}\)|var\(--[a-z0-9-]{1,64}\))$/i;
const KNOCKOUT = 1.5;
const OVERLAY_RADIUS = 5;
const CONTAINER_SCALE = 0.6;
/**
 * Stroke width of an icon: the option, else the inherited `--aui-icon-stroke-width` custom property
 * (themes, regions, or bold text can set it), else 2.
 */
const strokeValue = (width: number | undefined): string => (width === undefined ? 'var(--aui-icon-stroke-width, 2)' : String(width));

const invalid = (property: string, expected: string): never => {
  throw configurationError('ICON_INVALID', 'Invalid icon definition.', { property, expected });
};
const badOption = (property: string, expected: string): never => {
  throw configurationError('ICON_INVALID_OPTION', 'Invalid icon option.', { property, expected });
};
const isOneOf = <T extends string>(list: readonly T[], value: unknown): value is T => typeof value === 'string' && (list as readonly string[]).includes(value);
const inUnit = (v: unknown): boolean => typeof v === 'number' && Number.isFinite(v) && v >= 0 && v <= 1;

/** Whether a value is a vector icon definition (structure checked by `assertVectorIcon`). */
export function isVectorIcon(def: unknown): def is VectorIcon {
  return typeof def === 'object' && def !== null && (def as { kind?: unknown }).kind === 'vector';
}

const checkedDefinitions = new WeakSet<object>();

function assertLayers(property: string, layers: unknown): ReadonlySet<string> {
  if (!Array.isArray(layers) || layers.length === 0 || layers.length > 5) invalid(property, '1 to 5 layers');
  const names = new Set<string>();
  for (const [index, layer] of (layers as readonly VectorLayer[]).entries()) {
    const at = `${property}[${String(index)}]`;
    if (!isOneOf(LAYERS, layer.name) || names.has(layer.name)) invalid(`${at}.name`, `a unique layer name (${LAYERS.join(', ')})`);
    names.add(layer.name);
    if (!isOneOf(ROLES, layer.role)) invalid(`${at}.role`, ROLES.join(', '));
    if (!isOneOf(['stroke', 'fill'], layer.paint)) invalid(`${at}.paint`, '"stroke" or "fill"');
    if (layer.opacity !== undefined && !inUnit(layer.opacity)) invalid(`${at}.opacity`, '0 to 1');
    if (layer.fillRule !== undefined && !isOneOf(['nonzero', 'evenodd'], layer.fillRule)) invalid(`${at}.fillRule`, '"nonzero" or "evenodd"');
    if (!Array.isArray(layer.nodes) || layer.nodes.length === 0 || layer.nodes.length > 32) invalid(`${at}.nodes`, '1 to 32 shape nodes');
    for (const [tag, attributes] of layer.nodes) {
      if (!isNodeTag(tag)) invalid(`${at}.nodes`, 'circle, ellipse, line, path, polygon, polyline, or rect nodes');
      for (const [name, value] of Object.entries(attributes)) {
        // Paint comes from the layer; shapes carry geometry (and a fill rule) only.
        if (name === 'fill' || name === 'stroke' || name === 'opacity') invalid(`${at}.nodes`, 'geometry attributes only (paint comes from the layer)');
        const problem = nodeAttributeProblem(tag, name, value);
        if (problem !== null) invalid(`${at}.nodes`, problem);
      }
    }
    const knockout: unknown = layer.knockout;
    if (knockout !== undefined && (!Array.isArray(knockout) || knockout.length === 0 || knockout.length > 4 || !(knockout as readonly SvgNode[]).every(([tag, a]) => tag === 'path' && Object.keys(a).every((k) => k === 'd') && nodeAttributeProblem('path', 'd', a.d ?? '') === null))) invalid(`${at}.knockout`, '1 to 4 paths with path data only');
  }
  return names;
}

/** Validate a vector icon definition; throws `ICON_INVALID`. Validated definitions are remembered. */
export function assertVectorIcon(def: VectorIcon): void {
  if (checkedDefinitions.has(def)) return;
  const id = typeof def.id === 'string' && ID_RE.test(def.id) ? def.id : invalid('id', 'kebab-case icon id');
  const p = `icons.${id}`;
  if (!isOneOf(['0 0 24 24'], def.viewBox)) invalid(`${p}.viewBox`, '"0 0 24 24"');
  const variants = Object.keys(def.variants);
  if (!variants.includes('outline') || variants.some((v) => !isOneOf(VARIANTS, v))) invalid(`${p}.variants`, `outline plus any of ${VARIANTS.join(', ')}`);
  const layerNames = new Set<string>();
  for (const v of VARIANTS) {
    const layers: unknown = Object.hasOwn(def.variants, v) ? def.variants[v] : undefined;
    if (layers !== undefined) for (const n of assertLayers(`${p}.variants.${v}`, layers)) layerNames.add(n);
  }
  for (const [anchor, point] of Object.entries(def.anchors ?? {})) {
    const p2: unknown = point;
    if (!Object.hasOwn(ANCHORS, anchor) || !Array.isArray(p2) || p2.length !== 2 || !p2.every((n) => typeof n === 'number' && n >= 0 && n <= 24)) invalid(`${p}.anchors`, 'anchors with [x, y] from 0 to 24');
  }
  if (def.morph !== undefined) {
    const layer = def.variants.outline.find((l) => l.name === def.morph?.layer);
    if (layer?.nodes.length !== def.morph.paths.length || !layer.nodes.every(([tag]) => tag === 'path')) invalid(`${p}.morph`, 'one target per path of an outline layer');
    if (!ID_RE.test(def.morph.to) || def.morph.paths.some((d) => d !== null && nodeAttributeProblem('path', 'd', d) !== null)) invalid(`${p}.morph`, 'a target icon id and SVG path data (or null)');
  }
  for (const a of def.animations ?? []) {
    if (!isOneOf(PRESETS, a.preset) || !isOneOf(TRIGGERS, a.trigger)) invalid(`${p}.animations`, 'known presets and triggers');
    if (a.target !== undefined && !layerNames.has(a.target)) invalid(`${p}.animations`, 'targets that are layers of the icon');
    const origin: unknown = a.origin;
    if (origin !== undefined && !(Array.isArray(origin) && origin.length === 2 && origin.every((n) => typeof n === 'number' && n >= 0 && n <= 24))) invalid(`${p}.animations`, 'an origin of [x, y] from 0 to 24');
  }
  checkedDefinitions.add(def);
}

/** Validate an overlay definition; throws `ICON_INVALID`. */
export function assertOverlay(def: IconOverlayDefinition): void {
  if (checkedDefinitions.has(def)) return;
  if (!isOneOf(['overlay'], def.kind) || !isOneOf(['0 0 10 10'], def.viewBox) || !ID_RE.test(def.id)) invalid('overlay', 'an overlay definition with a 0 0 10 10 viewBox');
  assertLayers(`overlays.${def.id}.variants.outline`, def.variants.outline);
  if (def.variants.solid !== undefined) assertLayers(`overlays.${def.id}.variants.solid`, def.variants.solid);
  checkedDefinitions.add(def);
}

/** A validated CSS color for an option; throws `ICON_INVALID_OPTION`. */
function color(property: string, value: unknown): string {
  return typeof value === 'string' && COLOR_RE.test(value.trim()) ? value.trim() : badOption(property, 'a CSS color: hex, name, currentColor, rgb()/hsl()/oklch()/oklab()/lab()/lch(), or var(--name)');
}

/** Paint value of a role: the instance or region custom property, then the variant's default. */
function rolePaint(role: IconColorRole, variant: IconVariantName): string {
  const fallback = variant === 'multicolor' ? THEME_ROLE[role] : role === 'primary' ? 'currentColor' : 'var(--aui-icon-primary, currentColor)';
  return `var(--aui-icon-${role}, ${fallback})`;
}

interface VectorState {
  readonly def: VectorIcon;
  options: VectorRenderOptions;
}
const states = new WeakMap<Element, VectorState>();
let instance = 0;

function validateOptions(def: VectorIcon, options: VectorRenderOptions): IconVariantName {
  const variant = options.variant ?? 'outline';
  if (!isOneOf(VARIANTS, variant)) badOption('variant', VARIANTS.join(', '));
  if (!Object.hasOwn(def.variants, variant)) badOption('variant', `a variant of ${def.id}: ${Object.keys(def.variants).join(', ')}`);
  for (const [role, value] of Object.entries(options.colors ?? {})) {
    if (!isOneOf(ROLES, role)) badOption('colors', ROLES.join(', '));
    color(`colors.${role}`, value);
  }
  for (const [name, o] of Object.entries(options.layers ?? {})) {
    if (!isOneOf(LAYERS, name)) badOption('layers', LAYERS.join(', '));
    if (o.color !== undefined) color(`layers.${name}.color`, o.color);
    if (o.opacity !== undefined && !inUnit(o.opacity)) badOption(`layers.${name}.opacity`, '0 to 1');
  }
  const overlays = options.overlays ?? [];
  if (overlays.length > 2) badOption('overlays', 'at most two overlays');
  const used = new Set<string>();
  for (const o of overlays) {
    assertOverlay(o.icon);
    const anchor = o.anchor ?? 'bottom-end';
    if (!Object.hasOwn(ANCHORS, anchor) || used.has(anchor)) badOption('overlays', 'one overlay per anchor (bottom-end, top-end, center)');
    used.add(anchor);
  }
  if (options.container !== undefined && !isOneOf(['circle', 'square'], options.container)) badOption('container', '"circle" or "square"');
  if (options.strokeWidth !== undefined && !(Number.isFinite(options.strokeWidth) && options.strokeWidth >= 0.5 && options.strokeWidth <= 4)) badOption('strokeWidth', '0.5 to 4');
  if (options.strokeScaling !== undefined && !isOneOf(['scale', 'fixed'], options.strokeScaling)) badOption('strokeScaling', '"scale" or "fixed"');
  if (options.rotate !== undefined && ![0, 90, 180, 270].includes(options.rotate)) badOption('rotate', '0, 90, 180, or 270');
  if (options.flip !== undefined && !['horizontal', 'vertical', 'both'].includes(options.flip)) badOption('flip', '"horizontal", "vertical", or "both"');
  if (options.dir !== undefined && !['auto', 'ltr', 'rtl'].includes(options.dir)) badOption('dir', '"auto", "ltr", or "rtl"');
  return variant;
}

function paintLayer(group: SVGElement, layer: VectorLayer, variant: IconVariantName, override: IconLayerOverride | undefined, fixed: boolean): void {
  const paint = override?.color ?? rolePaint(layer.role, variant);
  if (layer.paint === 'stroke') {
    group.style.setProperty('fill', 'none');
    group.style.setProperty('stroke', paint);
  } else {
    group.style.setProperty('fill', paint);
    group.style.setProperty('stroke', 'none');
    if (layer.fillRule) group.setAttribute('fill-rule', layer.fillRule);
  }
  const opacity = override?.opacity ?? layer.opacity;
  if (opacity !== undefined) group.style.setProperty('opacity', String(opacity));
  else if (variant === 'duotone' && layer.role === 'secondary' && layer.paint === 'fill') group.style.setProperty('opacity', 'var(--aui-icon-secondary-opacity, 0.3)');
  else group.style.removeProperty('opacity');
  if (override?.hidden) group.style.setProperty('display', 'none');
  else group.style.removeProperty('display');
  // childNodes, not children: server DOM implementations (Angular SSR) lack children on SVG elements.
  for (const node of Array.from(group.childNodes).filter(isElementNode)) {
    if (fixed && layer.paint === 'stroke') node.setAttribute('vector-effect', 'non-scaling-stroke');
    else node.removeAttribute('vector-effect');
  }
}

/** A mask with a unique id (per document instance) that hides `shapes` inside a `size` square. */
function createMask(root: Element, shapes: readonly SvgNode[], size: number): string {
  const doc = root.ownerDocument;
  let defs = root.querySelector(':scope > defs');
  if (!defs) {
    defs = doc.createElementNS(SVG_NS, 'defs');
    root.prepend(defs);
  }
  const id = `aui-i${String(++instance)}-mask`;
  const mask = doc.createElementNS(SVG_NS, 'mask');
  mask.setAttribute('id', id);
  mask.setAttribute('maskUnits', 'userSpaceOnUse');
  for (const [k, v] of [['x', 0], ['y', 0], ['width', size], ['height', size]] as const) mask.setAttribute(k, String(v));
  const all = doc.createElementNS(SVG_NS, 'rect');
  for (const [k, v] of [['width', size], ['height', size]] as const) all.setAttribute(k, String(v));
  all.setAttribute('fill', 'white');
  mask.append(all);
  for (const shape of shapes) {
    const hole = createNode(doc, shape);
    hole.setAttribute('fill', 'black');
    mask.append(hole);
  }
  defs.append(mask);
  return id;
}

function drawLayers(doc: Document, parent: Element, layers: readonly VectorLayer[], variant: IconVariantName, options: VectorRenderOptions, root?: Element, size = 24): void {
  for (const layer of layers) {
    const g = doc.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-layer', layer.name);
    if (layer.knockout && root) g.setAttribute('mask', `url(#${createMask(root, layer.knockout, size)})`);
    for (const node of layer.nodes) g.append(createNode(doc, node));
    paintLayer(g, layer, variant, options.layers?.[layer.name], options.strokeScaling === 'fixed');
    parent.append(g);
  }
}

/** Inner transform for rotation, flips, and a forced right-to-left mirror (CSS mirrors `dir: 'auto'`). */
function innerTransform(def: VectorIcon, options: VectorRenderOptions): string {
  const parts: string[] = [];
  const flipX = (options.flip === 'horizontal' || options.flip === 'both') !== (options.dir === 'rtl' && def.mirror === true);
  const flipY = options.flip === 'vertical' || options.flip === 'both';
  if (flipX || flipY) parts.push(`matrix(${flipX ? -1 : 1} 0 0 ${flipY ? -1 : 1} ${flipX ? 24 : 0} ${flipY ? 24 : 0})`);
  if (options.rotate) parts.push(`rotate(${String(options.rotate)} 12 12)`);
  return parts.join(' ');
}

function build(root: SVGElement, def: VectorIcon, options: VectorRenderOptions): void {
  const doc = root.ownerDocument;
  const variant = validateOptions(def, options);
  root.replaceChildren();
  root.setAttribute('viewBox', def.viewBox);
  root.setAttribute('data-icon', def.id);
  root.setAttribute('data-variant', variant);
  root.style.setProperty('stroke-width', strokeValue(options.strokeWidth));
  root.setAttribute('stroke-linecap', 'round');
  root.setAttribute('stroke-linejoin', 'round');
  if (def.mirror === true && (options.dir ?? 'auto') === 'auto') root.setAttribute('data-mirror', '');
  else root.removeAttribute('data-mirror');
  for (const role of ROLES) root.style.removeProperty(`--aui-icon-${role}`);
  for (const [role, value] of Object.entries(options.colors ?? {})) root.style.setProperty(`--aui-icon-${role}`, color(`colors.${role}`, value));

  const transform = innerTransform(def, options);
  let content: Element = root;
  if (transform) {
    content = doc.createElementNS(SVG_NS, 'g');
    content.setAttribute('transform', transform);
    root.append(content);
  }
  const overlays = options.overlays ?? [];
  let base: Element = content;
  if (overlays.length) {
    const id = `aui-i${String(++instance)}-knockout`;
    const defs = doc.createElementNS(SVG_NS, 'defs');
    const mask = doc.createElementNS(SVG_NS, 'mask');
    mask.setAttribute('id', id);
    mask.setAttribute('maskUnits', 'userSpaceOnUse');
    for (const [k, v] of [['x', 0], ['y', 0], ['width', 24], ['height', 24]] as const) mask.setAttribute(k, String(v));
    const all = doc.createElementNS(SVG_NS, 'rect');
    for (const [k, v] of [['width', '24'], ['height', '24'], ['fill', 'white']] as const) all.setAttribute(k, v);
    mask.append(all);
    for (const o of overlays) {
      const [cx, cy] = def.anchors?.[o.anchor ?? 'bottom-end'] ?? ANCHORS[o.anchor ?? 'bottom-end'];
      const hole = doc.createElementNS(SVG_NS, 'circle');
      for (const [k, v] of [['cx', cx], ['cy', cy], ['r', OVERLAY_RADIUS + KNOCKOUT]] as const) hole.setAttribute(k, String(v));
      hole.setAttribute('fill', 'black');
      mask.append(hole);
    }
    defs.append(mask);
    root.prepend(defs);
    base = doc.createElementNS(SVG_NS, 'g');
    base.setAttribute('mask', `url(#${id})`);
    content.append(base);
  }
  let glyph: Element = base;
  if (options.container) {
    const shape = options.container === 'circle' ? createNode(doc, ['circle', { cx: 12, cy: 12, r: 10 }]) : createNode(doc, ['rect', { x: 2, y: 2, width: 20, height: 20, rx: 4 }]);
    const g = doc.createElementNS(SVG_NS, 'g');
    g.setAttribute('data-layer', 'container');
    g.append(shape);
    g.style.setProperty('fill', 'none');
    g.style.setProperty('stroke', rolePaint('primary', variant));
    base.append(g);
    const scaled = doc.createElementNS(SVG_NS, 'g');
    scaled.setAttribute('transform', `translate(12 12) scale(${String(CONTAINER_SCALE)}) translate(-12 -12)`);
    // Keep the visual stroke width of the glyph equal to the container's.
    scaled.style.setProperty('stroke-width', `calc(${strokeValue(options.strokeWidth)} / ${String(CONTAINER_SCALE)})`);
    base.append(scaled);
    glyph = scaled;
  }
  drawLayers(doc, glyph, def.variants[variant] ?? [], variant, options, root);
  for (const o of overlays) {
    const [cx, cy] = def.anchors?.[o.anchor ?? 'bottom-end'] ?? ANCHORS[o.anchor ?? 'bottom-end'];
    const box = doc.createElementNS(SVG_NS, 'svg');
    for (const [k, v] of [['x', cx - OVERLAY_RADIUS], ['y', cy - OVERLAY_RADIUS], ['width', 10], ['height', 10]] as const) box.setAttribute(k, String(v));
    box.setAttribute('viewBox', '0 0 10 10');
    box.setAttribute('overflow', 'visible');
    box.setAttribute('data-overlay', o.icon.id);
    const solid = (variant === 'solid' || variant === 'multicolor') && o.icon.variants.solid !== undefined;
    drawLayers(doc, box, (solid ? o.icon.variants.solid : undefined) ?? o.icon.variants.outline, variant, { strokeScaling: options.strokeScaling ?? 'scale' }, root, 10);
    content.append(box);
  }
}

/** Render a vector icon into a new `<svg>` (without the `aui-icon` class and accessibility attributes). */
export function renderVector(def: VectorIcon, options: VectorRenderOptions, doc: Document): SVGSVGElement {
  assertVectorIcon(def);
  const root = doc.createElementNS(SVG_NS, 'svg');
  root.setAttribute('width', '1em');
  root.setAttribute('height', '1em');
  root.setAttribute('focusable', 'false');
  build(root, def, options);
  states.set(root, { def, options });
  return root;
}

const isSvg = (el: Element | null): el is SVGElement => el !== null && el.namespaceURI === SVG_NS;
/** Element nodes only (node type 1); works with server DOM implementations that have no global Node. */
const isElementNode = (node: ChildNode): node is Element => node.nodeType === 1;

/** Restyle in place when only colors, layer overrides, or the stroke width change; otherwise rebuild the content. */
export function updateVector(root: Element, changes: VectorRenderOptions): boolean {
  const state = states.get(root);
  if (!state || !isSvg(root)) return false;
  const next: VectorRenderOptions = { ...state.options, ...changes };
  // A container scales the glyph's stroke, so a new stroke width there needs a rebuild.
  const cheap = Object.keys(changes).every((k) => k === 'colors' || k === 'layers' || (k === 'strokeWidth' && next.container === undefined));
  const variant = validateOptions(state.def, next);
  if (cheap) {
    for (const role of ROLES) root.style.removeProperty(`--aui-icon-${role}`);
    for (const [role, value] of Object.entries(next.colors ?? {})) root.style.setProperty(`--aui-icon-${role}`, color(`colors.${role}`, value));
    root.style.setProperty('stroke-width', strokeValue(next.strokeWidth));
    const layers = state.def.variants[variant] ?? [];
    for (const layer of layers) {
      // Layers of the icon itself, not those of its overlays.
      const group = [...root.querySelectorAll(`g[data-layer="${layer.name}"]`)].find((g) => g.closest('[data-overlay]') === null) ?? null;
      if (isSvg(group)) paintLayer(group, layer, variant, next.layers?.[layer.name], next.strokeScaling === 'fixed');
    }
  } else {
    build(root, state.def, next);
  }
  state.options = next;
  return true;
}

/** The definition and options an element was rendered with, for the animation controller. */
export function vectorStateOf(root: Element): { readonly def: VectorIcon; readonly options: VectorRenderOptions } | undefined {
  return states.get(root);
}
