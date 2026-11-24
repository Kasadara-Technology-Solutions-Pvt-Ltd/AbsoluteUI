import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, onNodeRelease, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Menu, type MenuItem, type MenuOptions, type MenuSelectDetail } from '@absoluteui/components/menu';
import { Dialog } from '@absoluteui/components/dialog';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const items: MenuItem[] = [
  { id: 'new', label: 'New file', icon: 'plus', shortcut: 'Ctrl+N' },
  { id: 'open', label: 'Open', description: 'From your computer' },
  { id: 'locked', label: 'Locked', disabled: true },
  { type: 'separator' },
  {
    id: 'share',
    label: 'Share',
    items: [
      { id: 'email', label: 'Email' },
      { id: 'link', label: 'Copy link' },
      { id: 'more', label: 'More', items: [{ id: 'print', label: 'Print' }] },
    ],
  },
  { id: 'delete', label: 'Delete', tone: 'danger' },
];

function mount(options: Partial<MenuOptions> = {}, parent: HTMLElement = document.body): Menu {
  const trigger = document.createElement('button');
  trigger.type = 'button';
  trigger.textContent = 'Actions';
  const after = document.createElement('button');
  after.textContent = 'After';
  after.className = 'after';
  parent.append(trigger, after);
  return Menu.create(trigger, { items, ...options });
}

const item = (id: string): HTMLElement => document.querySelector<HTMLElement>(`.aui-menu__item[data-id="${id}"]`)!;
const focusedId = (): string | undefined => (document.activeElement instanceof HTMLElement ? document.activeElement.dataset.id : undefined);
const submenuOf = (id: string): HTMLElement => document.getElementById(item(id).getAttribute('aria-controls')!)!;
const isShown = (el: HTMLElement): boolean => el.matches(':popover-open');

function selections(m: Menu): MenuSelectDetail[] {
  const out: MenuSelectDetail[] = [];
  m.trigger.addEventListener('aui-select', (e) => out.push((e as CustomEvent<MenuSelectDetail>).detail));
  return out;
}

