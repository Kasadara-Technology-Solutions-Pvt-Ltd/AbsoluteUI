# Date Input

> Package: `@absoluteui/components/date-input` | Styles: `@absoluteui/components/date-input/style.css` | Since 0.1.0 | Status: R0 reference component

## 1. Purpose

Keyboard-first date or date-time entry using numeric segments ordered for the locale. Values are explicit types (SPEC section 8.4):
- **date granularity** produces a `PlainDate`;
- **minute granularity** produces an `Instant`, resolved in the configured timezone with a documented DST policy.

## 2. Anatomy

```text
<div class="aui-date-input">                                  (consumer host)
  <div class="aui-date-input__label" id>
  <div class="aui-date-input__group" role="group" aria-labelledby aria-describedby>
    <div class="aui-date-input__fields">
      <input class="aui-date-input__segment aui-date-input__segment--month" aria-label="Month">
      <span class="aui-date-input__separator" aria-hidden="true">/</span> ...
    </div>
  </div>
  <div class="aui-date-input__description"> <div class="aui-date-input__hint"> <div class="aui-date-input__error">
  <input type="hidden" name>
</div>
```

## 3. When to use

- Known dates, such as due dates or birth dates (date granularity).
- Exact moments in a specific timezone, such as meetings (minute granularity).

## 4. When not to use

- Browsing dates visually: use Date Picker or DateTime Picker. Picking ranges: use Date Range Picker.
- Relative or fuzzy dates.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `group` | `HTMLDivElement` | `role="group"` container. |
| `value` | `PlainDate \| Instant \| null` | Valid value, or `null` when empty or invalid. |
| `validity` | `DateInputValidity` | `{ valid, error, localTimeStatus }`. |
| `localValue` | `PlainDateTime \| null` | Minute granularity: the complete wall-clock date and time in the segments, even when the zone rejects it; else `null`. |

Options: `label` (required), `value`, `min`, `max`, `name`, `description`, `required`, `disabled`, and `readOnly`. Advanced options for composite controls (used by Date Picker): `trailing` and `formControl` (see section 8). The globally configurable options are listed below. Full table: `metadata/date-input/api.json`.

