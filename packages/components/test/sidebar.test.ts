import { afterEach, describe, expect, it } from 'vitest';
import { page, userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  Sidebar,
  type SidebarChangeDetail,
  type SidebarCollapsedChangeDetail,
  type SidebarExpandedChangeDetail,
  type SidebarItem,
  type SidebarModeChangeDetail,
  type SidebarNavigateDetail,
} from '@absoluteui/components/sidebar';

afterEach(async () => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
  await page.viewport(1024, 768);
});

const items: SidebarItem[] = [
  { id: 'home', label: 'Home', href: '#home', icon: 'menu' },
  {
    type: 'group',
    id: 'reports',
    label: 'Reports',
    items: [
      { id: 'sales', label: 'Sales', href: '#sales' },
      { type: 'group', id: 'archive', label: 'Archive', items: [{ id: 'y2025', label: '2025', href: '#2025' }] },
    ],
  },
  { id: 'settings', label: 'Settings' },
  { id: 'billing', label: 'Billing', href: '#billing', disabled: true },
];

function mount(options: Partial<Parameters<typeof Sidebar.create>[1]> = {}): Sidebar {
  const host = document.createElement('aside');
  document.body.append(host);
  return Sidebar.create(host, { label: 'Main', items, breakpoint: 0, ...options });
}

const item = (s: Sidebar, id: string): HTMLElement => document.querySelector<HTMLElement>(`.aui-sidebar__item[data-id="${id}"]`)!;
const groupList = (s: Sidebar, id: string): HTMLElement => document.getElementById(item(s, id).getAttribute('aria-controls')!)!;

function events<T>(el: HTMLElement, type: string): T[] {
  const out: T[] = [];
  el.addEventListener(type, (e) => out.push((e as CustomEvent<T>).detail));
  return out;
}

