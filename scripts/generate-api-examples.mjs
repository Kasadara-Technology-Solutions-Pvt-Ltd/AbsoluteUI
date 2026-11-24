// docs/PLAN-API-EXAMPLES.md E3/E5: turns every @helpers/@services example that states a
// result (`// => <expression>`, `// => ≈ <number>`, or `// => throws <CODE>`) into a vitest
// case, plus one coverage case per module (every exported function and class has an example).
// Output: .cache/api-examples/<package>/<module>.test.ts (git-ignored), run by `npm run test`.
// `--only=helpers/date` regenerates one module and leaves the other files in place.
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join, relative } from 'node:path';
import { EXAMPLE_PACKAGES, modulesOf, extractModule, statementsOf, parseResult, identifiersOf, importedNames, syntaxErrors, howToPages, tsFences, root, ts } from './api-examples.mjs';
import { fail } from './lib.mjs';

const outDir = join(root, '.cache', 'api-examples');
const only = process.argv.find((a) => a.startsWith('--only='))?.slice(7);

const PRELUDE = `import { expect, it } from 'vitest';
import { formatPlainDate as __fd, formatPlainTime as __ft, formatPlainDateTime as __fdt } from '@absoluteui/helpers/date';
import { Decimal as __Decimal } from '@absoluteui/helpers/decimal';

// Dates, times, and decimals compare through their canonical strings (PLAN-API-EXAMPLES D1).
const __n = (v: unknown): unknown => {
  if (Array.isArray(v)) return v.map(__n);
  if (v instanceof __Decimal) return v.toString();
  if (v !== null && typeof v === 'object') {
    const kind = (v as { kind?: unknown }).kind;
    if (kind === 'PlainDate') return __fd(v as Parameters<typeof __fd>[0]);
    if (kind === 'PlainTime') return __ft(v as Parameters<typeof __ft>[0]);
    if (kind === 'PlainDateTime') return __fdt(v as Parameters<typeof __fdt>[0]);
    const proto = Object.getPrototypeOf(v);
    if (proto === Object.prototype || proto === null) return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, __n(x)]));
  }
  return v;
};
const __check = (actual: unknown, expected: unknown): void => { expect(__n(actual)).toEqual(__n(expected)); };
const __approx = (actual: unknown, expected: number, digits: number): void => {
  expect(typeof actual, 'the result should be a number').toBe('number');
  expect(Math.abs((actual as number) - expected)).toBeLessThanOrEqual(0.5 * 10 ** -digits);
};
const __throws = async (fn: () => unknown, code: string): Promise<void> => {
  let error: unknown;
  try { await fn(); } catch (e) { error = e; }
  expect(error, 'the example should throw ' + code).toBeDefined();
  const { code: c, name } = error as { code?: unknown; name?: unknown };
  expect([c, name]).toContain(code);
};
`;

/** The example rewritten so each stated result is asserted; null when it states none. */
function assertedBody(code, where, errors) {
  const statements = statementsOf(code);
  let body = code;
  let asserted = 0;
  for (const s of [...statements].reverse()) {
    const result = s.comment ? parseResult(s.comment.text) : null;
    if (!result) continue;
    const text = code.slice(s.start, s.end);
    let replacement;
    const target = ts.isExpressionStatement(s.node) ? s.node.expression.getText() : ts.isVariableStatement(s.node) && s.node.declarationList.declarations.length === 1 && ts.isIdentifier(s.node.declarationList.declarations[0].name) ? s.node.declarationList.declarations[0].name.text : null;
    if (result.kind === 'approx' && target !== null) {
      replacement = ts.isExpressionStatement(s.node) ? `__approx(${target}, ${result.value}, ${result.digits});` : `${text} __approx(${target}, ${result.value}, ${result.digits});`;
    } else if (result.kind === 'throws') {
      replacement = `await __throws(async () => { ${text} }, ${JSON.stringify(result.code)});`;
    } else if (ts.isExpressionStatement(s.node)) {
      replacement = `__check(${s.node.expression.getText()}, (${result.expr}));`;
    } else if (ts.isVariableStatement(s.node) && s.node.declarationList.declarations.length === 1 && ts.isIdentifier(s.node.declarationList.declarations[0].name)) {
      replacement = `${text} __check(${s.node.declarationList.declarations[0].name.text}, (${result.expr}));`;
    } else {
      errors.push(`${where}: a result can follow only an expression or a single declaration: ${text.split('\n')[0]}`);
      continue;
    }
    asserted++;
    body = body.slice(0, s.start) + replacement + body.slice(s.comment.end);
  }
  return asserted ? body : null;
}

