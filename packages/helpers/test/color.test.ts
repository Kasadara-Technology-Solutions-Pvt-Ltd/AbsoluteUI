import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  bestTextColor,
  colorDistance,
  compositeOver,
  contrastRatio,
  cssColorNames,
  darken,
  formatHex,
  formatHsl,
  formatOklch,
  formatRgb,
  hslToRgb,
  isDark,
  isLight,
  lighten,
  meetsContrast,
  mix,
  oklchToRgb,
  parseColor,
  parseColorOrThrow,
  relativeLuminance,
  rgbToHsl,
  rgbToOklch,
  withAlpha,
  type Rgb,
} from '@absoluteui/helpers/color';
import { ValidationError } from '@absoluteui/helpers/error';

const ctx = document.createElement('canvas').getContext('2d')!;
/** Browser oracle: canvas serializes opaque colours as #rrggbb. */
const canvasHex = (css: string): string => {
  ctx.fillStyle = '#010203';
  ctx.fillStyle = css;
  return ctx.fillStyle;
};

const rgbArb = fc.record({ r: fc.integer({ min: 0, max: 255 }), g: fc.integer({ min: 0, max: 255 }), b: fc.integer({ min: 0, max: 255 }), alpha: fc.constant(1) });

describe('parseColor', () => {
  it('parses hex forms', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, alpha: 1 });
    expect(parseColor('#F008')).toEqual({ r: 255, g: 0, b: 0, alpha: 0x88 / 255 });
    expect(parseColor('#1e3a8a')).toEqual({ r: 30, g: 58, b: 138, alpha: 1 });
    expect(parseColor('  #1E3A8A80 ')).toEqual({ r: 30, g: 58, b: 138, alpha: 128 / 255 });
    for (const bad of ['#', '#ff', '#fffff', '#ggg', '#1234567', 'fff']) expect(parseColor(bad), bad).toBeUndefined();
  });
  it('parses rgb() legacy and modern syntax', () => {
    expect(parseColor('rgb(255, 0, 0)')).toEqual({ r: 255, g: 0, b: 0, alpha: 1 });
    expect(parseColor('rgba(255,0,0,0.5)')).toEqual({ r: 255, g: 0, b: 0, alpha: 0.5 });
    expect(parseColor('rgb(255 0 0 / 50%)')).toEqual({ r: 255, g: 0, b: 0, alpha: 0.5 });
    expect(parseColor('RGB(100% 0% 0%)')).toEqual({ r: 255, g: 0, b: 0, alpha: 1 });
    expect(parseColor('rgb(300 -5 none)')).toEqual({ r: 255, g: 0, b: 0, alpha: 1 });
    expect(parseColor('rgb(1e2 .5 0.)')).toEqual({ r: 100, g: 0.5, b: 0, alpha: 1 });
    for (const bad of ['rgb(1 2)', 'rgb(1 2 3 4)', 'rgb(1 2 3 / )', 'rgb(1deg 2 3)', 'rgb(1 2 3 / 1 / 2)', 'rgb((1 2 3))', 'rgb(a b c)', 'foo(1 2 3)']) expect(parseColor(bad), bad).toBeUndefined();
  });
  it('parses hsl() against the browser', () => {
    for (const css of ['hsl(120 100% 25%)', 'hsl(210, 50%, 40%)', 'hsla(0.5turn 30% 60% / 1)', 'hsl(3.14159rad 40% 50%)', 'hsl(200grad 10% 90%)', 'hsl(-30 80% 50%)']) {
      expect(formatHex(parseColorOrThrow(css)), css).toBe(canvasHex(css));
    }
  });
  it('parses oklch()', () => {
    expect(formatHex(parseColorOrThrow('oklch(62.8% 0.2577 29.23)'))).toBe('#ff0000');
    expect(formatHex(parseColorOrThrow('oklch(1 0 0)'))).toBe('#ffffff');
    expect(formatHex(parseColorOrThrow('oklch(0 0 0 / 0.5)'))).toBe('#00000080');
    expect(parseColor('oklch(50% 1 180)')).toBeDefined(); // out of gamut, mapped
  });
  it('parses all 148 named colours exactly like the browser', () => {
    const names = cssColorNames();
    expect(names).toHaveLength(148);
    for (const n of names) expect(formatHex(parseColorOrThrow(n)), n).toBe(canvasHex(n));
    expect(parseColor('RebeccaPurple')).toEqual({ r: 102, g: 51, b: 153, alpha: 1 });
    expect(parseColor('transparent')).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
    expect(parseColor('currentcolor')).toBeUndefined();
    expect(parseColor('__proto__')).toBeUndefined();
    expect(parseColor('constructor')).toBeUndefined();
  });
  it('rejects oversized and pathological input quickly', () => {
    expect(parseColor(`#${'f'.repeat(300)}`)).toBeUndefined();
    const t = performance.now();
    for (const s of [`rgb(${'1'.repeat(250)}x)`, `rgb(${'1.'.repeat(120)})`, '('.repeat(250), `rgb(${'1e'.repeat(120)})`]) parseColor(s);
    for (let i = 0; i < 2000; i++) parseColor(`rgb(${'9'.repeat(200)}.${'9'.repeat(40)}e`);
    expect(performance.now() - t).toBeLessThan(500);
  });
  it('parseColorOrThrow throws a ValidationError without echoing input', () => {
    try {
      parseColorOrThrow('<secret>');
      expect.unreachable();
    } catch (e) {
      expect(e).toBeInstanceOf(ValidationError);
      expect((e as Error).message).not.toContain('secret');
    }
  });
});

