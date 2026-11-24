// Playground specs (R20-7, R20-8): the option controls of each component's playground,
// derived from metadata/<name>/api.json, so the playground cannot fall behind the API.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { siteDir } from './shared.mjs';

export const seedsDir = join(siteDir, 'src', 'playground', 'seeds');

/** Types that can't be typed into a control: functions, DOM nodes, dates, files, icons. */
const CODE_ONLY = /=>|\b(Node|HTMLElement|HTMLInputElement|HTMLTextAreaElement|HTMLSelectElement|Element|Document|Instant|ZonedDateTime|PlainDate|PlainTime|PlainDateTime|PlainYearMonth|Duration|File|Blob|Promise|AbortSignal|RegExp|Date|IconRef|Map|Set|Row)\b/;

function kindOf(type) {
  const t = type.replace(/ \| (null|undefined)\b/g, '').replace(/^(null|undefined) \| /, '').trim();
  if (t === 'boolean') return { kind: 'boolean' };
  if (t === 'number') return { kind: 'number' };
  if (t === 'string') return { kind: 'string' };
  if (/^'[^']*'(?: \| '[^']*')+$/.test(t) || /^'[^']*'$/.test(t)) return { kind: 'enum', values: [...t.matchAll(/'([^']*)'/g)].map((m) => m[1]) };
  if (/^string \| (Node|HTMLElement)$/.test(t)) return { kind: 'string' };
  if (CODE_ONLY.test(t)) return { kind: 'code' };
  return { kind: 'json' };
}

function parseDefault(value) {
  if (value === undefined) return undefined;
  if (typeof value !== 'string') return value;
  try {
    return JSON.parse(value);
  } catch {
    return value;
  }
}

/** @returns {import('../../src/playground/runtime').PlaygroundSpec} */
export function playgroundSpec(c) {
  return {
    displayName: c.component.displayName,
    import: c.component.import,
    options: c.api.options.map((o) => {
      const { kind, values } = kindOf(o.type);
      const spec = { name: o.name, type: o.type, kind, description: o.description ?? '', initOnly: o.mutability === 'init-only' };
      if (values) spec.values = values;
      const d = parseDefault(o.default);
      if (d !== undefined) spec.default = d;
      return spec;
    }),
    events: c.api.events.map((e) => e.name),
  };
}

/** Components with a seed, as buildExamples() playground entries. */
export function playgrounds(components) {
  const out = [];
  for (const [name, c] of components) {
    const seed = join(seedsDir, `${name}.ts`);
    if (existsSync(seed)) out.push({ name, seed, spec: playgroundSpec(c) });
  }
  return out;
}
