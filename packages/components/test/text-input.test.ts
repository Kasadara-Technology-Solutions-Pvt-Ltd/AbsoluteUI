import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { TextInput, type TextInputOptions, type TextInputValueDetail } from '@absoluteui/components/text-input';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<TextInputOptions> = {}): TextInput {
  const host = document.createElement('div');
  document.body.append(host);
  return TextInput.create(host, { label: 'Name', ...options });
}

const errorText = (t: TextInput): string => t.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const describedBy = (t: TextInput): string[] => (t.input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);

describe('TextInput: semantics', () => {
  it('labels the native input and wires help text', () => {
    const t = mount({ description: 'As on your passport', required: true, name: 'fullName' });
    const label = t.host.querySelector('label')!;
    expect(label.htmlFor).toBe(t.input.id);
    expect(label.textContent).toBe('Name*');
    expect(label.querySelector('.aui-field__required')!.getAttribute('aria-hidden')).toBe('true');
    expect(t.input.required).toBe(true);
    expect(t.input.name).toBe('fullName');
    expect(describedBy(t)).toEqual(['As on your passport']);
  });

  it('requires a label and validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => TextInput.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => TextInput.create(host, { label: 'x', showCounter: true })).toThrow(/maxLength/);
    expect(() => TextInput.create(host, { label: 'x', pattern: '(' })).toThrow(/pattern/);
    expect(() => TextInput.create(host, { label: 'x', minLength: 5, maxLength: 2 })).toThrow(/minLength/);
    expect(host.childElementCount).toBe(0);
  });

  it('renders text addons inside the control and describes the input with them', () => {
    const t = mount({ prefix: 'https://', suffix: '.example.com' });
    expect(t.host.querySelector('.aui-text-input__prefix')!.textContent).toBe('https://');
    expect(describedBy(t)).toEqual(['https://', '.example.com']);
  });

  it('visually hides the label on request while keeping the accessible name', () => {
    const t = mount({ hideLabel: true });
    expect(t.host.querySelector('label')!.classList.contains('aui-visually-hidden')).toBe(true);
  });
});

