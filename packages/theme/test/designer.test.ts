import { describe, expect, it } from 'vitest';
import { AbsoluteUIError } from '@absoluteui/core';
import { absoluteDefault, contrastRatio, notoSansStylesheet, parseColor, registerTheme, requiredTokenNames, themes, tokensToJson, webFontProblem, webFontProviderOf } from '@absoluteui/theme';
import {
  assessCompliance,
  assertValidFamily,
  builtInFamily,
  categoryLabels,
  crc32,
  createZip,
  deriveFamily,
  deriveMode,
  familyToThemes,
  importTheme,
  importThemeValue,
  oklchToRgb,
  overriddenTokens,
  packageFiles,
  readZip,
  rgbToOklch,
  themeJsonSchema,
  toCss,
  toDtcg,
  toFontsCss,
  toHex,
  toPackageZip,
  toScss,
  toThemeJson,
  toTypeScript,
  type ComplianceReport,
  type ThemeFamily,
} from '@absoluteui/theme/designer';

const failures = (r: ComplianceReport): string[] =>
  r.findings.filter((f) => f.required && f.status !== 'pass').map((f) => `${f.id} ${f.measured ?? ''} (expected ${f.expected ?? ''})`);

const withTokens = (family: ThemeFamily, mode: 'light' | 'dark' | 'high-contrast', tokens: Record<string, string>): ThemeFamily => ({
  ...family,
  modes: { ...family.modes, [mode]: { ...family.modes[mode], tokens: { ...family.modes[mode].tokens, ...tokens } } },
});

describe('OKLCH color math', () => {
  it('round-trips sRGB colors', () => {
    for (const hex of ['#000000', '#FFFFFF', '#1E40AF', '#10B981', '#EF4444', '#F59E0B', '#7C3AED', '#64748B']) {
      const rgb = parseColor(hex);
      expect(rgb).not.toBeNull();
      if (rgb) expect(toHex(oklchToRgb(rgbToOklch(rgb)))).toBe(hex);
    }
  });

  it('maps out-of-gamut colors into sRGB by reducing chroma', () => {
    const c = oklchToRgb({ l: 0.7, c: 0.4, h: 150 });
    for (const v of [c.r, c.g, c.b]) expect(v >= 0 && v <= 255).toBe(true);
    expect(Math.abs(rgbToOklch(c).l - 0.7)).toBeLessThan(0.02);
  });
});

