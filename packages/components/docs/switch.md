# Switch

> Package: `@absoluteui/components/switch` | Styles: `@absoluteui/components/switch/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

An on/off setting that takes effect immediately. `Switch` renders a native `<input type="checkbox" role="switch">` restyled as a track, with a decorative thumb whose position shows the state. Switches have no required state: a switch is a setting, not a question. Validity is always valid unless a custom error is set, for example when saving the setting failed.

## 2. Anatomy

```text
<div class="aui-field aui-switch" data-aui-control>               (consumer host)
  <div class="aui-switch__row">
    <span class="aui-switch__control">
      <input type="checkbox" role="switch" class="aui-switch__input">
      <span class="aui-switch__thumb" aria-hidden="true">
    </span>
    <label class="aui-field__label aui-switch__label" for=input>Label</label>
  </div>
  <div class="aui-field__description">                             (optional)
  <div class="aui-field__error aui-validation-message">            (custom error, when shown)
</div>
```

## 3. When to use

- A binary setting that applies immediately, such as notifications or dark mode.
- Settings pages where each row toggles one feature.

## 4. When not to use

- A choice applied only when a form is submitted: use Checkbox.
- A choice the user must confirm ("I agree"): use a required Checkbox.
- More than two states: use Radio Group or Select.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `input` | `HTMLInputElement` | The native checkbox with `role="switch"`. |
| `checked` | `boolean` | Current on/off state. |
| `value` | `string` | Submitted value when on (default `'on'`). |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `validity` | `FieldValidity` | Always valid unless a custom error is set. |
| `dirty` | `boolean` | State differs from the initial state. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<SwitchOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `checked`, `value`, `name`, `description`, `disabled`, and `icons`. There is no `required` or `validate` option. Full table: `metadata/switch/api.json`.

| Global option | Type | Default |
|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` |
| `locale` (inherited) | BCP 47 | `'en-US'` |

## 6. Methods

| Method | Description |
|---|---|
| `Switch.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setChecked(checked)` | Programmatic state; no events. Clears an external custom error. |
| `update(options)` | Merge and apply options. |
| `reportValidity()` | Show a custom error now and return validity. |
| `setCustomError(message)` | External error, for example a failed save; cleared when the user toggles. `null` clears it. |
| `getFormValue()` | `value` when on, otherwise `null`. |
| `focus()` | Focus the switch. |
| `reset()` | Restore the initial state; clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ checked, value }` | Yes | The user toggled the switch (native `change`). |

Programmatic changes (`setChecked`, `update`, `reset`) emit no events.

## 8. Slots/content areas

None. The label and help text are text options.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-switch` | Host. |
| `aui-switch--invalid`, `--disabled` | Host state modifiers. |
| `aui-field__label`, `__description`, `__error` | Shared field chrome. |
| `aui-switch__row` | Track and label row. |
| `aui-switch__control` | Positioning wrapper for the track and thumb. |
| `aui-switch__input` | Native input, restyled as the track. |
| `aui-switch__thumb` | Decorative thumb. |
| `aui-switch__label` | The label. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/switch/tokens.json` (verified against the stylesheet in CI). Key tokens: `switch-width`, `switch-height`, `color-primary`, `color-on-primary`, `color-border-strong`, `color-surface-sunken`, `color-focus-ring`, `radius-pill`, `touch-target-min`.

Component tokens (SPEC section 10.2, unset by default, so each resolves to its global token until a theme or an ancestor element sets it): `--aui-switch-track-width` (track width; falls back to `switch-width`), `--aui-switch-track-height` (track height (the thumb scales with it); falls back to `switch-height`), `--aui-switch-radius` (track corner radius; falls back to `radius-pill`), `--aui-switch-track-bg` (unchecked track fill; falls back to `color-surface-sunken`), `--aui-switch-checked-bg` (checked track fill; falls back to `color-primary`), `--aui-switch-thumb-bg` (unchecked thumb; falls back to `color-border-strong`), `--aui-switch-thumb-checked-bg` (checked thumb; falls back to `color-on-primary`).

## 11. States

off, on, hover, focus-visible, disabled, disabled on, invalid (custom error shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| off | click, label click, or Space | on; `aui-change` |
| on | click, label click, or Space | off; `aui-change` |
| any | focus leaves the host | touched; a custom error is shown (`blur` timing) |
| invalid (custom error) | user toggles | custom error cleared |
| any | `reset()` | initial state; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Any | Moves focus to and from the switch. |
| Space | Switch focused | Toggles on/off (native). Enter does not toggle. |

## 14. ARIA contract

- `role="switch"` on a native checkbox; the checked state maps to on/off, so no `aria-checked` is set by hand.
- Native `<label for>` names the switch.
- `aria-describedby`: help text, then the visible error message.
- `aria-invalid="true"` only while a custom error is shown.
- The thumb is `aria-hidden`.

## 15. Accessibility notes

- The state is shown by thumb position as well as color (WCAG 1.4.1).
- The label is clickable, so the target is the whole row (WCAG 2.5.8).
- The label should describe the setting and stay constant; do not change it to "On"/"Off".
- Reduced motion removes the thumb transition.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The track is fixed-size (`switch-width` by `switch-height`); the label wraps beside it. Help text and messages align with the label.

## 17. RTL behavior

The thumb uses `inset-inline-start`, so "on" moves it to the inline end in both directions (right in LTR, left in RTL) without direction-specific rules.

## 18. Theme behavior

Off: `color-surface-sunken` track with a `color-border-strong` boundary and thumb. On: `color-primary` track with a `color-on-primary` thumb. High-contrast themes widen `border-width`. In forced-colors mode the track uses `Canvas`/`CanvasText` when off and `Highlight`/`HighlightText` when on, and disabled uses `GrayText`, with `forced-color-adjust: none`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { switch: { validationTiming: 'submit' } } });
```

