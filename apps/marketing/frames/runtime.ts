// Bootstrap for the marketing site's live frames (docs/PLAN-R4.md section 4.4, C9). Each frame
// is an isolated page under the library's strict CSP. The accent swatches re-derive the
// theme with the Theme Designer engine, so the preview shows real theming, not a mock.
import { configureAbsoluteUI } from '@absoluteui/core';
import { absoluteDark, absoluteDefault, registerTheme, startThemeRuntime } from '@absoluteui/theme';
import { deriveMode } from '@absoluteui/theme/designer';

export interface Accent {
  readonly id: string;
  readonly label: string;
  /** Primary seed (buttons, selection) and accent seed (links, focus, first chart series). */
  readonly primary: string;
  readonly accent: string;
}

export const ACCENTS: readonly Accent[] = [
  { id: 'cobalt', label: 'Cobalt', primary: '#1E40AF', accent: '#2563EB' },
  { id: 'teal', label: 'Teal', primary: '#0F766E', accent: '#0D9488' },
  { id: 'emerald', label: 'Emerald', primary: '#047857', accent: '#059669' },
  { id: 'violet', label: 'Violet', primary: '#5B21B6', accent: '#7C3AED' },
];

const registered = new Set<string>();

function themeName(accent: Accent, dark: boolean): string {
  const name = `mk-${accent.id}-${dark ? 'dark' : 'light'}`;
  if (!registered.has(name)) {
    const base = dark ? absoluteDark : absoluteDefault;
    const seeds = { ...absoluteDefault.seeds, primary: accent.primary, accent: accent.accent };
    registerTheme({ schemaVersion: 1, name, mode: base.mode, seeds, tokens: deriveMode(seeds, dark ? 'dark' : 'light'), contrastPairs: base.contrastPairs });
    registered.add(name);
  }
  return name;
}

/** Apply an accent (by id) in light or dark mode. Unknown ids fall back to the first accent. */
export function applyAccent(id: string, dark = false): void {
  const accent = ACCENTS.find((a) => a.id === id) ?? ACCENTS[0];
  if (!accent) return;
  configureAbsoluteUI({ common: { theme: themeName(accent, dark) } });
}

configureAbsoluteUI({ common: { theme: 'absolute-default', density: 'comfortable', direction: 'ltr', locale: 'en-US', timezone: 'UTC' } });
startThemeRuntime();

// Report the content height, so pages that size frames to their content can do so.
let last = 0;
function report(): void {
  const height = Math.ceil(document.documentElement.getBoundingClientRect().height);
  if (height === last || window.parent === window) return;
  last = height;
  window.parent.postMessage({ type: 'aui-frame-height', height }, location.origin);
}
new ResizeObserver(report).observe(document.documentElement);
addEventListener('load', report);
