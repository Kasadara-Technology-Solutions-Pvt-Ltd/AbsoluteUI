# Schema Form

> Package: `@absoluteui/components/schema-form` | Styles: `@absoluteui/components/form/style.css`, `@absoluteui/components/error-summary/style.css`, `@absoluteui/components/fieldset/style.css`, `@absoluteui/components/button/style.css`, `@absoluteui/components/text-input/style.css`, `@absoluteui/components/textarea/style.css`, `@absoluteui/components/number-input/style.css`, `@absoluteui/components/select/style.css`, `@absoluteui/components/radio-group/style.css`, `@absoluteui/components/combobox/style.css`, `@absoluteui/components/multi-select/style.css`, `@absoluteui/components/checkbox/style.css`, `@absoluteui/components/checkbox-group/style.css`, `@absoluteui/components/switch/style.css`, `@absoluteui/components/slider/style.css`, `@absoluteui/components/rich-text-editor/style.css`, `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, `@absoluteui/components/date-picker/style.css`, `@absoluteui/components/date-time-picker/style.css`, `@absoluteui/components/time-picker/style.css`, and `@absoluteui/components/schema-form/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Renders a complete form from a JSON Schema subset (draft 2020-12 keywords) and an optional UI schema. The fields are the existing AbsoluteUI controls inside a native `<form>` managed by Form, and every control is named by its JSON Pointer (`/address/city`), so values validate, serialize, and show the Error Summary exactly like a hand-written form. `getValue()` returns typed JSON, `aui-submit` carries the validated value, and server errors map back with `setErrors({ pointer: message })`. The schema itself is checked first: an unsupported keyword is a configuration error naming its pointer, never silently ignored.

Supported schema keywords: `type` (string, number, integer, boolean, object, array), `title`, `description`, `default`, `enum`, `oneOf` (entries `{ const, title?, description? }`), `minimum`, `maximum`, `minLength`, `maxLength`, `pattern`, `format` (`date`, `date-time`, `time`, `email`, `uri`), `items` (primitives or objects), `minItems`, `maxItems`, `properties`, `required`, `additionalProperties: false`, `readOnly`, and the annotations `$schema`, `$id`, `$comment`, `examples`.

## 2. Anatomy

```text
<div class="aui-schema-form">                                     (size container)
  <form class="aui-schema-form__form aui-form" aria-label="Leave request" novalidate>
    <div class="aui-error-summary">...</div>                       (after a failed submit)
    <div class="aui-schema-form__body">
      <div class="aui-schema-form__grid aui-schema-form__grid--columns">
        <div class="aui-schema-form__cell">[Select name="/type"]</div>
        <div class="aui-schema-form__cell aui-schema-form__cell--span" hidden>[Textarea name="/reason"]</div>
        <fieldset class="aui-schema-form__group aui-fieldset"><legend>Address</legend>...</fieldset>
        <fieldset class="aui-schema-form__array aui-fieldset"><legend>Contacts</legend>
          <ol class="aui-schema-form__items">
            <li class="aui-schema-form__item">[fieldset "Contact 1"] <div class="aui-schema-form__tools">[up][down][remove]</div></li>
          </ol>
          <p class="aui-schema-form__empty" hidden>No entries yet.</p>
          <button class="aui-schema-form__add">Add Contact</button>
        </fieldset>
      </div>
    </div>
    <div class="aui-schema-form__actions"><button type="submit">Submit</button><button type="reset" hidden>Reset</button></div>
  </form>
</div>
```

## 3. When to use

- Forms defined by configuration or by administrators: questionnaires, request types, settings pages.
- Many similar forms whose fields change without a release.
- Forms produced by Form Builder.

## 4. When not to use

- A single, stable form with custom layout or behavior: compose Form, Form Field, and the controls directly.
- Schemas that need `$ref`, `allOf`/`anyOf`, `if`/`then`/`else`, or arbitrary `oneOf` subschemas.
- Spreadsheet-like data entry: use Data Grid.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The host element. |
| `element` | `HTMLFormElement` | The native form. |
| `form` | `Form` | The Form instance (validation, Error Summary, submission, `aui-state-change`). |
| `options` | `Readonly<SchemaFormOptions>` | Current options. |

