# Time Picker

> Package: `@absoluteui/components/time-picker` | Styles: `@absoluteui/components/time-picker/style.css` | Since 0.2.0 | Status: R1 (adapters: R2)

## 1. Purpose

Entry of a wall-clock time of day. `TimePicker` renders locale-ordered segments (hour, minute, optional second, and a day period for 12-hour clocks) inside a labelled group, plus a "Choose time" button that opens a listbox of suggested times at a fixed step between optional `min` and `max` bounds. The value is a `PlainTime` (SPEC section 8.4): it has no date and no timezone. Validation is localized and a hidden input submits `HH:MM` (or `HH:MM:SS`).

## 2. Anatomy

```text
<div class="aui-field aui-time-picker" data-aui-control>          (consumer host)
  <label class="aui-field__label">Label<span class="aui-field__required" aria-hidden="true">*</span></label>
  <div class="aui-time-picker__group" role="group" aria-labelledby=label>
    <div class="aui-time-picker__fields">                          (LTR-isolated run)
      <input class="aui-time-picker__segment aui-time-picker__segment--hour" aria-label="Hour">
      <span class="aui-time-picker__separator" aria-hidden="true">:</span>
      <input class="aui-time-picker__segment aui-time-picker__segment--minute" aria-label="Minute">
      <input class="aui-time-picker__segment aui-time-picker__segment--dayPeriod" aria-label="AM/PM">   (12-hour)
    </div>
    <button class="aui-time-picker__button" aria-haspopup="listbox" aria-expanded aria-controls=listbox>
  </div>
  <div class="aui-field__description">                             (optional)
  <div class="aui-field__error aui-validation-message">            (when shown)
  <input type="hidden" name>
  <div class="aui-time-picker__popup" popover="manual">            (top layer when open)
    <div class="aui-time-picker__listbox" role="listbox" tabindex="0" aria-activedescendant>
      <div class="aui-time-picker__option" role="option" aria-selected>9:00 AM</div> ...
    </div>
    <div class="aui-time-picker__empty">                           (no suggestion fits)
  </div>
</div>
```

## 3. When to use

- A time of day that is not tied to a date or a timezone: opening hours, a daily reminder, a recurring meeting time.
- The time part of a composite date-time entry, combined with a date and a zone by consumer code or a date-time picker.
- Users should be able to type a time quickly and also pick from common times (for example every 30 minutes).

## 4. When not to use

- An exact moment (an instant): use Date Input with minute granularity, which resolves the wall-clock time in an explicit timezone.
- Durations such as 1 h 30 min: use Number Input or a duration field.
- A few fixed slots that should stay visible: use Radio Group or Select.
- A range that crosses midnight in one control: use two pickers and a cross-field rule.

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Consumer host; its children are owned by the component. |
| `group` | `HTMLDivElement` | The labelled `role="group"`; control boundary and popup anchor. |
| `button` | `HTMLButtonElement` | Opens the suggestions listbox. |
| `listbox` | `HTMLDivElement` | The suggestions listbox. |
| `value` | `PlainTime \| null` | Current value; `null` when empty, incomplete, or failing a built-in check. |
| `validity` | `TimePickerValidity` | `{ valid, error, message }`, recomputed on every change. |
| `isOpen` | `boolean` | Whether the listbox is shown. |
| `name` | `string \| null` | Form field name. |
| `label` | `string` | Label text. |
| `disabled` | `boolean` | Disabled state. |
| `dirty` | `boolean` | Value differs from the initial value, or a partial entry exists. |
| `touched` | `boolean` | Focus has left the control at least once. |
| `options` | `Readonly<TimePickerOptions>` | Current options. |

Options: `label` (required), `hideLabel`, `value`, `min`, `max`, `name`, `description`, `required`, `disabled`, `readOnly`, `validate`, and `icons`. Full table: `metadata/time-picker/api.json`.

| Global option | Type | Default | Mutability |
|---|---|---|---|
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | dynamic |
| `granularity` | `'minute' \| 'second'` | `'minute'` | init-only |
| `hourCycle` | `'auto' \| 'h12' \| 'h23'` | `'auto'` | dynamic |
| `step` | integer 1..720 (minutes) | `30` | dynamic |
| `locale` (inherited) | BCP 47 | `'en-US'` | dynamic |
| `direction` (inherited) | `'ltr' \| 'rtl'` | `'ltr'` | dynamic |

