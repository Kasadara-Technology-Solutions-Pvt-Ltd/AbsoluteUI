import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { getPageItems, Pagination, type PaginationChangeDetail, type PaginationOptions } from '@absoluteui/components/pagination';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<PaginationOptions> = {}): Pagination {
  const host = document.createElement('div');
  document.body.append(host);
  return Pagination.create(host, options.total === undefined ? { pageCount: 10, ...options } : options);
}

const E = 'ellipsis' as const;
const pageButtons = (p: Pagination): HTMLButtonElement[] => Array.from(p.nav.querySelectorAll<HTMLButtonElement>('.aui-pagination__page'));
const visible = (p: Pagination): string[] => Array.from(p.nav.querySelectorAll('.aui-pagination__item')).map((li) => (li.classList.contains('aui-pagination__ellipsis') ? E : li.textContent));
const button = (p: Pagination, key: string): HTMLButtonElement => p.nav.querySelector<HTMLButtonElement>(`[data-key="${key}"]`)!;
const changes = (p: Pagination): PaginationChangeDetail[] => {
  const seen: PaginationChangeDetail[] = [];
  p.host.addEventListener('aui-change', (event) => seen.push((event as CustomEvent<PaginationChangeDetail>).detail));
  return seen;
};

describe('getPageItems', () => {
  it('handles empty and single-page sets', () => {
    expect(getPageItems(1, 0)).toEqual([]);
    expect(getPageItems(5, 0)).toEqual([]);
    expect(getPageItems(1, 1)).toEqual([1]);
    expect(getPageItems(3, 1)).toEqual([1]);
  });

  it('lists every page when they fit the slots', () => {
    expect(getPageItems(1, 7)).toEqual([1, 2, 3, 4, 5, 6, 7]);
    expect(getPageItems(4, 5)).toEqual([1, 2, 3, 4, 5]);
    expect(getPageItems(1, 3, 0, 0)).toEqual([1, 2, 3]);
  });

  it('collapses near the start, the middle, and the end with a constant length', () => {
    expect(getPageItems(1, 10)).toEqual([1, 2, 3, 4, 5, E, 10]);
    expect(getPageItems(4, 10)).toEqual([1, 2, 3, 4, 5, E, 10]);
    expect(getPageItems(5, 10)).toEqual([1, E, 4, 5, 6, E, 10]);
    expect(getPageItems(6, 10)).toEqual([1, E, 5, 6, 7, E, 10]);
    expect(getPageItems(7, 10)).toEqual([1, E, 6, 7, 8, 9, 10]);
    expect(getPageItems(10, 10)).toEqual([1, E, 6, 7, 8, 9, 10]);
    for (let page = 1; page <= 50; page++) expect(getPageItems(page, 50)).toHaveLength(7);
  });

  it('shows the page instead of an ellipsis for a one-page gap', () => {
    expect(getPageItems(1, 8)).toEqual([1, 2, 3, 4, 5, E, 8]);
    expect(getPageItems(4, 8)).toEqual([1, 2, 3, 4, 5, E, 8]);
    expect(getPageItems(5, 8)).toEqual([1, E, 4, 5, 6, 7, 8]);
    expect(getPageItems(8, 8)).toEqual([1, E, 4, 5, 6, 7, 8]);
  });

  it('never repeats pages, stays ascending, and always includes the current page', () => {
    for (const [s, b] of [[0, 0], [0, 1], [1, 0], [1, 1], [2, 1], [1, 2], [3, 3]] as const) {
      for (let count = 0; count <= 30; count++) {
        for (let page = 1; page <= count; page++) {
          const items = getPageItems(page, count, s, b);
          const pages = items.filter((i): i is number => i !== E);
          expect(pages).toEqual([...new Set(pages)].sort((x, y) => x - y));
          expect(pages).toContain(page);
          expect(items.length).toBeLessThanOrEqual(2 * b + 2 * s + 3);
          if (b > 0) expect(pages).toContain(1);
          if (b > 0) expect(pages).toContain(count);
          // An ellipsis always hides at least two pages.
          items.forEach((item, i) => {
            if (item !== E) return;
            const before = items[i - 1];
            const after = items[i + 1];
            const lo = typeof before === 'number' ? before : 0;
            const hi = typeof after === 'number' ? after : count + 1;
            expect(hi - lo).toBeGreaterThan(2);
          });
        }
      }
    }
  });

  it('supports zero siblings and zero boundaries', () => {
    expect(getPageItems(5, 10, 0, 1)).toEqual([1, E, 5, E, 10]);
    expect(getPageItems(1, 10, 0, 1)).toEqual([1, 2, 3, E, 10]);
    expect(getPageItems(5, 10, 1, 0)).toEqual([E, 4, 5, 6, E]);
    expect(getPageItems(1, 10, 1, 0)).toEqual([1, 2, 3, 4, E]);
    expect(getPageItems(10, 10, 1, 0)).toEqual([E, 7, 8, 9, 10]);
    expect(getPageItems(5, 20, 2, 2)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, E, 19, 20]);
    expect(getPageItems(10, 20, 2, 2)).toEqual([1, 2, E, 8, 9, 10, 11, 12, E, 19, 20]);
  });

  it('clamps the page and rejects non-integers', () => {
    expect(getPageItems(0, 10)).toEqual(getPageItems(1, 10));
    expect(getPageItems(99, 10)).toEqual(getPageItems(10, 10));
    expect(() => getPageItems(1.5, 10)).toThrow(AbsoluteUIError);
    expect(() => getPageItems(1, -1)).toThrow(AbsoluteUIError);
    expect(() => getPageItems(1, 10, -1)).toThrow(AbsoluteUIError);
    expect(() => getPageItems(1, Number.NaN)).toThrow(AbsoluteUIError);
  });
});

