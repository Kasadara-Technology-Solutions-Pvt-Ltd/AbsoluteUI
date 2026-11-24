import { describe, expect, it } from 'vitest';
import fc from 'fast-check';
import {
  all, any, boolToInt, booleanToLabel, booleanToYesNo, countTrue, implies, isFalsy, isTruthy, majority, nand, none, nor, parseBoolean, toggle, xnor, xor,
} from '@absoluteui/helpers/boolean';

describe('boolean', () => {
  it('parses lenient words case-insensitively and trimmed', () => {
    for (const t of [true, 'true', ' TRUE ', 'yes', 'Y', 'on', '1', 1]) expect(parseBoolean(t), String(t)).toBe(true);
    for (const f of [false, 'false', 'No', 'n', 'OFF', '0', 0]) expect(parseBoolean(f), String(f)).toBe(false);
    for (const u of ['', ' ', 'maybe', '2', 2, null, undefined, {}, 'yes'.padEnd(100, ' '), NaN]) expect(parseBoolean(u)).toBeUndefined();
  });
  it('supports strict mode and custom words', () => {
    expect(parseBoolean('yes', { strict: true })).toBeUndefined();
    expect(parseBoolean(1, { strict: true })).toBeUndefined();
    expect(parseBoolean(' False ', { strict: true })).toBe(false);
    expect(parseBoolean('Ja', { trueValues: ['ja'], falseValues: ['nein'] })).toBe(true);
    expect(parseBoolean('NEIN', { trueValues: ['ja'], falseValues: ['nein'] })).toBe(false);
  });
  it('logic operators follow their truth tables (property)', () => {
    fc.assert(fc.property(fc.boolean(), fc.boolean(), (a, b) => {
      expect(xor(a, b)).toBe(a !== b);
      expect(xnor(a, b)).toBe(!xor(a, b));
      expect(nand(a, b)).toBe(!(a && b));
      expect(nor(a, b)).toBe(!(a || b));
      expect(implies(a, b)).toBe(!a || b);
      expect(toggle(toggle(a))).toBe(a);
      expect(boolToInt(a)).toBe(a ? 1 : 0);
    }));
  });
  it('aggregates with short-circuit thunks', () => {
    let called = false;
    const spy = (): boolean => {
      called = true;
      return true;
    };
    expect(all([true, false, spy])).toBe(false);
    expect(called).toBe(false);
    expect(any([false, () => true])).toBe(true);
    expect(none([false, false])).toBe(true);
    expect([all([]), any([]), none([])]).toEqual([true, false, true]);
    expect(countTrue([true, false, true])).toBe(2);
    expect(countTrue([1, 5, 10], (n) => n > 3)).toBe(2);
    expect(majority([true, true, false])).toBe(true);
    expect(majority([true, false])).toBe(false);
    expect(majority([])).toBe(false);
  });
  it('labels and truthiness', () => {
    expect(booleanToLabel(true)).toBe('true');
    expect(booleanToLabel(null)).toBe('');
    expect(booleanToLabel(undefined, { true: 'Active', false: 'Inactive', null: 'Unknown' })).toBe('Unknown');
    expect(booleanToYesNo(false)).toBe('No');
    expect(booleanToYesNo(true, { true: 'Oui', false: 'Non' })).toBe('Oui');
    expect([0, 1, '', 'a', null, 0n].filter(isTruthy)).toEqual([1, 'a']);
    expect(isFalsy(0)).toBe(true);
  });
});
