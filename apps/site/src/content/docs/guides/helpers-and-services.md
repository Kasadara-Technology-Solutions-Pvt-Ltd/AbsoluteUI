---
title: Helpers and services
description: The zero-dependency helper and service packages, how to import them, and the security, accessibility, and performance rules they follow.
---

`@absoluteui/helpers` and `@absoluteui/services` are two standalone packages for application code. They do not depend on the components (core and the components use `@absoluteui/helpers` internally), have **no third-party runtime dependencies**, and can be used in any TypeScript or JavaScript project. `@absoluteui/services` is in preview and not yet published to npm.

| | `@absoluteui/helpers` | `@absoluteui/services` |
|---|---|---|
| What | Pure functions and data structures: collections, LINQ, dates, business calendars, strings, numbers, money, JSON, CSV, validation | Code that talks to the platform: storage, HTTP, files, downloads, ZIP, uploads, clipboard, crypto, logging, environment |
| Runs in | Browsers, Node, workers, server rendering | Browsers; every module is safe to import during server rendering |
| Depends on | Nothing | `@absoluteui/helpers` |

The full list of modules is in the API reference: [`@absoluteui/helpers`](/docs/api/helpers/) and [`@absoluteui/services`](/docs/api/services/).

## Importing

Every module is its own subpath. Import from the subpath so your bundle contains only what you use:

```ts
import { groupBy, sortBy } from '@absoluteui/helpers/array';
import { addMonths, formatDate } from '@absoluteui/helpers/date';

const orders = [
  { id: 1, region: 'North', total: 120 },
  { id: 2, region: 'South', total: 80 },
];
const byRegion = groupBy(orders, (o) => o.region);
const largestFirst = sortBy(orders, { by: (o) => o.total, order: 'desc' });
const renewal = formatDate(addMonths('2026-01-31', 1), 'yyyy-MM-dd'); // '2026-02-28'
console.log(byRegion, largestFirst, renewal);
```

The package root exposes each module as a namespace (`import { array } from '@absoluteui/helpers'`). That is convenient in scripts, but it prevents bundlers from dropping unused modules.

## Conventions

- **Nothing is mutated.** Functions return new values unless their name says otherwise (`shuffleInPlace`, `deepSetInPlace`).
- **Parsers do not throw.** `parse...` and `to...` functions return `undefined` (or a `Result`) for bad input; the `...OrThrow` variants throw. `toNumber('12abc')` is `undefined`, never `NaN`.
- **Errors have stable codes.** Every error is a `HelperError` with a `code` such as `HLP_JSON_TOO_DEEP` and a `kind` such as `validation` or `limit`. Messages never contain the input that caused them, so they are safe to log.
- **Cancellation everywhere.** Asynchronous functions accept an `AbortSignal`.

```ts
import { safeJsonParse } from '@absoluteui/helpers/json';

const parsed = safeJsonParse('{"theme":"dark"}', { maxDepth: 32 });
if (parsed.ok) console.log(parsed.value);
else console.warn(parsed.error.code);
```

## Security

| Rule | Where it applies |
|---|---|
| Prototype-pollution protection: `__proto__`, `constructor`, and `prototype` are never written through a dynamic key | Deep set and merge, unflatten, JSON parsing, JSON Patch, JSON Pointer, query-string parsing, CSV headers, schema validation |
| Linear-time regular expressions only, checked by a linter rule and by timing tests with hostile input | Every validator and parser |
| Size, depth, and count limits on every parser, reported as `LimitError` | JSON, CSV, NDJSON, query strings, headers, ZIP archives, file reads |
| Cryptographic randomness for anything security-related; the seeded generator is named `createSeededRandom` and documented as unsafe for secrets | `@absoluteui/helpers/random` |
| Formula-injection protection (`=`, `+`, `-`, `@`) on by default | CSV generation and CSV downloads |
| URL scheme allow-lists and open-redirect protection | `isSafeUrl`, `safeRedirectTarget`, downloads from URLs |
| Safe file names: path separators, reserved Windows names, control characters, and bidirectional overrides removed | `safeFileName`, downloads, ZIP entries |
| Automatic redaction of secrets (passwords, tokens, keys, cookies) | Logger, `redact`, HTTP header logging |
| No `eval`, no `new Function`, no HTML parsing | Everywhere. To sanitize HTML, use `sanitizeHtml` from `@absoluteui/core`. |

