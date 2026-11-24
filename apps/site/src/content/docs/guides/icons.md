---
title: Icons
description: Using the built-in icons, sizing and layering icons, registering your own, replacing every icon with a provider, and using icon libraries such as Font Awesome, Material Symbols, Material Icons, and Lucide.
---

`@absoluteui/icons` gives every component its icons. It ships a small built-in set and [the AbsoluteUI icon set](#the-absoluteui-icon-set) of 507 original icons, has no third-party icon dependency, and builds icons with DOM APIs only (no HTML parsing), so icons work under a strict Content Security Policy with Trusted Types.

For an extensive library, bring the one you prefer: [Font Awesome](#font-awesome), [Material Symbols and Material Icons](#material-symbols-and-material-icons), [Lucide](#lucide), or any set with SVG paths or shape nodes. You can also add icons, replace some or all of them with your design system's icons, [size](#icon-sizes) and [layer](#layered-icons) them. The [Icons API page](/docs/api/icons/) shows every built-in icon.

## The AbsoluteUI icon set

`@absoluteui/icons/set` is AbsoluteUI's own icon set: 507 original icons in 18 categories (navigation, actions, status, users, files, layout, forms and text, communication, time and calendar, analytics, security, enterprise, development, cloud, devices, finance, maps, media) and 13 overlays, drawn on a 24-unit grid with a 2-unit stroke. Every icon has an outline variant; many also have `solid`, `duotone`, and `multicolor`. The [gallery on the Icons API page](/docs/api/icons/#absoluteui-icon-set) shows them all, grouped by category, with a search field.

Each icon is its own module: import the ones you use (`alarm-clock` is `alarmClockIcon`, the lock overlay is `lockOverlay`) and pass the definition to `renderIcon` or to a component's `icons` option.

```ts
import { renderIcon } from '@absoluteui/icons';
import { downloadIcon, fileTextIcon, lockOverlay } from '@absoluteui/icons/set';

const download = renderIcon(downloadIcon, { variant: 'duotone', size: 'lg' });
const locked = renderIcon(fileTextIcon, { overlays: [{ icon: lockOverlay }], label: 'Locked file' });
document.body.append(download, locked);
```

To use the set by name (`renderIcon('download')`, component `icons: { ... : 'download' }`), import `@absoluteui/icons/set/register` once at start-up. It bundles the whole set and replaces built-in icons of the same names in every component.

### Variants, colors, and layers

| Option | What it does |
|---|---|
| `variant` | `'outline'` (default), `'solid'`, `'duotone'`, or `'multicolor'`; the icon must provide it. |
| `colors` | Role colors for this icon: `primary`, `secondary`, `accent`, `success`, `warning`, `error`, `info`, `muted` (CSS colors, validated). Every role defaults to the text color, except in multicolor icons, where roles take the theme's status colors. |
| `layers` | Per-layer `color`, `opacity`, or `hidden` for the named layers `base`, `secondary`, `accent`, `badge`, `detail`. |
| `overlays` | Up to two overlays (`bottom-end` by default, or `top-end`, `center`); the icon is cut away under each overlay so it stays legible at 16px. |
| `container` | Draws the icon inside a `'circle'` or `'square'`. |
| `strokeWidth` | Outline stroke width, 0.5 to 4. Without it, icons follow the inherited `--aui-icon-stroke-width` (default 2), so a theme or a region can set it, for example `strong { --aui-icon-stroke-width: 2.5 }`. |
| `strokeScaling` | `'fixed'` keeps strokes at their width in CSS pixels at any size. |
| `rotate`, `flip`, `dir` | Rotation (0, 90, 180, 270), flips, and direction. Directional icons (arrows, undo, send, ...) mirror in right-to-left layouts by themselves; media controls never mirror. |

Duotone icons paint their `secondary` layer at `--aui-icon-secondary-opacity` (0.3). `updateIcon` changes these options on a rendered icon in place:

```ts
import { renderIcon, updateIcon } from '@absoluteui/icons';
import { cloudUploadIcon } from '@absoluteui/icons/set';

const upload = renderIcon(cloudUploadIcon, { variant: 'duotone' });
updateIcon(upload, { colors: { accent: 'var(--aui-color-success-fg)' }, layers: { secondary: { opacity: 0.5 } } });
```

### Animation

Icons are static. An icon lists the animations it supports (spin, pulse, bounce, wiggle, shake, draw, reveal, fade, morph; see the gallery), and `animateIcon` starts one with a trigger: `hover`, `focus`, `press`, `on-change`, `loading`, `success`, `error`, or `manual`. State triggers follow `setState`.

```ts
import { animateIcon, renderIcon } from '@absoluteui/icons';
import { spinnerIcon } from '@absoluteui/icons/set';

const spinner = renderIcon(spinnerIcon, { label: 'Saving' });
document.body.append(spinner);
const motion = animateIcon(spinner, { preset: 'spin' });
motion.setState('loading'); // plays until the state changes
motion.setState('idle');
motion.dispose(); // when the icon goes away
```

Users who prefer reduced motion see the static icon. `setIconMotionPolicy('reduce')` turns motion off for the whole application; `'allow-essential'` also plays animations marked `essential`. Server rendering emits the static icon; start animations in the browser.

In Angular, `aui-icon` takes all of these as inputs; see [Angular: Icons](/docs/angular/guides/icons/).

## How icons are resolved

Components ask for icons by **name** (`'close'`, `'calendar'`, `'chevron-down'`) or accept an inline **definition** in their `icons` option. A name is resolved in this order:

```text
inline definition (used as given)
  -> icon provider   (setIconProvider; asked first for every name)
    -> registry      (registerIcons, then the built-in set)
      -> error ICON_UNKNOWN
```

Every definition is validated before use: SVG path data, shape attributes, and `viewBox` must be well formed, class names must be plain CSS class names, ligature names plain words, and a factory must be a function. An invalid definition throws `ICON_INVALID` with the icon's name.

## The kinds of definition

| Kind | Use it for | Shape |
|---|---|---|
| `svg` | Icons you have as SVG path data or shapes (most icon sets) | `{ kind: 'svg', viewBox: '0 0 24 24', paths?: ['M...'], nodes?: [['circle', { cx: 12, cy: 12, r: 9 }]], stroke?: true, strokeWidth?: 2 }` |
| `ligature` | Ligature icon fonts (Material Symbols, Material Icons) | `{ kind: 'ligature', className: 'material-symbols-outlined', text: 'home' }` |
| `class` | Class-based icon fonts (Font Awesome's web font, others) | `{ kind: 'class', className: 'fa-solid fa-user' }` |
| `layers` | Several icons and counters stacked into one | `{ kind: 'layers', layers: [{ icon: 'calendar' }, { text: '3', position: 'top-end' }] }` |
| `factory` | SVG sprites, libraries that give you elements, anything custom | `{ kind: 'factory', create: (doc) => Element }` (a new element per call) |

`stroke: true` draws outlines in `currentColor` (like the built-in set); otherwise shapes are filled with `currentColor`. Shape nodes may be `circle`, `ellipse`, `line`, `path`, `polygon`, `polyline`, or `rect` with their geometry, `fill` or `stroke` of `none` or `currentColor`, fill rules, and opacity; anything else (event handlers, styles, links, scripts) is rejected. SVG icons take the text color; font icons look however the font styles them.

## Icon sizes

Icons are `1em` by default, and components size their icons with the theme's icon sizes:

| Token | Default | Used for |
|---|---|---|
| `icon-size-xs` | 0.75rem | Dense indicators |
| `icon-size-sm` | 1rem | Most controls: buttons, inputs, menus, tabs |
| `icon-size-md` | 1.25rem | Larger controls, alerts, toasts |
| `icon-size-lg` | 1.5rem | Empty states, file lists |
| `icon-size-xl` | 2rem | Hero and illustration spots |

Three ways to change sizes, from broad to narrow:

```ts
import { renderIcon } from '@absoluteui/icons';

// 1. Everywhere: change a theme token (or set it in your own theme).
document.documentElement.style.setProperty('--aui-icon-size-sm', '1.125rem');

// 2. One component or region: set --aui-icon-size on it or any ancestor.
const toolbar = document.createElement('div');
toolbar.style.setProperty('--aui-icon-size', '1.5rem');

// 3. One icon of your own: the size option (a token name or a CSS length).
toolbar.append(renderIcon('search', { size: 'lg' }), renderIcon('filter', { size: '20px' }));
```

`--aui-icon-size` wins over the component's own size, and an icon's `size` option wins over a surrounding `--aui-icon-size`. The spinner and checkbox or radio boxes are sized by their own options and tokens, not by `--aui-icon-size`.

## Register your own icons

`registerIcons` adds names, or replaces existing ones, everywhere at once:

```ts
import { registerIcons } from '@absoluteui/icons';

registerIcons({
  // A new icon, usable as `icon: 'payroll'` in any component.
  payroll: { kind: 'svg', viewBox: '0 0 24 24', stroke: true, paths: ['M4 6h16v12H4z', 'M8 12h8'] },
  // Replaces the built-in close icon in every component that uses it.
  close: { kind: 'svg', viewBox: '0 0 24 24', stroke: true, paths: ['M7 7l10 10M17 7L7 17'] },
});
```

Register icons once, at start-up, before components render.

## Replace every icon with a provider

A provider is an object with `resolve(name)`. It is asked first for every icon name; returning `undefined` falls back to the registry, so a provider can replace only the names it knows:

```ts
import { setIconProvider, type IconDefinition } from '@absoluteui/icons';

// Your design system's icons, as path data.
const brandIcons: Readonly<Record<string, IconDefinition>> = {
  close: { kind: 'svg', viewBox: '0 0 20 20', paths: ['M5 5l10 10M15 5L5 15'], stroke: true },
  'chevron-down': { kind: 'svg', viewBox: '0 0 20 20', paths: ['M5 8l5 5 5-5'], stroke: true },
};

setIconProvider({ resolve: (name) => brandIcons[name] });
```

`setIconProvider(null)` removes the provider. Only one provider is active; to combine sources, resolve them inside one provider.

## Icon libraries

AbsoluteUI bundles no third-party icons: install the library you choose, import the icons you use, and register them. Only imported icons reach your bundle. The library's licence applies to your application:

| Library | Package or source | Licence | Recommended form |
|---|---|---|---|
| Font Awesome Free | `@fortawesome/free-solid-svg-icons`, `-regular-`, `-brands-` | Icons CC BY 4.0, code MIT | SVG with `fromFontAwesome` |
| Material Symbols | Google Fonts (font), `@material-symbols/svg-*` (SVG files) | Apache 2.0 | SVG, or the font as `ligature` |
| Material Icons | Google Fonts (font) | Apache 2.0 | Font as `ligature` |
| Lucide | `lucide` | ISC | SVG with `fromSvgNodes` |

Prefer SVG forms: they need no font download or third-party host, render crisply at every size, and are hidden from assistive technology exactly like the built-in icons.

### Font Awesome

Convert Font Awesome's SVG icon definitions with `fromFontAwesome`. Register them under the names your code (or components) use:

```ts
import { faBell, faCalendarDays, faXmark } from '@fortawesome/free-solid-svg-icons';
import { fromFontAwesome, registerIcons } from '@absoluteui/icons';

registerIcons({
  bell: fromFontAwesome(faBell),
  calendar: fromFontAwesome(faCalendarDays), // every date picker now uses Font Awesome's calendar
  close: fromFontAwesome(faXmark),
});
```

With Font Awesome's **web font** instead, load its stylesheet (`@fortawesome/fontawesome-free/css/all.min.css`) and map names to classes: `registerIcons({ bell: { kind: 'class', className: 'fa-solid fa-bell' } })`. The Font Awesome **JavaScript kit** (a `<script>` from `kit.fontawesome.com`) is not recommended with AbsoluteUI: it rewrites the page's DOM and injects its own styles, which conflicts with a strict CSP unless you relax it for the kit, and it duplicates what `fromFontAwesome` does at build time.

### Material Symbols and Material Icons

**As a font from Google Fonts.** Load the stylesheet, allow Google's hosts in the CSP, and register icons as ligatures: the element gets the font's class and the icon's name as text (and `translate="no"`, so page translation leaves it alone).

```ts
import { webFontHosts } from '@absoluteui/theme';
import { registerIcons } from '@absoluteui/icons';

const stylesheet = document.createElement('link');
stylesheet.rel = 'stylesheet';
stylesheet.href = 'https://fonts.googleapis.com/css2?family=Material+Symbols+Outlined:opsz,wght,FILL,GRAD@20..48,100..700,0..1,-50..200';
document.head.append(stylesheet);
// Content-Security-Policy: style-src 'self' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com
console.info(webFontHosts.google.styleSrc, webFontHosts.google.fontSrc);

registerIcons({
  home: { kind: 'ligature', className: 'material-symbols-outlined', text: 'home' },
  calendar: { kind: 'ligature', className: 'material-symbols-outlined', text: 'calendar_month' },
});
```

Material Symbols is a variable font: its fill, weight, grade, and optical size are CSS, for example `.material-symbols-outlined { font-variation-settings: 'FILL' 1, 'wght' 500; }`. **Material Icons** (the older font) works the same way with `family=Material+Icons` and `className: 'material-icons'`.

**As SVG files.** Each Material Symbol is one path in a `0 -960 960 960` view box. Import the files your bundler can load as text (here Vite's `?raw`), or copy the path at build time:

```ts
import homeSvg from '@material-symbols/svg-400/outlined/home.svg?raw';
import { registerIcons } from '@absoluteui/icons';

const path = /\sd="([^"]+)"/.exec(homeSvg)?.[1] ?? '';
registerIcons({ home: { kind: 'svg', viewBox: '0 -960 960 960', paths: [path] } });
```

### Lucide

Lucide publishes each icon as shape nodes; `fromSvgNodes` converts them. Its style (24 x 24, 2 px round strokes) matches the built-in set, so it is a natural way to extend it. To make every component use Lucide, map the names components ask for in a provider:

```ts
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, Search, X } from 'lucide';
import { fromSvgNodes, setIconProvider, type IconDefinition } from '@absoluteui/icons';

const lucideIcons: Readonly<Record<string, IconDefinition>> = {
  close: fromSvgNodes(X),
  calendar: fromSvgNodes(Calendar),
  search: fromSvgNodes(Search),
  'chevron-down': fromSvgNodes(ChevronDown),
  'chevron-left': fromSvgNodes(ChevronLeft),
  'chevron-right': fromSvgNodes(ChevronRight),
};
setIconProvider({ resolve: (name) => lucideIcons[name] }); // unmapped names keep the built-in icons
```

The built-in icon names are listed on the [Icons API page](/docs/api/icons/#built-in-icons).

### Registering a whole library

Registering every icon of a library is convenient for prototypes but puts the whole library in your bundle (Lucide 1.49 has 1,857 icons; Font Awesome Free 7.3 solid has 1,422). For production, register the icons you use.

## Other libraries, sprites, and custom elements

AbsoluteUI does not depend on any icon library; you connect one through a definition.

**Libraries that ship path data.** Many icon sets publish each icon as path data (or as SVG files you can convert at build time). Map them to `svg` definitions, in `registerIcons` or a provider:

```ts
import { setIconProvider } from '@absoluteui/icons';

// Shape of a typical package that exports path data per icon (placeholder data).
declare const iconData: Readonly<Record<string, { readonly viewBox: string; readonly paths: readonly string[] }>>;

setIconProvider({
  resolve: (name) => {
    const icon = iconData[name];
    return icon ? { kind: 'svg', viewBox: icon.viewBox, paths: icon.paths, stroke: true } : undefined;
  },
});
```

**SVG sprites.** A sprite is one SVG file with a `<symbol id="...">` per icon. Use a factory that references the symbol; serve the sprite from your own origin so the page's CSP allows it:

```ts
import { setIconProvider } from '@absoluteui/icons';

const SVG = 'http://www.w3.org/2000/svg';
const sprite = '/assets/icons.svg';

setIconProvider({
  resolve: (name) => ({
    kind: 'factory',
    create: (doc) => {
      const svg = doc.createElementNS(SVG, 'svg');
      svg.setAttribute('viewBox', '0 0 24 24');
      svg.setAttribute('width', '1em');
      svg.setAttribute('height', '1em');
      const use = doc.createElementNS(SVG, 'use');
      use.setAttribute('href', `${sprite}#${name}`);
      svg.append(use);
      return svg;
    },
  }),
});
```

This provider answers every name; if your sprite does not have all the names components use, return `undefined` for the missing ones so the built-in icons fill in.

**Libraries that render elements.** When a library gives you an element (or an SVG string you already trust and parse yourself), wrap it in a factory. Factories must return a **new** element on every call, because the same icon can appear many times.

**Icon fonts.** If you have chosen an icon font, map names to its classes with `class` definitions and load the font's stylesheet yourself. Class names are validated; they are the only thing AbsoluteUI adds:

```ts
import { registerIcons } from '@absoluteui/icons';

