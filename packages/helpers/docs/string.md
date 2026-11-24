Unicode-aware text helpers for what applications display and search: fuzzy search with highlighting, safe templates, plurals and lists, masking, slugs, and case conversion. Length and truncation count user-perceived characters (grapheme clusters), so emoji and accented names are never cut in half. Formatting that depends on language takes a `locale`; for dates and numbers, see the [Internationalization guide](/docs/guides/internationalization/).

### How do I search a people list and highlight the match?

`fuzzyMatch` ranks candidates across several keys (accents ignored by default); `highlight` splits the text into matched and unmatched segments, so you render the match with DOM nodes instead of HTML strings.

```ts
import { fuzzyMatch, highlight } from '@absoluteui/helpers/string';

const people = [
  { name: 'Zoë Martin', email: 'zoe.martin@example.com' },
  { name: 'Marta Olsen', email: 'marta.o@example.com' },
  { name: 'Ben Ross', email: 'ben.ross@example.com' },
];
const hits = fuzzyMatch('zoe', people, { keys: ['name', 'email'], limit: 5 });
hits.map((h) => h.item.name); // => ['Zoë Martin']
highlight('Zoë Martin', 'zoe'); // => [{ text: 'Zoë', match: true }, { text: ' Martin', match: false }]
```

### How do I build a notification message safely?

`template` fills `{placeholders}` without evaluating code; pass `escape: escapeHtml` when the result goes into HTML. `pluralize` picks the plural form for the locale and `formatList` joins names.

```ts
import { escapeHtml, formatList, pluralize, template } from '@absoluteui/helpers/string';

const approvers = ['Maya', 'Omar', 'Lin'];
const days = pluralize(3, { one: '{count} day', other: '{count} days' }, { locale: 'en' });
const text = template('{who} requested {days} of leave. Approvers: {list}.', {
  who: 'Ben <b>',
  days,
  list: formatList(approvers, { locale: 'en' }),
}, { escape: escapeHtml });
text; // => 'Ben &lt;b&gt; requested 3 days of leave. Approvers: Maya, Omar, and Lin.'
```

### How do I hide personal data in lists and logs?

`mask` keeps a chosen number of characters visible and can skip formatting characters; `maskEmail` keeps the first character and the domain.

```ts
import { mask, maskEmail } from '@absoluteui/helpers/string';

mask('DE89 3704 0044 0532 0130 00', { visibleEnd: 4, preserve: ' ' }); // => '•••• •••• •••• •••• ••30 00'
mask('123-45-6789', { visibleEnd: 4, preserve: '-', maskChar: '*' }); // => '***-**-6789'
maskEmail('asha.rao@example.com'); // => 'a•••••••@example.com'
```

### How do I make file names, URLs, and avatar labels from names?

`slugify` removes accents and punctuation (Unicode letters are kept unless `ascii: true`); `initials` and `truncate` fit names into small spaces.

```ts
import { initials, slugify, truncate } from '@absoluteui/helpers/string';

`${slugify('Zoë Martin – Q3 Review', { maxLength: 40 })}.pdf`; // => 'zoe-martin-q3-review.pdf'
initials('Zoë Martin'); // => 'ZM'
truncate('Senior Payroll and Benefits Specialist', 20, { wordBoundary: true }); // => 'Senior Payroll and…'
```

### How do I convert between naming conventions?

Case helpers split words on separators, case changes, and digits, so API field names map cleanly to column ids and labels.

```ts
import { camelCase, constantCase, sentenceCase, snakeCase } from '@absoluteui/helpers/string';

camelCase('hire_date'); // => 'hireDate'
snakeCase('employeeId'); // => 'employee_id'
sentenceCase('annualLeaveBalance'); // => 'Annual leave balance'
constantCase('leave-type'); // => 'LEAVE_TYPE'
```
