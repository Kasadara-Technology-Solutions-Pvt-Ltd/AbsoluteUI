import { describe, expect, it } from 'vitest';
import { AbsoluteUIError } from '@absoluteui/core';
import { registerIcons, renderIcon, updateIcon, type IconOverlayDefinition, type VectorIcon } from '@absoluteui/icons';

const box: VectorIcon<'outline' | 'duotone' | 'multicolor', 'base' | 'secondary' | 'accent'> = {
  kind: 'vector',
  id: 'test-box',
  viewBox: '0 0 24 24',
  mirror: true,
  variants: {
    outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }]] }],
    duotone: [
      { name: 'secondary', role: 'secondary', paint: 'fill', nodes: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }]] },
      { name: 'base', role: 'primary', paint: 'stroke', nodes: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }]] },
      { name: 'accent', role: 'accent', paint: 'stroke', nodes: [['path', { d: 'M8 12h8' }]] },
    ],
    multicolor: [
      { name: 'base', role: 'primary', paint: 'stroke', nodes: [['rect', { x: 4, y: 4, width: 16, height: 16, rx: 2 }]] },
      { name: 'accent', role: 'success', paint: 'stroke', nodes: [['path', { d: 'M8 12h8' }]] },
    ],
  },
};
const lock: IconOverlayDefinition = {
  kind: 'overlay',
  id: 'lock',
  viewBox: '0 0 10 10',
  variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['rect', { x: 2, y: 4.5, width: 6, height: 4.5, rx: 1 }]] }] },
};

const layer = (el: Element, name: string): SVGElement => {
  const g = [...el.querySelectorAll(`g[data-layer="${name}"]`)].find((x) => x.closest('[data-overlay]') === null);
  if (!(g instanceof SVGElement)) throw new Error(`no layer ${name}`);
  return g;
};
const code = (fn: () => unknown): string => {
  try {
    fn();
  } catch (error) {
    return error instanceof AbsoluteUIError ? error.code : 'other';
  }
  return 'none';
};

