Immutable helpers for plain objects: pick and reshape records, read and write nested paths, merge settings, and compute what changed between two versions of a record. Every function that writes a dynamic key refuses `__proto__`, `constructor`, and `prototype`, so it is safe on parsed JSON. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I send only the fields the user changed?

`diff` lists the changes between the loaded record and the edited one; keep the changed top-level keys with `pickBy` for a `PATCH` body, or store the change list as an audit entry.

```ts
import { diff, pickBy } from '@absoluteui/helpers/object';

const loaded = { id: 'E-7', name: 'Asha Rao', dept: 'HR', address: { city: 'Pune', zip: '411001' } };
const edited = { ...loaded, dept: 'Finance', address: { city: 'Pune', zip: '411014' } };
const changes = diff(loaded, edited);
changes.map((c) => c.path.join('.')); // => ['dept', 'address.zip']
const changed = new Set(changes.map((c) => c.path[0]));
pickBy(edited, (_value, key) => changed.has(key)); // => { dept: 'Finance', address: { city: 'Pune', zip: '411014' } }
```

### How do I layer user settings over defaults?

`deepMerge` merges nested plain objects into a new object; arrays replace by default (`arrays: 'union'` or `'concat'` to combine) and `undefined` values do not overwrite.

```ts
import { deepMerge } from '@absoluteui/helpers/object';

const defaults = { grid: { pageSize: 25, density: 'comfortable' }, columns: ['name', 'dept'] };
const saved: unknown = JSON.parse('{"grid":{"pageSize":50},"columns":["name","manager"]}');
const settings = deepMerge(defaults, typeof saved === 'object' && saved !== null ? saved : {});
settings; // => { grid: { pageSize: 50, density: 'comfortable' }, columns: ['name', 'manager'] }
deepMerge(defaults, { columns: ['email'] }, { arrays: 'union' }).columns; // => ['name', 'dept', 'email']
```

### How do I read and write nested fields by path?

`deepGet` and `deepSet` take a dotted path with `[index]` segments, as used for form field names; `deepSet` returns a copy and leaves the original untouched.

```ts
import { deepGet, deepSet } from '@absoluteui/helpers/object';

const employee = { name: 'Ben', contacts: [{ type: 'mobile', value: '555-0100' }] };
deepGet(employee, 'contacts[0].value'); // => '555-0100'
deepGet(employee, 'contacts[3].value', '(none)'); // => '(none)'
const updated = deepSet(employee, 'contacts[0].value', '555-0199');
[employee.contacts[0]?.value, updated.contacts[0]?.value]; // => ['555-0100', '555-0199']
```

### How do I turn a nested record into flat form fields and back?

`flattenObject` joins keys (for flat form names, CSV columns, or query strings) and `unflattenObject` restores the structure; `compactObject` drops empty fields before sending.

```ts
import { compactObject, flattenObject, unflattenObject } from '@absoluteui/helpers/object';

const flat = flattenObject({ name: 'Chen', address: { city: 'Oslo', zip: '0150' } });
flat; // => { name: 'Chen', 'address.city': 'Oslo', 'address.zip': '0150' }
unflattenObject(flat); // => { name: 'Chen', address: { city: 'Oslo', zip: '0150' } }
compactObject({ name: 'Chen', middleName: '', phone: null }, { remove: 'empty' }); // => { name: 'Chen' }
```

### What goes wrong?

Keys that would reach the prototype throw `HLP_UNSAFE_KEY` instead of polluting `Object.prototype`:

```ts
import { deepMerge, deepSet, unflattenObject } from '@absoluteui/helpers/object';

deepMerge({}, JSON.parse('{"__proto__":{"isAdmin":true}}')); // => throws HLP_UNSAFE_KEY
deepSet({}, 'constructor.prototype.isAdmin', true); // => throws HLP_UNSAFE_KEY
unflattenObject({ '__proto__.isAdmin': true }); // => throws HLP_UNSAFE_KEY
```
