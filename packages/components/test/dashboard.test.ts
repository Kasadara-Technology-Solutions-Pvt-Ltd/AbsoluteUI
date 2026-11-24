import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  adaptLayout,
  compactLayout,
  DashboardCatalog,
  DashboardGrid,
  findFreeSpot,
  resolveLayout,
  type DashboardCatalogAddDetail,
  type DashboardGridLayoutChangeDetail,
  type DashboardItem,
} from '@absoluteui/components/dashboard-grid';
import { DashboardWidget, type DashboardWidgetToggleDetail } from '@absoluteui/components/dashboard-widget';
import { StatCard } from '@absoluteui/components/stat-card';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const at = (items: readonly DashboardItem[], id: string): DashboardItem => items.find((i) => i.id === id)!;

describe('dashboard layout engine', () => {
  const layout: DashboardItem[] = [
    { id: 'a', x: 0, y: 0, w: 6, h: 2 },
    { id: 'b', x: 6, y: 0, w: 6, h: 2 },
    { id: 'c', x: 0, y: 2, w: 12, h: 1 },
  ];

  it('compaction floats items up; locked items stay', () => {
    const out = compactLayout([{ id: 'a', x: 0, y: 3, w: 4, h: 1 }, { id: 'l', x: 0, y: 1, w: 4, h: 1, locked: true }]);
    expect(at(out, 'a').y).toBe(0);
    expect(at(out, 'l').y).toBe(1);
  });

  it('moving onto another item pushes it down; moving down past a neighbor swaps them', () => {
    const pushed = resolveLayout(layout, { ...at(layout, 'c'), y: 0, w: 6 }, 12);
    expect(at(pushed, 'c')).toMatchObject({ x: 0, y: 0 });
    expect(at(pushed, 'a').y).toBe(1);
    // Same column: moving a down one row lets c float into the space above it.
    const stack: DashboardItem[] = [{ id: 'a', x: 0, y: 0, w: 6, h: 2 }, { id: 'c', x: 0, y: 2, w: 6, h: 1 }, { id: 'b', x: 6, y: 0, w: 6, h: 2 }];
    const swapped = resolveLayout(stack, { ...at(stack, 'a'), y: 1 }, 12);
    expect(at(swapped, 'a').y).toBe(1);
    expect(at(swapped, 'c').y).toBe(0);
    // A full-width row cannot pass a half-width neighbor: compaction floats the item back.
    const blocked = compactLayout(resolveLayout(layout, { ...at(layout, 'a'), y: 2 }, 12));
    expect(at(blocked, 'a').y).toBe(0);
  });

  it('findFreeSpot and adaptLayout (proportional, single column stacks in reading order)', () => {
    expect(findFreeSpot(layout, 4, 1, 12)).toEqual({ x: 0, y: 3 });
    const six = adaptLayout(layout, 12, 6);
    expect(at(six, 'a')).toMatchObject({ x: 0, w: 3 });
    expect(at(six, 'b')).toMatchObject({ x: 3, w: 3 });
    const one = adaptLayout(layout, 12, 1);
    expect(one.map((i) => [i.id, i.y])).toEqual([['a', 0], ['b', 2], ['c', 4]]);
  });
});

function grid(editable = true): { grid: DashboardGrid; host: HTMLDivElement } {
  const host = document.createElement('div');
  host.style.setProperty('width', '1200px');
  for (const id of ['sales', 'users', 'map']) {
    const el = document.createElement('section');
    el.dataset.auiItem = id;
    const h = document.createElement('h3');
    h.textContent = id.toUpperCase();
    const btn = document.createElement('button');
    btn.textContent = `Open ${id}`;
    el.append(h, btn);
    host.append(el);
  }
  document.body.append(host);
  const g = DashboardGrid.create(host, {
    label: 'Overview',
    editable,
    items: [
      { id: 'map', x: 0, y: 2, w: 6, h: 2 },
      { id: 'sales', x: 0, y: 0, w: 6, h: 2 },
      { id: 'users', x: 6, y: 0, w: 6, h: 2, label: 'Active users' },
    ],
  });
  return { grid: g, host };
}

