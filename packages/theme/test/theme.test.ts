import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import {
  absoluteDefault,
  applyTheme,
  contrastRatio,
  evaluateThemeContrast,
  parseColor,
  registerTheme,
  requiredTokenNames,
  startThemeRuntime,
  themes,
  tokensToScss,
  validateTheme,
  type ThemeDefinition,
} from '@absoluteui/theme';

const ratio = (a: string, b: string): number => Math.floor(contrastRatio(parseColor(a)!, parseColor(b)!) * 100) / 100;

afterEach(() => {
  resetAbsoluteUIConfig();
  delete document.documentElement.dataset.auiTheme;
  delete document.documentElement.dataset.auiDensity;
});

describe('contrast engine (SPEC section 9.1.1 reference values)', () => {
  it('reproduces the documented seed failures', () => {
    expect(ratio('#10B981', '#FFFFFF')).toBeCloseTo(2.54, 1);
    expect(ratio('#EF4444', '#FFFFFF')).toBeCloseTo(3.76, 1);
  });

  it('reproduces the documented role-token passes', () => {
    expect(ratio('#047857', '#FFFFFF')).toBeGreaterThanOrEqual(5.4);
    expect(ratio('#B91C1C', '#FFFFFF')).toBeGreaterThanOrEqual(6.4);
    expect(ratio('#DC2626', '#FFFFFF')).toBeGreaterThanOrEqual(4.5);
  });

  it('matches WCAG extremes', () => {
    expect(ratio('#000000', '#FFFFFF')).toBe(21);
    expect(ratio('#777777', '#777777')).toBe(1);
  });

  it('parses hex, short hex, rgb(a) and rejects invalid colors', () => {
    expect(parseColor('#fff')).toEqual({ r: 255, g: 255, b: 255, a: 1 });
    expect(parseColor('rgba(16, 185, 129, 0.12)')).toEqual({ r: 16, g: 185, b: 129, a: 0.12 });
    expect(parseColor('rgb(1 2 3 / 50%)')).toEqual({ r: 1, g: 2, b: 3, a: 0.5 });
    expect(parseColor('red')).toBeNull();
    expect(parseColor('rgb(300, 0, 0)')).toBeNull();
  });

  it('detects failures and provides remediation for seed colors used directly', () => {
    const broken: ThemeDefinition = {
      ...absoluteDefault,
      name: 'broken',
      tokens: { ...absoluteDefault.tokens, 'color-success-fg': '#10B981', 'color-error-fg': '#EF4444' },
    };
    const report = evaluateThemeContrast(broken);
    const failedTokens = report.failed.map((f) => `${f.pair.foreground}/${f.pair.background}/${f.pair.kind}`);
    expect(failedTokens).toContain('color-success-fg/color-surface/text');
    expect(failedTokens).toContain('color-error-fg/color-surface/text');
    const f = report.failed[0]!;
    expect(f.remediation).toMatch(/^Change color-/);
    expect(f.rule).toMatch(/WCAG 2.2/);
  });

  it('composites translucent backgrounds over the declared backdrop', () => {
    const report = evaluateThemeContrast(absoluteDefault);
    const subtle = report.passed.find((r) => r.pair.background === 'color-success-subtle');
    expect(subtle).toBeDefined();
    expect(subtle!.ratio).toBeLessThan(ratio('#047857', '#FFFFFF'));
  });

  it('all built-in themes pass the gate', () => {
    for (const theme of Object.values(themes)) {
      const report = evaluateThemeContrast(theme);
      expect(report.errors).toEqual([]);
      expect(report.failed.map((f) => `${f.pair.foreground} on ${f.pair.background}`)).toEqual([]);
    }
  });
});

describe('theme completeness and import validation (§9.2, §10.7)', () => {
  it('every built-in theme defines exactly the required tokens', () => {
    for (const theme of Object.values(themes)) {
      expect(Object.keys(theme.tokens).sort()).toEqual([...requiredTokenNames].sort());
    }
  });

  it('accepts a valid theme and rejects missing tokens', () => {
    const json = JSON.parse(JSON.stringify({ ...absoluteDefault, name: 'acme' })) as unknown;
    expect(validateTheme(json).name).toBe('acme');
    const missing = { ...absoluteDefault, name: 'acme', tokens: { ...absoluteDefault.tokens } } as { tokens: Record<string, string> };
    delete missing.tokens['color-text'];
    expect(() => validateTheme(missing)).toThrow(/theme.tokens.color-text/);
  });

  it.each([
    'red;}body{display:none',
    'url(https://evil.test/x.png)',
    'expression(alert(1))',
    '#fff</style><script>',
    'var(--x)\\',
    '@import "x"',
  ])('rejects CSS injection in token values: %s', (value) => {
    const bad = { ...absoluteDefault, name: 'acme', tokens: { ...absoluteDefault.tokens, 'color-text': value } };
    expect(() => validateTheme(bad)).toThrow(AbsoluteUIError);
  });

  it('rejects unknown tokens and reserved names', () => {
    expect(() => validateTheme({ ...absoluteDefault, name: 'acme', tokens: { ...absoluteDefault.tokens, 'made-up': '1px' } })).toThrow(/known token/);
    expect(() => registerTheme(absoluteDefault)).toThrow(/reserved/);
  });
});

describe('runtime theming (§11.2)', () => {
  it('applies a custom theme via a constructable stylesheet in the aui.theme layer', () => {
    registerTheme({ ...absoluteDefault, name: 'acme-runtime', tokens: { ...absoluteDefault.tokens, 'color-primary': '#123456' } });
    applyTheme('acme-runtime');
    expect(document.documentElement.dataset.auiTheme).toBe('acme-runtime');
    expect(getComputedStyle(document.documentElement).getPropertyValue('--aui-color-primary').trim()).toBe('#123456');
    const adopted = document.adoptedStyleSheets.flatMap((s) => Array.from(s.cssRules).map((r) => r.cssText));
    expect(adopted.some((css) => css.startsWith('@layer aui.theme') && css.includes('acme-runtime'))).toBe(true);
  });

  it('rejects unknown theme names', () => {
    expect(() => {
      applyTheme('nope');
    }).toThrow(/Unknown theme/);
  });

  it('syncs theme and density from configuration', () => {
    const stop = startThemeRuntime();
    expect(document.documentElement.dataset.auiTheme).toBe('absolute-default');
    configureAbsoluteUI({ theme: 'absolute-dark', density: 'compact' });
    expect(document.documentElement.dataset.auiTheme).toBe('absolute-dark');
    expect(document.documentElement.dataset.auiDensity).toBe('compact');
    stop();
  });
});

describe('exports (§10.6)', () => {
  it('generates SCSS maps using non-deprecated sass:string', () => {
    const scss = tokensToScss([absoluteDefault]);
    expect(scss).toContain("@use 'sass:string';");
    expect(scss).toContain("'color-primary': #1E40AF");
    expect(scss).not.toMatch(/[^.]unquote\(/);
  });
});
