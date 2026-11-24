/**
 * Error model (SPEC section 27). Messages never include user-supplied values (section 14.4, section 6.4).
 */

export type ErrorCategory = 'configuration' | 'validation' | 'runtime' | 'failure';

export type DiagnosticsMode = 'production' | 'development';

let diagnosticsMode: DiagnosticsMode = 'production';

/** @internal Set by the configuration engine. */
export function setDiagnosticsMode(mode: DiagnosticsMode): void {
  diagnosticsMode = mode;
}

export function getDiagnosticsMode(): DiagnosticsMode {
  return diagnosticsMode;
}

export interface ErrorDetails {
  /** Component name, e.g. "dialog". */
  readonly component?: string;
  /** Property path, e.g. "components.dialog.closeOnEscape". */
  readonly property?: string;
  /** Human-readable expected contract, e.g. "boolean". Never contains the received value. */
  readonly expected?: string;
  /** Remediation guidance shown in development diagnostics. */
  readonly remediation?: string;
}

export class AbsoluteUIError extends Error {
  override readonly name = 'AbsoluteUIError';
  readonly category: ErrorCategory;
  readonly code: string;
  readonly details: ErrorDetails;

  constructor(category: ErrorCategory, code: string, summary: string, details: ErrorDetails = {}) {
    super(formatMessage(code, summary, details));
    this.category = category;
    this.code = code;
    this.details = Object.freeze({ ...details });
  }
}

function formatMessage(code: string, summary: string, details: ErrorDetails): string {
  const parts = [`[AbsoluteUI ${code}] ${summary}`];
  if (details.property !== undefined) parts.push(`Property: ${details.property}.`);
  if (details.expected !== undefined) parts.push(`Expected: ${details.expected}.`);
  if (diagnosticsMode === 'development') {
    if (details.component !== undefined) parts.push(`Component: ${details.component}.`);
    if (details.remediation !== undefined) parts.push(`Fix: ${details.remediation}`);
  }
  return parts.join(' ');
}

export function configurationError(code: string, summary: string, details?: ErrorDetails): AbsoluteUIError {
  return new AbsoluteUIError('configuration', code, summary, details);
}

export function validationError(code: string, summary: string, details?: ErrorDetails): AbsoluteUIError {
  return new AbsoluteUIError('validation', code, summary, details);
}

export function runtimeError(code: string, summary: string, details?: ErrorDetails): AbsoluteUIError {
  return new AbsoluteUIError('runtime', code, summary, details);
}
