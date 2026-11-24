/**
 * Layout primitives (SPEC section 18.2): Container, Stack, Flex, Grid, Divider.
 * The CSS classes are the primary API and work without JavaScript. The JS
 * helpers validate options, then apply the same classes and custom properties
 * (through the CSSOM, CSP-safe) to a consumer-owned element; each returns a
 * handle whose `destroy()` removes exactly what it added.
 */
import { configurationError, defineComponentConfig, DisposableGroup, validators } from '@absoluteui/core';
import { AppliedStyles } from './applied.js';

export const LAYOUT_GAPS = [0, 1, 2, 3, 4, 5, 6, 8, 10, 12] as const;
/** Gap step; maps to the `space-N` token (`0` is no gap). */
export type LayoutGap = (typeof LAYOUT_GAPS)[number];
export type LayoutAlign = 'start' | 'center' | 'end' | 'stretch' | 'baseline';
export type LayoutJustify = 'start' | 'center' | 'end' | 'between' | 'around' | 'evenly';
export type ContainerSize = 'sm' | 'md' | 'lg' | 'xl';
export type GridColumns = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8 | 9 | 10 | 11 | 12 | 'auto';
export type DividerOrientation = 'horizontal' | 'vertical';

export interface LayoutConfig {
  /** Gap used when a helper's `gap` option is omitted. */
  defaultGap: LayoutGap;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    layout: LayoutConfig;
  }
}

export const layoutConfig = defineComponentConfig<LayoutConfig>('layout', {
  defaultGap: { default: 4, expected: '0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12', validate: validators.oneOf(LAYOUT_GAPS) },
});

export interface StackOptions {
  gap?: LayoutGap | undefined;
  /** Cross-axis (inline) alignment of children. */
  align?: LayoutAlign | undefined;
}

export interface FlexOptions {
  gap?: LayoutGap | undefined;
  /** Cross-axis (block) alignment. */
  align?: LayoutAlign | undefined;
  /** Main-axis distribution. */
  justify?: LayoutJustify | undefined;
  /** Default true: items wrap onto new lines instead of overflowing (reflow). */
  wrap?: boolean;
  /** `row` follows the writing direction, so it is already mirrored in RTL. */
  direction?: 'row' | 'row-reverse';
}

export interface GridOptions {
  /** Fixed column count, or `'auto'` (default): as many columns of at least `minColumnWidth` as fit. */
  columns?: GridColumns;
  /** Auto mode only: minimum column width as a CSS length, for example `'12rem'`. Default `16rem`. */
  minColumnWidth?: string | undefined;
  gap?: LayoutGap | undefined;
}

export interface ContainerOptions {
  /** Maximum inline size (`container-width-*` token). Default `lg`. */
  size?: ContainerSize;
}

export interface DividerOptions {
  orientation?: DividerOrientation;
  /** Short visible text centered on a horizontal divider, for example "or". */
  label?: string;
  /** Purely visual: hidden from assistive technology. Cannot be combined with `label`. */
  decorative?: boolean;
}

export interface LayoutHandle<O> {
  readonly element: HTMLElement;
  readonly options: Readonly<O>;
  /** Merge and apply options (validated first; invalid options leave the element unchanged). */
  update(options: Partial<O>): void;
  /** Remove the classes and custom properties this helper added. */
  destroy(): void;
}

const ALIGN: readonly LayoutAlign[] = ['start', 'center', 'end', 'stretch', 'baseline'];
const JUSTIFY: readonly LayoutJustify[] = ['start', 'center', 'end', 'between', 'around', 'evenly'];
const SIZES: readonly ContainerSize[] = ['sm', 'md', 'lg', 'xl'];
const GAP_CLASSES = LAYOUT_GAPS.map((g) => `aui-gap-${String(g)}`);
const ALIGN_CLASSES = ALIGN.map((a) => `aui-align-${a}`);
const JUSTIFY_CLASSES = JUSTIFY.map((j) => `aui-justify-${j}`);
const SIZE_CLASSES = SIZES.map((s) => `aui-container--${s}`);
const COLUMN_CLASSES = Array.from({ length: 12 }, (_, i) => `aui-grid--cols-${String(i + 1)}`);
const GRID_MODE_CLASSES = [...COLUMN_CLASSES, 'aui-grid--auto'];
const DISPLAY_CLASSES = ['aui-stack', 'aui-flex', 'aui-inline', 'aui-grid'];
const GRID_MIN_PROPERTY = '--aui-grid-min';

/**
 * Strict CSS length: a non-negative number with an absolute, font-relative,
 * viewport, container, or percentage unit (or a bare `0`). Rejects calc(),
 * var(), and anything else that could smuggle other declarations.
 */
