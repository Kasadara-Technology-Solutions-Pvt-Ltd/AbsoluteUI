/**
 * Loads the content snapshot once (read-only). The server reads only its own package files.
 */
import { readFileSync } from 'node:fs';
import { isJsonObject, type JsonValue } from '../protocol/jsonrpc.js';
import type { Content } from './types.js';

const ARRAYS = ['components', 'addons', 'showcases', 'angular', 'api', 'guides', 'excluded'] as const;

/** Checks the top-level shape; the snapshot is written only by this package's build. */
export function parseContent(text: string): Content {
  const value = JSON.parse(text) as JsonValue;
  if (!isJsonObject(value) || value.schemaVersion !== 1 || typeof value.version !== 'string') throw new Error('content.json: unsupported snapshot.');
  for (const key of ARRAYS) if (!Array.isArray(value[key])) throw new Error(`content.json: "${key}" must be an array.`);
  if (!isJsonObject(value.tokens) || !isJsonObject(value.icons) || !isJsonObject(value.schemas)) throw new Error('content.json: tokens, icons, and schemas must be objects.');
  return value as unknown as Content;
}

export function loadContent(url: URL): Content {
  return parseContent(readFileSync(url, 'utf8'));
}
