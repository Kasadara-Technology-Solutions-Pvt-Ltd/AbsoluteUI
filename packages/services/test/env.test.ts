import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  DEFAULT_USER_PREFERENCES,
  FEATURE_NAMES,
  detectRuntime,
  deviceLocale,
  deviceLocales,
  deviceTimeZone,
  hardwareHints,
  isBrowser,
  isNode,
  isOnline,
  isSecureContext,
  isServer,
  isStandalonePwa,
  isTouchDevice,
  isWorker,
  pageVisibility,
  prefers24Hour,
  rawUserAgentForDiagnostics,
  requestPersistentStorage,
  storageEstimate,
  supports,
  userAgentInfo,
  userPreferences,
  viewportSize,
  watchOnline,
  watchPreference,
  watchVisibility,
  type Feature,
} from '@absoluteui/services/env';

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

/** Fake matchMedia whose matching queries can be changed at runtime. */
function fakeMatchMedia(initial: string[]): { set: (q: string[]) => void } {
  let active = new Set(initial);
  const lists = new Map<string, { listeners: Set<() => void>; list: MediaQueryList }>();
  const mm = (query: string): MediaQueryList => {
    let entry = lists.get(query);
    if (!entry) {
      const listeners = new Set<() => void>();
      const list = {
        media: query,
        get matches() {
          return active.has(query);
        },
        addEventListener: (_: string, l: () => void) => listeners.add(l),
        removeEventListener: (_: string, l: () => void) => listeners.delete(l),
      } as unknown as MediaQueryList;
      entry = { listeners, list };
      lists.set(query, entry);
    }
    return entry.list;
  };
  vi.stubGlobal('matchMedia', mm);
  return {
    set(q) {
      active = new Set(q);
      for (const e of lists.values()) for (const l of e.listeners) l();
    },
  };
}

describe('runtime', () => {
  it('detects the browser', () => {
    expect(detectRuntime()).toBe('browser');
    expect(isBrowser()).toBe(true);
    expect(isWorker()).toBe(false);
    expect(isNode()).toBe(false);
    expect(isServer()).toBe(false);
    expect(isSecureContext()).toBe(true);
  });
  it('detects Deno and Bun by their globals', () => {
    vi.stubGlobal('Deno', {});
    expect(detectRuntime()).toBe('deno');
    vi.unstubAllGlobals();
    vi.stubGlobal('Bun', {});
    expect(detectRuntime()).toBe('bun');
    expect(isServer()).toBe(true);
  });
});

describe('supports', () => {
  it('detects Chromium features and rejects unknown names', () => {
    for (const f of ['indexedDB', 'localStorage', 'broadcastChannel', 'webCrypto', 'compressionStream', 'intlSegmenter', 'resizeObserver', 'structuredClone', 'matchMedia', 'webLocks'] as Feature[]) expect(supports(f)).toBe(true);
    expect(supports('nope' as Feature)).toBe(false);
    expect(supports('__proto__' as Feature)).toBe(false);
    expect(FEATURE_NAMES.length).toBeGreaterThan(20);
    for (const f of FEATURE_NAMES) expect(typeof supports(f)).toBe('boolean');
  });
  it('returns false when an API is removed', () => {
    vi.stubGlobal('BroadcastChannel', undefined);
    expect(supports('broadcastChannel')).toBe(false);
  });
});

describe('user preferences', () => {
  it('reads media features', () => {
    fakeMatchMedia(['(prefers-reduced-motion: reduce)', '(prefers-contrast: more)', '(forced-colors: active)', '(prefers-color-scheme: dark)']);
    expect(userPreferences()).toEqual({ reducedMotion: true, reducedTransparency: false, contrast: 'more', forcedColors: true, colorScheme: 'dark', reducedData: false });
  });
  it('returns defaults without matchMedia', () => {
    vi.stubGlobal('matchMedia', undefined);
    expect(userPreferences()).toEqual(DEFAULT_USER_PREFERENCES);
    expect(watchPreference('reducedMotion', () => undefined)).toBeTypeOf('function');
    expect(isTouchDevice()).toBe(false);
  });
  it('watches changes and unsubscribes', () => {
    const mm = fakeMatchMedia([]);
    const seen: unknown[] = [];
    const stop = watchPreference('contrast', (v) => seen.push(v));
    const stopScheme = watchPreference('colorScheme', (v) => seen.push(v));
    mm.set(['(prefers-contrast: less)']);
    mm.set(['(prefers-contrast: less)']);
    mm.set(['(prefers-color-scheme: dark)']);
    stop();
    stopScheme();
    mm.set(['(prefers-contrast: more)']);
    expect(seen).toEqual(['less', 'no-preference', 'dark']);
  });
  it('uses real matchMedia without throwing', () => {
    const p = userPreferences();
    expect(['light', 'dark']).toContain(p.colorScheme);
  });
});

describe('connectivity and visibility', () => {
  it('reports and watches online state', () => {
    expect(typeof isOnline()).toBe('boolean');
    const seen: boolean[] = [];
    const stop = watchOnline((o) => seen.push(o));
    window.dispatchEvent(new Event('offline'));
    stop();
    window.dispatchEvent(new Event('offline'));
    expect(seen.length).toBe(1);
  });
  it('reports and watches visibility', () => {
    expect(pageVisibility()).toBe(document.visibilityState === 'hidden' ? 'hidden' : 'visible');
    const seen: string[] = [];
    const stop = watchVisibility((s) => seen.push(s));
    document.dispatchEvent(new Event('visibilitychange'));
    stop();
    document.dispatchEvent(new Event('visibilitychange'));
    expect(seen.length).toBe(1);
  });
});

describe('device', () => {
  it('locale, time zone and hour cycle', () => {
    expect(deviceLocales().length).toBeGreaterThan(0);
    expect(deviceLocale()).toBe(deviceLocales()[0]);
    expect(deviceTimeZone()).toMatch(/\S/);
    expect(prefers24Hour('de-DE')).toBe(true);
    expect(prefers24Hour('en-US')).toBe(false);
    expect(prefers24Hour('en-US-u-hc-h23')).toBe(true);
  });
  it('falls back when navigator.languages is empty', () => {
    vi.spyOn(navigator, 'languages', 'get').mockReturnValue([]);
    expect(deviceLocales()).toEqual([navigator.language]);
  });
  it('viewport, hardware, PWA, UA hints', () => {
    const v = viewportSize();
    expect(v.width).toBeGreaterThan(0);
    expect(hardwareHints().hardwareConcurrency).toBeGreaterThan(0);
    expect(isStandalonePwa()).toBe(false);
    const ua = userAgentInfo();
    if (ua) expect(Array.isArray(ua.brands)).toBe(true);
    expect(rawUserAgentForDiagnostics()).toContain('Mozilla');
  });
  it('storage estimate and persistence', async () => {
    const est = await storageEstimate();
    expect(est?.quota).toBeGreaterThan(0);
    expect(typeof (await requestPersistentStorage())).toBe('boolean');
  });
});

describe('SSR-style degradation', () => {
  it('degrades when navigator/document APIs are missing', async () => {
    vi.stubGlobal('navigator', undefined);
    expect(isOnline()).toBe(true);
    expect(await storageEstimate()).toBeUndefined();
    expect(await requestPersistentStorage()).toBe(false);
    expect(hardwareHints()).toEqual({});
    expect(userAgentInfo()).toBeUndefined();
    expect(rawUserAgentForDiagnostics()).toBe('');
    expect(deviceLocales().length).toBe(1);
    expect(supports('clipboard')).toBe(false);
  });
});
