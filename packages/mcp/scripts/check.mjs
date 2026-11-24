// check:mcp (docs/PLAN-R15-MCP.md section 7): the built server's content is fresh, its contract
// (tools, schemas, annotations, resources, prompts) matches packages/mcp/contract.json, it stays within
// the size and startup budgets, and it declares no dependencies. Requires npm run build and npm run mcp:build.
// `--update` rewrites contract.json after an intended contract change. `--skip-fresh` skips the 40 s rebuild.
import { spawn, execFileSync } from 'node:child_process';
import { performance } from 'node:perf_hooks';
import { existsSync, mkdtempSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root } from '../../../scripts/lib.mjs';
import { componentNames } from '../../../apps/site/scripts/lib/shared.mjs';

const pkgDir = join(root, 'packages', 'mcp');
const dist = join(pkgDir, 'dist');
const contractFile = join(pkgDir, 'contract.json');
const update = process.argv.includes('--update');
const errors = [];
const SIZE_BUDGET = 6 * 1024 * 1024;
const STARTUP_BUDGET_MS = 300;

for (const f of ['bin.js', 'content.json']) if (!existsSync(join(dist, f))) {
  console.error(`check:mcp: ${f} is missing; run npm run build, then npm run mcp:build.`);
  process.exit(1);
}

// Zero dependencies (R15-4).
const pkg = JSON.parse(readFileSync(join(pkgDir, 'package.json'), 'utf8'));
for (const key of ['dependencies', 'peerDependencies', 'optionalDependencies']) if (pkg[key] && Object.keys(pkg[key]).length) errors.push(`package.json declares ${key}`);
if (pkg.scripts && Object.keys(pkg.scripts).some((s) => /install/.test(s))) errors.push('package.json has install scripts');

// Size budget.
const bytes = ['bin.js', 'content.json'].reduce((n, f) => n + statSync(join(dist, f)).size, 0);
if (bytes > SIZE_BUDGET) errors.push(`dist is ${(bytes / 1048576).toFixed(2)} MB, over the ${SIZE_BUDGET / 1048576} MB budget`);

// Content coverage and the dashboard schema.
const content = JSON.parse(readFileSync(join(dist, 'content.json'), 'utf8'));
const expected = componentNames().filter((n) => !content.excluded.includes(n));
const actual = content.components.map((c) => c.name);
for (const n of expected) if (!actual.includes(n)) errors.push(`content lacks component ${n}`);
for (const n of content.excluded) if (actual.includes(n)) errors.push(`content includes removed or on-hold component ${n}`);
if (content.version !== pkg.version) errors.push(`content version ${content.version} differs from the package version ${pkg.version}`);
const { definitionSchema } = await import(pathToFileURL(join(root, 'packages', 'components', 'dist', 'dashboard', 'schema', 'index.js')).href);
if (JSON.stringify(definitionSchema()) !== JSON.stringify(content.schemas.dashboard)) errors.push('content dashboard schema differs from definitionSchema()');

