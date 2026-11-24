import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { onNodeRelease, plainDate, plainDateToString, resetAbsoluteUIConfig } from '@absoluteui/core';
import { createBusinessCalendar } from '@absoluteui/components/business-calendar';
import { Calendar } from '@absoluteui/components/calendar';
import { Combobox, type ComboboxOption } from '@absoluteui/components/combobox';
import { DatePicker } from '@absoluteui/components/date-picker';
import { Select, type SelectOption } from '@absoluteui/components/select';

// docs/PLAN-R9-ANGULAR.md M4 (D8, D16, D17): option render hooks, Combobox loadOptions,
// business calendar in Calendar and the pickers.
afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const host = (): HTMLDivElement => {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
};

const business = createBusinessCalendar({ holidays: [{ date: plainDate(2026, 10, 2), name: 'Founders day' }] });

describe('business calendar in Calendar and the pickers (D17)', () => {
  it('names and marks weekends and holidays; disableNonWorking disables them', () => {
    const cal = Calendar.create(host(), { value: plainDate(2026, 10, 1), businessCalendar: business, locale: 'en-GB', today: plainDate(2026, 10, 1) });
    const cell = (label: string): HTMLElement => cal.grid.querySelector<HTMLElement>(`td[aria-label="${label}"]`)!;
    expect(cell('Friday, 2 October 2026, Founders day, non-working day').classList).toContain('aui-calendar__day--holiday');
    expect(cell('Saturday, 3 October 2026, non-working day').classList).toContain('aui-calendar__day--non-working');
    expect(cell('Monday, 5 October 2026').hasAttribute('aria-disabled')).toBe(false);
    expect(cell('Saturday, 3 October 2026, non-working day').hasAttribute('aria-disabled')).toBe(false);
    cal.update({ disableNonWorking: true });
    expect(cell('Saturday, 3 October 2026, non-working day').getAttribute('aria-disabled')).toBe('true');
    expect(cell('Friday, 2 October 2026, Founders day, non-working day').getAttribute('aria-disabled')).toBe('true');
  });

  it('Date Picker reports a typed non-working day as unavailable', async () => {
    const p = DatePicker.create(host(), { label: 'Start', businessCalendar: business, disableNonWorking: true, locale: 'en-US' });
    p.input.group.querySelector<HTMLInputElement>('.aui-date-input__segment')!.focus();
    await userEvent.keyboard('10022026');
    expect(plainDateToString(p.value!)).toBe('2026-10-02');
    expect(p.validity).toMatchObject({ valid: false, message: 'This date is not available.' });
    p.setValue(plainDate(2026, 10, 5));
    expect(p.validity.valid).toBe(true);
  });

  it('rejects an invalid businessCalendar', () => {
    expect(() => Calendar.create(host(), { businessCalendar: {} as never })).toThrow(/businessCalendar/);
  });
});

describe('option render hooks (D8)', () => {
  const tracked = (): { make: (label: string) => HTMLElement; live: Set<string> } => {
    const live = new Set<string>();
    return {
      live,
      make: (label) => {
        const el = document.createElement('b');
        el.textContent = label;
        live.add(label);
        return onNodeRelease(el, () => live.delete(label));
      },
    };
  };
  const fruits: SelectOption[] = [
    { value: 'apple', label: 'Apple' },
    { value: 'pear', label: 'Pear' },
  ];

  it('Select: custom options and value keep labels as accessible names; nodes are released', async () => {
    const t = tracked();
    const s = Select.create(host(), {
      label: 'Fruit',
      options: fruits,
      value: 'apple',
      renderOption: (o) => t.make(`option:${o.value}`),
      renderValue: (o) => t.make(`value:${o.value}`),
    });
    expect(t.live).toEqual(new Set(['option:apple', 'option:pear', 'value:apple']));
    expect(s.listbox.querySelector('[role="option"]')!.getAttribute('aria-label')).toBe('Apple');
    expect(s.combobox.textContent).toContain('Apple');
    s.combobox.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}{Enter}');
    expect(s.value).toBe('pear');
    expect(t.live.has('value:apple')).toBe(false);
    expect(t.live.has('value:pear')).toBe(true);
    s.update({ options: [fruits[1]!] });
    expect(t.live.has('option:apple')).toBe(false);
    s.destroy();
    expect(t.live.size).toBe(0);
  });

  it('Combobox: custom options are reused while filtering and released on destroy', async () => {
    const t = tracked();
    const render = vi.fn((o: ComboboxOption) => t.make(o.value));
    const c = Combobox.create(host(), { label: 'Fruit', options: fruits, renderOption: render });
    c.input.focus();
    await userEvent.keyboard('p');
    expect(c.listbox.querySelectorAll('[role="option"]')).toHaveLength(2);
    await userEvent.keyboard('e');
    expect(t.live).toEqual(new Set(['pear']));
    c.destroy();
    expect(t.live.size).toBe(0);
  });
});

