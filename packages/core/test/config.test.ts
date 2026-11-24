import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  AbsoluteUIError,
  configureAbsoluteUI,
  defineComponentConfig,
  describeComponentConfig,
  normalizeConfig,
  getCommonConfig,
  onConfigChange,
  resetAbsoluteUIConfig,
  setThemeConfigDefaults,
  validators,
  type GlobalConfigInput,
} from '@absoluteui/core';

interface TestWidgetConfig {
  closeOnEscape: boolean;
  size: 'sm' | 'md';
  mode: 'a' | 'b';
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    testWidget: TestWidgetConfig & { timezone: string };
  }
}

const widget = defineComponentConfig<TestWidgetConfig, 'timezone'>(
  'testWidget',
  {
    closeOnEscape: { default: true, expected: 'boolean', validate: validators.isBoolean },
    size: { default: 'md', expected: '"sm" | "md"', validate: validators.oneOf(['sm', 'md'] as const) },
    mode: { default: 'a', expected: '"a" | "b"', validate: validators.oneOf(['a', 'b'] as const), mutability: 'init-only' },
  },
  ['timezone'],
);

function catchError(fn: () => unknown): AbsoluteUIError {
  try {
    fn();
  } catch (e) {
    if (e instanceof AbsoluteUIError) return e;
    throw e;
  }
  throw new Error('expected AbsoluteUIError');
}

afterEach(() => {
  resetAbsoluteUIConfig();
});

describe('configuration defaults', () => {
  it('uses documented built-in defaults, including UTC timezone (§8.1)', () => {
    const c = getCommonConfig();
    expect(c.timezone).toBe('UTC');
    expect(c.locale).toBe('en-US');
    expect(c.density).toBe('comfortable');
    expect(c.disambiguation).toBe('compatible');
    expect(Object.isFrozen(c)).toBe(true);
  });
});

describe('Mode A and Mode B (§6.1)', () => {
  it('accepts flat common configuration', () => {
    configureAbsoluteUI({ locale: 'de-DE', timezone: 'Europe/Berlin' });
    expect(getCommonConfig().locale).toBe('de-DE');
    expect(widget.resolve().timezone).toBe('Europe/Berlin');
  });

  it('accepts structured configuration with component settings', () => {
    configureAbsoluteUI({ common: { timezone: 'UTC' }, components: { testWidget: { timezone: 'Asia/Kolkata', closeOnEscape: false } } });
    const r = widget.resolve();
    expect(r.timezone).toBe('Asia/Kolkata');
    expect(r.closeOnEscape).toBe(false);
  });

  it('rejects mixing flat keys with common/components', () => {
    const e = catchError(() => {
      configureAbsoluteUI({ common: {}, locale: 'en-US' });
    });
    expect(e.code).toBe('CFG_MIXED_MODES');
  });
});

describe('precedence (§6.3)', () => {
  it('applies built-in < theme common < theme component < global common < global component < instance', () => {
    expect(widget.resolve().timezone).toBe('UTC');
    setThemeConfigDefaults({ common: { timezone: 'Europe/London' } });
    expect(widget.resolve().timezone).toBe('Europe/London');
    setThemeConfigDefaults({ common: { timezone: 'Europe/London' }, components: { testWidget: { timezone: 'Europe/Paris' } } });
    expect(widget.resolve().timezone).toBe('Europe/Paris');
    configureAbsoluteUI({ common: { timezone: 'America/New_York' } });
    expect(widget.resolve().timezone).toBe('America/New_York');
    configureAbsoluteUI({ common: { timezone: 'America/New_York' }, components: { testWidget: { timezone: 'Asia/Tokyo' } } });
    expect(widget.resolve().timezone).toBe('Asia/Tokyo');
    expect(widget.resolve({ timezone: 'Australia/Lord_Howe' }).timezone).toBe('Australia/Lord_Howe');
  });

  it('does not let common layers affect component-only options', () => {
    setThemeConfigDefaults({ components: { testWidget: { size: 'sm' } } });
    expect(widget.resolve().size).toBe('sm');
    expect(widget.resolve({ size: 'md' }).size).toBe('md');
  });
});

