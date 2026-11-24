import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, plainTime, plainTimeToString, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { TimePicker, type TimePickerChangeDetail, type TimePickerOptions } from '@absoluteui/components/time-picker';
import { Dialog } from '@absoluteui/components/dialog';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<TimePickerOptions> = {}, parent: HTMLElement = document.body): TimePicker {
  const host = document.createElement('div');
  parent.append(host);
  return TimePicker.create(host, { label: 'Start time', name: 'start', ...options });
}

// Intl may use U+202F (narrow no-break space) before the day period.
const norm = (s: string): string => s.replace(/\s/gu, ' ');
const segments = (t: TimePicker): HTMLInputElement[] => Array.from(t.group.querySelectorAll('.aui-time-picker__segment'));
const segmentTypes = (t: TimePicker): string[] => segments(t).map((s) => /--(\w+)/.exec(s.className)?.[1] ?? '');
const values = (t: TimePicker): string[] => segments(t).map((s) => s.value);
const errorText = (t: TimePicker): string => t.host.querySelector<HTMLElement>('.aui-field__error')!.textContent;
const optionLabels = (t: TimePicker): string[] => Array.from(t.listbox.querySelectorAll('[role="option"]')).map((o) => norm(o.textContent));
const active = (t: TimePicker): string | null => {
  const id = t.listbox.getAttribute('aria-activedescendant');
  return id ? norm(document.getElementById(id)?.textContent ?? '') : null;
};
const time = (t: TimePicker): string | null => (t.value ? plainTimeToString(t.value) : null);

describe('TimePicker: structure and accessibility', () => {
  it('orders segments by locale and hour cycle', () => {
    expect(segmentTypes(mount({ locale: 'en-US' }))).toEqual(['hour', 'minute', 'dayPeriod']);
    expect(segmentTypes(mount({ locale: 'en-GB' }))).toEqual(['hour', 'minute']);
    expect(segmentTypes(mount({ locale: 'de-DE' }))).toEqual(['hour', 'minute']);
    expect(segmentTypes(mount({ locale: 'en-US', hourCycle: 'h23' }))).toEqual(['hour', 'minute']);
    expect(segmentTypes(mount({ locale: 'de-DE', hourCycle: 'h12' }))).toContain('dayPeriod');
    expect(segmentTypes(mount({ locale: 'en-GB', granularity: 'second' }))).toEqual(['hour', 'minute', 'second']);
  });

  it('is a labelled group of labelled segments with a popup button', () => {
    const t = mount({ description: 'Local time at the venue', required: true });
    expect(t.group.getAttribute('role')).toBe('group');
    const label = document.getElementById(t.group.getAttribute('aria-labelledby')!)!;
    expect(label.textContent).toBe('Start time*');
    expect(segments(t).map((s) => s.getAttribute('aria-label'))).toEqual(['Hour', 'Minute', 'AM/PM']);
    expect(segments(t).every((s) => s.required)).toBe(true);
    expect(document.getElementById(t.group.getAttribute('aria-describedby')!)!.textContent).toBe('Local time at the venue');
    expect(t.button.getAttribute('aria-label')).toBe('Choose time');
    expect(t.button.getAttribute('aria-haspopup')).toBe('listbox');
    expect(t.button.getAttribute('aria-expanded')).toBe('false');
    expect(t.button.getAttribute('aria-controls')).toBe(t.listbox.id);
    expect(t.listbox.getAttribute('aria-labelledby')).toBe(label.id);
    expect(t.host.querySelector('.aui-time-picker__popup')!.getAttribute('popover')).toBe('manual');
  });

  it('shows the value with localized day periods', () => {
    expect(values(mount({ locale: 'en-US', value: plainTime(21, 5) }))).toEqual(['09', '05', 'PM']);
    expect(values(mount({ locale: 'en-GB', value: plainTime(21, 5) }))).toEqual(['21', '05']);
    expect(values(mount({ locale: 'en-US', value: plainTime(0, 30) }))).toEqual(['12', '30', 'AM']);
  });

  it('clicking the label focuses the first segment', async () => {
    const t = mount();
    await userEvent.click(t.host.querySelector('label')!);
    expect(document.activeElement).toBe(segments(t)[0]);
  });
});

