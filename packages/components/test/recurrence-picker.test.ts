import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { parseRecurrenceRule, plainDate, plainDateTime, plainTime, recurrenceRuleToString, resetAbsoluteUIConfig, type RecurrenceRule } from '@absoluteui/core';
import { RecurrencePicker, type RecurrencePickerChangeDetail } from '@absoluteui/components/recurrence-picker';
import { Form } from '@absoluteui/components/form';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

// Fixed start (§23.5): Tuesday 29 September 2026, 09:00 in London.
const start = plainDateTime(plainDate(2026, 9, 29), plainTime(9));
const rule = (text: string): RecurrenceRule => {
  const r = parseRecurrenceRule(text);
  if (!r) throw new Error(text);
  return r;
};

function mount(options: Partial<Parameters<typeof RecurrencePicker.create>[1]> = {}): { picker: RecurrencePicker; host: HTMLDivElement; changes: RecurrencePickerChangeDetail[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const picker = RecurrencePicker.create(host, { label: 'Repeat', start, timezone: 'Europe/London', locale: 'en-US', firstDayOfWeek: 1, ...options });
  const changes: RecurrencePickerChangeDetail[] = [];
  host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<RecurrencePickerChangeDetail>).detail));
  return { picker, host, changes };
}
const freq = (host: HTMLElement): HTMLSelectElement => host.querySelector<HTMLSelectElement>('.aui-recurrence-picker__frequency')!;
const text = (picker: RecurrencePicker): string => (picker.value ? recurrenceRuleToString(picker.value) : '');

