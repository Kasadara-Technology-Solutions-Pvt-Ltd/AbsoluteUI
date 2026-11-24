import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, plainDate, plainYearMonth, plainYearMonthToString, resetAbsoluteUIConfig, type PlainYearMonth } from '@absoluteui/core';
import { MonthPicker, type MonthPickerChangeDetail, type MonthPickerOptions } from '@absoluteui/components/month-picker';
import { Dialog } from '@absoluteui/components/dialog';
import { Form } from '@absoluteui/components/form';
import { findFormControls, getFormControl } from '../src/internal/field.js';

// The shared period-picker engine (segments, popup grid, validation) is covered here;
// year-picker.test.ts and quarter-picker.test.ts cover what differs.

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const TODAY = plainDate(2026, 9, 27);

function mount(options: Partial<MonthPickerOptions> = {}, parent: HTMLElement = document.body): MonthPicker {
  const host = document.createElement('div');
  parent.append(host);
  return MonthPicker.create(host, { label: 'Billing month', name: 'month', locale: 'en-US', today: TODAY, ...options });
}

const segments = (p: MonthPicker): HTMLInputElement[] => Array.from(p.group.querySelectorAll('.aui-period-picker__segment'));
const cells = (p: MonthPicker): HTMLElement[] => Array.from(p.grid.querySelectorAll<HTMLElement>('[role="gridcell"]'));
const cell = (p: MonthPicker, label: string): HTMLElement => {
  const c = cells(p).find((x) => x.getAttribute('aria-label') === label);
  if (!c) throw new Error(`No cell ${label}`);
  return c;
};
const activeLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
const heading = (p: MonthPicker): string => p.popup.querySelector('.aui-period-picker__heading')!.textContent;
const iso = (v: PlainYearMonth | null): string | null => (v ? plainYearMonthToString(v) : null);
const errorText = (p: MonthPicker): string => p.host.querySelector('.aui-field__error')!.textContent;

describe('MonthPicker: structure', () => {
  it('renders locale-ordered segments in a labelled group, a dialog button, and a 4x3 grid', () => {
    const p = mount({ value: plainYearMonth(2026, 3) });
    expect(p.group.getAttribute('role')).toBe('group');
    expect(document.getElementById(p.group.getAttribute('aria-labelledby')!)!.textContent).toContain('Billing month');
    expect(segments(p).map((s) => s.getAttribute('aria-label'))).toEqual(['Month', 'Year']);
    expect(segments(p).map((s) => s.value)).toEqual(['03', '2026']);
    expect(p.button.getAttribute('aria-haspopup')).toBe('dialog');
    expect(p.button.getAttribute('aria-label')).toBe('Change month, March 2026');
    expect(p.popup.getAttribute('role')).toBe('dialog');
    expect(p.popup.getAttribute('aria-label')).toBe('Choose month');
    expect(p.grid.getAttribute('role')).toBe('grid');
    expect(p.grid.querySelectorAll('[role="row"]')).toHaveLength(4);
    expect(cells(p)).toHaveLength(12);
  });

  it('orders segments by locale', () => {
    expect(segments(mount({ locale: 'sv-SE' })).map((s) => s.getAttribute('aria-label'))).toEqual(['Year', 'Month']);
    expect(segments(mount({ locale: 'de-DE' })).map((s) => s.getAttribute('aria-label'))).toEqual(['Month', 'Year']);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => MonthPicker.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => MonthPicker.create(host, { label: 'x', value: plainDate(2026, 1, 1) as unknown as PlainYearMonth })).toThrow(/monthPicker.value/);
    expect(() => MonthPicker.create(host, { label: 'x', min: plainYearMonth(2026, 5), max: plainYearMonth(2026, 1) })).toThrow(/min/);
    expect(() => MonthPicker.create(host, { label: 'x', isMonthDisabled: 'no' as unknown as () => boolean })).toThrow(/isMonthDisabled/);
    expect(() => MonthPicker.create(host, { label: 'x', timezone: 'Mars/Olympus' })).toThrow(AbsoluteUIError);
    expect(() => MonthPicker.create(host, { label: 'x', validationTiming: 'never' as 'blur' })).toThrow(AbsoluteUIError);
    try {
      MonthPicker.create(host, { label: 'x', value: plainYearMonth(0, 1) });
    } catch (e) {
      expect((e as AbsoluteUIError).code).toBe('MONTH_PICKER_OPTIONS');
    }
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
  });
});

