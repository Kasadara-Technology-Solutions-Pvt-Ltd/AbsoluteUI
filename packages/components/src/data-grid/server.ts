/**
 * Data Grid server row model (docs/PLAN-R11-G6.md, G6a): a block cache over a datasource.
 * Blocks load on demand (debounced, a bounded number at a time, aborted when stale), unknown
 * row counts grow as blocks arrive, least recently used blocks are released, failed blocks
 * wait for an explicit retry.
 */
import type { Item } from '../data-table/model.js';
import type { DataGridFilters } from './filter.js';
import type { DataGridAdvancedFilter } from './advanced-filter.js';
import type { DataGridSort } from './model.js';

/** What the grid asks the server for: rows `start` to `end` (exclusive) under the current view models. */
export interface DataGridRowsRequest {
  readonly start: number;
  readonly end: number;
  readonly sort: readonly DataGridSort[];
  readonly filters: DataGridFilters;
  readonly quickFilter: string;
  readonly advancedFilter: DataGridAdvancedFilter | null;
  /** Grouped columns (server groups); empty for flat rows and server tree data. */
  readonly groupBy: readonly string[];
  /** The keys of the group (or tree parents) whose children are asked for; empty for the top level. */
  readonly groupKeys: readonly unknown[];
}

export interface DataGridRowsResult<Row> {
  readonly rows: readonly Row[];
  /** The total row count when known; absent while unknown (a short block ends the rows). */
  readonly rowCount?: number;
}

/** Where server rows come from. Honor `signal`: newer requests and `destroy()` abort older ones. */
export interface DataGridDatasource<Row> {
  getRows(request: DataGridRowsRequest, signal: AbortSignal): Promise<DataGridRowsResult<Row>>;
}

/** Changes to server rows the grid has loaded (the server already holds them). */
export interface DataGridServerTransaction<Row> {
  readonly add?: readonly Row[];
  /** Absolute position of the added rows (default: the end). */
  readonly addIndex?: number;
  readonly update?: readonly Row[];
  /** Ids of rows to remove (rows that are not loaded are reported missing). */
  readonly remove?: readonly string[];
  /** The new total row count (default: the count plus added minus removed rows). */
  readonly rowCount?: number;
  /** The group keys of the rows changed (default: the top level). */
  readonly route?: readonly unknown[];
}

export interface ServerTransactionResult {
  readonly added: string[];
  readonly updated: string[];
  readonly removed: string[];
  readonly missing: string[];
}

export type BlockState = 'waiting' | 'loading' | 'loaded' | 'failed';

interface Block<Row> {
  readonly index: number;
  state: BlockState;
  items: Item<Row>[];
  error: string;
  controller: AbortController | null;
  used: number;
  /** Rows stay shown while a loaded block reloads (refresh without purge). */
  stale: boolean;
}

export interface ServerCacheOptions<Row> {
  readonly blockSize: number;
  readonly maxBlocks: number | null;
  readonly delay: number;
  readonly maxConcurrent: number;
  readonly initialRowCount: number;
  readonly rowId: (row: Row) => string;
  readonly load: (start: number, end: number, signal: AbortSignal) => Promise<DataGridRowsResult<Row>>;
  /** Blocks or the row count changed. */
  readonly onChange: () => void;
  readonly win: Window;
}

export class ServerCache<Row> {
  readonly #o: ServerCacheOptions<Row>;
  #blocks = new Map<number, Block<Row>>();
  #rowCount: number;
  #known = false;
  #clock = 0;
  #timer = 0;
  #epoch = 0;
  #destroyed = false;

  constructor(options: ServerCacheOptions<Row>) {
    this.#o = options;
    this.#rowCount = options.initialRowCount;
  }

  get rowCount(): number {
    return this.#rowCount;
  }

  /** Whether the total is known (a reported count, or a short block). */
  get known(): boolean {
    return this.#known;
  }

