Components ask for icons by name. This package ships the AbsoluteUI icon set (`@absoluteui/icons/set`), resolves icon names, lets you add or replace icons (including whole third-party libraries such as Lucide, Font Awesome, and Material Symbols), sizes and layers them, and renders them as accessible elements. The [Icons guide](/docs/guides/icons/) covers every option in depth.

### How do I show an icon in my own markup, at a given size?

`renderIcon` returns the element components use: decorative by default, an image with an accessible name when you pass `label`. `size` takes a theme size (`'xs'` 0.75rem, `'sm'` 1rem, `'md'` 1.25rem, `'lg'` 1.5rem, `'xl'` 2rem) or a CSS length.

```ts
import { renderIcon } from '@absoluteui/icons';

const decorative = renderIcon('check', { size: 'lg' });
decorative.getAttribute('aria-hidden'); // => 'true'
decorative instanceof SVGElement ? decorative.style.fontSize : ''; // => 'var(--aui-icon-size-lg, 1.5rem)'
const meaningful = renderIcon('check-circle', { label: 'Approved', size: '20px' });
[meaningful.getAttribute('role'), meaningful.getAttribute('aria-label')]; // => ['img', 'Approved']
```

### How do I resize the icons of a component, a region, or the whole app?

Set `--aui-icon-size` on the component or any ancestor: every icon inside follows it (component icons, and those from `renderIcon`). To change the defaults everywhere, override the theme tokens `--aui-icon-size-xs` ... `--aui-icon-size-xl`.

```ts
import { renderIcon } from '@absoluteui/icons';

const toolbar = document.createElement('div');
toolbar.style.setProperty('--aui-icon-size', '1.5rem'); // this region only
document.documentElement.style.setProperty('--aui-icon-size-sm', '1.125rem'); // app-wide default for small icons
toolbar.append(renderIcon('search'));
```

### How do I use Font Awesome?

Install `@fortawesome/free-solid-svg-icons` (or another Font Awesome SVG package) and convert the icons you use with `fromFontAwesome`. Only the imported icons are in your bundle. Font Awesome Free icons are licensed CC BY 4.0: keep its attribution.

```ts
import { faCalendarDays, faUser } from '@fortawesome/free-solid-svg-icons';
import { fromFontAwesome, registerIcons, renderIcon } from '@absoluteui/icons';

registerIcons({ user: fromFontAwesome(faUser), calendar: fromFontAwesome(faCalendarDays) });
renderIcon('user').getAttribute('viewBox'); // => '0 0 448 512'
```

If you use Font Awesome's web font instead, map names to its classes: `{ kind: 'class', className: 'fa-solid fa-user' }`, and load its stylesheet yourself.

### How do I use Material Symbols from Google Fonts?

Load the font stylesheet from Google Fonts, allow its hosts in your CSP (`webFontHosts.google` from `@absoluteui/theme`), and register icons as **ligatures**: the element carries the font class and the icon name as text.

```ts
import { webFontHosts } from '@absoluteui/theme';
import { registerIcons, renderIcon } from '@absoluteui/icons';

const link = document.createElement('link');
link.rel = 'stylesheet';
link.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
document.head.append(link);
const csp = `style-src 'self' ${webFontHosts.google.styleSrc}; font-src 'self' ${webFontHosts.google.fontSrc}`;

registerIcons({ home: { kind: 'ligature', className: 'material-symbols-outlined', text: 'home' } });
const home = renderIcon('home');
[home.textContent, home.getAttribute('translate')]; // => ['home', 'no']
csp.includes('https://fonts.gstatic.com'); // => true
```

Material Icons (the older font) works the same way with `className: 'material-icons'`. Both are Apache 2.0 licensed.

### How do I use Material Symbols or Material Icons as SVG instead of a font?

SVG avoids loading a font and a third-party host. Take the path from the icon's SVG file (for example from the `@material-symbols/svg-400` package, imported as text by your bundler):

```ts
import homeSvg from '@material-symbols/svg-400/outlined/home.svg?raw';
import { registerIcons, renderIcon } from '@absoluteui/icons';

const viewBox = /viewBox="([^"]+)"/.exec(homeSvg)?.[1] ?? '0 -960 960 960';
const d = /\sd="([^"]+)"/.exec(homeSvg)?.[1] ?? '';
registerIcons({ home: { kind: 'svg', viewBox, paths: [d] } });
renderIcon('home').getAttribute('viewBox'); // => '0 -960 960 960'
```

### How do I use Lucide, and make every component use it?

Convert Lucide's icon nodes with `fromSvgNodes`. A provider that maps the names components ask for to Lucide icons switches every component at once; unmapped names fall back to the built-in set.

```ts
import { Calendar, ChevronDown, Search, X } from 'lucide';
import { fromSvgNodes, resolveIcon, setIconProvider, type IconDefinition } from '@absoluteui/icons';

const lucideIcons: Readonly<Record<string, IconDefinition>> = {
  close: fromSvgNodes(X),
  'chevron-down': fromSvgNodes(ChevronDown),
  calendar: fromSvgNodes(Calendar),
  search: fromSvgNodes(Search),
};
setIconProvider({ resolve: (name) => lucideIcons[name] });
resolveIcon('close') === lucideIcons.close; // => true
resolveIcon('check').kind; // => 'vector' // not mapped: the built-in check
```

Lucide is ISC licensed. The same `fromSvgNodes` works for other sets that publish `[tag, attributes]` nodes.

