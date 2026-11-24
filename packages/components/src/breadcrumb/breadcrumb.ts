/**
 * Breadcrumb (SPEC section 18.12, WAI-ARIA APG Breadcrumb pattern). A labelled <nav>
 * with an ordered list of links; the last item is the current page. Long
 * trails can collapse behind an expander button. Hrefs are validated so only
 * http(s) and relative URLs are rendered (section 14.5); `aui-navigate` is cancelable
 * so single-page-application routers can take over navigation.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, type Direction, type Guard } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { isSafeHref } from '../internal/href.js';

export interface BreadcrumbConfig {
  /** Collapse when the trail is longer than this. 0 never collapses; otherwise >= 2. */
  maxItems: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    breadcrumb: BreadcrumbConfig & { locale: string; direction: Direction };
  }
}

const isMaxItems: Guard<number> = (v): v is number => v === 0 || (typeof v === 'number' && Number.isInteger(v) && v >= 2 && v <= 1000);

export const breadcrumbConfig = defineComponentConfig<BreadcrumbConfig, 'locale' | 'direction'>(
  'breadcrumb',
  { maxItems: { default: 0, expected: '0 or an integer from 2 to 1000', validate: isMaxItems } },
  ['locale', 'direction'],
);

registerMessages('breadcrumb', 'en', {
  label: 'Breadcrumb',
  showAll: 'Show all breadcrumbs',
});

export interface BreadcrumbItem {
  label: string;
  /** http(s), relative, path-absolute, or fragment URL. Omit for a text-only item. */
  href?: string;
}

export interface BreadcrumbIcons {
  separator: IconRef;
}

export interface BreadcrumbOptions extends Partial<BreadcrumbConfig> {
  items: readonly BreadcrumbItem[];
  /** Accessible name of the <nav>. Default: localized "Breadcrumb". */
  label?: string;
  /** Render the current (last) item as a link when it has an href. Default false. */
  linkCurrent?: boolean;
  locale?: string;
  direction?: Direction;
  icons?: Partial<BreadcrumbIcons>;
}

export interface BreadcrumbNavigateDetail {
  index: number;
  item: BreadcrumbItem;
}

/** Not a type guard on purpose: narrowing a typed readonly array through Array.isArray yields any[]. */
function isNonEmptyList(value: unknown): boolean {
  return Array.isArray(value) && value.length > 0;
}

export class Breadcrumb {
  readonly host: HTMLElement;
  readonly nav: HTMLElement;
  #options: BreadcrumbOptions;
  #expanded = false;
  readonly #doc: Document;
  readonly #list: HTMLOListElement;
  readonly #group = new DisposableGroup();

  /** Render a breadcrumb trail into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: BreadcrumbOptions): Breadcrumb {
    return new Breadcrumb(host, options);
  }

  private constructor(host: HTMLElement, options: BreadcrumbOptions) {
    this.#doc = host.ownerDocument;
    this.#assertOptions(options);
    this.host = host;
    this.#options = { ...options };

    this.nav = this.#doc.createElement('nav');
    this.nav.className = 'aui-breadcrumb__nav';
    this.#list = this.#doc.createElement('ol');
    this.#list.className = 'aui-breadcrumb__list';
    this.nav.append(this.#list);

    host.classList.add('aui-breadcrumb');
    host.replaceChildren(this.nav);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#group.listen(this.#list, 'click', (event) => {
      this.#onClick(event);
    });
    this.#group.add(breadcrumbConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<BreadcrumbOptions> {
    return this.#options;
  }

  /** Whether a collapsed trail has been expanded by the user. */
  get expanded(): boolean {
    return this.#expanded;
  }

