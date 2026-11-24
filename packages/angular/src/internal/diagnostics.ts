/**
 * Development diagnostics (brief section 29, docs/PLAN-R9-ANGULAR.md D27). Call sites guard
 * every call with `typeof ngDevMode === 'undefined' || ngDevMode` so production builds (where
 * the Angular CLI defines `ngDevMode` as false) remove both the check and its strings.
 * Messages name the component and the problem, never option or form values. Each code is
 * reported once per component kind.
 */

declare const ngDevMode: boolean | undefined;

const reported = new Set<string>();

/** Development diagnostic codes. */
export type DiagnosticCode =
  /** `[(value)]` (or `[value]`) together with a form directive on one control. */
  | 'AUI_NG_VALUE_WITH_FORM'
  /** `auiRouterNav` while `value` is bound: the router owns the selection. */
  | 'AUI_NG_ROUTER_VALUE'
  /** A table-level column template whose column id matches no column. */
  | 'AUI_NG_TEMPLATE_COLUMN'
  /** `[auiCellOf]` (and similar) bound to a different array than the component's rows. */
  | 'AUI_NG_TEMPLATE_OF'
  /** A `components` configuration key that names no AbsoluteUI component. */
  | 'AUI_NG_CONFIG_KEY'
  /** A component could not render on the server and renders in the browser only. */
  | 'AUI_NG_SERVER_FALLBACK';

/** True in development mode (also when Angular's flag is not defined, as in tests). */
export function devMode(): boolean {
  return typeof ngDevMode === 'undefined' || ngDevMode;
}

export function devWarn(code: DiagnosticCode, component: string, message: string): void {
  const key = `${code}|${component}`;
  if (reported.has(key)) return;
  reported.add(key);
  // Development-mode diagnostic, as Angular itself reports them.
  // eslint-disable-next-line no-console
  console.warn(`AbsoluteUI ${code}: <${component}> ${message}`);
}

/** Test helper: forget what was reported. */
export function resetDiagnostics(): void {
  reported.clear();
}
