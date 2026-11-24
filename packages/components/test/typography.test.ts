import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Heading, Link, Text, isSafeHref, setLineClamp, type HeadingLevel } from '@absoluteui/components/typography';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

describe('Typography: Heading', () => {
  it('keeps the semantic level independent of the visual size', () => {
    const h = Heading.create(2, 'Billing', { size: 5 });
    expect(h.tagName).toBe('H2');
    expect(h.className).toBe('aui-heading aui-heading--5');
    const h4 = Heading.create(4, 'Invoices', { size: 1 });
    expect(h4.tagName).toBe('H4');
    expect(h4.classList.contains('aui-heading--1')).toBe(true);
  });

  it('defaults the visual size to the level', () => {
    for (const level of [1, 2, 3, 4, 5, 6] as const) {
      const h = Heading.create(level, 'Title');
      expect(h.tagName).toBe(`H${String(level)}`);
      expect(h.classList.contains(`aui-heading--${String(level)}`)).toBe(true);
    }
  });

  it('renders text as text and rejects invalid levels, sizes, and empty text', () => {
    expect(Heading.create(1, '<b>x</b>').querySelector('b')).toBeNull();
    for (const level of [0, 7, 1.5]) expect(() => Heading.create(level as HeadingLevel, 'x')).toThrow(AbsoluteUIError);
    expect(() => Heading.create(2, 'x', { size: 9 as HeadingLevel })).toThrow(/size/);
    expect(() => Heading.create(2, ' ')).toThrow(/text/);
  });
});

describe('Typography: Text', () => {
  it('applies tone, size, and weight modifiers', () => {
    const p = Text.create('Last updated today', { tone: 'muted', size: 'sm', strong: true });
    expect(p.tagName).toBe('P');
    expect([...p.classList].sort()).toEqual(['aui-text', 'aui-text--muted', 'aui-text--sm', 'aui-text--strong']);
    const span = Text.create('inline', { as: 'span' });
    expect(span.tagName).toBe('SPAN');
    expect(span.className).toBe('aui-text');
  });

  it('rejects unknown options', () => {
    // @ts-expect-error: invalid tone
    expect(() => Text.create('x', { tone: 'loud' })).toThrow(/tone/);
    // @ts-expect-error: invalid size
    expect(() => Text.create('x', { size: 'xl' })).toThrow(/size/);
    // @ts-expect-error: invalid element
    expect(() => Text.create('x', { as: 'div' })).toThrow(/as/);
  });
});

describe('Typography: Link', () => {
  it('creates a styled link with a validated destination', () => {
    const a = Link.create({ href: '/docs/start', text: 'Getting started' });
    expect(a.className).toBe('aui-link');
    expect(a.getAttribute('href')).toBe('/docs/start');
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.textContent).toBe('Getting started');
  });

  it('adds rel and a localized visually hidden hint for external links', () => {
    const a = Link.create({ href: 'https://example.com/', text: 'Docs', external: true });
    document.body.append(a);
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener noreferrer');
    const hint = a.querySelector('.aui-link__hint')!;
    expect(hint.textContent).toBe(' (opens in a new tab)');
    expect(a.textContent).toBe('Docs (opens in a new tab)');
  });

  it('localizes the hint through the typography locale', () => {
    registerMessages('typography', 'fr', { opensInNewTab: '(s’ouvre dans un nouvel onglet)' });
    configureAbsoluteUI({ locale: 'fr-FR' });
    const a = Link.create({ href: 'https://example.com/', text: 'Docs', external: true });
    expect(a.querySelector('.aui-link__hint')!.textContent).toBe(' (s’ouvre dans un nouvel onglet)');
    const en = Link.create({ href: 'https://example.com/', text: 'Docs', external: true, locale: 'en-US' });
    expect(en.querySelector('.aui-link__hint')!.textContent).toBe(' (opens in a new tab)');
  });

  it('rejects script, data, and other non-http schemes, including obfuscated ones', () => {
    const bad = ['javascript:alert(1)', 'JavaScript:alert(1)', ' javascript:alert(1)', 'java\tscript:alert(1)', '\u0001javascript:alert(1)', 'data:text/html,<script>alert(1)</script>', 'vbscript:x', 'file:///etc/passwd', 'blob:https://example.com/x', '', '   '];
    for (const href of bad) {
      expect(isSafeHref(href)).toBe(false);
      expect(() => Link.create({ href, text: 'x' })).toThrow(/href/);
    }
    for (const href of ['https://example.com', 'http://example.com/a?b#c', '/path', './rel', '../up', '#anchor', '?q=1', 'page.html', '//cdn.example.com/x']) {
      expect(isSafeHref(href)).toBe(true);
    }
  });

  it('applies the muted variant', () => {
    expect(Link.create({ href: '/x', text: 'x', muted: true }).className).toBe('aui-link aui-link--muted');
  });
});