  update(options: Partial<BreadcrumbOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next);
    this.#options = next;
    if ('items' in options) this.#expanded = false;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-breadcrumb', 'aui-breadcrumb--rtl');
  }

  #config(options: BreadcrumbOptions = this.#options): Readonly<BreadcrumbConfig & { locale: string; direction: Direction }> {
    return breadcrumbConfig.resolve({
      ...(options.maxItems === undefined ? {} : { maxItems: options.maxItems }),
      ...(options.locale === undefined ? {} : { locale: options.locale }),
      ...(options.direction === undefined ? {} : { direction: options.direction }),
    });
  }

  #assertOptions(options: BreadcrumbOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('BREADCRUMB_OPTIONS', 'Invalid breadcrumb options.', { component: 'breadcrumb', property: `breadcrumb.${property}`, expected });
    };
    if (options.label !== undefined && (typeof options.label !== 'string' || options.label.trim() === '')) fail('label', 'non-empty string');
    if (!isNonEmptyList(options.items)) fail('items', 'non-empty array of items');
    for (const item of options.items) {
      if (typeof item.label !== 'string' || item.label.trim() === '') fail('items.label', 'non-empty string');
      // The href value itself is never echoed into the error (it may carry user data).
      if (item.href !== undefined && (typeof item.href !== 'string' || !isSafeHref(item.href, this.#doc.baseURI))) fail('items.href', 'http(s), relative, path-absolute, or fragment URL');
    }
    // Resolving validates maxItems, locale, and direction.
    this.#config(options);
  }

  #onClick(event: MouseEvent): void {
    if (!(event.target instanceof Element)) return;
    const expander = event.target.closest('.aui-breadcrumb__expander');
    if (expander) {
      this.#expand();
      return;
    }
    const link = event.target.closest('a.aui-breadcrumb__link');
    if (!(link instanceof HTMLAnchorElement)) return;
    // Modified clicks (new tab/window, download) stay native and are not reported.
    if (event.button !== 0 || event.ctrlKey || event.metaKey || event.shiftKey || event.altKey) return;
    const index = Number(link.dataset.index);
    const item = this.#options.items[index];
    if (!item) return;
    const proceed = emit(this.host, 'aui-navigate', { index, item } satisfies BreadcrumbNavigateDetail, { cancelable: true });
    if (!proceed) event.preventDefault();
  }

  #expand(): void {
    this.#expanded = true;
    this.#render();
    // A collapsed trail always hides the items right after the first one.
    const target = this.#list.querySelector<HTMLElement>('[data-index="1"]');
    if (!target) return;
    // Text-only items become programmatically focusable so focus never falls back to <body>.
    if (!(target instanceof HTMLAnchorElement)) target.tabIndex = -1;
    target.focus();
  }

  /** Item indexes shown in the current state, in order. */
  #visibleIndexes(): number[] {
    const count = this.#options.items.length;
    const all = Array.from({ length: count }, (_, i) => i);
    const max = this.#config().maxItems;
    if (this.#expanded || max === 0 || count <= max) return all;
    return [0, ...all.slice(count - (max - 1))];
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    this.nav.setAttribute('aria-label', o.label ?? getMessage('breadcrumb', 'label', {}, locale));
    this.host.classList.toggle('aui-breadcrumb--rtl', config.direction === 'rtl');

    const last = o.items.length - 1;
    const visible = this.#visibleIndexes();
    const rows: HTMLLIElement[] = [];
    visible.forEach((index, n) => {
      const previous = visible[n - 1];
      if (previous !== undefined && index !== previous + 1) rows.push(this.#renderExpander(locale));
      const item = o.items[index];
      if (item) rows.push(this.#renderItem(item, index, index === last, rows.length > 0));
    });
    this.#list.replaceChildren(...rows);
  }

  #separator(): Element {
    return renderIcon(this.#options.icons?.separator ?? 'chevron-right', { doc: this.#doc, className: 'aui-breadcrumb__separator' });
  }

  #renderItem(item: BreadcrumbItem, index: number, current: boolean, withSeparator: boolean): HTMLLIElement {
    const doc = this.#doc;
    const li = doc.createElement('li');
    li.className = 'aui-breadcrumb__item';
    if (withSeparator) li.append(this.#separator());
    const asLink = item.href !== undefined && (!current || this.#options.linkCurrent === true);
    const el = doc.createElement(asLink ? 'a' : 'span');
    el.className = asLink ? 'aui-breadcrumb__link' : 'aui-breadcrumb__text';
    el.dataset.index = String(index);
    el.textContent = item.label;
    if (el instanceof HTMLAnchorElement && item.href !== undefined) el.href = item.href;
    if (current) el.setAttribute('aria-current', 'page');
    li.append(el);
    return li;
  }

  #renderExpander(locale: string): HTMLLIElement {
    const doc = this.#doc;
    const li = doc.createElement('li');
    li.className = 'aui-breadcrumb__item aui-breadcrumb__item--collapsed';
    li.append(this.#separator());
    const button = doc.createElement('button');
    button.type = 'button';
    button.className = 'aui-breadcrumb__expander';
    button.setAttribute('aria-label', getMessage('breadcrumb', 'showAll', {}, locale));
    const dots = doc.createElement('span');
    dots.setAttribute('aria-hidden', 'true');
    dots.textContent = '...';
    button.append(dots);
    li.append(button);
    return li;
  }
}
