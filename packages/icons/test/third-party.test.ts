/// <reference types="vite/client" />
// docs/PLAN-R8.md D3, D4, D5, D7, D8, D9: shapes, ligatures, sizes, converters, and layers, proven
// against the real icon libraries (dev-only dependencies, never shipped).
import { afterEach, describe, expect, it } from 'vitest';
import * as fa from '@fortawesome/free-solid-svg-icons';
import * as lucide from 'lucide';
import homeSvg from '@material-symbols/svg-400/outlined/home.svg?raw';
import { fromFontAwesome, fromSvgNodes, registerIcons, renderIcon, resolveIcon, setIconProvider, type IconDefinition } from '@absoluteui/icons';

afterEach(() => {
  setIconProvider(null);
});

const code = (fn: () => unknown): string | undefined => {
  try {
    fn();
    return undefined;
  } catch (e) {
    return typeof e === 'object' && e !== null && 'code' in e ? String(e.code) : undefined;
  }
};

describe('Lucide (svg nodes)', () => {
  it('converts and renders every icon of the lucide package', () => {
    let count = 0;
    for (const [name, value] of Object.entries(lucide)) {
      if (!Array.isArray(value) || !Array.isArray(value[0])) continue;
      const nodes: lucide.IconNode = value;
      const el = renderIcon(fromSvgNodes(nodes));
      expect(el.children.length, name).toBe(nodes.length);
      count++;
    }
    expect(count).toBeGreaterThan(1500);
  });

  it('renders a Lucide icon with its shapes, stroked in the text colour', () => {
    const el = renderIcon(fromSvgNodes(lucide.Users));
    expect([...el.children].map((c) => c.tagName)).toEqual(['path', 'path', 'path', 'circle']);
    expect([el.getAttribute('stroke'), el.getAttribute('stroke-width'), el.getAttribute('fill')]).toEqual(['currentColor', '2', 'none']);
  });
});

describe('Font Awesome (fromFontAwesome)', () => {
  it('converts and renders every free solid icon', () => {
    let count = 0;
    const isIcon = (v: unknown): v is fa.IconDefinition => typeof v === 'object' && v !== null && 'icon' in v && Array.isArray(v.icon);
    for (const value of Object.values(fa)) {
      if (!isIcon(value)) continue;
      const def = fromFontAwesome(value);
      expect(renderIcon(def).querySelector('path')).not.toBeNull();
      count++;
    }
    expect(count).toBeGreaterThan(1000);
    expect(fromFontAwesome(fa.faUser)).toMatchObject({ kind: 'svg', viewBox: '0 0 448 512' });
  });
});

describe('Material Symbols', () => {
  it('uses an official SVG file as path data', () => {
    const viewBox = /viewBox="([^"]+)"/.exec(homeSvg)?.[1] ?? '';
    const d = /\sd="([^"]+)"/.exec(homeSvg)?.[1] ?? '';
    const def: IconDefinition = { kind: 'svg', viewBox, paths: [d] };
    const el = renderIcon(def);
    expect([el.getAttribute('viewBox'), el.getAttribute('fill')]).toEqual(['0 -960 960 960', 'currentColor']);
  });

  it('renders the ligature font form with its text and no page translation', () => {
    registerIcons({ home: { kind: 'ligature', className: 'material-symbols-outlined', text: 'home' } });
    const el = renderIcon('home');
    expect([el.tagName, el.className, el.textContent, el.getAttribute('translate'), el.getAttribute('aria-hidden')]).toEqual(['SPAN', 'material-symbols-outlined aui-icon', 'home', 'no', 'true']);
    expect(code(() => resolveIcon({ kind: 'ligature', className: 'material-symbols-outlined', text: 'home<script>' }))).toBe('ICON_INVALID');
  });
});