describe('compliance scoring (SPEC section 10.4, section 10.5)', () => {
  it('the built-in family passes every required rule', () => {
    const report = assessCompliance(builtInFamily());
    expect(failures(report)).toEqual([]);
    expect(report.compliant).toBe(true);
    expect(report.statement).toMatch(/^Meets/);
  });

  it('reports every §10.4 assessment separately, never a single percentage', () => {
    const report = assessCompliance(builtInFamily());
    expect(report.categories.map((c) => c.label)).toEqual(Object.values(categoryLabels));
    for (const c of report.categories) expect(c.passed + c.failed + c.warnings + c.notMeasurable).toBeGreaterThan(0);
  });

  it('names affected tokens, components, severity, and remediation for a contrast failure', () => {
    const report = assessCompliance(withTokens(builtInFamily(), 'light', { 'color-primary': '#93C5FD' }));
    expect(report.compliant).toBe(false);
    expect(report.statement).toMatch(/must not be presented as accessible/);
    const f = report.findings.find((x) => x.id === 'text-contrast:light:color-on-primary/color-primary');
    expect(f).toMatchObject({ status: 'fail', severity: 'critical', required: true, rule: 'WCAG 2.2 1.4.3' });
    expect(f?.tokens).toEqual(['color-on-primary', 'color-primary']);
    expect(f?.components).toContain('button');
    expect(f?.remediation).toMatch(/color-on-primary/);
    expect(report.findings[0]?.status).toBe('fail');
  });

  it('evaluates component tokens through their fallbacks and overrides', () => {
    const base = builtInFamily();
    const family: ThemeFamily = { ...base, modes: { ...base.modes, dark: { ...base.modes.dark, componentTokens: { 'button-primary-bg': '#1E3A8A' } } } };
    const f = assessCompliance(family).findings.find((x) => x.id === 'text-contrast:dark:button-primary-fg/button-primary-bg');
    expect(f).toMatchObject({ status: 'fail', components: ['button'] });
  });

  it('flags focus, target size, zoom, motion, and high-contrast risks', () => {
    let family = withTokens(builtInFamily(), 'light', {
      'focus-ring-width': '0px',
      'touch-target-min': '1rem',
      'font-size-sm': '13px',
      'duration-normal': '2s',
      'easing-standard': 'cubic-bezier(0.3, 1.6, 0.6, 1)',
      'line-height-normal': '1.3',
    });
    family = withTokens(family, 'high-contrast', { 'shadow-md': '0 4px 12px rgba(0, 0, 0, 0.2)', 'border-width': '1px' });
    const byId = new Map(assessCompliance(family).findings.map((f) => [f.id, f]));
    expect(byId.get('focus-visibility:light:focus-ring-width')).toMatchObject({ status: 'fail', required: true, severity: 'critical' });
    expect(byId.get('target-size:all:touch-target-min@comfortable')).toMatchObject({ status: 'fail', required: true });
    expect(byId.get('zoom-reflow:all:font-size-sm@base')).toMatchObject({ status: 'warn', required: false, severity: 'moderate' });
    expect(byId.get('zoom-reflow:all:line-height-normal')?.status).toBe('warn');
    expect(byId.get('reduced-motion:all:duration-normal')?.status).toBe('warn');
    expect(byId.get('reduced-motion:all:easing-standard')?.status).toBe('warn');
    expect(byId.get('high-contrast:high-contrast:shadow-md')?.status).toBe('warn');
    expect(byId.get('high-contrast:high-contrast:border-width')?.status).toBe('warn');
  });

  it('counts unmeasurable required values as failures (never compliant by omission)', () => {
    const report = assessCompliance(withTokens(builtInFamily(), 'light', { 'touch-target-min': 'calc(1rem + 8px)' }));
    expect(report.findings.find((f) => f.id === 'target-size:all:touch-target-min@comfortable')?.status).toBe('not-measurable');
    expect(report.compliant).toBe(false);
  });

  it('checks density and responsive variants for target size', () => {
    const base = builtInFamily();
    const family: ThemeFamily = { ...base, densities: { ...base.densities, compact: { ...base.densities.compact, 'control-height-sm': '1.25rem' } } };
    expect(assessCompliance(family).findings.find((f) => f.id === 'target-size:all:control-height-sm@compact')?.status).toBe('fail');
  });
});

describe('seed derivation', () => {
  const brands: readonly Record<string, string>[] = [
    {},
    { primary: '#FACC15', accent: '#EAB308', secondary: '#78716C' },
    { primary: '#67E8F9', accent: '#06B6D4', success: '#A3E635', error: '#FB7185' },
    { primary: '#DB2777', accent: '#9333EA', secondary: '#6B21A8', warning: '#FDE047' },
    { primary: '#111111', accent: '#333333', secondary: '#000000' },
    { primary: '#F5F5F5', accent: '#FAFAFA', secondary: '#E5E5E5', background: '#FFFBEB', surface: '#FFFFFF' },
    { primary: '#EA580C', accent: '#0D9488', success: '#15803D', error: '#991B1B', info: '#0369A1' },
  ];

  it.each(brands.map((seeds, i) => [i, seeds] as const))('seed set %i derives a compliant family', (_, seeds) => {
    const family = deriveFamily({ name: 'brand', seeds });
    for (const mode of ['light', 'dark', 'high-contrast'] as const) {
      expect(Object.keys(family.modes[mode].tokens).sort()).toEqual([...requiredTokenNames].sort());
    }
    expect(failures(assessCompliance(family))).toEqual([]);
  });

  it('keeps the brand hue for primary', () => {
    const light = deriveMode({ primary: '#DB2777' }, 'light');
    const derived = parseColor(light['color-primary'] ?? '');
    const seed = parseColor('#DB2777');
    expect(derived && seed && Math.abs(rgbToOklch(derived).h - rgbToOklch(seed).h)).toBeLessThan(8);
  });

  it('high contrast reaches 7:1 for body text pairs and drops shadows', () => {
    const hc = deriveMode({ primary: '#DB2777' }, 'high-contrast');
    const r = (a: string, b: string): number => contrastRatio(parseColor(hc[a] ?? '') ?? { r: 0, g: 0, b: 0, a: 1 }, parseColor(hc[b] ?? '') ?? { r: 0, g: 0, b: 0, a: 1 });
    expect(r('color-text-muted', 'color-surface')).toBeGreaterThanOrEqual(7);
    expect(r('color-primary', 'color-surface')).toBeGreaterThanOrEqual(7);
    expect(hc['shadow-md']).toBe('none');
    expect(hc['border-width']).toBe('2px');
  });

  it('reports manual overrides against the derivation', () => {
    const family = deriveFamily({ name: 'brand', seeds: { primary: '#DB2777' } });
    expect(overriddenTokens(family, 'light')).toEqual([]);
    expect(overriddenTokens(withTokens(family, 'light', { 'color-link': '#0000EE' }), 'light')).toEqual(['color-link']);
  });
});

