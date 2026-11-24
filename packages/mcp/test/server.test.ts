import { describe, expect, it } from 'vitest';
import { createServer, type ServerOptions } from '../src/server.js';
import { parseMessage, type JsonObject, type OutgoingMessage } from '../src/protocol/jsonrpc.js';
import { ToolInputError, type ResourceProvider, type ServerSurface, type ToolDefinition } from '../src/surface.js';

const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };

const echo: ToolDefinition = {
  name: 'echo',
  title: 'Echo',
  description: 'Returns its text.',
  inputSchema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string', maxLength: 100 } } },
  outputSchema: { type: 'object', additionalProperties: false, required: ['text'], properties: { text: { type: 'string' } } },
  run: (args) => {
    if (args.text === 'bad') throw new ToolInputError('Unknown text "bad". Did you mean "bat"?');
    return { text: typeof args.text === 'string' ? args.text : '' };
  },
};
const slow: ToolDefinition = {
  name: 'slow',
  title: 'Slow',
  description: 'Never finishes by itself.',
  inputSchema: { type: 'object', additionalProperties: false },
  outputSchema: { type: 'object' },
  run: (_args, { signal }) => new Promise((_resolve, reject) => { signal.addEventListener('abort', () => { reject(new Error('aborted')); }); }),
};
const broken: ToolDefinition = { ...echo, name: 'broken', run: () => ({ wrong: 1 }) };
const large: ToolDefinition = { ...echo, name: 'large', run: () => ({ text: 'x'.repeat(200) }) };

const resources: ResourceProvider = {
  list: () => Array.from({ length: 5 }, (_, i) => ({ uri: `absoluteui://component/c${i}`, name: `c${i}`, mimeType: 'text/markdown' })),
  templates: () => [{ uriTemplate: 'absoluteui://component/{name}', name: 'component', mimeType: 'text/markdown' }],
  read: (uri) => (uri === 'absoluteui://component/c1' ? [{ uri, mimeType: 'text/markdown', text: '# C1' }] : undefined),
  complete: (_template, variable, value) => (variable === 'name' ? ['c0', 'c1', 'c2'].filter((n) => n.startsWith(value)) : []),
};

const surface: ServerSurface = {
  tools: [echo, slow, broken, large],
  resources,
  prompts: [
    {
      name: 'choose_component',
      title: 'Choose a component',
      description: 'Pick a component.',
      arguments: [{ name: 'need', description: 'What the UI must do.', required: true }],
      get: (args) => ({ description: 'Choose', messages: [{ role: 'user', content: { type: 'text', text: `Need: ${args.need ?? ''}` } }] }),
      complete: (_argument, value) => [`${value}-a`, `${value}-b`],
    },
  ],
};

function setup(overrides: Partial<ServerOptions> = {}) {
  const server = createServer({ info: { name: 'absoluteui', title: 'AbsoluteUI', version: '9.9.9' }, instructions: 'Use it well.', surface, pageSize: 2, callTimeoutMs: 200, maxResultChars: 150, ...overrides });
  let id = 0;
  const send = async (method: string, params: JsonObject = {}, meta: JsonObject | null = META): Promise<OutgoingMessage | undefined> => {
    const message = { jsonrpc: '2.0', id: ++id, method, params: meta ? { ...params, _meta: meta } : params };
    return server.handle(parseMessage(JSON.stringify(message)));
  };
  return { server, send };
}

function result(message: OutgoingMessage | undefined): JsonObject {
  if (!message || !('result' in message)) throw new Error(`expected a result, got ${JSON.stringify(message)}`);
  return message.result;
}
function error(message: OutgoingMessage | undefined): { code: number; message: string; data?: unknown } {
  if (!message || !('error' in message)) throw new Error(`expected an error, got ${JSON.stringify(message)}`);
  return message.error;
}

