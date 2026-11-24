Comparers and predicates for sorting, range checks, fallbacks, and small decision tables. `compareValues` orders numbers, strings, bigints, and dates consistently and puts `null`/`undefined` last in either direction, so grids sort predictably with incomplete data. For sorting arrays in one call, [`sortBy` in `helpers/array`](/docs/api/helpers/array/) builds on the same rules.

### How do I sort a grid by several columns with empty values last?

Build a comparer with `by` for each column and chain them with `composeComparers` (or `thenBy`). Pass an `Intl.Collator` for language-correct string order.

```ts
import { by, composeComparers } from '@absoluteui/helpers/compare';

const rows = [
  { name: 'Ölund', dept: 'IT', hired: new Date('2021-03-01') },
  { name: 'Adams', dept: null, hired: new Date('2019-07-15') },
  { name: 'Zhou', dept: 'IT', hired: new Date('2023-01-09') },
  { name: 'Berg', dept: 'HR', hired: new Date('2020-11-30') },
];
const collator = new Intl.Collator('sv');
rows.sort(composeComparers(
  by((r) => r.dept, { collator }),
  by((r) => r.hired, { direction: 'desc' }),
));
rows.map((r) => r.name); // => ['Berg', 'Zhou', 'Ölund', 'Adams']
```

### How do I sort document names the way people expect?

`naturalCompare` compares digit runs as numbers, so "Payslip 2" comes before "Payslip 10".

```ts
import { naturalCompare } from '@absoluteui/helpers/compare';

const files = ['Payslip 10.pdf', 'Payslip 2.pdf', 'payslip 1.pdf'];
[...files].sort((a, b) => naturalCompare(a, b, { sensitivity: 'base' })); // => ['payslip 1.pdf', 'Payslip 2.pdf', 'Payslip 10.pdf']
[...files].sort(); // => ['Payslip 10.pdf', 'Payslip 2.pdf', 'payslip 1.pdf']
```

### How do I check that a value falls inside a period or band?

`between` works for numbers, strings, and dates, with inclusive or half-open bounds; missing values are never inside.

```ts
import { between } from '@absoluteui/helpers/compare';

const payPeriod = [new Date('2026-10-01T00:00:00Z'), new Date('2026-11-01T00:00:00Z')] as const;
const inPeriod = (d: Date | null) => between(d, payPeriod[0], payPeriod[1], { inclusive: 'left' });
inPeriod(new Date('2026-10-31T23:59:00Z')); // => true
inPeriod(new Date('2026-11-01T00:00:00Z')); // => false
inPeriod(null); // => false
between(48_000, 45_000, 60_000); // => true
```

### How do I pick a display value or map a status without long if chains?

`coalesceBlank` returns the first value that is not `null`, `undefined`, or blank text; `match` evaluates cases in order and stops at the first that fits.

```ts
import { coalesceBlank, match } from '@absoluteui/helpers/compare';

const employee = { preferredName: '  ', firstName: 'Asha', login: 'arao' };
coalesceBlank(employee.preferredName, employee.firstName, employee.login); // => 'Asha'

const balanceLabel = (days: number): string =>
  match<number, string>(days)
    .with((d) => d < 0, () => 'Overdrawn')
    .with(0, () => 'None left')
    .with((d) => d <= 3, (d) => `Low (${d})`)
    .otherwise((d) => `${d} days`);
[-1, 0, 2, 14].map(balanceLabel); // => ['Overdrawn', 'None left', 'Low (2)', '14 days']
```

### How do I combine filter conditions?

`allPass`, `anyPass`, and `complement` build one predicate from several, for example the filters a user switched on.

```ts
import { allPass, complement } from '@absoluteui/helpers/compare';

interface Emp { name: string; dept: string; active: boolean }
const staff: Emp[] = [
  { name: 'Asha', dept: 'HR', active: true },
  { name: 'Ben', dept: 'IT', active: true },
  { name: 'Chen', dept: 'HR', active: false },
];
const isHr = (e: Emp) => e.dept === 'HR';
const isInactive = (e: Emp) => !e.active;
staff.filter(allPass([isHr, complement(isInactive)])).map((e) => e.name); // => ['Asha']
```