describe('exports (SPEC section 10.6)', () => {
  const family = ((): ThemeFamily => {
    const f = deriveFamily({ name: 'acme', seeds: { primary: '#0D9488' }, version: '2.1.0', description: 'Acme brand' });
    return {
      ...f,
      modes: { ...f.modes, light: { ...f.modes.light, componentTokens: { 'button-radius': '999px', 'card-shadow': '0 2px 4px rgba(0, 0, 0, 0.2), 0 0 1px rgba(0, 0, 0, 0.3)' } } },
      responsive: { lg: { 'font-size-md': '1.0625rem' } },
    };
  })();

  it('CSS: three modes, system theme, component tokens, responsive, densities', () => {
    const css = toCss(family);
    expect(css).toContain('@layer aui.theme {');
    for (const name of ['acme', 'acme-dark', 'acme-high-contrast', 'acme-system']) expect(css).toContain(`[data-aui-theme="${name}"]`);
    expect(css).toContain('--aui-button-radius: 999px;');
    expect(css).toContain('@media (prefers-color-scheme: dark)');
    expect(css).toContain('@media (prefers-contrast: more)');
    expect(css).toContain('@media (min-width: 1024px)');
    expect(css).toContain('[data-aui-density="compact"]');
    expect(css).not.toMatch(/[<>]|url\(/i);
  });

  it('CSS is valid and applies in the browser', () => {
    const sheet = new CSSStyleSheet();
    sheet.replaceSync(toCss(family));
    document.adoptedStyleSheets = [...document.adoptedStyleSheets, sheet];
    const el = document.createElement('div');
    el.dataset.auiTheme = 'acme';
    document.body.append(el);
    expect(getComputedStyle(el).getPropertyValue('--aui-button-radius').trim()).toBe('999px');
    expect(getComputedStyle(el).getPropertyValue('--aui-color-primary').trim()).toBe(family.modes.light.tokens['color-primary']);
    el.remove();
    document.adoptedStyleSheets = document.adoptedStyleSheets.filter((s) => s !== sheet);
  });

  it('runtime themes register (component tokens included)', () => {
    const [light] = familyToThemes(family);
    expect(light && registerTheme(light).tokens['button-radius']).toBe('999px');
  });

  it('SCSS maps per mode, densities, and responsive', () => {
    const scss = toScss(family);
    expect(scss).toContain("$aui-theme-acme-version: '2.1.0';");
    expect(scss).toContain("'component-tokens': (");
    expect(scss).toContain("'button-radius': 999px,");
    expect(scss).toContain("$aui-theme-acme-responsive: (\n  'lg': (");
  });

  it('TypeScript module registers the family', () => {
    const ts = toTypeScript(family);
    expect(ts).toContain("import { registerTheme, type ThemeDefinition } from '@absoluteui/theme';");
    expect(ts).toContain('export function registerAcmeTheme(): readonly string[]');
  });

  it('DTCG 2025.10: typed values, aliases for unset component tokens, extensions for unrepresentable values', () => {
    const doc = JSON.parse(toDtcg(family, 'light')) as Record<string, Record<string, Record<string, unknown>>>;
    expect(doc.color?.primary).toMatchObject({ $type: 'color', $value: { colorSpace: 'srgb', alpha: 1 } });
    expect(doc.space?.['4']).toEqual({ $type: 'dimension', $value: { value: 1, unit: 'rem' } });
    expect(doc.duration?.fast).toEqual({ $type: 'duration', $value: { value: 120, unit: 'ms' } });
    expect(doc.easing?.standard).toEqual({ $type: 'cubicBezier', $value: [0.2, 0, 0, 1] });
    expect(doc['font-weight']?.medium).toEqual({ $type: 'fontWeight', $value: 500 });
    expect((doc['font-family']?.sans as { $value: string[] }).$value[0]).toBe('Noto Sans');
    const component = doc.component as unknown as Record<string, Record<string, { $type?: string; $value: unknown }>>;
    expect(component.button?.radius?.$value).toEqual({ value: 999, unit: 'px' });
    expect(component.button?.bg).toMatchObject({ $type: 'color', $value: '{color.surface}' });
    expect(Array.isArray(component.card?.shadow?.$value)).toBe(true);
    const hc = JSON.parse(toDtcg(family, 'high-contrast')) as Record<string, Record<string, Record<string, unknown>>>;
    expect(hc.shadow?.md?.$extensions).toEqual({ 'com.absoluteui': { css: 'none' } });
  });

  it('versioned package zip with deterministic bytes', () => {
    const zip = toPackageZip(family, { packageName: '@acme/absoluteui-theme', license: 'MIT' });
    expect(toPackageZip(family, { packageName: '@acme/absoluteui-theme', license: 'MIT' })).toEqual(zip);
    const files = readZip(zip);
    expect([...files.keys()].sort()).toEqual(
      ['COMPLIANCE.json', 'README.md', '_theme.scss', 'fonts.css', 'index.d.ts', 'index.js', 'package.json', 'theme.css', 'theme.json', 'tokens/dark.tokens.json', 'tokens/high-contrast.tokens.json', 'tokens/light.tokens.json'].map((p) => `package/${p}`).sort(),
    );
    const pkg = JSON.parse(new TextDecoder().decode(files.get('package/package.json'))) as { name: string; version: string; license: string };
    expect(pkg).toMatchObject({ name: '@acme/absoluteui-theme', version: '2.1.0', license: 'MIT' });
    expect(() => packageFiles(family, { packageName: '../evil' })).toThrow(TypeError);
  });

  it('refuses to export an invalid family', () => {
    const bad = withTokens(family, 'light', { 'color-text': 'red;} body{display:none' });
    expect(() => toCss(bad)).toThrow(AbsoluteUIError);
    expect(() => assertValidFamily({ ...family, name: 'Bad Name' })).toThrow(AbsoluteUIError);
  });
});

describe('import (SPEC section 10.7)', () => {
  it('round-trips theme JSON', () => {
    const family = builtInFamily();
    const result = importTheme(toThemeJson(family));
    expect(result.ok && result.format).toBe('family-v2');
    expect(result.ok && result.family).toEqual(family);
  });

  it('migrates a schema 1 theme, deriving the other modes', () => {
    const result = importThemeValue(absoluteDefault);
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.format).toBe('theme-v1');
    expect(result.family.modes.light.tokens).toEqual(absoluteDefault.tokens);
    expect(result.warnings[0]).toMatch(/migrated/);
    expect(assessCompliance(result.family).compliant).toBe(true);
  });

  it('migrates the shipped tokens.json bundle', () => {
    const result = importTheme(tokensToJson(Object.values(themes)));
    expect(result.ok && result.format).toBe('bundle-v1');
    if (!result.ok) return;
    expect(result.family.modes.dark.tokens).toEqual(themes['absolute-dark'].tokens);
    expect(result.family.modes['high-contrast'].tokens).toEqual(themes['absolute-high-contrast'].tokens);
  });

  it('rejects hostile or malformed input with every problem and its path', () => {
    const family = JSON.parse(toThemeJson(builtInFamily())) as Record<string, unknown> & { modes: Record<string, { tokens: Record<string, string>; componentTokens: Record<string, string> }> };
    const light = family.modes.light;
    if (!light) throw new Error('missing light');
    light.tokens['color-text'] = 'url(https://evil.example/x)';
    light.tokens['not-a-token'] = '1px';
    delete light.tokens['color-bg'];
    light.componentTokens['button-nope'] = '1px';
    family.version = 'v1';
    const result = importThemeValue(family);
    expect(result.ok).toBe(false);
    const paths = result.ok ? [] : result.errors.map((e) => e.path);
    expect(paths).toEqual(
      expect.arrayContaining(['version', 'modes.light.tokens.color-text', 'modes.light.tokens.not-a-token', 'modes.light.tokens.color-bg', 'modes.light.componentTokens.button-nope']),
    );
  });

  it('rejects prototype keys, oversized files, invalid JSON, and unknown schema versions', () => {
    const proto = importTheme('{"schemaVersion":2,"name":"x","version":"1.0.0","modes":{"__proto__":{"polluted":true}}}');
    expect(proto.ok).toBe(false);
    expect(({} as Record<string, unknown>).polluted).toBeUndefined();
    expect(importTheme(' '.repeat(1_000_001)).ok).toBe(false);
    expect(importTheme('{').ok).toBe(false);
    expect(importTheme('{"schemaVersion":3}').ok).toBe(false);
    expect(importTheme('[]').ok).toBe(false);
  });

  it('restricts responsive overrides to typography, spacing, and layout tokens', () => {
    const family = { ...builtInFamily(), responsive: { md: { 'color-text': '#000000' } } };
    const result = importThemeValue(JSON.parse(JSON.stringify(family)));
    expect(result.ok ? [] : result.errors.map((e) => e.path)).toEqual(['responsive.md.color-text']);
  });

  it('publishes a JSON Schema generated from the validator token lists', () => {
    const schema = themeJsonSchema() as { $defs: { mode: { properties: { tokens: { required: string[] } } } } };
    expect(schema.$defs.mode.properties.tokens.required).toEqual([...requiredTokenNames]);
  });
});

