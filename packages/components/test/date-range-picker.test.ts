import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, dayOfWeek, plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate, type Range } from '@absoluteui/core';
import { DateRangePicker, type DateRangePickerChangeDetail, type DateRangePickerOptions } from '@absoluteui/components/date-range-picker';
import { Dialog } from '@absoluteui/components/dialog';
import { Form } from '@absoluteui/components/form';
import { findFormControls, getFormControl } from '../src/internal/field.js';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<DateRangePickerOptions> = {}, parent: HTMLElement = document.body): DateRangePicker {
  const host = document.createElement('div');
  parent.append(host);
  // One month keeps unit tests independent of the viewport width ('auto').
  return DateRangePicker.create(host, { label: 'Stay', name: 'stay', locale: 'en-US', months: 1, ...options });
}

const range = (a: PlainDate, b: PlainDate): Range<PlainDate> => ({ start: a, end: b });
const segments = (p: DateRangePicker, which: 'start' | 'end'): HTMLInputElement[] => Array.from((which === 'start' ? p.startInput : p.endInput).group.querySelectorAll('.aui-date-input__segment'));
const activeLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
const cell = (p: DateRangePicker, label: string): HTMLTableCellElement => {
  const td = p.calendar.grids.flatMap((g) => Array.from(g.querySelectorAll<HTMLTableCellElement>('td'))).find((d) => d.getAttribute('aria-label')?.startsWith(label) === true);
  if (!td) throw new Error(`No cell ${label}`);
  return td;
};
const isoRange = (r: Range<PlainDate> | null): string | null => (r ? `${plainDateToString(r.start)}/${plainDateToString(r.end)}` : null);
const errorText = (p: DateRangePicker, which: 'start' | 'end'): string => (which === 'start' ? p.startInput : p.endInput).host.querySelector('.aui-date-input__error')!.textContent;

async function typeDate(p: DateRangePicker, which: 'start' | 'end', mmddyyyy: string): Promise<void> {
  segments(p, which)[0]!.focus();
  await userEvent.keyboard(mmddyyyy);
}

