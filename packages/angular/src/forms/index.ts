/**
 * Angular Forms integration (docs/PLAN-R9-ANGULAR.md M2). Every AbsoluteUI form control
 * implements ControlValueAccessor and Validator and follows its form without bridge code:
 * submission and `markAllAsTouched()` show messages, reset clears them, `Validators.required`
 * marks the field required, async validators mark it busy, and errors of Angular validators
 * are shown inside the component. This entry adds the messages for those errors.
 */
export { AUI_FORM_ERRORS, provideAuiFormErrors, type AuiFormErrorMessages } from '../internal/form-errors.js';
export type { AuiControlState } from '../internal/bridge.js';
