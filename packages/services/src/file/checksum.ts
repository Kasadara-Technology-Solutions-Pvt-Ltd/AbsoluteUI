/** File checksums: streaming CRC-32 and Web Crypto SHA digests. */
import { HelperError, LimitError } from '@absoluteui/helpers/error';
import { crc32, hexEncode } from '@absoluteui/helpers/encoding';
import { checkAbort, readChunks } from './read.js';

export type ChecksumAlgorithm = 'SHA-256' | 'SHA-384' | 'SHA-512' | 'crc32';

export interface FileChecksumOptions {
  /**
   * SHA only: `crypto.subtle.digest` cannot stream, so the whole file is read into memory up to
   * this size (default 256 MiB); larger files throw `SVC_FILE_CHECKSUM_TOO_LARGE`. CRC-32 streams
   * with no limit.
   */
  readonly maxBytes?: number;
  readonly signal?: AbortSignal;
  /** Called with bytes processed (CRC-32 only; SHA reports once at the end). */
  readonly onProgress?: (loaded: number, total: number) => void;
}

/** Default in-memory limit for SHA checksums (256 MiB). */
export const DEFAULT_SHA_MAX_BYTES = 256 * 1024 * 1024;

/**
 * Lowercase hex checksum of a file. CRC-32 is computed incrementally over 1 MiB chunks;
 * SHA-* use `crypto.subtle` (secure contexts) within `maxBytes`.
 * @example
 * const file = new File(['hello'], 'a.txt', { type: 'text/plain' });
 * await fileChecksum(file, 'SHA-256'); // => '2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824'
 * const bar = document.createElement('progress');
 * await fileChecksum(file, 'crc32', { onProgress: (n, total) => { bar.value = n / total; } }); // => '3610a686'
 */
export async function fileChecksum(blob: Blob, algorithm: ChecksumAlgorithm = 'SHA-256', options: FileChecksumOptions = {}): Promise<string> {
  const { maxBytes = DEFAULT_SHA_MAX_BYTES, signal, onProgress } = options;
  checkAbort(signal);
  if (algorithm === 'crc32') {
    let crc = 0;
    let loaded = 0;
    for await (const chunk of readChunks(blob, signal ? { signal } : {})) {
      crc = crc32(chunk, crc);
      loaded += chunk.length;
      onProgress?.(loaded, blob.size);
    }
    return crc.toString(16).padStart(8, '0');
  }
  if (!['SHA-256', 'SHA-384', 'SHA-512'].includes(algorithm)) throw new HelperError('SVC_FILE_CHECKSUM_ALGORITHM', 'The checksum algorithm is not supported.', { kind: 'unsupported' });
  if (blob.size > maxBytes) {
    throw new LimitError('SVC_FILE_CHECKSUM_TOO_LARGE', 'The file is too large for a SHA checksum in memory; use crc32, which streams.', { details: { limit: maxBytes } });
  }
  const subtle = typeof crypto === 'undefined' ? undefined : (crypto.subtle as SubtleCrypto | undefined);
  if (!subtle) throw new HelperError('SVC_FILE_CHECKSUM_UNSUPPORTED', 'SHA checksums need Web Crypto (a secure context).', { kind: 'unsupported' });
  const digest = await subtle.digest(algorithm, await blob.arrayBuffer());
  checkAbort(signal);
  onProgress?.(blob.size, blob.size);
  return hexEncode(new Uint8Array(digest));
}
