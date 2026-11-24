/**
 * Internal decimal-string utilities shared by `number` and `decimal`. Not a public subpath.
 */
import { ValidationError } from '../error/index.js';

/** Sign, digits (no leading zeros except a lone "0"), and power-of-ten exponent: value = +/-digits x 10^exponent. */
export interface DecimalParts {
  readonly negative: boolean;
  readonly digits: string;
  readonly exponent: number;
}

/** Decomposes the shortest round-trip representation of a finite number. */
export function numberParts(value: number): DecimalParts {
  const s = String(Math.abs(value));
  const e = s.indexOf('e');
  const mantissa = e === -1 ? s : s.slice(0, e);
  let exponent = e === -1 ? 0 : Number(s.slice(e + 1));
  const dot = mantissa.indexOf('.');
  let digits = mantissa;
  if (dot !== -1) {
    digits = mantissa.slice(0, dot) + mantissa.slice(dot + 1);
    exponent -= mantissa.length - dot - 1;
  }
  digits = digits.replace(/^0+(?=\d)/, '');
  return { negative: value < 0, digits, exponent };
}

/** Plain (never exponential) decimal string for parts. */
export function partsToPlain(parts: DecimalParts): string {
  const { digits, exponent } = parts;
  let out: string;
  if (exponent >= 0) out = digits === '0' ? '0' : digits + '0'.repeat(exponent);
  else {
    const pad = digits.padStart(-exponent + 1, '0');
    const cut = pad.length + exponent;
    out = `${pad.slice(0, cut)}.${pad.slice(cut)}`;
  }
  return parts.negative && /[1-9]/.test(digits) ? `-${out}` : out;
}

/** Plain decimal string of a finite number (no exponent notation, `-0` becomes `"0"`). */
export function plainString(value: number): string {
  return partsToPlain(numberParts(value));
}

/** Number of fractional decimal digits in the shortest representation of `value`. */
export function fractionDigits(value: number): number {
  const { exponent } = numberParts(value);
  return exponent < 0 ? -exponent : 0;
}

/** Multiplies by 10^places exactly in decimal space (the exponent-shift technique). */
export function shift(value: number, places: number): number {
  const s = String(value);
  const e = s.indexOf('e');
  return e === -1 ? Number(`${s}e${places}`) : Number(`${s.slice(0, e)}e${Number(s.slice(e + 1)) + places}`);
}

export function assertFinite(value: number, code = 'HLP_NUMBER_NOT_FINITE'): void {
  if (!Number.isFinite(value)) throw new ValidationError(code, 'Expected a finite number.');
}

export function assertInteger(value: number, code = 'HLP_NUMBER_NOT_INTEGER'): void {
  if (!Number.isInteger(value)) throw new ValidationError(code, 'Expected an integer.');
}
