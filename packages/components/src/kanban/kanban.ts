/**
 * Kanban board (SPEC section 18.19). Columns (with work-in-progress limits, collapse,
 * and reordering) and optional swimlanes; cards move by pointer drag, by keyboard
 * (Space picks a card up, arrow keys move it between positions, columns, and
 * swimlanes, Space drops, Escape cancels), or with a single pointer through the
 * toolbar Move button followed by a click on the target. Every move is first
 * dispatched as the cancelable `aui-card-move`, then applied, then (optionally)
 * saved through `moveCard`; a rejected or timed-out save rolls the card back.
 * Moves and column reorders are undoable.
 *
 * Cards are list items in one list per cell (column and swimlane) with one roving
 * tab stop over all cards. Cells with many cards render only the cards in view.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatNumber,
  getMessage,
  registerMessages,
  validators,
  type Direction,
  type Disposer,
  releaseNode,
} from '@absoluteui/core';
import { renderIcon } from '@absoluteui/icons';
import { announce, matchesHotkey, trackPointerDrag, type DragMove, type PointerDrag } from '@absoluteui/utilities';
import {
  assertBoard,
  cellCards,
  columnCounts,
  copyCard,
  moveKanbanCard,
  positionOf,
  type KanbanCard,
  type KanbanColumn,
  type KanbanLane,
  type KanbanPosition,
  type KanbanTarget,
} from './model.js';

export type KanbanWipPolicy = 'warn' | 'block';

export interface KanbanConfig {
  /** `warn` marks columns over their limit; `block` also refuses moves into a full column. */
  wipPolicy: KanbanWipPolicy;
  /** Cells with more cards than this render only the cards in view. */
  virtualThreshold: number;
  /** `moveCard` timeout in milliseconds. */
  requestTimeoutMs: number;
  /** Undo depth. */
  historyLimit: number;
  /** aria-level of column and swimlane headings. */
  headingLevel: number;
}

type Resolved = KanbanConfig & { locale: string; direction: Direction };

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    kanban: Resolved;
  }
}

export const kanbanConfig = defineComponentConfig<KanbanConfig, 'locale' | 'direction'>(
  'kanban',
  {
    wipPolicy: { default: 'warn', expected: '"warn" | "block"', validate: validators.oneOf(['warn', 'block'] as const) },
    virtualThreshold: { default: 150, expected: 'integer from 20 to 100000', validate: validators.integerInRange(20, 100_000) },
    requestTimeoutMs: { default: 30_000, expected: 'integer from 100 to 600000 (ms)', validate: validators.integerInRange(100, 600_000) },
    historyLimit: { default: 50, expected: 'integer from 0 to 500', validate: validators.integerInRange(0, 500) },
    headingLevel: { default: 3, expected: 'integer from 2 to 6', validate: validators.integerInRange(2, 6) },
  },
  ['locale', 'direction'],
);

registerMessages('kanban', 'en', {
  toolbar: '{label} controls',
  move: 'Move card',
  undo: 'Undo move',
  redo: 'Redo move',
  instructions: 'Press Space to pick up a card, the arrow keys to move it between positions, columns, and swimlanes, then Space to drop it or Escape to cancel. Press Enter to open a card.',
  readInstructions: 'Use the arrow keys to move between cards. Press Enter to open a card.',
  columnInstructions: 'Press Space to pick up the column, Left and Right arrow keys to move it, then Space to drop it or Escape to cancel.',
  columnHandle: 'Move column {label}',
  columnToggle: 'Cards in {label}',
  count: '{count}',
  countLimit: '{count} of {limit}',
  over: 'Over limit',
  cell: '{column}, {lane}',
  empty: 'No cards',
  cards: '{count} cards',
  locked: 'Locked',
  saving: 'Saving',
  where: '{column}, position {position} of {count}',
  whereLane: '{column}, {lane}, position {position} of {count}',
  grabbed: 'Picked up {title}. {where}.',
  moved: '{where}.',
  dropped: 'Dropped {title}. {where}.',
  cancelled: 'Move cancelled. {title} is back in {where}.',
  notAllowed: '{title} cannot be moved to {column}.',
  full: '{column} is at its limit of {limit} cards.',
  lockedCard: '{title} cannot be moved.',
  picked: '{title} is ready to move. Select a card or a column to move it there, or press Escape to cancel.',
  saveFailed: '{title} could not be moved and is back in {column}.',
  busy: 'Wait until the last move is saved.',
  undone: 'Move undone.',
  redone: 'Move redone.',
  columnGrabbed: 'Picked up column {label}, position {position} of {count}.',
  columnMoved: 'Column {label}, position {position} of {count}.',
  columnDropped: 'Dropped column {label} at position {position} of {count}.',
  columnCancelled: 'Column move cancelled.',
});

export interface KanbanRenderContext {
  readonly column: Readonly<KanbanColumn>;
  readonly lane: Readonly<KanbanLane> | null;
  readonly doc: Document;
}

export type KanbanMoveReason = 'move' | 'undo' | 'redo';

/** Argument of `moveCard` and detail of `aui-card-move`. */
export interface KanbanCardMoveDetail {
  reason: KanbanMoveReason;
  id: string;
  card: KanbanCard;
  from: KanbanPosition;
  to: KanbanPosition;
  /** Every card after the move (copies), for saving. */
  cards: KanbanCard[];
}

export interface KanbanOptions extends Partial<KanbanConfig> {
  /** Accessible name of the board. */
  label: string;
  columns: readonly KanbanColumn[];
  /** Swimlanes (rows). Every card then needs a `laneId`. */
  lanes?: readonly KanbanLane[];
  cards: readonly KanbanCard[];
  /** Cards can be moved. Default true. */
  editable?: boolean;
  /** Columns can be reordered (when editable). Default true. */
  columnReorder?: boolean;
  /** Card content. Return non-interactive content: the card is the focusable item. */
  renderCard?: (card: Readonly<KanbanCard>, context: KanbanRenderContext) => Node;
  /** Veto a move. Locked cards and columns, and full columns under `wipPolicy: 'block'`, are always refused. */
  canMove?: (card: Readonly<KanbanCard>, to: Readonly<KanbanPosition>) => boolean;
  /** Save a move (honour `signal`). A rejection or timeout moves the card back and emits `aui-move-error`. */
  moveCard?: (move: KanbanCardMoveDetail, signal: AbortSignal) => Promise<void> | void;
  locale?: string;
  direction?: Direction;
}

export interface KanbanCardActivateDetail {
  id: string;
  card: KanbanCard;
}

export interface KanbanMoveErrorDetail {
  id: string;
  reason: KanbanMoveReason;
  error: unknown;
}

export interface KanbanColumnMoveDetail {
  reason: KanbanMoveReason;
  id: string;
  from: number;
  to: number;
  /** Column ids in the new order. */
  order: string[];
}

export interface KanbanCollapseChangeDetail {
  kind: 'column' | 'lane';
  id: string;
  collapsed: boolean;
}

type Op =
  | { readonly kind: 'card'; readonly id: string; readonly from: KanbanPosition; readonly to: KanbanPosition }
  | { readonly kind: 'column'; readonly id: string; readonly from: number; readonly to: number };

interface CardEl {
  readonly li: HTMLLIElement;
  readonly body: HTMLDivElement;
  readonly state: HTMLSpanElement;
  data: KanbanCard | null;
  /** Node returned by `renderCard` (released when replaced or dropped, D8). */
  content: Node | null;
}

interface CellEl {
  readonly el: HTMLDivElement;
  readonly list: HTMLUListElement;
  readonly empty: HTMLDivElement;
  readonly summary: HTMLDivElement;
  readonly columnId: string;
  readonly laneId: string | null;
  /** Rendered window [first, last) of a virtual cell, or null. */
  window: { first: number; last: number } | null;
  scroll: Disposer | null;
}

interface HeaderEl {
  readonly el: HTMLDivElement;
  readonly title: HTMLSpanElement;
  readonly count: HTMLSpanElement;
  readonly over: HTMLSpanElement;
  readonly handle: HTMLButtonElement;
  readonly toggle: HTMLButtonElement;
}

interface LaneEl {
  readonly el: HTMLElement;
  readonly heading: HTMLDivElement;
  readonly toggle: HTMLButtonElement;
  readonly name: HTMLSpanElement;
  readonly count: HTMLSpanElement;
  readonly row: HTMLDivElement;
}

interface Held {
  readonly id: string;
  readonly source: 'keyboard' | 'pointer';
  readonly from: KanbanPosition;
  /** Pointer: grab offset inside the card. */
  grab: { x: number; y: number };
}

const NO_LANE = '\u0000';
const ESTIMATE = 88;
const OVERSCAN = 6;
const EDGE = 32;

const cellKey = (columnId: string, laneId: string | null): string => `${columnId}${NO_LANE}${laneId ?? ''}`;

/** Whether a rendered card shows the same data (its content is rebuilt otherwise). */
function sameContent(a: Readonly<KanbanCard> | null, b: Readonly<KanbanCard>): boolean {
  if (!a) return false;
  return a.title === b.title && a.description === b.description && a.color === b.color && (a.tags ?? []).join('\u0000') === (b.tags ?? []).join('\u0000') && a.columnId === b.columnId && a.laneId === b.laneId;
}

function fail(property: string, expected: string): never {
  throw configurationError('KANBAN_OPTIONS', 'Invalid kanban options.', { component: 'kanban', property: `kanban.${property}`, expected });
}

