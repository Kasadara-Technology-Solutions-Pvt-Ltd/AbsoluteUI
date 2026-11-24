/**
 * Pivot Field List: edits a Pivot Grid's layout. Five labelled lists (available
 * fields, Filters, Columns, Rows, Values). Every field has a move handle with three
 * equivalent input paths: pointer drag onto a list; keyboard (Space or Enter grabs,
 * Up/Down reorder within the list, Left/Right move to the previous/next list,
 * Space or Enter drops, Escape cancels); and single pointer (click the handle, then
 * click the target list or entry). Values have an aggregate select; other fields a
 * member filter panel (search, paged "Show more", Select all, Clear, Apply). Every
 * change is applied with `grid.setLayout` or `grid.setFilter` on drop or Apply.
 * A separate class, so a grid without a field list does not bundle it.
 */
import { createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Direction } from '@absoluteui/core';
import { renderIcon } from '@absoluteui/icons';
import { announce, trackPointerDrag, type PointerDrag } from '@absoluteui/utilities';
import { fail, omit, type PivotAggregate, type PivotArea, type PivotKey, type PivotLayout, type PivotLayoutInput, type PivotMembersResult, type PivotValue } from './model.js';
import { assertPivotGrid, PIVOT_AGGREGATES, type PivotGrid } from './pivot-grid.js';

/** What the field list uses of a grid (any row type). */
interface GridTarget {
  readonly host: HTMLElement;
  readonly fields: readonly { readonly id: string; readonly label: string; readonly areas?: readonly PivotArea[]; readonly aggregate?: PivotAggregate }[];
  readonly layout: PivotLayout;
  setLayout(layout: PivotLayoutInput): void;
  setFilter(field: string, include: readonly PivotKey[] | null): void;
  members(field: string, options?: { search?: string; offset?: number; limit?: number }): Promise<PivotMembersResult & { labels: string[] }>;
}

export interface PivotFieldListConfig {
  /** Members loaded per page in a filter panel. Default 50. */
  memberPageSize: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    pivotFieldList: PivotFieldListConfig & { locale: string; direction: Direction };
  }
}

export const pivotFieldListConfig = defineComponentConfig<PivotFieldListConfig, 'locale' | 'direction'>(
  'pivotFieldList',
  {
    memberPageSize: { default: 50, expected: 'integer from 5 to 1000', validate: validators.integerInRange(5, 1000) },
  },
  ['locale', 'direction'],
);

registerMessages('pivotFieldList', 'en', {
  available: 'Fields',
  filters: 'Filters',
  columns: 'Columns',
  rows: 'Rows',
  values: 'Values',
  emptyArea: 'No fields',
  instructions: 'To move a field, press Space or Enter on its handle. Up and Down arrow keys reorder it, Left and Right arrow keys move it to another list, Space or Enter drops it, Escape cancels. With a pointer, drag the handle, or click it and then click a list.',
  handle: 'Move {field}',
  grabbed: '{field} grabbed. {area}, position {position} of {count}.',
  moved: '{area}, position {position} of {count}.',
  dropped: '{field} dropped in {area}, position {position} of {count}.',
  cancelled: 'Move cancelled. {field} is back in {area}.',
  notAllowed: '{field} cannot be placed in {area}.',
  aggregate: 'Aggregate of {field}',
  sum: 'Sum',
  count: 'Count',
  average: 'Average',
  min: 'Minimum',
  max: 'Maximum',
  distinctCount: 'Distinct count',
  filter: 'Filter {field}',
  filtered: 'filtered',
  remove: 'Remove {field}',
  search: 'Search {field}',
  members: 'Members of {field}',
  selectAll: 'Select all',
  clear: 'Clear',
  showMore: 'Show more',
  apply: 'Apply',
  cancel: 'Cancel',
  shown: '{shown} of {total}',
  loadFailed: 'The members could not be loaded.',
  loading: 'Loading',
});

type ListId = 'available' | PivotArea;
const LISTS: readonly ListId[] = ['available', 'filters', 'columns', 'rows', 'values'];

export interface PivotFieldListOptions<Row = unknown> {
  grid: PivotGrid<Row>;
  /** Accessible name of the field list group. */
  label: string;
  /** Members per filter page, integer 5..1000. */
  memberPageSize?: number;
  locale?: string;
  direction?: Direction;
}

