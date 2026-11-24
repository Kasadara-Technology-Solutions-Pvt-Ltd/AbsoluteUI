Set algebra over arrays, `Set`s, and any iterable: union, intersection, difference, and subset checks, each with a `...By` variant that compares records by a key. Array inputs return arrays in first-seen order; a `Set` as first argument returns a `Set`. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I check whether a user has the permissions a screen needs?

`isSubset` answers yes or no; `except` lists what is missing, for a precise "you need ..." message.

```ts
import { except, isSubset } from '@absoluteui/helpers/set';

const granted = new Set(['employee.read', 'leave.read', 'leave.approve']);
const payrollScreen = ['employee.read', 'payroll.read', 'payroll.run'];
isSubset(payrollScreen, granted); // => false
except(payrollScreen, granted); // => ['payroll.read', 'payroll.run']
isSubset(['leave.read', 'leave.approve'], granted); // => true
```

### How do I find who joined and who left between two roster snapshots?

The `...By` variants compare records by a key, so objects from two API calls match by id even though they are different instances.

```ts
import { exceptBy, intersectBy } from '@absoluteui/helpers/set';

const lastMonth = [{ id: 'E-1', name: 'Asha' }, { id: 'E-2', name: 'Ben' }, { id: 'E-3', name: 'Chen' }];
const thisMonth = [{ id: 'E-2', name: 'Ben' }, { id: 'E-3', name: 'Chen' }, { id: 'E-4', name: 'Dana' }];
const byId = (e: { id: string }) => e.id;
exceptBy(thisMonth, lastMonth, byId).map((e) => e.name); // => ['Dana'] // joiners
exceptBy(lastMonth, thisMonth, byId).map((e) => e.name); // => ['Asha'] // leavers
intersectBy(lastMonth, thisMonth, byId).length; // => 2
```

### How do I merge selections from several filters?

`union` keeps first-seen order and drops duplicates; `symmetricDifference` shows what differs between two selections, for example when comparing two saved views.

```ts
import { symmetricDifference, union } from '@absoluteui/helpers/set';

const fromDeptFilter = ['E-1', 'E-2', 'E-5'];
const fromSkillFilter = ['E-2', 'E-7'];
union(fromDeptFilter, fromSkillFilter); // => ['E-1', 'E-2', 'E-5', 'E-7']
symmetricDifference(fromDeptFilter, fromSkillFilter); // => ['E-1', 'E-5', 'E-7']
```

### How do I list every combination of options?

`cartesianProduct` builds combinations, for example every site, shift, and role slot for a staffing plan. It is capped at `MAX_CARTESIAN_SIZE` results.

```ts
import { cartesianProduct } from '@absoluteui/helpers/set';

const slots = cartesianProduct([['Pune', 'Oslo'], ['day', 'night'], ['lead']]);
slots.length; // => 4
slots[1]; // => ['Pune', 'night', 'lead']
cartesianProduct([Array.from({ length: 1000 }, (_, i) => i), Array.from({ length: 1001 }, (_, i) => i)]); // => throws HLP_SET_PRODUCT_TOO_LARGE
```
