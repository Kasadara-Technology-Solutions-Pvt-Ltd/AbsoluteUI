# Form

> Package: `@absoluteui/components/form` | Styles: `@absoluteui/components/form/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

State manager and validation orchestrator for a native `<form>` (SPEC section 18.8). `Form` discovers the AbsoluteUI controls inside the form (including native controls wrapped by Form Field), validates them on submit, runs cross-field rules and an optional async validator (cancellable, with a timeout), shows an Error Summary that links to each invalid field, serializes values, applies server errors, tracks dirty/touched/submitting state, and resets every control consistently. The same entry point also exports the validation engine (`checkText`, `checkNumber`, `messageFor`) and the `FormControl` contract.

## 2. Anatomy

```text
<form class="aui-form" novalidate [aria-busy="true"]>            (consumer element)
  <div class="aui-error-summary" role="region" tabindex="-1">   (inserted on first failed submit, or summaryHost)
  <div class="aui-field aui-text-input" data-aui-control>       (AbsoluteUI controls, discovered)
  <div class="aui-field aui-form-field" data-aui-control>       (Form Field-wrapped native controls)
  <input name="...">                                            (plain named native elements: serialized and reset)
  <div class="aui-form__actions"><button type="submit">         (optional consumer wrapper)
</form>
```

## 3. When to use

- Any form built from AbsoluteUI inputs that needs one consistent submit, validation, and error-navigation flow.
- Rules that span several fields, such as password confirmation or conditional requirements.
- Server-side or async checks (uniqueness, availability) whose errors must appear on the right fields.
- Forms that need dirty/touched state, for example for an unsaved-changes prompt.

## 4. When not to use

- A single standalone control that is never submitted: use the control on its own.
- Showing errors you already have, without a form: use Error Summary directly.
- Multi-step wizards with per-step persistence: compose one `Form` per step.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLFormElement` | The managed native form. |
| `controls` | `FormControl[]` | Registered controls inside the form, in document order (computed on access). |
| `state` | `FormState` | Frozen `{ dirty, touched, submitting, submitCount, valid }`. `valid` ignores disabled controls. |
| `errorSummary` | `ErrorSummary \| null` | Created lazily on the first failed submission; `null` until then or when `errorSummary` is `false`. |

Options: `rules`, `validate` (async validator), `summaryTitle`, `summaryHost`, plus the global options below. Full table: `metadata/form/api.json`.

| Global option | Type | Default |
|---|---|---|
| `focusOnInvalid` | `'summary' \| 'first-field'` | `'summary'` |
| `errorSummary` | `boolean` | `true` |
| `submitMode` | `'event' \| 'native'` | `'event'` |
| `asyncTimeoutMs` | integer 100..120000 | `10000` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `Form.create(element, options?)` | Manage a native `<form>`. Throws `FORM_HOST` / `FORM_OPTIONS` before touching the form. |
| `getValues()` | Frozen values by field name (serialization rules below). |
| `validate()` | Apply rules, show every message and the summary, return validity. Does not run the async validator or emit events. |
| `submit()` | `requestSubmit()`: runs the full submit pipeline, like clicking a submit button. |
| `setErrors(errors)` | Apply server or other external errors by field name; show them and move focus. |
| `clearErrors()` | Clear every rule and external error this form set; hide the summary. |
| `reset()` | Abort async validation, reset every control and plain element, clear all state, emit `aui-reset`. |
| `update(options)` | Merge and validate options. `summaryTitle` and `locale` are applied to an existing summary; rules re-run if the form has been submitted. |
| `destroy()` | Remove listeners, summary, and subscriptions; restore the form's original `noValidate` value. |
| `registerFormControl(control)` | Standalone export: register a custom `FormControl` so any `Form` containing `control.host` discovers it. Returns an unregister function. |

**Submit flow.** On every `submit` event (button, Enter, or `submit()`), the native event is always prevented, then:

