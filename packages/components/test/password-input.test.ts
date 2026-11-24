import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { PasswordInput, type PasswordInputOptions } from '@absoluteui/components/password-input';
import { Form } from '@absoluteui/components/form';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<PasswordInputOptions> = {}, parent: HTMLElement = document.body): PasswordInput {
  const host = document.createElement('div');
  parent.append(host);
  return PasswordInput.create(host, { label: 'Password', ...options });
}

const toggle = (p: PasswordInput): HTMLButtonElement => p.host.querySelector<HTMLButtonElement>('.aui-password-input__reveal')!;
const describedBy = (el: Element): string[] => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);
const frame = (): Promise<void> => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(() => { r(); })));
const liveText = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';

describe('PasswordInput: semantics', () => {
  it('renders a labelled password input with password-manager friendly attributes', () => {
    const p = mount({ name: 'password', required: true });
    expect(p.input.type).toBe('password');
    expect(p.input.getAttribute('autocomplete')).toBe('current-password');
    expect(p.input.spellcheck).toBe(false);
    expect(p.input.getAttribute('autocapitalize')).toBe('none');
    expect(p.host.querySelector('label')!.htmlFor).toBe(p.input.id);
    expect(p.input.required).toBe(true);
    expect(getFormControl(p.host)).toBe(p);
  });

  it('uses new-password on sign-up forms and validates options first', () => {
    expect(mount({ autocomplete: 'new-password' }).input.getAttribute('autocomplete')).toBe('new-password');
    const host = document.createElement('div');
    expect(() => PasswordInput.create(host, { label: '' })).toThrow(AbsoluteUIError);
    // @ts-expect-error runtime validation
    expect(() => PasswordInput.create(host, { label: 'x', autocomplete: 'username' })).toThrow(/autocomplete/);
    expect(() => PasswordInput.create(host, { label: 'x', describedBy: ['bad id'] })).toThrow(/describedBy/);
    expect(host.childElementCount).toBe(0);
  });
});

describe('PasswordInput: show/hide', () => {
  it('toggles with a constant name and aria-pressed, keeps focus, and announces the state', async () => {
    const p = mount({ value: 'secret' });
    const b = toggle(p);
    expect(b.type).toBe('button');
    expect(b.getAttribute('aria-label')).toBe('Show password');
    expect(b.getAttribute('aria-pressed')).toBe('false');
    expect(b.getAttribute('aria-controls')).toBe(p.input.id);
    await userEvent.click(b);
    expect(p.input.type).toBe('text');
    expect(p.revealed).toBe(true);
    expect(b.getAttribute('aria-pressed')).toBe('true');
    expect(b.getAttribute('aria-label')).toBe('Show password');
    expect(document.activeElement).toBe(b);
    await frame();
    expect(liveText()).toBe('Password shown');
    await userEvent.keyboard('{Enter}');
    expect(p.input.type).toBe('password');
    await frame();
    expect(liveText()).toBe('Password hidden');
    // The announcement never contains the value.
    expect(liveText()).not.toContain('secret');
  });

  it('reset masks the password again; revealable: false removes a focused toggle safely (regression)', async () => {
    const p = mount();
    await userEvent.click(toggle(p));
    p.reset();
    expect(p.input.type).toBe('password');
    p.update({ revealable: false });
    expect(p.host.querySelector('.aui-password-input__reveal')).toBeNull();
    p.setRevealed(true);
    expect(p.input.type).toBe('password');
  });
});

describe('PasswordInput: caps lock and privacy', () => {
  it('shows and describes a Caps Lock warning while it is on', async () => {
    const p = mount();
    p.input.focus();
    p.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', modifierCapsLock: true, bubbles: true }));
    const caps = p.host.querySelector<HTMLElement>('.aui-password-input__caps')!;
    expect(caps.hidden).toBe(false);
    expect(describedBy(p.input)).toContain('Caps Lock is on.');
    await frame();
    expect(liveText()).toBe('Caps Lock is on.');
    p.input.dispatchEvent(new KeyboardEvent('keyup', { key: 'A', bubbles: true }));
    expect(caps.hidden).toBe(true);
  });

  it('capsLockWarning: false (global config) disables the warning', () => {
    configureAbsoluteUI({ components: { passwordInput: { capsLockWarning: false } } });
    const p = mount();
    p.input.dispatchEvent(new KeyboardEvent('keydown', { key: 'A', modifierCapsLock: true }));
    expect(p.host.querySelector<HTMLElement>('.aui-password-input__caps')!.hidden).toBe(true);
  });

  it('events carry validity but never the value', async () => {
    const p = mount({ minLength: 8 });
    const details: unknown[] = [];
    p.host.addEventListener('aui-input', (e) => details.push((e as CustomEvent<unknown>).detail));
    await userEvent.click(p.input);
    await userEvent.keyboard('hunter2');
    expect(details).toHaveLength(7);
    expect(JSON.stringify(details)).not.toContain('hunter');
    expect(details.at(-1)).toMatchObject({ validity: { valid: false, error: 'too-short', message: 'Enter at least 8 characters.' } });
  });

  it('clipboard policy block-copy blocks copy and cut but allows paste (password managers)', () => {
    const p = mount({ clipboard: 'block-copy' });
    const copy = new ClipboardEvent('copy', { cancelable: true });
    const paste = new ClipboardEvent('paste', { cancelable: true });
    p.input.dispatchEvent(copy);
    p.input.dispatchEvent(paste);
    expect(copy.defaultPrevented).toBe(true);
    expect(paste.defaultPrevented).toBe(false);
  });

  it('appends describedBy ids (e.g. a strength meter) after its own descriptions', () => {
    const extra = document.createElement('div');
    extra.id = 'meter-1';
    extra.textContent = 'Strength: Good';
    document.body.append(extra);
    const p = mount({ description: 'Use 12 or more characters.', describedBy: ['meter-1'] });
    expect(describedBy(p.input)).toEqual(['Use 12 or more characters.', 'Strength: Good']);
  });
});

describe('PasswordInput: forms', () => {
  it('validates required on blur and submits its value through Form', async () => {
    const el = document.createElement('form');
    document.body.append(el);
    const p = mount({ name: 'password', required: true }, el);
    const form = Form.create(el, { errorSummary: false });
    expect(form.validate()).toBe(false);
    expect(describedBy(p.input)).toContain('This field is required.');
    await userEvent.click(p.input);
    await userEvent.keyboard('correct horse');
    expect(form.getValues()).toEqual({ password: 'correct horse' });
    form.destroy();
  });
});