Changes apply to existing instances immediately. `validationTiming` only affects when a custom error first appears.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons.error` (default `alert-circle`). The thumb is a CSS shape, not an icon.

## 23. Security behavior

All text uses `textContent`. CSP-safe: no inline styles or HTML strings.

## 24. Data handling behavior

No persistence, network access, or telemetry. With `name`, the native input submits `name=value` when on.

## 25. Performance characteristics

Two listeners per instance (change, focusout), a shared document-level pointer tracker, and one configuration subscription. Target: under 1 ms per `Switch.create`; not yet covered by the performance test.

## 26. Supported data scale

One value per instance. Not yet included in the 1,000-instance performance test.

## 27. Usage examples

```ts
import { Switch } from '@absoluteui/components/switch';

const host = document.createElement('div');
document.body.append(host);
Switch.create(host, { label: 'Email notifications', description: 'Weekly summary of activity' });
```

More examples, type-checked in CI: `metadata/switch/examples.json`.

## 28. Edge cases

- `reportValidity()` returns `true` unless a custom error is set.
- `setChecked()` clears a custom error, so revert the state first and then set the error when a save fails.
- A disabled switch is not submitted natively, but `getFormValue()` still reports its value.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SWITCH_OPTIONS` | configuration | Missing label or non-string `value`. |
| Validation (`validity.error`) | validation | `custom` only (set through `setCustomError`). |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- No `required` or `validate` option by design; use a Checkbox for choices that must be confirmed.
- No on/off text inside the track.
- The track alone is 2.25rem by 1.25rem; the 24px target is met by the row and label.
- Screen-reader behavior of `role="switch"` has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- A mixed/indeterminate state.
- HTML inside the label.

## 32. TypeScript definitions

```ts
type ValidationTiming = 'blur' | 'input' | 'submit';
interface SwitchIcons { error: IconRef }
interface SwitchChangeDetail { checked: boolean; value: string }
```

## 33. Vanilla JS example

```ts
import { Switch } from '@absoluteui/components/switch';
import '@absoluteui/components/switch/style.css';

const host = document.querySelector<HTMLElement>('#dark-mode');
if (host) {
  const dark = Switch.create(host, { label: 'Dark mode' });
  host.addEventListener('aui-change', () => {
    document.documentElement.dataset.auiTheme = dark.checked ? 'absolute-dark' : 'absolute-default';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { AuiSwitch } from '@absoluteui/angular/switch';

@Component({
  selector: 'app-settings',
  imports: [ReactiveFormsModule, AuiSwitch],
  template: `<aui-switch label="Email notifications" description="Weekly summary" [formControl]="notifications"></aui-switch>`,
})
export class SettingsComponent {
  readonly notifications = new FormControl(false, { nonNullable: true });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