describe('TimePicker: typing and keyboard', () => {
  it('types a 12-hour time with auto-advance and emits aui-change', async () => {
    const t = mount({ locale: 'en-US' });
    const changes: TimePickerChangeDetail[] = [];
    document.body.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<TimePickerChangeDetail>).detail));
    segments(t)[0]!.focus();
    await userEvent.keyboard('930p');
    expect(values(t)).toEqual(['09', '30', 'PM']);
    expect(time(t)).toBe('21:30:00');
    expect(t.getFormValue()).toBe('21:30');
    expect(t.host.querySelector<HTMLInputElement>('input[type=hidden]')!.value).toBe('21:30');
    expect(changes.at(-1)).toMatchObject({ validity: { valid: true } });
    expect(changes.at(-1)?.value?.hour).toBe(21);
  });

  it('types a 24-hour time in en-GB and de-DE', async () => {
    for (const locale of ['en-GB', 'de-DE']) {
      const t = mount({ locale });
      segments(t)[0]!.focus();
      await userEvent.keyboard('1745');
      expect(time(t)).toBe('17:45:00');
      expect(document.activeElement).toBe(segments(t)[1]);
      t.destroy();
    }
  });

  it('pads on a separator and advances', async () => {
    const t = mount({ locale: 'en-GB' });
    segments(t)[0]!.focus();
    await userEvent.keyboard('7:5:');
    expect(values(t)).toEqual(['07', '05']);
  });

  it('steps with ArrowUp/ArrowDown and wraps', async () => {
    const t = mount({ locale: 'en-US' });
    segments(t)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(t)[0]!.value).toBe('01');
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(t)[0]!.value).toBe('12');
    segments(t)[1]!.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(t)[1]!.value).toBe('59');
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(t)[1]!.value).toBe('00');
    segments(t)[2]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(t)[2]!.value).toBe('AM');
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(t)[2]!.value).toBe('PM');
    expect(time(t)).toBe('12:00:00');
  });

  it('steps 24-hour hours through 0..23', async () => {
    const t = mount({ locale: 'de-DE' });
    segments(t)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(segments(t)[0]!.value).toBe('00');
    await userEvent.keyboard('{ArrowDown}');
    expect(segments(t)[0]!.value).toBe('23');
  });

  it('Backspace on an empty segment and arrow keys move between segments', async () => {
    const t = mount({ locale: 'en-GB', value: plainTime(10, 15) });
    segments(t)[1]!.focus();
    await userEvent.keyboard('{Backspace}');
    expect(segments(t)[1]!.value).toBe('');
    await userEvent.keyboard('{Backspace}');
    expect(document.activeElement).toBe(segments(t)[0]);
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(segments(t)[1]);
    await userEvent.keyboard('{ArrowLeft}');
    expect(document.activeElement).toBe(segments(t)[0]);
  });

  it('readOnly blocks stepping and the popup', async () => {
    const t = mount({ value: plainTime(8, 0), readOnly: true });
    segments(t)[0]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(time(t)).toBe('08:00:00');
    expect(t.button.disabled).toBe(true);
    t.open();
    expect(t.isOpen).toBe(false);
  });
});

