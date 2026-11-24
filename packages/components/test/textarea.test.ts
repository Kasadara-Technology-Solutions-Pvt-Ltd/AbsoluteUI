import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Textarea, type TextareaOptions, type TextareaValueDetail } from '@absoluteui/components/textarea';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  vi.restoreAllMocks();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<TextareaOptions> = {}): Textarea {
  const host = document.createElement('div');
  document.body.append(host);
  return Textarea.create(host, { label: 'Comments', ...options });
}

const errorText = (t: Textarea): string => t.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const describedBy = (t: Textarea): string[] => (t.textarea.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);

describe('Textarea: semantics', () => {
  it('labels the native textarea and wires help text', () => {
    const t = mount({ description: 'Visible to the reviewer', required: true, name: 'comments' });
    const label = t.host.querySelector('label')!;
    expect(t.textarea.tagName).toBe('TEXTAREA');
    expect(label.htmlFor).toBe(t.textarea.id);
    expect(label.textContent).toBe('Comments*');
    expect(t.textarea.required).toBe(true);
    expect(t.textarea.name).toBe('comments');
    expect(t.textarea.rows).toBe(3);
    expect(t.textarea.spellcheck).toBe(true);
    expect(describedBy(t)).toEqual(['Visible to the reviewer']);
  });

  it('requires a label and validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Textarea.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => Textarea.create(host, { label: 'x', showCounter: true })).toThrow(/maxLength/);
    expect(() => Textarea.create(host, { label: 'x', rows: 0 })).toThrow(/rows/);
    expect(() => Textarea.create(host, { label: 'x', rows: 2.5 })).toThrow(/rows/);
    // @ts-expect-error invalid resize mode
    expect(() => Textarea.create(host, { label: 'x', resize: 'both' })).toThrow(/resize/);
    expect(() => Textarea.create(host, { label: 'x', maxRows: 8 })).toThrow(/maxRows/);
    expect(() => Textarea.create(host, { label: 'x', resize: 'auto', rows: 5, maxRows: 4 })).toThrow(/maxRows/);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });

  it('visually hides the label on request while keeping the accessible name', () => {
    const t = mount({ hideLabel: true });
    expect(t.host.querySelector('label')!.classList.contains('aui-visually-hidden')).toBe(true);
  });
});

describe('Textarea: sizing', () => {
  it('applies rows and resize modes as host classes', () => {
    const t = mount({ rows: 6, resize: 'none' });
    expect(t.textarea.rows).toBe(6);
    expect(t.host.classList.contains('aui-textarea--resize-none')).toBe(true);
    t.update({ resize: 'vertical' });
    expect(t.host.classList.contains('aui-textarea--resize-none')).toBe(false);
    expect(t.host.classList.contains('aui-textarea--auto')).toBe(false);
  });

  it('uses native field-sizing for auto-grow when the engine supports it', () => {
    const t = mount({ resize: 'auto', rows: 2, maxRows: 6 });
    expect(CSS.supports('field-sizing', 'content')).toBe(true);
    expect(t.host.classList.contains('aui-textarea--auto')).toBe(true);
    expect(t.host.classList.contains('aui-textarea--auto-native')).toBe(true);
    expect(t.textarea.style.getPropertyValue('--aui-textarea-rows')).toBe('2');
    expect(t.textarea.style.getPropertyValue('--aui-textarea-max-rows')).toBe('6');
    expect(t.textarea.style.getPropertyValue('block-size')).toBe('');
  });

  it('falls back to CSSOM block-size from scrollHeight without field-sizing', async () => {
    vi.spyOn(CSS, 'supports').mockReturnValue(false);
    const t = mount({ resize: 'auto', rows: 2 });
    expect(t.host.classList.contains('aui-textarea--auto-native')).toBe(false);
    const initial = Number.parseFloat(t.textarea.style.getPropertyValue('block-size'));
    expect(initial).toBeGreaterThan(0);
    await userEvent.click(t.textarea);
    await userEvent.keyboard('a{Enter}b{Enter}c{Enter}d{Enter}e{Enter}f');
    const grown = Number.parseFloat(t.textarea.style.getPropertyValue('block-size'));
    expect(grown).toBeGreaterThan(initial);
    t.update({ resize: 'vertical' });
    expect(t.textarea.style.getPropertyValue('block-size')).toBe('');
  });
});

