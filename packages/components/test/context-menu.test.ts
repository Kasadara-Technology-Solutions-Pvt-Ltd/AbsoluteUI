import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ContextMenu, type ContextMenuSelectDetail, type MenuItem } from '@absoluteui/components/context-menu';
import { Dialog } from '@absoluteui/components/dialog';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const items: MenuItem[] = [
  { id: 'copy', label: 'Copy' },
  { id: 'share', label: 'Share', items: [{ id: 'email', label: 'Email' }] },
  { type: 'separator' },
  { id: 'delete', label: 'Delete', tone: 'danger' },
];

function region(parent: HTMLElement = document.body): { target: HTMLDivElement; row: HTMLButtonElement } {
  const target = document.createElement('div');
  target.style.setProperty('padding', '40px');
  const row = document.createElement('button');
  row.type = 'button';
  row.textContent = 'Row 1';
  target.append(row);
  parent.append(target);
  return { target, row };
}

function rightClick(el: Element, x: number, y: number, init: MouseEventInit = {}): boolean {
  return el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y, ...init }));
}

function selections(target: HTMLElement): ContextMenuSelectDetail[] {
  const out: ContextMenuSelectDetail[] = [];
  target.addEventListener('aui-select', (e) => out.push((e as CustomEvent<ContextMenuSelectDetail>).detail));
  return out;
}

const focusedLabel = (): string | null => (document.activeElement instanceof HTMLElement ? document.activeElement.textContent : null);

