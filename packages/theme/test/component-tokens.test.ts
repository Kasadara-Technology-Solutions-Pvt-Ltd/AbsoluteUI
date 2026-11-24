import { describe, expect, it } from 'vitest';
import { componentTokenNames, componentTokens, componentTokensToScss, getComponentToken, requiredTokenNames } from '@absoluteui/theme';

describe('component tokens (SPEC section 10.2)', () => {
  it('covers the curated components', () => {
    expect(Object.keys(componentTokens)).toHaveLength(47);
    expect(componentTokenNames.length).toBeGreaterThanOrEqual(90);
    expect(new Set(componentTokenNames).size).toBe(componentTokenNames.length);
  });

  it('has the shared chart tokens (R20-15) with fallbacks that keep the default look', () => {
    for (let n = 1; n <= 8; n++) expect(getComponentToken(`chart-${String(n)}`)).toMatchObject({ component: 'chart', fallback: `color-chart-${String(n)}`, kind: 'color' });
    expect(getComponentToken('chart-grid-color')?.fallback).toBe('color-chart-grid');
    expect(getComponentToken('chart-axis-color')?.fallback).toBe('color-chart-axis');
    expect(getComponentToken('chart-line-width')?.fallback).toBe('border-width-strong');
    expect(getComponentToken('chart-font-family')?.kind).toBe('font-family');
    expect(componentTokensToScss()).toContain("'chart': (");
  });

  it('falls back to known global tokens', () => {
    for (const name of componentTokenNames) {
      const spec = getComponentToken(name);
      expect(spec, name).toBeDefined();
      expect(requiredTokenNames, name).toContain(spec?.fallback);
    }
  });

  it('never shadows a global token name', () => {
    for (const name of componentTokenNames) expect(requiredTokenNames, name).not.toContain(name);
  });

  it('resolves every contrast pair to a component or global token', () => {
    for (const [component, group] of Object.entries(componentTokens)) {
      for (const pair of group.contrastPairs) {
        for (const ref of [pair.foreground, pair.background]) {
          const known = requiredTokenNames.includes(ref) || getComponentToken(ref)?.component === component;
          expect(known, `${component}: ${ref}`).toBe(true);
        }
      }
    }
  });

  it('resolves flat names unambiguously', () => {
    expect(getComponentToken('radio-group-dot-fg')).toMatchObject({ component: 'radio-group', property: 'dot-fg', fallback: 'color-on-primary' });
    expect(getComponentToken('data-table-header-bg')).toMatchObject({ component: 'data-table', property: 'header-bg' });
    expect(getComponentToken('button-nope')).toBeUndefined();
  });

  it('generates the SCSS map read by aui.ctoken()', () => {
    const scss = componentTokensToScss();
    expect(scss).toContain("$aui-component-tokens: (");
    expect(scss).toContain("  'button': (\n    'radius': 'radius-md',");
    expect(scss).toContain("'track-width': 'switch-width',");
  });
});
