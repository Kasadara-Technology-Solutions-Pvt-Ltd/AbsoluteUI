import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ErrorSummary, type ErrorSummaryNavigateDetail } from '@absoluteui/components/error-summary';
import { ValidationMessage } from '@absoluteui/components/validation-message';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(): { summary: ErrorSummary; a: HTMLInputElement; b: HTMLInputElement } {
  const host = document.createElement('div');
  const a = document.createElement('input');
  const b = document.createElement('input');
  document.body.append(host, a, b);
  return { summary: ErrorSummary.create(host), a, b };
}

describe('ErrorSummary', () => {
  it('is hidden until shown, then focused with a labelled heading and links to fields', () => {
    const { summary, a } = mount();
    expect(summary.isVisible).toBe(false);
    summary.show([{ message: 'Enter your name', target: a }, { message: 'Service unavailable' }]);
    expect(summary.isVisible).toBe(true);
    expect(document.activeElement).toBe(summary.host);
    const heading = summary.host.querySelector('h2')!;
    expect(heading.textContent).toBe('There is a problem');
    expect(summary.host.getAttribute('aria-labelledby')).toBe(heading.id);
    const link = summary.host.querySelector('a')!;
    expect(link.getAttribute('href')).toBe(`#${a.id}`);
    expect(summary.host.querySelectorAll('li')[1]!.textContent).toBe('Service unavailable');
  });

  it('link activation focuses the target (or calls the item focus callback) and emits aui-navigate', async () => {
    const { summary, a, b } = mount();
    const focusB = vi.fn(() => {
      b.focus();
    });
    const nav = vi.fn();
    summary.host.addEventListener('aui-navigate', (e) => {
      nav((e as CustomEvent<ErrorSummaryNavigateDetail>).detail);
    });
    summary.show([{ message: 'A', target: a }, { message: 'B', target: a, focus: focusB }]);
    const links = summary.host.querySelectorAll('a');
    await userEvent.click(links[0]!);
    expect(document.activeElement).toBe(a);
    await userEvent.click(links[1]!);
    expect(focusB).toHaveBeenCalled();
    expect(document.activeElement).toBe(b);
    expect(nav).toHaveBeenLastCalledWith({ index: 1, message: 'B' });
    expect(location.hash).toBe('');
  });

  it('honours headingLevel and focusOnShow configuration', () => {
    configureAbsoluteUI({ components: { errorSummary: { headingLevel: 3, focusOnShow: false } } });
    const { summary, a } = mount();
    a.focus();
    summary.show([{ message: 'X', target: a }]);
    expect(summary.host.querySelector('h3')).not.toBeNull();
    expect(document.activeElement).toBe(a);
  });

  it('renders messages as text and rejects empty messages', () => {
    const { summary } = mount();
    summary.show([{ message: '<img src=x onerror=alert(1)>' }]);
    expect(summary.host.querySelector('img')).toBeNull();
    expect(() => {
      summary.show([{ message: '' }]);
    }).toThrow(AbsoluteUIError);
  });

  it('clear hides; destroy removes rendering', () => {
    const { summary } = mount();
    summary.show([{ message: 'X' }], { focus: false });
    summary.clear();
    expect(summary.isVisible).toBe(false);
    summary.destroy();
    expect(summary.host.childElementCount).toBe(0);
    expect(summary.host.hasAttribute('tabindex')).toBe(false);
  });
});

describe('ValidationMessage', () => {
  it('describes its target and sets aria-invalid only for errors', () => {
    const target = document.createElement('input');
    const host = document.createElement('div');
    document.body.append(target, host);
    const m = ValidationMessage.create(host, { for: target, message: 'Required' });
    expect(target.getAttribute('aria-describedby')).toBe(host.id);
    expect(target.getAttribute('aria-invalid')).toBe('true');
    expect(host.classList.contains('aui-validation-message--error')).toBe(true);
    m.setMessage('Looks good', 'success');
    expect(target.hasAttribute('aria-invalid')).toBe(false);
    expect(host.textContent).toBe('Looks good');
    m.clear();
    expect(host.hidden).toBe(true);
    expect(target.hasAttribute('aria-describedby')).toBe(false);
  });

  it('keeps other aria-describedby references and cleans up on destroy', () => {
    const target = document.createElement('input');
    target.setAttribute('aria-describedby', 'other');
    const host = document.createElement('div');
    document.body.append(target, host);
    const m = ValidationMessage.create(host, { for: target, message: 'Bad', tone: 'warning' });
    expect(target.getAttribute('aria-describedby')).toBe(`other ${host.id}`);
    expect(target.hasAttribute('aria-invalid')).toBe(false);
    m.destroy();
    expect(target.getAttribute('aria-describedby')).toBe('other');
  });

  it('never removes a consumer-managed aria-invalid (regression)', () => {
    const target = document.createElement('input');
    target.setAttribute('aria-invalid', 'true');
    const host = document.createElement('div');
    document.body.append(target, host);
    const m = ValidationMessage.create(host, { for: target, message: 'Bad' });
    m.clear();
    expect(target.getAttribute('aria-invalid')).toBe('true');
  });

  it('rejects invalid tones', () => {
    expect(() => ValidationMessage.create(document.createElement('div'), { tone: 'fatal' as 'error' })).toThrow(AbsoluteUIError);
  });
});
