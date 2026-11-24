import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, plainDate, resetAbsoluteUIConfig } from '@absoluteui/core';
import { YearPicker, type YearPickerChangeDetail, type YearPickerOptions } from '@absoluteui/components/year-picker';
import { Form } from '@absoluteui/components/form';

// Year-specific behavior; the shared period-picker engine is covered in month-picker.test.ts.

afterEach(() => {
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<YearPickerOptions> = {}, parent: HTMLElement = document.body): YearPicker {
  const host = document.createElement('div');
  parent.append(host);
  return YearPicker.create(host, { label: 'Fiscal year', name: 'year', locale: 'en-US', today: plainDate(2026, 9, 27), ...options });
}

const segments = (p: YearPicker): HTMLInputElement[] => Array.from(p.group.querySelectorAll('.aui-period-picker__segment'));
const labels = (p: YearPicker): (string | null)[] => Array.from(p.grid.querySelectorAll('[role="gridcell"]')).map((c) => c.getAttribute('aria-label'));
const activeLabel = (): string | null => document.activeElement?.getAttribute('aria-label') ?? null;
const heading = (p: YearPicker): string => p.popup.querySelector('.aui-period-picker__heading')!.textContent;

describe('YearPicker', () => {
  it('renders one year segment and a decade grid of 2 rows x 5 columns', () => {
    const p = mount({ value: 2026 });
    expect(segments(p).map((s) => [s.getAttribute('aria-label'), s.value])).toEqual([['Year', '2026']]);
    p.open();
    expect(heading(p)).toBe('2020 to 2029');
    expect(p.grid.querySelectorAll('[role="row"]')).toHaveLength(2);
    expect(labels(p)).toEqual(['2020', '2021', '2022', '2023', '2024', '2025', '2026', '2027', '2028', '2029']);
    expect(activeLabel()).toBe('2026');
    expect(p.grid.querySelector('[aria-current="date"]')!.getAttribute('aria-label')).toBe('2026');
    expect(p.popup.querySelector('.aui-period-picker__prev')!.getAttribute('aria-label')).toBe('Previous 10 years');
  });

  it('moves by rows of five and pages by decades (Shift: centuries)', async () => {
    const p = mount({ value: 2026 });
    p.open();
    await userEvent.keyboard('{ArrowDown}');
    expect(activeLabel()).toBe('2031');
    expect(heading(p)).toBe('2030 to 2039');
    await userEvent.keyboard('{Home}');
    expect(activeLabel()).toBe('2030');
    await userEvent.keyboard('{PageUp}');
    expect(activeLabel()).toBe('2020');
    await userEvent.keyboard('{Shift>}{PageUp}{/Shift}');
    expect(activeLabel()).toBe('1920');
    await userEvent.keyboard('{Enter}');
    expect(p.value).toBe(1920);
    expect(p.getFormValue()).toBe('1920');
  });

  it('requires four digits and supports years 1-9999 (the first decade page starts at 1)', async () => {
    const p = mount();
    const events: YearPickerChangeDetail[] = [];
    p.host.addEventListener('aui-change', (e) => events.push((e as CustomEvent<YearPickerChangeDetail>).detail));
    segments(p)[0]!.focus();
    await userEvent.keyboard('26');
    expect(p.validity).toMatchObject({ error: 'incomplete', message: 'Enter the year with 4 digits.' });
    await userEvent.keyboard('{Backspace}{Backspace}0005');
    expect(p.value).toBe(5);
    expect(p.getFormValue()).toBe('0005');
    expect(events.at(-1)!.value).toBe(5);
    p.open();
    expect(heading(p)).toBe('1 to 9');
    expect(p.grid.querySelectorAll('.aui-period-picker__cell--empty')).toHaveLength(1);
    expect(p.popup.querySelector('.aui-period-picker__prev')!.getAttribute('aria-disabled')).toBe('true');
    // Year 0 does not exist: moving above year 5 stops at year 1.
    await userEvent.keyboard('{ArrowUp}');
    expect(activeLabel()).toBe('1');
    p.close();
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(p)[0]!.value).toBe('0004');
  });

  it('validates values, bounds, and isYearDisabled', () => {
    const host = document.createElement('div');
    expect(() => YearPicker.create(host, { label: 'x', value: 2026.5 })).toThrow(AbsoluteUIError);
    expect(() => YearPicker.create(host, { label: 'x', value: 0 })).toThrow(/yearPicker.value/);
    expect(() => YearPicker.create(host, { label: 'x', min: 2030, max: 2020 })).toThrow(/min/);
    expect(host.childElementCount).toBe(0);
    const p = mount({ min: 2000, max: 2030, isYearDisabled: (y) => y === 2027 });
    p.setValue(1999);
    expect(p.validity).toMatchObject({ error: 'range-underflow', message: 'Enter 2000 or later.' });
    p.setValue(2027);
    expect(p.validity).toMatchObject({ error: 'unavailable', message: 'This year is not available.' });
    p.setValue(2026);
    p.open();
    expect(p.grid.querySelector('[aria-label="2027"]')!.getAttribute('aria-disabled')).toBe('true');
  });

  it('computes the current year in the configured timezone (fixed instant)', () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(Date.UTC(2026, 11, 31, 19, 0));
    const at = (timezone?: string): number => YearPicker.create(document.body.appendChild(document.createElement('div')), { label: 'x', ...(timezone ? { timezone } : {}) }).current;
    expect(at()).toBe(2026);
    expect(at('Asia/Kolkata')).toBe(2027);
    expect(at('Australia/Lord_Howe')).toBe(2027);
    expect(at('America/New_York')).toBe(2026);
  });

  it('serializes through Form', () => {
    const form = document.createElement('form');
    document.body.append(form);
    mount({ value: 2026 }, form);
    const f = Form.create(form);
    expect(f.getValues()).toMatchObject({ year: '2026' });
    f.destroy();
  });
});
