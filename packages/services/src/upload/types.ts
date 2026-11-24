/** Upload engine types shared by the uploader, adapters and queue. */

/** Lifecycle of one upload. */
export type UploadState = 'queued' | 'uploading' | 'paused' | 'completed' | 'failed' | 'cancelled';

/** File-level progress. `speedBps`/`etaMs` are `null` until enough samples exist. */
export interface UploadProgress {
  readonly loaded: number;
  readonly total: number;
  /** 0-100. */
  readonly percent: number;
  /** Bytes per second over the last few seconds. */
  readonly speedBps: number | null;
  /** Estimated milliseconds remaining. */
  readonly etaMs: number | null;
}

/** Per-chunk checksum: `crc32` as 8 lowercase hex digits, `sha256` as base64. */
export interface ChunkChecksum {
  readonly algorithm: 'crc32' | 'sha256';
  readonly value: string;
}

/** What `UploadAdapter.start` receives. */
export interface UploadFileInfo {
  readonly name: string | undefined;
  readonly size: number;
  readonly type: string;
  readonly lastModified: number | undefined;
  readonly chunkSize: number;
  readonly totalChunks: number;
  readonly metadata: Readonly<Record<string, unknown>>;
  /** Existing upload to resume (from the caller or the resume store). */
  readonly uploadId: string | undefined;
  readonly signal: AbortSignal;
}

/** Result of `UploadAdapter.start`. Return the same `uploadId` and `uploadedChunks` to resume. */
export interface UploadStartResult {
  readonly uploadId: string;
  /** Chunk indices the server already has (resume); they are skipped. */
  readonly uploadedChunks?: readonly number[];
}

/** One chunk to send. */
export interface UploadChunkInput {
  readonly uploadId: string;
  readonly index: number;
  /** Slice of the file (not read into memory). */
  readonly blob: Blob;
  readonly offset: number;
  readonly size: number;
  /** File size. */
  readonly total: number;
  readonly checksum: ChunkChecksum | undefined;
  readonly signal: AbortSignal;
  /** Report bytes of this chunk sent so far (optional; completion counts the whole chunk). */
  readonly onProgress: (loaded: number) => void;
}

/** Optional data an adapter returns for a chunk (for example an S3 part ETag). */
export interface ChunkResult {
  readonly etag?: string;
}

/** A finished chunk, passed to `complete` and `onChunkComplete`. */
export interface UploadedPart {
  readonly index: number;
  readonly offset: number;
  readonly size: number;
  readonly checksum?: ChunkChecksum;
  readonly etag?: string;
  /** True when the server already had this chunk (resume). */
  readonly resumed: boolean;
}

/** Server protocol. Implement for S3 multipart, tus-like or custom APIs. */
export interface UploadAdapter {
  start(file: Blob, info: UploadFileInfo): Promise<UploadStartResult>;
  uploadChunk(input: UploadChunkInput): Promise<ChunkResult | undefined>;
  complete(input: { readonly uploadId: string; readonly parts: readonly UploadedPart[]; readonly signal: AbortSignal }): Promise<unknown>;
  /** Called on cancel so the server can discard parts. */
  abort?(uploadId: string): Promise<void>;
}

/** Key-value persistence for resumable uploads (sync or async; for example `services/storage`). */
export interface UploadStateStore {
  get(key: string): unknown;
  set(key: string, value: PersistedUpload): unknown;
  remove(key: string): unknown;
}

/** State saved per file for resuming. */
export interface PersistedUpload {
  readonly uploadId: string;
  readonly chunkSize: number;
  readonly size: number;
  readonly savedAt: number;
}

/** Result of a completed upload. */
export interface UploadResult {
  readonly uploadId: string;
  readonly size: number;
  readonly parts: readonly UploadedPart[];
  /** Whatever `adapter.complete` returned. */
  readonly response: unknown;
}