Web storage is readable by any script on the page. Do not keep authentication tokens in `localStorage`; the encrypted store protects data at rest, not against cross-site scripting.

## Accessibility

A function library cannot conform to WCAG by itself; the page that shows its output does. These packages make that output ready for WCAG 2.2 AA:

- **Locale-aware text.** Formatters use `Intl` and take a `locale`. Where an abbreviation is ambiguous for screen readers, a long form exists: `formatBytes(2_400_000, { style: 'long' })` gives "2.4 megabytes".
- **Status, not focus.** Downloads, copies, uploads, and file validation return status objects with plain-language descriptions (`describeDownloadStatus`, `describeCopyStatus`, `describeUploadProgress`) for a live region. Services never move focus.
- **Actionable errors.** Validation messages say what to do ("Enter a date in the format YYYY-MM-DD"), map to form fields, and can be replaced for localization. `fieldErrors` produces the map that the Error Summary and Form Field components display.
- **User preferences.** `@absoluteui/services/env` reports reduced motion, contrast, forced colours, and colour scheme, and notifies you when they change.
- **Contrast.** `@absoluteui/helpers/color` computes WCAG contrast ratios and picks readable text colours.
- **Reasons for disabled days.** The business calendar describes why a day is not working ("Holiday: Diwali"), so a date picker can say more than "unavailable". See [Business calendars](/docs/guides/business-calendars/).

## Performance

- Subpath imports and `sideEffects: false` keep bundles to what you use.
- LINQ and date ranges are lazy generators; nothing is computed until you iterate.
- Native platform features are used when present (`Object.groupBy`, `Set.prototype.union`, `structuredClone`, `Uint8Array.prototype.toBase64`, `CompressionStream`), with fallbacks that give identical results.
- `Intl` formatters are cached per locale and options.
- Data structures state their complexity: sorted maps and interval trees are O(log n), queues and deques O(1), and business-day counts do not depend on the length of the range.

## Examples

### Money without floating-point errors

```ts
import { decimal } from '@absoluteui/helpers/decimal';

const total = decimal('100.00');
const shares = total.allocate([1, 1, 1], { scale: 2 }).map(String); // ['33.34', '33.33', '33.33']
console.log(shares, decimal('0.1').add('0.2').toString()); // '0.3'
```

### Typed validation with field messages

```ts
import { v, validate } from '@absoluteui/helpers/validate';
import { fieldErrors } from '@absoluteui/helpers/error';

const employee = v.object({
  name: v.string({ min: 1, max: 80, trim: true }),
  email: v.string({ email: true }),
  age: v.number({ min: 18, integer: true }),
});

const result = validate(employee, { name: ' Asha ', email: 'not-an-email', age: 17 });
if (!result.ok) console.log(fieldErrors([result.error])); // { email: '...', age: '...' }
```

### Retrying with backoff and cancellation

```ts
import { retry } from '@absoluteui/helpers/async';

const controller = new AbortController();
const report = await retry(async (_attempt, signal) => {
  const response = await fetch('/api/report', { signal });
  if (!response.ok) throw new Error('Report unavailable.');
  return response.json() as Promise<unknown>;
}, { retries: 3, signal: controller.signal });
console.log(report);
```

For HTTP calls, the client in `@absoluteui/services/http` already does this, retrying only idempotent requests and honouring `Retry-After` (see [HTTP client](/docs/guides/http/)).
