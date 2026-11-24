Typed validation for forms and API input, plus format checks (email, IBAN, BIC, phone, postal code, and more). A `v.*` schema gives you the parsed, typed value on success, and field-keyed, user-readable messages on failure, ready for a form. The [Helpers and services guide](/docs/guides/helpers-and-services/) shows how `fieldErrors` from the `error` module fits in, and the [Forms guide](/docs/guides/forms/) shows the messages in fields.

### How do I validate a form and show a message per field?

Describe the record once; the type follows with `Infer`. An empty required field reports `required`. Form values arrive as strings, so use `coerce` for numbers and let `v.date` parse `YYYY-MM-DD` into a `PlainDate`. Unknown keys are stripped by default.

```ts
import { v, validate, type Infer } from '@absoluteui/helpers/validate';

const newHire = v.object({
  name: v.string({ min: 1, max: 80, trim: true }),
  email: v.string({ email: true, trim: true, lowercase: true }),
  dept: v.enumOf(['finance', 'hr', 'engineering']),
  salary: v.number({ min: 0, integer: true, coerce: true }),
  startDate: v.date({ min: '2026-01-01' }),
  manager: v.optional(v.string()),
});
type NewHire = Infer<typeof newHire>;

const good = validate(newHire, { name: ' Asha Rao ', email: 'Asha.Rao@Example.com', dept: 'hr', salary: '98000', startDate: '2026-10-05', extra: 'x' });
const hire: NewHire | undefined = good.ok ? good.value : undefined;
hire?.email; // => 'asha.rao@example.com'
hire?.salary; // => 98000
'extra' in (hire ?? {}); // => false

const bad = validate(newHire, { name: '', email: 'asha@', dept: 'sales', salary: '-5', startDate: '2025-12-31' });
bad.ok ? {} : bad.error.fields; // => { name: 'Enter a value for this field.', email: 'Enter an email address in the format name@example.com.', dept: 'Choose one of: finance, hr, engineering.', salary: 'Enter a number that is 0 or more.', startDate: 'Enter a date on or after 2026-01-01.' }
```

### How do I check one field against another?

Wrap the object in `v.refine` with your own code. An issue on the whole object is reported under `_form` (change it with `formKey`); nested fields use paths such as `items[2].qty`.

```ts
import { v, validate } from '@absoluteui/helpers/validate';
import { formatPlainDate } from '@absoluteui/helpers/date';

const leave = v.refine(
  v.object({ from: v.date(), to: v.date(), days: v.array(v.object({ half: v.boolean() }), { max: 30 }) }),
  (r) => formatPlainDate(r.to) >= formatPlainDate(r.from),
  'leave.endBeforeStart',
);
const messages = (code: string) => (code === 'leave.endBeforeStart' ? 'The last day must be on or after the first day.' : `Check ${code}`);
const r = validate(leave, { from: '2026-10-09', to: '2026-10-05', days: [] }, { messages });
r.ok ? {} : r.error.fields; // => { _form: 'The last day must be on or after the first day.' }
const nested = validate(leave, { from: '2026-10-05', to: '2026-10-06', days: [{ half: true }, { half: 'maybe' }] }, { messages });
nested.ok ? {} : Object.keys(nested.error.fields ?? {}); // => ['days[1].half']
```

### How do I translate the messages?

A message catalog is a function from code and parameters to text. Bind yours once with `createValidator` and fall back to `defaultMessages` for codes you have not translated. Parameters hold schema limits, never the user's input.

```ts
import { createValidator, defaultMessages, v } from '@absoluteui/helpers/validate';

const german = (code: string, params: Readonly<Record<string, unknown>>) =>
  code === 'number.min' ? `Geben Sie mindestens ${String(params.min)} ein.` : defaultMessages(code, params);
const check = createValidator(german);
const r = check(v.object({ hours: v.number({ min: 1 }), note: v.string({ max: 5 }) }), { hours: 0, note: 'too long' });
r.ok ? {} : r.error.fields; // => { hours: 'Geben Sie mindestens 1 ein.', note: 'Enter no more than 5 characters.' }
```

### How do I check bank details and contact data?

Format checks are type guards that accept `unknown`, so they work on raw input. `isIban` verifies the country length and checksum; `isPostalCode` checks the format for a country (not that the address exists). Use them in a schema with `v.refine`.

```ts
import { isBic, isIban, isPhoneE164, isPostalCode, v, validate } from '@absoluteui/helpers/validate';

isIban('DE89 3704 0044 0532 0130 00'); // => true
isIban('DE89 3704 0044 0532 0130 01'); // => false // checksum
isBic('COBADEFFXXX'); // => true
isPostalCode('560001', 'IN'); // => true
isPhoneE164('+918055501234'); // => true

const payee = v.object({ iban: v.refine(v.string({ trim: true }), isIban, 'iban') });
const r = validate(payee, { iban: 'GB00 WEST 1234 5698 7654 32' }, { messages: (code) => (code === 'iban' ? 'Enter a valid IBAN.' : code) });
r.ok ? {} : r.error.fields; // => { iban: 'Enter a valid IBAN.' }
```

### How do I enforce a password policy?

`isStrongPassword` returns every failed rule as a code, so the UI can list what to fix. Defaults follow a strict policy (12 characters, four classes, no common passwords); NIST prefers length, so relax the class rules for passphrases.

```ts
import { isStrongPassword } from '@absoluteui/helpers/validate';

isStrongPassword('summer2026').failures; // => ['too-short', 'missing-uppercase', 'missing-symbol', 'common']
const passphrase = { minLength: 16, requireUppercase: false, requireDigit: false, requireSymbol: false, allowSpaces: true };
isStrongPassword('correct horse battery staple', passphrase); // => { valid: true, failures: [] }
isStrongPassword('ExampleCorp2026!', { extraCommon: ['examplecorp2026!'] }).failures; // => ['common']
```

### What goes wrong?

Validation never throws for bad input; limits (depth 32, 100 000 values, 1 000 000-character strings) become issues too. `unknownKeys: 'error'` rejects extra fields instead of stripping them. Format checks are not proof: `isJwtShape` checks structure only, so verify tokens on the server.

```ts
import { isJwtShape, v, validate } from '@absoluteui/helpers/validate';

const strict = v.object({ id: v.string() }, { unknownKeys: 'error' });
const r = validate(strict, { id: 'E-1', isAdmin: true });
r.ok ? {} : r.error.fields; // => { isAdmin: 'Remove this field; it is not recognized.' }
r.ok ? undefined : r.error.code; // => 'HLP_VALIDATE_FAILED'
validate(v.string(), 'x'.repeat(20), { maxStringLength: 10 }).ok; // => false
isJwtShape('eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.'); // => true // an unsigned alg:none token still has the right shape
```
