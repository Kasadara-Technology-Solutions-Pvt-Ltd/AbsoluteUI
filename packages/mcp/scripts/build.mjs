// Builds @absoluteui/mcp: one minified ESM bundle for Node (first-party code only, R15-4 and R15-15),
// license banner, private source map (never published, SPEC section 5.3). Usage: node packages/mcp/scripts/build.mjs [outDir]
import { build } from 'esbuild';
import { chmodSync, copyFileSync, mkdirSync, unlinkSync } from 'node:fs';
import { dirname, join, resolve, sep } from 'node:path';
import { banner, readJson, root } from '../../../scripts/lib.mjs';

const pkgDir = join(root, 'packages', 'mcp');
const pkg = readJson(join(pkgDir, 'package.json'));
const outDir = resolve(process.argv[2] ?? join(pkgDir, 'dist'));
const outFile = join(outDir, 'bin.js');

const result = await build({
  metafile: true,
  entryPoints: [join(pkgDir, 'src', 'bin.ts')],
  outfile: outFile,
  bundle: true,
  platform: 'node',
  format: 'esm',
  target: 'node22',
  minify: true,
  sourcemap: 'external',
  legalComments: 'inline',
  banner: { js: `#!/usr/bin/env node\n${banner(pkg.name, pkg.version)}` },
  logLevel: 'warning',
});
// R15-4: only first-party code may be bundled (the dashboard checker comes from @absoluteui/components).
const foreign = Object.keys(result.metafile.inputs).filter((input) => !/^packages\/(mcp|components|core|helpers|utilities|theme|icons)\//.test(input.split(sep).join('/')));
if (foreign.length) {
  console.error('mcp build: third-party or unexpected code in the bundle:');
  for (const input of foreign) console.error(`  ${input}`);
  process.exit(1);
}
chmodSync(outFile, 0o755);
const mapTarget = join(root, '.private-sourcemaps', 'mcp', 'bin.js.map');
mkdirSync(dirname(mapTarget), { recursive: true });
// Copy, then remove: the output may be on another drive (rename fails across devices).
copyFileSync(`${outFile}.map`, mapTarget);
unlinkSync(`${outFile}.map`);
if (outDir === join(pkgDir, 'dist')) {
  copyFileSync(join(root, 'LICENSE'), join(pkgDir, 'LICENSE'));
  copyFileSync(join(root, 'NOTICE'), join(pkgDir, 'NOTICE'));
  copyFileSync(join(root, 'SECURITY.md'), join(pkgDir, 'SECURITY.md'));
}
console.log(`mcp build: ok (${outFile})`);
