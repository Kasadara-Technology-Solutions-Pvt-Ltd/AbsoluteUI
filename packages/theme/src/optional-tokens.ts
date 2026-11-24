/**
 * Optional global tokens. Unlike role tokens they are not required for theme completeness
 * and have no default.
 * - Scrollbar appearance (SPEC section 10.1 "scrollbar appearance where standards allow"):
 *   while unset, the declarations that read them are invalid at computed-value time and the
 *   user agent's native appearance applies. Uses the standard CSS Scrollbars Styling
 *   properties `scrollbar-color` and `scrollbar-width`.
 * - Chart corner rounding: while unset, every chart element keeps its built-in
 *   rounding (square bars, 2 px heatmap cells, and so on), which differs per element, so these
 *   cannot be component tokens with one global fallback. Charts read them when they render.
 */
export type OptionalTokenKind = 'color' | 'keyword' | 'dimension';

export interface OptionalTokenSpec {
  readonly kind: OptionalTokenKind;
  readonly usage: string;
  /** Allowed values for keyword tokens. */
  readonly values?: readonly string[];
  /** Largest allowed px value for dimension tokens (the smallest is 0). */
  readonly max?: number;
}

const chartRadius = (usage: string, max = 50): OptionalTokenSpec => ({ kind: 'dimension', usage: `${usage} (px, 0 to ${String(max)}; unset keeps the built-in rounding)`, max });

export const optionalTokens: Readonly<Record<string, OptionalTokenSpec>> = {
  'scrollbar-thumb': { kind: 'color', usage: 'Scrollbar thumb (scrollbar-color); takes effect only with scrollbar-track' },
  'scrollbar-track': { kind: 'color', usage: 'Scrollbar track (scrollbar-color); takes effect only with scrollbar-thumb' },
  'scrollbar-width': { kind: 'keyword', usage: 'Scrollbar thickness (scrollbar-width)', values: ['auto', 'thin'] },
  'chart-corner-radius': chartRadius('Corner radius of every cornered chart element; the element radii below win over it'),
  'chart-bar-radius': chartRadius('Chart bars, columns, histogram bins, waterfall steps, volume bars (rounded at the value end)'),
  'chart-cell-radius': chartRadius('Heatmap and calendar heatmap cells, treemap tiles'),
  'chart-slice-radius': chartRadius('Pie and donut slices, gauge arcs, funnel stages'),
  'chart-box-radius': chartRadius('Box plot boxes, candlestick bodies, bullet ranges and measures'),
  'chart-node-radius': chartRadius('Org chart cards'),
  'chart-swatch-radius': chartRadius('Chart legend swatches', 8),
  'chart-line-join': { kind: 'keyword', usage: 'Joins of chart lines, areas, and radar outlines (stroke-linejoin; unset is round)', values: ['round', 'miter', 'bevel'] },
};

/** Optional tokens of the scrollbar appearance group. */
export const scrollbarTokenNames: readonly string[] = ['scrollbar-thumb', 'scrollbar-track', 'scrollbar-width'];

/** Optional chart tokens: corner radii and the line join. */
export const chartOptionalTokenNames: readonly string[] = ['chart-corner-radius', 'chart-bar-radius', 'chart-cell-radius', 'chart-slice-radius', 'chart-box-radius', 'chart-node-radius', 'chart-swatch-radius', 'chart-line-join'];

export const optionalTokenNames: readonly string[] = Object.keys(optionalTokens);

/** Why a value is not allowed for an optional token, or null when it is. */
export function optionalTokenProblem(name: string, value: string): string | null {
  const spec = optionalTokens[name];
  if (!spec) return 'unknown token';
  if (spec.values && !spec.values.includes(value)) return `one of ${spec.values.join(', ')}`;
  if (spec.kind === 'dimension') {
    const m = /^(\d+(?:\.\d+)?|\.\d+)(px)?$/.exec(value.trim());
    const px = m ? Number(m[1]) : Number.NaN;
    if (!m || (px !== 0 && m[2] !== 'px') || !(px >= 0 && px <= (spec.max ?? 50))) return `a px length from 0 to ${String(spec.max ?? 50)} (for example 4px)`;
  }
  return null;
}
