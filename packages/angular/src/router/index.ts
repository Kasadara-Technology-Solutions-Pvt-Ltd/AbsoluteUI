/**
 * @absoluteui/angular/router (docs/PLAN-R9-ANGULAR.md M6): Angular Router navigation for
 * AbsoluteUI navigation components. Optional peer: `@angular/router`.
 *
 * - Links styled as buttons need nothing from this entry: `<a auiButton routerLink="/x">`
 *   (`AuiLinkButton` from `@absoluteui/angular/button` plus `RouterLink`).
 * - `auiRouterNav` on `<aui-sidebar>`, `<aui-breadcrumb>`, `<aui-stepper>`, `<aui-tabs>`,
 *   `<aui-menu-bar>`, and `button[auiMenu]` reads `routerLink` (and the other
 *   `AuiRouterTarget` fields) from items, steps, and tabs. It renders real hrefs (base href
 *   and location strategy applied) so modified clicks open new tabs, navigates with the
 *   Router on plain activation, and selects the item that matches the current URL.
 *   Items without `routerLink` keep their own `href` (external URLs) and behavior.
 */
import { LocationStrategy } from '@angular/common';
import { afterNextRender, DestroyRef, Directive, ElementRef, ErrorHandler, inject } from '@angular/core';
import { ActivatedRoute, containsTree, Router, type IsActiveMatchOptions, type Params, type QueryParamsHandling, type UrlTree } from '@angular/router';
import { detailOf, transformOptionsOf } from '../internal/bridge.js';
import { devWarn } from '../internal/diagnostics.js';

declare const ngDevMode: boolean | undefined;

/** Router fields an item, step, or tab may carry (in addition to its own fields). */
export interface AuiRouterTarget {
  /** Commands or URL, as for `RouterLink`. Relative commands resolve against the route of the component. */
  routerLink: string | readonly unknown[];
  queryParams?: Params | null;
  fragment?: string;
  queryParamsHandling?: QueryParamsHandling | null;
  preserveFragment?: boolean;
  state?: Record<string, unknown>;
  replaceUrl?: boolean;
  skipLocationChange?: boolean;
  /**
   * How the current URL must match for the item to be selected. Default: path prefix
   * (`paths: 'subset'`), query parameters, fragment, and matrix parameters ignored. The
   * most specific matching item (longest path) is selected.
   */
  activeOptions?: Partial<IsActiveMatchOptions>;
}

type ElementOf<A> = A extends readonly (infer E)[] ? E : never;

/** `items` of an item type, with router fields allowed on the children too. */
type RouterChildren<T> = object extends Pick<T, 'items' & keyof T>
  ? { items?: readonly AuiRouterItem<ElementOf<T['items' & keyof T]>>[] }
  : { items: readonly AuiRouterItem<ElementOf<T['items' & keyof T]>>[] };

/**
 * An item type with optional router fields, nested `items` included, e.g.
 * `AuiRouterItem<SidebarItem>`, `AuiRouterItem<MenuItem>`, `AuiRouterItem<StepperStep>`.
 */
export type AuiRouterItem<T> = T extends unknown
  ? 'items' extends keyof T
    ? Omit<T, 'items'> & Partial<AuiRouterTarget> & RouterChildren<T>
    : T & Partial<AuiRouterTarget>
  : never;

interface NavKind {
  /** Option holding the item list. */
  readonly list: 'items' | 'steps' | 'tabs';
  /** The component renders `href` for its items. */
  readonly href: boolean;
  /** The component has a `value` option naming the selected item id. */
  readonly value: boolean;
  /** Activation event and the item it reports. */
  readonly event: 'aui-navigate' | 'aui-change' | 'aui-select';
}

