# Form Builder

> Package: `@absoluteui/components/form-builder` | Styles: `@absoluteui/components/button/style.css`, `@absoluteui/components/tabs/style.css`, `@absoluteui/components/sortable-list/style.css`, `@absoluteui/components/inline-message/style.css`, `@absoluteui/components/text-input/style.css`, `@absoluteui/components/textarea/style.css`, `@absoluteui/components/number-input/style.css`, `@absoluteui/components/select/style.css`, `@absoluteui/components/switch/style.css`, `@absoluteui/components/form/style.css`, `@absoluteui/components/error-summary/style.css`, `@absoluteui/components/fieldset/style.css`, `@absoluteui/components/radio-group/style.css`, `@absoluteui/components/combobox/style.css`, `@absoluteui/components/multi-select/style.css`, `@absoluteui/components/checkbox/style.css`, `@absoluteui/components/checkbox-group/style.css`, `@absoluteui/components/slider/style.css`, `@absoluteui/components/rich-text-editor/style.css`, `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, `@absoluteui/components/date-picker/style.css`, `@absoluteui/components/date-time-picker/style.css`, `@absoluteui/components/time-picker/style.css`, `@absoluteui/components/schema-form/style.css`, and `@absoluteui/components/form-builder/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

A form designer that produces the `{ schema, uiSchema }` document Schema Form renders. Administrators pick field types from a palette (click, Enter, or pointer drag onto the canvas), reorder fields on the canvas by pointer drag or keyboard (Sortable List, the pattern of the dashboard builder), and edit each field in a properties panel: label, name, required, validation, options, help text, placeholder, width, and visibility conditions. A Preview tab renders the document with Schema Form, a JSON tab shows it and imports a pasted document after validating it, and every change can be undone. After each valid change the builder emits `aui-change` with the new document; invalid edits are rejected with a message and never reach the host.

## 2. Anatomy

```text
<div class="aui-form-builder">                                  (size container)
  <div class="aui-form-builder__root">
    <div class="aui-form-builder__toolbar" role="toolbar" aria-label="Leave request form">[Undo] [Redo]</div>
    [Tabs: Design | Preview | JSON]
      <div class="aui-form-builder__design">
        <section class="aui-form-builder__palette"><h3>Add a field</h3><ul class="aui-form-builder__types">[Text] [Dropdown] ...</ul></section>
        <section class="aui-form-builder__canvas"><h3>Form fields</h3>
          [Sortable List: handle | <div class="aui-form-builder__item"><button class="aui-form-builder__select" aria-pressed>Label / type</button> [remove]</div>]
          <div class="aui-form-builder__drop" hidden></div>
        </section>
        <section class="aui-form-builder__panel"><h3>Properties: Leave type</h3><div class="aui-form-builder__fields">[controls]</div></section>
      </div>
      <div class="aui-form-builder__preview">[Schema Form] <pre class="aui-form-builder__output" role="status"></pre></div>
      <div class="aui-form-builder__json">[Textarea] [Apply JSON] [Revert]</div>
  </div>
</div>
```

## 3. When to use

- Administrators define forms (questionnaires, request types, intake forms) without a release.
- Prototyping a form and handing the JSON to developers.

## 4. When not to use

- End users filling in forms: render the document with Schema Form.
- Logic beyond the supported conditions: edit the JSON or write the form by hand.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | The host element. |
| `options` | `Readonly<FormBuilderOptions>` | Current options. |
| `selected` | `string \| null` | The selected field, or null when the form settings are shown. |
| `canUndo` / `canRedo` | `boolean` | Whether a step can be undone or redone. |