  /** Whether any block is waiting or loading. */
  get busy(): boolean {
    for (const b of this.#blocks.values()) if (b.state === 'waiting' || b.state === 'loading' || b.stale) return true;
    return false;
  }

  /** Loaded rows in order (with their absolute positions as `index`). */
  loaded(): Item<Row>[] {
    return [...this.#blocks.values()].filter((b) => b.state === 'loaded' || b.items.length > 0).sort((a, b) => a.index - b.index).flatMap((b) => b.items);
  }

  /** The state of the block holding row `i`, and its error message when failed. */
  stateAt(i: number): { state: BlockState | 'none'; error: string } {
    const b = this.#blocks.get(Math.floor(i / this.#o.blockSize));
    return b ? { state: b.items.length > 0 ? 'loaded' : b.state, error: b.error } : { state: 'none', error: '' };
  }

  /** Make sure rows `first` to `last` (inclusive) load; marks their blocks as recently used. */
  ensure(first: number, last: number): void {
    if (this.#destroyed) return;
    const size = this.#o.blockSize;
    const end = this.#known ? Math.min(last, this.#rowCount - 1) : last;
    let added = false;
    // Walked bottom-up so the topmost wanted block is the most recently used: it loads first.
    for (let index = Math.floor(end / size); index >= Math.floor(Math.max(0, first) / size); index--) {
      let block = this.#blocks.get(index);
      if (!block) {
        block = { index, state: 'waiting', items: [], error: '', controller: null, used: 0, stale: false };
        this.#blocks.set(index, block);
        added = true;
      }
      block.used = ++this.#clock;
    }
    if (added) this.#schedule();
  }

  /** Drop every block, aborting loads (sort or filters changed); `keepCount` keeps the count as an estimate until the next answer. */
  purge(keepCount = false): void {
    this.#epoch++;
    for (const b of this.#blocks.values()) b.controller?.abort();
    this.#blocks.clear();
    this.#known = false;
    if (!keepCount) this.#rowCount = this.#o.initialRowCount;
  }

  /** Reload loaded blocks; with `purge` their rows are dropped first (loading rows show). */
  refresh(purge: boolean): void {
    if (purge) {
      this.purge();
      this.#o.onChange();
      return;
    }
    for (const b of this.#blocks.values()) {
      b.controller?.abort();
      b.controller = null;
      b.stale = b.items.length > 0;
      b.state = 'waiting';
      b.error = '';
    }
    this.#schedule();
  }

  /** Load failed blocks again. */
  retry(): void {
    let any = false;
    for (const b of this.#blocks.values()) {
      if (b.state !== 'failed') continue;
      b.state = 'waiting';
      b.error = '';
      any = true;
    }
    if (any) {
      this.#o.onChange();
      this.#schedule();
    }
  }

  /** Replace loaded rows by id (writes to rows that are not loaded are skipped). Returns the ids replaced. */
  replace(rows: readonly Row[]): string[] {
    const byId = new Map(rows.map((r) => [this.#o.rowId(r), r]));
    const done: string[] = [];
    for (const b of this.#blocks.values()) {
      b.items = b.items.map((item) => {
        const next = byId.get(item.id);
        if (next === undefined) return item;
        done.push(item.id);
        return { row: next, id: item.id, index: item.index };
      });
    }
    return done;
  }

  /**
   * Apply a transaction to the loaded rows: removes and adds shift the positions of later loaded
   * rows; a block left with rows it does not hold is dropped (it loads again when shown).
   */
  transact(tx: DataGridServerTransaction<Row>): ServerTransactionResult {
    const size = this.#o.blockSize;
    const rowId = this.#o.rowId;
    const updated = this.replace(tx.update ?? []);
    const done = new Set(updated);
    const missing = (tx.update ?? []).map(rowId).filter((id) => !done.has(id));
    // Loaded rows by absolute position.
    let rows = new Map<number, Item<Row>>();
    for (const b of this.#blocks.values()) for (const item of b.items) rows.set(item.index, item);
    const byId = new Map([...rows.values()].map((item) => [item.id, item.index]));
    const removed: string[] = [];
    const gone: number[] = [];
    for (const id of tx.remove ?? []) {
      const at = byId.get(id);
      if (at === undefined) missing.push(id);
      else {
        removed.push(id);
        gone.push(at);
      }
    }
    gone.sort((a, b) => a - b);
    const shiftDown = (p: number): number => {
      let n = 0;
      while (n < gone.length && (gone[n] ?? Infinity) < p) n++;
      return p - n;
    };
    const goneSet = new Set(gone);
    const kept = new Map<number, Item<Row>>();
    for (const [p, item] of rows) if (!goneSet.has(p)) kept.set(shiftDown(p), item);
    rows = kept;
    let count = this.#rowCount - gone.length;
    const adds = tx.add ?? [];
    const added: string[] = [];
    if (adds.length > 0) {
      const at = Math.min(Math.max(0, tx.addIndex ?? count), count);
      const shifted = new Map<number, Item<Row>>();
      for (const [p, item] of rows) shifted.set(p >= at ? p + adds.length : p, item);
      adds.forEach((row, i) => {
        const id = rowId(row);
        added.push(id);
        shifted.set(at + i, { row, id, index: at + i });
      });
      rows = shifted;
      count += adds.length;
    }
    if (tx.rowCount !== undefined) count = tx.rowCount;
    // Rebuild the blocks: only blocks whose every row is held stay loaded.
    const next = new Map<number, Block<Row>>();
    for (const b of this.#blocks.values()) {
      if (b.state === 'loading' || b.state === 'waiting') b.controller?.abort();
    }
    const blocks = Math.ceil(count / size);
    for (let index = 0; index < blocks; index++) {
      const start = index * size;
      const end = Math.min(start + size, count);
      const items: Item<Row>[] = [];
      for (let p = start; p < end; p++) {
        const item = rows.get(p);
        if (!item) break;
        items.push({ row: item.row, id: item.id, index: p });
      }
      if (items.length === end - start && items.length > 0) next.set(index, { index, state: 'loaded', items, error: '', controller: null, used: ++this.#clock, stale: false });
    }
    this.#epoch++;
    this.#blocks = next;
    this.#rowCount = count;
    this.#o.onChange();
    return { added, updated, removed, missing };
  }

  setRowCount(count: number, known: boolean): void {
    this.#rowCount = count;
    this.#known = known;
    for (const [index, b] of this.#blocks) {
      if (known && index * this.#o.blockSize >= count) {
        b.controller?.abort();
        this.#blocks.delete(index);
      }
    }
    this.#o.onChange();
  }

  destroy(): void {
    this.#destroyed = true;
    this.purge();
    if (this.#timer) this.#o.win.clearTimeout(this.#timer);
  }

  #schedule(): void {
    if (this.#timer || this.#destroyed) return;
    this.#timer = this.#o.win.setTimeout(() => {
      this.#timer = 0;
      this.#pump();
    }, this.#o.delay);
  }

  /** Start waiting blocks (most recently wanted first) up to the concurrency limit. */
  #pump(): void {
    if (this.#destroyed) return;
    const all = [...this.#blocks.values()];
    let running = all.filter((b) => b.state === 'loading').length;
    const waiting = all.filter((b) => b.state === 'waiting').sort((a, b) => b.used - a.used);
    for (const block of waiting) {
      if (running >= this.#o.maxConcurrent) break;
      running++;
      this.#start(block);
    }
  }

  #start(block: Block<Row>): void {
    const size = this.#o.blockSize;
    const start = block.index * size;
    const controller = new AbortController();
    const epoch = this.#epoch;
    block.state = 'loading';
    block.controller = controller;
    let promise: Promise<DataGridRowsResult<Row>>;
    try {
      promise = this.#o.load(start, start + size, controller.signal);
    } catch (error) {
      promise = Promise.reject(error instanceof Error ? error : new Error(String(error)));
    }
    promise.then(
      (result) => {
        if (epoch !== this.#epoch || controller.signal.aborted || this.#destroyed) return;
        this.#loaded(block, start, result);
      },
      (error: unknown) => {
        if (epoch !== this.#epoch || controller.signal.aborted || this.#destroyed) return;
        block.state = 'failed';
        block.stale = false;
        block.items = [];
        block.controller = null;
        block.error = error instanceof Error ? error.message : String(error);
        this.#o.onChange();
        this.#pump();
      },
    );
  }

  #loaded(block: Block<Row>, start: number, result: unknown): void {
    const size = this.#o.blockSize;
    const r = typeof result === 'object' && result !== null ? (result as Partial<Record<keyof DataGridRowsResult<Row>, unknown>>) : null;
    const rows: unknown = r?.rows;
    const count: unknown = r?.rowCount;
    block.controller = null;
    block.stale = false;
    if (!Array.isArray(rows) || rows.length > size || (count !== undefined && !(Number.isInteger(count) && typeof count === 'number' && count >= 0))) {
      block.state = 'failed';
      block.items = [];
      block.error = 'Invalid datasource result: expected { rows: at most blockSize rows, rowCount?: integer >= 0 }.';
    } else {
      const seen = new Set<string>();
      const items: Item<Row>[] = [];
      let bad = false;
      for (const [i, row] of (rows as Row[]).entries()) {
        // rowId comes from the application: check what it returns at run time.
        const id: unknown = this.#o.rowId(row);
        if (typeof id !== 'string' || id === '' || seen.has(id)) {
          bad = true;
          break;
        }
        seen.add(id);
        items.push({ row, id, index: start + i });
      }
      if (bad) {
        block.state = 'failed';
        block.items = [];
        block.error = 'Invalid datasource result: row ids must be unique, non-empty strings.';
      } else {
        block.state = 'loaded';
        block.items = items;
        block.error = '';
        if (typeof count === 'number') {
          this.#rowCount = count;
          this.#known = true;
        } else if (rows.length < size) {
          this.#rowCount = start + rows.length;
          this.#known = true;
        } else if (!this.#known) {
          // Unknown total: one more block of loading rows past the last loaded one.
          this.#rowCount = Math.max(this.#rowCount, start + size + size);
        }
      }
    }
    this.#evict();
    this.#o.onChange();
    this.#pump();
  }

  /** Release the least recently used loaded blocks beyond maxBlocks. */
  #evict(): void {
    const max = this.#o.maxBlocks;
    if (max === null) return;
    const loaded = [...this.#blocks.values()].filter((b) => b.state === 'loaded').sort((a, b) => a.used - b.used);
    for (const b of loaded.slice(0, Math.max(0, loaded.length - max))) this.#blocks.delete(b.index);
  }
}
