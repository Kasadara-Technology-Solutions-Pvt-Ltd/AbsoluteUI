/**
 * Chart frame (SPEC section 18.18 shared infrastructure) used by Line, Bar, and Pie
 * charts: title and description, legend with visibility toggles, the SVG plot
 * (role="group" named by the title, described by a generated summary), roving
 * keyboard focus through data marks, a tooltip on pointer hover and keyboard
 * focus (dismissible with Escape, WCAG 1.4.13), responsive width through
 * ResizeObserver, an empty state, and the data table fallback.
 *
 * DOM is built with createElement(NS) and textContent only; positions are written
 * through the CSSOM (CSP-safe). Internal: not a public subpath export.
 */
import { createId, DisposableGroup, emit } from '@absoluteui/core';
import { observeResize } from '@absoluteui/utilities';
import { chartMessage, type ChartTableMode } from './model.js';
import { applySeriesDash, applySeriesStyle, ChartStyler, cornerOf, resolveCorners, seriesMarker, type ChartCorners, type ChartPointClickDetail, type ChartSeriesStyle, type ChartTheme, type ChartTooltipContext, type ChartTooltipRenderer } from './style.js';
import { markerPath, MARKER_SHAPES, patternTile, roundedBox, svgElement, SVG_NS } from './svg.js';

export interface FrameMark {
  /**
   * Focusable mark (role="img" with an aria-label), or `null` for a virtual mark of a
   * dense series: it is painted into one of two proxy elements when it becomes active,
   * so large series need no DOM node per point (focus alternates between the proxies,
   * so screen readers announce every move).
   */
  readonly element: SVGElement | null;
  /** Row for Up/Down (cartesian) navigation: the visible-series position. */
  readonly row: number;
  /** Column for Left/Right navigation: the category or x index. */
  readonly column: number;
  /** Stable key to restore focus across re-renders. */
  readonly key: string;
  /** Tooltip anchor in plot coordinates (px). */
  readonly x: number;
  readonly y: number;
}

/** `none`: no key (for example a Total row). */
export type SwatchKind = 'line' | 'fill' | 'none';

export interface TooltipRow {
  readonly slot: number;
  readonly shapeSlot: number;
  readonly swatch: SwatchKind;
  readonly label: string;
  readonly value: string;
  /** Replaces the palette-slot class of the swatch (for example a heatmap bucket). */
  readonly swatchClass?: string;
  /** Series (or item) id, passed to `renderTooltip` and `aui-point-click`. */
  readonly seriesId?: string;
  /** Per-series style: the swatch shows the same color, dash, and marker. */
  readonly seriesStyle?: ChartSeriesStyle | undefined;
}

export interface TooltipContent {
  readonly title: string;
  readonly rows: readonly TooltipRow[];
}

export interface HoverResult {
  readonly content: TooltipContent;
  readonly x: number;
  readonly y: number;
  /** Marks emphasized while hovered. */
  readonly highlight: readonly SVGElement[];
  /** Crosshair position in plot coordinates (snapped to the data); `y` only for two-axis crosshairs. Default: the tooltip anchor. */
  readonly crosshair?: { readonly x: number; readonly y?: number };
  /** Hovered column (synchronized crosshairs, `renderTooltip`). Default: the first highlighted mark's column. */
  readonly column?: number;
}

export interface LegendItem {
  readonly id: string;
  readonly label: string;
  /** Extra text after the label (for example a slice's value and percentage). */
  readonly detail?: string;
  readonly slot: number;
  readonly shapeSlot: number;
  readonly swatch: SwatchKind;
  readonly visible: boolean;
  /** Replaces the palette-slot class of the swatch (for example a heatmap bucket). */
  readonly swatchClass?: string;
  /** Per-series style: the swatch shows the same color, dash, and marker. */
  readonly seriesStyle?: ChartSeriesStyle | undefined;
}

export interface TableData {
  readonly caption: string;
  readonly columns: readonly string[];
  /** First cell of each row is its row header. */
  readonly rows: readonly (readonly string[])[];
  /** Columns aligned to the end (numeric). */
  readonly numeric: readonly boolean[];
}

export interface FrameHooks {
  /** Draw into `frame.layer` for the given plot size and call `frame.setMarks`. */
  render(width: number, height: number): void;
  hover(x: number, y: number): HoverResult | null;
  tooltip(mark: FrameMark): TooltipContent;
  toggle(id: string): void;
  /** Paint a virtual mark into a proxy element: geometry, classes (keep `aui-chart__mark`), and aria-label. */
  paint?(mark: FrameMark, element: SVGPathElement): void;
  /**
   * Arrow navigation past the first or last mark of a row (zoomed charts pan here).
   * Return the key of the mark to focus after the chart re-rendered, or null to stay.
   */
  beyond?(mark: FrameMark, step: 1 | -1): string | null;
  /** Keys on a focused mark, before arrow navigation (zoom keys, drill-down). Return true when handled. */
  key?(event: KeyboardEvent, mark: FrameMark): boolean;
  /** `aui-point-click` fields for a mark when the tooltip rows do not describe it (for example scatter axes). */
  pointDetail?(mark: FrameMark): Pick<ChartPointClickDetail, 'seriesId' | 'series' | 'value'> | null;
}

export type CrosshairMode = 'none' | 'x' | 'xy';

export type Navigation = 'columns-horizontal' | 'columns-vertical';

const FALLBACK_WIDTH = 480;
const KEY_SEPARATOR = String.fromCharCode(0);

