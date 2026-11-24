/** Upload with progress via `XMLHttpRequest` (fetch cannot report upload progress portably). */
import { HelperError, HttpError, ValidationError } from '@absoluteui/helpers/error';
import { isSuccess, type StatusMessageCatalog } from '@absoluteui/helpers/http';
import { safeJsonParse, type SafeJsonParseOptions } from '@absoluteui/helpers/json';
import { utf8Decode } from '@absoluteui/helpers/encoding';
import { isSafeUrl } from '@absoluteui/helpers/url';
import type { TransferProgress } from './body.js';
import { cancelledError, invalidResponseError, networkError, responseError, timeoutError, type TrustServerMessages } from './errors.js';

/** Response body types supported by `uploadWithProgress`. */
export type XhrResponseType = 'json' | 'text' | 'blob' | 'arrayBuffer';

/** Body type per `XhrResponseType`. */
export interface XhrResponseTypeMap {
  json: unknown;
  text: string;
  blob: Blob;
  arrayBuffer: ArrayBuffer;
}

export interface UploadWithProgressOptions<R extends XhrResponseType = XhrResponseType> {
  /** Default `'POST'`. */
  readonly method?: string;
  readonly headers?: HeadersInit;
  readonly signal?: AbortSignal | undefined;
  /** Upload progress; `total`/`percent` are `null` when the size is not computable. */
  readonly onProgress?: (progress: TransferProgress) => void;
  /** 0 (default) disables the timeout. */
  readonly timeoutMs?: number;
  /** Send cookies cross-origin. Default false. */
  readonly withCredentials?: boolean;
  /** Default `'json'`. */
  readonly responseType?: R;
  readonly messages?: StatusMessageCatalog;
  /** As `HttpClientOptions.trustServerMessages`. Default false. */
  readonly trustServerMessages?: TrustServerMessages;
  readonly json?: SafeJsonParseOptions;
  /** Custom factory (tests, instrumentation). Default: the global `XMLHttpRequest`, resolved per call. */
  readonly createXhr?: () => XMLHttpRequest;
}

/** Result of `uploadWithProgress`. */
export interface UploadResponse<D> {
  readonly status: number;
  readonly headers: Headers;
  readonly body: D;
}