### How do I layer icons, for a badge or a counter?

A `layers` definition stacks icons and short texts in one icon. Each layer can be scaled, moved (in em), rotated, flipped, placed in a corner, and coloured with a theme tone. Label the whole icon once.

```ts
import { renderIcon } from '@absoluteui/icons';

const dot = { kind: 'svg', viewBox: '0 0 24 24', nodes: [['circle', { cx: 12, cy: 12, r: 12 }]] } as const;
const events = renderIcon({
  kind: 'layers',
  layers: [
    { icon: 'calendar' },
    { icon: dot, scale: 0.45, position: 'top-end', tone: 'error' },
    { text: '3', position: 'bottom-end', tone: 'error' },
  ],
}, { label: '3 events today', size: 'xl' });
[events.getAttribute('aria-label'), events.children.length]; // => ['3 events today', 3]
```

### How do I register an icon provider?

A provider is asked first for every name. Return a definition for the names you replace and `undefined` for the rest, which then come from the registry. `setIconProvider(null)` removes it.

```ts
import { builtInIcons, resolveIcon, setIconProvider, type IconDefinition } from '@absoluteui/icons';

const brand: Readonly<Record<string, IconDefinition>> = {
  close: { kind: 'svg', viewBox: '0 0 20 20', stroke: true, paths: ['M5 5l10 10M15 5L5 15'] },
};
setIconProvider({ resolve: (name) => brand[name] });
resolveIcon('close') === brand.close; // => true
resolveIcon('check') === builtInIcons.check; // => true
setIconProvider(null);
resolveIcon('close') === builtInIcons.close; // => true
```

### How do I change the icon of one component only?

Pass a name or an inline definition in the component's `icons` option (each component lists its icon slots in its API reference). Other instances are unaffected.

```ts
import { Spinner } from '@absoluteui/components/spinner';

const host = document.createElement('div');
document.body.append(host);
Spinner.create(host, { label: 'Saving', icons: { spinner: 'refresh' } });
```

### How do I use the AbsoluteUI icon set?

Import the icons you use from `@absoluteui/icons/set` (each is its own module) and pass the definition to `renderIcon`. Pick a variant, set role colors, and add an overlay; the [Icons guide](/docs/guides/icons/#the-absoluteui-icon-set) lists every option and the API page shows every icon.

```ts
import { renderIcon } from '@absoluteui/icons';
import { downloadIcon, lockOverlay } from '@absoluteui/icons/set';

const download = renderIcon(downloadIcon, { variant: 'duotone', colors: { accent: '#16a34a' } });
download.querySelector('g[data-layer="secondary"]') !== null; // => true
download instanceof SVGElement ? download.style.getPropertyValue('--aui-icon-accent') : ''; // => '#16a34a'
const locked = renderIcon(downloadIcon, { overlays: [{ icon: lockOverlay }], label: 'Download locked' });
locked.querySelector('[data-overlay="lock"]') !== null; // => true
```

### How do I change an icon's colors or stroke width after rendering it?

`updateIcon` restyles the icon in place (the element stays). Without a `strokeWidth`, icons follow the inherited `--aui-icon-stroke-width` (default 2), so a theme or a region can make all icons thinner or bolder.

```ts
import { renderIcon, updateIcon } from '@absoluteui/icons';
import { cloudUploadIcon } from '@absoluteui/icons/set';

const upload = renderIcon(cloudUploadIcon);
updateIcon(upload, { strokeWidth: 1.5, colors: { primary: '#2563eb' } });
upload instanceof SVGElement ? upload.style.getPropertyValue('stroke-width') : ''; // => '1.5'
document.documentElement.style.setProperty('--aui-icon-stroke-width', '2.5'); // every icon without its own strokeWidth
```

### How do I animate an icon while something loads?

Icons are static until you start one of the animations the icon lists. A state trigger plays while the state lasts. Users who prefer reduced motion see the static icon.

```ts
import { animateIcon, getIconAnimation, renderIcon } from '@absoluteui/icons';
import { spinnerIcon } from '@absoluteui/icons/set';

const spinner = renderIcon(spinnerIcon, { label: 'Saving' });
document.body.append(spinner);
const motion = animateIcon(spinner, { preset: 'spin' });
motion.state; // => 'idle'
motion.setState('loading');
motion.setState('idle');
motion.dispose();
getIconAnimation(spinner); // => undefined
spinner.remove();
```

### What goes wrong?

Unknown names, unsafe or malformed definitions, and invalid sizes fail loudly, with the icon's name in the error. Shape nodes accept geometry, `fill`/`stroke` (`none` or `currentColor`), fill rules, and opacity only: no event handlers, styles, links, or scripts. TypeScript already rejects a size like `'huge'`; the run-time check covers values from untyped configuration (the cast below simulates one).

```ts
import { fromSvgNodes, registerIcons, renderIcon, resolveIcon } from '@absoluteui/icons';

resolveIcon('no-such-icon'); // => throws ICON_UNKNOWN
registerIcons({ broken: { kind: 'svg', viewBox: '0 0 24', paths: ['M0 0'] } }); // => throws ICON_INVALID
fromSvgNodes([['circle', { cx: 12, onclick: 'alert(1)' }]]); // => throws ICON_INVALID
renderIcon('check', { size: 'huge' as '1px' }); // => throws ICON_INVALID_SIZE
```