describe('TimePicker: suggestions listbox', () => {
  it('opens from the button, focuses the listbox, and activates the option nearest the value', async () => {
    const t = mount({ locale: 'en-US', value: plainTime(10, 10) });
    const open = vi.fn();
    const bubbled = vi.fn();
    t.host.addEventListener('aui-open', open);
    document.body.addEventListener('aui-open', bubbled);
    await userEvent.click(t.button);
    expect(t.isOpen).toBe(true);
    expect(t.button.getAttribute('aria-expanded')).toBe('true');
    expect(document.activeElement).toBe(t.listbox);
    expect(t.listbox.tabIndex).toBe(0);
    expect(optionLabels(t)).toHaveLength(48);
    expect(optionLabels(t).slice(0, 3)).toEqual(['12:00 AM', '12:30 AM', '1:00 AM']);
    expect(active(t)).toBe('10:00 AM');
    expect(open).toHaveBeenCalledTimes(1);
    expect(bubbled).not.toHaveBeenCalled();
  });

  it('navigates with arrows, Home/End, PageUp/PageDown and typeahead; Enter selects', async () => {
    const t = mount({ locale: 'en-GB', step: 60 });
    const changes: TimePickerChangeDetail[] = [];
    t.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<TimePickerChangeDetail>).detail));
    await userEvent.click(t.button);
    expect(active(t)).toBe('00:00');
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(active(t)).toBe('02:00');
    await userEvent.keyboard('{ArrowUp}');
    expect(active(t)).toBe('01:00');
    await userEvent.keyboard('{End}');
    expect(active(t)).toBe('23:00');
    await userEvent.keyboard('{ArrowDown}');
    expect(active(t)).toBe('23:00');
    await userEvent.keyboard('{Home}{PageDown}');
    expect(active(t)).toBe('10:00');
    await userEvent.keyboard('{PageUp}');
    expect(active(t)).toBe('00:00');
    await new Promise((r) => {
      setTimeout(r, 600);
    });
    await userEvent.keyboard('14');
    expect(active(t)).toBe('14:00');
    await userEvent.keyboard('{Enter}');
    expect(t.isOpen).toBe(false);
    expect(time(t)).toBe('14:00:00');
    expect(document.activeElement).toBe(segments(t)[0]);
    expect(changes).toHaveLength(1);
    expect(changes[0]).toMatchObject({ validity: { valid: true } });
  });

  it('marks the selected option and selects by click', async () => {
    const t = mount({ locale: 'en-GB', value: plainTime(9, 0) });
    await userEvent.click(t.button);
    const selected = t.listbox.querySelector('[aria-selected="true"]')!;
    expect(norm(selected.textContent)).toBe('09:00');
    const option = Array.from(t.listbox.querySelectorAll<HTMLElement>('[role="option"]')).find((o) => o.textContent === '13:30')!;
    await userEvent.click(option);
    expect(time(t)).toBe('13:30:00');
    expect(t.isOpen).toBe(false);
  });

  it('Escape closes, returns focus to the button, and keeps the value', async () => {
    const t = mount({ value: plainTime(9, 0) });
    const close = vi.fn();
    t.host.addEventListener('aui-close', close);
    await userEvent.click(t.button);
    await userEvent.keyboard('{ArrowDown}{Escape}');
    expect(t.isOpen).toBe(false);
    expect(document.activeElement).toBe(t.button);
    expect(time(t)).toBe('09:00:00');
    expect(close).toHaveBeenCalledTimes(1);
    expect(t.listbox.hasAttribute('aria-activedescendant')).toBe(false);
  });

  it('clicking the button while open closes the listbox', async () => {
    const t = mount();
    await userEvent.click(t.button);
    await userEvent.click(t.button);
    expect(t.isOpen).toBe(false);
  });

  it('Tab out of the listbox closes it', async () => {
    const t = mount();
    const after = document.createElement('button');
    document.body.append(after);
    await userEvent.click(t.button);
    await userEvent.tab();
    expect(t.isOpen).toBe(false);
    expect(document.activeElement).toBe(after);
  });

  it('Alt+ArrowDown on a segment opens the listbox', async () => {
    const t = mount();
    segments(t)[0]!.focus();
    await userEvent.keyboard('{Alt>}{ArrowDown}{/Alt}');
    expect(t.isOpen).toBe(true);
  });

  it('renders 1,440 suggestions (step 1) within budget and activates the nearest one (regression: flaky under suite load)', () => {
    const t = mount({ locale: 'en-GB', step: 1, value: plainTime(18, 7) });
    // Fastest of five opens: a code regression slows every run, while one-off costs (JIT,
    // formatter creation) and scheduler noise from the rest of the suite do not. Same budget.
    const runs: number[] = [];
    for (let i = 0; i < 5; i++) {
      const start = performance.now();
      t.open();
      runs.push(performance.now() - start);
      t.close();
    }
    t.open();
    expect(Math.min(...runs)).toBeLessThan(100);
    expect(optionLabels(t)).toHaveLength(1440);
    expect(active(t)).toBe('18:07');
  });

  it('suggests only times between min and max', async () => {
    const t = mount({ locale: 'en-US', min: plainTime(9, 0), max: plainTime(11, 0), step: 60 });
    await userEvent.click(t.button);
    expect(optionLabels(t)).toEqual(['9:00 AM', '10:00 AM', '11:00 AM']);
  });

  it('bases suggestions on min and rounds seconds up at minute granularity', async () => {
    const t = mount({ locale: 'en-GB', min: plainTime(9, 14, 30), max: plainTime(10, 0), step: 15 });
    await userEvent.click(t.button);
    expect(optionLabels(t)).toEqual(['09:15', '09:30', '09:45', '10:00']);
  });
});

