# Duration Picker

> Package: `@absoluteui/components/duration-picker` | Styles: `@absoluteui/components/duration-picker/style.css` | Since 0.3.0 | Status: R2

## 1. Purpose

Entry of a fixed-length amount of time. `DurationPicker` renders one spinbutton segment per unit (days, hours, minutes, seconds; configurable and contiguous, default hours and minutes) inside a labelled group, each with localized unit text. ArrowUp and ArrowDown change the total by one unit and carry into the neighbouring units; the smallest unit moves by `step`. The value is a `Duration` (SPEC section 8.4): a non-negative number of milliseconds with no date, clock position, or timezone. Validation is localized and a hidden input submits an ISO 8601 duration (`PT1H30M`). There is no popup.

## 2. Anatomy

```text
<div class="aui-field aui-duration-picker" data-aui-control>             (consumer host)
  <label class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-duration-picker__group" role="group" aria-labelledby=label dir>
    <span class="aui-duration-picker__unit aui-duration-picker__unit--hours">
      <input class="aui-duration-picker__segment aui-duration-picker__segment--hours" role="spinbutton"
             aria-label="Hours" aria-valuenow aria-valuetext="1 hour" aria-valuemin="0" aria-valuemax="999">
      <span class="aui-duration-picker__unit-label" aria-hidden="true">hr</span>   (before the input where the locale puts units first)
    </span>
    <span class="aui-duration-picker__unit aui-duration-picker__unit--minutes"> ... </span>
  </div>
  <div class="aui-field__description">                                    (optional)
  <div class="aui-field__error aui-validation-message">                   (when shown)
  <input type="hidden" name>
</div>
```

## 3. When to use

- An amount of elapsed or planned time: a task estimate, a timeout, a meeting length, a lap or cooking time.
- Values users think of in several units at once (1 h 30 min) rather than as one number of minutes.
- Durations that must stay on a grid (for example quarter hours) or within bounds.

## 4. When not to use

- A time of day (09:30): use Time Picker.
- Calendar periods such as months or years, whose length depends on the start date: not supported.
- Negative durations or offsets: not supported.
- A single unit with a large range (for example 0-10,000 seconds): Number Input is simpler.
- Sub-second precision: the smallest unit is seconds.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `group` | `HTMLDivElement` | The labelled `role="group"` with one spinbutton segment per unit. |
| `value` | `Duration \| null` | Current value; `null` when empty or failing a built-in check. A custom error (`validate`, `setCustomError`) keeps the value, as in Time Picker. |
| `validity` | `DurationPickerValidity` | `{ valid, error, message }`, recomputed on every change. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `dirty` | `boolean` | Value differs from the initial value, or a partial or invalid entry exists. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<DurationPickerOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `value`, `min`, `max`, `step`, `name`, `description`, `required`, `disabled`, `readOnly`, `validate`, and `icons`. `value`, `min`, `max`, and `step` are `Duration`s; `value` and `step` must be whole numbers of the smallest unit in `fields`, and `step` defaults to one of that unit. Full table: `metadata/duration-picker/api.json`.

| Global option | Type | Default | Mutability |
|---|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | dynamic |
| `fields` | contiguous `DurationField[]`, largest first | `['hours', 'minutes']` | dynamic |
| `locale` (inherited) | BCP 47 | `'en-US'` | dynamic |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` | dynamic |

## 6. Methods

| Method | Description |
|---|---|
| `DurationPicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. Throws `DURATION_PICKER_OPTIONS` for a negative value or one that is not a whole number of the smallest unit. |
| `update(options)` | Merge and apply options. A `fields`, `locale`, or `max` change rebuilds the segments and keeps the current value. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user edits. `null` clears it. |
| `getFormValue()` | ISO 8601 duration in hours, minutes, and seconds (`PT1H30M`), or `null`. |
| `focus()` | Focus the first (largest) segment. |
| `reset()` | Restore the initial value and clear dirty, touched, and submitted state. |
| `destroy()` | Remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | The user changed the value or its validity error (typing, stepping, Home/End, or a separator). |

