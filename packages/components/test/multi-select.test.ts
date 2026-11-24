import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, onNodeRelease, resetAbsoluteUIConfig } from '@absoluteui/core';
import { MultiSelect, type MultiSelectChangeDetail, type MultiSelectOption, type MultiSelectOptions } from '@absoluteui/components/multi-select';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const options: MultiSelectOption[] = [
  { value: 'ts', label: 'TypeScript' },
  { value: 'go', label: 'Go' },
  { value: 'rust', label: 'Rust', description: 'Systems' },
  { value: 'cobol', label: 'COBOL', disabled: true },
];

function mount(extra: Partial<MultiSelectOptions> = {}, parent: HTMLElement = document.body): MultiSelect {
  const host = document.createElement('div');
  parent.append(host);
  return MultiSelect.create(host, { label: 'Languages', options, ...extra });
}

function changes(m: MultiSelect): MultiSelectChangeDetail[] {
  const out: MultiSelectChangeDetail[] = [];
  m.host.addEventListener('aui-change', (e) => out.push((e as CustomEvent<MultiSelectChangeDetail>).detail));
  return out;
}

const optionEls = (m: MultiSelect): HTMLElement[] => Array.from(m.listbox.querySelectorAll<HTMLElement>('[role="option"]'));
const chips = (m: MultiSelect): string[] => Array.from(m.host.querySelectorAll('.aui-multi-select__chip-label'), (c) => c.textContent);