describe('recurrence picker', () => {
  it('renders a labelled fieldset starting at "Does not repeat"', () => {
    const { picker, host } = mount();
    expect(host.querySelector('fieldset > legend')?.textContent).toContain('Repeat');
    expect(freq(host).value).toBe('none');
    expect([...freq(host).options].map((o) => o.text)).toEqual(['Does not repeat', 'Daily', 'Weekly', 'Monthly', 'Yearly']);
    expect(picker.value).toBeNull();
    expect(picker.getFormValue()).toBeNull();
    expect(host.querySelector('.aui-recurrence-picker__summary')?.textContent).toBe('Does not repeat');
    expect(host.querySelector<HTMLElement>('.aui-recurrence-picker__row--end')?.hidden).toBe(true);
    expect(host.querySelector('[data-aui-control]')).toBeNull();
    expect(host.dataset.auiControl).toBe('');
  });

  it('weekly defaults to the start weekday; toggles build BYDAY and preview occurrences', async () => {
    const { picker, host, changes } = mount();
    await userEvent.selectOptions(freq(host), 'weekly');
    expect(text(picker)).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU');
    const days = [...host.querySelectorAll<HTMLButtonElement>('.aui-recurrence-picker__weekday')];
    expect(days.map((b) => b.getAttribute('aria-label'))).toEqual(['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday']);
    expect(days[1]?.getAttribute('aria-pressed')).toBe('true');
    await userEvent.click(days[3]!);
    expect(text(picker)).toBe('RRULE:FREQ=WEEKLY;BYDAY=TU,TH');
    expect(host.querySelector('.aui-recurrence-picker__summary')?.textContent).toBe('Every week on Tuesday and Thursday');
    const preview = [...host.querySelectorAll('.aui-recurrence-picker__preview-list li')].map((li) => li.textContent);
    expect(preview[0]).toBe('Tuesday, September 29, 2026 at 9:00 AM');
    expect(preview[1]).toBe('Thursday, October 1, 2026 at 9:00 AM');
    expect(preview).toHaveLength(5);
    await userEvent.click(days[1]!);
    await userEvent.click(days[3]!);
    expect(picker.validity.error).toBe('no-weekday');
    expect(picker.value).toBeNull();
    expect(changes.length).toBeGreaterThanOrEqual(4);
  });

  it('interval, monthly nth weekday, and the end after a count', async () => {
    const { picker, host } = mount();
    await userEvent.selectOptions(freq(host), 'monthly');
    expect(text(picker)).toBe('RRULE:FREQ=MONTHLY;BYMONTHDAY=29');
    const interval = host.querySelector<HTMLInputElement>('.aui-recurrence-picker__row--interval input')!;
    await userEvent.clear(interval);
    await userEvent.type(interval, '2');
    expect(text(picker)).toBe('RRULE:FREQ=MONTHLY;INTERVAL=2;BYMONTHDAY=29');
    const radios = host.querySelectorAll<HTMLInputElement>('.aui-recurrence-picker__row--month input[type="radio"]');
    await userEvent.click(radios[1]!);
    // 29 September 2026 is the fifth Tuesday.
    expect(text(picker)).toBe('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=5TU');
    await userEvent.selectOptions(host.querySelector<HTMLSelectElement>('.aui-recurrence-picker__select--nth')!, '-1');
    expect(text(picker)).toBe('RRULE:FREQ=MONTHLY;INTERVAL=2;BYDAY=-1TU');
    const ends = host.querySelectorAll<HTMLInputElement>('.aui-recurrence-picker__row--end input[type="radio"]');
    await userEvent.click(ends[2]!);
    expect(text(picker)).toBe('RRULE:FREQ=MONTHLY;INTERVAL=2;COUNT=10;BYDAY=-1TU');
    expect(picker.summary).toBe('Every 2 months on the last Tuesday, 10 times');
    await userEvent.clear(interval);
    await userEvent.type(interval, '0');
    expect(picker.validity).toMatchObject({ valid: false, error: 'bad-interval', message: 'Enter an interval from 1 to 99.' });
  });

  it('yearly on a month and day', async () => {
    const { picker, host } = mount();
    await userEvent.selectOptions(freq(host), 'yearly');
    expect(text(picker)).toBe('RRULE:FREQ=YEARLY;BYMONTH=9;BYMONTHDAY=29');
    const month = host.querySelectorAll<HTMLSelectElement>('.aui-recurrence-picker__select--month')[0]!;
    await userEvent.selectOptions(month, '2');
    expect(text(picker)).toBe('RRULE:FREQ=YEARLY;BYMONTH=2;BYMONTHDAY=29');
    expect(picker.summary).toBe('Every year on February 29');
  });

  it('ends on a date as the last second of that day in UTC (timed start)', async () => {
    const { picker, host } = mount({ value: rule('FREQ=DAILY') });
    const ends = host.querySelectorAll<HTMLInputElement>('.aui-recurrence-picker__row--end input[type="radio"]');
    await userEvent.click(ends[1]!);
    expect(picker.validity.error).toBe('no-until');
    picker.untilPicker.setValue(plainDate(2026, 10, 31));
    await userEvent.click(ends[1]!);
    // Force a rebuild through a user edit.
    await userEvent.click(ends[0]!);
    await userEvent.click(ends[1]!);
    expect(text(picker)).toBe('RRULE:FREQ=DAILY;UNTIL=20261031T235959Z');
    picker.untilPicker.setValue(plainDate(2026, 9, 1));
    await userEvent.click(ends[0]!);
    await userEvent.click(ends[1]!);
    expect(picker.validity).toMatchObject({ error: 'bad-until', message: 'Enter an end date on or after Sep 29, 2026.' });
  });

  it('all-day starts keep UNTIL as a date', async () => {
    const { picker, host } = mount({ start: plainDate(2026, 9, 29), value: rule('FREQ=WEEKLY;BYDAY=TU;UNTIL=20261231') });
    expect(picker.untilPicker.value).toEqual(plainDate(2026, 12, 31));
    await userEvent.click(host.querySelectorAll<HTMLButtonElement>('.aui-recurrence-picker__weekday')[4]!);
    expect(text(picker)).toBe('RRULE:FREQ=WEEKLY;UNTIL=20261231;BYDAY=TU,FR');
  });

  it('keeps programmatic values exactly and preserves EXDATE on edits', async () => {
    const value = rule('RRULE:FREQ=WEEKLY;BYDAY=MO;WKST=SU\nEXDATE:20261005T090000');
    const { picker, host } = mount({ value });
    expect(picker.value).toBe(value);
    await userEvent.click(host.querySelectorAll<HTMLButtonElement>('.aui-recurrence-picker__weekday')[2]!);
    expect(text(picker)).toBe('RRULE:FREQ=WEEKLY;BYDAY=MO,WE;WKST=SU\nEXDATE:20261005T090000');
  });

  it('shows unrepresentable rules as Custom until another frequency is chosen', async () => {
    const custom = rule('FREQ=MONTHLY;BYDAY=MO,TU,WE,TH,FR;BYSETPOS=-1');
    const { picker, host } = mount({ value: custom });
    expect(freq(host).value).toBe('custom');
    expect(picker.value).toBe(custom);
    expect(picker.summary).toBe('Every month on Monday, Tuesday, Wednesday, Thursday, and Friday (the last of them)');
    await userEvent.selectOptions(freq(host), 'daily');
    expect(text(picker)).toBe('RRULE:FREQ=DAILY');
    expect([...freq(host).options].map((o) => o.value)).not.toContain('custom');
  });

  it('participates in Form: required, serialization, reset', async () => {
    const formEl = document.createElement('form');
    const host = document.createElement('div');
    formEl.append(host);
    document.body.append(formEl);
    const form = Form.create(formEl);
    const picker = RecurrencePicker.create(host, { label: 'Repeat', name: 'rrule', required: true, start, timezone: 'UTC' });
    expect(form.validate()).toBe(false);
    expect(picker.validity.error).toBe('value-missing');
    await userEvent.selectOptions(freq(host), 'daily');
    expect(form.validate()).toBe(true);
    expect(form.getValues()).toMatchObject({ rrule: 'RRULE:FREQ=DAILY' });
    expect(new FormData(formEl).get('rrule')).toBe('RRULE:FREQ=DAILY');
    picker.reset();
    expect(picker.value).toBeNull();
    expect(picker.dirty).toBe(false);
  });

  it('does not leak the inner date picker change event', async () => {
    const { picker, host } = mount({ value: rule('FREQ=DAILY;UNTIL=20261031') });
    const outer: EventTarget[] = [];
    host.addEventListener('aui-change', (e) => outer.push(e.target!));
    const input = picker.untilPicker.input.group.querySelector<HTMLInputElement>('input')!;
    await userEvent.click(input);
    await userEvent.keyboard('{ArrowUp}');
    expect(outer.every((t) => t === host)).toBe(true);
    expect(outer.length).toBeGreaterThan(0);
  });

  it('validates options, disables, and cleans up', () => {
    expect(() => RecurrencePicker.create(document.createElement('div'), { label: '' })).toThrow(/RECURRENCE_PICKER_OPTIONS/);
    expect(() => RecurrencePicker.create(document.createElement('div'), { label: 'x', frequencies: [] })).toThrow(/frequencies/);
    const { picker, host } = mount({ disabled: true, frequencies: ['weekly'] });
    expect(freq(host).disabled).toBe(true);
    expect([...freq(host).options].map((o) => o.value)).toEqual(['none', 'weekly']);
    picker.update({ locale: 'de-DE' });
    expect(freq(host).options[0]?.text).toBe('Does not repeat');
    picker.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
