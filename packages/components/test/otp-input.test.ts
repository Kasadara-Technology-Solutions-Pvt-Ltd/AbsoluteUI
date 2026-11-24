import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { OtpInput, type OtpInputOptions } from '@absoluteui/components/otp-input';
import { Form } from '@absoluteui/components/form';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<OtpInputOptions> = {}, parent: HTMLElement = document.body): OtpInput {
  const host = document.createElement('div');
  parent.append(host);
  return OtpInput.create(host, { label: 'Verification code', ...options });
}

const cells = (o: OtpInput): string[] => Array.from(o.host.querySelectorAll('.aui-otp-input__cell')).map((c) => c.textContent);
const active = (o: OtpInput): number => Array.from(o.host.querySelectorAll('.aui-otp-input__cell')).findIndex((c) => c.classList.contains('aui-otp-input__cell--active'));
const describedBy = (el: Element): string[] => (el.getAttribute('aria-describedby') ?? '').split(' ').filter(Boolean).map((id) => document.getElementById(id)!.textContent);

/** Paste through a real ClipboardEvent (the test driver cannot write to the OS clipboard). */
function paste(o: OtpInput, text: string): void {
  const data = new DataTransfer();
  data.setData('text', text);
  o.input.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
}

describe('OtpInput: semantics', () => {
  it('is one labelled input with one-time-code autofill, a length hint, and aria-hidden cells', () => {
    const o = mount({ description: 'Sent to your phone.' });
    expect(o.input.getAttribute('autocomplete')).toBe('one-time-code');
    expect(o.input.inputMode).toBe('numeric');
    expect(o.input.type).toBe('text');
    expect(o.input.dir).toBe('ltr');
    expect(o.host.querySelector('label')!.htmlFor).toBe(o.input.id);
    expect(describedBy(o.input)).toEqual(['Sent to your phone.', '6 digits']);
    expect(o.host.querySelector('.aui-otp-input__cells')!.getAttribute('aria-hidden')).toBe('true');
    expect(cells(o)).toHaveLength(6);
    expect(o.host.querySelectorAll('input')).toHaveLength(1);
    expect(getFormControl(o.host)).toBe(o);
  });

  it('validates options before rendering', () => {
    const host = document.createElement('div');
    expect(() => OtpInput.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => OtpInput.create(host, { label: 'x', length: 0 })).toThrow(/length/);
    expect(() => OtpInput.create(host, { label: 'x', groupSize: 6 })).toThrow(/groupSize/);
    expect(() => OtpInput.create(host, { label: 'x', uppercase: true })).toThrow(/uppercase/);
    expect(host.childElementCount).toBe(0);
  });

  it('renders group separators for recovery codes and masks PINs', () => {
    const o = mount({ length: 8, type: 'alphanumeric', groupSize: 4, uppercase: true, value: 'ab12cd34' });
    expect(o.value).toBe('AB12CD34');
    expect(o.host.querySelectorAll('.aui-otp-input__separator')).toHaveLength(1);
    expect(describedBy(o.input)).toEqual(['8 letters or digits']);
    const pin = mount({ length: 4, mask: true, value: '1234' });
    expect(pin.input.type).toBe('password');
    expect(cells(pin)).toEqual(['•', '•', '•', '•']);
  });
});

describe('OtpInput: typing, navigation, and paste', () => {
  it('accepts only allowed characters, shows them in cells, and follows the caret', async () => {
    const o = mount();
    await userEvent.click(o.input);
    await userEvent.keyboard('1a2-3');
    expect(o.value).toBe('123');
    expect(cells(o)).toEqual(['1', '2', '3', '', '', '']);
    expect(active(o)).toBe(3);
    await userEvent.keyboard('{ArrowLeft}{ArrowLeft}');
    expect(active(o)).toBe(1);
    await userEvent.keyboard('{Backspace}');
    expect(o.value).toBe('23');
    expect(active(o)).toBe(0);
  });

  it('typing into a full code overwrites the next character', async () => {
    const o = mount({ length: 4, value: '1234' });
    await userEvent.click(o.input);
    o.input.setSelectionRange(1, 1);
    await userEvent.keyboard('9');
    expect(o.value).toBe('1934');
    o.input.setSelectionRange(4, 4);
    await userEvent.keyboard('5');
    expect(o.value).toBe('1934');
  });

  it('distributes a pasted code (with spaces or dashes) across all cells and completes', () => {
    const o = mount();
    let completed = 0;
    o.host.addEventListener('aui-complete', () => completed++);
    o.input.focus();
    paste(o, ' 123-456 ');
    expect(o.value).toBe('123456');
    expect(cells(o)).toEqual(['1', '2', '3', '4', '5', '6']);
    expect(completed).toBe(1);
    // Normalizes full-width digits (NFKC).
    o.setValue('１２３４５６');
    expect(o.value).toBe('123456');
  });

  it('emits aui-complete once each time the code becomes complete, never with the code', async () => {
    const o = mount({ length: 3 });
    const details: unknown[] = [];
    o.host.addEventListener('aui-complete', (e) => details.push((e as CustomEvent<unknown>).detail));
    await userEvent.click(o.input);
    await userEvent.keyboard('987');
    expect(details).toHaveLength(1);
    expect(JSON.stringify(details)).not.toContain('987');
    await userEvent.keyboard('{Backspace}8');
    expect(details).toHaveLength(2);
  });
});

describe('OtpInput: validation and forms', () => {
  it('reports incomplete and missing codes with localized messages', async () => {
    const o = mount({ required: true });
    expect(o.validity).toMatchObject({ valid: false, error: 'value-missing', message: 'Enter the code.' });
    await userEvent.click(o.input);
    await userEvent.keyboard('12');
    await userEvent.tab();
    expect(o.validity).toMatchObject({ error: 'too-short', message: 'Enter all 6 digits.' });
    expect(describedBy(o.input)).toContain('Enter all 6 digits.');
    expect(o.input.getAttribute('aria-invalid')).toBe('true');
  });

  it('clear() empties the code for a retry; the consumer validator runs on complete codes', () => {
    const o = mount({ length: 4, validate: (v) => (v === '0000' ? 'This code is not valid.' : null) });
    o.setValue('0000');
    expect(o.validity).toMatchObject({ error: 'custom', message: 'This code is not valid.' });
    o.clear();
    expect(o.value).toBe('');
    expect(document.activeElement).toBe(o.input);
  });

  it('serializes as a string through Form', () => {
    const el = document.createElement('form');
    document.body.append(el);
    const o = mount({ name: 'code', value: '123456' }, el);
    const form = Form.create(el);
    expect(form.getValues()).toEqual({ code: '123456' });
    o.setValue('');
    form.reset();
    expect(o.value).toBe('123456');
    form.destroy();
  });
});
