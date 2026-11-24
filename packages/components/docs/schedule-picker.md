# Schedule Picker

> Package: `@absoluteui/components/schedule-picker` | Styles: `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, `@absoluteui/components/date-picker/style.css`, `@absoluteui/components/date-time-picker/style.css`, `@absoluteui/components/recurrence-picker/style.css` (with `recurrence`), and `@absoluteui/components/schedule-picker/style.css` | Since 0.6.0 | Status: R3

## 1. Purpose

Chooses when something happens, in one form control: start and end, all-day or timed, in a timezone, optionally repeating. Timed schedules use two DateTime Pickers (instants whose wall-clock times are read in the schedule's timezone); all-day schedules use two Date Pickers (inclusive days). An optional timezone select re-reads the entered times in another zone; an optional Recurrence Picker (`recurrence: true`) edits the repetition with the schedule start as its series start.

Moving the start keeps the duration. The value is a `ScheduleValue`; the form value is iCalendar text (`DTSTART`, `DTEND`, `RRULE`, `EXDATE`), with `scheduleToString` and `parseSchedule` to convert.

## 2. Anatomy

```text
<div class="aui-field aui-schedule-picker [--all-day] [--invalid] [--disabled]">      (consumer host)
  <fieldset class="aui-schedule-picker__fieldset" aria-describedby="{help} {error} {duration}">
    <legend class="aui-field__label">When</legend>
    <div class="aui-schedule-picker__range">
      <div class="aui-schedule-picker__part --start">      DateTime Picker "Starts"
      <div class="aui-schedule-picker__part --start-date" hidden> Date Picker "Start date"
      <div class="aui-schedule-picker__part --end">        DateTime Picker "Ends"
      <div class="aui-schedule-picker__part --end-date" hidden>   Date Picker "End date"
    <p class="aui-schedule-picker__duration">Duration: 1 hr, 30 min</p>
    <div class="aui-schedule-picker__row"><label class="…__check"><input type="checkbox" class="…__checkbox"> All day</label>
    <div class="aui-schedule-picker__row --zone"><label>Time zone</label><select class="…__select">
    <div class="aui-schedule-picker__recurrence">          Recurrence Picker "Repeat" (with recurrence)
  <div class="aui-field__description"> <div class="aui-field__error"> <input type="hidden" name="...">
```

## 3. When to use

- Event, meeting, booking, or maintenance-window editors.
- Anything with a start, an end, and possibly a repetition, where timezones matter.

## 4. When not to use

- A single moment: DateTime Picker.
- A range of dates without times: Date Range Picker.
- A length without a start: Duration Picker.

## 5. Public properties

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Legend. |
| `hideLabel` | `boolean` | `false` | |
| `value` | `ScheduleValue \| null` | `null` | See section 32. |
| `allowAllDay` | `boolean` | `true` | Shows the checkbox. |
| `timeZones` | `string[]` | - | Timezone select; omitted: no select. |
| `recurrence` | `boolean` | `false` | Init-only. |
| `name`, `description`, `required`, `disabled` | | | Form field basics. |
| `firstDayOfWeek` | `IsoWeekday` | locale | Calendars and weekday toggles. |
| `validate` | `(value) => string \| null` | - | After built-in checks. |
| `icons` | `{ error }` | `alert-circle` | |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Global. |
| `defaultDuration` | `number` | `60` | Global. Minutes after switching off all-day. |
| `locale`, `timezone`, `disambiguation`, `direction` | | common | Inherited. |

Controller properties: `host`, `fieldset`, `startPicker`, `endPicker`, `startDatePicker`, `endDatePicker`, `recurrencePicker`, `value`, `validity`, `timeZone`, `name`, `label`, `disabled`, `dirty`, `touched`, `options`.

## 6. Methods

| Method | Description |
|---|---|
| `SchedulePicker.create(host, options)` | Validate and render. |
| `setValue(value \| null)` | Programmatic value (no events). |
| `update(options)` | Merge options (`recurrence` cannot change). |
| `reportValidity()`, `setCustomError()`, `getFormValue()`, `focus()`, `reset()`, `destroy()` | Form contract. |
| `scheduleToString(value)` | iCalendar text. |
| `parseSchedule(text, disambiguation?)` | Back to a value, or null. |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-change` | `SchedulePickerChangeDetail { value; validity }` | Any user edit; inner pickers' events stop at the schedule picker. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-field aui-schedule-picker`, `--all-day`, `--invalid`, `--disabled` | Host |
| `aui-schedule-picker__fieldset`, `__range`, `__part` (`--start`, `--end`, `--start-date`, `--end-date`) | Structure |
| `aui-schedule-picker__duration` | Duration text |
| `aui-schedule-picker__row`, `--zone`, `__check`, `__checkbox`, `__label`, `__select` | All day and timezone |
| `aui-schedule-picker__recurrence` | Recurrence host |

