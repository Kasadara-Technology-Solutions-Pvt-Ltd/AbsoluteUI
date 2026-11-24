import { afterEach, describe, expect, it } from 'vitest';
import {
  AbsoluteUIError,
  configureAbsoluteUI,
  formatCurrency,
  formatNumber,
  formatPlainDate,
  getFirstDayOfWeek,
  getLocaleDirection,
  getMessage,
  localeFallbacks,
  plainDate,
  registerMessages,
  resetAbsoluteUIConfig,
} from '@absoluteui/core';

afterEach(() => {
  resetAbsoluteUIConfig();
});

registerMessages('i18nTest', 'en', { greet: 'Hello {name}', only: 'English only' });
registerMessages('i18nTest', 'fr', { greet: 'Bonjour {name}' });

describe('messages', () => {
  it('resolves by locale with fallback chain and interpolation', () => {
    expect(localeFallbacks('fr-CA')).toEqual(['fr-CA', 'fr', 'en']);
    expect(getMessage('i18nTest', 'greet', { name: 'Ana' }, 'fr-CA')).toBe('Bonjour Ana');
    expect(getMessage('i18nTest', 'only', {}, 'fr-CA')).toBe('English only');
  });

  it('follows the configured locale', () => {
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(getMessage('i18nTest', 'greet', { name: 'Ana' })).toBe('Bonjour Ana');
  });

  it('fails predictably for missing keys', () => {
    expect(() => getMessage('i18nTest', 'missing')).toThrow(AbsoluteUIError);
  });
});

describe('locale data', () => {
  it('infers direction from locale script', () => {
    expect(getLocaleDirection('ar-EG')).toBe('rtl');
    expect(getLocaleDirection('he')).toBe('rtl');
    expect(getLocaleDirection('en-US')).toBe('ltr');
  });

  it('first day of week', () => {
    expect(getFirstDayOfWeek('en-US')).toBe(7);
    expect(getFirstDayOfWeek('de-DE')).toBe(1);
  });
});

describe('formatting', () => {
  it('formats numbers and currency per locale', () => {
    expect(formatNumber(1234.5, {}, 'de-DE')).toBe('1.234,5');
    expect(formatCurrency(12, 'EUR', {}, 'en-US')).toBe('€12.00');
  });

  it('formats date-only values without timezone shift', () => {
    configureAbsoluteUI({ timezone: 'Pacific/Kiritimati' });
    expect(formatPlainDate(plainDate(2026, 1, 1), { year: 'numeric', month: '2-digit', day: '2-digit' }, 'en-US')).toBe('01/01/2026');
  });
});