describe('optional scrollbar tokens (SPEC section 10.1)', () => {
  it('are accepted, exported, and assessed only when set', () => {
    const base = builtInFamily();
    expect(assessCompliance(base).findings.some((f) => f.tokens.includes('scrollbar-thumb'))).toBe(false);
    const styled = withTokens(base, 'light', { 'scrollbar-thumb': '#F1F5F9', 'scrollbar-track': '#FFFFFF', 'scrollbar-width': 'thin' });
    const byId = new Map(assessCompliance(styled).findings.map((f) => [f.id, f]));
    expect(byId.get('non-text-contrast:light:scrollbar-thumb/scrollbar-track')).toMatchObject({ status: 'fail', required: true });
    expect(byId.get('target-size:light:scrollbar-width')?.status).toBe('warn');
    expect(toCss(styled)).toContain('--aui-scrollbar-thumb: #F1F5F9;');
    const round = importTheme(toThemeJson(styled));
    expect(round.ok && round.family.modes.light.tokens['scrollbar-width']).toBe('thin');
  });

  it('reject values outside their keyword set', () => {
    const bad = JSON.parse(toThemeJson(withTokens(builtInFamily(), 'light', { 'scrollbar-width': 'thin' })).replace('"scrollbar-width": "thin"', '"scrollbar-width": "none"')) as unknown;
    const r = importThemeValue(bad);
    expect(r.ok ? [] : r.errors.map((e) => e.path)).toEqual(['modes.light.tokens.scrollbar-width']);
  });
});

