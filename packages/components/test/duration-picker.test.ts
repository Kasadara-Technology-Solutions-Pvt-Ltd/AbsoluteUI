import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, duration, resetAbsoluteUIConfig } from '@absoluteui/core';
import { DurationPicker, type DurationPickerChangeDetail, type DurationPickerOptions } from '@absoluteui/components/duration-picker';
import { Form } from '@absoluteui/components/form';
import { findFormControls, getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const MIN = 60_000;
const HOUR = 60 * MIN;

function mount(options: Partial<DurationPickerOptions> = {}, parent: HTMLElement = document.body): DurationPicker {
  const host = document.createElement('div');
  parent.append(host);
  return DurationPicker.create(host, { label: 'Estimate', name: 'estimate', locale: 'en-US', ...options });
}

const segments = (p: DurationPicker): HTMLInputElement[] => Array.from(p.group.querySelectorAll('.aui-duration-picker__segment'));
const values = (p: DurationPicker): string[] => segments(p).map((s) => s.value);
const errorText = (p: DurationPicker): string => p.host.querySelector('.aui-field__error')!.textContent;

describe('DurationPicker: structure', () => {
  it('renders one labelled spinbutton per unit with visible unit text', () => {
    const p = mount({ value: duration(90 * MIN) });
    expect(p.group.getAttribute('role')).toBe('group');
    expect(document.getElementById(p.group.getAttribute('aria-labelledby')!)!.textContent).toContain('Estimate');
    const [h, m] = segments(p);
    expect(segments(p).map((s) => [s.getAttribute('role'), s.getAttribute('aria-label')])).toEqual([
      ['spinbutton', 'Hours'],
      ['spinbutton', 'Minutes'],
    ]);
    expect(values(p)).toEqual(['1', '30']);
    expect(h!.getAttribute('aria-valuenow')).toBe('1');
    expect(h!.getAttribute('aria-valuetext')).toBe('1 hour');
    expect(h!.getAttribute('aria-valuemin')).toBe('0');
    // Without max, the largest unit is limited by its digits (3 for hours).
    expect(h!.getAttribute('aria-valuemax')).toBe('999');
    expect(m!.getAttribute('aria-valuetext')).toBe('30 minutes');
    expect(m!.getAttribute('aria-valuemax')).toBe('59');
    expect(Array.from(p.group.querySelectorAll('.aui-duration-picker__unit-label')).map((u) => u.textContent)).toEqual(['hr', 'min']);
    expect(p.getFormValue()).toBe('PT1H30M');
  });

  it('supports configurable contiguous fields, from global configuration too', () => {
    const p = mount({ fields: ['days', 'hours', 'minutes', 'seconds'], value: duration(26 * HOUR + 61_000) });
    expect(values(p)).toEqual(['1', '02', '01', '01']);
    expect(segments(p)[1]!.getAttribute('aria-valuemax')).toBe('23');
    expect(p.getFormValue()).toBe('PT26H1M1S');
    configureAbsoluteUI({ components: { durationPicker: { fields: ['minutes', 'seconds'] } } });
    const q = mount({ value: duration(90_000) });
    expect(values(q)).toEqual(['1', '30']);
    expect(q.group.querySelectorAll('.aui-duration-picker__unit-label')[1]!.textContent).toBe('sec');
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => DurationPicker.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => DurationPicker.create(host, { label: 'x', fields: ['days', 'minutes'] })).toThrow(/fields/);
    expect(() => DurationPicker.create(host, { label: 'x', fields: [] })).toThrow(/fields/);
    expect(() => DurationPicker.create(host, { label: 'x', value: duration(-MIN) })).toThrow(/value/);
    expect(() => DurationPicker.create(host, { label: 'x', value: duration(30_000) })).toThrow(/whole minutes/);
    expect(() => DurationPicker.create(host, { label: 'x', min: duration(2 * HOUR), max: duration(HOUR) })).toThrow(/min/);
    expect(() => DurationPicker.create(host, { label: 'x', step: duration(90_000) })).toThrow(/step/);
    expect(() => DurationPicker.create(host, { label: 'x', step: duration(0) })).toThrow(/step/);
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
  });

  it('places unit text before the number where the locale does', () => {
    // Hungarian and English put units after the number; the order follows Intl either way.
    const p = mount({ locale: 'hu-HU' });
    const unit = p.group.querySelector('.aui-duration-picker__unit')!;
    expect(unit.firstElementChild!.tagName).toBe('INPUT');
  });
});

