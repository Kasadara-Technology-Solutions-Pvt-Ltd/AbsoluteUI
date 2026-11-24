/**
 * The MCP server core, transport-free (docs/PLAN-R15-MCP.md sections 1 and 4). Serves the stateless
 * 2026-07-28 revision and the 2025-11-25 `initialize` flow from the same process (R15-3): a request
 * that carries `_meta` protocol fields is handled statelessly; `initialize` selects legacy behavior
 * for the rest of the process.
 */
import { ErrorCode, RpcError, errorMessage, isJsonObject, resultMessage, type IncomingMessage, type JsonObject, type JsonValue, type OutgoingMessage, type RequestId, type RequestMessage } from './protocol/jsonrpc.js';
import { CACHE_TTL_MS, LEGACY_REVISION, META_CLIENT_CAPABILITIES, META_PROTOCOL_VERSION, META_SERVER_INFO, MODERN_REVISION, STATELESS_VERSIONS, type Era } from './protocol/revisions.js';
import { assertSupportedSchema, formatErrors, validate } from './protocol/schema.js';
import { ToolInputError, type PromptDefinition, type ServerSurface, type ToolDefinition } from './surface.js';
import { debug } from './log.js';

export interface ServerInfo {
  readonly name: string;
  readonly title: string;
  readonly version: string;
}

export interface ServerOptions {
  readonly info: ServerInfo;
  readonly instructions: string;
  readonly surface: ServerSurface;
  /** Per tool call; the call is answered with an `isError` result after it (default 5,000 ms). */
  readonly callTimeoutMs?: number;
  /** Largest serialized tool result (default 25,000 characters). */
  readonly maxResultChars?: number;
  /** Items per page of every list (default 100). */
  readonly pageSize?: number;
}

export interface Server {
  /** Handles one incoming message; resolves to the response to write, if any. */
  readonly handle: (message: IncomingMessage) => Promise<OutgoingMessage | undefined>;
}

const NAME_PATTERN = /^[a-z][a-z_]*$/;
const MAX_URI_LENGTH = 2048;
const MAX_PROMPT_ARGUMENT_CHARS = 50_000;
const MAX_COMPLETIONS = 100;
const ANNOTATIONS: JsonObject = { readOnlyHint: true, destructiveHint: false, idempotentHint: true, openWorldHint: false };
const CAPABILITIES: JsonObject = { tools: {}, resources: {}, prompts: {}, completions: {} };

function invalidParams(message: string, data?: JsonValue): RpcError {
  return new RpcError(ErrorCode.InvalidParams, message, data);
}

function stringParam(params: JsonObject, name: string, maxLength: number): string {
  const value = params[name];
  if (typeof value !== 'string' || value.length === 0) throw invalidParams(`Invalid params: "${name}" must be a non-empty string.`);
  if (value.length > maxLength) throw invalidParams(`Invalid params: "${name}" must have at most ${maxLength} characters.`);
  return value;
}

function checkRegistration(surface: ServerSurface): void {
  const seen = new Set<string>();
  const unique = (kind: string, name: string): void => {
    if (!NAME_PATTERN.test(name)) throw new Error(`${kind} name "${name}" must match ${NAME_PATTERN.source}.`);
    if (seen.has(`${kind}:${name}`)) throw new Error(`Duplicate ${kind} name "${name}".`);
    seen.add(`${kind}:${name}`);
  };
  for (const tool of surface.tools) {
    unique('tool', tool.name);
    if (tool.inputSchema.type !== 'object' || tool.outputSchema.type !== 'object') throw new Error(`Tool "${tool.name}": input and output schemas must have type "object".`);
    assertSupportedSchema(tool.inputSchema, `${tool.name}#input`);
    assertSupportedSchema(tool.outputSchema, `${tool.name}#output`);
  }
  for (const prompt of surface.prompts) unique('prompt', prompt.name);
}

function toolJson(tool: ToolDefinition): JsonObject {
  return {
    name: tool.name,
    title: tool.title,
    description: tool.description,
    inputSchema: tool.inputSchema,
    outputSchema: tool.outputSchema,
    annotations: { title: tool.title, ...ANNOTATIONS },
  };
}