/** Detail of `aui-field-move` (after the layout was applied). */
export interface PivotFieldMoveDetail {
  field: string;
  from: ListId;
  to: ListId;
  index: number;
}

interface Lists {
  available: string[];
  filters: string[];
  columns: string[];
  rows: string[];
  values: string[];
}

interface Grab {
  readonly field: string;
  readonly from: ListId;
  readonly start: Lists;
  lists: Lists;
  readonly mode: 'keyboard' | 'pointer';
}

interface FilterPanel {
  readonly field: string;
  readonly el: HTMLDivElement;
  readonly list: HTMLUListElement;
  readonly status: HTMLSpanElement;
  readonly more: HTMLButtonElement;
  readonly search: HTMLInputElement;
  /** Loaded members in order. */
  keys: PivotKey[];
  labels: string[];
  total: number;
  /** `except`: every member but `set` is checked; `only`: exactly `set` is checked. */
  mode: 'except' | 'only';
  set: Set<PivotKey>;
  request: number;
}

export class PivotFieldList {
  readonly host: HTMLElement;
  #options: Omit<PivotFieldListOptions, 'grid'> & { grid: GridTarget };
  readonly #group = new DisposableGroup();
  readonly #doc: Document;
  readonly #instructions: HTMLParagraphElement;
  readonly #listEls = new Map<ListId, HTMLUListElement>();
  #lists: Lists;
  #aggregates = new Map<string, PivotAggregate>();
  #grab: Grab | null = null;
  #drags: PointerDrag[] = [];
  #marker: HTMLLIElement | null = null;
  #panel: FilterPanel | null = null;
  #suppressBlur = false;

  static create<Row>(host: HTMLElement, options: PivotFieldListOptions<Row>): PivotFieldList {
    return new PivotFieldList(host, options);
  }

