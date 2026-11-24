/**
 * Pagination (SPEC section 18.12). A labelled <nav> of native buttons: previous/next,
 * optional first/last, page numbers with ellipses, an optional "rows per page"
 * <select>, and a result summary. Page changes are announced politely. At
 * narrow widths a container query swaps the page numbers for "Page 3 of 10".
 */
import { configurationError, DisposableGroup, defineComponentConfig, emit, formatNumber, getMessage, registerMessages, validators, createId, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';

export interface PaginationConfig {
  siblingCount: number;
  boundaryCount: number;
  showFirstLast: boolean;
  /** Show "Showing 11-20 of 57" when `total` is known. */
  showSummary: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    pagination: PaginationConfig & { locale: string; direction: Direction };
  }
}

export const paginationConfig = defineComponentConfig<PaginationConfig, 'locale' | 'direction'>(
  'pagination',
  {
    siblingCount: { default: 1, expected: 'integer from 0 to 10', validate: validators.integerInRange(0, 10) },
    boundaryCount: { default: 1, expected: 'integer from 0 to 10', validate: validators.integerInRange(0, 10) },
    showFirstLast: { default: false, expected: 'boolean', validate: validators.isBoolean },
    showSummary: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'direction'],
);

registerMessages('pagination', 'en', {
  label: 'Pagination',
  previous: 'Previous page',
  next: 'Next page',
  first: 'First page',
  last: 'Last page',
  page: 'Page {page}',
  pageOf: 'Page {page} of {count}',
  summary: 'Showing {start} to {end} of {total}',
  summaryEmpty: 'No results',
  rowsPerPage: 'Rows per page',
});

export interface PaginationIcons {
  previous: IconRef;
  next: IconRef;
  first: IconRef;
  last: IconRef;
}

export interface PaginationOptions extends Partial<PaginationConfig> {
  /** Current page, 1-based. Default 1. Clamped to the page count. */
  page?: number;
  /** Number of pages. Provide either this or `total` (with `pageSize`). */
  pageCount?: number;
  /** Total number of items; the page count is derived from `pageSize`. */
  total?: number;
  /** Items per page. Required with `total`; defaults to the first of `pageSizes`. */
  pageSize?: number;
  /** Render a native "Rows per page" <select> with these sizes. */
  pageSizes?: readonly number[];
  /** Accessible name of the <nav>. Default: localized "Pagination". */
  label?: string;
  locale?: string;
  direction?: Direction;
  icons?: Partial<PaginationIcons>;
}

export interface PaginationChangeDetail {
  page: number;
  pageSize: number | null;
}

export type PageItem = number | 'ellipsis';

const range = (from: number, to: number): number[] => (to < from ? [] : Array.from({ length: to - from + 1 }, (_, i) => from + i));

/**
 * Page numbers to render, with `'ellipsis'` for gaps. The output has a constant
 * length (2 x boundaryCount + 2 x siblingCount + 3) once there are more pages than
 * that, so controls do not jump while paging. A gap of a single page shows the page
 * instead of an ellipsis. `page` is clamped to 1..pageCount.
 */
export function getPageItems(page: number, pageCount: number, siblingCount = 1, boundaryCount = 1): PageItem[] {
  const isCount = validators.integerInRange(0, Number.MAX_SAFE_INTEGER);
  if (!Number.isInteger(page) || !isCount(pageCount) || !isCount(siblingCount) || !isCount(boundaryCount)) {
    throw configurationError('PAGINATION_ITEMS', 'Invalid page item arguments.', { component: 'pagination', property: 'getPageItems', expected: 'integers; counts >= 0' });
  }
  if (pageCount === 0) return [];
  const current = Math.min(Math.max(page, 1), pageCount);
  const slots = 2 * boundaryCount + 2 * siblingCount + 3;
  if (pageCount <= slots) return range(1, pageCount);

  const start = range(1, boundaryCount);
  const end = range(pageCount - boundaryCount + 1, pageCount);
  const leftGap = current - siblingCount > boundaryCount + 2;
  const rightGap = current + siblingCount < pageCount - boundaryCount - 1;
  // Both gaps closed implies pageCount <= slots, handled above.
  if (!leftGap) return [...range(1, boundaryCount + 2 * siblingCount + 2), 'ellipsis', ...end];
  if (!rightGap) return [...start, 'ellipsis', ...range(pageCount - boundaryCount - 2 * siblingCount - 1, pageCount)];
  return [...start, 'ellipsis', ...range(current - siblingCount, current + siblingCount), 'ellipsis', ...end];
}

