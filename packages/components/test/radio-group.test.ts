import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { RadioGroup, type RadioGroupChangeDetail, type RadioGroupOptions } from '@absoluteui/components/radio-group';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const PLANS = [
  { value: 'free', label: 'Free' },
  { value: 'team', label: 'Team', disabled: true },
  { value: 'pro', label: 'Pro', description: 'Billed yearly' },
  { value: 'enterprise', label: 'Enterprise' },
];

function mount(options: Partial<RadioGroupOptions> = {}): RadioGroup {
  const host = document.createElement('div');
  document.body.append(host);
  return RadioGroup.create(host, { label: 'Plan', options: PLANS, ...options });
}

const errorText = (r: RadioGroup): string => r.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const ids = (el: Element): string[] => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);

describe('RadioGroup: semantics', () => {
  it('renders a radiogroup fieldset named by its legend, with native radios sharing a generated name', () => {
    const r = mount({ description: 'Change any time' });
    expect(r.fieldset.getAttribute('role')).toBe('radiogroup');
    const legend = r.fieldset.querySelector('legend')!;
    expect(r.fieldset.getAttribute('aria-labelledby')).toBe(legend.id);
    expect(legend.textContent).toBe('Plan*');
    expect(r.inputs.map((i) => i.type)).toEqual(['radio', 'radio', 'radio', 'radio']);
    const name = r.inputs[0]!.name;
    expect(name).not.toBe('');
    expect(r.inputs.every((i) => i.name === name)).toBe(true);
    expect(r.name).toBeNull();
    expect(ids(r.fieldset)).toEqual(['Change any time']);
    expect(ids(r.inputs[2]!)).toEqual(['Billed yearly']);
    for (const input of r.inputs) expect(document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)).not.toBeNull();
  });

  it('gives separate instances separate generated names, and uses the consumer name when given', () => {
    const a = mount();
    const b = mount({ name: 'plan' });
    expect(a.inputs[0]!.name).not.toBe(b.inputs[0]!.name);
    expect(b.inputs.every((i) => i.name === 'plan')).toBe(true);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    const bad: Partial<RadioGroupOptions>[] = [
      { label: ' ' },
      { options: [] },
      { options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] },
      { value: 'missing' },
      { name: '' },
    ];
    for (const b of bad) expect(() => RadioGroup.create(host, { label: 'Plan', options: PLANS, ...b })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });

  it('exposes required with aria-required on the radiogroup and native required on radios', () => {
    const r = mount({ required: true });
    expect(r.fieldset.getAttribute('aria-required')).toBe('true');
    expect(r.inputs.every((i) => i.required)).toBe(true);
    r.update({ required: false });
    expect(r.fieldset.hasAttribute('aria-required')).toBe(false);
  });
});

describe('RadioGroup: keyboard (native roving)', () => {
  it('is one tab stop; arrow keys move and select, skipping disabled radios and wrapping', async () => {
    const r = mount();
    const after = document.createElement('button');
    after.textContent = 'Next';
    document.body.append(after);
    const changes: (string | null)[] = [];
    r.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<RadioGroupChangeDetail>).detail.value));

    await userEvent.tab();
    expect(document.activeElement).toBe(r.inputs[0]);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(r.inputs[2]);
    expect(r.value).toBe('pro');
    await userEvent.keyboard('{ArrowRight}');
    expect(r.value).toBe('enterprise');
    await userEvent.keyboard('{ArrowDown}');
    expect(r.value).toBe('free');
    await userEvent.keyboard('{ArrowUp}');
    expect(r.value).toBe('enterprise');
    expect(changes).toEqual(['pro', 'enterprise', 'free', 'enterprise']);
    await userEvent.tab();
    expect(document.activeElement).toBe(after);
    await userEvent.tab({ shift: true });
    expect(document.activeElement).toBe(r.inputs[3]);
  });

  it('selects the focused radio with Space and by clicking its label', async () => {
    const r = mount();
    await userEvent.tab();
    await userEvent.keyboard(' ');
    expect(r.value).toBe('free');
    await userEvent.click(document.querySelector<HTMLLabelElement>(`label[for="${r.inputs[2]!.id}"]`)!);
    expect(r.value).toBe('pro');
  });
});

