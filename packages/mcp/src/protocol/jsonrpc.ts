/**
 * JSON-RPC 2.0 messages for the MCP stdio transport (docs/PLAN-R15-MCP.md section 1): one message per
 * line, no batching, the server never sends requests.
 */

export type JsonValue = null | boolean | number | string | readonly JsonValue[] | JsonObject;
export interface JsonObject {
  readonly [key: string]: JsonValue;
}
export type RequestId = string | number;

/** Error codes used by this server (JSON-RPC 2.0 and the MCP specification). */
export const ErrorCode = {
  ParseError: -32700,
  InvalidRequest: -32600,
  MethodNotFound: -32601,
  InvalidParams: -32602,
  InternalError: -32603,
  /** MCP 2025-11-25 only: resource not found (2026-07-28 uses InvalidParams). */
  LegacyResourceNotFound: -32002,
  /** MCP 2026-07-28: UnsupportedProtocolVersionError, `data.supported` and `data.requested`. */
  UnsupportedProtocolVersion: -32022,
} as const;

export interface RpcErrorBody {
  readonly code: number;
  readonly message: string;
  readonly data?: JsonValue;
}

/** Thrown by handlers to answer with a JSON-RPC error. */
export class RpcError extends Error {
  readonly code: number;
  readonly data: JsonValue | undefined;
  constructor(code: number, message: string, data?: JsonValue) {
    super(message);
    this.name = 'RpcError';
    this.code = code;
    this.data = data;
  }
  toBody(): RpcErrorBody {
    return this.data === undefined ? { code: this.code, message: this.message } : { code: this.code, message: this.message, data: this.data };
  }
}

export interface RequestMessage {
  readonly kind: 'request';
  readonly id: RequestId;
  readonly method: string;
  readonly params: JsonObject | undefined;
}
export interface NotificationMessage {
  readonly kind: 'notification';
  readonly method: string;
  readonly params: JsonObject | undefined;
}
/** A response or anything the server ignores (the server sends no requests, so it expects no responses). */
export interface IgnoredMessage {
  readonly kind: 'ignored';
}
export interface InvalidMessage {
  readonly kind: 'invalid';
  readonly id: RequestId | null;
  readonly error: RpcErrorBody;
}
export type IncomingMessage = RequestMessage | NotificationMessage | IgnoredMessage | InvalidMessage;

export type OutgoingMessage =
  | { readonly jsonrpc: '2.0'; readonly id: RequestId; readonly result: JsonObject }
  | { readonly jsonrpc: '2.0'; readonly id: RequestId | null; readonly error: RpcErrorBody };

export function isJsonObject(value: unknown): value is JsonObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isRequestId(value: unknown): value is RequestId {
  return typeof value === 'string' || (typeof value === 'number' && Number.isInteger(value));
}

/** Parses one line of the stdio stream. Never throws. */
export function parseMessage(line: string): IncomingMessage {
  let value: unknown;
  try {
    value = JSON.parse(line);
  } catch {
    return { kind: 'invalid', id: null, error: { code: ErrorCode.ParseError, message: 'Parse error: the line is not valid JSON.' } };
  }
  if (Array.isArray(value)) {
    return { kind: 'invalid', id: null, error: { code: ErrorCode.InvalidRequest, message: 'Invalid request: JSON-RPC batches are not supported.' } };
  }
  if (!isJsonObject(value)) {
    return { kind: 'invalid', id: null, error: { code: ErrorCode.InvalidRequest, message: 'Invalid request: a message must be a JSON object.' } };
  }
  const id = value.id;
  const hasId = 'id' in value;
  const replyId = isRequestId(id) ? id : null;
  if (value.jsonrpc !== '2.0') {
    return { kind: 'invalid', id: replyId, error: { code: ErrorCode.InvalidRequest, message: 'Invalid request: "jsonrpc" must be "2.0".' } };
  }
  const method = value.method;
  if (typeof method !== 'string') {
    // A response from the client: the server sends no requests, so there is nothing to match.
    if ('result' in value || 'error' in value) return { kind: 'ignored' };
    return { kind: 'invalid', id: replyId, error: { code: ErrorCode.InvalidRequest, message: 'Invalid request: "method" must be a string.' } };
  }
  const params = value.params;
  if (params !== undefined && !isJsonObject(params)) {
    return { kind: 'invalid', id: replyId, error: { code: ErrorCode.InvalidParams, message: 'Invalid params: "params" must be an object.' } };
  }
  if (!hasId) return { kind: 'notification', method, params };
  if (!isRequestId(id)) {
    return { kind: 'invalid', id: null, error: { code: ErrorCode.InvalidRequest, message: 'Invalid request: "id" must be a string or an integer.' } };
  }
  return { kind: 'request', id, method, params };
}

export function resultMessage(id: RequestId, result: JsonObject): OutgoingMessage {
  return { jsonrpc: '2.0', id, result };
}

export function errorMessage(id: RequestId | null, error: RpcErrorBody): OutgoingMessage {
  return { jsonrpc: '2.0', id, error };
}

export function isJsonArray(value: JsonValue | undefined): value is readonly JsonValue[] {
  return Array.isArray(value);
}

/** The value if it is a string, else ''. */
export function stringOf(value: JsonValue | undefined): string {
  return typeof value === 'string' ? value : '';
}
