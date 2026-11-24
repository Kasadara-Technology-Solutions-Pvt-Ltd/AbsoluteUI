// docs/PLAN-R9-ANGULAR.md M8a item 3: the Angular examples (section 34 of
// packages/components/docs/<name>.md) compile with ngc and strict templates against the BUILT
// adapter (package exports, like an application). HTML-only snippets are counted, not compiled.
// Run after npm run build (part of check:angular).
import { execFileSync } from 'node:child_process';
import { mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { fail, root } from './lib.mjs';

const docsDir = join(root, 'packages', 'components', 'docs');
const outDir = join(root, '.cache', 'angular-doc-examples');
rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir, { recursive: true });

let compiled = 0;
let htmlOnly = 0;
const missing = [];
for (const file of readdirSync(docsDir).filter((f) => f.endsWith('.md')).sort()) {
  const name = file.replace(/\.md$/, '');
  const text = readFileSync(join(docsDir, file), 'utf8');
  const start = text.indexOf('\n## 34.');
  if (start < 0) continue;
  const end = text.indexOf('\n## 35.', start + 1);
  const section = text.slice(start, end < 0 ? undefined : end);
  const blocks = [...section.matchAll(/```(ts|html)\n([\s\S]*?)```/g)];
  const tsBlocks = blocks.filter((m) => m[1] === 'ts' && m[2].includes('@absoluteui/angular'));
  if (tsBlocks.length === 0) {
    if (blocks.length > 0) htmlOnly++;
    else if (!/Not (applicable|supported)/i.test(section)) missing.push(name);
    continue;
  }
  tsBlocks.forEach((m, i) => {
    writeFileSync(join(outDir, `${name}${tsBlocks.length > 1 ? `-${String(i + 1)}` : ''}.ts`), m[2]);
    compiled++;
  });
}

// The Angular guides of the documentation site (docs/PLAN-R10-DOCS.md R10-9): every complete
// TypeScript module (a fence that starts with an import) compiles the same way; fragments are counted.
const guidesDir = join(root, 'apps', 'site', 'angular', 'guides');
let guideModules = 0;
let guideFragments = 0;
for (const file of readdirSync(guidesDir).filter((f) => f.endsWith('.md')).sort()) {
  const text = readFileSync(join(guidesDir, file), 'utf8');
  [...text.matchAll(/```ts\n([\s\S]*?)```/g)].forEach((m, i) => {
    if (!m[1].startsWith('import ')) {
      guideFragments++;
      return;
    }
    writeFileSync(join(outDir, `guide-${file.replace(/\.md$/, '')}-${String(i + 1)}.ts`), m[1]);
    guideModules++;
  });
}

// Bootstrap snippets import the application's root component by its conventional path.
writeFileSync(
  join(outDir, 'app.component.ts'),
  ["import { Component } from '@angular/core';", '', "@Component({ selector: 'app-root', template: '' })", 'export class AppComponent {}', ''].join('\n'),
);

writeFileSync(
  join(outDir, 'tsconfig.json'),
  JSON.stringify(
    {
      extends: '../../tsconfig.base.json',
      compilerOptions: {
        module: 'ES2022',
        moduleResolution: 'bundler',
        experimentalDecorators: true,
        declaration: false,
        noEmit: false,
        outDir: './out',
        noUnusedLocals: false,
        types: [],
      },
      angularCompilerOptions: { strictTemplates: true, strictInjectionParameters: true, strictInputAccessModifiers: true },
      include: ['*.ts'],
    },
    null,
    2,
  ),
);

try {
  execFileSync(process.execPath, [join(root, 'node_modules', '@angular', 'compiler-cli', 'bundles', 'src', 'bin', 'ngc.js'), '-p', join(outDir, 'tsconfig.json')], { encoding: 'utf8', cwd: root });
} catch (e) {
  fail([`Angular doc examples (section 34) failed to compile:\n${String(e.stdout ?? '')}${String(e.stderr ?? e.message)}`]);
}
const notes = [missing.length ? `${String(missing.length)} without an Angular example: ${missing.join(', ')}` : '', htmlOnly ? `${String(htmlOnly)} with template snippets only` : ''].filter(Boolean);
console.log(`check:angular-examples: ok (${String(compiled)} examples and ${String(guideModules)} guide modules compiled with strict templates, ${String(guideFragments)} guide fragments${notes.length ? `; ${notes.join('; ')}` : ''})`);