describe('Typography: setLineClamp', () => {
  it('sets the class and custom property, and the disposer removes them', () => {
    const p = document.createElement('p');
    document.body.append(p);
    const dispose = setLineClamp(p, 2);
    expect(p.classList.contains('aui-line-clamp')).toBe(true);
    expect(p.style.getPropertyValue('--aui-lines')).toBe('2');
    dispose();
    expect(p.className).toBe('');
    expect(p.style.getPropertyValue('--aui-lines')).toBe('');
  });

  it('accepts only integers 1..20', () => {
    const p = document.createElement('p');
    for (const lines of [0, 21, 1.5, Number.NaN]) expect(() => setLineClamp(p, lines)).toThrow(/lines/);
    expect(p.className).toBe('');
    expect(() => setLineClamp(p, 20)).not.toThrow();
  });
});

describe('Typography: enhance existing elements (since 0.9.0)', () => {
  it('Heading.enhance takes the level from the tag, swaps only its own classes, and restores them', () => {
    const h = document.createElement('h3');
    h.className = 'title';
    h.textContent = 'Team';
    const styled = Heading.enhance(h);
    expect(h.className).toBe('title aui-heading aui-heading--3');
    styled.update({ size: 1 });
    expect(h.className).toBe('title aui-heading aui-heading--1');
    expect(() => {
      styled.update({ size: 7 as HeadingLevel });
    }).toThrow(/heading.size/);
    styled.destroy();
    expect(h.className).toBe('title');
    expect(h.textContent).toBe('Team');
    expect(() => Heading.enhance(document.createElement('div'))).toThrow(/h1..h6/);
  });

  it('Text.enhance applies and replaces modifiers', () => {
    const p = document.createElement('p');
    const styled = Text.enhance(p, { tone: 'muted', size: 'sm' });
    expect(p.className).toBe('aui-text aui-text--muted aui-text--sm');
    styled.update({ strong: true });
    expect(p.className).toBe('aui-text aui-text--strong');
    styled.destroy();
    expect(p.className).toBe('');
  });

  it('Link.enhance validates the href, adds the new-tab hint, and restores target and rel', () => {
    const a = document.createElement('a');
    a.href = '/help';
    a.textContent = 'Help';
    a.setAttribute('rel', 'help');
    const styled = Link.enhance(a, { external: true, muted: true });
    expect(a.className).toBe('aui-link aui-link--muted');
    expect(a.target).toBe('_blank');
    expect(a.rel).toBe('noopener noreferrer');
    expect(a.textContent).toBe('Help (opens in a new tab)');
    styled.update({ external: false });
    expect(a.hasAttribute('target')).toBe(false);
    expect(a.getAttribute('rel')).toBe('help');
    expect(a.textContent).toBe('Help');
    expect(a.classList.contains('aui-link--muted')).toBe(true);
    // Deliberately unsafe input: the helper must reject it.
    a.setAttribute('href', ['java', 'script:alert(1)'].join(''));
    expect(() => {
      styled.check();
    }).toThrow(AbsoluteUIError);
    styled.destroy();
    expect(a.className).toBe('');
  });
});