  private constructor(host: HTMLElement, options: Omit<PivotFieldListOptions, 'grid'> & { grid: GridTarget }) {
    PivotFieldList.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#lists = this.#fromLayout(this.#grid().layout);
    host.classList.add('aui-pivot-fields');
    host.setAttribute('role', 'group');
    host.setAttribute('aria-label', options.label);
    this.#instructions = this.#doc.createElement('p');
    this.#instructions.className = 'aui-pivot-fields__instructions';
    this.#instructions.id = createId('aui-pivot-fields-help');
    const doc = this.#doc;
    const areas = doc.createElement('div');
    areas.className = 'aui-pivot-fields__areas';
    for (const id of LISTS) {
      const section = doc.createElement('div');
      section.className = `aui-pivot-fields__area aui-pivot-fields__area--${id}`;
      const title = doc.createElement('div');
      title.className = 'aui-pivot-fields__title';
      title.id = createId('aui-pivot-fields-title');
      const ul = doc.createElement('ul');
      ul.className = 'aui-pivot-fields__list';
      ul.dataset.auiList = id;
      ul.setAttribute('aria-labelledby', title.id);
      section.append(title, ul);
      if (id === 'available') host.append(section);
      else areas.append(section);
      this.#listEls.set(id, ul);
    }
    host.append(areas, this.#instructions);
    this.#render();
    const g = this.#group;
    const onChange = (): void => {
      if (this.#grab) return;
      this.#lists = this.#fromLayout(this.#grid().layout);
      this.#render();
    };
    const gridHost = this.#grid().host;
    gridHost.addEventListener('aui-layout-change', onChange);
    g.add(() => {
      gridHost.removeEventListener('aui-layout-change', onChange);
    });
    g.listen(host, 'click', (e) => {
      this.#onClick(e);
    });
    g.listen(host, 'change', (e) => {
      this.#onChange(e);
    });
    g.listen(host, 'keydown', (e) => {
      this.#onKey(e);
    });
    // Single-pointer moves: a press on a list keeps focus on the grabbed handle (no blur drop).
    g.listen(host, 'mousedown', (e) => {
      const t = e.target instanceof Element ? e.target : null;
      if (this.#grab?.mode === 'keyboard' && t && !t.closest('input, select, .aui-pivot-fields__handle')) e.preventDefault();
    });
    g.listen(host, 'input', (e) => {
      if (e.target === this.#panel?.search) this.#searchMembers();
    });
    g.listen(host, 'focusout', (e) => {
      const grab = this.#grab;
      if (grab?.mode !== 'keyboard' || this.#suppressBlur) return;
      const next = e.relatedTarget;
      if (next instanceof Node && host.contains(next)) return;
      this.#drop();
    });
    g.add(pivotFieldListConfig.subscribe(() => {
      this.#render();
    }));
  }

  update(options: Partial<Omit<PivotFieldListOptions, 'grid'>>): void {
    const next = { ...this.#options, ...options };
    PivotFieldList.#assert(next);
    this.#cancel(false);
    this.#options = next;
    this.host.setAttribute('aria-label', next.label);
    this.#lists = this.#fromLayout(this.#grid().layout);
    this.#render();
  }

  destroy(): void {
    this.#cancel(false);
    for (const d of this.#drags) d.dispose();
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-pivot-fields');
    this.host.removeAttribute('role');
    this.host.removeAttribute('aria-label');
  }

  static #assert(o: Omit<PivotFieldListOptions, 'grid'> & { grid: unknown }): void {
    assertPivotGrid(o.grid);
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string', 'PIVOT_FIELD_LIST_OPTIONS', 'pivotFieldList');
    if (o.memberPageSize !== undefined && !validators.integerInRange(5, 1000)(o.memberPageSize)) fail('memberPageSize', 'integer from 5 to 1000', 'PIVOT_FIELD_LIST_OPTIONS', 'pivotFieldList');
  }

  #grid(): GridTarget {
    return this.#options.grid;
  }

  #config(): Readonly<PivotFieldListConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<PivotFieldListConfig & { locale: string; direction: Direction }> = {};
    if (o.memberPageSize !== undefined) input.memberPageSize = o.memberPageSize;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return pivotFieldListConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('pivotFieldList', key, params, this.#config().locale);
  }

  #label(field: string): string {
    return this.#grid().fields.find((f) => f.id === field)?.label ?? field;
  }

  #allowed(field: string, list: ListId): boolean {
    if (list === 'available') return true;
    const areas = this.#grid().fields.find((f) => f.id === field)?.areas;
    return areas === undefined || areas.includes(list);
  }

  #fromLayout(layout: PivotLayout): Lists {
    this.#aggregates = new Map(layout.values.map((v) => [v.field, v.aggregate]));
    const values = layout.values.map((v) => v.field);
    const placed = new Set([...layout.filters, ...layout.columns, ...layout.rows, ...values]);
    return {
      available: this.#grid().fields.map((f) => f.id).filter((id) => !placed.has(id)),
      filters: [...layout.filters],
      columns: [...layout.columns],
      rows: [...layout.rows],
      values,
    };
  }

  #where(lists: Lists, field: string): { list: ListId; index: number } {
    for (const id of LISTS) {
      const index = lists[id].indexOf(field);
      if (index !== -1) return { list: id, index };
    }
    return { list: 'available', index: 0 };
  }

  #render(): void {
    const lists = this.#grab?.lists ?? this.#lists;
    const doc = this.#doc;
    for (const d of this.#drags) d.dispose();
    this.#drags = [];
    this.#instructions.textContent = this.#msg('instructions');
    const filters = this.#grid().layout.include;
    for (const id of LISTS) {
      const ul = this.#listEls.get(id);
      if (!ul) continue;
      const title = ul.previousElementSibling;
      if (title) title.textContent = this.#msg(id);
      const items: HTMLLIElement[] = [];
      for (const field of lists[id]) items.push(this.#entry(field, id, field in filters));
      if (items.length === 0) {
        const li = doc.createElement('li');
        li.className = 'aui-pivot-fields__empty';
        li.textContent = this.#msg('emptyArea');
        items.push(li);
      }
      ul.replaceChildren(...items);
    }
    if (this.#panel) {
      // Keep an open filter panel under its field (it was detached with the old entry).
      const entry = this.#entryEl(this.#panel.field);
      if (entry) {
        entry.append(this.#panel.el);
        entry.querySelector('.aui-pivot-fields__filter')?.setAttribute('aria-expanded', 'true');
      } else this.#panel = null;
    }
  }

  #entryEl(field: string): HTMLLIElement | null {
    return [...this.host.querySelectorAll<HTMLLIElement>('.aui-pivot-fields__entry')].find((li) => li.dataset.auiField === field) ?? null;
  }

  #entry(field: string, list: ListId, filtered: boolean): HTMLLIElement {
    const doc = this.#doc;
    const label = this.#label(field);
    const li = doc.createElement('li');
    li.className = 'aui-pivot-fields__entry';
    li.dataset.auiField = field;
    const grabbed = this.#grab?.field === field;
    li.classList.toggle('aui-pivot-fields__entry--grabbed', grabbed);
    const handle = doc.createElement('button');
    handle.type = 'button';
    handle.className = 'aui-pivot-fields__handle';
    handle.setAttribute('aria-label', this.#msg('handle', { field: label }));
    handle.setAttribute('aria-describedby', this.#instructions.id);
    handle.setAttribute('aria-pressed', String(grabbed));
    handle.append(renderIcon('grip', { doc }));
    const text = doc.createElement('span');
    text.className = 'aui-pivot-fields__label';
    text.textContent = label;
    li.append(handle, text);
    if (list === 'values') {
      const select = doc.createElement('select');
      select.className = 'aui-pivot-fields__aggregate';
      select.setAttribute('aria-label', this.#msg('aggregate', { field: label }));
      const current = this.#aggregates.get(field) ?? this.#defaultAggregate(field);
      for (const a of PIVOT_AGGREGATES) {
        const option = doc.createElement('option');
        option.value = a;
        option.textContent = this.#msg(a);
        option.selected = a === current;
        select.append(option);
      }
      li.append(select);
    } else {
      const filter = doc.createElement('button');
      filter.type = 'button';
      filter.className = 'aui-pivot-fields__filter';
      filter.setAttribute('aria-expanded', 'false');
      filter.classList.toggle('aui-pivot-fields__filter--active', filtered);
      filter.append(renderIcon('filter', { doc }));
      const name = doc.createElement('span');
      name.className = 'aui-pivot-fields__sr';
      name.textContent = filtered ? `${this.#msg('filter', { field: label })}, ${this.#msg('filtered')}` : this.#msg('filter', { field: label });
      filter.append(name);
      li.append(filter);
    }
    if (list !== 'available') {
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'aui-pivot-fields__remove';
      remove.setAttribute('aria-label', this.#msg('remove', { field: label }));
      remove.append(renderIcon('close', { doc }));
      li.append(remove);
    }
    this.#drags.push(this.#pointer(handle, field));
    return li;
  }

  #defaultAggregate(field: string): PivotAggregate {
    return this.#grid().fields.find((f) => f.id === field)?.aggregate ?? 'sum';
  }

  // ---- moving --------------------------------------------------------------

  #copy(lists: Lists): Lists {
    return { available: [...lists.available], filters: [...lists.filters], columns: [...lists.columns], rows: [...lists.rows], values: [...lists.values] };
  }

  #place(lists: Lists, field: string, to: ListId, index: number): Lists {
    const next = this.#copy(lists);
    for (const id of LISTS) next[id] = next[id].filter((f) => f !== field);
    const target = next[to];
    target.splice(Math.max(0, Math.min(index, target.length)), 0, field);
    return next;
  }

  #startGrab(field: string, mode: Grab['mode']): void {
    this.#cancel(false);
    const from = this.#where(this.#lists, field).list;
    this.#grab = { field, from, start: this.#copy(this.#lists), lists: this.#copy(this.#lists), mode };
    this.#rerender(field);
    if (mode === 'keyboard') {
      const at = this.#where(this.#lists, field);
      announce(this.#msg('grabbed', { field: this.#label(field), area: this.#msg(at.list), position: String(at.index + 1), count: String(this.#lists[at.list].length) }), 'assertive');
    }
  }

  /** Re-render keeping focus on a field's handle (DOM entries are recreated). */
  #rerender(focusField: string | null): void {
    this.#suppressBlur = true;
    this.#render();
    if (focusField !== null) this.#entryEl(focusField)?.querySelector<HTMLElement>('.aui-pivot-fields__handle')?.focus({ preventScroll: true });
    this.#suppressBlur = false;
  }

  #moveTo(to: ListId, index: number): boolean {
    const grab = this.#grab;
    if (!grab) return false;
    if (!this.#allowed(grab.field, to)) {
      announce(this.#msg('notAllowed', { field: this.#label(grab.field), area: this.#msg(to) }), 'assertive');
      return false;
    }
    grab.lists = this.#place(grab.lists, grab.field, to, index);
    this.#rerender(grab.mode === 'keyboard' ? grab.field : null);
    return true;
  }

  #drop(): void {
    const grab = this.#grab;
    if (!grab) return;
    this.#grab = null;
    this.#hideMarker();
    const at = this.#where(grab.lists, grab.field);
    const changed = JSON.stringify(grab.lists) !== JSON.stringify(grab.start);
    this.#lists = grab.lists;
    if (changed) this.#apply(grab.field, at.list);
    this.#rerender(grab.mode === 'keyboard' ? grab.field : null);
    if (grab.mode === 'keyboard') announce(this.#msg('dropped', { field: this.#label(grab.field), area: this.#msg(at.list), position: String(at.index + 1), count: String(grab.lists[at.list].length) }), 'assertive');
    if (changed) {
      const detail: PivotFieldMoveDetail = { field: grab.field, from: grab.from, to: at.list, index: at.index };
      emit(this.host, 'aui-field-move', detail);
    }
  }

  #cancel(announceIt: boolean): void {
    const grab = this.#grab;
    if (!grab) return;
    this.#grab = null;
    this.#hideMarker();
    this.#rerender(grab.mode === 'keyboard' ? grab.field : null);
    if (announceIt) announce(this.#msg('cancelled', { field: this.#label(grab.field), area: this.#msg(grab.from) }), 'assertive');
  }

  /** Apply the lists to the grid (a field moved to the available list loses its filter). */
  #apply(field: string, to: ListId): void {
    const grid = this.#grid();
    const layout = grid.layout;
    const values: PivotValue[] = this.#lists.values.map((f) => ({ field: f, aggregate: this.#aggregates.get(f) ?? this.#defaultAggregate(f) }));
    const include = to === 'available' ? omit(layout.include, field) : { ...layout.include };
    grid.setLayout({ ...layout, rows: this.#lists.rows, columns: this.#lists.columns, filters: this.#lists.filters, values, include, expanded: null });
  }

  #onKey(e: KeyboardEvent): void {
    const target = e.target instanceof HTMLElement ? e.target : null;
    if (!target?.classList.contains('aui-pivot-fields__handle')) {
      if (e.key === 'Escape' && this.#panel && this.#panel.el.contains(target)) {
        e.preventDefault();
        e.stopPropagation();
        this.#closePanel(true);
      }
      return;
    }
    const field = target.closest<HTMLElement>('.aui-pivot-fields__entry')?.dataset.auiField;
    const grab = this.#grab;
    if (!field || grab?.field !== field) return;
    const rtl = this.#config().direction === 'rtl';
    const at = this.#where(grab.lists, field);
    if (e.key === 'Escape') {
      e.preventDefault();
      e.stopPropagation();
      this.#cancel(true);
      return;
    }
    if (e.key === 'Tab') {
      this.#drop();
      return;
    }
    let moved = false;
    if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
      e.preventDefault();
      const index = at.index + (e.key === 'ArrowUp' ? -1 : 1);
      if (index < 0 || index >= grab.lists[at.list].length) return;
      moved = this.#moveTo(at.list, index);
    } else if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      e.preventDefault();
      const step = (e.key === 'ArrowRight') !== rtl ? 1 : -1;
      let i = LISTS.indexOf(at.list);
      // Skip lists the field may not be placed in.
      for (;;) {
        i += step;
        const to = LISTS[i];
        if (to === undefined) return;
        if (this.#allowed(field, to)) {
          moved = this.#moveTo(to, grab.lists[to].length);
          break;
        }
      }
    } else if (e.key === 'Home' || e.key === 'End') {
      e.preventDefault();
      moved = this.#moveTo(at.list, e.key === 'Home' ? 0 : grab.lists[at.list].length);
    }
    if (moved) {
      const now = this.#where(this.#grab?.lists ?? grab.lists, field);
      announce(this.#msg('moved', { area: this.#msg(now.list), position: String(now.index + 1), count: String((this.#grab?.lists ?? grab.lists)[now.list].length) }), 'assertive');
    }
  }

