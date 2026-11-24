import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Breadcrumb, type BreadcrumbItem, type BreadcrumbNavigateDetail, type BreadcrumbOptions } from '@absoluteui/components/breadcrumb';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const TRAIL: readonly BreadcrumbItem[] = [
  { label: 'Home', href: '/' },
  { label: 'Products', href: '/products' },
  { label: 'Laptops', href: '/products/laptops' },
  { label: 'Accessories', href: '#accessories' },
  { label: 'Chargers', href: '/products/laptops/chargers' },
  { label: 'USB-C 65W', href: '/products/laptops/chargers/usb-c-65w' },
];

function mount(options: Partial<BreadcrumbOptions> = {}): Breadcrumb {
  const host = document.createElement('div');
  document.body.append(host);
  return Breadcrumb.create(host, { items: TRAIL, ...options });
}

const entries = (b: Breadcrumb): HTMLElement[] => Array.from(b.nav.querySelectorAll<HTMLElement>('.aui-breadcrumb__link, .aui-breadcrumb__text'));
const labels = (b: Breadcrumb): string[] => entries(b).map((e) => e.textContent);

describe('Breadcrumb: semantics', () => {
  it('renders nav > ol > li > a with the current page as text', () => {
    const b = mount();
    expect(b.nav.tagName).toBe('NAV');
    expect(b.nav.getAttribute('aria-label')).toBe('Breadcrumb');
    const list = b.nav.querySelector('ol')!;
    expect(list.children).toHaveLength(TRAIL.length);
    const all = entries(b);
    expect(all.slice(0, -1).every((e) => e instanceof HTMLAnchorElement)).toBe(true);
    expect((all[1] as HTMLAnchorElement).getAttribute('href')).toBe('/products');
    const current = all.at(-1)!;
    expect(current.tagName).toBe('SPAN');
    expect(current.getAttribute('aria-current')).toBe('page');
    expect(all.filter((e) => e.hasAttribute('aria-current'))).toHaveLength(1);
  });

  it('links the current item when linkCurrent is set', () => {
    const b = mount({ linkCurrent: true });
    const current = entries(b).at(-1)!;
    expect(current).toBeInstanceOf(HTMLAnchorElement);
    expect(current.getAttribute('aria-current')).toBe('page');
  });

  it('renders items without href as text', () => {
    const b = mount({ items: [{ label: 'Home', href: '/' }, { label: 'Reports' }, { label: 'Q3' }] });
    expect(entries(b).map((e) => e.tagName)).toEqual(['A', 'SPAN', 'SPAN']);
  });

  it('separators are decorative icons between items', () => {
    const b = mount();
    const items = Array.from(b.nav.querySelectorAll('li'));
    expect(items[0]!.querySelector('.aui-breadcrumb__separator')).toBeNull();
    for (const li of items.slice(1)) expect(li.querySelector('.aui-breadcrumb__separator')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks RTL so separators mirror', () => {
    const b = mount({ direction: 'rtl' });
    expect(b.host.classList.contains('aui-breadcrumb--rtl')).toBe(true);
  });

  it('accepts a custom label and localizes the default', () => {
    expect(mount({ label: 'You are here' }).nav.getAttribute('aria-label')).toBe('You are here');
    registerMessages('breadcrumb', 'de', { label: 'Brotkrümelnavigation', showAll: 'Alle Ebenen anzeigen' });
    expect(mount({ locale: 'de-DE' }).nav.getAttribute('aria-label')).toBe('Brotkrümelnavigation');
  });

  it('renders labels as text, never HTML', () => {
    const b = mount({ items: [{ label: '<img src=x>', href: '/' }, { label: 'Here' }] });
    expect(b.nav.querySelector('img')).toBeNull();
    expect(labels(b)[0]).toBe('<img src=x>');
  });
});

describe('Breadcrumb: href validation', () => {
  it('accepts http(s), relative, path-absolute, query, and fragment URLs', () => {
    for (const href of ['https://example.com/a', 'http://example.com', '/a/b', 'a/b', '../up', '?q=1', '#top', '//cdn.example.com/x']) {
      expect(() => mount({ items: [{ label: 'x', href }] })).not.toThrow();
    }
  });

  it('rejects script, data, and other schemes, including obfuscated forms', () => {
    const host = document.createElement('div');
    for (const href of ['javascript:alert(1)', ' JavaScript:alert(1)', 'java\tscript:alert(1)', 'data:text/html,<p>x</p>', 'vbscript:x', 'file:///etc/passwd', 'mailto:a@example.com', 'http://[']) {
      expect(() => Breadcrumb.create(host, { items: [{ label: 'x', href }] }), href).toThrow(/items\.href/);
    }
    expect(host.childElementCount).toBe(0);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Breadcrumb.create(host, { items: [] })).toThrow(AbsoluteUIError);
    expect(() => Breadcrumb.create(host, { items: [{ label: ' ' }] })).toThrow(/items\.label/);
    expect(() => Breadcrumb.create(host, { items: TRAIL, maxItems: 1 })).toThrow(/maxItems/);
    expect(() => Breadcrumb.create(host, { items: TRAIL, label: '' })).toThrow(/label/);
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });

  it('update() validates and keeps the previous state on error', () => {
    const b = mount();
    expect(() => {
      b.update({ items: [{ label: 'x', href: 'javascript:void 0' }] });
    }).toThrow(/href/);
    expect(labels(b)).toHaveLength(TRAIL.length);
  });
});

