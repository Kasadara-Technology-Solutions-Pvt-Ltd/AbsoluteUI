import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Container, Divider, Flex, Grid, Stack, isCssLength, type GridOptions } from '@absoluteui/components/layout';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function box(className = ''): HTMLDivElement {
  const el = document.createElement('div');
  el.className = className;
  for (let i = 0; i < 3; i++) el.append(document.createElement('div'));
  document.body.append(el);
  return el;
}

const classes = (el: Element): string[] => [...el.classList].sort();

describe('Layout: Stack', () => {
  it('applies stack, default gap, and alignment classes, and computes the token gap', () => {
    const el = box();
    const s = Stack.apply(el, { align: 'center' });
    expect(classes(el)).toEqual(['aui-align-center', 'aui-gap-4', 'aui-stack']);
    s.update({ gap: 8 });
    expect(classes(el)).toEqual(['aui-align-center', 'aui-gap-8', 'aui-stack']);
    s.destroy();
    expect(el.className).toBe('');
  });

  it('uses the configured defaultGap and follows configuration changes', () => {
    configureAbsoluteUI({ components: { layout: { defaultGap: 2 } } });
    const el = box();
    const s = Stack.apply(el);
    expect(el.classList.contains('aui-gap-2')).toBe(true);
    configureAbsoluteUI({ components: { layout: { defaultGap: 6 } } });
    expect(el.classList.contains('aui-gap-6')).toBe(true);
    expect(el.classList.contains('aui-gap-2')).toBe(false);
    s.destroy();
    configureAbsoluteUI({ components: { layout: { defaultGap: 1 } } });
    expect(el.className).toBe('');
  });

  it('an explicit gap overrides the configured default', () => {
    configureAbsoluteUI({ components: { layout: { defaultGap: 2 } } });
    const el = box();
    Stack.apply(el, { gap: 0 });
    expect(classes(el)).toEqual(['aui-gap-0', 'aui-stack']);
  });

  it('rejects invalid gaps and alignments without touching the element', () => {
    const el = box('mine');
    // @ts-expect-error: 7 is not a gap step
    expect(() => Stack.apply(el, { gap: 7 })).toThrow(AbsoluteUIError);
    // @ts-expect-error: invalid alignment
    expect(() => Stack.apply(el, { align: 'middle' })).toThrow(/align/);
    expect(el.className).toBe('mine');
    const s = Stack.apply(el);
    // @ts-expect-error: invalid update
    expect(() => { s.update({ gap: 9 }); }).toThrow(/gap/);
    expect(classes(el)).toEqual(['aui-gap-4', 'aui-stack', 'mine']);
  });

  it('restores pre-existing classes it displaced and keeps consumer classes', () => {
    const el = box('card-list aui-gap-2');
    const s = Stack.apply(el, { gap: 6 });
    expect(el.classList.contains('aui-gap-2')).toBe(false);
    s.destroy();
    expect(classes(el)).toEqual(['aui-gap-2', 'card-list']);
  });

  it('refuses a second display helper on the same element until the first is destroyed', () => {
    const el = box();
    const s = Stack.apply(el);
    expect(() => Grid.apply(el)).toThrow(/already applied/);
    expect(() => Container.apply(el)).not.toThrow();
    s.destroy();
    expect(() => Flex.apply(el)).not.toThrow();
  });
});

describe('Layout: Flex', () => {
  it('applies wrap, justify, align, and direction modifiers', () => {
    const el = box();
    const f = Flex.apply(el, { gap: 2, justify: 'between', align: 'baseline', wrap: false, direction: 'row-reverse' });
    expect(classes(el)).toEqual(['aui-align-baseline', 'aui-flex', 'aui-flex--nowrap', 'aui-flex--reverse', 'aui-gap-2', 'aui-justify-between']);
    f.update({ wrap: true, direction: 'row' });
    expect(el.classList.contains('aui-flex--nowrap')).toBe(false);
    expect(el.classList.contains('aui-flex--reverse')).toBe(false);
    f.destroy();
    expect(el.className).toBe('');
  });

  it('rejects unknown justify and direction values', () => {
    const el = box();
    // @ts-expect-error: invalid justify
    expect(() => Flex.apply(el, { justify: 'space-between' })).toThrow(/justify/);
    // @ts-expect-error: column is a Stack
    expect(() => Flex.apply(el, { direction: 'column' })).toThrow(/direction/);
    expect(el.className).toBe('');
  });
});