  #onClick(e: MouseEvent): void {
    const target = e.target instanceof Element ? e.target : null;
    if (!target) return;
    const entry = target.closest<HTMLElement>('.aui-pivot-fields__entry');
    const field = entry?.dataset.auiField;
    const handle = target.closest('.aui-pivot-fields__handle');
    const grab = this.#grab;
    if (handle && field) {
      if (grab?.field === field) this.#drop();
      else this.#startGrab(field, 'keyboard');
      return;
    }
    // Single-pointer drop: while a field is grabbed, a click on a list or an entry places it there.
    if (grab?.mode === 'keyboard') {
      const ul = target.closest<HTMLUListElement>('.aui-pivot-fields__list') ?? target.closest('.aui-pivot-fields__area')?.querySelector<HTMLUListElement>('.aui-pivot-fields__list') ?? null;
      const list = ul?.dataset.auiList as ListId | undefined;
      if (list && LISTS.includes(list)) {
        const index = field && field !== grab.field ? grab.lists[list].indexOf(field) : grab.lists[list].length;
        if (this.#moveTo(list, index === -1 ? grab.lists[list].length : index)) this.#drop();
        return;
      }
    }
    if (!field) {
      this.#panelClick(target);
      return;
    }
    if (target.closest('.aui-pivot-fields__remove')) {
      this.#lists = this.#place(this.#lists, field, 'available', this.#lists.available.length);
      const from = this.#where(this.#fromLayout(this.#grid().layout), field).list;
      this.#apply(field, 'available');
      this.#rerender(null);
      this.#listEls.get(from)?.querySelector<HTMLElement>('.aui-pivot-fields__handle')?.focus({ preventScroll: true });
      const detail: PivotFieldMoveDetail = { field, from, to: 'available', index: this.#lists.available.indexOf(field) };
      emit(this.host, 'aui-field-move', detail);
      return;
    }
    if (target.closest('.aui-pivot-fields__filter')) {
      if (this.#panel?.field === field) this.#closePanel(true);
      else this.#openPanel(field);
      return;
    }
    this.#panelClick(target);
  }

  #onChange(e: Event): void {
    const target = e.target;
    if (target instanceof HTMLSelectElement && target.classList.contains('aui-pivot-fields__aggregate')) {
      const field = target.closest<HTMLElement>('.aui-pivot-fields__entry')?.dataset.auiField;
      if (!field || !PIVOT_AGGREGATES.includes(target.value as PivotAggregate)) return;
      this.#aggregates.set(field, target.value as PivotAggregate);
      const grid = this.#grid();
      const layout = grid.layout;
      grid.setLayout({ ...layout, values: layout.values.map((v) => (v.field === field ? { field, aggregate: target.value as PivotAggregate } : v)), expanded: layout.expanded });
      return;
    }
    const panel = this.#panel;
    if (target instanceof HTMLInputElement && target.type === 'checkbox' && panel?.list.contains(target)) {
      const index = Number(target.dataset.auiIndex ?? '-1');
      const key = panel.keys[index];
      if (key === undefined) return;
      if ((panel.mode === 'only') === target.checked) panel.set.add(key);
      else panel.set.delete(key);
    }
  }

  #pointer(handle: HTMLButtonElement, field: string): PointerDrag {
    return trackPointerDrag(handle, {
      onStart: () => {
        this.#cancel(false);
        const from = this.#where(this.#lists, field).list;
        this.#grab = { field, from, start: this.#copy(this.#lists), lists: this.#copy(this.#lists), mode: 'pointer' };
        this.#entryEl(field)?.classList.add('aui-pivot-fields__entry--dragging');
      },
      onMove: (move) => {
        const grab = this.#grab;
        if (!grab) return;
        const entry = this.#entryEl(field);
        entry?.style.setProperty('translate', `${String(Math.round(move.dx))}px ${String(Math.round(move.dy))}px`);
        const hit = this.#hit(move.point.x, move.point.y);
        if (!hit || !this.#allowed(field, hit.list)) {
          this.#hideMarker();
          return;
        }
        this.#showMarker(hit.list, hit.index);
      },
      onEnd: (move) => {
        const grab = this.#grab;
        this.#entryEl(field)?.style.removeProperty('translate');
        const hit = this.#hit(move.point.x, move.point.y);
        if (grab && hit && this.#allowed(field, hit.list)) {
          const current = this.#where(grab.lists, field);
          // Indexes count the other entries: dropping below itself in the same list shifts by one.
          const index = current.list === hit.list && hit.index > current.index ? hit.index - 1 : hit.index;
          grab.lists = this.#place(grab.lists, field, hit.list, index);
        }
        this.#drop();
      },
      onCancel: () => {
        this.#entryEl(field)?.style.removeProperty('translate');
        this.#cancel(false);
      },
    });
  }

