import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { NumberInput, type NumberInputInputDetail, type NumberInputOptions, type NumberInputValueDetail } from '@absoluteui/components/number-input';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<NumberInputOptions> = {}, parent: HTMLElement = document.body): NumberInput {
  const host = document.createElement('div');
  parent.append(host);
  return NumberInput.create(host, { label: 'Amount', ...options });
}

const errorText = (n: NumberInput): string => n.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const steppers = (n: NumberInput): { inc: HTMLButtonElement; dec: HTMLButtonElement } => ({
  inc: n.host.querySelector<HTMLButtonElement>('.aui-number-input__increment')!,
  dec: n.host.querySelector<HTMLButtonElement>('.aui-number-input__decrement')!,
});

/** Type text as the user would (fill supports non-ASCII digits), then leave the field. */
async function typeAndBlur(n: NumberInput, text: string): Promise<void> {
  await userEvent.fill(n.input, text);
  await userEvent.tab();
}

describe('NumberInput: semantics', () => {
  it('renders a labelled text input with the spinbutton role and value attributes', () => {
    const n = mount({ value: 1234.5, min: 0, max: 5000, step: 0.5, name: 'amount', description: 'In euros' });
    const label = n.host.querySelector('label')!;
    expect(label.htmlFor).toBe(n.input.id);
    expect(n.input.type).toBe('text');
    expect(n.input.getAttribute('role')).toBe('spinbutton');
    expect(n.input.inputMode).toBe('decimal');
    expect(n.input.value).toBe('1,234.5');
    expect(n.input.getAttribute('aria-valuenow')).toBe('1234.5');
    expect(n.input.getAttribute('aria-valuetext')).toBe('1,234.5');
    expect(n.input.getAttribute('aria-valuemin')).toBe('0');
    expect(n.input.getAttribute('aria-valuemax')).toBe('5000');
    expect(document.getElementById(n.input.getAttribute('aria-describedby')!)!.textContent).toBe('In euros');
    // Only the hidden input is named; it carries the canonical value.
    expect(n.input.hasAttribute('name')).toBe(false);
    expect(n.formInput.type).toBe('hidden');
    expect(n.formInput.name).toBe('amount');
    expect(n.formInput.value).toBe('1234.5');
  });

  it('uses the numeric keyboard hint for integer formats and omits value attributes when empty', () => {
    const n = mount({ format: { maximumFractionDigits: 0 } });
    expect(n.input.inputMode).toBe('numeric');
    expect(n.input.hasAttribute('aria-valuenow')).toBe(false);
    expect(n.input.hasAttribute('aria-valuetext')).toBe(false);
    expect(n.formInput.value).toBe('');
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => NumberInput.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => NumberInput.create(host, { label: 'x', min: 5, max: 1 })).toThrow(/min/);
    expect(() => NumberInput.create(host, { label: 'x', step: 0 })).toThrow(/step/);
    expect(() => NumberInput.create(host, { label: 'x', value: Number.NaN })).toThrow(/value/);
    expect(() => NumberInput.create(host, { label: 'x', format: { style: 'currency' } })).toThrow(/currency/);
    expect(() => NumberInput.create(host, { label: 'x', format: { style: 'unit', unit: 'not-a-unit' } })).toThrow(/format/);
    expect(() => NumberInput.create(host, { label: 'x', format: { minimumFractionDigits: 3, maximumFractionDigits: 1 } })).toThrow(/minimumFractionDigits/);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });
});

