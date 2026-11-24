import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { CheckboxGroup, type CheckboxGroupChangeDetail, type CheckboxGroupOptions } from '@absoluteui/components/checkbox-group';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const TOPPINGS = [
  { value: 'cheese', label: 'Cheese' },
  { value: 'olives', label: 'Olives', description: 'Contains pits' },
  { value: 'basil', label: 'Basil' },
  { value: 'chili', label: 'Chili', disabled: true },
];

function mount(options: Partial<CheckboxGroupOptions> = {}): CheckboxGroup {
  const host = document.createElement('div');
  document.body.append(host);
  return CheckboxGroup.create(host, { label: 'Toppings', options: TOPPINGS, ...options });
}

const errorText = (g: CheckboxGroup): string => g.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const ids = (el: Element): string[] => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);
const legend = (g: CheckboxGroup): HTMLLegendElement => g.fieldset.querySelector('legend')!;

describe('CheckboxGroup: semantics', () => {
  it('groups native checkboxes in a fieldset named by its legend', () => {
    const g = mount({ name: 'toppings', description: 'Choose any' });
    expect(g.fieldset.tagName).toBe('FIELDSET');
    expect(g.fieldset.hasAttribute('role')).toBe(false);
    expect(legend(g).textContent).toBe('Toppings*');
    expect(g.inputs.map((i) => i.type)).toEqual(['checkbox', 'checkbox', 'checkbox', 'checkbox']);
    expect(g.inputs.map((i) => i.name)).toEqual(['toppings', 'toppings', 'toppings', 'toppings']);
    expect(g.inputs.map((i) => i.value)).toEqual(['cheese', 'olives', 'basil', 'chili']);
    for (const input of g.inputs) expect(document.querySelector<HTMLLabelElement>(`label[for="${input.id}"]`)).not.toBeNull();
    expect(ids(g.fieldset)).toEqual(['Choose any']);
    expect(ids(g.inputs[1]!)).toEqual(['Contains pits']);
    expect(g.inputs[3]!.disabled).toBe(true);
  });

  it('speaks the required state with the legend, since checkboxes cannot carry aria-required', () => {
    const g = mount({ required: true });
    expect(legend(g).querySelector('.aui-field__required')!.getAttribute('aria-hidden')).toBe('true');
    expect(legend(g).querySelector('.aui-visually-hidden')!.textContent).toBe(' (required)');
    g.update({ required: false });
    expect(legend(g).querySelector('.aui-visually-hidden')!.textContent).toBe('');
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    const bad: Partial<CheckboxGroupOptions>[] = [
      { label: '' },
      { options: [] },
      { options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'A2' }] },
      { value: ['nope'] },
      { minSelected: 3, maxSelected: 2 },
      { maxSelected: 0 },
      { orientation: 'diagonal' as unknown as 'vertical' },
    ];
    for (const b of bad) expect(() => CheckboxGroup.create(host, { label: 'Toppings', options: TOPPINGS, ...b })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });

  it('applies orientation and disables every checkbox through the fieldset', () => {
    const g = mount({ orientation: 'horizontal', disabled: true });
    expect(g.host.querySelector('.aui-checkbox-group__options--horizontal')).not.toBeNull();
    expect(g.fieldset.disabled).toBe(true);
    expect(g.inputs.every((i) => i.matches(':disabled'))).toBe(true);
  });
});

describe('CheckboxGroup: keyboard and pointer', () => {
  it('tabs through each enabled checkbox and toggles with Space', async () => {
    const g = mount();
    await userEvent.tab();
    expect(document.activeElement).toBe(g.inputs[0]);
    await userEvent.keyboard(' ');
    await userEvent.tab();
    await userEvent.tab();
    expect(document.activeElement).toBe(g.inputs[2]);
    await userEvent.keyboard(' ');
    expect(g.value).toEqual(['cheese', 'basil']);
    await userEvent.tab();
    expect(document.activeElement).toBe(document.body);
  });

  it('toggles when an option label is clicked', async () => {
    const g = mount();
    await userEvent.click(document.querySelector<HTMLLabelElement>(`label[for="${g.inputs[1]!.id}"]`)!);
    expect(g.value).toEqual(['olives']);
  });
});

