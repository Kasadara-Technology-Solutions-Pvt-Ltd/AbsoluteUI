/**
 * absoluteui-mcp: the local, read-only AbsoluteUI MCP server over stdio (docs/PLAN-R15-MCP.md).
 * Reads only its own dist/content.json; no network, no project files.
 */
import { stdin, stdout } from 'node:process';
import { serveStdio } from './stdio.js';
import { loadContent } from './content/index.js';
import { createAbsoluteUIServer } from './app.js';

const content = loadContent(new URL('./content.json', import.meta.url));
await serveStdio(createAbsoluteUIServer(content), { input: stdin, output: stdout });