describe('Menu: semantics', () => {
  it('wires the menu button, popup, and items', () => {
    const m = mount();
    expect(m.trigger.getAttribute('aria-haspopup')).toBe('menu');
    expect(m.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(m.trigger.getAttribute('aria-controls')).toBe(m.element.id);
    expect(m.trigger.nextElementSibling).toBe(m.element);
    expect(m.element.getAttribute('role')).toBe('menu');
    expect(m.element.popover).toBe('manual');
    expect(isShown(m.element)).toBe(false);
    expect(m.element.getAttribute('aria-labelledby')).toBe(m.trigger.id);

    const menuitems = Array.from(m.element.querySelectorAll<HTMLElement>(':scope > [role="menuitem"]'));
    expect(menuitems.map((i) => i.dataset.id)).toEqual(['new', 'open', 'locked', 'share', 'delete']);
    for (const i of menuitems) expect(i.tabIndex).toBe(-1);
    // Roving tabindex once open: the focused item is the one in the tab order.
    m.open();
    expect(document.activeElement).toBe(menuitems[0]);
    expect(menuitems.map((i) => i.tabIndex)).toEqual([0, -1, -1, -1, -1]);
    menuitems[1]!.focus();
    expect(menuitems.map((i) => i.tabIndex)).toEqual([-1, 0, -1, -1, -1]);
    m.close();
    expect(item('locked').getAttribute('aria-disabled')).toBe('true');
    expect(m.element.querySelector('[role="separator"]')).not.toBeNull();

    const name = (el: HTMLElement): string => document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent;
    const description = (el: HTMLElement): string[] => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);
    expect(name(item('new'))).toBe('New file');
    expect(description(item('new'))).toEqual(['Ctrl+N']);
    expect(description(item('open'))).toEqual(['From your computer']);
    expect(item('delete').classList.contains('aui-menu__item--danger')).toBe(true);

    const share = item('share');
    expect(share.getAttribute('aria-haspopup')).toBe('menu');
    expect(share.getAttribute('aria-expanded')).toBe('false');
    const sub = submenuOf('share');
    expect(sub.getAttribute('role')).toBe('menu');
    expect(sub.popover).toBe('manual');
    expect(document.getElementById(sub.getAttribute('aria-labelledby')!)!.textContent).toBe('Share');
    expect(share.querySelector('.aui-menu__submenu-icon')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the label option as aria-label instead of the trigger', () => {
    const m = mount({ label: 'File actions' });
    expect(m.element.getAttribute('aria-label')).toBe('File actions');
    expect(m.element.hasAttribute('aria-labelledby')).toBe(false);
    m.update({ label: undefined });
    expect(m.element.getAttribute('aria-labelledby')).toBe(m.trigger.id);
  });

  it('renders checkbox, radio, and labelled groups', () => {
    const m = mount({
      items: [
        { type: 'checkbox', id: 'wrap', label: 'Word wrap', checked: true },
        { type: 'group', label: 'Sort by', items: [
          { type: 'radio', id: 'name', label: 'Name', group: 'sort', checked: true },
          { type: 'radio', id: 'date', label: 'Date', group: 'sort', checked: false },
        ] },
      ],
    });
    expect(item('wrap').getAttribute('role')).toBe('menuitemcheckbox');
    expect(item('wrap').getAttribute('aria-checked')).toBe('true');
    expect(item('date').getAttribute('role')).toBe('menuitemradio');
    expect(item('date').getAttribute('aria-checked')).toBe('false');
    const group = m.element.querySelector<HTMLElement>('[role="group"]')!;
    expect(document.getElementById(group.getAttribute('aria-labelledby')!)!.textContent).toBe('Sort by');
    expect(m.element.classList.contains('aui-menu--has-check')).toBe(true);
    expect(item('wrap').querySelector('.aui-menu__check svg')).not.toBeNull();
    expect(item('date').querySelector('.aui-menu__check svg')).toBeNull();
  });

  it('validates options before rendering anything', () => {
    const trigger = document.createElement('button');
    document.body.append(trigger);
    const bad: MenuItem[][] = [
      [{ id: 'a', label: 'A' }, { id: 'b', label: 'B', items: [{ id: 'a', label: 'Dup' }] }],
      [{ id: 'a', label: ' ' }],
      [{ id: '', label: 'A' }],
      [{ id: 'a', label: 'A', items: [] }],
      [{ type: 'group', label: 'G', items: [{ type: 'radio', id: 'r', label: 'R', group: '', checked: false }] }],
    ];
    for (const b of bad) expect(() => Menu.create(trigger, { items: b })).toThrow(AbsoluteUIError);
    expect(() => Menu.create(trigger, { items, label: '' })).toThrow(/label/);
    expect(() => Menu.create(trigger, { items, placement: 'middle' as never })).toThrow(AbsoluteUIError);
    expect(() => Menu.create(document.createElement('button'), { items })).toThrow(/trigger/);
    expect(() => Menu.create(document.createElement('div') as unknown as HTMLButtonElement, { items })).toThrow(/trigger/);
    expect(document.body.childElementCount).toBe(1);
    expect(trigger.attributes.length).toBe(0);
  });
});

describe('Menu: keyboard', () => {
  it('Enter, Space, and ArrowDown open and focus the first enabled item; ArrowUp focuses the last', async () => {
    const m = mount({ items: [{ id: 'x', label: 'X', disabled: true }, ...items] });
    for (const key of ['{Enter}', ' ', '{ArrowDown}']) {
      m.trigger.focus();
      await userEvent.keyboard(key);
      expect(m.isOpen).toBe(true);
      expect(m.trigger.getAttribute('aria-expanded')).toBe('true');
      expect(focusedId()).toBe('new');
      await userEvent.keyboard('{Escape}');
      expect(m.isOpen).toBe(false);
      expect(document.activeElement).toBe(m.trigger);
    }
    await userEvent.keyboard('{ArrowUp}');
    expect(focusedId()).toBe('delete');
  });

  it('arrows wrap, Home/End jump, and disabled items stay focusable', async () => {
    const m = mount();
    m.open();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(focusedId()).toBe('locked');
    await userEvent.keyboard('{End}');
    expect(focusedId()).toBe('delete');
    await userEvent.keyboard('{ArrowDown}');
    expect(focusedId()).toBe('new');
    await userEvent.keyboard('{ArrowUp}');
    expect(focusedId()).toBe('delete');
    await userEvent.keyboard('{Home}');
    expect(focusedId()).toBe('new');
  });

  it('Enter activates an item, closes, and returns focus to the trigger', async () => {
    const m = mount();
    const got = selections(m);
    m.trigger.focus();
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(got).toEqual([{ id: 'open', item: items[1] }]);
    expect(m.isOpen).toBe(false);
    expect(document.activeElement).toBe(m.trigger);
  });

  it('Space activates without re-opening the menu (regression)', async () => {
    const m = mount();
    const got = selections(m);
    m.trigger.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard(' ');
    expect(got.map((d) => d.id)).toEqual(['new']);
    expect(m.isOpen).toBe(false);
    expect(document.activeElement).toBe(m.trigger);
  });

  it('Enter and Space do not activate disabled items', async () => {
    const m = mount();
    const got = selections(m);
    m.open();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter} ');
    expect(got).toEqual([]);
    expect(m.isOpen).toBe(true);
  });

  it('Tab closes the menu and moves focus onward from the trigger', async () => {
    const m = mount();
    m.trigger.focus();
    await userEvent.keyboard('{Enter}{ArrowDown}');
    await userEvent.tab();
    expect(m.isOpen).toBe(false);
    expect(document.activeElement).toBe(document.querySelector('.after'));
  });

  it('opens and closes submenus with ArrowRight / ArrowLeft and Escape', async () => {
    const m = mount();
    m.open();
    await userEvent.keyboard('{End}{ArrowUp}');
    expect(focusedId()).toBe('share');
    await userEvent.keyboard('{ArrowRight}');
    const sub = submenuOf('share');
    expect(isShown(sub)).toBe(true);
    expect(item('share').getAttribute('aria-expanded')).toBe('true');
    expect(focusedId()).toBe('email');
    await userEvent.keyboard('{ArrowUp}');
    expect(focusedId()).toBe('more');
    await userEvent.keyboard('{Enter}');
    expect(focusedId()).toBe('print');
    await userEvent.keyboard('{Escape}');
    expect(focusedId()).toBe('more');
    expect(isShown(submenuOf('more'))).toBe(false);
    expect(isShown(sub)).toBe(true);
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedId()).toBe('share');
    expect(isShown(sub)).toBe(false);
    expect(item('share').getAttribute('aria-expanded')).toBe('false');
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{ArrowLeft}');
    expect(m.isOpen).toBe(true);
    expect(focusedId()).toBe('share');
  });

  it('activating a submenu item closes every level', async () => {
    const m = mount();
    const got = selections(m);
    m.open();
    await userEvent.keyboard('{End}{ArrowUp}{ArrowRight}{ArrowDown}{Enter}');
    expect(got.map((d) => d.id)).toEqual(['link']);
    expect(m.isOpen).toBe(false);
    expect(isShown(submenuOf('share'))).toBe(false);
    expect(document.activeElement).toBe(m.trigger);
  });

  it('mirrors submenu arrows in RTL', async () => {
    const m = mount({ direction: 'rtl' });
    expect(m.element.dataset.direction).toBe('rtl');
    expect(submenuOf('share').dataset.direction).toBe('rtl');
    m.open();
    await userEvent.keyboard('{End}{ArrowUp}{ArrowRight}');
    expect(isShown(submenuOf('share'))).toBe(false);
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedId()).toBe('email');
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedId()).toBe('email');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedId()).toBe('share');
    expect(isShown(submenuOf('share'))).toBe(false);
  });

  it('inherits direction from global configuration', () => {
    configureAbsoluteUI({ direction: 'rtl' });
    const m = mount();
    expect(m.element.dataset.direction).toBe('rtl');
  });

  it('typeahead focuses the next item starting with the typed characters; navigation resets the query (regression)', async () => {
    const m = mount();
    m.open();
    await userEvent.keyboard('d');
    expect(focusedId()).toBe('delete');
    await userEvent.keyboard('{Home}o');
    expect(focusedId()).toBe('open');
    m.update({ typeahead: false });
    await userEvent.keyboard('{Home}d');
    expect(focusedId()).toBe('new');
  });
});