describe('2026-07-28 (stateless)', () => {
  it('answers server/discover with versions, capabilities, instructions, caching, and server info', async () => {
    const { send } = setup();
    expect(result(await send('server/discover'))).toEqual({
      supportedVersions: ['2026-07-28'],
      capabilities: { tools: {}, resources: {}, prompts: {}, completions: {} },
      instructions: 'Use it well.',
      resultType: 'complete',
      ttlMs: 3_600_000,
      cacheScope: 'public',
      _meta: { 'io.modelcontextprotocol/serverInfo': { name: 'absoluteui', title: 'AbsoluteUI', version: '9.9.9' } },
    });
  });

  it('rejects an unsupported version with -32022 and the supported list', async () => {
    const { send } = setup();
    expect(error(await send('tools/list', {}, { ...META, 'io.modelcontextprotocol/protocolVersion': '1900-01-01' }))).toEqual({
      code: -32022,
      message: 'Unsupported protocol version.',
      data: { supported: ['2026-07-28'], requested: '1900-01-01' },
    });
    expect(error(await send('tools/list', {}, { ...META, 'io.modelcontextprotocol/protocolVersion': '2025-11-25' })).message).toMatch(/initialize handshake/);
  });

  it('requires the per-request protocol fields', async () => {
    const { send } = setup();
    expect(error(await send('tools/list', {}, null)).code).toBe(-32602);
    expect(error(await send('tools/list', {}, { 'io.modelcontextprotocol/protocolVersion': '2026-07-28' })).message).toMatch(/clientCapabilities/);
  });

  it('lists tools with annotations, in registration order, with cursor pagination', async () => {
    const { send } = setup();
    const first = result(await send('tools/list'));
    const tools = first.tools as readonly JsonObject[];
    expect(tools.map((t) => t.name)).toEqual(['echo', 'slow']);
    expect(tools[0]?.annotations).toEqual({ title: 'Echo', readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false });
    expect(first.cacheScope).toBe('public');
    const second = result(await send('tools/list', { cursor: first.nextCursor as string }));
    expect((second.tools as readonly JsonObject[]).map((t) => t.name)).toEqual(['broken', 'large']);
    expect(second.nextCursor).toBeUndefined();
    expect(error(await send('tools/list', { cursor: 'nonsense' })).code).toBe(-32602);
  });

  it('calls a tool: structured content plus the same JSON as text', async () => {
    const { send } = setup();
    expect(result(await send('tools/call', { name: 'echo', arguments: { text: 'hi' } }))).toMatchObject({
      content: [{ type: 'text', text: '{"text":"hi"}' }],
      structuredContent: { text: 'hi' },
      resultType: 'complete',
    });
  });

  it('reports input problems as isError results, and unknown tools as -32602', async () => {
    const { send } = setup();
    expect(result(await send('tools/call', { name: 'echo', arguments: { text: 1 } }))).toMatchObject({ isError: true, content: [{ type: 'text', text: 'Invalid arguments: arguments/text must be of type string.' }] });
    expect(result(await send('tools/call', { name: 'echo', arguments: { text: 'bad' } }))).toMatchObject({ isError: true, content: [{ text: 'Unknown text "bad". Did you mean "bat"?' }] });
    expect(error(await send('tools/call', { name: 'nope' }))).toMatchObject({ code: -32602, message: 'Unknown tool: nope' });
    expect(error(await send('tools/call', { name: 'echo', arguments: [] })).code).toBe(-32602);
  });

  it('stops a call after the time limit, guards output size, and never returns an output that breaks its schema', async () => {
    const { send } = setup();
    expect(result(await send('tools/call', { name: 'slow' }))).toMatchObject({ isError: true, content: [{ text: expect.stringMatching(/longer than 200 ms/) as unknown }] });
    expect(result(await send('tools/call', { name: 'large', arguments: { text: 'x' } }))).toMatchObject({ isError: true });
    expect(error(await send('tools/call', { name: 'broken', arguments: { text: 'x' } })).code).toBe(-32603);
  });

  it('sends no response to a cancelled request', async () => {
    const { server } = setup({ callTimeoutMs: 5_000 });
    const call = server.handle(parseMessage(JSON.stringify({ jsonrpc: '2.0', id: 'c1', method: 'tools/call', params: { name: 'slow', _meta: META } })));
    await server.handle(parseMessage(JSON.stringify({ jsonrpc: '2.0', method: 'notifications/cancelled', params: { requestId: 'c1' } })));
    expect(await call).toBeUndefined();
  });

  it('reads resources, lists templates, and answers a missing resource with -32602', async () => {
    const { send } = setup();
    expect(result(await send('resources/read', { uri: 'absoluteui://component/c1' }))).toMatchObject({ contents: [{ uri: 'absoluteui://component/c1', mimeType: 'text/markdown', text: '# C1' }], cacheScope: 'public' });
    expect(error(await send('resources/read', { uri: 'absoluteui://component/zz' }))).toEqual({ code: -32602, message: 'Resource not found', data: { uri: 'absoluteui://component/zz' } });
    expect(error(await send('resources/read', { uri: 'file:///etc/passwd' })).code).toBe(-32602);
    expect(result(await send('resources/templates/list')).resourceTemplates).toEqual([{ uriTemplate: 'absoluteui://component/{name}', name: 'component', mimeType: 'text/markdown' }]);
    expect((result(await send('resources/list')).resources as readonly unknown[]).length).toBe(2);
  });

  it('gets prompts with argument checks and completes arguments', async () => {
    const { send } = setup();
    expect(result(await send('prompts/get', { name: 'choose_component', arguments: { need: 'a date' } }))).toMatchObject({ messages: [{ role: 'user', content: { type: 'text', text: 'Need: a date' } }] });
    expect(error(await send('prompts/get', { name: 'choose_component' })).message).toMatch(/needs the argument\(s\) need/);
    expect(error(await send('prompts/get', { name: 'choose_component', arguments: { need: 'x', other: 'y' } })).code).toBe(-32602);
    expect(result(await send('completion/complete', { ref: { type: 'ref/resource', uri: 'absoluteui://component/{name}' }, argument: { name: 'name', value: 'c' } }))).toMatchObject({ completion: { values: ['c0', 'c1', 'c2'], total: 3, hasMore: false } });
    expect(result(await send('completion/complete', { ref: { type: 'ref/prompt', name: 'choose_component' }, argument: { name: 'need', value: 'x' } }))).toMatchObject({ completion: { values: ['x-a', 'x-b'] } });
  });

  it('answers unknown and legacy-only methods with -32601', async () => {
    const { send } = setup();
    expect(error(await send('nope/nope')).code).toBe(-32601);
    expect(error(await send('ping')).code).toBe(-32601);
    expect(error(await send('initialize')).code).toBe(-32601);
  });
});

