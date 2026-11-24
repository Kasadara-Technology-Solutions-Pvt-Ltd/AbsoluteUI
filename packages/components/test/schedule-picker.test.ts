import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { instantToString, parseInstant, parseRecurrenceRule, plainDate, resetAbsoluteUIConfig, type Instant } from '@absoluteui/core';
import { Form } from '@absoluteui/components/form';
import { parseSchedule, SchedulePicker, scheduleToString, type SchedulePickerChangeDetail, type ScheduleValue } from '@absoluteui/components/schedule-picker';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

// Fixed instants (§23.5): Tuesday 29 September 2026, 09:00-10:30 in London (BST, +01:00).
const at = (text: string): Instant => {
  const i = parseInstant(text);
  if (!i) throw new Error(text);
  return i;
};
const meeting: ScheduleValue = { allDay: false, start: at('2026-09-29T08:00:00Z'), end: at('2026-09-29T09:30:00Z'), timeZone: 'Europe/London', recurrence: null };

function mount(options: Partial<Parameters<typeof SchedulePicker.create>[1]> = {}): { picker: SchedulePicker; host: HTMLDivElement; changes: SchedulePickerChangeDetail[] } {
  const host = document.createElement('div');
  document.body.append(host);
  const picker = SchedulePicker.create(host, { label: 'When', locale: 'en-GB', value: meeting, ...options });
  const changes: SchedulePickerChangeDetail[] = [];
  host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<SchedulePickerChangeDetail>).detail));
  return { picker, host, changes };
}
const iso = (v: ScheduleValue | null): [string, string] | null => (v && !v.allDay ? [instantToString(v.start), instantToString(v.end)] : null);

describe('schedule text', () => {
  it('writes and reads iCalendar DTSTART/DTEND/RRULE', () => {
    const weekly = { ...meeting, recurrence: parseRecurrenceRule('FREQ=WEEKLY;BYDAY=TU') };
    const text = scheduleToString(weekly);
    expect(text).toBe('DTSTART;TZID=Europe/London:20260929T090000\nDTEND;TZID=Europe/London:20260929T103000\nRRULE:FREQ=WEEKLY;BYDAY=TU');
    const back = parseSchedule(text);
    expect(iso(back)).toEqual(['2026-09-29T08:00:00.000Z', '2026-09-29T09:30:00.000Z']);
    expect(back?.timeZone).toBe('Europe/London');
    const allDay: ScheduleValue = { allDay: true, start: plainDate(2026, 10, 1), end: plainDate(2026, 10, 3), timeZone: 'UTC', recurrence: null };
    expect(scheduleToString(allDay)).toBe('DTSTART;VALUE=DATE:20261001\nDTEND;VALUE=DATE:20261004');
    expect(parseSchedule('DTSTART;VALUE=DATE:20261001\nDTEND;VALUE=DATE:20261004')).toMatchObject({ allDay: true, start: plainDate(2026, 10, 1), end: plainDate(2026, 10, 3) });
    expect(parseSchedule('DTSTART:20261001T090000Z\nDTEND:20261001T100000Z')?.timeZone).toBe('UTC');
  });

  it('refuses invalid text', () => {
    for (const t of ['', 'DTSTART:20261001T090000\nDTEND:20261001T100000', 'DTSTART;TZID=UTC:20261001T100000\nDTEND;TZID=UTC:20261001T090000', 'DTSTART;VALUE=DATE:20261001', 'DTSTART;VALUE=DATE:20261001\nDTEND;VALUE=DATE:20261001', 'DTSTART;VALUE=DATE:20261001\nDTEND;VALUE=DATE:20261002\nRRULE:FREQ=HOURLY']) {
      expect(parseSchedule(t), t).toBeNull();
    }
  });
});

