/** Shared helpers for tool handlers: name suggestions, size-aware selection, and text helpers. */
import type { JsonObject, JsonValue } from '../protocol/jsonrpc.js';
import { ToolInputError } from '../surface.js';

/** Character budget for one tool result (the server rejects results above 25,000; leave room for the envelope). */
export const RESULT_BUDGET = 22_000;

function distance(a: string, b: string): number {
  if (Math.abs(a.length - b.length) > 8) return 99;
  const row = Array.from({ length: b.length + 1 }, (_, i) => i);
  for (let i = 1; i <= a.length; i++) {
    let previous = row[0] ?? 0;
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const current = row[j] ?? 0;
      row[j] = Math.min(current + 1, (row[j - 1] ?? 0) + 1, previous + (a[i - 1] === b[j - 1] ? 0 : 1));
      previous = current;
    }
  }
  return row[b.length] ?? 99;
}

/** Up to three known names close to `input` (edit distance, prefix, or containment). */
export function suggest(input: string, known: readonly string[]): string[] {
  const value = input.toLowerCase().slice(0, 128);
  const compact = value.replace(/[^a-z0-9]/g, '');
  return known
    .map((name) => {
      const n = name.toLowerCase();
      const c = n.replace(/[^a-z0-9]/g, '');
      const score = c === compact ? 0 : n.startsWith(value) || c.includes(compact) || compact.includes(c) ? 1 : distance(value, n);
      return { name, score };
    })
    .filter((s) => s.score <= Math.max(2, Math.floor(value.length / 4)))
    .sort((a, b) => a.score - b.score || a.name.localeCompare(b.name))
    .slice(0, 3)
    .map((s) => s.name);
}

/** Throws an actionable "unknown" error with suggestions. */
export function unknown(kind: string, input: string, known: readonly string[], hint = ''): never {
  const near = suggest(input, known);
  const did = near.length > 0 ? ` Did you mean ${near.map((n) => `'${n}'`).join(' or ')}?` : '';
  throw new ToolInputError(`Unknown ${kind} '${input.slice(0, 80)}'.${did}${hint ? ` ${hint}` : ''}`);
}

export function size(value: JsonValue): number {
  return JSON.stringify(value).length;
}

export interface Fitted {
  readonly included: JsonObject;
  readonly omitted: readonly string[];
}

/**
 * Keeps keyed parts in order while they fit the budget; the rest are named in `omitted` so the client
 * can ask for them separately. A single part that alone exceeds the budget is replaced by a note.
 */
export function fit(parts: readonly (readonly [string, JsonValue])[], budget: number, tooLarge: (key: string) => JsonValue): Fitted {
  const included: Record<string, JsonValue> = {};
  const omitted: string[] = [];
  let used = 0;
  for (const [key, value] of parts) {
    const cost = size(value) + key.length + 4;
    if (cost > budget) {
      if (Object.keys(included).length === 0 && omitted.length === 0) {
        included[key] = tooLarge(key);
        used += size(included[key]);
      } else omitted.push(key);
      continue;
    }
    if (used + cost > budget) {
      omitted.push(key);
      continue;
    }
    included[key] = value;
    used += cost;
  }
  return { included, omitted };
}

export function firstSentence(text: string): string {
  const match = /^(.+?[.!?])(\s|$)/.exec(text.trim());
  return (match?.[1] ?? text).trim();
}

/** Splits Markdown into its `##` sections: [heading, markdown]. Text before the first heading is "Introduction". */
export function markdownSections(markdown: string): [string, string][] {
  const out: [string, string][] = [];
  let heading = 'Introduction';
  let lines: string[] = [];
  let fence = false;
  const flush = (): void => {
    const text = lines.join('\n').trim();
    if (text) out.push([heading, text]);
  };
  for (const line of markdown.split('\n')) {
    if (/^\s*(```|~~~)/.test(line)) fence = !fence;
    const match = fence ? null : /^## (.+)$/.exec(line);
    if (match) {
      flush();
      heading = (match[1] ?? '').trim();
      lines = [];
    } else lines.push(line);
  }
  flush();
  return out;
}

export function optionalString(args: JsonObject, name: string): string | undefined {
  const value = args[name];
  return typeof value === 'string' ? value : undefined;
}

export function stringList(args: JsonObject, name: string): string[] | undefined {
  const value = args[name];
  return Array.isArray(value) ? value.filter((v): v is string => typeof v === 'string') : undefined;
}

export function requiredString(args: JsonObject, name: string): string {
  const value = args[name];
  if (typeof value !== 'string') throw new ToolInputError(`"${name}" is required.`);
  return value;
}

/** Converts plain data (content snapshot records) to JSON values, dropping undefined members. */
export function toJson(value: unknown): JsonValue {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return value;
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (Array.isArray(value)) return value.map(toJson);
  if (typeof value === 'object') {
    const out: Record<string, JsonValue> = {};
    for (const [key, member] of Object.entries(value)) if (member !== undefined) out[key] = toJson(member);
    return out;
  }
  return null;
}
