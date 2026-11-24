import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { MenuBar, type MenuBarItem, type MenuBarSelectDetail } from '@absoluteui/components/menu-bar';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('dir');
});

const items: MenuBarItem[] = [
  { id: 'file', label: 'File', items: [{ id: 'new', label: 'New' }, { id: 'open', label: 'Open', items: [{ id: 'recent', label: 'Recent' }] }, { id: 'save', label: 'Save' }] },
  { id: 'edit', label: 'Edit', items: [{ id: 'undo', label: 'Undo' }, { id: 'redo', label: 'Redo' }] },
  { id: 'help', label: 'Help' },
  { id: 'view', label: 'View', disabled: true, items: [{ id: 'zoom', label: 'Zoom' }] },
];

function mount(extra: Partial<Parameters<typeof MenuBar.create>[1]> = {}): MenuBar {
  const host = document.createElement('div');
  const after = document.createElement('button');
  after.textContent = 'After';
  document.body.append(host, after);
  return MenuBar.create(host, { label: 'Editor', items, ...extra });
}

const button = (bar: MenuBar, id: string): HTMLButtonElement => bar.element.querySelector<HTMLButtonElement>(`.aui-menu-bar__item[data-id="${id}"]`)!;
const focusedText = (): string => (document.activeElement instanceof HTMLElement ? document.activeElement.textContent : '');

function selections(bar: MenuBar): MenuBarSelectDetail[] {
  const out: MenuBarSelectDetail[] = [];
  bar.host.addEventListener('aui-select', (e) => out.push((e as CustomEvent<MenuBarSelectDetail>).detail));
  return out;
}

describe('MenuBar: semantics', () => {
  it('renders a labelled menubar of menuitems with one tab stop', () => {
    const bar = mount();
    expect(bar.element.getAttribute('role')).toBe('menubar');
    expect(bar.element.getAttribute('aria-label')).toBe('Editor');
    const buttons = Array.from(bar.element.querySelectorAll<HTMLButtonElement>('.aui-menu-bar__item'));
    expect(buttons.map((b) => b.getAttribute('role'))).toEqual(['menuitem', 'menuitem', 'menuitem', 'menuitem']);
    expect(buttons.map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    expect(button(bar, 'file').getAttribute('aria-haspopup')).toBe('menu');
    expect(button(bar, 'file').getAttribute('aria-expanded')).toBe('false');
    expect(button(bar, 'help').hasAttribute('aria-haspopup')).toBe(false);
    expect(button(bar, 'view').getAttribute('aria-disabled')).toBe('true');
    expect(bar.menu('file')?.element.getAttribute('aria-labelledby')).toBe(button(bar, 'file').id);
    expect(bar.menu('help')).toBeNull();
    expect(bar.menu('view')).toBeNull();
    for (const wrapper of bar.element.children) expect(wrapper.getAttribute('role')).toBe('none');
  });
});

describe('MenuBar: keyboard', () => {
  it('ArrowRight/ArrowLeft move between items (wrapping), Home/End jump; the tab stop follows focus', async () => {
    const bar = mount();
    button(bar, 'file').focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(button(bar, 'edit'));
    expect(button(bar, 'edit').tabIndex).toBe(0);
    expect(button(bar, 'file').tabIndex).toBe(-1);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(button(bar, 'view'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(button(bar, 'file'));
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(button(bar, 'view'));
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(button(bar, 'file'));
  });

  it('typeahead focuses the next item starting with the typed character', async () => {
    const bar = mount();
    button(bar, 'file').focus();
    await userEvent.keyboard('h');
    expect(document.activeElement).toBe(button(bar, 'help'));
  });

  it('ArrowDown / Enter open the menu and focus its first item; Escape returns to the menubar item', async () => {
    const bar = mount();
    button(bar, 'file').focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(bar.menu('file')?.isOpen).toBe(true);
    expect(focusedText()).toBe('New');
    await userEvent.keyboard('{Escape}');
    expect(bar.menu('file')?.isOpen).toBe(false);
    expect(document.activeElement).toBe(button(bar, 'file'));
    await userEvent.keyboard('{Enter}');
    expect(focusedText()).toBe('New');
  });

  it('with a menu open, ArrowRight/ArrowLeft switch to the neighbouring menu', async () => {
    const bar = mount();
    button(bar, 'file').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(bar.menu('file')?.isOpen).toBe(false);
    expect(bar.menu('edit')?.isOpen).toBe(true);
    expect(focusedText()).toBe('Undo');
    await userEvent.keyboard('{ArrowRight}');
    // Help has no menu: focus moves to it and nothing opens.
    expect(document.activeElement).toBe(button(bar, 'help'));
    expect(bar.menu('edit')?.isOpen).toBe(false);
    button(bar, 'edit').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}');
    expect(bar.menu('file')?.isOpen).toBe(true);
    expect(focusedText()).toBe('New');
  });

  it('submenus keep Menu behavior: ArrowRight opens, ArrowLeft closes only the submenu', async () => {
    const bar = mount();
    button(bar, 'file').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowRight}');
    expect(focusedText()).toBe('Recent');
    await userEvent.keyboard('{ArrowLeft}');
    expect(focusedText()).toContain('Open');
    expect(bar.menu('file')?.isOpen).toBe(true);
    // ArrowRight on a leaf item inside a submenu goes to the next menubar item.
    await userEvent.keyboard('{ArrowRight}{ArrowRight}');
    expect(bar.menu('edit')?.isOpen).toBe(true);
  });

  it('RTL mirrors the menubar arrows', async () => {
    document.documentElement.dir = 'rtl';
    const bar = mount();
    button(bar, 'file').focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(button(bar, 'edit'));
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}');
    expect(bar.menu('help')).toBeNull();
    expect(document.activeElement).toBe(button(bar, 'help'));
    expect(bar.host.classList.contains('aui-menu-bar--rtl')).toBe(true);
  });
});

