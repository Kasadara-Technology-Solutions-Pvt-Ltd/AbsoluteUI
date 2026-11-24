# Upload Queue

> Package: `@absoluteui/components/upload-queue` | Styles: `@absoluteui/components/upload-queue/style.css` and `@absoluteui/components/progress-bar/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

A list of files being uploaded. It provides:
- a Progress Bar per item, with size and status text (queued, uploading, done, failed, cancelled);
- cancel, retry, and remove actions per item;
- a transport-agnostic upload interface: you supply `upload(file, { signal, onProgress, attempt, id })`; the queue schedules calls with a concurrency limit, cancels through `AbortController`, and retries with exponential backoff;
- polite announcements for failures, cancellations, removals, and batch completion;
- optional image previews through object URLs, revoked when items are removed or the queue is destroyed.

**The queue never performs a network request.** Only your `upload` function does. It works with any source of `File` objects; [File Upload](file-upload.md) can feed it, but neither needs the other.

## 2. Anatomy

```text
<div class="aui-upload-queue">
  <div class="aui-upload-queue__label" id="L">Uploads</div>
  <div class="aui-upload-queue__summary">1 of 2 uploaded</div>
  <ul class="aui-upload-queue__list" aria-labelledby="L" tabindex="-1">
    <li class="aui-upload-queue__item" data-status="uploading">
      <span class="aui-upload-queue__media"><svg aria-hidden="true"/> | <img alt="" src="blob:…"></span>
      <div class="aui-upload-queue__progress">   (Progress Bar: label = file name, description = "2 MB · Uploading")</div>
      <div class="aui-upload-queue__actions">
        <button class="aui-upload-queue__action aui-upload-queue__cancel" aria-label="Cancel upload of a.pdf">
        <button class="… aui-upload-queue__retry" aria-label="Retry upload of a.pdf" hidden>
        <button class="… aui-upload-queue__remove" aria-label="Remove a.pdf" hidden>
      </div>
    </li>
  </ul>
</div>
```

## 3. When to use

- Uploads with visible progress and the ability to cancel or retry.
- Chunked or resumable uploads: your function loops over `file.slice()` chunks and reports progress.
- Together with File Upload, or with files from any source.

## 4. When not to use

- One small file submitted with the form: submit it natively with File Upload.
- Uploads that must survive a page reload: the queue lives in memory.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `list` | `HTMLUListElement` | The list. |
| `items` | `readonly UploadItem[]` | Frozen snapshots, in queue order. |
| `busy` | `boolean` | Any item queued or uploading. |
| `options` | `Readonly<UploadQueueOptions>` | Current options. |

Options (`UploadQueueOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Visible label; names the list. |
| `upload` | `UploadFunction` | - (required) | No | Performs one attempt. |
| `preview` | `boolean` | `false` | No | Image previews for `image/*` (needs `img-src blob:`). |
| `errorMessage` | `(error, file) => string \| null` | generic message | No | Map failures to user-facing text. |
| `icons` | `Partial<UploadQueueIcons>` | - | No | Icon overrides. |
| `concurrency` | `number` | `2` | Yes | Uploads at the same time (1-16). |
| `retries` | `number` | `0` | Yes | Automatic retries (0-10). |
| `retryDelay` | `number` (ms) | `1000` | Yes | First retry delay; doubles per retry (0-60000). |
| `autoStart` | `boolean` | `true` | Yes | Start when added; else call `start()`. |
| `locale` | `string` | common `locale` | Yes (inherited) | Messages and sizes. |

## 6. Methods

