import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Tabs, type TabItem, type TabsChangeDetail, type TabsOptions } from '@absoluteui/components/tabs';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const ITEMS: readonly TabItem[] = [
  { id: 'overview', label: 'Overview', content: 'Overview panel' },
  { id: 'activity', label: 'Activity', content: 'Activity panel' },
  { id: 'billing', label: 'Billing', disabled: true },
  { id: 'settings', label: 'Settings', content: 'Settings panel' },
];

function mount(options: Partial<TabsOptions> = {}): Tabs {
  const host = document.createElement('div');
  document.body.append(host);
  return Tabs.create(host, { label: 'Account', tabs: ITEMS, ...options });
}

const tabs = (t: Tabs): HTMLButtonElement[] => Array.from(t.tablist.querySelectorAll<HTMLButtonElement>('[role="tab"]'));
const tab = (t: Tabs, label: string): HTMLButtonElement => tabs(t).find((b) => b.textContent === label)!;
const changes = (t: Tabs): TabsChangeDetail[] => {
  const seen: TabsChangeDetail[] = [];
  t.host.addEventListener('aui-change', (event) => seen.push((event as CustomEvent<TabsChangeDetail>).detail));
  return seen;
};

describe('Tabs: semantics', () => {
  it('renders an APG tablist with wired tabs and panels', () => {
    const t = mount();
    expect(t.tablist.getAttribute('role')).toBe('tablist');
    expect(t.tablist.getAttribute('aria-label')).toBe('Account');
    expect(t.tablist.getAttribute('aria-orientation')).toBe('horizontal');
    for (const [i, b] of tabs(t).entries()) {
      const item = ITEMS[i]!;
      const panel = t.panel(item.id)!;
      expect(b.type).toBe('button');
      expect(b.getAttribute('aria-controls')).toBe(panel.id);
      expect(panel.getAttribute('role')).toBe('tabpanel');
      expect(panel.getAttribute('aria-labelledby')).toBe(b.id);
      expect(b.getAttribute('aria-selected')).toBe(String(i === 0));
      expect(panel.hidden).toBe(i !== 0);
    }
    expect(tab(t, 'Billing').disabled).toBe(true);
    expect(t.value).toBe('overview');
    expect(t.panel('overview')!.textContent).toBe('Overview panel');
    expect(t.panel('missing')).toBeNull();
  });

  it('uses a single tab stop on the selected tab', () => {
    const t = mount({ value: 'activity' });
    expect(tabs(t).map((b) => b.tabIndex)).toEqual([-1, 0, -1, -1]);
  });

  it('defaults to the first enabled tab', () => {
    const t = mount({ tabs: [{ id: 'a', label: 'A', disabled: true }, { id: 'b', label: 'B' }] });
    expect(t.value).toBe('b');
  });

  it('makes panels without focusable content focusable, and tracks consumer content', async () => {
    const t = mount();
    const panel = t.panel('overview')!;
    expect(panel.tabIndex).toBe(0);
    const button = document.createElement('button');
    button.textContent = 'Edit';
    panel.replaceChildren(button);
    await vi.waitFor(() => {
      expect(panel.hasAttribute('tabindex')).toBe(false);
    });
  });

  it('renders decorative icons and text labels (never HTML)', () => {
    const t = mount({ tabs: [{ id: 'a', label: '<b>A</b>', icon: 'info' }] });
    const b = tabs(t)[0]!;
    expect(b.querySelector('b')).toBeNull();
    expect(b.textContent).toBe('<b>A</b>');
    expect(b.querySelector('.aui-icon')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Tabs.create(host, { label: ' ', tabs: ITEMS })).toThrow(AbsoluteUIError);
    expect(() => Tabs.create(host, { label: 'x', tabs: [] })).toThrow(/tabs/);
    expect(() => Tabs.create(host, { label: 'x', tabs: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] })).toThrow(/tabs\.id/);
    expect(() => Tabs.create(host, { label: 'x', tabs: [{ id: 'a', label: '' }] })).toThrow(/tabs\.label/);
    expect(() => Tabs.create(host, { label: 'x', tabs: ITEMS, value: 'nope' })).toThrow(/value/);
    // @ts-expect-error invalid activation
    expect(() => Tabs.create(host, { label: 'x', tabs: ITEMS, activation: 'hover' })).toThrow(/activation/);
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });
});

