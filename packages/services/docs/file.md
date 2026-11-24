Everything between "the user chose a file" and "the file is safe to use": reading with size limits, detecting the real type from its first bytes, validating against your rules, resizing images, checksums, dropped folders, pasted files, and the file picker. The [Files and downloads guide](/docs/guides/files-and-downloads/) walks through validation, streaming reads of large files, and images; the recipes below cover the remaining everyday tasks.

### How do I find out what a file really is?

Names and declared types come from the user's machine and can be wrong. `detectFileType` reads the first bytes; `active` flags content that can run code (SVG, HTML, executables).

```ts
import { detectFileType } from '@absoluteui/services/file';

const pdfBytes = Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37); // '%PDF-1.7'
const renamed = new File([pdfBytes], 'photo.png', { type: 'image/png' });
const type = await detectFileType(renamed);
[type?.mime, type?.active]; // => ['application/pdf', false]
await detectFileType(new File(['plain words'], 'notes.bin')); // => { mime: 'text/plain', extension: 'txt', confidence: 'low', active: false }
```

### How do I show validation errors in the user's language?

`validateFiles` returns stable codes and parameters with every error. Pass `messages` to translate; return `undefined` to keep the English default. Messages never contain the file name, so you place it where your layout needs it.

```ts
import { validateFiles, type FileMessageCatalog } from '@absoluteui/services/file';

const de: FileMessageCatalog = (code, p) =>
  code === 'SVC_FILE_TOO_LARGE' ? `Die Datei ist größer als ${String(p['limitText'])}.` : undefined;
const cv = new File(['x'.repeat(2_000)], 'lebenslauf.txt', { type: 'text/plain' });
const { rejected } = await validateFiles([cv], { maxFileSize: 1_000, locale: 'de', messages: de });
rejected[0]?.errors.map((e) => e.code); // => ['SVC_FILE_TOO_LARGE']
const lines = rejected.map((r) => `${r.file.name}: ${r.errors.map((e) => e.message).join(' ')}`); // e.g. ['lebenslauf.txt: Die Datei ist größer als 1 Kilobyte.']
```

### How do I shrink a photo before uploading it?

`compressImage` resizes and re-encodes until the result fits `maxBytes`. Orientation metadata is applied, and re-encoding removes EXIF data such as GPS location.

```ts
import { compressImage, formatFileSize } from '@absoluteui/services/file';

declare const photo: File; // profile photo chosen by the employee
const { blob, width, height, withinLimit } = await compressImage(photo, { maxBytes: 300_000, maxWidth: 800, maxHeight: 800, type: 'image/webp' });
const hint = withinLimit ? `${String(width)} × ${String(height)}, ${formatFileSize(blob.size, { style: 'long' })}` : 'The photo is still too large.';
```

### How do I verify a file against a published checksum?

`fileChecksum` hashes in slices, so large files do not have to fit in memory; `onProgress` feeds a progress bar.

```ts
import { fileChecksum } from '@absoluteui/services/file';

const export2026 = new File(['employee_id,name\n42,Ada Lovelace\n'], 'employees.csv', { type: 'text/csv' });
const bar = document.createElement('progress');
const crc = await fileChecksum(export2026, 'crc32', { onProgress: (done, total) => { bar.value = done / total; } });
crc.length; // => 8
(await fileChecksum(export2026, 'SHA-256')).length; // => 64
```

### What goes wrong?

- Every reader has a size limit (`DEFAULT_MAX_READ_BYTES`); larger files reject with `SVC_FILE_TOO_LARGE` instead of exhausting memory. Use `readChunks` or `readLines` for big files.
- A name that disagrees with the content is `SVC_FILE_TYPE_MISMATCH`, not a pass: an executable renamed to `.png` is rejected.
- Image functions need `createImageBitmap`; files the browser cannot decode (for example HEIC in most browsers) fail with `SVC_FILE_IMAGE_UNREADABLE` in validation.

```ts
import { readAsText } from '@absoluteui/services/file';

const log = new File(['x'.repeat(2_048)], 'audit.log');
await readAsText(log, { maxBytes: 1_024 }); // => throws SVC_FILE_TOO_LARGE
```
