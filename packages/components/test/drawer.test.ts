import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { getOverlayDepth, isScrollLocked } from '@absoluteui/utilities';
import { Dialog } from '@absoluteui/components/dialog';
import { Drawer, type DrawerCloseDetail } from '@absoluteui/components/drawer';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function trigger(): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = 'Open';
  document.body.append(b);
  b.focus();
  return b;
}

function closeDetail(drawer: Drawer): Promise<DrawerCloseDetail> {
  return new Promise((resolve) => {
    drawer.element.addEventListener('aui-close', (e) => {
      resolve((e as CustomEvent<DrawerCloseDetail>).detail);
    }, { once: true });
  });
}

describe('Drawer', () => {
  it('wires accessible name/description and renders string content as text', () => {
    const d = Drawer.create({ title: 'Filters', description: 'Narrow the results.', content: '<b>raw</b>' });
    const el = d.element;
    expect(el.tagName).toBe('DIALOG');
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent).toBe('Filters');
    expect(document.getElementById(el.getAttribute('aria-describedby')!)!.textContent).toBe('Narrow the results.');
    expect(d.body.querySelector('b')).toBeNull();
    expect(d.body.textContent).toBe('<b>raw</b>');
    expect(el.querySelector('.aui-drawer__close')!.getAttribute('aria-label')).toBe('Close');
  });

  it('requires a title and leaves nothing behind when construction fails', () => {
    expect(() => Drawer.create({ title: '  ' })).toThrow(AbsoluteUIError);
    // @ts-expect-error invalid placement at runtime
    expect(() => Drawer.create({ title: 'x', placement: 'left' })).toThrow(AbsoluteUIError);
    // @ts-expect-error invalid modal at runtime
    expect(() => Drawer.create({ title: 'x', modal: 'yes' })).toThrow(AbsoluteUIError);
    expect(document.querySelector('dialog')).toBeNull();
    expect(getOverlayDepth()).toBe(0);
  });

  it('opens modally, moves focus inside, locks scroll, and restores focus on Escape', async () => {
    const t = trigger();
    const d = Drawer.create({ title: 'Edit', actions: [{ label: 'Save', value: 'save', variant: 'primary', autofocus: true }] });
    const onOpen = vi.fn();
    d.element.addEventListener('aui-open', onOpen);
    d.open();
    expect(d.isOpen).toBe(true);
    expect(d.element.matches(':modal')).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(document.activeElement!.textContent).toBe('Save');
    expect(isScrollLocked()).toBe(true);
    const closed = closeDetail(d);
    await userEvent.keyboard('{Escape}');
    expect(await closed).toEqual({ returnValue: '', reason: 'escape' });
    expect(d.isOpen).toBe(false);
    expect(isScrollLocked()).toBe(false);
    expect(getOverlayDepth()).toBe(0);
    expect(document.activeElement).toBe(t);
  });

  it('blocks repeated Escape when closeOnEscape=false (global configuration)', async () => {
    configureAbsoluteUI({ components: { drawer: { closeOnEscape: false } } });
    trigger();
    const d = Drawer.create({ title: 'Locked' });
    d.open();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(true);
    d.close();
    expect(d.isOpen).toBe(false);
  });

  it('non-modal: no scroll lock, background stays interactive, Escape closes and unregisters', async () => {
    const t = trigger();
    const background = document.createElement('button');
    background.textContent = 'Background';
    const onBackground = vi.fn();
    background.addEventListener('click', onBackground);
    document.body.append(background);

    const d = Drawer.create({ title: 'Details', modal: false });
    expect(d.modal).toBe(false);
    d.open();
    expect(d.isOpen).toBe(true);
    expect(d.element.matches(':modal')).toBe(false);
    expect(d.element.contains(document.activeElement)).toBe(true);
    expect(isScrollLocked()).toBe(false);
    expect(getOverlayDepth()).toBe(1);

    await userEvent.click(background);
    expect(onBackground).toHaveBeenCalledTimes(1);
    background.focus();
    expect(document.activeElement).toBe(background);
    expect(d.isOpen).toBe(true);

    d.element.querySelector<HTMLButtonElement>('.aui-drawer__close')!.focus();
    const closed = closeDetail(d);
    await userEvent.keyboard('{Escape}');
    expect(await closed).toEqual({ returnValue: '', reason: 'escape' });
    expect(getOverlayDepth()).toBe(0);
    expect(document.activeElement).toBe(t);
  });

  it('non-modal: does not steal focus back when the user moved into the page', () => {
    trigger();
    const other = document.createElement('input');
    document.body.append(other);
    const d = Drawer.create({ title: 'Details', modal: false });
    d.open();
    other.focus();
    d.close();
    expect(document.activeElement).toBe(other);
  });

  it('non-modal: honours closeOnEscape=false', async () => {
    trigger();
    const d = Drawer.create({ title: 'Details', modal: false, closeOnEscape: false });
    d.open();
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(true);
    d.update({ closeOnEscape: true });
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(false);
  });

  it('non-modal: yields Escape to a modal dialog opened above it', async () => {
    trigger();
    const d = Drawer.create({ title: 'Details', modal: false });
    d.open();
    const dialog = Dialog.create({ title: 'Confirm' });
    dialog.open();
    await userEvent.keyboard('{Escape}');
    expect(dialog.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    d.close();
    dialog.destroy();
  });

  it('emits cancelable aui-cancel for user-initiated closes', async () => {
    trigger();
    const d = Drawer.create({ title: 'Unsaved changes' });
    const reasons: string[] = [];
    d.element.addEventListener('aui-cancel', (e) => {
      reasons.push((e as CustomEvent<DrawerCloseDetail>).detail.reason);
      e.preventDefault();
    });
    d.open();
    await userEvent.click(d.element.querySelector('.aui-drawer__close')!);
    await userEvent.keyboard('{Escape}');
    expect(reasons).toEqual(['close-button', 'escape']);
    expect(d.isOpen).toBe(true);
    const closed = closeDetail(d);
    d.close('done');
    expect(await closed).toEqual({ returnValue: 'done', reason: 'programmatic' });
  });

  it('closes with the action value', async () => {
    trigger();
    const d = Drawer.create({ title: 'Confirm', actions: [{ label: 'Cancel', value: 'cancel' }, { label: 'Apply', value: 'apply', variant: 'primary' }] });
    d.open();
    const closed = closeDetail(d);
    await userEvent.click(d.element.querySelector('.aui-button--primary')!);
    expect(await closed).toEqual({ returnValue: 'apply', reason: 'action' });
  });

  it('closes on backdrop click by default (modal) and not when disabled', async () => {
    trigger();
    const d = Drawer.create({ title: 'Backdrop', placement: 'start', size: 'sm' });
    d.open();
    const outside = (): void => {
      const rect = d.element.getBoundingClientRect();
      d.element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.right + 10, clientY: rect.top + 10 }));
    };
    const closed = closeDetail(d);
    outside();
    expect((await closed).reason).toBe('backdrop');
    d.update({ closeOnBackdrop: false });
    d.open();
    outside();
    expect(d.isOpen).toBe(true);
    d.close();
  });

  it('maps logical placement to a physical side, including RTL', () => {
    const d = Drawer.create({ title: 'Side' });
    expect(d.element.classList.contains('aui-drawer--end')).toBe(true);
    expect(d.element.classList.contains('aui-drawer--md')).toBe(true);
    expect(d.element.dataset.auiSide).toBe('right');
    d.update({ placement: 'start' });
    expect(d.element.classList.contains('aui-drawer--start')).toBe(true);
    expect(d.element.classList.contains('aui-drawer--end')).toBe(false);
    expect(d.element.dataset.auiSide).toBe('left');
    d.update({ direction: 'rtl' });
    expect(d.element.dir).toBe('rtl');
    expect(d.element.dataset.auiSide).toBe('right');
    d.update({ placement: 'end' });
    expect(d.element.dataset.auiSide).toBe('left');
    d.update({ placement: 'bottom', size: 'lg' });
    expect(d.element.dataset.auiSide).toBe('bottom');
    expect(d.element.classList.contains('aui-drawer--lg')).toBe(true);
  });

  it('inherits direction from common configuration', () => {
    configureAbsoluteUI({ common: { direction: 'rtl' }, components: { drawer: { placement: 'start' } } });
    const d = Drawer.create({ title: 'RTL' });
    expect(d.element.dataset.auiSide).toBe('right');
  });

  it('rejects invalid updates without changing state', () => {
    const d = Drawer.create({ title: 'Keep', placement: 'top' });
    // @ts-expect-error invalid placement at runtime
    expect(() => { d.update({ placement: 'middle' }); }).toThrow(AbsoluteUIError);
    expect(() => { d.update({ title: '' }); }).toThrow(AbsoluteUIError);
    expect(d.element.dataset.auiSide).toBe('top');
  });

  it('update re-renders actions and the close button', () => {
    const d = Drawer.create({ title: 'A', actions: [{ label: 'One', value: '1' }] });
    d.update({ title: 'B', showCloseButton: false, actions: [{ label: 'Two', value: '2' }, { label: 'Three', value: '3' }] });
    expect(d.element.querySelector('.aui-drawer__title')!.textContent).toBe('B');
    expect(d.element.querySelector('.aui-drawer__close')).toBeNull();
    expect(d.element.querySelectorAll('.aui-drawer__footer .aui-button')).toHaveLength(2);
  });

  it('destroy closes, removes the element, and releases scroll lock and the overlay layer', () => {
    const t = trigger();
    const d = Drawer.create({ title: 'Temp' });
    const onClose = vi.fn();
    d.element.addEventListener('aui-close', onClose);
    d.open();
    d.destroy();
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(document.querySelector('dialog')).toBeNull();
    expect(isScrollLocked()).toBe(false);
    expect(getOverlayDepth()).toBe(0);
    expect(document.activeElement).toBe(t);
  });
});

describe('Drawer: content (regression)', () => {
  it('keeps DocumentFragment content and consumer body changes across update() and config changes', () => {
    const frag = document.createDocumentFragment();
    const p = document.createElement('p');
    p.textContent = 'body';
    frag.append(p);
    const d = Drawer.create({ title: 'T', content: frag });
    d.update({ description: 'x' });
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(d.body.textContent).toBe('body');
    d.update({ content: 'replaced' });
    expect(d.body.textContent).toBe('replaced');
    d.destroy();
  });
});