registerIcons({
  star: { kind: 'class', className: 'icon-font icon-font-star' },
});
```

Icon fonts depend on the font loading and are harder to keep accessible; prefer SVG where you can.

## Layered icons

A `layers` definition stacks up to eight icons and short texts (counters of up to four characters) into one icon, like a calendar with a count or a document with a status badge. Each layer is centred by default and can be:

| Option | Effect |
|---|---|
| `scale` | 0.1 to 4 |
| `x`, `y` | Offset in em (-1 to 1), so it scales with the icon |
| `rotate` | Degrees |
| `flip` | `'horizontal'`, `'vertical'`, or `'both'` |
| `position` | `'center'`, `'top-start'`, `'top-end'`, `'bottom-start'`, `'bottom-end'` (start and end follow the text direction) |
| `tone` | `'primary'`, `'success'`, `'warning'`, `'error'`, or `'muted'`, from the theme |
| `className` | Your own classes, for example a pill background behind a counter |

```ts
import { registerIcons, renderIcon } from '@absoluteui/icons';

const dot = { kind: 'svg', viewBox: '0 0 24 24', nodes: [['circle', { cx: 12, cy: 12, r: 12 }]] } as const;
registerIcons({
  'calendar-alert': { kind: 'layers', layers: [{ icon: 'calendar' }, { icon: dot, scale: 0.45, position: 'top-end', tone: 'error' }] },
});
const today = renderIcon({ kind: 'layers', layers: [{ icon: 'calendar' }, { text: '3', position: 'bottom-end', tone: 'error' }] }, { label: '3 events today', size: 'xl' });
document.body.append(today);
```

The layered icon is one element: it takes the size of the icon (every layer scales with it) and one accessible name, and its layers are hidden from assistive technology. A counter's value belongs in the label, as above. Layers cannot contain further layers.

## Override icons in one component

Components that show icons accept an `icons` option with their icon slots (listed in each component's API reference). Pass a name or an inline definition; other instances keep their icons:

```ts
import { Spinner } from '@absoluteui/components/spinner';

