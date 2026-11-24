LINQ-style queries over any iterable: filter, project, join, group, and aggregate in one readable chain. Queries are lazy (nothing runs until a terminal such as `toArray()` or `sum()`), so they work on generators and large sequences. Use the fluent `from(...)` style, or the standalone operators with `pipe` when bundle size matters. For one-off array tasks, [`helpers/array`](/docs/api/helpers/array/) is simpler; the [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I build a headcount and payroll report per department?

Join employees to departments, group by department name, and aggregate each group; `orderByDescending` sorts the report.

```ts
import { from } from '@absoluteui/helpers/linq';

const departments = [{ id: 1, name: 'Finance' }, { id: 2, name: 'HR' }, { id: 3, name: 'IT' }];
const employees = [
  { name: 'Asha', deptId: 1, salary: 5200, active: true },
  { name: 'Ben', deptId: 2, salary: 4100, active: true },
  { name: 'Chen', deptId: 1, salary: 6100, active: true },
  { name: 'Dana', deptId: 3, salary: 7000, active: false },
];
const report = from(employees)
  .where((e) => e.active)
  .join(departments, (e) => e.deptId, (d) => d.id, (e, d) => ({ dept: d.name, salary: e.salary }))
  .groupBy((r) => r.dept)
  .select((g) => ({ dept: g.key, headcount: g.count(), payroll: g.sum((r) => r.salary) }))
  .orderByDescending((r) => r.payroll)
  .toArray();
report; // => [{ dept: 'Finance', headcount: 2, payroll: 11300 }, { dept: 'HR', headcount: 1, payroll: 4100 }]
```

### How do I keep rows that have no match?

`leftJoin` passes `undefined` for a missing partner, so employees without a manager still appear; `groupJoin` attaches all matches as a list, for example each manager's direct reports.

```ts
import { from } from '@absoluteui/helpers/linq';

const people = [{ id: 'E-1', name: 'Maya', managerId: null }, { id: 'E-2', name: 'Omar', managerId: 'E-1' }, { id: 'E-3', name: 'Lin', managerId: 'E-1' }];
from(people)
  .leftJoin(people, (p) => p.managerId, (m) => m.id, (p, m) => `${p.name}: ${m?.name ?? 'no manager'}`)
  .toArray(); // => ['Maya: no manager', 'Omar: Maya', 'Lin: Maya']
from(people)
  .groupJoin(people, (m) => m.id, (p) => p.managerId, (m, reports) => ({ manager: m.name, reports: reports.count() }))
  .where((r) => r.reports > 0)
  .toArray(); // => [{ manager: 'Maya', reports: 2 }]
```

### How do I stop early on a large or endless sequence?

Because queries are lazy, `take`, `first`, and `any` stop pulling items as soon as they have an answer; only the items needed are produced.

```ts
import { from } from '@absoluteui/helpers/linq';

let produced = 0;
function* payDates(): Generator<string> {
  for (let month = 1; ; month++) {
    produced++;
    yield `2026-${String(month).padStart(2, '0')}-25`;
  }
}
from(payDates()).skip(9).take(2).toArray(); // => ['2026-10-25', '2026-11-25']
produced; // => 11
```

### How do I use standalone operators to keep bundles small?

`pipe` applies operator functions left to right; import only the operators you use.

```ts
import { orderBy, pipe, select, take, thenBy, toArray, where } from '@absoluteui/helpers/linq';

const requests = [
  { who: 'Ben', days: 5, type: 'annual' },
  { who: 'Asha', days: 2, type: 'sick' },
  { who: 'Chen', days: 5, type: 'annual' },
  { who: 'Dana', days: 1, type: 'annual' },
];
pipe(
  requests,
  where((r) => r.type === 'annual'),
  orderBy((r) => -r.days),
  thenBy((r) => r.who),
  take(2),
  select((r) => r.who),
  toArray(),
); // => ['Ben', 'Chen']
```

### What goes wrong?

`first`, `single`, and `elementAt` throw on missing or ambiguous results; use the `...OrDefault` variants when absence is normal.

```ts
import { from } from '@absoluteui/helpers/linq';

const ids = from(['E-1', 'E-2']);
ids.firstOrDefault((id) => id === 'E-9', 'none'); // => 'none'
ids.first((id) => id === 'E-9'); // => throws HLP_LINQ_NO_ELEMENTS
ids.single(); // => throws HLP_LINQ_MULTIPLE_ELEMENTS
```
