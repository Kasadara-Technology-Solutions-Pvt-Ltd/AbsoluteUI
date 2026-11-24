/**
 * Skeleton (SPEC section 18.x, R1 status component). Decorative loading
 * placeholders (text lines, rectangles, circles), hidden from assistive
 * technology. The loading state itself is communicated by `Skeleton.markBusy`
 * (aria-busy on the region) plus a visually hidden status such as a Spinner.
 * Sizes are strictly validated CSS lengths written through the CSSOM (CSP-safe).
 */
import { configurationError, defineComponentConfig, DisposableGroup, validators } from '@absoluteui/core';

export type SkeletonShape = 'text' | 'rect' | 'circle';
export type SkeletonAnimation = 'pulse' | 'none';

export interface SkeletonConfig {
  /** `pulse` shimmer, or `none`. Reduced motion always disables it (CSS). */
  animation: SkeletonAnimation;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    skeleton: SkeletonConfig;
  }
}

export const skeletonConfig = defineComponentConfig<SkeletonConfig>('skeleton', {
  animation: { default: 'pulse', expected: '"pulse" | "none"', validate: validators.oneOf(['pulse', 'none'] as const) },
});

export interface SkeletonOptions extends Partial<SkeletonConfig> {
  /** Default `text`. */
  shape?: SkeletonShape;
  /** Number of text lines (shape `text`), 1..100. Default 3; the last of several lines is 60% wide. */
  lines?: number;
  /** CSS length: a number followed by px, rem, em, % or ch (e.g. `12rem`). `null` restores the default. */
  width?: string | null;
  /** CSS length: a number followed by px, rem, em, % or ch. `null` restores the default. */
  height?: string | null;
}

const SHAPES: readonly SkeletonShape[] = ['text', 'rect', 'circle'];
const ANIMATIONS: readonly SkeletonAnimation[] = ['pulse', 'none'];
/** Strict allowlist: no functions, keywords, or separators can reach the CSSOM. */
const LENGTH = /^\d+(\.\d+)?(px|rem|em|%|ch)$/;

function fail(property: string, expected: string): never {
  throw configurationError('SKELETON_OPTIONS', 'Invalid skeleton options.', { component: 'skeleton', property: `skeleton.${property}`, expected });
}

export class Skeleton {
  readonly host: HTMLElement;
  #options: SkeletonOptions;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();

  /** Render placeholders into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: SkeletonOptions = {}): Skeleton {
    return new Skeleton(host, options);
  }

  /**
   * Mark the region being loaded as busy (aria-busy="true") or done. The region
   * should also contain a visually hidden status (e.g. a Spinner) so the loading
   * state is announced; skeletons themselves are hidden from assistive technology.
   */
  static markBusy(container: HTMLElement, busy: boolean): void {
    if (busy) container.setAttribute('aria-busy', 'true');
    else container.removeAttribute('aria-busy');
  }

  private constructor(host: HTMLElement, options: SkeletonOptions) {
    Skeleton.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    // Resolve config first: invalid config throws before the host is touched.
    this.#config();
    this.#render();
    this.#group.add(skeletonConfig.subscribe(() => {
      this.#render();
    }));
  }

  update(options: Partial<SkeletonOptions>): void {
    const next = { ...this.#options, ...options };
    Skeleton.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    const host = this.host;
    host.replaceChildren();
    host.removeAttribute('aria-hidden');
    host.style.removeProperty('--aui-skeleton-width');
    host.style.removeProperty('--aui-skeleton-height');
    host.classList.remove('aui-skeleton', ...SHAPES.map((s) => `aui-skeleton--${s}`), ...ANIMATIONS.map((a) => `aui-skeleton--${a}`));
  }

  static #assert(o: SkeletonOptions): void {
    if (o.shape !== undefined && !SHAPES.includes(o.shape)) fail('shape', '"text" | "rect" | "circle"');
    if (o.lines !== undefined && !validators.integerInRange(1, 100)(o.lines)) fail('lines', 'integer 1..100');
    if (o.width !== undefined && o.width !== null && !(typeof o.width === 'string' && LENGTH.test(o.width))) fail('width', 'CSS length matching /^\\d+(\\.\\d+)?(px|rem|em|%|ch)$/');
    if (o.height !== undefined && o.height !== null && !(typeof o.height === 'string' && LENGTH.test(o.height))) fail('height', 'CSS length matching /^\\d+(\\.\\d+)?(px|rem|em|%|ch)$/');
  }

  #config(): Readonly<SkeletonConfig> {
    const o = this.#options;
    return skeletonConfig.resolve(o.animation === undefined ? {} : { animation: o.animation });
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const host = this.host;
    const shape = o.shape ?? 'text';
    host.classList.add('aui-skeleton');
    for (const s of SHAPES) host.classList.toggle(`aui-skeleton--${s}`, s === shape);
    for (const a of ANIMATIONS) host.classList.toggle(`aui-skeleton--${a}`, a === config.animation);
    host.setAttribute('aria-hidden', 'true');
    if (o.width == null) host.style.removeProperty('--aui-skeleton-width');
    else host.style.setProperty('--aui-skeleton-width', o.width);
    if (o.height == null) host.style.removeProperty('--aui-skeleton-height');
    else host.style.setProperty('--aui-skeleton-height', o.height);

    if (shape === 'text') {
      const count = o.lines ?? 3;
      const lines: HTMLSpanElement[] = [];
      for (let i = 0; i < count; i++) {
        const line = this.#doc.createElement('span');
        line.className = count > 1 && i === count - 1 ? 'aui-skeleton__line aui-skeleton__line--last' : 'aui-skeleton__line';
        lines.push(line);
      }
      host.replaceChildren(...lines);
    } else {
      const block = this.#doc.createElement('span');
      block.className = 'aui-skeleton__block';
      host.replaceChildren(block);
    }
  }
}
