# @absoluteui/theme

The look of AbsoluteUI: built-in themes as design tokens, the runtime that applies them, accessibility checks for colors, and the Theme Designer engine for building your own theme families.

## What's in the package

- **Built-in themes**: default, dark, and high contrast, with density variants, in one stylesheet (`absolute-default.css`).
- **Theme runtime**: applies the configured theme, density, animation mode, and text direction to the page and keeps them in sync.
- **Design tokens**: the token set, component tokens for per-component styling, optional tokens, and exports as CSS, SCSS, and JSON (`tokens.json`, `scss/`).
- **Contrast checks**: color parsing, luminance, contrast ratios, foreground suggestions, and WCAG 2.2 AA evaluation of a whole theme.
- **Custom themes**: register and validate your own themes.
- **Web fonts**: the opt-in Noto Sans stylesheet and helpers for other font providers.
- **Theme Designer engine** (`/designer`): theme families with light, dark, and high-contrast modes, OKLCH seed-to-role derivation, compliance assessment, import, and exports (theme JSON, CSS, SCSS, TypeScript, DTCG design tokens, and a package ZIP), with a published JSON Schema.

## Browser support

Chrome 116, Edge 116, Firefox 125, Safari (macOS) 17, Safari (iOS and iPadOS) 18.3, or later. Details: [Browser support](https://aui.kasadara.com/docs/quality/browser-support/).

## Documentation

Full documentation: [aui.kasadara.com/docs/api/theme/](https://aui.kasadara.com/docs/api/theme/)

## License

Licensed under the [Apache License 2.0](https://aui.kasadara.com/license/). Copyright (c) 2026 Kasadara Technology Solutions Pvt Ltd; see the LICENSE and NOTICE files in this package. AbsoluteUI is open source, Kasadara's contribution to the open-source community; the source is at https://github.com/Kasadara-Technology-Solutions-Pvt-Ltd/AbsoluteUI. Report vulnerabilities as described in the [Security Policy](https://aui.kasadara.com/security/).