describe('DurationPicker: keyboard and typing', () => {
  it('types hours then auto-advances from minutes after two digits or an impossible first digit', async () => {
    const p = mount();
    const events: DurationPickerChangeDetail[] = [];
    p.host.addEventListener('aui-change', (e) => events.push((e as CustomEvent<DurationPickerChangeDetail>).detail));
    segments(p)[0]!.focus();
    await userEvent.keyboard('2:');
    expect(document.activeElement).toBe(segments(p)[1]);
    await userEvent.keyboard('7');
    expect(values(p)).toEqual(['2', '07']);
    expect(p.value?.milliseconds).toBe(2 * HOUR + 7 * MIN);
    expect(events.at(-1)!.value?.milliseconds).toBe(2 * HOUR + 7 * MIN);
  });

  it('empty units count as zero and are filled in when focus leaves', async () => {
    const outside = document.body.appendChild(document.createElement('button'));
    const p = mount();
    segments(p)[0]!.focus();
    await userEvent.keyboard('3');
    expect(p.value?.milliseconds).toBe(3 * HOUR);
    outside.focus();
    expect(values(p)).toEqual(['3', '00']);
  });

  it('ArrowUp/Down step one unit and carry across units; the smallest unit moves by step, snapped to it', async () => {
    const p = mount({ value: duration(HOUR + 50 * MIN), step: duration(15 * MIN) });
    segments(p)[1]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(values(p)).toEqual(['2', '00']);
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(values(p)).toEqual(['1', '30']);
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(values(p)).toEqual(['2', '30']);
    expect(segments(p)[0]!.getAttribute('aria-valuetext')).toBe('2 hours');
  });

  it('stops at min and max, and at zero by default', async () => {
    const p = mount({ value: duration(10 * MIN), min: duration(5 * MIN), max: duration(2 * HOUR) });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(values(p)).toEqual(['0', '05']);
    await userEvent.keyboard('{ArrowUp}{ArrowUp}{ArrowUp}');
    expect(values(p)).toEqual(['2', '00']);
    const q = mount({ value: duration(MIN) });
    segments(q)[1]!.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(values(q)).toEqual(['0', '00']);
    expect(q.value?.milliseconds).toBe(0);
    expect(q.getFormValue()).toBe('PT0S');
  });

  it('Home/End set the segment minimum and maximum', async () => {
    const p = mount({ value: duration(HOUR + 20 * MIN) });
    segments(p)[1]!.focus();
    await userEvent.keyboard('{End}');
    expect(values(p)).toEqual(['1', '59']);
    await userEvent.keyboard('{Home}');
    expect(values(p)).toEqual(['1', '00']);
    segments(p)[0]!.focus();
    await userEvent.keyboard('{End}');
    expect(values(p)).toEqual(['999', '00']);
    p.update({ max: duration(8 * HOUR) });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{End}');
    expect(values(p)).toEqual(['8', '00']);
    expect(segments(p)[0]!.getAttribute('aria-valuemax')).toBe('8');
  });

  it('mirrors Left/Right between units in RTL', async () => {
    const p = mount({ direction: 'rtl', value: duration(HOUR) });
    expect(p.group.dir).toBe('rtl');
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(segments(p)[1]);
  });
});

describe('DurationPicker: validation', () => {
  it('reports range, step, invalid, required, validate, and custom errors with localized durations', () => {
    const p = mount({ min: duration(15 * MIN), max: duration(8 * HOUR), step: duration(15 * MIN), validate: (v) => (v?.milliseconds === 4 * HOUR ? 'Four hours is not billable.' : null) });
    p.setValue(duration(10 * MIN));
    expect(p.validity).toMatchObject({ error: 'range-underflow', message: 'Enter a duration of 15 min or more.' });
    p.setValue(duration(9 * HOUR + 30 * MIN));
    expect(p.validity).toMatchObject({ error: 'range-overflow', message: 'Enter a duration of 8 hr or less.' });
    p.setValue(duration(HOUR + 20 * MIN));
    expect(p.validity).toMatchObject({ error: 'step-mismatch', message: 'Enter a duration in steps of 15 min.' });
    expect(p.value).toBeNull();
    p.setValue(duration(4 * HOUR));
    expect(p.validity).toMatchObject({ error: 'custom', message: 'Four hours is not billable.' });
    expect(p.value?.milliseconds).toBe(4 * HOUR);
    p.setValue(duration(HOUR));
    p.setCustomError('Over budget.');
    expect(p.validity.message).toBe('Over budget.');
    segments(p)[0]!.focus();
    segments(p)[1]!.value = '75';
    segments(p)[1]!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(p.validity).toMatchObject({ error: 'invalid', message: 'Enter a valid duration.' });
    const q = mount({ required: true });
    expect(q.validity.error).toBe('value-missing');
    expect(q.reportValidity()).toBe(false);
    expect(errorText(q)).toBe('This field is required.');
    expect(segments(q).every((s) => s.getAttribute('aria-invalid') === 'true')).toBe(true);
  });

  it('formats mixed durations in messages', () => {
    const p = mount({ min: duration(90 * MIN) });
    p.setValue(duration(MIN));
    expect(p.validity.message).toBe('Enter a duration of 1 hr, 30 min or more.');
  });
});