/** Charts sharing a `syncGroup` (module-level; frames leave their group on destroy). */
const syncGroups = new Map<string, Set<ChartFrame>>();

/** Look-and-feel and interaction settings shared by every frame chart (R20-15). */
export interface FrameStyleSettings {
  readonly theme?: ChartTheme | undefined;
  readonly renderTooltip?: ChartTooltipRenderer | undefined;
  readonly syncGroup?: string | undefined;
}

export class ChartFrame {
  readonly host: HTMLElement;
  readonly doc: Document;
  readonly svg: SVGSVGElement;
  /** Cleared and redrawn by each render. */
  readonly layer: SVGGElement;
  readonly body: HTMLDivElement;
  readonly legend: HTMLUListElement;
  readonly title: HTMLDivElement;
  /** Chart controls (zoom buttons, drill-down breadcrumb); hidden while empty. */
  readonly toolbar: HTMLDivElement;
  readonly #block: string;
  readonly #hooks: FrameHooks;
  readonly #group = new DisposableGroup();
  readonly #description: HTMLParagraphElement;
  readonly #summary: HTMLParagraphElement;
  readonly #tooltip: HTMLDivElement;
  readonly #empty: HTMLDivElement;
  readonly #data: HTMLDivElement;
  readonly #defs: SVGDefsElement;
  readonly #patterns = new Map<number, string>();
  #width = 0;
  #height = 300;
  #marks: FrameMark[] = [];
  #rows = new Map<number, FrameMark[]>();
  #activeKey: string | null = null;
  #active: FrameMark | null = null;
  #highlighted: readonly SVGElement[] = [];
  #hovering = false;
  #dismissed = false;
  #navigation: Navigation = 'columns-horizontal';
  #rtl = false;
  #locale = 'en-US';
  #tableMode: ChartTableMode = 'toggle';
  #tableOpen = false;
  #tableBuilt = false;
  #table: (() => TableData) | null = null;
  #tooltipEnabled = true;
  #legendKey = '';
  #tableToggle: HTMLButtonElement | null = null;
  #plotRect: DOMRect | null = null;
  #byElement = new Map<Element, FrameMark>();
  #activeElement: SVGElement | null = null;
  #proxies: SVGPathElement[] = [];
  #clip: SVGClipPathElement | null = null;
  #crosshairMode: CrosshairMode = 'none';
  #crosshair: SVGGElement | null = null;
  #plot = { left: 0, right: 0, top: 0, bottom: 0 };
  readonly #children: readonly HTMLElement[];
  readonly #styler: ChartStyler;
  readonly #gradients = new Map<string, string>();
  #renderTooltip: ChartTooltipRenderer | null = null;
  #syncGroup: string | null = null;
  #syncing = false;
  #synced = false;
  #broadcasted: number | null = null;
  #animateNext = false;
  #corners: ChartCorners | null = null;

