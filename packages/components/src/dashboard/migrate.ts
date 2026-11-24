/**
 * Definition migrations (R18-2). Each step upgrades a document by one `schemaVersion`; steps are pure and
 * never execute content. Version 1 is the first version, so there are no steps yet: the function exists so
 * that stored documents keep loading when version 2 arrives.
 */
import { validationError } from '@absoluteui/core';
import { DASHBOARD_SCHEMA_VERSION } from './definition.js';

type Step = (doc: Readonly<Record<string, unknown>>) => Record<string, unknown>;

/** `STEPS[n]` upgrades version n to n + 1. */
const STEPS: Readonly<Record<number, Step>> = {};

function isRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Upgrades a stored definition to the current `schemaVersion`. Returns the input unchanged when it is
 * current; validate the result with `checkDefinition` or `parseDefinition`.
 * @throws AbsoluteUIError DASHBOARD_DEFINITION_VERSION for a missing, invalid, or newer version.
 */
export function migrateDefinition(input: unknown): unknown {
  const fail = (expected: string): never => {
    throw validationError('DASHBOARD_DEFINITION_VERSION', 'Unsupported dashboard definition version.', { component: 'dashboard', property: '/schemaVersion', expected });
  };
  if (!isRecord(input)) return fail('a definition object');
  const version = input.schemaVersion;
  if (typeof version !== 'number' || !Number.isInteger(version) || version < 1) return fail('a positive integer schemaVersion');
  if (version > DASHBOARD_SCHEMA_VERSION) return fail(`schemaVersion ${DASHBOARD_SCHEMA_VERSION} or lower (the document was written by a newer AbsoluteUI)`);
  let doc: Readonly<Record<string, unknown>> = input;
  for (let v = version; v < DASHBOARD_SCHEMA_VERSION; v++) {
    const step = STEPS[v];
    if (!step) return fail(`a migration path from schemaVersion ${v}`);
    doc = { ...step(doc), schemaVersion: v + 1 };
  }
  return doc;
}