1. If an async validation is already running, the submission is ignored (double-submit prevention).
2. `submitCount` increments and earlier external errors (`setErrors`) are cleared.
3. Constraints: every enabled control's `reportValidity()` runs (messages show regardless of `validationTiming`), after cross-field `rules` are applied. Any failure shows the summary, moves focus, emits `aui-invalid` with `reason: 'constraints'`, and stops.
4. Async validator (`validate`), if set: called with `getValues()` and an `AbortSignal`. The form gets `aria-busy="true"` and `state.submitting` is `true`. The signal aborts on timeout (`asyncTimeoutMs`, reason `TimeoutError`), `reset()`, or `destroy()`. Returned errors are applied like `setErrors` and emit `aui-invalid` with `reason: 'async'`. A rejection or timeout shows "Your answers could not be checked. Try again." and emits `reason: 'async-failed'`. A result that arrives after `reset()` or `destroy()` is discarded.
5. `aui-submit` is dispatched (cancelable, non-bubbling) with `{ values }`.
6. With `submitMode: 'native'` and the event not prevented, `HTMLFormElement.submit()` runs; the submitter's `name`/`value` is added as a temporary hidden input. `submit()` does not fire `submit` again.

Double submission is prevented only during step 4. If your `aui-submit` handler starts a request, guard it yourself (for example by disabling the button until it settles).

**`getValues()` serialization.** AbsoluteUI controls first (enabled controls with a `name`, via `getFormValue()`), then plain named native `<input>`, `<select>`, and `<textarea>` elements that are not inside a control host. Skipped: `:disabled` elements (including descendants of a disabled `<fieldset>`, matching `FormData`), unnamed elements, submit/button/reset/image/file inputs, and unchecked checkboxes and radios. A multiple `<select>` contributes one entry per selected option. A name that appears more than once becomes an array in document order (an array value followed by the same name is extended).

**Reset.** A native reset (reset button or `form.reset()` on the element) is intercepted and calls `Form.reset()`, because controls hold their own initial values and a native reset would desynchronize them. `reset()` aborts pending async validation, calls every control's `reset()`, restores plain elements to `defaultValue`/`defaultChecked`/`defaultSelected` (file inputs are cleared), sets `submitCount` to 0, clears errors and the summary, and emits `aui-reset` then `aui-state-change`.

**Server errors.** `setErrors({ email: 'Already registered.' })` sets a custom error on the control with that `name`, reports every control, and shows the summary. Names that match no control, and errors for disabled controls (which cannot be corrected or focused), are listed in the summary as plain text without a link (or announced when there is no summary). Async validator errors follow the same rules. Each error clears when the user edits the field (the form then stops tracking it, so live rule re-checks apply to that field again), on `clearErrors()`, or at the start of the next submit.

**Cross-field rules.** Rules run on `validate()` and on every submit. After the first submit they also re-run live on every `aui-input`/`aui-change` and on `update()`. A rule's message is shown on its `target` (default: the last entry of `fields`); the first failing rule per control wins, and an external error on the same control takes precedence. `validate()` and submit throw `FORM_RULE_TARGET` when the target is not a named control; live re-checks skip such rules instead, so a target that is not rendered yet (for example a conditional field) does not throw from an event listener.

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-submit` | `{ values }` | No | Validation passed. Cancelable: prevent it to stop a native submission. |
| `aui-invalid` | `{ errors: FormErrorEntry[], reason }` | No | Submission stopped. `reason`: `'constraints'`, `'async'`, or `'async-failed'`. |
| `aui-state-change` | `FormState` | No | `dirty`, `touched`, `submitting`, `submitCount`, or `valid` changed (deduplicated). |
| `aui-reset` | `null` | No | The form was reset. |

Listen on `form.element`. Do not use the native `submit` event for business logic: it fires before AbsoluteUI validation.

## 8. Slots/content areas

The form's children are consumer-owned. `Form` only inserts the error summary host (as the first child, unless `summaryHost` is given).

**`FormControl` contract.** `Form` works with any registered control that implements:

```ts
interface FormControl {
  readonly host: HTMLElement;
  readonly name: string | null;       // null: validated but not serialized
  readonly label: string;             // used by the error summary
  readonly disabled: boolean;         // disabled controls are skipped
  readonly validity: ControlValidity; // { valid, message }
  readonly dirty: boolean;
  readonly touched: boolean;
  getFormValue(): unknown;
  reportValidity(): boolean;          // show messages now, return validity
  setCustomError(message: string | null): void;
  focus(): void;
  reset(): void;
}
```

Every AbsoluteUI input and Form Field implements it and registers itself. A custom control joins a `Form` by calling `registerFormControl(this)` (exported from `@absoluteui/components/form`), which marks `host` with `data-aui-control` and returns an unregister function to call on destroy. Plain native elements inside the host are then excluded from `getValues()` and `reset()`, so the control owns them. Emit bubbling `aui-input`/`aui-change` events from `host` on user edits so the form updates its state and re-runs rules. `getFormControl(host)` and `findFormControls(root)` look up registered controls. Complete example: `metadata/form/examples.json` (`custom-control`).

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-form` | Added to the form: single-column grid, `space-4` gap. |
| `aui-form[aria-busy='true']` | Async validation running: progress cursor. |
| `aui-form__actions` | Optional consumer wrapper for buttons: wrapping flex row, `space-2` gap. |