## 10. Design tokens

See `metadata/schedule-picker/tokens.json`. Key tokens: control surface tokens for the select, `color-primary` (checkbox accent), `color-text-muted` (duration), `color-border` (recurrence separator).

## 11. States

Timed, all-day, with timezone select, with recurrence, incomplete, end before start, disabled, required, invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| timed | start changed | end moves by the same amount |
| timed | end changed | new duration (kept for later start changes) |
| timed | all day checked | days of the start and of the last moment |
| all-day | all day unchecked | previous start time (09:00 by default) and duration |
| any | timezone select | same wall-clock times in the new zone |
| any | one part empty, end not after start, inner or recurrence error | invalid (value null) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Picker | Start (segments, calendar button), end, all day, timezone, recurrence. |
| Picker keys | Start / end | As DateTime Picker and Date Picker. |
| Space | All day | Toggle. |
| Arrow keys | Timezone | Native select. |

## 14. ARIA contract

- The fieldset is named by its legend and described by help, error, and the duration text.
- Inner pickers are labelled "Starts" / "Ends" or "Start date" / "End date"; hidden pickers are removed from the accessibility tree.
- The checkbox and select are native, with visible labels.

## 15. Accessibility notes

- Keeping the duration when the start moves avoids an extra correction step.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

Start and end sit side by side when there is room (auto-fit, 14rem minimum) and stack otherwise; reflows at 320 px.

## 17. RTL behavior

All parts follow `direction`.

## 18. Theme behavior

Inner pickers keep their styles; the timezone select uses the control surface; the recurrence section has a top border. Forced colors follow the inner pickers.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { schedulePicker: { defaultDuration: 30 } } });
```

Global options: `validationTiming`, `defaultDuration`, plus inherited `locale`, `timezone`, `disambiguation`, `direction`.

## 20. Component configuration support

Instance options override global and theme defaults; `recurrence` is init-only.

## 21. Timezone behavior

Timed values are exact `Instant`s plus `timeZone`: the inner pickers show and parse wall-clock times in that zone (the value's zone, else the select, else the `timezone` option; UTC unless configured, SPEC section 8.1) with the DST policy (`disambiguation`, compatible by default, section 8.5). A typed time in a DST gap is reported by the inner Date Input and resolved by the policy. Changing the zone keeps the wall-clock times (09:00 in London becomes 09:00 in New York). All-day values are dates. The recurrence expands in the schedule's zone. In iCalendar text, timed values use `TZID=` and local times; all-day `DTEND` is the day after the last day (RFC 5545), while `ScheduleValue.end` is the last day.

## 22. Icon customization points

`error` (`alert-circle`); inner pickers use their `calendar` icons.

## 23. Security behavior

Text through `textContent`; timezone names from Intl. `parseSchedule` accepts a strict subset and returns null otherwise.

## 24. Data handling behavior

No persistence or network access. One hidden input with the iCalendar text when `name` is set; inner pickers are not form controls.

## 25. Performance characteristics

Creates four inner pickers (two hidden) and, with recurrence, a Recurrence Picker. Budget (e2e): create with recurrence < 30 ms per instance.

## 26. Supported data scale

One schedule per instance.

## 27. Usage examples

See section 33 and `metadata/schedule-picker/examples.json`: meeting with timezone and recurrence, iCalendar round trip, global configuration.

## 28. Edge cases

- An end equal to the start is invalid for timed schedules; for all-day schedules start and end may be the same day.
- A timed end at midnight belongs to the previous day when switching to all-day.
- A value whose `timeZone` is not in `timeZones` is added to the select.
- `parseSchedule` rejects floating times (no TZID or Z) and all-day DTEND on or before DTSTART.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `SCHEDULE_PICKER_OPTIONS` | configuration | Empty label; invalid value (kinds, end, timeZone); invalid `timeZones`, booleans, callbacks, config; changing `recurrence` after creation. |

UI validation errors: `value-missing`, `incomplete`, `invalid-start`, `invalid-end`, `end-before-start`, `recurrence`, `custom`.

## 30. Known limitations

- One timezone for start and end.
- No separate duration field.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- Floating times; several ranges in one value.

## 32. TypeScript definitions

```ts
type ScheduleValue =
  | { allDay: false; start: Instant; end: Instant; timeZone: string; recurrence: RecurrenceRule | null }
  | { allDay: true; start: PlainDate; end: PlainDate; timeZone: string; recurrence: RecurrenceRule | null };
