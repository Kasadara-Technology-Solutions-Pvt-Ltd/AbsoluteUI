# Recurrence Picker

> Package: `@absoluteui/components/recurrence-picker` | Styles: `@absoluteui/components/date-input/style.css`, `@absoluteui/components/calendar/style.css`, `@absoluteui/components/date-picker/style.css`, and `@absoluteui/components/recurrence-picker/style.css` | Since 0.6.0 | Status: R3

## 1. Purpose

Edits how something repeats. The value is a `RecurrenceRule` from `@absoluteui/core`: the RFC 5545 RRULE subset FREQ (daily, weekly, monthly, yearly), INTERVAL, COUNT, UNTIL, BYDAY (with ordinals for monthly and yearly), BYMONTHDAY, BYMONTH, BYSETPOS, and WKST, plus EXDATE and RDATE lists. Unsupported parts are refused by the core parser, never ignored.

The picker is a labelled fieldset of native controls: a frequency select ("Does not repeat", Daily, Weekly, Monthly, Yearly), an interval, weekday toggle buttons, day-of-month or nth-weekday choices (with a month for yearly rules), and the end (never, on a date through an embedded Date Picker, or after a number of occurrences). A live summary describes the rule ("Every 2 weeks on Monday and Wednesday, until Dec 31, 2026"), and with a `start` the next occurrences are listed in the timezone. The form value is iCalendar text.

Core helpers for rules: `recurrenceRule`, `parseRecurrenceRule`, `recurrenceRuleToString`, `expandRecurrence`, `describeRecurrence`.

## 2. Anatomy

```text
<div class="aui-field aui-recurrence-picker [--invalid] [--disabled]">                (consumer host)
  <fieldset class="aui-recurrence-picker__fieldset" aria-describedby="{help} {error} {summary}">
    <legend class="aui-field__label">Repeat</legend>
    <div class="aui-recurrence-picker__row --frequency"><label>Repeats</label><select class="…__frequency">
    <div class="aui-recurrence-picker__row --interval"><label>Every</label><input type="number" class="…__number"><span class="…__unit">weeks</span>
    <div class="aui-recurrence-picker__row --weekdays" role="group" aria-label="Repeat on">
      <button class="aui-recurrence-picker__weekday" aria-pressed="true" aria-label="Monday">M</button>...
    <fieldset class="aui-recurrence-picker__row --month"><legend>Repeat on</legend>
      <div class="…__choice"><label><input type="radio"> On day</label> [month select] <select aria-label="Day of month">
      <div class="…__choice"><label><input type="radio"> On the</label> <select aria-label="Week of the month"> <select aria-label="Weekday"> [month select]
    <fieldset class="aui-recurrence-picker__row --end"><legend>Ends</legend>
      Never | On a date [Date Picker "End date"] | After [number] occurrences
    <p class="aui-recurrence-picker__summary" aria-live="polite">Every week on Tuesday</p>
    <div class="aui-recurrence-picker__preview"><p>Next occurrences</p><ul>...
  <div class="aui-field__description"> <div class="aui-field__error"> <input type="hidden" name="...">
```

## 3. When to use

- Repeating meetings, reminders, reports, maintenance windows, or billing cycles.
- Inside an event editor next to a start and an end (Schedule Picker embeds it with `recurrence: true`).

## 4. When not to use

- One-off dates: Date Picker, or Schedule Picker without recurrence.
- Hourly or minute repetition: not in the rule subset.
- Arbitrary date lists: store RDATE values in code.

## 5. Public properties