describe('vector icons (R16)', () => {
  it('renders the outline variant by default with role colors from custom properties', () => {
    const el = renderIcon(box);
    expect(el.getAttribute('data-variant')).toBe('outline');
    expect(el instanceof SVGElement ? el.style.getPropertyValue('stroke-width') : '').toBe('var(--aui-icon-stroke-width, 2)');
    expect(el.getAttribute('aria-hidden')).toBe('true');
    expect(layer(el, 'base').style.getPropertyValue('stroke')).toBe('var(--aui-icon-primary, currentColor)');
  });

  it('draws variants separately; duotone secondary takes the opacity token; multicolor roles use theme colors', () => {
    const duo = renderIcon(box, { variant: 'duotone' });
    expect([...duo.querySelectorAll('g[data-layer]')].map((g) => g.getAttribute('data-layer'))).toEqual(['secondary', 'base', 'accent']);
    expect(layer(duo, 'secondary').style.getPropertyValue('opacity')).toBe('var(--aui-icon-secondary-opacity, 0.3)');
    expect(layer(duo, 'accent').style.getPropertyValue('stroke')).toBe('var(--aui-icon-accent, var(--aui-icon-primary, currentColor))');
    const multi = renderIcon(box, { variant: 'multicolor' });
    expect(layer(multi, 'accent').style.getPropertyValue('stroke')).toBe('var(--aui-icon-success, var(--aui-color-success-fg, currentColor))');
  });

  it('applies per-instance colors and layer overrides, and rejects unsafe color values', () => {
    const el = renderIcon(box, { variant: 'duotone', colors: { accent: '#0ea5e9' }, layers: { secondary: { opacity: 0.5 }, accent: { hidden: true } } });
    expect(el instanceof SVGElement ? el.style.getPropertyValue('--aui-icon-accent') : '').toBe('#0ea5e9');
    expect(layer(el, 'secondary').style.getPropertyValue('opacity')).toBe('0.5');
    expect(layer(el, 'accent').style.getPropertyValue('display')).toBe('none');
    for (const bad of ['red;background:url(x)', 'url(https://x)', 'expression(alert(1))', 'var(--x) , red', '"red"']) {
      expect(code(() => renderIcon(box, { colors: { primary: bad } }))).toBe('ICON_INVALID_OPTION');
    }
  });

  it('rejects variants an icon does not have', () => {
    // Types already forbid it; untyped callers get a runtime error.
    registerIcons({ 'test-box': box });
    expect(code(() => renderIcon('test-box', { variant: 'solid' }))).toBe('ICON_INVALID_OPTION');
  });

  it('composes overlays with a per-instance knockout mask', () => {
    const a = renderIcon(box, { overlays: [{ icon: lock }], label: 'Locked box' });
    const b = renderIcon(box, { overlays: [{ icon: lock }] });
    const idA = a.querySelector('mask')?.id;
    const idB = b.querySelector('mask')?.id;
    expect(idA).toBeTruthy();
    expect(idA).not.toBe(idB);
    expect(a.querySelector(`g[mask="url(#${String(idA)})"]`)).not.toBeNull();
    const overlay = a.querySelector('svg[data-overlay="lock"]');
    expect([overlay?.getAttribute('x'), overlay?.getAttribute('y')]).toEqual(['13', '13']);
    expect(a.getAttribute('role')).toBe('img');
    expect(code(() => renderIcon(box, { overlays: [{ icon: lock }, { icon: lock }] }))).toBe('ICON_INVALID_OPTION');
  });

  it('cuts layer knockouts with a per-instance mask', () => {
    const off: VectorIcon<'outline', 'base' | 'detail'> = {
      kind: 'vector',
      id: 'test-off',
      viewBox: '0 0 24 24',
      variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['circle', { cx: 12, cy: 12, r: 8 }]], knockout: [['path', { d: 'M3 2L22 21L21 22L2 3Z' }]] }, { name: 'detail', role: 'primary', paint: 'stroke', nodes: [['path', { d: 'M3 3l18 18' }]] }] },
    };
    const a = renderIcon(off);
    const b = renderIcon(off);
    const mask = layer(a, 'base').getAttribute('mask') ?? '';
    expect(mask).toMatch(/^url\(#aui-i\d+-mask\)$/);
    expect(layer(b, 'base').getAttribute('mask')).not.toBe(mask);
    expect(a.querySelector('mask path')?.getAttribute('fill')).toBe('black');
    expect(layer(a, 'detail').hasAttribute('mask')).toBe(false);
    const bad = { ...off, id: 'test-off-bad', variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['circle', { cx: 12, cy: 12, r: 8 }]], knockout: [['rect', { x: 1, y: 1, width: 2, height: 2 }]] }] } } as const;
    expect(code(() => renderIcon(bad))).toBe('ICON_INVALID');
  });

  it('draws containers with a compensated glyph stroke', () => {
    const el = renderIcon(box, { container: 'circle' });
    expect(el.querySelector('g[data-layer="container"] circle')).not.toBeNull();
    const glyph = [...el.querySelectorAll('g')].find((g) => g.style.getPropertyValue('stroke-width') !== '');
    expect(glyph?.style.getPropertyValue('stroke-width')).toBe('calc(var(--aui-icon-stroke-width, 2) / 0.6)');
  });

  it('rotates, flips, and mirrors directional icons (CSS for auto, a transform when forced)', () => {
    expect(renderIcon(box).hasAttribute('data-mirror')).toBe(true);
    const rtl = renderIcon(box, { dir: 'rtl' });
    expect(rtl.hasAttribute('data-mirror')).toBe(false);
    expect(rtl.querySelector('g[transform]')?.getAttribute('transform')).toBe('matrix(-1 0 0 1 24 0)');
    expect(renderIcon(box, { rotate: 90 }).querySelector('g[transform]')?.getAttribute('transform')).toBe('rotate(90 12 12)');
    // A forced right-to-left mirror and a horizontal flip cancel out.
    expect(renderIcon(box, { dir: 'rtl', flip: 'horizontal' }).querySelector('g[transform]')).toBeNull();
  });

  it('keeps a fixed stroke width in pixels when asked', () => {
    const el = renderIcon(box, { strokeWidth: 1.5, strokeScaling: 'fixed' });
    expect(el instanceof SVGElement ? el.style.getPropertyValue('stroke-width') : '').toBe('1.5');
    expect(el.querySelector('rect')?.getAttribute('vector-effect')).toBe('non-scaling-stroke');
    expect(code(() => renderIcon(box, { strokeWidth: 9 }))).toBe('ICON_INVALID_OPTION');
  });

  it('takes the stroke width from the inherited custom property', () => {
    const region = document.createElement('div');
    region.style.setProperty('--aui-icon-stroke-width', '2.5');
    const el = renderIcon(box);
    region.append(el);
    document.body.append(region);
    expect(getComputedStyle(el).strokeWidth).toBe('2.5px');
    region.remove();
  });

  it('accepts numeric sizes in pixels', () => {
    const el = renderIcon(box, { size: 20 });
    expect(el instanceof SVGElement ? el.style.fontSize : '').toBe('20px');
  });

  it('updates in place: colors restyle the same shapes; a new variant rebuilds the content', () => {
    const el = renderIcon(box, { variant: 'duotone' });
    const rect = el.querySelector('rect');
    updateIcon(el, { colors: { primary: 'red' }, layers: { secondary: { opacity: 0.1 } } });
    expect(el.querySelector('rect')).toBe(rect);
    expect(el instanceof SVGElement ? el.style.getPropertyValue('--aui-icon-primary') : '').toBe('red');
    expect(layer(el, 'secondary').style.getPropertyValue('opacity')).toBe('0.1');
    updateIcon(el, { variant: 'outline' });
    expect(el.getAttribute('data-variant')).toBe('outline');
    expect(el.querySelectorAll('g[data-layer]').length).toBe(1);
    updateIcon(el, { label: 'Box' });
    expect(el.getAttribute('aria-label')).toBe('Box');
    updateIcon(el, { label: null });
    expect(el.getAttribute('aria-hidden')).toBe('true');
  });

  it('rejects vector options for other icon kinds and invalid definitions', () => {
    const plain = { kind: 'svg', viewBox: '0 0 24 24', stroke: true, paths: ['M5 12h14'] } as const;
    expect(code(() => renderIcon(plain, { variant: 'duotone' }))).toBe('ICON_INVALID_OPTION');
    expect(
      code(() => {
        updateIcon(renderIcon(plain), { colors: { primary: 'red' } });
      }),
    ).toBe('ICON_INVALID_OPTION');
    const bad = { ...box, id: 'bad-paint', variants: { outline: [{ name: 'base', role: 'primary', paint: 'stroke', nodes: [['rect', { x: 4, y: 4, width: 16, height: 16, fill: 'red' }]] }] } } as const;
    expect(code(() => renderIcon(bad))).toBe('ICON_INVALID');
  });
});
