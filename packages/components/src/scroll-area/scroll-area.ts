/**
 * Scroll Area (R13-7). Enhances an element whose content can overflow: scrolling stays
 * native (wheel, touch, scrollbar, keyboard), edges fade where more content exists (a
 * CSS mask, so no elements are added), and while the content overflows the element is
 * a named, keyboard-focusable region, so keyboard users can scroll it (WCAG 2.1.1).
 * No custom-drawn scrollbars.
 */
import { configurationError, defineComponentConfig, validators, DisposableGroup } from '@absoluteui/core';

export type ScrollAreaOrientation = 'vertical' | 'horizontal' | 'both';

export interface ScrollAreaConfig {
  /** Fade the edges where more content exists. */
  shadows: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    scrollArea: ScrollAreaConfig;
  }
}

export const scrollAreaConfig = defineComponentConfig<ScrollAreaConfig>('scrollArea', {
  shadows: { default: true, expected: 'boolean', validate: validators.isBoolean },
});

export interface ScrollAreaOptions extends Partial<ScrollAreaConfig> {
  /** Accessible name of the region, such as "Release notes". */
  label: string;
  /** Scroll axis. Default `vertical`. */
  orientation?: ScrollAreaOrientation;
  /** Maximum block size as a CSS length, such as "20rem" or "50vh" (sets --aui-scroll-area-max-block-size). */
  maxBlockSize?: string;
}

/** Where more content is hidden, by physical edge. */
export interface ScrollAreaEdges {
  readonly top: boolean;
  readonly bottom: boolean;
  readonly left: boolean;
  readonly right: boolean;
}

const ORIENTATIONS: readonly ScrollAreaOrientation[] = ['vertical', 'horizontal', 'both'];
// A conservative CSS length: number + unit, or a single calc()/min()/max()/clamp() without nested quotes or semicolons.
const LENGTH = /^(\d+(\.\d+)?(px|rem|em|vh|vw|svh|dvh|lvh|%)|(calc|min|max|clamp)\([\w\s.%+*/,-]+\))$/;
const CLASSES = ['aui-scroll-area', 'aui-scroll-area--vertical', 'aui-scroll-area--horizontal', 'aui-scroll-area--both', 'aui-scroll-area--shadows'];
const EDGES = ['top', 'bottom', 'left', 'right'] as const;
/** data-aui-scroll-{edge} attributes that drive the CSS fades. */
const DATA: Readonly<Record<(typeof EDGES)[number], string>> = { top: 'data-aui-scroll-top', bottom: 'data-aui-scroll-bottom', left: 'data-aui-scroll-left', right: 'data-aui-scroll-right' };

export class ScrollArea {
  readonly element: HTMLElement;
  #options: ScrollAreaOptions;
  #edges: ScrollAreaEdges = { top: false, bottom: false, left: false, right: false };
  /** Attributes the element had before enhancement, restored by destroy(). */
  readonly #saved: Readonly<Record<'role' | 'aria-label' | 'tabindex', string | null>>;
  #frame = 0;
  readonly #resize: ResizeObserver | null;
  readonly #mutations: MutationObserver | null;
  readonly #group = new DisposableGroup();

  /** Enhance an element in place; its content stays where it is. */
  static enhance(element: HTMLElement, options: ScrollAreaOptions): ScrollArea {
    return new ScrollArea(element, options);
  }

