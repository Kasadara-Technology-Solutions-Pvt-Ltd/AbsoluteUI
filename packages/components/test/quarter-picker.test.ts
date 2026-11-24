import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { plainDate, plainYearQuarter, plainYearQuarterToString, registerMessages, resetAbsoluteUIConfig, type PlainYearQuarter } from '@absoluteui/core';
import { QuarterPicker, type QuarterPickerOptions } from '@absoluteui/components/quarter-picker';
import { Form } from '@absoluteui/components/form';

// Quarter-specific behavior; the shared period-picker engine is covered in month-picker.test.ts.

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<QuarterPickerOptions> = {}, parent: HTMLElement = document.body): QuarterPicker {
  const host = document.createElement('div');
  parent.append(host);
  return QuarterPicker.create(host, { label: 'Reporting quarter', name: 'quarter', locale: 'en-US', today: plainDate(2026, 9, 27), ...options });
}

const segments = (p: QuarterPicker): HTMLInputElement[] => Array.from(p.group.querySelectorAll('.aui-period-picker__segment'));
const cells = (p: QuarterPicker): HTMLElement[] => Array.from(p.grid.querySelectorAll<HTMLElement>('[role="gridcell"]'));
const activeLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
const iso = (v: PlainYearQuarter | null): string | null => (v ? plainYearQuarterToString(v) : null);

describe('QuarterPicker', () => {
  it('renders a Q literal, quarter and year segments, and one row of four quarters with their months', () => {
    const p = mount({ value: plainYearQuarter(2026, 2) });
    expect(p.group.querySelector('.aui-period-picker__fields')!.textContent).toBe('Q ');
    expect(segments(p).map((s) => [s.getAttribute('aria-label'), s.value])).toEqual([
      ['Quarter', '2'],
      ['Year', '2026'],
    ]);
    expect(p.button.getAttribute('aria-label')).toBe('Change quarter, Q2 2026');
    p.open();
    expect(cells(p).map((c) => c.getAttribute('aria-label'))).toEqual([
      'Q1 2026, January to March',
      'Q2 2026, April to June',
      'Q3 2026, July to September',
      'Q4 2026, October to December',
    ]);
    expect(cells(p)[1]!.textContent).toBe('Q2Apr to Jun');
    expect(cells(p)[1]!.getAttribute('aria-selected')).toBe('true');
    expect(cells(p)[2]!.getAttribute('aria-current')).toBe('date');
    expect(activeLabel()).toBe('Q2 2026, April to June');
  });

  it('ArrowDown/Up move by a year; End and Enter pick', async () => {
    const p = mount({ value: plainYearQuarter(2026, 2) });
    p.open();
    await userEvent.keyboard('{ArrowUp}');
    expect(activeLabel()).toBe('Q2 2025, April to June');
    await userEvent.keyboard('{End}{Enter}');
    expect(iso(p.value)).toBe('2025-Q4');
    expect(p.getFormValue()).toBe('2025-Q4');
    expect(p.isOpen).toBe(false);
  });

  it('types a quarter digit then the year; rejects quarter 5', async () => {
    const p = mount();
    segments(p)[0]!.focus();
    await userEvent.keyboard('3');
    expect(document.activeElement).toBe(segments(p)[1]);
    await userEvent.keyboard('2027');
    expect(iso(p.value)).toBe('2027-Q3');
    segments(p)[0]!.focus();
    await userEvent.keyboard('5');
    expect(p.validity).toMatchObject({ error: 'invalid', message: 'Enter a valid quarter (1 to 4).' });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(p)[0]!.value).toBe('1');
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(p)[0]!.value).toBe('4');
  });

  it('computes the current quarter in the configured timezone (fixed instant)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    // 30 June 20:00 UTC is 1 July at Lord Howe (UTC+10:30) and in Kolkata (01:30).
    vi.setSystemTime(Date.UTC(2026, 5, 30, 20, 0));
    const at = (timezone?: string): string | null => iso(QuarterPicker.create(document.body.appendChild(document.createElement('div')), { label: 'x', ...(timezone ? { timezone } : {}) }).current);
    expect(at()).toBe('2026-Q2');
    expect(at('Australia/Lord_Howe')).toBe('2026-Q3');
    expect(at('Asia/Kolkata')).toBe('2026-Q3');
    expect(at('America/New_York')).toBe('2026-Q2');
  });

  it('segment order follows a registered pattern message', () => {
    registerMessages('quarterPicker', 'fr', { pattern: '{quarter}e trimestre {year}' });
    const p = mount({ locale: 'fr-FR' });
    expect(segments(p).map((s) => s.getAttribute('aria-label'))).toEqual(['Quarter', 'Year']);
    expect(p.group.querySelector('.aui-period-picker__fields')!.textContent).toBe('e trimestre ');
  });

  it('checks bounds and isQuarterDisabled, and serializes through Form', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({ min: plainYearQuarter(2026, 1), isQuarterDisabled: (q) => q.quarter === 4 }, form);
    p.setValue(plainYearQuarter(2025, 4));
    expect(p.validity).toMatchObject({ error: 'range-underflow', message: 'Enter Q1 2026 or later.' });
    p.setValue(plainYearQuarter(2026, 4));
    expect(p.validity.error).toBe('unavailable');
    p.setValue(plainYearQuarter(2026, 3));
    const f = Form.create(form);
    expect(f.getValues()).toMatchObject({ quarter: '2026-Q3' });
    f.destroy();
  });
});
