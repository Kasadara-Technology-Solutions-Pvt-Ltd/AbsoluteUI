Descriptive statistics for dashboards and reports: averages, percentiles, spread, outliers, histograms, trends, and simple regression. Functions return `undefined` for empty input rather than `NaN`, and reject `NaN`/`Infinity` unless you pass `nonFinite: 'ignore'`. Percentiles match Excel `PERCENTILE.INC` by default, and variance is the sample statistic (`VAR.S`) unless `population: true`. The [Charts guide](/docs/guides/charts/) shows how to plot the results.

### How do I summarise a salary band?

Median and quartiles describe a pay band better than the mean, which a few high earners pull up.

```ts
import { mean, median, percentile, quartiles } from '@absoluteui/helpers/stats';

const salaries = [42_000, 45_000, 47_500, 48_000, 51_000, 53_000, 55_500, 120_000];
mean(salaries); // => 57750
median(salaries); // => 49500
quartiles(salaries); // => [46875, 49500, 53625]
percentile(salaries, 90); // => ≈ 74850
```

### How do I flag unusual overtime?

`outliers` applies Tukey fences (`k: 1.5` by default, `3` for "far out") and returns the input indexes, so you can point back to the employees.

```ts
import { outliers } from '@absoluteui/helpers/stats';

const team = [
  { name: 'Asha', hours: 4 }, { name: 'Ben', hours: 6 }, { name: 'Chen', hours: 5 },
  { name: 'Dana', hours: 7 }, { name: 'Eli', hours: 31 }, { name: 'Fay', hours: 5 },
];
const result = outliers(team.map((e) => e.hours));
result?.indexes.map((i) => team[i]?.name); // => ['Eli']
result?.upperFence; // => 9.375
```

### How do I bucket values for a distribution chart?

`histogram` returns bins with inclusive lower and exclusive upper edges; `binWidth` aligns edges to round numbers such as ten-year age bands.

```ts
import { histogram } from '@absoluteui/helpers/stats';

const ages = [23, 27, 29, 31, 34, 35, 38, 41, 44, 52];
histogram(ages, { binWidth: 10 }).map((b) => `${b.x0}–${b.x1 - 1}: ${b.count}`); // => ['20–29: 3', '30–39: 4', '40–49: 2', '50–59: 1']
```

### How do I smooth a monthly trend and project it forward?

`movingAverage` smooths noise; `linearRegression` fits a straight line and `predict` extends it. Treat projections as indicative only.

```ts
import { linearRegression, movingAverage } from '@absoluteui/helpers/stats';

const headcount = [120, 124, 123, 129, 133, 136];
movingAverage(headcount, 3); // => [122.33333333333333, 125.33333333333333, 128.33333333333334, 132.66666666666666]
const fit = linearRegression([1, 2, 3, 4, 5, 6], headcount);
fit === undefined ? undefined : Math.round(fit.predict(9)); // => 145
```

### What goes wrong?

Empty input gives `undefined`, and non-finite values (often a failed parse upstream) throw unless you opt in to skipping them:

```ts
import { mean } from '@absoluteui/helpers/stats';

mean([]); // => undefined
mean([5, Number.NaN, 7]); // => throws HLP_STATS_NOT_FINITE
mean([5, Number.NaN, 7], { nonFinite: 'ignore' }); // => 6
```
