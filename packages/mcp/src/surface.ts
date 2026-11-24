/**
 * The capability surface the server exposes (docs/PLAN-R15-MCP.md section 4). Tools, resources, and
 * prompts register through these shapes; the protocol layer (server.ts) owns validation, paging, and
 * the differences between the two protocol revisions.
 */
import type { JsonObject } from './protocol/jsonrpc.js';

export interface CallContext {
  /** Aborted when the client cancels the request or the per-call time limit passes. */
  readonly signal: AbortSignal;
}

/** Thrown by a tool handler for a problem with the arguments: reported as an `isError` result. */
export class ToolInputError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ToolInputError';
  }
}

export interface ToolDefinition {
  /** `[a-z_]+`, part of the semver contract. */
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly inputSchema: JsonObject;
  readonly outputSchema: JsonObject;
  readonly run: (args: JsonObject, context: CallContext) => JsonObject | Promise<JsonObject>;
}

export interface ResourceContents {
  readonly uri: string;
  readonly mimeType: string;
  readonly text: string;
}

export interface ResourceEntry {
  readonly uri: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType: string;
}

export interface ResourceTemplateEntry {
  readonly uriTemplate: string;
  readonly name: string;
  readonly title?: string;
  readonly description?: string;
  readonly mimeType: string;
}

export interface ResourceProvider {
  readonly list: () => readonly ResourceEntry[];
  readonly templates: () => readonly ResourceTemplateEntry[];
  /** `undefined` when no resource has this URI (the server answers with an error, never empty contents). */
  readonly read: (uri: string) => readonly ResourceContents[] | undefined;
  /** Completion values for a template variable. */
  readonly complete?: (uriTemplate: string, variable: string, value: string) => readonly string[];
}

export interface PromptArgument {
  readonly name: string;
  readonly description: string;
  readonly required: boolean;
}

export interface PromptMessage {
  readonly role: 'user' | 'assistant';
  readonly content: { readonly type: 'text'; readonly text: string };
}

export interface PromptDefinition {
  readonly name: string;
  readonly title: string;
  readonly description: string;
  readonly arguments: readonly PromptArgument[];
  readonly get: (args: Readonly<Record<string, string>>) => { readonly description: string; readonly messages: readonly PromptMessage[] };
  readonly complete?: (argument: string, value: string) => readonly string[];
}

export interface ServerSurface {
  readonly tools: readonly ToolDefinition[];
  readonly resources: ResourceProvider;
  readonly prompts: readonly PromptDefinition[];
}

export const EMPTY_RESOURCES: ResourceProvider = {
  list: () => [],
  templates: () => [],
  read: () => undefined,
};
