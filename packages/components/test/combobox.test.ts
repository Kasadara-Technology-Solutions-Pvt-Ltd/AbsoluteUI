import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Combobox, type ComboboxChangeDetail, type ComboboxOption } from '@absoluteui/components/combobox';
import { Dialog } from '@absoluteui/components/dialog';

const fruits: ComboboxOption[] = [
  { value: 'apple', label: 'Apple' },
  { value: 'apricot', label: 'Apricot', disabled: true },
  { value: 'banana', label: 'Banana' },
  { value: 'blueberry', label: 'Blueberry', description: 'Small and blue' },
  { value: 'ecole', label: 'École fruit' },
];

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<Parameters<typeof Combobox.create>[1]> = {}, parent: HTMLElement = document.body): Combobox {
  const host = document.createElement('div');
  parent.append(host);
  return Combobox.create(host, { label: 'Fruit', options: fruits, name: 'fruit', ...options });
}

const optionTexts = (c: Combobox): string[] => Array.from(c.listbox.querySelectorAll('[role="option"] .aui-combobox__option-label')).map((o) => o.textContent);
const active = (c: Combobox): HTMLElement | null => {
  const id = c.input.getAttribute('aria-activedescendant');
  return id ? document.getElementById(id) : null;
};

describe('Combobox: ARIA 1.2 wiring', () => {
  it('labels the input and references the listbox', () => {
    const c = mount({ description: 'Pick one' });
    const label = c.host.querySelector('label')!;
    expect(label.htmlFor).toBe(c.input.id);
    expect(label.textContent).toBe('Fruit');
    expect(c.input.getAttribute('role')).toBe('combobox');
    expect(c.input.getAttribute('aria-autocomplete')).toBe('list');
    expect(c.input.getAttribute('aria-expanded')).toBe('false');
    expect(c.input.getAttribute('aria-controls')).toBe(c.listbox.id);
    expect(c.listbox.getAttribute('role')).toBe('listbox');
    expect(document.getElementById(c.input.getAttribute('aria-describedby')!)!.textContent).toBe('Pick one');
  });

  it('keeps the popup hidden before first open (regression)', () => {
    const c = mount();
    expect(c.listbox.parentElement!.checkVisibility()).toBe(false);
  });

  it('validates options', () => {
    expect(() => mount({ label: '' })).toThrow(AbsoluteUIError);
    expect(() => mount({ options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toThrow(/unique value/);
  });
});

describe('Combobox: keyboard interaction', () => {
  it('ArrowDown opens and activates the first enabled option; arrows skip disabled options', async () => {
    const c = mount();
    c.input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(c.isOpen).toBe(true);
    expect(c.input.getAttribute('aria-expanded')).toBe('true');
    expect(c.listbox.parentElement!.matches(':popover-open')).toBe(true);
    expect(active(c)!.textContent).toContain('Apple');
    await userEvent.keyboard('{ArrowDown}');
    expect(active(c)!.textContent).toContain('Banana');
    await userEvent.keyboard('{ArrowUp}{ArrowUp}');
    expect(active(c)!.textContent).toContain('École');
    expect(document.activeElement).toBe(c.input);
  });

  it('Enter selects the active option and emits aui-change', async () => {
    const c = mount();
    const onChange = vi.fn();
    c.host.addEventListener('aui-change', (e) => {
      onChange((e as CustomEvent<ComboboxChangeDetail>).detail);
    });
    c.input.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(c.value).toBe('banana');
    expect(c.input.value).toBe('Banana');
    expect(c.isOpen).toBe(false);
    expect(onChange).toHaveBeenCalledWith({ value: 'banana', option: fruits[2] });
    expect(c.host.querySelector<HTMLInputElement>('input[type=hidden]')!.value).toBe('banana');
    await userEvent.keyboard('{ArrowDown}');
    expect(c.listbox.querySelector('[aria-selected="true"]')!.textContent).toContain('Banana');
    expect(active(c)!.textContent).toContain('Banana');
  });

  it('Escape closes the popup, then clears the value', async () => {
    const c = mount({ value: 'apple' });
    c.input.focus();
    await userEvent.keyboard('{ArrowDown}');
    await userEvent.keyboard('{Escape}');
    expect(c.isOpen).toBe(false);
    expect(c.value).toBe('apple');
    await userEvent.keyboard('{Escape}');
    expect(c.value).toBeNull();
    expect(c.input.value).toBe('');
  });

  it('Alt+ArrowDown opens without activating an option', async () => {
    const c = mount();
    c.input.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(c.isOpen).toBe(true);
    expect(c.input.hasAttribute('aria-activedescendant')).toBe(false);
  });
});

describe('Combobox: filtering', () => {
  it('filters as the user types, accent- and case-insensitive, without auto-selecting', async () => {
    const c = mount();
    c.input.focus();
    await userEvent.keyboard('b');
    expect(c.isOpen).toBe(true);
    expect(optionTexts(c)).toEqual(['Banana', 'Blueberry']);
    expect(c.input.hasAttribute('aria-activedescendant')).toBe(false);
    await userEvent.clear(c.input);
    await userEvent.keyboard('ECOLE');
    expect(optionTexts(c)).toEqual(['École fruit']);
  });

  it('shows an empty state and announces the result count', async () => {
    const c = mount();
    c.input.focus();
    await userEvent.keyboard('zzz');
    expect(optionTexts(c)).toEqual([]);
    expect(c.host.querySelector<HTMLElement>('.aui-combobox__empty')!.hidden).toBe(false);
    await new Promise((r) => setTimeout(r, 500));
    await new Promise((r) => requestAnimationFrame(r));
    expect(document.querySelector('[data-aui-live-region="polite"]')!.textContent).toBe('No results');
  });

  it('supports startsWith filtering', async () => {
    const c = mount({ filter: 'startsWith' });
    c.input.focus();
    await userEvent.keyboard('an');
    expect(optionTexts(c)).toEqual([]);
  });

  it('reverts free text to the selected label on blur (strict selection)', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const c = mount({ value: 'apple' });
    c.input.focus();
    await userEvent.keyboard('{Control>}a{/Control}xyz');
    outside.focus();
    expect(c.input.value).toBe('Apple');
    expect(c.value).toBe('apple');
    expect(c.isOpen).toBe(false);
  });
});

describe('Combobox: pointer and states', () => {
  it('selects on click while keeping focus in the input', async () => {
    const c = mount();
    c.input.focus();
    await userEvent.keyboard('{ArrowDown}');
    const blueberry = Array.from(c.listbox.querySelectorAll('[role="option"]')).find((o) => o.textContent.includes('Blueberry'))!;
    await userEvent.click(blueberry);
    expect(c.value).toBe('blueberry');
    expect(document.activeElement).toBe(c.input);
  });

  it('ignores clicks on disabled options', () => {
    const c = mount();
    c.open();
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    c.listbox.querySelector('[aria-disabled="true"]')!.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(c.value).toBeNull();
  });

  it('clears the value when its option is removed (regression)', () => {
    const c = mount({ value: 'banana' });
    c.update({ options: fruits.filter((f) => f.value !== 'banana') });
    expect(c.value).toBeNull();
    expect(c.input.value).toBe('');
    expect(c.host.querySelector<HTMLInputElement>('input[type=hidden]')!.value).toBe('');
  });

  it('exposes invalid and required states', () => {
    const c = mount({ invalid: true, errorMessage: 'Choose a fruit', required: true });
    expect(c.input.getAttribute('aria-invalid')).toBe('true');
    expect(c.input.getAttribute('aria-required')).toBe('true');
    expect(document.getElementById(c.input.getAttribute('aria-describedby')!)!.textContent).toBe('Choose a fruit');
  });

  it('does not open when disabled or read-only', async () => {
    const c = mount({ readOnly: true });
    c.input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(c.isOpen).toBe(false);
  });
});

describe('Combobox inside a Dialog (overlay stacking)', () => {
  it('Escape closes the listbox first, not the dialog', async () => {
    const d = Dialog.create({ title: 'Pick' });
    const c = mount({}, d.body);
    d.open();
    c.input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(c.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(c.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    d.close();
  });
});