const host = document.createElement('div');
document.body.append(host);
Spinner.create(host, {
  label: 'Saving',
  icons: { spinner: { kind: 'svg', viewBox: '0 0 24 24', stroke: true, paths: ['M12 3a9 9 0 1 1-9 9'] } },
});
```

Inline definitions are used as given; names still go through the provider and the registry.

## Icons in your own markup

`renderIcon` returns the same element components use. It is decorative by default (`aria-hidden="true"`); pass `label` when the icon itself carries meaning, which gives it `role="img"` and an accessible name:

```ts
import { renderIcon } from '@absoluteui/icons';

const status = document.createElement('p');
status.append(renderIcon('check-circle', { label: 'Approved' }), ' Leave request');
```

Icon-only buttons are labelled on the button, not the icon: use the component's `label` option (for example `Button.create({ icon: 'menu', label: 'Open navigation' })`).

## Checklist

- Register icons or set the provider once, before components render.
- A provider may answer only some names; return `undefined` for the rest.
- Factories return a new element per call and build it with DOM APIs.
- Import and register only the icons you use; register a whole library only for prototypes.
- Serve sprites and icon fonts from your own origin, or allow their host in your CSP (Google Fonts: `webFontHosts.google`).
- Keep the icon library's licence notice (Font Awesome Free requires attribution).
- Size icons with the `icon-size-*` tokens, `--aui-icon-size`, or `size`, not by overriding component CSS.
- Give meaningful standalone icons a `label`; label icon-only controls on the control.
