import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { DatePicker, type DatePickerChangeDetail, type DatePickerOptions } from '@absoluteui/components/date-picker';
import { Dialog } from '@absoluteui/components/dialog';
import { findFormControls, getFormControl } from '../src/internal/field.js';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<DatePickerOptions> = {}, parent: HTMLElement = document.body): DatePicker {
  const host = document.createElement('div');
  parent.append(host);
  return DatePicker.create(host, { label: 'Start date', name: 'start', locale: 'en-US', ...options });
}

const segments = (p: DatePicker): HTMLInputElement[] => Array.from(p.input.group.querySelectorAll('.aui-date-input__segment'));
const activeLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
const cell = (p: DatePicker, label: string): HTMLTableCellElement => {
  const td = Array.from(p.calendar.grid.querySelectorAll<HTMLTableCellElement>('td')).find((d) => d.getAttribute('aria-label') === label);
  if (!td) throw new Error(`No cell ${label}`);
  return td;
};
const iso = (d: PlainDate | null): string | null => (d ? plainDateToString(d) : null);
const errorText = (p: DatePicker): string => p.host.querySelector('.aui-date-input__error')!.textContent;

describe('DatePicker: structure', () => {
  it('renders the calendar button inside the field and a non-modal dialog popup', () => {
    const p = mount();
    expect(p.input.group.contains(p.button)).toBe(true);
    expect(p.button.getAttribute('aria-label')).toBe('Choose date');
    expect(p.button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(p.button.getAttribute('aria-expanded')).toBe('false');
    expect(p.button.getAttribute('aria-controls')).toBe(p.popup.id);
    expect(p.popup.getAttribute('role')).toBe('dialog');
    expect(p.popup.getAttribute('aria-modal')).toBe('false');
    expect(p.popup.getAttribute('aria-label')).toBe('Choose date');
    expect(p.popup.popover).toBe('manual');
    expect(p.popup.matches(':popover-open')).toBe(false);
    expect(p.popup.contains(p.calendar.grid)).toBe(true);
  });

  it('names the button with the selected date', () => {
    const p = mount({ value: plainDate(2026, 3, 5) });
    expect(p.button.getAttribute('aria-label')).toBe('Change date, March 5, 2026');
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => DatePicker.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => DatePicker.create(host, { label: 'x', min: plainDate(2026, 5, 1), max: plainDate(2026, 1, 1) })).toThrow(/min/);
    expect(() => DatePicker.create(host, { label: 'x', timezone: 'Mars/Olympus' })).toThrow(AbsoluteUIError);
    expect(() => DatePicker.create(host, { label: 'x', firstDayOfWeek: 0 as 1 })).toThrow(/firstDayOfWeek/);
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
  });
});