  private constructor(element: HTMLElement, options: ScrollAreaOptions) {
    if (!(element instanceof HTMLElement)) {
      throw configurationError('SCROLL_AREA_HOST', 'Scroll Area requires an element.', { component: 'scrollArea', property: 'element', expected: 'HTMLElement' });
    }
    ScrollArea.#assert(options);
    this.element = element;
    this.#options = { ...options };
    this.#saved = { role: element.getAttribute('role'), 'aria-label': element.getAttribute('aria-label'), tabindex: element.getAttribute('tabindex') };
    // Render first: invalid configuration throws before the element is touched.
    this.#render();
    this.#group.listen(element, 'scroll', () => {
      this.#schedule();
    }, { passive: true });
    const view = element.ownerDocument.defaultView;
    this.#resize = view && 'ResizeObserver' in view ? new view.ResizeObserver(() => {
      this.#schedule();
    }) : null;
    this.#mutations = view && 'MutationObserver' in view ? new view.MutationObserver(() => {
      this.#observeChildren();
      this.#schedule();
    }) : null;
    this.#resize?.observe(element);
    this.#observeChildren();
    this.#mutations?.observe(element, { childList: true });
    this.#group.add(scrollAreaConfig.subscribe(() => {
      this.#render();
    }));
    this.refresh();
  }

  get options(): Readonly<ScrollAreaOptions> {
    return this.#options;
  }

  /** Edges with hidden content (physical: left and right do not flip in RTL). */
  get edges(): ScrollAreaEdges {
    return this.#edges;
  }

  /** Whether the content overflows along the scroll axis (then the region is focusable). */
  get overflowing(): boolean {
    const e = this.#edges;
    return e.top || e.bottom || e.left || e.right;
  }

  /** Recompute the edges now (normally automatic on scroll, resize, and child changes). */
  refresh(): void {
    if (this.#frame) {
      cancelAnimationFrame(this.#frame);
      this.#frame = 0;
    }
    this.#measure();
  }

  update(options: Partial<ScrollAreaOptions>): void {
    const next = { ...this.#options, ...options };
    ScrollArea.#assert(next);
    this.#options = next;
    this.#render();
    this.refresh();
  }

  destroy(): void {
    this.#group.dispose();
    this.#resize?.disconnect();
    this.#mutations?.disconnect();
    if (this.#frame) cancelAnimationFrame(this.#frame);
    const el = this.element;
    el.classList.remove(...CLASSES);
    for (const edge of EDGES) el.removeAttribute(DATA[edge]);
    el.style.removeProperty('--aui-scroll-area-max-block-size');
    for (const [name, value] of Object.entries(this.#saved)) {
      if (value === null) el.removeAttribute(name);
      else el.setAttribute(name, value);
    }
  }

  static #assert(options: ScrollAreaOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SCROLL_AREA_OPTIONS', 'Invalid scroll area options.', { component: 'scrollArea', property: `scrollArea.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const orientation: unknown = options.orientation;
    if (orientation !== undefined && !ORIENTATIONS.includes(orientation as ScrollAreaOrientation)) fail('orientation', '"vertical" | "horizontal" | "both"');
    const max: unknown = options.maxBlockSize;
    if (max !== undefined && (typeof max !== 'string' || !LENGTH.test(max.trim()))) fail('maxBlockSize', 'a CSS length such as "20rem", "50vh", or "calc(100vh - 8rem)"');
  }

  #observeChildren(): void {
    if (!this.#resize) return;
    // Content changes size without resizing the container: observe each child too.
    for (const child of Array.from(this.element.children)) this.#resize.observe(child);
  }

  #schedule(): void {
    if (this.#frame) return;
    this.#frame = requestAnimationFrame(() => {
      this.#frame = 0;
      this.#measure();
    });
  }

  #render(): void {
    const o = this.#options;
    const { shadows } = scrollAreaConfig.resolve(o.shadows === undefined ? {} : { shadows: o.shadows });
    const el = this.element;
    const orientation = o.orientation ?? 'vertical';
    el.classList.add('aui-scroll-area');
    for (const v of ORIENTATIONS) el.classList.toggle(`aui-scroll-area--${v}`, v === orientation);
    el.classList.toggle('aui-scroll-area--shadows', shadows);
    if (o.maxBlockSize === undefined) el.style.removeProperty('--aui-scroll-area-max-block-size');
    else el.style.setProperty('--aui-scroll-area-max-block-size', o.maxBlockSize.trim());
    this.#applyAccess();
  }

  #measure(): void {
    const el = this.element;
    const orientation = this.#options.orientation ?? 'vertical';
    const vertical = orientation !== 'horizontal';
    const horizontal = orientation !== 'vertical';
    // In RTL, scrollLeft runs from 0 (start, right edge) to negative values.
    const rtl = getComputedStyle(el).direction === 'rtl';
    const maxX = el.scrollWidth - el.clientWidth;
    const x = rtl ? -el.scrollLeft : el.scrollLeft;
    const fromStart = x > 1;
    const beforeEnd = x < maxX - 1;
    const edges: ScrollAreaEdges = {
      top: vertical && el.scrollTop > 1,
      bottom: vertical && el.scrollTop < el.scrollHeight - el.clientHeight - 1,
      left: horizontal && (rtl ? beforeEnd : fromStart),
      right: horizontal && (rtl ? fromStart : beforeEnd),
    };
    this.#edges = edges;
    for (const edge of EDGES) {
      el.toggleAttribute(DATA[edge], edges[edge]);
    }
    this.#applyAccess();
  }

  /** Generic elements become a region; lists, tables, and other semantic elements keep their role. */
  #generic(): boolean {
    return this.#saved.role === null && (this.element.localName === 'div' || this.element.localName === 'span');
  }

  /** Named and focusable only while there is something to scroll. */
  #applyAccess(): void {
    const el = this.element;
    if (this.overflowing) {
      if (this.#generic()) el.setAttribute('role', 'region');
      el.setAttribute('aria-label', this.#options.label);
      if (this.#saved.tabindex === null) el.setAttribute('tabindex', '0');
    } else {
      for (const name of ['role', 'aria-label', 'tabindex'] as const) {
        const value = this.#saved[name];
        if (value === null) el.removeAttribute(name);
        else el.setAttribute(name, value);
      }
    }
  }
}
