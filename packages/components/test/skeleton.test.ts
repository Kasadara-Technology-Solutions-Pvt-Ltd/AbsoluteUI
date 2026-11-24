import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Skeleton } from '@absoluteui/components/skeleton';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function host(): HTMLDivElement {
  const el = document.createElement('div');
  document.body.append(el);
  return el;
}

describe('Skeleton', () => {
  it('renders aria-hidden text lines with a shorter last line', () => {
    const s = Skeleton.create(host());
    expect(s.host.getAttribute('aria-hidden')).toBe('true');
    const lines = s.host.querySelectorAll('.aui-skeleton__line');
    expect(lines).toHaveLength(3);
    expect(lines[2]!.classList.contains('aui-skeleton__line--last')).toBe(true);
    expect(lines[0]!.classList.contains('aui-skeleton__line--last')).toBe(false);
    s.update({ lines: 1 });
    expect(s.host.querySelectorAll('.aui-skeleton__line--last')).toHaveLength(0);
  });

  it('renders rect and circle blocks with validated sizes applied through the CSSOM', () => {
    const s = Skeleton.create(host(), { shape: 'circle', width: '3rem' });
    expect(s.host.classList.contains('aui-skeleton--circle')).toBe(true);
    expect(s.host.querySelectorAll('.aui-skeleton__block')).toHaveLength(1);
    expect(s.host.style.getPropertyValue('--aui-skeleton-width')).toBe('3rem');
    s.update({ shape: 'rect', width: '50%', height: '120.5px' });
    expect(s.host.classList.contains('aui-skeleton--circle')).toBe(false);
    expect(s.host.style.getPropertyValue('--aui-skeleton-height')).toBe('120.5px');
    s.update({ width: null });
    expect(s.host.style.getPropertyValue('--aui-skeleton-width')).toBe('');
  });

  it('rejects unsafe or malformed sizes and invalid options without touching the host', () => {
    const el = host();
    for (const bad of ['calc(1px);background:url(x)', '10', 'auto', '-5px', '1e3px', ' 1px', 'var(--x)']) {
      expect(() => Skeleton.create(el, { width: bad })).toThrow(AbsoluteUIError);
      expect(() => Skeleton.create(el, { shape: 'rect', height: bad })).toThrow(AbsoluteUIError);
    }
    expect(() => Skeleton.create(el, { lines: 0 })).toThrow(AbsoluteUIError);
    expect(() => Skeleton.create(el, { lines: 2.5 })).toThrow(AbsoluteUIError);
    expect(el.className).toBe('');
    expect(el.getAttribute('style')).toBeNull();
    const s = Skeleton.create(el, { width: '10ch' });
    expect(() => {
      s.update({ width: 'calc(1px);background:url(x)' });
    }).toThrow(AbsoluteUIError);
    expect(el.style.getPropertyValue('--aui-skeleton-width')).toBe('10ch');
  });

  it('resolves the animation option from global and instance config', () => {
    const s = Skeleton.create(host());
    expect(s.host.classList.contains('aui-skeleton--pulse')).toBe(true);
    configureAbsoluteUI({ components: { skeleton: { animation: 'none' } } });
    expect(s.host.classList.contains('aui-skeleton--none')).toBe(true);
    expect(s.host.classList.contains('aui-skeleton--pulse')).toBe(false);
    s.update({ animation: 'pulse' });
    expect(s.host.classList.contains('aui-skeleton--pulse')).toBe(true);
  });

  it('markBusy toggles aria-busy on the loading region', () => {
    const region = host();
    Skeleton.markBusy(region, true);
    expect(region.getAttribute('aria-busy')).toBe('true');
    Skeleton.markBusy(region, false);
    expect(region.hasAttribute('aria-busy')).toBe(false);
  });

  it('destroy removes rendering, attributes, custom properties and subscriptions', () => {
    const el = host();
    const s = Skeleton.create(el, { width: '4rem', height: '1rem' });
    s.destroy();
    expect(el.childElementCount).toBe(0);
    expect(el.className).toBe('');
    expect(el.hasAttribute('aria-hidden')).toBe(false);
    expect(el.style.getPropertyValue('--aui-skeleton-width')).toBe('');
    configureAbsoluteUI({ components: { skeleton: { animation: 'none' } } });
    expect(el.className).toBe('');
  });
});
