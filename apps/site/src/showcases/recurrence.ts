// Recurrence showcase: a meeting series built with the Schedule Picker (date, time, time zone,
// all-day, repeat) and a standalone Recurrence Picker with its upcoming occurrences.
import { plainDate, plainDateTime, plainTime } from '@absoluteui/core';
import { RecurrencePicker } from '@absoluteui/components/recurrence-picker';
import { SchedulePicker, scheduleToString, type SchedulePickerChangeDetail } from '@absoluteui/components/schedule-picker';
import { choice, createShowcase, hostIn, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Meeting series',
  description: 'Schedule a recurring meeting across time zones and see the rule as text and the next occurrences.',
});

const scheduleSection = section(sc, 'Schedule', ['schedule-picker']);
const schedule = SchedulePicker.create(hostIn(scheduleSection), {
  label: 'Team sync',
  allowAllDay: true,
  recurrence: true,
  timeZones: ['Europe/London', 'America/New_York', 'Asia/Kolkata', 'Asia/Tokyo'],
  timezone: 'Europe/London',
  defaultDuration: 30,
  required: true,
});
const scheduleText = status(scheduleSection);
const describeSchedule = (): void => {
  const v = schedule.value;
  scheduleText.textContent = v ? `Saved as: ${scheduleToString(v)}` : 'Choose when the meeting starts.';
};
describeSchedule();
schedule.host.addEventListener('aui-change', (e) => {
  describeSchedule();
  sc.log('schedule aui-change', { valid: (e as CustomEvent<SchedulePickerChangeDetail>).detail.validity.valid });
});

const ruleSection = section(sc, 'Repeat rule', ['recurrence-picker']);
const rule = RecurrencePicker.create(hostIn(ruleSection), {
  label: 'Repeats',
  start: plainDateTime(plainDate(2026, 12, 1), plainTime(10)),
  frequencies: ['daily', 'weekly', 'monthly', 'yearly'],
  maxInterval: 12,
  maxCount: 52,
  previewCount: 5,
  timezone: 'Europe/London',
});
sc.listen(rule.host, ['aui-change'], 'rule');

choice(
  sc,
  'Week starts on',
  [
    { value: '1', label: 'Monday' },
    { value: '7', label: 'Sunday' },
  ],
  '1',
  (d) => {
    const firstDayOfWeek = Number(d) as 1 | 7;
    schedule.update({ firstDayOfWeek });
    rule.update({ firstDayOfWeek });
  },
);
choice(
  sc,
  'Preview',
  [
    { value: '3', label: '3 occurrences' },
    { value: '5', label: '5 occurrences' },
    { value: '10', label: '10 occurrences' },
  ],
  '5',
  (n) => {
    rule.update({ previewCount: Number(n) });
  },
  ['recurrence-picker'],
);
toggle(sc, 'All-day allowed', true, (allowAllDay) => {
  schedule.update({ allowAllDay });
}, ['schedule-picker']);
toggle(sc, 'Disabled', false, (disabled) => {
  schedule.update({ disabled });
  rule.update({ disabled });
});
