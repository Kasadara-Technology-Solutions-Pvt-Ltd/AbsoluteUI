// Test support: the real content snapshot (built by scripts/build-content.mjs) and an in-process client.
import { existsSync } from 'node:fs';
import { loadContent } from '../src/content/index.js';
import type { Content } from '../src/content/types.js';
import { createAbsoluteUIServer, type AppOptions } from '../src/app.js';
import { isJsonArray, isJsonObject, parseMessage, type JsonObject, type OutgoingMessage } from '../src/protocol/jsonrpc.js';

export const CONTENT_URL = new URL('../dist/content.json', import.meta.url);

let cached: Content | undefined;
export function content(): Content {
  if (!existsSync(CONTENT_URL)) throw new Error('packages/mcp/dist/content.json is missing: run npm run build, then npm run mcp:content.');
  cached ??= loadContent(CONTENT_URL);
  return cached;
}

const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };

export interface Client {
  readonly request: (method: string, params?: JsonObject) => Promise<OutgoingMessage | undefined>;
  readonly call: (name: string, args?: JsonObject) => Promise<{ readonly isError: boolean; readonly text: string; readonly data: JsonObject }>;
}

export function client(options: AppOptions = {}): Client {
  const server = createAbsoluteUIServer(content(), options);
  let id = 0;
  const request = (method: string, params: JsonObject = {}): Promise<OutgoingMessage | undefined> =>
    server.handle(parseMessage(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: { ...params, _meta: META } })));
  return {
    request,
    call: async (name, args = {}) => {
      const message = await request('tools/call', { name, arguments: args });
      if (!message || !('result' in message)) throw new Error(`tools/call ${name}: ${JSON.stringify(message)}`);
      const result = message.result;
      const first = isJsonArray(result.content) ? result.content[0] : undefined;
      const text = isJsonObject(first) && typeof first.text === 'string' ? first.text : '';
      const data = result.structuredContent;
      return { isError: result.isError === true, text, data: isJsonObject(data) ? data : {} };
    },
  };
}