describe('formatting', () => {
  it('formats hex, rgb, hsl, oklch', () => {
    expect(formatHex('rgb(255 0 0 / 0.5)')).toBe('#ff000080');
    expect(formatHex('#ff000080', { alpha: 'never' })).toBe('#ff0000');
    expect(formatHex('#f00', { alpha: 'always' })).toBe('#ff0000ff');
    expect(formatHex({ r: 300, g: -1, b: 127.5 })).toBe('#ff0080');
    expect(formatRgb('#ff000080')).toBe('rgb(255 0 0 / 0.502)');
    expect(formatRgb('#ff000080', { legacy: true })).toBe('rgba(255, 0, 0, 0.502)');
    expect(formatRgb('#0f0', { legacy: true })).toBe('rgb(0, 255, 0)');
    expect(formatHsl('#ff0000')).toBe('hsl(0 100% 50%)');
    expect(formatHsl('rgb(0 0 255 / 0.25)')).toBe('hsl(240 100% 50% / 0.25)');
    expect(formatOklch('#ff0000')).toBe('oklch(62.796% 0.25768 29.234)');
    expect(formatOklch('#fff')).toBe('oklch(100% 0 0)');
    expect(() => formatHex('nope')).toThrow(ValidationError);
    expect(() => formatHex({ r: NaN, g: 0, b: 0 })).toThrow(ValidationError);
  });
  it('formatted output parses back to the same colour', () => {
    fc.assert(
      fc.property(rgbArb, (c) => {
        expect(parseColor(formatHex(c))).toEqual(c);
        expect(parseColor(formatRgb(c))).toEqual(c);
        expect(formatHex(parseColorOrThrow(formatHsl(c)))).toBe(formatHex(c));
        expect(formatHex(parseColorOrThrow(formatOklch(c)))).toBe(formatHex(c));
      }),
    );
  });
});