describe('Textarea: validation', () => {
  it('shows messages only after blur by default, then live', async () => {
    const t = mount({ required: true });
    expect(t.validity).toMatchObject({ valid: false, error: 'value-missing' });
    expect(t.textarea.hasAttribute('aria-invalid')).toBe(false);
    await userEvent.click(t.textarea);
    await userEvent.tab();
    expect(errorText(t)).toBe('This field is required.');
    expect(t.textarea.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(t)).toContain('This field is required.');
    await userEvent.click(t.textarea);
    await userEvent.keyboard('Fine');
    expect(t.validity.valid).toBe(true);
    expect(t.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
  });

  it('honours validationTiming from global configuration, with instance precedence', async () => {
    configureAbsoluteUI({ components: { textarea: { validationTiming: 'input' } } });
    const t = mount({ minLength: 3 });
    await userEvent.click(t.textarea);
    await userEvent.keyboard('a');
    expect(errorText(t)).toBe('Enter at least 3 characters.');
    const s = mount({ minLength: 3, validationTiming: 'submit' });
    await userEvent.click(s.textarea);
    await userEvent.keyboard('a');
    await userEvent.tab();
    expect(s.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
  });

  it('validates length in code points and runs the consumer validator after built-ins', () => {
    const long = mount({ maxLength: 3, value: 'abcd' });
    expect(long.reportValidity()).toBe(false);
    expect(errorText(long)).toBe('Enter 3 characters or fewer.');
    expect(mount({ maxLength: 2, value: '😀😀' }).reportValidity()).toBe(true);
    const validate = vi.fn((v: string) => (v.includes('http') ? 'Links are not allowed.' : null));
    const t = mount({ validate, value: 'see http://x' });
    expect(t.reportValidity()).toBe(false);
    expect(errorText(t)).toBe('Links are not allowed.');
    expect(t.validity.error).toBe('custom');
  });

  it('clears an external custom error when the user edits the value', async () => {
    const t = mount({ value: 'x' });
    t.setCustomError('Rejected by the server.');
    t.reportValidity();
    expect(errorText(t)).toBe('Rejected by the server.');
    await userEvent.click(t.textarea);
    await userEvent.keyboard('y');
    expect(t.validity.valid).toBe(true);
  });

  it('localizes validation messages through the message catalog', () => {
    registerMessages('validation', 'de', { valueMissing: 'Dieses Feld ist erforderlich.' });
    const t = mount({ required: true, locale: 'de-DE' });
    t.reportValidity();
    expect(errorText(t)).toBe('Dieses Feld ist erforderlich.');
  });
});

describe('Textarea: counter and events', () => {
  it('shows remaining and over-limit counts without truncating input', async () => {
    const t = mount({ maxLength: 5, showCounter: true });
    const counter = t.host.querySelector<HTMLElement>('.aui-field__counter')!;
    expect(counter.textContent).toBe('5 characters remaining');
    expect(describedBy(t)).toEqual(['5 characters remaining']);
    await userEvent.click(t.textarea);
    await userEvent.keyboard('abc{Enter}defg');
    expect(t.value).toBe('abc\ndefg');
    expect(counter.textContent).toBe('3 characters too many');
    expect(counter.classList.contains('aui-field__counter--over')).toBe(true);
  });

  it('keeps Enter as a newline and emits bubbling aui-input and aui-change events', async () => {
    const t = mount();
    const inputs: TextareaValueDetail[] = [];
    const changes: TextareaValueDetail[] = [];
    document.body.addEventListener('aui-input', (e) => inputs.push((e as CustomEvent<TextareaValueDetail>).detail));
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<TextareaValueDetail>).detail));
    await userEvent.click(t.textarea);
    await userEvent.keyboard('a{Enter}');
    await userEvent.tab();
    expect(inputs.map((d) => d.value)).toEqual(['a', 'a\n']);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ value: 'a\n', validity: { valid: true } });
    t.setValue('programmatic');
    expect(inputs).toHaveLength(2);
  });
});

describe('Textarea: form control contract', () => {
  it('registers with the form-control registry and supports reset/dirty/touched', async () => {
    const t = mount({ name: 'notes', value: 'Hi' });
    expect(getFormControl(t.host)).toBe(t);
    expect(t.dirty).toBe(false);
    await userEvent.click(t.textarea);
    await userEvent.keyboard('{End}!');
    await userEvent.tab();
    expect(t.dirty).toBe(true);
    expect(t.touched).toBe(true);
    expect(t.getFormValue()).toBe('Hi!');
    t.reset();
    expect(t.value).toBe('Hi');
    expect(t.dirty).toBe(false);
    expect(t.touched).toBe(false);
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const t = mount({ resize: 'auto' });
    const host = t.host;
    t.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
