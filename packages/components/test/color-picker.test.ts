import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ColorPicker, colorPickerConfig, type ColorPickerOptions, type ColorPickerValueDetail } from '@absoluteui/components/color-picker';
import { contrastRatio, formatColor, hsvToRgb, parseColor, rgbToHsv, toHex } from '../src/color-picker/color.js';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  Reflect.deleteProperty(window, 'EyeDropper');
  document.body.replaceChildren();
});

function mount(options: Partial<ColorPickerOptions> = {}): ColorPicker {
  const host = document.createElement('div');
  document.body.append(host);
  return ColorPicker.create(host, { label: 'Brand color', mode: 'inline', ...options });
}

const q = (c: ColorPicker, selector: string): HTMLElement => {
  const el = c.host.querySelector<HTMLElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};
const qi = (c: ColorPicker, selector: string): HTMLInputElement => {
  const el = c.host.querySelector<HTMLInputElement>(selector);
  if (!el) throw new Error(`missing ${selector}`);
  return el;
};
const area = (c: ColorPicker): HTMLElement => q(c, '.aui-color-picker__area-thumb');
const hue = (c: ColorPicker): HTMLElement => q(c, '.aui-color-picker__slider--hue [role="slider"]');
const alpha = (c: ColorPicker): HTMLElement => q(c, '.aui-color-picker__slider--alpha [role="slider"]');

function record(c: ColorPicker): { input: unknown[]; change: unknown[] } {
  const log = { input: [] as unknown[], change: [] as unknown[] };
  c.host.addEventListener('aui-input', (e) => log.input.push((e as CustomEvent<ColorPickerValueDetail>).detail.value));
  c.host.addEventListener('aui-change', (e) => log.change.push((e as CustomEvent<ColorPickerValueDetail>).detail.value));
  return log;
}

describe('color math', () => {
  it('parses hex, rgb(), and hsl() text', () => {
    expect(parseColor('#abc')).toEqual({ r: 170, g: 187, b: 204, a: 1 });
    expect(parseColor('2563eb')).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseColor('#2563eb80')?.a).toBeCloseTo(0.502, 2);
    expect(parseColor('rgb(37, 99, 235)')).toEqual({ r: 37, g: 99, b: 235, a: 1 });
    expect(parseColor('rgb(37 99 235 / 50%)')?.a).toBe(0.5);
    const hsl = parseColor('hsl(0, 100%, 50%)');
    expect(hsl && toHex(hsl, false)).toBe('#ff0000');
    expect(parseColor('rgb(300, 0, 0)')).toBeNull();
    expect(parseColor('hsl(10, 20, 30)')).toBeNull();
    expect(parseColor('red')).toBeNull();
  });

  it('round-trips through HSV and formats', () => {
    const c = { r: 37, g: 99, b: 235, a: 1 };
    expect(toHex(hsvToRgb(rgbToHsv(c)), false)).toBe('#2563eb');
    expect(formatColor(c, 'rgb', false)).toBe('rgb(37, 99, 235)');
    expect(formatColor(c, 'hsl', false)).toBe('hsl(221, 83%, 53%)');
    expect(formatColor({ ...c, a: 0.5 }, 'rgb', true)).toBe('rgb(37 99 235 / 0.5)');
  });

  it('computes the WCAG contrast ratio', () => {
    const white = { r: 255, g: 255, b: 255, a: 1 };
    expect(contrastRatio({ r: 0, g: 0, b: 0, a: 1 }, white)).toBeCloseTo(21, 1);
    expect(contrastRatio(white, white)).toBeCloseTo(1, 5);
    expect(contrastRatio({ r: 37, g: 99, b: 235, a: 1 }, white)).toBeCloseTo(5.17, 1);
  });
});

