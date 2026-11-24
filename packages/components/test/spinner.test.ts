import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Spinner } from '@absoluteui/components/spinner';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

describe('Spinner', () => {
  it('renders a status region with a decorative icon and a visually hidden localized label', () => {
    const s = Spinner.create(host());
    expect(s.host.getAttribute('role')).toBe('status');
    expect(s.visible).toBe(true);
    const icon = s.host.querySelector('.aui-spinner__icon')!;
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    const label = s.host.querySelector('.aui-spinner__label')!;
    expect(label.textContent).toBe('Loading');
    expect(label.classList.contains('aui-spinner__label--hidden')).toBe(true);
    expect(s.host.classList.contains('aui-spinner--md')).toBe(true);
  });

  it('supports a custom visible label, size, and locale messages', () => {
    registerMessages('spinner', 'de', { loading: 'Wird geladen' });
    configureAbsoluteUI({ common: { locale: 'de-DE' }, components: { spinner: { size: 'lg' } } });
    const s = Spinner.create(host());
    expect(s.host.textContent).toBe('Wird geladen');
    expect(s.host.classList.contains('aui-spinner--lg')).toBe(true);
    s.update({ label: 'Saving', showLabel: true, size: 'sm' });
    const label = s.host.querySelector('.aui-spinner__label')!;
    expect(label.textContent).toBe('Saving');
    expect(label.classList.contains('aui-spinner__label--hidden')).toBe(false);
    expect(s.host.classList.contains('aui-spinner--sm')).toBe(true);
    expect(s.host.classList.contains('aui-spinner--lg')).toBe(false);
  });

  it('renders nothing inside the status region until the delay elapses', () => {
    vi.useFakeTimers();
    const s = Spinner.create(host(), { delay: 300 });
    expect(s.host.getAttribute('role')).toBe('status');
    expect(s.visible).toBe(false);
    expect(s.host.childElementCount).toBe(0);
    expect(s.host.classList.contains('aui-spinner--pending')).toBe(true);
    vi.advanceTimersByTime(299);
    expect(s.host.childElementCount).toBe(0);
    vi.advanceTimersByTime(1);
    expect(s.visible).toBe(true);
    expect(s.host.textContent).toBe('Loading');
    expect(s.host.classList.contains('aui-spinner--pending')).toBe(false);
  });

  it('never shows when destroyed before the delay (fast operation)', () => {
    vi.useFakeTimers();
    const el = host();
    const s = Spinner.create(el, { delay: 200 });
    s.destroy();
    vi.advanceTimersByTime(500);
    expect(el.childElementCount).toBe(0);
    expect(el.hasAttribute('role')).toBe(false);
    expect(el.className).toBe('');
  });

  it('treats delay as init-only and rejects invalid options without touching the host', () => {
    const el = host();
    el.textContent = 'original';
    expect(() => Spinner.create(el, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => Spinner.create(el, { delay: -1 })).toThrow(AbsoluteUIError);
    expect(el.textContent).toBe('original');
    expect(el.hasAttribute('role')).toBe(false);
    const s = Spinner.create(el);
    expect(() => {
      s.update({ delay: 100 });
    }).toThrow(AbsoluteUIError);
  });

  it('destroy removes rendering and config subscriptions', () => {
    const el = host();
    const s = Spinner.create(el);
    s.destroy();
    expect(el.childElementCount).toBe(0);
    expect(el.className).toBe('');
    configureAbsoluteUI({ components: { spinner: { size: 'lg' } } });
    expect(el.className).toBe('');
  });
});