describe('MonthPicker: typing', () => {
  it('parses complete segments, auto-advances, and emits a bubbling aui-change', async () => {
    const p = mount();
    const events: MonthPickerChangeDetail[] = [];
    document.body.addEventListener('aui-change', (e) => events.push((e as CustomEvent<MonthPickerChangeDetail>).detail));
    segments(p)[0]!.focus();
    await userEvent.keyboard('4');
    expect(segments(p)[0]!.value).toBe('04');
    expect(document.activeElement).toBe(segments(p)[1]);
    await userEvent.keyboard('2027');
    expect(iso(p.value)).toBe('2027-04');
    expect(p.getFormValue()).toBe('2027-04');
    expect(events.at(-1)!.validity.valid).toBe(true);
    expect(iso(events.at(-1)!.value)).toBe('2027-04');
  });

  it('reports incomplete, 4-digit year, and invalid input', async () => {
    const p = mount();
    segments(p)[0]!.focus();
    await userEvent.keyboard('1');
    expect(p.validity).toMatchObject({ valid: false, error: 'incomplete', message: 'Enter a complete month.' });
    await userEvent.keyboard('0{ArrowRight}26');
    expect(p.validity).toMatchObject({ error: 'incomplete', message: 'Enter the year with 4 digits.' });
    await userEvent.keyboard('{Backspace}{Backspace}2026');
    expect(iso(p.value)).toBe('2026-10');
    segments(p)[0]!.value = '13';
    segments(p)[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(p.validity).toMatchObject({ error: 'invalid', message: 'Enter a valid month.' });
    expect(p.value).toBeNull();
  });

  it('steps segments with ArrowUp/ArrowDown (month wraps, empty year starts at the current year)', async () => {
    const p = mount();
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(p)[0]!.value).toBe('12');
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(p)[0]!.value).toBe('01');
    segments(p)[1]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(p)[1]!.value).toBe('2026');
    expect(iso(p.value)).toBe('2026-01');
  });

  it('checks min, max, isMonthDisabled, then validate, then a custom error', async () => {
    const p = mount({ min: plainYearMonth(2026, 1), max: plainYearMonth(2026, 12), isMonthDisabled: (v) => v.month === 8, validate: (v) => (v?.month === 2 ? 'February is closed.' : null) });
    p.setValue(plainYearMonth(2025, 12));
    expect(p.validity).toMatchObject({ error: 'range-underflow', message: 'Enter January 2026 or later.' });
    p.setValue(plainYearMonth(2027, 1));
    expect(p.validity).toMatchObject({ error: 'range-overflow', message: 'Enter December 2026 or earlier.' });
    p.setValue(plainYearMonth(2026, 8));
    expect(p.validity).toMatchObject({ error: 'unavailable', message: 'This month is not available.' });
    expect(p.value).toBeNull();
    p.setValue(plainYearMonth(2026, 2));
    expect(p.validity).toMatchObject({ error: 'custom', message: 'February is closed.' });
    p.setValue(plainYearMonth(2026, 3));
    p.setCustomError('Already invoiced.');
    expect(p.validity).toMatchObject({ error: 'custom', message: 'Already invoiced.' });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(p.validity.valid).toBe(true);
  });

  it('shows messages after blur (default timing) and on reportValidity', async () => {
    const p = mount({ required: true });
    expect(errorText(p)).toBe('');
    segments(p)[0]!.focus();
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(p.touched).toBe(true);
    expect(errorText(p)).toBe('This field is required.');
    expect(segments(p).every((s) => s.getAttribute('aria-invalid') === 'true')).toBe(true);
    expect(p.group.getAttribute('aria-describedby')).toContain(p.host.querySelector('.aui-field__error')!.id);
    const q = mount({ required: true, validationTiming: 'submit' });
    expect(q.reportValidity()).toBe(false);
    expect(errorText(q)).toBe('This field is required.');
  });
});

