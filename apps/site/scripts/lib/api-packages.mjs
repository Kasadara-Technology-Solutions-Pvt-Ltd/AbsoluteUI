// Package API reference generated from the published .d.ts files through the
// TypeScript compiler API (R4-4). Declarations tagged @internal are not published.
import { relative, sep } from 'node:path';
import ts from 'typescript';
import { normalizeExample } from '../../../../scripts/api-examples.mjs';

const KIND_ORDER = ['Functions', 'Classes', 'Constants', 'Interfaces', 'Types', 'Enums', 'Namespaces'];

function kindOf(decl) {
  if (ts.isFunctionDeclaration(decl)) return 'Functions';
  if (ts.isClassDeclaration(decl)) return 'Classes';
  if (ts.isInterfaceDeclaration(decl)) return 'Interfaces';
  if (ts.isTypeAliasDeclaration(decl)) return 'Types';
  if (ts.isEnumDeclaration(decl)) return 'Enums';
  if (ts.isVariableDeclaration(decl)) return 'Constants';
  if (ts.isModuleDeclaration(decl) || ts.isSourceFile(decl) || ts.isNamespaceExport?.(decl)) return 'Namespaces';
  return 'Types';
}

const isInternal = (symbol) => symbol.getJsDocTags().some((t) => t.name === 'internal');

function docOf(symbol, checker) {
  const text = ts.displayPartsToString(symbol.getDocumentationComment(checker)).trim();
  const tags = symbol.getJsDocTags();
  const deprecated = tags.find((t) => t.name === 'deprecated');
  const params = tags.filter((t) => t.name === 'param').map((t) => ts.displayPartsToString(t.text).trim());
  const returns = tags.find((t) => t.name === 'returns');
  // Overloads repeat their JSDoc; each example once (PLAN-API-EXAMPLES D5).
  const examples = [...new Set(tags.filter((t) => t.name === 'example').map((t) => normalizeExample(ts.displayPartsToString(t.text))))].filter(Boolean);
  return { text: clean(text), deprecated: deprecated ? ts.displayPartsToString(deprecated.text).trim() || 'Deprecated.' : null, params, returns: returns ? ts.displayPartsToString(returns.text).trim() : '', examples };
}

/** Examples on the public members of a class or interface, as `{ member, code }`. */
function memberExamples(decl) {
  if (!ts.isClassDeclaration(decl) && !ts.isInterfaceDeclaration(decl)) return [];
  const out = [];
  for (const m of decl.members) {
    if (!m.name || ts.isPrivateIdentifier(m.name) || ts.getCombinedModifierFlags(m) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) continue;
    const tags = ts.getJSDocTags(m);
    if (tags.some((t) => t.tagName.text === 'internal')) continue;
    for (const t of tags) if (t.tagName.text === 'example') {
      const code = normalizeExample(ts.getTextOfJSDocComment(t.comment) ?? '');
      if (code) out.push({ member: m.name.getText(), code });
    }
  }
  return out;
}

/** Declaration source without JSDoc comments, trimmed of `export declare`. */
function declarationText(decl) {
  const sf = decl.getSourceFile();
  let node = decl;
  if (ts.isVariableDeclaration(decl)) node = decl.parent.parent;
  const text = sf.text.slice(node.getStart(sf, false), node.getEnd());
  return text
    .replace(/\/\*\*[\s\S]*?\*\/\s*/g, '')
    .replace(/^export (declare )?/, '')
    .replace(/^declare /, '')
    .replace(/\n {4}/g, '\n  ');
}

/** Public members of a class, as a compact declaration. */
function classText(decl) {
  const sf = decl.getSourceFile();
  const head = sf.text.slice(decl.getStart(sf, false), decl.members.pos).replace(/^export (declare )?/, '').trim();
  const members = decl.members
    .filter((m) => !(ts.getCombinedModifierFlags(m) & (ts.ModifierFlags.Private | ts.ModifierFlags.Protected)) && !(m.name && ts.isPrivateIdentifier(m.name)))
    .filter((m) => !ts.getJSDocTags(m).some((t) => t.tagName.text === 'internal'))
    .map((m) => '  ' + sf.text.slice(m.getStart(sf, false), m.getEnd()).replace(/\/\*\*[\s\S]*?\*\/\s*/g, '').replace(/\n\s*/g, ' '));
  return `${head}\n${members.join('\n')}\n}`;
}

