---
title: Installation
description: Install AbsoluteUI, load the theme and component styles, and start the theme runtime.
---

## Install

```sh
npm install @absoluteui/components @absoluteui/core @absoluteui/theme
```

`@absoluteui/utilities`, `@absoluteui/icons`, and `@absoluteui/helpers` are installed as dependencies of the components and core. The packages are ES modules; any bundler that understands the `exports` field (Vite, esbuild, Rollup, webpack 5, Parcel) resolves them.

The helper and service packages also work on their own, without any components, including in server code:

```sh
npm install @absoluteui/helpers
```

`@absoluteui/services` is in preview and not yet published to npm.

See [Helpers and services](/docs/guides/helpers-and-services/).

## Load the styles

CSS is never injected by JavaScript. Import the theme once, then the stylesheet of each component you use:

```ts
import '@absoluteui/theme/absolute-default.css';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/text-input/style.css';
```

- `absolute-default.css` contains every built-in theme (default, dark, high contrast) and the density variants, selected by attributes on the root element.
- Composite components list every stylesheet they need at the top of their page. Date Picker, for example, also needs the Date Input and Calendar stylesheets.
- All AbsoluteUI rules live in the `aui.base`, `aui.components`, and `aui.theme` cascade layers, so your own unlayered styles always win without `!important`.

### Fonts

The default font stack starts with Noto Sans and falls back to system fonts, so nothing is downloaded unless you choose to. To load Noto Sans from Google Fonts, import `@absoluteui/theme/fonts/noto-sans.css` and allow `https://fonts.googleapis.com` in `style-src` and `https://fonts.gstatic.com` in `font-src`. A hosted font service receives each visitor's IP address, so self-hosting the font files with `@font-face` is often the better choice.

## Start the theme runtime

```ts
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';

configureAbsoluteUI({ common: { locale: 'en-IN', timezone: 'Asia/Kolkata', theme: 'absolute-default' } });
const stopTheme = startThemeRuntime({ applyDirection: true });
```

The runtime writes the theme, density, and animation mode to `<html>` and keeps them in sync with the configuration. With `applyDirection: true` it also sets `dir`. Call the returned function to stop it.

## Create components

```ts
import { TextInput } from '@absoluteui/components/text-input';

const host = document.querySelector<HTMLElement>('#email');
if (host) {
  const input = TextInput.create(host, { label: 'Email', type: 'email', required: true, autocomplete: 'email' });
  host.addEventListener('aui-input', () => console.log(input.value));
}
```

- `create(host, options)` renders into `host`, replacing its children. Invalid options throw an `AbsoluteUIError` before anything is rendered.
- `update(options)` merges new options. Options marked "set at creation only" in the API reference cannot change.
- Events are `CustomEvent`s named `aui-*`, dispatched from the host; their `detail` types are exported next to each component.
- `destroy()` removes the rendering, listeners, form registration, and subscriptions.

## Browser support

AbsoluteUI supports Chrome and Edge 116, Firefox 125, Safari 17, and Safari on iOS and iPadOS 18.3 or later, and ships no polyfills. The end-to-end suite runs in Chromium, Firefox, and WebKit. See [Browser support](/docs/quality/browser-support/) for the full matrix, the features behind each minimum version, and the fallbacks.

## Server rendering

Components need a DOM. Import them anywhere (the modules have no side effects), but create them only in the browser, after the host element exists. Configuration and the theme runtime also belong in browser code.
