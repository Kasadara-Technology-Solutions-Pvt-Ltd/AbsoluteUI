/**
 * stdio transport (MCP 2025-11-25 and 2026-07-28): newline-delimited JSON-RPC on stdin and stdout,
 * nothing else on stdout, exit on stdin EOF. Requests are handled concurrently; responses are written
 * as they complete.
 */
import { errorMessage, ErrorCode, parseMessage, type OutgoingMessage } from './protocol/jsonrpc.js';
import type { Server } from './server.js';
import { debug } from './log.js';

/** Longest accepted line (characters); a longer line is discarded and answered with a parse error. */
export const MAX_LINE_CHARS = 1_048_576;

export interface StdioStreams {
  readonly input: NodeJS.ReadableStream;
  readonly output: NodeJS.WritableStream;
}

/** Serves until the input ends and every pending request has been answered. */
export function serveStdio(server: Server, streams: StdioStreams): Promise<void> {
  const { input, output } = streams;
  const pending = new Set<Promise<void>>();
  let buffer = '';
  let discarding = false;
  let closed = false;

  const write = (message: OutgoingMessage): void => {
    if (closed) return;
    // JSON.stringify escapes line breaks inside strings, so one message is always one line.
    output.write(`${JSON.stringify(message)}\n`);
  };

  const handleLine = (raw: string): void => {
    const line = raw.endsWith('\r') ? raw.slice(0, -1) : raw;
    if (line.trim() === '') return;
    const task = server
      .handle(parseMessage(line))
      .then((response) => {
        if (response) write(response);
      })
      .catch((error: unknown) => { debug(`unexpected: ${error instanceof Error ? error.message : String(error)}`); });
    pending.add(task);
    void task.finally(() => pending.delete(task));
  };

  return new Promise<void>((resolve) => {
    output.on('error', () => {
      // The client went away (EPIPE): stop writing and finish.
      closed = true;
      resolve();
    });
    input.setEncoding('utf8');
    input.on('data', (chunk: string | Buffer) => {
      buffer += typeof chunk === 'string' ? chunk : chunk.toString('utf8');
      let newline = buffer.indexOf('\n');
      while (newline !== -1) {
        const line = buffer.slice(0, newline);
        buffer = buffer.slice(newline + 1);
        if (discarding) discarding = false;
        else handleLine(line);
        newline = buffer.indexOf('\n');
      }
      if (buffer.length > MAX_LINE_CHARS) {
        buffer = '';
        if (!discarding) write(errorMessage(null, { code: ErrorCode.ParseError, message: `Parse error: a message exceeds ${MAX_LINE_CHARS} characters.` }));
        discarding = true;
      }
    });
    input.on('end', () => {
      if (!discarding && buffer.length > 0) handleLine(buffer);
      buffer = '';
      void Promise.allSettled([...pending]).then(() => { resolve(); });
    });
  });
}
