import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Sparkline } from '@absoluteui/components/sparkline';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(): HTMLSpanElement {
  const el = document.createElement('span');
  document.body.append(el);
  return el;
}

describe('Sparkline', () => {
  it('is a static image with a generated accessible name', () => {
    const s = Sparkline.create(host(), { label: 'Revenue, last 6 months', values: [10, 12, 9, 14, 20, 18] });
    expect(s.element.getAttribute('role')).toBe('img');
    expect(s.summary).toBe('Revenue, last 6 months: 6 values, from 10 to 18, minimum 9, maximum 20.');
    expect(s.element.hasAttribute('tabindex')).toBe(false);
    expect(s.element.querySelector('.aui-sparkline__line')!.getAttribute('d')!.match(/[ML]/g)).toHaveLength(6);
    expect(s.element.querySelector('.aui-sparkline__last')).not.toBeNull();
    expect(s.host.classList.contains('aui-sparkline--c1')).toBe(true);
  });

  it('bars include zero and draw negatives below a baseline', () => {
    const s = Sparkline.create(host(), { label: 'Net', values: [3, -2, 5], variant: 'bar', color: 3 });
    const bars = [...s.element.querySelectorAll('rect')];
    expect(bars).toHaveLength(3);
    expect(s.element.querySelector('.aui-sparkline__baseline')).not.toBeNull();
    const baseY = Number(s.element.querySelector('.aui-sparkline__baseline')!.getAttribute('d')!.split(' ')[1]!.split('H')[0]);
    expect(Number(bars[1]!.getAttribute('y'))).toBeCloseTo(baseY, 1);
    expect(bars[2]!.getAttribute('class')).toContain('aui-sparkline__bar--last');
    expect(s.host.classList.contains('aui-sparkline--c3')).toBe(true);
  });

  it('gaps, a single value, no data, and a custom valueText', () => {
    const gaps = Sparkline.create(host(), { label: 'G', values: [1, null, 3, Number.NaN, 5, 6] });
    expect(gaps.element.querySelector('.aui-sparkline__line')!.getAttribute('d')!.match(/M/g)).toHaveLength(3);
    expect(gaps.element.querySelectorAll('.aui-sparkline__dot')).toHaveLength(2);
    expect(Sparkline.create(host(), { label: 'One', values: [42] }).summary).toBe('One: 42.');
    expect(Sparkline.create(host(), { label: 'None', values: [] }).summary).toBe('None: no data.');
    expect(Sparkline.create(host(), { label: 'C', values: [1, 2], valueText: 'Up 100% this week' }).summary).toBe('Up 100% this week');
  });

  it('formats with the configured locale and value format; mirrors in RTL', () => {
    configureAbsoluteUI({ locale: 'de-DE' });
    const s = Sparkline.create(host(), { label: 'Umsatz', values: [1000.5, 2000], valueFormat: { style: 'currency', currency: 'EUR' } });
    expect(s.summary).toBe('Umsatz: 2 values, from 1.000,50 € to 2.000,00 €, minimum 1.000,50 €, maximum 2.000,00 €.');
    const rtl = Sparkline.create(host(), { label: 'R', values: [1, 2], direction: 'rtl' });
    expect(rtl.element.querySelector('.aui-sparkline__line')!.getAttribute('d')!.startsWith('M100 ')).toBe(true);
  });

  it('a flat series and a fixed domain render inside the viewBox', () => {
    const flat = Sparkline.create(host(), { label: 'Flat', values: [5, 5, 5] });
    expect(flat.element.querySelector('.aui-sparkline__line')!.getAttribute('d')).toBe('M0 12L50 12L100 12');
    const fixed = Sparkline.create(host(), { label: 'F', values: [0, 200], min: 0, max: 100 });
    expect(fixed.element.querySelector('.aui-sparkline__line')!.getAttribute('d')).toBe('M0 22L100 2');
  });

  it('validates options and cleans up', () => {
    expect(() => Sparkline.create(host(), { label: '', values: [] })).toThrow(AbsoluteUIError);
    expect(() => Sparkline.create(host(), { label: 'x', values: ['1'] as never })).toThrow(/sparkline\.values/);
    expect(() => Sparkline.create(host(), { label: 'x', values: [], color: 9 as never })).toThrow(/sparkline\.color/);
    const el = host();
    const s = Sparkline.create(el, { label: 'x', values: [1, 2] });
    s.update({ variant: 'bar' });
    expect(el.classList.contains('aui-sparkline--bar')).toBe(true);
    s.destroy();
    expect(el.className).toBe('');
    expect(el.childNodes).toHaveLength(0);
  });

  it('never writes style attributes (CSP)', () => {
    const s = Sparkline.create(host(), { label: 'x', values: [1, 3, 2], variant: 'bar' });
    expect(s.element.querySelector('[style]')).toBeNull();
    expect(s.host.hasAttribute('style')).toBe(false);
  });
});