describe('Menu: checkbox and radio items', () => {
  const checkable: MenuItem[] = [
    { type: 'checkbox', id: 'wrap', label: 'Word wrap', checked: false },
    { type: 'separator' },
    { type: 'radio', id: 'light', label: 'Light', group: 'theme', checked: true },
    { type: 'radio', id: 'dark', label: 'Dark', group: 'theme', checked: false },
  ];

  it('toggles a checkbox and closes by default', async () => {
    const m = mount({ items: checkable });
    const got = selections(m);
    m.trigger.focus();
    await userEvent.keyboard('{Enter}{Enter}');
    expect(got).toEqual([{ id: 'wrap', item: checkable[0], checked: true }]);
    expect(item('wrap').getAttribute('aria-checked')).toBe('true');
    expect(m.isOpen).toBe(false);
  });

  it('keeps the menu open with closeOnSelect false; Space toggles', async () => {
    const m = mount({ items: checkable, closeOnSelect: false });
    const got = selections(m);
    m.open();
    await userEvent.keyboard('  ');
    expect(got.map((d) => d.checked)).toEqual([true, false]);
    expect(item('wrap').getAttribute('aria-checked')).toBe('false');
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{End}{Enter}');
    expect(item('dark').getAttribute('aria-checked')).toBe('true');
    expect(item('light').getAttribute('aria-checked')).toBe('false');
    expect(got.at(-1)).toEqual({ id: 'dark', item: checkable[3], checked: true });
    // Activating the checked radio keeps it checked.
    await userEvent.keyboard('{Enter}');
    expect(item('dark').getAttribute('aria-checked')).toBe('true');
    expect(m.isOpen).toBe(true);
  });

  it('closeOnSelect honours global configuration and instance precedence', async () => {
    configureAbsoluteUI({ components: { menu: { closeOnSelect: false } } });
    const m = mount({ items: checkable });
    m.open();
    await userEvent.keyboard('{Enter}');
    expect(m.isOpen).toBe(true);
    m.update({ closeOnSelect: true });
    await userEvent.keyboard('{Enter}');
    expect(m.isOpen).toBe(false);
  });

  it('update({ items }) resets checked state from the items', async () => {
    const m = mount({ items: checkable, closeOnSelect: false });
    m.open();
    await userEvent.keyboard('{Enter}');
    expect(item('wrap').getAttribute('aria-checked')).toBe('true');
    m.update({ items: checkable });
    expect(item('wrap').getAttribute('aria-checked')).toBe('false');
    expect(focusedId()).toBe('wrap');
    expect(m.isOpen).toBe(true);
  });
});