describe('2025-11-25 (initialize)', () => {
  it('initializes, then serves requests without _meta and without 2026 result fields', async () => {
    const { send, server } = setup();
    expect(error(await send('tools/list', {}, null)).code).toBe(-32602);
    expect(result(await send('initialize', { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 't', version: '1' } }, null))).toEqual({
      protocolVersion: '2025-11-25',
      capabilities: { tools: {}, resources: {}, prompts: {}, completions: {} },
      serverInfo: { name: 'absoluteui', title: 'AbsoluteUI', version: '9.9.9' },
      instructions: 'Use it well.',
    });
    expect(await server.handle(parseMessage('{"jsonrpc":"2.0","method":"notifications/initialized"}'))).toBeUndefined();
    const list = result(await send('tools/list', {}, null));
    expect(list.resultType).toBeUndefined();
    expect(list.ttlMs).toBeUndefined();
    expect(result(await send('ping', {}, null))).toEqual({});
    expect(error(await send('resources/read', { uri: 'absoluteui://component/zz' }, null)).code).toBe(-32002);
    expect(error(await send('server/discover', {}, null)).code).toBe(-32601);
  });

  it('answers an unknown requested version with the legacy revision it supports', async () => {
    const { send } = setup();
    expect(result(await send('initialize', { protocolVersion: '2024-11-05', capabilities: {} }, null)).protocolVersion).toBe('2025-11-25');
  });

  it('still serves stateless requests after initialize', async () => {
    const { send } = setup();
    await send('initialize', { protocolVersion: '2025-11-25', capabilities: {} }, null);
    expect(result(await send('tools/list')).resultType).toBe('complete');
  });
});

describe('JSON-RPC framing errors', () => {
  it('rejects parse errors, batches, bad versions, and bad ids', async () => {
    const { server } = setup();
    const answer = async (line: string) => server.handle(parseMessage(line));
    expect(error(await answer('{oops'))).toMatchObject({ code: -32700 });
    expect(error(await answer('[{"jsonrpc":"2.0","id":1,"method":"ping"}]'))).toMatchObject({ code: -32600 });
    expect(error(await answer('{"jsonrpc":"1.0","id":1,"method":"ping"}'))).toMatchObject({ code: -32600 });
    expect(error(await answer('{"jsonrpc":"2.0","id":{},"method":"ping"}'))).toMatchObject({ code: -32600 });
    expect(error(await answer('{"jsonrpc":"2.0","id":1,"method":"ping","params":[1]}'))).toMatchObject({ code: -32602 });
    expect(await answer('{"jsonrpc":"2.0","id":1,"result":{}}')).toBeUndefined();
  });
});

describe('registration', () => {
  it('rejects bad names, duplicates, and unsupported schema keywords', () => {
    const base = { info: { name: 'a', title: 'A', version: '1' }, instructions: '' };
    const make = (tools: readonly ToolDefinition[]) => () => createServer({ ...base, surface: { ...surface, tools } });
    expect(make([{ ...echo, name: 'Echo' }])).toThrow(/must match/);
    expect(make([echo, echo])).toThrow(/Duplicate/);
    expect(make([{ ...echo, inputSchema: { type: 'object', patternProperties: {} } }])).toThrow(/unsupported keyword/);
  });
});
