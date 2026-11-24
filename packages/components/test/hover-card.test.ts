import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { HoverCard, type HoverCardCloseDetail } from '@absoluteui/components/hover-card';
import { Dialog } from '@absoluteui/components/dialog';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(parent: HTMLElement = document.body): { trigger: HTMLAnchorElement; after: HTMLButtonElement; content: HTMLDivElement } {
  const trigger = document.createElement('a');
  trigger.href = '#ada';
  trigger.textContent = 'Ada Lovelace';
  const after = document.createElement('button');
  after.textContent = 'After';
  after.style.setProperty('margin-block-start', '300px');
  const content = document.createElement('div');
  const p = document.createElement('p');
  p.textContent = 'Mathematician';
  const link = document.createElement('a');
  link.href = '#profile';
  link.textContent = 'View profile';
  content.append(p, link);
  parent.append(trigger, after);
  return { trigger, after, content };
}

const wait = (ms: number): Promise<void> => new Promise((r) => setTimeout(r, ms));

function closes(card: HoverCard): HoverCardCloseDetail[] {
  const out: HoverCardCloseDetail[] = [];
  card.element.addEventListener('aui-close', (e) => out.push((e as CustomEvent<HoverCardCloseDetail>).detail));
  return out;
}

describe('HoverCard', () => {
  it('is inserted after the trigger, described by default, and hidden until shown', () => {
    const { trigger, content } = mount();
    const card = HoverCard.create(trigger, { content });
    expect(trigger.nextElementSibling).toBe(card.element);
    expect(card.element.popover).toBe('manual');
    expect(card.element.matches(':popover-open')).toBe(false);
    expect(trigger.getAttribute('aria-describedby')).toBe(card.element.id);
    card.update({ describe: false });
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
  });

  it('shows after the delay on hover, stays while the pointer moves onto the card, hides after leaving both', async () => {
    const { trigger, after, content } = mount();
    // The show delay must outlast the hover round trip under a loaded test run, or the card is already open.
    const card = HoverCard.create(trigger, { content, showDelay: 400, hideDelay: 50 });
    const got = closes(card);
    await userEvent.hover(trigger);
    expect(card.isOpen).toBe(false);
    await expect.poll(() => card.isOpen).toBe(true);
    await userEvent.hover(card.element);
    await wait(120);
    expect(card.isOpen).toBe(true);
    await userEvent.hover(after);
    await expect.poll(() => card.isOpen).toBe(false);
    expect(got).toEqual([{ reason: 'pointer-leave' }]);
  });

  it('keyboard: shown on focus; Tab moves into the card content and keeps it open; leaving both hides it', async () => {
    const { trigger, after, content } = mount();
    const card = HoverCard.create(trigger, { content, showDelay: 0 });
    const before = document.createElement('button');
    before.textContent = 'Before';
    document.body.prepend(before);
    // Park the pointer away from where the card appears (a card under the pointer stays open).
    await userEvent.hover(after);
    before.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(trigger);
    expect(card.isOpen).toBe(true);
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe('View profile');
    expect(card.isOpen).toBe(true);
    await userEvent.tab();
    expect(document.activeElement).toBe(after);
    expect(card.isOpen).toBe(false);
  });

  it('Escape dismisses without moving focus from the trigger, and does not reopen until focus returns (WCAG 1.4.13)', async () => {
    const { trigger, content } = mount();
    const card = HoverCard.create(trigger, { content, showDelay: 0 });
    const got = closes(card);
    const before = document.createElement('button');
    document.body.prepend(before);
    before.focus();
    await userEvent.tab();
    expect(card.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(card.isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
    expect(got).toEqual([{ reason: 'escape' }]);
    await wait(30);
    expect(card.isOpen).toBe(false);
    await userEvent.tab({ shift: true });
    await userEvent.tab();
    expect(card.isOpen).toBe(true);
  });

  it('Escape from inside the card returns focus to the trigger without reopening', async () => {
    const { trigger, content } = mount();
    const card = HoverCard.create(trigger, { content, showDelay: 0 });
    const before = document.createElement('button');
    document.body.prepend(before);
    before.focus();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.keyboard('{Escape}');
    expect(card.isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
    await wait(30);
    expect(card.isOpen).toBe(false);
  });

  it('never opens on touch and only one card is visible at a time', () => {
    const a = mount();
    const b = mount();
    const cardA = HoverCard.create(a.trigger, { content: 'A', showDelay: 0 });
    const cardB = HoverCard.create(b.trigger, { content: 'B', showDelay: 0 });
    a.trigger.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'touch' }));
    expect(cardA.isOpen).toBe(false);
    cardA.show();
    cardB.show();
    expect(cardA.isOpen).toBe(false);
    expect(cardB.isOpen).toBe(true);
  });

  it('(regression) a card replaced by another one returns focus to its trigger without reopening', () => {
    const a = mount();
    const b = mount();
    const cardA = HoverCard.create(a.trigger, { content: a.content, showDelay: 0 });
    const cardB = HoverCard.create(b.trigger, { content: 'B', showDelay: 0 });
    cardA.show();
    a.content.querySelector('a')!.focus();
    cardB.show();
    expect(cardA.isOpen).toBe(false);
    expect(cardB.isOpen).toBe(true);
    expect(document.activeElement).toBe(a.trigger);
  });

  it('an outside press closes it; inside a dialog Escape closes the card before the dialog', async () => {
    const dialog = Dialog.create({ title: 'People' });
    const { trigger, content } = mount(dialog.body);
    dialog.open();
    const card = HoverCard.create(trigger, { content, showDelay: 0 });
    card.show();
    await userEvent.keyboard('{Escape}');
    expect(card.isOpen).toBe(false);
    expect(dialog.isOpen).toBe(true);
    card.show();
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(card.isOpen).toBe(false);
  });

  it('content is inserted once; update without content keeps framework-owned nodes', () => {
    const { trigger, content } = mount();
    const card = HoverCard.create(trigger, { content });
    const extra = document.createElement('span');
    card.element.append(extra);
    card.update({ placement: 'top' });
    expect(card.element.contains(extra)).toBe(true);
    card.update({ content: '<b>text</b>' });
    expect(card.element.querySelector('b')).toBeNull();
    expect(card.element.textContent).toBe('<b>text</b>');
  });

  it('global configuration and validation; destroy removes everything', () => {
    configureAbsoluteUI({ components: { hoverCard: { placement: 'top' } } });
    const { trigger } = mount();
    expect(() => HoverCard.create(trigger, { content: '' })).toThrow(AbsoluteUIError);
    expect(() => HoverCard.create(trigger, { content: 'x', showDelay: -1 })).toThrow(AbsoluteUIError);
    expect(() => HoverCard.create(document.createElement('a'), { content: 'x' })).toThrow(AbsoluteUIError);
    expect(document.querySelector('.aui-hover-card')).toBeNull();
    const card = HoverCard.create(trigger, { content: 'x' });
    card.show();
    expect(card.element.dataset.placement).toMatch(/^(top|bottom)$/);
    card.destroy();
    expect(document.querySelector('.aui-hover-card')).toBeNull();
    expect(trigger.hasAttribute('aria-describedby')).toBe(false);
  });
});