describe('conversions', () => {
  it('HSL round-trips', () => {
    expect(rgbToHsl({ r: 255, g: 0, b: 0, alpha: 1 })).toEqual({ h: 0, s: 100, l: 50, alpha: 1 });
    expect(rgbToHsl({ r: 128, g: 128, b: 128, alpha: 1 }).s).toBe(0);
    expect(hslToRgb({ h: 120, s: 100, l: 25, alpha: 1 })).toEqual({ r: 0, g: 127.5, b: 0, alpha: 1 });
    fc.assert(
      fc.property(rgbArb, (c) => {
        const back = hslToRgb(rgbToHsl(c));
        expect(Math.abs(back.r - c.r) + Math.abs(back.g - c.g) + Math.abs(back.b - c.b)).toBeLessThan(1e-6);
      }),
    );
  });
  it('OKLCH round-trips and matches reference values', () => {
    const red = rgbToOklch({ r: 255, g: 0, b: 0, alpha: 1 });
    expect(red.l).toBeCloseTo(0.628, 3);
    expect(red.c).toBeCloseTo(0.2577, 3);
    expect(red.h).toBeCloseTo(29.23, 1);
    const white = rgbToOklch({ r: 255, g: 255, b: 255, alpha: 1 });
    expect(white.l).toBeCloseTo(1, 4);
    expect(white.c).toBeLessThan(1e-4);
    expect(white.h).toBe(0);
    fc.assert(
      fc.property(rgbArb, (c) => {
        const back = oklchToRgb(rgbToOklch(c));
        expect(Math.abs(back.r - c.r) + Math.abs(back.g - c.g) + Math.abs(back.b - c.b)).toBeLessThan(0.05);
      }),
    );
  });
  it('gamut-maps out-of-range OKLCH', () => {
    const lch = { l: 0.7, c: 0.4, h: 150, alpha: 1 };
    const mapped = oklchToRgb(lch);
    const clipped = oklchToRgb(lch, { gamut: 'clip' });
    for (const c of [mapped, clipped]) for (const v of [c.r, c.g, c.b]) expect(v >= 0 && v <= 255).toBe(true);
    // Chroma reduction keeps lightness and hue close.
    const back = rgbToOklch(mapped);
    expect(back.l).toBeCloseTo(0.7, 2);
    expect(Math.abs(back.h - 150)).toBeLessThan(2);
    expect(oklchToRgb({ l: 1.2, c: 0.3, h: 0, alpha: 2 })).toEqual({ r: 255, g: 255, b: 255, alpha: 1 });
    expect(oklchToRgb({ l: -1, c: 0.3, h: 0, alpha: -1 })).toEqual({ r: 0, g: 0, b: 0, alpha: 0 });
  });
});

describe('WCAG contrast', () => {
  it('matches known pairs', () => {
    expect(relativeLuminance('#fff')).toBe(1);
    expect(relativeLuminance('#000')).toBe(0);
    expect(contrastRatio('#000', '#fff')).toBe(21);
    expect(contrastRatio('#fff', '#000')).toBe(21);
    expect(contrastRatio('#777', '#fff')).toBeCloseTo(4.48, 2);
    expect(contrastRatio('#767676', '#fff')).toBeCloseTo(4.54, 2);
    expect(contrastRatio('#595959', '#fff')).toBeCloseTo(7.0, 1);
    expect(contrastRatio('#abc', '#abc')).toBe(1);
  });
  it('checks thresholds without rounding up', () => {
    expect(meetsContrast('#777', '#fff')).toBe(false);
    expect(meetsContrast('#767676', '#fff')).toBe(true);
    expect(meetsContrast('#777', '#fff', { size: 'large' })).toBe(true);
    expect(meetsContrast('#767676', '#fff', { level: 'AAA' })).toBe(false);
    expect(meetsContrast('#595959', '#fff', { level: 'AAA' })).toBe(true);
    expect(meetsContrast('#767676', '#fff', { level: 'AAA', size: 'large' })).toBe(true);
    expect(meetsContrast('#949494', '#fff', { size: 'non-text' })).toBe(true);
    expect(meetsContrast('#aaa', '#fff', { size: 'non-text' })).toBe(false);
  });
  it('composites translucent colours before measuring', () => {
    expect(compositeOver('rgb(0 0 0 / 0.5)', '#ffffff')).toEqual({ r: 127.5, g: 127.5, b: 127.5, alpha: 1 });
    expect(compositeOver('transparent', 'transparent').alpha).toBe(0);
    expect(contrastRatio('rgb(0 0 0 / 0)', '#fff')).toBe(1);
    expect(contrastRatio('rgb(0 0 0 / 0.5)', '#fff')).toBeCloseTo(contrastRatio('rgb(127.5 127.5 127.5)', '#fff'), 6);
    expect(contrastRatio('#000', 'transparent')).toBe(21);
  });
  it('ratio is symmetric and within 1..21', () => {
    fc.assert(
      fc.property(rgbArb, rgbArb, (a, b) => {
        const r = contrastRatio(a, b);
        expect(r).toBeGreaterThanOrEqual(1);
        expect(r).toBeLessThanOrEqual(21 + 1e-9);
        expect(contrastRatio(b, a)).toBeCloseTo(r, 10);
      }),
    );
  });
  it('bestTextColor, isDark, isLight', () => {
    expect(bestTextColor('#1e3a8a')).toBe('#ffffff');
    expect(bestTextColor('#fde68a')).toBe('#000000');
    expect(bestTextColor('#fde68a', ['#1f2937', '#f9fafb'])).toBe('#1f2937');
    const obj: Rgb = { r: 0, g: 0, b: 0, alpha: 1 };
    expect(bestTextColor('#fff', [obj, '#eee'])).toBe(obj);
    expect(() => bestTextColor('#fff', [])).toThrow(ValidationError);
    expect(isDark('#1e3a8a')).toBe(true);
    expect(isLight('#fef3c7')).toBe(true);
    expect(isDark('rgb(0 0 0 / 0.05)')).toBe(false);
    fc.assert(
      fc.property(rgbArb, (c) => {
        const best = bestTextColor(c);
        expect(best === '#ffffff').toBe(contrastRatio('#fff', c) > contrastRatio('#000', c));
        expect(isDark(c)).toBe(best === '#ffffff');
        expect(contrastRatio(best, c)).toBeGreaterThanOrEqual(4.5);
      }),
    );
  });
});

