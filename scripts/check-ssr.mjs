// docs/PLAN-HELPERS.md §1, §8: every built @absoluteui/helpers and @absoluteui/services
// entry point imports in Node (no DOM) without throwing, so SSR and workers are safe.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, readJson, fail } from './lib.mjs';

const errors = [];
let count = 0;
for (const name of ['helpers', 'services']) {
  const pkgDir = join(root, 'packages', name);
  const { exports } = readJson(join(pkgDir, 'package.json'));
  for (const [subpath, target] of Object.entries(exports)) {
    if (typeof target !== 'object') continue;
    const file = join(pkgDir, target.default);
    try {
      const mod = await import(pathToFileURL(file).href);
      if (Object.keys(mod).length === 0 && subpath !== '.') errors.push(`@absoluteui/${name}${subpath.slice(1)}: no exports`);
      count++;
    } catch (e) {
      errors.push(`@absoluteui/${name}${subpath.slice(1)}: import failed in Node: ${e instanceof Error ? e.message : String(e)}`);
    }
  }
}
if (errors.length) fail(errors);
console.log(`check:ssr: ok (${count} entry points)`);