| Method | Description |
|---|---|
| `UploadQueue.create(host, options)` | Render into `host` (children are replaced). |
| `add(files)` | Queue files (any iterable of `File`); returns item ids. |
| `start()` | Start queued items (for `autoStart: false`). |
| `cancel(id)` / `cancelAll()` | Cancel queued or uploading items; aborts their signal. |
| `retry(id)` | Queue a failed or cancelled item again. |
| `remove(id)` / `clear()` / `clearCompleted()` | Remove items (aborting active ones, revoking previews). |
| `getItem(id)` | One snapshot, or `null`. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Abort all, revoke previews, remove rendering. Results that arrive later are ignored. |

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-change` | `{ items, reason, item }` | Yes | Items added or removed, or a status changed. `reason`: `added`, `started`, `succeeded`, `failed`, `cancelled`, `retried`, `removed`. `item` is `null` for bulk changes. Not emitted for progress. |
| `aui-complete` | `{ succeeded, failed, cancelled }` | No | Nothing is queued or uploading any more (once per batch). |

## 8. Slots/content areas

None. Rows are rendered from the files.

## 9. CSS parts/hooks

`aui-upload-queue`, `__label`, `__summary`, `__list`, `__item` (`data-status`), `__media`, `__file-icon`, `__preview`, `__progress`, `__actions`, `__action`, `__cancel`, `__retry`, `__remove`. Progress Bar classes apply inside `__progress`.

## 10. Design tokens

See `metadata/upload-queue/tokens.json` (verified in CI). Key tokens: `color-surface`, `color-border-strong`, `color-error-fg` (failed rows), `touch-target-min`, plus Progress Bar tokens.

## 11. States

Per item: `queued`, `uploading`, `done`, `failed`, `cancelled`. Queue: empty, busy.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| - | `add()` | `queued` (starts at once with `autoStart` when a slot is free) |
| `queued` | free slot | `uploading`; `upload()` called with `attempt` 1 |
| `uploading` | promise resolves | `done`; `response` stored |
| `uploading` | promise rejects, retries left | `uploading` again after `retryDelay x 2^n` (progress resets) |
| `uploading` | promise rejects, no retries left | `failed`; announced |
| `queued` / `uploading` | `cancel()` | `cancelled`; signal aborted; announced |
| `failed` / `cancelled` | `retry()` | `queued` |
| any | `remove()` | removed; signal aborted; preview revoked |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | The visible actions of each row. |
| Enter / Space | Cancel | Cancels; focus moves to Retry of the same row. |
| Enter / Space | Retry | Retries; focus moves to Cancel of the same row. |
| Enter / Space | Remove | Removes; focus moves to the next row's first action, else the previous row, else the list. |

## 14. ARIA contract

- The list is a `<ul>` named by the visible label (`aria-labelledby`).
- Each row's Progress Bar is `role="progressbar"`, named by the file name, described by "size | status" (plus the error), with `aria-valuenow` while determinate.
- Actions are native buttons named per file ("Cancel upload of a.pdf").
- Preview images are decorative (`alt=""`): the file name is adjacent.

## 15. Accessibility notes

- Progress is never announced continuously. Announced (polite): each failure ("a.pdf failed to upload."), each cancellation, removals, and one summary per batch ("All 3 files uploaded." or "Uploads finished: 2 uploaded, 1 failed, 0 cancelled.").
- Status is text; done and failed rows add the Progress Bar tone icon with a label, so status never depends on color.
- Focus moves only after the user's own action removed the focused control.
- Manual screen-reader verification is pending.

## 16. Responsive behavior

Full width. Media, progress (label and description wrap), and 24 px actions stay on one line; reflows at 320 CSS px.

## 17. RTL behavior

Logical properties: media at the inline start, actions at the inline end; progress fills from the inline start.

## 18. Theme behavior

Rows on `color-surface` with `color-border-strong` (`color-error-fg` when failed); Progress Bar tones: success when done, error when failed. Forced-colors mode draws `CanvasText` borders.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { uploadQueue: { concurrency: 4, retries: 2, retryDelay: 2000 } } });
```

Changes apply to existing queues (a higher concurrency starts waiting items).

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.file` (default `file`), `icons.cancel` (`close`), `icons.retry` (`refresh`), `icons.remove` (`close`).

## 23. Security behavior

- No network access by the library; your function controls the endpoint, credentials, and headers.
- Raw errors are never displayed (they may contain server internals): the default is "The upload did not complete."; use `errorMessage` to map known errors.
- File names and messages are rendered with `textContent`.
- Previews: object URLs in `<img>` (SVG in an image cannot run script). They need `img-src blob:` in your Content-Security-Policy; without it previews are blocked by the browser and the rest works. URLs are revoked on remove, clear, and destroy.

## 24. Data handling behavior

Files, progress, and responses stay in memory until removed or destroyed. Nothing is persisted, logged, or transmitted by AbsoluteUI.

Upload contract:

```ts
type UploadFunction = (file: File, context: {
  signal: AbortSignal;                                  // aborted on cancel, remove, destroy
  onProgress: (loaded: number, total?: number) => void; // bytes; total defaults to file.size
  attempt: number;                                      // 1, 2, … across automatic and manual retries
  id: string;                                           // stable item id (upload session key)
}) => Promise<unknown>;                                 // resolve = done (value in item.response); reject = failed
```

- Chunked uploads: call `onProgress(bytesSentSoFar)` after each chunk; use `id` and `attempt` to resume on the server.
- Cancellation is cooperative: pass `signal` to `fetch` or call `xhr.abort()` on `abort`.
- A synchronous throw counts as a failure; a non-promise return value counts as success.

## 25. Performance characteristics

Status changes render the affected row at once; progress is coalesced to one render per animation frame. Budget: `add()` of 200 files < 100 ms (headless Chromium, e2e performance suite).

## 26. Supported data scale

Tested with 200 items. Keep `concurrency` modest (browsers limit parallel connections per host).

## 27. Usage examples

```ts
import { UploadQueue } from '@absoluteui/components/upload-queue';