describe('DateRangePicker: structure', () => {
  it('renders a labelled group with two named date fields, a button, and a non-modal dialog popup', () => {
    const p = mount({ description: 'Check-in to check-out' });
    expect(p.group.getAttribute('role')).toBe('group');
    expect(document.getElementById(p.group.getAttribute('aria-labelledby')!)!.textContent).toBe('Stay');
    expect(document.getElementById(p.group.getAttribute('aria-describedby')!)!.textContent).toBe('Check-in to check-out');
    expect(document.getElementById(p.startInput.group.getAttribute('aria-labelledby')!)!.textContent).toBe('Start date');
    expect(document.getElementById(p.endInput.group.getAttribute('aria-labelledby')!)!.textContent).toBe('End date');
    expect(p.endInput.group.contains(p.button)).toBe(true);
    expect(p.button.getAttribute('aria-label')).toBe('Choose dates');
    expect(p.button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(p.popup.getAttribute('role')).toBe('dialog');
    expect(p.popup.getAttribute('aria-modal')).toBe('false');
    expect(p.calendar.options.selectionMode).toBe('range');
    expect(p.calendar.grid.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('uses custom field labels and names the button with the range', () => {
    const p = mount({ startLabel: 'Check-in', endLabel: 'Check-out', value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 8)) });
    expect(document.getElementById(p.startInput.group.getAttribute('aria-labelledby')!)!.textContent).toBe('Check-in');
    expect(p.button.getAttribute('aria-label')).toBe('Change dates, March 5, 2026 to March 8, 2026');
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => DateRangePicker.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => DateRangePicker.create(host, { label: 'x', value: range(plainDate(2026, 5, 2), plainDate(2026, 5, 1)) })).toThrow(/value/);
    expect(() => DateRangePicker.create(host, { label: 'x', min: plainDate(2026, 5, 1), max: plainDate(2026, 1, 1) })).toThrow(/min/);
    expect(() => DateRangePicker.create(host, { label: 'x', minDays: 4, maxDays: 3 })).toThrow(/minDays/);
    expect(() => DateRangePicker.create(host, { label: 'x', months: 3 as 2 })).toThrow(/months/);
    expect(() => DateRangePicker.create(host, { label: 'x', timezone: 'Mars/Olympus' })).toThrow(AbsoluteUIError);
    expect(() => DateRangePicker.create(host, { label: 'x', firstDayOfWeek: 9 as 1 })).toThrow(/firstDayOfWeek/);
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
  });
});

describe('DateRangePicker: popup', () => {
  it('opens on the range start, picks two days, writes both fields, emits once, closes, and focuses the button', async () => {
    const p = mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 8)) });
    const events: DateRangePickerChangeDetail[] = [];
    const targets: EventTarget[] = [];
    document.body.addEventListener('aui-change', (e) => {
      events.push((e as CustomEvent<DateRangePickerChangeDetail>).detail);
      if (e.target) targets.push(e.target);
    });
    const onOpen = vi.fn();
    p.host.addEventListener('aui-open', onOpen);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(activeLabel()).toBe('Thursday, March 5, 2026, start of range');
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(events).toHaveLength(0);
    expect(p.isOpen).toBe(true);
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(isoRange(p.value)).toBe('2026-03-06/2026-03-13');
    expect(segments(p, 'start').map((s) => s.value)).toEqual(['03', '06', '2026']);
    expect(segments(p, 'end').map((s) => s.value)).toEqual(['03', '13', '2026']);
    expect(p.getFormValue()).toBe('2026-03-06/2026-03-13');
    expect(events).toHaveLength(1);
    expect(isoRange(events[0]!.value)).toBe('2026-03-06/2026-03-13');
    expect(targets).toEqual([p.host]);
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
  });

  it('closing with an unfinished pick keeps the previous range', async () => {
    const p = mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 8)) });
    await userEvent.click(p.button);
    await userEvent.click(cell(p, 'Tuesday, March 10, 2026'));
    expect(p.calendar.rangeAnchor).not.toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(isoRange(p.value)).toBe('2026-03-05/2026-03-08');
    await userEvent.click(p.button);
    expect(p.calendar.rangeAnchor).toBeNull();
    expect(p.calendar.grid.querySelectorAll('[aria-selected="true"]')).toHaveLength(4);
  });

  it('shows two months when configured and stays open with closeOnSelect false', async () => {
    configureAbsoluteUI({ components: { dateRangePicker: { closeOnSelect: false } } });
    const p = mount({ months: 2, value: range(plainDate(2026, 1, 28), plainDate(2026, 2, 3)) });
    await userEvent.click(p.button);
    expect(p.calendar.grids).toHaveLength(2);
    await userEvent.click(cell(p, 'Friday, January 30, 2026'));
    await userEvent.click(cell(p, 'Tuesday, February 10, 2026'));
    expect(isoRange(p.value)).toBe('2026-01-30/2026-02-10');
    expect(p.isOpen).toBe(true);
  });

  it("'auto' uses two months on wide viewports", async () => {
    const p = mount({ months: 'auto' });
    await userEvent.click(p.button);
    const wide = window.matchMedia('(min-width: 40rem)').matches;
    expect(p.calendar.grids).toHaveLength(wide ? 2 : 1);
  });

  it('focuses today in the configured timezone when empty (fixed instants)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 13:45 UTC on 15 March is already 16 March 00:15 at Lord Howe (UTC+10:30 until April).
    vi.setSystemTime(Date.UTC(2026, 2, 15, 13, 45));
    const lordHowe = mount({ timezone: 'Australia/Lord_Howe' });
    lordHowe.open();
    expect(activeLabel()).toBe('Monday, March 16, 2026');
    lordHowe.close();
    // 18:40 UTC on 31 December is 1 January 00:10 in Kolkata (UTC+5:30).
    vi.setSystemTime(Date.UTC(2026, 11, 31, 18, 40));
    const kolkata = mount({ timezone: 'Asia/Kolkata' });
    kolkata.open();
    expect(activeLabel()).toBe('Friday, January 1, 2027');
    kolkata.close();
    const utc = mount();
    utc.open();
    expect(activeLabel()).toBe('Thursday, December 31, 2026');
  });

  it('opens with Alt+ArrowDown on either field', async () => {
    const p = mount();
    segments(p, 'start')[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.isOpen).toBe(true);
    p.close();
    segments(p, 'end')[1]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.isOpen).toBe(true);
    expect(segments(p, 'end')[1]!.value).toBe('');
  });

  it('propagates min, max, isDateDisabled, minDays, and maxDays to the calendar', async () => {
    const p = mount({ min: plainDate(2026, 3, 3), max: plainDate(2026, 3, 25), isDateDisabled: (d) => dayOfWeek(d) === 7, minDays: 2, maxDays: 4, value: range(plainDate(2026, 3, 10), plainDate(2026, 3, 11)) });
    await userEvent.click(p.button);
    expect(cell(p, 'Monday, March 2, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'Sunday, March 15, 2026').getAttribute('aria-disabled')).toBe('true');
    await userEvent.click(cell(p, 'Monday, March 16, 2026'));
    expect(cell(p, 'Monday, March 16, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'Friday, March 20, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'Thursday, March 19, 2026').hasAttribute('aria-disabled')).toBe(false);
  });

  it('inside a modal Dialog, Escape closes only the popup', async () => {
    const content = document.createElement('div');
    const d = Dialog.create({ title: 'Book', content });
    d.open();
    const p = mount({}, content);
    await userEvent.click(p.button);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(p.button);
  });

  it('does not open when disabled or read-only', () => {
    const p = mount({ disabled: true });
    expect(p.button.disabled).toBe(true);
    p.open();
    expect(p.isOpen).toBe(false);
    p.update({ disabled: false, readOnly: true });
    p.open();
    expect(p.isOpen).toBe(false);
  });
});

