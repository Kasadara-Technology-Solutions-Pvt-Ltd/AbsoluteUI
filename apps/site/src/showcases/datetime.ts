// Date and time showcase: a leave request on a business calendar. Weekends and holidays are
// not bookable, the summary counts calendar days against working days, and editing the
// office calendar updates every picker. Time zone and week start are switchable.
import { addDays, duration, plainDate, plainDateTime, plainDateToString, plainTime, plainYearMonth, toInstant, type PlainDate, type Range } from '@absoluteui/core';
import { BusinessCalendar, createBusinessCalendar, type BusinessCalendarChangeDetail, type BusinessCalendarDefinition } from '@absoluteui/components/business-calendar';
import { Calendar } from '@absoluteui/components/calendar';
import { DateInput } from '@absoluteui/components/date-input';
import { DatePicker } from '@absoluteui/components/date-picker';
import { DateRangePicker, type DateRangePickerChangeDetail } from '@absoluteui/components/date-range-picker';
import { DateTimePicker } from '@absoluteui/components/date-time-picker';
import { DurationPicker } from '@absoluteui/components/duration-picker';
import { TimePicker } from '@absoluteui/components/time-picker';
import { choice, createShowcase, hostIn, section, status, toggle } from './kit.js';

const sc = createShowcase({
  title: 'Leave request',
  description: 'Book leave on the office business calendar: weekends and holidays are skipped, and the summary counts working days.',
});

let definition: BusinessCalendarDefinition = {
  workingDays: [1, 2, 3, 4, 5],
  holidays: [
    { date: plainDate(2026, 12, 25), name: 'Christmas Day', yearly: true },
    { date: plainDate(2026, 12, 28), name: 'Boxing Day (substitute)' },
    { date: plainDate(2027, 1, 1), name: "New Year's Day", yearly: true },
  ],
};
let engine = createBusinessCalendar(definition);
let timezone = 'Europe/London';
const MINUTE = 60_000;
const HOUR = 60 * MINUTE;

const request = section(sc, 'Leave dates', ['date-input', 'date-range-picker', 'date-picker', 'business-calendar']);
const grid = hostIn(request);
grid.className = 'sc-grid';
DateInput.create(hostIn(grid), { label: 'Requested on', value: plainDate(2026, 12, 1), readOnly: true });
const range = DateRangePicker.create(hostIn(grid), {
  label: 'Leave dates',
  firstDayOfWeek: 1,
  startLabel: 'First day',
  endLabel: 'Last day',
  businessCalendar: engine,
  disableNonWorking: true,
  minDays: 1,
  maxDays: 30,
  min: plainDate(2026, 12, 1),
  required: true,
  value: { start: plainDate(2026, 12, 21), end: plainDate(2027, 1, 4) },
});
const back = DatePicker.create(hostIn(grid), { label: 'Back at work', firstDayOfWeek: 1, businessCalendar: engine, disableNonWorking: true, description: 'Set to the next working day after the leave.' });
const extras = section(sc, 'Handover and out of office', ['time-picker', 'date-time-picker', 'duration-picker']);
const extrasGrid = hostIn(extras);
extrasGrid.className = 'sc-grid';
const handover = TimePicker.create(hostIn(extrasGrid), { label: 'Handover meeting', value: plainTime(15, 30), step: 15, min: plainTime(8), max: plainTime(18) });
const autoReply = DateTimePicker.create(hostIn(extrasGrid), { label: 'Out-of-office reply starts', firstDayOfWeek: 1, timezone, step: 30, businessCalendar: engine });
const halfDay = DurationPicker.create(hostIn(extrasGrid), { label: 'Hours on half days', value: duration(4 * HOUR), min: duration(HOUR), max: duration(8 * HOUR), step: duration(30 * MINUTE), fields: ['hours', 'minutes'] });

