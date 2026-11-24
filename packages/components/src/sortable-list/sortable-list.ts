/**
 * Sortable List (SPEC section 18.20). A reorderable list with two equivalent input paths:
 * pointer drag (mouse, pen, touch through pointer events; never HTML5 drag and drop)
 * and keyboard reordering on each item's handle button: Space or Enter grabs, arrow
 * keys (Home, End) move, Space or Enter drops, Escape or leaving the handle cancels.
 * Every step is announced through a live region ("Apples moved to position 3 of 7").
 * The dragged or grabbed item itself is never removed from the DOM (its siblings move
 * around it), so focus and pointer capture survive the reorder. The new order is
 * reported with `aui-change`; persisting it is the consumer's job.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, trackPointerDrag, type DragMove, type PointerDrag } from '@absoluteui/utilities';

export type SortableListDragFrom = 'handle' | 'item';

export interface SortableListConfig {
  /** Where a pointer drag can start: the handle only, or anywhere on the item. */
  dragFrom: SortableListDragFrom;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    sortableList: SortableListConfig;
  }
}

export const sortableListConfig = defineComponentConfig<SortableListConfig>('sortableList', {
  dragFrom: { default: 'handle', expected: '"handle" | "item"', validate: validators.oneOf(['handle', 'item'] as const) },
});

registerMessages('sortableList', 'en', {
  instructions: 'To reorder, press Space or Enter on an item handle, move it with the arrow keys, then press Space or Enter to drop it. Press Escape to cancel.',
  handle: 'Reorder {label}',
  grabbed: 'Grabbed {label}. Current position {position} of {count}.',
  moved: '{label} moved to position {position} of {count}.',
  dropped: 'Dropped {label} at position {position} of {count}.',
  canceled: 'Reorder canceled. {label} returned to position {position} of {count}.',
});

export interface SortableListItem {
  /** Unique, stable id; used in the reported order. */
  id: string;
  /** Text label: the item content (unless `content` is given) and the name used in announcements. */
  label: string;
  /** Rich content instead of the label text. Inserted once; strings render as text. */
  content?: Node | string;
  /** The item cannot be moved (other items can still move past it). */
  disabled?: boolean;
}

export interface SortableListIcons {
  handle: IconRef;
}

export interface SortableListOptions extends Partial<SortableListConfig> {
  /** Accessible name of the list (required), e.g. "Priorities". */
  label: string;
  items: readonly SortableListItem[];
  /** Disable reordering for the whole list. */
  disabled?: boolean;
  icons?: Partial<SortableListIcons>;
}

export interface SortableListChangeDetail {
  /** Item ids in the new order. */
  order: string[];
  /** The moved item. */
  id: string;
  /** Zero-based indexes before and after the move. */
  from: number;
  to: number;
}

interface Row {
  item: SortableListItem;
  readonly li: HTMLLIElement;
  readonly handle: HTMLButtonElement;
  readonly body: HTMLDivElement;
  content: Node | string | undefined;
}

interface Session {
  readonly row: Row;
  readonly from: number;
  readonly source: 'keyboard' | 'pointer';
  /** Pointer drags: the item's viewport top when the drag started. */
  startTop: number;
  offset: number;
}

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
function isList(value: unknown): boolean {
  return Array.isArray(value);
}

export class SortableList {
  readonly host: HTMLElement;
  /** The `<ul>` element. */
  readonly list: HTMLUListElement;
  #options: SortableListOptions;
  readonly #doc: Document;
  readonly #instructions: HTMLParagraphElement;
  #rows = new Map<string, Row>();
  #session: Session | null = null;
  #pending: Row | null = null;
  #drag: PointerDrag | null = null;
  #stopEscape: Disposer | null = null;
  readonly #group = new DisposableGroup();