describe('Layout: Grid', () => {
  it('defaults to auto-fit and sets the minimum column width through the CSSOM', () => {
    const el = box();
    const g = Grid.apply(el, { minColumnWidth: '12rem' });
    expect(classes(el)).toEqual(['aui-gap-4', 'aui-grid', 'aui-grid--auto']);
    expect(el.style.getPropertyValue('--aui-grid-min')).toBe('12rem');
    expect(el.hasAttribute('style')).toBe(true);
    g.update({ minColumnWidth: '240px' });
    expect(el.style.getPropertyValue('--aui-grid-min')).toBe('240px');
    g.destroy();
    expect(el.className).toBe('');
    expect(el.style.getPropertyValue('--aui-grid-min')).toBe('');
  });

  it('switches between fixed and auto columns', () => {
    const el = box();
    const g = Grid.apply(el, { columns: 3 });
    expect(el.classList.contains('aui-grid--cols-3')).toBe(true);
    g.update({ columns: 12 });
    expect(el.classList.contains('aui-grid--cols-3')).toBe(false);
    expect(el.classList.contains('aui-grid--cols-12')).toBe(true);
    g.update({ columns: 'auto' });
    expect(classes(el)).toEqual(['aui-gap-4', 'aui-grid', 'aui-grid--auto']);
  });

  it('restores a consumer-set --aui-grid-min on destroy', () => {
    const el = box();
    el.style.setProperty('--aui-grid-min', '10rem');
    const g = Grid.apply(el, { minColumnWidth: '20rem' });
    expect(el.style.getPropertyValue('--aui-grid-min')).toBe('20rem');
    g.destroy();
    expect(el.style.getPropertyValue('--aui-grid-min')).toBe('10rem');
  });

  it('rejects non-length minimum widths, including CSS injection attempts', () => {
    const el = box();
    const bad = ['12', '12 rem', 'calc(10px + 1rem)', 'var(--x)', '10rem; color: red', '-4rem', 'expression(1)', '', '1e3px', '10REM'];
    for (const value of bad) {
      expect(isCssLength(value)).toBe(false);
      expect(() => Grid.apply(el, { minColumnWidth: value })).toThrow(/minColumnWidth/);
    }
    for (const value of ['0', '16rem', '240px', '12.5ch', '.5em', '30%', '20cqi']) expect(isCssLength(value)).toBe(true);
    expect(el.className).toBe('');
    expect(el.hasAttribute('style')).toBe(false);
  });

  it('rejects out-of-range column counts and minColumnWidth with fixed columns', () => {
    const el = box();
    for (const columns of [0, 13, 2.5, '3']) {
      expect(() => Grid.apply(el, { columns } as unknown as GridOptions)).toThrow(/columns/);
    }
    expect(() => Grid.apply(el, { columns: 3, minColumnWidth: '10rem' })).toThrow(/minColumnWidth/);
  });
});

describe('Layout: Container', () => {
  it('applies the size modifier (default lg) and removes it on destroy', () => {
    const el = box();
    const c = Container.apply(el);
    expect(classes(el)).toEqual(['aui-container', 'aui-container--lg']);
    c.update({ size: 'sm' });
    expect(classes(el)).toEqual(['aui-container', 'aui-container--sm']);
    c.destroy();
    c.destroy();
    expect(el.className).toBe('');
  });

  it('rejects unknown sizes', () => {
    // @ts-expect-error: invalid size
    expect(() => Container.apply(box(), { size: '2xl' })).toThrow(/size/);
  });
});

describe('Layout: Divider', () => {
  it('uses <hr> for semantic horizontal separators', () => {
    const hr = Divider.create();
    expect(hr.tagName).toBe('HR');
    expect(hr.className).toBe('aui-divider');
    expect(hr.hasAttribute('aria-hidden')).toBe(false);
  });

  it('uses role=separator with aria-orientation for vertical dividers', () => {
    const el = Divider.create({ orientation: 'vertical' });
    expect(el.tagName).toBe('DIV');
    expect(el.getAttribute('role')).toBe('separator');
    expect(el.getAttribute('aria-orientation')).toBe('vertical');
    expect(el.classList.contains('aui-divider--vertical')).toBe(true);
  });

  it('hides decorative dividers from assistive technology', () => {
    expect(Divider.create({ decorative: true }).getAttribute('aria-hidden')).toBe('true');
    const v = Divider.create({ orientation: 'vertical', decorative: true });
    expect(v.getAttribute('aria-hidden')).toBe('true');
    expect(v.hasAttribute('role')).toBe(false);
  });

  it('renders a labelled separator whose label is its accessible name', () => {
    const el = Divider.create({ label: 'or' });
    expect(el.getAttribute('role')).toBe('separator');
    expect(el.getAttribute('aria-label')).toBe('or');
    expect(el.querySelector('.aui-divider__label')!.textContent).toBe('or');
  });

  it('renders label text as text, never HTML', () => {
    const el = Divider.create({ label: '<img src=x onerror=alert(1)>' });
    expect(el.querySelector('img')).toBeNull();
  });

  it('rejects invalid combinations', () => {
    expect(() => Divider.create({ label: 'or', orientation: 'vertical' })).toThrow(/label/);
    expect(() => Divider.create({ label: 'or', decorative: true })).toThrow(/label/);
    expect(() => Divider.create({ label: '  ' })).toThrow(/label/);
    // @ts-expect-error: invalid orientation
    expect(() => Divider.create({ orientation: 'diagonal' })).toThrow(/orientation/);
  });

  it('creates elements in the given document', () => {
    const doc = document.implementation.createHTMLDocument('x');
    expect(Divider.create({}, doc).ownerDocument).toBe(doc);
  });
});