export class Kanban {
  readonly host: HTMLElement;
  /** The scrolling board element (role=group). */
  readonly element: HTMLDivElement;
  readonly #doc: Document;
  readonly #group = new DisposableGroup();
  readonly #toolbar: HTMLDivElement;
  readonly #buttons = new Map<string, HTMLButtonElement>();
  readonly #help: HTMLParagraphElement;
  readonly #columnHelp: HTMLParagraphElement;
  readonly #headerRow: HTMLDivElement;
  readonly #lanesEl: HTMLDivElement;
  #options: KanbanOptions;
  #columns: KanbanColumn[] = [];
  #lanes: KanbanLane[] | null = null;
  #cards: KanbanCard[] = [];
  #collapsedColumns = new Set<string>();
  #collapsedLanes = new Set<string>();
  #cardEls = new Map<string, CardEl>();
  #cells = new Map<string, CellEl>();
  #headers = new Map<string, HeaderEl>();
  #laneEls = new Map<string, LaneEl>();
  #heights = new Map<string, number>();
  #focusId: string | null = null;
  #held: Held | null = null;
  /** Cards in the order shown while a card is held (null: `#cards`). */
  #preview: KanbanCard[] | null = null;
  #picked: string | null = null;
  #columnHeld: { id: string; source: 'keyboard' | 'pointer'; from: number } | null = null;
  #columnPreview: KanbanColumn[] | null = null;
  #pending = new Map<string, AbortController>();
  #history: Op[] = [];
  #future: Op[] = [];
  #reconciling = false;
  #cardDrag: PointerDrag | null = null;
  #columnDrag: PointerDrag | null = null;
  #stopEscape: Disposer | null = null;
  #frame = 0;

  static create(host: HTMLElement, options: KanbanOptions): Kanban {
    return new Kanban(host, options);
  }

