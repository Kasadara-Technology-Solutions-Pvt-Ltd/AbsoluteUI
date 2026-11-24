The engines every component builds on: validated global configuration, date and time zone values, recurrence rules, translated messages, HTML sanitization, and the shared error model. Your application uses the same functions for its own screens. [Configuration](/docs/getting-started/configuration/), [Dates and time zones](/docs/guides/dates-and-time-zones/), and [Internationalization](/docs/guides/internationalization/) cover each area in depth.

### How do I set the locale and time zone for the whole application?

Call `configureAbsoluteUI` once at startup; components already on the page update in place. Each call replaces the whole global layer, so pass every setting you want to keep.

```ts
import { configureAbsoluteUI, getCommonConfig, onConfigChange } from '@absoluteui/core';

let changes = 0;
const stop = onConfigChange(() => {
  changes += 1;
});
configureAbsoluteUI({ common: { locale: 'en-IN', timezone: 'Asia/Kolkata', density: 'compact' } });
[getCommonConfig().timezone, getCommonConfig().density]; // => ['Asia/Kolkata', 'compact']
changes; // => 1
stop();
```

### How do I turn a local shift start into an exact instant?

A shift that starts at 09:00 in Bengaluru is a wall-clock time; `toInstant` fixes it to a moment for storage or APIs. Check `getLocalTimeStatus` where daylight saving can make a local time skip or repeat.

```ts
import { getLocalTimeStatus, instantToString, plainDate, plainDateTime, plainTime, toInstant } from '@absoluteui/core';

const shiftStart = plainDateTime(plainDate(2026, 10, 5), plainTime(9, 0));
instantToString(toInstant(shiftStart, 'Asia/Kolkata')); // => '2026-10-05T03:30:00.000Z'
getLocalTimeStatus(plainDateTime(plainDate(2026, 3, 8), plainTime(2, 30)), 'America/New_York'); // => 'nonexistent'
```

### How do I schedule a job on the last weekday of each month?

Build an RFC 5545 rule with `recurrenceRule`: weekdays only, last position in the month. `expandRecurrence` lists the dates; `describeRecurrence` gives a sentence for the UI.

```ts
import { describeRecurrence, expandRecurrence, plainDate, plainDateToString, recurrenceRule, recurrenceRuleToString } from '@absoluteui/core';

const payroll = recurrenceRule({
  frequency: 'monthly',
  byDay: [{ weekday: 1 }, { weekday: 2 }, { weekday: 3 }, { weekday: 4 }, { weekday: 5 }],
  bySetPos: [-1],
  count: 3,
});
expandRecurrence(payroll, plainDate(2026, 10, 30)).map((o) => (o.start.kind === 'PlainDate' ? plainDateToString(o.start) : null)); // => ['2026-10-30', '2026-11-30', '2026-12-31']
recurrenceRuleToString(payroll); // => 'RRULE:FREQ=MONTHLY;COUNT=3;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1'
describeRecurrence(payroll, { locale: 'en' }); // => 'Every month on Monday, Tuesday, Wednesday, Thursday, and Friday (the last of them), 3 times'
```

A recurrence rule knows weekdays, not holidays. For payroll on the last **working** day, ask a business calendar, which also knows the company's holidays (see [Business calendars](/docs/guides/business-calendars/)):

```ts
import { createBusinessCalendar, fixedHoliday, lastBusinessDayOfMonth } from '@absoluteui/helpers/business-calendar';

const company = createBusinessCalendar({ holidays: [fixedHoliday('Year-end closure', 12, 31)] });
lastBusinessDayOfMonth(2026, 12, company); // => '2026-12-30' // the rule above gives 2026-12-31
lastBusinessDayOfMonth(2026, 10, company); // => '2026-10-30'
```

### How do I translate my own application's messages?

Register a catalog per locale under your own namespace. `getMessage` falls back from region to language to English and fills `{name}` placeholders.

```ts
import { getMessage, registerMessages } from '@absoluteui/core';

registerMessages('leave', 'en', { submitted: 'Leave request {id} submitted for approval.' });
registerMessages('leave', 'de', { submitted: 'Urlaubsantrag {id} zur Genehmigung eingereicht.' });
getMessage('leave', 'submitted', { id: 'LR-1042' }, 'de-AT'); // => 'Urlaubsantrag LR-1042 zur Genehmigung eingereicht.'
getMessage('leave', 'submitted', { id: 'LR-1042' }, 'fr-FR'); // => 'Leave request LR-1042 submitted for approval.'
```

### How do I show user-supplied HTML safely?

Never assign untrusted HTML to `innerHTML`. `setSanitizedHtml` parses it inertly and rebuilds only allowlisted elements, attributes, and URL schemes. See [Security and CSP](/docs/getting-started/security/).

```ts
import { setSanitizedHtml } from '@absoluteui/core';

const note = document.createElement('div');
setSanitizedHtml(note, '<p>Approved by <strong>Asha</strong><img src="x" onerror="alert(1)"></p><a href="javascript:alert(1)">details</a>');
note.innerHTML; // => '<p>Approved by <strong>Asha</strong></p><a>details</a>'
```

### How do I emit events and clean up in my own widget?

`emit` dispatches a standard `CustomEvent` and returns `false` when a cancelable event was prevented. `DisposableGroup` collects listeners and other cleanup and runs them once, in reverse order.

```ts
import { DisposableGroup, createId, emit } from '@absoluteui/core';

const card = document.createElement('section');
card.id = createId('leave-card');
const cleanup = new DisposableGroup();
cleanup.listen(card, 'click', () => {
  emit(card, 'leave-open', { id: 'LR-1042' });
});
card.addEventListener('leave-withdraw', (event) => {
  event.preventDefault();
});
emit(card, 'leave-withdraw', { id: 'LR-1042' }, { cancelable: true }); // => false
cleanup.dispose();
cleanup.disposed; // => true
```

### What goes wrong?

Everything throws an `AbsoluteUIError` with a stable `code` and a `category` (`configuration`, `validation`, `runtime`). Branch on the code, not the message; messages never contain the value you passed. Set `diagnostics: 'development'` while developing for remediation hints.

```ts
import { configureAbsoluteUI, getMessage, plainDate, plainDateTime, plainTime, recurrenceRule, toInstant } from '@absoluteui/core';

configureAbsoluteUI({ common: { timezone: 'Mars/Olympus' } }); // => throws CFG_INVALID_VALUE
getMessage('leave', 'no-such-key'); // => throws I18N_MISSING_MESSAGE
recurrenceRule({ frequency: 'weekly', count: 5, until: plainDate(2026, 12, 31) }); // => throws RECURRENCE_INVALID
toInstant(plainDateTime(plainDate(2026, 3, 8), plainTime(2, 30)), 'America/New_York', 'reject'); // => throws TZ_NONEXISTENT_TIME
```
