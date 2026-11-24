import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { configureAbsoluteUI, instantToString, parseInstant, plainDate, plainDateToString, resetAbsoluteUIConfig, type PlainDate } from '@absoluteui/core';
import { DateInput, type DateInputChangeDetail, type DateInputOptions } from '@absoluteui/components/date-input';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<DateInputOptions> = {}): DateInput {
  const host = document.createElement('div');
  document.body.append(host);
  return DateInput.create(host, { label: 'Start date', name: 'start', ...options });
}

const segmentTypes = (d: DateInput): string[] =>
  Array.from(d.group.querySelectorAll<HTMLInputElement>('.aui-date-input__segment')).map((s) => /--(\w+)/.exec(s.className)?.[1] ?? '');
const segments = (d: DateInput): HTMLInputElement[] => Array.from(d.group.querySelectorAll('.aui-date-input__segment'));
const errorText = (d: DateInput): string => d.host.querySelector('.aui-date-input__error')!.textContent;
const hintText = (d: DateInput): string => d.host.querySelector('.aui-date-input__hint')!.textContent;

describe('DateInput: structure and accessibility', () => {
  it('orders segments by locale', () => {
    expect(segmentTypes(mount({ locale: 'en-US' }))).toEqual(['month', 'day', 'year']);
    expect(segmentTypes(mount({ locale: 'de-DE' }))).toEqual(['day', 'month', 'year']);
    expect(segmentTypes(mount({ locale: 'ja-JP' }))).toEqual(['year', 'month', 'day']);
  });

  it('is a labelled group of labelled numeric segments', () => {
    const d = mount();
    expect(d.group.getAttribute('role')).toBe('group');
    expect(document.getElementById(d.group.getAttribute('aria-labelledby')!)!.textContent).toBe('Start date');
    expect(segments(d).map((s) => s.getAttribute('aria-label'))).toEqual(['Month', 'Day', 'Year']);
    expect(segments(d).every((s) => s.inputMode === 'numeric')).toBe(true);
  });
});

describe('DateInput: typing and keyboard', () => {
  it('produces a PlainDate with auto-advance and form value', async () => {
    const d = mount();
    const onChange = vi.fn();
    d.host.addEventListener('aui-change', (e) => {
      onChange((e as CustomEvent<DateInputChangeDetail>).detail);
    });
    segments(d)[0]!.focus();
    await userEvent.keyboard('12252026');
    const value = d.value as PlainDate;
    expect(plainDateToString(value)).toBe('2026-12-25');
    expect(d.host.querySelector<HTMLInputElement>('input[type=hidden]')!.value).toBe('2026-12-25');
    const last = onChange.mock.lastCall?.[0] as DateInputChangeDetail | undefined;
    expect(last?.validity.valid).toBe(true);
  });

  it('pads and advances when a first digit cannot start a two-digit value', async () => {
    const d = mount();
    segments(d)[0]!.focus();
    await userEvent.keyboard('4');
    expect(segments(d)[0]!.value).toBe('04');
    expect(document.activeElement).toBe(segments(d)[1]);
  });

  it('increments and wraps with arrow keys', async () => {
    const d = mount();
    segments(d)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(d)[0]!.value).toBe('01');
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(d)[0]!.value).toBe('12');
  });

  it('Backspace on an empty segment moves to the previous segment', async () => {
    const d = mount();
    segments(d)[1]!.focus();
    await userEvent.keyboard('{Backspace}');
    expect(document.activeElement).toBe(segments(d)[0]);
  });
});