  /** Render a sortable list into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: SortableListOptions): SortableList {
    return new SortableList(host, options);
  }

  private constructor(host: HTMLElement, options: SortableListOptions) {
    SortableList.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#config();

    this.list = this.#doc.createElement('ul');
    this.list.className = 'aui-sortable-list__list';
    this.#instructions = this.#doc.createElement('p');
    this.#instructions.className = 'aui-sortable-list__instructions';
    this.#instructions.id = createId('aui-sortable-help');
    host.classList.add('aui-sortable-list');
    host.replaceChildren(this.list, this.#instructions);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    const g = this.#group;
    g.listen(this.list, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    g.listen(this.list, 'focusout', (event) => {
      const s = this.#session;
      if (s?.source !== 'keyboard') return;
      const next = event.relatedTarget;
      if (next instanceof Node && s.row.handle.contains(next)) return;
      this.#cancel();
    });
    this.#drag = trackPointerDrag(this.list, {
      canStart: (event) => this.#canStartPointer(event),
      onStart: () => {
        this.#startPointer();
      },
      onMove: (move) => {
        this.#movePointer(move);
      },
      onEnd: () => {
        this.#drop();
      },
      onCancel: () => {
        this.#pending = null;
        if (this.#session?.source === 'pointer') this.#cancel();
      },
    });
    g.add(() => {
      this.#drag?.dispose();
      this.#drag = null;
    });
    g.add(sortableListConfig.subscribe(() => {
      this.#cancel(false);
      this.#render();
    }));
  }

  /** Item ids in the current order. */
  get order(): string[] {
    return Array.from(this.list.children, (li) => (li instanceof HTMLElement ? (li.dataset.id ?? '') : ''));
  }

  get options(): Readonly<SortableListOptions> {
    return this.#options;
  }

  /** Whether an item is currently grabbed (keyboard) or dragged (pointer). */
  get isDragging(): boolean {
    return this.#session !== null;
  }

  /** Move an item programmatically (no events, no announcement). */
  move(id: string, index: number): void {
    const row = this.#rows.get(id);
    if (!row) this.#fail('move.id', 'id of an existing item');
    if (!Number.isInteger(index) || index < 0 || index >= this.#rows.size) this.#fail('move.index', `integer 0..${this.#rows.size - 1}`);
    this.#cancel(false);
    this.#moveTo(row.li, index);
    this.#commitOrder();
  }

  /** Replace options. New `items` define the order; content is re-inserted only when it changed. */
  update(options: Partial<SortableListOptions>): void {
    const next = { ...this.#options, ...options };
    SortableList.#assertOptions(next);
    const previous = this.#options;
    this.#options = next;
    try {
      this.#config();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    this.#cancel(false);
    this.#render();
  }

  destroy(): void {
    this.#cancel(false);
    this.#group.dispose();
    this.#rows.clear();
    this.host.replaceChildren();
    this.host.classList.remove('aui-sortable-list', 'aui-sortable-list--disabled', 'aui-sortable-list--drag-item');
  }

  #config(): Readonly<SortableListConfig> {
    const o = this.#options;
    return sortableListConfig.resolve({ ...(o.dragFrom === undefined ? {} : { dragFrom: o.dragFrom }) });
  }

  #fail(property: string, expected: string): never {
    throw configurationError('SORTABLE_LIST_OPTIONS', 'Invalid sortable list options.', { component: 'sortable-list', property: `sortableList.${property}`, expected });
  }

  static #assertOptions(options: SortableListOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('SORTABLE_LIST_OPTIONS', 'Invalid sortable list options.', { component: 'sortable-list', property: `sortableList.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!isList(options.items)) fail('items', 'array of items');
    const ids = new Set<string>();
    options.items.forEach((item, i) => {
      const raw: unknown = item;
      if (typeof raw !== 'object' || raw === null) fail(`items[${i}]`, 'item object');
      if (typeof item.id !== 'string' || item.id === '') fail(`items[${i}].id`, 'non-empty string');
      if (ids.has(item.id)) fail(`items[${i}].id`, 'unique ids');
      ids.add(item.id);
      if (typeof item.label !== 'string' || item.label.trim() === '') fail(`items[${i}].label`, 'non-empty string');
      const content: unknown = item.content;
      if (content !== undefined && typeof content !== 'string' && !(content instanceof Node)) fail(`items[${i}].content`, 'Node | string');
    });
    const disabled: unknown = options.disabled;
    if (disabled !== undefined && typeof disabled !== 'boolean') fail('disabled', 'boolean');
  }

  #render(): void {
    const o = this.#options;
    const doc = this.#doc;
    const config = this.#config();
    const listDisabled = o.disabled === true;
    this.list.setAttribute('aria-label', o.label);
    this.#instructions.textContent = getMessage('sortableList', 'instructions');
    this.host.classList.toggle('aui-sortable-list--disabled', listDisabled);
    this.host.classList.toggle('aui-sortable-list--drag-item', config.dragFrom === 'item');

