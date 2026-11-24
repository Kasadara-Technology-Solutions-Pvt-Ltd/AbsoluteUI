/**
 * Splitter (R20 P3). Two or more resizable panes side by side (`horizontal`) or stacked
 * (`vertical`), following the WAI-ARIA APG window splitter pattern: each separator is a
 * focusable `role="separator"` with `aria-valuenow` (the size of the pane before it, in
 * percent), `aria-valuemin`/`aria-valuemax`, arrow keys, Home/End, and Enter to collapse and
 * restore. Sizes are fractions of the space left after the separators, applied through a
 * CSS custom property (CSP-safe), so panes keep their proportions when the container
 * resizes. Min and max sizes take pixels or percentages; dragging a collapsible pane below
 * half its minimum collapses it. The component stores nothing: the application persists the
 * sizes it receives in `aui-change` and passes them back as `sizes`.
 */
import { configurationError, createId, defineComponentConfig, emit, getMessage, registerMessages, releaseNode, validators, DisposableGroup } from '@absoluteui/core';
import { observeResize, trackPointerDrag, type PointerDrag } from '@absoluteui/utilities';

export type SplitterOrientation = 'horizontal' | 'vertical';
/** A size in pixels (number or `'240px'`) or a percentage of the splitter (`'30%'`). */
export type SplitterLength = number | string;
export type SplitterChangeReason = 'drag' | 'keyboard' | 'collapse' | 'expand' | 'reset';

export interface SplitterConfig {
  /** Pixels a separator moves per arrow key press. */
  step: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    splitter: SplitterConfig & { locale: string };
  }
}

export const splitterConfig = defineComponentConfig<SplitterConfig, 'locale'>(
  'splitter',
  { step: { default: 16, expected: 'number of pixels from 1 to 500', validate: validators.numberInRange(1, 500) } },
  ['locale'],
);

registerMessages('splitter', 'en', {
  collapsed: '{label}, collapsed',
});

export interface SplitterPane {
  /** Pane content. */
  content: Node;
  /** Name of the pane; the separator after it is named after it (APG: the primary pane). */
  label: string;
  /** Initial size. Panes without a size share the remaining space equally. */
  size?: SplitterLength;
  /** Minimum size. Default 0. */
  min?: SplitterLength;
  /** Maximum size. Default none. */
  max?: SplitterLength;
  /** Enter on an adjacent separator, or dragging below half the minimum, collapses the pane. Default false. */
  collapsible?: boolean;
  /** Start collapsed (requires `collapsible`). */
  collapsed?: boolean;
}

export interface SplitterOptions extends Partial<SplitterConfig> {
  /** Two to ten panes. */
  panes: readonly SplitterPane[];
  /** `horizontal`: panes side by side with vertical separators (default); `vertical`: stacked panes. */
  orientation?: SplitterOrientation;
  /** Restored sizes in percent per pane (from a previous `aui-change`); overrides the panes' `size`. */
  sizes?: readonly number[] | null;
  locale?: string;
}

/** `aui-change` detail: every pane's size in percent, which panes are collapsed, and why. */
export interface SplitterChangeDetail {
  sizes: number[];
  collapsed: boolean[];
  /** Index of the separator (or pane, for collapse and expand) that changed. */
  index: number;
  reason: SplitterChangeReason;
}

const LENGTH = /^(\d+(?:\.\d+)?)(px|%)$/;
const EPSILON = 1e-6;

function isLength(v: unknown): v is SplitterLength {
  if (typeof v === 'number') return Number.isFinite(v) && v >= 0;
  return typeof v === 'string' && LENGTH.test(v.trim());
}

function toPx(v: SplitterLength | undefined, available: number, fallback: number): number {
  if (v === undefined) return fallback;
  if (typeof v === 'number') return v;
  const m = LENGTH.exec(v.trim());
  if (!m) return fallback;
  const n = Number(m[1]);
  return m[2] === '%' ? (n / 100) * available : n;
}

const round = (f: number): number => Math.round(f * 10000) / 100;

