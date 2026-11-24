import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Checkbox, type CheckboxChangeDetail, type CheckboxOptions } from '@absoluteui/components/checkbox';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<CheckboxOptions> = {}): Checkbox {
  const host = document.createElement('div');
  document.body.append(host);
  return Checkbox.create(host, { label: 'I accept the terms', ...options });
}

const errorText = (c: Checkbox): string => c.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const describedBy = (c: Checkbox): string[] => (c.input.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);
const label = (c: Checkbox): HTMLLabelElement => c.host.querySelector('label')!;

describe('Checkbox: semantics', () => {
  it('labels a native checkbox and wires help text', () => {
    const c = mount({ description: 'You can withdraw at any time', required: true, name: 'terms', value: 'yes' });
    expect(c.input.type).toBe('checkbox');
    expect(label(c).htmlFor).toBe(c.input.id);
    expect(label(c).textContent).toBe('I accept the terms*');
    expect(label(c).querySelector('.aui-field__required')!.getAttribute('aria-hidden')).toBe('true');
    expect(c.input.required).toBe(true);
    expect(c.input.name).toBe('terms');
    expect(c.input.value).toBe('yes');
    expect(describedBy(c)).toEqual(['You can withdraw at any time']);
  });

  it('requires a label and validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Checkbox.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => Checkbox.create(host, { label: 'x', value: 1 as unknown as string })).toThrow(/value/);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });

  it('exposes the mixed state through the native indeterminate property', () => {
    const c = mount({ indeterminate: true });
    expect(c.input.indeterminate).toBe(true);
    expect(c.host.querySelector('.aui-checkbox__mark--indeterminate svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(c.host.querySelector('.aui-checkbox__mark--checked svg')).not.toBeNull();
  });

  it('visually hides the label on request while keeping the accessible name', () => {
    const c = mount({ hideLabel: true });
    expect(label(c).classList.contains('aui-visually-hidden')).toBe(true);
  });

  it('renders custom icons for the marks', () => {
    const c = mount({ icons: { checked: 'plus' } });
    c.update({ icons: { checked: 'check-circle' } });
    expect(c.host.querySelectorAll('.aui-checkbox__mark--checked .aui-icon')).toHaveLength(1);
  });
});

describe('Checkbox: keyboard and pointer', () => {
  it('toggles with Space on the focused native input', async () => {
    const c = mount();
    await userEvent.tab();
    expect(document.activeElement).toBe(c.input);
    await userEvent.keyboard(' ');
    expect(c.checked).toBe(true);
    await userEvent.keyboard(' ');
    expect(c.checked).toBe(false);
  });

  it('toggles when the label is clicked', async () => {
    const c = mount();
    await userEvent.click(label(c));
    expect(c.checked).toBe(true);
  });

  it('leaves the mixed state when the user toggles', async () => {
    const c = mount({ indeterminate: true });
    await userEvent.click(c.input);
    expect(c.indeterminate).toBe(false);
    expect(c.checked).toBe(true);
  });

  it('does not toggle when disabled', () => {
    const c = mount({ disabled: true });
    expect(c.input.disabled).toBe(true);
    // Playwright refuses to click a label of a disabled control; dispatch the click directly.
    label(c).click();
    expect(c.checked).toBe(false);
    expect(c.host.classList.contains('aui-checkbox--disabled')).toBe(true);
  });
});

describe('Checkbox: validation', () => {
  it('requires the box to be checked, showing the message after blur', async () => {
    const c = mount({ required: true });
    expect(c.validity).toMatchObject({ valid: false, error: 'value-missing' });
    expect(c.input.hasAttribute('aria-invalid')).toBe(false);
    await userEvent.tab();
    await userEvent.tab();
    expect(errorText(c)).toBe('Check this box to continue.');
    expect(c.input.getAttribute('aria-invalid')).toBe('true');
    expect(describedBy(c)).toContain('Check this box to continue.');
    await userEvent.click(c.input);
    expect(c.validity.valid).toBe(true);
    expect(c.input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('honours validationTiming from global configuration, with instance precedence', async () => {
    configureAbsoluteUI({ components: { checkbox: { validationTiming: 'submit' } } });
    const c = mount({ required: true, checked: true });
    await userEvent.click(c.input);
    expect(c.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
    c.update({ validationTiming: 'input' });
    expect(errorText(c)).toBe('Check this box to continue.');
  });

  it('runs the consumer validator and localizes built-in messages', () => {
    const validate = vi.fn((checked: boolean) => (checked ? null : 'Confirm you are over 18.'));
    const c = mount({ validate });
    expect(c.reportValidity()).toBe(false);
    expect(errorText(c)).toBe('Confirm you are over 18.');
    expect(validate).toHaveBeenLastCalledWith(false);
    registerMessages('validation', 'de', { valueMissingCheckbox: 'Bitte ankreuzen.' });
    const d = mount({ required: true, locale: 'de-DE' });
    d.reportValidity();
    expect(errorText(d)).toBe('Bitte ankreuzen.');
  });

  it('clears an external custom error when the user toggles', async () => {
    const c = mount();
    c.setCustomError('Could not save.');
    c.reportValidity();
    expect(errorText(c)).toBe('Could not save.');
    await userEvent.click(c.input);
    expect(c.validity.valid).toBe(true);
  });
});

describe('Checkbox: events and form control contract', () => {
  it('emits a bubbling aui-change with checked, value, and validity; programmatic changes emit nothing', async () => {
    const c = mount({ value: 'agree' });
    const changes: CheckboxChangeDetail[] = [];
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<CheckboxChangeDetail>).detail));
    await userEvent.click(c.input);
    expect(changes).toEqual([{ checked: true, value: 'agree', validity: { valid: true, error: null, message: '' } }]);
    c.setChecked(false);
    c.update({ checked: true });
    expect(changes).toHaveLength(1);
  });

  it('serializes value when checked and null otherwise; supports reset/dirty/touched', async () => {
    const c = mount({ name: 'news', value: 'weekly' });
    expect(getFormControl(c.host)).toBe(c);
    expect(c.getFormValue()).toBeNull();
    expect(c.dirty).toBe(false);
    await userEvent.click(c.input);
    await userEvent.tab();
    expect(c.getFormValue()).toBe('weekly');
    expect(c.dirty).toBe(true);
    expect(c.touched).toBe(true);
    c.reset();
    expect(c.checked).toBe(false);
    expect(c.dirty).toBe(false);
    expect(c.touched).toBe(false);
  });

  it('defaults the value to the native "on"', () => {
    const c = mount({ checked: true });
    expect(c.getFormValue()).toBe('on');
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const c = mount();
    const host = c.host;
    c.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-checkbox')).toBe(false);
    expect(getFormControl(host)).toBeUndefined();
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