describe('MonthPicker: popup grid', () => {
  it('opens on the selected month, marks the current month, and picks with Enter', async () => {
    const p = mount({ value: plainYearMonth(2026, 3) });
    const onOpen = vi.fn();
    p.host.addEventListener('aui-open', onOpen);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(true);
    expect(onOpen).toHaveBeenCalledTimes(1);
    expect(p.button.getAttribute('aria-expanded')).toBe('true');
    expect(heading(p)).toBe('2026');
    expect(activeLabel()).toBe('March 2026');
    expect(cell(p, 'March 2026').getAttribute('aria-selected')).toBe('true');
    expect(cell(p, 'September 2026').getAttribute('aria-current')).toBe('date');
    expect(cells(p).filter((c) => c.tabIndex === 0)).toHaveLength(1);
    expect(cell(p, 'March 2026').textContent).toBe('Mar');
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{Enter}');
    expect(iso(p.value)).toBe('2026-07');
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
    expect(segments(p).map((s) => s.value)).toEqual(['07', '2026']);
  });

  it('moves by grid rules: rows, Home/End, pages across years, Shift+PageDown by ten years', async () => {
    const p = mount({ value: plainYearMonth(2026, 1) });
    p.open();
    await userEvent.keyboard('{ArrowLeft}');
    expect(activeLabel()).toBe('December 2025');
    expect(heading(p)).toBe('2025');
    await userEvent.keyboard('{Home}');
    expect(activeLabel()).toBe('October 2025');
    await userEvent.keyboard('{End}');
    expect(activeLabel()).toBe('December 2025');
    await userEvent.keyboard('{ArrowUp}');
    expect(activeLabel()).toBe('September 2025');
    await userEvent.keyboard('{PageDown}');
    expect(activeLabel()).toBe('September 2026');
    await userEvent.keyboard('{Shift>}{PageDown}{/Shift}');
    expect(activeLabel()).toBe('September 2036');
  });

  it('mirrors Left/Right in RTL', async () => {
    const p = mount({ value: plainYearMonth(2026, 5), direction: 'rtl' });
    p.open();
    expect(p.grid.dir).toBe('rtl');
    await userEvent.keyboard('{ArrowLeft}');
    expect(activeLabel()).toBe('June 2026');
  });

  it('pages with the header buttons and disables them at min/max; out-of-range months are not selectable', async () => {
    const p = mount({ value: plainYearMonth(2026, 3), min: plainYearMonth(2026, 2), max: plainYearMonth(2027, 6) });
    p.open();
    const prev = p.popup.querySelector<HTMLElement>('.aui-period-picker__prev')!;
    const next = p.popup.querySelector<HTMLElement>('.aui-period-picker__next')!;
    expect(prev.getAttribute('aria-label')).toBe('Previous year');
    expect(prev.getAttribute('aria-disabled')).toBe('true');
    expect(cell(p, 'January 2026').getAttribute('aria-disabled')).toBe('true');
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    cell(p, 'January 2026').click();
    expect(iso(p.value)).toBe('2026-03');
    await userEvent.click(next);
    expect(heading(p)).toBe('2027');
    expect(next.getAttribute('aria-disabled')).toBe('true');
    expect(document.activeElement).toBe(next);
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
  });

  it('isMonthDisabled cells are focusable but not selectable', async () => {
    const p = mount({ value: plainYearMonth(2026, 3), isMonthDisabled: (v) => v.month === 4 });
    p.open();
    await userEvent.keyboard('{ArrowRight}');
    expect(activeLabel()).toBe('April 2026');
    expect(document.activeElement!.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard('{Enter}');
    expect(iso(p.value)).toBe('2026-03');
    expect(p.isOpen).toBe(true);
  });

  it('focuses the current month in the configured timezone when empty (fixed instants)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 30 September 19:00 UTC is 1 October 00:30 in Kolkata and 05:30 at Lord Howe.
    vi.setSystemTime(Date.UTC(2026, 8, 30, 19, 0));
    const kolkata = MonthPicker.create(document.body.appendChild(document.createElement('div')), { label: 'x', locale: 'en-US', timezone: 'Asia/Kolkata' });
    kolkata.open();
    expect(activeLabel()).toBe('October 2026');
    kolkata.close();
    const lordHowe = MonthPicker.create(document.body.appendChild(document.createElement('div')), { label: 'x', locale: 'en-US', timezone: 'Australia/Lord_Howe' });
    expect(iso(lordHowe.current)).toBe('2026-10');
    const utc = MonthPicker.create(document.body.appendChild(document.createElement('div')), { label: 'x', locale: 'en-US' });
    expect(iso(utc.current)).toBe('2026-09');
  });

  it('closes on Escape (focus to the button), on Tab out, and toggles from the button', async () => {
    const p = mount({ value: plainYearMonth(2026, 3) });
    const onClose = vi.fn();
    p.host.addEventListener('aui-close', onClose);
    await userEvent.click(p.button);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(document.activeElement).toBe(p.button);
    expect(onClose).toHaveBeenCalledTimes(1);
    await userEvent.click(p.button);
    await userEvent.click(p.button);
    expect(p.isOpen).toBe(false);
    await userEvent.click(p.button);
    await userEvent.tab();
    expect(p.isOpen).toBe(false);
  });

  it('opens with Alt+ArrowDown without changing the segment and stays open when closeOnSelect is false', async () => {
    configureAbsoluteUI({ components: { monthPicker: { closeOnSelect: false } } });
    const p = mount({ value: plainYearMonth(2026, 3) });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(p.isOpen).toBe(true);
    expect(segments(p)[0]!.value).toBe('03');
    await userEvent.click(cell(p, 'May 2026'));
    expect(iso(p.value)).toBe('2026-05');
    expect(p.isOpen).toBe(true);
    expect(activeLabel()).toBe('May 2026');
  });

  it('inside a modal Dialog, Escape closes only the popup', async () => {
    const content = document.createElement('div');
    const d = Dialog.create({ title: 'Report', content });
    d.open();
    const p = mount({}, content);
    await userEvent.click(p.button);
    await userEvent.keyboard('{Escape}');
    expect(p.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
  });

  it('does not open when disabled or read-only, and a disabled picker is not submitted', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({ disabled: true, value: plainYearMonth(2026, 3) }, form);
    p.open();
    expect(p.isOpen).toBe(false);
    expect(new FormData(form).get('month')).toBeNull();
    p.update({ disabled: false, readOnly: true });
    p.open();
    expect(p.isOpen).toBe(false);
    expect(new FormData(form).get('month')).toBe('2026-03');
  });
});