const TOKEN_RE = /^[!#$%&'*+\-.^`|~\w]{1,32}$/;
const ERROR_BODY_MAX = 1_000_000;

function parseHeaders(raw: string): Headers {
  const h = new Headers();
  for (const line of raw.split(/\r?\n/)) {
    const i = line.indexOf(':');
    if (i <= 0) continue;
    try {
      h.append(line.slice(0, i).trim(), line.slice(i + 1).trim());
    } catch {
      // Skip header lines the Headers class rejects.
    }
  }
  return h;
}

async function errorText(xhr: XMLHttpRequest, type: XhrResponseType): Promise<string | undefined> {
  try {
    if (type === 'json' || type === 'text') return xhr.responseText.length > ERROR_BODY_MAX ? undefined : xhr.responseText;
    const res: unknown = xhr.response;
    if (res instanceof Blob) return res.size > ERROR_BODY_MAX ? undefined : await res.text();
    if (res instanceof ArrayBuffer) return res.byteLength > ERROR_BODY_MAX ? undefined : utf8Decode(res);
  } catch {
    return undefined;
  }
  return undefined;
}

/**
 * Sends `body` with `XMLHttpRequest` and reports upload progress. Resolves `{ status, headers, body }`
 * for 2xx; rejects with an `HttpError` like `createHttpClient`: `SVC_HTTP_STATUS` with problem
 * details, or status 0 `SVC_HTTP_NETWORK` (`network`/`offline`), `SVC_HTTP_TIMEOUT` (`timeout`), or
 * `SVC_HTTP_ABORTED` (`cancelled`).
 * @example
 * const formData = new FormData();
 * formData.append('file', new File(['hello'], 'a.txt', { type: 'text/plain' }));
 * const bar = document.createElement('progress');
 * bar.max = 100;
 * const controller = new AbortController();
 * const res = await uploadWithProgress('/api/files', formData, { onProgress: (p) => { bar.value = p.percent ?? 0; }, signal: controller.signal });
 */
export function uploadWithProgress<R extends XhrResponseType = 'json'>(url: string, body: XMLHttpRequestBodyInit | null, options: UploadWithProgressOptions<R> = {}): Promise<UploadResponse<XhrResponseTypeMap[R]>> {
  const method = (options.method ?? 'POST').toUpperCase();
  const responseType: XhrResponseType = options.responseType ?? 'json';
  const timeoutMs = options.timeoutMs ?? 0;
  const { signal, onProgress } = options;
  return new Promise<UploadResponse<XhrResponseTypeMap[R]>>((resolve, reject) => {
    if (!TOKEN_RE.test(method)) throw new ValidationError('SVC_HTTP_INVALID_METHOD', 'The HTTP method is not a valid token.');
    if (!isSafeUrl(url, { allowedSchemes: ['http', 'https'] })) throw new ValidationError('SVC_HTTP_INVALID_URL', 'The request URL is not an allowed http(s) URL.');
    if (!Number.isFinite(timeoutMs) || timeoutMs < 0) throw new ValidationError('SVC_HTTP_INVALID_TIMEOUT', 'timeoutMs must be a non-negative number.');
    const abortErr = (): HttpError => {
      const reason: unknown = signal?.reason;
      return reason instanceof HttpError ? reason : cancelledError(method, url, reason);
    };
    if (signal?.aborted) {
      reject(abortErr());
      return;
    }
    let xhr: XMLHttpRequest;
    if (options.createXhr) xhr = options.createXhr();
    else if (typeof globalThis.XMLHttpRequest === 'function') xhr = new globalThis.XMLHttpRequest();
    else throw new HelperError('SVC_HTTP_NO_XHR', 'XMLHttpRequest is not available in this environment.', { kind: 'unsupported' });

    let done = false;
    const onAbortSignal = (): void => {
      xhr.abort();
    };
    const settle = (fn: () => void): void => {
      if (done) return;
      done = true;
      signal?.removeEventListener('abort', onAbortSignal);
      fn();
    };
    const emit = (loaded: number, total: number | null): void => {
      onProgress?.({ loaded, total, percent: total === null ? null : total === 0 ? 100 : Math.min(100, (loaded / total) * 100) });
    };

    xhr.open(method, url, true);
    xhr.responseType = responseType === 'blob' ? 'blob' : responseType === 'arrayBuffer' ? 'arraybuffer' : 'text';
    xhr.withCredentials = options.withCredentials ?? false;
    if (timeoutMs > 0) xhr.timeout = timeoutMs;
    new Headers(options.headers).forEach((v, k) => {
      xhr.setRequestHeader(k, v);
    });
    if (onProgress) {
      xhr.upload.addEventListener('progress', (e: ProgressEvent) => {
        emit(e.loaded, e.lengthComputable ? e.total : null);
      });
      xhr.upload.addEventListener('load', (e: ProgressEvent) => {
        if (e.lengthComputable) emit(e.total, e.total);
      });
    }
    xhr.addEventListener('load', () => {
      const status = xhr.status;
      const headers = parseHeaders(xhr.getAllResponseHeaders());
      if (!isSuccess(status)) {
        void errorText(xhr, responseType).then((bodyText) => {
          settle(() => {
            reject(responseError({ status, statusText: xhr.statusText, headers, bodyText, method, url, messages: options.messages, trustServerMessages: options.trustServerMessages }));
          });
        });
        return;
      }
      settle(() => {
        let data: unknown;
        if (responseType === 'json') {
          const text = xhr.responseText;
          if (text === '') data = undefined;
          else {
            const parsed = safeJsonParse(text, options.json);
            if (!parsed.ok) {
              reject(invalidResponseError(status, method, url, parsed.error));
              return;
            }
            data = parsed.value;
          }
        } else data = responseType === 'text' ? xhr.responseText : xhr.response;
        // `xhr.responseType` was set from `responseType`, so the body has the mapped type.
        resolve({ status, headers, body: data as XhrResponseTypeMap[R] });
      });
    });
    xhr.addEventListener('error', () => {
      settle(() => {
        reject(networkError(method, url, undefined, options.messages));
      });
    });
    xhr.addEventListener('timeout', () => {
      settle(() => {
        reject(timeoutError(method, url, options.messages));
      });
    });
    xhr.addEventListener('abort', () => {
      settle(() => {
        reject(abortErr());
      });
    });
    signal?.addEventListener('abort', onAbortSignal, { once: true });
    xhr.send(body);
  });
}
