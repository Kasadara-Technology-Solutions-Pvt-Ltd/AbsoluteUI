Parse yes/no values from text, combine rule checks, and label booleans for display. Use it where flags arrive as strings (CSV imports, query strings, environment variables, legacy APIs) or where a decision depends on several conditions. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I read yes/no values from an import or configuration?

`parseBoolean` accepts `true/false`, `yes/no`, `y/n`, `on/off`, and `1/0` (trimmed, any case) and returns `undefined` for anything else, so a typo is reported instead of read as `false`. Add words for other languages with `trueValues` and `falseValues`.

```ts
import { parseBoolean } from '@absoluteui/helpers/boolean';

const cells = [' Yes', 'N', 'ja', 'nein', 'maybe'];
cells.map((c) => parseBoolean(c, { trueValues: ['ja'], falseValues: ['nein'] })); // => [true, false, true, false, undefined]
parseBoolean('yes', { strict: true }); // => undefined
parseBoolean('TRUE', { strict: true }); // => true
```

### How do I combine the checks behind a decision?

`all`, `any`, and `none` accept booleans or functions; functions are evaluated lazily and stop at the first decisive result, so expensive checks run only when needed. `countTrue` and `majority` summarise several answers.

```ts
import { all, countTrue, implies, majority } from '@absoluteui/helpers/boolean';

const request = { days: 12, hasBalance: true, managerApproved: true, hrApproved: false };
const canAutoApprove = all([
  request.hasBalance,
  request.managerApproved,
  () => implies(request.days > 10, request.hrApproved), // long leave also needs HR
]);
canAutoApprove; // => false
const panel = [true, false, true];
[countTrue(panel), majority(panel)]; // => [2, true]
```

### How do I show booleans in a grid or an export?

`booleanToLabel` and `booleanToYesNo` map `true`, `false`, and a missing value to labels you choose, so `null` does not silently appear as "No".

```ts
import { booleanToLabel, booleanToYesNo } from '@absoluteui/helpers/boolean';

const remote: (boolean | null)[] = [true, false, null];
remote.map((v) => booleanToLabel(v, { true: 'Remote', false: 'On site', null: 'Not set' })); // => ['Remote', 'On site', 'Not set']
booleanToYesNo(true, { true: 'Ja', false: 'Nein' }); // => 'Ja'
```
