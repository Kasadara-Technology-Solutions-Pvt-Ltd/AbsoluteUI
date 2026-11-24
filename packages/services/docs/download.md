Saves files to the user's device: Blobs, text, JSON, CSV, `data:` URLs, and remote files, with safe file names, automatic object-URL cleanup, a save picker for large files, and status text for live regions. Every function returns a `DownloadStatus` instead of throwing for user-level outcomes. The [Files and downloads guide](/docs/guides/files-and-downloads/) covers CSV exports, remote downloads with progress, and the safety rules; the recipes below cover the remaining tasks.

### How do I export data and tell screen-reader users it worked?

Every save returns a status; `describeDownloadStatus` turns it into a sentence for a polite live region. Override `labels` to translate.

```ts
import { describeDownloadStatus, downloadJson } from '@absoluteui/services/download';

const region = document.createElement('div');
region.setAttribute('aria-live', 'polite');
const status = downloadJson({ period: '2026-09', headcount: 214 }, 'headcount-2026-09.json', { pretty: true });
region.textContent = describeDownloadStatus(status); // e.g. 'Download started: headcount-2026-09.json'
```

```ts
import { describeDownloadStatus } from '@absoluteui/services/download';

describeDownloadStatus({ ok: false, method: 'none', fileName: 'payslip.pdf', reason: 'error' }); // => 'Download failed: payslip.pdf. Try again.'
describeDownloadStatus({ ok: true, method: 'anchor', fileName: 'payslip.pdf' }, { labels: { started: 'Téléchargement lancé : {fileName}' } }); // => 'Téléchargement lancé : payslip.pdf'
```

### How do I save a large export straight to disk?

`saveWithPicker` streams into the file the user picks (File System Access API) and falls back to a normal download elsewhere. Pass a function as the source so the export starts only after the user has chosen a file; call it from a click handler.

```ts
import { describeDownloadStatus, saveWithPicker } from '@absoluteui/services/download';

const button = document.createElement('button');
button.textContent = 'Export all employees';
button.addEventListener('click', async () => {
  const status = await saveWithPicker(async () => (await fetch('/api/exports/employees.csv')).blob(), {
    suggestedName: 'employees-2026-10-05.csv',
    types: [{ description: 'CSV file', accept: { 'text/csv': ['.csv'] } }],
  });
  if (!status.cancelled) console.info(describeDownloadStatus(status));
});
```

### How do I download several files at once?

Browsers block or prompt for bursts of downloads. `createDownloadQueue` spaces them out (one at a time, 400 ms apart by default); for many files, offer one ZIP from `@absoluteui/services/zip` instead.

```ts
import { createDownloadQueue, downloadUrl } from '@absoluteui/services/download';

const months = ['2026-07', '2026-08', '2026-09'];
const queue = createDownloadQueue({ concurrency: 1, delayMs: 500 });
const statuses = await Promise.all(months.map((m) => queue.add(() => downloadUrl(`/api/payslips/${m}.pdf`), `payslip-${m}.pdf`)));
const failed = statuses.filter((s) => !s.ok).map((s) => s.fileName);
```

### What goes wrong?

- Names from servers and users are cleaned by `sanitizeDownloadName`: path parts, control characters, and bidirectional overrides that disguise extensions are removed, and reserved Windows names are prefixed.
- `downloadUrl` refuses non-HTTP URLs (`SVC_DOWNLOAD_UNSAFE_URL`) and other origins unless you pass `allowCrossOrigin: true` (`SVC_DOWNLOAD_CROSS_ORIGIN`). Network and HTTP failures resolve to `{ ok: false, reason: 'error' }` rather than rejecting.

```ts
import { downloadUrl, sanitizeDownloadName } from '@absoluteui/services/download';

sanitizeDownloadName('../../payroll/September.csv'); // => 'September.csv'
sanitizeDownloadName('CON.txt'); // => '_CON.txt' // reserved device names are changed
await downloadUrl('javascript:alert(1)'); // => throws SVC_DOWNLOAD_UNSAFE_URL
await downloadUrl('https://files.example.net/report.pdf'); // => throws SVC_DOWNLOAD_CROSS_ORIGIN
```
