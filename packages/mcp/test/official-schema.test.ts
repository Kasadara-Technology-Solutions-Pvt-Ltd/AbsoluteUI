// Every message the server sends is checked against the official MCP schema of its revision
// (vendored fixtures, see fixtures/mcp-schema/README.md), using this package's own validator.
import { describe, expect, it } from 'vitest';
import { readFileSync } from 'node:fs';
import { createServer } from '../src/server.js';
import { isJsonObject, parseMessage, type JsonObject, type JsonValue, type OutgoingMessage } from '../src/protocol/jsonrpc.js';
import { assertSupportedSchema, formatErrors, validate } from '../src/protocol/schema.js';
import type { ServerSurface } from '../src/surface.js';

function load(revision: string): JsonObject {
  const value = JSON.parse(readFileSync(new URL(`./fixtures/mcp-schema/${revision}.schema.json`, import.meta.url), 'utf8')) as JsonValue;
  if (!isJsonObject(value)) throw new Error(`fixture ${revision} is not an object`);
  return value;
}

const surface: ServerSurface = {
  tools: [
    {
      name: 'get_component',
      title: 'Get component',
      description: 'A component reference.',
      inputSchema: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string', maxLength: 64 } } },
      outputSchema: { type: 'object', additionalProperties: false, required: ['name'], properties: { name: { type: 'string' } } },
      run: (args) => ({ name: typeof args.name === 'string' ? args.name : '' }),
    },
  ],
  resources: {
    list: () => [{ uri: 'absoluteui://components', name: 'components', title: 'Components', mimeType: 'application/json' }],
    templates: () => [{ uriTemplate: 'absoluteui://component/{name}', name: 'component', description: 'One component.', mimeType: 'text/markdown' }],
    read: (uri) => (uri === 'absoluteui://components' ? [{ uri, mimeType: 'application/json', text: '[]' }] : undefined),
    complete: () => ['button'],
  },
  prompts: [
    {
      name: 'choose_component',
      title: 'Choose a component',
      description: 'Pick one.',
      arguments: [{ name: 'need', description: 'What it must do.', required: true }],
      get: (args) => ({ description: 'Choose', messages: [{ role: 'user', content: { type: 'text', text: args.need ?? '' } }] }),
    },
  ],
};

type Check = readonly [method: string, params: JsonObject, definition: string];
const COMMON: readonly Check[] = [
  ['tools/list', {}, 'ListToolsResult'],
  ['tools/call', { name: 'get_component', arguments: { name: 'button' } }, 'CallToolResult'],
  ['tools/call', { name: 'get_component', arguments: { name: 1 } }, 'CallToolResult'],
  ['resources/list', {}, 'ListResourcesResult'],
  ['resources/templates/list', {}, 'ListResourceTemplatesResult'],
  ['resources/read', { uri: 'absoluteui://components' }, 'ReadResourceResult'],
  ['prompts/list', {}, 'ListPromptsResult'],
  ['prompts/get', { name: 'choose_component', arguments: { need: 'a date' } }, 'GetPromptResult'],
  ['completion/complete', { ref: { type: 'ref/resource', uri: 'absoluteui://component/{name}' }, argument: { name: 'name', value: 'b' } }, 'CompleteResult'],
];
const ERRORS: readonly (readonly [string, JsonObject])[] = [
  ['nope/nope', {}],
  ['tools/call', { name: 'missing' }],
  ['resources/read', { uri: 'absoluteui://missing' }],
];

function expectValid(schema: JsonObject, definition: string, message: OutgoingMessage | undefined): void {
  expect(message).toBeDefined();
  const instance = message as unknown as JsonValue;
  const envelope = validate({ $ref: '#/$defs/JSONRPCResponse' }, instance, 0, schema);
  expect(envelope.length === 0 ? '' : formatErrors(envelope, 'message')).toBe('');
  if (message && 'result' in message) {
    const errors = validate({ $ref: `#/$defs/${definition}` }, message.result, 0, schema);
    expect(errors.length === 0 ? '' : `${definition}: ${formatErrors(errors, 'result')}`).toBe('');
  }
}

describe.each([
  { revision: '2026-07-28', era: 'modern' as const },
  { revision: '2025-11-25', era: 'legacy' as const },
])('official schema $revision', ({ revision, era }) => {
  const schema = load(revision);
  const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };

  async function session() {
    const server = createServer({ info: { name: 'absoluteui', title: 'AbsoluteUI', version: '1.2.3' }, instructions: 'Use it.', surface });
    let id = 0;
    const send = (method: string, params: JsonObject): Promise<OutgoingMessage | undefined> =>
      server.handle(parseMessage(JSON.stringify({ jsonrpc: '2.0', id: ++id, method, params: era === 'modern' ? { ...params, _meta: META } : params })));
    if (era === 'legacy') {
      const init = await send('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
      expectValid(schema, 'InitializeResult', init);
    }
    return send;
  }

  it('is fully supported by the validator', () => {
    expect(() => { assertSupportedSchema(schema); }).not.toThrow();
  });

  it('accepts every result the server sends', async () => {
    const send = await session();
    if (era === 'modern') expectValid(schema, 'DiscoverResult', await send('server/discover', {}));
    else expectValid(schema, 'EmptyResult', await send('ping', {}));
    for (const [method, params, definition] of COMMON) expectValid(schema, definition, await send(method, params));
  });

  it('accepts every error the server sends', async () => {
    const send = await session();
    for (const [method, params] of ERRORS) {
      const message = await send(method, params);
      expect(message && 'error' in message).toBe(true);
      expectValid(schema, 'JSONRPCErrorResponse', message);
    }
  });

  it('rejects a malformed result (the check is not vacuous)', () => {
    const errors = validate({ $ref: '#/$defs/ListToolsResult' }, { tools: [{ title: 'no name' }] }, 0, schema);
    expect(errors.length).toBeGreaterThan(0);
  });
});