type Resolved = Readonly<PaginationConfig & { locale: string; direction: Direction }>;

export class Pagination {
  readonly host: HTMLElement;
  readonly nav: HTMLElement;
  #options: PaginationOptions;
  #page: number;
  #pageSize: number | null;
  readonly #doc: Document;
  readonly #controls: HTMLDivElement;
  readonly #pages: HTMLUListElement;
  readonly #compact: HTMLSpanElement;
  readonly #summary: HTMLParagraphElement;
  readonly #sizeField: HTMLDivElement;
  readonly #sizeLabel: HTMLLabelElement;
  readonly #sizeSelect: HTMLSelectElement;
  readonly #first: HTMLButtonElement;
  readonly #previous: HTMLButtonElement;
  readonly #next: HTMLButtonElement;
  readonly #last: HTMLButtonElement;
  readonly #group = new DisposableGroup();

  /** Render pagination into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: PaginationOptions): Pagination {
    return new Pagination(host, options);
  }

  private constructor(host: HTMLElement, options: PaginationOptions) {
    Pagination.#assertOptions(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#pageSize = options.pageSize ?? options.pageSizes?.[0] ?? null;
    this.#page = options.page ?? 1;
    const doc = this.#doc;

    this.nav = doc.createElement('nav');
    this.nav.className = 'aui-pagination__nav';
    this.#controls = doc.createElement('div');
    this.#controls.className = 'aui-pagination__controls';
    const nav = (key: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `aui-pagination__button aui-pagination__${key}`;
      b.dataset.key = key;
      return b;
    };
    this.#first = nav('first');
    this.#previous = nav('previous');
    this.#next = nav('next');
    this.#last = nav('last');
    this.#pages = doc.createElement('ul');
    this.#pages.className = 'aui-pagination__pages';
    this.#compact = doc.createElement('span');
    this.#compact.className = 'aui-pagination__compact';
    this.#controls.append(this.#first, this.#previous, this.#pages, this.#compact, this.#next, this.#last);

    this.#summary = doc.createElement('p');
    this.#summary.className = 'aui-pagination__summary';
    this.#sizeField = doc.createElement('div');
    this.#sizeField.className = 'aui-pagination__size';
    this.#sizeLabel = doc.createElement('label');
    this.#sizeLabel.className = 'aui-pagination__size-label';
    this.#sizeSelect = doc.createElement('select');
    this.#sizeSelect.className = 'aui-pagination__size-select';
    this.#sizeSelect.id = createId('aui-pagination-size');
    this.#sizeLabel.htmlFor = this.#sizeSelect.id;
    this.#sizeField.append(this.#sizeLabel, this.#sizeSelect);

    this.nav.append(this.#summary, this.#controls, this.#sizeField);
    host.classList.add('aui-pagination');
    host.replaceChildren(this.nav);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#bindEvents();
    this.#group.add(paginationConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Current page (1-based; 1 when there are no pages). */
  get page(): number {
    return this.#page;
  }

  get pageCount(): number {
    const o = this.#options;
    if (o.pageCount !== undefined) return o.pageCount;
    const size = this.#pageSize;
    return o.total === undefined || size === null ? 0 : Math.ceil(o.total / size);
  }

  /** Items per page, or `null` when only `pageCount` is known. */
  get pageSize(): number | null {
    return this.#pageSize;
  }

  get options(): Readonly<PaginationOptions> {
    return this.#options;
  }

  /** Go to a page programmatically (clamped; no events, no announcement). */
  setPage(page: number): void {
    if (!Number.isInteger(page)) Pagination.#fail('page', 'integer');
    this.#page = page;
    this.#render();
  }

