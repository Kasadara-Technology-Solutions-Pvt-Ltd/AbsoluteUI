import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { getOverlayDepth } from '@absoluteui/utilities';
import { Tooltip } from '@absoluteui/components/tooltip';
import { Popover } from '@absoluteui/components/popover';

const created: Tooltip[] = [];

function create(...args: Parameters<typeof Tooltip.create>): Tooltip {
  const t = Tooltip.create(...args);
  created.push(t);
  return t;
}

afterEach(() => {
  // Visible tooltips would stay in the module-level overlay stack.
  for (const t of created.splice(0)) t.destroy();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function button(text: string): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = text;
  b.style.setProperty('margin', '80px');
  document.body.append(b);
  return b;
}

function wait(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Tooltip', () => {
  it('renders a hidden role=tooltip popover and references it from the trigger', () => {
    const trigger = button('Save');
    trigger.setAttribute('aria-describedby', 'existing');
    const t = create(trigger, { content: '<b>Ctrl+S</b>' });
    const el = t.element;
    expect(el.getAttribute('role')).toBe('tooltip');
    expect(el.popover).toBe('manual');
    expect(el.parentElement).toBe(document.body);
    expect(el.matches(':popover-open')).toBe(false);
    expect(el.querySelector('b')).toBeNull();
    expect(el.textContent).toBe('<b>Ctrl+S</b>');
    expect(el.hasAttribute('tabindex')).toBe(false);
    expect(trigger.getAttribute('aria-describedby')).toBe(`existing ${el.id}`);
    t.destroy();
    expect(trigger.getAttribute('aria-describedby')).toBe('existing');
    expect(el.isConnected).toBe(false);
  });

  it('relation "label" uses aria-labelledby; update can switch relation and content', () => {
    const trigger = button('');
    const t = create(trigger, { content: 'Settings', relation: 'label' });
    expect(trigger.getAttribute('aria-labelledby')).toBe(t.element.id);
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    t.update({ relation: 'description', content: 'Open settings' });
    expect(trigger.hasAttribute('aria-labelledby')).toBe(false);
    expect(trigger.getAttribute('aria-describedby')).toBe(t.element.id);
    expect(t.element.textContent).toBe('Open settings');
  });

  it('validates options and a failed construction leaves nothing behind', () => {
    const trigger = button('Save');
    const count = document.body.childElementCount;
    expect(() => Tooltip.create(trigger, { content: ' ' })).toThrow(AbsoluteUIError);
    expect(() => Tooltip.create(trigger, { content: 'x', showDelay: 6000 })).toThrow(AbsoluteUIError);
    // @ts-expect-error invalid relation at runtime
    expect(() => Tooltip.create(trigger, { content: 'x', relation: 'name' })).toThrow(AbsoluteUIError);
    expect(document.body.childElementCount).toBe(count);
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows on hover after showDelay and hides on unhover after hideDelay', async () => {
    const trigger = button('Save');
    // The show delay must outlast the hover round trip under a loaded test run, or the tooltip is already visible.
    const t = create(trigger, { content: 'Save changes', showDelay: 400, hideDelay: 0 });
    const onOpen = vi.fn();
    const onClose = vi.fn();
    t.element.addEventListener('aui-open', onOpen);
    t.element.addEventListener('aui-close', onClose);
    await userEvent.hover(trigger);
    expect(t.isVisible).toBe(false);
    await vi.waitFor(() => {
      expect(t.isVisible).toBe(true);
    });
    expect(t.element.matches(':popover-open')).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    await userEvent.unhover(trigger);
    await vi.waitFor(() => {
      expect(t.isVisible).toBe(false);
    });
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(getOverlayDepth()).toBe(0);
  });

  it('does not show when the pointer leaves before showDelay', async () => {
    const trigger = button('Save');
    const t = create(trigger, { content: 'Save changes', showDelay: 80 });
    await userEvent.hover(trigger);
    await userEvent.unhover(trigger);
    await wait(120);
    expect(t.isVisible).toBe(false);
  });

  it('is hoverable: moving the pointer onto the tooltip keeps it open', async () => {
    const trigger = button('Save');
    const t = create(trigger, { content: 'Save changes', showDelay: 0, hideDelay: 50 });
    await userEvent.hover(trigger);
    expect(t.isVisible).toBe(true);
    await userEvent.hover(t.element);
    await wait(100);
    expect(t.isVisible).toBe(true);
    await userEvent.unhover(t.element);
    await vi.waitFor(() => {
      expect(t.isVisible).toBe(false);
    });
  });

  it('shows immediately on keyboard focus, stays while focused, and hides on blur', async () => {
    const trigger = button('Save');
    const other = button('Other');
    const t = create(trigger, { content: 'Save changes' });
    await userEvent.tab();
    expect(document.activeElement).toBe(trigger);
    expect(t.isVisible).toBe(true);
    await userEvent.tab();
    expect(document.activeElement).toBe(other);
    expect(t.isVisible).toBe(false);
  });

  it('does not show on pointer (non-keyboard) focus', async () => {
    const trigger = button('Save');
    const t = create(trigger, { content: 'Save changes', showDelay: 5000 });
    await userEvent.click(trigger);
    expect(document.activeElement).toBe(trigger);
    expect(t.isVisible).toBe(false);
  });

  it('Escape hides without moving focus and is consumed only while visible', async () => {
    const trigger = button('Save');
    const t = create(trigger, { content: 'Save changes' });
    await userEvent.tab();
    expect(t.isVisible).toBe(true);
    const onKey = vi.fn();
    document.addEventListener('keydown', onKey);
    await userEvent.keyboard('{Escape}');
    expect(t.isVisible).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(onKey).not.toHaveBeenCalled();
    await userEvent.keyboard('{Escape}');
    expect(onKey).toHaveBeenCalledTimes(1);
    document.removeEventListener('keydown', onKey);
  });

  it('inside a Popover, Escape hides the tooltip first, then closes the popover', async () => {
    const opener = button('Open');
    const inner = document.createElement('button');
    inner.textContent = 'Info';
    const p = Popover.create(opener, { title: 'Details', content: inner, initialFocus: 'none' });
    const t = create(inner, { content: 'More information' });
    opener.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    expect(document.activeElement).toBe(inner);
    expect(t.isVisible).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(t.isVisible).toBe(false);
    expect(p.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    p.destroy();
  });

  it('a visible tooltip does not block outside-pointer dismissal of the popover below', async () => {
    const opener = button('Open');
    const outside = button('Outside');
    const inner = document.createElement('button');
    inner.textContent = 'Info';
    const p = Popover.create(opener, { title: 'Details', content: inner, initialFocus: 'none' });
    const t = create(inner, { content: 'More information' });
    opener.focus();
    await userEvent.keyboard('{Enter}');
    await userEvent.tab();
    expect(document.activeElement).toBe(inner);
    expect(t.isVisible).toBe(true);
    await userEvent.click(outside);
    expect(t.isVisible).toBe(false);
    expect(p.isOpen).toBe(false);
    p.destroy();
  });

  it('joins an enclosing <dialog> so it stays hoverable under a modal', () => {
    const dialog = document.createElement('dialog');
    const trigger = document.createElement('button');
    trigger.textContent = 'Help';
    dialog.append(trigger);
    document.body.append(dialog);
    dialog.showModal();
    const t = create(trigger, { content: 'Help text' });
    expect(t.element.parentElement).toBe(dialog);
    dialog.close();
  });

  it('only one tooltip is visible at a time', async () => {
    const a = button('A');
    const b = button('B');
    const ta = create(a, { content: 'First', showDelay: 0 });
    const tb = create(b, { content: 'Second', showDelay: 0 });
    ta.show();
    expect(ta.isVisible).toBe(true);
    await userEvent.hover(b);
    expect(tb.isVisible).toBe(true);
    expect(ta.isVisible).toBe(false);
    expect(getOverlayDepth()).toBe(1);
  });

  it('ignores touch pointers', () => {
    const trigger = button('Save');
    const t = create(trigger, { content: 'Save changes', showDelay: 0 });
    trigger.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    expect(t.isVisible).toBe(false);
    trigger.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
    expect(t.isVisible).toBe(true);
  });

  it('positions by placement with global config and instance precedence, mirrored in RTL', () => {
    const trigger = button('Save');
    configureAbsoluteUI({ components: { tooltip: { placement: 'bottom-start' } } });
    const t = create(trigger, { content: 'Save changes' });
    t.show();
    const r = trigger.getBoundingClientRect();
    let tip = t.element.getBoundingClientRect();
    expect(t.element.dataset.placement).toBe('bottom-start');
    expect(Math.round(tip.top - r.bottom)).toBe(6);
    expect(Math.abs(tip.left - r.left)).toBeLessThanOrEqual(1);
    t.update({ direction: 'rtl' });
    tip = t.element.getBoundingClientRect();
    expect(Math.abs(tip.right - r.right)).toBeLessThanOrEqual(1);
    t.update({ placement: 'top' });
    tip = t.element.getBoundingClientRect();
    expect(t.element.dataset.placement).toBe('top');
    expect(Math.round(r.top - tip.bottom)).toBe(6);
  });

  it('destroy hides, removes the element, ARIA reference, and listeners', async () => {
    const trigger = button('Save');
    const t = create(trigger, { content: 'Save changes', showDelay: 0 });
    t.show();
    t.destroy();
    expect(t.isVisible).toBe(false);
    expect(getOverlayDepth()).toBe(0);
    expect(document.querySelector('.aui-tooltip')).toBeNull();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
    await userEvent.hover(trigger);
    expect(t.isVisible).toBe(false);
  });
});