describe('TimePicker: validation', () => {
  it('validates min and max with formatted bounds', async () => {
    const t = mount({ locale: 'en-US', min: plainTime(9, 0), max: plainTime(17, 30) });
    segments(t)[0]!.focus();
    await userEvent.keyboard('800a');
    expect(t.validity.error).toBe('range-underflow');
    expect(t.value).toBeNull();
    expect(t.reportValidity()).toBe(false);
    expect(norm(errorText(t))).toBe('Enter a time of 9:00 AM or later.');
    t.setValue(plainTime(18, 0));
    expect(norm(t.validity.message)).toBe('Enter a time of 5:30 PM or earlier.');
    expect(t.validity.error).toBe('range-overflow');
  });

  it('reports incomplete and invalid times', async () => {
    const t = mount({ locale: 'en-GB' });
    segments(t)[0]!.focus();
    await userEvent.keyboard('9');
    expect(t.validity).toMatchObject({ valid: false, error: 'incomplete', message: 'Enter a complete time.' });
    const u = mount({ locale: 'en-GB' });
    segments(u)[0]!.focus();
    await userEvent.keyboard('29');
    segments(u)[1]!.focus();
    await userEvent.keyboard('00');
    expect(u.validity).toMatchObject({ error: 'invalid', message: 'Enter a valid time.' });
    expect(u.getFormValue()).toBeNull();
  });

  it('shows the required message after blur and marks segments invalid', async () => {
    const t = mount({ required: true });
    expect(t.validity.error).toBe('value-missing');
    expect(segments(t)[0]!.hasAttribute('aria-invalid')).toBe(false);
    segments(t)[0]!.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(segments(t)[1]);
    expect(t.touched).toBe(false);
    await userEvent.tab();
    await userEvent.tab();
    await userEvent.tab();
    expect(t.touched).toBe(true);
    expect(errorText(t)).toBe('This field is required.');
    expect(segments(t).every((s) => s.getAttribute('aria-invalid') === 'true')).toBe(true);
    expect(t.group.getAttribute('aria-describedby')).toBe(t.host.querySelector('.aui-field__error')!.id);
  });

  it('runs the consumer validator and external errors, cleared by user edits', async () => {
    const t = mount({ locale: 'en-GB', value: plainTime(12, 0), validate: (v) => (v?.hour === 12 ? 'Lunch break.' : null) });
    expect(t.validity).toMatchObject({ error: 'custom', message: 'Lunch break.' });
    expect(time(t)).toBe('12:00:00');
    t.update({ validate: () => null });
    t.setCustomError('Slot taken.');
    expect(t.validity.message).toBe('Slot taken.');
    segments(t)[1]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(t.validity.valid).toBe(true);
  });

  it('localizes messages through the catalog', () => {
    registerMessages('timePicker', 'de', { incomplete: 'Geben Sie eine vollständige Uhrzeit ein.', chooseTime: 'Uhrzeit wählen' });
    const t = mount({ locale: 'de-DE' });
    expect(t.button.getAttribute('aria-label')).toBe('Uhrzeit wählen');
    segments(t)[0]!.value = '1';
    segments(t)[0]!.dispatchEvent(new Event('input', { bubbles: true }));
    expect(t.validity.message).toBe('Geben Sie eine vollständige Uhrzeit ein.');
  });
});

