import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Select, type SelectChangeDetail, type SelectOption, type SelectOptions } from '@absoluteui/components/select';
import { Dialog } from '@absoluteui/components/dialog';
import { getFormControl } from '../src/internal/field.js';

const fruits: SelectOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot', disabled: true },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry', description: 'Small and blue' },
  { value: 'cherry', label: 'Cherry' },
  { value: 'date', label: 'Date', disabled: true },
];

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<SelectOptions> = {}, parent: HTMLElement = document.body): Select {
  const host = document.createElement('div');
  parent.append(host);
  return Select.create(host, { label: 'Fruit', options: fruits, ...options });
}

const active = (s: Select): string | null => {
  const id = s.combobox.getAttribute('aria-activedescendant');
  return id ? (document.getElementById(id)?.querySelector('.aui-select__option-label')?.textContent ?? null) : null;
};
const shown = (s: Select): string => s.combobox.querySelector('.aui-select__value')!.textContent;
const errorText = (s: Select): string => s.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const optionEl = (s: Select, label: string): HTMLElement =>
  Array.from(s.listbox.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.querySelector('.aui-select__option-label')!.textContent === label)!;

describe('Select: ARIA wiring', () => {
  it('renders a select-only combobox labelled by the label and its own value', () => {
    const s = mount({ description: 'Pick one', required: true });
    const label = s.host.querySelector('label')!;
    const cb = s.combobox;
    expect(cb.getAttribute('role')).toBe('combobox');
    expect(cb.tabIndex).toBe(0);
    expect(cb.getAttribute('aria-haspopup')).toBe('listbox');
    expect(cb.getAttribute('aria-expanded')).toBe('false');
    expect(cb.getAttribute('aria-controls')).toBe(s.listbox.id);
    expect(cb.getAttribute('aria-labelledby')).toBe(`${label.id} ${cb.id}`);
    expect(cb.getAttribute('aria-required')).toBe('true');
    expect(document.getElementById(cb.getAttribute('aria-describedby')!)!.textContent).toBe('Pick one');
    expect(s.listbox.getAttribute('role')).toBe('listbox');
    expect(s.listbox.getAttribute('aria-labelledby')).toBe(label.id);
    expect(shown(s)).toBe('Select an option');
    expect(s.combobox.querySelector('.aui-icon')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('marks options selected and disabled, with a check on the selected one', () => {
    const s = mount({ value: 'banana' });
    expect(shown(s)).toBe('Banana');
    const banana = optionEl(s, 'Banana');
    expect(banana.getAttribute('aria-selected')).toBe('true');
    expect(banana.querySelector('.aui-select__check')).not.toBeNull();
    expect(optionEl(s, 'Apple').getAttribute('aria-selected')).toBe('false');
    expect(optionEl(s, 'Apricot').getAttribute('aria-disabled')).toBe('true');
    expect(optionEl(s, 'Blueberry').querySelector('.aui-select__option-description')!.textContent).toBe('Small and blue');
  });

  it('keeps the popup hidden before first open (regression)', () => {
    const s = mount();
    expect(s.listbox.parentElement!.checkVisibility()).toBe(false);
  });

  it('uses the consumer placeholder and a localized default', () => {
    expect(shown(mount({ placeholder: 'Choose fruit' }))).toBe('Choose fruit');
    registerMessages('select', 'de', { placeholder: 'Option auswählen' });
    expect(shown(mount({ locale: 'de-DE' }))).toBe('Option auswählen');
  });

  it('focuses the combobox when the label is clicked', async () => {
    const s = mount();
    await userEvent.click(s.host.querySelector('label')!);
    expect(document.activeElement).toBe(s.combobox);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Select.create(host, { label: ' ', options: fruits })).toThrow(AbsoluteUIError);
    expect(() => Select.create(host, { label: 'x', options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toThrow(/unique value/);
    expect(host.childElementCount).toBe(0);
    expect(host.hasAttribute('data-aui-control')).toBe(false);
  });
});

describe('Select: keyboard (APG select-only combobox)', () => {
  it('ArrowDown opens on the first enabled option; arrows skip disabled options without wrapping', async () => {
    const s = mount();
    s.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(s.isOpen).toBe(true);
    expect(s.combobox.getAttribute('aria-expanded')).toBe('true');
    expect(active(s)).toBe('Apple');
    await userEvent.keyboard('{ArrowDown}');
    expect(active(s)).toBe('Banana');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(active(s)).toBe('Cherry');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(active(s)).toBe('Apple');
    expect(document.activeElement).toBe(s.combobox);
  });

  it('opening activates the selected option; ArrowUp without a value activates the last enabled one', async () => {
    const s = mount({ value: 'blueberry' });
    s.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(active(s)).toBe('Blueberry');
    s.close();
    s.setValue(null);
    await userEvent.keyboard('{ArrowUp}');
    expect(active(s)).toBe('Cherry');
  });

  it('Enter, Space, and Alt+ArrowDown open; Enter and Space select and close', async () => {
    const s = mount();
    s.focus();
    await userEvent.keyboard('{Enter}');
    expect(s.isOpen).toBe(true);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(s.value).toBe('banana');
    expect(s.isOpen).toBe(false);
    await userEvent.keyboard(' ');
    expect(s.isOpen).toBe(true);
    expect(active(s)).toBe('Banana');
    await userEvent.keyboard('{ArrowDown} ');
    expect(s.value).toBe('blueberry');
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(s.isOpen).toBe(true);
    await userEvent.keyboard('{ArrowDown}{Alt>}{ArrowUp}{/Alt}');
    expect(s.value).toBe('cherry');
    expect(s.isOpen).toBe(false);
  });

  it('Home and End open and move to the first and last enabled options; PageUp/PageDown jump', async () => {
    const many = Array.from({ length: 30 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));
    const s = mount({ options: many });
    s.focus();
    await userEvent.keyboard('{End}');
    expect(s.isOpen).toBe(true);
    expect(active(s)).toBe('Item 29');
    await userEvent.keyboard('{PageUp}');
    expect(active(s)).toBe('Item 19');
    await userEvent.keyboard('{Home}');
    expect(active(s)).toBe('Item 0');
    await userEvent.keyboard('{PageDown}');
    expect(active(s)).toBe('Item 10');
    s.close();
    const f = mount();
    f.focus();
    await userEvent.keyboard('{End}');
    expect(active(f)).toBe('Cherry');
  });

  it('typeahead on a closed select opens it and activates the match; repeated characters cycle', async () => {
    const s = mount();
    s.focus();
    await userEvent.keyboard('b');
    expect(s.isOpen).toBe(true);
    expect(active(s)).toBe('Banana');
    expect(s.value).toBeNull();
    await userEvent.keyboard('b');
    expect(active(s)).toBe('Blueberry');
    await userEvent.keyboard('{Enter}');
    expect(s.value).toBe('blueberry');
  });

  it('typeahead skips disabled options and Space continues a query in progress', async () => {
    const s = mount({ options: [{ value: 'ny', label: 'New York' }, { value: 'nd', label: 'New Delhi', disabled: true }, { value: 'nz', label: 'New Zealand' }] });
    s.focus();
    await userEvent.keyboard('new z');
    expect(active(s)).toBe('New Zealand');
    expect(s.isOpen).toBe(true);
    const t = mount({ options: [{ value: 'aa', label: 'Apricot', disabled: true }, { value: 'ab', label: 'Avocado' }] });
    t.focus();
    await userEvent.keyboard('a');
    expect(active(t)).toBe('Avocado');
  });

  it('Tab selects the active option, closes, and lets focus move', async () => {
    const s = mount();
    const after = document.createElement('button');
    document.body.append(after);
    s.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    await userEvent.tab();
    expect(s.value).toBe('banana');
    expect(s.isOpen).toBe(false);
    expect(document.activeElement).toBe(after);
  });

  it('Escape closes without changing the value', async () => {
    const s = mount({ value: 'apple' });
    s.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Escape}');
    expect(s.isOpen).toBe(false);
    expect(s.value).toBe('apple');
    expect(s.combobox.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('shows a visible outline on the active option and scrolls it into view', async () => {
    const many = Array.from({ length: 200 }, (_, i) => ({ value: `v${i}`, label: `Item ${i}` }));
    const s = mount({ options: many });
    s.focus();
    await userEvent.keyboard('{End}');
    const el = document.getElementById(s.combobox.getAttribute('aria-activedescendant')!)!;
    expect(el.classList.contains('aui-select__option--active')).toBe(true);
    const popup = s.listbox.parentElement!.getBoundingClientRect();
    const rect = el.getBoundingClientRect();
    expect(rect.bottom).toBeLessThanOrEqual(popup.bottom + 1);
    expect(rect.top).toBeGreaterThanOrEqual(popup.top - 1);
  });
});

describe('Select: pointer and states', () => {
  it('click toggles; clicking an option selects it and keeps focus on the combobox', async () => {
    const s = mount();
    await userEvent.click(s.combobox);
    expect(s.isOpen).toBe(true);
    await userEvent.click(optionEl(s, 'Cherry'));
    expect(s.value).toBe('cherry');
    expect(s.isOpen).toBe(false);
    expect(document.activeElement).toBe(s.combobox);
    await userEvent.click(s.combobox);
    expect(s.isOpen).toBe(true);
    await userEvent.click(s.combobox);
    expect(s.isOpen).toBe(false);
  });

  it('ignores clicks on disabled options', () => {
    const s = mount();
    s.open();
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    optionEl(s, 'Apricot').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(s.value).toBeNull();
  });

  it('closes on an outside pointer', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'Outside';
    document.body.append(outside);
    const s = mount();
    await userEvent.click(s.combobox);
    await userEvent.click(outside);
    expect(s.isOpen).toBe(false);
  });

  it('disabled: out of the tab order, aria-disabled, never opens, not submitted', () => {
    const s = mount({ disabled: true, name: 'fruit', value: 'apple' });
    expect(s.combobox.tabIndex).toBe(-1);
    expect(s.combobox.getAttribute('aria-disabled')).toBe('true');
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    s.combobox.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(s.isOpen).toBe(false);
    expect(s.host.querySelector<HTMLInputElement>('input[type=hidden]')!.disabled).toBe(true);
  });

  it('readOnly: focusable, aria-readonly, does not open', async () => {
    const s = mount({ readOnly: true, value: 'apple' });
    s.focus();
    expect(s.combobox.getAttribute('aria-readonly')).toBe('true');
    await userEvent.keyboard('{ArrowDown}{Enter}b');
    await userEvent.click(s.combobox);
    expect(s.isOpen).toBe(false);
    expect(s.value).toBe('apple');
  });

  it('clears the value when its option is removed (regression)', () => {
    const s = mount({ value: 'banana', name: 'fruit' });
    s.update({ options: fruits.filter((f) => f.value !== 'banana') });
    expect(s.value).toBeNull();
    expect(shown(s)).toBe('Select an option');
    expect(s.host.querySelector<HTMLInputElement>('input[type=hidden]')!.value).toBe('');
  });
});

describe('Select inside a Dialog (overlay stacking)', () => {
  it('Escape closes the listbox only, not the dialog', async () => {
    const d = Dialog.create({ title: 'Pick' });
    const s = mount({}, d.body);
    d.open();
    s.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(s.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(s.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(s.combobox);
    d.close();
  });
});

describe('Select: validation', () => {
  it('shows "Select an option." after blur when required and empty', async () => {
    const s = mount({ required: true });
    expect(s.validity).toMatchObject({ valid: false, error: 'value-missing', message: 'Select an option.' });
    expect(s.combobox.hasAttribute('aria-invalid')).toBe(false);
    s.focus();
    await userEvent.tab();
    expect(errorText(s)).toBe('Select an option.');
    expect(s.combobox.getAttribute('aria-invalid')).toBe('true');
    expect(s.host.classList.contains('aui-select--invalid')).toBe(true);
    s.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(s.validity.valid).toBe(true);
    expect(s.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
  });

  it('defers the blur message until a pointer press elsewhere completes its click (regression)', async () => {
    const s = mount({ required: true });
    const submit = document.createElement('button');
    submit.textContent = 'Submit';
    document.body.append(submit);
    const clicked = vi.fn();
    submit.addEventListener('click', clicked);
    s.focus();
    await userEvent.click(submit);
    expect(clicked).toHaveBeenCalledTimes(1);
    await new Promise((resolve) => setTimeout(resolve, 0));
    expect(s.touched).toBe(true);
    expect(errorText(s)).toBe('Select an option.');
  });

  it('honours validationTiming from global configuration', async () => {
    configureAbsoluteUI({ components: { select: { validationTiming: 'submit' } } });
    const s = mount({ required: true });
    s.focus();
    await userEvent.tab();
    expect(s.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
    expect(s.reportValidity()).toBe(false);
    expect(errorText(s)).toBe('Select an option.');
  });

  it('instance validationTiming overrides the global value', async () => {
    configureAbsoluteUI({ components: { select: { validationTiming: 'submit' } } });
    const s = mount({ validationTiming: 'input', validate: (v) => (v === 'banana' ? 'Out of stock.' : null) });
    s.focus();
    await userEvent.keyboard('b{Enter}');
    expect(errorText(s)).toBe('Out of stock.');
    expect(s.validity.error).toBe('custom');
  });

  it('runs the consumer validator and clears an external error on user selection', async () => {
    const validate = vi.fn((v: string | null) => (v === 'cherry' ? 'Cherries are seasonal.' : null));
    const s = mount({ value: 'cherry', validate });
    expect(s.reportValidity()).toBe(false);
    expect(errorText(s)).toBe('Cherries are seasonal.');
    s.setValue('apple');
    s.setCustomError('Server rejected this value.');
    expect(errorText(s)).toBe('Server rejected this value.');
    s.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(s.value).toBe('banana');
    expect(s.validity.valid).toBe(true);
  });

  it('localizes the required message through the catalog', () => {
    registerMessages('validation', 'de', { valueMissingChoice: 'Wählen Sie eine Option.' });
    const s = mount({ required: true, locale: 'de-DE' });
    s.reportValidity();
    expect(errorText(s)).toBe('Wählen Sie eine Option.');
  });
});

describe('Select: events', () => {
  it('emits bubbling aui-change only for user selections of a new value', async () => {
    const s = mount({ value: 'apple' });
    const changes: SelectChangeDetail[] = [];
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<SelectChangeDetail>).detail));
    s.setValue('banana');
    s.update({ value: 'apple' });
    s.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(changes).toHaveLength(0);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ value: 'banana', option: { value: 'banana', label: 'Banana' }, validity: { valid: true } });
  });

  it('emits non-bubbling aui-open and aui-close', async () => {
    const s = mount();
    const onHost: string[] = [];
    const onBody: string[] = [];
    s.host.addEventListener('aui-open', () => onHost.push('open'));
    s.host.addEventListener('aui-close', () => onHost.push('close'));
    document.body.addEventListener('aui-open', () => onBody.push('open'));
    document.body.addEventListener('aui-close', () => onBody.push('close'));
    s.focus();
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(onHost).toEqual(['open', 'close']);
    expect(onBody).toEqual([]);
  });
});

describe('Select: form control contract', () => {
  it('registers, serializes, and supports reset/dirty/touched', async () => {
    const form = document.createElement('form');
    document.body.append(form);
    const s = mount({ name: 'fruit', value: 'apple' }, form);
    expect(getFormControl(s.host)).toBe(s);
    expect(s.getFormValue()).toBe('apple');
    expect(new FormData(form).get('fruit')).toBe('apple');
    s.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    await userEvent.tab();
    expect(s.dirty).toBe(true);
    expect(s.touched).toBe(true);
    expect(s.getFormValue()).toBe('banana');
    expect(new FormData(form).get('fruit')).toBe('banana');
    s.reset();
    expect(s.value).toBe('apple');
    expect(s.dirty).toBe(false);
    expect(s.touched).toBe(false);
    expect(mount({ name: 'x' }).getFormValue()).toBeNull();
  });

  it('destroy removes rendering, open popup, registration, and subscriptions', () => {
    const s = mount();
    const host = s.host;
    s.open();
    s.destroy();
    expect(host.childElementCount).toBe(0);
    expect(document.querySelector(':popover-open')).toBeNull();
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    expect(host.classList.contains('aui-select')).toBe(false);
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});

describe('Select: scale', () => {
  it(`creates ${Select.testedOptionCount.toLocaleString('en-US')} options in under 100 ms`, async () => {
    const many = Array.from({ length: Select.testedOptionCount }, (_, i) => ({ value: `v${i}`, label: `Option ${i}` }));
    const start = performance.now();
    const s = mount({ options: many, value: 'v500' });
    const elapsed = performance.now() - start;
    expect(s.listbox.childElementCount).toBe(1000);
    expect(elapsed).toBeLessThan(100);
    s.focus();
    await userEvent.keyboard('{End}');
    expect(active(s)).toBe('Option 999');
  });
});
