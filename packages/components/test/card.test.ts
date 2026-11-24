import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Card, Surface, type CardHeadingLevel, type CardOptions } from '@absoluteui/components/card';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: CardOptions = {}): Card {
  const host = document.createElement('div');
  document.body.append(host);
  return Card.create(host, options);
}

function tabbables(root: Element): Element[] {
  return [...root.querySelectorAll('a[href], button, input, select, textarea, [tabindex]')].filter((el) => !el.hasAttribute('disabled') && el.getAttribute('tabindex') !== '-1');
}

describe('Card: semantics', () => {
  it('is an <article> named by its title heading', () => {
    const c = mount({ title: 'Quarterly report', subtitle: 'Updated today', content: 'Revenue grew 4%.' });
    expect(c.element.tagName).toBe('ARTICLE');
    const heading = c.element.querySelector('.aui-card__title')!;
    expect(heading.tagName).toBe('H3');
    expect(c.element.getAttribute('aria-labelledby')).toBe(heading.id);
    expect(c.element.querySelector('.aui-card__subtitle')!.textContent).toBe('Updated today');
    expect(c.body.textContent).toBe('Revenue grew 4%.');
    expect(c.element.classList.contains('aui-surface')).toBe(true);
    expect(c.element.querySelector('header, footer')).toBeNull();
  });

  it('is a plain <div> without a title', () => {
    const c = mount({ content: 'Untitled content' });
    expect(c.element.tagName).toBe('DIV');
    expect(c.element.hasAttribute('aria-labelledby')).toBe(false);
    expect(c.element.querySelector<HTMLElement>('.aui-card__header')!.hidden).toBe(true);
  });

  it('switches between <div> and <article> when the title is added or removed, keeping content', () => {
    const c = mount({ content: 'Body' });
    const extra = document.createElement('span');
    c.body.append(extra);
    c.update({ title: 'Now titled' });
    expect(c.element.tagName).toBe('ARTICLE');
    expect(c.element.isConnected).toBe(true);
    expect(c.body.contains(extra)).toBe(true);
    c.update({ title: undefined });
    expect(c.element.tagName).toBe('DIV');
    expect(c.element.querySelector('h3')).toBeNull();
  });

  it('renders the heading level from options, then global config, default 3', () => {
    configureAbsoluteUI({ components: { card: { headingLevel: 2 } } });
    const c = mount({ title: 'A' });
    expect(c.element.querySelector('.aui-card__title')!.tagName).toBe('H2');
    const d = mount({ title: 'B', headingLevel: 4 });
    expect(d.element.querySelector('.aui-card__title')!.tagName).toBe('H4');
    configureAbsoluteUI({ components: { card: { headingLevel: 5 } } });
    expect(c.element.querySelector('.aui-card__title')!.tagName).toBe('H5');
    expect(c.element.getAttribute('aria-labelledby')).toBe(c.element.querySelector('.aui-card__title')!.id);
  });

  it('places media after the header in source order and renders footer nodes', () => {
    const img = document.createElement('img');
    img.alt = '';
    const button = document.createElement('button');
    button.textContent = 'Open';
    const c = mount({ title: 'T', media: img, footer: button });
    const order = [...c.element.children].map((el) => el.className);
    expect(order).toEqual(['aui-card__header', 'aui-card__media', 'aui-card__body', 'aui-card__footer']);
    expect(c.media.firstChild).toBe(img);
    expect(c.footer.firstChild).toBe(button);
  });

  it('renders strings as text and applies the surface variant', () => {
    const c = mount({ title: '<img src=x>', content: '<b>bold</b>', variant: 'raised' });
    expect(c.element.querySelector('img, b')).toBeNull();
    expect(c.element.classList.contains('aui-surface--raised')).toBe(true);
    c.update({ variant: 'sunken' });
    expect(c.element.classList.contains('aui-surface--raised')).toBe(false);
    expect(c.element.classList.contains('aui-surface--sunken')).toBe(true);
  });
});

