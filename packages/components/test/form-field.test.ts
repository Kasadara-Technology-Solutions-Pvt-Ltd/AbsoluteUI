import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { FormField, type FormFieldControl, type FormFieldOptions } from '@absoluteui/components/form-field';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(control: FormFieldControl, options: Partial<FormFieldOptions> = {}): FormField {
  const host = document.createElement('div');
  document.body.append(host);
  return FormField.create(host, { label: 'Field', control, ...options });
}

function input(attrs: Record<string, string> = {}): HTMLInputElement {
  const el = document.createElement('input');
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  return el;
}

const errorText = (f: FormField): string => f.host.querySelector('.aui-field__error')!.textContent;

describe('FormField', () => {
  it('labels a consumer-owned native control and keeps existing aria-describedby ids', () => {
    const hint = document.createElement('p');
    hint.id = 'external-hint';
    document.body.append(hint);
    const el = input({ 'aria-describedby': 'external-hint', name: 'zip' });
    const f = mount(el, { description: 'Five digits', required: true });
    expect(f.control).toBe(el);
    expect(f.host.querySelector('label')!.htmlFor).toBe(el.id);
    expect(el.required).toBe(true);
    expect(el.getAttribute('aria-describedby')!.split(' ')).toContain('external-hint');
    expect(getFormControl(f.host)).toBe(f);
  });

  it('maps native ValidityState to localized AbsoluteUI messages', () => {
    const cases: [Record<string, string>, string, string][] = [
      [{ type: 'email' }, 'nope', 'Enter a valid email address.'],
      [{ type: 'number', min: '5' }, '3', 'Enter a value of 5 or more.'],
      [{ type: 'number', max: '5' }, '9', 'Enter a value of 5 or less.'],
      [{ type: 'number', step: '0.5' }, '1.2', 'Enter a valid value. The nearest valid values are 1 and 1.5.'],
      [{ pattern: '[0-9]{5}' }, '12', 'Enter a value in the requested format.'],
      [{ minlength: '3' }, 'ab', 'Enter at least 3 characters.'],
    ];
    for (const [attrs, value, message] of cases) {
      const el = input(attrs);
      el.value = value;
      const f = mount(el);
      expect(f.reportValidity()).toBe(false);
      expect(errorText(f)).toBe(message);
      f.destroy();
    }
  });

  it('suppresses native validation bubbles and follows blur timing', async () => {
    const el = input();
    const f = mount(el, { required: true });
    const invalid = new Event('invalid', { cancelable: true });
    el.dispatchEvent(invalid);
    expect(invalid.defaultPrevented).toBe(true);
    await userEvent.click(el);
    expect(el.hasAttribute('aria-invalid')).toBe(false);
    await userEvent.tab();
    expect(errorText(f)).toBe('This field is required.');
    expect(el.getAttribute('aria-invalid')).toBe('true');
  });

  it('supports textarea and select (single and multiple)', () => {
    const select = document.createElement('select');
    select.multiple = true;
    for (const v of ['a', 'b', 'c']) select.add(new Option(v.toUpperCase(), v, false, v === 'b'));
    const f = mount(select, { label: 'Letters' });
    expect(f.getFormValue()).toEqual(['b']);
    select.options[0]!.selected = true;
    expect(f.dirty).toBe(true);
    f.reset();
    expect(f.getFormValue()).toEqual(['b']);

    const required = document.createElement('select');
    required.add(new Option('Choose', ''));
    required.add(new Option('One', '1'));
    const r = mount(required, { required: true });
    r.reportValidity();
    expect(errorText(r)).toBe('Select an option.');
    const ta = document.createElement('textarea');
    expect(mount(ta).getFormValue()).toBe('');
  });

  it('honours setCustomValidity and the value attribute as step base (regression)', () => {
    const el = input({ type: 'number', step: '2', value: '1' });
    el.value = '4';
    const f = mount(el);
    expect(f.reportValidity()).toBe(false);
    expect(errorText(f)).toBe('Enter a valid value. The nearest valid values are 3 and 5.');
    el.value = '5';
    el.setCustomValidity('Odd numbers are reserved.');
    f.refresh();
    expect(errorText(f)).toBe('Odd numbers are reserved.');
  });

  it('rejects unsupported controls and missing labels', () => {
    expect(() => mount(input({ type: 'checkbox' }))).toThrow(AbsoluteUIError);
    expect(() => mount(input({ type: 'date' }))).toThrow(/Date Input/);
    expect(() => mount(input(), { label: '' })).toThrow(/label/);
  });

  it('destroy removes chrome but leaves the native control in place', () => {
    const el = input({ 'aria-describedby': 'keep' });
    const f = mount(el, { description: 'Help' });
    f.destroy();
    expect(f.host.children.length).toBe(1);
    expect(f.host.firstElementChild).toBe(el);
    expect(el.getAttribute('aria-describedby')).toBe('keep');
    expect(getFormControl(f.host)).toBeUndefined();
  });
});
