/**
 * Runtime, feature, preference and device detection (docs/PLAN-HELPERS.md section 3, section 6).
 * SSR-safe: nothing touches `window`, `document` or `navigator` at import time; every function
 * reads `globalThis` lazily and returns a documented default when the API is absent (Node, workers).
 */

/** Loosely typed view of the global object: every platform API may be missing. */
interface LooseGlobal {
  readonly window?: unknown;
  readonly document?: Partial<Document>;
  readonly navigator?: Partial<Navigator> & {
    readonly deviceMemory?: number;
    readonly standalone?: boolean;
    readonly userAgentData?: { readonly brands?: readonly { readonly brand: string; readonly version: string }[]; readonly mobile?: boolean; readonly platform?: string };
  };
  readonly matchMedia?: (query: string) => MediaQueryList;
  readonly addEventListener?: (type: string, listener: () => void) => void;
  readonly removeEventListener?: (type: string, listener: () => void) => void;
  readonly isSecureContext?: boolean;
  readonly innerWidth?: number;
  readonly innerHeight?: number;
  readonly visualViewport?: { readonly width: number; readonly height: number } | null;
  readonly process?: { readonly versions?: { readonly node?: string } };
  readonly importScripts?: unknown;
  readonly WorkerGlobalScope?: unknown;
  readonly Deno?: unknown;
  readonly Bun?: unknown;
}

const g = (): LooseGlobal => globalThis;
const has = (name: string): boolean => name in globalThis && (globalThis as Record<string, unknown>)[name] != null;
const isFn = (v: unknown): boolean => typeof v === 'function';

// ---------------------------------------------------------------------------
// Runtime

/** JavaScript runtime families recognised by {@link detectRuntime}. */
export type Runtime = 'browser' | 'worker' | 'node' | 'deno' | 'bun' | 'unknown';

/**
 * Detects the current runtime by capability, not by user-agent string.
 * @example
 * const cacheDir = detectRuntime() === 'node' ? '.cache' : undefined;
 * detectRuntime(); // e.g. 'browser' in a page, 'node' on the server
 */
export function detectRuntime(): Runtime {
  const G = g();
  if (G.Deno !== undefined) return 'deno';
  if (G.Bun !== undefined) return 'bun';
  if (typeof G.window === 'object' && G.window !== null && typeof G.document === 'object') return 'browser';
  if (isFn(G.importScripts) || (isFn(G.WorkerGlobalScope) && globalThis instanceof (G.WorkerGlobalScope as abstract new () => object))) return 'worker';
  if (typeof G.process?.versions?.node === 'string') return 'node';
  return 'unknown';
}

/**
 * True in a window (main thread) context.
 * @example
 * isBrowser(); // => true // in a page
 */
export function isBrowser(): boolean {
  return detectRuntime() === 'browser';
}

/**
 * True inside a dedicated, shared or service worker.
 * @example
 * if (isWorker()) postMessage({ type: 'ready' });
 */
export function isWorker(): boolean {
  return detectRuntime() === 'worker';
}

/**
 * True in Node.js (Bun and Deno report their own runtime).
 * @example
 * isNode(); // => false // in a browser page
 */
export function isNode(): boolean {
  return detectRuntime() === 'node';
}

/**
 * True in a server runtime (Node, Deno, Bun): the SSR case.
 * @example
 * const theme = isServer() ? 'light' : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
 */
export function isServer(): boolean {
  const r = detectRuntime();
  return r === 'node' || r === 'deno' || r === 'bun';
}

/**
 * True when the context is secure (HTTPS or localhost), which Web Crypto, clipboard and service workers require.
 * Server runtimes without the flag report true (they are not subject to the browser rule).
 * @example
 * if (!isSecureContext()) console.warn('Clipboard and encryption need HTTPS.');
 */
export function isSecureContext(): boolean {
  const flag = g().isSecureContext;
  return typeof flag === 'boolean' ? flag : detectRuntime() !== 'browser';
}

// ---------------------------------------------------------------------------
// Features

