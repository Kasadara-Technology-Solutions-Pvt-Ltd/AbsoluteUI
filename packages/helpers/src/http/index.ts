/**
 * Pure HTTP helpers: status classification and retryability, Retry-After, RFC 9457 Problem
 * Details, RFC 8288 Link, content type and disposition, cache control, ETags, Accept-Language,
 * response assertions and user-facing messages (docs/PLAN-HELPERS.md section 2). No fetch.
 */
export {
  httpStatus,
  statusText,
  isInformational,
  isSuccess,
  isRedirect,
  isClientError,
  isServerError,
  isRetryableStatus,
  DEFAULT_RETRYABLE_STATUSES,
  isIdempotentMethod,
  isSafeMethod,
  userMessageForStatus,
  DEFAULT_STATUS_MESSAGES,
  statusClass,
  statusMessageCatalog,
  localizedStatusMessages,
  composeStatusMessages,
  describeStatus,
  type HttpStatusName,
  type StatusMessageCatalog,
  type StatusMessages,
  type StatusClass,
  type StatusDescription,
} from './status.js';
export {
  parseContentType,
  isJsonContentType,
  parseContentDisposition,
  decodeExtValue,
  parseCacheControl,
  parseETag,
  parseETagList,
  etagMatches,
  etagMatchesAny,
  parseAcceptLanguage,
  parseLinkHeader,
  getPaginationLinks,
  parseHttpDate,
  parseRetryAfter,
  type ContentType,
  type ContentDisposition,
  type CacheControl,
  type ETag,
  type LanguageRange,
  type Link,
  type LinkHeaderOptions,
  type PaginationLinks,
} from './headers.js';
export { parseProblemDetails, problemToFieldErrors, isProblemDetails, type ProblemDetails } from './problem.js';
export { assertResponse, classifyHttpError, safeUrlForLog, type ResponseLike, type AssertResponseOptions, type HttpErrorCategory } from './response.js';
export { httpFailureCategory, type HttpFailureCategory } from '../error/index.js';