const summary = status(request);
const summarize = (value: Range<PlainDate> | null): void => {
  if (!value) {
    summary.textContent = 'Choose the first and last day of your leave.';
    return;
  }
  const calendarDays = (Date.UTC(value.end.year, value.end.month - 1, value.end.day) - Date.UTC(value.start.year, value.start.month - 1, value.start.day)) / 86_400_000 + 1;
  const working = engine.workingDaysBetween(value.start, addDays(value.end, 1));
  const returnDay = engine.nextWorkingDay(addDays(value.end, 1), true);
  back.setValue(returnDay);
  autoReply.setValue(toInstant(plainDateTime(value.start, plainTime(8)), timezone));
  summary.textContent = `${String(calendarDays)} calendar days, ${String(working)} working days (weekends and holidays excluded). Back on ${plainDateToString(returnDay)}.`;
};
summarize(range.value);
range.host.addEventListener('aui-change', (e) => {
  summarize((e as CustomEvent<DateRangePickerChangeDetail>).detail.value);
});

const availability = section(sc, 'Team availability', ['calendar']);
const team = Calendar.create(hostIn(availability), { label: 'Team calendar', firstDayOfWeek: 1, selectionMode: 'range', businessCalendar: engine, visibleMonths: 2, showWeekNumbers: true, focusedDate: plainDate(2026, 12, 21), range: range.value });
range.host.addEventListener('aui-change', (e) => {
  const v = (e as CustomEvent<DateRangePickerChangeDetail>).detail.value;
  if (v) team.setRange(v);
});

const office = section(sc, 'Office calendar', ['business-calendar']);
const officeCalendar = BusinessCalendar.create(hostIn(office), { label: 'London office', firstDayOfWeek: 1, month: plainYearMonth(2026, 12), months: 2, editable: true, definition, showLegend: true });
officeCalendar.host.addEventListener('aui-change', (e) => {
  // Editing a day (working or not) rebuilds the engine every picker uses.
  definition = (e as CustomEvent<BusinessCalendarChangeDetail>).detail.definition;
  engine = createBusinessCalendar(definition);
  for (const c of [range, back, autoReply, team]) c.update({ businessCalendar: engine });
  summarize(range.value);
});

sc.listen(range.host, ['aui-change', 'aui-open', 'aui-close'], 'leave dates');
sc.listen(back.host, ['aui-change'], 'back at work');
sc.listen(handover.host, ['aui-change'], 'handover');
sc.listen(autoReply.host, ['aui-change'], 'auto reply');
sc.listen(halfDay.host, ['aui-change'], 'half day');
sc.listen(officeCalendar.host, ['aui-change', 'aui-day-select'], 'office calendar');

choice(
  sc,
  'Time zone',
  [
    { value: 'Europe/London', label: 'London' },
    { value: 'America/New_York', label: 'New York' },
    { value: 'Asia/Kolkata', label: 'Kolkata' },
    { value: 'Australia/Sydney', label: 'Sydney' },
  ],
  'Europe/London',
  (tz) => {
    timezone = tz;
    autoReply.update({ timezone: tz });
    summarize(range.value);
  },
  ['date-time-picker'],
);
choice(
  sc,
  'Week starts on',
  [
    { value: '1', label: 'Monday' },
    { value: '7', label: 'Sunday' },
    { value: '6', label: 'Saturday' },
  ],
  '1',
  (day) => {
    const firstDayOfWeek = Number(day) as 1 | 6 | 7;
    for (const c of [range, back, autoReply, team]) c.update({ firstDayOfWeek });
    officeCalendar.update({ firstDayOfWeek });
  },
  ['date-range-picker', 'date-picker', 'date-time-picker', 'calendar', 'business-calendar'],
);
toggle(sc, 'Only working days', true, (disableNonWorking) => {
  for (const c of [range, back, autoReply, team]) c.update({ disableNonWorking });
}, ['date-range-picker', 'date-picker', 'date-time-picker', 'calendar', 'business-calendar']);
toggle(sc, 'Read-only', false, (readOnly) => {
  for (const c of [range, back, handover, autoReply, halfDay]) c.update({ readOnly });
}, ['date-range-picker', 'date-picker', 'time-picker', 'date-time-picker', 'duration-picker']);
toggle(sc, 'Disabled', false, (disabled) => {
  for (const c of [range, back, handover, autoReply, halfDay]) c.update({ disabled });
}, ['date-range-picker', 'date-picker', 'time-picker', 'date-time-picker', 'duration-picker']);