All rules live in the `aui.components` cascade layer, so any consumer layout wins.

## 10. Design tokens

See `metadata/form/tokens.json`: `color-text`, `font-family-sans`, `space-2`, `space-4`. The error summary uses its own tokens.

## 11. States

pristine, dirty, touched, validating (`submitting`, `aria-busy`), submitted (`submitCount > 0`), invalid (summary shown), valid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| pristine | user edits a control | dirty; `aui-state-change` |
| any | submit with invalid controls or failing rules | invalid; summary shown; `aui-invalid` (`constraints`) |
| valid constraints | submit with `validate` | submitting (`aria-busy`) |
| submitting | validator resolves `{}` | `aui-submit`; native submit if `submitMode: 'native'` |
| submitting | validator returns errors | invalid; `aui-invalid` (`async`) |
| submitting | rejection or timeout | invalid; form-level message; `aui-invalid` (`async-failed`) |
| submitting | `reset()` or `destroy()` | validator aborted; result discarded |
| submitted | user edits any field | rules re-run live |
| any | `reset()` or native reset | pristine, untouched, `submitCount` 0; `aui-reset` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter | Single-line input focused | Native implicit submission; runs the Form pipeline. |
| Tab / Shift+Tab | Error summary focused | Moves through summary links, then into the form. |
| Enter | Summary link focused | Focuses the invalid control and scrolls it into view. |
| Enter / Space | Reset button focused | Native reset, intercepted: controls return to initial values. |

## 14. ARIA contract

- The `<form>` is native; give it an accessible name (`aria-labelledby`) if it should be a landmark.
- `aria-busy="true"` on the form while the async validator runs.
- Controls own `aria-invalid` and `aria-describedby`; submit marks each control as submitted so its message shows.
- The error summary is a `region` labelled by its heading and receives focus (see Error Summary).

## 15. Accessibility notes

- `noValidate` is set so native bubbles never compete with AbsoluteUI messages (the original value is restored on `destroy()`).
- Focus moves to the summary after a failed submit, so screen readers read the heading and list once, without a live region. `focusOnInvalid: 'first-field'` focuses the first invalid control instead.
- Messages that belong to no field appear in the summary; with `errorSummary: false` they are announced through an assertive live region.
- Blur/pointer deferral (`markTouched`): when focus leaves a field because the user pressed the pointer elsewhere, for example on Submit, the field's message renders after the pointer is released. Rendering on pointerdown shifts the layout and makes the pending click miss the button (covered by a regression test).
- A successful submission is not announced; announce the outcome in your `aui-submit` handler.
- Manual screen-reader verification is pending (see Known limitations).

- Error summary links name their field: each item is the localized message `form.summaryItem` (`'{label}: {message}'`), for example "Email: This field is required." Override it per locale with `registerMessages('form', locale, { summaryItem: ... })`. Messages set with `setErrors` for unknown or disabled fields are listed as given.