/** Features understood by {@link supports}. */
export type Feature =
  | 'indexedDB'
  | 'localStorage'
  | 'sessionStorage'
  | 'broadcastChannel'
  | 'serviceWorker'
  | 'webWorker'
  | 'webCrypto'
  | 'compressionStream'
  | 'decompressionStream'
  | 'fileSystemAccess'
  | 'clipboard'
  | 'clipboardItem'
  | 'share'
  | 'webShare'
  | 'intlSegmenter'
  | 'intlDurationFormat'
  | 'intlListFormat'
  | 'intlRelativeTimeFormat'
  | 'temporal'
  | 'resizeObserver'
  | 'intersectionObserver'
  | 'mutationObserver'
  | 'storageManager'
  | 'webLocks'
  | 'requestIdleCallback'
  | 'schedulerYield'
  | 'sendBeacon'
  | 'viewTransitions'
  | 'structuredClone'
  | 'abortSignalAny'
  | 'matchMedia';

function webStorageUsable(name: 'localStorage' | 'sessionStorage'): boolean {
  try {
    // Reading the property throws a SecurityError when storage is blocked.
    const s = (globalThis as Record<string, unknown>)[name] as Storage | undefined;
    return s != null && typeof s.getItem === 'function';
  } catch {
    return false;
  }
}

const FEATURES: Readonly<Record<Feature, () => boolean>> = {
  indexedDB: () => has('indexedDB'),
  localStorage: () => webStorageUsable('localStorage'),
  sessionStorage: () => webStorageUsable('sessionStorage'),
  broadcastChannel: () => has('BroadcastChannel'),
  serviceWorker: () => g().navigator?.serviceWorker != null,
  webWorker: () => has('Worker'),
  webCrypto: () => (globalThis.crypto as Partial<Crypto> | undefined)?.subtle != null,
  compressionStream: () => has('CompressionStream'),
  decompressionStream: () => has('DecompressionStream'),
  fileSystemAccess: () => has('showOpenFilePicker'),
  clipboard: () => g().navigator?.clipboard != null,
  clipboardItem: () => has('ClipboardItem'),
  share: () => isFn(g().navigator?.share),
  webShare: () => isFn(g().navigator?.share),
  intlSegmenter: () => 'Segmenter' in Intl,
  intlDurationFormat: () => 'DurationFormat' in Intl,
  intlListFormat: () => 'ListFormat' in Intl,
  intlRelativeTimeFormat: () => 'RelativeTimeFormat' in Intl,
  temporal: () => has('Temporal'),
  resizeObserver: () => has('ResizeObserver'),
  intersectionObserver: () => has('IntersectionObserver'),
  mutationObserver: () => has('MutationObserver'),
  storageManager: () => typeof g().navigator?.storage?.estimate === 'function',
  webLocks: () => g().navigator?.locks != null,
  requestIdleCallback: () => has('requestIdleCallback'),
  schedulerYield: () => isFn((globalThis as { scheduler?: { yield?: unknown } }).scheduler?.yield),
  sendBeacon: () => isFn(g().navigator?.sendBeacon),
  viewTransitions: () => isFn(g().document?.startViewTransition),
  structuredClone: () => has('structuredClone'),
  abortSignalAny: () => isFn((AbortSignal as { any?: unknown }).any),
  matchMedia: () => isFn(g().matchMedia),
};

/** Every feature name {@link supports} accepts. @example FEATURE_NAMES.filter(supports) */
export const FEATURE_NAMES: readonly Feature[] = Object.freeze(Object.keys(FEATURES) as Feature[]);

/**
 * Feature detection by capability; unknown names return false. `share` and `webShare` are aliases.
 * @example
 * const method = supports('compressionStream') ? 'deflate' : 'store';
 */
export function supports(feature: Feature): boolean {
  const check = Object.prototype.hasOwnProperty.call(FEATURES, feature) ? FEATURES[feature] : undefined;
  if (!check) return false;
  try {
    return check();
  } catch {
    return false;
  }
}

// ---------------------------------------------------------------------------
// User preferences (WCAG 2.3.3, 1.4.11, 1.4.3)

