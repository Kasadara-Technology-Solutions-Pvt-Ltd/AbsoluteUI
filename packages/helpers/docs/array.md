Immutable helpers for the lists an application shows: group, sort, page, summarise, and edit arrays without mutating them, and turn flat parent/child rows into trees. Every function returns a new array. For query-style chains over large or lazy sequences, see [`helpers/linq`](/docs/api/helpers/linq/); the [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I group employees by department and show one page of the result?

Sort first (stable, multi-key, locale-aware), then page with `paginate`; `groupBy` and `sumBy` give the per-department figures for a summary row.

```ts
import { groupBy, paginate, sortBy, sumBy } from '@absoluteui/helpers/array';

const staff = [
  { name: 'Asha', dept: 'Finance', salary: 5200 },
  { name: 'Ben', dept: 'HR', salary: 4100 },
  { name: 'Chen', dept: 'Finance', salary: 6100 },
  { name: 'Dana', dept: 'IT', salary: 7000 },
  { name: 'Eli', dept: 'HR', salary: 3900 },
];
const sorted = sortBy(staff, [{ by: (e) => e.dept }, { by: (e) => e.salary, order: 'desc' }], { locale: 'en' });
const page = paginate(sorted, 1, 2);
page.items.map((e) => e.name); // => ['Chen', 'Asha']
[page.pageCount, page.hasNext]; // => [3, true]
const byDept = groupBy(staff, (e) => e.dept);
sumBy(byDept.HR ?? [], (e) => e.salary); // => 8000
```

### How do I update a list held in state without mutating it?

`upsertBy` replaces the row with the same key or appends it; `removeAt`, `move`, and `toggleItem` cover deletes, drag-reorder, and multi-select.

```ts
import { move, toggleItem, upsertBy } from '@absoluteui/helpers/array';

const rows = [{ id: 1, status: 'draft' }, { id: 2, status: 'draft' }];
const saved = upsertBy(rows, { id: 2, status: 'submitted' }, (r) => r.id);
saved.map((r) => r.status); // => ['draft', 'submitted']
rows[1]?.status; // => 'draft'
move(['Mon', 'Tue', 'Wed'], 2, 0); // => ['Wed', 'Mon', 'Tue']
toggleItem([3, 7], 7); // => [3]
```

### How do I build an org tree from flat rows?

`buildTree` links rows by `id` and `parentId` (field names or selectors) and reports orphans and cycles instead of looping; `flattenTree` turns it back into indented rows.

```ts
import { buildTree, flattenTree } from '@absoluteui/helpers/array';

const people = [
  { id: 'ceo', parentId: null, name: 'Maya' },
  { id: 'cfo', parentId: 'ceo', name: 'Omar' },
  { id: 'acct', parentId: 'cfo', name: 'Lin' },
  { id: 'temp', parentId: 'gone', name: 'Sam' },
];
const tree = buildTree(people, { orphans: 'omit' });
tree.orphans.map((p) => p.name); // => ['Sam']
flattenTree(tree.roots).map((e) => e.depth); // => [0, 1, 2]
```

### How do I process records in batches?

`chunk` splits work into fixed-size batches, for example to import rows 500 at a time; `partition` separates valid from invalid rows in one pass.

```ts
import { chunk, partition } from '@absoluteui/helpers/array';

const ids = Array.from({ length: 1200 }, (_, i) => i + 1);
chunk(ids, 500).map((batch) => batch.length); // => [500, 500, 200]
const [valid, invalid] = partition(['E-1', '', 'E-3'], (id) => id !== '');
[valid.length, invalid.length]; // => [2, 1]
```

### What goes wrong?

Sizes and indexes are validated, and generated arrays are capped at `MAX_GENERATED_LENGTH`:

```ts
import { chunk, range } from '@absoluteui/helpers/array';

chunk([1, 2, 3], 0); // => throws HLP_ARRAY_INVALID_SIZE
range(0, 1e9); // => throws HLP_ARRAY_TOO_LARGE
```
