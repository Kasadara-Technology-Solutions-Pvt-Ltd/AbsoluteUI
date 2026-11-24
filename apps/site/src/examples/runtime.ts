// Bootstrap for live example pages: applies the theme, density, direction, and locale
// chosen in the docs toolbar (query string), then reports the content height to the
// docs page so the frame fits its example.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'] as const;
const DENSITIES = ['compact', 'comfortable', 'spacious'] as const;
const DIRECTIONS = ['ltr', 'rtl'] as const;
const LOCALES = ['en-US', 'en-GB', 'en-IN', 'de-DE', 'fr-FR', 'ja-JP', 'ar-EG', 'hi-IN'] as const;

const params = new URLSearchParams(location.search);
function pick<T extends string>(key: string, allowed: readonly T[], fallback: T): T {
  const value = params.get(key);
  return allowed.find((a) => a === value) ?? fallback;
}

configureAbsoluteUI({
  common: {
    theme: pick('theme', THEMES, 'absolute-default'),
    density: pick('density', DENSITIES, 'comfortable'),
    direction: pick('dir', DIRECTIONS, 'ltr'),
    locale: pick('locale', LOCALES, 'en-US'),
  },
});
startThemeRuntime({ applyDirection: true });

let last = 0;
function report(): void {
  const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
  if (height === last || window.parent === window) return;
  last = height;
  window.parent.postMessage({ type: 'aui-example-height', height }, location.origin);
}
new ResizeObserver(report).observe(document.documentElement);
addEventListener('load', report);
