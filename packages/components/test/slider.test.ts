import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Slider, sliderConfig, type SliderOptions, type SliderValueDetail } from '@absoluteui/components/slider';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<SliderOptions> = {}): Slider {
  const host = document.createElement('div');
  host.style.width = '400px';
  document.body.append(host);
  return Slider.create(host, { label: 'Volume', ...options });
}

const thumbs = (s: Slider): HTMLElement[] => [...s.host.querySelectorAll<HTMLElement>('[role="slider"]')].filter((t) => !t.hidden);

function record(s: Slider): { input: unknown[]; change: unknown[] } {
  const log = { input: [] as unknown[], change: [] as unknown[] };
  s.host.addEventListener('aui-input', (e) => log.input.push((e as CustomEvent<SliderValueDetail>).detail.value));
  s.host.addEventListener('aui-change', (e) => log.change.push((e as CustomEvent<SliderValueDetail>).detail.value));
  return log;
}

describe('Slider', () => {
  it('renders one labelled slider thumb with value attributes', () => {
    const s = mount({ value: 40 });
    const [thumb] = thumbs(s);
    expect(thumbs(s)).toHaveLength(1);
    expect(thumb!.getAttribute('aria-valuenow')).toBe('40');
    expect(thumb!.getAttribute('aria-valuemin')).toBe('0');
    expect(thumb!.getAttribute('aria-valuemax')).toBe('100');
    expect(thumb!.getAttribute('aria-valuetext')).toBe('40');
    const label = document.getElementById(thumb!.getAttribute('aria-labelledby')!)!;
    expect(label.textContent).toContain('Volume');
    expect(s.host.querySelector('.aui-slider__output')!.textContent).toBe('40');
    expect(s.value).toBe(40);
  });

  it('keyboard: arrows by step, Page by a large step, Home and End; each key commits', async () => {
    const s = mount({ value: 50, step: 5 });
    const log = record(s);
    thumbs(s)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}{ArrowUp}');
    expect(s.value).toBe(60);
    await userEvent.keyboard('{PageDown}');
    expect(s.value).toBe(50);
    await userEvent.keyboard('{End}');
    expect(s.value).toBe(100);
    await userEvent.keyboard('{ArrowRight}');
    expect(log.change).toEqual([55, 60, 50, 100]);
    await userEvent.keyboard('{Home}{ArrowLeft}');
    expect(s.value).toBe(0);
  });

  it('horizontal arrows follow the reading direction', async () => {
    configureAbsoluteUI({ common: { direction: 'rtl' } });
    const s = mount({ value: 50 });
    thumbs(s)[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(s.value).toBe(51);
  });

  it('range: two thumbs that limit each other; value text describes both', async () => {
    const s = mount({ range: true, value: [20, 60], format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 }, locale: 'en-US' });
    const [low, high] = thumbs(s);
    expect(low!.getAttribute('aria-valuemax')).toBe('60');
    expect(high!.getAttribute('aria-valuemin')).toBe('20');
    expect(low!.getAttribute('aria-labelledby')!.split(' ')).toHaveLength(2);
    expect(s.host.querySelector('.aui-slider__output')!.textContent).toBe('€20 to €60');
    low!.focus();
    await userEvent.keyboard('{End}');
    expect(s.value).toEqual([60, 60]);
    s.setValue([70, 10]);
    expect(s.value).toEqual([10, 70]);
  });

  it('snaps to the step grid and clamps; floating steps stay exact', () => {
    const s = mount({ min: 0, max: 1, step: 0.1, value: 0.34 });
    expect(s.value).toBe(0.3);
    s.update({ value: 7 });
    expect(s.value).toBe(1);
    s.update({ min: 0, max: 10, step: 3, value: 10 });
    expect(s.value).toBe(9);
  });

  it('pointer: pressing the track moves the nearer thumb, dragging emits input, release commits', async () => {
    const s = mount({ value: 0 });
    const log = record(s);
    const control = s.host.querySelector<HTMLElement>('.aui-slider__control')!;
    const rect = control.getBoundingClientRect();
    const y = rect.top + rect.height / 2;
    control.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: 1, button: 0, clientX: rect.left + rect.width * 0.5, clientY: y }));
    control.dispatchEvent(new PointerEvent('pointermove', { bubbles: true, pointerId: 1, clientX: rect.left + rect.width * 0.75, clientY: y }));
    control.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerId: 1, clientX: rect.left + rect.width * 0.75, clientY: y }));
    expect(s.value).toBe(75);
    expect(log.input).toEqual([50, 75]);
    expect(log.change).toEqual([75]);
    expect(document.activeElement).toBe(thumbs(s)[0]);
    await Promise.resolve();
  });

  it('is a Form control with hidden inputs, custom errors, and reset', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const host = document.createElement('div');
    form.append(host);
    const s = Slider.create(host, { label: 'Hours', name: 'hours', range: true, value: [9, 17], min: 0, max: 24 });
    expect(getFormControl(host)).toBe(s);
    expect(new FormData(form).getAll('hours')).toEqual(['9', '17']);
    expect(s.getFormValue()).toEqual([9, 17]);
    s.setCustomError('Pick at least 8 hours');
    expect(s.validity.valid).toBe(false);
    expect(thumbs(s)[0]!.getAttribute('aria-invalid')).toBe('true');
    s.setValue([8, 18]);
    expect(s.dirty).toBe(true);
    s.reset();
    expect(s.value).toEqual([9, 17]);
    expect(s.validity.valid).toBe(true);
  });

  it('disabled thumbs leave the tab order and ignore keys; showValue follows configuration', async () => {
    const s = mount({ value: 30, disabled: true });
    expect(thumbs(s)[0]!.tabIndex).toBe(-1);
    expect(thumbs(s)[0]!.getAttribute('aria-disabled')).toBe('true');
    thumbs(s)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(s.value).toBe(30);
    configureAbsoluteUI({ components: { slider: { showValue: false } } });
    expect(s.host.querySelector<HTMLElement>('.aui-slider__output')!.hidden).toBe(true);
    expect([...sliderConfig.optionNames].sort()).toEqual(['locale', 'showValue']);
  });

  it('marks: a tick per step, or explicit labelled marks', () => {
    const s = mount({ min: 0, max: 4, marks: true, value: 2 });
    expect(s.host.querySelectorAll('.aui-slider__mark')).toHaveLength(5);
    expect(s.host.querySelectorAll('.aui-slider__mark--active')).toHaveLength(3);
    s.update({ marks: [{ value: 0, label: 'Low' }, { value: 4, label: 'High' }] });
    expect([...s.host.querySelectorAll('.aui-slider__mark-label')].map((m) => m.textContent)).toEqual(['Low', 'High']);
    expect(s.host.querySelector('.aui-slider__marks')!.getAttribute('aria-hidden')).toBe('true');
  });

  it('validates options before touching the host, and keeps state on a failed update', () => {
    const host = document.createElement('div');
    const bad: unknown[] = [{ label: '' }, { label: 'x', min: 5, max: 5 }, { label: 'x', step: 0 }, { label: 'x', value: 'a' }, { label: 'x', range: true, value: 5 }, { label: 'x', orientation: 'diagonal' }, { label: 'x', marks: [{ value: 'a' }] }];
    for (const options of bad) expect(() => Slider.create(host, options as SliderOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const s = mount({ value: 10 });
    expect(() => {
      s.update({ step: -1 });
    }).toThrow(AbsoluteUIError);
    expect(s.value).toBe(10);
  });

  it('destroy removes rendering and listeners', () => {
    const s = mount();
    const thumb = thumbs(s)[0]!;
    s.destroy();
    expect(s.host.childNodes.length).toBe(0);
    expect(s.host.className).toBe('');
    thumb.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
    expect(s.value).toBe(0);
  });
});