describe('NumberInput: locale parsing and formatting', () => {
  it('en-US: keeps raw text while typing and reformats on blur', async () => {
    const n = mount({ step: null });
    const inputs: NumberInputInputDetail[] = [];
    n.host.addEventListener('aui-input', (e) => inputs.push((e as CustomEvent<NumberInputInputDetail>).detail));
    await userEvent.click(n.input);
    await userEvent.keyboard('1234.5');
    expect(n.input.value).toBe('1234.5');
    expect(n.value).toBe(1234.5);
    expect(inputs.at(-1)).toMatchObject({ value: 1234.5, text: '1234.5', validity: { valid: true } });
    await userEvent.tab();
    expect(n.input.value).toBe('1,234.5');
    expect(n.formInput.value).toBe('1234.5');
    await typeAndBlur(n, '1,234,567.25');
    expect(n.value).toBe(1234567.25);
  });

  it('de-DE: "1.234,5" is 1234.5 and displays with German separators', async () => {
    const n = mount({ locale: 'de-DE', step: null });
    await typeAndBlur(n, '1.234,5');
    expect(n.value).toBe(1234.5);
    expect(n.input.value).toBe('1.234,5');
    expect(n.formInput.value).toBe('1234.5');
    n.setValue(-0.75);
    expect(n.input.value).toBe('-0,75');
    // Strict to the locale: a lone '.' is a group separator in German.
    await typeAndBlur(n, '1.5');
    expect(n.value).toBe(15);
  });

  it('a failed update keeps the previous options and format', () => {
    const n = mount({ value: 2 });
    expect(() => { n.update({ format: { style: 'unit', unit: 'not-a-unit' } }); }).toThrow(AbsoluteUIError);
    expect(n.options.format).toBeUndefined();
    n.setValue(3);
    expect(n.input.value).toBe('3');
  });

  it('ar-EG: accepts Arabic-Indic digits and separators, and ASCII digits', async () => {
    const n = mount({ locale: 'ar-EG', step: null });
    await typeAndBlur(n, '١٬٢٣٤٫٥');
    expect(n.value).toBe(1234.5);
    expect(n.input.value).toBe(new Intl.NumberFormat('ar-EG', { maximumFractionDigits: 20 }).format(1234.5));
    expect(n.input.value).toContain('١');
    await typeAndBlur(n, '42');
    expect(n.value).toBe(42);
  });

  it('accepts minus sign variants (U+2212) and a leading plus', async () => {
    const n = mount({ step: null });
    await typeAndBlur(n, '−5.5');
    expect(n.value).toBe(-5.5);
    await typeAndBlur(n, '+3');
    expect(n.value).toBe(3);
  });

  it('percent: typed "15" and "15%" are both 0.15', async () => {
    const n = mount({ format: { style: 'percent' } });
    await typeAndBlur(n, '15');
    expect(n.value).toBe(0.15);
    expect(n.input.value).toBe('15%');
    await typeAndBlur(n, '7.5 %');
    expect(n.value).toBe(0.075);
    expect(n.validity.valid).toBe(false);
    expect(n.validity.error).toBe('step-mismatch');
    await typeAndBlur(n, '15%');
    expect(n.value).toBe(0.15);
    expect(n.validity.valid).toBe(true);
  });

  it('currency: strips symbols and codes, rounds to the configured fraction digits on commit', async () => {
    const n = mount({ step: null, format: { style: 'currency', currency: 'USD', maximumFractionDigits: 2 } });
    await typeAndBlur(n, '$1,234.505');
    expect(n.value).toBe(1234.51);
    expect(n.input.value).toBe('$1,234.51');
    await typeAndBlur(n, 'USD 5');
    expect(n.value).toBe(5);
    expect(n.input.value).toBe('$5.00');
  });

  it('unparseable text is bad-input: value null, text kept, message shown on blur', async () => {
    const n = mount({ name: 'qty' });
    await typeAndBlur(n, '12abc');
    expect(n.value).toBeNull();
    expect(n.input.value).toBe('12abc');
    expect(n.validity).toMatchObject({ valid: false, error: 'bad-input' });
    expect(errorText(n)).toBe('Enter a number.');
    expect(n.input.getAttribute('aria-invalid')).toBe('true');
    expect(n.formInput.value).toBe('');
    expect(n.getFormValue()).toBeNull();
    await typeAndBlur(n, '1,2,3.4.5');
    expect(n.validity.error).toBe('bad-input');
  });
});