| Global option | Type | Default | Mutability |
|---|---|---|---|
| `granularity` | `'date' \| 'minute'` | `'date'` | init-only |
| `hourCycle` | `'auto' \| 'h12' \| 'h23'` | `'auto'` | dynamic |
| `locale` (inherited) | BCP 47 | `'en-US'` | dynamic |
| `timezone` (inherited) | IANA | `'UTC'` | dynamic |
| `disambiguation` (inherited) | `'compatible' \| 'earlier' \| 'later' \| 'reject'` | `'compatible'` | dynamic |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` | dynamic |

## 6. Methods

| Method | Description |
|---|---|
| `DateInput.create(host, options)` | Render into an empty host. |
| `setValue(value)` | Programmatic value; no `aui-change`. The type must match the granularity. |
| `setLocalValue(local)` | Minute granularity, for composite controls (used by DateTime Picker): write a wall-clock `PlainDateTime` (or `null`); it is resolved exactly as if typed (timezone, `disambiguation`, DST hint or error). No `aui-change`. |
| `update(options)` | Merge and apply options. Changing `granularity` throws `CFG_INIT_ONLY`. |
| `reportValidity()` | Show messages now (for example on submit); returns whether the value is valid. |
| `setCustomError(message)` | External error (server, cross-field rule); cleared when the user changes the value. `null` clears it. |
| `getFormValue()` | ISO 8601 string (`YYYY-MM-DD`, or an instant with `Z`) or `null`, for form serialization (`Form`, SPEC section 18.8). |
| `focus()` | Focus the control. |
| `reset()` | Restore the initial value and clear touched/submitted state; no `aui-change`. |
| `destroy()` | Remove listeners, subscriptions, and rendered children. |

Since 0.2.0 Date Input implements the form-control contract (`name`, `label`, `disabled`, `dirty`, `touched`), and `validity` includes a localized `message`. `setCustomError` produces `validity.error === 'custom'` without discarding a parseable value.

## 7. Events

| Event | Detail | Bubbles | When |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | A user edit changed the value, the error, or the DST status. |

## 8. Slots/content areas

No slots for consumer content. Two advanced options exist for composite controls such as Date Picker:

- `trailing?: HTMLElement`: appended inside the group boundary after the segments (for example a calendar button). Focus moving between the segments and this element does not mark the field touched. `update({ trailing })` replaces it.
- `formControl?: boolean` (default `true`, read at creation): `false` skips registration with `Form`, so a composite control can register itself instead of exposing two controls.

## 9. CSS parts/hooks

See the anatomy above. Segment modifiers: `--year`, `--month`, `--day`, `--hour`, `--minute`, `--dayPeriod`. Host modifiers: `aui-date-input--invalid` and `--disabled`.

## 10. Design tokens

See `metadata/date-input/tokens.json` (26 tokens, verified in CI). Key tokens: `color-selected`, `color-selected-text` (focused segment), `color-error-fg`, `color-focus-ring`, and the control-surface tokens.

## 11. States

empty, incomplete, valid, invalid-date, value-missing, range-underflow, range-overflow, nonexistent-time, ambiguous-time, disabled, read-only.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty | First digit | incomplete (message shown only after blur or `reportValidity()`) |
| incomplete | All segments filled | valid, or invalid-date, range-underflow, range-overflow, nonexistent-time, ambiguous-time |
| any | Segment cleared | incomplete, or empty (value-missing if required) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits | Segment | Enter; auto-advance when complete, or when the first digit cannot start a two-digit value (for example 4 in the month segment becomes 04). |
| ArrowUp / ArrowDown | Segment | Increment or decrement with wrap (year clamps); toggles AM/PM. |
| ArrowLeft / ArrowRight | Caret at the segment edge | Previous or next segment (mirrored in RTL). |
| Backspace | Empty segment | Previous segment. |
| `/ - . : , Space` | Numeric segment | Pad and advance. |
| A / P | AM/PM segment | Set AM or PM. |
| Tab / Shift+Tab | Any | Move between segments and out of the group. |

## 14. ARIA contract

- The group has `role="group"` and `aria-labelledby` -> label.
- The group's `aria-describedby` references the description, the timezone/DST hint, and the error, as applicable.
- Segments have localized `aria-label`s and get `aria-invalid="true"` while an error is shown.
- Separators are `aria-hidden`.

## 15. Accessibility notes

- Error messages name the problem; DST messages also name the timezone.
- Daylight-saving adjustments are disclosed in the hint, never applied silently (SPEC section 8.5).
- Each segment is a tab stop.
- Verified with axe (WCAG 2.2 AA) in 3 themes. Manual screen-reader and user testing is pending.

## 16. Responsive behavior

Segments wrap inside the group in narrow containers. The group fits its content, up to 100% of the container width.

## 17. RTL behavior

Segment order comes from the locale's Intl pattern. Digits stay LTR and isolated. Arrow-key segment navigation mirrors in RTL.

## 18. Theme behavior

Token-driven. In forced-colors mode, the focused segment uses `Highlight`/`HighlightText`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ common: { timezone: 'Europe/London' }, components: { dateInput: { hourCycle: 'h23' } } });
```

## 20. Component configuration support

Instance options override global and theme defaults. `granularity` is init-only; all other options are dynamic and rebuild the segments while preserving the entered values.

## 21. Timezone behavior

- **Date granularity:** timezone-independent `PlainDate`. The calendar date never shifts.
- **Minute granularity:** wall-clock input is resolved in `timezone`. The default is UTC; the host timezone is never used (SPEC section 8.1).

DST handling in minute granularity (SPEC section 8.5):

| Case | `compatible` (default) | `earlier` | `later` | `reject` |
|---|---|---|---|---|
| Nonexistent (clock springs forward) | shift forward + hint | shift backward + hint | shift forward + hint | error `nonexistent-time` |
| Ambiguous (clock falls back) | earlier occurrence + hint | earlier + hint | later + hint | error `ambiguous-time` |

The hint always shows the zone name and offset, for example "Time zone: India Standard Time (GMT+05:30)".

## 22. Icon customization points

None.

## 23. Security behavior