describe('Breadcrumb: collapsing', () => {
  it('collapses to first, expander, then the last maxItems - 1 items', () => {
    const b = mount({ maxItems: 3 });
    expect(labels(b)).toEqual(['Home', 'Chargers', 'USB-C 65W']);
    const expander = b.nav.querySelector<HTMLButtonElement>('.aui-breadcrumb__expander')!;
    expect(expander.type).toBe('button');
    expect(expander.getAttribute('aria-label')).toBe('Show all breadcrumbs');
    expect(expander.querySelector('[aria-hidden="true"]')!.textContent).toBe('...');
    expect(b.nav.querySelector('ol')!.children).toHaveLength(4);
  });

  it('does not collapse when the trail fits', () => {
    const b = mount({ maxItems: 6 });
    expect(b.nav.querySelector('.aui-breadcrumb__expander')).toBeNull();
    expect(labels(b)).toHaveLength(6);
  });

  it('expands in place and moves focus to the first revealed link', async () => {
    const b = mount({ maxItems: 2 });
    expect(labels(b)).toEqual(['Home', 'USB-C 65W']);
    await userEvent.click(b.nav.querySelector('.aui-breadcrumb__expander')!);
    expect(b.expanded).toBe(true);
    expect(labels(b)).toEqual(TRAIL.map((i) => i.label));
    expect(document.activeElement?.textContent).toBe('Products');
  });

  it('focuses a revealed text item when it has no link', async () => {
    const b = mount({ maxItems: 2, items: [{ label: 'Home', href: '/' }, { label: 'Reports' }, { label: 'Q2' }, { label: 'Q3' }] });
    b.nav.querySelector<HTMLButtonElement>('.aui-breadcrumb__expander')!.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement?.textContent).toBe('Reports');
  });

  it('honours maxItems from global configuration; instance options win', () => {
    configureAbsoluteUI({ components: { breadcrumb: { maxItems: 3 } } });
    const b = mount();
    expect(labels(b)).toHaveLength(3);
    expect(labels(mount({ maxItems: 0 }))).toHaveLength(6);
    configureAbsoluteUI({});
    expect(labels(b)).toHaveLength(6);
  });

  it('new items collapse again after an expansion', async () => {
    const b = mount({ maxItems: 2 });
    await userEvent.click(b.nav.querySelector('.aui-breadcrumb__expander')!);
    b.update({ items: TRAIL.slice(0, 4) });
    expect(b.expanded).toBe(false);
    expect(labels(b)).toEqual(['Home', 'Accessories']);
  });
});

describe('Breadcrumb: navigation event', () => {
  it('emits a bubbling, cancelable aui-navigate that lets routers take over', async () => {
    const b = mount();
    const seen: BreadcrumbNavigateDetail[] = [];
    let bubbled = false;
    document.body.addEventListener('aui-navigate', () => {
      bubbled = true;
    });
    b.host.addEventListener('aui-navigate', (event) => {
      seen.push((event as CustomEvent<BreadcrumbNavigateDetail>).detail);
      event.preventDefault();
    });
    const link = entries(b)[1]!;
    let navigated = true;
    // The document listener runs after the component's list listener on the bubble path.
    document.addEventListener('click', (event) => {
      navigated = !event.defaultPrevented;
    }, { once: true });
    await userEvent.click(link);
    expect(seen).toEqual([{ index: 1, item: TRAIL[1] }]);
    expect(bubbled).toBe(true);
    expect(navigated).toBe(false);
    expect(location.pathname).not.toBe('/products');
  });

  it('does not report modified clicks (new tab/window)', () => {
    const b = mount();
    let count = 0;
    b.host.addEventListener('aui-navigate', (event) => {
      count++;
      event.preventDefault();
    });
    const link = entries(b)[3]!;
    // Synthetic: a real Ctrl+click would open a new browser tab in the test runner.
    const click = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    link.addEventListener('click', (event) => {
      event.preventDefault();
    });
    link.dispatchEvent(click);
    expect(count).toBe(0);
  });

  it('destroy removes rendering, listeners, and subscriptions', () => {
    const b = mount({ maxItems: 3 });
    const host = b.host;
    b.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    configureAbsoluteUI({ components: { breadcrumb: { maxItems: 0 } } });
    expect(labels(b)).toHaveLength(3);
  });

  it('accepts relative links in a document whose base cannot resolve them (about:blank, server rendering)', () => {
    const doc = document.implementation.createHTMLDocument('');
    expect(doc.baseURI).toBe('about:blank');
    const host = doc.createElement('div');
    doc.body.append(host);
    const b = Breadcrumb.create(host, { items: [{ label: 'Home', href: '/' }, { label: 'People', href: 'people?team=core#top' }, { label: 'Ada' }] });
    expect(Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(['/', 'people?team=core#top']);
    // Unsafe schemes stay rejected whatever the base.
    // Deliberately unsafe input: the component must reject it.
    const unsafe = ['java', 'script:alert(1)'].join('');
    expect(() => { b.update({ items: [{ label: 'X', href: unsafe }] }); }).toThrow(AbsoluteUIError);
    b.destroy();
  });
});
