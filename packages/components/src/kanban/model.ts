/**
 * Kanban board model (pure, DOM-free). Card order is the order of the `cards`
 * array: the cards of one cell (column and swimlane) appear in array order.
 * Positions are indexes within a cell.
 */
import { configurationError, validators } from '@absoluteui/core';

export interface KanbanColumn {
  /** Unique id. */
  id: string;
  /** Column name (heading text). */
  label: string;
  /** Work-in-progress limit: maximum cards in the column across all swimlanes. */
  wipLimit?: number;
  /** Rendered as a narrow strip with its name and count. */
  collapsed?: boolean;
  /** Cards cannot be moved into or out of the column. */
  locked?: boolean;
}

export interface KanbanLane {
  /** Unique id. */
  id: string;
  /** Swimlane name (heading text). */
  label: string;
  collapsed?: boolean;
}

/** Palette slot 1..8 (`color-chart-1` ... `color-chart-8`). */
export type KanbanCardColor = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;

export interface KanbanCard {
  /** Unique id. */
  id: string;
  columnId: string;
  /** Swimlane id; required when the board has swimlanes, ignored otherwise. */
  laneId?: string;
  /** Title (first line and the start of the card's accessible text). */
  title: string;
  description?: string;
  /** Short text labels shown as chips. */
  tags?: readonly string[];
  /** Palette slot of the accent stripe (never the only cue: pair it with tags or text). */
  color?: KanbanCardColor;
  /** The card cannot be moved. */
  locked?: boolean;
}

export interface KanbanPosition {
  columnId: string;
  /** Swimlane id, or null on a board without swimlanes. */
  laneId: string | null;
  /** Zero-based index within the cell. */
  index: number;
}

export type KanbanTarget = Omit<KanbanPosition, 'index'> & { index?: number };

function fail(property: string, expected: string): never {
  throw configurationError('KANBAN_OPTIONS', 'Invalid kanban options.', { component: 'kanban', property: `kanban.${property}`, expected });
}

