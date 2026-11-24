/**
 * Timeline (R20 P10). An activity or event history: items with a time (an exact Instant or an
 * all-day PlainDate), a title, a description, an icon or avatar, a status tone (shown by the
 * marker icon and a status word, never by color alone), and keyboard-reachable actions.
 * Vertical or horizontal, items on one side or alternating, grouped by day in the configured
 * timezone ("Today", "Yesterday", weekday names; holidays and non-working days are named with
 * a business calendar). Older items collapse behind "Show N older", and a host-supplied
 * `loadMore` fetches more with loading, error, and retry states. Semantics: an ordered list
 * (`ol`), day groups as list items with a heading and a nested list; a horizontal timeline is
 * a focusable, labelled scroll region.
 */
import {
  configurationError,
  createId,
  defineComponentConfig,
  DisposableGroup,
  emit,
  formatInstant,
  formatNumber,
  formatPlainDate,
  getMessage,
  instant,
  instantToString,
  plainDateToString,
  registerMessages,
  toPlainDateTime,
  validators,
  type Instant,
  type PlainDate,
} from '@absoluteui/core';
import { daysBetween, formatRelative, formatRelativeDate, isPlainDate } from '@absoluteui/helpers/date';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { circleIcon } from '@absoluteui/icons/set/circle';
import { announce } from '@absoluteui/utilities';
import { Avatar, isSafeImageSrc } from '../avatar/avatar.js';
import type { BusinessCalendarEngine } from '../business-calendar/engine.js';
import { Button } from '../button/button.js';
import { isBusinessCalendar } from '../internal/business-days.js';
import { isSafeHref } from '../internal/href.js';

export type TimelineTone = 'neutral' | 'info' | 'success' | 'warning' | 'error';
export type TimelineOrientation = 'vertical' | 'horizontal';
export type TimelineLayout = 'start' | 'alternate';
export type TimelineTimeFormat = 'relative' | 'absolute';
export type TimelineOrder = 'newest-first' | 'oldest-first';

export interface TimelineConfig {
  orientation: TimelineOrientation;
  /** `alternate` places items on both sides of the line (vertical timelines). */
  layout: TimelineLayout;
  timeFormat: TimelineTimeFormat;
  groupByDay: boolean;
}

type Inherited = 'locale' | 'timezone';

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    timeline: TimelineConfig & { locale: string; timezone: string };
  }
}

const TONES: readonly TimelineTone[] = ['neutral', 'info', 'success', 'warning', 'error'];
const ORIENTATIONS: readonly TimelineOrientation[] = ['vertical', 'horizontal'];
const LAYOUTS: readonly TimelineLayout[] = ['start', 'alternate'];
const FORMATS: readonly TimelineTimeFormat[] = ['relative', 'absolute'];

