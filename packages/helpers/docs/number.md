Rounding, percentages, parsing, and locale-aware formatting for everyday numbers such as KPIs, hours, file sizes, and user input. Formatting goes through cached `Intl.NumberFormat` instances; parsing accepts each locale's own separators and digits. For money that must add up exactly, use [`helpers/decimal`](/docs/api/helpers/decimal/); the [Internationalization guide](/docs/guides/internationalization/) covers locales.

### How do I show a KPI with its change against last period?

`percentChange` returns `undefined` instead of `Infinity` when the base is zero; the formatters render the value compactly and in the reader's locale.

```ts
import { formatCompact, formatCurrency, formatPercent, percentChange } from '@absoluteui/helpers/number';

const payrollCost = { last: 1_180_000, now: 1_246_500 };
const change = percentChange(payrollCost.last, payrollCost.now, { places: 1 });
change; // => 5.6
formatPercent((change ?? 0) / 100, { locale: 'en-US', maximumFractionDigits: 1, signDisplay: 'always' }); // => '+5.6%'
formatCompact(payrollCost.now, { locale: 'en-US' }); // => '1.2M'
formatCurrency(payrollCost.now, 'INR', { locale: 'en-IN' }); // => '₹12,46,500.00'
percentChange(0, 12); // => undefined
```

### How do I read a number the user typed in their own format?

`parseNumber` takes the locale's group and decimal symbols; `strict: true` rejects misplaced separators that would otherwise be read as a different number.

```ts
import { parseNumber } from '@absoluteui/helpers/number';

parseNumber('1.234,5', { locale: 'de' }); // => 1234.5
parseNumber('1,234.5', { locale: 'en' }); // => 1234.5
parseNumber('12 %', { locale: 'fr' }); // => 0.12
parseNumber('1,2,3', { locale: 'en', strict: true }); // => undefined
parseNumber('twelve', { locale: 'en' }); // => undefined
```

### How do I round logged hours to quarter hours and cap them?

`roundTo` rounds to any step (without float drift), `clamp` keeps the value in range, and `round` takes a number of decimal places.

```ts
import { clamp, round, roundTo } from '@absoluteui/helpers/number';

const logged = [7.9, 8.13, 13.4];
logged.map((h) => clamp(roundTo(h, 0.25), 0, 12)); // => [8, 8.25, 12]
round(1.005, 2); // => 1.01
Math.round(1.005 * 100) / 100; // => 1 // float error
```

### How do I enforce and show a file size limit?

`parseBytes` reads limits from configuration (`'10 MB'`, `'1 KiB'`); `formatBytes` shows sizes to users, with `style: 'long'` for screen-reader text.

```ts
import { formatBytes, parseBytes } from '@absoluteui/helpers/number';

const limit = parseBytes('10 MB') ?? 0;
const upload = 12_400_000;
upload > limit; // => true
`${formatBytes(upload, { locale: 'en-US' })} exceeds the ${formatBytes(limit, { locale: 'en-US' })} limit`; // => '12.4 MB exceeds the 10 MB limit'
formatBytes(upload, { locale: 'en-US', style: 'long' }); // => '12.4 megabytes'
```

### What goes wrong?

`round` rounds halves away from zero; use `roundHalfEven` (banker's rounding) when regulations require it, and never compare computed floats with `===`:

```ts
import { approximatelyEqual, round, roundHalfEven } from '@absoluteui/helpers/number';

[round(2.5), roundHalfEven(2.5), roundHalfEven(3.5)]; // => [3, 2, 4]
0.1 + 0.2 === 0.3; // => false
approximatelyEqual(0.1 + 0.2, 0.3); // => true
```