describe('CheckboxGroup: validation', () => {
  it('requires at least one selection and marks each checkbox invalid, not the group', async () => {
    const g = mount({ required: true });
    expect(g.validity).toMatchObject({ valid: false, error: 'value-missing' });
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(errorText(g)).toBe('Select an option.');
    expect(ids(g.fieldset)).toContain('Select an option.');
    expect(g.fieldset.hasAttribute('aria-invalid')).toBe(false);
    expect(g.inputs.every((i) => i.getAttribute('aria-invalid') === 'true')).toBe(true);
    await userEvent.click(g.inputs[0]!);
    expect(g.validity.valid).toBe(true);
    expect(g.inputs.some((i) => i.hasAttribute('aria-invalid'))).toBe(false);
  });

  it('enforces minSelected and maxSelected with localized counts', () => {
    const g = mount({ minSelected: 2, maxSelected: 2, value: ['cheese'] });
    expect(g.reportValidity()).toBe(false);
    expect(errorText(g)).toBe('Select at least 2 options.');
    g.setValue(['cheese', 'olives', 'basil']);
    expect(errorText(g)).toBe('Select 2 options or fewer.');
    g.setValue(['cheese', 'basil']);
    expect(g.validity.valid).toBe(true);
    g.setValue([]);
    expect(g.validity.valid).toBe(true);
  });

  it('runs the consumer validator and honours global validationTiming', async () => {
    configureAbsoluteUI({ components: { checkboxGroup: { validationTiming: 'input' } } });
    const g = mount({ validate: (v) => (v.includes('olives') && v.includes('basil') ? 'Pick olives or basil, not both.' : null), value: ['olives'] });
    await userEvent.click(g.inputs[2]!);
    expect(errorText(g)).toBe('Pick olives or basil, not both.');
    expect(g.validity.error).toBe('custom');
  });

  it('clears an external custom error when the selection changes', async () => {
    const g = mount();
    g.setCustomError('Not available in your region.');
    g.reportValidity();
    expect(errorText(g)).toBe('Not available in your region.');
    await userEvent.click(g.inputs[0]!);
    expect(g.validity.valid).toBe(true);
  });
});

describe('CheckboxGroup: events and form control contract', () => {
  it('emits a bubbling aui-change with the selected values; programmatic changes emit nothing', async () => {
    const g = mount();
    const changes: CheckboxGroupChangeDetail[] = [];
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<CheckboxGroupChangeDetail>).detail));
    await userEvent.click(g.inputs[2]!);
    await userEvent.click(g.inputs[0]!);
    expect(changes.map((d) => d.value)).toEqual([['basil'], ['cheese', 'basil']]);
    expect(changes[1]!.validity.valid).toBe(true);
    g.setValue([]);
    g.update({ value: ['olives'] });
    expect(changes).toHaveLength(2);
  });

  it('serializes a string array and supports reset/dirty/touched', async () => {
    const g = mount({ name: 'toppings', value: ['basil'] });
    expect(getFormControl(g.host)).toBe(g);
    expect(g.getFormValue()).toEqual(['basil']);
    expect(g.dirty).toBe(false);
    await userEvent.click(g.inputs[0]!);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(g.getFormValue()).toEqual(['cheese', 'basil']);
    expect(g.dirty).toBe(true);
    expect(g.touched).toBe(true);
    g.reset();
    expect(g.value).toEqual(['basil']);
    expect(g.dirty).toBe(false);
    expect(g.touched).toBe(false);
  });

  it('keeps the selection that still exists when options change', () => {
    const g = mount({ value: ['cheese', 'olives'] });
    g.update({ options: [{ value: 'olives', label: 'Olives' }, { value: 'ham', label: 'Ham' }] });
    expect(g.value).toEqual(['olives']);
    expect(g.inputs).toHaveLength(2);
  });

  it('focus() moves to the first enabled checkbox', () => {
    const g = mount({ options: [{ value: 'a', label: 'A', disabled: true }, { value: 'b', label: 'B' }] });
    g.focus();
    expect(document.activeElement).toBe(g.inputs[1]);
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const g = mount();
    const host = g.host;
    g.destroy();
    expect(host.childElementCount).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
