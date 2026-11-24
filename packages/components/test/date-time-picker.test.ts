import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, instantToString, parseInstant, resetAbsoluteUIConfig, type Instant } from '@absoluteui/core';
import { DateTimePicker, type DateTimePickerChangeDetail, type DateTimePickerOptions } from '@absoluteui/components/date-time-picker';
import { Dialog } from '@absoluteui/components/dialog';
import { findFormControls, getFormControl } from '../src/internal/field.js';

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function at(iso: string): Instant {
  const v = parseInstant(iso);
  if (!v) throw new Error(`Bad instant ${iso}`);
  return v;
}

function mount(options: Partial<DateTimePickerOptions> = {}, parent: HTMLElement = document.body): DateTimePicker {
  const host = document.createElement('div');
  parent.append(host);
  return DateTimePicker.create(host, { label: 'Departure', name: 'departure', locale: 'en-US', ...options });
}

const NY = 'America/New_York';
const segments = (p: DateTimePicker): HTMLInputElement[] => Array.from(p.input.group.querySelectorAll('.aui-date-input__segment'));
const segmentValues = (p: DateTimePicker): string[] => segments(p).map((s) => s.value);
const activeLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
const options = (p: DateTimePicker): HTMLElement[] => Array.from(p.listbox.querySelectorAll<HTMLElement>('[role="option"]'));
const option = (p: DateTimePicker, label: string): HTMLElement => {
  const el = options(p).find((o) => o.textContent === label);
  if (!el) throw new Error(`No option ${label}`);
  return el;
};
const activeOption = (p: DateTimePicker): string | null => {
  const id = p.listbox.getAttribute('aria-activedescendant');
  return id ? (document.getElementById(id)?.textContent ?? null) : null;
};
const cell = (p: DateTimePicker, label: string): HTMLTableCellElement => {
  const td = Array.from(p.calendar.grid.querySelectorAll<HTMLTableCellElement>('td')).find((d) => d.getAttribute('aria-label') === label);
  if (!td) throw new Error(`No cell ${label}`);
  return td;
};
const iso = (v: Instant | null): string | null => (v ? instantToString(v) : null);
const hintText = (p: DateTimePicker): string => p.host.querySelector('.aui-date-input__hint')!.textContent;
const errorText = (p: DateTimePicker): string => p.host.querySelector('.aui-date-input__error')!.textContent;

describe('DateTimePicker: structure', () => {
  it('renders the trigger inside the field and a non-modal dialog with a calendar, time listbox, and Done button', () => {
    const p = mount();
    expect(p.input.group.contains(p.button)).toBe(true);
    expect(p.button.getAttribute('aria-label')).toBe('Choose date and time');
    expect(p.button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(p.button.getAttribute('aria-expanded')).toBe('false');
    expect(p.button.getAttribute('aria-controls')).toBe(p.popup.id);
    expect(p.popup.getAttribute('role')).toBe('dialog');
    expect(p.popup.getAttribute('aria-modal')).toBe('false');
    expect(p.popup.getAttribute('aria-label')).toBe('Choose date and time');
    expect(p.popup.popover).toBe('manual');
    expect(p.popup.matches(':popover-open')).toBe(false);
    expect(p.popup.contains(p.calendar.grid)).toBe(true);
    expect(p.listbox.getAttribute('role')).toBe('listbox');
    expect(document.getElementById(p.listbox.getAttribute('aria-labelledby')!)?.textContent).toBe('Time');
    expect(p.doneButton.textContent).toBe('Done');
    // Minute granularity segments with the time-zone hint.
    expect(segments(p).map((s) => s.getAttribute('aria-label'))).toEqual(['Month', 'Day', 'Year', 'Hour', 'Minute', 'AM/PM']);
    expect(hintText(p)).toContain('Time zone: Coordinated Universal Time');
  });

  it('suggests times every step minutes, formatted per locale and hourCycle', () => {
    const p = mount();
    expect(options(p)).toHaveLength(48);
    expect(options(p).slice(0, 3).map((o) => o.textContent)).toEqual(['12:00 AM', '12:30 AM', '1:00 AM']);
    p.update({ step: 60, hourCycle: 'h23' });
    expect(options(p)).toHaveLength(24);
    expect(options(p)[13]!.textContent).toBe('13:00');
    expect(segments(p).some((s) => s.getAttribute('aria-label') === 'AM/PM')).toBe(false);
  });

  it('names the button with the selected date and time in the configured timezone', () => {
    const p = mount({ value: at('2026-05-10T08:30:00Z'), timezone: 'Asia/Kolkata' });
    expect(p.button.getAttribute('aria-label')).toBe('Change date and time, May 10, 2026 at 2:00 PM');
    expect(segmentValues(p)).toEqual(['05', '10', '2026', '02', '00', 'PM']);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => DateTimePicker.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => DateTimePicker.create(host, { label: 'x', min: at('2026-05-01T00:00:00Z'), max: at('2026-01-01T00:00:00Z') })).toThrow(/min/);
    expect(() => DateTimePicker.create(host, { label: 'x', timezone: 'Mars/Olympus' })).toThrow(AbsoluteUIError);
    expect(() => DateTimePicker.create(host, { label: 'x', step: 0 })).toThrow(AbsoluteUIError);
    expect(() => DateTimePicker.create(host, { label: 'x', firstDayOfWeek: 0 as 1 })).toThrow(/firstDayOfWeek/);
    expect(() => DateTimePicker.create(host, { label: 'x', value: { kind: 'PlainDate', year: 2026, month: 1, day: 1 } as unknown as Instant })).toThrow(/value/);
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
  });
});