describe('DashboardGrid', () => {
  it('places children with grid placement, names the region, and keeps DOM in reading order', () => {
    const { grid: g, host } = grid(false);
    expect(host.getAttribute('role')).toBe('region');
    expect(host.getAttribute('aria-label')).toBe('Overview');
    const sales = host.querySelector<HTMLElement>('[data-aui-item="sales"]')!;
    expect(sales.style.getPropertyValue('grid-column')).toBe('1 / span 6');
    expect([...host.children].map((c) => (c as HTMLElement).dataset.auiItem)).toEqual(['sales', 'users', 'map']);
    expect(g.breakpoint.name).toBe('lg');
    expect(host.querySelector('.aui-dashboard__handle')).toBeNull();
  });

  it('edit mode: handles named by label or heading; keyboard grab, move, drop, and undo', async () => {
    const { grid: g, host } = grid();
    const handles = [...host.querySelectorAll<HTMLButtonElement>('.aui-dashboard__handle')];
    expect(handles.map((h) => h.getAttribute('aria-label'))).toEqual(['Move SALES', 'Move Active users', 'Move MAP']);
    const changes: DashboardGridLayoutChangeDetail[] = [];
    host.addEventListener('aui-layout-change', (e) => changes.push((e as CustomEvent<DashboardGridLayoutChangeDetail>).detail));
    handles[0]!.focus();
    await userEvent.keyboard('{Enter}');
    expect(handles[0]!.getAttribute('aria-pressed')).toBe('true');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.keyboard('{Enter}');
    expect(handles[0]!.getAttribute('aria-pressed')).toBe('false');
    expect(at(g.items, 'sales').y).toBe(2);
    expect(at(g.items, 'map').y).toBe(0);
    expect(changes.at(-1)).toMatchObject({ reason: 'move', id: 'sales', breakpoint: 'lg' });
    // Reading order follows the new layout and focus stayed on the handle.
    expect([...host.children].map((c) => (c as HTMLElement).dataset.auiItem)).toEqual(['map', 'users', 'sales']);
    expect(document.activeElement).toBe(handles[0]);
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(at(g.items, 'sales').y).toBe(0);
    expect(changes.at(-1)?.reason).toBe('undo');
    expect(g.canRedo).toBe(true);
  });

  it('Shift + arrows resize within limits; Escape cancels', async () => {
    const { grid: g, host } = grid();
    const handle = host.querySelector<HTMLButtonElement>('.aui-dashboard__handle')!;
    handle.focus();
    await userEvent.keyboard('{Enter}{Shift>}{ArrowLeft}{ArrowLeft}{/Shift}{Enter}');
    expect(at(g.items, 'sales').w).toBe(4);
    await userEvent.keyboard('{Enter}{ArrowRight}{Escape}');
    expect(at(g.items, 'sales')).toMatchObject({ x: 0, w: 4 });
    expect(handle.getAttribute('aria-pressed')).toBe('false');
  });

  it('addItem places at the first free spot; removing the element removes the item', async () => {
    const { grid: g, host } = grid();
    const el = document.createElement('section');
    el.textContent = 'New';
    const added = g.addItem({ id: 'extra', w: 4, h: 1 }, el);
    expect(added).toMatchObject({ x: 6, y: 2 });
    expect(el.querySelector('.aui-dashboard__handle')).not.toBeNull();
    expect(() => g.addItem({ id: 'extra', w: 1, h: 1 })).toThrow(AbsoluteUIError);
    host.querySelector('[data-aui-item="users"]')!.remove();
    await new Promise((r) => setTimeout(r, 0));
    expect(g.items.map((i) => i.id).sort()).toEqual(['extra', 'map', 'sales']);
  });

  it('breakpoints: a narrow host uses the derived single-column layout', async () => {
    const { grid: g, host } = grid(false);
    host.style.setProperty('width', '400px');
    await expect.poll(() => g.breakpoint.name).toBe('sm');
    expect(g.items.every((i) => i.x === 0 && i.w === 1)).toBe(true);
    expect(host.style.getPropertyValue('--aui-dashboard-columns')).toBe('1');
  });

  it('validates items and breakpoints without touching the host', () => {
    const host = document.createElement('div');
    expect(() => DashboardGrid.create(host, { label: 'x', items: [{ id: 'a', x: -1, y: 0, w: 1, h: 1 }] })).toThrow(/items\[0\]\.x/);
    expect(() => DashboardGrid.create(host, { label: 'x', items: [], breakpoints: [{ name: 'a', minWidth: 10, columns: 2 }] })).toThrow(/minWidth 0/);
    expect(host.classList.length).toBe(0);
  });
});

describe('DashboardCatalog', () => {
  it('adds a template at the first free spot, vetoable, and focuses the new handle', async () => {
    const { grid: g, host } = grid();
    const catalogHost = document.createElement('div');
    document.body.append(catalogHost);
    const events: DashboardCatalogAddDetail[] = [];
    const catalog = DashboardCatalog.create(catalogHost, {
      grid: g,
      label: 'Widgets',
      templates: [{ id: 'kpi', label: 'KPI', description: 'One number', w: 3, h: 1 }],
      create: (t, item) => {
        const el = document.createElement('section');
        el.textContent = `${t.label} ${item.id}`;
        return el;
      },
    });
    catalogHost.addEventListener('aui-catalog-add', (e) => events.push((e as CustomEvent<DashboardCatalogAddDetail>).detail));
    const button = catalogHost.querySelector('button')!;
    expect(button.getAttribute('aria-label')).toBe('Add KPI');
    await userEvent.click(button);
    expect(events[0]?.item.id).toBe('kpi-1');
    expect(host.querySelector('[data-aui-item="kpi-1"]')?.textContent).toContain('KPI kpi-1');
    expect(document.activeElement).toBe(g.handleFor('kpi-1'));
    catalogHost.addEventListener('aui-catalog-add', (e) => {
      e.preventDefault();
    });
    expect(catalog.add('kpi')).toBeNull();
  });
});

