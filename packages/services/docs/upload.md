Chunked, resumable uploads for large files: slices are sent in parallel, failed chunks are retried with backoff, uploads can pause, resume, and continue after a reload, and progress comes with speed, time remaining, and a sentence for live regions. The server protocol is an adapter, so the same engine works with a simple REST API, S3 multipart, or your own. The [Files and downloads guide](/docs/guides/files-and-downloads/) introduces the pieces; for small files, `uploadWithProgress` in `@absoluteui/services/http` is simpler.

### How do I upload a large file with progress and resume after a reload?

Give `createUploader` an endpoint (the built-in REST convention) and a store for upload ids. A `@absoluteui/services/storage` store works as the resume store. Announce progress at a calm interval, not on every chunk.

```ts
import { createStore } from '@absoluteui/services/storage';
import { createUploader, describeUploadProgress, type PersistedUpload } from '@absoluteui/services/upload';

declare const file: File; // a scanned contract chosen by the user
const resume = createStore<PersistedUpload>({ namespace: 'hr-uploads', ttlMs: 7 * 86_400_000 });
const uploader = createUploader({ endpoint: '/api/uploads', checksum: 'crc32', store: resume });
const bar = document.createElement('progress');
bar.max = 100;
const status = document.createElement('p');
status.setAttribute('aria-live', 'polite');

const upload = uploader.upload(file, { metadata: { employeeId: 42, category: 'contract' } });
upload.subscribe((u) => { bar.value = u.progress.percent; });
const announce = setInterval(() => { status.textContent = describeUploadProgress(upload.progress, { state: upload.state }); }, 5_000);
const result = await upload.promise.finally(() => { clearInterval(announce); });
```

`pause()`, `resume()`, and `cancel()` on the controller map to buttons; cancelling tells the server to discard the parts.

### How do I connect to my own upload API?

Implement `UploadAdapter`: `start` returns an upload id (and chunks the server already has, to resume), `uploadChunk` sends one slice, and `complete` finishes. Chunk retries and ordering are handled for you.

```ts
import { createUploader, type UploadAdapter } from '@absoluteui/services/upload';

const received = new Map<number, number>();
const adapter: UploadAdapter = {
  start: async (_file, info) => ({ uploadId: `up-${String(info.size)}` }),
  uploadChunk: async ({ index, size, onProgress }) => {
    received.set(index, size);
    onProgress(size);
    return { etag: `"part-${String(index)}"` };
  },
  complete: async ({ uploadId, parts }) => ({ uploadId, parts: parts.length }),
};
const uploader = createUploader({ adapter });
const result = await uploader.upload(new File(['id,name\n42,Ada Lovelace\n'], 'employees.csv')).promise;
result.response; // => { uploadId: 'up-24', parts: 1 }
result.parts[0]?.etag; // => '"part-0"'
received.size; // => 1
```

### How do I describe progress for screen readers?

`describeUploadProgress` formats the percentage and remaining time with `Intl`; pass `state` for queued, paused, and finished uploads and `messages` to translate.

```ts
import { describeUploadProgress } from '@absoluteui/services/upload';

const progress = { loaded: 45, total: 100, percent: 45, speedBps: 1, etaMs: 120_000 };
describeUploadProgress(progress, { locale: 'en' }); // => '45% uploaded, about 2 minutes remaining'
describeUploadProgress(progress, { locale: 'en', state: 'paused' }); // => 'Upload paused at 45%'
```

### What goes wrong?

- Chunks smaller than `MIN_CHUNK_SIZE` (256 KiB) are refused (`SVC_UPLOAD_INVALID_OPTION`); most object stores need at least 5 MiB parts, which is the default.
- The resume key is a hash of name, size, modification time, and type, so a changed file starts a new upload rather than resuming a wrong one.
- Validate files with `validateFiles` from `@absoluteui/services/file` before uploading; the uploader does not check types or content.

```ts
import { createUploader, MIN_CHUNK_SIZE } from '@absoluteui/services/upload';

MIN_CHUNK_SIZE; // => 262144
createUploader({ endpoint: '/api/uploads', chunkSize: 64 * 1024 }); // => throws SVC_UPLOAD_INVALID_OPTION
```