describe('NumberInput: validation', () => {
  it('formats range and step parameters in the locale', () => {
    const de = mount({ locale: 'de-DE', min: 1000, value: 5 });
    de.reportValidity();
    expect(errorText(de)).toBe('Enter a value of 1.000 or more.');
    const over = mount({ max: 2500, value: 3000 });
    over.reportValidity();
    expect(errorText(over)).toBe('Enter a value of 2,500 or less.');
    const step = mount({ step: 0.5, value: 1.3 });
    step.reportValidity();
    expect(step.validity.error).toBe('step-mismatch');
    expect(errorText(step)).toBe('Enter a valid value. The nearest valid values are 1 and 1.5.');
  });

  it('value-missing, consumer validator, and localized messages', () => {
    const req = mount({ required: true });
    expect(req.reportValidity()).toBe(false);
    expect(errorText(req)).toBe('This field is required.');
    const odd = mount({ value: 3, validate: (v) => (v !== null && v % 2 === 1 ? 'Enter an even number.' : null) });
    expect(odd.reportValidity()).toBe(false);
    expect(odd.validity.error).toBe('custom');
    registerMessages('validation', 'de', { badInput: 'Geben Sie eine Zahl ein.' });
    const de = mount({ locale: 'de-DE' });
    de.input.value = 'x';
    de.input.dispatchEvent(new Event('input'));
    de.reportValidity();
    expect(errorText(de)).toBe('Geben Sie eine Zahl ein.');
  });
});

describe('NumberInput: keyboard stepping', () => {
  it('ArrowUp/ArrowDown step; from empty start at min ?? 0', async () => {
    const n = mount();
    await userEvent.click(n.input);
    await userEvent.keyboard('{ArrowUp}');
    expect(n.value).toBe(0);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(n.value).toBe(2);
    await userEvent.keyboard('{ArrowDown}');
    expect(n.value).toBe(1);
    expect(n.input.value).toBe('1');
    const m = mount({ min: 5 });
    await userEvent.click(m.input);
    await userEvent.keyboard('{ArrowDown}');
    expect(m.value).toBe(5);
  });

  it('avoids float drift and snaps off-grid values in the step direction', async () => {
    const n = mount({ step: 0.1, value: 0.2 });
    await userEvent.click(n.input);
    await userEvent.keyboard('{ArrowUp}');
    expect(n.value).toBe(0.3);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(n.value).toBe(1);
    const s = mount({ step: 5, min: 1, value: 8 });
    await userEvent.click(s.input);
    await userEvent.keyboard('{ArrowUp}');
    expect(s.value).toBe(11);
    s.setValue(8);
    await userEvent.keyboard('{ArrowDown}');
    expect(s.value).toBe(6);
  });

  it('PageUp/PageDown step by ten; Home/End go to min/max; stepping clamps to the grid inside [min, max]', async () => {
    const n = mount({ min: 0, max: 47, step: 5, value: 10 });
    await userEvent.click(n.input);
    await userEvent.keyboard('{PageUp}');
    expect(n.value).toBe(45);
    await userEvent.keyboard('{ArrowUp}');
    expect(n.value).toBe(45);
    await userEvent.keyboard('{Home}');
    expect(n.value).toBe(0);
    await userEvent.keyboard('{PageDown}');
    expect(n.value).toBe(0);
    await userEvent.keyboard('{End}');
    expect(n.value).toBe(45);
  });

  it('Home/End without bounds keep native caret movement; read-only blocks stepping', async () => {
    const n = mount({ value: 12 });
    await userEvent.click(n.input);
    await userEvent.keyboard('{Home}9');
    expect(n.input.value).toBe('912');
    const ro = mount({ value: 3, readOnly: true });
    await userEvent.click(ro.input);
    await userEvent.keyboard('{ArrowUp}');
    expect(ro.value).toBe(3);
  });

  it('step: null allows any value and steps by 1', async () => {
    const n = mount({ step: null, value: 1.25 });
    expect(n.validity.valid).toBe(true);
    await userEvent.click(n.input);
    await userEvent.keyboard('{ArrowUp}');
    expect(n.value).toBe(2.25);
  });
});

