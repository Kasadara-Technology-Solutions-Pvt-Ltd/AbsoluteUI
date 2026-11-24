Typed errors with stable `code` and `kind`, a `Result` type for code that should not throw, and converters that turn anything thrown into form messages, log records, or worker messages. Every helper in the package throws these classes, so one `catch` handles them all. The [Helpers and services guide](/docs/guides/helpers-and-services/) explains the error-code conventions.

### How do I turn thrown errors into form field messages?

Collect the errors from a save and pass them to `fieldErrors`: `fields` from validation (and HTTP 422) errors map to their inputs, anything else becomes one form-level message under `_form`.

```ts
import { fieldErrors, HttpError, ValidationError } from '@absoluteui/helpers/error';

const clientCheck = new ValidationError('HRM_EMP_INVALID', 'Fix the highlighted fields.', {
  fields: { email: 'Enter a valid email address.' },
});
const serverReply = new HttpError('HRM_HTTP_422', 'The request was rejected.', {
  status: 422,
  fields: { startDate: 'The start date is in a closed payroll period.' },
});
const messages = fieldErrors([clientCheck, serverReply, new Error('Server unavailable.')]);
messages; // => { email: 'Enter a valid email address.', startDate: 'The start date is in a closed payroll period.', _form: 'Server unavailable.' }
```

### How do I decide what to show for a failed call?

Branch on `kind` or `code`, never on the message. `isHelperError` narrows an unknown catch value; `HttpError` adds `category` and `retryable`.

```ts
import { HttpError, isHelperError, NotFoundError, toError } from '@absoluteui/helpers/error';

function userMessage(caught: unknown): string {
  if (caught instanceof HttpError && caught.retryable) return 'The service is busy. Try again shortly.';
  if (isHelperError(caught)) {
    if (caught.kind === 'not-found') return 'This employee no longer exists.';
    if (caught.kind === 'conflict') return 'Someone else changed this record. Reload and try again.';
  }
  return toError(caught).message;
}
userMessage(new NotFoundError('HRM_EMP_NOT_FOUND', 'Employee not found.')); // => 'This employee no longer exists.'
userMessage(new HttpError('HRM_HTTP_503', 'Service unavailable.', { status: 503 })); // => 'The service is busy. Try again shortly.'
userMessage('boom'); // => 'A non-error value was thrown.'
```

### How do I validate rows without try/catch everywhere?

Return a `Result` with `ok`/`err`, wrap throwing code with `tryCatch`, and use `combineResults` to stop at the first bad row.

```ts
import { combineResults, err, ok, ValidationError, type Result } from '@absoluteui/helpers/error';

function parseHours(row: string, line: number): Result<number, ValidationError> {
  const hours = Number(row);
  return Number.isFinite(hours) && hours >= 0 && hours <= 24
    ? ok(hours)
    : err(new ValidationError('HRM_TIMESHEET_HOURS', `Line ${line}: hours must be 0 to 24.`));
}
combineResults(['8', '7.5'].map((r, i) => parseHours(r, i + 1))); // => { ok: true, value: [8, 7.5] }
const bad = combineResults(['8', '30', 'x'].map((r, i) => parseHours(r, i + 1)));
bad.ok ? '' : bad.error.message; // => 'Line 2: hours must be 0 to 24.'
```

### How do I send an error to a log or across a worker boundary?

`serializeError` produces a JSON-safe object (with the `cause` chain, without stacks by default); `deserializeError` rebuilds a typed error on the other side.

```ts
import { ConflictError, deserializeError, serializeError } from '@absoluteui/helpers/error';

const original = new ConflictError('HRM_EMP_VERSION', 'The record was changed by someone else.');
const wire = JSON.stringify(serializeError(original));
const restored = deserializeError(JSON.parse(wire));
[restored.name, restored.code, restored.kind]; // => ['ConflictError', 'HRM_EMP_VERSION', 'conflict']
```

### What goes wrong?

Messages are shown to users and written to logs, so never put secrets or raw input in them; put structured, non-sensitive context in `details`. `invariant` guards internal assumptions and throws `HLP_ASSERT`:

```ts
import { invariant, unwrap, err, NotFoundError } from '@absoluteui/helpers/error';

const leaveBalance = -2;
invariant(leaveBalance >= 0, 'Leave balance must not be negative.'); // => throws HLP_ASSERT
unwrap(err(new NotFoundError('HRM_EMP_NOT_FOUND', 'Employee not found.'))); // => throws HRM_EMP_NOT_FOUND
```