/** Accessibility and display preferences from CSS media features. */
export interface UserPreferences {
  /** `prefers-reduced-motion: reduce` (WCAG 2.3.3). */
  readonly reducedMotion: boolean;
  /** `prefers-reduced-transparency: reduce`. */
  readonly reducedTransparency: boolean;
  /** `prefers-contrast`. */
  readonly contrast: 'more' | 'less' | 'custom' | 'no-preference';
  /** `forced-colors: active` (Windows High Contrast and similar). */
  readonly forcedColors: boolean;
  /** `prefers-color-scheme`; `'light'` when unknown. */
  readonly colorScheme: 'light' | 'dark';
  /** `prefers-reduced-data: reduce`. */
  readonly reducedData: boolean;
}

/** Name of one preference in {@link UserPreferences}. */
export type PreferenceName = keyof UserPreferences;

const QUERIES: Readonly<Record<PreferenceName, readonly string[]>> = {
  reducedMotion: ['(prefers-reduced-motion: reduce)'],
  reducedTransparency: ['(prefers-reduced-transparency: reduce)'],
  contrast: ['(prefers-contrast: more)', '(prefers-contrast: less)', '(prefers-contrast: custom)'],
  forcedColors: ['(forced-colors: active)'],
  colorScheme: ['(prefers-color-scheme: dark)'],
  reducedData: ['(prefers-reduced-data: reduce)'],
};

/** Defaults returned when `matchMedia` is unavailable (SSR, workers). */
export const DEFAULT_USER_PREFERENCES: UserPreferences = Object.freeze({
  reducedMotion: false,
  reducedTransparency: false,
  contrast: 'no-preference',
  forcedColors: false,
  colorScheme: 'light',
  reducedData: false,
});

function mediaMatches(query: string): boolean {
  const mm = g().matchMedia;
  if (!isFn(mm) || mm === undefined) return false;
  try {
    return mm.call(globalThis, query).matches;
  } catch {
    return false;
  }
}

function readPreference<K extends PreferenceName>(name: K): UserPreferences[K] {
  switch (name) {
    case 'contrast':
      return (mediaMatches('(prefers-contrast: more)') ? 'more' : mediaMatches('(prefers-contrast: less)') ? 'less' : mediaMatches('(prefers-contrast: custom)') ? 'custom' : 'no-preference') as UserPreferences[K];
    case 'colorScheme':
      return (mediaMatches('(prefers-color-scheme: dark)') ? 'dark' : 'light') as UserPreferences[K];
    default: {
      const q = QUERIES[name][0];
      return (q !== undefined && mediaMatches(q)) as UserPreferences[K];
    }
  }
}

/**
 * Current preferences via `matchMedia`; {@link DEFAULT_USER_PREFERENCES} without it.
 * @example
 * const { reducedMotion } = userPreferences();
 * document.body.animate([{ opacity: 0 }, { opacity: 1 }], { duration: reducedMotion ? 0 : 200 });
 */
export function userPreferences(): UserPreferences {
  return {
    reducedMotion: readPreference('reducedMotion'),
    reducedTransparency: readPreference('reducedTransparency'),
    contrast: readPreference('contrast'),
    forcedColors: readPreference('forcedColors'),
    colorScheme: readPreference('colorScheme'),
    reducedData: readPreference('reducedData'),
  };
}

/**
 * Calls `callback` with the new value whenever one preference changes; returns an unsubscribe function.
 * A no-op (returning a no-op) without `matchMedia`.
 * @example
 * const stop = watchPreference('colorScheme', (scheme) => { document.documentElement.dataset['theme'] = scheme; });
 * stop();
 */
export function watchPreference<K extends PreferenceName>(name: K, callback: (value: UserPreferences[K]) => void): () => void {
  const mm = g().matchMedia;
  if (mm === undefined || !isFn(mm)) return () => undefined;
  let last = readPreference(name);
  const onChange = (): void => {
    const next = readPreference(name);
    if (next === last) return;
    last = next;
    callback(next);
  };
  const lists: MediaQueryList[] = [];
  for (const q of QUERIES[name]) {
    try {
      const list = mm.call(globalThis, q);
      list.addEventListener('change', onChange);
      lists.push(list);
    } catch {
      // Unsupported query in this engine: nothing to watch.
    }
  }
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
    lists.length = 0;
  };
}

// ---------------------------------------------------------------------------
// Connectivity and visibility

