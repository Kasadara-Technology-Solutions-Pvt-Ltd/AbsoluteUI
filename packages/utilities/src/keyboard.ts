/**
 * Keyboard navigation engine (SPEC section 13.1, section 13.2): list/grid index math,
 * roving tabindex, typeahead, and hotkey matching. RTL-aware.
 */
import type { Direction } from '@absoluteui/core';

export type Orientation = 'horizontal' | 'vertical' | 'both';

export interface ListNavigationOptions {
  orientation: Orientation;
  /** Wrap from last to first and vice versa. */
  loop: boolean;
  direction?: Direction;
  /** Items moved by PageUp/PageDown. Default: 10. */
  pageSize?: number;
  /** Disabled items are skipped. */
  isDisabled?: (index: number) => boolean;
}

/**
 * Next active index for a navigation key, or `null` when the key is not a
 * navigation key for this orientation. Returns `current` when no move is possible.
 */
export function getNextIndex(key: string, current: number, count: number, options: ListNavigationOptions): number | null {
  if (count <= 0) return null;
  const { orientation, loop } = options;
  const rtl = options.direction === 'rtl';
  const disabled = options.isDisabled ?? (() => false);
  const vertical = orientation !== 'horizontal';
  const horizontal = orientation !== 'vertical';

  const firstEnabled = (from: number, step: 1 | -1): number => {
    for (let i = from; i >= 0 && i < count; i += step) if (!disabled(i)) return i;
    return current;
  };
  const step = (delta: 1 | -1): number => {
    let i = current;
    for (let n = 0; n < count; n++) {
      i += delta;
      if (i < 0 || i >= count) {
        if (!loop) return current;
        i = (i + count) % count;
      }
      if (!disabled(i)) return i;
    }
    return current;
  };
  const page = (delta: 1 | -1): number => {
    const size = options.pageSize ?? 10;
    const target = Math.min(count - 1, Math.max(0, (current < 0 ? 0 : current) + delta * size));
    return disabled(target) ? firstEnabled(target, delta === 1 ? -1 : 1) : target;
  };

  switch (key) {
    case 'ArrowDown':
      return vertical ? step(1) : null;
    case 'ArrowUp':
      return vertical ? step(-1) : null;
    case 'ArrowRight':
      return horizontal ? step(rtl ? -1 : 1) : null;
    case 'ArrowLeft':
      return horizontal ? step(rtl ? 1 : -1) : null;
    case 'Home':
      return firstEnabled(0, 1);
    case 'End':
      return firstEnabled(count - 1, -1);
    case 'PageDown':
      return vertical ? page(1) : null;
    case 'PageUp':
      return vertical ? page(-1) : null;
    default:
      return null;
  }
}

export interface Typeahead {
  /**
   * Feed a printable character. Returns the index of the next item (after
   * `current`, wrapping) whose label starts with the accumulated query, or -1.
   */
  handle(char: string, labels: readonly string[], current: number, isDisabled?: (index: number) => boolean): number;
  reset(): void;
}

export function createTypeahead(timeoutMs = 500): Typeahead {
  let query = '';
  let timer: ReturnType<typeof setTimeout> | undefined;
  const collator = new Intl.Collator(undefined, { sensitivity: 'base', usage: 'search' });
  const startsWith = (label: string, q: string): boolean => collator.compare(label.slice(0, q.length), q) === 0;

  return {
    handle(char, labels, current, isDisabled = () => false) {
      clearTimeout(timer);
      timer = setTimeout(() => {
        query = '';
      }, timeoutMs);
      // Repeating the same character cycles through items starting with it.
      const repeated = query.length > 0 && query.replaceAll(char, '') === '';
      query = repeated ? char : query + char;
      const n = labels.length;
      const offset = repeated || query.length === 1 ? 1 : 0;
      for (let i = 0; i < n; i++) {
        const index = (Math.max(current, -1) + offset + i + n) % n;
        const label = labels[index];
        if (label !== undefined && !isDisabled(index) && startsWith(label.trim(), query)) return index;
      }
      return -1;
    },
    reset() {
      clearTimeout(timer);
      query = '';
    },
  };
}

/** True when the key event produces a single printable character without command modifiers. */
export function isPrintableKey(event: KeyboardEvent): boolean {
  return event.key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey;
}

export interface RovingTabindexOptions extends Omit<ListNavigationOptions, 'isDisabled'> {
  getItems: () => HTMLElement[];
  /** Called after keyboard navigation activates an item. */
  onActivate?: (item: HTMLElement, index: number) => void;
  typeahead?: boolean;
}

export interface RovingTabindex {
  setActive(index: number, focus?: boolean): void;
  readonly activeIndex: number;
  dispose(): void;
}

/** Roving tabindex (WAI-ARIA APG): one item in the tab sequence, arrows move between items. */
export function createRovingTabindex(container: HTMLElement, options: RovingTabindexOptions): RovingTabindex {
  let activeIndex = -1;
  const typeahead = options.typeahead ? createTypeahead() : null;
  const isDisabled = (items: HTMLElement[]) => (i: number) => items[i]?.getAttribute('aria-disabled') === 'true' || items[i]?.hasAttribute('disabled') === true;

  const apply = (index: number, focus: boolean): void => {
    const items = options.getItems();
    items.forEach((item, i) => {
      item.tabIndex = i === index ? 0 : -1;
    });
    activeIndex = index;
    const item = items[index];
    if (item && focus) {
      item.focus();
      options.onActivate?.(item, index);
    }
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    const items = options.getItems();
    const current = items.findIndex((el) => el === event.target || el.contains(event.target as Node));
    if (current < 0) return;
    let next = getNextIndex(event.key, current, items.length, { ...options, isDisabled: isDisabled(items) });
    if (next === null && typeahead && isPrintableKey(event)) {
      const found = typeahead.handle(event.key, items.map((el) => el.textContent), current, isDisabled(items));
      next = found >= 0 ? found : null;
    }
    if (next === null) return;
    event.preventDefault();
    apply(next, true);
  };

  container.addEventListener('keydown', onKeyDown);
  const initial = options.getItems().findIndex((el) => el.tabIndex === 0);
  apply(initial >= 0 ? initial : 0, false);

  return {
    setActive: (index, focus = false) => {
      apply(index, focus);
    },
    get activeIndex() {
      return activeIndex;
    },
    dispose() {
      container.removeEventListener('keydown', onKeyDown);
      typeahead?.reset();
    },
  };
}

function isApplePlatform(): boolean {
  // navigator.platform is deprecated; the user-agent string is the portable signal.
  return typeof navigator !== 'undefined' && /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(navigator.userAgent);
}

/**
 * Match a hotkey such as "Mod+K", "Shift+ArrowDown", "Alt+Enter".
 * "Mod" is Meta on Apple platforms and Control elsewhere.
 */
export function matchesHotkey(event: KeyboardEvent, hotkey: string): boolean {
  const parts = hotkey.split('+').map((p) => p.trim().toLowerCase());
  const key = parts.pop();
  if (!key) return false;
  const apple = isApplePlatform();
  const want = {
    ctrl: parts.includes('ctrl') || (parts.includes('mod') && !apple),
    meta: parts.includes('meta') || (parts.includes('mod') && apple),
    alt: parts.includes('alt'),
    shift: parts.includes('shift'),
  };
  return (
    event.key.toLowerCase() === key &&
    event.ctrlKey === want.ctrl &&
    event.metaKey === want.meta &&
    event.altKey === want.alt &&
    event.shiftKey === want.shift
  );
}