// Freshness: rebuild into a temporary file and compare.
if (!process.argv.includes('--skip-fresh')) {
  const tmp = mkdtempSync(join(tmpdir(), 'aui-mcp-check-'));
  try {
    execFileSync(process.execPath, [join(pkgDir, 'scripts', 'build-content.mjs'), join(tmp, 'content.json')], { stdio: 'pipe' });
    if (readFileSync(join(tmp, 'content.json'), 'utf8') !== readFileSync(join(dist, 'content.json'), 'utf8')) errors.push('dist/content.json is stale: run npm run mcp:content');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
}

// The contract, read from the real server over stdio, and the startup budget.
const META = { 'io.modelcontextprotocol/protocolVersion': '2026-07-28', 'io.modelcontextprotocol/clientCapabilities': {} };
const requests = [
  ['server/discover', {}],
  ['tools/list', {}],
  ['resources/templates/list', {}],
  ['resources/list', {}],
  ['prompts/list', {}],
];
/** Spawns the server, sends the requests, and resolves with the answers and the time to the first one. */
const run = (args, input) =>
  new Promise((resolve, reject) => {
    const started = performance.now();
    const child = spawn(process.execPath, args, { stdio: ['pipe', 'pipe', 'pipe'] });
    let out = '';
    let firstAt = 0;
    child.stdout.setEncoding('utf8').on('data', (d) => {
      if (!firstAt) firstAt = performance.now();
      out += d;
    });
    child.on('error', reject);
    child.on('close', () => resolve({ out, firstMs: firstAt - started }));
    child.stdin.end(input);
  });
const median = (values) => [...values].sort((a, b) => a - b)[Math.floor(values.length / 2)];
const input = requests.map(([method, params], i) => JSON.stringify({ jsonrpc: '2.0', id: i + 1, method, params: { ...params, _meta: META } })).join('\n') + '\n';
// Startup budget: median of five runs of the server and of a bare Node process.
const runs = [];
const bare = [];
for (let i = 0; i < 5; i++) {
  runs.push(await run([join(dist, 'bin.js')], input));
  bare.push((await run(['-e', 'process.stdout.write("x")'], '')).firstMs);
}
const startupMs = median(runs.map((r) => r.firstMs));
const nodeMs = median(bare);
// The budget is the server's own start (loading and indexing its content), not the machine's process start.
if (startupMs - nodeMs > STARTUP_BUDGET_MS) errors.push(`the server takes ${Math.round(startupMs - nodeMs)} ms to its first answer beyond the Node start (median of 5: ${Math.round(startupMs)} ms against ${Math.round(nodeMs)} ms), over the ${STARTUP_BUDGET_MS} ms budget`);
const answers = { lines: runs[0].out.trim().split('\n').map((l) => JSON.parse(l)) };
const byId = new Map(answers.lines.map((m) => [m.id, m]));
for (const [i, [method]] of requests.entries()) if (!byId.get(i + 1)?.result) errors.push(`${method} failed: ${JSON.stringify(byId.get(i + 1)?.error)}`);

const contract = {
  tools: byId.get(2).result.tools.map((t) => ({ name: t.name, title: t.title, annotations: t.annotations, inputSchema: t.inputSchema, outputSchema: t.outputSchema })),
  resourceTemplates: byId.get(3).result.resourceTemplates.map((t) => ({ uriTemplate: t.uriTemplate, name: t.name, mimeType: t.mimeType })),
  fixedResources: byId.get(4).result.resources.filter((r) => !/^absoluteui:\/\/(component|guide)\//.test(r.uri)).map((r) => ({ uri: r.uri, mimeType: r.mimeType })),
  prompts: byId.get(5).result.prompts.map((p) => ({ name: p.name, arguments: p.arguments.map((a) => ({ name: a.name, required: a.required })) })),
};
// Descriptions may change freely; names, schemas, annotations, URIs, and prompt arguments are the semver contract.
const text = `${JSON.stringify(contract, null, 2)}\n`;
if (update) writeFileSync(contractFile, text);
else if (!existsSync(contractFile)) errors.push('contract.json is missing: run node packages/mcp/scripts/check.mjs --update');
else if (readFileSync(contractFile, 'utf8').replace(/\r\n/g, '\n') !== text) errors.push('the tool/resource/prompt contract changed: review it, then run node packages/mcp/scripts/check.mjs --update');

if (errors.length) {
  console.error(`check:mcp: ${errors.length} problem(s):\n  ${errors.join('\n  ')}`);
  process.exit(1);
}
console.log(`check:mcp: ok (${contract.tools.length} tools, ${contract.resourceTemplates.length} resource templates, ${contract.prompts.length} prompts; ${(bytes / 1048576).toFixed(2)} MB; first answer ${Math.round(startupMs)} ms, bare Node ${Math.round(nodeMs)} ms)`);
