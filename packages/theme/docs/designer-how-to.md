The Theme Designer engine builds a theme family (light, dark, and high-contrast modes) from a few brand colors, assesses it against WCAG 2.2 AA, and exports it for the theme runtime. It is pure functions with no DOM access: use it in build scripts, internal tools, or a settings screen that lets tenants brand the application. Applications that only apply themes never need it. The [Theming guide](/docs/guides/theming/#your-own-theme) explains families and export formats.

### How do I derive a theme from brand seed colors?

Pass the seeds you have; the rest come from the defaults. Every text, border, and indicator color is solved to meet its contrast pairing in each mode, so a seed may come back adjusted (here the dark mode lightens the primary color).

```ts
import { deriveFamily } from '@absoluteui/theme/designer';

const family = deriveFamily({
  name: 'acme-hr',
  seeds: { primary: '#0F766E', accent: '#7C3AED' },
  version: '1.2.0',
  author: 'Acme HR Platform Team',
});
family.modes.light.tokens['color-primary']; // => '#0F766E'
family.modes.dark.tokens['color-primary']; // => '#5FB6AD'
family.modes.light.tokens['color-on-primary']; // => '#FFFFFF'
```

### How do I check it against WCAG?

`assessCompliance` checks every mode for text and non-text contrast, focus visibility, state differentiation, target size, zoom, motion, and high contrast. `compliant` is true only when no required rule fails; each finding names the tokens, components, and a fix. Re-assess after every manual override.

```ts
import { assessCompliance, deriveFamily } from '@absoluteui/theme/designer';

const family = deriveFamily({ name: 'acme-hr', seeds: { primary: '#0F766E' } });
assessCompliance(family).compliant; // => true

const light = family.modes.light;
const edited = { ...family, modes: { ...family.modes, light: { ...light, tokens: { ...light.tokens, 'color-text-muted': '#B0B0B0' } } } };
const report = assessCompliance(edited);
report.compliant; // => false
// Findings are sorted most urgent first; component tokens that inherit the color fail too.
const muted = report.findings.find((f) => f.status === 'fail' && f.tokens[0] === 'color-text-muted');
[muted?.rule, muted?.measured, muted?.expected]; // => ['WCAG 2.2 1.4.3', '2.16:1', '4.5:1']
muted?.remediation; // => 'Change color-text-muted to #767676 or darker/lighter to reach 4.5:1.'
```

### How do I apply a family at runtime without exporting it?

`familyToThemes` flattens the family into one theme per mode (`<name>`, `<name>-dark`, `<name>-high-contrast`) that `registerTheme` accepts. Densities, responsive values, and `<name>-system` need the exported `theme.css`.

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { registerTheme, startThemeRuntime } from '@absoluteui/theme';
import { deriveFamily, familyToThemes } from '@absoluteui/theme/designer';

const family = deriveFamily({ name: 'acme-hr', seeds: { primary: '#0F766E' } });
familyToThemes(family).map((theme) => registerTheme(theme).name); // => ['acme-hr', 'acme-hr-dark', 'acme-hr-high-contrast']
startThemeRuntime();
configureAbsoluteUI({ common: { theme: 'acme-hr-dark' } });
getComputedStyle(document.documentElement).getPropertyValue('--aui-color-primary'); // => '#5FB6AD'
```

### How do I export it as CSS, JSON, or a package?

Every exporter validates the family first and is deterministic. `toCss` is the stylesheet to ship (all modes, `<name>-system`, densities, responsive values); `toThemeJson` is the editable source that `importTheme` reads back; `toFontsCss` is the opt-in font loader. `toPackageZip` bundles all of them, plus a registration module, DTCG token files, and a compliance report, as a versioned npm package.

```ts
import { deriveFamily, importTheme, packageFiles, toCss, toPackageZip, toThemeJson } from '@absoluteui/theme/designer';

const family = deriveFamily({ name: 'acme-hr', seeds: { primary: '#0F766E' }, version: '1.2.0' });
toCss(family).includes('[data-aui-theme="acme-hr-system"]'); // => true
importTheme(toThemeJson(family)).ok; // => true
const files = packageFiles(family, { packageName: '@acme/hr-theme' }).map((f) => f.path);
files.slice(0, 6); // => ['package.json', 'README.md', 'index.js', 'index.d.ts', 'theme.css', 'fonts.css']
const zip = toPackageZip(family, { packageName: '@acme/hr-theme' });
String.fromCharCode(zip[0] ?? 0, zip[1] ?? 0); // => 'PK'
```

In the application, import the package's `theme.css`, call its `registerAcmeHrTheme()`, and set `theme: 'acme-hr'` (or `acme-hr-system`) in configuration.

### How do I load a theme file someone uploaded?

Treat theme files as untrusted. `importTheme` enforces a size limit, known token names, and a safe CSS value grammar, migrates schema version 1 themes, and returns every problem with its JSON path instead of throwing.

```ts
import { deriveFamily, importTheme } from '@absoluteui/theme/designer';

const family = deriveFamily({ name: 'acme-hr' });
const light = family.modes.light;
const upload = JSON.stringify({ ...family, modes: { ...family.modes, light: { ...light, tokens: { ...light.tokens, 'color-bg': 'url(https://evil.test/a.png)' } } } });
const result = importTheme(upload);
result.ok; // => false
result.ok ? [] : result.errors.map((e) => e.path); // => ['modes.light.tokens.color-bg']
```

### What goes wrong?

Exporters reject an invalid family with `THEME_INVALID` (names are lowercase kebab-case, versions are semantic versions). A derived family is compliant, but manual overrides can break it: never present a family whose report is not `compliant` as accessible, and verify rendered pages as well, because the assessment is token-level.

```ts
import { deriveFamily, toCss } from '@absoluteui/theme/designer';

toCss(deriveFamily({ name: 'Acme HR' })); // => throws THEME_INVALID
toCss(deriveFamily({ name: 'acme-hr', version: 'v2' })); // => throws THEME_INVALID
```