  /** List and insertion index under a client point (midpoints of the other entries). */
  #hit(x: number, y: number): { list: ListId; index: number } | null {
    for (const id of LISTS) {
      const ul = this.#listEls.get(id);
      const area = ul?.parentElement;
      if (!ul || !area) continue;
      const r = area.getBoundingClientRect();
      if (x < r.left || x > r.right || y < r.top || y > r.bottom) continue;
      const entries = [...ul.querySelectorAll<HTMLElement>(':scope > .aui-pivot-fields__entry')];
      let index = entries.length;
      for (let i = 0; i < entries.length; i++) {
        const el = entries[i];
        if (!el || el.dataset.auiField === this.#grab?.field) continue;
        const box = el.getBoundingClientRect();
        if (y < box.top + box.height / 2) {
          index = i;
          break;
        }
      }
      return { list: id, index };
    }
    return null;
  }

  #showMarker(list: ListId, index: number): void {
    const ul = this.#listEls.get(list);
    if (!ul) return;
    if (!this.#marker) {
      const li = this.#doc.createElement('li');
      li.className = 'aui-pivot-fields__marker';
      li.setAttribute('aria-hidden', 'true');
      this.#marker = li;
    }
    const entries = [...ul.querySelectorAll(':scope > .aui-pivot-fields__entry')];
    const before = entries[index] ?? null;
    if (this.#marker.parentElement !== ul || this.#marker.nextElementSibling !== before) ul.insertBefore(this.#marker, before);
  }

