---
title: Internationalization
description: Locales, translated component text, number and date formatting, and right-to-left layouts.
---

## Locale

Set the locale once; every component formats numbers, currencies, dates, times, and time zone names with `Intl` for that locale, and uses its first day of the week and hour cycle unless you override them:

```ts
import { configureAbsoluteUI } from '@absoluteui/core';

configureAbsoluteUI({ common: { locale: 'de-DE', timezone: 'Europe/Berlin' } });
```

Individual components also accept a `locale` option. Try the locale switcher on any live example in these docs.

## Component text

Components ship English text (labels such as "Close", "Show data table", validation messages, and screen-reader announcements) and never hard-code it. Provide translations per component and locale with `registerMessages()`:

```ts
import { registerMessages } from '@absoluteui/core';

registerMessages('dialog', 'de', { close: 'Schließen' });
```

Lookup falls back from the most specific tag to the language and then to English (`de-AT` -> `de` -> `en`), so a missing translation shows the English text rather than a key. Messages may contain `{name}` placeholders.

## Formatting helpers

The same formatters the components use are available to your application:

```ts
import { formatCurrency, formatNumber, formatPlainDate, plainDate } from '@absoluteui/core';

console.log(formatNumber(1234567.891, { maximumFractionDigits: 1 }, 'en-IN'));
console.log(formatCurrency(4999, 'INR', undefined, 'hi-IN'));
console.log(formatPlainDate(plainDate(2026, 9, 29), { dateStyle: 'full' }, 'ja-JP'));
```

`formatPlainDate()` formats a date-only value without any time zone shift, so a date never moves to the previous day.

## Right-to-left

Set `direction: 'rtl'` (or use a right-to-left locale and `getLocaleDirection()`), and start the theme runtime with `applyDirection: true`. Components mirror their layout with logical CSS properties, flip directional icons and arrow-key behavior, and keep number and date segment order as the locale defines. Charts mirror cartesian axes; radial charts keep clockwise order.