if (!only) rmSync(outDir, { recursive: true, force: true });
const errors = [];
let cases = 0;
let modules = 0;
for (const pkg of EXAMPLE_PACKAGES) {
  for (const mod of modulesOf(pkg)) {
    if (only && only !== `${pkg}/${mod}`) continue;
    const specifier = `@absoluteui/${pkg}/${mod}`;
    const { names, items } = extractModule(join(root, 'packages', pkg, 'src', mod, 'index.ts'));
    const imports = new Set();
    const values = new Set();
    const types = new Set();
    const explicit = new Set();
    const tests = [];
    for (const item of items) {
      item.examples.forEach((example, i) => {
        const where = `${specifier} ${item.name} example ${i + 1}`;
        const syntax = syntaxErrors(example);
        if (syntax.length) return errors.push(`${where}: ${syntax[0]}`);
        // Explicit imports in the example move to the top of the file (D4).
        let code = example;
        const own = [];
        for (const s of [...statementsOf(example)].reverse()) {
          if (!ts.isImportDeclaration(s.node)) continue;
          own.push(example.slice(s.start, s.end).trim());
          code = code.slice(0, s.start) + code.slice(s.end);
        }
        const body = assertedBody(code, where, errors);
        if (body === null) return;
        for (const line of own) imports.add(line);
        for (const name of importedNames(example)) explicit.add(name);
        for (const id of identifiersOf(code)) {
          const n = names.get(id);
          if (n?.value) values.add(id);
          else if (n?.type) types.add(id);
        }
        tests.push(`it(${JSON.stringify(`${item.name} example ${i + 1}`)}, async () => {\n${body}\n});`);
      });
    }
    const missing = items.filter((i) => (i.kind === 'function' || i.kind === 'class') && i.examples.length === 0).map((i) => i.name);
    tests.push(`it('every exported function and class has an example', () => {\n  expect(${JSON.stringify(missing)}).toEqual([]);\n});`);
    const head = [PRELUDE];
    for (const name of explicit) {
      values.delete(name);
      types.delete(name);
    }
    if (values.size) head.push(`import { ${[...values].sort().join(', ')} } from '${specifier}';`);
    if (types.size) head.push(`import type { ${[...types].sort().join(', ')} } from '${specifier}';`);
    head.push(...imports);
    const file = join(outDir, pkg, `${mod}.test.ts`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${head.join('\n')}\n\n${tests.join('\n\n')}\n`);
    cases += tests.length - 1;
    modules++;
  }
}
// "How to use" snippets (docs/PLAN-R7.md D3): standalone modules with their own imports; each
// snippet that states a result becomes one test file. `--only=how-to` or `--only=how-to/<slug>`.
let howTo = 0;
for (const page of howToPages()) {
  if (only && only !== 'how-to' && only !== `how-to/${page.slug}`) continue;
  if (!existsSync(page.file)) continue;
  tsFences(readFileSync(page.file, 'utf8')).forEach((fence, i) => {
    const where = `${relative(root, page.file)} snippet ${i + 1}`;
    const syntax = syntaxErrors(fence);
    if (syntax.length) return errors.push(`${where}: ${syntax[0]}`);
    let code = fence;
    const own = [];
    for (const s of [...statementsOf(fence)].reverse()) {
      if (!ts.isImportDeclaration(s.node)) continue;
      own.push(fence.slice(s.start, s.end).trim());
      code = code.slice(0, s.start) + code.slice(s.end);
    }
    const body = assertedBody(code, where, errors);
    if (body === null) return;
    const file = join(outDir, 'how-to', `${page.slug.replace(/\//g, '-')}-${String(i + 1)}.test.ts`);
    mkdirSync(dirname(file), { recursive: true });
    writeFileSync(file, `${[PRELUDE, ...own].join('\n')}\n\nit(${JSON.stringify(`${page.slug} how-to snippet ${String(i + 1)}`)}, async () => {\n${body}\n});\n`);
    howTo++;
  });
}

if (errors.length) fail(errors);
console.log(`generate-api-examples: ${cases} asserted examples in ${modules} modules, ${howTo} asserted how-to snippets`);
