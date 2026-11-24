/**
 * Windowing engine (R20 P3): the offset math of a virtualized list, shared by Virtual List
 * and the components built on it (Tree View, Command Palette, Transfer List, File Manager).
 * Items have an estimated size until measured; offsets are prefix sums that are rebuilt
 * lazily from the first changed index, and lookups by offset are binary searches, so
 * 100,000+ items cost two typed arrays and O(log n) per scroll.
 */

/** A half-open index range `[start, end)`. */
export interface WindowRange {
  readonly start: number;
  readonly end: number;
}

export class Windowing {
  #count = 0;
  #estimate = 1;
  #sizes = new Float64Array(0);
  /** `#offsets[i]` is the start of item i; `#offsets[count]` is the total size. */
  #offsets = new Float64Array(1);
  /** Offsets from this index on are stale. */
  #dirty = 0;

  constructor(count: number, estimate: number) {
    this.reset(count, estimate);
  }

  get count(): number {
    return this.#count;
  }

  get estimate(): number {
    return this.#estimate;
  }

  /** Resize to `count` items; measured sizes of items that remain are kept unless `estimate` changed. */
  reset(count: number, estimate: number): void {
    const keep = estimate === this.#estimate ? Math.min(count, this.#count) : 0;
    const sizes = new Float64Array(count);
    if (keep > 0) sizes.set(this.#sizes.subarray(0, keep));
    sizes.fill(estimate, keep);
    this.#sizes = sizes;
    this.#offsets = new Float64Array(count + 1);
    this.#count = count;
    this.#estimate = estimate;
    this.#dirty = 0;
  }

  /** Forget every measurement. */
  clearMeasurements(): void {
    this.#sizes.fill(this.#estimate);
    this.#dirty = 0;
  }

  sizeOf(index: number): number {
    return this.#sizes[index] ?? this.#estimate;
  }

  /** Record a measured size. Returns the change (0 when unchanged or out of range). */
  setSize(index: number, size: number): number {
    if (index < 0 || index >= this.#count || !Number.isFinite(size) || size < 0) return 0;
    const delta = size - (this.#sizes[index] ?? 0);
    if (delta === 0) return 0;
    this.#sizes[index] = size;
    if (index < this.#dirty) this.#dirty = index;
    return delta;
  }

  #build(): void {
    if (this.#dirty > this.#count) return;
    const offsets = this.#offsets;
    const sizes = this.#sizes;
    let acc = offsets[this.#dirty] ?? 0;
    for (let i = this.#dirty; i < this.#count; i++) {
      offsets[i] = acc;
      acc += sizes[i] ?? 0;
    }
    offsets[this.#count] = acc;
    this.#dirty = this.#count + 1;
  }

  /** Start offset of an item (the total size for `index === count`). */
  offsetOf(index: number): number {
    this.#build();
    const i = Math.min(Math.max(index, 0), this.#count);
    return this.#offsets[i] ?? 0;
  }

  get total(): number {
    return this.offsetOf(this.#count);
  }

  /** The item at `offset` (clamped to the existing items), or -1 when there are none. */
  indexAt(offset: number): number {
    if (this.#count === 0) return -1;
    this.#build();
    const offsets = this.#offsets;
    let lo = 0;
    let hi = this.#count - 1;
    while (lo < hi) {
      const mid = (lo + hi + 1) >>> 1;
      if ((offsets[mid] ?? 0) <= offset) lo = mid;
      else hi = mid - 1;
    }
    return lo;
  }

  /** Items intersecting `[scroll, scroll + viewport)`, without overscan. */
  visible(scroll: number, viewport: number): WindowRange {
    if (this.#count === 0) return { start: 0, end: 0 };
    const start = this.indexAt(Math.max(0, scroll));
    let end = this.indexAt(Math.max(0, scroll + Math.max(viewport, 0) - 0.5)) + 1;
    if (end <= start) end = Math.min(this.#count, start + 1);
    return { start, end };
  }

  /** The visible items widened by `overscan` items on each side. */
  rendered(scroll: number, viewport: number, overscan: number): WindowRange {
    const { start, end } = this.visible(scroll, viewport);
    if (this.#count === 0) return { start: 0, end: 0 };
    return { start: Math.max(0, start - overscan), end: Math.min(this.#count, end + overscan) };
  }

  /**
   * The scroll position that shows `index`: `start` puts it at the top, `end` at the bottom,
   * `center` in the middle, and `auto` scrolls only as far as needed (or not at all).
   */
  scrollFor(index: number, scroll: number, viewport: number, align: 'auto' | 'start' | 'center' | 'end'): number {
    const top = this.offsetOf(index);
    const size = this.sizeOf(index);
    const max = Math.max(0, this.total - viewport);
    let target: number;
    if (align === 'start') target = top;
    else if (align === 'end') target = top + size - viewport;
    else if (align === 'center') target = top + size / 2 - viewport / 2;
    else if (top < scroll) target = top;
    else if (top + size > scroll + viewport) target = top + size - viewport;
    else target = scroll;
    return Math.min(max, Math.max(0, target));
  }
}
