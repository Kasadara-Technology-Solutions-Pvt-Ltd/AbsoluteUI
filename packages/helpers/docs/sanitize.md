Clean data on the way in and scrub it on the way out: normalise imported rows, contact details, and file names, strip invisible characters, and redact secrets and personal data before logging. It is not an HTML sanitizer: put untrusted text into the page with `textContent`, and check URLs with `@absoluteui/helpers/url`. The [Helpers and services guide](/docs/guides/helpers-and-services/) lists the security defaults shared by all helpers.

### How do I clean rows from an import before saving them?

`cleanRecords` runs one pipeline: normalise each row (trim, strip invisible characters, lowercase keys, empty strings to `null`), drop empty rows, remove duplicates, filter, and map. `coerceRecordTypes` then turns strings into numbers, booleans, and dates.

```ts
import { parseCsv } from '@absoluteui/helpers/csv';
import { cleanRecords, coerceRecordTypes } from '@absoluteui/helpers/sanitize';

const { rows } = parseCsv('Email,Name,FTE,Active\n ASHA@example.com , Asha  Rao ,1,yes\n,,,\nasha@example.com,Asha Rao,0.8,yes\nliam@example.com,Liam Chen,x,no\n', { header: true });
const clean = cleanRecords(rows, {
  normalize: { lowercaseKeys: true, collapseWhitespace: true, emptyToNull: true, lowercase: ['email'] },
  dedupeBy: (r) => r.email,
  keep: 'last',
  map: (r) => coerceRecordTypes(r, { fte: 'number', active: 'boolean' }),
});
clean; // => [{ email: 'asha@example.com', name: 'Asha Rao', fte: 0.8, active: true }, { email: 'liam@example.com', name: 'Liam Chen', fte: null, active: false }]
```

Unparseable values become `null` by default; pass `{ onInvalid: 'keep' }` or `'omit'` to change that.

### How do I log an object without leaking secrets or personal data?

`redact` replaces values under secret-looking keys (passwords, tokens, `Authorization`, API keys); add your own keys, and `maskStrings: true` masks e-mails, phone and card numbers inside the remaining text. `truncateForLog` keeps the line short.

```ts
import { DEFAULT_REDACT_KEYS, maskPii, redact, truncateForLog } from '@absoluteui/helpers/sanitize';

const event = { user: 'E-1001', headers: { Authorization: 'Bearer abc.def' }, body: { note: 'Call asha@example.com', bankAccount: 'DE89370400440532013000' } };
const safe = redact(event, { keys: [...DEFAULT_REDACT_KEYS, /bankAccount/i], maskStrings: true });
safe; // => { user: 'E-1001', headers: { Authorization: '[REDACTED]' }, body: { note: 'Call a***@example.com', bankAccount: '[REDACTED]' } }
event.headers.Authorization; // => 'Bearer abc.def' // the input is not changed
maskPii('Card 4111 1111 1111 1111 declined'); // => 'Card **** **** **** 1111 declined'
truncateForLog(safe, 30).length; // => 30
```

These are heuristics for logs and previews; the safest data is the data you never log.

### How do I build a file name from user data?

`safeFileName` produces one valid name on Windows, macOS, and Linux: path separators and control characters go, reserved device names are escaped, and long names are shortened without losing the extension.

```ts
import { safeFileName } from '@absoluteui/helpers/sanitize';

safeFileName('Payslip: Rao/Asha 2026-09.pdf'); // => 'Payslip_ Rao_Asha 2026-09.pdf'
safeFileName('NUL.csv'); // => '_NUL.csv'
safeFileName(`${'Quarterly headcount report '.repeat(20)}.xlsx`, { maxLength: 40 }).endsWith('.xlsx'); // => true
safeFileName('...', { fallback: 'export.csv' }); // => 'export.csv'
```

### How do I normalise contact details before matching them?

Normalise before comparing or storing, so `Asha@Example.com` and `asha@example.com` are one person. `stripInvisible` removes zero-width and bidi control characters that make two names look equal when they are not.

```ts
import { normalizeEmail, normalizePhone, stripInvisible } from '@absoluteui/helpers/sanitize';

normalizeEmail(' Asha.Rao@Example.COM ', { lowercaseLocal: true }); // => 'asha.rao@example.com'
normalizeEmail('not-an-email'); // => undefined
normalizePhone('080 5550 1234', { defaultCountryCode: '91' }); // => '+918055501234'
const typed = 'asha' + String.fromCharCode(0x200b) + '.rao';
typed === 'asha.rao'; // => false
stripInvisible(typed) === 'asha.rao'; // => true
```

### What goes wrong?

- `sanitizeSearchQuery` cleans text for display and matching, but it is not an injection defence: always use parameterised queries on the server.
- `maskPii` misses formats it does not recognise, and may mask a number that only looks like a card.
- `normalizePhone` works on digits only; it does not know numbering plans, so it cannot tell a valid number from a well-formed one.

```ts
import { normalizePhone, sanitizeSearchQuery } from '@absoluteui/helpers/sanitize';

sanitizeSearchQuery("  Rao'; DROP TABLE staff;--  "); // => "Rao'; DROP TABLE staff;--"
normalizePhone('12'); // => undefined // too few digits for E.164
```