const KINDS: Readonly<Record<string, NavKind>> = {
  'aui-sidebar': { list: 'items', href: true, value: true, event: 'aui-navigate' },
  'aui-breadcrumb': { list: 'items', href: true, value: false, event: 'aui-navigate' },
  'aui-stepper': { list: 'steps', href: true, value: true, event: 'aui-navigate' },
  'aui-tabs': { list: 'tabs', href: false, value: true, event: 'aui-change' },
  'aui-menu-bar': { list: 'items', href: false, value: false, event: 'aui-select' },
  button: { list: 'items', href: false, value: false, event: 'aui-select' },
};

const DEFAULT_ACTIVE: IsActiveMatchOptions = { paths: 'subset', queryParams: 'ignored', fragment: 'ignored', matrixParams: 'ignored' };

type Item = Readonly<Record<string, unknown>>;

function isRecord(value: unknown): value is Item {
  return typeof value === 'object' && value !== null;
}

function routed(item: Item): (Item & AuiRouterTarget) | null {
  const link = item.routerLink;
  // Safe: routerLink is a string or an array; the other fields are optional and passed to the Router as given.
  return typeof link === 'string' || Array.isArray(link) ? (item as Item & AuiRouterTarget) : null;
}

/** Children of an item (Sidebar groups, menu groups and submenus, menubar menus). */
function childrenOf(item: Item): readonly unknown[] | null {
  const items = item.items;
  return Array.isArray(items) ? items : null;
}

/**
 * Router navigation for an AbsoluteUI navigation component: `<aui-sidebar auiRouterNav [items]="items">`
 * with items such as `{ id: 'people', label: 'People', routerLink: '/people' }`.
 */
@Directive({
  selector: 'aui-sidebar[auiRouterNav], aui-breadcrumb[auiRouterNav], aui-stepper[auiRouterNav], aui-tabs[auiRouterNav], aui-menu-bar[auiRouterNav], button[auiMenu][auiRouterNav]',
  exportAs: 'auiRouterNav',
})
export class AuiRouterNav {
  readonly #host: HTMLElement = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  readonly #router = inject(Router);
  readonly #route = inject(ActivatedRoute, { optional: true });
  readonly #location = inject(LocationStrategy);
  readonly #errors = inject(ErrorHandler);
  readonly #kind: NavKind;
  /** Target of the last plain activation, waiting for its click (link and button controls). */
  #pending: (Item & AuiRouterTarget) | null = null;
  #items: readonly unknown[] = [];
  readonly #trees = new WeakMap<object, { url: string; tree: UrlTree }>();
  #checked = false;

