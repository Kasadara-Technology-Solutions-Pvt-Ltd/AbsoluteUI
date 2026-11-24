// Writes llms.txt and llms-full.txt (R15-11, R15-17) from the MCP content snapshot, with the same
// renderer the server uses for absoluteui://llms.txt, so the website and the server publish the same
// text. Usage: node packages/mcp/scripts/build-llms.mjs <outDir>
import { build } from 'esbuild';
import { Buffer } from 'node:buffer';
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { root } from '../../../scripts/lib.mjs';

const outDir = process.argv[2];
if (!outDir) {
  console.error('build-llms: pass the output directory.');
  process.exit(1);
}
const contentFile = join(root, 'packages', 'mcp', 'dist', 'content.json');
if (!existsSync(contentFile)) {
  console.error('build-llms: packages/mcp/dist/content.json is missing; run npm run build.');
  process.exit(1);
}
const bundled = await build({ entryPoints: [join(root, 'packages', 'mcp', 'src', 'content', 'markdown.ts')], bundle: true, platform: 'node', format: 'esm', write: false, logLevel: 'warning' });
const { llmsIndex, llmsFull } = await import(`data:text/javascript;base64,${Buffer.from(bundled.outputFiles[0].text).toString('base64')}`);
const content = JSON.parse(readFileSync(contentFile, 'utf8'));
mkdirSync(resolve(outDir), { recursive: true });
const index = llmsIndex(content);
const full = llmsFull(content);
writeFileSync(join(resolve(outDir), 'llms.txt'), index);
writeFileSync(join(resolve(outDir), 'llms-full.txt'), full);
console.log(`build-llms: llms.txt ${(index.length / 1024).toFixed(1)} KB, llms-full.txt ${(full.length / 1048576).toFixed(2)} MB`);
