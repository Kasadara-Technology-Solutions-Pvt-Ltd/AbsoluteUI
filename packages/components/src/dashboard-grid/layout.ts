/**
 * Dashboard layout engine (SPEC section 18.17): pure functions over grid items in
 * column/row units. Collision resolution pushes items down (never sideways),
 * vertical compaction floats items up, locked items never move. No DOM access.
 */

export interface DashboardItem {
  /** Unique id; matches the element's `data-aui-item` attribute. */
  id: string;
  /** Column (0-based, from the inline start). */
  x: number;
  /** Row (0-based). */
  y: number;
  /** Width in columns (>= 1). */
  w: number;
  /** Height in rows (>= 1). */
  h: number;
  minW?: number;
  minH?: number;
  maxW?: number;
  maxH?: number;
  /** Never moved or resized by the user or by other items. */
  locked?: boolean;
  /** Name for the move handle and announcements. Default: the item's first heading, else the id. */
  label?: string;
}

export type DashboardCompaction = 'vertical' | 'none';

export function collides(a: DashboardItem, b: DashboardItem): boolean {
  return a.id !== b.id && a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** Clamp an item's size to its limits and the column count, and its position into the grid. */
export function clampItem(item: DashboardItem, columns: number): DashboardItem {
  const maxW = Math.min(columns, item.maxW ?? columns);
  const w = Math.max(Math.min(item.minW ?? 1, maxW), Math.min(maxW, Math.round(item.w)));
  const h = Math.max(item.minH ?? 1, Math.min(item.maxH ?? Infinity, Math.round(item.h)));
  const x = Math.max(0, Math.min(columns - w, Math.round(item.x)));
  const y = Math.max(0, Math.round(item.y));
  return { ...item, x, y, w, h };
}

/** Items sorted in reading order (row, then column): the DOM and focus order. */
export function sortLayout<T extends Pick<DashboardItem, 'x' | 'y'>>(items: readonly T[]): T[] {
  return [...items].sort((a, b) => a.y - b.y || a.x - b.x);
}

/**
 * Float every item up as far as it goes without overlapping (reading order). Locked
 * items and the `anchored` ids (the item being moved) keep their positions.
 */
export function compactLayout(items: readonly DashboardItem[], anchored: ReadonlySet<string> = new Set()): DashboardItem[] {
  const fixed = (i: DashboardItem): boolean => i.locked === true || anchored.has(i.id);
  const placed: DashboardItem[] = items.filter(fixed);
  const out = new Map<string, DashboardItem>(placed.map((i) => [i.id, i]));
  for (const item of sortLayout(items.filter((i) => !fixed(i)))) {
    let next = { ...item, y: 0 };
    // Step down until free; worst case below everything placed.
    while (placed.some((p) => collides(next, p))) {
      const blocker = placed.filter((p) => collides(next, p)).reduce((lowest, p) => (p.y + p.h > lowest ? p.y + p.h : lowest), 0);
      next = { ...next, y: blocker };
    }
    placed.push(next);
    out.set(next.id, next);
  }
  return items.map((i) => out.get(i.id) ?? i);
}

/**
 * Put `moved` at its (clamped) position and push every item it overlaps down, cascading;
 * locked items stay and push the moved item below them instead. With vertical
 * compaction the other items then float up around the moved one, which stays where it
 * was put (so moving down past a neighbor swaps them); compact the whole layout once
 * the move is committed.
 */
export function resolveLayout(items: readonly DashboardItem[], moved: DashboardItem, columns: number, compaction: DashboardCompaction = 'vertical'): DashboardItem[] {
  let target = clampItem(moved, columns);
  const locked = items.filter((i) => i.locked && i.id !== target.id);
  // A locked item under the target: the target goes below it.
  while (locked.some((l) => collides(target, l))) {
    const blocker = locked.filter((l) => collides(target, l)).reduce((max, l) => Math.max(max, l.y + l.h), 0);
    target = { ...target, y: blocker };
  }
  const map = new Map<string, DashboardItem>(items.map((i) => [i.id, i]));
  map.set(target.id, target);
  const push = (fixed: DashboardItem, depth: number): void => {
    if (depth > items.length + 1) return;
    for (const other of sortLayout([...map.values()])) {
      if (other.id === fixed.id || other.locked || !collides(fixed, other)) continue;
      let pushed = { ...other, y: fixed.y + fixed.h };
      while (locked.some((l) => collides(pushed, l))) {
        const blocker = locked.filter((l) => collides(pushed, l)).reduce((max, l) => Math.max(max, l.y + l.h), 0);
        pushed = { ...pushed, y: blocker };
      }
      map.set(other.id, pushed);
      push(pushed, depth + 1);
    }
  };
  push(target, 0);
  const result = items.some((i) => i.id === target.id) ? items.map((i) => map.get(i.id) ?? i) : [...items.map((i) => map.get(i.id) ?? i), target];
  return compaction === 'none' ? result : compactLayout(result, new Set([target.id]));
}

/** First free position (reading order) for a w x h item. */
export function findFreeSpot(items: readonly DashboardItem[], w: number, h: number, columns: number): { x: number; y: number } {
  const width = Math.min(columns, Math.max(1, w));
  const bottom = items.reduce((max, i) => Math.max(max, i.y + i.h), 0);
  for (let y = 0; y <= bottom; y++) {
    for (let x = 0; x + width <= columns; x++) {
      const probe: DashboardItem = { id: '\u0000probe', x, y, w: width, h };
      if (!items.some((i) => collides(probe, i))) return { x, y };
    }
  }
  return { x: 0, y: bottom };
}

/**
 * Derive a layout for `columns` from one made for `fromColumns`: positions and widths
 * scale proportionally, a single column stacks items in reading order, then compact.
 */
export function adaptLayout(items: readonly DashboardItem[], fromColumns: number, columns: number): DashboardItem[] {
  if (fromColumns === columns) return items.map((i) => clampItem(i, columns));
  if (columns === 1) {
    let y = 0;
    const stacked = new Map<string, DashboardItem>();
    for (const item of sortLayout(items)) {
      stacked.set(item.id, { ...item, x: 0, y, w: 1 });
      y += item.h;
    }
    return items.map((i) => stacked.get(i.id) ?? i);
  }
  const ratio = columns / fromColumns;
  // Scale both edges (so neighbors stay adjacent), then place in reading order: each item
  // takes the first free row at its scaled column. Earlier items are never pushed.
  const placed: DashboardItem[] = [];
  for (const item of sortLayout(items)) {
    const start = Math.round(item.x * ratio);
    const end = Math.round((item.x + item.w) * ratio);
    let probe = clampItem({ ...item, x: start, w: Math.max(1, end - start), y: 0 }, columns);
    while (placed.some((p) => collides(probe, p))) {
      const below = placed.filter((p) => collides(probe, p)).reduce((max, p) => Math.max(max, p.y + p.h), 0);
      probe = { ...probe, y: below };
    }
    placed.push(probe);
  }
  const byId = new Map(compactLayout(placed).map((i) => [i.id, i]));
  return items.map((i) => byId.get(i.id) ?? i);
}

/** Total rows used by a layout. */
export function layoutRows(items: readonly DashboardItem[]): number {
  return items.reduce((max, i) => Math.max(max, i.y + i.h), 0);
}