## 16. Responsive behavior

Single-column grid; `.aui-form__actions` wraps. Consumer layout rules override both (layered styles).

## 17. RTL behavior

No direction-specific layout. The summary and controls use logical properties.

## 18. Theme behavior

Uses only text color, font, and spacing tokens. The summary and controls provide their own themed states.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { form: { focusOnInvalid: 'first-field', asyncTimeoutMs: 5000 } } });
```

Values are read at each submission. A global `locale` change updates an existing summary.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). `rules`, `validate`, `summaryTitle`, `locale`, and the global options are dynamic through `update()`. `summaryHost` is read only when the summary is first created (on the first failed submission); set it before then.

## 21. Timezone behavior

Not applicable. Date controls serialize their own ISO strings.

## 22. Icon customization points

None on the form. The summary uses the Error Summary default icon (`alert-circle`).

## 23. Security behavior

Summary items and announcements use `textContent`. `setErrors` messages are shown as text; do not echo raw user input into them (SPEC section 14.4). Form performs no network requests; the async validator is consumer code and should honour its `AbortSignal`. CSP-safe.

## 24. Data handling behavior

Values stay in memory. Nothing is persisted or sent unless `submitMode: 'native'` submits the form or your handler sends `values`. Disabled controls and `:disabled` elements (including those inside a disabled `<fieldset>`) are never serialized.

## 25. Performance characteristics

Five listeners on the form (submit, reset, `aui-input`, `aui-change`, focusout) and one configuration subscription. `controls` is a `querySelectorAll` on access; validation and serialization are linear in the number of controls. After the first submit, rules re-run on every edit. Budget: `validate()` over 200 invalid Text Inputs completes in under 150 ms in headless Chromium, including rendering 200 messages and moving focus. About 25 ms is script; the rest is the browser layout for the new messages.

## 26. Supported data scale

200 controls in the performance test; unit tests cover forms with up to six controls plus plain elements.

## 27. Usage examples

```ts
import { Form, type FormSubmitDetail } from '@absoluteui/components/form';
import { TextInput } from '@absoluteui/components/text-input';

const el = document.createElement('form');
document.body.append(el);
for (const [label, name] of [['Password', 'password'], ['Confirm password', 'confirm']] as const) {
  const host = document.createElement('div');
  el.append(host);
  TextInput.create(host, { label, name, type: 'password', autocomplete: 'new-password', required: true });
}
const submit = document.createElement('button');
submit.type = 'submit';
submit.textContent = 'Save';
el.append(submit);
Form.create(el, { rules: [{ fields: ['password', 'confirm'], validate: (v) => (v.password === v.confirm ? null : 'Passwords do not match.') }] });
el.addEventListener('aui-submit', (event) => {
  const { values } = (event as CustomEvent<FormSubmitDetail>).detail;
  el.dataset.saved = String(Object.keys(values).length);
});
```

More examples, type-checked in CI: `metadata/form/examples.json` (async validation and server errors, native submission, state and reset, validation-engine rules, custom control registration).

## 28. Edge cases

- A second submit while the async validator runs is ignored; `submitCount` does not change.
- A validator that ignores its signal still settles on timeout: the form stops waiting and reports `async-failed`.
- A rule returning `''` counts as valid. When several rules target one field, the first failing rule's message wins.
- A rule targeting a field that is not a named control throws `FORM_RULE_TARGET` from `validate()` and submit; live re-checks after the first submit skip it.
- Errors returned for a disabled control are listed in the summary as plain text, without a link.
- `setErrors` with only unknown names shows a summary with plain-text items and no links.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FORM_HOST` | configuration | `element` is not an `HTMLFormElement`. |
| `FORM_OPTIONS` | configuration | Rule without non-empty string `fields` or a `validate` function, non-function `validate`, or non-element `summaryHost`. |
| `FORM_RULE_TARGET` | configuration | On `validate()` or submit, a failing rule's `target` (or last field) is not a named control in the form. |
| `CFG_INVALID_VALUE` | configuration | Invalid value for a global or instance config option (for example `asyncTimeoutMs` outside 100..120000). |
| `aui-invalid` `reason` | validation | `constraints`, `async`, or `async-failed`. |

