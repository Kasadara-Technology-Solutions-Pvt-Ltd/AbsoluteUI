import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { isScrollLocked } from '@absoluteui/utilities';
import { Dialog, type DialogCloseDetail } from '@absoluteui/components/dialog';

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

function closeDetail(dialog: Dialog): Promise<DialogCloseDetail> {
  return new Promise((resolve) => {
    dialog.element.addEventListener('aui-close', (e) => {
      resolve((e as CustomEvent<DialogCloseDetail>).detail);
    }, { once: true });
  });
}

describe('Dialog', () => {
  it('wires accessible name/description and renders string content as text', () => {
    const d = Dialog.create({ title: 'Delete file', description: 'This cannot be undone.', content: '<b>raw</b>' });
    const el = d.element;
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent).toBe('Delete file');
    expect(document.getElementById(el.getAttribute('aria-describedby')!)!.textContent).toBe('This cannot be undone.');
    expect(d.body.querySelector('b')).toBeNull();
    expect(d.body.textContent).toBe('<b>raw</b>');
  });

  it('requires a title', () => {
    expect(() => Dialog.create({ title: '  ' })).toThrow(AbsoluteUIError);
  });

  it('opens modally, moves focus inside, locks scroll, and restores focus on Escape', async () => {
    const t = trigger();
    const d = Dialog.create({ title: 'Edit', actions: [{ label: 'Save', value: 'save', variant: 'primary', autofocus: true }] });
    const onOpen = vi.fn();
    d.element.addEventListener('aui-open', onOpen);
    d.open();
    expect(d.element.matches(':modal')).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(d.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement!.textContent).toBe('Save');
    expect(isScrollLocked()).toBe(true);
    const closed = closeDetail(d);
    await userEvent.keyboard('{Escape}');
    expect(await closed).toEqual({ returnValue: '', reason: 'escape' });
    expect(d.isOpen).toBe(false);
    expect(isScrollLocked()).toBe(false);
    expect(document.activeElement).toBe(t);
  });

  it('honours closeOnEscape=false from global component configuration', async () => {
    configureAbsoluteUI({ components: { dialog: { closeOnEscape: false } } });
    trigger();
    const d = Dialog.create({ title: 'Locked' });
    d.open();
    await userEvent.keyboard('{Escape}');
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(true);
    d.close();
  });

  it('emits cancelable aui-cancel for user-initiated closes', async () => {
    trigger();
    const d = Dialog.create({ title: 'Unsaved changes' });
    d.element.addEventListener('aui-cancel', (e) => {
      e.preventDefault();
    });
    d.open();
    await userEvent.click(d.element.querySelector('.aui-dialog__close')!);
    expect(d.isOpen).toBe(true);
    d.close();
    expect(d.isOpen).toBe(false);
  });

  it('closes with the action value', async () => {
    trigger();
    const d = Dialog.create({ title: 'Confirm', role: 'alertdialog', actions: [{ label: 'Cancel', value: 'cancel', autofocus: true }, { label: 'Delete', value: 'delete', variant: 'danger' }] });
    expect(d.element.getAttribute('role')).toBe('alertdialog');
    d.open();
    const closed = closeDetail(d);
    await userEvent.click(d.element.querySelector('.aui-button--danger')!);
    expect(await closed).toEqual({ returnValue: 'delete', reason: 'action' });
  });

  it('localizes the close button label', () => {
    const d = Dialog.create({ title: 'x' });
    expect(d.element.querySelector('.aui-dialog__close')!.getAttribute('aria-label')).toBe('Close');
  });

  it('closes on backdrop click only when enabled', async () => {
    trigger();
    const d = Dialog.create({ title: 'Backdrop', closeOnBackdrop: true, size: 'sm' });
    d.open();
    const closed = closeDetail(d);
    const rect = d.element.getBoundingClientRect();
    d.element.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: rect.left - 10, clientY: rect.top - 10 }));
    expect((await closed).reason).toBe('backdrop');
  });

  it('destroy removes the element and releases the scroll lock', () => {
    const d = Dialog.create({ title: 'Temp' });
    d.open();
    d.destroy();
    expect(document.querySelector('dialog')).toBeNull();
    expect(isScrollLocked()).toBe(false);
  });

  it('stays open when reopened before the previous native close event arrives (regression)', async () => {
    const d = Dialog.create({ title: 'Session', actions: [{ label: 'OK', value: 'ok' }] });
    d.open();
    d.element.querySelector<HTMLButtonElement>('.aui-dialog__footer button')!.click();
    // Reopened in the same task: the queued native `close` event belongs to the first close.
    d.open();
    await new Promise((r) => setTimeout(r, 0));
    expect(d.isOpen).toBe(true);
    expect(isScrollLocked()).toBe(true);
    d.destroy();
  });
});

describe('Dialog: content (regression)', () => {
  it('keeps DocumentFragment content and consumer body changes across update() and config changes', () => {
    const frag = document.createDocumentFragment();
    const p = document.createElement('p');
    p.textContent = 'body';
    frag.append(p);
    const d = Dialog.create({ title: 'T', content: frag });
    d.update({ description: 'x' });
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(d.body.textContent).toBe('body');
    d.update({ content: 'replaced' });
    expect(d.body.textContent).toBe('replaced');
    d.destroy();
  });
});
