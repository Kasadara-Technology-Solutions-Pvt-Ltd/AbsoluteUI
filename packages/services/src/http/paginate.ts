/** Async-generator pagination over Link headers (RFC 8288), cursors or offsets. */
import { LimitError, ValidationError } from '@absoluteui/helpers/error';
import { getPaginationLinks } from '@absoluteui/helpers/http';
import { isPlainObject } from '@absoluteui/helpers/is';
import { isSameOrigin, parseUrl, type QueryInput } from '@absoluteui/helpers/url';
import type { HttpClient, HttpResponse, RequestOptions } from './client.js';

/** One fetched page. */
export interface Page<Item> {
  /** Items extracted from the page body. */
  readonly items: readonly Item[];
  /** Parsed JSON body. */
  readonly data: unknown;
  /** 0-based page number. */
  readonly index: number;
  readonly status: number;
  readonly headers: Headers;
}

interface PaginateBase {
  /** Query for the first request (cursor/offset parameters are added on top). */
  readonly query?: QueryInput;
  /** Extra request options (headers, signal, timeout, retry). */
  readonly request?: Omit<RequestOptions, 'responseType' | 'body' | 'query' | 'validate'>;
  /** Stop after this many pages. Default 100. */
  readonly maxPages?: number;
}

/** Follow `rel="next"` links from the `Link` header. */
export interface LinkPagination extends PaginateBase {
  readonly strategy: 'link';
  /** Follow `next` links to other origins. Default false (credentials would go to another host). */
  readonly allowCrossOrigin?: boolean;
}

/** Send the cursor from each page as a query parameter. */
export interface CursorPagination extends PaginateBase {
  readonly strategy: 'cursor';
  /** Query parameter name. Default `'cursor'`. */
  readonly cursorParam?: string;
  /** Next cursor from a page body. Default: `nextCursor`, `next_cursor` or `cursor.next`. Empty ends. */
  readonly getCursor?: (data: unknown) => string | null | undefined;
}

/** Increase an offset by the page size until a short page or `getTotal`. */
export interface OffsetPagination extends PaginateBase {
  readonly strategy: 'offset';
  /** Default 50. */
  readonly pageSize?: number;
  /** Default `'offset'`. */
  readonly offsetParam?: string;
  /** Default `'limit'`. */
  readonly limitParam?: string;
  /** Total item count from a page body, when the API reports one. */
  readonly getTotal?: (data: unknown) => number | undefined;
}

export type PaginateOptions = LinkPagination | CursorPagination | OffsetPagination;

/** Pagination options with a typed item extractor. */
export type TypedPaginateOptions<Item> = PaginateOptions & {
  /** Items of a page; validate here to get typed items. */
  readonly items: (data: unknown) => readonly Item[];
};

const ITEM_KEYS = ['items', 'data', 'results', 'records', 'value'] as const;

function defaultItems(data: unknown): readonly unknown[] {
  if (Array.isArray(data)) return data;
  if (isPlainObject(data)) {
    for (const k of ITEM_KEYS) {
      const v = data[k];
      if (Array.isArray(v)) return v;
    }
  }
  return [];
}

function defaultCursor(data: unknown): string | undefined {
  if (!isPlainObject(data)) return undefined;
  const c = data.nextCursor ?? data.next_cursor ?? (isPlainObject(data.cursor) ? data.cursor.next : undefined);
  return typeof c === 'string' ? c : typeof c === 'number' ? String(c) : undefined;
}

function baseHref(): string | undefined {
  const loc = (globalThis as { location?: { href?: unknown } }).location;
  return typeof loc?.href === 'string' ? loc.href : undefined;
}

/**
 * Iterates pages of a JSON collection. Stops at `maxPages`, at the last page, or when a
 * `next` link or cursor repeats. Cross-origin `next` links throw `SVC_HTTP_CROSS_ORIGIN_PAGE`
 * unless `allowCrossOrigin`.
 * @example
 * import { createMockFetch } from '@absoluteui/services/http-mock';
 * const fetch = createMockFetch([
 *   { url: '/users?page=2', body: [{ id: 3 }] },
 *   { url: '/users', body: [{ id: 1 }, { id: 2 }], headers: { link: '<http://localhost/users?page=2>; rel="next"' } },
 * ]);
 * const api = createHttpClient({ fetch, baseUrl: 'http://localhost' });
 * const ids: number[] = [];
 * const toIds = (d: unknown): number[] => (Array.isArray(d) ? d.map((u: { id: number }) => u.id) : []);
 * for await (const page of paginate(api, '/users', { strategy: 'link', items: toIds })) ids.push(...page.items);
 * ids; // => [1, 2, 3]
 * @example
 * import type { HttpClient } from '@absoluteui/services/http';
 * declare const api: HttpClient;
 * const nextCursor = (d: unknown) => (typeof d === 'object' && d !== null && 'next' in d && typeof d.next === 'string' ? d.next : null);
 * for await (const page of paginate(api, '/events', { strategy: 'cursor', getCursor: nextCursor })) console.log(page.index, page.items);
 */