describe('DatePicker: popup', () => {
  it('opens from the button, focuses the selected day, and Escape returns focus to the button', async () => {
    const p = mount({ value: plainDate(2026, 3, 5) });
    const onOpen = vi.fn();
    const onClose = vi.fn();
    p.host.addEventListener('aui-open', onOpen);
    p.host.addEventListener('aui-close', onClose);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(true);
    expect(p.popup.matches(':popover-open')).toBe(true);
    expect(p.button.getAttribute('aria-expanded')).toBe('true');
    expect(activeLabel()).toBe('Thursday, March 5, 2026');
    expect(onOpen).toHaveBeenCalledTimes(1);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('focuses today in the configured timezone when empty (fixed instant)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 2, 15, 10, 30));
    const p = mount({ timezone: 'Pacific/Kiritimati' });
    p.open();
    expect(activeLabel()).toBe('Monday, March 16, 2026');
    p.close();
    expect(document.activeElement).toBe(p.button);
  });

  it('opens with Alt+ArrowDown on a segment without changing the segment', async () => {
    const p = mount({ value: plainDate(2026, 3, 5) });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.isOpen).toBe(true);
    expect(segments(p)[0]!.value).toBe('03');
    expect(activeLabel()).toBe('Thursday, March 5, 2026');
  });

  it('writes the picked date, emits aui-change from the host once, closes, and focuses the button', async () => {
    const p = mount({ value: plainDate(2026, 3, 5) });
    const events: DatePickerChangeDetail[] = [];
    const targets: EventTarget[] = [];
    document.body.addEventListener('aui-change', (e) => {
      events.push((e as CustomEvent<DatePickerChangeDetail>).detail);
      if (e.target) targets.push(e.target);
    });
    await userEvent.click(p.button);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(iso(p.value)).toBe('2026-03-06');
    expect(segments(p).map((s) => s.value)).toEqual(['03', '06', '2026']);
    expect(p.getFormValue()).toBe('2026-03-06');
    expect(events).toHaveLength(1);
    expect(iso(events[0]!.value)).toBe('2026-03-06');
    expect(events[0]!.validity.valid).toBe(true);
    expect(targets).toEqual([p.host]);
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
    expect(p.button.getAttribute('aria-label')).toBe('Change date, March 6, 2026');
  });

  it('picks with the pointer and stays open when closeOnSelect is false', async () => {
    configureAbsoluteUI({ components: { datePicker: { closeOnSelect: false } } });
    const p = mount({ value: plainDate(2026, 3, 5) });
    await userEvent.click(p.button);
    await userEvent.click(cell(p, 'Tuesday, March 10, 2026'));
    expect(iso(p.value)).toBe('2026-03-10');
    expect(p.isOpen).toBe(true);
  });

  it('re-emits typed changes from the host with the Date Input detail shape', async () => {
    const p = mount();
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', (e) => {
      onChange(e.target, iso((e as CustomEvent<DatePickerChangeDetail>).detail.value));
    });
    segments(p)[0]!.focus();
    await userEvent.keyboard('12252026');
    expect(onChange).toHaveBeenLastCalledWith(p.host, '2026-12-25');
    await userEvent.click(p.button);
    expect(activeLabel()).toBe('Friday, December 25, 2026');
  });

  it('closes on an outside pointer and when focus leaves the popup', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'Elsewhere';
    const p = mount();
    document.body.append(outside);
    await userEvent.click(p.button);
    // Unstyled in unit tests, the popup covers the page; press the pointer on the outside element directly.
    outside.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(p.isOpen).toBe(false);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(true);
    // Popup order: previous, next, then the grid's day; Tab from the day leaves the popup.
    await userEvent.tab();
    expect(p.isOpen).toBe(false);
  });

  it('toggles closed from the button', async () => {
    const p = mount();
    await userEvent.click(p.button);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(false);
  });

  it('propagates min, max, isDateDisabled, and firstDayOfWeek to the calendar', async () => {
    const p = mount({ value: plainDate(2026, 3, 5), min: plainDate(2026, 3, 3), max: plainDate(2026, 3, 20), isDateDisabled: (d) => d.day === 13, firstDayOfWeek: 1 });
    await userEvent.click(p.button);
    expect(cell(p, 'Monday, March 2, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'Saturday, March 21, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'Friday, March 13, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(p.calendar.grid.querySelector('th.aui-calendar__weekday')!.textContent).toBe('Mon');
    await userEvent.keyboard('{PageUp}');
    expect(activeLabel()).toBe('Tuesday, March 3, 2026');
    p.update({ max: plainDate(2026, 3, 15) });
    expect(cell(p, 'Monday, March 16, 2026').getAttribute('aria-disabled')).toBe('true');
  });

  it('reports a typed disabled day as unavailable', async () => {
    const p = mount({ isDateDisabled: (d) => plainDateToString(d) === '2026-03-13' });
    segments(p)[0]!.focus();
    await userEvent.keyboard('03132026');
    expect(p.validity).toMatchObject({ valid: false, error: 'custom', message: 'This date is not available.' });
    expect(iso(p.value)).toBe('2026-03-13');
    await userEvent.keyboard('{Backspace}{Backspace}{Backspace}{Backspace}2027');
    expect(p.validity.valid).toBe(true);
  });

  it('inside a modal Dialog, Escape closes only the popup', async () => {
    const content = document.createElement('div');
    const d = Dialog.create({ title: 'Book', content });
    d.open();
    const p = mount({ value: plainDate(2026, 3, 5) }, content);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(p.button);
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(false);
  });

  it('does not open when disabled or read-only', () => {
    const p = mount({ disabled: true });
    expect(p.button.disabled).toBe(true);
    p.open();
    expect(p.isOpen).toBe(false);
    p.update({ disabled: false, readOnly: true });
    p.open();
    expect(p.isOpen).toBe(false);
    expect(p.button.disabled).toBe(true);
  });
});

describe('DatePicker: form control contract', () => {
  it('registers itself, not the inner Date Input, with Form', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({}, form);
    expect(getFormControl(p.host)).toBe(p);
    expect(getFormControl(p.input.host)).toBeUndefined();
    expect(findFormControls(form)).toEqual([p]);
    expect(p.name).toBe('start');
    expect(p.label).toBe('Start date');
  });

  it('delegates validity, reportValidity, custom errors, dirty, touched, and reset', async () => {
    const p = mount({ required: true, value: plainDate(2026, 3, 5) });
    expect(p.dirty).toBe(false);
    await userEvent.click(p.button);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(p.dirty).toBe(true);
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    await userEvent.tab({ shift: true });
    expect(p.touched).toBe(true);
    p.setCustomError('Already booked.');
    expect(p.validity).toMatchObject({ valid: false, error: 'custom', message: 'Already booked.' });
    expect(p.reportValidity()).toBe(false);
    expect(errorText(p)).toBe('Already booked.');
    p.reset();
    expect(iso(p.value)).toBe('2026-03-05');
    expect(p.dirty).toBe(false);
    expect(p.touched).toBe(false);
    expect(p.validity.valid).toBe(true);
    p.setValue(null);
    expect(p.validity.error).toBe('value-missing');
    expect(p.getFormValue()).toBeNull();
  });

  it('opening the calendar from an empty required field does not mark it touched', async () => {
    const p = mount({ required: true });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.touched).toBe(false);
    expect(errorText(p)).toBe('');
  });

  it('programmatic changes emit nothing', () => {
    const p = mount();
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', onChange);
    p.setValue(plainDate(2026, 1, 1));
    p.update({ value: plainDate(2026, 2, 2) });
    p.reset();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DatePicker: configuration and cleanup', () => {
  it('forwards the datePicker locale to both children', () => {
    configureAbsoluteUI({ components: { datePicker: { locale: 'de-DE' } } });
    const host = document.body.appendChild(document.createElement('div'));
    const p = DatePicker.create(host, { label: 'Datum', value: plainDate(2026, 3, 5) });
    expect(segments(p).map((s) => s.getAttribute('aria-label'))).toEqual(['Day', 'Month', 'Year']);
    expect(p.button.getAttribute('aria-label')).toBe('Change date, 5. März 2026');
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
    expect(host.classList.contains('aui-date-picker')).toBe(false);
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    host.append(button);
    await userEvent.click(button);
    expect(onEvent).not.toHaveBeenCalled();
  });
});
