/**
 * Reference-counted document scroll lock for modal overlays. Uses
 * scrollbar-gutter to avoid layout shift. CSSOM only (CSP-safe).
 */
import type { Disposer } from '@absoluteui/core';

let count = 0;
let saved: { overflow: string; gutter: string } | null = null;

export function lockScroll(doc: Document = document): Disposer {
  const root = doc.documentElement;
  if (count === 0) {
    saved = { overflow: root.style.getPropertyValue('overflow'), gutter: root.style.getPropertyValue('scrollbar-gutter') };
    root.style.setProperty('scrollbar-gutter', 'stable');
    root.style.setProperty('overflow', 'hidden');
  }
  count += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    count -= 1;
    if (count === 0 && saved) {
      const restore = (prop: string, value: string): void => {
        if (value) root.style.setProperty(prop, value);
        else root.style.removeProperty(prop);
      };
      restore('overflow', saved.overflow);
      restore('scrollbar-gutter', saved.gutter);
      saved = null;
    }
  };
}

export function isScrollLocked(): boolean {
  return count > 0;
}