A failed construction leaves the form untouched (`noValidate` unchanged, no listeners).

## 30. Known limitations

- Double submission is blocked only while the async validator runs.
- Plain native elements are serialized and reset but not validated.
- File inputs are not serialized by `getValues()`.
- Summary focus and announcements have not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- Nested forms or several `Form` instances on one element.
- Native browser validation bubbles.
- HTML in error messages.

## 32. TypeScript definitions

```ts
type FocusOnInvalid = 'summary' | 'first-field';
type SubmitMode = 'event' | 'native';
type FormValues = Readonly<Record<string, unknown>>;
type FormErrors = Readonly<Record<string, string>>;
interface CrossFieldRule { readonly fields: readonly string[]; readonly validate: (values: FormValues) => string | null; readonly target?: string }
type AsyncFormValidator = (values: FormValues, signal: AbortSignal) => Promise<FormErrors>;
interface FormState { readonly dirty: boolean; readonly touched: boolean; readonly submitting: boolean; readonly submitCount: number; readonly valid: boolean }
interface FormErrorEntry { readonly name: string | null; readonly label: string; readonly message: string }
interface FormSubmitDetail { values: FormValues }
interface FormInvalidDetail { errors: readonly FormErrorEntry[]; reason: 'constraints' | 'async' | 'async-failed' }
```

Also exported: `registerFormControl(control: FormControl): () => void`, `FormControl`, `ControlValidity`, `ValidationTiming`, `FieldValidity`, `ValidationErrorCode`, `TextConstraints`, `NumberConstraints`, `Outcome`, `MessageContext`, and the functions `getFormControl`, `findFormControls`, `checkText`, `checkNumber`, `messageFor`.

## 33. Vanilla JS example

```ts
import { Form, type FormErrors, type FormSubmitDetail } from '@absoluteui/components/form';
import '@absoluteui/components/form/style.css';

const el = document.querySelector<HTMLFormElement>('#signup');
if (el) {
  const form = Form.create(el, {
    validate: async (values, signal) => {
      const response = await fetch('/api/signup/check', { method: 'POST', body: JSON.stringify(values), signal });
      if (response.status === 409) return { email: 'This email is already registered.' } satisfies FormErrors;
      if (!response.ok) throw new Error(`Check failed: ${response.status}`);
      return {};
    },
  });
  el.addEventListener('aui-submit', (event) => {
    const { values } = (event as CustomEvent<FormSubmitDetail>).detail;
    void fetch('/api/signup', { method: 'POST', body: JSON.stringify(values) }).then((response) => {
      if (!response.ok) form.setErrors({ _form: 'Sign-up failed. Try again.' });
    });
  });
}
```

## 34. Angular example

The directive complements Angular reactive forms: Angular keeps the model and validators, AbsoluteUI runs the submit pipeline and error summary, and each AbsoluteUI control reports its validity to Angular (error key `aui`). Bind `(submitted)`, not `(ngSubmit)`, which fires before AbsoluteUI validation. Methods: `submit()`, `checkValidity()`, `setErrors()`, `clearErrors()`, `getValues()`, `reset()`.

```ts
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiForm } from '@absoluteui/angular/form';
import { AuiTextInput } from '@absoluteui/angular/text-input';
import { AuiButton } from '@absoluteui/angular/button';

@Component({
  selector: 'app-signup',
  imports: [ReactiveFormsModule, AuiForm, AuiTextInput, AuiButton],
  template: `
    <form auiForm [formGroup]="signup" focusOnInvalid="summary" (submitted)="save()">
      <aui-text-input label="Email" type="email" name="email" [required]="true" formControlName="email"></aui-text-input>
      <button type="submit" auiButton variant="primary">Sign up</button>
    </form>`,
})
export class SignupComponent {
  readonly signup = new FormGroup({ email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }) });
  save(): void {
    // this.signup.getRawValue() is valid here.
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that enhance or render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