describe('ColorPicker', () => {
  it('renders a labelled area and hue slider, normalizes the value, and registers as a form control', () => {
    const c = mount({ value: 'RGB(37, 99, 235)', name: 'brand' });
    expect(c.value).toBe('#2563eb');
    expect(area(c).getAttribute('role')).toBe('slider');
    expect(area(c).getAttribute('aria-valuetext')).toMatch(/^Saturation \d+%, brightness \d+%$/);
    expect(hue(c).getAttribute('aria-valuenow')).toBe('221');
    expect(q(c, '.aui-color-picker__slider--alpha').hidden).toBe(true);
    expect(c.input.value).toBe('#2563eb');
    expect(qi(c, 'input[type="hidden"]').value).toBe('#2563eb');
    expect(getFormControl(c.host)).toBe(c);
    expect(c.getFormValue()).toBe('#2563eb');
  });

  it('keyboard: area arrows move saturation and brightness; hue Home and End; each key commits', async () => {
    const c = mount({ value: '#808080' });
    const log = record(c);
    area(c).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(area(c).getAttribute('aria-valuetext')).toContain('brightness 51%');
    await userEvent.keyboard('{Shift>}{ArrowRight}{/Shift}');
    expect(area(c).getAttribute('aria-valuenow')).toBe('10');
    await userEvent.keyboard('{End}');
    expect(area(c).getAttribute('aria-valuenow')).toBe('100');
    hue(c).focus();
    await userEvent.keyboard('{End}');
    expect(hue(c).getAttribute('aria-valuenow')).toBe('359');
    await userEvent.keyboard('{PageDown}');
    expect(hue(c).getAttribute('aria-valuenow')).toBe('349');
    expect(log.change).toHaveLength(5);
    expect(log.input).toHaveLength(5);
  });

  it('horizontal arrows follow the reading direction', async () => {
    configureAbsoluteUI({ common: { direction: 'rtl' } });
    const c = mount({ value: '#ff0000' });
    hue(c).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(hue(c).getAttribute('aria-valuenow')).toBe('1');
  });

  it('opacity slider produces #rrggbbaa', async () => {
    const c = mount({ value: '#2563eb', alpha: true });
    expect(c.value).toBe('#2563ebff');
    alpha(c).focus();
    await userEvent.keyboard('{PageDown}');
    expect(alpha(c).getAttribute('aria-valuetext')).toBe('90%');
    expect(c.value).toBe('#2563ebe6');
  });

  it('typed text: valid text commits, invalid text shows an error and keeps the value', async () => {
    const c = mount({ value: '#2563eb' });
    const log = record(c);
    await userEvent.clear(c.input);
    await userEvent.type(c.input, 'hsl(0, 100%, 50%){Enter}');
    expect(c.value).toBe('#ff0000');
    expect(log.change).toEqual(['#ff0000']);
    await userEvent.clear(c.input);
    await userEvent.type(c.input, 'not a color{Enter}');
    expect(c.value).toBe('#ff0000');
    expect(c.validity.valid).toBe(false);
    expect(q(c, '.aui-field__error').textContent).toContain('Enter a color such as #2563eb.');
    expect(c.input.getAttribute('aria-invalid')).toBe('true');
  });

  it('format buttons switch the text format', async () => {
    const c = mount({ value: '#2563eb' });
    await userEvent.click(q(c, '[data-format="rgb"]'));
    expect(c.input.value).toBe('rgb(37, 99, 235)');
    expect(q(c, '[data-format="rgb"]').getAttribute('aria-pressed')).toBe('true');
    configureAbsoluteUI({ components: { colorPicker: { format: 'hsl' } } });
    const d = mount({ value: '#2563eb' });
    expect(d.input.value).toBe('hsl(221, 83%, 53%)');
  });

  it('swatches: named buttons, pressed state, and selection', async () => {
    const c = mount({ value: '#2563eb', presets: [{ value: '#2563eb', label: 'Blue' }, '#16a34a'], recent: ['#000'] });
    const log = record(c);
    expect(q(c, 'button[aria-label="Blue"]').getAttribute('aria-pressed')).toBe('true');
    expect(q(c, 'button[aria-label="#000000"]')).toBeTruthy();
    await userEvent.click(q(c, 'button[aria-label="#16a34a"]'));
    expect(c.value).toBe('#16a34a');
    expect(log.change).toEqual(['#16a34a']);
    expect(q(c, 'button[aria-label="Blue"]').getAttribute('aria-pressed')).toBe('false');
  });

  it('required and clearable: clearing sets null and reports a missing value', async () => {
    const c = mount({ value: '#2563eb' });
    await userEvent.click(q(c, '.aui-color-picker__clear'));
    expect(c.value).toBeNull();
    const r = mount({ required: true });
    expect(q(r, '.aui-color-picker__clear').hidden).toBe(true);
    expect(r.reportValidity()).toBe(false);
    expect(r.validity.message).toBe('This field is required.');
  });

  it('contrast hint shows the ratio and verdict', () => {
    const c = mount({ value: '#2563eb', contrastWith: '#fff' });
    const hint = q(c, '.aui-color-picker__contrast');
    expect(hint.textContent).toMatch(/^Contrast 5\.1\d:1 against #ffffff\. Passes AA\.$/);
    expect(c.input.getAttribute('aria-describedby')).toContain(hint.id);
    c.setValue('#dddddd');
    expect(hint.dataset.verdict).toBe('fail');
  });

  it('eyedropper is feature-detected and commits the picked color', async () => {
    const c = mount({ value: '#2563eb' });
    expect(q(c, '.aui-color-picker__eyedropper').hidden).toBe(true);
    class FakeEyeDropper {
      open(): Promise<{ sRGBHex: string }> {
        return Promise.resolve({ sRGBHex: '#123456' });
      }
    }
    Reflect.set(window, 'EyeDropper', FakeEyeDropper);
    const d = mount({ value: '#2563eb' });
    const button = q(d, '.aui-color-picker__eyedropper');
    expect(button.hidden).toBe(false);
    const changed = new Promise((resolve) => {
      d.host.addEventListener('aui-change', resolve, { once: true });
    });
    await userEvent.click(button);
    await changed;
    expect(d.value).toBe('#123456');
  });

  it('read-only and disabled block changes', async () => {
    const c = mount({ value: '#2563eb', readOnly: true });
    area(c).focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(c.value).toBe('#2563eb');
    expect(area(c).getAttribute('aria-readonly')).toBe('true');
    c.update({ readOnly: false, disabled: true });
    expect(area(c).tabIndex).toBe(-1);
    expect(c.input.disabled).toBe(true);
  });

  it('popup: the trigger opens a dialog, focuses the area, and Escape returns focus', async () => {
    const c = mount({ mode: 'popup', value: '#2563eb' });
    const trigger = q(c, '.aui-color-picker__trigger');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    expect(document.getElementById(trigger.getAttribute('aria-labelledby')!.split(' ')[1]!)?.textContent).toBe('#2563eb');
    await userEvent.click(trigger);
    expect(c.open).toBe(true);
    expect(q(c, '.aui-color-picker__panel').getAttribute('role')).toBe('dialog');
    expect(document.activeElement).toBe(area(c));
    await userEvent.keyboard('{Escape}');
    expect(c.open).toBe(false);
    expect(document.activeElement).toBe(trigger);
  });

  it('reset restores the initial value; invalid options throw before the host is touched', () => {
    const c = mount({ value: '#2563eb' });
    c.setValue('#000000');
    expect(c.dirty).toBe(true);
    c.reset();
    expect(c.value).toBe('#2563eb');
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => ColorPicker.create(host, { label: 'x', value: 'nope' })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    expect(() => {
      c.update({ mode: 'sideways' as 'inline' });
    }).toThrow(AbsoluteUIError);
    expect(c.value).toBe('#2563eb');
    expect(colorPickerConfig.optionNames).toContain('format');
  });

  it('destroy removes rendering and the form registration', () => {
    const c = mount({ value: '#2563eb' });
    c.destroy();
    expect(c.host.children).toHaveLength(0);
    expect(getFormControl(c.host)).toBeUndefined();
  });
});
