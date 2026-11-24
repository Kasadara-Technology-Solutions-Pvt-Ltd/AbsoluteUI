// docs/PLAN-R9-ANGULAR.md M8b item 9 (D28): public API snapshot of @absoluteui/angular, one file per
// entry point (packages/angular/api/<entry>.api.json): every export's declaration as printed from the
// built .d.ts without comments (classes include Angular's ɵcmp/ɵdir declarations, so selectors,
// inputs, outputs, and models are covered), plus re-exported names. Documentation changes do not
// affect it. Default: check (part of check:angular) - any difference fails, naming what was added,
// removed, or changed. `--update` (npm run api:angular) records an intended change.
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { fail, readJson, root } from './lib.mjs';

const update = process.argv.includes('--update');
const pkgDir = join(root, 'packages', 'angular');
const outDir = join(pkgDir, 'api');
const pkg = readJson(join(pkgDir, 'package.json'));
if (!existsSync(join(pkgDir, 'dist', 'index.d.ts'))) fail(['packages/angular/dist is missing; run npm run build first']);

const entries = Object.entries(pkg.exports)
  .filter(([, target]) => typeof target === 'object' && typeof target.types === 'string')
  .map(([subpath, target]) => ({ entry: subpath === '.' ? 'index' : subpath.slice(2), file: join(pkgDir, target.types) }));

const program = ts.createProgram(
  entries.map((e) => e.file),
  { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, strict: true, skipLibCheck: true, noEmit: true, types: [] },
);
const checker = program.getTypeChecker();
const printer = ts.createPrinter({ removeComments: true, newLine: ts.NewLineKind.LineFeed });

function snapshot({ entry, file }) {
  const source = program.getSourceFile(file);
  const moduleSymbol = source && checker.getSymbolAtLocation(source);
  if (!moduleSymbol) fail([`${entry}: declarations not found`]);
  const ownDir = file.replaceAll('\\', '/').replace(/\/index\.d\.ts$/, '/');
  const declarations = {};
  const reexports = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decls = target.declarations ?? [];
    const declFile = decls[0]?.getSourceFile().fileName.replaceAll('\\', '/') ?? '';
    const local = entry === 'index' ? declFile.includes('/packages/angular/dist/') && !declFile.includes('/dist/internal/') : declFile.startsWith(ownDir);
    if (!local) {
      reexports.push(exported.name);
      continue;
    }
    declarations[exported.name] = decls
      .map((d) => printer.printNode(ts.EmitHint.Unspecified, ts.isVariableDeclaration(d) ? d.parent.parent : d, d.getSourceFile()).replace(/\r\n/g, '\n'))
      .join('\n');
  }
  const sorted = Object.fromEntries(Object.keys(declarations).sort().map((k) => [k, declarations[k]]));
  return { entry: entry === 'index' ? pkg.name : `${pkg.name}/${entry}`, declarations: sorted, reexports: reexports.sort() };
}

const current = new Map(entries.map((e) => [`${e.entry}.api.json`, snapshot(e)]));
const text = (value) => `${JSON.stringify(value, null, 2)}\n`;

if (update) {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) if (name.endsWith('.api.json') && !current.has(name)) rmSync(join(outDir, name));
  for (const [name, value] of current) writeFileSync(join(outDir, name), text(value));
  console.log(`angular-api-snapshot: recorded ${String(current.size)} entry points`);
} else {
  const errors = [];
  const recorded = existsSync(outDir) ? readdirSync(outDir).filter((n) => n.endsWith('.api.json')) : [];
  for (const name of recorded) if (!current.has(name)) errors.push(`entry point removed: ${name.replace('.api.json', '')}`);
  for (const [name, value] of current) {
    const path = join(outDir, name);
    if (!existsSync(path)) {
      errors.push(`entry point added: ${value.entry}`);
      continue;
    }
    if (readFileSync(path, 'utf8') === text(value)) continue;
    const before = JSON.parse(readFileSync(path, 'utf8'));
    for (const key of Object.keys(before.declarations)) if (!(key in value.declarations)) errors.push(`${value.entry}: removed ${key} (breaking)`);
    for (const key of Object.keys(value.declarations)) {
      if (!(key in before.declarations)) errors.push(`${value.entry}: added ${key}`);
      else if (before.declarations[key] !== value.declarations[key]) errors.push(`${value.entry}: changed ${key} (review: additive or breaking?)`);
    }
    if (JSON.stringify(before.reexports) !== JSON.stringify(value.reexports)) errors.push(`${value.entry}: re-exports changed`);
  }
  if (errors.length) fail([...errors, 'The public API of @absoluteui/angular changed (docs/decisions/r9-angular-freeze.md). If intended, run npm run api:angular and commit the snapshot.']);
  console.log(`check:angular-api: ok (${String(current.size)} entry points match the recorded API)`);
}