describe('DashboardWidget', () => {
  function widget(extra: Partial<Parameters<typeof DashboardWidget.create>[1]> = {}): DashboardWidget {
    const host = document.createElement('article');
    const body = document.createElement('p');
    body.textContent = 'Body';
    host.append(body);
    document.body.append(host);
    return DashboardWidget.create(host, { title: 'Revenue', ...extra });
  }

  it('inserts a heading and actions without moving the body; collapse is a disclosure', async () => {
    const w = widget({ subtitle: 'This quarter', actions: [{ id: 'refresh', label: 'Refresh', icon: 'refresh' }] });
    expect(w.host.firstElementChild).toBe(w.header);
    expect(w.host.querySelector('h3')?.textContent).toBe('Revenue');
    expect(w.host.getAttribute('role')).toBe('region');
    const toggle = w.host.querySelector<HTMLButtonElement>('.aui-widget__toggle')!;
    expect(toggle.getAttribute('aria-expanded')).toBe('true');
    const toggles: boolean[] = [];
    w.host.addEventListener('aui-toggle', (e) => toggles.push((e as CustomEvent<DashboardWidgetToggleDetail>).detail.collapsed));
    await userEvent.click(toggle);
    expect(w.collapsed).toBe(true);
    expect(toggles).toEqual([true]);
    expect(w.host.querySelector('.aui-widget__toggle')?.getAttribute('aria-label')).toBe('Expand Revenue');
    expect(document.activeElement?.classList.contains('aui-widget__toggle')).toBe(true);
    const actions: string[] = [];
    w.host.addEventListener('aui-action', (e) => actions.push((e as CustomEvent<{ id: string }>).detail.id));
    await userEvent.click(w.host.querySelector('[aria-label="Refresh"]')!);
    expect(actions).toEqual(['refresh']);
  });

  it('maximize: modal dialog in the top layer; Escape restores and returns focus', async () => {
    const w = widget();
    await userEvent.click(w.host.querySelector('.aui-widget__maximize')!);
    expect(w.maximized).toBe(true);
    expect(w.host.getAttribute('role')).toBe('dialog');
    expect(w.host.getAttribute('aria-modal')).toBe('true');
    expect(w.host.matches(':popover-open')).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Restore Revenue');
    await userEvent.keyboard('{Escape}');
    expect(w.maximized).toBe(false);
    expect(w.host.getAttribute('role')).toBe('region');
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Maximize Revenue');
  });

  it('remove emits a cancelable event; destroy removes the header only', async () => {
    const w = widget({ removable: true });
    let fired = 0;
    w.host.addEventListener('aui-remove', () => fired++);
    await userEvent.click(w.host.querySelector('.aui-widget__remove')!);
    expect(fired).toBe(1);
    w.destroy();
    expect(w.host.textContent).toBe('Body');
  });
});

describe('StatCard', () => {
  it('shows value, a spelled-out change with sentiment, and a trend sparkline', () => {
    const host = document.createElement('div');
    document.body.append(host);
    const card = StatCard.create(host, { label: 'Revenue', value: 1200, previous: 1000, comparisonLabel: 'vs last month', trend: [1, 2, 3], valueFormat: { style: 'currency', currency: 'USD', maximumFractionDigits: 0 } });
    expect(host.querySelector('[role="group"]')?.getAttribute('aria-labelledby')).toBe(host.querySelector('.aui-stat-card__label')?.id);
    expect(host.querySelector('.aui-stat-card__value')?.textContent).toBe('$1,200');
    expect(card.delta).toBeCloseTo(0.2);
    expect(host.querySelector('.aui-stat-card__sr')?.textContent).toBe('increase of 20%, favorable');
    expect(host.querySelector('.aui-stat-card__delta--good')).not.toBeNull();
    expect(host.querySelector('svg[role="img"]')?.getAttribute('aria-label')).toMatch(/^Revenue: 3 values/);
    card.update({ sentiment: 'lower-is-better' });
    expect(host.querySelector('.aui-stat-card__sr')?.textContent).toBe('increase of 20%, unfavorable');
    // The sign is spoken once, as the direction word (M7 pilot finding).
    card.update({ previous: 1500 });
    expect(host.querySelector('.aui-stat-card__sr')?.textContent).toBe('decrease of 20%, favorable');
    expect(host.querySelector('.aui-stat-card__delta span[aria-hidden="true"]')?.textContent).toBe('-20%');
  });

  it('href makes the whole card a link; unsafe URLs are rejected', () => {
    const host = document.createElement('div');
    document.body.append(host);
    StatCard.create(host, { label: 'Open tickets', value: 12, href: '/tickets' });
    expect(host.querySelector('a')?.getAttribute('href')).toBe('/tickets');
    // Deliberately unsafe input: the component must reject it.
    const unsafe = ['java', 'script:alert(1)'].join('');
    expect(() => StatCard.create(document.createElement('div'), { label: 'x', value: 1, href: unsafe })).toThrow(/href/);
  });
});
