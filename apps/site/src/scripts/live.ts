// Live example toolbar: theme, density, direction, and locale for every example
// frame on the page (kept in sync), plus frame auto-height reported by the example page.
const OPTIONS = {
  theme: [
    ['auto', 'Match site'],
    ['absolute-default', 'Default'],
    ['absolute-dark', 'Dark'],
    ['absolute-high-contrast', 'High contrast'],
  ],
  density: [
    ['comfortable', 'Comfortable'],
    ['compact', 'Compact'],
    ['spacious', 'Spacious'],
  ],
  dir: [
    ['ltr', 'Left to right'],
    ['rtl', 'Right to left'],
  ],
  locale: [
    ['en-US', 'English (US)'],
    ['en-GB', 'English (UK)'],
    ['en-IN', 'English (India)'],
    ['hi-IN', 'Hindi'],
    ['de-DE', 'German'],
    ['fr-FR', 'French'],
    ['ja-JP', 'Japanese'],
    ['ar-EG', 'Arabic'],
  ],
} as const;
type Key = keyof typeof OPTIONS;
const KEYS = Object.keys(OPTIONS) as Key[];
const LABELS: Record<Key, string> = { theme: 'Theme', density: 'Density', dir: 'Direction', locale: 'Locale' };
const STORAGE = 'aui-live-settings';

function load(): Record<Key, string> {
  const values: Record<Key, string> = { theme: 'auto', density: 'comfortable', dir: 'ltr', locale: 'en-US' };
  try {
    const raw = localStorage.getItem(STORAGE);
    const parsed: unknown = raw ? JSON.parse(raw) : null;
    if (typeof parsed === 'object' && parsed !== null) {
      for (const key of KEYS) {
        const value = (parsed as Record<string, unknown>)[key];
        if (typeof value === 'string' && OPTIONS[key].some(([v]) => v === value)) values[key] = value;
      }
    }
  } catch {
    // Storage unavailable or corrupt: defaults.
  }
  return values;
}

const settings = load();
const frames: HTMLIFrameElement[] = [];
const selects: Record<Key, HTMLSelectElement[]> = { theme: [], density: [], dir: [], locale: [] };

function exampleUrl(base: string): string {
  const url = new URL(base, location.href);
  const theme = settings.theme === 'auto' ? (document.documentElement.dataset.theme === 'light' ? 'absolute-default' : 'absolute-dark') : settings.theme;
  // Merged into the frame's own parameters (a showcase's `focus`, R20-26), never replacing them.
  for (const [key, value] of Object.entries({ theme, density: settings.density, dir: settings.dir, locale: settings.locale })) url.searchParams.set(key, value);
  return url.pathname + url.search;
}

function refresh(): void {
  for (const frame of frames) {
    const next = exampleUrl(frame.dataset.base ?? '');
    if (frame.getAttribute('src') !== next) frame.setAttribute('src', next);
  }
  for (const key of KEYS) for (const s of selects[key]) s.value = settings[key];
}

function toolbar(frame: HTMLIFrameElement): HTMLElement {
  const bar = document.createElement('div');
  bar.className = 'aui-live__bar';
  for (const key of KEYS) {
    const label = document.createElement('label');
    label.append(LABELS[key]);
    const select = document.createElement('select');
    for (const [value, text] of OPTIONS[key]) select.append(new Option(text, value));
    select.value = settings[key];
    select.addEventListener('change', () => {
      settings[key] = select.value;
      try {
        localStorage.setItem(STORAGE, JSON.stringify(settings));
      } catch {
        // Not persisted.
      }
      refresh();
    });
    selects[key].push(select);
    label.append(select);
    bar.append(label);
  }
  const open = document.createElement('a');
  open.textContent = 'Open in new tab';
  open.target = '_blank';
  open.rel = 'noopener';
  const sync = (): void => {
    open.href = frame.getAttribute('src') ?? '';
  };
  open.addEventListener('pointerdown', sync);
  open.addEventListener('focus', sync);
  bar.append(open);
  sync();
  return bar;
}

function init(): void {
  for (const figure of document.querySelectorAll<HTMLElement>('figure.aui-live')) {
    const frame = figure.querySelector('iframe');
    if (!frame || frames.includes(frame)) continue;
    frame.dataset.base = frame.dataset.src ?? frame.getAttribute('src') ?? '';
    const min = Number(figure.dataset.minHeight);
    figure.style.setProperty('--aui-live-min', `${Number.isFinite(min) && min > 0 ? min : 180}px`);
    frames.push(frame);
    figure.prepend(toolbar(frame));
  }
  refresh();
}

addEventListener('message', (event: MessageEvent<unknown>) => {
  if (event.origin !== location.origin) return;
  const data = event.data;
  if (typeof data !== 'object' || data === null || (data as { type?: unknown }).type !== 'aui-example-height') return;
  const height = (data as { height?: unknown }).height;
  if (typeof height !== 'number' || !Number.isFinite(height) || height < 0) return;
  const frame = frames.find((f) => f.contentWindow === event.source);
  frame?.closest<HTMLElement>('figure')?.style.setProperty('--aui-live-height', `${Math.min(Math.ceil(height), 2400)}px`);
});

new MutationObserver(() => {
  if (settings.theme === 'auto') refresh();
}).observe(document.documentElement, { attributes: true, attributeFilter: ['data-theme'] });

if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init);
else init();
