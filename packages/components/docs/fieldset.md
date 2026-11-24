# Fieldset

> Package: `@absoluteui/components/fieldset` | Styles: `@absoluteui/components/fieldset/style.css` | Since 0.9.0 | Status: R13

## 1. Purpose

Enhances a native `<fieldset>` that groups related controls, such as an address, a date of birth, or contact preferences, with the AbsoluteUI legend, help text, required marker, and a group-level error. `Fieldset.enhance` keeps the fieldset's own controls in place; the native element provides the group semantics and the `disabled` state.

## 2. Anatomy

```text
<fieldset class="aui-fieldset [aui-fieldset--invalid]" aria-describedby="help error ...">
  <legend class="aui-field__label">Legend<span class="aui-field__required" aria-hidden="true">*</span><span>(required) (visually hidden)</span></legend>
  <div class="aui-field__description">help</div>
  <div class="aui-field__error aui-validation-message">icon + group error</div>
  ... the fieldset's own controls ...
</fieldset>
```

## 3. When to use

- Several fields answer one question: address, date of birth, contact preferences.
- A validation rule that spans fields: "Enter a street and a city", "Choose at least one channel".

## 4. When not to use

- One control: use Form Field or the control's own label.
- One value chosen from checkboxes or radios: use Checkbox Group or Radio Group, which render their own fieldset.
- Visual grouping without a shared question: use Card or the layout primitives.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `element` | `HTMLFieldSetElement` | The enhanced fieldset. |
| `legend` | `HTMLLegendElement` | The rendered legend. |
| `options` | `Readonly<FieldsetOptions>` | Current options. |