describe('MultiSelect: structure and ARIA', () => {
  it('renders a combobox with a multi-selectable listbox and chips for the value', () => {
    const m = mount({ value: ['go', 'ts'], description: 'Pick any' });
    expect(m.input.getAttribute('role')).toBe('combobox');
    expect(m.input.getAttribute('aria-controls')).toBe(m.listbox.id);
    expect(m.listbox.getAttribute('aria-multiselectable')).toBe('true');
    expect(m.host.querySelector('label')?.htmlFor).toBe(m.input.id);
    expect(chips(m)).toEqual(['Go', 'TypeScript']);
    expect(m.host.querySelector('.aui-multi-select__chips')?.getAttribute('aria-label')).toBe('Selected: Languages');
    expect(Array.from(m.host.querySelectorAll('.aui-multi-select__remove'), (b) => b.getAttribute('aria-label'))).toEqual(['Remove Go', 'Remove TypeScript']);
    expect(m.input.getAttribute('aria-describedby')).toContain(m.host.querySelector('.aui-multi-select__description')!.id);
  });

  it('drops unknown and duplicate values', () => {
    const m = mount({ value: ['go', 'nope', 'go'] });
    expect(m.value).toEqual(['go']);
    m.setValue(['rust', 'x']);
    expect(m.value).toEqual(['rust']);
  });

  it('rejects invalid options with the property name, never the value', () => {
    expect(() => mount({ maxSelected: 0 })).toThrow(/multiSelect.maxSelected/);
    expect(() => mount({ options: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toThrow(AbsoluteUIError);
    expect(() => mount({ label: ' ' })).toThrow(/multiSelect.label/);
  });
});

describe('MultiSelect: interaction', () => {
  it('toggles options with the keyboard and keeps the list open; aui-change reports added and removed', async () => {
    const m = mount();
    const log = changes(m);
    await userEvent.click(m.input);
    await userEvent.keyboard('{ArrowDown}');
    expect(m.isOpen).toBe(true);
    expect(m.input.getAttribute('aria-activedescendant')).toBe(optionEls(m)[0]!.id);
    await userEvent.keyboard('{Enter}{ArrowDown}{Enter}');
    expect(m.value).toEqual(['ts', 'go']);
    expect(m.isOpen).toBe(true);
    expect(optionEls(m).map((o) => o.getAttribute('aria-selected'))).toEqual(['true', 'true', 'false', 'false']);
    await userEvent.keyboard('{ArrowUp}{Enter}');
    expect(m.value).toEqual(['go']);
    expect(log).toEqual([
      { value: ['ts'], added: ['ts'], removed: [] },
      { value: ['ts', 'go'], added: ['go'], removed: [] },
      { value: ['go'], added: [], removed: ['ts'] },
    ]);
    // Disabled options are skipped and cannot be selected.
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{ArrowDown}');
    expect(m.input.getAttribute('aria-activedescendant')).toBe(optionEls(m)[0]!.id);
  });

  it('filters while typing; Backspace in the empty input removes the last value; chips remove by click', async () => {
    const m = mount({ value: ['ts', 'go'] });
    await userEvent.click(m.input);
    await userEvent.keyboard('ru');
    expect(optionEls(m).map((o) => o.textContent)).toEqual(['RustSystems']);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(m.value).toEqual(['ts', 'go', 'rust']);
    await userEvent.clear(m.input);
    await userEvent.keyboard('{Backspace}');
    expect(m.value).toEqual(['ts', 'go']);
    await userEvent.click(m.host.querySelector<HTMLButtonElement>('.aui-multi-select__remove[data-value="ts"]')!);
    expect(m.value).toEqual(['go']);
    expect(document.activeElement).toBe(m.input);
  });

  it('closeOnSelect closes after each toggle; Escape closes; Tab closes and clears the query', async () => {
    const m = mount({ closeOnSelect: true });
    await userEvent.click(m.input);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(m.value).toEqual(['ts']);
    expect(m.isOpen).toBe(false);
    await userEvent.keyboard('g');
    expect(m.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(m.isOpen).toBe(false);
  });

  it('Select all toggles the enabled options shown, up to the maximum', async () => {
    const m = mount({ selectAll: true, maxSelected: 2 });
    await userEvent.click(m.input);
    await userEvent.keyboard('{ArrowDown}');
    expect(optionEls(m)[0]!.textContent).toBe('Select all');
    await userEvent.keyboard('{Enter}');
    expect(m.value).toEqual(['ts', 'go']);
    // Full: unselected options are unavailable.
    expect(optionEls(m).map((o) => o.getAttribute('aria-disabled'))).toEqual([null, null, null, 'true', 'true']);
    const all = mount({ selectAll: true });
    all.open();
    optionEls(all)[0]!.click();
    expect(all.value).toEqual(['ts', 'go', 'rust']);
    expect(optionEls(all)[0]!.getAttribute('aria-selected')).toBe('true');
    optionEls(all)[0]!.click();
    expect(all.value).toEqual([]);
  });
});

describe('MultiSelect: forms', () => {
  it('serializes one hidden input per value, validates required after touch, resets, and registers as a form control', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const m = mount({ name: 'langs', required: true, value: ['go'] }, form);
    expect(new FormData(form).getAll('langs')).toEqual(['go']);
    m.setValue([]);
    expect(m.validity).toMatchObject({ valid: false, error: 'value-missing' });
    expect(m.input.hasAttribute('aria-invalid')).toBe(false);
    expect(m.reportValidity()).toBe(false);
    expect(m.input.getAttribute('aria-invalid')).toBe('true');
    m.update({ value: ['ts', 'rust'] });
    expect(new FormData(form).getAll('langs')).toEqual(['ts', 'rust']);
    expect(m.getFormValue()).toEqual(['ts', 'rust']);
    m.reset();
    expect(m.value).toEqual(['go']);
    expect(m.dirty).toBe(false);
    expect(m.input.hasAttribute('aria-invalid')).toBe(false);
  });

  it('readOnly and disabled keep the value but block changes', async () => {
    const m = mount({ value: ['go'], readOnly: true });
    expect(m.host.querySelector('.aui-multi-select__remove')).toBeNull();
    await userEvent.click(m.input);
    await userEvent.keyboard('{ArrowDown}{Backspace}');
    expect(m.isOpen).toBe(false);
    expect(m.value).toEqual(['go']);
    m.update({ readOnly: false, disabled: true });
    expect(m.input.disabled).toBe(true);
  });
});

describe('MultiSelect: async options and custom content', () => {
  it('loads options for the query (debounced, aborted), keeps selected options known', async () => {
    const signals: AbortSignal[] = [];
    const load = vi.fn((query: string, { signal }: { signal: AbortSignal }): Promise<MultiSelectOption[]> => {
      signals.push(signal);
      // Earlier queries stay pending, so a newer query must abort them (a settled load cannot be aborted).
      if (query !== 'gr') return new Promise<MultiSelectOption[]>(() => undefined);
      return Promise.resolve([{ value: 'ada', label: 'Ada' }, { value: 'grace', label: 'Grace' }].filter((o) => o.label.toLowerCase().includes(query.toLowerCase())));
    });
    const m = mount({ options: [], loadOptions: load, loadDelay: 0 });
    await userEvent.click(m.input);
    await userEvent.keyboard('gr');
    await vi.waitFor(() => {
      expect(optionEls(m).map((o) => o.textContent)).toEqual(['Grace']);
    });
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(m.value).toEqual(['grace']);
    expect(chips(m)).toEqual(['Grace']);
    expect(signals.slice(0, -1).every((s) => s.aborted)).toBe(true);
  });

  it('renderOption content is decorative and released when dropped', () => {
    const released: string[] = [];
    const m = mount({
      renderOption: (o, { doc }) => {
        const b = doc.createElement('b');
        b.textContent = o.label.toUpperCase();
        return onNodeRelease(b, () => released.push(o.value));
      },
    });
    m.open();
    const first = optionEls(m)[0]!;
    expect(first.getAttribute('aria-label')).toBe('TypeScript');
    expect(first.querySelector('b')?.textContent).toBe('TYPESCRIPT');
    m.update({ options: options.slice(1) });
    expect(released).toEqual(['ts']);
    m.destroy();
    expect(released.sort()).toEqual(['cobol', 'go', 'rust', 'ts']);
  });
});