describe('MonthPicker: form control contract', () => {
  it('registers with Form and serializes YYYY-MM', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({ value: plainYearMonth(2026, 3) }, form);
    expect(getFormControl(p.host)).toBe(p);
    expect(findFormControls(form)).toEqual([p]);
    const f = Form.create(form);
    expect(f.getValues()).toMatchObject({ month: '2026-03' });
    f.destroy();
  });

  it('tracks dirty; reset restores the initial value; programmatic changes emit nothing', async () => {
    const p = mount({ value: plainYearMonth(2026, 3) });
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', onChange);
    p.setValue(plainYearMonth(2026, 4));
    p.update({ value: plainYearMonth(2026, 5) });
    expect(onChange).not.toHaveBeenCalled();
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(p.dirty).toBe(true);
    p.reset();
    expect(iso(p.value)).toBe('2026-03');
    expect(p.dirty).toBe(false);
    expect(p.touched).toBe(false);
  });

  it('re-renders on locale configuration changes and keeps the value', () => {
    const p = MonthPicker.create(document.body.appendChild(document.createElement('div')), { label: 'x', value: plainYearMonth(2026, 3) });
    configureAbsoluteUI({ common: { locale: 'sv-SE' } });
    expect(segments(p).map((s) => s.getAttribute('aria-label'))).toEqual(['Year', 'Month']);
    expect(segments(p).map((s) => s.value)).toEqual(['2026', '03']);
    expect(p.button.getAttribute('aria-label')).toBe('Change month, mars 2026');
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