const host = document.createElement('div');
document.body.append(host);
const queue = UploadQueue.create(host, {
  label: 'Uploads',
  upload: async (file, { signal }) => {
    const r = await fetch('/api/files', { method: 'POST', body: file, signal });
    if (!r.ok) throw new Error(String(r.status));
    return r.json();
  },
});
queue.add([new File(['hello'], 'hello.txt', { type: 'text/plain' })]);
```

More examples (File Upload integration, chunked upload), type-checked in CI: `metadata/upload-queue/examples.json`.

## 28. Edge cases

- `onProgress` values that are not finite are ignored; values above the total are clamped. A total of 0 shows an indeterminate bar while uploading.
- A result that arrives after cancel, remove, retry, or destroy is ignored.
- A cancelled item keeps its concurrency slot until your function settles.
- Adding an empty iterable does nothing; `add()` after `destroy()` returns `[]`.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `UPLOAD_QUEUE_OPTIONS` | configuration | Missing label or `upload` function, invalid `errorMessage`/`preview`, non-File values passed to `add()`. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid concurrency, retries, retry delay, or unknown configuration. |

Upload failures are item states (`failed`), not exceptions. A failed construction leaves the host untouched.

## 30. Known limitations

- Cancellation depends on your function honouring `signal`.
- Retries restart the attempt; resuming is your function's job.
- Individual successes are included in the batch summary rather than announced one by one.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Built-in transports (fetch, XHR, tus, S3 multipart).
- Reordering items; persistence across reloads.
- HTML in file names or error messages.

## 32. TypeScript definitions

```ts
type UploadStatus = 'queued' | 'uploading' | 'done' | 'failed' | 'cancelled';
interface UploadContext { readonly signal: AbortSignal; readonly onProgress: (loaded: number, total?: number) => void; readonly attempt: number; readonly id: string }
type UploadFunction = (file: File, context: UploadContext) => Promise<unknown>;
interface UploadItem { readonly id: string; readonly file: File; readonly status: UploadStatus; readonly loaded: number; readonly total: number; readonly attempts: number; readonly error: string | null; readonly response: unknown }
interface UploadQueueConfig { concurrency: number; retries: number; retryDelay: number; autoStart: boolean }
interface UploadQueueOptions extends Partial<UploadQueueConfig> {
  label: string; upload: UploadFunction; preview?: boolean;
  errorMessage?: (error: unknown, file: File) => string | null; locale?: string; icons?: Partial<UploadQueueIcons>;
}
interface UploadQueueChangeDetail { items: readonly UploadItem[]; reason: UploadQueueChangeReason; item: UploadItem | null }
interface UploadQueueCompleteDetail { succeeded: number; failed: number; cancelled: number }
```

## 33. Vanilla JS example

```ts
import { UploadQueue, type UploadQueueCompleteDetail } from '@absoluteui/components/upload-queue';
import '@absoluteui/components/progress-bar/style.css';
import '@absoluteui/components/upload-queue/style.css';

const host = document.querySelector<HTMLElement>('#queue');
if (host) {
  const queue = UploadQueue.create(host, {
    label: 'Photos',
    preview: true,
    retries: 1,
    upload: (file, { signal, onProgress }) =>
      new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('POST', '/api/photos');
        xhr.upload.onprogress = (e) => { onProgress(e.loaded, e.total); };
        xhr.onload = () => { if (xhr.status < 300) resolve(xhr.response); else reject(new Error(String(xhr.status))); };
        xhr.onerror = () => { reject(new Error('network')); };
        signal.addEventListener('abort', () => { xhr.abort(); reject(new DOMException('Aborted', 'AbortError')); });
        xhr.send(file);
      }),
  });
  queue.host.addEventListener('aui-complete', (e) => {
    const { failed } = (e as CustomEvent<UploadQueueCompleteDetail>).detail;
    if (failed === 0) queue.clearCompleted();
  });
}
```

## 34. Angular example

```ts
import { Component, viewChild } from '@angular/core';
import { AuiUploadQueue } from '@absoluteui/angular/upload-queue';
import type { UploadFunction } from '@absoluteui/components/upload-queue';

@Component({
  selector: 'app-uploads',
  imports: [AuiUploadQueue],
  template: `
    <input type="file" multiple (change)="enqueue($event)">
    <aui-upload-queue #queue="auiUploadQueue" label="Uploads" [upload]="upload" [concurrency]="3"></aui-upload-queue>
  `,
})
export class UploadsComponent {
  readonly queue = viewChild.required<AuiUploadQueue>('queue');
  readonly upload: UploadFunction = async (file, { signal }) => (await fetch('/api/files', { method: 'POST', body: file, signal })).json();
  enqueue(event: Event): void {
    const input = event.target as HTMLInputElement;
    this.queue().add(Array.from(input.files ?? []));
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