  private constructor(host: HTMLElement, options: KanbanOptions) {
    Kanban.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#config();
    this.#setBoard(options, true);
    const doc = this.#doc;
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-kanban__toolbar';
    this.#toolbar.setAttribute('role', 'group');
    for (const [action, icon] of [['move', 'grip'], ['undo', 'undo'], ['redo', 'redo']] as const) {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-kanban__tool';
      b.dataset.auiAction = action;
      b.append(renderIcon(icon, { doc }));
      const text = doc.createElement('span');
      text.className = 'aui-kanban__tool-text';
      b.append(text);
      this.#toolbar.append(b);
      this.#buttons.set(action, b);
    }
    this.#help = doc.createElement('p');
    this.#help.className = 'aui-kanban__instructions';
    this.#help.id = createId('aui-kanban-help');
    this.#columnHelp = doc.createElement('p');
    this.#columnHelp.className = 'aui-kanban__instructions';
    this.#columnHelp.id = createId('aui-kanban-column-help');
    this.element = doc.createElement('div');
    this.element.className = 'aui-kanban__board';
    this.element.setAttribute('role', 'group');
    this.#headerRow = doc.createElement('div');
    this.#headerRow.className = 'aui-kanban__row aui-kanban__columns';
    this.#lanesEl = doc.createElement('div');
    this.#lanesEl.className = 'aui-kanban__lanes';
    this.element.append(this.#headerRow, this.#lanesEl);
    host.classList.add('aui-kanban');
    host.replaceChildren(this.#toolbar, this.element, this.#help, this.#columnHelp);
    this.#render();

    const g = this.#group;
    g.listen(this.element, 'keydown', (e) => {
      this.#onKey(e);
    });
    g.listen(this.element, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(this.element, 'focusin', (e) => {
      const li = e.target instanceof HTMLElement ? e.target.closest<HTMLElement>('.aui-kanban__card') : null;
      const id = li?.dataset.auiCard;
      if (id !== undefined && id !== this.#focusId) {
        this.#focusId = id;
        this.#syncTabStops();
        this.#syncToolbar();
      }
    });
    g.listen(this.element, 'focusout', (e) => {
      if (this.#reconciling) return;
      const next = e.relatedTarget;
      if (this.#held?.source === 'keyboard') {
        const li = this.#cardEls.get(this.#held.id)?.li;
        if (!(next instanceof Node && li?.contains(next))) this.#cancelHeld();
      }
      if (this.#columnHeld?.source === 'keyboard') {
        const handle = this.#headers.get(this.#columnHeld.id)?.handle;
        if (!(next instanceof Node && handle?.contains(next))) this.#cancelColumn();
      }
    });
    g.listen(this.#toolbar, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button') : null;
      if (b?.dataset.auiAction) this.#action(b.dataset.auiAction);
    });
    this.#cardDrag = trackPointerDrag(this.#lanesEl, {
      canStart: (e) => this.#canStartDrag(e),
      onStart: (move) => {
        this.#startDrag(move);
      },
      onMove: (move) => {
        this.#moveDrag(move);
      },
      onEnd: () => {
        this.#dropHeld();
      },
      onCancel: () => {
        if (this.#held?.source === 'pointer') this.#cancelHeld();
      },
    });
    this.#columnDrag = trackPointerDrag(this.#headerRow, {
      canStart: (e) => this.#canStartColumnDrag(e),
      onStart: (move) => {
        this.#moveColumnDrag(move);
      },
      onMove: (move) => {
        this.#moveColumnDrag(move);
      },
      onEnd: () => {
        this.#dropColumn();
      },
      onCancel: () => {
        if (this.#columnHeld?.source === 'pointer') this.#cancelColumn();
      },
    });
    g.add(() => {
      this.#cardDrag?.dispose();
      this.#columnDrag?.dispose();
    });
    g.add(kanbanConfig.subscribe(() => {
      this.#render();
    }));
    g.add(() => {
      for (const c of this.#pending.values()) c.abort(new DOMException('The kanban board was destroyed.', 'AbortError'));
      this.#stopEscape?.();
      const view = this.#doc.defaultView;
      if (this.#frame !== 0 && view) view.cancelAnimationFrame(this.#frame);
    });
  }

  /** Every card in board order (copies, for saving). */
  get cards(): KanbanCard[] {
    return this.#cards.map(copyCard);
  }

  /** Columns in the current order (copies; `collapsed` reflects the board). */
  get columns(): KanbanColumn[] {
    return this.#columns.map((c) => ({ ...c, collapsed: this.#collapsedColumns.has(c.id) }));
  }

  get editable(): boolean {
    return this.#options.editable !== false;
  }

  get canUndo(): boolean {
    return this.#history.length > 0;
  }

  get canRedo(): boolean {
    return this.#future.length > 0;
  }

  /** Ids of cards whose move is being saved. */
  get pending(): string[] {
    return [...this.#pending.keys()];
  }

  /** Where a card is, or null. */
  positionOf(id: string): KanbanPosition | null {
    return positionOf(this.#cards, id, this.#lanes !== null);
  }

  update(options: Partial<KanbanOptions>): void {
    const next = { ...this.#options, ...options };
    Kanban.#assert(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    if (options.columns !== undefined || options.lanes !== undefined || options.cards !== undefined || 'lanes' in options) {
      this.#endHeld();
      this.#endColumn();
      this.#picked = null;
      this.#setBoard(next, false, options);
      if (options.cards !== undefined || options.columns !== undefined) {
        this.#history = [];
        this.#future = [];
      }
    }
    if (options.renderCard !== undefined) for (const e of this.#cardEls.values()) e.data = null;
    this.#render();
  }

  /**
   * Move a card (editable or not). `to.index` defaults to the end of the cell.
   * Returns false when the move is refused (locked, WIP limit, `canMove`, cancelled event).
   */
  moveCard(id: string, to: KanbanTarget): boolean {
    if (!this.#cards.some((c) => c.id === id)) fail('moveCard.id', 'the id of a card');
    this.#assertTarget(to, 'moveCard.to');
    const position = this.#resolveTarget(id, to);
    return this.#move(id, position);
  }

  /** Move a column to an index in the column order. */
  moveColumn(id: string, index: number): boolean {
    const from = this.#columns.findIndex((c) => c.id === id);
    if (from < 0) fail('moveColumn.id', 'the id of a column');
    if (!Number.isInteger(index) || index < 0 || index >= this.#columns.length) fail('moveColumn.index', `integer from 0 to ${String(this.#columns.length - 1)}`);
    return this.#commitColumn(id, from, index, 'move', true);
  }

  setCollapsed(kind: 'column' | 'lane', id: string, collapsed: boolean): void {
    const set = kind === 'column' ? this.#collapsedColumns : this.#collapsedLanes;
    const known = kind === 'column' ? this.#columns.some((c) => c.id === id) : (this.#lanes ?? []).some((l) => l.id === id);
    if (!known) fail('setCollapsed.id', `the id of a ${kind === 'column' ? 'column' : 'swimlane'}`);
    if (set.has(id) === collapsed) return;
    if (collapsed) set.add(id);
    else set.delete(id);
    this.#render();
    const detail: KanbanCollapseChangeDetail = { kind, id, collapsed };
    emit(this.host, 'aui-collapse-change', detail);
  }

  /** Focus a card (scrolling it into view). */
  focusCard(id: string): void {
    if (!this.#cards.some((c) => c.id === id)) fail('focusCard.id', 'the id of a card');
    this.#focusCard(id);
  }

  undo(): boolean {
    if (this.#pending.size > 0) {
      announce(this.#msg('busy'), 'assertive', this.#doc);
      return false;
    }
    const op = this.#history.pop();
    if (!op) return false;
    const ok = op.kind === 'card' ? this.#applyMove(op.id, op.from, 'undo', op) : this.#commitColumn(op.id, op.to, op.from, 'undo', false);
    if (ok) {
      this.#future.push(op);
      announce(this.#msg('undone'), 'polite', this.#doc);
    } else this.#history.push(op);
    this.#syncToolbar();
    return ok;
  }

  redo(): boolean {
    if (this.#pending.size > 0) {
      announce(this.#msg('busy'), 'assertive', this.#doc);
      return false;
    }
    const op = this.#future.pop();
    if (!op) return false;
    const ok = op.kind === 'card' ? this.#applyMove(op.id, op.to, 'redo', op) : this.#commitColumn(op.id, op.from, op.to, 'redo', false);
    if (ok) {
      this.#history.push(op);
      announce(this.#msg('redone'), 'polite', this.#doc);
    } else this.#future.push(op);
    this.#syncToolbar();
    return ok;
  }

  destroy(): void {
    this.#group.dispose();
    for (const e of this.#cardEls.values()) releaseNode(e.content);
    for (const cell of this.#cells.values()) cell.scroll?.();
    this.host.replaceChildren();
    this.host.classList.remove('aui-kanban', 'aui-kanban--editable', 'aui-kanban--lanes', 'aui-kanban--picking');
  }

  // ---- options -----------------------------------------------------------------------

  static #assert(o: KanbanOptions): void {
    if (!validators.isRecord(o)) fail('options', 'KanbanOptions');
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string');
    assertBoard(o.columns, o.lanes, o.cards);
    for (const key of ['editable', 'columnReorder'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'boolean');
    for (const key of ['renderCard', 'canMove', 'moveCard'] as const) if (o[key] !== undefined && typeof o[key] !== 'function') fail(key, 'function');
  }

  #config(): Readonly<Resolved> {
    const o = this.#options;
    const input: Partial<Resolved> = {};
    for (const key of ['wipPolicy', 'virtualThreshold', 'requestTimeoutMs', 'historyLimit', 'headingLevel', 'locale', 'direction'] as const) {
      const v = o[key];
      if (v !== undefined) (input as Record<string, unknown>)[key] = v;
    }
    return kanbanConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('kanban', key, params, this.#config().locale);
  }

  #num(n: number): string {
    return formatNumber(n, {}, this.#config().locale);
  }

  #setBoard(o: KanbanOptions, initial: boolean, changed: Partial<KanbanOptions> = o): void {
    if (initial || changed.columns !== undefined) {
      this.#columns = o.columns.map((c) => ({ ...c }));
      this.#collapsedColumns = new Set(o.columns.filter((c) => c.collapsed === true).map((c) => c.id));
    }
    if (initial || 'lanes' in changed) {
      this.#lanes = o.lanes ? o.lanes.map((l) => ({ ...l })) : null;
      this.#collapsedLanes = new Set((o.lanes ?? []).filter((l) => l.collapsed === true).map((l) => l.id));
    }
    if (initial || changed.cards !== undefined) {
      for (const c of this.#pending.values()) c.abort(new DOMException('The cards were replaced.', 'AbortError'));
      this.#pending.clear();
      this.#cards = o.cards.map(copyCard);
    }
    const ids = new Set(this.#cards.map((c) => c.id));
    if (this.#focusId !== null && !ids.has(this.#focusId)) this.#focusId = null;
    for (const id of [...this.#heights.keys()]) if (!ids.has(id)) this.#heights.delete(id);
  }

  #assertTarget(to: unknown, at: string): void {
    if (!validators.isRecord(to)) fail(at, '{ columnId, laneId, index? }');
    if (typeof to.columnId !== 'string' || !this.#columns.some((c) => c.id === to.columnId)) fail(`${at}.columnId`, 'the id of a column');
    if (this.#lanes) {
      if (typeof to.laneId !== 'string' || !this.#lanes.some((l) => l.id === to.laneId)) fail(`${at}.laneId`, 'the id of a swimlane');
    } else if (to.laneId !== null && to.laneId !== undefined) fail(`${at}.laneId`, 'null (the board has no swimlanes)');
    if (to.index !== undefined && !(Number.isInteger(to.index) && (to.index as number) >= 0)) fail(`${at}.index`, 'non-negative integer');
  }

  /** A target with a concrete index within the cell as it will be after the move. */
  #resolveTarget(id: string, to: KanbanTarget): KanbanPosition {
    const laneId = this.#lanes ? to.laneId : null;
    const rest = cellCards(this.#cards.filter((c) => c.id !== id), to.columnId, laneId);
    return { columnId: to.columnId, laneId, index: Math.max(0, Math.min(to.index ?? rest.length, rest.length)) };
  }

  // ---- rendering -----------------------------------------------------------------------

  #shownColumns(): KanbanColumn[] {
    return this.#columnPreview ?? this.#columns;
  }

  #shownCards(): KanbanCard[] {
    return this.#preview ?? this.#cards;
  }

  #lanesShown(): { id: string | null; lane: KanbanLane | null }[] {
    return this.#lanes ? this.#lanes.map((l) => ({ id: l.id, lane: l })) : [{ id: null, lane: null }];
  }

  #render(): void {
    const c = this.#config();
    const doc = this.#doc;
    const focused = doc.activeElement;
    this.#reconciling = true;
    try {
      this.host.classList.toggle('aui-kanban--editable', this.editable);
      this.host.classList.toggle('aui-kanban--lanes', this.#lanes !== null);
      this.host.classList.toggle('aui-kanban--picking', this.#picked !== null);
      this.element.setAttribute('aria-label', this.#options.label);
      this.#toolbar.setAttribute('aria-label', this.#msg('toolbar', { label: this.#options.label }));
      this.#toolbar.hidden = !this.editable;
      this.#help.textContent = this.editable ? this.#msg('instructions') : this.#msg('readInstructions');
      this.#columnHelp.textContent = this.#msg('columnInstructions');
      const labels: Record<string, string> = { move: this.#msg('move'), undo: this.#msg('undo'), redo: this.#msg('redo') };
      for (const [action, b] of this.#buttons) {
        const text = labels[action] ?? action;
        const span = b.querySelector('.aui-kanban__tool-text');
        if (span) span.textContent = text;
      }
      const columns = this.#shownColumns();
      const template = columns.map((col) => (this.#collapsedColumns.has(col.id) ? 'var(--aui-kanban-collapsed-width)' : 'var(--aui-kanban-column-width)')).join(' ');
      this.element.style.setProperty('--aui-kanban-template', template);
      this.#renderHeaders(columns, c);
      this.#renderLanes(columns, c);
      // Cards are measured once attached; a first measurement changes the spacer estimates.
      if (this.#measureVirtual()) this.#renderLanes(columns, c);
      if (this.#focusId === null || !this.#cardEls.has(this.#focusId)) this.#focusId = this.#firstFocusable();
      this.#syncTabStops();
      this.#syncToolbar();
    } finally {
      if (focused instanceof HTMLElement && focused !== doc.activeElement && focused.isConnected) focused.focus({ preventScroll: true });
      this.#reconciling = false;
    }
  }

  #renderHeaders(columns: readonly KanbanColumn[], c: Resolved): void {
    const doc = this.#doc;
    const counts = columnCounts(this.#shownCards());
    const keep = new Set(columns.map((col) => col.id));
    for (const [id, h] of this.#headers) {
      if (keep.has(id)) continue;
      h.el.remove();
      this.#headers.delete(id);
    }
    let before: Element | null = this.#headerRow.firstElementChild;
    for (const col of columns) {
      let h = this.#headers.get(col.id);
      if (!h) {
        const el = doc.createElement('div');
        el.className = 'aui-kanban__column-header';
        el.dataset.auiColumn = col.id;
        const handle = doc.createElement('button');
        handle.type = 'button';
        handle.className = 'aui-kanban__column-handle';
        handle.setAttribute('aria-describedby', this.#columnHelp.id);
        handle.append(renderIcon('grip', { doc }));
        const title = doc.createElement('span');
        title.className = 'aui-kanban__column-title';
        title.setAttribute('role', 'heading');
        const name = doc.createElement('span');
        name.className = 'aui-kanban__column-name';
        const count = doc.createElement('span');
        count.className = 'aui-kanban__count';
        const over = doc.createElement('span');
        over.className = 'aui-kanban__over';
        title.append(name, count, over);
        const toggle = doc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'aui-kanban__column-toggle';
        el.append(handle, title, toggle);
        h = { el, title, count, over, handle, toggle };
        this.#headers.set(col.id, h);
      }
      const collapsed = this.#collapsedColumns.has(col.id);
      h.el.classList.toggle('aui-kanban__column-header--collapsed', collapsed);
      h.el.classList.toggle('aui-kanban__column-header--held', this.#columnHeld?.id === col.id);
      h.title.setAttribute('aria-level', String(c.headingLevel));
      const name = h.title.querySelector('.aui-kanban__column-name');
      if (name) name.textContent = col.label;
      const n = counts.get(col.id) ?? 0;
      const limit = col.wipLimit;
      h.count.textContent = limit === undefined ? this.#msg('count', { count: this.#num(n) }) : this.#msg('countLimit', { count: this.#num(n), limit: this.#num(limit) });
      const isOver = limit !== undefined && n > limit;
      h.el.classList.toggle('aui-kanban__column-header--over', isOver);
      h.el.classList.toggle('aui-kanban__column-header--full', limit !== undefined && n >= limit);
      h.over.hidden = !isOver;
      if (isOver) h.over.replaceChildren(renderIcon('alert-triangle', { doc }), doc.createTextNode(this.#msg('over')));
      h.handle.hidden = !(this.editable && this.#options.columnReorder !== false);
      h.handle.setAttribute('aria-label', this.#msg('columnHandle', { label: col.label }));
      h.handle.setAttribute('aria-pressed', String(this.#columnHeld?.id === col.id));
      h.toggle.setAttribute('aria-label', this.#msg('columnToggle', { label: col.label }));
      h.toggle.setAttribute('aria-expanded', String(!collapsed));
      h.toggle.replaceChildren(renderIcon(collapsed ? (c.direction === 'rtl' ? 'chevron-left' : 'chevron-right') : 'chevron-down', { doc }));
      if (h.el !== before) this.#headerRow.insertBefore(h.el, before);
      before = h.el.nextElementSibling;
    }
  }

  #renderLanes(columns: readonly KanbanColumn[], c: Resolved): void {
    const doc = this.#doc;
    const shown = this.#lanesShown();
    const cards = this.#shownCards();
    const keepLanes = new Set(shown.map((l) => l.id ?? NO_LANE));
    for (const [id, l] of this.#laneEls) {
      if (keepLanes.has(id)) continue;
      l.el.remove();
      this.#laneEls.delete(id);
    }
    const keepCells = new Set<string>();
    const keepCards = new Set<string>();
    let beforeLane: Element | null = this.#lanesEl.firstElementChild;
    for (const { id: laneId, lane } of shown) {
      const key = laneId ?? NO_LANE;
      let l = this.#laneEls.get(key);
      if (!l) {
        const el = doc.createElement(lane ? 'section' : 'div');
        el.className = 'aui-kanban__lane';
        const heading = doc.createElement('div');
        heading.className = 'aui-kanban__lane-header';
        heading.setAttribute('role', 'heading');
        const toggle = doc.createElement('button');
        toggle.type = 'button';
        toggle.className = 'aui-kanban__lane-toggle';
        const name = doc.createElement('span');
        name.className = 'aui-kanban__lane-name';
        name.id = createId('aui-kanban-lane');
        const count = doc.createElement('span');
        count.className = 'aui-kanban__count';
        toggle.append(name, count);
        heading.append(toggle);
        const row = doc.createElement('div');
        row.className = 'aui-kanban__row aui-kanban__cells';
        el.append(heading, row);
        if (lane) {
          el.dataset.auiLane = lane.id;
          el.setAttribute('aria-labelledby', name.id);
        }
        l = { el, heading, toggle, name, count, row };
        this.#laneEls.set(key, l);
      }
      const collapsed = laneId !== null && this.#collapsedLanes.has(laneId);
      l.heading.hidden = lane === null;
      l.heading.setAttribute('aria-level', String(c.headingLevel));
      l.el.classList.toggle('aui-kanban__lane--collapsed', collapsed);
      if (lane) {
        l.name.textContent = lane.label;
        l.count.textContent = this.#msg('count', { count: this.#num(cards.filter((x) => x.laneId === lane.id).length) });
        l.toggle.setAttribute('aria-expanded', String(!collapsed));
        l.toggle.prepend(renderIcon(collapsed ? (c.direction === 'rtl' ? 'chevron-left' : 'chevron-right') : 'chevron-down', { doc }));
        const icons = l.toggle.querySelectorAll('.aui-icon');
        for (let i = 1; i < icons.length; i++) icons[i]?.remove();
      }
      l.row.hidden = collapsed;
      let beforeCell: Element | null = l.row.firstElementChild;
      for (const col of columns) {
        const ck = cellKey(col.id, laneId);
        keepCells.add(ck);
        const cell = this.#cells.get(ck) ?? this.#createCell(col.id, laneId);
        this.#renderCell(cell, col, lane, collapsed ? [] : cellCards(cards, col.id, laneId), c, keepCards);
        if (cell.el !== beforeCell) l.row.insertBefore(cell.el, beforeCell);
        beforeCell = cell.el.nextElementSibling;
      }
      if (l.el !== beforeLane) this.#lanesEl.insertBefore(l.el, beforeLane);
      beforeLane = l.el.nextElementSibling;
    }
    for (const [k, cell] of this.#cells) {
      if (keepCells.has(k)) continue;
      cell.scroll?.();
      cell.el.remove();
      this.#cells.delete(k);
    }
    for (const [id, e] of this.#cardEls) {
      if (keepCards.has(id)) continue;
      e.li.remove();
      releaseNode(e.content);
      this.#cardEls.delete(id);
    }
  }

  #createCell(columnId: string, laneId: string | null): CellEl {
    const doc = this.#doc;
    const el = doc.createElement('div');
    el.className = 'aui-kanban__cell';
    el.dataset.auiColumn = columnId;
    if (laneId !== null) el.dataset.auiLane = laneId;
    const list = doc.createElement('ul');
    list.className = 'aui-kanban__list';
    list.setAttribute('role', 'list');
    const empty = doc.createElement('div');
    empty.className = 'aui-kanban__empty';
    const summary = doc.createElement('div');
    summary.className = 'aui-kanban__summary';
    el.append(list, empty, summary);
    const cell: CellEl = { el, list, empty, summary, columnId, laneId, window: null, scroll: null };
    this.#cells.set(cellKey(columnId, laneId), cell);
    return cell;
  }

  #renderCell(cell: CellEl, col: KanbanColumn, lane: KanbanLane | null, cards: readonly KanbanCard[], c: Resolved, keep: Set<string>): void {
    const collapsed = this.#collapsedColumns.has(col.id);
    cell.el.classList.toggle('aui-kanban__cell--collapsed', collapsed);
    cell.el.classList.toggle('aui-kanban__cell--locked', col.locked === true);
    cell.list.setAttribute('aria-label', lane ? this.#msg('cell', { column: col.label, lane: lane.label }) : col.label);
    cell.list.hidden = collapsed;
    cell.summary.hidden = !collapsed;
    const total = cellCards(this.#shownCards(), col.id, lane?.id ?? null).length;
    cell.summary.textContent = this.#msg('cards', { count: this.#num(total) });
    cell.empty.hidden = collapsed || cards.length > 0;
    cell.empty.textContent = this.#msg('empty');
    if (collapsed) {
      cell.list.replaceChildren();
      cell.window = null;
      return;
    }
    const virtual = cards.length > c.virtualThreshold;
    cell.list.classList.toggle('aui-kanban__list--virtual', virtual);
    let items: readonly KanbanCard[] = cards;
    let first = 0;
    if (virtual) {
      cell.scroll ??= this.#listenScroll(cell);
      const w = this.#window(cell, cards);
      cell.window = w;
      first = w.first;
      items = cards.slice(w.first, w.last);
    } else {
      cell.scroll?.();
      cell.scroll = null;
      cell.window = null;
    }
    const nodes: HTMLLIElement[] = [];
    if (virtual && first > 0) nodes.push(this.#spacer(this.#offset(cards, 0, first)));
    items.forEach((card, i) => {
      const e = this.#cardEls.get(card.id) ?? this.#createCard(card.id);
      keep.add(card.id);
      this.#paintCard(e, card, col, lane, first + i, cards.length);
      nodes.push(e.li);
    });
    if (virtual && cell.window && cell.window.last < cards.length) nodes.push(this.#spacer(this.#offset(cards, cell.window.last, cards.length)));
    // Move only what is out of place (a focused card is re-focused by #render).
    const list = cell.list;
    const anchor = virtual ? this.#anchor(list) : null;
    let before: ChildNode | null = list.firstChild;
    for (const node of nodes) {
      if (node !== before) list.insertBefore(node, before);
      before = node.nextSibling;
    }
    while (before) {
      const next = before.nextSibling;
      before.remove();
      before = next;
    }
    // Keep the anchor card where it was when spacer estimates change (scroll anchoring is off).
    if (anchor?.el.parentNode === list) {
      const delta = anchor.el.getBoundingClientRect().top - list.getBoundingClientRect().top - anchor.top;
      if (Math.abs(delta) >= 1) list.scrollTop += delta;
    }
  }

  /** The focused card in a list, else its first rendered card, with its offset from the list top. */
  #anchor(list: HTMLUListElement): { el: HTMLElement; top: number } | null {
    const active = this.#doc.activeElement;
    const el = active instanceof HTMLElement && active.parentNode === list ? active : list.querySelector<HTMLElement>('.aui-kanban__card');
    if (!el?.isConnected) return null;
    return { el, top: el.getBoundingClientRect().top - list.getBoundingClientRect().top };
  }

  /** Measure rendered cards of virtual cells; true when a card was measured for the first time. */
  #measureVirtual(): boolean {
    let changed = false;
    for (const cell of this.#cells.values()) {
      if (!cell.window || !cell.list.isConnected) continue;
      const gap = Number.parseFloat(getComputedStyle(cell.list).rowGap) || 0;
      for (const li of Array.from(cell.list.querySelectorAll<HTMLElement>('.aui-kanban__card'))) {
        const id = li.dataset.auiCard;
        const h = li.offsetHeight;
        if (id === undefined || h === 0) continue;
        if (!this.#heights.has(id)) changed = true;
        this.#heights.set(id, h + gap);
      }
    }
    return changed;
  }

  #spacer(px: number): HTMLLIElement {
    const li = this.#doc.createElement('li');
    li.className = 'aui-kanban__spacer';
    li.setAttribute('aria-hidden', 'true');
    li.style.setProperty('block-size', `${String(Math.round(px))}px`);
    return li;
  }

  #estimate(): number {
    if (this.#heights.size === 0) return ESTIMATE;
    let sum = 0;
    for (const h of this.#heights.values()) sum += h;
    return sum / this.#heights.size;
  }

  #offset(cards: readonly KanbanCard[], from: number, to: number): number {
    const est = this.#estimate();
    let px = 0;
    for (let i = from; i < to; i++) {
      const card = cards[i];
      px += card ? (this.#heights.get(card.id) ?? est) : est;
    }
    return px;
  }

  #window(cell: CellEl, cards: readonly KanbanCard[]): { first: number; last: number } {
    const top = cell.list.scrollTop;
    const viewport = cell.list.clientHeight || 600;
    const est = this.#estimate();
    let acc = 0;
    let first = cards.length;
    let last = cards.length;
    for (let i = 0; i < cards.length; i++) {
      const card = cards[i];
      const h = card ? (this.#heights.get(card.id) ?? est) : est;
      if (first === cards.length && acc + h > top) first = i;
      if (acc > top + viewport) {
        last = i;
        break;
      }
      acc += h;
    }
    first = Math.max(0, Math.min(first, cards.length) - OVERSCAN);
    last = Math.min(cards.length, last + OVERSCAN);
    // The held card stays rendered so it keeps focus and pointer capture.
    const held = this.#held?.id;
    const at = held === undefined ? -1 : cards.findIndex((x) => x.id === held);
    if (at >= 0 && at < first) first = at;
    if (at >= last) last = at + 1;
    return { first, last };
  }

  #listenScroll(cell: CellEl): Disposer {
    const onScroll = (): void => {
      const view = this.#doc.defaultView;
      if (!view || this.#frame !== 0) return;
      this.#frame = view.requestAnimationFrame(() => {
        this.#frame = 0;
        const hadFocus = cell.list.contains(this.#doc.activeElement);
        this.#render();
        if (hadFocus && !cell.list.contains(this.#doc.activeElement)) {
          const first = cell.list.querySelector<HTMLElement>('.aui-kanban__card');
          const id = first?.dataset.auiCard;
          if (id !== undefined) {
            this.#focusId = id;
            this.#syncTabStops();
            first?.focus({ preventScroll: true });
          }
        }
      });
    };
    cell.list.addEventListener('scroll', onScroll, { passive: true });
    return () => {
      cell.list.removeEventListener('scroll', onScroll);
    };
  }

  #createCard(id: string): CardEl {
    const doc = this.#doc;
    const li = doc.createElement('li');
    li.className = 'aui-kanban__card';
    li.dataset.auiCard = id;
    li.tabIndex = -1;
    li.setAttribute('aria-describedby', this.#help.id);
    const grip = doc.createElement('span');
    grip.className = 'aui-kanban__grip';
    grip.setAttribute('aria-hidden', 'true');
    grip.append(renderIcon('grip', { doc }));
    const body = doc.createElement('div');
    body.className = 'aui-kanban__card-body';
    const state = doc.createElement('span');
    state.className = 'aui-kanban__state';
    li.append(grip, body, state);
    const e: CardEl = { li, body, state, data: null, content: null };
    this.#cardEls.set(id, e);
    return e;
  }

  #paintCard(e: CardEl, card: KanbanCard, col: KanbanColumn, lane: KanbanLane | null, index: number, size: number): void {
    const li = e.li;
    li.className = `aui-kanban__card aui-kanban__card--c${String(card.color ?? 1)}`;
    li.classList.toggle('aui-kanban__card--accent', card.color !== undefined);
    li.classList.toggle('aui-kanban__card--locked', card.locked === true || col.locked === true);
    li.classList.toggle('aui-kanban__card--held', this.#held?.id === card.id);
    li.classList.toggle('aui-kanban__card--dragging', this.#held?.id === card.id && this.#held.source === 'pointer');
    li.classList.toggle('aui-kanban__card--picked', this.#picked === card.id);
    li.setAttribute('aria-posinset', String(index + 1));
    li.setAttribute('aria-setsize', String(size));
    const pending = this.#pending.has(card.id);
    if (pending) li.setAttribute('aria-busy', 'true');
    else li.removeAttribute('aria-busy');
    const states: string[] = [];
    if (card.locked === true && this.editable) states.push(this.#msg('locked'));
    if (pending) states.push(this.#msg('saving'));
    // The leading comma separates the state for screen readers only.
    const sep = this.#doc.createElement('span');
    sep.className = 'aui-kanban__sep';
    sep.textContent = ', ';
    e.state.replaceChildren(...(states.length > 0 ? [sep, states.join(', ')] : []));
    e.state.hidden = states.length === 0;
    if (!sameContent(e.data, card)) {
      const context: KanbanRenderContext = { column: col, lane, doc: this.#doc };
      releaseNode(e.content);
      e.content = this.#options.renderCard ? this.#options.renderCard(copyCard(card), context) : null;
      e.body.replaceChildren(e.content ?? this.#defaultCard(card));
      e.data = copyCard(card);
    }
  }

  #defaultCard(card: KanbanCard): DocumentFragment {
    const doc = this.#doc;
    const frag = doc.createDocumentFragment();
    const title = doc.createElement('span');
    title.className = 'aui-kanban__title';
    title.textContent = card.title;
    frag.append(title);
    if (card.description !== undefined && card.description !== '') {
      const d = doc.createElement('span');
      d.className = 'aui-kanban__description';
      const sep = doc.createElement('span');
      sep.className = 'aui-kanban__sep';
      sep.textContent = ', ';
      d.append(sep, card.description);
      frag.append(d);
    }
    if (card.tags && card.tags.length > 0) {
      const tags = doc.createElement('span');
      tags.className = 'aui-kanban__tags';
      for (const t of card.tags) {
        const sep = doc.createElement('span');
        sep.className = 'aui-kanban__sep';
        sep.textContent = ', ';
        const tag = doc.createElement('span');
        tag.className = 'aui-kanban__tag';
        tag.textContent = t;
        tags.append(sep, tag);
      }
      frag.append(tags);
    }
    return frag;
  }

  #firstFocusable(): string | null {
    for (const cell of this.#cells.values()) {
      const li = cell.list.querySelector<HTMLElement>('.aui-kanban__card');
      if (li?.dataset.auiCard !== undefined) return li.dataset.auiCard;
    }
    return null;
  }

  #syncTabStops(): void {
    for (const [id, e] of this.#cardEls) e.li.tabIndex = id === this.#focusId ? 0 : -1;
  }

  #syncToolbar(): void {
    const set = (action: string, disabled: boolean): void => {
      this.#buttons.get(action)?.setAttribute('aria-disabled', String(disabled));
    };
    const focus = this.#focusId;
    set('move', this.#picked === null && (focus === null || !this.#movable(focus)));
    set('undo', !this.canUndo);
    set('redo', !this.canRedo);
    this.#buttons.get('move')?.setAttribute('aria-pressed', String(this.#picked !== null));
  }

  // ---- focus and keyboard ----------------------------------------------------------------

  #focusCard(id: string): void {
    const pos = positionOf(this.#shownCards(), id, this.#lanes !== null);
    if (!pos) return;
    if (!this.#cardEls.has(id)) {
      // Unrendered: expand its lane and column, or scroll a virtual cell to it.
      if (pos.laneId !== null) this.#collapsedLanes.delete(pos.laneId);
      this.#collapsedColumns.delete(pos.columnId);
      const cell = this.#cells.get(cellKey(pos.columnId, pos.laneId));
      if (cell) {
        const cards = cellCards(this.#shownCards(), pos.columnId, pos.laneId);
        cell.list.scrollTop = Math.max(0, this.#offset(cards, 0, pos.index) - (cell.list.clientHeight || 0) / 3);
      }
      this.#focusId = id;
      this.#render();
    }
    this.#focusId = id;
    this.#syncTabStops();
    this.#syncToolbar();
    this.#cardEls.get(id)?.li.focus();
  }

  /** Ids of expanded columns and swimlanes in board order (keyboard movement skips collapsed ones). */
  #openIds(): { columns: string[]; lanes: (string | null)[] } {
    return {
      columns: this.#shownColumns().filter((col) => !this.#collapsedColumns.has(col.id)).map((col) => col.id),
      lanes: this.#lanesShown().filter((l) => l.id === null || !this.#collapsedLanes.has(l.id)).map((l) => l.id),
    };
  }

  #navigate(id: string, key: string, ctrl: boolean): string | null {
    const cards = this.#shownCards();
    const pos = positionOf(cards, id, this.#lanes !== null);
    if (!pos) return null;
    const { columns, lanes } = this.#openIds();
    const cell = (colId: string, laneId: string | null): KanbanCard[] => cellCards(cards, colId, laneId);
    const here = cell(pos.columnId, pos.laneId);
    const li = lanes.indexOf(pos.laneId);
    const ci = columns.indexOf(pos.columnId);
    const rtl = this.#config().direction === 'rtl';
    switch (key) {
      case 'ArrowDown': {
        if (pos.index < here.length - 1) return here[pos.index + 1]?.id ?? null;
        for (let l = li + 1; l < lanes.length; l++) {
          const first = cell(pos.columnId, lanes[l] ?? null)[0];
          if (first) return first.id;
        }
        return null;
      }
      case 'ArrowUp': {
        if (pos.index > 0) return here[pos.index - 1]?.id ?? null;
        for (let l = li - 1; l >= 0; l--) {
          const list = cell(pos.columnId, lanes[l] ?? null);
          const last = list[list.length - 1];
          if (last) return last.id;
        }
        return null;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = (key === 'ArrowRight') !== rtl ? 1 : -1;
        for (let x = ci + dir; x >= 0 && x < columns.length; x += dir) {
          const list = cell(columns[x] ?? '', pos.laneId);
          const target = list[Math.min(pos.index, list.length - 1)];
          if (target) return target.id;
        }
        return null;
      }
      case 'Home':
        if (ctrl) {
          for (const l of lanes) for (const col of columns) {
            const first = cell(col, l)[0];
            if (first) return first.id;
          }
          return null;
        }
        return here[0]?.id ?? null;
      case 'End':
        if (ctrl) {
          for (const l of [...lanes].reverse()) for (const col of [...columns].reverse()) {
            const list = cell(col, l);
            const last = list[list.length - 1];
            if (last) return last.id;
          }
          return null;
        }
        return here[here.length - 1]?.id ?? null;
    }
    return null;
  }

  #onKey(e: KeyboardEvent): void {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target) return;
    if (target.classList.contains('aui-kanban__column-handle')) {
      this.#onColumnKey(e, target);
      return;
    }
    const li = target.closest<HTMLElement>('.aui-kanban__card');
    const id = li?.dataset.auiCard;
    if (id === undefined || li !== target) return;
    if (this.editable && this.#held === null) {
      if (matchesHotkey(e, 'mod+z')) {
        e.preventDefault();
        this.undo();
        return;
      }
      if (matchesHotkey(e, 'mod+shift+z') || matchesHotkey(e, 'mod+y')) {
        e.preventDefault();
        this.redo();
        return;
      }
    }
    const held = this.#held;
    if (held?.source === 'keyboard' && held.id === id) {
      this.#onHeldKey(e, id);
      return;
    }
    if (e.altKey || e.metaKey) return;
    switch (e.key) {
      case 'Enter': {
        e.preventDefault();
        this.#activate(id);
        return;
      }
      case ' ': {
        e.preventDefault();
        if (this.editable && !e.ctrlKey) this.#grab(id);
        return;
      }
      case 'Escape':
        if (this.#picked !== null) {
          e.preventDefault();
          this.#cancelPick();
        }
        return;
      case 'ArrowDown':
      case 'ArrowUp':
      case 'ArrowLeft':
      case 'ArrowRight':
      case 'Home':
      case 'End': {
        e.preventDefault();
        const next = this.#navigate(id, e.key, e.ctrlKey);
        if (next !== null) this.#focusCard(next);
        return;
      }
    }
  }

  #activate(id: string): void {
    const card = this.#cards.find((c) => c.id === id);
    if (!card) return;
    const detail: KanbanCardActivateDetail = { id, card: copyCard(card) };
    emit(this.host, 'aui-card-activate', detail);
  }

  #where(id: string, cards = this.#shownCards()): string {
    const pos = positionOf(cards, id, this.#lanes !== null);
    if (!pos) return '';
    const col = this.#columns.find((c) => c.id === pos.columnId);
    const lane = this.#lanes?.find((l) => l.id === pos.laneId);
    const count = cellCards(cards, pos.columnId, pos.laneId).length;
    const params = { column: col?.label ?? pos.columnId, position: this.#num(pos.index + 1), count: this.#num(count) };
    return lane ? this.#msg('whereLane', { ...params, lane: lane.label }) : this.#msg('where', params);
  }

  #title(id: string): string {
    return this.#cards.find((c) => c.id === id)?.title ?? id;
  }

  #movable(id: string): boolean {
    const card = this.#cards.find((c) => c.id === id);
    if (!card || card.locked === true || this.#pending.has(id)) return false;
    return this.#columns.find((c) => c.id === card.columnId)?.locked !== true;
  }

  /** Whether a card may move to a position; announces the reason when `say` is set. */
  #allowed(id: string, to: KanbanPosition, say: boolean): boolean {
    const card = this.#cards.find((c) => c.id === id);
    if (!card) return false;
    const col = this.#columns.find((c) => c.id === to.columnId);
    if (!col) return false;
    const title = card.title;
    if (!this.#movable(id)) {
      if (say) announce(this.#pending.has(id) ? this.#msg('busy') : this.#msg('lockedCard', { title }), 'assertive', this.#doc);
      return false;
    }
    if (col.locked === true && col.id !== card.columnId) {
      if (say) announce(this.#msg('notAllowed', { title, column: col.label }), 'assertive', this.#doc);
      return false;
    }
    const limit = col.wipLimit;
    if (this.#config().wipPolicy === 'block' && limit !== undefined && col.id !== card.columnId && (columnCounts(this.#cards).get(col.id) ?? 0) >= limit) {
      if (say) announce(this.#msg('full', { column: col.label, limit: this.#num(limit) }), 'assertive', this.#doc);
      return false;
    }
    if (this.#options.canMove && !this.#options.canMove(copyCard(card), { ...to })) {
      if (say) announce(this.#msg('notAllowed', { title, column: col.label }), 'assertive', this.#doc);
      return false;
    }
    return true;
  }

  #grab(id: string): void {
    if (this.#held !== null) return;
    if (!this.#movable(id)) {
      this.#allowed(id, this.positionOf(id) ?? { columnId: '', laneId: null, index: 0 }, true);
      return;
    }
    const from = this.positionOf(id);
    if (!from) return;
    this.#picked = null;
    this.#held = { id, source: 'keyboard', from, grab: { x: 0, y: 0 } };
    this.#preview = this.#cards;
    this.#watchEscape();
    this.#render();
    announce(this.#msg('grabbed', { title: this.#title(id), where: this.#where(id) }), 'assertive', this.#doc);
  }

  #onHeldKey(e: KeyboardEvent, id: string): void {
    const cards = this.#shownCards();
    const pos = positionOf(cards, id, this.#lanes !== null);
    if (!pos) return;
    const here = cellCards(cards, pos.columnId, pos.laneId);
    const { columns, lanes } = this.#openIds();
    const rtl = this.#config().direction === 'rtl';
    let to: KanbanPosition | null = null;
    switch (e.key) {
      case ' ':
      case 'Enter':
        e.preventDefault();
        this.#dropHeld();
        return;
      case 'Escape':
        e.preventDefault();
        this.#cancelHeld();
        return;
      case 'Tab':
        return;
      case 'ArrowUp': {
        if (pos.index > 0) to = { ...pos, index: pos.index - 1 };
        else {
          const l = lanes[lanes.indexOf(pos.laneId) - 1];
          if (l !== undefined) to = { columnId: pos.columnId, laneId: l, index: cellCards(cards, pos.columnId, l).length };
        }
        break;
      }
      case 'ArrowDown': {
        if (pos.index < here.length - 1) to = { ...pos, index: pos.index + 1 };
        else {
          const l = lanes[lanes.indexOf(pos.laneId) + 1];
          if (l !== undefined) to = { columnId: pos.columnId, laneId: l, index: 0 };
        }
        break;
      }
      case 'ArrowLeft':
      case 'ArrowRight': {
        const dir = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
        const ci = columns.indexOf(pos.columnId);
        for (let x = ci + dir; x >= 0 && x < columns.length; x += dir) {
          const colId = columns[x] ?? '';
          const candidate = { columnId: colId, laneId: pos.laneId, index: Math.min(pos.index, cellCards(cards, colId, pos.laneId).length) };
          if (this.#allowed(id, candidate, false)) {
            to = candidate;
            break;
          }
        }
        if (!to) {
          const colId = columns[ci + dir];
          if (colId !== undefined) this.#allowed(id, { columnId: colId, laneId: pos.laneId, index: 0 }, true);
        }
        break;
      }
      case 'Home':
        to = { ...pos, index: 0 };
        break;
      case 'End':
        to = { ...pos, index: here.length - 1 };
        break;
      default:
        e.preventDefault();
        return;
    }
    e.preventDefault();
    if (!to || (to.columnId === pos.columnId && to.laneId === pos.laneId && to.index === pos.index)) return;
    if (to.columnId !== pos.columnId && !this.#allowed(id, to, true)) return;
    this.#preview = moveKanbanCard(this.#cards, id, to);
    this.#render();
    this.#cardEls.get(id)?.li.focus();
    announce(this.#msg('moved', { where: this.#where(id) }), 'assertive', this.#doc);
  }

  #watchEscape(): void {
    this.#stopEscape?.();
    // Escape must cancel the move, not close an enclosing overlay: window capture runs first.
    const win = this.#doc.defaultView ?? window;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape') return;
      if (this.#held?.source === 'keyboard') {
        event.preventDefault();
        event.stopPropagation();
        this.#cancelHeld();
      } else if (this.#picked !== null) {
        event.preventDefault();
        event.stopPropagation();
        this.#cancelPick();
      } else if (this.#columnHeld?.source === 'keyboard') {
        event.preventDefault();
        event.stopPropagation();
        this.#cancelColumn();
      }
    };
    win.addEventListener('keydown', onKey, true);
    this.#stopEscape = () => {
      win.removeEventListener('keydown', onKey, true);
    };
  }

  #endHeld(): Held | null {
    const held = this.#held;
    this.#held = null;
    this.#preview = null;
    if (this.#picked === null && this.#columnHeld === null) {
      this.#stopEscape?.();
      this.#stopEscape = null;
    }
    if (held) {
      const li = this.#cardEls.get(held.id)?.li;
      li?.style.removeProperty('--aui-kanban-drag-x');
      li?.style.removeProperty('--aui-kanban-drag-y');
    }
    for (const cell of this.#cells.values()) cell.el.classList.remove('aui-kanban__cell--drop', 'aui-kanban__cell--no-drop');
    return held;
  }

  #cancelHeld(): void {
    const held = this.#held;
    if (!held) return;
    this.#endHeld();
    this.#cardDrag?.cancel();
    this.#render();
    announce(this.#msg('cancelled', { title: this.#title(held.id), where: this.#where(held.id) }), 'assertive', this.#doc);
  }

  #dropHeld(): void {
    const held = this.#held;
    if (!held) return;
    const to = positionOf(this.#shownCards(), held.id, this.#lanes !== null);
    const hadFocus = held.source === 'keyboard';
    this.#endHeld();
    if (!to || (to.columnId === held.from.columnId && to.laneId === held.from.laneId && to.index === held.from.index)) {
      this.#render();
      announce(this.#msg('dropped', { title: this.#title(held.id), where: this.#where(held.id) }), 'assertive', this.#doc);
      return;
    }
    this.#move(held.id, to);
    if (hadFocus) this.#cardEls.get(held.id)?.li.focus();
  }

  // ---- single pointer (toolbar Move, then a click on the target) --------------------------

  #action(action: string): void {
    if (this.#buttons.get(action)?.getAttribute('aria-disabled') === 'true') return;
    switch (action) {
      case 'move':
        if (this.#picked !== null) this.#cancelPick();
        else if (this.#focusId !== null) this.#pick(this.#focusId);
        break;
      case 'undo':
        this.undo();
        break;
      case 'redo':
        this.redo();
        break;
    }
  }

  #pick(id: string): void {
    if (!this.#movable(id)) {
      this.#allowed(id, this.positionOf(id) ?? { columnId: '', laneId: null, index: 0 }, true);
      return;
    }
    this.#picked = id;
    this.#watchEscape();
    this.#render();
    announce(this.#msg('picked', { title: this.#title(id) }), 'assertive', this.#doc);
  }

  #cancelPick(): void {
    const id = this.#picked;
    this.#picked = null;
    if (this.#held === null && this.#columnHeld === null) {
      this.#stopEscape?.();
      this.#stopEscape = null;
    }
    this.#render();
    if (id !== null) announce(this.#msg('cancelled', { title: this.#title(id), where: this.#where(id) }), 'assertive', this.#doc);
  }

  #onClick(e: MouseEvent): void {
    const t = e.target instanceof Element ? e.target : null;
    if (!t) return;
    const colToggle = t.closest<HTMLElement>('.aui-kanban__column-toggle');
    if (colToggle) {
      const id = colToggle.closest<HTMLElement>('.aui-kanban__column-header')?.dataset.auiColumn;
      if (id !== undefined) this.setCollapsed('column', id, !this.#collapsedColumns.has(id));
      return;
    }
    const laneToggle = t.closest<HTMLElement>('.aui-kanban__lane-toggle');
    if (laneToggle) {
      const id = laneToggle.closest<HTMLElement>('.aui-kanban__lane')?.dataset.auiLane;
      if (id !== undefined) this.setCollapsed('lane', id, !this.#collapsedLanes.has(id));
      return;
    }
    const li = t.closest<HTMLElement>('.aui-kanban__card');
    const cellEl = t.closest<HTMLElement>('.aui-kanban__cell');
    const picked = this.#picked;
    if (picked !== null && cellEl) {
      const columnId = cellEl.dataset.auiColumn ?? '';
      const laneId = this.#lanes ? (cellEl.dataset.auiLane ?? null) : null;
      const targetId = li?.dataset.auiCard;
      if (targetId === picked) {
        this.#cancelPick();
        return;
      }
      const rest = cellCards(this.#cards.filter((c) => c.id !== picked), columnId, laneId);
      const at = targetId === undefined ? rest.length : rest.findIndex((c) => c.id === targetId);
      const to: KanbanPosition = { columnId, laneId, index: at < 0 ? rest.length : at };
      this.#picked = null;
      if (this.#held === null) {
        this.#stopEscape?.();
        this.#stopEscape = null;
      }
      if (!this.#move(picked, to)) this.#render();
      this.#focusCard(picked);
      return;
    }
    const id = li?.dataset.auiCard;
    if (id === undefined) return;
    this.#focusId = id;
    this.#syncTabStops();
    li?.focus({ preventScroll: true });
    this.#syncToolbar();
    this.#activate(id);
  }

  // ---- pointer drag -----------------------------------------------------------------------

  #canStartDrag(e: PointerEvent): boolean {
    if (!this.editable || this.#held !== null || this.#picked !== null) return false;
    const t = e.target instanceof Element ? e.target : null;
    const li = t?.closest<HTMLElement>('.aui-kanban__card');
    const id = li?.dataset.auiCard;
    if (id === undefined || !this.#movable(id)) return false;
    // Interactive consumer content keeps its own pointer behaviour.
    if (t?.closest('a, button, input, select, textarea, label, [contenteditable]:not([contenteditable="false"])')) return false;
    return true;
  }

  #startDrag(move: DragMove): void {
    const el = this.#doc.elementFromPoint(move.start.x, move.start.y)?.closest<HTMLElement>('.aui-kanban__card');
    const id = el?.dataset.auiCard;
    if (!el || id === undefined) return;
    const from = this.positionOf(id);
    if (!from) return;
    const rect = el.getBoundingClientRect();
    this.#held = { id, source: 'pointer', from, grab: { x: move.start.x - rect.left, y: move.start.y - rect.top } };
    this.#preview = this.#cards;
    this.#focusId = id;
    this.#render();
    this.#moveDrag(move);
  }

  #moveDrag(move: DragMove): void {
    const held = this.#held;
    if (held?.source !== 'pointer') return;
    const li = this.#cardEls.get(held.id)?.li;
    if (!li) return;
    const cellEl = this.#doc.elementsFromPoint(move.point.x, move.point.y).map((n) => n.closest<HTMLElement>('.aui-kanban__cell')).find((n) => n !== null) ?? null;
    for (const cell of this.#cells.values()) cell.el.classList.remove('aui-kanban__cell--drop', 'aui-kanban__cell--no-drop');
    if (cellEl) {
      const columnId = cellEl.dataset.auiColumn ?? '';
      const laneId = this.#lanes ? (cellEl.dataset.auiLane ?? null) : null;
      const cell = this.#cells.get(cellKey(columnId, laneId));
      let index: number;
      const siblings = cell ? Array.from(cell.list.querySelectorAll<HTMLElement>('.aui-kanban__card')).filter((x) => x !== li) : [];
      const shown = cellCards(this.#shownCards(), columnId, laneId).filter((c) => c.id !== held.id);
      const below = siblings.find((x) => {
        const r = x.getBoundingClientRect();
        return move.point.y < r.top + r.height / 2;
      });
      if (below) index = shown.findIndex((c) => c.id === below.dataset.auiCard);
      else {
        const last = siblings[siblings.length - 1];
        const lastIndex = last ? shown.findIndex((c) => c.id === last.dataset.auiCard) : -1;
        index = lastIndex + 1;
      }
      if (index < 0) index = shown.length;
      const to: KanbanPosition = { columnId, laneId, index };
      const ok = this.#allowed(held.id, to, false);
      cellEl.classList.add(ok ? 'aui-kanban__cell--drop' : 'aui-kanban__cell--no-drop');
      const current = positionOf(this.#shownCards(), held.id, this.#lanes !== null);
      if (ok && current && !(current.columnId === to.columnId && current.laneId === to.laneId && current.index === to.index)) {
        this.#preview = moveKanbanCard(this.#cards, held.id, to);
        this.#render();
      }
    }
    // Follow the pointer: translate from the card's layout position (without the translate).
    const x = Number.parseFloat(li.style.getPropertyValue('--aui-kanban-drag-x')) || 0;
    const y = Number.parseFloat(li.style.getPropertyValue('--aui-kanban-drag-y')) || 0;
    const rect = li.getBoundingClientRect();
    li.style.setProperty('--aui-kanban-drag-x', `${String(Math.round(move.point.x - held.grab.x - (rect.left - x)))}px`);
    li.style.setProperty('--aui-kanban-drag-y', `${String(Math.round(move.point.y - held.grab.y - (rect.top - y)))}px`);
    this.#autoScroll(move);
  }

  #autoScroll(move: DragMove): void {
    const board = this.element.getBoundingClientRect();
    if (move.point.x < board.left + EDGE) this.element.scrollLeft -= 12;
    else if (move.point.x > board.right - EDGE) this.element.scrollLeft += 12;
    if (move.point.y < board.top + EDGE) this.element.scrollTop -= 12;
    else if (move.point.y > board.bottom - EDGE) this.element.scrollTop += 12;
  }

  // ---- committing moves ---------------------------------------------------------------------

  /** A new move (records history). */
  #move(id: string, to: KanbanPosition): boolean {
    const from = this.positionOf(id);
    if (!from) return false;
    if (from.columnId === to.columnId && from.laneId === to.laneId && from.index === to.index) {
      this.#render();
      return true;
    }
    const op: Op = { kind: 'card', id, from, to };
    if (!this.#applyMove(id, to, 'move', op)) return false;
    const limit = this.#config().historyLimit;
    if (limit > 0) {
      this.#history.push(op);
      if (this.#history.length > limit) this.#history.shift();
    }
    this.#future = [];
    this.#syncToolbar();
    return true;
  }

  #applyMove(id: string, to: KanbanPosition, reason: KanbanMoveReason, op: Op): boolean {
    const from = this.positionOf(id);
    const card = this.#cards.find((c) => c.id === id);
    if (!from || !card) return false;
    if (!this.#allowed(id, to, true)) {
      this.#render();
      return false;
    }
    const next = moveKanbanCard(this.#cards, id, to);
    const moved = next.find((c) => c.id === id);
    const actual = positionOf(next, id, this.#lanes !== null);
    if (!moved || !actual) return false;
    const detail: KanbanCardMoveDetail = { reason, id, card: copyCard(moved), from, to: actual, cards: next.map(copyCard) };
    if (!emit(this.host, 'aui-card-move', detail, { cancelable: true })) {
      this.#render();
      announce(this.#msg('cancelled', { title: card.title, where: this.#where(id, this.#cards) }), 'assertive', this.#doc);
      return false;
    }
    this.#cards = next;
    this.#render();
    announce(this.#msg('dropped', { title: card.title, where: this.#where(id) }), 'assertive', this.#doc);
    if (this.#options.moveCard) void this.#save(detail, op, from);
    return true;
  }

  async #save(detail: KanbanCardMoveDetail, op: Op, revertTo: KanbanPosition): Promise<void> {
    const save = this.#options.moveCard;
    if (!save) return;
    const controller = new AbortController();
    this.#pending.set(detail.id, controller);
    this.#render();
    const view = this.#doc.defaultView ?? window;
    const timer = view.setTimeout(() => {
      controller.abort(new DOMException('Saving the move timed out.', 'TimeoutError'));
    }, this.#config().requestTimeoutMs);
    try {
      await Promise.race([
        Promise.resolve().then(() => save({ ...detail, card: copyCard(detail.card), cards: detail.cards.map(copyCard) }, controller.signal)),
        new Promise<never>((_, reject) => {
          controller.signal.addEventListener('abort', () => {
            reject(controller.signal.reason instanceof Error ? controller.signal.reason : new Error('aborted'));
          }, { once: true });
        }),
      ]);
    } catch (error) {
      // Destroyed, or the cards were replaced: nothing to roll back.
      if (this.#group.disposed || this.#pending.get(detail.id) !== controller) return;
      this.#pending.delete(detail.id);
      if (this.#cards.some((c) => c.id === detail.id)) this.#cards = moveKanbanCard(this.#cards, detail.id, revertTo);
      const stack = detail.reason === 'undo' ? this.#future : this.#history;
      const at = stack.lastIndexOf(op);
      if (at >= 0) stack.splice(at, 1);
      this.#render();
      const column = this.#columns.find((c) => c.id === revertTo.columnId)?.label ?? revertTo.columnId;
      announce(this.#msg('saveFailed', { title: detail.card.title, column }), 'assertive', this.#doc);
      const err: KanbanMoveErrorDetail = { id: detail.id, reason: detail.reason, error };
      emit(this.host, 'aui-move-error', err);
    } finally {
      view.clearTimeout(timer);
      if (this.#pending.get(detail.id) === controller) {
        this.#pending.delete(detail.id);
        if (!this.#group.disposed) this.#render();
      }
    }
  }

  // ---- columns ------------------------------------------------------------------------------

  #onColumnKey(e: KeyboardEvent, handle: HTMLElement): void {
    const id = handle.closest<HTMLElement>('.aui-kanban__column-header')?.dataset.auiColumn;
    if (id === undefined) return;
    const held = this.#columnHeld;
    if (e.key === ' ' || e.key === 'Enter') {
      e.preventDefault();
      if (held?.id === id) this.#dropColumn();
      else if (!held) {
        const from = this.#columns.findIndex((c) => c.id === id);
        this.#columnHeld = { id, source: 'keyboard', from };
        this.#columnPreview = [...this.#columns];
        this.#watchEscape();
        this.#render();
        announce(this.#msg('columnGrabbed', this.#columnParams(id)), 'assertive', this.#doc);
      }
      return;
    }
    if (held?.id !== id || held.source !== 'keyboard') return;
    const order = this.#columnPreview ?? this.#columns;
    const at = order.findIndex((c) => c.id === id);
    const rtl = this.#config().direction === 'rtl';
    let to: number;
    switch (e.key) {
      case 'ArrowLeft':
        to = rtl ? at + 1 : at - 1;
        break;
      case 'ArrowRight':
        to = rtl ? at - 1 : at + 1;
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = order.length - 1;
        break;
      case 'Escape':
        e.preventDefault();
        this.#cancelColumn();
        return;
      case 'Tab':
        return;
      default:
        e.preventDefault();
        return;
    }
    e.preventDefault();
    to = Math.max(0, Math.min(order.length - 1, to));
    if (to === at) return;
    this.#previewColumn(id, to);
    this.#headers.get(id)?.handle.focus();
    announce(this.#msg('columnMoved', this.#columnParams(id)), 'assertive', this.#doc);
  }

  #columnParams(id: string): Record<string, string> {
    const order = this.#columnPreview ?? this.#columns;
    const at = order.findIndex((c) => c.id === id);
    return { label: order[at]?.label ?? id, position: this.#num(at + 1), count: this.#num(order.length) };
  }

  #previewColumn(id: string, to: number): void {
    const order = [...this.#columns].filter((c) => c.id !== id);
    const col = this.#columns.find((c) => c.id === id);
    if (!col) return;
    order.splice(to, 0, col);
    this.#columnPreview = order;
    this.#render();
  }

  #endColumn(): { id: string; from: number } | null {
    const held = this.#columnHeld;
    this.#columnHeld = null;
    const order = this.#columnPreview;
    this.#columnPreview = null;
    if (this.#held === null && this.#picked === null) {
      this.#stopEscape?.();
      this.#stopEscape = null;
    }
    if (held) this.#headers.get(held.id)?.el.style.removeProperty('--aui-kanban-drag-x');
    if (!held || !order) return null;
    return { id: held.id, from: order.findIndex((c) => c.id === held.id) };
  }

  #cancelColumn(): void {
    if (!this.#columnHeld) return;
    this.#endColumn();
    this.#columnDrag?.cancel();
    this.#render();
    announce(this.#msg('columnCancelled'), 'assertive', this.#doc);
  }

  #dropColumn(): void {
    const held = this.#columnHeld;
    const result = this.#endColumn();
    if (!held || !result) return;
    const hadFocus = held.source === 'keyboard';
    if (result.from === held.from) {
      this.#render();
      return;
    }
    this.#commitColumn(held.id, held.from, result.from, 'move', true);
    if (hadFocus) this.#headers.get(held.id)?.handle.focus();
  }

  #commitColumn(id: string, from: number, to: number, reason: KanbanMoveReason, record: boolean): boolean {
    const order = [...this.#columns];
    const at = order.findIndex((c) => c.id === id);
    const col = order[at];
    if (!col) return false;
    if (at === to) return true;
    order.splice(at, 1);
    order.splice(to, 0, col);
    const detail: KanbanColumnMoveDetail = { reason, id, from: at, to, order: order.map((c) => c.id) };
    if (!emit(this.host, 'aui-column-move', detail, { cancelable: true })) {
      this.#render();
      return false;
    }
    this.#columns = order;
    if (record) {
      const limit = this.#config().historyLimit;
      if (limit > 0) {
        this.#history.push({ kind: 'column', id, from, to });
        if (this.#history.length > limit) this.#history.shift();
      }
      this.#future = [];
    }
    this.#render();
    announce(this.#msg('columnDropped', this.#columnParams(id)), 'assertive', this.#doc);
    return true;
  }

  #canStartColumnDrag(e: PointerEvent): boolean {
    if (!this.editable || this.#options.columnReorder === false || this.#columnHeld !== null || this.#held !== null) return false;
    return e.target instanceof Element && e.target.closest('.aui-kanban__column-handle') !== null;
  }

  #moveColumnDrag(move: DragMove): void {
    if (this.#columnHeld === null) {
      const header = this.#doc.elementFromPoint(move.start.x, move.start.y)?.closest<HTMLElement>('.aui-kanban__column-header');
      const id = header?.dataset.auiColumn;
      if (id === undefined) return;
      this.#columnHeld = { id, source: 'pointer', from: this.#columns.findIndex((c) => c.id === id) };
      this.#columnPreview = [...this.#columns];
      this.#render();
    }
    const held = this.#columnHeld;
    const order = this.#columnPreview ?? this.#columns;
    const at = order.findIndex((c) => c.id === held.id);
    const rtl = this.#config().direction === 'rtl';
    // The new index is the number of other columns whose middle is before the pointer.
    const to = order.filter((c) => {
      if (c.id === held.id) return false;
      const r = this.#headers.get(c.id)?.el.getBoundingClientRect();
      if (!r) return false;
      const mid = r.left + r.width / 2;
      return rtl ? move.point.x < mid : move.point.x > mid;
    }).length;
    if (to !== at) this.#previewColumn(held.id, to);
    const el = this.#headers.get(held.id)?.el;
    if (el) {
      const x = Number.parseFloat(el.style.getPropertyValue('--aui-kanban-drag-x')) || 0;
      const rect = el.getBoundingClientRect();
      el.style.setProperty('--aui-kanban-drag-x', `${String(Math.round(move.point.x - rect.width / 2 - (rect.left - x)))}px`);
    }
  }
}
