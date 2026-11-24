// Shared helpers for AbsoluteUI dev-time scripts. Never shipped.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';

export const root = fileURLToPath(new URL('..', import.meta.url));
/** Workspace packages in dependency order; the public source snapshot (scripts/export-public.mjs) has no React or Vue adapter. */
export const packageNames = ['helpers', 'services', 'core', 'utilities', 'theme', 'icons', 'components', 'angular', 'react', 'vue', 'mcp'].filter((n) => existsSync(join(root, 'packages', n, 'package.json')));
/** Framework adapters and the only third-party peer dependencies each may declare (SPEC section 22). */
export const adapterPeers = { angular: /^@angular\//, react: /^react(-dom)?$/, vue: /^vue$/ };
/** Packages compiled file by file by esbuild; the Angular adapter is compiled by ngc (partial), and the MCP server is bundled by its own script (packages/mcp/scripts/build.mjs). */
export const esbuildPackageNames = packageNames.filter((n) => n !== 'angular' && n !== 'mcp');

export function readJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function walk(dir, filter = () => true) {
  const out = [];
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) out.push(...walk(full, filter));
    else if (filter(full)) out.push(full);
  }
  return out;
}

export function toPosix(path) {
  return path.split(sep).join('/');
}

export function rel(path) {
  return toPosix(relative(root, path));
}

export function banner(pkgName, version) {
  const cfg = readJson(join(root, 'release.config.json'));
  return `/*! AbsoluteUI ${pkgName} v${version} | (c) ${cfg.licensor} | ${cfg.licenseName} | ${cfg.licenseUrl} */`;
}

export const BANNER_PREFIX = '/*! AbsoluteUI ';

export function fail(messages) {
  for (const m of messages) console.error(`  x ${m}`);
  process.exit(1);
}
