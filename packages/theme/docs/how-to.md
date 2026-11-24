This package holds the design tokens, the built-in themes (`absolute-default`, `absolute-dark`, `absolute-high-contrast`, and `absolute-system`), the theme runtime that applies them, and the WCAG contrast engine. Reach for it once at startup, and again when you override tokens or check your own colors. The [Theming guide](/docs/guides/theming/) explains tokens, overrides, and custom themes in depth; to build a theme from brand colors, use the [Theme Designer engine](/docs/api/theme-designer/).

### How do I switch the theme, density, or direction at runtime?

Start the runtime once, then change configuration: the runtime keeps `<html>` in sync. Pass `applyDirection: true` if it should also set `dir`.

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';

const stop = startThemeRuntime({ applyDirection: true });
configureAbsoluteUI({ common: { theme: 'absolute-dark', density: 'compact', direction: 'rtl' } });
const html = document.documentElement;
[html.dataset.auiTheme, html.dataset.auiDensity, html.dir]; // => ['absolute-dark', 'compact', 'rtl']
stop(); // stops syncing; the attributes stay
```

### How do I follow the operating system's dark mode?

Use `absolute-system`: its CSS follows `prefers-color-scheme` and `prefers-contrast` without any script. A family exported from the Theme Designer has the same `<name>-system` theme in its `theme.css`.

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';

startThemeRuntime();
configureAbsoluteUI({ common: { theme: 'absolute-system' } });
document.documentElement.dataset.auiTheme; // => 'absolute-system'
```

### How do I read or override a token?

Every token is a `--aui-*` custom property. The built-in definitions give you the values in script; set the property on `:root` or on any container (in CSS or inline) to override it for that subtree.

```ts
import { absoluteDefault } from '@absoluteui/theme';

absoluteDefault.tokens['color-primary']; // => '#1E40AF'
const panel = document.createElement('section');
document.body.append(panel);
panel.style.setProperty('--aui-radius-md', '0.75rem');
getComputedStyle(panel).getPropertyValue('--aui-radius-md'); // => '0.75rem'
```

### How do I override a component token?

Component tokens such as `--aui-button-radius` fall back to a global token until you set them. Set one on a container, or put it in a registered theme so it follows theme switches.

```ts
import { absoluteDefault, applyTheme, getComponentToken, registerTheme } from '@absoluteui/theme';

getComponentToken('button-radius')?.fallback; // => 'radius-md'
registerTheme({ ...absoluteDefault, name: 'acme-hr', tokens: { ...absoluteDefault.tokens, 'button-radius': '999px' } });
applyTheme('acme-hr');
getComputedStyle(document.documentElement).getPropertyValue('--aui-button-radius'); // => '999px'
```

Registered themes are applied as constructable stylesheets, so they work under a strict Content Security Policy.

### How do I check the contrast of my own color pair?

`contrastRatio` measures two parsed colors; compare it with `WCAG_AA_MINIMUM` and ask `suggestForeground` for the nearest passing color. `evaluateThemeContrast` runs the same check over every pair a theme declares.

```ts
import { WCAG_AA_MINIMUM, absoluteDefault, contrastRatio, evaluateThemeContrast, parseColor, suggestForeground } from '@absoluteui/theme';

const text = parseColor('#94A3B8');
const card = parseColor('#FFFFFF');
const ratio = text && card ? contrastRatio(text, card) : 0; // => ≈ 2.56
ratio >= WCAG_AA_MINIMUM.text; // => false
const fixed = text && card ? suggestForeground(text, card, WCAG_AA_MINIMUM.text) : null; // => '#6C7786'
const report = evaluateThemeContrast({ ...absoluteDefault, name: 'acme', tokens: { ...absoluteDefault.tokens, 'color-text-muted': '#94A3B8' } });
report.failed.length; // => 4
```

### How do I load the web font?

The default font stack starts with Noto Sans but never downloads it. Opt in by importing the loader stylesheet, and allow the Google Fonts hosts in your Content Security Policy. A hosted font service receives every visitor's IP address, so self-hosting with `@font-face` is often the better choice.

```ts
import '@absoluteui/theme/fonts/noto-sans.css';
import { webFontHosts } from '@absoluteui/theme';

const csp = `style-src 'self' ${webFontHosts.google.styleSrc}; font-src 'self' ${webFontHosts.google.fontSrc}`;
```

### What goes wrong?

Theme names must be built in or registered, built-in names are reserved, and token values are checked against a safe CSS grammar (no `url()`, braces, or semicolons), so imported themes cannot inject CSS. The runtime needs a DOM: start it in browser code, not during server rendering.

```ts
import { absoluteDefault, applyTheme, registerTheme } from '@absoluteui/theme';

applyTheme('acme-hr'); // => throws THEME_UNKNOWN
registerTheme({ ...absoluteDefault }); // => throws THEME_RESERVED_NAME
registerTheme({ ...absoluteDefault, name: 'acme-hr', tokens: { ...absoluteDefault.tokens, 'color-bg': 'url(/x.png)' } }); // => throws THEME_INVALID
```