describe('TextInput: validation', () => {
  it('shows messages only after blur by default, then live', async () => {
    const t = mount({ required: true });
    expect(t.validity).toMatchObject({ valid: false, error: 'value-missing' });
    expect(t.input.hasAttribute('aria-invalid')).toBe(false);
    await userEvent.click(t.input);
    await userEvent.tab();
    expect(errorText(t)).toBe('This field is required.');
    expect(t.input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(t)).toContain('This field is required.');
    await userEvent.click(t.input);
    await userEvent.keyboard('Ada');
    expect(t.validity.valid).toBe(true);
    expect(t.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
  });

  it('honours validationTiming from global configuration', async () => {
    configureAbsoluteUI({ components: { textInput: { validationTiming: 'input' } } });
    const t = mount({ minLength: 3 });
    await userEvent.click(t.input);
    await userEvent.keyboard('a');
    expect(errorText(t)).toBe('Enter at least 3 characters.');
  });

  it('validates email, url, pattern, and length with localized messages', () => {
    const cases: [Partial<TextInputOptions>, string, string][] = [
      [{ type: 'email' }, 'not-an-email', 'Enter a valid email address.'],
      [{ type: 'url' }, 'example.com', 'Enter a valid URL, including the scheme (for example https://).'],
      [{ pattern: '[A-Z]{3}' }, 'abc', 'Enter a value in the requested format.'],
      [{ maxLength: 3 }, 'abcd', 'Enter 3 characters or fewer.'],
    ];
    for (const [opts, value, message] of cases) {
      const t = mount({ ...opts, value });
      expect(t.reportValidity()).toBe(false);
      expect(errorText(t)).toBe(message);
      t.destroy();
    }
    expect(mount({ type: 'email', value: 'ada@example.com' }).reportValidity()).toBe(true);
  });

  it('counts code points, not UTF-16 units, for length constraints', () => {
    const t = mount({ maxLength: 2, value: '😀😀' });
    expect(t.reportValidity()).toBe(true);
  });

  it('runs the consumer validator after built-in constraints', () => {
    const validate = vi.fn((v: string) => (v === 'admin' ? 'This name is reserved.' : null));
    const t = mount({ validate, value: 'admin' });
    expect(t.reportValidity()).toBe(false);
    expect(errorText(t)).toBe('This name is reserved.');
    expect(t.validity.error).toBe('custom');
  });

  it('clears an external custom error when the user edits the value', async () => {
    const t = mount({ value: 'taken' });
    t.setCustomError('This username is taken.');
    t.reportValidity();
    expect(errorText(t)).toBe('This username is taken.');
    await userEvent.click(t.input);
    await userEvent.keyboard('x');
    expect(t.validity.valid).toBe(true);
  });

  it('localizes validation messages through the message catalog', () => {
    registerMessages('validation', 'de', { valueMissing: 'Dieses Feld ist erforderlich.' });
    const t = mount({ required: true, locale: 'de-DE' });
    t.reportValidity();
    expect(errorText(t)).toBe('Dieses Feld ist erforderlich.');
  });
});

describe('TextInput: counter, events, sensitive input', () => {
  it('shows remaining and over-limit counts without truncating input', async () => {
    const t = mount({ maxLength: 5, showCounter: true });
    const counter = t.host.querySelector<HTMLElement>('.aui-field__counter')!;
    expect(counter.textContent).toBe('5 characters remaining');
    await userEvent.click(t.input);
    await userEvent.keyboard('abcdefg');
    expect(t.value).toBe('abcdefg');
    expect(counter.textContent).toBe('2 characters too many');
    expect(counter.classList.contains('aui-field__counter--over')).toBe(true);
  });

  it('emits bubbling aui-input and aui-change events with value and validity', async () => {
    const t = mount();
    const inputs: TextInputValueDetail[] = [];
    const changes: TextInputValueDetail[] = [];
    document.body.addEventListener('aui-input', (e) => inputs.push((e as CustomEvent<TextInputValueDetail>).detail));
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<TextInputValueDetail>).detail));
    await userEvent.click(t.input);
    await userEvent.keyboard('ab');
    await userEvent.tab();
    expect(inputs.map((d) => d.value)).toEqual(['a', 'ab']);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ value: 'ab', validity: { valid: true } });
  });

  it('reveals and conceals a password with a toggle button', async () => {
    const t = mount({ type: 'password', value: 'secret' });
    expect(t.input.type).toBe('password');
    expect(t.input.getAttribute('autocomplete')).toBe('current-password');
    expect(t.input.spellcheck).toBe(false);
    const toggle = t.host.querySelector<HTMLButtonElement>('.aui-text-input__reveal')!;
    expect(toggle.getAttribute('aria-label')).toBe('Show password');
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    await userEvent.click(toggle);
    expect(t.input.type).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    t.reset();
    expect(t.input.type).toBe('password');
  });

  it('removes a focused reveal toggle without a re-entrant render error (regression)', async () => {
    const t = mount({ type: 'password' });
    await userEvent.click(t.host.querySelector<HTMLButtonElement>('.aui-text-input__reveal')!);
    // Removing the focused button fires focusout, which used to re-render and remove it twice.
    expect(() => {
      t.update({ revealable: false });
    }).not.toThrow();
    expect(t.host.querySelector('.aui-text-input__reveal')).toBeNull();
    expect(t.input.type).toBe('password');
  });

  it('blocks clipboard copy for sensitive values when configured', () => {
    const t = mount({ type: 'password', value: 'secret', clipboard: 'block-copy' });
    const copy = new ClipboardEvent('copy', { cancelable: true });
    const paste = new ClipboardEvent('paste', { cancelable: true });
    t.input.dispatchEvent(copy);
    t.input.dispatchEvent(paste);
    expect(copy.defaultPrevented).toBe(true);
    expect(paste.defaultPrevented).toBe(false);
  });
});

describe('TextInput: form control contract', () => {
  it('registers with the form-control registry and supports reset/dirty/touched', async () => {
    const t = mount({ name: 'city', value: 'Pune' });
    expect(getFormControl(t.host)).toBe(t);
    expect(t.dirty).toBe(false);
    await userEvent.click(t.input);
    await userEvent.keyboard('{End}x');
    await userEvent.tab();
    expect(t.dirty).toBe(true);
    expect(t.touched).toBe(true);
    expect(t.getFormValue()).toBe('Punex');
    t.reset();
    expect(t.value).toBe('Pune');
    expect(t.dirty).toBe(false);
    expect(t.touched).toBe(false);
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const t = mount();
    const host = t.host;
    t.destroy();
    expect(host.childElementCount).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