describe('DateRangePicker: typing and validation', () => {
  it('re-emits typed changes from the host; the value appears only when both dates are valid', async () => {
    const p = mount();
    const values: (string | null)[] = [];
    p.host.addEventListener('aui-change', (e) => {
      values.push(isoRange((e as CustomEvent<DateRangePickerChangeDetail>).detail.value));
    });
    await typeDate(p, 'start', '03052026');
    expect(p.value).toBeNull();
    expect(p.validity).toMatchObject({ valid: false, error: 'incomplete-range', field: 'end', message: 'Enter an end date.' });
    // Messages that need the user to finish wait until the field was left.
    expect(errorText(p, 'end')).toBe('');
    await typeDate(p, 'end', '03092026');
    expect(isoRange(p.value)).toBe('2026-03-05/2026-03-09');
    expect(p.validity.valid).toBe(true);
    expect(values.at(-1)).toBe('2026-03-05/2026-03-09');
  });

  it('reports a reversed range on the end field', async () => {
    const p = mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 9)) });
    await typeDate(p, 'end', '03012026');
    expect(p.validity).toMatchObject({ valid: false, error: 'range-reversed', field: 'end', message: 'Enter an end date on or after the start date.' });
    expect(p.value).toBeNull();
    expect(p.getFormValue()).toBeNull();
    p.reportValidity();
    expect(errorText(p, 'end')).toBe('Enter an end date on or after the start date.');
    expect(errorText(p, 'start')).toBe('');
  });

  it('reports too-short and too-long ranges and typed unavailable days', async () => {
    const p = mount({ minDays: 3, maxDays: 7, isDateDisabled: (d) => d.day === 13 });
    await typeDate(p, 'start', '03052026');
    await typeDate(p, 'end', '03062026');
    expect(p.validity).toMatchObject({ error: 'range-too-short', message: 'Choose a range of at least 3 days.' });
    p.setValue(range(plainDate(2026, 3, 5), plainDate(2026, 3, 20)));
    expect(p.value).toBeNull();
    expect(p.validity).toMatchObject({ error: 'range-too-long', message: 'Choose a range of 7 days or fewer.' });
    p.setValue(range(plainDate(2026, 3, 13), plainDate(2026, 3, 16)));
    expect(p.validity).toMatchObject({ error: 'date-unavailable', field: 'start', message: 'This date is not available.' });
    p.update({ maxDays: 1, minDays: 1, isDateDisabled: () => false });
    expect(p.validity.message).toBe('Choose a single day.');
  });

  it('surfaces field errors (incomplete, required, min) from each Date Input', async () => {
    const p = mount({ required: true, min: plainDate(2026, 1, 1) });
    expect(p.validity).toMatchObject({ error: 'value-missing', field: 'start' });
    await typeDate(p, 'start', '0305');
    expect(p.validity).toMatchObject({ error: 'incomplete', field: 'start' });
    await userEvent.keyboard('2025');
    expect(p.validity).toMatchObject({ error: 'range-underflow', field: 'start' });
    expect(p.reportValidity()).toBe(false);
    expect(errorText(p, 'start')).toMatch(/on or after/);
    expect(errorText(p, 'end')).toBe('This field is required.');
  });

  it('runs validate on complete ranges, then an external custom error; user edits clear the external error', async () => {
    const p = mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 9)), validate: (v) => (v?.start.day === 1 ? 'No first-of-month arrivals.' : null) });
    p.setCustomError('Already booked.');
    expect(p.validity).toMatchObject({ valid: false, error: 'custom', field: 'end', message: 'Already booked.' });
    // A custom error keeps the range, as in Date Input and Time Picker.
    expect(isoRange(p.value)).toBe('2026-03-05/2026-03-09');
    await typeDate(p, 'start', '03012026');
    expect(p.validity.message).toBe('No first-of-month arrivals.');
    await typeDate(p, 'start', '03022026');
    expect(p.validity.valid).toBe(true);
  });
});