describe('validation of shape nodes', () => {
  it('rejects anything but geometry, paint, and rules', () => {
    const bad = (attributes: Record<string, string>): string | undefined => code(() => resolveIcon({ kind: 'svg', viewBox: '0 0 24 24', nodes: [['circle', attributes]] }));
    expect(bad({ cx: '12', cy: '12', r: '10' })).toBeUndefined();
    expect(bad({ cx: '12', onclick: 'alert(1)' })).toBe('ICON_INVALID');
    expect(bad({ cx: '12', style: 'fill:red' })).toBe('ICON_INVALID');
    expect(bad({ cx: '12', fill: 'url(#x)' })).toBe('ICON_INVALID');
    expect(bad({ cx: 'calc(1px)' })).toBe('ICON_INVALID');
    expect(code(() => fromSvgNodes([['script', { src: 'x.js' }]]))).toBe('ICON_INVALID');
    expect(code(() => fromSvgNodes([['image', { href: 'https://example.com/x.png' }]]))).toBe('ICON_INVALID');
    expect(code(() => resolveIcon({ kind: 'svg', viewBox: '0 0 24 24' }))).toBe('ICON_INVALID');
  });
});

describe('sizes', () => {
  it('applies theme sizes and CSS lengths; the icon wins over a surrounding size', () => {
    const lg = renderIcon('calendar', { size: 'lg' });
    const px = renderIcon('calendar', { size: '20px' });
    expect(lg instanceof SVGElement ? lg.style.fontSize : '').toBe('var(--aui-icon-size-lg, 1.5rem)');
    expect(px instanceof SVGElement ? [px.style.fontSize, px.style.getPropertyValue('--aui-icon-size')] : []).toEqual(['20px', '20px']);
    const box = document.createElement('div');
    box.style.setProperty('--aui-icon-size', '40px');
    box.append(px);
    document.body.append(box);
    expect(Math.round(px.getBoundingClientRect().width)).toBe(20);
    box.remove();
  });

  it('rejects anything that is not a theme size or a length', () => {
    // A value outside the IconSize type, as it could arrive from untyped configuration.
    const untyped: unknown = 'calc(100vw)';
    expect(code(() => renderIcon('calendar', { size: String(untyped) as '1px' }))).toBe('ICON_INVALID_SIZE');
  });
});

describe('layered icons', () => {
  it('stacks icons and counters, with transforms, placement, tone, and one accessible name', () => {
    const el = renderIcon({
      kind: 'layers',
      layers: [
        { icon: 'calendar' },
        { icon: { kind: 'svg', viewBox: '0 0 24 24', nodes: [['circle', { cx: '12', cy: '12', r: '12' }]] }, scale: 0.5, position: 'top-end', tone: 'error' },
        { text: '3', position: 'top-end', x: 0.1, y: -0.1 },
        { icon: 'check', rotate: 90, flip: 'horizontal' },
      ],
    }, { label: '3 events today', size: 'xl' });
    expect([el.getAttribute('role'), el.getAttribute('aria-label')]).toEqual(['img', '3 events today']);
    const layers = [...el.children];
    expect(layers.every((l) => l.getAttribute('aria-hidden') === 'true' && l.classList.contains('aui-icon__layer'))).toBe(true);
    const style = (i: number): CSSStyleDeclaration | undefined => { const l = layers[i]; return l instanceof SVGElement || l instanceof HTMLElement ? l.style : undefined; };
    expect([style(1)?.transform, style(1)?.alignSelf, style(1)?.justifySelf, style(1)?.color]).toEqual(['scale(0.5, 0.5)', 'start', 'end', 'var(--aui-color-error-fg)']);
    expect([layers[2]?.textContent, style(2)?.transform]).toEqual(['3', 'translate(0.1em, -0.1em)']);
    expect(style(3)?.transform).toBe('rotate(90deg) scale(-1, 1)');
  });

  it('rejects nested layers, empty layers, long counters, and out-of-range transforms', () => {
    const layers = (l: IconDefinition): string | undefined => code(() => resolveIcon(l));
    expect(layers({ kind: 'layers', layers: [] })).toBe('ICON_INVALID');
    expect(layers({ kind: 'layers', layers: [{ text: '12345' }] })).toBe('ICON_INVALID');
    expect(layers({ kind: 'layers', layers: [{ icon: 'check', scale: 10 }] })).toBe('ICON_INVALID');
    expect(layers({ kind: 'layers', layers: [{ icon: 'check', text: '1' }] })).toBe('ICON_INVALID');
    expect(layers({ kind: 'layers', layers: [{ icon: { kind: 'layers', layers: [{ icon: 'check' }] } }] })).toBe('ICON_INVALID');
  });
});
