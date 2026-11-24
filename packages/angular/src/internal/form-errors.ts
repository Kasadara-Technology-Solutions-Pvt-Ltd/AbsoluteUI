/**
 * Messages for Angular validator errors shown inside AbsoluteUI form controls
 * (docs/PLAN-R9-ANGULAR.md M2). English defaults are registered with the core i18n
 * catalog (`angularForms`), so applications translate them like component messages;
 * `provideAuiFormErrors` overrides individual keys.
 */
import { InjectionToken, type Provider } from '@angular/core';
import { getMessage, registerMessages } from '@absoluteui/core';

registerMessages('angularForms', 'en', {
  required: 'This field is required.',
  email: 'Enter a valid email address.',
  minlength: 'Enter at least {requiredLength} characters.',
  maxlength: 'Enter no more than {requiredLength} characters.',
  min: 'Enter a value of at least {min}.',
  max: 'Enter a value of at most {max}.',
  pattern: 'Enter a value in the expected format.',
  invalid: 'This value is not valid.',
});

/** Message per validator error key: text, or a function of the error value. */
export type AuiFormErrorMessages = Readonly<Record<string, string | ((error: unknown) => string)>>;

export const AUI_FORM_ERRORS = new InjectionToken<AuiFormErrorMessages>('AUI_FORM_ERRORS', { factory: () => ({}) });

/**
 * Messages for your own validators (or overrides of the defaults):
 * `provideAuiFormErrors({ forbiddenName: 'This name is taken.', minlength: (e) => ... })`.
 */
export function provideAuiFormErrors(messages: AuiFormErrorMessages): Provider {
  return { provide: AUI_FORM_ERRORS, useValue: messages };
}

const DEFAULT_KEYS = new Set(['required', 'email', 'minlength', 'maxlength', 'min', 'max', 'pattern']);

function params(error: unknown): Record<string, string | number> {
  const out: Record<string, string | number> = {};
  if (error && typeof error === 'object') {
    for (const [k, v] of Object.entries(error)) if (typeof v === 'string' || typeof v === 'number') out[k] = v;
  }
  return out;
}

/** The message for the first error, or null. Error values are never logged. */
export function errorMessage(errors: Readonly<Record<string, unknown>>, custom: AuiFormErrorMessages, locale: string): string | null {
  const key = Object.keys(errors)[0];
  if (key === undefined) return null;
  const own = custom[key];
  if (typeof own === 'string') return own;
  if (typeof own === 'function') return own(errors[key]);
  return getMessage('angularForms', DEFAULT_KEYS.has(key) ? key : 'invalid', params(errors[key]), locale);
}