| Option | Type | Default | Notes |
|---|---|---|---|
| `label` | `string` | required | Legend. |
| `hideLabel` | `boolean` | `false` | |
| `value` | `RecurrenceRule \| null` | `null` | Null: does not repeat. Kept exactly until the user edits. |
| `start` | `PlainDate \| PlainDateTime \| null` | - | Defaults, minimum end date, preview. |
| `frequencies` | `RecurrenceFrequency[]` | all four | |
| `maxInterval` / `maxCount` | `number` | `99` / `999` | |
| `name`, `description`, `required`, `disabled` | | | Form field basics; `required` rejects "Does not repeat". |
| `firstDayOfWeek` | `IsoWeekday` | locale | Order of the weekday toggles. |
| `validate` | `(value) => string \| null` | - | After built-in checks. |
| `formControl` | `boolean` | `true` | Advanced, init-only. |
| `icons` | `{ error }` | `alert-circle` | |
| `validationTiming` | `'blur' \| 'input' \| 'submit'` | `'blur'` | Global. |
| `previewCount` | `number` | `5` | Global. 0-20. |
| `locale`, `timezone`, `disambiguation`, `direction` | | common | Inherited. |

Controller properties: `host`, `fieldset`, `untilPicker`, `value`, `validity`, `summary`, `name`, `label`, `disabled`, `dirty`, `touched`, `options`.

## 6. Methods

| Method | Description |
|---|---|
| `RecurrencePicker.create(host, options)` | Validate and render. |
| `setValue(rule \| null)` | Programmatic value (no events). |
| `update(options)` | Merge options. |
| `reportValidity()` / `setCustomError(message)` | Form contract. |
| `getFormValue()` | iCalendar text or null. |
| `focus()` / `reset()` / `destroy()` | |

## 7. Events

| Event | Detail | Notes |
|---|---|---|
| `aui-change` | `RecurrencePickerChangeDetail { value; validity }` | User edits (including the end date). The inner Date Picker's own `aui-change` does not bubble past the picker. |

## 8. Slots/content areas

None.

## 9. CSS parts/hooks

| Class | Part |
|---|---|
| `aui-field aui-recurrence-picker`, `--invalid`, `--disabled` | Host |
| `aui-recurrence-picker__fieldset`, `__row` (`--frequency`, `--interval`, `--weekdays`, `--month`, `--end`) | Structure |
| `aui-recurrence-picker__select` (`--month-day`, `--nth`, `--weekday`, `--month`), `__frequency`, `__number`, `__unit` | Controls |
| `aui-recurrence-picker__weekday` | Weekday toggles |
| `aui-recurrence-picker__choice`, `__radio`, `__radio-label`, `__legend`, `__label`, `__until` | Choices |
| `aui-recurrence-picker__summary`, `__preview`, `__preview-heading`, `__preview-list` | Summary and preview |

## 10. Design tokens

See `metadata/recurrence-picker/tokens.json`. Key tokens: control surface tokens (`color-surface`, `color-border-strong`, `radius-md`, `control-height-md`), `color-primary` and `color-on-primary` (pressed weekdays), `color-focus-ring`, `color-text-muted` (units, preview).

## 11. States

Does not repeat, daily, weekly, monthly, yearly, custom (a rule the controls cannot show), disabled, required, invalid.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| does not repeat | frequency select | that frequency with defaults from `start` (weekday, day, month) |
| any frequency | weekday toggle, interval, radios, selects | new rule; summary and preview update; `aui-change` |
| custom | another frequency | a rule built from the controls (custom is dropped) |
| end never | "On a date" + date / "After" + count | UNTIL / COUNT |
| any | invalid interval, count, date, or no weekday | invalid (value null) |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| Tab / Shift+Tab | Picker | Through the visible controls in order. |
| Space / Enter | Weekday toggle | Toggle the day. |
| Arrow keys | Radio groups | Choose (native). |
| ArrowUp / ArrowDown | Interval, count | Step (native number input). |
| Date Picker keys | End date | As Date Picker. |

## 14. ARIA contract

- The fieldset is named by its legend and described by help text, the error, and the summary.
- Weekday toggles are buttons with `aria-pressed` and full weekday names, in a group named "Repeat on".
- Monthly/yearly and end choices are native radio groups in nested fieldsets; inline selects have names ("Day of month", "Week of the month", "Weekday", "Month").
- The summary is `aria-live="polite"`; `aria-invalid` marks the interval or count while their error is shown.

## 15. Accessibility notes

