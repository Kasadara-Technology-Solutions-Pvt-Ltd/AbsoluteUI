Parse any CSS colour, convert between hex, `rgb()`, `hsl()`, and `oklch()`, derive shades, and check WCAG contrast. Reach for it when colours come from users or data (department badges, calendar categories, brand settings) and text on them must stay readable. The [Theming guide](/docs/guides/theming/) covers design tokens; this module works on single colour values.

### How do I pick readable text for a colour a user chose?

`bestTextColor` returns black or white (or the best of your own candidates) for the background, and `meetsContrast` confirms the pair passes WCAG AA.

```ts
import { bestTextColor, meetsContrast } from '@absoluteui/helpers/color';

const badge = (background: string) => {
  const text = bestTextColor(background, ['#111827', '#ffffff']);
  return { background, color: text, readable: meetsContrast(text, background) };
};
badge('#1e3a8a'); // => { background: '#1e3a8a', color: '#ffffff', readable: true }
badge('#fde68a'); // => { background: '#fde68a', color: '#111827', readable: true }
```

### How do I check a set of theme colours against WCAG?

`contrastRatio` gives the unrounded ratio; `meetsContrast` applies the threshold for the level and size you need: AA 4.5, AA large text 3, AAA 7, and 3 for non-text elements such as focus rings and input borders.

```ts
import { contrastRatio, meetsContrast } from '@absoluteui/helpers/color';

const pairs = [
  { name: 'body text', fg: '#374151', bg: '#ffffff', size: 'normal' },
  { name: 'placeholder', fg: '#9ca3af', bg: '#ffffff', size: 'normal' },
  { name: 'focus ring', fg: '#2563eb', bg: '#ffffff', size: 'non-text' },
] as const;
const failing = pairs.filter((p) => !meetsContrast(p.fg, p.bg, { size: p.size })).map((p) => p.name);
failing; // => ['placeholder']
Number(contrastRatio('#9ca3af', '#ffffff').toFixed(2)); // => 2.54
```

### How do I derive hover, pressed, and tint shades from one brand colour?

`darken` and `lighten` move OKLCH lightness, so the hue stays the same to the eye; `withAlpha` makes a translucent tint and `mix` blends two colours. Format the result for CSS with `formatHex`, `formatRgb`, or `formatOklch`.

```ts
import { contrastRatio, darken, formatHex, formatRgb, lighten, mix, withAlpha } from '@absoluteui/helpers/color';

const brand = '#2563eb';
const hover = formatHex(darken(brand, 0.08));
const pressed = formatHex(darken(brand, 0.16));
contrastRatio(pressed, '#fff') > contrastRatio(hover, '#fff'); // => true
contrastRatio(formatHex(lighten(brand, 0.3)), '#fff') < contrastRatio(brand, '#fff'); // => true
formatRgb(withAlpha(brand, 0.12)); // => 'rgb(37 99 235 / 0.12)'
formatHex(mix(brand, '#ffffff', 1)); // => '#ffffff'
```

### How do I validate and normalise a colour field?

`parseColor` accepts every CSS form (hex, `rgb()`, `hsl()`, `oklch()`, named colours, `transparent`) and returns `undefined` for anything else. Store one canonical form, such as lowercase hex.

```ts
import { formatHex, parseColor } from '@absoluteui/helpers/color';

const normalise = (input: string) => {
  const rgb = parseColor(input.trim());
  return rgb === undefined ? undefined : formatHex(rgb);
};
normalise('  RebeccaPurple '); // => '#663399'
normalise('hsl(217 91% 60%)'); // => '#3c83f6'
normalise('rgb(0 128 0 / 50%)'); // => '#00800080'
normalise('blueish'); // => undefined
```

### What goes wrong?

`currentcolor` and unknown names are not colours here, because they have no value outside the page. Translucent colours change contrast: `contrastRatio` composites them over the background (and a translucent background over white), so check the colour as it is actually drawn.

```ts
import { contrastRatio, parseColor, parseColorOrThrow } from '@absoluteui/helpers/color';

parseColor('currentcolor'); // => undefined
parseColorOrThrow('brand-blue'); // => throws HLP_COLOR_INVALID
contrastRatio('rgb(0 0 0 / 0.4)', '#ffffff') < contrastRatio('#000000', '#ffffff'); // => true
```