describe('DurationPicker: form control contract', () => {
  it('registers with Form, serializes ISO 8601, and a disabled picker is not submitted', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const p = mount({ value: duration(45 * MIN) }, form);
    expect(getFormControl(p.host)).toBe(p);
    expect(findFormControls(form)).toEqual([p]);
    expect(new FormData(form).get('estimate')).toBe('PT45M');
    const f = Form.create(form);
    expect(f.getValues()).toMatchObject({ estimate: 'PT45M' });
    f.destroy();
    p.update({ disabled: true });
    expect(new FormData(form).get('estimate')).toBeNull();
    expect(segments(p).every((s) => s.disabled)).toBe(true);
  });

  it('marks the group aria-disabled while disabled (regression)', () => {
    const p = mount({ disabled: true });
    expect(p.group.getAttribute('aria-disabled')).toBe('true');
    p.update({ disabled: false });
    expect(p.group.hasAttribute('aria-disabled')).toBe(false);
  });

  it('tracks dirty/touched; reset restores; programmatic changes emit nothing', async () => {
    const p = mount({ value: duration(HOUR) });
    const onChange = vi.fn();
    p.host.addEventListener('aui-change', onChange);
    p.setValue(duration(2 * HOUR));
    p.update({ value: duration(3 * HOUR) });
    expect(onChange).not.toHaveBeenCalled();
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(onChange).toHaveBeenCalledTimes(1);
    expect(p.dirty).toBe(true);
    await userEvent.tab();
    await userEvent.tab();
    expect(p.touched).toBe(true);
    p.reset();
    expect(p.value?.milliseconds).toBe(HOUR);
    expect(p.dirty).toBe(false);
    expect(p.touched).toBe(false);
  });

  it('read-only keeps the value but ignores stepping', async () => {
    const p = mount({ value: duration(HOUR), readOnly: true });
    segments(p)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(values(p)).toEqual(['1', '00']);
    expect(p.host.classList.contains('aui-duration-picker--readonly')).toBe(true);
  });

  it('keeps the value when fields change', () => {
    const p = mount({ value: duration(26 * HOUR) });
    expect(values(p)).toEqual(['26', '00']);
    p.update({ fields: ['days', 'hours', 'minutes'] });
    expect(values(p)).toEqual(['1', '02', '00']);
    expect(p.value?.milliseconds).toBe(26 * HOUR);
  });

  it('keeps the value when global configuration changes fields or locale (regression)', () => {
    const onChange = vi.fn();
    const p = DurationPicker.create(document.body.appendChild(document.createElement('div')), { label: 'Estimate', value: duration(26 * HOUR) });
    p.host.addEventListener('aui-change', onChange);
    configureAbsoluteUI({ components: { durationPicker: { fields: ['days', 'hours', 'minutes'] } } });
    expect(values(p)).toEqual(['1', '02', '00']);
    configureAbsoluteUI({ common: { locale: 'de-DE' } });
    expect(p.value?.milliseconds).toBe(26 * HOUR);
    expect(p.getFormValue()).toBe('PT26H');
    expect(onChange).not.toHaveBeenCalled();
  });

  it('reports a programmatic value beyond the digits of the largest unit as a range error (regression)', () => {
    const p = mount({ max: duration(8 * HOUR) });
    p.setValue(duration(10 * HOUR));
    expect(p.validity.error).toBe('range-overflow');
  });

  it('destroy removes rendering, registration, listeners, and subscriptions', () => {
    const p = mount();
    const host = p.host;
    p.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
    configureAbsoluteUI({ common: { locale: 'de-DE' } });
    expect(host.childElementCount).toBe(0);
  });
});
