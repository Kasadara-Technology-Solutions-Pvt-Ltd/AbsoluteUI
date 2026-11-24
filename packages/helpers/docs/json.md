JSON that is safe to accept from outside: parsing with size, depth, and key limits and prototype-pollution protection, stringifying without crashing on cycles or BigInt, canonical output for comparisons, and JSON Pointer, JSON Patch, Merge Patch, and NDJSON. Reach for it instead of bare `JSON.parse` whenever the text comes from a server, storage, a file, or a user. Error conventions (`Result`, error codes) are in the [Helpers and services guide](/docs/guides/helpers-and-services/).

### How do I parse a stored or received payload into a typed value?

Pass a type guard as `validate` and the result is typed; a value of the wrong shape fails with `HLP_JSON_SHAPE` instead of surfacing later. `dates: true` revives ISO date-times that carry `Z` or an offset.

```ts
import { safeJsonParse } from '@absoluteui/helpers/json';

interface Draft { employeeId: string; savedAt: Date }
const isDraft = (v: unknown): v is Draft =>
  typeof v === 'object' && v !== null && 'employeeId' in v && typeof v.employeeId === 'string' && 'savedAt' in v && v.savedAt instanceof Date;

const r = safeJsonParse('{"employeeId":"E-1001","savedAt":"2026-09-30T08:15:00Z"}', { validate: isDraft, dates: true });
r.ok ? r.value.savedAt.toISOString() : r.error.code; // => '2026-09-30T08:15:00.000Z'
const bad = safeJsonParse('{"employeeId":42}', { validate: isDraft });
bad.ok ? undefined : bad.error.code; // => 'HLP_JSON_SHAPE'
```

### How do I send only the fields a user changed?

`createMergePatch` turns the loaded record and the edited one into an RFC 7396 body (`application/merge-patch+json`); `null` means "remove". The server, or a local store, applies it with `applyMergePatch`.

```ts
import { applyMergePatch, createMergePatch } from '@absoluteui/helpers/json';

const loaded = { name: 'Asha Rao', dept: 'Finance', phone: '+91 80 5550 1234', grade: 'L4' };
const edited = { name: 'Asha Rao', dept: 'Payroll', grade: 'L5' };
const body = createMergePatch(loaded, edited);
body; // => { dept: 'Payroll', phone: null, grade: 'L5' }
applyMergePatch(loaded, body); // => edited
```

### How do I apply a change only if nobody else changed the record?

Start a JSON Patch with a `test` operation. `applyJsonPatch` is atomic: if the test fails, nothing is applied and the error names the failing operation.

```ts
import { tryApplyJsonPatch, type JsonPatchOperation } from '@absoluteui/helpers/json';

const approve: JsonPatchOperation[] = [
  { op: 'test', path: '/status', value: 'pending' },
  { op: 'replace', path: '/status', value: 'approved' },
  { op: 'add', path: '/approvedBy', value: 'M-204' },
];
const ok = tryApplyJsonPatch({ id: 'LR-77', status: 'pending' }, approve);
ok.ok ? ok.value : undefined; // => { id: 'LR-77', status: 'approved', approvedBy: 'M-204' }
const stale = tryApplyJsonPatch({ id: 'LR-77', status: 'rejected' }, approve);
stale.ok ? undefined : stale.error.code; // => 'HLP_JSON_PATCH_TEST_FAILED'
```

### How do I tell whether a form has unsaved changes?

`canonicalJson` sorts keys and removes whitespace, so equal data gives an equal string regardless of key order. Use it for dirty checks, cache keys, or signing input.

```ts
import { canonicalJson } from '@absoluteui/helpers/json';

const saved = { filters: { dept: 'hr', active: true }, sort: 'name' };
const current = { sort: 'name', filters: { active: true, dept: 'hr' } };
canonicalJson(saved) === canonicalJson(current); // => true
canonicalJson({ ...current, sort: 'joined' }) === canonicalJson(saved); // => false
```

### How do I log or export values that plain `JSON.stringify` rejects?

`safeJsonStringify` writes BigInt as a string, Maps and Sets as arrays, Errors as objects, and cycles as a placeholder. `stringifyNdjson` and `parseNdjson` handle one record per line; `onError: 'skip'` keeps the good lines of an import and reports the bad line numbers (never their content).

```ts
import { parseNdjson, safeJsonStringify, stringifyNdjson } from '@absoluteui/helpers/json';

const node: { id: string; parent?: unknown } = { id: 'CEO' };
node.parent = node;
safeJsonStringify({ salaryCents: 12_500_000n, node }); // => '{"salaryCents":"12500000","node":{"id":"CEO","parent":"[Circular]"}}'

stringifyNdjson([{ id: 'E-1' }, { id: 'E-2' }]); // => '{"id":"E-1"}\n{"id":"E-2"}\n'
const badLines: number[] = [];
const imported = parseNdjson('{"id":"E-1"}\n{"id":\n{"id":"E-3"}\n', { onError: 'skip', onLineError: (line) => badLines.push(line) });
imported.ok ? imported.value : undefined; // => [{ id: 'E-1' }, { id: 'E-3' }]
badLines; // => [2]
```

### What goes wrong?

Limits fail with a `LimitError`, pollution keys with a `ValidationError`; messages never echo the input. Lower `maxLength`, `maxDepth`, and `maxKeys` for untrusted input, or use `unsafeKeys: 'strip'` to drop `__proto__`, `constructor`, and `prototype` keys silently.

```ts
import { parseJsonOrThrow } from '@absoluteui/helpers/json';

parseJsonOrThrow('{"__proto__":{"isAdmin":true}}'); // => throws HLP_JSON_UNSAFE_KEY
parseJsonOrThrow('{"__proto__":{"isAdmin":true},"a":1}', { unsafeKeys: 'strip' }); // => { a: 1 }
parseJsonOrThrow('[[[1]]]', { maxDepth: 2 }); // => throws HLP_JSON_TOO_DEEP
parseJsonOrThrow('"a long string"', { maxLength: 5 }); // => throws HLP_JSON_TOO_LONG
```
