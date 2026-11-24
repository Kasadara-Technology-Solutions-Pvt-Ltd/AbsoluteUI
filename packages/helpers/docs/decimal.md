Exact decimal arithmetic for money, rates, and quantities, where `0.1 + 0.2` must be `0.3`. Values are immutable `Decimal` objects backed by `bigint`, serialise to JSON as strings, and refuse silent conversion to floating point. The [Helpers and services guide](/docs/guides/helpers-and-services/) covers the shared conventions.

### How do I total invoice lines and add tax exactly?

Multiply price by quantity, sum with `sumDecimals`, and round only once, at the end, with an explicit rounding mode.

```ts
import { decimal, sumDecimals } from '@absoluteui/helpers/decimal';

const lines = [
  { price: '19.99', qty: 3 },
  { price: '4.35', qty: 7 },
  { price: '0.10', qty: 2 },
];
const net = sumDecimals(lines.map((l) => decimal(l.price).multiply(l.qty)));
net.toString(); // => '90.62'
const vat = net.percent('7.5', { scale: 2, rounding: 'half-even' });
vat.toString(); // => '6.80'
net.add(vat).toFixed(2); // => '97.42'
0.1 + 0.2 === 0.3; // => false
decimal('0.1').add('0.2').equals('0.3'); // => true
```

### How do I split an amount without losing a cent?

`split` divides into equal parts and `allocate` by ratios; the leftover minor units go to the first parts, so the parts always add up to the total.

```ts
import { decimal, sumDecimals } from '@absoluteui/helpers/decimal';

const bonusPool = decimal('1000.00');
const shares = bonusPool.split(3);
shares.map(String); // => ['333.34', '333.33', '333.33']
sumDecimals(shares).equals(bonusPool); // => true
const byFte = bonusPool.allocate([1, 0.5, 0.5]); // full-time, two part-time
byFte.map(String); // => ['500.00', '250.00', '250.00']
```

### How do I read user input and store amounts in cents?

`parseDecimal` returns `undefined` instead of throwing, and accepts a `locale` for grouped input such as `1.234,50`. Store integer minor units with `toMinorUnits` and restore them with `fromMinorUnits`.

```ts
import { fromMinorUnits, parseDecimal } from '@absoluteui/helpers/decimal';

const salary = parseDecimal('4.250,75', { locale: 'de' });
salary?.toString(); // => '4250.75'
parseDecimal('12,5 EUR'); // => undefined
const cents = salary?.toMinorUnits(2);
cents; // => 425075n
fromMinorUnits(425075n, 2).toString(); // => '4250.75'
```

### How do I display a decimal as currency?

`formatDecimal` formats the exact string through `Intl.NumberFormat`, so digits beyond float precision survive.

```ts
import { decimal, formatDecimal } from '@absoluteui/helpers/decimal';

formatDecimal(decimal('1234.5'), { currency: 'USD', locale: 'en-US' }); // => '$1,234.50'
formatDecimal('9007199254740993.10', { locale: 'en-US' }); // => '9,007,199,254,740,993.10'
JSON.stringify({ amount: decimal('12.30') }); // => '{"amount":"12.30"}'
```

### What goes wrong?

Invalid strings, division by zero, and numeric coercion throw with stable codes. Coercion (`+d`, `d * 2`) is blocked on purpose: call `toNumber()` when you really want a float.

```ts
import { decimal } from '@absoluteui/helpers/decimal';

decimal('12.3x'); // => throws HLP_DECIMAL_PARSE
decimal('10').divide(0); // => throws HLP_DECIMAL_DIVIDE_BY_ZERO
Number(decimal('1.5')); // => throws HLP_DECIMAL_COERCION
```