  constructor(host: HTMLElement, block: string, hooks: FrameHooks) {
    this.host = host;
    this.doc = host.ownerDocument;
    this.#block = block;
    this.#hooks = hooks;
    const doc = this.doc;

    const header = doc.createElement('div');
    header.className = 'aui-chart__header';
    this.title = doc.createElement('div');
    this.title.className = 'aui-chart__title';
    this.title.id = createId('aui-chart-title');
    this.#description = doc.createElement('p');
    this.#description.className = 'aui-chart__description';
    this.#description.id = createId('aui-chart-desc');
    this.toolbar = doc.createElement('div');
    this.toolbar.className = 'aui-chart__toolbar';
    this.toolbar.hidden = true;
    header.append(this.title, this.#description, this.toolbar);

    this.legend = doc.createElement('ul');
    this.legend.className = 'aui-chart__legend';

    this.body = doc.createElement('div');
    this.body.className = 'aui-chart__body';
    this.svg = svgElement(doc, 'svg', { focusable: 'false' }, 'aui-chart__svg');
    this.svg.setAttribute('role', 'group');
    this.svg.setAttribute('aria-labelledby', this.title.id);
    this.#defs = svgElement(doc, 'defs');
    this.layer = svgElement(doc, 'g', {}, 'aui-chart__layer');
    this.svg.append(this.#defs, this.layer);
    this.#tooltip = doc.createElement('div');
    this.#tooltip.className = 'aui-chart__tooltip';
    // The focused mark's aria-label already carries the same text; the tooltip is visual.
    this.#tooltip.setAttribute('aria-hidden', 'true');
    this.#tooltip.hidden = true;
    this.#empty = doc.createElement('div');
    this.#empty.className = 'aui-chart__empty';
    this.#empty.hidden = true;
    this.body.append(this.svg, this.#empty, this.#tooltip);

    // Referenced by aria-describedby; hidden content still contributes to the description.
    this.#summary = doc.createElement('p');
    this.#summary.className = 'aui-chart__summary';
    this.#summary.id = createId('aui-chart-summary');
    this.#summary.hidden = true;

    this.#data = doc.createElement('div');
    this.#data.className = 'aui-chart__data';
    this.#children = [header, this.legend, this.body, this.#summary, this.#data];
    this.#styler = new ChartStyler(host);
  }

  /** Attach to the host (after the component validated and prepared its model). */
  mount(): void {
    const host = this.host;
    host.classList.add('aui-chart', this.#block);
    host.replaceChildren(...this.#children);
    this.#width = this.body.clientWidth || FALLBACK_WIDTH;
    const g = this.#group;
    g.add(observeResize(this.body, (entry) => {
      const width = Math.floor(entry.contentRect.width);
      if (width > 0 && width !== this.#width) {
        this.#width = width;
        this.render();
      }
    }));
    g.listen(this.body, 'keydown', (e) => {
      this.#onKeyDown(e);
    });
    g.listen(this.body, 'focusin', (e) => {
      const mark = this.#markFor(e.target);
      if (mark) this.#activate(mark, false);
    });
    g.listen(this.body, 'focusout', (e) => {
      if (this.#markFor(e.relatedTarget)) return;
      this.#activeElement?.classList.remove('aui-chart__mark--active');
      this.#active = null;
      if (!this.#hovering) {
        this.#hideTooltip();
        this.#moveCrosshair(null);
        this.#broadcast(null);
      }
    });
    g.listen(this.body, 'pointermove', (e) => {
      this.#onPointer(e);
    });
    g.listen(this.body, 'pointerdown', (e) => {
      if (e.pointerType !== 'mouse') this.#onPointer(e);
    });
    g.listen(this.body, 'pointerleave', () => {
      this.#hovering = false;
      this.#plotRect = null;
      this.#setHighlight([]);
      if (this.#active) {
        this.#showFor(this.#active);
        this.#moveCrosshair({ x: this.#active.x, y: this.#active.y });
        this.#broadcast(this.#active.column);
      } else {
        this.#hideTooltip();
        this.#moveCrosshair(null);
        this.#broadcast(null);
      }
    });
    g.listen(this.body, 'click', (e) => {
      const mark = this.#markFor(e.target);
      if (mark) this.#pointClick(mark, 'pointer');
    });
    g.listen(this.host, 'keydown', (e) => {
      if (e.key === 'Escape' && !this.#tooltip.hidden) {
        this.#dismissed = true;
        this.#hideTooltip();
        e.stopPropagation();
      }
    });
  }

  destroy(): void {
    this.#leaveSyncGroup();
    this.#group.dispose();
    this.#styler.clear();
    this.host.classList.remove('aui-chart--entering');
    this.host.replaceChildren();
    this.host.classList.remove('aui-chart', 'aui-chart--patterns', this.#block);
    this.host.style.removeProperty('--aui-chart-height');
  }

  get width(): number {
    return this.#width;
  }

  get height(): number {
    return this.#height;
  }

  get marks(): readonly FrameMark[] {
    return this.#marks;
  }

  /** The focused mark, else the roving tab stop, if any. */
  get activeMark(): FrameMark | null {
    return this.#active ?? this.#marks.find((m) => m.key === this.#activeKey) ?? null;
  }

  /** Crosshair lines following hover and keyboard focus (`x`: vertical line; `xy`: both). */
  setCrosshair(mode: CrosshairMode): void {
    this.#crosshairMode = mode;
    if (mode === 'none') this.#moveCrosshair(null);
  }

  /** Plot rectangle of the current render (the crosshair extent). */
  setPlot(plot: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }): void {
    this.#plot = { left: plot.left, right: plot.right, top: plot.top, bottom: plot.bottom };
  }

  /** Show `nodes` in the chart toolbar (hidden while empty). */
  setToolbar(nodes: readonly Node[]): void {
    this.toolbar.replaceChildren(...nodes);
    this.toolbar.hidden = nodes.length === 0;
  }

  configure(settings: { height: number; rtl: boolean; locale: string; tooltip: boolean; patterns: boolean; navigation: Navigation; roleDescription: string } & FrameStyleSettings): void {
    this.host.classList.toggle('aui-chart--patterns', settings.patterns);
    this.#styler.apply(settings.theme);
    this.#corners = null;
    // Opt-in entry animation: runs on the render that follows a data or option change, not on resize, zoom, or pan.
    this.#animateNext = settings.theme?.animation !== undefined && settings.theme.animation !== false;
    this.#renderTooltip = settings.renderTooltip ?? null;
    this.#setSyncGroup(settings.syncGroup ?? null);
    this.#height = settings.height;
    this.#rtl = settings.rtl;
    this.#locale = settings.locale;
    this.#tooltipEnabled = settings.tooltip;
    this.#navigation = settings.navigation;
    this.host.style.setProperty('--aui-chart-height', `${String(settings.height)}px`);
    this.svg.setAttribute('aria-roledescription', settings.roleDescription);
    if (!settings.tooltip) this.#hideTooltip();
  }

  setText(title: string, hideTitle: boolean, description: string | undefined, summary: string): void {
    this.title.textContent = title;
    this.title.classList.toggle('aui-chart__title--hidden', hideTitle);
    this.#description.textContent = description ?? '';
    this.#description.hidden = !description;
    this.#summary.textContent = summary;
    this.svg.setAttribute('aria-describedby', description ? `${this.#description.id} ${this.#summary.id}` : this.#summary.id);
  }

  get summary(): string {
    return this.#summary.textContent;
  }

  /** Re-render the plot at the current size, keeping keyboard focus on the same data point. */
  render(): void {
    const hadFocus = this.#markFor(this.doc.activeElement) !== null;
    this.#hideTooltip();
    this.#corners = null;
    this.#highlighted = [];
    this.layer.replaceChildren();
    this.#marks = [];
    this.#rows = new Map();
    this.#byElement = new Map();
    const width = this.#width;
    const height = this.#height;
    this.svg.setAttribute('width', String(width));
    this.svg.setAttribute('height', String(height));
    this.svg.setAttribute('viewBox', `0 0 ${String(width)} ${String(height)}`);
    this.#proxies = [];
    this.#activeElement = null;
    this.#crosshair = null;
    this.host.classList.toggle('aui-chart--entering', this.#animateNext);
    this.#animateNext = false;
    this.#hooks.render(width, height);
    if (this.#marks.some((m) => m.element === null)) {
      for (let i = 0; i < 2; i++) {
        const proxy = svgElement(this.doc, 'path', { display: 'none' });
        ChartFrame.markElement(proxy, '');
        this.#proxies.push(proxy);
        this.layer.append(proxy);
      }
    }
    const active = this.#marks.find((m) => m.key === this.#activeKey) ?? this.#marks[0] ?? null;
    this.#activeKey = active?.key ?? null;
    this.#active = null;
    if (active) {
      const element = this.#elementFor(active);
      element.setAttribute('tabindex', '0');
      this.#activeElement = element;
      if (hadFocus) element.focus();
    }
  }

  /** The element of a mark; virtual marks are painted into the proxy that is not focused. */
  #elementFor(mark: FrameMark): SVGElement {
    if (mark.element) return mark.element;
    const current = this.#proxies.find((p) => this.#byElement.get(p) === mark && p.getAttribute('display') !== 'none');
    if (current) return current;
    // render() creates both proxies whenever a virtual mark exists.
    const proxy = this.#proxies.find((p) => p !== this.#activeElement) ?? this.#proxies[0] ?? svgElement(this.doc, 'path');
    this.#hooks.paint?.(mark, proxy);
    proxy.classList.add('aui-chart__mark');
    proxy.removeAttribute('display');
    this.#byElement.set(proxy, mark);
    return proxy;
  }

  setEmpty(message: string | null): void {
    this.#empty.textContent = message ?? '';
    this.#empty.hidden = message === null;
  }

  /** Register the focusable marks produced by the current render. */
  setMarks(marks: FrameMark[]): void {
    this.#marks = marks;
    for (const mark of marks) {
      if (mark.element) this.#byElement.set(mark.element, mark);
      let row = this.#rows.get(mark.row);
      if (!row) {
        row = [];
        this.#rows.set(mark.row, row);
      }
      row.push(mark);
    }
    for (const row of this.#rows.values()) row.sort((a, b) => a.column - b.column);
  }

  /** Decorate a mark element (role, label, class) before `setMarks`. */
  static markElement(element: SVGElement, label: string): void {
    element.setAttribute('role', 'img');
    element.setAttribute('aria-label', label);
    element.classList.add('aui-chart__mark');
  }

  /** `url(#id)` of a clip path covering `rect` (zoomed charts clip lines and areas to the plot). */
  clip(rect: { readonly left: number; readonly right: number; readonly top: number; readonly bottom: number }): string {
    this.#clip ??= (() => {
      const id = createId('aui-chart-clip');
      const path = svgElement(this.doc, 'clipPath', { id });
      path.append(svgElement(this.doc, 'rect'));
      this.#defs.append(path);
      return path;
    })();
    const r = this.#clip.firstElementChild;
    r?.setAttribute('x', String(rect.left));
    r?.setAttribute('y', String(rect.top - 6));
    r?.setAttribute('width', String(Math.max(0, rect.right - rect.left)));
    r?.setAttribute('height', String(Math.max(0, rect.bottom - rect.top + 12)));
    return `url(#${this.#clip.id})`;
  }

  /** Id of a texture pattern for palette slot `slot` (null for the solid slot 1). */
  pattern(slot: number): string | null {
    const index = (slot - 1) % 8;
    if (index === 0) return null;
    const existing = this.#patterns.get(index);
    if (existing) return existing;
    const id = createId('aui-chart-pattern');
    const pattern = svgElement(this.doc, 'pattern', { id, width: 8, height: 8, patternUnits: 'userSpaceOnUse' });
    pattern.append(svgElement(this.doc, 'path', { d: patternTile(index) }, 'aui-chart__pattern-tile'));
    this.#defs.append(pattern);
    this.#patterns.set(index, id);
    return id;
  }

  /**
   * `url(#id)` of a gradient in palette slot `slot` (or a per-series `color`): the series color
   * fading toward the baseline (downward, or toward the start for horizontal bars).
   */
  gradient(slot: number, color?: string, horizontal = false): string {
    const key = `${String(slot)}|${color ?? ''}|${horizontal ? 'h' : 'v'}`;
    let id = this.#gradients.get(key);
    if (!id) {
      id = createId('aui-chart-gradient');
      const attributes = horizontal ? { id, x1: 1, y1: 0, x2: 0, y2: 0 } : { id, x1: 0, y1: 0, x2: 0, y2: 1 };
      const gradient = svgElement(this.doc, 'linearGradient', attributes, `aui-chart__gradient aui-chart__series--c${String(slot)}`);
      if (color) gradient.style.setProperty('--aui-chart-series-color', color);
      gradient.append(svgElement(this.doc, 'stop', { offset: 0 }, 'aui-chart__gradient-stop'), svgElement(this.doc, 'stop', { offset: 1 }, 'aui-chart__gradient-stop aui-chart__gradient-stop--end'));
      this.#defs.append(gradient);
      this.#gradients.set(key, id);
    }
    return `url(#${id})`;
  }

  /** Fill a shape with its series gradient (inline, through the CSSOM) when the chart has `theme.gradient`. */
  applyGradient(element: SVGElement, slot: number, color?: string, horizontal = false): void {
    if (this.host.classList.contains('aui-chart--gradient')) element.style.setProperty('fill', this.gradient(slot, color, horizontal));
  }

  setLegend(items: readonly LegendItem[], visible: boolean, toggleable: boolean): void {
    this.legend.hidden = !visible;
    this.legend.setAttribute('aria-label', chartMessage('legend', {}, this.#locale));
    const key = JSON.stringify([visible, toggleable, items]);
    if (key === this.#legendKey) return;
    this.#legendKey = key;
    const focused = this.doc.activeElement;
    const focusedId = focused instanceof HTMLElement && this.legend.contains(focused) ? focused.dataset.series : undefined;
    const doc = this.doc;
    const nodes = items.map((item) => {
      const li = doc.createElement('li');
      li.className = 'aui-chart__legend-entry';
      const content = toggleable ? doc.createElement('button') : doc.createElement('span');
      content.className = 'aui-chart__legend-item';
      content.classList.toggle('aui-chart__legend-item--hidden', !item.visible);
      content.dataset.series = item.id;
      if (content instanceof HTMLButtonElement) {
        content.type = 'button';
        content.setAttribute('aria-pressed', String(item.visible));
        content.addEventListener('click', () => {
          this.#hooks.toggle(item.id);
        });
      }
      const text = doc.createElement('span');
      text.className = 'aui-chart__legend-label';
      text.textContent = item.label;
      content.append(this.swatch(item.slot, item.shapeSlot, item.swatch, item.swatchClass, item.seriesStyle), text);
      if (item.detail) {
        const detail = doc.createElement('span');
        detail.className = 'aui-chart__legend-detail';
        detail.textContent = item.detail;
        content.append(detail);
      }
      li.append(content);
      return li;
    });
    this.legend.replaceChildren(...nodes);
    if (focusedId !== undefined) {
      for (const el of this.legend.querySelectorAll<HTMLElement>('.aui-chart__legend-item')) if (el.dataset.series === focusedId) el.focus();
    }
  }

  /**
   * Corner radii (R20-22) resolved from the host's custom properties, read once per render
   * (and once after `configure`), so stylesheet and `theme` values both apply.
   */
  get corners(): ChartCorners {
    this.#corners ??= resolveCorners(this.host);
    return this.#corners;
  }

  /** A small aria-hidden SVG key: a line with a marker, or a filled (patterned) square. */
  swatch(slot: number, shapeSlot: number, kind: SwatchKind, className?: string, style?: ChartSeriesStyle): SVGSVGElement {
    const doc = this.doc;
    const svg = svgElement(doc, 'svg', { viewBox: '0 0 24 16', width: 24, height: 16, 'aria-hidden': 'true', focusable: 'false' }, `aui-chart__swatch ${className ?? `aui-chart__series--c${String(slot)}`}`);
    if (style?.color !== undefined) applySeriesStyle(svg, { color: style.color });
    const shape = seriesMarker(style, MARKER_SHAPES[(shapeSlot - 1) % MARKER_SHAPES.length] ?? 'circle');
    if (kind === 'line') {
      const line = svgElement(doc, 'path', { d: 'M1 8H23' }, `aui-chart__swatch-line aui-chart__dash--${String(((shapeSlot - 1) % 4) + 1)}`);
      applySeriesDash(line, style);
      svg.append(line);
      if (shape) svg.append(svgElement(doc, 'path', { d: markerPath(shape, 12, 8, 4) }, 'aui-chart__swatch-marker'));
    } else {
      const box = { x: 4, y: 1, width: 16, height: 14 };
      const radius = cornerOf(this.corners, 'swatch', 2);
      svg.append(roundedBox(doc, box, radius, 'aui-chart__swatch-fill'));
      // Rendered always: CSS shows textures with the `patterns` option and in forced colors.
      const pattern = this.pattern(shapeSlot);
      if (pattern) svg.append(roundedBox(doc, box, radius, 'aui-chart__pattern', { fill: `url(#${pattern})` }));
    }
    return svg;
  }

  /** Data table fallback. `build` runs lazily (when the table is first shown or always-present). */
  setTable(mode: ChartTableMode, build: () => TableData): void {
    const modeChanged = mode !== this.#tableMode;
    this.#tableMode = mode;
    this.#table = build;
    this.#tableBuilt = false;
    if (modeChanged && mode !== 'toggle') this.#tableOpen = false;
    this.#renderTable();
  }

  #renderTable(): void {
    const doc = this.doc;
    const mode = this.#tableMode;
    const data = this.#data;
    data.classList.toggle('aui-chart__data--hidden', mode === 'hidden');
    data.hidden = mode === 'none';
    if (mode === 'none') {
      data.replaceChildren();
      this.#tableToggle = null;
      return;
    }
    const show = mode !== 'toggle' || this.#tableOpen;
    const hadFocus = this.#tableToggle !== null && this.doc.activeElement === this.#tableToggle;
    const children: HTMLElement[] = [];
    const scroll = doc.createElement('div');
    scroll.className = 'aui-chart__table-scroll';
    scroll.id = createId('aui-chart-table');
    if (mode === 'toggle') {
      const button = doc.createElement('button');
      button.type = 'button';
      button.className = 'aui-chart__table-toggle';
      button.textContent = chartMessage(show ? 'hideTable' : 'showTable', {}, this.#locale);
      button.setAttribute('aria-expanded', String(show));
      button.setAttribute('aria-controls', scroll.id);
      button.addEventListener('click', () => {
        this.#tableOpen = !this.#tableOpen;
        this.#renderTable();
      });
      this.#tableToggle = button;
      children.push(button);
    } else {
      this.#tableToggle = null;
    }
    scroll.hidden = !show;
    if (show && this.#table) {
      const table = this.#buildTable(this.#table());
      scroll.append(table);
      if (mode !== 'hidden') {
        // A focusable, labelled scroll region: keyboard users can scroll wide tables (WCAG 2.1.1).
        scroll.tabIndex = 0;
        scroll.setAttribute('role', 'region');
        if (table.caption) scroll.setAttribute('aria-labelledby', table.caption.id);
      }
      this.#tableBuilt = true;
    }
    children.push(scroll);
    data.replaceChildren(...children);
    if (hadFocus) this.#tableToggle?.focus();
  }

  get tableBuilt(): boolean {
    return this.#tableBuilt;
  }

  #buildTable(t: TableData): HTMLTableElement {
    const doc = this.doc;
    const table = doc.createElement('table');
    table.className = 'aui-chart__table';
    const caption = table.createCaption();
    caption.id = createId('aui-chart-caption');
    caption.textContent = t.caption;
    const head = table.createTHead().insertRow();
    t.columns.forEach((c, i) => {
      const th = doc.createElement('th');
      th.scope = 'col';
      th.textContent = c;
      if (t.numeric[i]) th.className = 'aui-chart__cell--numeric';
      head.append(th);
    });
    const body = table.createTBody();
    for (const row of t.rows) {
      const tr = body.insertRow();
      row.forEach((text, i) => {
        const cell = i === 0 ? doc.createElement('th') : doc.createElement('td');
        if (cell instanceof HTMLTableCellElement && i === 0) cell.scope = 'row';
        if (t.numeric[i]) cell.className = 'aui-chart__cell--numeric';
        cell.textContent = text;
        tr.append(cell);
      });
    }
    return table;
  }

  /** Move the roving focus to a registered mark element (key hooks that pick their own target). */
  focusMark(element: SVGElement | undefined): void {
    const mark = element ? this.#byElement.get(element) : undefined;
    if (mark) this.#activate(mark, true);
  }

  #markFor(target: EventTarget | null): FrameMark | null {
    return target instanceof Element ? (this.#byElement.get(target) ?? null) : null;
  }

  #activate(mark: FrameMark, focus: boolean): void {
    const element = this.#elementFor(mark);
    const previous = this.#activeElement;
    if (previous && previous !== element) {
      previous.removeAttribute('tabindex');
      previous.classList.remove('aui-chart__mark--active');
    }
    this.#activeKey = mark.key;
    this.#active = mark;
    this.#activeElement = element;
    element.setAttribute('tabindex', '0');
    element.classList.add('aui-chart__mark--active');
    if (focus) element.focus();
    // Hide the other proxy only after focus has moved off it.
    if (previous && previous !== element && this.#proxies.some((p) => p === previous)) previous.setAttribute('display', 'none');
    this.#dismissed = false;
    this.#showFor(mark);
    this.#moveCrosshair({ x: mark.x, y: mark.y });
    this.#broadcast(mark.column);
  }

  #showFor(mark: FrameMark): void {
    if (this.#dismissed) return;
    this.#showTooltip(this.#hooks.tooltip(mark), mark.x, mark.y, { column: mark.column, row: mark.row, source: 'focus' });
  }

  /** `aui-point-click` for a mark (pointer click, or Enter / Space on the focused mark). */
  #pointClick(mark: FrameMark, source: 'pointer' | 'keyboard'): void {
    const content = this.#hooks.tooltip(mark);
    const row = content.rows.find((r) => r.swatch !== 'none') ?? content.rows[0];
    const separator = mark.key.indexOf(KEY_SEPARATOR);
    const own = this.#hooks.pointDetail?.(mark) ?? null;
    const detail: ChartPointClickDetail = {
      seriesId: own ? own.seriesId : (row?.seriesId ?? (separator > 0 ? mark.key.slice(0, separator) : null)),
      column: mark.column,
      row: mark.row,
      label: content.title,
      series: own ? own.series : (row?.label ?? ''),
      value: own ? own.value : (row?.value ?? ''),
      source,
    };
    emit(this.host, 'aui-point-click', detail);
  }

  #onKeyDown(e: KeyboardEvent): void {
    const current = this.#markFor(e.target);
    if (!current) return;
    if (this.#hooks.key?.(e, current)) {
      e.preventDefault();
      return;
    }
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      this.#pointClick(current, 'keyboard');
      return;
    }
    const next = this.#navigate(current, e.key);
    if (next === undefined) return;
    e.preventDefault();
    if (next) {
      this.#activate(next, true);
      return;
    }
    const step = this.#edgeStep(current, e.key);
    const key = step === 0 ? null : (this.#hooks.beyond?.(current, step) ?? null);
    if (key === null) return;
    // The hook re-rendered (render() kept focus on the chart); move to the requested mark.
    const target = this.#marks.find((m) => m.key === key);
    if (target) this.#activate(target, true);
  }

  /** +1 / -1 when `key` moves along a row past its last / first mark, else 0. */
  #edgeStep(current: FrameMark, key: string): 1 | -1 | 0 {
    const row = this.#rows.get(current.row) ?? [];
    const at = row.indexOf(current);
    const vertical = this.#navigation === 'columns-vertical';
    const single = this.#rows.size <= 1;
    const forward = this.#rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = this.#rtl ? 'ArrowRight' : 'ArrowLeft';
    const along = vertical && !single ? ['ArrowDown', 'ArrowUp'] : single || vertical ? [forward, backward, 'ArrowDown', 'ArrowUp'] : [forward, backward];
    const next = key === along[0] || key === along[2];
    const previous = key === along[1] || key === along[3];
    if (next && at === row.length - 1) return 1;
    if (previous && at === 0) return -1;
    return 0;
  }

  /** Target mark for a key, `null` when the key is handled but there is nowhere to go, `undefined` when not handled. */
  #navigate(current: FrameMark, key: string): FrameMark | null | undefined {
    const rows = [...this.#rows.keys()].sort((a, b) => a - b);
    const row = this.#rows.get(current.row) ?? [];
    const at = row.indexOf(current);
    const vertical = this.#navigation === 'columns-vertical';
    const single = rows.length <= 1;
    let along: 'next' | 'previous' | 'first' | 'last' | 'page-next' | 'page-previous' | null = null;
    let across: 1 | -1 | 0 = 0;
    const forward = this.#rtl ? 'ArrowLeft' : 'ArrowRight';
    const backward = this.#rtl ? 'ArrowRight' : 'ArrowLeft';
    switch (key) {
      case 'Home': along = 'first'; break;
      case 'End': along = 'last'; break;
      case 'PageDown': along = 'page-next'; break;
      case 'PageUp': along = 'page-previous'; break;
      case forward: if (vertical && !single) across = 1; else along = 'next'; break;
      case backward: if (vertical && !single) across = -1; else along = 'previous'; break;
      case 'ArrowDown': if (vertical || single) along = 'next'; else across = 1; break;
      case 'ArrowUp': if (vertical || single) along = 'previous'; else across = -1; break;
      default: return undefined;
    }
    if (along) {
      const index = {
        next: at + 1,
        previous: at - 1,
        first: 0,
        last: row.length - 1,
        'page-next': Math.min(row.length - 1, at + 10),
        'page-previous': Math.max(0, at - 10),
      }[along];
      return row[index] ?? null;
    }
    const target = rows[rows.indexOf(current.row) + across];
    if (target === undefined) return null;
    const candidates = this.#rows.get(target) ?? [];
    let best: FrameMark | null = null;
    for (const m of candidates) if (!best || Math.abs(m.column - current.column) < Math.abs(best.column - current.column)) best = m;
    return best;
  }

  #onPointer(e: PointerEvent): void {
    if (!this.#tooltipEnabled) return;
    if (e.target instanceof Node && this.#tooltip.contains(e.target)) return;
    this.#hovering = true;
    this.#plotRect ??= this.svg.getBoundingClientRect();
    const px = e.clientX - this.#plotRect.left;
    const py = e.clientY - this.#plotRect.top;
    const hit = this.#hooks.hover(px, py);
    if (!hit) {
      this.#setHighlight([]);
      if (this.#active) this.#showFor(this.#active);
      else this.#hideTooltip();
      this.#broadcast(this.#active?.column ?? null);
      return;
    }
    const changed = hit.highlight.length !== this.#highlighted.length || hit.highlight.some((el, i) => el !== this.#highlighted[i]);
    if (changed) this.#dismissed = false;
    this.#setHighlight(hit.highlight);
    this.#moveCrosshair(hit.crosshair ?? { x: hit.x, y: hit.y });
    const column = this.#hitColumn(hit);
    // Placed next to the pointer (never under it), aligned with the hovered data horizontally.
    if (!this.#dismissed) this.#showTooltip(hit.content, px, Math.min(py, hit.y), { column, row: null, source: 'pointer' });
    this.#broadcast(column);
  }

  #hitColumn(hit: HoverResult): number | null {
    if (hit.column !== undefined) return hit.column;
    for (const el of hit.highlight) {
      const mark = this.#byElement.get(el);
      if (mark) return mark.column;
    }
    return null;
  }

  #setSyncGroup(name: string | null): void {
    if (name === this.#syncGroup) return;
    this.#leaveSyncGroup();
    this.#syncGroup = name;
    if (name === null) return;
    let group = syncGroups.get(name);
    if (!group) {
      group = new Set();
      syncGroups.set(name, group);
    }
    group.add(this);
  }

  #leaveSyncGroup(): void {
    const name = this.#syncGroup;
    if (name === null) return;
    const group = syncGroups.get(name);
    group?.delete(this);
    if (group?.size === 0) syncGroups.delete(name);
    this.#syncGroup = null;
  }

  /** Show (column) or clear (null) the crosshair and tooltip of the other charts in the sync group. */
  #broadcast(column: number | null): void {
    if (this.#syncing || this.#syncGroup === null || column === this.#broadcasted) return;
    this.#broadcasted = column;
    for (const peer of syncGroups.get(this.#syncGroup) ?? []) if (peer !== this) peer.#syncTo(column);
  }

  /** Follow a peer: highlight the column's marks, move the crosshair, show the column tooltip (focus stays). */
  #syncTo(column: number | null): void {
    if (this.#hovering || this.#active) return;
    this.#syncing = true;
    try {
      const marks = column === null ? [] : this.#marks.filter((m) => m.column === column).sort((a, b) => a.row - b.row);
      const first = marks[0];
      if (column === null || !first) {
        if (this.#synced) {
          this.#setHighlight([]);
          this.#hideTooltip();
          this.#moveCrosshair(null);
          this.#synced = false;
        }
        return;
      }
      const hit = this.#hooks.hover(first.x, first.y);
      const own = hit && this.#hitColumn(hit) === column ? hit : null;
      this.#setHighlight(own ? own.highlight : marks.flatMap((m) => (m.element ? [m.element] : [])));
      this.#moveCrosshair(own?.crosshair ?? { x: first.x, y: first.y });
      this.#showTooltip(own ? own.content : this.#hooks.tooltip(first), first.x, own ? own.y : first.y, { column, row: null, source: 'sync' });
      this.#synced = true;
    } finally {
      this.#syncing = false;
    }
  }

  /** Charts currently in the sync group `name` (tests). */
  static syncGroupSize(name: string): number {
    return syncGroups.get(name)?.size ?? 0;
  }

  #moveCrosshair(at: { readonly x: number; readonly y?: number } | null): void {
    const mode = this.#crosshairMode;
    if (mode === 'none' || at === null) {
      this.#crosshair?.setAttribute('display', 'none');
      return;
    }
    const p = this.#plot;
    if (!this.#crosshair) {
      this.#crosshair = svgElement(this.doc, 'g', { 'aria-hidden': 'true' }, 'aui-chart__crosshair');
      this.#crosshair.append(svgElement(this.doc, 'line', {}, 'aui-chart__crosshair-line'), svgElement(this.doc, 'line', {}, 'aui-chart__crosshair-line'));
      // First in the layer: drawn under the marks.
      this.layer.prepend(this.#crosshair);
    }
    const [vertical, horizontal] = [...this.#crosshair.children];
    const x = String(Math.round(Math.min(p.right, Math.max(p.left, at.x))) + 0.5);
    vertical?.setAttribute('x1', x);
    vertical?.setAttribute('x2', x);
    vertical?.setAttribute('y1', String(p.top));
    vertical?.setAttribute('y2', String(p.bottom));
    if (mode === 'xy' && at.y !== undefined) {
      const y = String(Math.round(Math.min(p.bottom, Math.max(p.top, at.y))) + 0.5);
      horizontal?.setAttribute('x1', String(p.left));
      horizontal?.setAttribute('x2', String(p.right));
      horizontal?.setAttribute('y1', y);
      horizontal?.setAttribute('y2', y);
      horizontal?.removeAttribute('display');
    } else {
      horizontal?.setAttribute('display', 'none');
    }
    this.#crosshair.removeAttribute('display');
  }

  #setHighlight(elements: readonly SVGElement[]): void {
    for (const el of this.#highlighted) el.classList.remove('aui-chart__mark--hover');
    for (const el of elements) el.classList.add('aui-chart__mark--hover');
    this.#highlighted = elements;
  }

  #showTooltip(content: TooltipContent, x: number, y: number, at: Pick<ChartTooltipContext, 'column' | 'row' | 'source'>): void {
    if (!this.#tooltipEnabled) return;
    const tip = this.#tooltip;
    // A custom renderer runs before the tooltip changes, so a renderer error leaves it as it was.
    const custom = this.#renderTooltip?.({
      title: content.title,
      rows: content.rows.map((r) => ({ label: r.label, value: r.value, seriesId: r.seriesId ?? null })),
      ...at,
    }) ?? null;
    if (custom !== null && !(custom instanceof Node)) throw new TypeError('renderTooltip must return a DOM Node or null.');
    if (custom) tip.replaceChildren(custom);
    else this.#defaultTooltip(content);
    tip.classList.toggle('aui-chart__tooltip--custom', custom !== null);
    tip.hidden = false;
    this.#placeTooltip(x, y);
  }

  #defaultTooltip(content: TooltipContent): void {
    const doc = this.doc;
    const tip = this.#tooltip;
    const title = doc.createElement('div');
    title.className = 'aui-chart__tooltip-title';
    title.textContent = content.title;
    const list = doc.createElement('div');
    list.className = 'aui-chart__tooltip-rows';
    for (const row of content.rows) {
      const line = doc.createElement('div');
      line.className = 'aui-chart__tooltip-row';
      const label = doc.createElement('span');
      label.className = 'aui-chart__tooltip-label';
      label.textContent = row.label;
      const value = doc.createElement('span');
      value.className = 'aui-chart__tooltip-value';
      value.textContent = row.value;
      if (row.swatch === 'none') {
        const spacer = doc.createElement('span');
        spacer.className = 'aui-chart__swatch';
        line.append(spacer);
      } else {
        line.append(this.swatch(row.slot, row.shapeSlot, row.swatch, row.swatchClass, row.seriesStyle));
      }
      line.append(label, value);
      list.append(line);
    }
    tip.replaceChildren(title, list);
  }

  #placeTooltip(x: number, y: number): void {
    const tip = this.#tooltip;
    const gap = 12;
    const w = tip.offsetWidth;
    const h = tip.offsetHeight;
    const maxX = Math.max(0, this.#width - w);
    let left = x + gap;
    if (left + w > this.#width) left = x - gap - w;
    left = Math.min(maxX, Math.max(0, left));
    let top = y - gap - h;
    if (top < 0) top = y + gap;
    tip.style.setProperty('translate', `${String(Math.round(left))}px ${String(Math.round(top))}px`);
  }

  #hideTooltip(): void {
    this.#tooltip.hidden = true;
    this.#tooltip.replaceChildren();
  }

  /** Tooltip state for tests and adapters. */
  get tooltipVisible(): boolean {
    return !this.#tooltip.hidden;
  }

  get tooltipElement(): HTMLDivElement {
    return this.#tooltip;
  }
}

export { SVG_NS };