Options (`FormBuilderOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name (the toolbar). |
| `schema` | `FormSchema` | empty form | No | Initial schema (root type `object`). |
| `uiSchema` | `UiField` | `{}` | No | Initial UI schema. |
| `fieldTypes` | `readonly FormBuilderFieldType[]` | all 18 | No | Palette entries, in order. |
| `icons` | `Partial<FormBuilderIcons>` | - | No | `undo`, `redo`, `remove`, `handle`. |
| `historyLimit` | `number` | `100` | Yes | Undo steps kept (1 to 1000). |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of messages and controls. |

Field types: `text`, `textarea`, `richtext`, `email`, `url`, `number`, `integer`, `slider`, `select`, `radio`, `combobox`, `multiselect`, `checkboxes`, `checkbox`, `switch`, `date`, `datetime`, `time`.

## 6. Methods

| Method | Description |
|---|---|
| `FormBuilder.create(host, options)` | Render into `host` (children are replaced). |
| `getValue()` | A copy of `{ schema, uiSchema }`. |
| `setValue(schema, uiSchema?)` | Replace the document (validated, undoable, no event). |
| `addField(type, index?)` | Add a field after the selection or at `index`; returns its name. |
| `removeField(name)` | Remove a field and the conditions that use it. |
| `selectField(name \| null)` | Select a field, or show the form settings. |
| `undo()` / `redo()` | Step through the history. |
| `update(options)` | Merge options; a new `schema` or `uiSchema` replaces the document and clears the history. |
| `destroy()` | Destroy every control and empty the host. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ schema: FormSchema, uiSchema: UiField }` | Any accepted change: add, remove, reorder, a property, JSON import, undo, redo. The document is always valid for Schema Form. Inner control events stop inside the builder. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

`aui-form-builder`, `aui-form-builder__root`, `aui-form-builder__toolbar`, `aui-form-builder__design`, `aui-form-builder__palette`, `aui-form-builder__types`, `aui-form-builder__type`, `aui-form-builder__type--dragging`, `aui-form-builder__canvas`, `aui-form-builder__drop`, `aui-form-builder__empty`, `aui-form-builder__item`, `aui-form-builder__item--selected`, `aui-form-builder__select`, `aui-form-builder__label`, `aui-form-builder__meta`, `aui-form-builder__panel`, `aui-form-builder__fields`, `aui-form-builder__heading`, `aui-form-builder__subheading`, `aui-form-builder__hint`, `aui-form-builder__preview`, `aui-form-builder__output`, `aui-form-builder__json`, `aui-form-builder__actions`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/form-builder/tokens.json` (verified in CI). No component tokens: panes use `color-surface` and `color-border`, the selected field `color-selected` and `color-selected-text`, the drop line `color-primary`.

## 11. States

Empty canvas, a field selected, form settings (nothing selected), dragging a field type over the canvas, keyboard reordering, edit rejected (assertive message), Preview, JSON view with an invalid import, undo and redo available or not.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| any | palette button (click, Enter, Space) | field added after the selection and selected; announced; `aui-change` |
| any | palette drag released over the canvas | field inserted at the drop line; `aui-change` |
| field selected | property committed (blur, Enter, selection) | document updated; `aui-change` |
| field selected | an edit that makes the document invalid | edit rejected; message in the panel; no event |
| any | reorder (drag or keyboard) | new order; `aui-change` |
| JSON view | Apply JSON with a valid document | document replaced; `aui-change` |
| any | Undo / Redo / Ctrl+Z / Ctrl+Y | previous / next document; announced; `aui-change` |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Enter / Space | Palette button | Add the field type after the selected field. |
| Enter / Space | Field select button | Select the field and focus its first property. |
| Delete | Field select button | Remove the field. |
| Space / Enter, arrows, Home, End, Space / Enter, Escape | Canvas handle | Grab, move, drop, or cancel (Sortable List). |
| Ctrl+Z, Ctrl+Y, Ctrl+Shift+Z (Cmd on macOS) | Builder, outside text fields | Undo, redo. |
| Arrow keys | Tabs | Switch between Design, Preview, and JSON. |

## 14. ARIA contract

- Toolbar: `role="toolbar"` named by `label`.
- Palette, canvas, and properties are `section`s labelled by their headings (`h3`).
- Field select buttons: `aria-pressed` for the selection and a name with label, type, and "required".
- The canvas is a Sortable List with its own instructions and live announcements.
- The preview output is `role="status"`; rejected edits use an assertive Inline Message.

## 15. Accessibility notes

- Every pointer drag has a keyboard path (WCAG 2.5.7): palette buttons add without dragging; handles reorder by keyboard.
- Additions, removals, moves, undo, and redo are announced politely.
- Headings start at level 3; place the builder under a level-2 heading.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The three panes sit side by side at 56rem or more (container query) and stack below; tabs keep Preview and JSON one tap away on phones.

## 17. RTL behavior

Logical properties throughout; panes and handles mirror.

## 18. Theme behavior

The selected field is marked by color and a border; forced colors use `Highlight` and `HighlightText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { formBuilder: { historyLimit: 200 } } });
```

## 20. Component configuration support

Instance `historyLimit` and `locale` override configuration.

## 21. Timezone behavior

Not applicable to the builder. Date fields it creates behave as in Schema Form; the "Only working days" switch sets `disableNonWorking` (it takes effect when the Schema Form has a `businessCalendar`).

## 22. Icon customization points

`icons.undo` (`undo`), `icons.redo` (`redo`), `icons.remove` (`trash`), `icons.handle` (Sortable List `menu`). Palette entries use icons of the AbsoluteUI icon set.

## 23. Security behavior

Labels, options, and help text are rendered as text. Imported JSON is parsed with `safeJsonParse` (1 MB) and validated with `checkFormSchema` and `checkUiSchema` before it is applied. Conditions are data; nothing is evaluated as code.

## 24. Data handling behavior

No persistence, network access, or telemetry: store the emitted document yourself.

## 25. Performance characteristics

Each change re-renders the canvas rows in place (stable rows per field) and, when visible, updates the preview and JSON. History steps are JSON Patches, so 100 steps stay small.

## 26. Supported data scale

Up to 200 fields on the canvas.

## 27. Usage examples

```ts
import { FormBuilder, type FormBuilderChangeDetail } from '@absoluteui/components/form-builder';