describe('Sidebar: semantics', () => {
  it('renders a labelled nav of links, buttons, and disclosure groups', () => {
    const s = mount({ value: 'home' });
    expect(s.nav.tagName).toBe('NAV');
    expect(s.nav.getAttribute('aria-label')).toBe('Main');
    expect(item(s, 'home').tagName).toBe('A');
    expect(item(s, 'home').getAttribute('href')).toBe('#home');
    expect(item(s, 'home').getAttribute('aria-current')).toBe('page');
    expect(item(s, 'settings').tagName).toBe('BUTTON');
    const group = item(s, 'reports');
    expect(group.tagName).toBe('BUTTON');
    expect(group.getAttribute('aria-expanded')).toBe('false');
    expect(groupList(s, 'reports').hidden).toBe(true);
    const billing = item(s, 'billing');
    expect(billing.getAttribute('aria-disabled')).toBe('true');
    expect(billing.getAttribute('role')).toBe('link');
    expect(billing.hasAttribute('href')).toBe(false);
    for (const icon of s.nav.querySelectorAll('.aui-sidebar__icon')) expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('groups containing the active item start expanded', () => {
    const s = mount({ value: 'y2025' });
    expect(item(s, 'reports').getAttribute('aria-expanded')).toBe('true');
    expect(item(s, 'archive').getAttribute('aria-expanded')).toBe('true');
    expect(s.expanded).toEqual(['reports', 'archive']);
  });
});

describe('Sidebar: interaction', () => {
  it('group toggles expand and collapse in place (focus stays) and emit aui-expanded-change', async () => {
    const s = mount();
    const got = events<SidebarExpandedChangeDetail>(s.host, 'aui-expanded-change');
    await userEvent.click(item(s, 'reports'));
    expect(item(s, 'reports').getAttribute('aria-expanded')).toBe('true');
    expect(groupList(s, 'reports').hidden).toBe(false);
    expect(document.activeElement).toBe(item(s, 'reports'));
    await userEvent.keyboard('{Enter}');
    expect(item(s, 'reports').getAttribute('aria-expanded')).toBe('false');
    expect(got).toEqual([{ id: 'reports', expanded: true, value: ['reports'] }, { id: 'reports', expanded: false, value: [] }]);
  });

  it('activation emits cancelable aui-navigate, then aui-change and moves aria-current', async () => {
    const s = mount({ value: 'home' });
    const nav = events<SidebarNavigateDetail>(s.host, 'aui-navigate');
    const changes = events<SidebarChangeDetail>(s.host, 'aui-change');
    await userEvent.click(item(s, 'settings'));
    expect(nav).toEqual([{ id: 'settings', item: items[2] }]);
    expect(changes).toEqual([{ value: 'settings', previous: 'home' }]);
    expect(item(s, 'settings').getAttribute('aria-current')).toBe('page');
    expect(item(s, 'home').hasAttribute('aria-current')).toBe(false);
  });

  it('preventDefault blocks the navigation and the active change (SPA routers take over)', async () => {
    const s = mount({ value: 'settings' });
    s.host.addEventListener('aui-navigate', (e) => {
      e.preventDefault();
    });
    const before = location.hash;
    await userEvent.click(item(s, 'home'));
    expect(location.hash).toBe(before);
    expect(s.value).toBe('settings');
    s.select('home');
    expect(item(s, 'home').getAttribute('aria-current')).toBe('page');
  });

  it('disabled items are not focusable and never navigate', () => {
    const s = mount();
    const nav = events<SidebarNavigateDetail>(s.host, 'aui-navigate');
    item(s, 'billing').click();
    expect(nav).toEqual([]);
    item(s, 'billing').focus();
    expect(document.activeElement).not.toBe(item(s, 'billing'));
  });

  it('collapse toggle switches to the icon rail with tooltips and emits aui-collapsed-change', async () => {
    const s = mount();
    const got = events<SidebarCollapsedChangeDetail>(s.host, 'aui-collapsed-change');
    const toggle = s.host.querySelector<HTMLButtonElement>('.aui-sidebar__toggle')!;
    expect(toggle.getAttribute('aria-label')).toBe('Collapse sidebar');
    await userEvent.click(toggle);
    expect(s.collapsed).toBe(true);
    expect(s.host.classList.contains('aui-sidebar--collapsed')).toBe(true);
    expect(toggle.getAttribute('aria-label')).toBe('Expand sidebar');
    expect(got).toEqual([{ collapsed: true }]);
    // Labels stay the accessible names (tooltips name the items).
    const tip = document.getElementById(item(s, 'settings').getAttribute('aria-labelledby')!)!;
    expect(tip.getAttribute('role')).toBe('tooltip');
    expect(tip.textContent).toBe('Settings');
    await userEvent.click(toggle);
    expect(s.collapsed).toBe(false);
    expect(item(s, 'settings').hasAttribute('aria-labelledby')).toBe(false);
    expect(document.querySelector('.aui-tooltip')).toBeNull();
  });

  it('collapsible: false hides the toggle', () => {
    const s = mount({ collapsible: false, collapsed: true });
    expect(s.host.querySelector<HTMLElement>('.aui-sidebar__footer')!.hidden).toBe(true);
    expect(s.collapsed).toBe(false);
  });
});

describe('Sidebar: responsive drawer', () => {
  it('below the breakpoint the navigation moves into a modal Drawer; above it returns', async () => {
    await page.viewport(600, 700);
    const s = mount({ breakpoint: 768, value: 'home' });
    expect(s.mode).toBe('drawer');
    expect(s.host.classList.contains('aui-sidebar--drawer')).toBe(true);
    const dialog = document.querySelector<HTMLDialogElement>('dialog.aui-drawer')!;
    expect(dialog.contains(s.nav)).toBe(true);
    const modes = events<SidebarModeChangeDetail>(s.host, 'aui-mode-change');
    s.open();
    expect(s.isOpen).toBe(true);
    expect(dialog.matches(':modal')).toBe(true);
    // Navigating from the drawer closes it.
    await userEvent.click(item(s, 'settings'));
    expect(s.isOpen).toBe(false);
    await page.viewport(1024, 700);
    await expect.poll(() => s.mode).toBe('inline');
    expect(s.host.contains(s.nav)).toBe(true);
    expect(modes).toEqual([{ mode: 'inline' }]);
  });

  it('open() is a no-op inline', () => {
    const s = mount();
    s.open();
    expect(s.isOpen).toBe(false);
    expect(document.querySelector('dialog')).toBeNull();
  });
});

describe('Sidebar: options', () => {
  it('update replaces items and keeps focus on the same id; global config applies', () => {
    configureAbsoluteUI({ components: { sidebar: { collapsible: false } } });
    const s = mount();
    expect(s.host.querySelector<HTMLElement>('.aui-sidebar__footer')!.hidden).toBe(true);
    item(s, 'settings').focus();
    s.update({ items: [...items].reverse(), expanded: ['reports'] });
    expect(document.activeElement).toBe(item(s, 'settings'));
    expect(item(s, 'reports').getAttribute('aria-expanded')).toBe('true');
    s.update({ value: 'sales' });
    expect(item(s, 'sales').getAttribute('aria-current')).toBe('page');
  });

  it('RTL direction is applied to the nav', () => {
    const s = mount({ direction: 'rtl' });
    expect(s.nav.dir).toBe('rtl');
  });

  it('validates before rendering and destroys cleanly', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    const bad: Parameters<typeof Sidebar.create>[1][] = [
      { label: '', items },
      { label: 'x', items: [] },
      { label: 'x', items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] },
      { label: 'x', items, value: 'reports' },
      { label: 'x', items, expanded: ['home'] },
      { label: 'x', items: [{ id: 'a', label: 'A', href: 'javascript:void(0)' }] },
      { label: 'x', items: [{ type: 'group', id: 'g', label: 'G', items: [] }] },
      { label: 'x', items, breakpoint: -1 },
    ];
    for (const options of bad) expect(() => Sidebar.create(host, options)).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const s = Sidebar.create(host, { label: 'x', items, breakpoint: 0, collapsed: true });
    s.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    expect(document.querySelector('.aui-tooltip, dialog')).toBeNull();
  });
});