type SchedulePickerError = 'value-missing' | 'incomplete' | 'invalid-start' | 'invalid-end' | 'end-before-start' | 'recurrence' | 'custom';
interface SchedulePickerValidity { valid: boolean; error: SchedulePickerError | null; message: string }
interface SchedulePickerChangeDetail { value: ScheduleValue | null; validity: SchedulePickerValidity }
declare function scheduleToString(value: ScheduleValue): string;
declare function parseSchedule(text: string, disambiguation?: Disambiguation): ScheduleValue | null;
```

## 33. Vanilla JS example

```ts
import { parseInstant } from '@absoluteui/core';
import { SchedulePicker, scheduleToString, type SchedulePickerChangeDetail } from '@absoluteui/components/schedule-picker';
import '@absoluteui/components/date-input/style.css';
import '@absoluteui/components/calendar/style.css';
import '@absoluteui/components/date-picker/style.css';
import '@absoluteui/components/date-time-picker/style.css';
import '@absoluteui/components/recurrence-picker/style.css';
import '@absoluteui/components/schedule-picker/style.css';

const start = parseInstant('2026-09-29T08:00:00Z');
const end = parseInstant('2026-09-29T09:00:00Z');
const host = document.querySelector<HTMLElement>('#when');
if (host && start && end) {
  SchedulePicker.create(host, { label: 'When', name: 'when', recurrence: true, timeZones: ['Europe/London', 'America/New_York'], value: { allDay: false, start, end, timeZone: 'Europe/London', recurrence: null } });
  host.addEventListener('aui-change', (event) => {
    const { value } = (event as CustomEvent<SchedulePickerChangeDetail>).detail;
    host.dataset.ical = value ? scheduleToString(value) : '';
  });
}
```

## 34. Angular example

`auiSchedulePicker` is generated with `ControlValueAccessor` and `Validator` (model `ScheduleValue | null`).

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import type { ScheduleValue } from '@absoluteui/components/schedule-picker';
import { AuiSchedulePicker } from '@absoluteui/angular/schedule-picker';

@Component({
  selector: 'app-when',
  imports: [ReactiveFormsModule, AuiSchedulePicker],
  template: `<aui-schedule-picker label="When" [recurrence]="true" [timeZones]="zones" [formControl]="when"></aui-schedule-picker>`,
})
export class WhenComponent {
  readonly zones = ['Europe/London', 'America/New_York'];
  readonly when = new FormControl<ScheduleValue | null>(null);
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { scheduleToString, type ScheduleValue } from '@absoluteui/components/schedule-picker';
import { AuiSchedulePicker } from '@absoluteui/react/schedule-picker';

export function When() {
  const [value, setValue] = useState<ScheduleValue | null>(null);
  return (
    <>
      <AuiSchedulePicker label="When" recurrence timezone="Europe/London" value={value} onValueChange={setValue} />
      <pre>{value ? scheduleToString(value) : ''}</pre>
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md). Load the stylesheets listed in the header of this document.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import type { ScheduleValue } from '@absoluteui/components/schedule-picker';
import { AuiSchedulePicker } from '@absoluteui/vue/schedule-picker';

const when = ref<ScheduleValue | null>(null);
</script>

<template>
  <AuiSchedulePicker v-model="when" label="When" recurrence timezone="Europe/London" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
