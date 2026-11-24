---
title: Forms
description: Use AbsoluteUI form controls with reactive forms, template-driven forms, or plain two-way bindings, with validation messages shown by the components.
---

Every form control implements `ControlValueAccessor` and `Validator` (Calendar only the value accessor): Text Input, Textarea, Number Input, Select, Combobox, Multi Select, Checkbox, Checkbox Group, Radio Group, Switch, Password Input, OTP Input, Rich Text Editor, File Upload, Date Input, Date Picker, Date Time Picker, Time Picker, Calendar, Date Range Picker, Month Picker, Year Picker, Quarter Picker, Duration Picker, Recurrence Picker, and Schedule Picker.

## Binding

Bind one of `[formControl]`, `formControlName`, `[(ngModel)]`, or, without forms, `[(value)]`:

```ts
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { AuiTextInput } from '@absoluteui/angular/text-input';
import { AuiSelect } from '@absoluteui/angular/select';

@Component({
  selector: 'app-profile',
  imports: [ReactiveFormsModule, AuiTextInput, AuiSelect],
  template: `
    <form [formGroup]="form" (ngSubmit)="save()">
      <aui-text-input label="Email" type="email" formControlName="email" />
      <aui-select label="Team" [options]="teams" formControlName="team" />
      <button type="submit">Save</button>
    </form>
  `,
})
export class ProfileComponent {
  readonly teams = [
    { value: 'design', label: 'Design' },
    { value: 'eng', label: 'Engineering' },
  ];
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    team: new FormControl<string | null>(null, { validators: [Validators.required] }),
  });

  save(): void {
    if (this.form.valid) console.log(this.form.getRawValue());
  }
}
```

The value updates when the user changes it: on input for text-like controls, on change for the others. Each component page names the value type (for example `string[]` for Checkbox Group and Multi Select, `PlainDate | null` for Date Picker).

## Validation

The components validate themselves (required, length, range, format, unavailable dates) and report through the `aui` error key: `{ aui: { error, message } }`. Validators you add still run, and their messages are shown inside the component:

| Angular | The component |
|---|---|
| The form is submitted | Shows its messages now. |
| `markAllAsTouched()` or `markAsTouched()` | Shows its messages now. |
| `reset()` | Clears its touched and submitted state and its messages, then shows the form's value. |
| `Validators.required` or `requiredTrue` | Marks the field required (indicator, `required`, `aria-required`). |
| Validator errors such as `email` or `minlength` | Shown once touched or submitted, unless the component shows an error of its own. |
| An async validator is running | Sets `aria-busy="true"` on the host. |
| `updateOn: 'blur'` or `'submit'` | Angular's timing applies. |

Built-in messages for Angular validators are localized. Add or override messages for your own error keys with `provideAuiFormErrors`:

```ts
import { provideAuiFormErrors } from '@absoluteui/angular/forms';

export const formErrorProviders = [provideAuiFormErrors({ taken: 'This name is already taken.' })];
```

A message can also be a function of the error value. The component's own `validate` option is the `[validate]` input.

## Form state signals

Each form control exposes `formState` signals: `touched`, `dirty`, `pending`, `submitted`, and `errorState` (invalid and touched or submitted):

```html
<aui-text-input #email="auiTextInput" label="Email" formControlName="email" />
@if (email.formState.errorState()) { <p>Check the email address.</p> }
```

## Form and Form Field

- `form[auiForm]` adds AbsoluteUI form behavior (error summary, cross-field rules, server errors). Listen to `(submitted)` rather than `(ngSubmit)`, which fires before AbsoluteUI validation. Methods: `submit()`, `checkValidity()`, `setErrors()`, `clearErrors()`, `getValues()`, `reset()`.
- `<aui-form-field label="ZIP"><input formControlName="zip" /></aui-form-field>` wraps a native control, which keeps Angular's own value accessor.
