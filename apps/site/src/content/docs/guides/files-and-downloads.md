---
title: Files and downloads
description: Reading and validating files, detecting real file types, images, checksums, downloads, ZIP archives, uploads, and the clipboard, safely and accessibly.
---

`@absoluteui/services` covers the whole life of a file in the browser: choosing or dropping it, checking it, reading it without running out of memory, packing it into a ZIP, uploading it in resumable chunks, and saving files back to the user's device.

| Module | Use it for |
|---|---|
| `@absoluteui/services/file` | Reading, type detection, validation, images, checksums, file pickers, dropped folders |
| `@absoluteui/services/download` | Saving Blobs, text, JSON, CSV, and remote files |
| `@absoluteui/helpers/zip` | Creating and reading ZIP archives, streamed |
| `@absoluteui/services/upload` | Chunked, resumable uploads with progress |
| `@absoluteui/services/clipboard` | Copying and reading text, rich content, and images |

## Validate before you trust

A file's name and declared type come from the user's machine and can be wrong or forged. `validateFiles` checks the rules you set **and** the file's real content (its magic bytes):

```ts
import { validateFiles } from '@absoluteui/services/file';

export async function checkAttachments(files: FileList): Promise<File[]> {
  const result = await validateFiles(files, {
    accept: 'image/*,.pdf',
    maxFileSize: 10_000_000, // 10 megabytes
    maxFiles: 5,
    rejectActiveContent: true, // SVG, HTML, and executables
  });
  for (const { file, errors } of result.rejected) {
    console.warn(file.name, errors.map((e) => e.message)); // 'The file is larger than 10 megabytes.'
  }
  return result.accepted;
}
```

- An executable renamed to `photo.png` is rejected because its content is not a PNG. SVG files are flagged as active content because they can contain scripts.
- Messages are actionable, use spoken-friendly sizes ("10 megabytes" rather than "10 MB"), and never include the file name, so you can place the name where your layout needs it. Pass `messages` to translate them.
- `detectFileType(blob)` identifies more than 40 formats (images, documents, archives, audio, video, fonts, executables) from their first bytes.

## Reading large files

Never load a large file into memory at once:

```ts
import { readChunks, readLines } from '@absoluteui/services/file';

export async function countRows(file: File): Promise<number> {
  let rows = 0;
  for await (const line of readLines(file)) if (line.trim()) rows++;
  return rows;
}

export async function totalBytes(file: File): Promise<number> {
  let total = 0;
  for await (const chunk of readChunks(file, { chunkSize: 1024 * 1024 })) total += chunk.byteLength;
  return total;
}
```

`readAsText` handles byte-order marks and rejects invalid UTF-8 when asked. Every reader has a size limit and accepts an `AbortSignal`. For CSV files, pair `readChunks` with `createCsvParser` from `@absoluteui/helpers/csv`.

## Images

`getImageDimensions`, `resizeImage`, and `compressImage` use `createImageBitmap` and `OffscreenCanvas`. Photos are rotated according to their orientation metadata, and re-encoding removes that metadata, including GPS location, which protects your users' privacy.

## Downloads

```ts
import { describeDownloadStatus, downloadCsv, downloadUrl } from '@absoluteui/services/download';

const rows = [
  { name: 'Asha Rao', department: 'Finance', salary: 91000 },
  { name: '=HYPERLINK("http://example.com")', department: 'Sales', salary: 0 },
];
const status = downloadCsv(rows, 'employees.csv'); // formula-like cells are neutralized; Excel-friendly BOM
console.log(describeDownloadStatus(status)); // announce this in a live region

const report = await downloadUrl('/api/reports/q3', { onProgress: (p) => console.log(p.percent) });
console.log(report.ok, report.fileName); // file name from Content-Disposition, sanitized
```

- **Safe names.** File names from servers or users pass through `sanitizeDownloadName`: path separators, reserved Windows names, control characters, and bidirectional overrides (a right-to-left override character can make a name ending in `exe` look as if it ends in `pdf`) are removed.
- **No leaks.** Object URLs are revoked automatically after the download starts.
- **Same origin by default.** `downloadUrl` refuses cross-origin and non-HTTP URLs unless you allow them explicitly.
- **Large files.** `saveWithPicker` streams straight to disk through the File System Access API where the browser supports it and falls back to a normal download elsewhere. If the user cancels the picker, you get `{ ok: false, cancelled: true }` rather than an error.
- **Several files.** Browsers block rapid bursts of downloads. Use `createDownloadQueue` or pack the files into one ZIP.

## ZIP archives

```ts
import { readZip, zipFiles } from '@absoluteui/helpers/zip';

const archive = await zipFiles([
  { name: 'reports/summary.txt', data: 'Quarterly summary' },
  { name: 'reports/data.json', data: JSON.stringify({ total: 42 }) },
]);

const zip = await readZip(archive);
for (const entry of zip.entries) {
  if (!entry.isDirectory) console.log(entry.name, (await entry.read()).byteLength);
}
```

- The writer streams: entries are compressed with the browser's native `CompressionStream` as they are added, so memory use stays flat. ZIP64 is used automatically for archives over 4 GiB or 65,535 entries.
- The reader verifies every entry's CRC-32 and refuses **zip slip** (entry names such as `../../etc/passwd` or absolute paths) and **zip bombs** (limits on entry count, total uncompressed size, and compression ratio). Encrypted entries are reported as unsupported rather than read incorrectly.

## Uploads

`createUploader` splits files into chunks (5 MiB by default), uploads several at once, retries failed chunks with backoff, and can pause, resume, and continue after a page reload when you give it a store. The server protocol is an adapter: use `createRestUploadAdapter` for a simple REST convention or write your own. `describeUploadProgress(progress)` returns text such as "45% uploaded, about 2 minutes remaining" for a live region. Announce it at a calm interval rather than on every chunk.

## Clipboard

```ts
import { copyText, describeCopyStatus } from '@absoluteui/services/clipboard';

const copied = await copyText('INV-2026-0042');
console.log(describeCopyStatus(copied)); // 'Copied to clipboard' or instructions to copy manually
```

The fallback for older contexts restores focus and selection afterwards, so keyboard and screen-reader users stay where they were. Clipboard contents are never logged. HTML for `copyRich` is copied as given; sanitize it first with `sanitizeHtml` from `@absoluteui/core`.

## Accessibility checklist

- Announce outcomes (download started, copy failed, upload progress, rejected files) through a polite live region, for example `announce()` from `@absoluteui/utilities`. The services return the text; they never move focus.
- File pickers return focus to the control that opened them.
- Show validation messages next to the file control and in the form's error summary, together with the file name.
- Offer a keyboard-operable alternative to drag and drop, such as a button that opens the file picker.
