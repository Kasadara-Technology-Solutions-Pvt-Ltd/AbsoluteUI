/** Streaming body reads with size limits and download progress. */
import { LimitError } from '@absoluteui/helpers/error';
import { abortReason } from '@absoluteui/helpers/async';

/** Download or upload progress. `total` and `percent` are `null` when the size is unknown. */
export interface TransferProgress {
  readonly loaded: number;
  readonly total: number | null;
  readonly percent: number | null;
}

/** Internal: options for reading a body. */
export interface ReadOptions {
  readonly signal?: AbortSignal | undefined;
  readonly maxBytes?: number | undefined;
  readonly onProgress?: ((p: TransferProgress) => void) | undefined;
}

/** Internal: `LimitError` for an oversized response. */
export function tooLarge(maxBytes: number): LimitError {
  return new LimitError('SVC_HTTP_RESPONSE_TOO_LARGE', 'The response is larger than the allowed size.', { details: { maxBytes } });
}

/**
 * Internal: expected decoded size from `Content-Length`, or `null` when unknown or when a content
 * coding is applied (the stream yields decoded bytes, so the header would understate the total).
 */
export function expectedLength(headers: Headers): number | null {
  const enc = headers.get('content-encoding');
  if (enc !== null && enc.trim().toLowerCase() !== 'identity' && enc.trim() !== '') return null;
  const raw = headers.get('content-length');
  if (raw === null || !/^\d{1,15}$/.test(raw.trim())) return null;
  return Number(raw.trim());
}

const progressOf = (loaded: number, total: number | null): TransferProgress => ({
  loaded,
  total,
  percent: total === null ? null : total === 0 ? 100 : Math.min(100, (loaded / total) * 100),
});

/**
 * Internal: reads a response body to bytes chunk by chunk, enforcing `maxBytes` while streaming
 * and reporting progress. Cancels the stream on limit or abort.
 */
export async function readBytes(response: Response, options: ReadOptions): Promise<Uint8Array<ArrayBuffer>> {
  const { signal, maxBytes, onProgress } = options;
  const total = expectedLength(response.headers);
  if (maxBytes !== undefined && total !== null && total > maxBytes) {
    await response.body?.cancel().catch(() => undefined);
    throw tooLarge(maxBytes);
  }
  const body = response.body;
  if (!body) {
    onProgress?.(progressOf(0, total ?? 0));
    return new Uint8Array(0);
  }
  const reader = body.getReader();
  const onAbort = (): void => {
    reader.cancel().catch(() => undefined);
  };
  signal?.addEventListener('abort', onAbort, { once: true });
  const parts: Uint8Array[] = [];
  let loaded = 0;
  try {
    onProgress?.(progressOf(0, total));
    for (;;) {
      if (signal?.aborted) throw abortReason(signal);
      const { done, value } = await reader.read();
      if (signal?.aborted) throw abortReason(signal);
      if (done) break;
      loaded += value.byteLength;
      if (maxBytes !== undefined && loaded > maxBytes) {
        await reader.cancel().catch(() => undefined);
        throw tooLarge(maxBytes);
      }
      parts.push(value);
      onProgress?.(progressOf(loaded, total));
    }
  } finally {
    signal?.removeEventListener('abort', onAbort);
    reader.releaseLock();
  }
  if (total === null || loaded !== total) onProgress?.(progressOf(loaded, loaded));
  const out = new Uint8Array(loaded);
  let offset = 0;
  for (const p of parts) {
    out.set(p, offset);
    offset += p.byteLength;
  }
  return out;
}

/** Internal: pipes `body` through a byte counter that errors the stream past `maxBytes` and reports progress. */
export function meterStream(body: ReadableStream<Uint8Array>, total: number | null, maxBytes: number | undefined, onProgress: ((p: TransferProgress) => void) | undefined): ReadableStream<Uint8Array> {
  let loaded = 0;
  return body.pipeThrough(
    new TransformStream<Uint8Array, Uint8Array>({
      transform(chunk, controller) {
        loaded += chunk.byteLength;
        if (maxBytes !== undefined && loaded > maxBytes) {
          controller.error(tooLarge(maxBytes));
          return;
        }
        controller.enqueue(chunk);
        onProgress?.(progressOf(loaded, total));
      },
      flush() {
        if (total === null || loaded !== total) onProgress?.(progressOf(loaded, loaded));
      },
    }),
  );
}
