/**
 * HTTP services: `fetch` client with timeouts, idempotent-only retries, GET de-duplication, ETag
 * cache, typed JSON guards, RFC 9457 errors with failure categories, runtime interceptors,
 * lifecycle hooks, cancellation (all, by group, latest-wins), child clients, pagination, and XHR
 * upload progress (docs/PLAN-HELPERS.md section 3, docs/PLAN-R6.md). SSR-safe:
 * `fetch`/`XMLHttpRequest` are resolved per request.
 */
export {
  createHttpClient,
  type HttpClient,
  type HttpClientOptions,
  type RequestOptions,
  type HttpResponse,
  type ResponseType,
  type ResponseTypeMap,
  type FetchLike,
  type RetryPolicy,
  type HttpRequestContext,
  type RequestInterceptor,
  type ResponseInterceptor,
  type ErrorInterceptor,
  type InterceptorRegistry,
  type HttpInterceptors,
  type RequestInterceptors,
  type HttpHooks,
  type HttpCallInfo,
  type HttpRequestInfo,
  type HttpCallResult,
  type HttpOutcome,
  type EtagEntry,
  type EtagStore,
  type HttpAuth,
  type XsrfOptions,
  type HttpLogger,
} from './client.js';
export type { TransferProgress } from './body.js';
export { redactHeaders, isHttpError, isCancelled, toProblem, requestIdOf, SENSITIVE_HEADERS, type HeadersLike, type TrustServerMessages } from './errors.js';
export { paginate, type Page, type PaginateOptions, type TypedPaginateOptions, type LinkPagination, type CursorPagination, type OffsetPagination } from './paginate.js';
export { uploadWithProgress, type UploadWithProgressOptions, type UploadResponse, type XhrResponseType, type XhrResponseTypeMap } from './xhr.js';