Programmatic changes (`setValue`, `update`, `reset`) emit no `aui-change`.

## 8. Slots/content areas

None. Label, help text, and messages are text options; unit names and unit text come from messages and `Intl.NumberFormat`.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-duration-picker` | Host. |
| `aui-duration-picker--invalid`, `--disabled`, `--readonly` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-duration-picker__group` | Labelled group; shows the focus indicator. |
| `aui-duration-picker__unit`, `--days`, `--hours`, `--minutes`, `--seconds` | Wrapper of one segment and its unit text. |
| `aui-duration-picker__segment`, `--days`, `--hours`, `--minutes`, `--seconds` | Spinbutton segment inputs. |
| `aui-duration-picker__unit-label` | Short localized unit text. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/duration-picker/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-selected`, `color-selected-text`, `color-text-muted`, `color-error-fg`, `color-surface-sunken`, `color-disabled-bg`, `control-height-md`, `radius-md`, `space-2`.

## 11. States

default, segment focused, filled, partly filled, disabled, read-only, required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty | user types in a segment | dirty; value from the filled units (empty units count as 0); `aui-change` |
| partly filled | focus leaves the host with a valid value | empty units filled with zeros |
| valid | a segment above its range (for example 75 minutes), or a bound or step violated | `invalid`, `range-underflow`, `range-overflow`, or `step-mismatch`; value `null`; `aui-change` |
| any | ArrowUp / ArrowDown | total stepped and clamped; `aui-change` if the value or error changed |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| any | `reset()` | initial value; pristine, untouched |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits | Segment | Enter digits (other characters are removed). Advance when the segment is full, or, below the largest unit, when no second digit could be valid (for example 7 minutes, padded to `07`). |
| `:` `.` `,` Space | Segment | Pad a single digit below the largest unit and advance. |
| ArrowUp / ArrowDown | Segment | Change the total by one unit of that segment, carrying into the other units (`0:59` + 1 minute = `1:00`). The smallest segment moves by `step`, snapping to the step grid first. Clamped to `[min ?? 0, max ?? digit limit]`; an empty entry starts from zero. |
| Home / End | Segment | Set the segment to 0 / its `aria-valuemax`. |
| ArrowLeft / ArrowRight | Caret at the segment edge, or text selected | Previous or next unit in reading order; mirrored in RTL. |
| Backspace | Empty segment | Previous segment. |
| Tab / Shift+Tab | Group | Move through the segments, then out of the control. |

Stepping, Home/End, and separators are ignored while read-only; nothing responds while disabled.

## 14. ARIA contract

- The group is `role="group"` with `aria-labelledby` pointing at the label, and `aria-describedby` listing the help text and the visible error.
- Each segment is a text input with `role="spinbutton"`, a localized `aria-label` ("Days", "Hours", "Minutes", "Seconds"), `inputmode="numeric"`, `aria-valuenow`, `aria-valuetext` (long unit, for example "30 minutes"; both removed when empty), `aria-valuemin="0"`, and `aria-valuemax` (23 for hours and 59 for minutes and seconds below a larger unit; for the largest segment, `max` in that unit or the digit limit).
- `aria-invalid="true"` is set on every segment only while an error is shown.
- The visible unit text is `aria-hidden`.

## 15. Accessibility notes

- Focusing a segment selects its text, so typing replaces it.
- Moving between segments does not count as leaving the field; errors appear after the whole control loses focus (SPEC section 16.1). Rendering the message is deferred while a pointer is pressed, so it does not shift the pending click target.
- Clicking the label focuses the first segment (unless disabled).
- The required asterisk is `aria-hidden`; each segment carries the native `required` state.
- `aria-valuemin` is always 0; `min` is enforced by stepping and validation.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The group hugs its units up to 100% of the container; units wrap inside the group in very narrow containers. Segments are sized in `ch` with tabular digits; the largest segment is wider for extra digits.

## 17. RTL behavior

The group takes `dir` from `direction`, so units flow right to left in RTL. ArrowLeft and ArrowRight follow the reading direction and are mirrored in RTL. Unit text is placed before or after the number as the locale's `Intl.NumberFormat` unit formatting does.

## 18. Theme behavior

Colors come from role tokens only. The group border and a 1px ring use `color-focus-ring` while a segment is focused; the focused segment uses the `color-selected` / `color-selected-text` pair. In forced-colors mode the focused group is outlined in `Highlight`, the focused segment uses `Highlight` / `HighlightText`, and disabled unit text uses `GrayText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { durationPicker: { fields: ['days', 'hours', 'minutes'], validationTiming: 'submit' } } });
```

Dynamic options apply to existing instances immediately; a `fields` or `locale` change rebuilds the segments and keeps the current value.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). All options are dynamic; `update()` rebuilds the segments when `fields`, `locale`, or `max` changes and keeps the current value.

## 21. Timezone behavior

Not applicable. A `Duration` is a fixed number of milliseconds with no date, clock position, or timezone (SPEC section 8.4), and the component does not inherit the `timezone` option. A day is exactly 24 hours, so daylight-saving transitions never change a value. Adding a duration to a date in a zone (where a calendar day may be 23 or 25 hours) is consumer code.

## 22. Icon customization points

`icons.error` (default `alert-circle`) for the validation message.

## 23. Security behavior

All text uses `textContent`. Validation messages never include the entered value; range and step messages include only the configured bounds and step (SPEC section 14.4). CSP-safe: no inline styles or HTML.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries the ISO 8601 duration in hours, minutes, and seconds (`PT1H30M`, `PT0S` for zero). Days are never emitted: a day and two hours is `PT26H`. The input is empty while the entry is empty or invalid, and disabled (not submitted) while the picker is disabled. `parseDuration` from `@absoluteui/core` reads these strings (and `P1DT2H`) back into a `Duration`.

## 25. Performance characteristics

No popup and no per-segment listeners: keyboard, input, and focus handling are delegated to one listener each on the group. Segments are rebuilt only when `fields`, `locale`, or `max` changes. One configuration subscription per instance. Budget: `DurationPicker.create` under 2 ms average per instance (100 instances) in headless Chromium.

## 26. Supported data scale

Up to four unit segments. The largest segment holds as many digits as `max` needs in that unit; without `max`, 3 digits for days and hours, 4 for minutes, and 5 for seconds (999 hours, 9,999 minutes).

## 27. Usage examples

```ts
import { duration } from '@absoluteui/core';
import { DurationPicker } from '@absoluteui/components/duration-picker';

