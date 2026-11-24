import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Rating, type RatingOptions, type RatingValue, type RatingValueDetail } from '@absoluteui/components/rating';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<RatingOptions> = {}): Rating {
  const host = document.createElement('div');
  document.body.append(host);
  return Rating.create(host, { label: 'Quality', ...options });
}

const control = (r: Rating): HTMLElement => r.host.querySelector<HTMLElement>('.aui-rating__control')!;
const fills = (r: Rating): string[] => [...r.host.querySelectorAll<HTMLElement>('.aui-rating__item')].map((i) => i.style.getPropertyValue('--_aui-rating-fill'));

function changes(r: Rating): RatingValue[] {
  const log: RatingValue[] = [];
  r.host.addEventListener('aui-change', (e) => log.push((e as CustomEvent<RatingValueDetail>).detail.value));
  return log;
}

describe('Rating', () => {
  it('renders a labelled slider with value text and five symbols', () => {
    const r = mount({ value: 3 });
    const c = control(r);
    expect(c.getAttribute('role')).toBe('slider');
    expect(c.getAttribute('aria-valuenow')).toBe('3');
    expect(c.getAttribute('aria-valuemin')).toBe('0');
    expect(c.getAttribute('aria-valuemax')).toBe('5');
    expect(c.getAttribute('aria-valuetext')).toBe('3 of 5');
    expect(document.getElementById(c.getAttribute('aria-labelledby')!)!.textContent).toContain('Quality');
    expect(fills(r)).toEqual(['100%', '100%', '100%', '0%', '0%']);
  });

  it('rounds to half steps and fills half a symbol', () => {
    const r = mount({ value: 3.7, allowHalf: true });
    expect(r.value).toBe(3.5);
    expect(fills(r)[3]).toBe('50%');
    expect(control(r).getAttribute('aria-valuetext')).toBe('3.5 of 5');
    r.update({ allowHalf: false, value: 3.7 });
    expect(r.value).toBe(4);
  });

  it('keyboard: arrows, Page, Home/End, digits, and Delete clears; each key commits', async () => {
    const r = mount({ value: 2, allowHalf: true });
    const log = changes(r);
    control(r).focus();
    await userEvent.keyboard('{ArrowRight}{ArrowUp}');
    expect(r.value).toBe(3);
    await userEvent.keyboard('{PageDown}');
    expect(r.value).toBe(2);
    await userEvent.keyboard('{End}');
    expect(r.value).toBe(5);
    await userEvent.keyboard('4');
    expect(r.value).toBe(4);
    await userEvent.keyboard('{Delete}');
    expect(r.value).toBeNull();
    expect(control(r).getAttribute('aria-valuetext')).toBe('No rating');
    expect(log).toEqual([2.5, 3, 2, 5, 4, null]);
  });

  it('horizontal arrows follow the reading direction', async () => {
    configureAbsoluteUI({ common: { direction: 'rtl' } });
    const r = mount({ value: 2 });
    control(r).focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(r.value).toBe(3);
  });

  it('not clearable: Home goes to one step and Delete does nothing', async () => {
    const r = mount({ value: 3, clearable: false });
    expect(control(r).getAttribute('aria-valuemin')).toBe('1');
    control(r).focus();
    await userEvent.keyboard('{Home}{Delete}');
    expect(r.value).toBe(1);
  });

  it('clicking a symbol commits it; clicking the same value clears', async () => {
    const r = mount();
    const log = changes(r);
    const items = r.host.querySelectorAll<HTMLElement>('.aui-rating__item');
    await userEvent.click(items[3]!);
    expect(r.value).toBe(4);
    await userEvent.click(items[3]!);
    expect(r.value).toBeNull();
    expect(log).toEqual([4, null]);
  });

  it('read-only and disabled do not change; disabled leaves the tab order', async () => {
    const r = mount({ value: 2, readOnly: true });
    expect(control(r).getAttribute('aria-readonly')).toBe('true');
    control(r).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(r.value).toBe(2);
    r.update({ readOnly: false, disabled: true });
    expect(control(r).tabIndex).toBe(-1);
    expect(control(r).getAttribute('aria-disabled')).toBe('true');
  });

  it('display mode is a named image without slider attributes', () => {
    const r = mount({ value: 4.5, allowHalf: true, display: true });
    const c = control(r);
    expect(c.getAttribute('role')).toBe('img');
    expect(c.getAttribute('aria-label')).toBe('Quality: 4.5 of 5');
    expect(c.hasAttribute('tabindex')).toBe(false);
    expect(c.hasAttribute('aria-valuenow')).toBe(false);
  });

  it('required: invalid while empty, message after submit, hidden input serializes', () => {
    const r = mount({ required: true, name: 'quality' });
    expect(r.validity.valid).toBe(false);
    expect(r.reportValidity()).toBe(false);
    expect(r.host.querySelector('.aui-field__error')!.textContent).toContain('Select an option.');
    expect(control(r).getAttribute('aria-invalid')).toBe('true');
    r.setValue(4);
    expect(r.validity.valid).toBe(true);
    const input = r.host.querySelector<HTMLInputElement>('input[type="hidden"]')!;
    expect(input.name).toBe('quality');
    expect(input.value).toBe('4');
    expect(getFormControl(r.host)).toBe(r);
  });

  it('labels show a caption; valueText overrides the announced text', () => {
    const r = mount({ value: 2, labels: ['Poor', 'Fair', 'Good'], max: 3, valueText: (v, max) => `${String(v)} stars out of ${String(max)}` });
    expect(r.host.querySelector('.aui-rating__caption')!.textContent).toBe('Fair');
    expect(control(r).getAttribute('aria-valuetext')).toBe('2 stars out of 3');
  });

  it('reset restores the initial value; dirty tracks changes', async () => {
    const r = mount({ value: 2 });
    control(r).focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(r.dirty).toBe(true);
    r.reset();
    expect(r.value).toBe(2);
    expect(r.dirty).toBe(false);
  });

  it('global size configuration applies and re-renders', () => {
    const r = mount();
    expect(r.host.classList.contains('aui-rating--md')).toBe(true);
    configureAbsoluteUI({ components: { rating: { size: 'lg' } } });
    expect(r.host.classList.contains('aui-rating--lg')).toBe(true);
  });

  it('invalid options throw before the host is touched; invalid update keeps state', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => Rating.create(host, { label: ' ' })).toThrow(AbsoluteUIError);
    expect(() => Rating.create(host, { label: 'X', max: 11 })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const r = mount({ value: 3 });
    expect(() => {
      r.update({ max: 0 });
    }).toThrow(AbsoluteUIError);
    expect(r.value).toBe(3);
    expect(r.options.max).toBeUndefined();
  });

  it('destroy removes rendering and the form registration', () => {
    const r = mount();
    const host = r.host;
    r.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-rating')).toBe(false);
    expect(getFormControl(host)).toBeUndefined();
  });
});