describe('validation (§6.4)', () => {
  it('identifies the invalid property and expected type without echoing the value', () => {
    const secret = 'super-secret-token-value';
    const e = catchError(() => {
      configureAbsoluteUI({ locale: secret as unknown as string, timezone: 'Not/AZone' });
    });
    expect(e.category).toBe('configuration');
    expect(e.details.property).toBe('config.timezone');
    expect(e.details.expected).toBe('IANA timezone identifier');
    expect(e.message).not.toContain('Not/AZone');
    expect(e.message).not.toContain(secret);
  });

  it('rejects unknown options instead of ignoring them', () => {
    const e = catchError(() => {
      configureAbsoluteUI({ timezon: 'UTC' } as unknown as GlobalConfigInput);
    });
    expect(e.code).toBe('CFG_UNKNOWN_OPTION');
    expect(e.details.property).toBe('config.timezon');
  });

  it('keeps the previous configuration when validation fails (atomic)', () => {
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(() => {
      configureAbsoluteUI({ locale: 'en-GB', density: 'huge' as 'compact' });
    }).toThrow(AbsoluteUIError);
    expect(getCommonConfig().locale).toBe('fr-FR');
  });

  it('validates instance options', () => {
    const e = catchError(() => widget.resolve({ size: 'xl' as 'sm' }));
    expect(e.details.property).toBe('testWidget.size');
  });

  it('validates stored config for components registered after configure()', () => {
    configureAbsoluteUI({ components: { lateWidget: { flag: 'yes' } } } as unknown as GlobalConfigInput);
    const late = defineComponentConfig<{ flag: boolean }>('lateWidget', {
      flag: { default: false, expected: 'boolean', validate: validators.isBoolean },
    });
    const e = catchError(() => late.resolve());
    expect(e.details.property).toBe('config.components.lateWidget.flag');
  });

  it('includes remediation only in development diagnostics (§27)', () => {
    const prod = catchError(() => widget.resolve({ size: 'xl' as 'sm' }));
    expect(prod.message).not.toContain('Fix:');
    configureAbsoluteUI({ diagnostics: 'development' });
    const dev = catchError(() => widget.resolve({ size: 'xl' as 'sm' }));
    expect(dev.message).toContain('Fix:');
  });
});

describe('runtime configuration (§6.5)', () => {
  it('notifies subscribers on change', () => {
    const listener = vi.fn();
    const off = onConfigChange(listener);
    configureAbsoluteUI({ density: 'compact' });
    expect(listener).toHaveBeenCalledTimes(1);
    off();
    configureAbsoluteUI({ density: 'spacious' });
    expect(listener).toHaveBeenCalledTimes(1);
  });

  it('isolates a failing subscriber so others still update (regression)', () => {
    const reported: unknown[] = [];
    const original = globalThis.reportError;
    globalThis.reportError = (e: unknown) => reported.push(e);
    const bad = onConfigChange(() => {
      throw new Error('boom');
    });
    const good = vi.fn();
    const off = onConfigChange(good);
    configureAbsoluteUI({ density: 'compact' });
    expect(good).toHaveBeenCalledTimes(1);
    expect(reported).toHaveLength(1);
    bad();
    off();
    globalThis.reportError = original;
  });

  it('rejects instance changes to init-only options', () => {
    expect(() => {
      widget.assertUpdatable({ mode: 'a' }, { mode: 'b' });
    }).toThrow(/cannot change after initialization/);
    expect(() => {
      widget.assertUpdatable({ mode: 'a', size: 'sm' }, { size: 'md' });
    }).not.toThrow();
  });
});

describe('normalizeConfig and describeComponentConfig (docs/PLAN-R9-ANGULAR.md D7)', () => {
  it('validates Mode A and Mode B without touching the global layer', () => {
    expect(normalizeConfig({ locale: 'de-DE' })).toEqual({ common: { locale: 'de-DE' }, components: {} });
    expect(normalizeConfig({ common: { timezone: 'Asia/Kolkata' }, components: { testWidget: { size: 'sm' } } })).toEqual({
      common: { timezone: 'Asia/Kolkata' },
      components: { testWidget: { size: 'sm' } },
    });
    expect(getCommonConfig().locale).toBe('en-US');
  });

  it('throws the configureAbsoluteUI errors', () => {
    expect(() => normalizeConfig({ timezone: 'Not/AZone' })).toThrow(AbsoluteUIError);
    expect(() => normalizeConfig({ components: { testWidget: { size: 'xl' as 'sm' } } })).toThrow(AbsoluteUIError);
  });

  it('describes registered components only', () => {
    expect(describeComponentConfig('testWidget')).toEqual({ optionNames: ['closeOnEscape', 'size', 'mode', 'timezone'], inheritedOptionNames: ['timezone'] });
    expect(describeComponentConfig('nope')).toBeUndefined();
  });
});
