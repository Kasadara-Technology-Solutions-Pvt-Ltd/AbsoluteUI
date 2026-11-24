/**
 * Shared observer abstractions (SPEC section 15.1: avoid excessive observers).
 * One ResizeObserver instance serves all subscribers. Without the observer APIs (server
 * rendering) nothing is observed: there is no layout, viewport, or later mutation to report.
 */
import type { Disposer } from '@absoluteui/core';

type ResizeCallback = (entry: ResizeObserverEntry) => void;

let resizeObserver: ResizeObserver | null = null;
const resizeCallbacks = new Map<Element, Set<ResizeCallback>>();

const noop: Disposer = () => undefined;

export function observeResize(target: Element, callback: ResizeCallback): Disposer {
  if (typeof ResizeObserver === 'undefined') return noop;
  resizeObserver ??= new ResizeObserver((entries) => {
    for (const entry of entries) {
      for (const cb of resizeCallbacks.get(entry.target) ?? []) cb(entry);
    }
  });
  let set = resizeCallbacks.get(target);
  if (!set) {
    set = new Set();
    resizeCallbacks.set(target, set);
    resizeObserver.observe(target);
  }
  set.add(callback);
  return () => {
    const current = resizeCallbacks.get(target);
    if (!current) return;
    current.delete(callback);
    if (current.size === 0) {
      resizeCallbacks.delete(target);
      resizeObserver?.unobserve(target);
    }
  };
}

/** Observe intersection with the viewport. */
export function observeIntersection(target: Element, callback: (entry: IntersectionObserverEntry) => void, options?: IntersectionObserverInit): Disposer {
  if (typeof IntersectionObserver === 'undefined') return noop;
  const observer = new IntersectionObserver((entries) => {
    for (const entry of entries) callback(entry);
  }, options);
  observer.observe(target);
  return () => {
    observer.disconnect();
  };
}

/** Observe DOM mutations. */
export function observeMutations(target: Node, callback: (records: MutationRecord[]) => void, options: MutationObserverInit = { childList: true, subtree: true }): Disposer {
  if (typeof MutationObserver === 'undefined') return noop;
  const observer = new MutationObserver(callback);
  observer.observe(target, options);
  return () => {
    observer.disconnect();
  };
}

/** Observe a media query. Callback runs immediately and on change; without a window (server) it reports no match once. */
export function observeMediaQuery(query: string, callback: (matches: boolean) => void): Disposer {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') {
    callback(false);
    return noop;
  }
  const mql = window.matchMedia(query);
  const handler = (): void => {
    callback(mql.matches);
  };
  handler();
  mql.addEventListener('change', handler);
  return () => {
    mql.removeEventListener('change', handler);
  };
}