describe('Combobox loadOptions (D16)', () => {
  const people: ComboboxOption[] = [
    { value: 'ada', label: 'Ada Lovelace' },
    { value: 'grace', label: 'Grace Hopper' },
  ];

  it('debounces, aborts stale requests, and selects loaded options strictly', async () => {
    const signals: AbortSignal[] = [];
    const load = vi.fn((query: string, { signal }: { signal: AbortSignal }) => {
      signals.push(signal);
      return Promise.resolve(people.filter((p) => p.label.toLowerCase().includes(query.toLowerCase())));
    });
    // A delay well above the gap between the two keystrokes, even on a loaded machine (150 ms was flaky in full runs).
    const c = Combobox.create(host(), { label: 'Person', options: [], loadOptions: load, loadDelay: 1000 });
    c.input.focus();
    await userEvent.keyboard('gr');
    await vi.waitFor(
      () => {
        expect(c.listbox.querySelectorAll('[role="option"]')).toHaveLength(1);
      },
      { timeout: 4000 },
    );
    // Keystrokes inside the delay share one request; any earlier request was aborted, the last one is for the full text.
    expect(load.mock.calls.length).toBeLessThanOrEqual(2);
    expect(load.mock.calls.at(-1)![0]).toBe('gr');
    expect(signals.slice(0, -1).every((s) => s.aborted)).toBe(true);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(c.value).toBe('grace');
    expect(c.selectedOption?.label).toBe('Grace Hopper');
    expect(c.input.value).toBe('Grace Hopper');
    expect(signals.at(-1)!.aborted).toBe(false);
  });

  it('shows loading, then a load error that is announced', async () => {
    let fail: (e: Error) => void = () => undefined;
    const c = Combobox.create(host(), {
      label: 'Person',
      options: [],
      loadDelay: 0,
      loadOptions: () =>
        new Promise((_, reject) => {
          fail = reject;
        }),
    });
    c.input.focus();
    await userEvent.keyboard('a');
    const status = c.listbox.parentElement!.querySelector('.aui-combobox__empty')!;
    await vi.waitFor(() => {
      expect(c.listbox.getAttribute('aria-busy')).toBe('true');
    });
    expect(status.textContent).toBe('Loading...');
    fail(new Error('offline'));
    await vi.waitFor(() => {
      expect(status.textContent).toBe('Could not load options.');
    });
    expect(c.listbox.hasAttribute('aria-busy')).toBe(false);
  });

  it('closing aborts a pending request', async () => {
    let seen: AbortSignal | null = null;
    const c = Combobox.create(host(), {
      label: 'Person',
      options: [],
      loadDelay: 0,
      loadOptions: (_q, { signal }) => {
        seen = signal;
        return new Promise(() => undefined);
      },
    });
    c.input.focus();
    await userEvent.keyboard('a');
    await vi.waitFor(() => {
      expect(seen).not.toBeNull();
    });
    c.close();
    expect((seen as AbortSignal | null)?.aborted).toBe(true);
  });
});