function promptJson(prompt: PromptDefinition): JsonObject {
  return {
    name: prompt.name,
    title: prompt.title,
    description: prompt.description,
    arguments: prompt.arguments.map((a) => ({ name: a.name, description: a.description, required: a.required })),
  };
}

function optional(entry: { readonly title?: string; readonly description?: string }): JsonObject {
  return { ...(entry.title === undefined ? {} : { title: entry.title }), ...(entry.description === undefined ? {} : { description: entry.description }) };
}

function toolError(text: string): JsonObject {
  return { content: [{ type: 'text', text }], isError: true };
}

function requestKey(id: RequestId): string {
  return `${typeof id}:${String(id)}`;
}

export function createServer(options: ServerOptions): Server {
  const { info, instructions, surface } = options;
  const callTimeoutMs = options.callTimeoutMs ?? 5_000;
  const maxResultChars = options.maxResultChars ?? 25_000;
  const pageSize = options.pageSize ?? 100;
  checkRegistration(surface);
  const tools = new Map(surface.tools.map((t) => [t.name, t]));
  const prompts = new Map(surface.prompts.map((p) => [p.name, p]));
  const serverInfo: JsonObject = { name: info.name, title: info.title, version: info.version };
  const inflight = new Map<string, AbortController>();
  let legacyInitialized = false;

  function page<T>(items: readonly T[], params: JsonObject): { readonly items: readonly T[]; readonly next: JsonObject } {
    let offset = 0;
    const cursor = params.cursor;
    if (cursor !== undefined) {
      let decoded: string;
      try {
        decoded = typeof cursor === 'string' ? atob(cursor) : '';
      } catch {
        decoded = '';
      }
      const match = /^o:(\d{1,9})$/.exec(decoded);
      offset = match ? Number(match[1]) : -1;
      if (offset < 0 || offset > items.length) throw invalidParams('Invalid params: unknown "cursor".');
    }
    const end = offset + pageSize;
    return { items: items.slice(offset, end), next: end < items.length ? { nextCursor: btoa(`o:${end}`) } : {} };
  }

  async function callTool(params: JsonObject, signal: AbortSignal): Promise<JsonObject> {
    const name = stringParam(params, 'name', 128);
    const tool = tools.get(name);
    if (!tool) throw invalidParams(`Unknown tool: ${name}`);
    const args = params.arguments ?? {};
    if (!isJsonObject(args)) throw invalidParams('Invalid params: "arguments" must be an object.');
    const problems = validate(tool.inputSchema, args);
    if (problems.length > 0) return toolError(formatErrors(problems));
    const timeout = AbortSignal.timeout(callTimeoutMs);
    const callSignal = AbortSignal.any([signal, timeout]);
    let output: JsonObject;
    try {
      output = await new Promise<JsonObject>((resolve, reject) => {
        const onAbort = (): void => { reject(callSignal.reason instanceof Error ? callSignal.reason : new Error('aborted')); };
        callSignal.addEventListener('abort', onAbort, { once: true });
        Promise.resolve()
          .then(() => tool.run(args, { signal: callSignal }))
          .then(resolve, reject)
          .finally(() => { callSignal.removeEventListener('abort', onAbort); });
      });
    } catch (error) {
      if (error instanceof ToolInputError) return toolError(error.message);
      if (timeout.aborted && !signal.aborted) return toolError(`The tool "${name}" took longer than ${callTimeoutMs} ms and was stopped. Narrow the request and try again.`);
      throw error;
    }
    const outputProblems = validate(tool.outputSchema, output);
    if (outputProblems.length > 0) {
      debug(`tool ${name}: output does not match its outputSchema: ${formatErrors(outputProblems, 'output')}`);
      throw new RpcError(ErrorCode.InternalError, `Internal error: the tool "${name}" produced an invalid result.`);
    }
    const text = JSON.stringify(output);
    if (text.length > maxResultChars) return toolError(`The result of "${name}" exceeds ${maxResultChars} characters. Request fewer sections or a narrower query.`);
    return { content: [{ type: 'text', text }], structuredContent: output };
  }

  function readResource(params: JsonObject, era: Era): JsonObject {
    const uri = stringParam(params, 'uri', MAX_URI_LENGTH);
    const contents = uri.startsWith('absoluteui://') ? surface.resources.read(uri) : undefined;
    if (!contents || contents.length === 0) {
      if (era === 'legacy') throw new RpcError(ErrorCode.LegacyResourceNotFound, 'Resource not found', { uri });
      throw invalidParams('Resource not found', { uri });
    }
    return { contents: contents.map((c) => ({ uri: c.uri, mimeType: c.mimeType, text: c.text })) };
  }

  function getPrompt(params: JsonObject): JsonObject {
    const name = stringParam(params, 'name', 128);
    const prompt = prompts.get(name);
    if (!prompt) throw invalidParams(`Unknown prompt: ${name}`);
    const raw = params.arguments ?? {};
    if (!isJsonObject(raw)) throw invalidParams('Invalid params: "arguments" must be an object.');
    const args: Record<string, string> = {};
    for (const [key, value] of Object.entries(raw)) {
      if (!prompt.arguments.some((a) => a.name === key)) throw invalidParams(`Invalid params: prompt "${name}" has no argument "${key}".`);
      if (typeof value !== 'string' || value.length > MAX_PROMPT_ARGUMENT_CHARS) throw invalidParams(`Invalid params: argument "${key}" must be a string of at most ${MAX_PROMPT_ARGUMENT_CHARS} characters.`);
      args[key] = value;
    }
    const missing = prompt.arguments.filter((a) => a.required && !(a.name in args)).map((a) => a.name);
    if (missing.length > 0) throw invalidParams(`Invalid params: prompt "${name}" needs the argument(s) ${missing.join(', ')}.`);
    const result = prompt.get(args);
    return { description: result.description, messages: result.messages.map((m) => ({ role: m.role, content: { type: 'text', text: m.content.text } })) };
  }

  function complete(params: JsonObject): JsonObject {
    const ref = params.ref;
    const argument = params.argument;
    if (!isJsonObject(ref) || !isJsonObject(argument)) throw invalidParams('Invalid params: "ref" and "argument" must be objects.');
    const argName = stringParam(argument, 'name', 128);
    const value = typeof argument.value === 'string' ? argument.value.slice(0, 256) : '';
    let values: readonly string[];
    if (ref.type === 'ref/prompt') {
      const prompt = prompts.get(stringParam(ref, 'name', 128));
      if (!prompt) throw invalidParams('Invalid params: unknown prompt.');
      values = prompt.complete?.(argName, value) ?? [];
    } else if (ref.type === 'ref/resource') {
      values = surface.resources.complete?.(stringParam(ref, 'uri', MAX_URI_LENGTH), argName, value) ?? [];
    } else {
      throw invalidParams('Invalid params: "ref.type" must be "ref/prompt" or "ref/resource".');
    }
    return { completion: { values: values.slice(0, MAX_COMPLETIONS), total: values.length, hasMore: values.length > MAX_COMPLETIONS } };
  }

  function stripMeta(params: JsonObject | undefined): JsonObject {
    if (!params) return {};
    return Object.fromEntries(Object.entries(params).filter(([key]) => key !== '_meta'));
  }

  /** Decides the era of a request and checks the per-request protocol fields of 2026-07-28. */
  function eraOf(request: RequestMessage): Era {
    const meta = request.params?._meta;
    const version = isJsonObject(meta) ? meta[META_PROTOCOL_VERSION] : undefined;
    if (version !== undefined) {
      if (typeof version !== 'string' || !STATELESS_VERSIONS.includes(version)) {
        const hint = version === LEGACY_REVISION ? ` ${LEGACY_REVISION} needs the initialize handshake.` : '';
        throw new RpcError(ErrorCode.UnsupportedProtocolVersion, `Unsupported protocol version.${hint}`, { supported: [...STATELESS_VERSIONS], requested: typeof version === 'string' ? version : null });
      }
      if (!isJsonObject(meta) || !isJsonObject(meta[META_CLIENT_CAPABILITIES])) throw invalidParams(`Invalid params: "_meta" must include "${META_CLIENT_CAPABILITIES}".`);
      return 'modern';
    }
    if (legacyInitialized || request.method === 'initialize' || request.method === 'ping') return 'legacy';
    throw invalidParams(`Invalid params: "_meta" must include "${META_PROTOCOL_VERSION}" (this server supports ${MODERN_REVISION}, or ${LEGACY_REVISION} after initialize).`, { supported: [...STATELESS_VERSIONS] });
  }

  async function dispatch(request: RequestMessage, signal: AbortSignal): Promise<JsonObject> {
    const era = eraOf(request);
    const params = stripMeta(request.params);
    let result: JsonObject;
    let cacheable = false;
    switch (request.method) {
      case 'server/discover':
        if (era !== 'modern') throw new RpcError(ErrorCode.MethodNotFound, 'Method not found: server/discover');
        result = { supportedVersions: [...STATELESS_VERSIONS], capabilities: CAPABILITIES, instructions };
        cacheable = true;
        break;
      case 'initialize':
        if (era !== 'legacy') throw new RpcError(ErrorCode.MethodNotFound, 'Method not found: initialize');
        legacyInitialized = true;
        // The requested version is not one this server speaks unless it is 2025-11-25; either way the
        // server answers with the legacy revision it supports, as the 2025-11-25 lifecycle prescribes.
        return { protocolVersion: LEGACY_REVISION, capabilities: CAPABILITIES, serverInfo, instructions };
      case 'ping':
        if (era !== 'legacy') throw new RpcError(ErrorCode.MethodNotFound, 'Method not found: ping');
        return {};
      case 'tools/list': {
        const { items, next } = page(surface.tools, params);
        result = { tools: items.map(toolJson), ...next };
        cacheable = true;
        break;
      }
      case 'tools/call':
        result = await callTool(params, signal);
        break;
      case 'resources/list': {
        const { items, next } = page(surface.resources.list(), params);
        result = { resources: items.map((r) => ({ uri: r.uri, name: r.name, mimeType: r.mimeType, ...optional(r) })), ...next };
        cacheable = true;
        break;
      }
      case 'resources/templates/list': {
        const { items, next } = page(surface.resources.templates(), params);
        result = { resourceTemplates: items.map((t) => ({ uriTemplate: t.uriTemplate, name: t.name, mimeType: t.mimeType, ...optional(t) })), ...next };
        cacheable = true;
        break;
      }
      case 'resources/read':
        result = readResource(params, era);
        cacheable = true;
        break;
      case 'prompts/list': {
        const { items, next } = page(surface.prompts, params);
        result = { prompts: items.map(promptJson), ...next };
        cacheable = true;
        break;
      }
      case 'prompts/get':
        result = getPrompt(params);
        break;
      case 'completion/complete':
        result = complete(params);
        break;
      default:
        throw new RpcError(ErrorCode.MethodNotFound, `Method not found: ${request.method}`);
    }
    if (era === 'legacy') return result;
    return {
      ...result,
      resultType: 'complete',
      ...(cacheable ? { ttlMs: CACHE_TTL_MS, cacheScope: 'public' } : {}),
      _meta: { [META_SERVER_INFO]: serverInfo },
    };
  }

  async function handleRequest(request: RequestMessage): Promise<OutgoingMessage | undefined> {
    const key = requestKey(request.id);
    const controller = new AbortController();
    inflight.set(key, controller);
    try {
      const result = await dispatch(request, controller.signal);
      return controller.signal.aborted ? undefined : resultMessage(request.id, result);
    } catch (error) {
      // A cancelled request gets no response (both revisions).
      if (controller.signal.aborted) return undefined;
      if (error instanceof RpcError) return errorMessage(request.id, error.toBody());
      debug(`internal error in ${request.method}: ${error instanceof Error ? error.message : String(error)}`);
      return errorMessage(request.id, { code: ErrorCode.InternalError, message: 'Internal error.' });
    } finally {
      inflight.delete(key);
    }
  }

  return {
    handle: async (message) => {
      switch (message.kind) {
        case 'invalid':
          return errorMessage(message.id, message.error);
        case 'ignored':
          return undefined;
        case 'notification': {
          if (message.method === 'notifications/cancelled') {
            const id = message.params?.requestId;
            if (typeof id === 'string' || typeof id === 'number') inflight.get(requestKey(id))?.abort();
          }
          // notifications/initialized and unknown notifications need no action.
          return undefined;
        }
        case 'request':
          return handleRequest(message);
      }
    },
  };
}
