/**
 * Diagnostics go to stderr only, and only when ABSOLUTEUI_MCP_DEBUG=1 (docs/PLAN-R15-MCP.md section 6):
 * stdout carries nothing but JSON-RPC lines. Never log tool arguments or snippets.
 */
import { env, stderr } from 'node:process';

const enabled = env.ABSOLUTEUI_MCP_DEBUG === '1';

export function debug(message: string): void {
  if (enabled) stderr.write(`[absoluteui-mcp] ${message}\n`);
}