describe('DateTimePicker: picking', () => {
  it('picks a day then a time with the keyboard (Asia/Kolkata) and emits from the host', async () => {
    const p = mount({ value: at('2026-05-10T08:30:00Z'), timezone: 'Asia/Kolkata' });
    const events: DateTimePickerChangeDetail[] = [];
    const targets: EventTarget[] = [];
    document.body.addEventListener('aui-change', (e) => {
      events.push((e as CustomEvent<DateTimePickerChangeDetail>).detail);
      if (e.target) targets.push(e.target);
    });
    await userEvent.click(p.button);
    expect(activeLabel()).toBe('Sunday, May 10, 2026');
    expect(activeOption(p)).toBe('2:00 PM');
    // Choosing a day keeps the time of day and keeps the popup open.
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(iso(p.value)).toBe('2026-05-11T08:30:00.000Z');
    expect(p.isOpen).toBe(true);
    // Tab: day -> time listbox -> Done.
    await userEvent.tab();
    expect(document.activeElement).toBe(p.listbox);
    await userEvent.keyboard('{ArrowDown}');
    expect(activeOption(p)).toBe('2:30 PM');
    await userEvent.keyboard('{Enter}');
    expect(iso(p.value)).toBe('2026-05-11T09:00:00.000Z');
    expect(p.getFormValue()).toBe('2026-05-11T09:00:00.000Z');
    expect(segmentValues(p)).toEqual(['05', '11', '2026', '02', '30', 'PM']);
    expect(events.map((d) => iso(d.value))).toEqual(['2026-05-11T08:30:00.000Z', '2026-05-11T09:00:00.000Z']);
    expect(events.every((d) => d.validity.valid)).toBe(true);
    expect(targets).toEqual([p.host, p.host]);
    // closeOnSelect: picking a time closes and returns focus to the trigger.
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
  });

  it('uses 09:00 in UTC when a day is picked in an empty field (fixed clock)', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 5, 15, 12, 0));
    const p = mount();
    await userEvent.click(p.button);
    expect(activeLabel()).toBe('Monday, June 15, 2026');
    expect(activeOption(p)).toBe('9:00 AM');
    await userEvent.keyboard('{Enter}');
    expect(iso(p.value)).toBe('2026-06-15T09:00:00.000Z');
    expect(option(p, '9:00 AM').getAttribute('aria-selected')).toBe('true');
  });

  it('picks a time first on an empty field using the focused day, with the pointer', async () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 5, 15, 12, 0));
    const p = mount();
    await userEvent.click(p.button);
    // Unstyled in unit tests, the listbox does not scroll and the option lies outside the viewport; click it directly.
    option(p, '6:30 PM').click();
    expect(iso(p.value)).toBe('2026-06-15T18:30:00.000Z');
    expect(p.isOpen).toBe(false);
  });

  it('nonexistent 2026-03-08 02:30 in New York becomes 03:30 EDT under compatible, with a hint', async () => {
    const p = mount({ value: at('2026-03-07T07:30:00Z'), timezone: NY });
    expect(segmentValues(p)).toEqual(['03', '07', '2026', '02', '30', 'AM']);
    await userEvent.click(p.button);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(iso(p.value)).toBe('2026-03-08T07:30:00.000Z');
    expect(p.validity).toMatchObject({ valid: true, localTimeStatus: 'nonexistent' });
    expect(hintText(p)).toContain('Adjusted to 3:30 AM because of a daylight-saving change.');
    // The segments keep the chosen wall-clock time, like typing it.
    expect(segmentValues(p)).toEqual(['03', '08', '2026', '02', '30', 'AM']);
    expect(option(p, '2:30 AM').getAttribute('aria-selected')).toBe('true');
  });

  it("nonexistent time with disambiguation 'reject' is an error", async () => {
    const p = mount({ value: at('2026-03-08T06:00:00Z'), timezone: NY, disambiguation: 'reject' });
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', (e) => {
      onChange((e as CustomEvent<DateTimePickerChangeDetail>).detail);
    });
    await userEvent.click(p.button);
    await userEvent.tab();
    await userEvent.click(option(p, '2:30 AM'));
    expect(p.value).toBeNull();
    expect(p.getFormValue()).toBeNull();
    expect(p.validity).toMatchObject({ valid: false, error: 'nonexistent-time' });
    expect(errorText(p)).toContain('This time does not exist in Eastern');
    expect(onChange).toHaveBeenCalledWith(expect.objectContaining({ value: null }));
    // Picking another time keeps the date.
    await userEvent.click(p.button);
    await userEvent.click(option(p, '4:00 AM'));
    expect(iso(p.value)).toBe('2026-03-08T08:00:00.000Z');
    expect(p.validity.valid).toBe(true);
  });

  it('ambiguous 2026-11-01 01:30 in New York resolves to the earlier offset, with a hint', async () => {
    const p = mount({ value: at('2026-10-31T05:30:00Z'), timezone: NY });
    await userEvent.click(p.button);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(iso(p.value)).toBe('2026-11-01T05:30:00.000Z');
    expect(p.validity.localTimeStatus).toBe('ambiguous');
    expect(hintText(p)).toContain('the earlier occurrence (GMT-4) is used');
    // The segments keep the wall-clock time, so a policy change re-resolves it.
    p.update({ disambiguation: 'later' });
    expect(iso(p.value)).toBe('2026-11-01T06:30:00.000Z');
    expect(hintText(p)).toContain('the later occurrence (GMT-5) is used');
  });

  it('stays open after a time when closeOnSelect is false; Done closes and focuses the trigger', async () => {
    configureAbsoluteUI({ components: { dateTimePicker: { closeOnSelect: false } } });
    const p = mount({ value: at('2026-05-10T08:30:00Z') });
    await userEvent.click(p.button);
    await userEvent.tab();
    await userEvent.keyboard('{End}{Enter}');
    expect(iso(p.value)).toBe('2026-05-10T23:30:00.000Z');
    expect(p.isOpen).toBe(true);
    await userEvent.tab();
    expect(document.activeElement).toBe(p.doneButton);
    await userEvent.keyboard('{Enter}');
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
  });

  it('re-emits typed changes from the host and follows them in the popup', async () => {
    const p = mount({ timezone: 'UTC' });
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', (e) => {
      onChange(e.target, iso((e as CustomEvent<DateTimePickerChangeDetail>).detail.value));
    });
    segments(p)[0]!.focus();
    await userEvent.keyboard('122520260745p');
    expect(onChange).toHaveBeenLastCalledWith(p.host, '2026-12-25T19:45:00.000Z');
    await userEvent.click(p.button);
    expect(activeLabel()).toBe('Friday, December 25, 2026');
    expect(activeOption(p)).toBe('7:30 PM');
  });
});