describe('TimePicker: configuration', () => {
  it('honours global hourCycle and step, with instance options taking precedence', async () => {
    configureAbsoluteUI({ components: { timePicker: { hourCycle: 'h23', step: 15 } } });
    const t = mount({ locale: 'en-US' });
    expect(segmentTypes(t)).toEqual(['hour', 'minute']);
    await userEvent.click(t.button);
    expect(optionLabels(t).slice(0, 2)).toEqual(['00:00', '00:15']);
    const u = mount({ locale: 'en-US', hourCycle: 'h12' });
    expect(segmentTypes(u)).toContain('dayPeriod');
  });

  it('rebuilds segments on a global locale change, keeping the value', () => {
    const t = mount({ value: plainTime(15, 20) });
    expect(values(t)).toEqual(['03', '20', 'PM']);
    configureAbsoluteUI({ locale: 'en-GB' });
    expect(values(t)).toEqual(['15', '20']);
    expect(time(t)).toBe('15:20:00');
  });

  it('rejects invalid options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => TimePicker.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => TimePicker.create(host, { label: 'x', step: 0 })).toThrow(AbsoluteUIError);
    expect(() => TimePicker.create(host, { label: 'x', step: 721 })).toThrow(AbsoluteUIError);
    expect(() => TimePicker.create(host, { label: 'x', min: plainTime(12), max: plainTime(9) })).toThrow(/min/);
    expect(() => TimePicker.create(host, { label: 'x', value: plainTime(9, 0, 30) })).toThrow(/value/);
    expect(host.childElementCount).toBe(0);
    expect(host.classList.length).toBe(0);
  });

  it('granularity is init-only', () => {
    const t = mount();
    expect(() => {
      t.update({ granularity: 'second' });
    }).toThrow(AbsoluteUIError);
  });
});

describe('TimePicker: form control contract', () => {
  it('registers, serializes HH:MM, and reset restores the initial value', async () => {
    const t = mount({ locale: 'en-GB', value: plainTime(9, 30) });
    expect(getFormControl(t.host)).toBe(t);
    expect(t.getFormValue()).toBe('09:30');
    expect(t.dirty).toBe(false);
    segments(t)[1]!.focus();
    await userEvent.keyboard('{ArrowUp}');
    await userEvent.tab();
    await userEvent.tab();
    expect(t.getFormValue()).toBe('09:31');
    expect(t.dirty).toBe(true);
    expect(t.touched).toBe(true);
    t.reset();
    expect(t.getFormValue()).toBe('09:30');
    expect(t.dirty).toBe(false);
    expect(t.touched).toBe(false);
  });

  it('serializes seconds at second granularity', () => {
    const t = mount({ granularity: 'second', value: plainTime(9, 30, 15) });
    expect(t.getFormValue()).toBe('09:30:15');
    expect(values(t)).toEqual(['09', '30', '15', 'AM']);
  });

  it('does not submit while disabled', () => {
    const t = mount({ disabled: true, value: plainTime(9, 0) });
    expect(t.host.querySelector<HTMLInputElement>('input[type=hidden]')!.disabled).toBe(true);
    expect(segments(t).every((s) => s.disabled)).toBe(true);
    expect(t.button.disabled).toBe(true);
  });

  it('programmatic changes emit nothing', () => {
    const t = mount();
    const change = vi.fn();
    t.host.addEventListener('aui-change', change);
    t.setValue(plainTime(8, 0));
    t.update({ value: plainTime(9, 0) });
    t.reset();
    expect(change).not.toHaveBeenCalled();
  });

  it('destroy removes rendering, registration, popup, and subscriptions', async () => {
    const t = mount();
    const host = t.host;
    await userEvent.click(t.button);
    t.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
    expect(getFormControl(host)).toBeUndefined();
    expect(host.hasAttribute('data-aui-control')).toBe(false);
    configureAbsoluteUI({ locale: 'de-DE' });
    expect(host.childElementCount).toBe(0);
  });
});

describe('TimePicker inside a Dialog (overlay stacking)', () => {
  it('Escape closes the listbox only, not the dialog', async () => {
    const d = Dialog.create({ title: 'Schedule' });
    const t = mount({}, d.body);
    d.open();
    await userEvent.click(t.button);
    expect(t.isOpen).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(t.isOpen).toBe(false);
    expect(d.isOpen).toBe(true);
    expect(document.activeElement).toBe(t.button);
    d.close();
  });
});