  #hideMarker(): void {
    this.#marker?.remove();
    this.#marker = null;
  }

  // ---- member filter panel ---------------------------------------------------

  #openPanel(field: string): void {
    this.#closePanel(false);
    const entry = this.#entryEl(field);
    if (!entry) return;
    const doc = this.#doc;
    const label = this.#label(field);
    const el = doc.createElement('div');
    el.className = 'aui-pivot-fields__panel';
    el.id = createId('aui-pivot-fields-panel');
    const search = doc.createElement('input');
    search.type = 'search';
    search.className = 'aui-pivot-fields__search';
    search.setAttribute('aria-label', this.#msg('search', { field: label }));
    search.autocomplete = 'off';
    const fieldset = doc.createElement('fieldset');
    fieldset.className = 'aui-pivot-fields__members';
    const legend = doc.createElement('legend');
    legend.className = 'aui-pivot-fields__sr';
    legend.textContent = this.#msg('members', { field: label });
    const list = doc.createElement('ul');
    list.className = 'aui-pivot-fields__member-list';
    fieldset.append(legend, list);
    const status = doc.createElement('span');
    status.className = 'aui-pivot-fields__status';
    status.setAttribute('role', 'status');
    const more = this.#button('showMore', 'aui-pivot-fields__more');
    more.hidden = true;
    const actions = doc.createElement('div');
    actions.className = 'aui-pivot-fields__actions';
    actions.append(this.#button('selectAll', 'aui-pivot-fields__select-all'), this.#button('clear', 'aui-pivot-fields__clear'), this.#button('apply', 'aui-pivot-fields__apply'), this.#button('cancel', 'aui-pivot-fields__cancel'));
    el.append(search, fieldset, status, more, actions);
    entry.append(el);
    const toggle = entry.querySelector('.aui-pivot-fields__filter');
    toggle?.setAttribute('aria-expanded', 'true');
    toggle?.setAttribute('aria-controls', el.id);
    const include = this.#grid().layout.include[field];
    this.#panel = { field, el, list, status, more, search, keys: [], labels: [], total: 0, mode: include ? 'only' : 'except', set: new Set(include ?? []), request: 0 };
    search.focus();
    void this.#loadMembers(false);
  }

  #button(key: string, className: string): HTMLButtonElement {
    const b = this.#doc.createElement('button');
    b.type = 'button';
    b.className = className;
    b.textContent = this.#msg(key);
    return b;
  }

  #closePanel(restoreFocus: boolean): void {
    const panel = this.#panel;
    if (!panel) return;
    this.#panel = null;
    panel.el.remove();
    const toggle = this.#entryEl(panel.field)?.querySelector<HTMLElement>('.aui-pivot-fields__filter');
    toggle?.setAttribute('aria-expanded', 'false');
    toggle?.removeAttribute('aria-controls');
    if (restoreFocus) toggle?.focus();
  }

  #searchMembers(): void {
    const panel = this.#panel;
    if (!panel) return;
    panel.keys = [];
    panel.labels = [];
    void this.#loadMembers(false);
  }

  async #loadMembers(append: boolean): Promise<void> {
    const panel = this.#panel;
    if (!panel) return;
    const request = ++panel.request;
    panel.status.textContent = this.#msg('loading');
    try {
      const page = await this.#grid().members(panel.field, { search: panel.search.value, offset: append ? panel.keys.length : 0, limit: this.#config().memberPageSize });
      if (this.#panel !== panel || request !== panel.request) return;
      if (!append) {
        panel.keys = [];
        panel.labels = [];
      }
      panel.keys.push(...page.members.map((m) => m.key));
      panel.labels.push(...page.labels);
      panel.total = page.total;
      this.#renderMembers(panel);
    } catch {
      if (this.#panel !== panel || request !== panel.request) return;
      panel.status.textContent = this.#msg('loadFailed');
    }
  }

  #renderMembers(panel: FilterPanel): void {
    const doc = this.#doc;
    const items = panel.keys.map((key, i) => {
      const li = doc.createElement('li');
      li.className = 'aui-pivot-fields__member';
      const input = doc.createElement('input');
      input.type = 'checkbox';
      input.id = createId('aui-pivot-member');
      input.dataset.auiIndex = String(i);
      input.checked = panel.set.has(key) === (panel.mode === 'only');
      const label = doc.createElement('label');
      label.htmlFor = input.id;
      label.textContent = panel.labels[i] ?? '';
      li.append(input, label);
      return li;
    });
    panel.list.replaceChildren(...items);
    panel.status.textContent = this.#msg('shown', { shown: String(panel.keys.length), total: String(panel.total) });
    panel.more.hidden = panel.keys.length >= panel.total;
  }

  #panelClick(target: Element): void {
    const panel = this.#panel;
    if (!panel?.el.contains(target)) return;
    const button = target.closest('button');
    if (!button) return;
    if (button === panel.more) {
      void this.#loadMembers(true);
    } else if (button.classList.contains('aui-pivot-fields__select-all')) {
      panel.mode = 'except';
      panel.set = new Set();
      this.#renderMembers(panel);
    } else if (button.classList.contains('aui-pivot-fields__clear')) {
      panel.mode = 'only';
      panel.set = new Set();
      this.#renderMembers(panel);
    } else if (button.classList.contains('aui-pivot-fields__cancel')) {
      this.#closePanel(true);
    } else if (button.classList.contains('aui-pivot-fields__apply')) {
      void this.#applyFilter(panel);
    }
  }

  async #applyFilter(panel: FilterPanel): Promise<void> {
    let include: PivotKey[] | null = null;
    if (panel.mode === 'only') include = [...panel.set];
    else if (panel.set.size > 0) {
      // Every member except the unchecked ones: list all members (not only the loaded or searched page).
      try {
        const all = await this.#grid().members(panel.field, { offset: 0, limit: 10_000 });
        include = all.members.map((m) => m.key).filter((k) => !panel.set.has(k));
      } catch {
        panel.status.textContent = this.#msg('loadFailed');
        return;
      }
    }
    if (this.#panel !== panel) return;
    this.#closePanel(true);
    this.#grid().setFilter(panel.field, include);
  }
}