describe('Menu: pointer', () => {
  it('does not move focus when the menu opens under a stationary pointer (regression)', () => {
    const m = mount();
    m.open();
    const first = document.activeElement;
    const items = m.element.querySelectorAll<HTMLElement>('[role^="menuitem"]');
    // Browsers dispatch pointerover without movement when content appears under the cursor.
    items[2]!.dispatchEvent(new PointerEvent('pointerover', { bubbles: true, pointerType: 'mouse' }));
    expect(document.activeElement).toBe(first);
    items[2]!.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    expect(document.activeElement).toBe(items[2]);
  });

  it('clicking the trigger toggles the menu', async () => {
    const m = mount();
    await userEvent.click(m.trigger);
    expect(m.isOpen).toBe(true);
    expect(focusedId()).toBe('new');
    await userEvent.click(m.trigger);
    expect(m.isOpen).toBe(false);
  });

  it('clicking an item activates it', async () => {
    const m = mount();
    const got = selections(m);
    await userEvent.click(m.trigger);
    await userEvent.click(item('delete'));
    expect(got.map((d) => d.id)).toEqual(['delete']);
    expect(m.isOpen).toBe(false);
  });

  it('clicking a disabled item does nothing', () => {
    const m = mount();
    const got = selections(m);
    m.open();
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    item('locked').click();
    expect(got).toEqual([]);
    expect(m.isOpen).toBe(true);
  });

  it('hovering a submenu parent opens its submenu after a short delay', async () => {
    const m = mount();
    await userEvent.click(m.trigger);
    await userEvent.hover(item('share'));
    expect(document.activeElement).toBe(item('share'));
    await expect.poll(() => isShown(submenuOf('share'))).toBe(true);
    await userEvent.hover(item('email'));
    await userEvent.click(item('email'));
    expect(m.isOpen).toBe(false);
    await userEvent.click(m.trigger);
    await userEvent.hover(item('share'));
    await expect.poll(() => isShown(submenuOf('share'))).toBe(true);
    await userEvent.hover(item('open'));
    await expect.poll(() => isShown(submenuOf('share'))).toBe(false);
    expect(m.isOpen).toBe(true);
  });

  it('a pointer press outside closes every level', async () => {
    const m = mount();
    m.open();
    await userEvent.keyboard('{End}{ArrowUp}{ArrowRight}');
    expect(isShown(submenuOf('share'))).toBe(true);
    await userEvent.click(document.querySelector<HTMLElement>('.after')!);
    expect(m.isOpen).toBe(false);
    expect(isShown(submenuOf('share'))).toBe(false);
    expect(m.trigger.getAttribute('aria-expanded')).toBe('false');
  });
});