describe('Tabs: keyboard', () => {
  it('automatic activation: arrows move focus and select, skipping disabled tabs and wrapping', async () => {
    const t = mount();
    const seen = changes(t);
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab(t, 'Activity'));
    expect(t.value).toBe('activity');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab(t, 'Settings'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(t.value).toBe('settings');
    await userEvent.keyboard('{Home}');
    expect(t.value).toBe('overview');
    await userEvent.keyboard('{End}');
    expect(t.value).toBe('settings');
    expect(t.panel('settings')!.hidden).toBe(false);
    expect(seen.map((d) => d.value)).toEqual(['activity', 'settings', 'overview', 'settings', 'overview', 'settings']);
    expect(seen[0]).toEqual({ value: 'activity', previous: 'overview' });
  });

  it('manual activation: arrows move focus only; Enter and Space select', async () => {
    const t = mount({ activation: 'manual' });
    const seen = changes(t);
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab(t, 'Activity'));
    expect(t.value).toBe('overview');
    expect(tab(t, 'Activity').tabIndex).toBe(0);
    await userEvent.keyboard('{Enter}');
    expect(t.value).toBe('activity');
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.keyboard(' ');
    expect(t.value).toBe('settings');
    expect(seen).toHaveLength(2);
  });

  it('manual activation: leaving the tablist returns the tab stop to the selected tab', async () => {
    const t = mount({ activation: 'manual' });
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowRight}');
    await userEvent.tab();
    expect(document.activeElement).toBe(t.panel('overview'));
    expect(tabs(t).map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
  });

  it('vertical orientation uses Up/Down and ignores Left/Right', async () => {
    const t = mount({ orientation: 'vertical' });
    expect(t.tablist.getAttribute('aria-orientation')).toBe('vertical');
    expect(t.host.classList.contains('aui-tabs--vertical')).toBe(true);
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowRight}');
    expect(t.value).toBe('overview');
    await userEvent.keyboard('{ArrowDown}');
    expect(t.value).toBe('activity');
    await userEvent.keyboard('{ArrowUp}');
    expect(t.value).toBe('overview');
  });

  it('mirrors Left/Right in RTL (configured or inherited dir)', async () => {
    const t = mount({ direction: 'rtl' });
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(t.value).toBe('activity');

    const wrapper = document.createElement('div');
    wrapper.dir = 'rtl';
    document.body.append(wrapper);
    const host = document.createElement('div');
    wrapper.append(host);
    const inherited = Tabs.create(host, { label: 'x', tabs: ITEMS });
    await userEvent.click(tab(inherited, 'Overview'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(inherited.value).toBe('activity');
  });

  it('Tab moves from the selected tab into the panel', async () => {
    const t = mount();
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.tab();
    expect(document.activeElement).toBe(t.panel('overview'));
  });

  it('clicking a tab selects it; clicking a disabled tab does nothing', async () => {
    const t = mount();
    const seen = changes(t);
    await userEvent.click(tab(t, 'Activity'));
    expect(t.value).toBe('activity');
    // Disabled buttons receive no click from real input; dispatch directly to prove the guard.
    tab(t, 'Billing').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(t.value).toBe('activity');
    await userEvent.click(tab(t, 'Activity'));
    expect(seen).toHaveLength(1);
  });
});

describe('Tabs: API and configuration', () => {
  it('select() changes the selection without events', () => {
    const t = mount();
    const seen = changes(t);
    t.select('settings');
    expect(t.value).toBe('settings');
    expect(t.panel('settings')!.hidden).toBe(false);
    expect(seen).toHaveLength(0);
    expect(() => {
      t.select('nope');
    }).toThrow(/value/);
  });

  it('update() keeps existing panels (and consumer content) by id', () => {
    const t = mount();
    const panel = t.panel('activity')!;
    const extra = document.createElement('p');
    panel.append(extra);
    t.update({ tabs: [...ITEMS, { id: 'audit', label: 'Audit' }] });
    expect(t.panel('activity')).toBe(panel);
    expect(panel.contains(extra)).toBe(true);
    expect(tabs(t)).toHaveLength(5);
    t.update({ tabs: ITEMS.filter((i) => i.id !== 'overview') });
    expect(t.value).toBe('activity');
    expect(t.panel('overview')).toBeNull();
  });

  it('keeps focus on the tab while re-rendering on selection (regression)', async () => {
    const t = mount();
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(tab(t, 'Activity'));
  });

  it('honours global configuration, with instance options taking precedence', async () => {
    configureAbsoluteUI({ components: { tabs: { activation: 'manual', orientation: 'vertical' } } });
    const t = mount();
    expect(t.tablist.getAttribute('aria-orientation')).toBe('vertical');
    await userEvent.click(tab(t, 'Overview'));
    await userEvent.keyboard('{ArrowDown}');
    expect(t.value).toBe('overview');
    const u = mount({ orientation: 'horizontal' });
    expect(u.tablist.getAttribute('aria-orientation')).toBe('horizontal');
    configureAbsoluteUI({});
    expect(t.tablist.getAttribute('aria-orientation')).toBe('horizontal');
  });

  it('scrolls an overflowing tablist so the selected tab is visible', () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ id: `t${String(i)}`, label: `Tab number ${String(i)}` }));
    const host = document.createElement('div');
    document.body.append(host);
    const t = Tabs.create(host, { label: 'Many', tabs: many });
    // Unit tests run without the compiled stylesheet: apply the relevant layout inline.
    t.tablist.style.setProperty('display', 'flex');
    t.tablist.style.setProperty('overflow-x', 'auto');
    t.tablist.style.setProperty('inline-size', '200px');
    for (const b of tabs(t)) b.style.setProperty('flex', 'none');
    t.select('t19');
    const list = t.tablist.getBoundingClientRect();
    const selected = tab(t, 'Tab number 19').getBoundingClientRect();
    expect(t.tablist.scrollLeft).toBeGreaterThan(0);
    expect(selected.right).toBeLessThanOrEqual(list.right + 1);
    expect(selected.left).toBeGreaterThanOrEqual(list.left - 1);
  });

  it('destroy removes rendering, listeners, and subscriptions', async () => {
    const t = mount();
    const host = t.host;
    t.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    configureAbsoluteUI({ components: { tabs: { orientation: 'vertical' } } });
    expect(t.tablist.getAttribute('aria-orientation')).toBe('horizontal');
    host.append(t.tablist);
    await userEvent.click(tabs(t)[0]!);
    await userEvent.keyboard('{ArrowRight}');
    expect(t.value).toBe('overview');
  });
});