export function paginate<Item>(client: HttpClient, url: string, options: TypedPaginateOptions<Item>): AsyncGenerator<Page<Item>, void, undefined>;
export function paginate(client: HttpClient, url: string, options: PaginateOptions & { readonly items?: undefined }): AsyncGenerator<Page<unknown>, void, undefined>;
export async function* paginate(client: HttpClient, url: string, options: PaginateOptions & { readonly items?: ((data: unknown) => readonly unknown[]) | undefined }): AsyncGenerator<Page<unknown>, void, undefined> {
  const maxPages = options.maxPages ?? 100;
  if (!Number.isSafeInteger(maxPages) || maxPages < 1) throw new ValidationError('SVC_HTTP_INVALID_MAX_PAGES', 'maxPages must be a positive integer.');
  const extract = options.items ?? defaultItems;
  const fetchPage = (target: string, query: QueryInput | undefined): Promise<HttpResponse<unknown>> => client.send('GET', target, { ...options.request, ...(query === undefined ? {} : { query }) });

  if (options.strategy === 'link') {
    // The origin check uses the first response's URL: the client resolves `url` against its
    // `baseUrl`, which may be another origin than the page.
    let firstAbs: string | undefined;
    const seen = new Set<string>();
    let target = url;
    let query: QueryInput | undefined = options.query;
    for (let index = 0; index < maxPages; index++) {
      const res = await fetchPage(target, query);
      query = undefined;
      yield { items: extract(res.data), data: res.data, index, status: res.status, headers: res.headers };
      const base: string | undefined = res.url !== '' ? parseUrl(res.url, baseHref())?.href : parseUrl(target, baseHref())?.href;
      firstAbs ??= base;
      const next: string | undefined = getPaginationLinks(res.headers.get('link'), base).next;
      if (next === undefined || seen.has(next)) return;
      seen.add(next);
      if (firstAbs && options.allowCrossOrigin !== true && parseUrl(next) && !isSameOrigin(next, firstAbs)) throw new ValidationError('SVC_HTTP_CROSS_ORIGIN_PAGE', 'The next page link points to another origin.');
      target = next;
    }
    return;
  }

  if (options.strategy === 'cursor') {
    const param = options.cursorParam ?? 'cursor';
    const getCursor = options.getCursor ?? defaultCursor;
    const seen = new Set<string>();
    let cursor: string | undefined;
    for (let index = 0; index < maxPages; index++) {
      const res = await fetchPage(url, cursor === undefined ? options.query : { ...options.query, [param]: cursor });
      yield { items: extract(res.data), data: res.data, index, status: res.status, headers: res.headers };
      const next = getCursor(res.data);
      if (next === undefined || next === null || next === '' || seen.has(next)) return;
      seen.add(next);
      cursor = next;
    }
    return;
  }

  const pageSize = options.pageSize ?? 50;
  if (!Number.isSafeInteger(pageSize) || pageSize < 1) throw new ValidationError('SVC_HTTP_INVALID_PAGE_SIZE', 'pageSize must be a positive integer.');
  const offsetParam = options.offsetParam ?? 'offset';
  const limitParam = options.limitParam ?? 'limit';
  let offset = 0;
  for (let index = 0; index < maxPages; index++) {
    const res = await fetchPage(url, { ...options.query, [offsetParam]: offset, [limitParam]: pageSize });
    const items = extract(res.data);
    yield { items, data: res.data, index, status: res.status, headers: res.headers };
    const total = options.getTotal?.(res.data);
    offset += items.length;
    if (items.length < pageSize || (total !== undefined && offset >= total)) return;
    if (!Number.isSafeInteger(offset)) throw new LimitError('SVC_HTTP_OFFSET_OVERFLOW', 'The pagination offset is too large.');
  }
}
