/**
 * Scheduler layout (pure): side-by-side columns for overlapping timed events in a
 * day, and stacked lanes for spanning bars (all-day row, month weeks, timeline rows).
 */

export interface Span {
  readonly key: string;
  /** Start and end in any unit; `end` is exclusive and greater than `start`. */
  readonly start: number;
  readonly end: number;
}

export interface ColumnPlacement {
  /** Zero-based column within the overlap cluster. */
  readonly column: number;
  /** Columns of the cluster (the event is 1/columns wide). */
  readonly columns: number;
  /** Columns the event may extend over to the end without overlapping (>= 1). */
  readonly extent: number;
}

/**
 * Overlap packing for one day column: events that overlap (transitively) form a
 * cluster sharing the width; each takes the first free column and extends into
 * free columns after it.
 */
export function packColumns(spans: readonly Span[]): Map<string, ColumnPlacement> {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - a.end || (a.key < b.key ? -1 : 1));
  const out = new Map<string, ColumnPlacement>();
  let cluster: { span: Span; column: number }[] = [];
  let columnsEnd: number[] = [];
  let clusterEnd = -Infinity;
  const flush = (): void => {
    const columns = columnsEnd.length;
    for (const { span, column } of cluster) {
      let extent = 1;
      // Extend over following columns that have nothing overlapping this span.
      for (let c = column + 1; c < columns; c++) {
        const blocked = cluster.some((o) => o.column === c && o.span.start < span.end && o.span.end > span.start);
        if (blocked) break;
        extent++;
      }
      out.set(span.key, { column, columns, extent });
    }
    cluster = [];
    columnsEnd = [];
  };
  for (const span of sorted) {
    if (span.start >= clusterEnd && cluster.length > 0) flush();
    let column = columnsEnd.findIndex((end) => end <= span.start);
    if (column === -1) {
      column = columnsEnd.length;
      columnsEnd.push(span.end);
    } else columnsEnd[column] = span.end;
    cluster.push({ span, column });
    clusterEnd = cluster.length === 1 ? span.end : Math.max(clusterEnd, span.end);
  }
  if (cluster.length > 0) flush();
  return out;
}

/** Greedy lane stacking: the lowest lane free at the span's start. Returns lanes and the lane count. */
export function packLanes(spans: readonly Span[]): { lanes: Map<string, number>; count: number } {
  const sorted = [...spans].sort((a, b) => a.start - b.start || b.end - b.start - (a.end - a.start) || (a.key < b.key ? -1 : 1));
  const ends: number[] = [];
  const lanes = new Map<string, number>();
  for (const span of sorted) {
    let lane = ends.findIndex((end) => end <= span.start);
    if (lane === -1) {
      lane = ends.length;
      ends.push(span.end);
    } else ends[lane] = span.end;
    lanes.set(span.key, lane);
  }
  return { lanes, count: ends.length };
}