describe('RadioGroup: validation', () => {
  it('requires a selection; aria-invalid goes on the radiogroup', async () => {
    const r = mount({ required: true });
    expect(r.validity).toMatchObject({ valid: false, error: 'value-missing' });
    await userEvent.tab();
    await userEvent.tab();
    expect(errorText(r)).toBe('Select an option.');
    expect(r.fieldset.getAttribute('aria-invalid')).toBe('true');
    expect(ids(r.fieldset)).toContain('Select an option.');
    expect(r.inputs.some((i) => i.hasAttribute('aria-invalid'))).toBe(false);
    await userEvent.click(r.inputs[0]!);
    expect(r.validity.valid).toBe(true);
    expect(r.fieldset.hasAttribute('aria-invalid')).toBe(false);
  });

  it('runs the consumer validator, localizes messages, and honours global validationTiming', () => {
    configureAbsoluteUI({ components: { radioGroup: { validationTiming: 'submit' } } });
    registerMessages('validation', 'de', { valueMissingChoice: 'Wählen Sie eine Option.' });
    const r = mount({ required: true, locale: 'de-DE' });
    r.update({ value: 'free' });
    r.setValue(null);
    expect(r.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
    r.reportValidity();
    expect(errorText(r)).toBe('Wählen Sie eine Option.');
    const v = mount({ value: 'free', validate: (value) => (value === 'free' ? 'Free is not available for teams.' : null) });
    expect(v.reportValidity()).toBe(false);
    expect(v.validity.error).toBe('custom');
  });

  it('clears an external custom error when the selection changes', async () => {
    const r = mount({ value: 'free' });
    r.setCustomError('Plan unavailable.');
    r.reportValidity();
    expect(errorText(r)).toBe('Plan unavailable.');
    await userEvent.click(r.inputs[2]!);
    expect(r.validity.valid).toBe(true);
  });
});

describe('RadioGroup: events and form control contract', () => {
  it('programmatic changes emit nothing; unknown values are rejected', () => {
    const r = mount();
    let count = 0;
    r.host.addEventListener('aui-change', () => {
      count++;
    });
    r.setValue('pro');
    r.update({ value: 'free' });
    expect(r.value).toBe('free');
    expect(count).toBe(0);
    expect(() => {
      r.setValue('gold');
    }).toThrow(AbsoluteUIError);
  });

  it('serializes string | null and supports reset/dirty/touched', async () => {
    const r = mount({ name: 'plan', value: 'pro' });
    expect(getFormControl(r.host)).toBe(r);
    expect(r.getFormValue()).toBe('pro');
    await userEvent.click(r.inputs[3]!);
    await userEvent.tab();
    expect(r.getFormValue()).toBe('enterprise');
    expect(r.dirty).toBe(true);
    expect(r.touched).toBe(true);
    r.reset();
    expect(r.value).toBe('pro');
    expect(r.dirty).toBe(false);
    expect(r.touched).toBe(false);
    r.setValue(null);
    expect(r.getFormValue()).toBeNull();
  });

  it('focus() moves to the selected radio, else the first enabled one', () => {
    const r = mount({ value: 'enterprise' });
    r.focus();
    expect(document.activeElement).toBe(r.inputs[3]);
    const s = mount({ options: [{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }] });
    s.focus();
    expect(document.activeElement).toBe(s.inputs[1]);
  });

  it('disables every radio through the fieldset', () => {
    const r = mount({ disabled: true });
    expect(r.inputs.every((i) => i.matches(':disabled'))).toBe(true);
  });

  it('keeps a selection that still exists when options change', () => {
    const r = mount({ value: 'pro' });
    r.update({ options: [{ value: 'pro', label: 'Pro' }, { value: 'max', label: 'Max' }] });
    expect(r.value).toBe('pro');
    r.update({ options: [{ value: 'max', label: 'Max' }] });
    expect(r.value).toBeNull();
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const r = mount();
    const host = r.host;
    r.destroy();
    expect(host.childElementCount).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