    const keep = new Set(o.items.map((i) => i.id));
    for (const [id, row] of this.#rows) {
      if (keep.has(id)) continue;
      row.li.remove();
      this.#rows.delete(id);
    }
    const lis: HTMLLIElement[] = [];
    for (const item of o.items) {
      let row = this.#rows.get(item.id);
      if (!row) {
        const li = doc.createElement('li');
        li.className = 'aui-sortable-list__item';
        const handle = doc.createElement('button');
        handle.type = 'button';
        handle.className = 'aui-sortable-list__handle';
        handle.setAttribute('aria-describedby', this.#instructions.id);
        const body = doc.createElement('div');
        body.className = 'aui-sortable-list__content';
        li.append(handle, body);
        row = { item, li, handle, body, content: undefined };
        this.#rows.set(item.id, row);
      }
      row.item = item;
      row.li.dataset.id = item.id;
      const disabled = listDisabled || item.disabled === true;
      row.li.classList.toggle('aui-sortable-list__item--disabled', disabled);
      row.handle.disabled = disabled;
      row.handle.setAttribute('aria-label', getMessage('sortableList', 'handle', { label: item.label }));
      row.handle.setAttribute('aria-pressed', 'false');
      row.handle.replaceChildren(renderIcon(o.icons?.handle ?? 'menu', { doc }));
      const content = item.content ?? item.label;
      if (content !== row.content) {
        row.body.replaceChildren(typeof content === 'string' ? doc.createTextNode(content) : content);
        row.content = content;
      }
      lis.push(row.li);
    }
    // Replace children only when the order differs, so a focused handle is never moved.
    const current = this.list.children;
    if (current.length !== lis.length || lis.some((li, i) => current[i] !== li)) {
      // Reordering through replaceChildren blurs a focused handle: put focus back.
      const active = this.#doc.activeElement;
      this.list.replaceChildren(...lis);
      if (active instanceof HTMLElement && active !== this.#doc.activeElement && this.list.contains(active)) active.focus();
    }
  }

  /** Keep `options.items` in the committed order, so later re-renders never undo a reorder. */
  #commitOrder(): void {
    const byId = new Map(this.#options.items.map((i) => [i.id, i]));
    const items = this.order.map((id) => byId.get(id)).filter((i): i is SortableListItem => i !== undefined);
    this.#options = { ...this.#options, items };
  }

  #rowFor(target: EventTarget | null): Row | undefined {
    if (!(target instanceof Element)) return undefined;
    const li = target.closest<HTMLLIElement>('.aui-sortable-list__item');
    const id = li?.dataset.id;
    return id === undefined ? undefined : this.#rows.get(id);
  }