## 6. Methods

| Method | Description |
|---|---|
| `TimePicker.create(host, options)` | Render into `host` (children are replaced). Throws on invalid options before rendering. |
| `setValue(value)` | Programmatic value; no events. Clears an external custom error. |
| `update(options)` | Merge and apply options. Changing `granularity` throws `CFG_INIT_ONLY`. |
| `open()` | Show the listbox and move focus into it; the option nearest the value (or the first) becomes active. |
| `close()` | Hide the listbox without changing the value; focus inside it returns to the button. |
| `reportValidity()` | Show messages now and return whether the value is valid. |
| `setCustomError(message)` | External error, for example from the server; cleared when the user edits. `null` clears it. |
| `getFormValue()` | `HH:MM` (`HH:MM:SS` at second granularity), or `null`. |
| `focus()` | Focus the first segment. |
| `reset()` | Close, restore the initial value, and clear dirty, touched, and submitted state. |
| `destroy()` | Close, remove rendering, listeners, form registration, and subscriptions. |

## 7. Events

| Event | Detail | Bubbles | Description |
|---|---|---|---|
| `aui-change` | `{ value, validity }` | Yes | The user changed the value or its validity (typing, stepping, or choosing a suggestion). |
| `aui-open` | `null` | No | The listbox opened. |
| `aui-close` | `null` | No | The listbox closed. |

Programmatic changes (`setValue`, `update`, `reset`) emit no `aui-change`.

## 8. Slots/content areas

None. Label, help text, and messages are text options; suggestions are generated from `min`, `max`, and `step`.

## 9. CSS parts/hooks

| Class | Purpose |
|---|---|
| `aui-field`, `aui-time-picker` | Host. |
| `aui-time-picker--invalid`, `--disabled`, `--readonly` | Host state modifiers. |
| `aui-field__label`, `__required`, `__description`, `__error` | Shared field chrome. |
| `aui-time-picker__group` | Labelled group; shows the focus indicator. |
| `aui-time-picker__fields` | LTR-isolated run of segments. |
| `aui-time-picker__segment`, `--hour`, `--minute`, `--second`, `--dayPeriod` | Segment inputs. |
| `aui-time-picker__separator` | Locale separator text. |
| `aui-time-picker__button` | Choose time button. |
| `aui-time-picker__popup`, `__listbox`, `__option`, `__option--active`, `__empty` | Suggestions popup. |

All rules live in the `aui.components` cascade layer.

## 10. Design tokens

See `metadata/time-picker/tokens.json` (verified against the stylesheet in CI). Key tokens: `color-surface`, `color-border-strong`, `color-focus-ring`, `color-selected`, `color-selected-text`, `color-error-fg`, `color-surface-sunken`, `color-hover`, `control-height-md`, `popover-max-height`, `shadow-md`, `radius-md`.

## 11. States

default, segment focused, filled, incomplete, open, option active, option selected, disabled, read-only, required, invalid (message shown).

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| empty | user types part of a time | dirty, `incomplete`; message shown only with `validationTiming: 'input'` |
| incomplete | last segment filled | valid, or `invalid` / `range-underflow` / `range-overflow`; `aui-change` |
| closed | button, Alt+ArrowDown, or `open()` | open; focus in the listbox; `aui-open` |
| open | Enter, Space, or click on an option | closed; value set; focus on the first segment; `aui-close`, then `aui-change` if changed |
| open | Escape or button | closed; value kept; focus on the button |
| open | Tab, Shift+Tab, or a click outside | closed; focus moves on |
| any | focus leaves the host | touched; messages shown (`blur` timing) |
| any | `reportValidity()` (for example on form submit) | submitted; messages shown for every timing |
| invalid (custom error) | user edits | custom error cleared, validity recomputed |
| any | `reset()` | initial value; pristine, untouched, closed |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Digits | Numeric segment | Enter digits; advance when full or when no further digit could be valid (for example 7 in a 24-hour hour). |
| A / P, or the localized day period | Day-period segment | Set AM or PM and advance. |
| `:` `.` `,` `-` `/` Space | Numeric segment | Pad a single digit and advance. |
| ArrowUp / ArrowDown | Segment | Increment or decrement with wrap (hours 1-12 or 0-23; minutes and seconds 0-59); toggle AM/PM. |
| ArrowLeft / ArrowRight | Caret at the segment edge | Previous or next segment in visual order. |
| Backspace | Empty segment | Previous segment. |
| Alt+ArrowDown | Segment | Open the listbox. |
| Enter / Space | Button | Open (or close) the listbox. |
| ArrowDown / ArrowUp | Listbox | Move the active option (no wrap). |
| Home / End | Listbox | First / last option. |
| PageDown / PageUp | Listbox | Move by 10 options. |
| Printable characters | Listbox | Typeahead on option labels; Space continues a query in progress. |
| Enter / Space | Listbox | Select the active option, close, focus the first segment. |
| Escape | Listbox | Close without changing the value; focus the button. A surrounding Dialog stays open. |
| Tab / Shift+Tab | Listbox | Close without selecting; focus moves on. |
| Tab / Shift+Tab | Group | Move through the segments, then the button. |

