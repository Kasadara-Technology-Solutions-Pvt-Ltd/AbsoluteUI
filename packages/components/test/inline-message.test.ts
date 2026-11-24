import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { InlineMessage, inlineMessageConfig, type InlineMessageOptions } from '@absoluteui/components/inline-message';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<InlineMessageOptions> = {}): InlineMessage {
  const host = document.createElement('span');
  document.body.append(host);
  return InlineMessage.create(host, { message: 'Saved 2 minutes ago', ...options });
}

describe('InlineMessage', () => {
  it('renders a decorative icon, a visually hidden tone prefix, and the text', () => {
    const m = mount({ tone: 'success' });
    expect(m.host.classList).toContain('aui-inline-message');
    expect(m.host.classList).toContain('aui-inline-message--success');
    expect(m.host.querySelector('.aui-inline-message__icon svg')!.getAttribute('aria-hidden')).toBe('true');
    const tone = m.host.querySelector<HTMLElement>('.aui-inline-message__tone')!;
    expect(tone.textContent).toBe('Success: ');
    expect(tone.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(m.host.querySelector('.aui-inline-message__text')!.textContent).toBe('Saved 2 minutes ago');
    expect(m.host.textContent).toBe('Success: Saved 2 minutes ago');
  });

  it('defaults to info and a static (non-live) host', () => {
    const m = mount();
    expect(m.host.classList).toContain('aui-inline-message--info');
    expect(m.host.hasAttribute('role')).toBe(false);
  });

  it('maps live to status/alert roles and updates text in place', () => {
    const m = mount({ live: 'polite', tone: 'warning', message: 'Offline' });
    expect(m.host.getAttribute('role')).toBe('status');
    const text = m.host.querySelector('.aui-inline-message__text');
    m.update({ message: 'Back online', tone: 'success' });
    expect(m.host.querySelector('.aui-inline-message__text')).toBe(text);
    expect(m.message).toBe('Back online');
    expect(m.host.classList).not.toContain('aui-inline-message--warning');
    m.update({ live: 'assertive' });
    expect(m.host.getAttribute('role')).toBe('alert');
  });

  it('renders text only (no HTML parsing)', () => {
    const m = mount({ message: '<b>bold</b>' });
    expect(m.host.querySelector('b')).toBeNull();
  });

  it('validates options before touching the host, and on update', () => {
    const host = document.createElement('span');
    const bad: unknown[] = [{ message: '' }, { message: 'x', tone: 'neutral' }, { message: 'x', live: 'yes' }, { message: 'x', icons: { info: 'nope' } }, { message: 'x', locale: 42 }];
    for (const options of bad) expect(() => InlineMessage.create(host, options as InlineMessageOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const m = mount();
    expect(() => {
      m.update({ message: ' ' });
    }).toThrow(AbsoluteUIError);
    expect(m.message).toBe('Saved 2 minutes ago');
  });

  it('localizes the prefix with the inherited locale and re-renders on config change', () => {
    registerMessages('inlineMessage', 'de', { error: 'Fehler:' });
    const m = mount({ tone: 'error' });
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(m.host.querySelector('.aui-inline-message__tone')!.textContent).toBe('Fehler: ');
    m.update({ locale: 'en-US' });
    expect(m.host.querySelector('.aui-inline-message__tone')!.textContent).toBe('Error: ');
    expect([...inlineMessageConfig.optionNames]).toEqual(['locale']);
  });

  it('destroy removes rendering, role, classes, and subscriptions', () => {
    const m = mount({ live: 'polite', tone: 'error' });
    m.destroy();
    expect(m.host.childNodes.length).toBe(0);
    expect(m.host.className).toBe('');
    expect(m.host.hasAttribute('role')).toBe(false);
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(m.host.childNodes.length).toBe(0);
  });
});