const CSS_LENGTH = /^(?:0|(?:\d{1,5}(?:\.\d{1,4})?|\.\d{1,4})(?:px|rem|em|ch|ex|%|vw|vh|vi|vb|vmin|vmax|svw|svh|lvw|lvh|dvw|dvh|cqi|cqb|cqw|cqh))$/;

export function isCssLength(value: unknown): value is string {
  return typeof value === 'string' && CSS_LENGTH.test(value);
}

type Kind = 'stack' | 'flex' | 'grid' | 'container';
/** Stack, Flex, and Grid all set `display`, so only one of them may own an element. */
const slotOf = (kind: Kind): 'display' | 'container' => (kind === 'container' ? 'container' : 'display');
const owners = new WeakMap<HTMLElement, Set<'display' | 'container'>>();

function fail(helper: string, property: string, expected: string): never {
  throw configurationError('LAYOUT_OPTIONS', 'Invalid layout options.', { component: 'layout', property: `layout.${helper}.${property}`, expected });
}

function checkGap(helper: string, gap: unknown): void {
  if (gap !== undefined && !(LAYOUT_GAPS as readonly unknown[]).includes(gap)) fail(helper, 'gap', '0 | 1 | 2 | 3 | 4 | 5 | 6 | 8 | 10 | 12');
}

function checkAlign(helper: string, align: unknown): void {
  if (align !== undefined && !(ALIGN as readonly unknown[]).includes(align)) fail(helper, 'align', '"start" | "center" | "end" | "stretch" | "baseline"');
}

class LayoutBinding<O extends object> implements LayoutHandle<O> {
  readonly element: HTMLElement;
  #options: O;
  readonly #kind: Kind;
  readonly #styles: AppliedStyles;
  readonly #group = new DisposableGroup();
  readonly #validate: (options: O) => void;
  readonly #render: (styles: AppliedStyles, options: O, config: Readonly<LayoutConfig>) => void;

