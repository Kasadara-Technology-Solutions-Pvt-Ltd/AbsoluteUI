Creates and reads ZIP archives in the browser with the native `CompressionStream`, no library required. The writer streams, so memory stays flat for large archives; the reader verifies checksums and refuses path traversal ("zip slip") and zip bombs. The [Files and downloads guide](/docs/guides/files-and-downloads/) shows the basic `zipFiles` and `readZip` round trip; the recipes below cover the rest.

### How do I bundle many generated files into one download?

Add entries to a `createZipWriter` and pass its stream to `saveWithPicker`, which writes to disk as the archive is produced. Store already-compressed files (JPEG, PDF, PNG) with `compression: 'store'` to save time.

```ts
import { saveWithPicker } from '@absoluteui/services/download';
import { createZipWriter } from '@absoluteui/helpers/zip';

declare const payslips: readonly { employeeId: number; pdf: Blob }[];
const zip = createZipWriter({ comment: 'Payslips September 2026' });
zip.addDirectory('2026-09');
for (const p of payslips) zip.add(`2026-09/payslip-${String(p.employeeId)}.pdf`, p.pdf, { compression: 'store' });
zip.add('2026-09/summary.csv', 'employee_id,net\n42,4180.00\n');
const status = await saveWithPicker(zip.stream(), { suggestedName: 'payslips-2026-09.zip' });
```

### How do I read one file out of an uploaded archive?

`readZip` lists entries without extracting them; `entry.read()` inflates one entry and checks its CRC-32. Entry names are already sanitized.

```ts
import { readZip, zipFiles } from '@absoluteui/helpers/zip';

const upload = await zipFiles([
  { name: 'import/employees.csv', data: 'id,name\n42,Ada Lovelace\n' },
  { name: 'import/readme.txt', data: 'Exported from the old HR system' },
]); // stands in for a File from a file input
const archive = await readZip(upload, { maxEntries: 1_000, maxTotalUncompressed: 200 * 1024 * 1024 });
const csv = archive.entries.find((e) => !e.isDirectory && e.name.endsWith('.csv'));
csv?.name; // => 'import/employees.csv'
new TextDecoder().decode(await csv?.read()); // => 'id,name\n42,Ada Lovelace\n'
```

### How do I produce an archive in memory?

`toBlob()` returns an `application/zip` Blob, for example to attach to an upload or pass to `downloadBlob`. A writer produces its archive once; add every entry first.

```ts
import { createZipWriter, readZip } from '@absoluteui/helpers/zip';

const zip = createZipWriter();
zip.add('policies/leave.md', '# Leave policy');
zip.add('policies/travel.md', '# Travel policy');
zip.size; // => 2
const blob = await zip.toBlob();
blob.type; // => 'application/zip'
(await readZip(blob)).entries.map((e) => e.name); // => ['policies/leave.md', 'policies/travel.md']
```

### What goes wrong?

- Unsafe or duplicate names throw when added: `..` segments (`HLP_ZIP_PATH_TRAVERSAL`), absolute paths or drive letters (`HLP_ZIP_ABSOLUTE_PATH`), repeated names (`HLP_ZIP_DUPLICATE_NAME`). Adding after `stream()` or `toBlob()` throws `HLP_ZIP_WRITER_CLOSED`.
- The reader rejects archives over its limits (`HLP_ZIP_TOO_MANY_ENTRIES`, `HLP_ZIP_TOO_LARGE`, `HLP_ZIP_RATIO`), corrupt data (`HLP_ZIP_CRC_MISMATCH`), and encrypted entries (`HLP_ZIP_ENCRYPTED`) instead of misreading them.

```ts
import { createZipWriter, readZip, zipFiles } from '@absoluteui/helpers/zip';

const zip = createZipWriter();
zip.add('../../etc/passwd', 'x'); // => throws HLP_ZIP_PATH_TRAVERSAL
zip.add('C:/Windows/win.ini', 'x'); // => throws HLP_ZIP_ABSOLUTE_PATH
const three = await zipFiles([{ name: 'a.txt', data: 'a' }, { name: 'b.txt', data: 'b' }, { name: 'c.txt', data: 'c' }]);
await readZip(three, { maxEntries: 2 }); // => throws HLP_ZIP_TOO_MANY_ENTRIES
```