## 14. ARIA contract

- The group is `role="group"` with `aria-labelledby` pointing at the label, and `aria-describedby` listing the help text and the visible error.
- Each segment is a native text input with a localized `aria-label`, `inputmode="numeric"` (text for the day period), and `aria-invalid="true"` only while an error is shown.
- The button has a constant localized name ("Choose time"), `aria-haspopup="listbox"`, `aria-expanded`, and `aria-controls`.
- The listbox has `aria-labelledby` (the label) and `aria-activedescendant` while open; options carry `aria-selected`.

## 15. Accessibility notes

- DOM focus moves into the listbox on open (APG listbox popup). The active option has a visible outline that does not rely on color alone and is centered into view on open.
- Focus is moved before the popup hides, so it never falls to the document body.
- Moving between segments does not count as leaving the field; errors appear after the whole control loses focus (SPEC section 16.1).
- The required asterisk is `aria-hidden`; each segment carries the native `required` state.
- Manual screen-reader verification is pending (see Known limitations).

## 16. Responsive behavior

The group hugs its segments and button, up to 100% of the container; segments wrap inside the group in very narrow containers. The listbox is at least as wide as the group, flips above when space below is insufficient, and caps its height to the available space.

## 17. RTL behavior

Segment order comes from the locale's Intl pattern. Segments render as an LTR-isolated run in every direction, because times read left to right; ArrowLeft and ArrowRight therefore follow that visual order and are not mirrored (Date Input mirrors them). The button sits at the inline end, and the listbox aligns to the inline start of the group using `direction`.

## 18. Theme behavior

Colors come from role tokens only. The focused segment uses the `color-selected` / `color-selected-text` pair. In forced-colors mode the focused segment and the selected option use `Highlight` / `HighlightText`, and the active option outline uses `Highlight`.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { timePicker: { hourCycle: 'h23', step: 15, validationTiming: 'submit' } } });
```

Dynamic options apply to existing instances immediately; a locale or hour-cycle change rebuilds the segments and keeps the value.

## 20. Component configuration support

Instance options override global and theme defaults (SPEC section 6.3). `granularity` is init-only; all other options are dynamic.

## 21. Timezone behavior

Not timezone-bound. The value is a `PlainTime`: a wall-clock time of day with no date and no zone (SPEC section 8.4). Formatting uses only the locale and hour cycle, and the component never reads the host machine's timezone, so the same value shows the same time everywhere. Daylight-saving gaps and overlaps do not exist for a `PlainTime`; they only appear once a date and a zone are attached. Combining a time with a date and a timezone (and applying the DST disambiguation policy, SPEC section 8.5) is the job of a DateTime Picker or consumer code, for example `toInstant(plainDateTime(date, time), zone, disambiguation)`.

## 22. Icon customization points

`icons.time` (default `clock`) for the button and `icons.error` (default `alert-circle`) for the validation message.

## 23. Security behavior

All text uses `textContent`. Validation messages never include the entered value; range messages include only the configured bounds (SPEC section 14.4). CSP-safe: no inline styles or HTML; positioning writes styles through the CSSOM.

## 24. Data handling behavior

No persistence, network access, or telemetry. When `name` is set, a hidden input carries `HH:MM` (`HH:MM:SS` at second granularity); it is empty while the entry is empty or invalid, and disabled (not submitted) while the picker is disabled.

## 25. Performance characteristics

Suggestions are built only when the listbox opens. Listeners are delegated: segment keyboard and input handling share one listener each on the segment container. One configuration subscription per instance. Budget: `open()` with `step: 1` (1,440 suggestions) under 100 ms in headless Chromium.

## 26. Supported data scale

Up to 1,440 suggestions (step 1 over a whole day), covered by the unit test.

## 27. Usage examples

```ts
import { plainTime } from '@absoluteui/core';
import { TimePicker } from '@absoluteui/components/time-picker';