const host = document.querySelector<HTMLElement>('#designer');
if (host) {
  FormBuilder.create(host, { label: 'Onboarding questionnaire' });
  host.addEventListener('aui-change', (event) => {
    const document = (event as CustomEvent<FormBuilderChangeDetail>).detail;
    void fetch('/api/forms/onboarding', { method: 'PUT', body: JSON.stringify(document) });
  });
}
```

More examples, type-checked in CI: `metadata/form-builder/examples.json`.

## 28. Edge cases

- Renaming a field updates `required`, the order, its UI entry, and conditions that refer to it; a taken or invalid name is refused.
- Removing a field also removes conditions that depend on it.
- An option list or minimum/maximum that makes the schema invalid is refused with the issue list.
- Imported nested groups and lists stay intact; their inner fields are edited in the JSON view.
- Undo after a JSON import restores the previous document.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FORM_BUILDER_OPTIONS` | configuration | Blank label, unknown field types, or an initial schema or UI schema Schema Form does not support. |
| `FORM_BUILDER_VALUE` | configuration | `setValue()` with an invalid document (the message lists the pointers). |
| `FORM_BUILDER_TYPE` | configuration | `addField()` with an unknown type. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

## 30. Known limitations

- The builder edits top-level fields; nested groups and lists are edited in the JSON view.
- The visibility editor writes one condition per field; combined conditions are kept and edited as JSON.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Custom field types in the palette.
- Collaborative editing.

## 32. TypeScript definitions

```ts
type FormBuilderFieldType = 'text' | 'textarea' | 'richtext' | 'email' | 'url' | 'number' | 'integer' | 'slider' | 'select' | 'radio' | 'combobox' | 'multiselect' | 'checkboxes' | 'checkbox' | 'switch' | 'date' | 'datetime' | 'time';
interface FormBuilderConfig { historyLimit: number }
interface FormBuilderIcons { undo: IconRef; redo: IconRef; remove: IconRef; handle: IconRef }
interface FormBuilderOptions extends Partial<FormBuilderConfig> {
  label: string;
  schema?: FormSchema;
  uiSchema?: UiField;
  fieldTypes?: readonly FormBuilderFieldType[];
  locale?: string;
  icons?: Partial<FormBuilderIcons>;
}
interface FormBuilderChangeDetail { schema: FormSchema; uiSchema: UiField }
```

## 33. Vanilla JS example

```ts
import { FormBuilder } from '@absoluteui/components/form-builder';
import '@absoluteui/components/form-builder/style.css';

const host = document.querySelector<HTMLElement>('#designer');
if (host) FormBuilder.create(host, { label: 'Survey', fieldTypes: ['text', 'radio', 'checkboxes', 'slider'] });
```

## 34. Angular example

```ts
import { Component, signal } from '@angular/core';
import type { FormBuilderChangeDetail } from '@absoluteui/components/form-builder';
import type { FormSchema, UiField } from '@absoluteui/components/schema-form';
import { AuiFormBuilder } from '@absoluteui/angular/form-builder';
import { AuiSchemaForm } from '@absoluteui/angular/schema-form';

@Component({
  selector: 'app-form-designer',
  imports: [AuiFormBuilder, AuiSchemaForm],
  template: `
    <aui-form-builder label="Onboarding questionnaire" (changed)="onChange($event)"></aui-form-builder>
    <aui-schema-form [schema]="schema()" [uiSchema]="uiSchema()"></aui-schema-form>
  `,
})
export class FormDesignerComponent {
  readonly schema = signal<FormSchema>({ type: 'object', properties: {} });
  readonly uiSchema = signal<UiField>({});
  onChange(detail: FormBuilderChangeDetail): void {
    this.schema.set(detail.schema);
    this.uiSchema.set(detail.uiSchema);
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
