// @example extraction for the helpers and services modules (PLAN-API-EXAMPLES).
// Shared by scripts/generate-api-examples.mjs (runtime assertions under vitest)
// and apps/site/scripts/check-snippets.mjs (type check against the published .d.ts).
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';

export const root = join(import.meta.dirname, '..');
export const EXAMPLE_PACKAGES = ['helpers', 'services'];

/**
 * Every API page that needs a hand-written "How to use" section (docs/PLAN-R7.md D1, D2), with
 * the Markdown file that holds it. `slug` is the page path under `/docs/api/`.
 * @returns {Array<{ slug: string, file: string }>}
 */
export function howToPages() {
  const pages = [
    { slug: 'core', file: 'packages/core/docs/how-to.md' },
    { slug: 'utilities', file: 'packages/utilities/docs/how-to.md' },
    { slug: 'theme', file: 'packages/theme/docs/how-to.md' },
    { slug: 'theme-designer', file: 'packages/theme/docs/designer-how-to.md' },
    { slug: 'icons', file: 'packages/icons/docs/how-to.md' },
  ];
  for (const pkg of EXAMPLE_PACKAGES) for (const mod of modulesOf(pkg)) pages.push({ slug: `${pkg}/${mod}`, file: `packages/${pkg}/docs/${mod}.md` });
  return pages.map((p) => ({ ...p, file: join(root, p.file) }));
}

/** The `ts` code fences of a Markdown document. */
export function tsFences(markdown) {
  return [...markdown.replace(/\r\n/g, '\n').matchAll(/^```ts\n([\s\S]*?)^```/gm)].map((m) => m[1]);
}

/** Module subpaths of a package, from its "exports" map (the root entry excluded). */
export function modulesOf(pkg) {
  const json = JSON.parse(readFileSync(join(root, 'packages', pkg, 'package.json'), 'utf8'));
  return Object.keys(json.exports).filter((k) => k !== '.' && k !== './package.json').map((k) => k.slice(2));
}

const isInternal = (symbol) => symbol.getJsDocTags().some((t) => t.name === 'internal');

const isHidden = (m) =>
  Boolean(ts.getCombinedModifierFlags(m) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) ||
  (m.name !== undefined && ts.isPrivateIdentifier(m.name)) ||
  ts.getJSDocTags(m).some((t) => t.tagName.text === 'internal');

/** Examples on the public members of a class or interface, keyed `Owner.member`. */
function memberItems(owner, decl) {
  if (!ts.isClassDeclaration(decl) && !ts.isInterfaceDeclaration(decl)) return [];
  const out = [];
  for (const m of decl.members) {
    if (isHidden(m) || !m.name) continue;
    const examples = ts.getJSDocTags(m).filter((t) => t.tagName.text === 'example').map((t) => normalizeExample(ts.getTextOfJSDocComment(t.comment) ?? '')).filter(Boolean);
    if (examples.length) out.push({ name: `${owner}.${m.name.getText()}`, kind: 'member', examples: [...new Set(examples)], file: decl.getSourceFile().fileName });
  }
  return out;
}

/**
 * Public exports of one module entry, with their examples. Class and interface
 * members that carry examples are listed after their owner with kind 'member'.
 * @param {string} entry Absolute path of the entry file (src index.ts or dist index.d.ts).
 * @returns {{ names: Map<string, { value: boolean, type: boolean }>, items: Array<{ name: string, kind: 'function' | 'class' | 'constant' | 'type' | 'member', examples: string[], file: string }> }}
 */
export function extractModule(entry) {
  const program = ts.createProgram([entry], { noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry));
  const names = new Map();
  const items = [];
  if (!moduleSymbol) return { names, items };
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (isInternal(exported) || isInternal(symbol)) continue;
    const decl = symbol.declarations?.[0];
    if (!decl) continue;
    names.set(exported.name, { value: Boolean(symbol.flags & ts.SymbolFlags.Value), type: Boolean(symbol.flags & ts.SymbolFlags.Type) });
    const kind = ts.isFunctionDeclaration(decl) ? 'function' : ts.isClassDeclaration(decl) ? 'class' : ts.isVariableDeclaration(decl) ? 'constant' : 'type';
    // Overloads repeat their JSDoc; keep each example once.
    const examples = [...new Set(symbol.getJsDocTags().filter((t) => t.name === 'example').map((t) => normalizeExample(ts.displayPartsToString(t.text))))].filter(Boolean);
    items.push({ name: exported.name, kind, examples, file: decl.getSourceFile().fileName });
    items.push(...memberItems(exported.name, decl));
  }
  return { names, items };
}

/** Example source with the common indentation removed. */
export function normalizeExample(raw) {
  const text = raw.replace(/\r\n/g, '\n').replace(/^\n+|\s+$/g, '');
  if (!text) return '';
  const lines = text.split('\n');
  const indent = Math.min(...lines.filter((l) => l.trim()).map((l) => l.match(/^ */)[0].length));
  return lines.map((l) => l.slice(indent)).join('\n');
}

