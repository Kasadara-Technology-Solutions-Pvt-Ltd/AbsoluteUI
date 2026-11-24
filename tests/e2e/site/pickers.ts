// R2 advanced pickers page, bundled against the built packages.
import { configureAbsoluteUI, dayOfWeek, duration, durationToString, plainDate, plainYearMonth, plainYearQuarter, type Duration, type PlainDate, type Range } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Calendar } from '@absoluteui/components/calendar';
import { DateRangePicker } from '@absoluteui/components/date-range-picker';
import { MonthPicker } from '@absoluteui/components/month-picker';
import { YearPicker } from '@absoluteui/components/year-picker';
import { QuarterPicker } from '@absoluteui/components/quarter-picker';
import { DurationPicker } from '@absoluteui/components/duration-picker';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default', timezone: 'Asia/Kolkata', locale: params.get('locale') ?? 'en-US', direction: params.get('dir') === 'rtl' ? 'rtl' : 'ltr' });
startThemeRuntime({ applyDirection: true });

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

const isRange = (v: unknown): v is Range<PlainDate> => typeof v === 'object' && v !== null && 'start' in v && 'end' in v;
const isDuration = (v: unknown): v is Duration => typeof v === 'object' && v !== null && 'kind' in v && v.kind === 'Duration';
const last = byId('last-value');
document.addEventListener('aui-change', (e) => {
  const { value } = (e as CustomEvent<{ value?: unknown }>).detail;
  last.textContent = isDuration(value) ? durationToString(value) : isRange(value) ? JSON.stringify([value.start, value.end]) : JSON.stringify(value ?? null);
});

// Fixed "today" keeps screenshots stable (documented advanced option).
const today = plainDate(2026, 3, 16);
Calendar.create(byId('range-calendar'), {
  selectionMode: 'range',
  visibleMonths: 2,
  range: { start: plainDate(2026, 3, 9), end: plainDate(2026, 3, 13) },
  today,
  label: 'Project dates',
});
DateRangePicker.create(byId('date-range-picker'), {
  label: 'Stay',
  name: 'stay',
  startLabel: 'Check-in',
  endLabel: 'Check-out',
  value: { start: plainDate(2026, 3, 20), end: plainDate(2026, 3, 24) },
  min: plainDate(2026, 1, 1),
  maxDays: 30,
  description: 'Up to 30 nights. Sundays are closed for arrivals.',
  isDateDisabled: (d) => dayOfWeek(d) === 7,
});
MonthPicker.create(byId('month-picker'), { label: 'Billing month', name: 'month', value: plainYearMonth(2026, 3), today });
YearPicker.create(byId('year-picker'), { label: 'Fiscal year', name: 'year', value: 2026, today });
QuarterPicker.create(byId('quarter-picker'), { label: 'Reporting quarter', name: 'quarter', value: plainYearQuarter(2026, 1), today });
DurationPicker.create(byId('duration-picker'), { label: 'Estimate', name: 'estimate', value: duration(90 * 60_000), step: duration(15 * 60_000), max: duration(40 * 3_600_000) });

Object.assign(window, { __auiReady: true, __aui: { Calendar, DateRangePicker, MonthPicker, YearPicker, QuarterPicker, DurationPicker } });