  update(options: Partial<PaginationOptions>): void {
    const next = { ...this.#options, ...options };
    // Switching between `pageCount` and `total` modes: an explicit key replaces the other.
    if (options.pageCount !== undefined) delete next.total;
    if (options.total !== undefined) delete next.pageCount;
    Pagination.#assertOptions(next);
    this.#options = next;
    if ('pageSize' in options || 'pageSizes' in options) this.#pageSize = next.pageSize ?? next.pageSizes?.[0] ?? null;
    if ('page' in options) this.#page = next.page ?? 1;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-pagination', 'aui-pagination--rtl');
  }

  static #fail(property: string, expected: string): never {
    throw configurationError('PAGINATION_OPTIONS', 'Invalid pagination options.', { component: 'pagination', property: `pagination.${property}`, expected });
  }

  static #assertOptions(o: PaginationOptions): void {
    const fail = Pagination.#fail;
    const isCount = validators.integerInRange(0, Number.MAX_SAFE_INTEGER);
    const isSize = validators.integerInRange(1, 1_000_000);
    if (o.page !== undefined && !Number.isInteger(o.page)) fail('page', 'integer');
    if (o.pageCount !== undefined && o.total !== undefined) fail('pageCount', 'either pageCount or total, not both');
    if (o.pageCount === undefined && o.total === undefined) fail('pageCount', 'pageCount or total');
    if (o.pageCount !== undefined && !isCount(o.pageCount)) fail('pageCount', 'integer >= 0');
    if (o.total !== undefined && !isCount(o.total)) fail('total', 'integer >= 0');
    if (o.pageSize !== undefined && !isSize(o.pageSize)) fail('pageSize', 'integer >= 1');
    if (o.pageSizes !== undefined) {
      if (!Array.isArray(o.pageSizes) || o.pageSizes.length === 0 || !o.pageSizes.every((s) => isSize(s))) fail('pageSizes', 'non-empty array of integers >= 1');
      if (o.pageSize !== undefined && !o.pageSizes.includes(o.pageSize)) fail('pageSize', 'one of pageSizes');
    }
    if (o.total !== undefined && o.pageSize === undefined && o.pageSizes === undefined) fail('pageSize', 'pageSize (or pageSizes) with total');
    if (o.label !== undefined && (typeof o.label !== 'string' || o.label.trim() === '')) fail('label', 'non-empty string');
    // Resolving validates the configurable options.
    Pagination.#resolve(o);
  }

  static #resolve(o: PaginationOptions): Resolved {
    return paginationConfig.resolve({
      ...(o.siblingCount === undefined ? {} : { siblingCount: o.siblingCount }),
      ...(o.boundaryCount === undefined ? {} : { boundaryCount: o.boundaryCount }),
      ...(o.showFirstLast === undefined ? {} : { showFirstLast: o.showFirstLast }),
      ...(o.showSummary === undefined ? {} : { showSummary: o.showSummary }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #bindEvents(): void {
    const g = this.#group;
    g.listen(this.#controls, 'click', (event) => {
      if (!(event.target instanceof Element)) return;
      const button = event.target.closest('button');
      if (!button || button.disabled || !this.#controls.contains(button)) return;
      const count = this.pageCount;
      const key = button.dataset.key ?? '';
      const target = key === 'first' ? 1 : key === 'previous' ? this.#page - 1 : key === 'next' ? this.#page + 1 : key === 'last' ? count : Number(button.dataset.page);
      this.#userChange(target, this.#pageSize);
    });
    g.listen(this.#sizeSelect, 'change', () => {
      const size = Number(this.#sizeSelect.value);
      const previous = this.#pageSize;
      // Keep the first item of the current page visible after the size changes.
      const firstItem = previous === null ? 0 : (this.#page - 1) * previous;
      this.#pageSize = size;
      this.#userChange(Math.floor(firstItem / size) + 1, size, true);
    });
  }

  #userChange(page: number, pageSize: number | null, force = false): void {
    const count = this.pageCount;
    const next = Math.min(Math.max(page, 1), Math.max(count, 1));
    if (next === this.#page && !force) return;
    const focusKey = this.#doc.activeElement instanceof HTMLElement ? this.#focusKey(this.#doc.activeElement) : null;
    this.#page = next;
    this.#render();
    this.#restoreFocus(focusKey);
    const config = this.#config();
    announce(this.#summaryText(config) ?? this.#pageOfText(config.locale), 'polite', this.#doc);
    emit(this.host, 'aui-change', { page: next, pageSize } satisfies PaginationChangeDetail);
  }

  #focusKey(el: HTMLElement): string | null {
    if (!this.#controls.contains(el)) return null;
    return el.dataset.key ?? null;
  }

  /** Re-rendering replaces page buttons; keep focus on the same control, or the current page. */
  #restoreFocus(key: string | null): void {
    if (key === null) return;
    const usable = (el: HTMLElement | null): el is HTMLButtonElement => el instanceof HTMLButtonElement && !el.disabled && el.getClientRects().length > 0;
    const candidates = [
      this.#controls.querySelector<HTMLElement>(`[data-key="${key}"]`),
      this.#pages.querySelector<HTMLElement>('[aria-current="page"]'),
      this.#previous,
      this.#next,
    ];
    candidates.find(usable)?.focus();
  }

  #config(): Resolved {
    return Pagination.#resolve(this.#options);
  }

  #pageOfText(locale: string): string {
    return getMessage('pagination', 'pageOf', { page: formatNumber(this.#page, {}, locale), count: formatNumber(Math.max(this.pageCount, 1), {}, locale) }, locale);
  }

  #summaryText(config: Resolved): string | null {
    const total = this.#options.total;
    const size = this.#pageSize;
    if (!config.showSummary || total === undefined || size === null) return null;
    if (total === 0) return getMessage('pagination', 'summaryEmpty', {}, config.locale);
    const start = (this.#page - 1) * size + 1;
    const end = Math.min(this.#page * size, total);
    const f = (n: number): string => formatNumber(n, {}, config.locale);
    return getMessage('pagination', 'summary', { start: f(start), end: f(end), total: f(total) }, config.locale);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const doc = this.#doc;
    const count = this.pageCount;
    this.#page = Math.min(Math.max(this.#page, 1), Math.max(count, 1));
    const page = this.#page;
    const msg = (key: string): string => getMessage('pagination', key, {}, locale);

    this.nav.setAttribute('aria-label', o.label ?? msg('label'));
    this.host.classList.toggle('aui-pagination--rtl', config.direction === 'rtl');

    const setNav = (b: HTMLButtonElement, key: keyof PaginationIcons, fallback: IconRef, disabled: boolean): void => {
      b.setAttribute('aria-label', msg(key));
      b.disabled = disabled;
      b.replaceChildren(renderIcon(o.icons?.[key] ?? fallback, { doc }));
    };
    setNav(this.#first, 'first', 'chevrons-left', page <= 1);
    setNav(this.#previous, 'previous', 'chevron-left', page <= 1);
    setNav(this.#next, 'next', 'chevron-right', page >= count);
    setNav(this.#last, 'last', 'chevrons-right', page >= count);
    this.#first.hidden = !config.showFirstLast;
    this.#last.hidden = !config.showFirstLast;

    const items = getPageItems(page, count, config.siblingCount, config.boundaryCount);
    this.#pages.replaceChildren(...items.map((item) => {
      const li = doc.createElement('li');
      li.className = 'aui-pagination__item';
      if (item === 'ellipsis') {
        li.classList.add('aui-pagination__ellipsis');
        li.setAttribute('aria-hidden', 'true');
        li.textContent = '...';
        return li;
      }
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-pagination__button aui-pagination__page';
      b.dataset.key = `page-${String(item)}`;
      b.dataset.page = String(item);
      b.textContent = formatNumber(item, {}, locale);
      b.setAttribute('aria-label', getMessage('pagination', 'page', { page: formatNumber(item, {}, locale) }, locale));
      if (item === page) b.setAttribute('aria-current', 'page');
      li.append(b);
      return li;
    }));
    this.#compact.textContent = this.#pageOfText(locale);

    const summary = this.#summaryText(config);
    this.#summary.textContent = summary ?? '';
    this.#summary.hidden = summary === null;

    const sizes = o.pageSizes;
    this.#sizeField.hidden = sizes === undefined;
    this.#sizeLabel.textContent = msg('rowsPerPage');
    if (sizes) {
      this.#sizeSelect.replaceChildren(...sizes.map((size) => {
        const option = doc.createElement('option');
        option.value = String(size);
        option.textContent = formatNumber(size, {}, locale);
        return option;
      }));
      this.#sizeSelect.value = String(this.#pageSize ?? sizes[0] ?? '');
    } else {
      this.#sizeSelect.replaceChildren();
    }
  }
}