Options (`FieldsetOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `legend` | `string` | - (required) | No | Visible legend; the group's accessible name. |
| `hideLegend` | `boolean` | `false` | No | Visually hide the legend; it stays the accessible name. |
| `description` | `string` | - | No | Help text for the group. |
| `required` | `boolean` | `false` | No | Required marker; "(required)" is spoken with the legend. |
| `disabled` | `boolean` | - | No | Sets the native `disabled` attribute; unset leaves it alone. |
| `error` | `string \| null` | - | No | Group-level error; empty or `null` hides it. |
| `icons` | `Partial<FieldsetIcons>` | - | No | Icon slot overrides. |
| `locale` | `string` | common `locale` | Yes (inherited) | Locale of the required text. |

## 6. Methods

| Method | Description |
|---|---|
| `Fieldset.enhance(element, options)` | Enhance an existing `<fieldset>`; its controls stay in place. A legend the page provided is replaced while enhanced. |
| `focus()` | Focus the first enabled, visible control in the group. Pass it as an Error Summary item's `focus`. |
| `update(options)` | Merge and apply options. |
| `destroy()` | Remove the legend, help, and error; restore a page legend and the original `aria-describedby`. |

## 7. Events

None. The controls inside emit their own events.

## 8. Slots/content areas

The fieldset's own children: any controls, kept in place after the legend, help, and error.

## 9. CSS parts/hooks

`aui-fieldset`, `aui-fieldset--invalid`, and the shared field chrome classes `aui-field__label`, `aui-field__required`, `aui-field__description`, `aui-field__error`. All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/fieldset/tokens.json` (verified in CI). The legend, help, and error use the shared field chrome tokens; the invalid state adds a `color-error-fg` bar at the inline start; a disabled legend uses `color-text-disabled`.

## 11. States

Default, required, invalid (group error shown), disabled (native), legend hidden.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| valid | `update({ error: 'message' })` | invalid; the message is added to `aria-describedby` |
| invalid | `update({ error: null })` | valid |
| any | `update({ disabled })` | native disabled on or off |
| any | `destroy()` | the page's fieldset as it was |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab | Controls inside | Moves through the group's controls in document order. The fieldset itself is not focusable. |

## 14. ARIA contract

- Native `fieldset` (group) named by its `legend`.
- `aria-describedby`: the help and error ids while shown, followed by the page's own ids.
- The asterisk is `aria-hidden`; a visually hidden, localized "(required)" follows the legend text, because the group role cannot carry `aria-required`.

## 15. Accessibility notes

- Keep legends short: screen readers may repeat them when moving between the controls.
- Show the group error next to the group and in the Error Summary; use `focus()` as the summary item's `focus`.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

A grid of the legend, help, error, and the page's controls; the controls keep their own layout.

## 17. RTL behavior

Logical properties: the error bar sits at the inline start.

## 18. Theme behavior

The shared field chrome follows the theme; forced-colors mode uses system colors for text and the error bar.

## 19. Global configuration support

Only the inherited `locale` is configurable:

```ts
configureAbsoluteUI({ components: { fieldset: { locale: 'de-DE' } } });
```

## 20. Component configuration support

The instance `locale` overrides configuration; configuration changes re-render existing fieldsets.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`), shown with the group error.

## 23. Security behavior

Legend, help, and error text use `textContent`; they are never parsed as HTML.

## 24. Data handling behavior

No persistence, network access, or telemetry. The fieldset holds no values; its controls do.

## 25. Performance characteristics

Constant work per render.

## 26. Supported data scale

Not data-driven.

## 27. Usage examples

```ts
import { Fieldset } from '@absoluteui/components/fieldset';
import { ErrorSummary } from '@absoluteui/components/error-summary';

const element = document.querySelector<HTMLFieldSetElement>('#contact');
const summaryHost = document.querySelector<HTMLElement>('#summary');
if (element && summaryHost) {
  const contact = Fieldset.enhance(element, { legend: 'How should we contact you?', required: true });
  const summary = ErrorSummary.create(summaryHost);
  const message = 'Choose at least one way to contact you';
  contact.update({ error: message });
  summary.show([{ message, target: contact.legend, focus: () => { contact.focus(); } }]);
}
```

More examples, type-checked in CI: `metadata/fieldset/examples.json`.

## 28. Edge cases

- A legend already in the fieldset is removed while enhanced and restored by `destroy()`.
- `disabled` left unset never touches the native attribute, so `[disabled]` bindings of frameworks keep working.
- `focus()` skips disabled and hidden controls; it does nothing when none is focusable.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `FIELDSET_HOST` | configuration | The element is not a `<fieldset>`. |
| `FIELDSET_OPTIONS` | configuration | Missing or blank legend, or an option of the wrong type. |
| `ICON_UNKNOWN` | configuration | Unknown icon override. |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |

Invalid options throw before the fieldset is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Fieldset does not validate its controls; the application sets the group error (for example from Form validation).
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Collapsing the group: use Collapsible or Accordion.
- HTML in the legend.

## 32. TypeScript definitions

```ts
interface FieldsetIcons { error: IconRef }
interface FieldsetOptions {
  legend: string;
  hideLegend?: boolean;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  error?: string | null;
  locale?: string;
  icons?: Partial<FieldsetIcons>;
}
```

## 33. Vanilla JS example

```ts
import { Fieldset } from '@absoluteui/components/fieldset';
import '@absoluteui/components/fieldset/style.css';

const element = document.querySelector<HTMLFieldSetElement>('#birth-date');
if (element) Fieldset.enhance(element, { legend: 'Date of birth', description: 'For example, 27 3 2007' });
```

## 34. Angular example

`fieldset[auiFieldset]` enhances the native fieldset in place; the projected controls stay Angular-managed and `disabled` is the native attribute.

```ts
import { Component } from '@angular/core';
import { AuiFieldset } from '@absoluteui/angular/fieldset';
import { AuiTextInput } from '@absoluteui/angular/text-input';

@Component({
  selector: 'app-address',
  imports: [AuiFieldset, AuiTextInput],
  template: `
    <fieldset auiFieldset legend="Delivery address" [required]="true" [error]="error">
      <aui-text-input label="Street" autocomplete="address-line1"></aui-text-input>
      <aui-text-input label="City" autocomplete="address-level2"></aui-text-input>
    </fieldset>`,
})
export class AddressComponent {
  error: string | null = null;
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