describe('NumberInput: steppers', () => {
  it('renders two unfocusable, labelled buttons that step and disable at the bounds', async () => {
    const n = mount({ min: 0, max: 2, value: 1 });
    const { inc, dec } = steppers(n);
    expect(inc.tabIndex).toBe(-1);
    expect(dec.tabIndex).toBe(-1);
    expect(inc.getAttribute('aria-label')).toBe('Increase');
    expect(dec.getAttribute('aria-label')).toBe('Decrease');
    expect(inc.getAttribute('aria-controls')).toBe(n.input.id);
    await userEvent.click(inc);
    expect(n.value).toBe(2);
    expect(inc.disabled).toBe(true);
    await userEvent.click(dec);
    await userEvent.click(dec);
    expect(n.value).toBe(0);
    expect(dec.disabled).toBe(true);
  });

  it('localizes labels and honours showSteppers from global config (instance wins)', () => {
    registerMessages('numberInput', 'de', { increase: 'Erhöhen', decrease: 'Verringern' });
    expect(steppers(mount({ locale: 'de-DE' })).inc.getAttribute('aria-label')).toBe('Erhöhen');
    configureAbsoluteUI({ components: { numberInput: { showSteppers: false } } });
    const n = mount();
    expect(n.host.querySelector('.aui-number-input__stepper')).toBeNull();
    expect(mount({ showSteppers: true }).host.querySelectorAll('.aui-number-input__stepper')).toHaveLength(2);
    resetAbsoluteUIConfig();
    expect(n.host.querySelectorAll('.aui-number-input__stepper')).toHaveLength(2);
  });

  it('disables the steppers when the input is disabled', () => {
    const { inc, dec } = steppers(mount({ disabled: true }));
    expect(inc.disabled && dec.disabled).toBe(true);
  });
});

describe('NumberInput: events', () => {
  it('aui-change fires on commit (blur, Enter, stepping) with the value; not for programmatic changes', async () => {
    const n = mount();
    const changes: NumberInputValueDetail[] = [];
    const inputs: NumberInputInputDetail[] = [];
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<NumberInputValueDetail>).detail));
    document.body.addEventListener('aui-input', (e) => inputs.push((e as CustomEvent<NumberInputInputDetail>).detail));
    await userEvent.click(n.input);
    await userEvent.keyboard('42{Enter}');
    expect(changes.map((c) => c.value)).toEqual([42]);
    expect(inputs.map((i) => i.text)).toEqual(['4', '42']);
    await userEvent.tab();
    expect(changes).toHaveLength(1);
    await userEvent.click(n.input);
    await userEvent.keyboard('{ArrowUp}');
    expect(changes.map((c) => c.value)).toEqual([42, 43]);
    // Stepping is input too, like a native number input (since 0.9.0).
    expect(inputs.map((i) => i.value)).toEqual([4, 42, 43]);
    n.setValue(7);
    n.reset();
    expect(changes).toHaveLength(2);
    expect(inputs).toHaveLength(3);
  });
});

describe('NumberInput: form control contract', () => {
  it('submits the canonical value natively and supports reset/dirty/touched', async () => {
    const form = document.createElement('form');
    document.body.append(form);
    const n = mount({ name: 'price', value: 10, locale: 'de-DE', step: null }, form);
    expect(getFormControl(n.host)).toBe(n);
    expect(n.dirty).toBe(false);
    await typeAndBlur(n, '1.234,5');
    expect(new FormData(form).get('price')).toBe('1234.5');
    expect([...new FormData(form).keys()]).toEqual(['price']);
    expect(n.dirty).toBe(true);
    expect(n.touched).toBe(true);
    expect(n.getFormValue()).toBe(1234.5);
    n.reset();
    expect(n.value).toBe(10);
    expect(n.input.value).toBe('10');
    expect(n.dirty).toBe(false);
    expect(n.touched).toBe(false);
    n.update({ disabled: true });
    expect(new FormData(form).has('price')).toBe(false);
  });

  it('reformats on locale change when not focused', () => {
    const n = mount({ value: 1234.5, step: null });
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(n.input.value).toBe('1.234,5');
  });

  it('destroy removes rendering, registration, and subscriptions', () => {
    const n = mount();
    const host = n.host;
    n.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});
