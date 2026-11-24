/**
 * Shared controller for frame-based charts added in R3 (SPEC section 18.18): option
 * storage with validated, atomic `update()`, series visibility and the
 * `aui-series-toggle` event, the configuration subscription, and cleanup. Each
 * chart supplies validation, the model, and drawing. Internal: not a public subpath.
 *
 * Subclasses call `start()` at the end of their constructor, after their own fields
 * exist: validation and the model run before the host is touched (decision 11).
 */
import { DisposableGroup, emit, type Direction, type Disposer } from '@absoluteui/core';
import { ChartFrame, type FrameMark, type HoverResult, type Navigation, type TooltipContent } from './frame.js';
import { chartMessage, type ChartBaseConfig, type ChartCommonOptions } from './model.js';
import type { ChartPointClickDetail } from './style.js';

/** Detail of `aui-series-toggle`. */
export interface ChartSeriesToggleDetail {
  /** Toggled series (or item) id. */
  id: string;
  visible: boolean;
  /** All hidden ids after the change. */
  hidden: string[];
}

export interface ChartModelBase {
  readonly config: Readonly<ChartBaseConfig & { locale: string; direction: Direction }>;
  /** Empty-state message, or null when there is something to draw. */
  readonly empty: string | null;
}

export abstract class FrameChart<O extends ChartCommonOptions, M extends ChartModelBase> {
  readonly host: HTMLElement;
  protected options: O;
  protected hidden = new Set<string>();
  // Assigned in start(), before anything reads it.
  protected model!: M;
  protected readonly frame: ChartFrame;
  protected readonly group = new DisposableGroup();

  protected constructor(host: HTMLElement, options: O, block: string) {
    this.host = host;
    this.options = { ...options };
    this.frame = new ChartFrame(host, block, {
      render: (w, h) => {
        this.draw(w, h);
      },
      hover: (x, y) => this.hover(x, y),
      tooltip: (mark) => this.tooltip(mark),
      toggle: (id) => {
        this.toggle(id);
      },
      paint: (mark, element) => {
        this.paint?.(mark, element);
      },
      beyond: (mark, step) => this.beyond?.(mark, step) ?? null,
      key: (event, mark) => this.key?.(event, mark) ?? false,
      pointDetail: (mark) => this.pointDetail?.(mark) ?? null,
    });
  }

  /** Validate, build the model, mount, render, and follow configuration changes. */
  protected start(subscribe: (listener: () => void) => Disposer): void {
    this.assert(this.options);
    this.hidden = new Set(this.options.hiddenSeries ?? []);
    this.model = this.prepare();
    this.frame.mount();
    this.mounted();
    this.apply();
    this.group.add(subscribe(() => {
      this.model = this.prepare();
      this.apply();
    }));
  }

  /** Ids of hidden series (or items), in data order. */
  get hiddenSeries(): string[] {
    return this.seriesIds().filter((id) => this.hidden.has(id));
  }

  /** The generated (or custom) accessible summary. */
  get summary(): string {
    return this.frame.summary;
  }

  /** The SVG plot (role="group"). */
  get element(): SVGSVGElement {
    return this.frame.svg;
  }

  /** Merge and validate `options`, then re-render. Invalid options leave the chart unchanged. */
  update(options: Partial<O>): void {
    const next: O = { ...this.options, ...options };
    this.assert(next);
    const previous = this.options;
    const previousHidden = this.hidden;
    if (options.hiddenSeries !== undefined) this.hidden = new Set(options.hiddenSeries);
    this.options = next;
    try {
      this.model = this.prepare();
    } catch (e) {
      this.options = previous;
      this.hidden = previousHidden;
      throw e;
    }
    this.optionsChanged?.(options);
    this.apply();
  }

  /** Show or hide a series programmatically (no event). */
  setSeriesVisible(id: string, visible: boolean): void {
    if (visible) this.hidden.delete(id);
    else this.hidden.add(id);
    this.model = this.prepare();
    this.apply();
  }

  destroy(): void {
    this.group.dispose();
    this.frame.destroy();
    this.cleanup();
  }

  protected toggle(id: string): void {
    const visible = this.hidden.has(id);
    this.setSeriesVisible(id, visible);
    const detail: ChartSeriesToggleDetail = { id, visible, hidden: this.hiddenSeries };
    emit(this.host, 'aui-series-toggle', detail);
  }

  /**
   * Frame settings shared by every chart. `sync: false` for charts without a column concept
   * (Network Graph): `syncGroup` is accepted but has no effect.
   */
  protected configureFrame(roleKey: string, navigation: Navigation = 'columns-horizontal', sync = true): void {
    const { config } = this.model;
    this.frame.configure({
      height: config.height,
      rtl: config.direction === 'rtl',
      locale: config.locale,
      tooltip: config.tooltip,
      patterns: config.patterns,
      navigation,
      roleDescription: chartMessage(roleKey, {}, config.locale),
      theme: this.options.theme,
      renderTooltip: this.options.renderTooltip,
      syncGroup: sync ? this.options.syncGroup : undefined,
    });
  }

  protected message(key: string, params: Readonly<Record<string, string | number>> = {}): string {
    return chartMessage(key, params, this.model.config.locale);
  }

  protected abstract assert(options: O): void;
  protected abstract prepare(): M;
  /** Configure the frame (text, legend, table, empty state) and call `frame.render()`. */
  protected abstract apply(): void;
  protected abstract draw(width: number, height: number): void;
  protected abstract hover(x: number, y: number): HoverResult | null;
  protected abstract tooltip(mark: FrameMark): TooltipContent;
  protected abstract seriesIds(): readonly string[];

  /** Paint a virtual mark into a proxy element (charts with dense data). */
  protected paint?(mark: FrameMark, element: SVGPathElement): void;
  /** Arrow key past the first or last mark of a row: return the key to focus after re-rendering. */
  protected beyond?(mark: FrameMark, step: 1 | -1): string | null;
  /** Keys on a focused mark before arrow navigation; return true when handled. */
  protected key?(event: KeyboardEvent, mark: FrameMark): boolean;
  /** `aui-point-click` fields when the tooltip rows do not describe the mark. */
  protected pointDetail?(mark: FrameMark): Pick<ChartPointClickDetail, 'seriesId' | 'series' | 'value'> | null;
  /** After a successful `update()`, before re-rendering. */
  protected optionsChanged?(changed: Partial<O>): void;

  /** After mounting, before the first render (for example to set up zoom). */
  protected mounted(): void {
    // Optional.
  }

  /** Remove host classes added by the chart. */
  protected cleanup(): void {
    // Optional.
  }
}
