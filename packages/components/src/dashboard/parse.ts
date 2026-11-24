import { validationError } from '@absoluteui/core';
import { checkDefinition, type DefinitionIssue } from './check.js';
import type { DashboardDefinition } from './definition.js';
import { migrateDefinition } from './migrate.js';

/**
 * Migrates and validates a definition in one step. Use `checkDefinition` instead to list every issue,
 * for example in an editor.
 * @throws AbsoluteUIError DASHBOARD_DEFINITION with the first issue's JSON Pointer as `property`, or
 * DASHBOARD_DEFINITION_VERSION for an unsupported version.
 */
export function parseDefinition(input: unknown): DashboardDefinition {
  const result = checkDefinition(migrateDefinition(input));
  if (result.ok) return result.definition;
  const first: DefinitionIssue | undefined = result.issues[0];
  const more = result.issues.length > 1 ? ` (${result.issues.length} issues; checkDefinition lists them all)` : '';
  throw validationError('DASHBOARD_DEFINITION', `Invalid dashboard definition${more}.`, {
    component: 'dashboard',
    property: first?.path === '' ? '(document)' : (first?.path ?? '(document)'),
    expected: first?.expected ?? 'a valid dashboard definition',
  });
}