describe('DateRangePicker: form control contract', () => {
  it('registers itself, not the inner Date Inputs, and serializes an ISO interval', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 9)), startName: 'from', endName: 'to' }, form);
    expect(getFormControl(p.host)).toBe(p);
    expect(getFormControl(p.startInput.host)).toBeUndefined();
    expect(findFormControls(form)).toEqual([p]);
    const data = new FormData(form);
    expect(data.get('stay')).toBe('2026-03-05/2026-03-09');
    expect(data.get('from')).toBe('2026-03-05');
    expect(data.get('to')).toBe('2026-03-09');
    const f = Form.create(form);
    expect(f.getValues()).toMatchObject({ stay: '2026-03-05/2026-03-09' });
    f.destroy();
  });

  it('tracks dirty and touched, and reset restores the initial range without events', async () => {
    const p = mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 9)) });
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', onChange);
    expect(p.dirty).toBe(false);
    await typeDate(p, 'end', '03122026');
    // Every keystroke that changes the value or validity emits (as in Date Picker).
    const typed = onChange.mock.calls.length;
    expect(typed).toBeGreaterThan(0);
    expect(p.dirty).toBe(true);
    await userEvent.tab();
    await userEvent.tab();
    expect(p.touched).toBe(true);
    p.reset();
    expect(isoRange(p.value)).toBe('2026-03-05/2026-03-09');
    expect(p.dirty).toBe(false);
    expect(p.touched).toBe(false);
    p.setValue(null);
    p.update({ value: range(plainDate(2026, 4, 1), plainDate(2026, 4, 2)) });
    expect(isoRange(p.value)).toBe('2026-04-01/2026-04-02');
    expect(onChange).toHaveBeenCalledTimes(typed);
  });

  it('a disabled picker is not submitted', () => {
    const form = document.createElement('form');
    document.body.append(form);
    mount({ value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 9)), disabled: true }, form);
    expect(new FormData(form).get('stay')).toBeNull();
  });

  it('opening the calendar from an empty required field does not mark it touched', async () => {
    const p = mount({ required: true });
    segments(p, 'end')[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.isOpen).toBe(true);
    expect(errorText(p, 'end')).toBe('');
  });
});

describe('DateRangePicker: configuration, RTL, and cleanup', () => {
  it('forwards locale and direction to all children', () => {
    configureAbsoluteUI({ components: { dateRangePicker: { locale: 'de-DE', direction: 'rtl' } } });
    const host = document.body.appendChild(document.createElement('div'));
    const p = DateRangePicker.create(host, { label: 'Zeitraum', value: range(plainDate(2026, 3, 5), plainDate(2026, 3, 9)) });
    expect(segments(p, 'start').map((s) => s.getAttribute('aria-label'))).toEqual(['Day', 'Month', 'Year']);
    expect(p.calendar.grid.dir).toBe('rtl');
    expect(p.button.getAttribute('aria-label')).toBe('Change dates, 5. März 2026 to 9. März 2026');
  });

  it('destroy removes rendering, registration, listeners, and subscriptions', async () => {
    const p = mount();
    await userEvent.click(p.button);
    const host = p.host;
    const button = p.button;
    const onEvent = vi.fn();
    host.addEventListener('aui-open', onEvent);
    p.destroy();
    expect(p.isOpen).toBe(false);
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
    host.append(button);
    await userEvent.click(button);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