describe('Pagination: semantics', () => {
  it('renders a labelled nav of native buttons with the current page marked', () => {
    const p = mount({ page: 3 });
    expect(p.nav.tagName).toBe('NAV');
    expect(p.nav.getAttribute('aria-label')).toBe('Pagination');
    expect(visible(p)).toEqual(['1', '2', '3', '4', '5', E, '10']);
    const current = pageButtons(p).filter((b) => b.getAttribute('aria-current') === 'page');
    expect(current.map((b) => b.getAttribute('aria-label'))).toEqual(['Page 3']);
    expect(p.nav.querySelector('.aui-pagination__ellipsis')!.getAttribute('aria-hidden')).toBe('true');
    expect(button(p, 'previous').getAttribute('aria-label')).toBe('Previous page');
    expect(button(p, 'next').getAttribute('aria-label')).toBe('Next page');
    expect(button(p, 'previous').querySelector('.aui-icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(p.nav.querySelector('.aui-pagination__compact')!.textContent).toBe('Page 3 of 10');
  });

  it('disables previous/next at the bounds with native disabled', () => {
    const p = mount({ page: 1, showFirstLast: true });
    expect(button(p, 'previous').disabled).toBe(true);
    expect(button(p, 'first').disabled).toBe(true);
    expect(button(p, 'next').disabled).toBe(false);
    p.setPage(10);
    expect(button(p, 'next').disabled).toBe(true);
    expect(button(p, 'last').disabled).toBe(true);
    expect(button(p, 'previous').disabled).toBe(false);
  });

  it('hides first/last unless showFirstLast', () => {
    const p = mount();
    expect(button(p, 'first').hidden).toBe(true);
    expect(button(p, 'last').hidden).toBe(true);
    p.update({ showFirstLast: true });
    expect(button(p, 'first').hidden).toBe(false);
    expect(button(p, 'first').getAttribute('aria-label')).toBe('First page');
  });

  it('shows a formatted summary when the total is known', () => {
    const p = mount({ total: 57, pageSize: 10, page: 2 });
    expect(p.pageCount).toBe(6);
    const summary = p.nav.querySelector<HTMLElement>('.aui-pagination__summary')!;
    expect(summary.textContent).toBe('Showing 11 to 20 of 57');
    p.setPage(6);
    expect(summary.textContent).toBe('Showing 51 to 57 of 57');
    p.update({ showSummary: false });
    expect(summary.hidden).toBe(true);
    expect(mount().nav.querySelector<HTMLElement>('.aui-pagination__summary')!.hidden).toBe(true);
  });

  it('formats numbers and messages for the locale', () => {
    registerMessages('pagination', 'de', { page: 'Seite {page}', summary: '{start}–{end} von {total}' });
    const p = mount({ total: 12_345, pageSize: 1000, page: 12, locale: 'de-DE' });
    expect(p.nav.querySelector('.aui-pagination__summary')!.textContent).toBe('11.001–12.000 von 12.345');
    expect(pageButtons(p).at(-1)!.getAttribute('aria-label')).toBe('Seite 13');
  });

  it('handles zero and one pages', () => {
    const empty = mount({ total: 0, pageSize: 10 });
    expect(empty.pageCount).toBe(0);
    expect(empty.page).toBe(1);
    expect(pageButtons(empty)).toHaveLength(0);
    expect(button(empty, 'previous').disabled).toBe(true);
    expect(button(empty, 'next').disabled).toBe(true);
    expect(empty.nav.querySelector('.aui-pagination__summary')!.textContent).toBe('No results');
    const one = mount({ pageCount: 1 });
    expect(visible(one)).toEqual(['1']);
    expect(button(one, 'next').disabled).toBe(true);
  });

  it('marks RTL so direction icons mirror', () => {
    expect(mount({ direction: 'rtl' }).host.classList.contains('aui-pagination--rtl')).toBe(true);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Pagination.create(host, {})).toThrow(AbsoluteUIError);
    expect(() => Pagination.create(host, { pageCount: 5, total: 50, pageSize: 10 })).toThrow(/pageCount/);
    expect(() => Pagination.create(host, { total: 50 })).toThrow(/pageSize/);
    expect(() => Pagination.create(host, { pageCount: -1 })).toThrow(/pageCount/);
    expect(() => Pagination.create(host, { pageCount: 3, page: 1.5 })).toThrow(/page/);
    expect(() => Pagination.create(host, { total: 50, pageSize: 0 })).toThrow(/pageSize/);
    expect(() => Pagination.create(host, { total: 50, pageSize: 15, pageSizes: [10, 20] })).toThrow(/pageSize/);
    expect(() => Pagination.create(host, { pageCount: 3, pageSizes: [] })).toThrow(/pageSizes/);
    expect(() => Pagination.create(host, { pageCount: 3, siblingCount: 11 })).toThrow(/siblingCount/);
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });
});

describe('Pagination: interaction', () => {
  it('page buttons, previous, and next change the page and emit aui-change', async () => {
    const p = mount({ page: 1 });
    const seen = changes(p);
    await userEvent.click(pageButtons(p).find((b) => b.textContent === '3')!);
    expect(p.page).toBe(3);
    await userEvent.click(button(p, 'next'));
    expect(p.page).toBe(4);
    await userEvent.click(button(p, 'previous'));
    expect(p.page).toBe(3);
    await userEvent.click(pageButtons(p).find((b) => b.getAttribute('aria-current') === 'page')!);
    expect(seen).toEqual([{ page: 3, pageSize: null }, { page: 4, pageSize: null }, { page: 3, pageSize: null }]);
  });

  it('first and last jump to the bounds', async () => {
    const p = mount({ page: 5, showFirstLast: true });
    await userEvent.click(button(p, 'last'));
    expect(p.page).toBe(10);
    await userEvent.click(button(p, 'first'));
    expect(p.page).toBe(1);
  });

  it('keeps focus on the activated control across re-renders', async () => {
    const p = mount({ page: 1 });
    await userEvent.click(pageButtons(p).find((b) => b.textContent === '5')!);
    expect(document.activeElement?.textContent).toBe('5');
    button(p, 'next').focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(button(p, 'next'));
  });

  it('moves focus to the current page when the activated control becomes disabled', async () => {
    const p = mount({ page: 2 });
    button(p, 'previous').focus();
    await userEvent.keyboard('{Enter}');
    expect(p.page).toBe(1);
    expect(document.activeElement?.getAttribute('aria-current')).toBe('page');
  });

  it('is operable with Tab and Enter/Space (native buttons)', async () => {
    const p = mount({ page: 1 });
    button(p, 'previous').focus();
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe('1');
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(p.page).toBe(2);
  });

  it('announces the new range (or page) after a user change', async () => {
    const region = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';
    const withTotal = mount({ total: 57, pageSize: 10 });
    await userEvent.click(button(withTotal, 'next'));
    await vi.waitFor(() => {
      expect(region()).toBe('Showing 11 to 20 of 57');
    });
    const noTotal = mount();
    await userEvent.click(button(noTotal, 'next'));
    await vi.waitFor(() => {
      expect(region()).toBe('Page 2 of 10');
    });
    // Programmatic changes are not announced.
    noTotal.setPage(5);
    await new Promise((resolve) => requestAnimationFrame(resolve));
    expect(region()).toBe('Page 2 of 10');
  });

  it('rows-per-page select changes the size and keeps the first visible item', async () => {
    const p = mount({ total: 95, pageSize: 10, pageSizes: [10, 25, 50], page: 4 });
    const seen = changes(p);
    const select = p.nav.querySelector('select')!;
    const label = p.nav.querySelector('label')!;
    expect(label.htmlFor).toBe(select.id);
    expect(label.textContent).toBe('Rows per page');
    expect(Array.from(select.options).map((o) => o.value)).toEqual(['10', '25', '50']);
    await userEvent.selectOptions(select, '25');
    expect(p.pageSize).toBe(25);
    expect(p.page).toBe(2);
    expect(p.pageCount).toBe(4);
    expect(seen).toEqual([{ page: 2, pageSize: 25 }]);
  });

  it('defaults pageSize to the first of pageSizes', () => {
    const p = mount({ total: 95, pageSizes: [20, 50] });
    expect(p.pageSize).toBe(20);
    expect(p.pageCount).toBe(5);
  });
});

describe('Pagination: API and configuration', () => {
  it('setPage clamps and emits nothing', () => {
    const p = mount();
    const seen = changes(p);
    p.setPage(99);
    expect(p.page).toBe(10);
    p.setPage(-3);
    expect(p.page).toBe(1);
    expect(seen).toHaveLength(0);
    expect(() => {
      p.setPage(2.5);
    }).toThrow(/page/);
  });

  it('update() clamps the page when the total shrinks and can switch modes', () => {
    const p = mount({ total: 100, pageSize: 10, page: 9 });
    p.update({ total: 30 });
    expect(p.page).toBe(3);
    p.update({ pageCount: 20 });
    expect(p.pageCount).toBe(20);
    expect(p.options.total).toBeUndefined();
  });

  it('honours global configuration; instance options win', () => {
    configureAbsoluteUI({ components: { pagination: { siblingCount: 0, boundaryCount: 0, showFirstLast: true } } });
    const p = mount({ page: 5 });
    expect(visible(p)).toEqual([E, '5', E]);
    expect(button(p, 'first').hidden).toBe(false);
    const q = mount({ page: 5, siblingCount: 1 });
    expect(visible(q)).toEqual([E, '4', '5', '6', E]);
    configureAbsoluteUI({});
    expect(visible(p)).toEqual(['1', E, '4', '5', '6', E, '10']);
  });

  it('destroy removes rendering, listeners, and subscriptions', async () => {
    const p = mount();
    const host = p.host;
    const next = button(p, 'next');
    p.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    host.append(p.nav);
    await userEvent.click(next);
    expect(p.page).toBe(1);
    configureAbsoluteUI({ components: { pagination: { showFirstLast: true } } });
    expect(button(p, 'first').hidden).toBe(true);
  });
});
