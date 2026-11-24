/**
 * Validation tools (docs/PLAN-R15-MCP.md section 5): validate_usage (rule checks of a snippet),
 * get_schema and validate_dashboard (R15-15: the library's own DOM-free dashboard schema, checker, and
 * migration, bundled into this package at build time). Input is never run, fetched, or stored.
 */
import { checkDefinition, migrateDefinition } from '@absoluteui/components/dashboard';
import { definitionSchema } from '@absoluteui/components/dashboard/schema';
import type { ToolDefinition } from '../surface.js';
import { ToolInputError } from '../surface.js';
import type { Content } from '../content/types.js';
import { optionalString, requiredString, stringList, toJson } from './util.js';
import { validateUsage } from '../validate/usage.js';

const MAX_CODE = 50_000;
const MAX_DEFINITION = 200_000;
const MAX_DEPTH = 64;

/** Nesting depth of JSON text (string-aware), without parsing it. */
function jsonDepth(text: string): number {
  let depth = 0;
  let max = 0;
  let inString = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (inString) {
      if (ch === '\\') i++;
      else if (ch === '"') inString = false;
    } else if (ch === '"') inString = true;
    else if (ch === '{' || ch === '[') max = Math.max(max, ++depth);
    else if (ch === '}' || ch === ']') depth--;
  }
  return max;
}

export function validationTools(content: Content): ToolDefinition[] {
  const validate: ToolDefinition = {
    name: 'validate_usage',
    title: 'Check AbsoluteUI usage',
    description:
      'Static rule checks of a TypeScript or Angular snippet against this AbsoluteUI version: published entry points, stylesheets, option, event, and method names, accessible names, Angular selectors, inputs, and outputs, HTML-string APIs that break the Content Security Policy, third-party icons, and unavailable adapters. The snippet is never run or stored. It does not type-check: run the project\'s own tsc afterwards.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['code', 'framework'],
      properties: { code: { type: 'string', minLength: 1, maxLength: MAX_CODE }, framework: { enum: ['ts', 'angular'] } },
    },
    outputSchema: {
      type: 'object',
      required: ['framework', 'diagnostics', 'summary', 'typeCheck'],
      properties: {
        diagnostics: { type: 'array', items: { type: 'object', required: ['severity', 'rule', 'message', 'line', 'column'], properties: { severity: { enum: ['error', 'warning', 'info'] } } } },
      },
    },
    run: (args) => {
      const code = requiredString(args, 'code');
      const framework = optionalString(args, 'framework') === 'angular' ? 'angular' : 'ts';
      const { diagnostics, componentsUsed } = validateUsage(content, code, framework);
      const count = (s: string): number => diagnostics.filter((d) => d.severity === s).length;
      return {
        framework,
        version: content.version,
        componentsUsed: [...componentsUsed],
        diagnostics: toJson(diagnostics),
        summary: { errors: count('error'), warnings: count('warning'), infos: count('info') },
        typeCheck:
          framework === 'angular'
            ? 'Not type-checked here. Run the project build (ng build) or tsc --noEmit with strict templates; it checks types against the installed @absoluteui/* packages.'
            : 'Not type-checked here. Run the project\'s tsc --noEmit; it checks types against the installed @absoluteui/* packages.',
      };
    },
  };

  const getSchema: ToolDefinition = {
    name: 'get_schema',
    title: 'Get a JSON Schema',
    description: 'The JSON Schema 2020-12 of an AbsoluteUI document format. "dashboard": a configurable dashboard definition (widgets, layout, data sources, variables, pages). The schema describes structure; validate_dashboard also checks references and widget options.',
    inputSchema: {
      type: 'object',
      additionalProperties: false,
      required: ['name'],
      properties: {
        name: { enum: ['dashboard'] },
        widgetTypes: { type: 'array', items: { type: 'string', minLength: 1, maxLength: 64, pattern: '^[a-z][a-z0-9-]*(\\.[a-z][a-z0-9-]*)*$' }, uniqueItems: true, minItems: 1, maxItems: 100, description: 'Restrict widget types to these registered names.' },
      },
    },
    outputSchema: { type: 'object', required: ['name', 'schema'] },
    run: (args) => {
      const widgetTypes = stringList(args, 'widgetTypes');
      const schema = definitionSchema(widgetTypes ? { widgetTypes } : {});
      return { name: 'dashboard', schema: toJson(schema), guide: `${content.docsUrl}/components/dashboard/` };
    },
  };

  const validateDashboard: ToolDefinition = {
    name: 'validate_dashboard',
    title: 'Check a dashboard definition',
    description: "Checks a dashboard definition (JSON text) with AbsoluteUI's own checker: structure, unique ids, declared data sources, variables, pages, and widget options; older versions are upgraded first. Data sources are never contacted.",
    inputSchema: { type: 'object', additionalProperties: false, required: ['definition'], properties: { definition: { type: 'string', minLength: 2, maxLength: MAX_DEFINITION, description: 'The definition as JSON text.' } } },
    outputSchema: { type: 'object', required: ['valid', 'issues'], properties: { valid: { type: 'boolean' }, issues: { type: 'array', items: { type: 'object', required: ['path', 'code', 'expected'] } } } },
    run: (args) => {
      const text = requiredString(args, 'definition');
      if (jsonDepth(text) > MAX_DEPTH) throw new ToolInputError(`The definition is nested deeper than ${MAX_DEPTH} levels.`);
      let parsed: unknown;
      try {
        parsed = JSON.parse(text);
      } catch {
        throw new ToolInputError('The definition is not valid JSON text.');
      }
      let current: unknown;
      try {
        current = migrateDefinition(parsed);
      } catch (error) {
        const detail = error instanceof Error ? error.message : 'Unsupported version.';
        return { valid: false, migrated: false, issues: [{ path: '/schemaVersion', code: 'version', expected: detail }], guide: `${content.docsUrl}/components/dashboard/` };
      }
      const result = checkDefinition(current);
      return {
        valid: result.ok,
        migrated: current !== parsed,
        issues: result.ok ? [] : toJson(result.issues.map((i) => ({ path: i.path, code: i.code, expected: i.expected }))),
        guide: `${content.docsUrl}/components/dashboard/`,
      };
    },
  };

  return [validate, getSchema, validateDashboard];
}