  constructor() {
    const kind = KINDS[this.#host.localName];
    if (!kind) throw new TypeError(`auiRouterNav does not support <${this.#host.localName}>.`);
    this.#kind = kind;
    if (!transformOptionsOf(this.#host, (options) => this.#transform(options))) {
      throw new TypeError('auiRouterNav requires an AbsoluteUI navigation component on the same element.');
    }
    const destroyRef = inject(DestroyRef);
    // Registered after the component's own listeners (it is created first), so the component
    // has handled the click and reported the activation before this runs.
    afterNextRender(() => {
      const onActivate = (event: Event): void => {
        if (event.target === this.#host) this.#activated(detailOf(event));
      };
      const onClick = (event: Event): void => {
        const target = this.#pending;
        this.#pending = null;
        if (!target || event.defaultPrevented) return;
        event.preventDefault();
        this.#navigate(target);
      };
      this.#host.addEventListener(kind.event, onActivate);
      this.#host.addEventListener('click', onClick);
      destroyRef.onDestroy(() => {
        this.#host.removeEventListener(kind.event, onActivate);
        this.#host.removeEventListener('click', onClick);
      });
    });
  }

  #transform(options: Readonly<Record<string, unknown>>): Record<string, unknown> {
    // Re-run on every completed navigation: relative links, merged query params, and the selection depend on it.
    this.#router.lastSuccessfulNavigation();
    if (!this.#checked && (typeof ngDevMode === 'undefined' || ngDevMode)) {
      this.#checked = true;
      if (this.#kind.value && options.value !== undefined) devWarn('AUI_NG_ROUTER_VALUE', this.#host.localName, 'has auiRouterNav and a bound value: the router decides the selected item, so remove [(value)].');
    }
    const list = options[this.#kind.list];
    if (!Array.isArray(list)) return { ...options };
    const items = this.#kind.href ? list.map((item) => this.#withHref(item)) : list;
    this.#items = items;
    const out: Record<string, unknown> = { ...options, [this.#kind.list]: items };
    if (this.#kind.value) {
      const active = this.#active(items);
      if (active !== null) out.value = active;
    }
    return out;
  }

  #withHref(item: unknown): unknown {
    if (!isRecord(item)) return item;
    const children = childrenOf(item);
    const target = routed(item);
    if (!target && !children) return item;
    const out: Record<string, unknown> = { ...item };
    if (children) out.items = children.map((child) => this.#withHref(child));
    if (target) out.href = this.#location.prepareExternalUrl(this.#router.serializeUrl(this.#tree(target)));
    return out;
  }

  #tree(target: Item & AuiRouterTarget): UrlTree {
    const url = this.#router.url;
    const known = this.#trees.get(target);
    if (known?.url === url) return known.tree;
    const commands = typeof target.routerLink === 'string' ? [target.routerLink] : target.routerLink;
    const tree = this.#router.createUrlTree(commands, {
      relativeTo: this.#route,
      queryParams: target.queryParams ?? null,
      ...(target.fragment === undefined ? {} : { fragment: target.fragment }),
      queryParamsHandling: target.queryParamsHandling ?? null,
      preserveFragment: target.preserveFragment ?? false,
    });
    this.#trees.set(target, { url, tree });
    return tree;
  }

  /** Id of the most specific item matching the current URL, or null. */
  #active(items: readonly unknown[]): string | null {
    const current = this.#router.parseUrl(this.#router.url);
    const best: { id: string | null; length: number } = { id: null, length: -1 };
    const visit = (list: readonly unknown[]): void => {
      for (const item of list) {
        if (!isRecord(item)) continue;
        const children = childrenOf(item);
        if (children) visit(children);
        const target = routed(item);
        const id = item.id;
        if (!target || typeof id !== 'string' || item.disabled === true) continue;
        const tree = this.#tree(target);
        if (!containsTree(current, tree, { ...DEFAULT_ACTIVE, ...target.activeOptions })) continue;
        const length = this.#router.serializeUrl(tree).split(/[?#]/, 1)[0]?.length ?? 0;
        if (length > best.length) {
          best.id = id;
          best.length = length;
        }
      }
    };
    visit(items);
    return best.id;
  }

  #activated(detail: unknown): void {
    if (!isRecord(detail)) return;
    if (this.#kind.event === 'aui-change') {
      // Tabs: the selected tab id.
      const id = detail.value;
      const tab = this.#items.find((t) => isRecord(t) && t.id === id);
      const target = isRecord(tab) ? routed(tab) : null;
      if (target) this.#navigate(target);
      return;
    }
    const item = detail[this.#host.localName === 'aui-stepper' ? 'step' : 'item'];
    const target = isRecord(item) ? routed(item) : null;
    if (!target) return;
    // Links and buttons: navigate on the click that caused the activation (unless it was canceled).
    if (this.#kind.event === 'aui-navigate') this.#pending = target;
    else this.#navigate(target);
  }

  #navigate(target: Item & AuiRouterTarget): void {
    this.#router
      .navigateByUrl(this.#tree(target), {
        ...(target.state === undefined ? {} : { state: target.state }),
        ...(target.replaceUrl === undefined ? {} : { replaceUrl: target.replaceUrl }),
        ...(target.skipLocationChange === undefined ? {} : { skipLocationChange: target.skipLocationChange }),
      })
      .catch((error: unknown) => {
        this.#errors.handleError(error);
      });
  }
}