describe('DateInput: validation', () => {
  it('reports impossible dates immediately with aria-invalid', async () => {
    const d = mount();
    segments(d)[0]!.focus();
    await userEvent.keyboard('02302026');
    expect(d.value).toBeNull();
    expect(d.validity.error).toBe('invalid-date');
    expect(errorText(d)).toBe('Enter a valid date.');
    expect(segments(d)[0]!.getAttribute('aria-invalid')).toBe('true');
  });

  it('reports incomplete input only after leaving the field', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const d = mount();
    segments(d)[0]!.focus();
    await userEvent.keyboard('12');
    expect(d.validity.error).toBe('incomplete');
    expect(errorText(d)).toBe('');
    outside.focus();
    expect(errorText(d)).toBe('Enter a complete date.');
  });

  it('enforces min/max with localized messages', () => {
    const d = mount({ min: plainDate(2026, 1, 1), max: plainDate(2026, 12, 31) });
    d.setValue(plainDate(2025, 12, 31));
    expect(d.validity.error).toBe('range-underflow');
    expect(errorText(d)).toBe('Enter a value on or after Jan 1, 2026.');
    d.setValue(plainDate(2026, 6, 1));
    expect(d.validity.valid).toBe(true);
  });

  it('supports required via reportValidity', () => {
    const d = mount({ required: true });
    expect(d.reportValidity()).toBe(false);
    expect(errorText(d)).toBe('This field is required.');
  });
});

describe('DateInput: timezone and DST (minute granularity)', () => {
  it('defaults to UTC, never the host timezone (§8.1)', () => {
    const d = mount({ granularity: 'minute', hourCycle: 'h23' });
    d.setValue(parseInstant('2026-01-01T10:00:00Z'));
    expect(segments(d).map((s) => s.value)).toEqual(['01', '01', '2026', '10', '00']);
    expect(hintText(d)).toContain('Coordinated Universal Time');
  });

  it('writes and reads values in the configured zone', () => {
    configureAbsoluteUI({ timezone: 'Asia/Kolkata' });
    const d = mount({ granularity: 'minute', hourCycle: 'h23' });
    d.setValue(parseInstant('2026-12-31T20:00:00Z'));
    expect(segments(d).map((s) => s.value)).toEqual(['01', '01', '2027', '01', '30']);
    expect(hintText(d)).toContain('GMT+05:30');
  });

  it('adjusts nonexistent times forward and tells the user (compatible policy)', async () => {
    const d = mount({ granularity: 'minute', hourCycle: 'h23', timezone: 'America/New_York' });
    segments(d)[0]!.focus();
    await userEvent.keyboard('030820260230');
    expect(d.validity.localTimeStatus).toBe('nonexistent');
    expect(instantToString(d.value as never)).toBe('2026-03-08T07:30:00.000Z');
    expect(hintText(d)).toContain('Adjusted to 3:30');
  });

  it('rejects nonexistent times under the reject policy', async () => {
    const d = mount({ granularity: 'minute', hourCycle: 'h23', timezone: 'America/New_York', disambiguation: 'reject' });
    segments(d)[0]!.focus();
    await userEvent.keyboard('030820260230');
    expect(d.value).toBeNull();
    expect(d.validity.error).toBe('nonexistent-time');
    expect(errorText(d)).toContain('does not exist');
  });

  it('resolves ambiguous times to the earlier occurrence by default and discloses it', async () => {
    const d = mount({ granularity: 'minute', hourCycle: 'h23', timezone: 'America/New_York' });
    segments(d)[0]!.focus();
    await userEvent.keyboard('110120260130');
    expect(d.validity.localTimeStatus).toBe('ambiguous');
    expect(instantToString(d.value as never)).toBe('2026-11-01T05:30:00.000Z');
    expect(hintText(d)).toContain('earlier occurrence');
  });

  it('renders a day-period segment for 12-hour locales', () => {
    const d = mount({ granularity: 'minute', locale: 'en-US' });
    expect(segmentTypes(d)).toEqual(['month', 'day', 'year', 'hour', 'minute', 'dayPeriod']);
    d.setValue(parseInstant('2026-06-01T15:05:00Z'));
    expect(segments(d).slice(3).map((s) => s.value)).toEqual(['03', '05', 'PM']);
  });

  it('treats granularity as init-only', () => {
    const d = mount();
    expect(() => {
      d.update({ granularity: 'minute' });
    }).toThrow(/cannot change after initialization/);
  });
});