const host = document.createElement('div');
document.body.append(host);
DurationPicker.create(host, { label: 'Estimate', name: 'estimate', required: true, max: duration(8 * 3_600_000), step: duration(15 * 60_000) });
```

More examples, type-checked in CI: `metadata/duration-picker/examples.json`.

## 28. Edge cases

- Empty units count as 0 (typing only `3` in hours is 3 hours); they are filled with zeros when focus leaves the control.
- A unit below the largest that exceeds its range (75 minutes, 24 hours) reports `invalid`; it is not normalized.
- Stepping carries across units (`0:59` + 1 minute = `1:00`) and stops at `min` (or zero) and `max` (or the digit limit, for example `999:59`).
- Stepping from an empty or `invalid` entry starts from zero.
- The step grid starts at zero, not at `min`. Only the smallest segment moves by `step`; larger segments always move by one unit, which can leave a step that does not divide that unit (for example 45 minutes) with `step-mismatch`.
- Home and End set only the focused segment (0 or its `aria-valuemax`), so they can produce a range or step error that validation then reports.
- A `max` with fewer digits in the largest unit narrows that segment for typing; a programmatic value beyond it (for example 10 hours with `max` 8 hours) is shown in full and reports `range-overflow`. Without `max`, a programmatic value may exceed the digit limit of the largest segment (for example 1,000 hours); it is valid, but stepping stops at the digit limit.
- Durations in messages use the units in `fields` (`Enter a duration of 1 hr, 30 min or more.`), adding seconds when a bound is not a whole number of the smallest unit.
- Changing `fields` through `update()` keeps the value; switching to a coarser smallest unit (for example from seconds to minutes) rounds the value down to that unit.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DURATION_PICKER_OPTIONS` | configuration | Missing label; a `value` that is not a non-negative `Duration` in whole smallest units; a `min` or `max` that is not a non-negative `Duration`; `min` after `max`; a `step` that is not a positive `Duration` in whole smallest units; a non-function `validate`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `fields` (empty, non-contiguous, or not largest first), `validationTiming`, `locale`, or `direction` (reported by the configuration engine). |
| Validation (`validity.error`) | validation | `invalid`, `value-missing`, `range-underflow`, `range-overflow`, `step-mismatch`, `custom`. |

