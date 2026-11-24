// SPEC section 22 adapter gate: the shipped (partially compiled, minified) Angular
// adapter must link with the Angular linker exactly as a consumer's build does,
// and every subpath export must resolve to shipped files.
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { transformAsync } from '@babel/core';
// The stock Babel plugin, configured exactly as consumer builds use it.
import linker from '@angular/compiler-cli/linker/babel';
import { root, readJson, walk, rel, fail } from './lib.mjs';

const pkgDir = join(root, 'packages', 'angular');
const pkg = readJson(join(pkgDir, 'package.json'));
const errors = [];
let linked = 0;

for (const file of walk(join(pkgDir, 'dist'), (f) => f.endsWith('.js'))) {
  const code = readFileSync(file, 'utf8');
  if (!code.includes('ngDeclare')) continue;
  // Consumer builds (@angular/build) decide whether to link a file by this literal prefix; an
  // escaped prefix ships unlinked partial declarations that fail at run time ("JIT compiler unavailable").
  if (!code.includes('\u0275\u0275ngDeclare')) errors.push(`${rel(file)}: partial declarations are escaped; consumer builds would not link them`);
  try {
    const result = await transformAsync(code, {
      filename: file,
      babelrc: false,
      configFile: false,
      compact: true,
      // A fresh options object per file: Babel caches plugin instances, and a linker error
      // must not leak state into the next file.
      plugins: [[linker, {}]],
    });
    if (!result?.code || result.code.includes('ngDeclare') || !/ɵɵdefine(Directive|Component|Injectable)/.test(result.code)) errors.push(`${rel(file)}: partial declarations were not linked`);
    else linked++;
  } catch (e) {
    errors.push(`${rel(file)}: linker failed: ${e instanceof Error ? e.message : String(e)}`);
  }
}
if (linked === 0) errors.push('no partially compiled declarations found; run npm run build first');

for (const [subpath, target] of Object.entries(pkg.exports)) {
  const files = typeof target === 'string' ? [target] : Object.values(target);
  for (const f of files) if (!existsSync(join(pkgDir, f))) errors.push(`${pkg.name}${subpath.slice(1)}: missing ${f}`);
}

if (errors.length) fail(errors);
console.log(`check:angular: ok (${linked} files linked, ${Object.keys(pkg.exports).length} exports)`);
