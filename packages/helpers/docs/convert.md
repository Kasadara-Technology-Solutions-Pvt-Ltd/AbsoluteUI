Strict conversions for values that arrive as text or `unknown`: query strings, form fields, CSV cells, `localStorage`, and JSON from other systems. The `to...` functions return `undefined` for bad input instead of `NaN` or a guessed value; the `...OrThrow` variants throw a `ValidationError`. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I read typed filters from a query string?

`coerceFields` converts a whole record by a schema and returns a `Result`; all bad keys come back together in `error.fields`, ready for a form or a 400 response.

```ts
import { coerceFields } from '@absoluteui/helpers/convert';

const query = Object.fromEntries(new URLSearchParams('page=2&active=yes&hiredAfter=2025-01-01'));
const parsed = coerceFields(query, {
  page: 'integer',
  active: 'boolean',
  hiredAfter: { kind: 'date', optional: true },
  dept: { kind: 'string', optional: true },
});
parsed.ok ? [parsed.value.page, parsed.value.active, parsed.value.dept] : []; // => [2, true, undefined]
const bad = coerceFields({ page: 'two', active: '' }, { page: 'integer', active: 'boolean' });
bad.ok ? {} : bad.error.fields; // => { page: 'Expected integer.', active: 'Required.' }
```

### How do I parse numbers that users typed in their own format?

Pass `locale` to accept that locale's group and decimal separators. Text such as `'12abc'` or `''` is rejected rather than half-parsed, unlike `parseFloat`.

```ts
import { toInteger, toNumber } from '@absoluteui/helpers/convert';

toNumber('1.234,5', { locale: 'de' }); // => 1234.5
toNumber('1,234.5', { locale: 'en' }); // => 1234.5
parseFloat('12abc'); // => 12
toNumber('12abc'); // => undefined
toInteger('7.5'); // => undefined
toInteger('7.5', { rounding: 'half-even' }); // => 8
```

### How do I accept dates without guessing the format?

`toDate` accepts only a `Date`, epoch milliseconds, or ISO 8601 text; ambiguous forms like `01/02/2026` (January or February?) are rejected. A bare `YYYY-MM-DD` is UTC midnight. For calendar dates without a time, prefer [`helpers/date`](/docs/api/helpers/date/).

```ts
import { toDate, toDateOrThrow } from '@absoluteui/helpers/convert';

toDate('2026-10-05T09:00:00Z')?.toISOString(); // => '2026-10-05T09:00:00.000Z'
toDate('01/02/2026'); // => undefined
toDateOrThrow('next Friday'); // => throws HLP_CONVERT_DATE
```

### How do I normalise a value that may be one item, many, or nothing?

`toArray` and `toSet` accept a single value, any iterable, or `null`/`undefined`, which is handy for multi-select values and API fields that are sometimes a list. Strings are kept whole, not split into characters.

```ts
import { toArray, toSet } from '@absoluteui/helpers/convert';

toArray('HR'); // => ['HR']
toArray(['HR', 'IT']); // => ['HR', 'IT']
toArray(null); // => []
toSet(['HR', 'IT', 'HR']).size; // => 2
```
