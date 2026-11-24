import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Mask, MASK_PRESETS, MaskedInput, maskedInputConfig, type MaskedInputOptions, type MaskedInputValueDetail } from '@absoluteui/components/masked-input';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<MaskedInputOptions> = {}): MaskedInput {
  const host = document.createElement('div');
  document.body.append(host);
  return MaskedInput.create(host, { label: 'Phone', mask: '(999) 999-9999', ...options });
}

describe('Mask', () => {
  it('formats partially and with a template, and maps carets', () => {
    const mask = new Mask('(999) 999-9999');
    expect(mask.capacity).toBe(10);
    expect(mask.format('5550', null)).toBe('(555) 0');
    expect(mask.format('5550', '_')).toBe('(555) 0__-____');
    expect(mask.format('', null)).toBe('');
    expect(mask.positionOf(3)).toBe(6);
    expect(mask.rawIndexAt(6, 4)).toBe(3);
    expect(mask.parse('(555) 010-0199')).toBe('5550100199');
  });

  it('supports escapes, letters, and custom tokens with transforms', () => {
    const mask = new Mask('\\9a-LL', { L: { pattern: /[a-z]/i, transform: (c) => c.toUpperCase() } });
    expect(mask.display).toBe('9a-LL');
    expect(mask.fit('x1yz')).toBe('xYZ');
    expect(mask.format('xYZ', null)).toBe('9x-YZ');
  });
});

describe('MaskedInput', () => {
  it('formats typed digits, ignores non-fitting characters, and keeps the raw value', async () => {
    const m = mount();
    const inputs: MaskedInputValueDetail[] = [];
    m.host.addEventListener('aui-input', (e) => inputs.push((e as CustomEvent<MaskedInputValueDetail>).detail));
    m.input.focus();
    expect(m.input.value).toBe('(___) ___-____');
    await userEvent.keyboard('55x5(0');
    expect(m.value).toBe('5550');
    expect(m.input.value).toBe('(555) 0__-____');
    expect(m.input.selectionStart).toBe(7);
    expect(inputs.at(-1)).toMatchObject({ value: '5550', formattedValue: '(555) 0', complete: false });
  });

  it('Backspace skips literals; Delete removes the next slot character', async () => {
    const m = mount({ value: '5550100' });
    m.input.focus();
    m.input.setSelectionRange(6, 6);
    await userEvent.keyboard('{Backspace}');
    expect(m.value).toBe('550100');
    m.input.setSelectionRange(1, 1);
    await userEvent.keyboard('{Delete}');
    expect(m.value).toBe('50100');
  });

  it('replaces a selection and preserves the caret in the middle', async () => {
    const m = mount({ value: '5550100199' });
    m.input.focus();
    m.input.setSelectionRange(1, 4);
    await userEvent.keyboard('2');
    expect(m.value).toBe('20100199');
    expect(m.input.selectionStart).toBe(2);
  });

  it('paste strips separators and the literal prefix', () => {
    const m = mount({ mask: '+1 (999) 999-9999' });
    m.input.focus();
    const data = new DataTransfer();
    data.setData('text/plain', '+1 (555) 010-0199');
    m.input.dispatchEvent(new InputEvent('beforeinput', { inputType: 'insertFromPaste', dataTransfer: data, bubbles: true, cancelable: true }));
    expect(m.value).toBe('5550100199');
    expect(m.complete).toBe(true);
    expect(m.formattedValue).toBe('+1 (555) 010-0199');
  });

  it('validates incomplete and required values; minLength defines completeness', () => {
    const m = mount({ required: true });
    expect(m.reportValidity()).toBe(false);
    expect(m.validity.error).toBe('value-missing');
    m.setValue('555');
    expect(m.validity.valid).toBe(false);
    expect(m.validity.message).toContain('(999) 999-9999');
    const iban = mount({ label: 'IBAN', ...MASK_PRESETS.iban, value: 'gb82west12345698765432' });
    expect(iban.value).toBe('GB82WEST12345698765432');
    expect(iban.complete).toBe(true);
    expect(iban.formattedValue).toBe('GB82 WEST 1234 5698 7654 32');
  });

  it('runs validate with context and submits raw or formatted values', () => {
    const m = mount({ name: 'phone', value: '5550100199', validate: (v, { complete }) => (complete && v.startsWith('555') ? 'Fictional number' : null) });
    expect(m.validity.message).toBe('Fictional number');
    const hidden = m.host.querySelector<HTMLInputElement>('input[type="hidden"]');
    expect(hidden?.value).toBe('5550100199');
    m.update({ submit: 'formatted' });
    expect(hidden?.value).toBe('(555) 010-0199');
    expect(m.getFormValue()).toBe('(555) 010-0199');
  });

  it('describes the format for screen readers and shows the formatted value', () => {
    const m = mount({ example: '(555) 010-0199', value: '555' });
    const ids = (m.input.getAttribute('aria-describedby') ?? '').split(' ');
    expect(document.getElementById(ids[0] ?? '')?.textContent).toBe('Format: (999) 999-9999, for example (555) 010-0199. 9 is a digit.');
    expect(m.input.value).toBe('(555');
    expect(m.input.inputMode).toBe('numeric');
    expect(m.input.dir).toBe('ltr');
  });

  it('emits aui-change on blur when the value changed; read-only ignores edits', async () => {
    const m = mount();
    let changes = 0;
    m.host.addEventListener('aui-change', () => changes++);
    m.input.focus();
    await userEvent.keyboard('12');
    m.input.blur();
    expect(changes).toBe(1);
    expect(m.input.value).toBe('(12');
    m.update({ readOnly: true });
    m.input.focus();
    await userEvent.keyboard('3');
    expect(m.value).toBe('12');
  });

  it('honors global configuration', () => {
    configureAbsoluteUI({ components: { maskedInput: { placeholderChar: '#', showMaskOnFocus: false } } });
    const m = mount();
    expect(m.input.placeholder).toBe('(###) ###-####');
    m.input.focus();
    expect(m.input.value).toBe('');
    expect(maskedInputConfig.resolve({}).placeholderChar).toBe('#');
    expect(() => {
      configureAbsoluteUI({ components: { maskedInput: { placeholderChar: '##' } } });
    }).toThrow(AbsoluteUIError);
  });

  it('rejects invalid options before touching the host and keeps state on a failed update', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => MaskedInput.create(host, { label: 'x', mask: '---' })).toThrow(AbsoluteUIError);
    expect(() => MaskedInput.create(host, { label: '', mask: '999' })).toThrow(AbsoluteUIError);
    expect(() => MaskedInput.create(host, { label: 'x', mask: '999', minLength: 4 })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const m = mount({ value: '555' });
    expect(() => {
      m.update({ mask: '' });
    }).toThrow(AbsoluteUIError);
    expect(m.value).toBe('555');
  });

  it('resets, registers with Form, and destroys cleanly', async () => {
    const m = mount({ value: '1' });
    m.input.focus();
    await userEvent.keyboard('2');
    expect(m.dirty).toBe(true);
    m.reset();
    expect(m.value).toBe('1');
    expect(getFormControl(m.host)).toBe(m);
    m.destroy();
    expect(m.host.childElementCount).toBe(0);
  });
});
