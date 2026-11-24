/**
 * Row heights with prefix sums (a Fenwick tree): the offset of a row and the row at an
 * offset in O(log n), a height change in O(log n), and a rebuild in O(n).
 */
export class RowHeights {
  #n = 0;
  #heights = new Float64Array(0);
  #tree = new Float64Array(1);
  #total = 0;
  /** Every row has this height (no arrays) until one row changes; 0 when heights vary. */
  #uniform = 0;

  /** Every row the same height: O(1) memory until a row's height changes. */
  resetUniform(count: number, height: number): void {
    this.#n = count;
    this.#uniform = height;
    this.#heights = new Float64Array(0);
    this.#tree = new Float64Array(1);
    this.#total = count * height;
  }

  /** Rebuild for `count` rows. */
  reset(count: number, height: (index: number) => number): void {
    this.#uniform = 0;
    this.#n = count;
    this.#heights = new Float64Array(count);
    this.#tree = new Float64Array(count + 1);
    let total = 0;
    for (let i = 0; i < count; i++) {
      const h = height(i);
      this.#heights[i] = h;
      this.#tree[i + 1] = h;
      total += h;
    }
    // Linear Fenwick construction: push each node's sum to its parent.
    for (let i = 1; i <= count; i++) {
      const parent = i + (i & -i);
      if (parent <= count) this.#tree[parent] = (this.#tree[parent] ?? 0) + (this.#tree[i] ?? 0);
    }
    this.#total = total;
  }

  get count(): number {
    return this.#n;
  }

  /** Sum of all heights. */
  get total(): number {
    return this.#total;
  }

  height(index: number): number {
    if (this.#uniform) return index >= 0 && index < this.#n ? this.#uniform : 0;
    return this.#heights[index] ?? 0;
  }

  /** Set one row's height; returns the change. */
  set(index: number, height: number): number {
    if (index < 0 || index >= this.#n) return 0;
    if (this.#uniform) {
      if (height === this.#uniform) return 0;
      const h = this.#uniform;
      this.reset(this.#n, () => h);
    }
    const delta = height - (this.#heights[index] ?? 0);
    if (delta === 0) return 0;
    this.#heights[index] = height;
    for (let i = index + 1; i <= this.#n; i += i & -i) this.#tree[i] = (this.#tree[i] ?? 0) + delta;
    this.#total += delta;
    return delta;
  }

  /** Top offset of row `index` (the sum of the heights before it). */
  offset(index: number): number {
    if (this.#uniform) return Math.min(Math.max(index, 0), this.#n) * this.#uniform;
    let sum = 0;
    for (let i = Math.min(Math.max(index, 0), this.#n); i > 0; i -= i & -i) sum += this.#tree[i] ?? 0;
    return sum;
  }

  /** The row that contains offset `y` (clamped to the rows). */
  indexAt(y: number): number {
    if (this.#n === 0) return 0;
    if (y <= 0) return 0;
    if (this.#uniform) return Math.min(Math.floor(y / this.#uniform), this.#n - 1);
    let pos = 0;
    let rest = y;
    let step = 1;
    while (step * 2 <= this.#n) step *= 2;
    for (; step > 0; step >>= 1) {
      const next = pos + step;
      const value = this.#tree[next] ?? 0;
      if (next <= this.#n && value <= rest) {
        pos = next;
        rest -= value;
      }
    }
    return Math.min(pos, this.#n - 1);
  }
}