describe('Menu: lifecycle', () => {
  it('emits non-bubbling aui-open and aui-close on the menu element', async () => {
    const m = mount();
    const log: string[] = [];
    m.element.addEventListener('aui-open', () => log.push('open'));
    m.element.addEventListener('aui-close', () => log.push('close'));
    document.body.addEventListener('aui-open', () => log.push('bubbled'));
    document.body.addEventListener('aui-close', () => log.push('bubbled'));
    m.open('last');
    expect(focusedId()).toBe('delete');
    await userEvent.keyboard('{Escape}');
    m.close();
    expect(log).toEqual(['open', 'close']);
  });

  it('aui-select bubbles from the trigger', async () => {
    const m = mount();
    let bubbled = '';
    document.body.addEventListener('aui-select', (e) => {
      bubbled = (e as CustomEvent<MenuSelectDetail>).detail.id;
    });
    m.open();
    await userEvent.keyboard('{Enter}');
    expect(bubbled).toBe('new');
  });

  it('Escape inside a Dialog closes only the menu', async () => {
    const d = Dialog.create({ title: 'Edit' });
    const m = mount({}, d.body);
    d.open();
    m.trigger.focus();
    await userEvent.keyboard('{Enter}{End}{ArrowUp}{ArrowRight}');
    expect(isShown(submenuOf('share'))).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(isShown(submenuOf('share'))).toBe(false);
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(m.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(m.trigger);
    d.close();
  });

  it('close() returns focus to the trigger only when focus was inside', () => {
    const m = mount();
    m.open();
    m.close();
    expect(document.activeElement).toBe(m.trigger);
    m.open();
    document.querySelector<HTMLElement>('.after')!.focus();
    expect(m.isOpen).toBe(false);
  });

  it('destroy removes rendering, attributes, and listeners', async () => {
    const m = mount();
    const trigger = m.trigger;
    m.open();
    await userEvent.keyboard('{End}{ArrowUp}{ArrowRight}');
    m.destroy();
    expect(document.querySelector('.aui-menu')).toBeNull();
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
    expect(trigger.hasAttribute('aria-expanded')).toBe(false);
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    expect(trigger.hasAttribute('id')).toBe(false);
    await userEvent.click(trigger);
    expect(m.isOpen).toBe(false);
    expect(document.querySelector('.aui-menu')).toBeNull();
  });

  it('an empty menu opens with focus on the menu and closes with Escape', async () => {
    const m = mount({ items: [] });
    m.trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(m.isOpen).toBe(true);
    expect(document.activeElement).toBe(m.element);
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(m.isOpen).toBe(false);
    expect(document.activeElement).toBe(m.trigger);
  });

  it('keeps a consumer trigger id on destroy', () => {
    const trigger = document.createElement('button');
    trigger.id = 'actions';
    document.body.append(trigger);
    const m = Menu.create(trigger, { items });
    expect(m.element.getAttribute('aria-labelledby')).toBe('actions');
    m.destroy();
    expect(trigger.id).toBe('actions');
  });

  it('builds and navigates 200 items quickly (performance sanity)', async () => {
    const many: MenuItem[] = Array.from({ length: 200 }, (_, i) => ({ id: `i${i}`, label: `Item ${i}` }));
    const start = performance.now();
    const m = mount({ items: many });
    m.open();
    const elapsed = performance.now() - start;
    expect(m.element.querySelectorAll('[role="menuitem"]').length).toBe(200);
    expect(elapsed).toBeLessThan(100);
    await userEvent.keyboard('{End}');
    expect(focusedId()).toBe('i199');
  });
});

describe('Menu: renderItem (since 0.9.0)', () => {
  it('renders custom content; the label stays the accessible name and typeahead text; nodes are released', async () => {
    const released: string[] = [];
    const rendered: string[] = [];
    const m = mount({
      renderItem: (it, { doc }) => {
        rendered.push(it.id);
        const node = doc.createElement('b');
        node.className = 'custom';
        node.textContent = `* ${it.label}`;
        return onNodeRelease(node, () => {
          released.push(it.id);
        });
      },
    });
    const el = item('open');
    const label = document.getElementById(el.getAttribute('aria-labelledby')!)!;
    expect(label.textContent).toBe('Open');
    expect(label.classList.contains('aui-menu__label--hidden')).toBe(true);
    expect(el.querySelector('.aui-menu__custom')?.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('.custom')?.textContent).toBe('* Open');
    // Submenu items are rendered too.
    expect(item('email').querySelector('.custom')?.textContent).toBe('* Email');
    // Typeahead still uses the labels.
    m.open();
    await userEvent.keyboard('d');
    expect(focusedId()).toBe('delete');
    // New items: the dropped items' nodes are released; kept item objects reuse their nodes.
    const before = rendered.length;
    m.update({ items: [items[0]!, items[1]!] });
    expect(rendered.length).toBe(before);
    expect(released.sort()).toEqual(['delete', 'email', 'link', 'locked', 'more', 'print', 'share'].sort());
    m.destroy();
    expect(released).toContain('new');
    expect(released).toContain('open');
  });

  it('rejects a renderItem that is not a function', () => {
    expect(() => mount({ renderItem: 'x' as unknown as MenuOptions['renderItem'] })).toThrow(/menu.renderItem/);
  });
});
