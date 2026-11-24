Type guards and assertions for values of unknown shape: parsed JSON, `postMessage` data, storage, and third-party callbacks. Each `is...` function narrows the TypeScript type; each `assert...` function throws a `ValidationError` (`HLP_TYPE_ASSERTION`) naming the field, never the value. For whole-object schemas, use [`helpers/validate`](/docs/api/helpers/validate/); the [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I check a JSON payload before using it?

Combine `isPlainObject`, `hasKey`, and the primitive guards into one type guard; after it returns `true`, the fields are typed without casts.

```ts
import { hasKey, isFiniteNumber, isOneOf, isPlainObject, isString } from '@absoluteui/helpers/is';

interface LeaveRequest { employeeId: string; days: number; type: 'annual' | 'sick' }

function isLeaveRequest(value: unknown): value is LeaveRequest {
  return isPlainObject(value)
    && hasKey(value, 'employeeId') && isString(value.employeeId)
    && hasKey(value, 'days') && isFiniteNumber(value.days)
    && hasKey(value, 'type') && isOneOf(value.type, ['annual', 'sick'] as const);
}
isLeaveRequest(JSON.parse('{"employeeId":"E-7","days":3,"type":"annual"}')); // => true
isLeaveRequest(JSON.parse('{"employeeId":"E-7","days":"3","type":"annual"}')); // => false
isLeaveRequest(JSON.parse('[1,2]')); // => false
```

### How do I fail fast on a missing or wrong value?

The assertions narrow the variable for the rest of the scope, so later code needs no checks or `!`.

```ts
import { assertDefined, assertFiniteNumber } from '@absoluteui/helpers/is';

const settings = new Map<string, unknown>([['maxCarryOverDays', 5]]);
const carryOver = settings.get('maxCarryOverDays');
assertFiniteNumber(carryOver, 'maxCarryOverDays');
carryOver * 8; // => 40
const manager = settings.get('manager');
assertDefined(manager, 'manager'); // => throws HLP_TYPE_ASSERTION
```

### How do I tell whether an optional form field was filled in?

`isBlank` treats whitespace-only strings as empty; `isEmpty` also covers empty arrays, maps, sets, and objects. Numbers and booleans, including `0` and `false`, are never empty.

```ts
import { isBlank, isEmpty } from '@absoluteui/helpers/is';

const form = { middleName: '   ', skills: [], overtimeHours: 0 };
isBlank(form.middleName); // => true
isEmpty(form.skills); // => true
isEmpty(form.overtimeHours); // => false
```

### How do I filter out missing values with the right type?

`isDefined` is a type guard, so `filter(isDefined)` removes `null` and `undefined` and narrows the element type.

```ts
import { isDefined, isNonEmptyArray } from '@absoluteui/helpers/is';

const managerIds: (string | null | undefined)[] = ['E-1', null, 'E-4', undefined];
const ids: string[] = managerIds.filter(isDefined);
ids; // => ['E-1', 'E-4']
isNonEmptyArray(ids) ? ids[0].toLowerCase() : ''; // => 'e-1'
```
