import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Fieldset, fieldsetConfig, type FieldsetOptions } from '@absoluteui/components/fieldset';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function addressFieldset(): HTMLFieldSetElement {
  const fieldset = document.createElement('fieldset');
  fieldset.setAttribute('aria-describedby', 'page-hint');
  for (const name of ['street', 'city']) {
    const input = document.createElement('input');
    input.name = name;
    input.setAttribute('aria-label', name);
    fieldset.append(input);
  }
  document.body.append(fieldset);
  return fieldset;
}

function mount(options: Partial<FieldsetOptions> = {}): Fieldset {
  return Fieldset.enhance(addressFieldset(), { legend: 'Address', ...options });
}

describe('Fieldset', () => {
  it('adds the legend first and keeps the controls in place', () => {
    const f = mount({ description: 'Where we send the invoice' });
    const el = f.element;
    expect(el.classList).toContain('aui-fieldset');
    expect(el.firstElementChild).toBe(f.legend);
    expect(f.legend.localName).toBe('legend');
    expect(f.legend.textContent).toBe('Address*');
    expect(el.querySelectorAll('input')).toHaveLength(2);
    const description = el.querySelector('.aui-field__description')!;
    expect(description.textContent).toBe('Where we send the invoice');
    expect(el.getAttribute('aria-describedby')).toBe(`${description.id} page-hint`);
  });

  it('marks required visually and in the spoken legend', () => {
    const f = mount({ required: true });
    const star = f.legend.querySelector<HTMLElement>('.aui-field__required')!;
    expect(star.hidden).toBe(false);
    expect(star.getAttribute('aria-hidden')).toBe('true');
    expect(f.legend.textContent).toBe('Address* (required)');
    f.update({ required: false });
    expect(f.legend.textContent).toBe('Address*');
    expect(star.hidden).toBe(true);
  });

  it('shows a group error referenced by aria-describedby', () => {
    const f = mount();
    f.update({ error: 'Enter a street and a city' });
    const error = f.element.querySelector<HTMLElement>('.aui-field__error')!;
    expect(error.hidden).toBe(false);
    expect(error.textContent).toBe('Enter a street and a city');
    expect(f.element.classList).toContain('aui-fieldset--invalid');
    expect(f.element.getAttribute('aria-describedby')!.split(' ')).toContain(error.id);
    f.update({ error: null });
    expect(error.hidden).toBe(true);
    expect(f.element.getAttribute('aria-describedby')).toBe('page-hint');
  });

  it('sets native disabled only when the option is given; focus() finds the first enabled control', () => {
    const f = mount();
    expect(f.element.disabled).toBe(false);
    f.update({ disabled: true });
    expect(f.element.disabled).toBe(true);
    f.update({ disabled: false });
    const [street, city] = f.element.querySelectorAll('input');
    street!.disabled = true;
    f.focus();
    expect(document.activeElement).toBe(city);
  });

  it('replaces a page legend while enhanced and restores it on destroy', () => {
    const el = addressFieldset();
    const own = document.createElement('legend');
    own.textContent = 'Old';
    el.prepend(own);
    const f = Fieldset.enhance(el, { legend: 'Address', error: 'Required' });
    expect(el.querySelectorAll('legend')).toHaveLength(1);
    f.destroy();
    expect(el.firstElementChild).toBe(own);
    expect(el.querySelector('.aui-field__label, .aui-field__description, .aui-field__error')).toBeNull();
    expect(el.className).toBe('');
    expect(el.getAttribute('aria-describedby')).toBe('page-hint');
    expect(el.querySelectorAll('input')).toHaveLength(2);
  });

  it('localizes the required text and follows configuration', () => {
    const f = mount({ required: true });
    registerMessages('fieldset', 'de', { required: '(Pflichtfeld)' });
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(f.legend.textContent).toBe('Address* (Pflichtfeld)');
    expect([...fieldsetConfig.optionNames]).toEqual(['locale']);
  });

  it('validates the host and options before touching the fieldset', () => {
    expect(() => Fieldset.enhance(document.createElement('div') as unknown as HTMLFieldSetElement, { legend: 'x' })).toThrow(AbsoluteUIError);
    const el = addressFieldset();
    const bad: unknown[] = [{ legend: '' }, { legend: 'x', required: 'yes' }, { legend: 'x', error: 42 }, { legend: 'x', icons: { error: 'nope' } }];
    for (const options of bad) expect(() => Fieldset.enhance(el, options as FieldsetOptions)).toThrow(AbsoluteUIError);
    expect(el.className).toBe('');
    expect(el.querySelectorAll('legend')).toHaveLength(0);
    const f = Fieldset.enhance(el, { legend: 'Address' });
    expect(() => {
      f.update({ legend: ' ' });
    }).toThrow(AbsoluteUIError);
    expect(f.legend.textContent).toBe('Address*');
  });
});