export const timelineConfig = defineComponentConfig<TimelineConfig, Inherited>(
  'timeline',
  {
    orientation: { default: 'vertical', expected: '"vertical" | "horizontal"', validate: validators.oneOf(ORIENTATIONS) },
    layout: { default: 'start', expected: '"start" | "alternate"', validate: validators.oneOf(LAYOUTS) },
    timeFormat: { default: 'absolute', expected: '"relative" | "absolute"', validate: validators.oneOf(FORMATS) },
    groupByDay: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale', 'timezone'],
);

registerMessages('timeline', 'en', {
  empty: 'No activity yet.',
  showOlder: 'Show {count} older',
  showFewer: 'Show fewer',
  loadMore: 'Load older',
  loading: 'Loading older items',
  loadError: 'Could not load older items.',
  retry: 'Retry',
  loaded: 'Loaded {count} older items',
  noMore: 'No older items',
  shown: 'Showing {count} older items',
  hidden: 'Older items hidden',
  allDay: 'All day',
  undated: 'No date',
  dayHoliday: '{day} ({holiday})',
  dayNonWorking: '{day} (non-working day)',
  info: 'Information',
  success: 'Success',
  warning: 'Warning',
  error: 'Error',
});

export interface TimelineIcons {
  neutral: IconRef;
  info: IconRef;
  success: IconRef;
  warning: IconRef;
  error: IconRef;
  showOlder: IconRef;
  retry: IconRef;
}

const DEFAULT_ICONS: TimelineIcons = {
  neutral: circleIcon,
  info: 'info',
  success: 'check-circle',
  warning: 'alert-triangle',
  error: 'alert-circle',
  showOlder: 'chevron-down',
  retry: 'refresh',
};

/** An action button on an item, such as "Download" or "Undo". */
export interface TimelineAction {
  id: string;
  label: string;
  icon?: IconRef;
}

/** The person (or system) shown as the item's avatar instead of an icon. */
export interface TimelineAvatar {
  name: string;
  /** http(s), relative, blob:, or a raster data: URL. */
  src?: string;
}

export interface TimelineItem {
  /** Unique, stable id (used by events). */
  id: string;
  /** Short statement of the event, rendered as text. */
  title: string;
  /** When it happened: an exact instant, or a PlainDate for all-day items. Undated items group under "No date". */
  time?: Instant | PlainDate;
  description?: string;
  /** Status tone; also announced and shown as a word. Default `neutral`. */
  tone?: TimelineTone;
  /** Status word instead of the tone's default ("Approved" instead of "Success"). */
  status?: string;
  /** Marker icon (default: the tone's icon). */
  icon?: IconRef;
  /** An avatar instead of the icon. */
  avatar?: TimelineAvatar;
  /** Makes the title a link (http(s) or relative URL). */
  href?: string;
  actions?: readonly TimelineAction[];
}

/** Context of `loadMore`: aborted when the timeline is destroyed. */
export interface TimelineLoadContext {
  readonly signal: AbortSignal;
  /** The oldest item loaded so far, or null. */
  readonly oldest: TimelineItem | null;
}

export interface TimelineOptions extends Partial<TimelineConfig> {
  /** Accessible name of the list (and of the scroll region when horizontal), such as "Document activity". */
  label: string;
  items: readonly TimelineItem[];
  /** Order of `items`; older items are collapsed and loaded at the older end. Default `newest-first`. */
  order?: TimelineOrder;
  /** Show this many items and collapse the older rest behind "Show N older"; null shows all. Default null. */
  initialVisible?: number | null;
  /** Fetch older items (appended at the older end). */
  loadMore?: ((context: TimelineLoadContext) => Promise<readonly TimelineItem[]>) | null;
  /** More items can be loaded. Default: true when `loadMore` is set. */
  hasMore?: boolean;
  /** Names holidays and non-working days in day headings. */
  businessCalendar?: BusinessCalendarEngine | null;
  /** Heading level of day headings. Default 3. */
  headingLevel?: 2 | 3 | 4 | 5 | 6;
  /** Reference instant for relative times and "Today" (default: now). */
  now?: Instant;
  /** Text when there are no items. */
  empty?: string;
  locale?: string;
  timezone?: string;
  icons?: Partial<TimelineIcons>;
}

/** `aui-action` detail. */
export interface TimelineActionDetail {
  itemId: string;
  actionId: string;
  item: TimelineItem;
}

/** `aui-toggle` detail: older items shown (`expanded`) or collapsed again. */
export interface TimelineToggleDetail {
  expanded: boolean;
}

/** `aui-load-more` detail: items appended by `loadMore`. */
export interface TimelineLoadMoreDetail {
  items: TimelineItem[];
  hasMore: boolean;
}

/** `aui-load-error` detail. */
export interface TimelineLoadErrorDetail {
  error: unknown;
}

interface DayGroup {
  key: string;
  date: PlainDate | null;
  items: { item: TimelineItem; index: number }[];
}

const MAX_ITEMS = 10_000;

export class Timeline {
  readonly host: HTMLElement;
  #options: TimelineOptions;
  #loaded: TimelineItem[] = [];
  #expanded = false;
  #loading = false;
  #error = false;
  #hasMore: boolean;
  #focusId: string | null = null;
  readonly #doc: Document;
  readonly #id = createId('aui-timeline');
  readonly #scroller: HTMLDivElement;
  readonly #list: HTMLOListElement;
  readonly #emptyEl: HTMLParagraphElement;
  readonly #footer: HTMLDivElement;
  readonly #errorEl: HTMLParagraphElement;
  #buttons: Button[] = [];
  #avatars: Avatar[] = [];
  #footerButtons: Button[] = [];
  readonly #group = new DisposableGroup();
  #renderGroup = new DisposableGroup();
  #abort: AbortController | null = null;

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: TimelineOptions): Timeline {
    return new Timeline(host, options);
  }

  private constructor(host: HTMLElement, options: TimelineOptions) {
    Timeline.#assert(options, host.ownerDocument.baseURI);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#hasMore = options.hasMore ?? (options.loadMore != null);
    const doc = this.#doc;
    this.#scroller = doc.createElement('div');
    this.#scroller.className = 'aui-timeline__scroller';
    this.#list = doc.createElement('ol');
    this.#list.className = 'aui-timeline__list';
    this.#list.id = `${this.#id}-list`;
    this.#emptyEl = doc.createElement('p');
    this.#emptyEl.className = 'aui-timeline__empty';
    this.#footer = doc.createElement('div');
    this.#footer.className = 'aui-timeline__footer';
    this.#errorEl = doc.createElement('p');
    this.#errorEl.className = 'aui-timeline__error';
    this.#scroller.append(this.#list);
    // Render first: invalid configuration throws before the host is touched.
    this.#render();
    host.classList.add('aui-timeline');
    host.replaceChildren(this.#scroller, this.#emptyEl, this.#footer);
    this.#group.add(timelineConfig.subscribe(() => {
      this.#render();
    }));
    // Home and End scroll the horizontal region to its inline start and end: browsers map
    // them to vertical scrolling only, which does nothing in a horizontal strip.
    this.#group.listen(this.#scroller, 'keydown', (event) => {
      this.#onScrollerKey(event);
    });
  }

  #onScrollerKey(event: KeyboardEvent): void {
    const scroller = this.#scroller;
    if (event.target !== scroller || event.defaultPrevented) return;
    if (event.key !== 'Home' && event.key !== 'End') return;
    if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
    if (this.#config().orientation !== 'horizontal') return;
    const max = scroller.scrollWidth - scroller.clientWidth;
    if (max <= 0) return;
    event.preventDefault();
    // In right-to-left layouts the inline end has a negative scrollLeft.
    const rtl = getComputedStyle(scroller).direction === 'rtl';
    const left = event.key === 'Home' ? 0 : rtl ? -max : max;
    scroller.scrollTo({ left, behavior: 'auto' });
  }

  get options(): Readonly<TimelineOptions> {
    return this.#options;
  }

  /** Every item in display order, including items added by `loadMore`. */
  get items(): TimelineItem[] {
    return this.#all();
  }

  /** Older items are shown (with `initialVisible`). */
  get expanded(): boolean {
    return this.#expanded;
  }

  get hasMore(): boolean {
    return this.#hasMore;
  }

  get loading(): boolean {
    return this.#loading;
  }

  /** Show (true) or collapse (false) the older items. No event. */
  setExpanded(expanded: boolean): void {
    if (this.#expanded === expanded) return;
    this.#expanded = expanded;
    this.#render();
  }

  /** Call `loadMore` now (as the "Load older" button does). Resolves when it settles. */
  async loadOlder(): Promise<void> {
    const load = this.#options.loadMore;
    if (!load || this.#loading || this.#group.disposed) return;
    this.#loading = true;
    this.#error = false;
    this.#abort = new AbortController();
    const signal = this.#abort.signal;
    this.#render();
    const locale = this.#config().locale;
    announce(this.#m('loading'), 'polite', this.#doc);
    const all = this.#all();
    const oldest = (this.#order() === 'newest-first' ? all[all.length - 1] : all[0]) ?? null;
    try {
      const result = await load({ signal, oldest });
      if (this.#stale(signal)) return;
      const added = [...result];
      Timeline.#assertItems(added, 'loadMore()', this.#doc.baseURI, new Set(all.map((i) => i.id)));
      this.#loaded = this.#order() === 'newest-first' ? [...this.#loaded, ...added] : [...added, ...this.#loaded];
      if (added.length === 0) this.#hasMore = false;
      this.#loading = false;
      this.#expanded = true;
      const first = added[0];
      if (first) this.#focusId = first.id;
      this.#render();
      announce(added.length === 0 ? this.#m('noMore') : this.#m('loaded', { count: formatNumber(added.length, {}, locale) }), 'polite', this.#doc);
      emit(this.host, 'aui-load-more', { items: added, hasMore: this.#hasMore } satisfies TimelineLoadMoreDetail);
    } catch (error) {
      if (this.#stale(signal)) return;
      this.#loading = false;
      this.#error = true;
      this.#render();
      announce(this.#m('loadError'), 'assertive', this.#doc);
      emit(this.host, 'aui-load-error', { error } satisfies TimelineLoadErrorDetail);
    } finally {
      this.#settled(signal);
    }
  }

  /** The load was aborted (destroy) or the timeline is gone. */
  #stale(signal: AbortSignal): boolean {
    return signal.aborted || this.#group.disposed;
  }

  #settled(signal: AbortSignal): void {
    if (this.#abort !== null && this.#abort.signal === signal) this.#abort = null;
  }

  update(options: Partial<TimelineOptions>): void {
    const next = { ...this.#options, ...options };
    Timeline.#assert(next, this.#doc.baseURI);
    const previous = { options: this.#options, hasMore: this.#hasMore, loaded: this.#loaded };
    this.#options = next;
    if ('items' in options) this.#loaded = [];
    if ('hasMore' in options || 'loadMore' in options) this.#hasMore = next.hasMore ?? (next.loadMore != null);
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#hasMore = previous.hasMore;
      this.#loaded = previous.loaded;
      this.#render();
      throw error;
    }
  }

  destroy(): void {
    this.#abort?.abort();
    this.#group.dispose();
    this.#disposeRender();
    for (const b of this.#footerButtons) b.destroy();
    this.#footerButtons = [];
    this.host.replaceChildren();
    this.host.classList.remove('aui-timeline', 'aui-timeline--vertical', 'aui-timeline--horizontal', 'aui-timeline--alternate', 'aui-timeline--grouped');
  }

  static #fail(property: string, expected: string): never {
    throw configurationError('TIMELINE_OPTIONS', 'Invalid timeline options.', { component: 'timeline', property: `timeline.${property}`, expected });
  }

  static #assert(o: TimelineOptions, baseURI: string): void {
    const fail = Timeline.#fail;
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const items: unknown = o.items;
    if (!Array.isArray(items)) fail('items', 'TimelineItem[]');
    Timeline.#assertItems(o.items, 'items', baseURI, new Set());
    const order: unknown = o.order;
    if (order !== undefined && order !== 'newest-first' && order !== 'oldest-first') fail('order', '"newest-first" | "oldest-first"');
    const iv: unknown = o.initialVisible;
    if (iv != null && !(typeof iv === 'number' && Number.isInteger(iv) && iv >= 1)) fail('initialVisible', 'integer >= 1 or null');
    if (o.loadMore != null && typeof o.loadMore !== 'function') fail('loadMore', '(context) => Promise<TimelineItem[]> or null');
    if (o.hasMore !== undefined && typeof o.hasMore !== 'boolean') fail('hasMore', 'boolean');
    if (o.businessCalendar != null && !isBusinessCalendar(o.businessCalendar)) fail('businessCalendar', 'BusinessCalendarEngine (createBusinessCalendar) or null');
    const level: unknown = o.headingLevel;
    if (level !== undefined && !(typeof level === 'number' && Number.isInteger(level) && level >= 2 && level <= 6)) fail('headingLevel', '2 | 3 | 4 | 5 | 6');
    if (o.now !== undefined && !Timeline.#isInstant(o.now)) fail('now', 'Instant');
    if (o.empty !== undefined && typeof o.empty !== 'string') fail('empty', 'string');
  }

  static #isInstant(v: unknown): v is Instant {
    return validators.isRecord(v) && v.kind === 'Instant' && typeof v.epochMilliseconds === 'number' && Number.isFinite(v.epochMilliseconds);
  }

  static #assertItems(items: readonly TimelineItem[], where: string, baseURI: string, seen: Set<string>): void {
    const fail = Timeline.#fail;
    if (items.length > MAX_ITEMS) fail(where, `at most ${String(MAX_ITEMS)} items`);
    const ids = new Set(seen);
    items.forEach((raw: unknown, i) => {
      const p = `${where}[${String(i)}]`;
      const it: Record<string, unknown> = validators.isRecord(raw) ? raw : fail(p, 'TimelineItem');
      const id = typeof it.id === 'string' && it.id !== '' ? it.id : fail(`${p}.id`, 'non-empty string');
      if (ids.has(id)) fail(`${p}.id`, 'unique id');
      ids.add(id);
      if (typeof it.title !== 'string' || it.title.trim() === '') fail(`${p}.title`, 'non-empty string');
      if (it.time !== undefined && !Timeline.#isInstant(it.time) && !isPlainDate(it.time)) fail(`${p}.time`, 'Instant or PlainDate');
      if (it.description !== undefined && typeof it.description !== 'string') fail(`${p}.description`, 'string');
      if (it.status !== undefined && typeof it.status !== 'string') fail(`${p}.status`, 'string');
      if (it.tone !== undefined && !(typeof it.tone === 'string' && (TONES as readonly string[]).includes(it.tone))) fail(`${p}.tone`, '"neutral" | "info" | "success" | "warning" | "error"');
      if (it.href !== undefined && (typeof it.href !== 'string' || !isSafeHref(it.href, baseURI))) fail(`${p}.href`, 'http(s) or relative URL');
      if (it.avatar !== undefined) {
        const a = it.avatar;
        if (!validators.isRecord(a) || typeof a.name !== 'string' || a.name.trim() === '') fail(`${p}.avatar.name`, 'non-empty string');
        if (validators.isRecord(a) && a.src !== undefined && !isSafeImageSrc(a.src)) fail(`${p}.avatar.src`, 'http(s), relative, blob:, or raster data: URL');
      }
      if (it.actions !== undefined) {
        const list: readonly unknown[] = Array.isArray(it.actions) ? it.actions : fail(`${p}.actions`, 'TimelineAction[]');
        for (const [j, a] of list.entries()) {
          if (!validators.isRecord(a) || typeof a.id !== 'string' || a.id === '' || typeof a.label !== 'string' || a.label.trim() === '') fail(`${p}.actions[${String(j)}]`, '{ id: string; label: string; icon?: IconRef }');
        }
      }
    });
  }

  #config(): Readonly<TimelineConfig & { locale: string; timezone: string }> {
    const o = this.#options;
    return timelineConfig.resolve({
      ...(o.orientation === undefined ? {} : { orientation: o.orientation }),
      ...(o.layout === undefined ? {} : { layout: o.layout }),
      ...(o.timeFormat === undefined ? {} : { timeFormat: o.timeFormat }),
      ...(o.groupByDay === undefined ? {} : { groupByDay: o.groupByDay }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.timezone === undefined ? {} : { timezone: o.timezone }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('timeline', id, params, this.#config().locale);
  }

  #icons(): TimelineIcons {
    return { ...DEFAULT_ICONS, ...this.#options.icons };
  }

  #order(): TimelineOrder {
    return this.#options.order ?? 'newest-first';
  }

  #all(): TimelineItem[] {
    return this.#order() === 'newest-first' ? [...this.#options.items, ...this.#loaded] : [...this.#loaded, ...this.#options.items];
  }

  /** The items currently shown (older ones removed while collapsed). */
  #shown(all: readonly TimelineItem[]): { shown: TimelineItem[]; hidden: number } {
    const n = this.#options.initialVisible ?? null;
    if (n === null || this.#expanded || all.length <= n) return { shown: [...all], hidden: 0 };
    const hidden = all.length - n;
    return this.#order() === 'newest-first' ? { shown: all.slice(0, n), hidden } : { shown: all.slice(hidden), hidden };
  }

  #dateOf(item: TimelineItem, zone: string): PlainDate | null {
    const t = item.time;
    if (t === undefined) return null;
    return t.kind === 'PlainDate' ? t : toPlainDateTime(t, zone).date;
  }

  #groups(items: readonly TimelineItem[], zone: string, grouped: boolean): DayGroup[] {
    if (!grouped) return [{ key: 'all', date: null, items: items.map((item, index) => ({ item, index })) }];
    const out: DayGroup[] = [];
    items.forEach((item, index) => {
      const date = this.#dateOf(item, zone);
      const key = date === null ? 'undated' : plainDateToString(date);
      const last = out[out.length - 1];
      if (last?.key === key) last.items.push({ item, index });
      else out.push({ key, date, items: [{ item, index }] });
    });
    return out;
  }

  #dayLabel(date: PlainDate | null, today: PlainDate, locale: string): string {
    if (date === null) return this.#m('undated');
    const days = daysBetween(today, date);
    let label: string;
    if (Math.abs(days) <= 1) {
      const relative = formatRelativeDate(date, today, { locale });
      label = relative.charAt(0).toLocaleUpperCase(locale) + relative.slice(1);
    } else if (days < 0 && days > -7) label = formatPlainDate(date, { weekday: 'long', month: 'short', day: 'numeric' }, locale);
    else label = formatPlainDate(date, { dateStyle: 'medium' }, locale);
    const calendar = this.#options.businessCalendar;
    if (!calendar) return label;
    const info = calendar.day(date);
    if (info.holiday) return this.#m('dayHoliday', { day: label, holiday: info.holiday });
    if (!info.working) return this.#m('dayNonWorking', { day: label });
    return label;
  }

  #time(item: TimelineItem, config: Readonly<TimelineConfig & { locale: string; timezone: string }>, now: Instant, today: PlainDate): HTMLTimeElement | null {
    const t = item.time;
    if (t === undefined) return null;
    const { locale, timezone } = config;
    const el = this.#doc.createElement('time');
    el.className = 'aui-timeline__time';
    const grouped = config.groupByDay;
    if (t.kind === 'PlainDate') {
      el.dateTime = plainDateToString(t);
      el.title = formatPlainDate(t, { dateStyle: 'full' }, locale);
      if (config.timeFormat === 'relative') el.textContent = formatRelativeDate(t, today, { locale });
      else el.textContent = grouped ? this.#m('allDay') : formatPlainDate(t, { dateStyle: 'medium' }, locale);
    } else {
      el.dateTime = instantToString(t);
      el.title = formatInstant(t, { dateStyle: 'full', timeStyle: 'short' }, timezone, locale);
      if (config.timeFormat === 'relative') el.textContent = formatRelative(t.epochMilliseconds, now.epochMilliseconds, { locale });
      else el.textContent = formatInstant(t, grouped ? { timeStyle: 'short' } : { dateStyle: 'medium', timeStyle: 'short' }, timezone, locale);
    }
    return el;
  }

  #disposeRender(): void {
    this.#renderGroup.dispose();
    this.#renderGroup = new DisposableGroup();
    for (const b of this.#buttons) b.destroy();
    for (const a of this.#avatars) a.destroy();
    this.#buttons = [];
    this.#avatars = [];
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (configuration, messages, icons) runs before the DOM changes.
    const config = this.#config();
    const icons = this.#icons();
    const { locale, timezone } = config;
    const now = o.now ?? instant(Date.now());
    const today = toPlainDateTime(now, timezone).date;
    const all = this.#all();
    const { shown, hidden } = this.#shown(all);
    const horizontal = config.orientation === 'horizontal';
    const alternate = config.layout === 'alternate' && !horizontal;
    const grouped = config.groupByDay;
    const groups = this.#groups(shown, timezone, grouped);
    const level = o.headingLevel ?? 3;
    const doc = this.#doc;

    const built: HTMLLIElement[] = [];
    const buttons: Button[] = [];
    const avatars: Avatar[] = [];
    const itemEls = new Map<string, HTMLLIElement>();
    let position = 0;
    // Item listeners (actions) are registered while building: they go into a fresh group, so
    // disposing the previous render's listeners below does not remove them.
    const previousGroup = this.#renderGroup;
    this.#renderGroup = new DisposableGroup();
    try {
      for (const group of groups) {
        const itemsList = grouped ? doc.createElement('ol') : this.#list;
        const lis: HTMLLIElement[] = [];
        for (const { item } of group.items) {
          const li = this.#renderItem(item, icons, config, now, today, buttons, avatars);
          if (alternate && position % 2 === 1) li.classList.add('aui-timeline__item--end');
          position++;
          itemEls.set(item.id, li);
          lis.push(li);
        }
        if (grouped) {
          const groupLi = doc.createElement('li');
          groupLi.className = 'aui-timeline__group';
          const heading = doc.createElement(`h${String(level)}`);
          heading.className = 'aui-timeline__day';
          heading.id = `${this.#id}-${group.key}`;
          heading.textContent = this.#dayLabel(group.date, today, locale);
          itemsList.className = 'aui-timeline__items';
          itemsList.setAttribute('aria-labelledby', heading.id);
          itemsList.replaceChildren(...lis);
          groupLi.append(heading, itemsList);
          built.push(groupLi);
        } else built.push(...lis);
      }
    } catch (error) {
      this.#renderGroup.dispose();
      this.#renderGroup = previousGroup;
      for (const b of buttons) b.destroy();
      for (const a of avatars) a.destroy();
      throw error;
    }

    previousGroup.dispose();
    for (const b of this.#buttons) b.destroy();
    for (const a of this.#avatars) a.destroy();
    this.#buttons = buttons;
    this.#avatars = avatars;

    const host = this.host;
    host.classList.toggle('aui-timeline--vertical', !horizontal);
    host.classList.toggle('aui-timeline--horizontal', horizontal);
    host.classList.toggle('aui-timeline--alternate', alternate);
    host.classList.toggle('aui-timeline--grouped', grouped);

    // A horizontal timeline is a focusable, labelled scroll region (keyboard scrolling).
    const scroller = this.#scroller;
    if (horizontal) {
      scroller.setAttribute('role', 'region');
      scroller.setAttribute('aria-label', o.label);
      scroller.tabIndex = 0;
    } else {
      scroller.removeAttribute('role');
      scroller.removeAttribute('aria-label');
      scroller.removeAttribute('tabindex');
    }
    this.#list.setAttribute('aria-label', o.label);
    this.#list.classList.toggle('aui-timeline__items', !grouped);
    this.#list.replaceChildren(...built);
    this.#list.hidden = built.length === 0;
    this.#emptyEl.textContent = o.empty ?? this.#m('empty');
    this.#emptyEl.hidden = all.length > 0 || this.#loading || this.#hasMore;

    this.#renderFooter(hidden, icons);

    if (this.#focusId !== null) {
      const target = itemEls.get(this.#focusId);
      this.#focusId = null;
      if (target) {
        target.tabIndex = -1;
        target.focus({ preventScroll: false });
        this.#renderGroup.listen(target, 'blur', () => {
          target.removeAttribute('tabindex');
        }, { once: true });
      }
    }
  }

  #renderItem(item: TimelineItem, icons: TimelineIcons, config: Readonly<TimelineConfig & { locale: string; timezone: string }>, now: Instant, today: PlainDate, buttons: Button[], avatars: Avatar[]): HTMLLIElement {
    const doc = this.#doc;
    const tone = item.tone ?? 'neutral';
    const li = doc.createElement('li');
    li.className = `aui-timeline__item aui-timeline__item--${tone}`;
    li.dataset.id = item.id;

    const marker = doc.createElement('span');
    marker.className = 'aui-timeline__marker';
    marker.setAttribute('aria-hidden', 'true');
    if (item.avatar) {
      const avatarHost = doc.createElement('span');
      marker.append(avatarHost);
      marker.classList.add('aui-timeline__marker--avatar');
      avatars.push(Avatar.create(avatarHost, { name: item.avatar.name, size: 'sm', decorative: true, ...(item.avatar.src === undefined ? {} : { src: item.avatar.src }) }));
    } else marker.append(renderIcon(item.icon ?? icons[tone], { doc }));

    const content = doc.createElement('div');
    content.className = 'aui-timeline__content';
    const header = doc.createElement('div');
    header.className = 'aui-timeline__header';
    let title: HTMLElement;
    if (item.href !== undefined) {
      const a = doc.createElement('a');
      a.href = item.href;
      title = a;
    } else title = doc.createElement('span');
    title.classList.add('aui-timeline__title');
    title.textContent = item.title;
    header.append(title);
    const statusText = item.status ?? (tone === 'neutral' ? '' : this.#m(tone));
    if (statusText !== '') {
      const status = doc.createElement('span');
      status.className = 'aui-timeline__status';
      status.textContent = statusText;
      header.append(status);
    }
    const time = this.#time(item, config, now, today);
    if (time) header.append(time);
    content.append(header);

    if (item.description !== undefined && item.description !== '') {
      const p = doc.createElement('p');
      p.className = 'aui-timeline__description';
      p.textContent = item.description;
      content.append(p);
    }

    const actions = item.actions ?? [];
    if (actions.length > 0) {
      const row = doc.createElement('div');
      row.className = 'aui-timeline__actions';
      // The group names the item, so repeated labels ("Download") stay distinguishable.
      row.setAttribute('role', 'group');
      row.setAttribute('aria-label', item.title);
      for (const action of actions) {
        const b = Button.create({ text: action.label, variant: 'ghost', size: 'sm', ...(action.icon === undefined ? {} : { icon: action.icon }) }, doc);
        b.element.dataset.action = action.id;
        buttons.push(b);
        this.#renderGroup.listen(b.element, 'click', () => {
          emit(this.host, 'aui-action', { itemId: item.id, actionId: action.id, item } satisfies TimelineActionDetail);
        });
        row.append(b.element);
      }
      content.append(row);
    }

    li.append(marker, content);
    return li;
  }

  #renderFooter(hidden: number, icons: TimelineIcons): void {
    for (const b of this.#footerButtons) b.destroy();
    this.#footerButtons = [];
    const doc = this.#doc;
    const children: HTMLElement[] = [];
    const locale = this.#config().locale;
    const n = this.#options.initialVisible ?? null;
    const collapsible = n !== null && this.#all().length > n;
    if (collapsible) {
      const label = this.#expanded ? this.#m('showFewer') : this.#m('showOlder', { count: formatNumber(hidden, {}, locale) });
      const b = Button.create({ text: label, variant: 'outline', size: 'sm', icon: icons.showOlder }, doc);
      b.element.classList.add('aui-timeline__toggle');
      b.element.setAttribute('aria-expanded', String(this.#expanded));
      b.element.setAttribute('aria-controls', this.#list.id);
      this.#renderGroup.listen(b.element, 'click', () => {
        this.#toggle();
      });
      this.#footerButtons.push(b);
      children.push(b.element);
    }
    const canLoad = this.#options.loadMore != null && this.#hasMore && (!collapsible || this.#expanded);
    if (canLoad) {
      if (this.#error) {
        this.#errorEl.textContent = this.#m('loadError');
        children.push(this.#errorEl);
      }
      const b = Button.create({ text: this.#error ? this.#m('retry') : this.#m('loadMore'), variant: 'outline', size: 'sm', loading: this.#loading, ...(this.#error ? { icon: icons.retry } : {}) }, doc);
      b.element.classList.add('aui-timeline__load');
      this.#renderGroup.listen(b.element, 'click', () => {
        void this.loadOlder();
      });
      this.#footerButtons.push(b);
      children.push(b.element);
    }
    // Keep focus on a footer button that is rebuilt (loading state, retry).
    const active = doc.activeElement;
    const hadFocus = active instanceof HTMLElement && this.#footer.contains(active) ? (active.classList.contains('aui-timeline__load') ? 'load' : 'toggle') : null;
    this.#footer.replaceChildren(...children);
    this.#footer.hidden = children.length === 0;
    if (hadFocus !== null && this.#focusId === null) {
      const again = this.#footer.querySelector<HTMLElement>(hadFocus === 'load' ? '.aui-timeline__load' : '.aui-timeline__toggle');
      again?.focus();
    }
  }

  #toggle(): void {
    const all = this.#all();
    const { hidden } = this.#shown(all);
    const expanding = !this.#expanded;
    if (expanding) {
      const n = this.#options.initialVisible ?? all.length;
      const firstHidden = this.#order() === 'newest-first' ? all[n] : all[hidden - 1];
      if (firstHidden) this.#focusId = firstHidden.id;
    }
    this.#expanded = expanding;
    this.#render();
    const locale = this.#config().locale;
    announce(expanding ? this.#m('shown', { count: formatNumber(hidden, {}, locale) }) : this.#m('hidden'), 'polite', this.#doc);
    emit(this.host, 'aui-toggle', { expanded: expanding } satisfies TimelineToggleDetail);
  }
}