const host = document.createElement('div');
document.body.append(host);
TimePicker.create(host, { label: 'Opening time', name: 'opensAt', required: true, min: plainTime(6, 0), max: plainTime(22, 0), step: 15 });
```

More examples, type-checked in CI: `metadata/time-picker/examples.json`.

## 28. Edge cases

- `12:xx AM` is `00:xx`, and `12:xx PM` is `12:xx`.
- Typing `29` in a 24-hour hour, or `00` or `13` in a 12-hour hour, reports `invalid`.
- `min: 09:14:30` at minute granularity starts the suggestions at 09:15, so a chosen suggestion is never below `min`.
- If no suggestion fits between `min` and `max`, the listbox shows "No times available".
- Typed values do not have to align with `step`; the step only shapes the suggestions.
- When there is no value, the first suggestion is active on open; the current clock time is not used, because the value has no zone.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `TIME_PICKER_OPTIONS` | configuration | Missing label, `min` after `max`, a bound or value that is not a `PlainTime`, a value with seconds at minute granularity or with milliseconds, or a non-function `validate`. |
| `CFG_INVALID_VALUE` | configuration | Invalid `step`, `hourCycle`, `granularity`, `validationTiming`, `locale`, or `direction` (reported by the configuration engine). |
| `CFG_INIT_ONLY` | configuration | `update()` changes `granularity`. |
| Validation (`validity.error`) | validation | `incomplete`, `invalid`, `value-missing`, `range-underflow`, `range-overflow`, `custom`. |

A failed construction leaves no rendering, listeners, or subscriptions behind.

## 30. Known limitations

- Ranges that cross midnight (`min` after `max`) are not supported.
- Only ASCII digits are accepted in segments.
- Day periods whose localized forms share a first character (for example Korean 오전/오후) need the full text, Latin a/p, or ArrowUp/ArrowDown.
- Suggestions are not virtualized (maximum 1,440).
- Milliseconds are not supported.
- Screen-reader behavior has not yet been manually verified with NVDA, JAWS, VoiceOver, and TalkBack.

## 31. Unsupported scenarios

- HTML in the label, help text, options, or messages.
- Timezone conversion or DST handling (the value has no zone).
- Custom suggestion lists or individually disabled suggestions.

## 32. TypeScript definitions

```ts
type TimePickerGranularity = 'minute' | 'second';
type TimePickerHourCycle = 'auto' | 'h12' | 'h23';
type TimePickerError = 'incomplete' | 'invalid' | 'value-missing' | 'range-underflow' | 'range-overflow' | 'custom';
interface TimePickerValidity { readonly valid: boolean; readonly error: TimePickerError | null; readonly message: string }
interface TimePickerChangeDetail { value: PlainTime | null; validity: TimePickerValidity }
interface TimePickerIcons { time: IconRef; error: IconRef }
```

## 33. Vanilla JS example

```ts
import { plainTimeToString } from '@absoluteui/core';
import { TimePicker, type TimePickerChangeDetail } from '@absoluteui/components/time-picker';
import '@absoluteui/components/time-picker/style.css';

const host = document.querySelector<HTMLElement>('#reminder');
if (host) {
  TimePicker.create(host, { label: 'Daily reminder', name: 'reminder', step: 15 });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<TimePickerChangeDetail>).detail;
    host.dataset.time = value ? plainTimeToString(value) : '';
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { plainTime, type PlainTime } from '@absoluteui/core';
import { AuiTimePicker } from '@absoluteui/angular/time-picker';

@Component({
  selector: 'app-opening-hours',
  imports: [ReactiveFormsModule, AuiTimePicker],
  template: `<aui-time-picker label="Opening time" [min]="min" [step]="15" [required]="true" [formControl]="opensAt"></aui-time-picker>`,
})
export class OpeningHoursComponent {
  readonly min = plainTime(6, 0);
  readonly opensAt = new FormControl<PlainTime | null>(null, { validators: [Validators.required] });
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