- Controls are native, so browser and assistive-technology support is broad.
- Pressed weekdays differ by fill and border weight, not color alone.
- Manual screen-reader verification (NVDA, JAWS, VoiceOver) is pending.

## 16. Responsive behavior

Rows wrap; each radio keeps its inline controls on one line when they fit. Reflows at 320 px. Weekday toggles meet the 44 px target size.

## 17. RTL behavior

Follows `direction`; controls flow right to left; the embedded Date Picker mirrors.

## 18. Theme behavior

Shared control surface for selects and numbers, primary fill for pressed weekdays, muted text for units and the preview. Forced colors: Highlight for pressed days, GrayText for disabled.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { recurrencePicker: { previewCount: 8, validationTiming: 'input' } } });
```

Global options: `validationTiming`, `previewCount`, plus inherited `locale`, `timezone`, `disambiguation`, `direction`.

## 20. Component configuration support

Instance options override global and theme defaults; `formControl` is init-only; everything else is dynamic.

## 21. Timezone behavior

A rule has no start or zone. With a timed `start` (`PlainDateTime`, read in `timezone`), the preview expands occurrences at the start's wall-clock time in that zone across DST changes (a start in a skipped hour moves forward by the gap, the RFC 5545 rule); an end date becomes `UNTIL` at the last second of that day in the timezone, as UTC (`UNTIL=20261031T235959Z`), as RFC 5545 requires for zoned starts. With an all-day start (`PlainDate`), UNTIL stays a date. Without `timezone`, the configured timezone (UTC by default) is used.

## 22. Icon customization points

`error` (`alert-circle`). The embedded Date Picker uses its own `calendar` icon.

## 23. Security behavior

All text through `textContent`; options come from Intl and messages. The form value is core serialization output.

## 24. Data handling behavior

No persistence or network access. One hidden input carries the iCalendar text (`RRULE:...` plus `EXDATE`/`RDATE` lines, `\n`-separated); radios have no form owner, so nothing else is submitted.

## 25. Performance characteristics

About 60 native elements per instance; previews expand at most 20 occurrences. Budget (e2e): create with a start and a 5-occurrence preview < 15 ms per instance.

## 26. Supported data scale

One rule per instance.

## 27. Usage examples

See section 33 and `metadata/recurrence-picker/examples.json`: weekly with preview, editing existing text, global configuration.

## 28. Edge cases

- Monthly "on day 31" skips shorter months (RFC 5545: invalid dates are skipped); "last day" (`BYMONTHDAY=-1`) covers every month.
- Yearly on 29 February occurs in leap years only.
- A start that is the fifth weekday of its month defaults to "the fifth"; choose "last" for months with four.
- Removing every weekday of a weekly rule is invalid ("Choose at least one day.").
- An existing COUNT and UNTIL together are refused by the core (RFC 5545).
- EXDATE/RDATE and WKST of the value survive edits.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `RECURRENCE_PICKER_OPTIONS` | configuration | Empty label, invalid value, start, frequencies, bounds, firstDayOfWeek, callbacks, or config. |
| `RECURRENCE_INVALID` | validation | `recurrenceRule()` with contradictory or out-of-range parts. |
| `RECURRENCE_EXPAND` | validation | `expandRecurrence()` with bounds of the wrong kind or an invalid limit. |

Validation errors in the UI: `value-missing`, `bad-interval`, `no-weekday`, `bad-count`, `no-until`, `bad-until`, `custom`.

## 30. Known limitations

- One day of month or one nth weekday per month in the controls; other rules show as "Custom".
- No hourly or minute frequencies; EXDATE/RDATE are not edited here.
- The end is a date, not a time.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- BYWEEKNO, BYYEARDAY, BYHOUR, BYMINUTE, BYSECOND, RSCALE.
- `TZID` or UTC values in EXDATE/RDATE text (floating local and `VALUE=DATE` only).

## 32. TypeScript definitions

```ts
type RecurrenceFrequency = 'daily' | 'weekly' | 'monthly' | 'yearly';
interface RecurrenceWeekday { weekday: IsoWeekday; nth?: number }
interface RecurrenceRule { kind: 'RecurrenceRule'; frequency: RecurrenceFrequency; interval: number; count: number | null; until: PlainDate | PlainDateTime | Instant | null; byDay: readonly RecurrenceWeekday[]; byMonthDay: readonly number[]; byMonth: readonly number[]; bySetPos: readonly number[]; weekStart: IsoWeekday; exclusions: readonly (PlainDate | PlainDateTime)[]; inclusions: readonly (PlainDate | PlainDateTime)[] }
type RecurrencePickerError = 'value-missing' | 'bad-interval' | 'no-weekday' | 'bad-count' | 'no-until' | 'bad-until' | 'custom';
interface RecurrencePickerValidity { valid: boolean; error: RecurrencePickerError | null; message: string }
interface RecurrencePickerChangeDetail { value: RecurrenceRule | null; validity: RecurrencePickerValidity }
```

## 33. Vanilla JS example

```ts
import { plainDate, plainDateTime, plainTime } from '@absoluteui/core';
import { RecurrencePicker, type RecurrencePickerChangeDetail } from '@absoluteui/components/recurrence-picker';
import '@absoluteui/components/date-input/style.css';
import '@absoluteui/components/calendar/style.css';
import '@absoluteui/components/date-picker/style.css';
import '@absoluteui/components/recurrence-picker/style.css';