  constructor(kind: Kind, el: HTMLElement, options: O, validate: (options: O) => void, render: (styles: AppliedStyles, options: O, config: Readonly<LayoutConfig>) => void) {
    validate(options);
    const slots = owners.get(el);
    if (slots?.has(slotOf(kind))) {
      throw configurationError('LAYOUT_ALREADY_APPLIED', 'A layout helper is already applied to this element.', {
        component: 'layout',
        property: `layout.${kind}`,
        remediation: 'Call destroy() on the existing handle, or update() it instead of applying again.',
      });
    }
    this.element = el;
    this.#kind = kind;
    this.#options = { ...options };
    this.#validate = validate;
    this.#render = render;
    this.#styles = new AppliedStyles(el);
    // Render first: invalid options throw before the ownership record and subscription exist.
    this.#apply();
    if (slots) slots.add(slotOf(kind));
    else owners.set(el, new Set([slotOf(kind)]));
    this.#group.add(layoutConfig.subscribe(() => {
      this.#apply();
    }));
  }

  get options(): Readonly<O> {
    return this.#options;
  }

  update(options: Partial<O>): void {
    const next = { ...this.#options, ...options };
    this.#validate(next);
    this.#options = next;
    this.#apply();
  }

  destroy(): void {
    if (this.#group.disposed) return;
    this.#group.dispose();
    this.#styles.restore();
    owners.get(this.element)?.delete(slotOf(this.#kind));
  }

  #apply(): void {
    this.#render(this.#styles, this.#options, layoutConfig.resolve());
  }
}

function applyGap(styles: AppliedStyles, gap: LayoutGap | undefined, config: Readonly<LayoutConfig>): void {
  styles.setClass(GAP_CLASSES, `aui-gap-${String(gap ?? config.defaultGap)}`);
}

export const Stack = Object.freeze({
  /** Vertical stack: `display: flex; flex-direction: column` with a token gap. */
  apply(el: HTMLElement, options: StackOptions = {}): LayoutHandle<StackOptions> {
    return new LayoutBinding<StackOptions>('stack', el, options, (o) => {
      checkGap('stack', o.gap);
      checkAlign('stack', o.align);
    }, (styles, o, config) => {
      styles.setClass(DISPLAY_CLASSES, 'aui-stack');
      applyGap(styles, o.gap, config);
      styles.setClass(ALIGN_CLASSES, o.align === undefined ? null : `aui-align-${o.align}`);
    });
  },
});

export const Flex = Object.freeze({
  /** Horizontal flex row that wraps by default. */
  apply(el: HTMLElement, options: FlexOptions = {}): LayoutHandle<FlexOptions> {
    return new LayoutBinding<FlexOptions>('flex', el, options, (o) => {
      checkGap('flex', o.gap);
      checkAlign('flex', o.align);
      if (o.justify !== undefined && !JUSTIFY.includes(o.justify)) fail('flex', 'justify', '"start" | "center" | "end" | "between" | "around" | "evenly"');
      if (o.wrap !== undefined && typeof o.wrap !== 'boolean') fail('flex', 'wrap', 'boolean');
      if (o.direction !== undefined && !(['row', 'row-reverse'] as readonly unknown[]).includes(o.direction)) fail('flex', 'direction', '"row" | "row-reverse"');
    }, (styles, o, config) => {
      styles.setClass(DISPLAY_CLASSES, 'aui-flex');
      applyGap(styles, o.gap, config);
      styles.setClass(ALIGN_CLASSES, o.align === undefined ? null : `aui-align-${o.align}`);
      styles.setClass(JUSTIFY_CLASSES, o.justify === undefined ? null : `aui-justify-${o.justify}`);
      styles.setClass(['aui-flex--nowrap'], o.wrap === false ? 'aui-flex--nowrap' : null);
      styles.setClass(['aui-flex--reverse'], o.direction === 'row-reverse' ? 'aui-flex--reverse' : null);
    });
  },
});

export const Grid = Object.freeze({
  /** CSS grid: fixed columns, or responsive auto-fit columns (default). */
  apply(el: HTMLElement, options: GridOptions = {}): LayoutHandle<GridOptions> {
    return new LayoutBinding<GridOptions>('grid', el, options, (o) => {
      checkGap('grid', o.gap);
      const columns = o.columns ?? 'auto';
      if (columns !== 'auto' && !validators.integerInRange(1, 12)(columns)) fail('grid', 'columns', 'integer 1..12 or "auto"');
      if (o.minColumnWidth !== undefined) {
        if (!isCssLength(o.minColumnWidth)) fail('grid', 'minColumnWidth', 'CSS length such as "12rem" or "240px"');
        if (columns !== 'auto') fail('grid', 'minColumnWidth', 'columns: "auto" (minColumnWidth only applies to auto-fit grids)');
      }
    }, (styles, o, config) => {
      const columns = o.columns ?? 'auto';
      styles.setClass(DISPLAY_CLASSES, 'aui-grid');
      applyGap(styles, o.gap, config);
      styles.setClass(GRID_MODE_CLASSES, columns === 'auto' ? 'aui-grid--auto' : `aui-grid--cols-${String(columns)}`);
      styles.setProperty(GRID_MIN_PROPERTY, o.minColumnWidth ?? null);
    });
  },
});

export const Container = Object.freeze({
  /** Centered, width-capped page region with inline padding. */
  apply(el: HTMLElement, options: ContainerOptions = {}): LayoutHandle<ContainerOptions> {
    return new LayoutBinding<ContainerOptions>('container', el, options, (o) => {
      if (o.size !== undefined && !SIZES.includes(o.size)) fail('container', 'size', '"sm" | "md" | "lg" | "xl"');
    }, (styles, o) => {
      styles.setClass(['aui-container'], 'aui-container');
      styles.setClass(SIZE_CLASSES, `aui-container--${o.size ?? 'lg'}`);
    });
  },
});

export const Divider = Object.freeze({
  /**
   * Create a separator element (not inserted). Horizontal semantic dividers are
   * `<hr>`; vertical and labelled ones are `role="separator"` elements; decorative
   * ones are hidden from assistive technology.
   */
  create(options: DividerOptions = {}, doc: Document = document): HTMLElement {
    const orientation = options.orientation ?? 'horizontal';
    if (!(['horizontal', 'vertical'] as readonly unknown[]).includes(orientation)) fail('divider', 'orientation', '"horizontal" | "vertical"');
    if (options.decorative !== undefined && typeof options.decorative !== 'boolean') fail('divider', 'decorative', 'boolean');
    const label = options.label;
    if (label !== undefined) {
      if (typeof label !== 'string' || label.trim() === '') fail('divider', 'label', 'non-empty string');
      if (orientation === 'vertical') fail('divider', 'label', 'horizontal orientation (vertical dividers cannot carry text)');
      if (options.decorative) fail('divider', 'label', 'decorative: false (visible text must stay available to assistive technology)');
    }

    if (label !== undefined) {
      // Children of role=separator are presentational, so the label is also the accessible name.
      const el = doc.createElement('div');
      el.className = 'aui-divider aui-divider--labelled';
      el.setAttribute('role', 'separator');
      el.setAttribute('aria-label', label);
      const text = doc.createElement('span');
      text.className = 'aui-divider__label';
      text.textContent = label;
      el.append(text);
      return el;
    }
    if (orientation === 'horizontal') {
      const hr = doc.createElement('hr');
      hr.className = 'aui-divider';
      if (options.decorative) hr.setAttribute('aria-hidden', 'true');
      return hr;
    }
    const el = doc.createElement('div');
    el.className = 'aui-divider aui-divider--vertical';
    if (options.decorative) {
      el.setAttribute('aria-hidden', 'true');
    } else {
      el.setAttribute('role', 'separator');
      el.setAttribute('aria-orientation', 'vertical');
    }
    return el;
  },
});