function assertIds(list: unknown, at: string): Set<string> {
  if (!Array.isArray(list)) fail(at, 'array');
  const ids = new Set<string>();
  (list as unknown[]).forEach((item, i) => {
    const p = `${at}[${String(i)}]`;
    if (!validators.isRecord(item)) fail(p, 'object');
    if (typeof item.id !== 'string' || item.id === '' || ids.has(item.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(item.id);
    if (typeof item.label !== 'string' || item.label.trim() === '') fail(`${p}.label`, 'non-empty string');
    if (item.collapsed !== undefined && typeof item.collapsed !== 'boolean') fail(`${p}.collapsed`, 'boolean');
  });
  return ids;
}

/** Validate columns, swimlanes, and cards. Throws `KANBAN_OPTIONS`. */
export function assertBoard(columns: unknown, lanes: unknown, cards: unknown): void {
  const columnIds = assertIds(columns, 'columns');
  if (columnIds.size === 0) fail('columns', 'at least one column');
  (columns as Record<string, unknown>[]).forEach((c, i) => {
    const w = c.wipLimit;
    if (w !== undefined && !(Number.isInteger(w) && (w as number) >= 1 && (w as number) <= 10_000)) fail(`columns[${String(i)}].wipLimit`, 'integer from 1 to 10000');
    if (c.locked !== undefined && typeof c.locked !== 'boolean') fail(`columns[${String(i)}].locked`, 'boolean');
  });
  const laneIds = lanes === undefined ? null : assertIds(lanes, 'lanes');
  if (laneIds?.size === 0) fail('lanes', 'at least one swimlane, or undefined');
  if (!Array.isArray(cards)) fail('cards', 'KanbanCard[]');
  const ids = new Set<string>();
  (cards as unknown[]).forEach((card, i) => {
    const p = `cards[${String(i)}]`;
    if (!validators.isRecord(card)) fail(p, 'KanbanCard');
    if (typeof card.id !== 'string' || card.id === '' || ids.has(card.id)) fail(`${p}.id`, 'unique non-empty string');
    ids.add(card.id);
    if (typeof card.columnId !== 'string' || !columnIds.has(card.columnId)) fail(`${p}.columnId`, 'the id of a column');
    if (laneIds && (typeof card.laneId !== 'string' || !laneIds.has(card.laneId))) fail(`${p}.laneId`, 'the id of a swimlane');
    if (!laneIds && card.laneId !== undefined && typeof card.laneId !== 'string') fail(`${p}.laneId`, 'string');
    if (typeof card.title !== 'string' || card.title.trim() === '') fail(`${p}.title`, 'non-empty string');
    if (card.description !== undefined && typeof card.description !== 'string') fail(`${p}.description`, 'string');
    const tags = card.tags;
    if (tags !== undefined && !(Array.isArray(tags) && tags.every((t) => typeof t === 'string' && t.trim() !== ''))) fail(`${p}.tags`, 'non-empty strings');
    if (card.color !== undefined && !(Number.isInteger(card.color) && (card.color as number) >= 1 && (card.color as number) <= 8)) fail(`${p}.color`, 'integer from 1 to 8');
    if (card.locked !== undefined && typeof card.locked !== 'boolean') fail(`${p}.locked`, 'boolean');
  });
}

export function copyCard(c: Readonly<KanbanCard>): KanbanCard {
  const out: KanbanCard = { id: c.id, columnId: c.columnId, title: c.title };
  if (c.laneId !== undefined) out.laneId = c.laneId;
  if (c.description !== undefined) out.description = c.description;
  if (c.tags !== undefined) out.tags = Object.freeze([...c.tags]);
  if (c.color !== undefined) out.color = c.color;
  if (c.locked !== undefined) out.locked = c.locked;
  return out;
}

const inCell = (card: Readonly<KanbanCard>, columnId: string, laneId: string | null): boolean => card.columnId === columnId && (laneId === null || card.laneId === laneId);

/** Cards of one cell in display order. `laneId` null means "any swimlane" (boards without swimlanes). */
export function cellCards<T extends Readonly<KanbanCard>>(cards: readonly T[], columnId: string, laneId: string | null): T[] {
  return cards.filter((c) => inCell(c, columnId, laneId));
}

/** Where a card is. `lanes` false: positions ignore swimlanes. */
export function positionOf(cards: readonly Readonly<KanbanCard>[], id: string, lanes: boolean): KanbanPosition | null {
  const card = cards.find((c) => c.id === id);
  if (!card) return null;
  const laneId = lanes ? (card.laneId ?? null) : null;
  return { columnId: card.columnId, laneId, index: cellCards(cards, card.columnId, laneId).indexOf(card) };
}

/**
 * A new cards array with `id` moved to `to` (index clamped; default last in the cell).
 * The moved card is a copy with the new `columnId` (and `laneId` when given).
 */
export function moveKanbanCard(cards: readonly Readonly<KanbanCard>[], id: string, to: KanbanTarget): KanbanCard[] {
  const card = cards.find((c) => c.id === id);
  if (!card) fail('moveCard.id', 'the id of a card');
  const moved = copyCard(card);
  moved.columnId = to.columnId;
  if (to.laneId !== null) moved.laneId = to.laneId;
  const rest = cards.filter((c) => c.id !== id).map(copyCard);
  const target = rest.filter((c) => inCell(c, to.columnId, to.laneId));
  const index = Math.max(0, Math.min(to.index ?? target.length, target.length));
  const before = target[index];
  if (before) rest.splice(rest.indexOf(before), 0, moved);
  else {
    const last = target[target.length - 1];
    if (last) rest.splice(rest.indexOf(last) + 1, 0, moved);
    else rest.push(moved);
  }
  return rest;
}

/** Card count per column id (all swimlanes). */
export function columnCounts(cards: readonly Readonly<KanbanCard>[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const c of cards) out.set(c.columnId, (out.get(c.columnId) ?? 0) + 1);
  return out;
}