const host = document.querySelector<HTMLElement>('#repeat');
if (host) {
  const picker = RecurrencePicker.create(host, { label: 'Repeat', name: 'rrule', start: plainDateTime(plainDate(2026, 9, 29), plainTime(9)), timezone: 'Europe/London' });
  host.addEventListener('aui-change', (event) => {
    const { validity } = (event as CustomEvent<RecurrencePickerChangeDetail>).detail;
    host.dataset.valid = String(validity.valid);
    host.title = picker.summary;
  });
}
```

## 34. Angular example

`auiRecurrencePicker` is generated with `ControlValueAccessor` and `Validator` (the model is `RecurrenceRule | null`); `formControl` is not an input.

```ts
import { Component } from '@angular/core';
import { FormControl, ReactiveFormsModule } from '@angular/forms';
import { parseRecurrenceRule, plainDate, type RecurrenceRule } from '@absoluteui/core';
import { AuiRecurrencePicker } from '@absoluteui/angular/recurrence-picker';

@Component({
  selector: 'app-repeat',
  imports: [ReactiveFormsModule, AuiRecurrencePicker],
  template: `<aui-recurrence-picker label="Repeat" [start]="start" [formControl]="rule"></aui-recurrence-picker>`,
})
export class RepeatComponent {
  readonly start = plainDate(2026, 9, 29);
  readonly rule = new FormControl<RecurrenceRule | null>(parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TU'));
}
```

## 35. React example

```tsx
import { useState } from 'react';
import { plainDate, recurrenceRuleToString, type RecurrenceRule } from '@absoluteui/core';
import { AuiRecurrencePicker } from '@absoluteui/react/recurrence-picker';

export function Repeat() {
  const [rule, setRule] = useState<RecurrenceRule | null>(null);
  return (
    <>
      <AuiRecurrencePicker label="Repeat" start={plainDate(2026, 9, 29)} value={rule} onValueChange={setRule} />
      <output>{rule ? recurrenceRuleToString(rule) : 'Does not repeat'}</output>
    </>
  );
}
```

See [docs/REACT.md](../../../docs/REACT.md). Load the stylesheets listed in the header of this document.

## 36. Vue example

```vue
<script setup lang="ts">
import { ref } from 'vue';
import { plainDate, type RecurrenceRule } from '@absoluteui/core';
import { AuiRecurrencePicker } from '@absoluteui/vue/recurrence-picker';

const rule = ref<RecurrenceRule | null>(null);
const start = plainDate(2026, 9, 29);
</script>

<template>
  <AuiRecurrencePicker v-model="rule" label="Repeat" :start="start" />
</template>
```

See [docs/VUE.md](../../../docs/VUE.md).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