function listen(target: { addEventListener?: (t: string, l: () => void) => void; removeEventListener?: (t: string, l: () => void) => void } | undefined, types: readonly string[], listener: () => void): () => void {
  if (!target || !isFn(target.addEventListener)) return () => undefined;
  for (const t of types) target.addEventListener?.(t, listener);
  return () => {
    for (const t of types) target.removeEventListener?.(t, listener);
  };
}

/**
 * `navigator.onLine`; true when unknown. A true value means "has a network", not "the server is reachable".
 * @example
 * const pending: string[] = [];
 * if (!isOnline()) pending.push('/api/timesheets');
 */
export function isOnline(): boolean {
  const v = g().navigator?.onLine;
  return typeof v === 'boolean' ? v : true;
}

/**
 * Calls `callback(online)` on `online`/`offline` events; returns an unsubscribe function.
 * @example
 * const banner = document.createElement('div');
 * const stop = watchOnline((online) => { banner.hidden = online; });
 */
export function watchOnline(callback: (online: boolean) => void): () => void {
  return listen(g(), ['online', 'offline'], () => {
    callback(isOnline());
  });
}

/** Page visibility state. */
export type PageVisibility = 'visible' | 'hidden';

/**
 * `document.visibilityState` (`'visible'` without a document).
 * @example
 * const shouldPoll = pageVisibility() !== 'hidden';
 */
export function pageVisibility(): PageVisibility {
  return g().document?.visibilityState === 'hidden' ? 'hidden' : 'visible';
}

/**
 * Calls `callback(state)` on `visibilitychange`; returns an unsubscribe function.
 * @example
 * let paused = false;
 * const stop = watchVisibility((s) => { paused = s === 'hidden'; });
 */
export function watchVisibility(callback: (state: PageVisibility) => void): () => void {
  return listen(g().document, ['visibilitychange'], () => {
    callback(pageVisibility());
  });
}

// ---------------------------------------------------------------------------
// Locale, time zone, input

/**
 * Preferred locales (`navigator.languages`), falling back to the `Intl` default locale.
 * @example deviceLocales() // e.g. ['en-GB', 'en']
 */
export function deviceLocales(): string[] {
  const nav = g().navigator;
  const list = nav?.languages?.filter((l) => typeof l === 'string' && l.length > 0);
  if (list && list.length > 0) return [...list];
  if (typeof nav?.language === 'string' && nav.language.length > 0) return [nav.language];
  return [new Intl.DateTimeFormat().resolvedOptions().locale];
}

/**
 * First preferred locale.
 * @example
 * new Intl.NumberFormat(deviceLocale()).format(1234.5); // e.g. '1,234.5'
 */
export function deviceLocale(): string {
  return deviceLocales()[0] ?? 'en';
}

/**
 * IANA time zone of the device (`'UTC'` when unknown).
 * @example deviceTimeZone() // e.g. 'Asia/Kolkata'
 */
export function deviceTimeZone(): string {
  const tz = new Intl.DateTimeFormat().resolvedOptions().timeZone;
  return typeof tz === 'string' && tz.length > 0 ? tz : 'UTC';
}

/**
 * True when the locale's default clock is 24-hour (`hourCycle` h23/h24).
 * @example
 * prefers24Hour('de-DE'); // => true
 * prefers24Hour('en-US'); // => false
 */
export function prefers24Hour(locale?: string): boolean {
  const opts = new Intl.DateTimeFormat(locale ?? deviceLocale(), { hour: 'numeric' }).resolvedOptions();
  if (opts.hourCycle !== undefined) return opts.hourCycle === 'h23' || opts.hourCycle === 'h24';
  return opts.hour12 === false;
}

/**
 * True when the primary pointer is coarse (touch). Prefer designing for both inputs over branching on this.
 * @example
 * if (isTouchDevice()) document.documentElement.classList.add('touch');
 */
export function isTouchDevice(): boolean {
  return mediaMatches('(pointer: coarse)');
}

/** Viewport size in CSS pixels. */
export interface ViewportSize {
  readonly width: number;
  readonly height: number;
}

/**
 * Visual viewport size (falls back to the layout viewport; `{0, 0}` without a window).
 * @example const { width } = viewportSize();
 */
export function viewportSize(): ViewportSize {
  const G = g();
  const vv = G.visualViewport;
  if (vv) return { width: vv.width, height: vv.height };
  return { width: G.innerWidth ?? 0, height: G.innerHeight ?? 0 };
}

