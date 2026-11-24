Copies and reads text, rich content, and images, with a fallback for older or insecure contexts that keeps focus and selection where they were. Every function resolves to a status object instead of throwing, and `describeCopyStatus` turns it into text for a live region. Clipboard contents are never logged. The [Files and downloads guide](/docs/guides/files-and-downloads/) shows the basic copy; the recipes below cover the rest.

### How do I build a "Copy" button that announces the result?

Copy from the click handler (browsers require a user gesture) and put the description in a polite live region. Pass `labels` to translate and `shortcut` to fix the key hint.

```ts
import { copyText, describeCopyStatus } from '@absoluteui/services/clipboard';

const region = document.createElement('div');
region.setAttribute('aria-live', 'polite');
const button = document.createElement('button');
button.textContent = 'Copy employee ID';
button.addEventListener('click', async () => {
  region.textContent = describeCopyStatus(await copyText('EMP-000042'));
});
```

```ts
import { describeCopyStatus } from '@absoluteui/services/clipboard';

describeCopyStatus({ ok: true, method: 'clipboard-api' }, { labels: { copied: 'In die Zwischenablage kopiert' } }); // => 'In die Zwischenablage kopiert'
describeCopyStatus({ ok: false, method: 'clipboard-api', reason: 'denied' }, { shortcut: 'Ctrl+C' }); // => 'Clipboard access is blocked. Select the text and press Ctrl+C.'
```

### How do I copy a table so it pastes into a spreadsheet?

`copyRich` puts several formats on the clipboard at once: spreadsheets and editors take the HTML, plain-text fields take the tab-separated text. Sanitize any HTML that contains user data first, for example with `sanitizeHtml` from `@absoluteui/core`.

```ts
import { escapeHtml } from '@absoluteui/helpers/string';
import { copyRich } from '@absoluteui/services/clipboard';

const rows = [['Name', 'Department'], ['Ada Lovelace', 'Finance'], ['Grace Hopper', 'Engineering']];
const html = `<table>${rows.map((r) => `<tr>${r.map((c) => `<td>${escapeHtml(c)}</td>`).join('')}</tr>`).join('')}</table>`;
const status = await copyRich({ 'text/plain': rows.map((r) => r.join('\t')).join('\n'), 'text/html': html });
```

### How do I paste from the clipboard into a field?

`readText` checks the permission first, so a user who blocked access is not prompted again. Handle `denied`, `empty`, and `unsupported` with a hint to paste with the keyboard.

```ts
import { readText } from '@absoluteui/services/clipboard';

const input = document.createElement('input');
const hint = document.createElement('p');
const pasteButton = document.createElement('button');
pasteButton.addEventListener('click', async () => {
  const r = await readText();
  if (r.ok) input.value = r.text.trim();
  else hint.textContent = r.reason === 'denied' ? 'Paste is blocked. Press Ctrl+V in the field instead.' : 'Nothing to paste.';
});
```

`copyBlob(pngBlob)` copies an image such as a chart; it has no fallback, and most browsers accept only PNG.

### What goes wrong?

- The async clipboard needs a secure context and a user gesture. Outside a secure context, text copies use the fallback (`method: 'exec-command'`); images and reads return `reason: 'unsupported'`.
- Nothing to copy is reported, not thrown:

```ts
import { copyRich } from '@absoluteui/services/clipboard';

await copyRich({}); // => { ok: false, method: 'none', reason: 'empty' }
```