describe('ContextMenu', () => {
  it('renders a labelled menu popup appended to the body, closed', () => {
    const { target } = region();
    const m = ContextMenu.create(target, { items });
    expect(m.element.getAttribute('role')).toBe('menu');
    expect(m.element.getAttribute('aria-label')).toBe('Context menu');
    expect(m.element.parentElement).toBe(document.body);
    expect(m.element.classList.contains('aui-menu--context')).toBe(true);
    expect(m.element.matches(':popover-open')).toBe(false);
    expect(target.hasAttribute('aria-haspopup')).toBe(false);
    m.update({ label: 'Row actions' });
    expect(m.element.getAttribute('aria-label')).toBe('Row actions');
  });

  it('opens at the pointer on contextmenu, prevents the native menu, and focuses the first item', () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    const allowed = rightClick(row, 120, 90);
    expect(allowed).toBe(false);
    expect(m.isOpen).toBe(true);
    expect(m.origin).toBe(row);
    expect(focusedLabel()).toBe('Copy');
    const left = Number.parseFloat(m.element.style.getPropertyValue('left'));
    const top = Number.parseFloat(m.element.style.getPropertyValue('top'));
    expect(left).toBeGreaterThanOrEqual(120);
    expect(left).toBeLessThanOrEqual(124);
    expect(top).toBeGreaterThanOrEqual(90);
    expect(top).toBeLessThanOrEqual(94);
  });

  it('Shift+right-click keeps the native menu (nativeModifier: shift), and "none" always opens', () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    expect(rightClick(row, 50, 50, { shiftKey: true })).toBe(true);
    expect(m.isOpen).toBe(false);
    m.update({ nativeModifier: 'none' });
    expect(rightClick(row, 50, 50, { shiftKey: true })).toBe(false);
    expect(m.isOpen).toBe(true);
  });

  it('disabled leaves the native menu in place', () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items, disabled: true });
    expect(rightClick(row, 50, 50)).toBe(true);
    expect(m.isOpen).toBe(false);
  });

  it('opens from the keyboard with Shift+F10 and the ContextMenu key at the focused element', async () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    row.focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(m.isOpen).toBe(true);
    expect(m.origin).toBe(row);
    expect(focusedLabel()).toBe('Copy');
    await userEvent.keyboard('{Escape}');
    expect(m.isOpen).toBe(false);
    expect(document.activeElement).toBe(row);
    await userEvent.keyboard('{ContextMenu}');
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(document.activeElement).toBe(row);
  });

  it('activation emits aui-select on the target with the origin and restores focus', async () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    const got = selections(target);
    row.focus();
    rightClick(row, 60, 60);
    await userEvent.keyboard('{End}{Enter}');
    expect(got).toEqual([{ id: 'delete', item: items[3], origin: row }]);
    expect(m.isOpen).toBe(false);
    expect(document.activeElement).toBe(row);
  });

  it('reuses the menu engine: submenus, typeahead, and Escape one level at a time', async () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    rightClick(row, 60, 60);
    await userEvent.keyboard('s');
    expect(focusedLabel()).toContain('Share');
    await userEvent.keyboard('{ArrowRight}');
    expect(focusedLabel()).toBe('Email');
    expect(m.element.querySelector('[data-id="share"]')!.getAttribute('aria-expanded')).toBe('true');
    await userEvent.keyboard('{Escape}');
    expect(focusedLabel()).toContain('Share');
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(m.isOpen).toBe(false);
  });

  it('a second right-click elsewhere reopens at the new point; outside presses close', () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    rightClick(row, 60, 60);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(m.isOpen).toBe(false);
    rightClick(row, 200, 150);
    expect(Number.parseFloat(m.element.style.getPropertyValue('top'))).toBeGreaterThanOrEqual(150);
  });

  it('contextmenu inside the popup never shows the native menu', () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items });
    rightClick(row, 60, 60);
    const item = m.element.querySelector('.aui-menu__item')!;
    expect(rightClick(item, 70, 70)).toBe(false);
    expect(m.isOpen).toBe(true);
  });

  it('inside a modal dialog the popup joins the dialog; Escape closes the menu before the dialog', async () => {
    const dialog = Dialog.create({ title: 'Files' });
    const { target, row } = region(dialog.body);
    dialog.open();
    const m = ContextMenu.create(target, { items });
    expect(m.element.parentElement).toBe(dialog.element);
    row.focus();
    await userEvent.keyboard('{Shift>}{F10}{/Shift}');
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(m.isOpen).toBe(false);
    expect(dialog.isOpen).toBe(true);
  });

  it('programmatic open at a point and close', () => {
    const { target } = region();
    const m = ContextMenu.create(target, { items });
    m.open({ x: 30, y: 40 });
    expect(m.isOpen).toBe(true);
    expect(m.origin).toBe(target);
    m.close();
    expect(m.isOpen).toBe(false);
    expect(() => {
      m.open({ x: Number.NaN, y: 0 });
    }).toThrow(AbsoluteUIError);
  });

  it('global configuration applies (closeOnSelect false keeps the menu open for checkbox items)', async () => {
    configureAbsoluteUI({ components: { contextMenu: { closeOnSelect: false } } });
    const { target, row } = region();
    const m = ContextMenu.create(target, { items: [{ type: 'checkbox', id: 'wrap', label: 'Wrap', checked: false }] });
    const got = selections(target);
    rightClick(row, 60, 60);
    await userEvent.keyboard(' ');
    expect(m.isOpen).toBe(true);
    expect(got[0]?.checked).toBe(true);
  });

  it('RTL: submenus open with ArrowLeft', async () => {
    const { target, row } = region();
    const m = ContextMenu.create(target, { items, direction: 'rtl' });
    rightClick(row, 60, 60);
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}');
    expect(focusedLabel()).toBe('Email');
    expect(m.element.dataset.direction).toBe('rtl');
  });

  it('(regression) nested targets: only the innermost context menu opens', () => {
    const { target: outer } = region();
    const { target: inner, row } = region(outer);
    const outerMenu = ContextMenu.create(outer, { items, label: 'Outer' });
    const innerMenu = ContextMenu.create(inner, { items, label: 'Inner' });
    rightClick(row, 40, 40);
    expect(innerMenu.isOpen).toBe(true);
    expect(outerMenu.isOpen).toBe(false);
  });

  it('validates before rendering and destroys cleanly', () => {
    const { target, row } = region();
    const before = document.body.children.length;
    expect(() => ContextMenu.create(target, { items: [{ id: '', label: 'x' }] })).toThrow(AbsoluteUIError);
    expect(() => ContextMenu.create(target, { items, label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => ContextMenu.create(document.createElement('div'), { items })).toThrow(AbsoluteUIError);
    expect(() => ContextMenu.create(target, { items, nativeModifier: 'alt' as 'shift' })).toThrow(AbsoluteUIError);
    expect(document.body.children.length).toBe(before);
    const m = ContextMenu.create(target, { items });
    m.destroy();
    expect(document.querySelector('.aui-menu')).toBeNull();
    expect(rightClick(row, 10, 10)).toBe(true);
  });
});
