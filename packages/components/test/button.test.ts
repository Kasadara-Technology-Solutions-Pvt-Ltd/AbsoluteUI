import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Button } from '@absoluteui/components/button';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function nativeButton(text = 'Save'): HTMLButtonElement {
  const el = document.createElement('button');
  el.type = 'button';
  el.textContent = text;
  document.body.append(el);
  return el;
}

describe('Button', () => {
  it('enhances a native button with variant/size classes from configuration precedence', () => {
    configureAbsoluteUI({ components: { button: { variant: 'primary' } } });
    const b = Button.enhance(nativeButton());
    expect(b.element.className).toBe('aui-button aui-button--primary aui-button--md');
    b.update({ variant: 'danger', size: 'lg' });
    expect(b.element.classList.contains('aui-button--danger')).toBe(true);
    expect(b.element.classList.contains('aui-button--lg')).toBe(true);
  });

  it('outline variant and fullWidth (since 0.9.0)', () => {
    const b = Button.enhance(nativeButton(), { variant: 'outline', fullWidth: true });
    expect(b.element.classList.contains('aui-button--outline')).toBe(true);
    expect(b.element.classList.contains('aui-button--full-width')).toBe(true);
    b.update({ fullWidth: false });
    expect(b.element.classList.contains('aui-button--full-width')).toBe(false);
    b.destroy();
    expect(b.element.className).toBe('');
  });

  it('reacts to global configuration changes', () => {
    const b = Button.enhance(nativeButton());
    expect(b.element.classList.contains('aui-button--secondary')).toBe(true);
    configureAbsoluteUI({ components: { button: { size: 'sm' } } });
    expect(b.element.classList.contains('aui-button--sm')).toBe(true);
  });

  it('requires an accessible name for icon-only buttons (§7.3)', () => {
    const el = document.createElement('button');
    document.body.append(el);
    expect(() => Button.enhance(el, { icon: 'close' })).toThrow(AbsoluteUIError);
    const b = Button.enhance(el, { icon: 'close', label: 'Close' });
    expect(b.element.getAttribute('aria-label')).toBe('Close');
    expect(b.element.classList.contains('aui-button--icon-only')).toBe(true);
    expect(b.element.querySelector('svg')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('blocks activation while loading but stays focusable, with loading in the accessible name', async () => {
    const onClick = vi.fn();
    const form = document.createElement('form');
    const onSubmit = vi.fn((e: Event) => {
      e.preventDefault();
    });
    form.addEventListener('submit', onSubmit);
    const el = document.createElement('button');
    el.type = 'submit';
    el.textContent = 'Submit';
    form.append(el);
    document.body.append(form);
    el.addEventListener('click', onClick);
    const b = Button.enhance(el, { loading: true });
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el.disabled).toBe(false);
    expect(el.textContent).toContain('Loading');
    // Playwright refuses to click aria-disabled elements; native click() exercises real activation.
    el.click();
    expect(onClick).not.toHaveBeenCalled();
    expect(onSubmit).not.toHaveBeenCalled();
    el.focus();
    expect(document.activeElement).toBe(el);
    b.setLoading(false);
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    expect(el.textContent).toBe('Submit');
    await userEvent.click(el);
    expect(onClick).toHaveBeenCalledTimes(1);
  });

  it('creates buttons with text content only (never parsed as HTML)', () => {
    const b = Button.create({ text: '<img src=x onerror=alert(1)>' });
    expect(b.element.querySelector('img')).toBeNull();
    expect(b.element.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(b.element.type).toBe('button');
  });

  it('rejects invalid configuration predictably', () => {
    expect(() => Button.enhance(nativeButton(), { variant: 'fancy' as 'primary' })).toThrow(/button.variant/);
  });

  it('a failed construction leaves no configuration subscription behind (regression)', () => {
    expect(() => Button.enhance(nativeButton(), { variant: 'fancy' as 'primary' })).toThrow(AbsoluteUIError);
    expect(() => {
      configureAbsoluteUI({ density: 'compact' });
    }).not.toThrow();
  });

  it('destroy removes enhancements', () => {
    const b = Button.enhance(nativeButton(), { icon: 'check', loading: true });
    b.destroy();
    expect(b.element.className).toBe('');
    expect(b.element.querySelector('svg')).toBeNull();
    expect(b.element.hasAttribute('aria-disabled')).toBe(false);
  });

  it('enhances a link styled as a button; link semantics stay native (since 0.9.0)', () => {
    const a = document.createElement('a');
    a.href = '#/reports';
    a.textContent = 'Reports';
    document.body.append(a);
    const b = Button.enhance(a, { variant: 'primary', fullWidth: true });
    expect(b.element).toBe(a);
    expect(a.className).toBe('aui-button aui-button--primary aui-button--md aui-button--full-width');
    expect(a.getAttribute('href')).toBe('#/reports');
    expect(a.hasAttribute('role')).toBe(false);
    expect(a.hasAttribute('aria-disabled')).toBe(false);
    b.destroy();
    expect(a.className).toBe('');
  });

  it('a disabled link keeps its href, leaves the tab order, and blocks activation; enabling restores it', () => {
    const a = document.createElement('a');
    a.href = '#/disabled-target';
    a.textContent = 'Open';
    a.setAttribute('tabindex', '2');
    document.body.append(a);
    const onClick = vi.fn();
    const b = Button.enhance(a, { disabled: true });
    a.addEventListener('click', onClick);
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.getAttribute('tabindex')).toBe('-1');
    expect(a.getAttribute('href')).toBe('#/disabled-target');
    const before = location.hash;
    a.click();
    expect(onClick).not.toHaveBeenCalled();
    expect(location.hash).toBe(before);
    b.update({ disabled: false });
    expect(a.hasAttribute('aria-disabled')).toBe(false);
    expect(a.getAttribute('tabindex')).toBe('2');
    b.update({ disabled: true, loading: true });
    b.destroy();
    expect(a.getAttribute('tabindex')).toBe('2');
    expect(a.hasAttribute('aria-disabled')).toBe(false);
  });

  it('a loading link blocks activation and stays focusable', () => {
    const a = document.createElement('a');
    a.href = '#/loading-target';
    a.textContent = 'Export';
    document.body.append(a);
    const b = Button.enhance(a, { loading: true });
    const onClick = vi.fn();
    a.addEventListener('click', onClick);
    a.click();
    expect(onClick).not.toHaveBeenCalled();
    expect(a.getAttribute('aria-disabled')).toBe('true');
    expect(a.hasAttribute('tabindex')).toBe(false);
    b.destroy();
  });

  it('disabled sets the native property on a button only when given', () => {
    const el = nativeButton();
    const b = Button.enhance(el);
    expect(el.disabled).toBe(false);
    b.update({ disabled: true });
    expect(el.disabled).toBe(true);
    expect(el.hasAttribute('aria-disabled')).toBe(false);
    b.update({ disabled: false });
    expect(el.disabled).toBe(false);
  });

  it('rejects hosts other than <button> and <a>', () => {
    const div = document.createElement('div');
    // Safe for the test: the runtime check is what is exercised.
    expect(() => Button.enhance(div as unknown as HTMLButtonElement)).toThrow(/BUTTON_HOST|<button> or <a>/);
  });
});

describe('Button pressed (toggle button, R13-5)', () => {
  it('exposes aria-pressed, flips on activation, and emits aui-change', async () => {
    const el = nativeButton('Bold');
    const b = Button.enhance(el, { pressed: false });
    expect(el.getAttribute('aria-pressed')).toBe('false');
    expect(b.pressed).toBe(false);
    const changes: boolean[] = [];
    el.addEventListener('aui-change', (e) => {
      changes.push((e as CustomEvent<{ pressed: boolean }>).detail.pressed);
    });
    await userEvent.click(el);
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(el.classList).toContain('aui-button--pressed');
    el.focus();
    await userEvent.keyboard(' ');
    expect(b.pressed).toBe(false);
    expect(changes).toEqual([true, false]);
  });

  it('does not toggle while loading or disabled; programmatic updates do not emit', () => {
    const el = nativeButton('Italic');
    const b = Button.enhance(el, { pressed: false, loading: true });
    const onChange = vi.fn();
    el.addEventListener('aui-change', onChange);
    el.click();
    expect(b.pressed).toBe(false);
    b.update({ loading: false, disabled: true });
    el.click();
    expect(b.pressed).toBe(false);
    b.update({ disabled: false, pressed: true });
    expect(el.getAttribute('aria-pressed')).toBe('true');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('null or unset is an ordinary button; links and non-booleans are rejected', () => {
    const el = nativeButton('Plain');
    const b = Button.enhance(el, { pressed: true });
    b.update({ pressed: null });
    expect(el.hasAttribute('aria-pressed')).toBe(false);
    expect(b.pressed).toBeNull();
    el.click();
    expect(b.pressed).toBeNull();
    const link = document.createElement('a');
    link.href = '/x';
    link.textContent = 'Go';
    expect(() => Button.enhance(link, { pressed: false })).toThrow(AbsoluteUIError);
    expect(() => {
      b.update({ pressed: 'yes' as unknown as boolean });
    }).toThrow(AbsoluteUIError);
    expect(b.pressed).toBeNull();
    b.destroy();
    expect(el.hasAttribute('aria-pressed')).toBe(false);
  });
});