describe('manipulation', () => {
  it('mix', () => {
    expect(formatHex(mix('#000', '#fff', 0.5, { space: 'srgb' }))).toBe('#808080');
    expect(formatHex(mix('#f00', '#00f', 0))).toBe('#ff0000');
    expect(formatHex(mix('#f00', '#00f', 1))).toBe('#0000ff');
    expect(formatHex(mix('#f00', '#00f', 7))).toBe('#0000ff');
    expect(mix('rgb(0 0 0 / 0)', '#fff', 0.5).alpha).toBe(0.5);
    // Grey takes the hue of the other colour, so mixing with grey stays on-hue.
    const m = rgbToOklch(mix('#ff0000', '#808080', 0.5));
    expect(Math.abs(m.h - 29.23)).toBeLessThan(3);
  });
  it('lighten, darken, withAlpha', () => {
    const base = rgbToOklch(parseColorOrThrow('#1e3a8a'));
    expect(rgbToOklch(lighten('#1e3a8a', 0.2)).l).toBeCloseTo(base.l + 0.2, 2);
    expect(rgbToOklch(darken('#1e3a8a', 0.1)).l).toBeCloseTo(base.l - 0.1, 2);
    expect(formatHex(lighten('#000', 2))).toBe('#ffffff');
    expect(formatHex(darken('#fff', 2))).toBe('#000000');
    expect(formatHex(withAlpha('#ff0000', 0.5))).toBe('#ff000080');
    expect(withAlpha('#f00', 9).alpha).toBe(1);
  });
  it('colorDistance', () => {
    expect(colorDistance('#000', '#fff')).toBeCloseTo(1, 3);
    expect(colorDistance('#abc', '#abc')).toBe(0);
    expect(colorDistance('#777', '#787878')).toBeLessThan(0.02);
  });
  it('never mutates inputs', () => {
    const c = Object.freeze({ r: 10, g: 20, b: 30, alpha: 0.5 });
    mix(c, '#fff');
    lighten(c);
    withAlpha(c, 1);
    compositeOver(c, '#fff');
    expect(c).toEqual({ r: 10, g: 20, b: 30, alpha: 0.5 });
  });
});
