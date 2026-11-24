/** Built-in adapter for a generic REST chunked-upload convention. */
import { ValidationError } from '@absoluteui/helpers/error';
import { isPlainObject } from '@absoluteui/helpers/is';
import { encodePathSegment } from '@absoluteui/helpers/url';
import { createHttpClient, isHttpError, type HttpClientOptions } from '../http/index.js';
import type { UploadAdapter, UploadStartResult } from './types.js';

export interface RestUploadAdapterOptions {
  /** Collection URL, for example `/api/uploads`. */
  readonly endpoint: string;
  readonly headers?: HeadersInit;
  /** Extra HTTP client options (auth, xsrf, fetch, credentials). Default timeout 120 s per request. */
  readonly http?: Omit<HttpClientOptions, 'baseUrl' | 'headers'>;
  /** Header carrying the chunk checksum as `<algorithm>=<value>`. Default `'X-Chunk-Checksum'`. */
  readonly checksumHeader?: string;
}

const MAX_CHUNKS_LIST = 1_000_000;

function uploadIdOf(data: unknown): string {
  const id = isPlainObject(data) ? (data.uploadId ?? data.id) : undefined;
  if (typeof id !== 'string' || id === '' || id.length > 512) throw new ValidationError('SVC_UPLOAD_INVALID_START', 'The server did not return a valid upload id.');
  return id;
}

function chunksOf(data: unknown): number[] {
  const list = isPlainObject(data) ? (data.uploadedChunks ?? data.chunks) : undefined;
  if (!Array.isArray(list)) return [];
  return list.slice(0, MAX_CHUNKS_LIST).filter((n): n is number => Number.isSafeInteger(n) && (n as number) >= 0);
}

/**
 * Adapter for this REST convention:
 * `POST {endpoint}` (JSON file info) -> `{ uploadId }`;
 * `GET {endpoint}/{id}` -> `{ uploadedChunks: number[] }` (resume; 404/410 starts over);
 * `PUT {endpoint}/{id}/chunks/{index}` (raw bytes, `Content-Range: bytes a-b/total`, optional checksum header);
 * `POST {endpoint}/{id}/complete` (JSON `{ parts }`) -> any JSON;
 * `DELETE {endpoint}/{id}` on cancel. Chunk retries are left to the uploader.
 * @example
 * const uploader = createUploader({ adapter: createRestUploadAdapter({ endpoint: '/api/uploads', http: { xsrf: true } }) });
 */
export function createRestUploadAdapter(options: RestUploadAdapterOptions): UploadAdapter {
  const client = createHttpClient({ timeoutMs: 120_000, ...options.http, baseUrl: options.endpoint, ...(options.headers === undefined ? {} : { headers: options.headers }) });
  const checksumHeader = options.checksumHeader ?? 'X-Chunk-Checksum';
  const path = (...segs: readonly (string | number)[]): string => `/${segs.map((s) => encodePathSegment(s)).join('/')}`;

  return {
    async start(_file, info): Promise<UploadStartResult> {
      if (info.uploadId !== undefined) {
        try {
          const status = await client.get(path(info.uploadId), { signal: info.signal, dedupe: false });
          return { uploadId: info.uploadId, uploadedChunks: chunksOf(status) };
        } catch (e) {
          if (!isHttpError(e, 404) && !isHttpError(e, 410)) throw e;
        }
      }
      const created = await client.post(
        '',
        { name: info.name, size: info.size, type: info.type, lastModified: info.lastModified, chunkSize: info.chunkSize, totalChunks: info.totalChunks, metadata: info.metadata },
        { signal: info.signal },
      );
      return { uploadId: uploadIdOf(created) };
    },
    async uploadChunk(input) {
      const range = input.size === 0 ? `bytes */${String(input.total)}` : `bytes ${String(input.offset)}-${String(input.offset + input.size - 1)}/${String(input.total)}`;
      const headers = new Headers({ 'content-type': 'application/octet-stream', 'content-range': range });
      if (input.checksum) headers.set(checksumHeader, `${input.checksum.algorithm}=${input.checksum.value}`);
      const res = await client.send('PUT', path(input.uploadId, 'chunks', input.index), { body: input.blob, headers, signal: input.signal, retry: false, responseType: 'text' });
      input.onProgress(input.size);
      const etag = res.headers.get('etag');
      return etag === null ? undefined : { etag };
    },
    async complete({ uploadId, parts, signal }) {
      return client.post(path(uploadId, 'complete'), { parts: parts.map((p) => ({ index: p.index, size: p.size, ...(p.etag === undefined ? {} : { etag: p.etag }), ...(p.checksum ? { checksum: `${p.checksum.algorithm}=${p.checksum.value}` } : {}) })) }, { signal });
    },
    async abort(uploadId) {
      await client.delete(path(uploadId), { responseType: 'text' });
    },
  };
}