describe('web fonts (SPEC section 10.1)', () => {
  it('the default family names Noto Sans and loads it only from the opt-in loader', () => {
    const family = builtInFamily();
    expect(family.fonts).toEqual([{ provider: 'google', family: 'Noto Sans', stylesheet: notoSansStylesheet }]);
    expect(family.modes.light.tokens['font-family-sans']).toMatch(/^"Noto Sans", system-ui/);
    expect(toCss(family)).not.toContain('@import');
    const loader = toFontsCss(family);
    expect(loader).toContain(`@import url("${notoSansStylesheet}");`);
    expect(loader).toContain('https://fonts.googleapis.com https://fonts.gstatic.com');
  });

  it('validates providers, families, and stylesheet URLs', () => {
    expect(webFontProblem({ provider: 'bunny', family: 'Inter', stylesheet: 'https://fonts.bunny.net/css?family=inter:400,600' })).toBeNull();
    expect(webFontProviderOf('https://cdn.example.com/fonts/inter.css')).toBe('custom');
    expect(webFontProblem({ provider: 'google', family: 'Inter', stylesheet: 'https://fonts.bunny.net/css?family=inter' })).toMatch(/^provider/);
    expect(webFontProblem({ provider: 'custom', family: 'Inter', stylesheet: 'http://example.com/a.css' })).toMatch(/^stylesheet/);
    expect(webFontProblem({ provider: 'custom', family: 'Inter', stylesheet: 'https://example.com/a.css");}body{x:y' })).toMatch(/^stylesheet/);
    expect(webFontProblem({ provider: 'custom', family: 'Inter;x', stylesheet: 'https://example.com/a.css' })).toMatch(/^family/);
  });

  it('round-trips fonts and rejects unsafe entries on import', () => {
    const family = { ...builtInFamily(), fonts: [{ provider: 'bunny' as const, family: 'Inter', stylesheet: 'https://fonts.bunny.net/css?family=inter:400' }] };
    const round = importTheme(toThemeJson(family));
    expect(round.ok && round.family.fonts).toEqual(family.fonts);
    const bad = JSON.parse(toThemeJson(family).replace('https://fonts.bunny.net/css?family=inter:400', 'javascript:alert(1)')) as unknown;
    const r = importThemeValue(bad);
    expect(r.ok ? [] : r.errors.map((e) => e.path)).toEqual(['fonts[0]']);
  });

  it('migrated schema 1 themes keep only fonts their stacks name', () => {
    const r = importThemeValue({ ...absoluteDefault, tokens: { ...absoluteDefault.tokens, 'font-family-sans': 'Arial, sans-serif' } });
    expect(r.ok && r.family.fonts).toEqual([]);
    const withNoto = importThemeValue(absoluteDefault);
    expect(withNoto.ok && withNoto.family.fonts.map((f) => f.family)).toEqual(['Noto Sans']);
  });

  it('exports fonts in SCSS, DTCG extensions, and the package', () => {
    const family = builtInFamily();
    expect(toScss(family)).toContain("('provider': 'google', 'family': 'Noto Sans'");
    const doc = JSON.parse(toDtcg(family, 'light')) as { $extensions: Record<string, { fonts: unknown[] }> };
    expect(doc.$extensions['com.absoluteui']?.fonts).toHaveLength(1);
    const files = new Map(packageFiles(family).map((f) => [f.path, f.content]));
    expect(files.get('fonts.css')).toContain('@import');
    expect(files.get('README.md')).toContain('## Web fonts');
  });
});

describe('zip writer', () => {
  it('computes the standard CRC-32', () => {
    expect(crc32(new TextEncoder().encode('123456789'))).toBe(0xcbf43926);
  });

  it('round-trips entries and rejects unsafe paths', () => {
    const zip = createZip([{ path: 'a/b.txt', content: 'héllo' }]);
    expect(new TextDecoder().decode(readZip(zip).get('a/b.txt'))).toBe('héllo');
    for (const path of ['../x', '/abs', 'a/../b', 'a\\b']) expect(() => createZip([{ path, content: '' }])).toThrow(TypeError);
    expect(() => createZip([{ path: 'a', content: '' }, { path: 'a', content: '' }])).toThrow(TypeError);
  });
});
