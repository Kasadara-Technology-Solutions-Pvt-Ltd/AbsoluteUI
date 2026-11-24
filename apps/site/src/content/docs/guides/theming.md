---
title: Theming
description: Switch built-in themes and density at runtime, override design tokens, and build your own accessible theme with the Theme Designer.
---

Every color, size, radius, shadow, and duration in AbsoluteUI is a design token (a CSS custom property named `--aui-*`). Themes are sets of token values; components only read tokens.

## Built-in themes

| Theme | Use |
|---|---|
| `absolute-default` | Light theme |
| `absolute-dark` | Dark theme |
| `absolute-high-contrast` | High contrast (4.5:1 non-text contrast, 2 px boundaries, elevation by outline instead of shadow) |
| `absolute-system` | Follows `prefers-color-scheme` and `prefers-contrast` |

All four ship in `@absoluteui/theme/absolute-default.css`. Switch at runtime through configuration; the [theme runtime](/docs/getting-started/installation/#start-the-theme-runtime) applies it to `<html>`:

```ts
import { configureAbsoluteUI } from '@absoluteui/core';

configureAbsoluteUI({ common: { theme: 'absolute-system', density: 'compact' } });
```

Density (`compact`, `comfortable`, `spacious`) changes control heights and spacing without changing the theme. Every built-in theme passes the WCAG 2.2 AA contrast gate on every token pair; see [Accessibility and compliance](/docs/quality/accessibility/#theme-contrast).

## Overriding tokens

Components read global tokens, and 18 components also read **component tokens** that fall back to them (for example `--aui-button-radius` falls back to `--aui-radius-md`). Set either kind on `:root`, on a theme selector, or on any ancestor element:

```css
/* Everywhere */
:root {
  --aui-radius-md: 0.75rem;
}

/* Only buttons inside the toolbar */
.toolbar {
  --aui-button-radius: 999px;
}
```

Each component page lists the tokens it reads under **Design tokens**. Because AbsoluteUI styles live in cascade layers, your unlayered CSS always wins; no `!important` and no specificity battles.

:::caution
Changing color tokens by hand can break contrast. The Theme Designer checks every pairing for you.
:::

## Your own theme

The **Theme Designer** builds a theme family (light, dark, and high-contrast modes) from your brand colors:

1. Seeds (brand hues) are turned into complete role palettes in the OKLCH color space, with every text, border, and indicator color solved to meet WCAG 2.2 AA against the surfaces it is used on.
2. Every change is assessed live: text, large-text, and non-text contrast, focus visibility, state differentiation, target size, motion, and forced colors, each finding with the affected tokens and components and a suggested fix.
3. Export to theme JSON, CSS, SCSS, TypeScript, W3C Design Tokens (DTCG 2025.10), or a versioned package.

Apply an exported TypeScript theme like this:

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { registerTheme, type ThemeDefinition } from '@absoluteui/theme';

declare const themes: readonly ThemeDefinition[]; // from the exported module

for (const theme of themes) registerTheme(theme);
configureAbsoluteUI({ common: { theme: 'acme' } });
```

The exported module wraps this in a `register<Name>Theme()` function. A family registers `<name>`, `<name>-dark`, `<name>-high-contrast`, and `<name>-system`. Registered themes are applied as constructable stylesheets, so they work under a strict CSP.

The engine behind the designer is available as `@absoluteui/theme/designer` (see the [API reference](/docs/api/theme-designer/)) to generate or validate themes in your own tools. Imported themes are treated as untrusted: size limits, known token names only, and a safe CSS value grammar that rejects `url()`, braces, and semicolons.

## Fonts

The font stack tokens `font-family-sans` and `font-family-mono` name the families. A theme family can list web font stylesheets from Google Fonts, Bunny Fonts, or your own host; loading them is always opt-in. See [Installation](/docs/getting-started/installation/#fonts).
