/**
 * Deterministic force-directed layout for Network Graph (R20 P11), written for this
 * library: velocity Verlet integration with link springs, pairwise repulsion, and a
 * centering force, cooled by an exponentially decaying alpha until it settles (then
 * it stops). Initial positions are a phyllotaxis spiral with a jitter from a seeded
 * PRNG, so the same input and seed always produce the same layout. Pinned nodes keep
 * their position. Internal.
 */

export interface LayoutInput {
  readonly count: number;
  /** Edges as node index pairs. */
  readonly edges: readonly (readonly [number, number])[];
  readonly distance: number;
  /** Repulsion strength (> 0). */
  readonly charge: number;
  readonly seed: number;
  /** Previous positions by node index (kept when the data changes), or undefined. */
  readonly initial?: ReadonlyMap<number, { readonly x: number; readonly y: number }>;
  /** Pinned positions by node index. */
  readonly pinned: ReadonlyMap<number, { readonly x: number; readonly y: number }>;
}

/** Mulberry32: a small, fast, seedable PRNG (deterministic layouts). */
export function seededRandom(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export class ForceLayout {
  readonly x: Float64Array;
  readonly y: Float64Array;
  readonly #vx: Float64Array;
  readonly #vy: Float64Array;
  readonly #input: LayoutInput;
  readonly #degree: Float64Array;
  readonly #ticks: number;
  #alpha = 1;
  #tick = 0;
  readonly #decay: number;
  readonly #random: () => number;

  constructor(input: LayoutInput) {
    const n = input.count;
    this.#input = input;
    this.x = new Float64Array(n);
    this.y = new Float64Array(n);
    this.#vx = new Float64Array(n);
    this.#vy = new Float64Array(n);
    this.#degree = new Float64Array(n);
    for (const [s, t] of input.edges) {
      this.#degree[s] = (this.#degree[s] ?? 0) + 1;
      this.#degree[t] = (this.#degree[t] ?? 0) + 1;
    }
    this.#random = seededRandom(input.seed);
    // Large graphs cool faster: pairwise repulsion is O(n^2) per tick.
    this.#ticks = n <= 300 ? 300 : Math.max(80, Math.round(90000 / n));
    this.#decay = 1 - 0.001 ** (1 / this.#ticks);
    const golden = Math.PI * (3 - Math.sqrt(5));
    const start = this.#random() * Math.PI * 2;
    for (let i = 0; i < n; i++) {
      const known = input.pinned.get(i) ?? input.initial?.get(i);
      if (known) {
        this.x[i] = known.x;
        this.y[i] = known.y;
        continue;
      }
      const r = input.distance * 0.4 * Math.sqrt(0.5 + i);
      const a = start + i * golden;
      this.x[i] = r * Math.cos(a) + (this.#random() - 0.5);
      this.y[i] = r * Math.sin(a) + (this.#random() - 0.5);
    }
    // A data update keeps the old layout: start cooler so it adjusts instead of exploding.
    if (input.initial && input.initial.size > 0) this.#alpha = 0.3;
  }

  get done(): boolean {
    return this.#alpha < 0.001 || this.#tick >= this.#ticks * 2;
  }

  /** Run up to `count` ticks; returns true when the layout has settled. */
  step(count: number): boolean {
    for (let k = 0; k < count && !this.done; k++) this.#step();
    return this.done;
  }

  /** Run to completion (synchronous). */
  settle(): void {
    while (!this.done) this.#step();
  }

  #step(): void {
    const { count: n, edges, distance, charge, pinned } = this.#input;
    const x = this.x;
    const y = this.y;
    const vx = this.#vx;
    const vy = this.#vy;
    const alpha = this.#alpha;
    // Link springs: pull connected nodes toward `distance`, weighted by degree.
    for (const [s, t] of edges) {
      let dx = (x[t] ?? 0) + (vx[t] ?? 0) - (x[s] ?? 0) - (vx[s] ?? 0);
      let dy = (y[t] ?? 0) + (vy[t] ?? 0) - (y[s] ?? 0) - (vy[s] ?? 0);
      if (dx === 0 && dy === 0) {
        dx = (this.#random() - 0.5) * 1e-6;
        dy = (this.#random() - 0.5) * 1e-6;
      }
      const l = Math.sqrt(dx * dx + dy * dy);
      const ds = this.#degree[s] ?? 1;
      const dt = this.#degree[t] ?? 1;
      const strength = 1 / Math.min(ds, dt);
      const f = ((l - distance) / l) * alpha * strength;
      const bias = ds / (ds + dt);
      vx[t] = (vx[t] ?? 0) - dx * f * bias;
      vy[t] = (vy[t] ?? 0) - dy * f * bias;
      vx[s] = (vx[s] ?? 0) + dx * f * (1 - bias);
      vy[s] = (vy[s] ?? 0) + dy * f * (1 - bias);
    }
    // Pairwise repulsion (inverse square), distances clamped to avoid singularities.
    const minDistance2 = 1;
    const maxDistance2 = (distance * 12) ** 2;
    for (let i = 0; i < n; i++) {
      const xi = x[i] ?? 0;
      const yi = y[i] ?? 0;
      for (let j = i + 1; j < n; j++) {
        let dx = (x[j] ?? 0) - xi;
        let dy = (y[j] ?? 0) - yi;
        let l2 = dx * dx + dy * dy;
        if (l2 > maxDistance2) continue;
        if (l2 === 0) {
          dx = (this.#random() - 0.5) * 1e-3;
          dy = (this.#random() - 0.5) * 1e-3;
          l2 = dx * dx + dy * dy;
        }
        const w = (charge * alpha) / Math.max(l2, minDistance2);
        vx[i] = (vx[i] ?? 0) - dx * w;
        vy[i] = (vy[i] ?? 0) - dy * w;
        vx[j] = (vx[j] ?? 0) + dx * w;
        vy[j] = (vy[j] ?? 0) + dy * w;
      }
    }
    // Integrate with velocity decay; pinned nodes stay put.
    let cx = 0;
    let cy = 0;
    let free = 0;
    for (let i = 0; i < n; i++) {
      const pin = pinned.get(i);
      if (pin) {
        x[i] = pin.x;
        y[i] = pin.y;
        vx[i] = 0;
        vy[i] = 0;
        continue;
      }
      // Weak gravity toward the origin keeps disconnected parts from drifting apart.
      vx[i] = ((vx[i] ?? 0) - (x[i] ?? 0) * 0.04 * alpha) * 0.6;
      vy[i] = ((vy[i] ?? 0) - (y[i] ?? 0) * 0.04 * alpha) * 0.6;
      x[i] = (x[i] ?? 0) + (vx[i] ?? 0);
      y[i] = (y[i] ?? 0) + (vy[i] ?? 0);
      cx += x[i] ?? 0;
      cy += y[i] ?? 0;
      free++;
    }
    // Centering: shift free nodes so their mean stays at the origin (only without pins).
    if (free > 0 && pinned.size === 0) {
      cx /= free;
      cy /= free;
      for (let i = 0; i < n; i++) {
        x[i] = (x[i] ?? 0) - cx;
        y[i] = (y[i] ?? 0) - cy;
      }
    }
    this.#alpha += (0 - this.#alpha) * this.#decay;
    this.#tick++;
  }
}
