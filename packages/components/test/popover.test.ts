import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { getOverlayDepth } from '@absoluteui/utilities';
import { Popover, type PopoverCloseDetail } from '@absoluteui/components/popover';
import { Dialog } from '@absoluteui/components/dialog';

const created: Popover[] = [];

function create(...args: Parameters<typeof Popover.create>): Popover {
  const p = Popover.create(...args);
  created.push(p);
  return p;
}

afterEach(() => {
  // Popovers left open would stay in the module-level overlay stack.
  for (const p of created.splice(0)) p.destroy();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function setup(): { trigger: HTMLButtonElement; before: HTMLButtonElement; after: HTMLButtonElement } {
  const before = document.createElement('button');
  before.textContent = 'Before';
  const trigger = document.createElement('button');
  trigger.textContent = 'Filters';
  const after = document.createElement('button');
  after.textContent = 'After';
  document.body.append(before, trigger, after);
  return { trigger, before, after };
}

function content(): HTMLDivElement {
  const div = document.createElement('div');
  const input = document.createElement('input');
  input.setAttribute('aria-label', 'Search');
  const apply = document.createElement('button');
  apply.textContent = 'Apply';
  div.append(input, apply);
  return div;
}

function nextClose(p: Popover): Promise<PopoverCloseDetail> {
  return new Promise((resolve) => {
    p.element.addEventListener('aui-close', (e) => {
      resolve((e as CustomEvent<PopoverCloseDetail>).detail);
    }, { once: true });
  });
}

describe('Popover', () => {
  it('wires ARIA on the trigger and popup, inserted right after the trigger', () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'Filters', content: '<b>raw</b>' });
    const el = p.element;
    expect(trigger.nextElementSibling).toBe(el);
    expect(el.popover).toBe('manual');
    expect(el.getAttribute('role')).toBe('dialog');
    expect(trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(trigger.getAttribute('aria-controls')).toBe(el.id);
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent).toBe('Filters');
    expect(p.body.querySelector('b')).toBeNull();
    expect(p.body.textContent).toBe('<b>raw</b>');
    expect(el.matches(':popover-open')).toBe(false);
    expect(p.isOpen).toBe(false);
  });

  it('uses aria-label without a title and requires a title or label', () => {
    const { trigger } = setup();
    const p = create(trigger, { label: 'Color picker', content: 'x' });
    expect(p.element.getAttribute('aria-label')).toBe('Color picker');
    expect(p.element.hasAttribute('aria-labelledby')).toBe(false);
    p.destroy();
    expect(() => Popover.create(trigger, { content: 'x' })).toThrow(AbsoluteUIError);
    expect(() => Popover.create(trigger, { title: ' ', label: '', content: 'x' })).toThrow(AbsoluteUIError);
  });

  it('a failed construction leaves nothing behind', () => {
    const { trigger } = setup();
    const children = document.body.childElementCount;
    // @ts-expect-error invalid placement at runtime
    expect(() => Popover.create(trigger, { title: 'T', content: 'x', placement: 'middle' })).toThrow(AbsoluteUIError);
    expect(document.body.childElementCount).toBe(children);
    expect(trigger.hasAttribute('aria-expanded')).toBe(false);
    trigger.click();
    expect(document.querySelector('.aui-popover')).toBeNull();
  });

  it('toggles from the trigger with Enter and Space, focusing the first control', async () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'Filters', content: content() });
    const onOpen = vi.fn();
    p.element.addEventListener('aui-open', onOpen);
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(p.isOpen).toBe(true);
    expect(p.element.matches(':popover-open')).toBe(true);
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(p.body.querySelector('input'));
    trigger.focus();
    const closed = nextClose(p);
    await userEvent.keyboard(' ');
    expect(await closed).toEqual({ reason: 'trigger' });
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.activeElement).toBe(trigger);
  });

  it('Escape closes and returns focus to the trigger', async () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'Filters', content: content() });
    await userEvent.click(trigger);
    expect(p.element.contains(document.activeElement)).toBe(true);
    const onCancel = vi.fn();
    p.element.addEventListener('aui-cancel', onCancel);
    const closed = nextClose(p);
    await userEvent.keyboard('{Escape}');
    expect(await closed).toEqual({ reason: 'escape' });
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(document.activeElement).toBe(trigger);
    expect(getOverlayDepth()).toBe(0);
  });

  it('Tab order continues from the popup to the next element, and tabbing out closes it', async () => {
    const { trigger, after } = setup();
    const p = create(trigger, { title: 'Filters', content: content(), initialFocus: 'none' });
    trigger.focus();
    await userEvent.keyboard('{Enter}');
    expect(document.activeElement).toBe(trigger);
    await userEvent.tab();
    expect(document.activeElement).toBe(p.body.querySelector('input'));
    await userEvent.tab();
    expect(document.activeElement!.textContent).toBe('Apply');
    const closed = nextClose(p);
    await userEvent.tab();
    expect(await closed).toEqual({ reason: 'focus-out' });
    expect(document.activeElement).toBe(after);
    expect(p.isOpen).toBe(false);
  });

  it('closes on outside pointer without moving focus to the trigger', async () => {
    const { trigger, after } = setup();
    const p = create(trigger, { title: 'Filters', content: content() });
    await userEvent.click(trigger);
    const closed = nextClose(p);
    await userEvent.click(after);
    expect(await closed).toEqual({ reason: 'outside-pointer' });
    expect(document.activeElement).toBe(after);
  });

  it('respects closeOnOutsidePointer and closeOnEscape, and aui-cancel can keep it open', async () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'Filters', content: content(), closeOnOutsidePointer: false, closeOnEscape: false, initialFocus: 'container' });
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(p.element);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(true);
    // Clicking a non-focusable area outside: no outside-pointer close.
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(p.isOpen).toBe(true);
    p.update({ closeOnEscape: true });
    p.element.addEventListener('aui-cancel', (e) => {
      e.preventDefault();
    });
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(true);
  });

  it('renders a localized close button', async () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'Filters', content: 'x', showCloseButton: true });
    await userEvent.click(trigger);
    const close = p.element.querySelector<HTMLButtonElement>('.aui-popover__close')!;
    expect(close.getAttribute('aria-label')).toBe('Close');
    expect(document.activeElement).toBe(close);
    const closed = nextClose(p);
    await userEvent.keyboard('{Enter}');
    expect(await closed).toEqual({ reason: 'close-button' });
    expect(document.activeElement).toBe(trigger);
  });

  it('inside a Dialog, Escape closes only the popover', async () => {
    const opener = document.createElement('button');
    document.body.append(opener);
    opener.focus();
    const trigger = document.createElement('button');
    trigger.textContent = 'More';
    const wrap = document.createElement('div');
    wrap.append(trigger);
    const d = Dialog.create({ title: 'Edit', content: wrap });
    d.open();
    const p = create(trigger, { title: 'Details', content: content() });
    await userEvent.click(trigger);
    expect(p.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(trigger);
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(false);
    p.destroy();
    d.destroy();
  });

  it('positions by placement and mirrors start alignment in RTL', () => {
    const { trigger } = setup();
    trigger.style.setProperty('margin-inline-start', '150px');
    trigger.style.setProperty('margin-block-start', '250px');
    const box = document.createElement('div');
    box.style.setProperty('inline-size', '100px');
    box.textContent = 'Wide content';
    const p = create(trigger, { title: 'T', content: box, initialFocus: 'none' });
    p.open();
    const t = trigger.getBoundingClientRect();
    let r = p.element.getBoundingClientRect();
    expect(p.element.dataset.placement).toBe('bottom-start');
    expect(Math.abs(r.left - t.left)).toBeLessThanOrEqual(1);
    expect(Math.round(r.top - t.bottom)).toBe(8);
    p.close();
    configureAbsoluteUI({ direction: 'rtl' });
    p.open();
    r = p.element.getBoundingClientRect();
    expect(Math.abs(r.right - t.right)).toBeLessThanOrEqual(1);
    p.close();
    p.update({ placement: 'top-end', offset: 4 });
    p.open();
    r = p.element.getBoundingClientRect();
    expect(p.element.dataset.placement).toBe('top-end');
    expect(Math.round(t.top - r.bottom)).toBe(4);
  });

  it('applies global configuration with instance precedence', async () => {
    const { trigger } = setup();
    configureAbsoluteUI({ components: { popover: { showCloseButton: true, initialFocus: 'container' } } });
    const p = create(trigger, { title: 'T', content: content() });
    expect(p.element.querySelector('.aui-popover__close')).not.toBeNull();
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(p.element);
    p.close();
    p.update({ showCloseButton: false });
    expect(p.element.querySelector('.aui-popover__close')).toBeNull();
    expect(() => {
      configureAbsoluteUI({ components: { popover: { offset: -1 } } });
      Popover.create(trigger, { title: 'T', content: 'x' });
    }).toThrow(AbsoluteUIError);
  });

  it('programmatic open/close/toggle emit lifecycle events that do not bubble', () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'T', content: content() });
    const bubbled = vi.fn();
    document.body.addEventListener('aui-open', bubbled);
    document.body.addEventListener('aui-close', bubbled);
    const onClose = vi.fn();
    p.element.addEventListener('aui-close', onClose);
    p.toggle();
    expect(p.isOpen).toBe(true);
    p.toggle();
    expect(p.isOpen).toBe(false);
    expect(onClose.mock.calls[0]?.[0]).toMatchObject({ detail: { reason: 'programmatic' } });
    // Focus inside the popup is rescued to the trigger.
    expect(document.activeElement).toBe(trigger);
    expect(bubbled).not.toHaveBeenCalled();
  });

  it('destroy removes the popup, trigger ARIA, listeners, and overlay registration', async () => {
    const { trigger } = setup();
    const p = create(trigger, { title: 'T', content: 'x' });
    p.open();
    p.destroy();
    expect(document.querySelector('.aui-popover')).toBeNull();
    expect(trigger.hasAttribute('aria-expanded')).toBe(false);
    expect(trigger.hasAttribute('aria-controls')).toBe(false);
    expect(trigger.hasAttribute('aria-haspopup')).toBe(false);
    expect(getOverlayDepth()).toBe(0);
    await userEvent.click(trigger);
    expect(p.isOpen).toBe(false);
  });
});