/**
 * True when running as an installed PWA (`display-mode: standalone`, or iOS `navigator.standalone`).
 * @example
 * const showInstallPrompt = !isStandalonePwa();
 */
export function isStandalonePwa(): boolean {
  return mediaMatches('(display-mode: standalone)') || g().navigator?.standalone === true;
}

// ---------------------------------------------------------------------------
// Storage and hardware

/** Result of {@link storageEstimate}. */
export interface StorageEstimateResult {
  /** Bytes used by this origin. */
  readonly usage: number;
  /** Bytes available to this origin. */
  readonly quota: number;
}

/**
 * Origin storage usage and quota (`navigator.storage.estimate`); `undefined` when unsupported or failing.
 * @example
 * const est = await storageEstimate();
 * if (est && est.usage / est.quota > 0.9) console.warn('Offline storage is almost full.');
 */
export async function storageEstimate(): Promise<StorageEstimateResult | undefined> {
  const sm = g().navigator?.storage;
  if (typeof sm?.estimate !== 'function') return undefined;
  try {
    const e = await sm.estimate();
    return { usage: e.usage ?? 0, quota: e.quota ?? 0 };
  } catch {
    return undefined;
  }
}

/**
 * Asks the browser not to evict this origin's storage; resolves whether persistence is granted.
 * @example
 * if (!(await requestPersistentStorage())) console.info('Offline data may be cleared by the browser.');
 */
export async function requestPersistentStorage(): Promise<boolean> {
  const sm = g().navigator?.storage;
  if (typeof sm?.persist !== 'function') return false;
  try {
    if (typeof sm.persisted === 'function' && (await sm.persisted())) return true;
    return await sm.persist();
  } catch {
    return false;
  }
}

/** Coarse hardware hints; fields are absent when the browser does not expose them. */
export interface HardwareHints {
  /** Logical processors (`navigator.hardwareConcurrency`). */
  readonly hardwareConcurrency?: number;
  /** Approximate device memory in GiB (`navigator.deviceMemory`, Chromium only, rounded for privacy). */
  readonly deviceMemory?: number;
}

/**
 * Hardware hints for sizing work pools or choosing lighter experiences.
 * @example const workers = Math.max(1, (hardwareHints().hardwareConcurrency ?? 2) - 1);
 */
export function hardwareHints(): HardwareHints {
  const nav = g().navigator;
  const out: { hardwareConcurrency?: number; deviceMemory?: number } = {};
  if (typeof nav?.hardwareConcurrency === 'number' && nav.hardwareConcurrency > 0) out.hardwareConcurrency = nav.hardwareConcurrency;
  if (typeof nav?.deviceMemory === 'number' && nav.deviceMemory > 0) out.deviceMemory = nav.deviceMemory;
  return out;
}

// ---------------------------------------------------------------------------
// User agent

/** Low-entropy User-Agent Client Hints. */
export interface UserAgentInfo {
  readonly brands: readonly { readonly brand: string; readonly version: string }[];
  readonly mobile: boolean;
  readonly platform: string;
}

/**
 * `navigator.userAgentData` (low-entropy values only); `undefined` when the browser does not support it.
 * Prefer {@link supports} over brand checks.
 * @example userAgentInfo()?.brands.some((b) => b.brand === 'Chromium')
 */
export function userAgentInfo(): UserAgentInfo | undefined {
  const d = g().navigator?.userAgentData;
  if (!d) return undefined;
  return {
    brands: (d.brands ?? []).map((b) => ({ brand: b.brand, version: b.version })),
    mobile: d.mobile === true,
    platform: typeof d.platform === 'string' ? d.platform : '',
  };
}

/**
 * The raw `navigator.userAgent` string (`''` when absent). For diagnostics and logs only:
 * never branch on it; user-agent strings are frozen, spoofed and unreliable. Use {@link supports} instead.
 * @example
 * import { createLogger } from '@absoluteui/services/logger';
 * createLogger().info('Client', { ua: rawUserAgentForDiagnostics() });
 */
export function rawUserAgentForDiagnostics(): string {
  const ua = g().navigator?.userAgent;
  return typeof ua === 'string' ? ua : '';
}
