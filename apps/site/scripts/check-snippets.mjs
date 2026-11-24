// Type-checks every TypeScript snippet in the hand-written documentation pages
// against the published package types (dist .d.ts through package "exports"),
// under the repository's strict compiler settings. Generated pages reuse examples
// that check:metadata already type-checks. Every @example of the helpers and services
// modules, which the API pages render, is type-checked the same way (PLAN-API-EXAMPLES E4).
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { howToPages, tsFences, typecheckSources } from '../../../scripts/api-examples.mjs';
import { cacheDir, clean, root, siteDir, write } from './lib/shared.mjs';

const authored = join(siteDir, 'src', 'content', 'docs');
// Angular pages are generated; the complete modules of their guides are compiled by scripts/check-angular-examples.mjs.
const GENERATED = new Set(['components', 'api', 'quality', 'angular']);
const outDir = join(cacheDir, 'snippets');

function pages(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) {
      if (dir !== authored || !GENERATED.has(name)) pages(file, out);
    } else if (/\.mdx?$/.test(name)) out.push(file);
  }
  return out;
}

clean(outDir);
let count = 0;
for (const file of pages(authored)) {
  const md = readFileSync(file, 'utf8');
  const slug = relative(authored, file).split(sep).join('-').replace(/\.mdx?$/, '');
  let n = 0;
  for (const m of md.matchAll(/^```ts\r?\n([\s\S]*?)^```/gm)) {
    n++;
    count++;
    write(join(outDir, `${slug}-${n}.ts`), `${m[1]}\nexport {};\n`);
  }
}
const examples = typecheckSources((pkg, mod) => join(root, 'packages', pkg, 'dist', mod, 'index.d.ts'));
for (const { name, code } of examples) write(join(outDir, `api-${name}.ts`), code);
// "How to use" sections (docs/PLAN-R7.md D3): standalone snippets with their own imports.
let howTo = 0;
for (const page of howToPages()) {
  if (!existsSync(page.file)) continue;
  tsFences(readFileSync(page.file, 'utf8')).forEach((code, i) => {
    howTo++;
    write(join(outDir, `how-to-${page.slug.replace(/\//g, '-')}-${String(i + 1)}.ts`), `// ${relative(root, page.file)} snippet ${String(i + 1)}\n${code}\nexport {};\n`);
  });
}
// Stylesheet and `?raw` imports resolve through the bundler, as Vite's or webpack's client types declare them.
write(join(outDir, 'css.d.ts'), "declare module '*.css';\ndeclare module '*.svg?raw' {\n  const text: string;\n  export default text;\n}\n");
write(join(outDir, 'tsconfig.json'), JSON.stringify({ extends: '../../../tsconfig.base.json', compilerOptions: { noEmit: true, declaration: false }, include: ['*.ts'] }, null, 2));
try {
  execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(outDir, 'tsconfig.json')], { encoding: 'utf8', cwd: root });
} catch (e) {
  console.error(`check-snippets: documentation snippets failed to type-check (files in ${relative(root, outDir)}):\n${e.stdout ?? e.message}`);
  process.exit(1);
}
console.log(`check-snippets: ok (${count} snippets, ${examples.length} API examples, ${howTo} how-to snippets)`);