describe('MenuBar: activation and pointer', () => {
  it('every selection (commands and menu items) is dispatched on the host', async () => {
    const bar = mount();
    const got = selections(bar);
    const targets: EventTarget[] = [];
    bar.host.addEventListener('aui-select', (e) => targets.push(e.target!));
    await userEvent.click(button(bar, 'help'));
    expect(got).toEqual([{ id: 'help', item: items[2] }]);
    button(bar, 'edit').focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(got[1]?.id).toBe('redo');
    expect(got).toHaveLength(2);
    expect(targets).toEqual([bar.host, bar.host]);
    expect(document.activeElement).toBe(button(bar, 'edit'));
  });

  it('disabled items never open or emit', () => {
    const bar = mount();
    const got = selections(bar);
    button(bar, 'view').click();
    expect(got).toEqual([]);
  });

  it('hovering another menubar item while a menu is open switches menus; touch does not', async () => {
    const bar = mount();
    await userEvent.click(button(bar, 'file'));
    expect(bar.menu('file')?.isOpen).toBe(true);
    // Synthetic move: without component CSS the open popup overlaps the bar in unit tests.
    button(bar, 'edit').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'mouse' }));
    expect(bar.menu('file')?.isOpen).toBe(false);
    expect(bar.menu('edit')?.isOpen).toBe(true);
    button(bar, 'file').dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerType: 'touch' }));
    expect(bar.menu('edit')?.isOpen).toBe(true);
    bar.close();
    expect(bar.menu('edit')?.isOpen).toBe(false);
  });
});

describe('MenuBar: options', () => {
  it('update keeps focus and the tab stop on the same item id', () => {
    const bar = mount();
    button(bar, 'edit').focus();
    bar.update({ items: [...items].reverse() });
    expect(document.activeElement).toBe(button(bar, 'edit'));
    expect(button(bar, 'edit').tabIndex).toBe(0);
  });

  it('global configuration flows to the menus (closeOnSelect)', async () => {
    configureAbsoluteUI({ components: { menuBar: { closeOnSelect: false } } });
    const bar = mount({ items: [{ id: 'view', label: 'View', items: [{ type: 'checkbox', id: 'grid', label: 'Grid', checked: false }] }] });
    button(bar, 'view').focus();
    await userEvent.keyboard('{ArrowDown} ');
    expect(bar.menu('view')?.isOpen).toBe(true);
  });

  it('(regression) updates that do not change items keep an open menu and its checkbox state', async () => {
    const bar = mount({ items: [{ id: 'view', label: 'View', items: [{ type: 'checkbox', id: 'grid', label: 'Grid', checked: false }, { id: 'zoom', label: 'Zoom' }] }], closeOnSelect: false });
    button(bar, 'view').focus();
    await userEvent.keyboard('{ArrowDown} ');
    const menu = bar.menu('view');
    bar.update({ label: 'Viewer' });
    configureAbsoluteUI({ components: { menuBar: { typeahead: false } } });
    expect(bar.menu('view')).toBe(menu);
    expect(menu?.isOpen).toBe(true);
    expect(bar.element.getAttribute('aria-label')).toBe('Viewer');
    expect(menu?.element.querySelector('[data-id="grid"]')?.getAttribute('aria-checked')).toBe('true');
  });

  it('validates before rendering (ids unique across bar and menus) and destroys cleanly', () => {
    const host = document.createElement('div');
    document.body.append(host);
    expect(() => MenuBar.create(host, { label: '', items })).toThrow(AbsoluteUIError);
    expect(() => MenuBar.create(host, { label: 'x', items: [] })).toThrow(AbsoluteUIError);
    expect(() => MenuBar.create(host, { label: 'x', items: [{ id: 'a', label: 'A', items: [{ id: 'a', label: 'Again' }] }] })).toThrow(AbsoluteUIError);
    expect(() => MenuBar.create(host, { label: 'x', items: [{ id: 'a', label: 'A', items: [] }] })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
    const bar = MenuBar.create(host, { label: 'x', items });
    bar.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-menu-bar')).toBe(false);
    expect(document.querySelector('.aui-menu')).toBeNull();
  });
});
