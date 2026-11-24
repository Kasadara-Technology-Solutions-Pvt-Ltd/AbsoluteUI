---
title: Forms and validation
description: Build accessible forms with field validation, cross-field rules, server checks, and an error summary.
---

AbsoluteUI form controls validate themselves, and [Form](/docs/components/form/) coordinates them: it discovers every AbsoluteUI control inside a `<form>`, validates on submit, shows an [Error Summary](/docs/components/error-summary/), moves focus to the first problem, and hands you the values.

## Controls validate themselves

Every control has `required`, its own constraints (`minLength`, `min`, `max`, `pattern`, date bounds), and an optional custom `validate` function. Messages are shown after the user leaves the field or submits, not while they type, and are announced to assistive technology.

```ts
import { TextInput } from '@absoluteui/components/text-input';
import { NumberInput } from '@absoluteui/components/number-input';

const name = document.querySelector<HTMLElement>('#name');
const age = document.querySelector<HTMLElement>('#age');
if (name && age) {
  TextInput.create(name, { label: 'Full name', name: 'fullName', required: true, maxLength: 80, autocomplete: 'name' });
  NumberInput.create(age, { label: 'Age', name: 'age', min: 18, max: 120 });
}
```

Read `control.validity` at any time, call `reportValidity()` to show messages now, or `setCustomError(message)` for an error that only your application knows about.

## Form coordinates them

```ts
import { Form, type FormSubmitDetail } from '@absoluteui/components/form';

const el = document.querySelector<HTMLFormElement>('#profile');
if (el) {
  const form = Form.create(el, {
    rules: [
      {
        fields: ['password', 'confirm'],
        validate: (values) => (values.password === values.confirm ? null : 'Passwords do not match.'),
      },
    ],
  });
  el.addEventListener('aui-submit', (event) => {
    const { values } = (event as CustomEvent<FormSubmitDetail>).detail;
    void save(values).catch(() => form.setErrors({ _form: 'Saving failed. Try again.' }));
  });
}

async function save(values: Record<string, unknown>): Promise<void> {
  const response = await fetch('/api/profile', { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(values) });
  if (!response.ok) throw new Error(String(response.status));
}
```

| Option | Use it for |
|---|---|
| `rules` | Cross-field rules, such as matching passwords or an end date after a start date. A rule returns a message or `null`; the message appears on its `target` field (default: the last of its `fields`). |
| `validate` | An asynchronous check before submit (for example "email already registered"). It receives an `AbortSignal` to honour, and `asyncTimeoutMs` bounds it. |
| `focusOnInvalid` | `'summary'` (default) moves focus to the Error Summary; `'first-field'` moves it to the first invalid control. |
| `submitMode` | `'event'` (default) dispatches `aui-submit` with the values; `'native'` also submits the form natively afterwards, unless the `aui-submit` event is cancelled. |

Server errors map back to fields with `setErrors({ fieldName: 'message' })`. A name that matches no field (such as `_form`) appears in the summary without a link.

## Accessible by default

- Every control has a visible label (`hideLabel` keeps it for assistive technology only), and help text and errors are linked with `aria-describedby`.
- Required fields are marked visually and programmatically.
- The Error Summary lists every problem as a link to its field, receives focus on submit, and is announced.
- Form values use typed models: numbers are numbers, dates are `PlainDate`, date-times are `Instant`, and files are `File[]`.

See also: [Form Field](/docs/components/form-field/) for your own controls, [Validation Message](/docs/components/validation-message/), and [Password Strength Meter](/docs/components/password-strength-meter/).