describe('schedule picker', () => {
  it('renders start and end in the schedule timezone with a duration', () => {
    const { picker, host } = mount();
    expect(host.querySelector('fieldset > legend')?.textContent).toContain('When');
    expect(picker.timeZone).toBe('Europe/London');
    expect(picker.startPicker.input.group.textContent).toContain('09');
    expect(host.querySelector('.aui-schedule-picker__duration')?.textContent).toBe('Duration: 1 hr, 30 mins');
    expect(picker.getFormValue()).toBe('DTSTART;TZID=Europe/London:20260929T090000\nDTEND;TZID=Europe/London:20260929T103000');
    expect(host.querySelectorAll('[data-aui-control]')).toHaveLength(0);
    expect(picker.startDatePicker.host.hidden).toBe(true);
  });

  it('moving the start keeps the duration', async () => {
    const { picker, changes } = mount();
    const hour = picker.startPicker.input.group.querySelector<HTMLInputElement>('[aria-label="Hour"]') ?? picker.startPicker.input.group.querySelectorAll<HTMLInputElement>('input')[3]!;
    await userEvent.click(hour);
    await userEvent.keyboard('{ArrowUp}');
    expect(iso(picker.value)).toEqual(['2026-09-29T09:00:00.000Z', '2026-09-29T10:30:00.000Z']);
    expect(changes.at(-1)?.value).toBe(picker.value);
    expect(changes.every((c) => c.validity.valid)).toBe(true);
  });

  it('all-day converts the times to days and back', async () => {
    const { picker, host } = mount();
    await userEvent.click(host.querySelector<HTMLInputElement>('.aui-schedule-picker__checkbox')!);
    expect(picker.value).toMatchObject({ allDay: true, start: plainDate(2026, 9, 29), end: plainDate(2026, 9, 29) });
    expect(picker.startPicker.host.hidden).toBe(true);
    expect(host.querySelector('.aui-schedule-picker__duration')?.textContent).toBe('Duration: 1 day');
    expect(picker.getFormValue()).toBe('DTSTART;VALUE=DATE:20260929\nDTEND;VALUE=DATE:20260930');
    await userEvent.click(host.querySelector<HTMLInputElement>('.aui-schedule-picker__checkbox')!);
    expect(iso(picker.value)).toEqual(['2026-09-29T08:00:00.000Z', '2026-09-29T09:30:00.000Z']);
  });

  it('changing the timezone keeps the wall-clock times', async () => {
    const { picker, host } = mount({ timeZones: ['Europe/London', 'America/New_York', 'Asia/Kolkata'] });
    const zone = host.querySelector<HTMLSelectElement>('.aui-schedule-picker__select')!;
    expect([...zone.options].map((o) => o.value)).toEqual(['Europe/London', 'America/New_York', 'Asia/Kolkata']);
    await userEvent.selectOptions(zone, 'America/New_York');
    expect(picker.timeZone).toBe('America/New_York');
    expect(iso(picker.value)).toEqual(['2026-09-29T13:00:00.000Z', '2026-09-29T14:30:00.000Z']);
    expect(picker.getFormValue()).toContain('DTSTART;TZID=America/New_York:20260929T090000');
  });

  it('reports an end before the start and incomplete input', async () => {
    const { picker } = mount({ validationTiming: 'input' });
    picker.endPicker.setValue(at('2026-09-29T07:00:00Z'));
    const minute = picker.endPicker.input.group.querySelectorAll<HTMLInputElement>('input')[4]!;
    await userEvent.click(minute);
    await userEvent.keyboard('{ArrowUp}');
    expect(picker.validity).toMatchObject({ valid: false, error: 'end-before-start', message: 'Enter an end after the start.' });
    expect(picker.value).toBeNull();
    picker.setValue(null);
    expect(picker.validity.valid).toBe(true);
    const required = mount({ value: null, required: true }).picker;
    expect(required.validity.error).toBe('value-missing');
  });

  it('embeds a recurrence picker whose start follows the schedule', async () => {
    const { picker, host } = mount({ recurrence: true });
    const rp = picker.recurrencePicker!;
    expect(rp.options.start).toMatchObject({ kind: 'PlainDateTime', time: { hour: 9 } });
    await userEvent.selectOptions(rp.host.querySelector<HTMLSelectElement>('.aui-recurrence-picker__frequency')!, 'weekly');
    expect(picker.value?.recurrence && picker.getFormValue()).toBe('DTSTART;TZID=Europe/London:20260929T090000\nDTEND;TZID=Europe/London:20260929T103000\nRRULE:FREQ=WEEKLY;BYDAY=TU');
    const targets: EventTarget[] = [];
    host.addEventListener('aui-change', (e) => targets.push(e.target!));
    await userEvent.click(rp.host.querySelectorAll<HTMLButtonElement>('.aui-recurrence-picker__weekday')[3]!);
    expect(targets).toEqual([host]);
  });

  it('is one Form control with an iCalendar value', () => {
    const formEl = document.createElement('form');
    const host = document.createElement('div');
    formEl.append(host);
    document.body.append(formEl);
    const form = Form.create(formEl);
    SchedulePicker.create(host, { label: 'When', name: 'when', value: meeting, recurrence: true });
    expect(form.validate()).toBe(true);
    expect(new FormData(formEl).get('when')).toBe('DTSTART;TZID=Europe/London:20260929T090000\nDTEND;TZID=Europe/London:20260929T103000');
    expect([...new FormData(formEl).keys()]).toEqual(['when']);
  });

  it('validates options and cleans up', () => {
    expect(() => SchedulePicker.create(document.createElement('div'), { label: '' })).toThrow(/SCHEDULE_PICKER_OPTIONS/);
    expect(() => SchedulePicker.create(document.createElement('div'), { label: 'x', value: { ...meeting, end: meeting.start } })).toThrow(/value.end/);
    expect(() => SchedulePicker.create(document.createElement('div'), { label: 'x', timeZones: ['Mars/Olympus'] })).toThrow(/timeZones/);
    const { picker, host } = mount({ recurrence: true });
    expect(() => {
      picker.update({ recurrence: false });
    }).toThrow(/init-only/);
    picker.destroy();
    expect(host.childElementCount).toBe(0);
  });
});