/** Syntax errors of a TypeScript snippet, as messages. */
export function syntaxErrors(code) {
  const out = ts.transpileModule(code, { reportDiagnostics: true, compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.ESNext } });
  return (out.diagnostics ?? []).map((d) => ts.flattenDiagnosticMessageText(d.messageText, '\n'));
}

/**
 * Top-level statements of an example and the single-line comment that trails each.
 * @returns {Array<{ node: ts.Statement, start: number, end: number, comment: { text: string, start: number, end: number } | null }>}
 */
export function statementsOf(code) {
  const sf = ts.createSourceFile('example.ts', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  return sf.statements.map((node) => {
    const range = (ts.getTrailingCommentRanges(code, node.end) ?? []).find((r) => r.kind === ts.SyntaxKind.SingleLineCommentTrivia);
    const comment = range ? { text: code.slice(range.pos + 2, range.end).trim(), start: range.pos, end: range.end } : null;
    return { node, start: node.getStart(sf), end: node.end, comment };
  });
}

/**
 * The asserted result of a trailing comment: `=> <expression>`, `=> ≈ <number>` (equal to the
 * stated decimal places), or `=> throws <CODE>`, each optionally followed by `// note`.
 * Returns null for prose comments.
 * @returns {{ kind: 'value', expr: string } | { kind: 'approx', value: number, digits: number } | { kind: 'throws', code: string } | null}
 */
export function parseResult(comment) {
  const m = /^=>\s*(.+)$/.exec(comment);
  if (!m) return null;
  const body = m[1].replace(/\s+\/\/.*$/, '').trim();
  const t = /^throws\s+([A-Za-z_][\w]*)$/.exec(body);
  if (t) return { kind: 'throws', code: t[1] };
  const approx = /^≈\s*(-?\d+(?:\.(\d+))?)$/.exec(body);
  if (approx) return { kind: 'approx', value: Number(approx[1]), digits: approx[2]?.length ?? 0 };
  return { kind: 'value', expr: body };
}

/**
 * Every example of every module as a standalone ES module for type checking (E4). The
 * module's own exports that the example uses are imported implicitly (D4); everything
 * else, including `declare const file: File;` setup, is the example's own code.
 * @param {(pkg: string, mod: string) => string} entryOf Entry file to extract from (src or dist).
 * @returns {Array<{ name: string, code: string }>}
 */
export function typecheckSources(entryOf) {
  const out = [];
  for (const pkg of EXAMPLE_PACKAGES) {
    for (const mod of modulesOf(pkg)) {
      const specifier = `@absoluteui/${pkg}/${mod}`;
      const { names, items } = extractModule(entryOf(pkg, mod));
      for (const item of items) {
        item.examples.forEach((example, i) => {
          const values = [];
          const types = [];
          const explicit = importedNames(example);
          for (const id of identifiersOf(example)) {
            if (explicit.has(id)) continue;
            const n = names.get(id);
            if (n?.value) values.push(id);
            else if (n?.type) types.push(id);
          }
          const head = [];
          if (values.length) head.push(`import { ${values.sort().join(', ')} } from '${specifier}';`);
          if (types.length) head.push(`import type { ${types.sort().join(', ')} } from '${specifier}';`);
          out.push({ name: `${pkg}-${mod}-${item.name.replace(/\W/g, '_')}-${i + 1}`, code: `// ${specifier} ${item.name} example ${i + 1}\n${head.join('\n')}\n${example}\nexport {};\n` });
        });
      }
    }
  }
  return out;
}

/** Local names bound by the example's own import declarations (never imported implicitly as well). */
export function importedNames(code) {
  const sf = ts.createSourceFile('example.ts', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const out = new Set();
  for (const s of sf.statements) {
    if (!ts.isImportDeclaration(s) || !s.importClause) continue;
    const c = s.importClause;
    if (c.name) out.add(c.name.text);
    if (c.namedBindings && ts.isNamespaceImport(c.namedBindings)) out.add(c.namedBindings.name.text);
    if (c.namedBindings && ts.isNamedImports(c.namedBindings)) for (const el of c.namedBindings.elements) out.add(el.name.text);
  }
  return out;
}

/** Identifiers referenced anywhere in a snippet (used to import only what an example uses). */
export function identifiersOf(code) {
  const sf = ts.createSourceFile('example.ts', code, ts.ScriptTarget.ES2022, true, ts.ScriptKind.TS);
  const out = new Set();
  const visit = (n) => {
    if (ts.isIdentifier(n)) out.add(n.text);
    ts.forEachChild(n, visit);
  };
  visit(sf);
  return out;
}

export { ts };