describe('Card: interactive (block link)', () => {
  it('makes the title the only link and the only tab stop', async () => {
    const c = mount({ title: 'Project Alpha', subtitle: 'Owner: Ada', content: 'Details', interactive: { href: '/projects/alpha' } });
    const link = c.element.querySelector<HTMLAnchorElement>('.aui-card__link')!;
    expect(link.parentElement!.classList.contains('aui-card__title')).toBe(true);
    expect(link.getAttribute('href')).toBe('/projects/alpha');
    expect(link.textContent).toBe('Project Alpha');
    expect(c.element.classList.contains('aui-card--interactive')).toBe(true);
    expect(tabbables(c.element)).toEqual([link]);
    const before = document.createElement('button');
    before.textContent = 'before';
    document.body.prepend(before);
    before.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(link);
    await userEvent.tab();
    expect(c.element.contains(document.activeElement)).toBe(false);
  });

  it('requires a title and a safe href', () => {
    const host = document.createElement('div');
    expect(() => Card.create(host, { interactive: { href: '/x' } })).toThrow(/title/);
    for (const href of ['javascript:alert(1)', 'data:text/html,x', 'java\nscript:alert(1)']) {
      expect(() => Card.create(host, { title: 'T', interactive: { href } })).toThrow(/href/);
    }
    expect(host.childElementCount).toBe(0);
  });

  it('removing interactive restores a plain title', () => {
    const c = mount({ title: 'T', interactive: { href: 'https://example.com' } });
    c.update({ interactive: undefined });
    expect(c.element.querySelector('a')).toBeNull();
    expect(c.element.querySelector('.aui-card__title')!.textContent).toBe('T');
    expect(c.element.classList.contains('aui-card--interactive')).toBe(false);
  });
});

describe('Card: lifecycle', () => {
  it('failed construction leaves the host untouched', () => {
    const host = document.createElement('div');
    host.append(document.createElement('span'));
    expect(() => Card.create(host, { title: ' ' })).toThrow(AbsoluteUIError);
    expect(() => Card.create(host, { title: 'T', headingLevel: 1 as CardHeadingLevel })).toThrow(AbsoluteUIError);
    // @ts-expect-error: invalid variant
    expect(() => Card.create(host, { variant: 'glass' })).toThrow(/variant/);
    expect(host.firstElementChild!.tagName).toBe('SPAN');
  });

  it('invalid updates leave the card unchanged', () => {
    const c = mount({ title: 'T' });
    expect(() => { c.update({ interactive: { href: 'javascript:void(0)' } }); }).toThrow(/href/);
    expect(c.element.querySelector('a')).toBeNull();
  });

  it('destroy removes rendering and the configuration subscription', () => {
    const c = mount({ title: 'T' });
    const host = c.host;
    const el = c.element;
    c.destroy();
    expect(host.childElementCount).toBe(0);
    configureAbsoluteUI({ components: { card: { headingLevel: 6 } } });
    expect(el.querySelector('h6')).toBeNull();
  });
});

describe('Surface', () => {
  it('applies variant and padding classes and removes only what it added', () => {
    const el = document.createElement('section');
    el.className = 'panel aui-surface';
    const s = Surface.apply(el, { variant: 'raised', padded: true });
    expect([...el.classList].sort()).toEqual(['aui-surface', 'aui-surface--padded', 'aui-surface--raised', 'panel']);
    s.update({ variant: 'flat', padded: false });
    expect([...el.classList].sort()).toEqual(['aui-surface', 'panel']);
    s.update({ variant: 'sunken' });
    s.destroy();
    // aui-surface was already present, so it stays.
    expect([...el.classList].sort()).toEqual(['aui-surface', 'panel']);
  });

  it('validates options and refuses double application', () => {
    const el = document.createElement('div');
    // @ts-expect-error: invalid variant
    expect(() => Surface.apply(el, { variant: 'glass' })).toThrow(/variant/);
    expect(el.className).toBe('');
    const s = Surface.apply(el);
    expect(() => Surface.apply(el)).toThrow(/already applied/);
    s.destroy();
    expect(el.className).toBe('');
    expect(() => Surface.apply(el)).not.toThrow();
  });
});