  #indexOf(li: HTMLLIElement): number {
    return Array.prototype.indexOf.call(this.list.children, li);
  }

  #isMovable(row: Row): boolean {
    return this.#options.disabled !== true && row.item.disabled !== true;
  }

  /**
   * Move `li` to `index` by moving its siblings around it: the element itself never
   * leaves the DOM, so it keeps focus and the list keeps pointer capture.
   */
  #moveTo(li: HTMLLIElement, index: number): void {
    let at = this.#indexOf(li);
    while (at > index) {
      const previous = li.previousElementSibling;
      if (!previous) break;
      li.after(previous);
      at -= 1;
    }
    while (at < index) {
      const next = li.nextElementSibling;
      if (!next) break;
      li.before(next);
      at += 1;
    }
  }

  #say(key: 'grabbed' | 'moved' | 'dropped' | 'canceled', row: Row): void {
    const position = this.#indexOf(row.li) + 1;
    announce(getMessage('sortableList', key, { label: row.item.label, position, count: this.#rows.size }), 'assertive', this.#doc);
  }

  #begin(row: Row, source: Session['source']): void {
    this.#session = { row, from: this.#indexOf(row.li), source, startTop: 0, offset: 0 };
    row.li.classList.add('aui-sortable-list__item--grabbed');
    row.handle.setAttribute('aria-pressed', 'true');
    // Escape must cancel the reorder, not close an enclosing overlay: window capture
    // runs before the overlay stack's document listener.
    const win = this.#doc.defaultView ?? window;
    const onKey = (event: KeyboardEvent): void => {
      if (event.key !== 'Escape' || this.#session?.source !== 'keyboard') return;
      event.preventDefault();
      event.stopPropagation();
      this.#cancel();
    };
    win.addEventListener('keydown', onKey, true);
    this.#stopEscape = () => {
      win.removeEventListener('keydown', onKey, true);
    };
  }

  #end(): Session | null {
    const s = this.#session;
    if (!s) return null;
    this.#session = null;
    this.#stopEscape?.();
    this.#stopEscape = null;
    s.row.li.classList.remove('aui-sortable-list__item--grabbed', 'aui-sortable-list__item--dragging');
    s.row.li.style.removeProperty('--aui-sortable-list-offset');
    s.row.handle.setAttribute('aria-pressed', 'false');
    return s;
  }

  #drop(): void {
    const s = this.#end();
    if (!s) return;
    const to = this.#indexOf(s.row.li);
    this.#commitOrder();
    this.#say('dropped', s.row);
    if (to !== s.from) emit(this.host, 'aui-change', { order: this.order, id: s.row.item.id, from: s.from, to } satisfies SortableListChangeDetail);
  }

  /** Put the item back where the session started. */
  #cancel(announceIt = true): void {
    const s = this.#end();
    // After #end: the drag's onCancel finds no session and does not re-enter.
    this.#drag?.cancel();
    if (!s) return;
    this.#moveTo(s.row.li, s.from);
    if (announceIt) this.#say('canceled', s.row);
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (event.altKey || event.ctrlKey || event.metaKey) return;
    const target = event.target;
    if (!(target instanceof HTMLButtonElement) || !target.classList.contains('aui-sortable-list__handle')) return;
    const row = this.#rowFor(target);
    if (!row) return;
    const s = this.#session;
    if (event.key === ' ' || event.key === 'Enter') {
      event.preventDefault();
      if (s?.row === row) {
        this.#drop();
      } else if (!s && this.#isMovable(row)) {
        this.#begin(row, 'keyboard');
        this.#say('grabbed', row);
      }
      return;
    }
    if (s?.row !== row || s.source !== 'keyboard') return;
    const at = this.#indexOf(row.li);
    const last = this.#rows.size - 1;
    let to: number;
    switch (event.key) {
      case 'ArrowUp':
      case 'ArrowLeft':
        to = Math.max(0, at - 1);
        break;
      case 'ArrowDown':
      case 'ArrowRight':
        to = Math.min(last, at + 1);
        break;
      case 'Home':
        to = 0;
        break;
      case 'End':
        to = last;
        break;
      case 'Tab':
        // Leaving the handle cancels (focusout).
        return;
      default:
        // Other keys are swallowed while grabbed so they do not scroll or type.
        event.preventDefault();
        return;
    }
    event.preventDefault();
    if (to === at) return;
    this.#moveTo(row.li, to);
    row.handle.focus();
    this.#say('moved', row);
  }

  #canStartPointer(event: PointerEvent): boolean {
    if (this.#session) return false;
    const target = event.target;
    if (!(target instanceof Element)) return false;
    const fromHandle = target.closest('.aui-sortable-list__handle') !== null;
    if (!fromHandle && this.#config().dragFrom !== 'item') return false;
    // Interactive consumer content keeps its own pointer behavior.
    if (!fromHandle && target.closest('a, button, input, select, textarea, label, [contenteditable]:not([contenteditable="false"])')) return false;
    const row = this.#rowFor(target);
    if (!row || !this.#isMovable(row)) return false;
    this.#pending = row;
    return true;
  }

  #startPointer(): void {
    const row = this.#pending;
    this.#pending = null;
    if (!row) return;
    this.#begin(row, 'pointer');
    const s = this.#session;
    if (!s) return;
    s.startTop = row.li.getBoundingClientRect().top;
    row.li.classList.add('aui-sortable-list__item--dragging');
    this.#say('grabbed', row);
  }

  #movePointer(move: DragMove): void {
    const s = this.#session;
    if (s?.source !== 'pointer') return;
    const li = s.row.li;
    const listRect = this.list.getBoundingClientRect();
    const height = li.getBoundingClientRect().height;
    // Keep the dragged item within the list.
    const top = Math.min(Math.max(s.startTop + move.dy, listRect.top), listRect.bottom - height);
    const middle = top + height / 2;
    const before = this.#indexOf(li);
    let next = li.nextElementSibling;
    while (next instanceof HTMLElement && middle > next.getBoundingClientRect().top + next.getBoundingClientRect().height / 2) {
      li.before(next);
      next = li.nextElementSibling;
    }
    let previous = li.previousElementSibling;
    while (previous instanceof HTMLElement && middle < previous.getBoundingClientRect().top + previous.getBoundingClientRect().height / 2) {
      li.after(previous);
      previous = li.previousElementSibling;
    }
    // The layout position (without the drag offset) after siblings moved.
    const layoutTop = li.getBoundingClientRect().top - s.offset;
    s.offset = Math.round(top - layoutTop);
    li.style.setProperty('--aui-sortable-list-offset', `${s.offset}px`);
    if (this.#indexOf(li) !== before) this.#say('moved', s.row);
  }
}