const MODULE_LABELS = { errors: 'Errors', config: 'Configuration', timezone: 'Dates and time zones', recurrence: 'Recurrence', i18n: 'Internationalization', sanitize: 'Sanitization', dom: 'DOM helpers', designer: 'Designer' };

function moduleLabel(file, distDir) {
  const rel = relative(distDir, file).split(sep).join('/').replace(/\.d\.ts$/, '');
  if (rel === 'index') return 'General';
  // Declarations re-exported from a sibling module (for example helpers/date types used by business-calendar).
  if (rel.startsWith('../')) return 'Related types';
  const first = rel.split('/')[0];
  return MODULE_LABELS[first] ?? first.replace(/-/g, ' ').replace(/^./, (c) => c.toUpperCase());
}

/** Drop references to the internal specification from JSDoc text. */
const clean = (text) => text.replace(/\s*\((?:SPEC )?section \d[\d.]*(?:(?:,| and) section \d[\d.]*)*\)/g, '').replace(/(?:SPEC )?section \d[\d.]*/g, 'the specification');

/**
 * Extract the public API of one entry .d.ts.
 * @returns {Array<{ module: string, kind: string, name: string, signature: string, doc: ReturnType<typeof docOf> }>}
 */
export function extractApi(entry, distDir) {
  const program = ts.createProgram([entry], { noEmit: true, skipLibCheck: true, target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext });
  const checker = program.getTypeChecker();
  const moduleSymbol = checker.getSymbolAtLocation(program.getSourceFile(entry));
  if (!moduleSymbol) return [];
  const out = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const symbol = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    if (isInternal(exported) || isInternal(symbol)) continue;
    const decls = symbol.declarations ?? [];
    if (!decls.length) continue;
    const decl = decls[0];
    const kind = kindOf(decl);
    let signature;
    if (kind === 'Namespaces') {
      const members = checker.getExportsOfModule(symbol).filter((m) => !isInternal(m));
      signature = `namespace ${exported.name} {\n${members.map((m) => `  ${declarationText((m.declarations ?? [])[0] ?? decl).split('\n')[0]}`).join('\n')}\n}`;
    } else if (kind === 'Classes') signature = classText(decl);
    else signature = decls.filter((d) => kindOf(d) === kind).map(declarationText).join('\n');
    out.push({ module: kind === 'Namespaces' ? 'General' : moduleLabel(decl.getSourceFile().fileName, distDir), kind, name: exported.name, signature, doc: docOf(symbol, checker), memberExamples: memberExamples(decl) });
  }
  return out;
}

/** Markdown for an extracted API, grouped by module then kind. */
export function apiMarkdown(items, headingLevel = 2) {
  const h = '#'.repeat(headingLevel);
  const modules = [...new Set(items.map((i) => i.module))].sort((a, b) => (a === 'General' ? -1 : b === 'General' ? 1 : a.localeCompare(b)));
  const out = [];
  for (const mod of modules) {
    if (modules.length > 1) out.push(`${h} ${mod}`, '');
    const inModule = items.filter((i) => i.module === mod);
    for (const kind of KIND_ORDER) {
      const group = inModule.filter((i) => i.kind === kind).sort((a, b) => a.name.localeCompare(b.name));
      if (!group.length) continue;
      out.push(`${h}# ${kind}`, '');
      for (const item of group) {
        out.push(`**\`${item.name}\`**${item.doc.deprecated ? ` *(deprecated: ${item.doc.deprecated})*` : ''}`, '');
        if (item.doc.text) out.push(item.doc.text.replace(/</g, '&lt;'), '');
        out.push('```ts', item.signature, '```', '');
        if (item.doc.params.length) out.push(...item.doc.params.map((p) => `- ${p.replace(/</g, '&lt;')}`), '');
        if (item.doc.returns) out.push(`Returns: ${item.doc.returns.replace(/</g, '&lt;')}`, '');
        for (const code of item.doc.examples) out.push('Example:', '', '```ts', code, '```', '');
        for (const { member, code } of item.memberExamples) out.push(`Example (\`${member}\`):`, '', '```ts', code, '```', '');
      }
    }
  }
  return out.join('\n');
}