export class Splitter {
  readonly host: HTMLElement;
  #options: SplitterOptions;
  readonly #doc: Document;
  readonly #id = createId('aui-splitter');
  #panes: HTMLDivElement[] = [];
  #separators: HTMLDivElement[] = [];
  #drags: PointerDrag[] = [];
  #builtPanes: readonly SplitterPane[] | null = null;
  #fractions: number[] = [];
  #collapsed: boolean[] = [];
  #restore: number[] = [];
  #into: number[] = [];
  /** Sizes came from the user or `sizes`; the initial layout is no longer recomputed on resize. */
  #settled = false;
  #lastAvailable = 0;
  #paneGroup = new DisposableGroup();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced by the panes). */
  static create(host: HTMLElement, options: SplitterOptions): Splitter {
    return new Splitter(host, options);
  }

  private constructor(host: HTMLElement, options: SplitterOptions) {
    Splitter.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#build();
    this.#render();
    host.classList.add('aui-splitter');
    host.replaceChildren(...this.#children());
    // Measure once the host has its class and the separators are in place.
    this.#initSizes();
    this.#apply();
    this.#group.add(observeResize(host, () => {
      this.#onResize();
    }));
    this.#group.add(splitterConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<SplitterOptions> {
    return this.#options;
  }

  /** Every pane's size in percent of the space between separators. */
  get sizes(): number[] {
    return this.#fractions.map(round);
  }

  get collapsed(): boolean[] {
    return [...this.#collapsed];
  }

  /** The pane elements, in order. */
  get paneElements(): readonly HTMLElement[] {
    return this.#panes;
  }

  /** Collapse a collapsible pane (no event). */
  collapse(index: number): void {
    this.#collapse(index, this.#neighbor(index));
    this.#apply();
  }

  /** Restore a collapsed pane (no event). */
  expand(index: number): void {
    this.#expand(index);
    this.#apply();
  }

  /** Back to the initial sizes and collapsed states (no event). */
  reset(): void {
    // The panes' own sizes, not the restored ones: otherwise a persisted layout could never be reset.
    if (this.#options.sizes != null) this.#options = { ...this.#options, sizes: null };
    this.#settled = false;
    this.#initSizes(true);
    this.#apply();
  }

  update(options: Partial<SplitterOptions>): void {
    const next = { ...this.#options, ...options };
    Splitter.#assert(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
    const panesChanged = options.panes !== undefined && options.panes !== this.#builtPanes;
    if (panesChanged) {
      const sameCount = next.panes.length === this.#fractions.length;
      this.#build();
      this.host.replaceChildren(...this.#children());
      if (!sameCount) {
        this.#settled = false;
        this.#initSizes(true);
      }
      this.#render();
    }
    if (options.sizes != null) {
      this.#settled = true;
      this.#initSizes(true);
    }
    this.#apply();
  }

  destroy(): void {
    this.#group.dispose();
    this.#paneGroup.dispose();
    for (const d of this.#drags) d.dispose();
    this.host.replaceChildren();
    for (const p of this.#builtPanes ?? []) releaseNode(p.content);
    this.host.classList.remove('aui-splitter', 'aui-splitter--horizontal', 'aui-splitter--vertical', 'aui-splitter--dragging');
  }

  static #assert(o: SplitterOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SPLITTER_OPTIONS', 'Invalid splitter options.', { component: 'splitter', property: `splitter.${property}`, expected });
    };
    const panes: unknown = o.panes;
    if (!Array.isArray(panes) || panes.length < 2 || panes.length > 10) fail('panes', '2 to 10 panes');
    for (const p of o.panes) {
      const content: unknown = p.content;
      if (!(content instanceof Node)) fail('panes.content', 'Node');
      const label: unknown = p.label;
      if (typeof label !== 'string' || label.trim() === '') fail('panes.label', 'non-empty string');
      for (const name of ['size', 'min', 'max'] as const) if (p[name] !== undefined && !isLength(p[name])) fail(`panes.${name}`, "pixels (number or '240px') or a percentage ('30%')");
      if (p.collapsed === true && p.collapsible !== true) fail('panes.collapsed', 'collapsed only with collapsible: true');
    }
    const orientation: unknown = o.orientation;
    if (orientation !== undefined && orientation !== 'horizontal' && orientation !== 'vertical') fail('orientation', '"horizontal" | "vertical"');
    const sizes: unknown = o.sizes;
    if (sizes != null && (!Array.isArray(sizes) || sizes.length !== o.panes.length || !sizes.every((s) => typeof s === 'number' && Number.isFinite(s) && s >= 0) || !sizes.some((s) => typeof s === 'number' && s > 0))) fail('sizes', 'one non-negative percentage per pane (from aui-change)');
  }

  #horizontal(): boolean {
    return (this.#options.orientation ?? 'horizontal') === 'horizontal';
  }

  #children(): HTMLElement[] {
    const out: HTMLElement[] = [];
    for (const [i, pane] of this.#panes.entries()) {
      out.push(pane);
      const sep = this.#separators[i];
      if (sep) out.push(sep);
    }
    return out;
  }

  /** Create the pane and separator elements for the current panes. */
  #build(): void {
    const doc = this.#doc;
    const panes = this.#options.panes;
    // Render-slot contract: contents that are no longer shown are released.
    const kept = new Set(panes.map((p) => p.content));
    for (const p of this.#builtPanes ?? []) if (!kept.has(p.content)) releaseNode(p.content);
    this.#paneGroup.dispose();
    this.#paneGroup = new DisposableGroup();
    for (const d of this.#drags) d.dispose();
    this.#drags = [];
    this.#panes = panes.map((p, i) => {
      const el = doc.createElement('div');
      el.className = 'aui-splitter__pane';
      el.id = `${this.#id}-pane-${String(i)}`;
      el.append(p.content);
      return el;
    });
    this.#separators = panes.slice(0, -1).map((_, i) => {
      const sep = doc.createElement('div');
      sep.className = 'aui-splitter__separator';
      sep.setAttribute('role', 'separator');
      sep.tabIndex = 0;
      sep.setAttribute('aria-controls', `${this.#id}-pane-${String(i)}`);
      this.#paneGroup.listen(sep, 'keydown', (event) => {
        this.#onKey(i, event);
      });
      this.#paneGroup.listen(sep, 'dblclick', () => {
        this.reset();
        this.#emit(i, 'reset');
      });
      this.#drags.push(this.#trackDrag(sep, i));
      return sep;
    });
    this.#builtPanes = panes;
  }

  #trackDrag(sep: HTMLDivElement, index: number): PointerDrag {
    let start: { fractions: number[]; collapsed: boolean[]; restore: number[]; into: number[]; available: number } | null = null;
    return trackPointerDrag(sep, {
      threshold: 2,
      onStart: () => {
        start = { fractions: [...this.#fractions], collapsed: [...this.#collapsed], restore: [...this.#restore], into: [...this.#into], available: this.#available() };
        this.host.classList.add('aui-splitter--dragging');
        sep.focus({ preventScroll: true });
      },
      onMove: (move) => {
        if (!start) return;
        this.#fractions = [...start.fractions];
        this.#collapsed = [...start.collapsed];
        this.#restore = [...start.restore];
        this.#into = [...start.into];
        const rtl = this.#horizontal() && getComputedStyle(this.host).direction === 'rtl';
        const delta = this.#horizontal() ? (rtl ? -move.dx : move.dx) : move.dy;
        this.#move(index, delta, start.available);
        this.#apply();
      },
      onEnd: () => {
        start = null;
        this.host.classList.remove('aui-splitter--dragging');
        this.#settled = true;
        this.#emit(index, 'drag');
      },
      onCancel: () => {
        if (start) {
          this.#fractions = start.fractions;
          this.#collapsed = start.collapsed;
          this.#restore = start.restore;
          this.#into = start.into;
          this.#apply();
        }
        start = null;
        this.host.classList.remove('aui-splitter--dragging');
      },
    });
  }

  /** Space for panes along the axis (the host minus the separators). */
  #available(): number {
    const rect = this.host.getBoundingClientRect();
    const total = this.#horizontal() ? rect.width : rect.height;
    let separators = 0;
    for (const sep of this.#separators) {
      const r = sep.getBoundingClientRect();
      separators += this.#horizontal() ? r.width : r.height;
    }
    return Math.max(0, total - separators);
  }

  #minPx(i: number, available: number): number {
    return toPx(this.#options.panes[i]?.min, available, 0);
  }

  #maxPx(i: number, available: number): number {
    return toPx(this.#options.panes[i]?.max, available, Number.POSITIVE_INFINITY);
  }

  /** Fractions from `sizes` or the panes' initial sizes; `force` also resets collapsed states. */
  #initSizes(force = false): void {
    const panes = this.#options.panes;
    const n = panes.length;
    if (force || this.#collapsed.length !== n) {
      this.#collapsed = panes.map((p) => p.collapsed === true);
      this.#restore = new Array<number>(n).fill(0);
      this.#into = new Array<number>(n).fill(-1);
    }
    const sizes = this.#options.sizes;
    let fractions: number[];
    if (sizes != null) {
      const sum = sizes.reduce((a, b) => a + b, 0);
      fractions = sizes.map((s) => s / sum);
      this.#settled = true;
    } else {
      const measured = this.#available();
      const available = measured > 0 ? measured : 1000;
      const px = panes.map((p) => (p.size === undefined ? null : toPx(p.size, available, 0)));
      const fixed = px.reduce<number>((a, b) => a + (b ?? 0), 0);
      const free = px.filter((p) => p === null).length;
      const share = free > 0 ? Math.max(0, available - fixed) / free : 0;
      const raw = px.map((p) => p ?? share);
      const sum = raw.reduce((a, b) => a + b, 0) || 1;
      fractions = raw.map((r) => r / sum);
      if (measured > 0) this.#lastAvailable = measured;
    }
    this.#fractions = fractions;
    // Collapsed panes give their share to a neighbor and remember it.
    for (let i = 0; i < n; i++) {
      if (!this.#collapsed[i] || (this.#fractions[i] ?? 0) === 0) continue;
      this.#collapsed[i] = false;
      this.#collapse(i, this.#neighbor(i));
    }
    this.#clamp(this.#available());
  }

  /** The pane that receives a collapsed pane's space: the next expanded pane, else the previous. */
  #neighbor(index: number, preferred?: number): number {
    const n = this.#fractions.length;
    if (preferred !== undefined && preferred >= 0 && preferred < n && preferred !== index && !this.#collapsed[preferred]) return preferred;
    for (let i = index + 1; i < n; i++) if (!this.#collapsed[i]) return i;
    for (let i = index - 1; i >= 0; i--) if (!this.#collapsed[i]) return i;
    return -1;
  }

  #collapse(index: number, into: number): boolean {
    if (this.#options.panes[index]?.collapsible !== true || this.#collapsed[index] || into < 0) return false;
    const f = this.#fractions[index] ?? 0;
    this.#restore[index] = f;
    this.#into[index] = into;
    this.#fractions[into] = (this.#fractions[into] ?? 0) + f;
    this.#fractions[index] = 0;
    this.#collapsed[index] = true;
    return true;
  }

  #expand(index: number): boolean {
    if (!this.#collapsed[index]) return false;
    const into = this.#neighbor(index, this.#into[index]);
    this.#collapsed[index] = false;
    if (into < 0) {
      this.#fractions[index] = 1;
      return true;
    }
    const available = this.#available() || 1000;
    const minInto = this.#minPx(into, available) / available;
    const minSelf = this.#minPx(index, available) / available;
    const restore = this.#restore[index] ?? 0;
    const want = Math.max(restore > 0 ? restore : 1 / this.#fractions.length, minSelf);
    const take = Math.max(0, Math.min(want, (this.#fractions[into] ?? 0) - minInto));
    this.#fractions[index] = take;
    this.#fractions[into] = (this.#fractions[into] ?? 0) - take;
    return true;
  }

  /** A collapsed pane next to separator a|b comes back at size 0, so the separator can pull it open. */
  #openPair(a: number, b: number): void {
    for (const i of [a, b]) {
      if (!this.#collapsed[i]) continue;
      const other = i === a ? b : a;
      const into = this.#into[i] ?? -1;
      if (into >= 0 && into !== other) {
        // Its space went elsewhere: take it back from there first.
        const give = Math.min(this.#restore[i] ?? 0, this.#fractions[into] ?? 0);
        this.#fractions[into] = (this.#fractions[into] ?? 0) - give;
        this.#fractions[other] = (this.#fractions[other] ?? 0) + give;
      }
      this.#collapsed[i] = false;
      this.#fractions[i] = 0;
    }
  }

  /** Move separator `index` by `delta` px (positive grows the pane before it). */
  #move(index: number, delta: number, available: number): void {
    if (available <= 0) return;
    const a = index;
    const b = index + 1;
    const panes = this.#options.panes;
    this.#openPair(a, b);
    const sizeA = (this.#fractions[a] ?? 0) * available;
    const sizeB = (this.#fractions[b] ?? 0) * available;
    const total = sizeA + sizeB;
    const minA = this.#minPx(a, available);
    const minB = this.#minPx(b, available);
    const lo = Math.max(minA, total - this.#maxPx(b, available));
    const hi = Math.min(this.#maxPx(a, available), total - minB);
    let next = sizeA + delta;
    let collapse: number | null = null;
    if (panes[a]?.collapsible === true && next < minA / 2 && total - this.#maxPx(b, available) <= 0) collapse = a;
    else if (panes[b]?.collapsible === true && total - next < minB / 2 && this.#maxPx(a, available) >= total) collapse = b;
    if (collapse === null) next = Math.min(Math.max(next, Math.min(lo, hi)), Math.max(lo, hi));
    this.#fractions[a] = next / available;
    this.#fractions[b] = (total - next) / available;
    if (collapse !== null) {
      const other = collapse === a ? b : a;
      this.#fractions[other] = total / available;
      this.#fractions[collapse] = 0;
      this.#collapsed[collapse] = true;
      this.#into[collapse] = other;
      const prior = collapse === a ? sizeA : sizeB;
      this.#restore[collapse] = Math.max(prior, this.#minPx(collapse, available)) / available;
    }
  }

  /** Keep every expanded pane within its min and max after the container resized. */
  #clamp(available: number): void {
    if (available <= 0) return;
    const n = this.#fractions.length;
    for (let pass = 0; pass < 2; pass++) {
      for (let i = 0; i < n; i++) {
        if (this.#collapsed[i]) continue;
        const size = (this.#fractions[i] ?? 0) * available;
        const target = Math.min(Math.max(size, this.#minPx(i, available)), this.#maxPx(i, available));
        let diff = (target - size) / available;
        if (Math.abs(diff) < EPSILON) continue;
        // Take from (or give to) the other expanded panes, nearest first.
        const order = [...Array(n).keys()].filter((j) => j !== i && !this.#collapsed[j]).sort((x, y) => Math.abs(x - i) - Math.abs(y - i));
        for (const j of order) {
          if (Math.abs(diff) < EPSILON) break;
          const fj = this.#fractions[j] ?? 0;
          const minJ = this.#minPx(j, available) / available;
          const maxJ = this.#maxPx(j, available) / available;
          const room = diff > 0 ? Math.max(0, fj - minJ) : Math.max(0, maxJ - fj);
          const amount = Math.min(Math.abs(diff), room);
          this.#fractions[j] = fj + (diff > 0 ? -amount : amount);
          this.#fractions[i] = (this.#fractions[i] ?? 0) + (diff > 0 ? amount : -amount);
          diff += diff > 0 ? -amount : amount;
        }
      }
    }
  }

  #onResize(): void {
    const available = this.#available();
    if (available <= 0 || Math.abs(available - this.#lastAvailable) < 0.5) return;
    this.#lastAvailable = available;
    if (!this.#settled) this.#initSizes();
    else this.#clamp(available);
    this.#apply();
  }

  #onKey(index: number, event: KeyboardEvent): void {
    const horizontal = this.#horizontal();
    const rtl = horizontal && getComputedStyle(this.host).direction === 'rtl';
    const { step } = this.#config();
    const available = this.#available();
    let delta: number | null = null;
    switch (event.key) {
      case 'ArrowLeft':
        if (horizontal) delta = rtl ? step : -step;
        break;
      case 'ArrowRight':
        if (horizontal) delta = rtl ? -step : step;
        break;
      case 'ArrowUp':
        if (!horizontal) delta = -step;
        break;
      case 'ArrowDown':
        if (!horizontal) delta = step;
        break;
      case 'Home':
        delta = Number.NEGATIVE_INFINITY;
        break;
      case 'End':
        delta = Number.POSITIVE_INFINITY;
        break;
      case 'Enter': {
        event.preventDefault();
        this.#toggle(index);
        return;
      }
      default:
        return;
    }
    if (delta === null) return;
    event.preventDefault();
    if (available <= 0) return;
    const before = this.#fractions.join(',');
    if (!Number.isFinite(delta)) {
      // Home and End go to the limits without collapsing.
      this.#openPair(index, index + 1);
      const size = (this.#fractions[index] ?? 0) * available;
      const total = size + (this.#fractions[index + 1] ?? 0) * available;
      const lo = Math.max(this.#minPx(index, available), total - this.#maxPx(index + 1, available));
      const hi = Math.min(this.#maxPx(index, available), total - this.#minPx(index + 1, available));
      this.#moveClamped(index, (delta < 0 ? Math.min(lo, hi) : Math.max(lo, hi)) - size, available);
    } else {
      this.#move(index, delta, available);
    }
    this.#apply();
    if (this.#fractions.join(',') !== before) {
      this.#settled = true;
      this.#emit(index, 'keyboard');
    }
  }

  /** Move without collapse snapping (Home/End). */
  #moveClamped(index: number, delta: number, available: number): void {
    const size = (this.#fractions[index] ?? 0) * available;
    const total = size + (this.#fractions[index + 1] ?? 0) * available;
    const next = Math.min(Math.max(size + delta, 0), total);
    this.#fractions[index] = next / available;
    this.#fractions[index + 1] = (total - next) / available;
  }

  /** Enter: collapse or restore the pane before the separator, else the one after it. */
  #toggle(index: number): void {
    const panes = this.#options.panes;
    for (const i of [index, index + 1]) {
      if (panes[i]?.collapsible !== true) continue;
      if (this.#collapsed[i]) {
        this.#expand(i);
        this.#apply();
        this.#settled = true;
        this.#emit(i, 'expand');
        return;
      }
    }
    for (const i of [index, index + 1]) {
      if (panes[i]?.collapsible !== true) continue;
      if (this.#collapse(i, i === index ? this.#neighbor(i, index + 1) : this.#neighbor(i, index))) {
        this.#apply();
        this.#settled = true;
        this.#emit(i, 'collapse');
        return;
      }
    }
  }

  #emit(index: number, reason: SplitterChangeReason): void {
    emit(this.host, 'aui-change', { sizes: this.sizes, collapsed: this.collapsed, index, reason } satisfies SplitterChangeDetail);
  }

  #config(): Readonly<SplitterConfig & { locale: string }> {
    const o = this.#options;
    return splitterConfig.resolve({
      ...(o.step === undefined ? {} : { step: o.step }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  /** Orientation classes and separator names (everything that can throw runs first). */
  #render(): void {
    const { locale } = this.#config();
    const collapsedText = this.#options.panes.map((p) => getMessage('splitter', 'collapsed', { label: p.label }, locale));
    const horizontal = this.#horizontal();
    this.host.classList.toggle('aui-splitter--horizontal', horizontal);
    this.host.classList.toggle('aui-splitter--vertical', !horizontal);
    for (const [i, sep] of this.#separators.entries()) {
      // A horizontal splitter (panes side by side) has vertical separators.
      sep.setAttribute('aria-orientation', horizontal ? 'vertical' : 'horizontal');
      sep.setAttribute('aria-label', this.#options.panes[i]?.label ?? '');
      sep.dataset.collapsedText = collapsedText[i] ?? '';
    }
  }

  /** Apply fractions to the panes and the ARIA values to the separators. */
  #apply(): void {
    const available = this.#available() || 1000;
    for (const [i, pane] of this.#panes.entries()) {
      const f = this.#fractions[i] ?? 0;
      pane.style.setProperty('--_aui-splitter-grow', String(Math.max(0, f)));
      const collapsed = this.#collapsed[i] === true;
      pane.hidden = collapsed;
      pane.classList.toggle('aui-splitter__pane--collapsed', collapsed);
    }
    for (const [i, sep] of this.#separators.entries()) {
      const f = this.#fractions[i] ?? 0;
      const pair = f + (this.#fractions[i + 1] ?? 0);
      const collapsible = this.#options.panes[i]?.collapsible === true;
      const min = collapsible ? 0 : this.#minPx(i, available) / available;
      const max = Math.min(this.#maxPx(i, available) / available, pair - (this.#options.panes[i + 1]?.collapsible === true ? 0 : this.#minPx(i + 1, available) / available));
      sep.setAttribute('aria-valuenow', String(Math.round(f * 100)));
      sep.setAttribute('aria-valuemin', String(Math.round(Math.min(min, f) * 100)));
      sep.setAttribute('aria-valuemax', String(Math.round(Math.max(max, f) * 100)));
      if (this.#collapsed[i]) sep.setAttribute('aria-valuetext', sep.dataset.collapsedText ?? '');
      else sep.removeAttribute('aria-valuetext');
      sep.classList.toggle('aui-splitter__separator--collapsed', this.#collapsed[i] === true || this.#collapsed[i + 1] === true);
    }
  }
}