describe('DateTimePicker: popup behavior', () => {
  it('Escape closes and returns focus to the trigger; aui-open/aui-close do not bubble', async () => {
    const p = mount({ value: at('2026-05-10T08:30:00Z') });
    const onOpen = vi.fn();
    const onClose = vi.fn();
    const bubbled = vi.fn();
    p.host.addEventListener('aui-open', onOpen);
    p.host.addEventListener('aui-close', onClose);
    document.body.addEventListener('aui-open', bubbled);
    document.body.addEventListener('aui-close', bubbled);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(true);
    expect(p.button.getAttribute('aria-expanded')).toBe('true');
    await userEvent.tab();
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
  });

  it('inside a modal Dialog, Escape closes only the popup', async () => {
    const content = document.createElement('div');
    const d = Dialog.create({ title: 'Book', content });
    d.open();
    const p = mount({ value: at('2026-05-10T08:30:00Z') }, content);
    await userEvent.click(p.button);
    await userEvent.tab();
    expect(document.activeElement).toBe(p.listbox);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(p.button);
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(false);
  });

  it('opens with Alt+ArrowDown on a segment; Tab past Done closes', async () => {
    const outside = document.createElement('button');
    outside.textContent = 'Next';
    const p = mount({ value: at('2026-05-10T08:30:00Z') });
    document.body.append(outside);
    segments(p)[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.isOpen).toBe(true);
    expect(segments(p)[0]!.value).toBe('05');
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(p.isOpen).toBe(false);
  });

  it('min/max bound the calendar, the suggested times, and validation', async () => {
    const p = mount({ value: at('2026-05-10T12:00:00Z'), min: at('2026-05-10T09:30:00Z'), max: at('2026-05-20T17:00:00Z') });
    await userEvent.click(p.button);
    expect(cell(p, 'Saturday, May 9, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'Thursday, May 21, 2026').getAttribute('aria-disabled')).toBe('true');
    expect(option(p, '9:00 AM').getAttribute('aria-disabled')).toBe('true');
    expect(option(p, '9:30 AM').hasAttribute('aria-disabled')).toBe(false);
    // An unavailable time cannot be picked.
    await userEvent.tab();
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    option(p, '9:00 AM').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    expect(iso(p.value)).toBe('2026-05-10T12:00:00.000Z');
    p.close();
    segments(p)[5]!.focus();
    await userEvent.keyboard('a');
    expect(p.validity.error).toBe('range-underflow');
    expect(errorText(p)).toMatch(/^Enter a value on or after May 10, 2026, 9:30\sAM\.$/);
  });

  it('reports a typed disabled day as unavailable', async () => {
    const p = mount({ isDateDisabled: (d) => d.day === 13 });
    segments(p)[0]!.focus();
    await userEvent.keyboard('031320260900a');
    expect(p.validity).toMatchObject({ valid: false, error: 'custom', message: 'This date is not available.' });
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

describe('DateTimePicker: form control contract', () => {
  it('registers itself, not the inner Date Input, with Form', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({}, form);
    expect(getFormControl(p.host)).toBe(p);
    expect(getFormControl(p.input.host)).toBeUndefined();
    expect(findFormControls(form)).toEqual([p]);
    expect(p.name).toBe('departure');
    expect(p.label).toBe('Departure');
    expect(p.host.querySelector<HTMLInputElement>('input[type="hidden"]')!.name).toBe('departure');
  });

  it('delegates validity, custom errors, dirty, touched, and reset; getFormValue is ISO with Z', async () => {
    const p = mount({ required: true, value: at('2026-05-10T08:30:00Z') });
    expect(p.getFormValue()).toBe('2026-05-10T08:30:00.000Z');
    expect(p.dirty).toBe(false);
    await userEvent.click(p.button);
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(p.dirty).toBe(true);
    p.close();
    (document.activeElement as HTMLElement | null)?.blur();
    expect(p.touched).toBe(true);
    p.setCustomError('Flight full.');
    expect(p.validity).toMatchObject({ valid: false, error: 'custom', message: 'Flight full.' });
    expect(p.reportValidity()).toBe(false);
    expect(errorText(p)).toBe('Flight full.');
    p.reset();
    expect(iso(p.value)).toBe('2026-05-10T08:30:00.000Z');
    expect(p.dirty).toBe(false);
    expect(p.touched).toBe(false);
    expect(p.validity.valid).toBe(true);
    p.setValue(null);
    expect(p.validity.error).toBe('value-missing');
    expect(p.getFormValue()).toBeNull();
  });

  it('programmatic changes emit nothing', () => {
    const p = mount();
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', onChange);
    p.setValue(at('2026-01-01T10:00:00Z'));
    p.update({ value: at('2026-02-02T10:00:00Z') });
    p.reset();
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe('DateTimePicker: configuration and cleanup', () => {
  it('forwards dateTimePicker locale, timezone, and hourCycle to the children', () => {
    configureAbsoluteUI({ components: { dateTimePicker: { locale: 'de-DE', timezone: 'Asia/Kolkata', hourCycle: 'h23' } } });
    const host = document.body.appendChild(document.createElement('div'));
    const p = DateTimePicker.create(host, { label: 'Abflug', value: at('2026-05-10T08:30:00Z') });
    expect(segmentValues(p)).toEqual(['10', '05', '2026', '14', '00']);
    expect(options(p)[27]!.textContent).toBe('13:30');
    expect(p.button.getAttribute('aria-label')).toBe('Change date and time, 10. Mai 2026 um 14:00');
  });

  it('creates 100 instances within the budget (< 15 ms average)', () => {
    const start = performance.now();
    for (let i = 0; i < 100; i++) mount({ value: at('2026-05-10T08:30:00Z'), timezone: NY });
    expect((performance.now() - start) / 100).toBeLessThan(15);
  });

  it('typeahead moves the active time', async () => {
    const p = mount({ value: at('2026-05-10T08:30:00Z') });
    await userEvent.click(p.button);
    await userEvent.tab();
    // Keys in one task: the typeahead buffer resets after a pause, which a loaded machine could exceed between keystrokes.
    const target = document.activeElement!;
    for (const key of '10:3') target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
    expect(activeOption(p)).toBe('10:30 AM');
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
    expect(host.classList.contains('aui-date-time-picker')).toBe(false);
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    host.append(button);
    await userEvent.click(button);
    expect(onEvent).not.toHaveBeenCalled();
    configureAbsoluteUI({ components: { dateTimePicker: { step: 15 } } });
    expect(host.childElementCount).toBe(1);
  });
});