All text uses `textContent`; no HTML parsing. CSP-safe.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, the hidden input carries ISO 8601: `YYYY-MM-DD`, or a UTC instant such as `2026-03-08T07:30:00.000Z`.

## 25. Performance characteristics

Each edit recomputes only this instance: one parse, and up to 3 timezone offset lookups with cached `Intl.DateTimeFormat` instances. Budget: under 5 ms average per `DateInput.create` across 100 instances in headless Chromium.

## 26. Supported data scale

100 instances per page in the performance test.

## 27. Usage examples

```ts
import { plainDate } from '@absoluteui/core';
import { DateInput } from '@absoluteui/components/date-input';

const host = document.createElement('div');
document.body.append(host);
DateInput.create(host, { label: 'Due date', name: 'due', min: plainDate(2026, 1, 1) });
```

More examples, type-checked in CI: `metadata/date-input/examples.json`.

## 28. Edge cases

- February 30 reports `invalid-date` immediately.
- 02:30 on 2026-03-08 in `America/New_York` becomes 03:30 EDT with a hint under `compatible`, or an error under `reject`.
- 01:30 on 2026-11-01 in `America/New_York` resolves to the EDT occurrence (05:30Z) under `compatible`.
- Instants are displayed in the configured zone; for example 2026-12-31T20:00Z shows as 2027-01-01 01:30 in `Asia/Kolkata`.
- Years 1 to 99 are supported without the `Date.UTC` 1900 mapping bug.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `DATE_INPUT_LABEL` | configuration | Missing label. |
| `DATE_INPUT_TRAILING` | configuration | `trailing` is not an element. |
| `DATE_INPUT_VALUE_KIND` | configuration | Value, min, or max type does not match the granularity. |
| `CFG_INIT_ONLY` | configuration | Changing `granularity` after creation. |
| Validation errors | validation (`validity.error`) | `incomplete`, `invalid-date`, `value-missing`, `range-underflow`, `range-overflow`, `nonexistent-time`, `ambiguous-time`. |

## 30. Known limitations

- No calendar popup; use Date Picker.
- Gregorian calendar only; years 1 to 9999. Minute precision only.
- Timezone rules come from the browser's ICU data (SPEC section 8.7).
- Manual screen-reader and user testing is pending.

## 31. Unsupported scenarios

- Free-form localized text parsing.
- Changing `granularity` after creation.

## 32. TypeScript definitions

```ts
type DateInputValue = PlainDate | Instant;
type DateInputError = 'incomplete' | 'invalid-date' | 'value-missing' | 'range-underflow' | 'range-overflow' | 'nonexistent-time' | 'ambiguous-time';
interface DateInputValidity { readonly valid: boolean; readonly error: DateInputError | null; readonly localTimeStatus: 'exact' | 'ambiguous' | 'nonexistent' | null }
interface DateInputChangeDetail { value: DateInputValue | null; validity: DateInputValidity }
```

## 33. Vanilla JS example

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { DateInput } from '@absoluteui/components/date-input';
import '@absoluteui/components/date-input/style.css';

configureAbsoluteUI({ timezone: 'America/New_York' });
const host = document.querySelector<HTMLElement>('#meeting');
if (host) DateInput.create(host, { label: 'Meeting time', granularity: 'minute', name: 'meeting' });
```

## 34. Angular example

The model value is a `PlainDate` (an `Instant` with `granularity="minute"`) or `null`. Bind it with `[formControl]` or `formControlName`. The component's composition hooks (`formControl`, `trailing`) are not directive inputs.

```ts
import { Component } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainDate, type PlainDate } from '@absoluteui/core';
import { AuiDateInput } from '@absoluteui/angular/date-input';

@Component({
  selector: 'app-applicant',
  imports: [ReactiveFormsModule, AuiDateInput],
  template: `
    <form [formGroup]="applicant">
      <aui-date-input label="Date of birth" [max]="latest" [required]="true" formControlName="birthDate"></aui-date-input>
    </form>`,
})
export class ApplicantComponent {
  readonly latest = plainDate(2026, 9, 27);
  readonly applicant = new FormGroup({ birthDate: new FormControl<PlainDate | null>(null, { validators: [Validators.required] }) });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
