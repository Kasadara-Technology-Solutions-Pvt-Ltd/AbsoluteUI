// Protocol tests over a real stdio child process (docs/PLAN-R15-MCP.md section 7): the built bin,
// newline-delimited JSON-RPC on stdout and nothing else, exit on stdin EOF.
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { spawn } from 'node:child_process';
import { execFileSync } from 'node:child_process';
import { copyFileSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { CONTENT_URL } from './support.js';

const root = fileURLToPath(new URL('../../../', import.meta.url));
let outDir = '';
let bin = '';

beforeAll(() => {
  outDir = mkdtempSync(join(tmpdir(), 'aui-mcp-'));
  execFileSync(process.execPath, [join(root, 'packages/mcp/scripts/build.mjs'), outDir], { stdio: 'pipe' });
  bin = join(outDir, 'bin.js');
  copyFileSync(CONTENT_URL, join(outDir, 'content.json'));
});
afterAll(() => {
  if (outDir) rmSync(outDir, { recursive: true, force: true });
});

interface Run {
  readonly lines: readonly string[];
  readonly stderr: string;
  readonly code: number | null;
}

function run(input: string, env: NodeJS.ProcessEnv = {}): Promise<Run> {
  return new Promise((resolve, reject) => {
    const child = spawn(process.execPath, [bin], { env: { ...process.env, ABSOLUTEUI_MCP_DEBUG: '', ...env }, stdio: ['pipe', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    child.stdout.setEncoding('utf8').on('data', (d: string) => (stdout += d));
    child.stderr.setEncoding('utf8').on('data', (d: string) => (stderr += d));
    child.on('error', reject);
    child.on('close', (code) => { resolve({ lines: stdout.split('\n').filter((l) => l !== ''), stderr, code }); });
    child.stdin.end(input);
  });
}

const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
const line = (message: unknown): string => `${JSON.stringify(message)}\n`;

describe('absoluteui-mcp over stdio', () => {
  it('answers server/discover and exits on EOF with only JSON-RPC lines on stdout', async () => {
    const { lines, code, stderr } = await run(line({ jsonrpc: '2.0', id: 1, method: 'server/discover', params: { _meta: META } }));
    expect(code).toBe(0);
    expect(stderr).toBe('');
    expect(lines).toHaveLength(1);
    const message = JSON.parse(lines[0] ?? '') as { id: number; result: Record<string, unknown> };
    expect(message.id).toBe(1);
    expect(message.result.supportedVersions).toEqual(['2026-07-28']);
    expect(message.result._meta).toEqual({ 'io.modelcontextprotocol/serverInfo': { name: 'absoluteui', title: 'AbsoluteUI', version: expect.stringMatching(/^\d+\.\d+\.\d+/) as unknown } });
  });

  it('runs the 2025-11-25 handshake and lists the tools', async () => {
    const input =
      line({ jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-11-25', capabilities: {}, clientInfo: { name: 'test', version: '1' } } }) +
      line({ jsonrpc: '2.0', method: 'notifications/initialized' }) +
      line({ jsonrpc: '2.0', id: 2, method: 'tools/list' }) +
      line({ jsonrpc: '2.0', id: 3, method: 'ping' });
    const { lines } = await run(input);
    const byId = new Map(lines.map((l) => {
      const m = JSON.parse(l) as { id: number };
      return [m.id, m] as const;
    }));
    expect(byId.size).toBe(3);
    expect(byId.get(1)).toMatchObject({ result: { protocolVersion: '2025-11-25' } });
    expect(byId.get(2)).toMatchObject({ result: { tools: expect.arrayContaining([expect.objectContaining({ name: 'search_docs' })]) as unknown } });
    expect(byId.get(3)).toEqual({ jsonrpc: '2.0', id: 3, result: {} });
  });

  it('handles CRLF, blank lines, parse errors, and a final line without a newline', async () => {
    const input = `\r\n{bad\r\n${JSON.stringify({ jsonrpc: '2.0', id: 7, method: 'tools/list', params: { _meta: META } })}`;
    const { lines, code } = await run(input);
    expect(code).toBe(0);
    expect(lines.map((l) => JSON.parse(l) as Record<string, unknown>)).toEqual([
      { jsonrpc: '2.0', id: null, error: { code: -32700, message: 'Parse error: the line is not valid JSON.' } },
      expect.objectContaining({ id: 7 }),
    ]);
  });

  it('writes diagnostics to stderr only when ABSOLUTEUI_MCP_DEBUG=1, never to stdout', async () => {
    const { lines } = await run(line({ jsonrpc: '2.0', id: 1, method: 'nope', params: { _meta: META } }), { ABSOLUTEUI_MCP_DEBUG: '1' });
    expect(lines).toHaveLength(1);
    expect(JSON.parse(lines[0] ?? '')).toMatchObject({ error: { code: -32601 } });
  });
});