Precedence: the built-in check (`value-missing` for an empty required entry, then `invalid`, `range-underflow`, `range-overflow`, `step-mismatch`), then `validate`, then an external custom error. English messages: "This field is required.", "Enter a valid duration.", "Enter a duration of {min} or more.", "Enter a duration of {max} or less.", "Enter a duration in steps of {step}." Durations in messages use short localized units joined by `Intl.ListFormat` (`1 hr, 30 min`).

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Negative durations are not supported.
- Calendar durations (years, months, weeks) are not supported; a day is always 24 hours.
- The smallest unit is seconds; `value` and `step` must be whole numbers of the smallest unit in `fields`.
- Without `max`, the largest segment is limited by its digits.
- Only ASCII digits are accepted in segments.
- No popup or preset list.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, and VoiceOver.

## 31. Unsupported scenarios

- HTML in the label, help text, or messages.
- Non-contiguous fields (for example days and minutes without hours).
- Negative or calendar durations; day, week, month, or year designators in the form value.

## 32. TypeScript definitions

```ts
type DurationField = 'days' | 'hours' | 'minutes' | 'seconds';
type DurationPickerError = 'invalid' | 'value-missing' | 'range-underflow' | 'range-overflow' | 'step-mismatch' | 'custom';
interface DurationPickerConfig { validationTiming: ValidationTiming; fields: readonly DurationField[] }
interface DurationPickerValidity { readonly valid: boolean; readonly error: DurationPickerError | null; readonly message: string }
interface DurationPickerChangeDetail { value: Duration | null; validity: DurationPickerValidity }
interface DurationPickerIcons { error: IconRef }
```

## 33. Vanilla JS example

```ts
import { durationToString } from '@absoluteui/core';
import { DurationPicker, type DurationPickerChangeDetail } from '@absoluteui/components/duration-picker';
import '@absoluteui/components/duration-picker/style.css';

const host = document.querySelector<HTMLElement>('#timeout');
if (host) {
  DurationPicker.create(host, { label: 'Session timeout', name: 'timeout', fields: ['minutes', 'seconds'] });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<DurationPickerChangeDetail>).detail;
    host.dataset.timeout = value ? durationToString(value) : '';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { duration, type Duration } from '@absoluteui/core';
import { AuiDurationPicker } from '@absoluteui/angular/duration-picker';

@Component({
  selector: 'app-task-estimate',
  imports: [ReactiveFormsModule, AuiDurationPicker],
  template: `<aui-duration-picker label="Estimate" [max]="max" [step]="step" [required]="true" [formControl]="estimate"></aui-duration-picker>`,
})
export class TaskEstimateComponent {
  readonly max = duration(8 * 3_600_000);
  readonly step = duration(15 * 60_000);
  readonly estimate = new FormControl<Duration | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