Options (`SchemaFormOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `schema` | `FormSchema` | - (required) | No | The schema (root type `object`). |
| `uiSchema` | `UiField` | `{}` | No | Presentation (see below). |
| `value` | `JsonObject` | `{}` | No | Initial value; values that do not match the type are ignored. |
| `label` | `string` | schema `title` | No | Accessible name of the form. |
| `submitLabel` | `string` | "Submit" | No | Submit button text. |
| `showReset` | `boolean` | `false` | No | Also show a reset button. |
| `disabled` | `boolean` | `false` | No | Disable every field and the actions. |
| `businessCalendar` | `BusinessCalendarEngine \| null` | `null` | No | Working days and holidays for date fields. |
| `timezone` | `string` | global | No | IANA time zone of date-time fields. |
| `validate` | `(value, signal) => Promise<SchemaFormErrors>` | - | No | Async validation by JSON Pointer after the constraint checks pass. |
| `showActions` | `boolean` | `true` | Yes | Show the submit (and reset) buttons. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of messages and controls. |

UI schema (`UiField`, one entry per node; object children under `fields`, array items under `items`): `widget`, `label`, `help`, `placeholder`, `order`, `columns` (1 to 4), `span`, `visibleIf`, `rows`, `orientation`, `disableNonWorking`, `addLabel`, `patternMessage`.

| Node | Widgets (first is the default) |
|---|---|
| string | `text`, `textarea`, `richtext`, `password` |
| string or number with `enum`/`oneOf` | `select`, `radio`, `combobox` |
| string `format: date` / `date-time` / `time` | `date` / `datetime` / `time` |
| number, integer | `number`, `slider` (needs `minimum` and `maximum`) |
| boolean | `checkbox`, `switch` |
| array of choices | `multiselect`, `checkboxes` |
| array of objects or primitives | `list` (add, remove, move up and down) |
| object | `group` (Fieldset) |

Visibility conditions (`visibleIf`): `{ field, equals }`, `{ field, notEquals }`, `{ field, in: [...] }`, `{ field, filled: true | false }`, combined with `{ all: [...] }`, `{ any: [...] }`, `{ not: ... }`. `field` is a sibling property name or an absolute JSON Pointer. Hidden fields are disabled: they are neither validated nor part of the value.

## 6. Methods

| Method | Description |
|---|---|
| `SchemaForm.create(host, options)` | Check the schema and UI schema, then render into `host`. |
| `getValue()` | The current value as JSON (hidden and empty optional fields left out). |
| `setValue(value)` | Replace the current value (no events). |
| `validate()` | Validate visible fields and array sizes; show messages and the summary. |
| `submit()` | Submit through the native pipeline. |
| `reset()` | Restore the initial value and clear messages. |
| `setErrors(errors)` / `clearErrors()` | Show or remove messages by JSON Pointer. |
| `focusField(pointer)` | Focus a visible field; returns false otherwise. |
| `update(options)` | Merge options and re-render, keeping the current value unless `value` is given. |
| `destroy()` | Destroy the controls and the Form, and empty the host. |

The checks are exported too: `checkFormSchema(schema)`, `checkUiSchema(schema, ui)`, `isFormSchema`, `isUiSchema`, `evaluateCondition`, `widgetsFor`, `fieldPointers`, `SCHEMA_LIMITS`.

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ value: JsonObject, pointer: string \| null }` | Any edit, and array add, remove, and move (`pointer` null). The controls' own events stop at the form. |
| `aui-submit` | `{ value: JsonObject }` | A submission passed every check. |
| `aui-invalid` | `{ errors: { pointer, label, message }[] }` | A submission was blocked. |

`form` (the Form instance) also emits `aui-state-change` and `aui-reset` on `element`.

## 8. Slots/content areas

None: the schema defines the content.

## 9. CSS parts/hooks

`aui-schema-form`, `aui-schema-form__form`, `aui-schema-form__body`, `aui-schema-form__grid`, `aui-schema-form__grid--columns`, `aui-schema-form__cell`, `aui-schema-form__cell--span`, `aui-schema-form__group`, `aui-schema-form__array`, `aui-schema-form__items`, `aui-schema-form__item`, `aui-schema-form__tools`, `aui-schema-form__empty`, `aui-schema-form__add`, `aui-schema-form__actions`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/schema-form/tokens.json` (verified in CI). No component tokens: spacing, borders, and radius use the global tokens, and every field uses its own control's tokens.

## 11. States

Pristine, editing, conditional fields hidden, empty array, array at `maxItems` (add disabled), invalid with the Error Summary, async validation pending (`aria-busy` on the form), submitted, server errors, disabled.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| editing | an edit that changes a condition | dependent fields shown or hidden (hidden ones disabled) |
| editing | submit with invalid fields | Error Summary focused; `aui-invalid` |
| editing | submit, valid, `validate` returns errors | messages on fields and groups; `aui-invalid` |
| editing | submit, valid | `aui-submit { value }` |
| any | `setErrors()` | messages shown until the field is edited or the form resubmitted |
| any | `reset()` or a reset button | initial value, arrays restored, messages cleared |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Form | Fields, entry actions, the add button, and the actions in document order. |
| Enter / Space | Move, remove, add buttons | Act; focus stays on the moved entry's action or moves to the next entry or the add button. |
| Enter | Single-line field | Submit (native behavior). |

Each control keeps its own keyboard model (Select, Combobox, Date Picker, Slider, and so on).

## 14. ARIA contract

- The form is named by `label` or the schema title (`aria-label`).
- Objects and arrays are native `fieldset`s with a `legend` (Fieldset): help text and group errors are referenced with `aria-describedby`.
- Array entries are an `ol`; move and remove buttons are icon-only with names such as "Move Contact 2 up".
- Hidden fields carry the `hidden` attribute and their controls are disabled.

## 15. Accessibility notes

- Error messages come from the controls and the Error Summary of Form; summary links name the field.
- Array changes are announced politely ("Contact 2 moved to position 1 of 3").
- Required fields use each control's required marker; required arrays of choices mean "select at least one".
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

One column by default. `columns` from the UI schema (2 to 4) applies as far as the form's width allows: each column needs about 13rem, so a form gets 2 columns from 27rem, 3 from 41rem, and 4 from 55rem (container queries), and one column below 27rem, so phones never scroll horizontally. `span` is clamped to the columns in use. Entry actions wrap under the entry.

## 17. RTL behavior

Logical properties only; the controls mirror themselves.

## 18. Theme behavior

Three themes, density, and forced colors follow the controls; group and array borders use `color-border` (CanvasText in forced colors).

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { schemaForm: { showActions: false } } });
```

## 20. Component configuration support

Instance `showActions` and `locale` override configuration; configuration changes re-render the actions of existing forms. Form's own configuration (`focusOnInvalid`, `errorSummary`) applies to the inner Form.

## 21. Timezone behavior

`format: date` values are ISO dates (`YYYY-MM-DD`); `date-time` values are UTC instants (`toISOString()`), shown in `timezone` or the configured time zone; `time` values are `HH:MM:SS`. With `businessCalendar`, `disableNonWorking: true` in a field's UI entry blocks weekends and holidays in the picker.

## 22. Icon customization points

Array buttons use the built-in `arrow-up`, `arrow-down`, `trash`, and `plus` icons (they follow the icon provider). Controls keep their own icon options.

## 23. Security behavior

Titles, help text, and option labels are rendered as text. Rich-text values are sanitized by Rich Text Editor. Conditions are JSON interpreted by a fixed evaluator: no `eval`, no `Function`. `pattern` compiles with the `u` flag (at most 500 characters); depth is limited to 8 levels and size to 500 fields. Values from `value` that do not match the schema type are ignored.

## 24. Data handling behavior

No persistence, network access, or telemetry. The `validate` option and the submission handling belong to the application.

## 25. Performance characteristics

Rendering creates one control per field; visibility re-evaluates on each edit (linear in the number of fields). Array changes rebuild only that array's entries.

## 26. Supported data scale

Up to 500 fields and arrays of 100 entries. Every field is a real control (no virtualization); split very long questionnaires into steps.

## 27. Usage examples

```ts
import { SchemaForm, type FormSchema, type SchemaFormSubmitDetail } from '@absoluteui/components/schema-form';

const schema: FormSchema = {
  type: 'object',
  title: 'Leave request',
  required: ['type', 'from'],
  properties: {
    type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual leave' }, { const: 'other', title: 'Other' }] },
    reason: { type: 'string', title: 'Reason' },
    from: { type: 'string', title: 'First day', format: 'date' },
  },
};
const host = document.querySelector<HTMLElement>('#leave');
if (host) {
  const form = SchemaForm.create(host, { schema, uiSchema: { fields: { reason: { widget: 'textarea', visibleIf: { field: 'type', equals: 'other' } } } } });
  host.addEventListener('aui-submit', (event) => {
    const { value } = (event as CustomEvent<SchemaFormSubmitDetail>).detail;
    void fetch('/api/leave', { method: 'POST', body: JSON.stringify(value) }).then(async (r) => {
      if (r.status === 422) form.setErrors((await r.json()) as Record<string, string>);
    });
  });
}
```

More examples, type-checked in CI: `metadata/schema-form/examples.json`.

## 28. Edge cases

- A field whose condition refers to a hidden field sees no value (`filled: false`).
- Empty optional strings and numbers are left out of the value; booleans are always present; array entries left empty are `null` so positions stay stable.
- `setErrors` with a pointer to an object or array marks the group; unknown pointers and `''` appear in the summary without a link.
- `minItems` and `maxItems` of lists are checked on submit; `maxItems` also disables the add button.
- `oneOf` and `enum` values are compared by their string form: two choices whose strings collide are a schema error.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SCHEMA_FORM_SCHEMA` | configuration | The schema uses unsupported keywords or invalid values; the message lists up to five pointers. |
| `SCHEMA_FORM_UI_SCHEMA` | configuration | A widget that does not fit, an unknown UI key, a bad condition, or a reference to an unknown field. |
| `SCHEMA_FORM_OPTIONS` / `SCHEMA_FORM_VALUE` / `SCHEMA_FORM_ERRORS` | configuration | Invalid option types, a value that is not an object, or errors that are not strings. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Errors are thrown before the host is modified; an invalid `update()` keeps the previous form.

## 30. Known limitations

- Conditions support equals, notEquals, in, and filled, combined with all, any, and not.
- Arrays of arrays are not supported.
- Reordering entries rebuilds their controls; focus moves to the matching action button.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- `$ref`, `$defs`, `allOf`, `anyOf`, `not`, `if`/`then`/`else`, `dependentSchemas`, `patternProperties`, type arrays.
- Formats other than `date`, `date-time`, `time`, `email`, `uri`.
- Custom widgets: use Form with your own controls.

## 32. TypeScript definitions

```ts
type JsonValue = string | number | boolean | null | JsonValue[] | { [key: string]: JsonValue };
interface FormSchema {
  type: 'string' | 'number' | 'integer' | 'boolean' | 'object' | 'array';
  title?: string; description?: string; default?: JsonValue;
  enum?: readonly (string | number | boolean | null)[];
  oneOf?: readonly { const: string | number | boolean | null; title?: string; description?: string }[];
  minimum?: number; maximum?: number; minLength?: number; maxLength?: number; pattern?: string;
  format?: 'date' | 'date-time' | 'time' | 'email' | 'uri';
  items?: FormSchema; minItems?: number; maxItems?: number;
  properties?: Readonly<Record<string, FormSchema>>; required?: readonly string[]; additionalProperties?: false; readOnly?: boolean;
}
interface UiField {
  widget?: SchemaWidget; label?: string; help?: string; placeholder?: string; order?: readonly string[];
  columns?: number; span?: number; visibleIf?: FormCondition; rows?: number; orientation?: 'vertical' | 'horizontal';
  disableNonWorking?: boolean; addLabel?: string; patternMessage?: string;
  fields?: Readonly<Record<string, UiField>>; items?: UiField;
}
interface SchemaFormChangeDetail { value: JsonObject; pointer: string | null }
interface SchemaFormSubmitDetail { value: JsonObject }
interface SchemaFormInvalidDetail { errors: readonly { pointer: string | null; label: string; message: string }[] }
```

## 33. Vanilla JS example

```ts
import { SchemaForm } from '@absoluteui/components/schema-form';
import '@absoluteui/components/form/style.css';
import '@absoluteui/components/schema-form/style.css';

const host = document.querySelector<HTMLElement>('#feedback');
if (host) {
  SchemaForm.create(host, {
    schema: { type: 'object', title: 'Feedback', required: ['rating'], properties: { rating: { type: 'integer', title: 'Rating', minimum: 1, maximum: 5 }, comment: { type: 'string', title: 'Comment' } } },
    uiSchema: { fields: { rating: { widget: 'slider' }, comment: { widget: 'textarea' } } },
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { FormSchema, SchemaFormSubmitDetail } from '@absoluteui/components/schema-form';
import { AuiSchemaForm } from '@absoluteui/angular/schema-form';

@Component({
  selector: 'app-leave-request',
  imports: [AuiSchemaForm],
  template: `<aui-schema-form [schema]="schema" submitLabel="Request leave" (submitted)="save($event)"></aui-schema-form>`,
})
export class LeaveRequestComponent {
  readonly schema: FormSchema = { type: 'object', title: 'Leave request', required: ['from'], properties: { from: { type: 'string', title: 'First day', format: 'date' } } };
  save(detail: SchemaFormSubmitDetail): void {
    console.log(detail.value);
  }
}
```

## 35. React example

```tsx
import { AuiSchemaForm } from '@absoluteui/react/schema-form';

export function Example() {
  return <AuiSchemaForm schema={{ type: 'object', title: 'Feedback', properties: { comment: { type: 'string', title: 'Comment' } } }} />;
}
```

See [docs/REACT.md](../../../docs/REACT.md) for value binding, events, refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 36. Vue example

```vue
<script setup lang="ts">
import { AuiSchemaForm } from '@absoluteui/vue/schema-form';
</script>

<template>
  <AuiSchemaForm :schema="{ type: 'object', title: 'Feedback', properties: { comment: { type: 'string', title: 'Comment' } } }" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md) for `v-model`, events, template refs, and SSR. Load the stylesheets listed in the header of this document; the adapter does not inject CSS.

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
