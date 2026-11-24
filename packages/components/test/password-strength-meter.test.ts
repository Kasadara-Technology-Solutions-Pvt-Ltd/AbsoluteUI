import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { defaultPasswordEvaluator, PasswordStrengthMeter, passwordRequirements, type PasswordStrengthMeterChangeDetail, type PasswordStrengthMeterOptions } from '@absoluteui/components/password-strength-meter';
import { PasswordInput } from '@absoluteui/components/password-input';

afterEach(() => {
  resetAbsoluteUIConfig();
  vi.useRealTimers();
  document.body.replaceChildren();
});

function mount(options: PasswordStrengthMeterOptions = {}): PasswordStrengthMeter {
  const host = document.createElement('div');
  document.body.append(host);
  return PasswordStrengthMeter.create(host, options);
}

const items = (m: PasswordStrengthMeter): string[] => Array.from(m.host.querySelectorAll('.aui-password-strength-meter__requirement')).map((li) => li.textContent);
const rating = (m: PasswordStrengthMeter): string => m.host.querySelector('.aui-password-strength-meter__rating')!.textContent;
const filled = (m: PasswordStrengthMeter): number => m.host.querySelectorAll('.aui-password-strength-meter__segment--filled').length;
const liveText = (): string => document.querySelector('[data-aui-live-region="polite"]')?.textContent ?? '';

describe('PasswordStrengthMeter: default rules and evaluator', () => {
  it('renders the default checklist with state in text, not only icon and color', () => {
    const m = mount();
    expect(items(m)).toEqual([
      'At least 12 characters, not met',
      'A lowercase letter, not met',
      'An uppercase letter, not met',
      'A number, not met',
    ]);
    expect(m.host.querySelector('.aui-password-strength-meter__bar')!.getAttribute('aria-hidden')).toBe('true');
    expect(m.host.querySelector('.aui-password-strength-meter__requirements')!.getAttribute('aria-label')).toBe('Password requirements');
    expect(m.result).toMatchObject({ score: 0, label: '' });
  });

  it('scores: weak, fair, good, strong; a repeated character is always weak', () => {
    const m = mount();
    expect(m.evaluate('abc')).toMatchObject({ score: 1, label: 'Weak' });
    expect(m.evaluate('abcDEF')).toMatchObject({ score: 2, label: 'Fair' });
    expect(m.evaluate('abcDEF123456')).toMatchObject({ score: 3, label: 'Good' });
    expect(m.evaluate('abcDEF123456-long')).toMatchObject({ score: 4, label: 'Strong' });
    expect(filled(m)).toBe(4);
    expect(rating(m)).toBe('Strong');
    expect(m.evaluate('aaaaaaaaaaaaaaaaaaaa')).toMatchObject({ score: 1 });
    expect(items(m)[0]).toBe('At least 12 characters, met');
  });

  it('character classes are Unicode-aware and length counts code points', () => {
    const m = mount({ requirements: [passwordRequirements.minLength(3), passwordRequirements.uppercase(), passwordRequirements.symbol()] });
    const r = m.evaluate('É😀😀');
    expect(r.requirements.map((x) => x.met)).toEqual([true, true, true]);
  });
});

describe('PasswordStrengthMeter: pluggable evaluator and custom rules', () => {
  it('uses consumer rules and scoring', () => {
    const m = mount({
      requirements: [{ id: 'no-name', label: 'Does not contain your name', test: (v) => !v.toLowerCase().includes('ada') }],
      evaluate: (value, reqs) => ({ score: reqs.every((r) => r.met) && value.length > 3 ? 4 : 1, label: reqs.every((r) => r.met) ? 'Acceptable' : 'Contains your name' }),
    });
    expect(m.evaluate('adalovelace')).toMatchObject({ score: 1, label: 'Contains your name' });
    expect(m.evaluate('xk7!')).toMatchObject({ score: 4, label: 'Acceptable' });
    expect(items(m)).toEqual(['Does not contain your name, met']);
  });

  it('validates options (unique ids, score range) before rendering', () => {
    const host = document.createElement('div');
    const rule = passwordRequirements.digit();
    expect(() => PasswordStrengthMeter.create(host, { requirements: [rule, rule] })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
    // @ts-expect-error runtime validation of an out-of-range score
    expect(() => mount({ evaluate: () => ({ score: 7 }) })).toThrow(/score/);
    expect(() => passwordRequirements.minLength(0)).toThrow(/minLength/);
  });

  it('the default evaluator is exported for composition', () => {
    expect(defaultPasswordEvaluator('', [])).toEqual({ score: 0 });
  });
});

describe('PasswordStrengthMeter: attached to a Password Input', () => {
  it('follows typing, emits changes without the password, and announces once after a pause', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] });
    const pwHost = document.createElement('div');
    document.body.append(pwHost);
    const password = PasswordInput.create(pwHost, { label: 'New password', autocomplete: 'new-password' });
    const m = mount({ input: password });
    password.update({ describedBy: [m.describedById] });
    expect(password.input.getAttribute('aria-describedby')).toContain(m.describedById);
    const changes: PasswordStrengthMeterChangeDetail[] = [];
    m.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<PasswordStrengthMeterChangeDetail>).detail));
    await userEvent.click(password.input);
    await userEvent.keyboard('abcDEF123456');
    expect(rating(m)).toBe('Good');
    expect(changes.length).toBeGreaterThan(0);
    expect(JSON.stringify(changes)).not.toContain('abcDEF');
    await vi.advanceTimersByTimeAsync(999);
    expect(liveText()).not.toContain('Password strength');
    await vi.advanceTimersByTimeAsync(1);
    vi.useRealTimers();
    await new Promise((r) => requestAnimationFrame(() => { r(null); }));
    expect(liveText()).toBe('Password strength: Good. 4 of 4 requirements met.');
    m.destroy();
    await userEvent.keyboard('x');
    expect(m.host.childElementCount).toBe(0);
  });

  it('value option evaluates a bound value (framework bindings)', () => {
    const m = mount({ value: 'abc' });
    expect(m.result.score).toBe(1);
    m.update({ value: 'abcDEF123456' });
    expect(m.result.score).toBe(3);
  });

  it('showRequirements: false hides the checklist', () => {
    const m = mount({ showRequirements: false });
    expect(m.host.querySelector<HTMLElement>('.aui-password-strength-meter__requirements')!.hidden).toBe(true);
  });
});
