/**
 * validate_usage (docs/PLAN-R15-MCP.md section 5.1, R15-8): rule checks of a TypeScript or Angular
 * snippet against the metadata of this version. Static only: the snippet is never run or written.
 * Type checking is left to the project's own tsc.
 */
import type { AngularEntry, ComponentEntry, Content } from '../content/types.js';
import { stringOf, type JsonObject } from '../protocol/jsonrpc.js';
import { suggest } from '../tools/util.js';
import { mask, matching, objectKeys, position } from './scan.js';

export type Severity = 'error' | 'warning' | 'info';

export interface Diagnostic {
  readonly severity: Severity;
  readonly rule: string;
  readonly message: string;
  readonly line: number;
  readonly column: number;
  readonly fix?: string;
  readonly docUri?: string;
}

const THIRD_PARTY_ICONS = ['lucide', 'lucide-react', '@fortawesome', 'heroicons', '@heroicons', 'material-icons', '@mui/icons-material', 'react-icons', 'feather-icons', '@tabler/icons', 'bootstrap-icons', 'ionicons', '@phosphor-icons'];
const ANGULAR_GENERIC_ATTRIBUTES = new Set(['class', 'id', 'style', 'slot', 'title', 'role', 'tabindex', 'hidden', 'dir', 'lang', 'formcontrol', 'formcontrolname', 'ngmodel', 'ngmodelchange', 'ngclass', 'ngstyle', 'ngif', 'ngfor', 'ngforof', 'click', 'focus', 'blur', 'keydown', 'keyup']);

interface Context {
  readonly content: Content;
  readonly source: string;
  readonly diagnostics: Diagnostic[];
}

function report(ctx: Context, offset: number, severity: Severity, rule: string, message: string, extra: { fix?: string; docUri?: string } = {}): void {
  if (ctx.diagnostics.length >= 200) return;
  const { line, column } = position(ctx.source, offset);
  ctx.diagnostics.push({ severity, rule, message, line, column, ...extra });
}

interface ImportStatement {
  readonly specifier: string;
  readonly names: readonly string[];
  readonly offset: number;
}

function imports(source: string, code: string, strings: ReturnType<typeof mask>['strings']): ImportStatement[] {
  const out: ImportStatement[] = [];
  // Bounded clause (strings are masked, so it holds no quotes): linear time on any input.
  const pattern = /\bimport\s*(?:type\s+)?([^;'"]{0,2000}?)\s*\bfrom\s*(['"])|\bimport\s*(['"])|\bimport\s*\(\s*(['"])/g;
  for (let m = pattern.exec(code); m !== null; m = pattern.exec(code)) {
    const quoteAt = m.index + m[0].length - 1;
    const literal = strings.find((s) => s.start === quoteAt + 1);
    if (!literal) continue;
    const specifier = source.slice(literal.start, literal.end);
    const clause = m[1] ?? '';
    const names = [...clause.replace(/\bas\s+[\w$]+/g, '').matchAll(/[A-Za-z_$][\w$]*/g)].map((x) => x[0]).filter((x) => x !== 'type');
    out.push({ specifier, names, offset: literal.start });
  }
  return out;
}

interface Catalog {
  readonly components: ReadonlyMap<string, ComponentEntry>;
  readonly entryPoints: ReadonlySet<string>;
  readonly styles: ReadonlySet<string>;
  readonly angular: ReadonlyMap<string, AngularEntry>;
  readonly events: ReadonlySet<string>;
}

function catalog(content: Content): Catalog {
  const entryPoints = new Set<string>(['@absoluteui/core', '@absoluteui/utilities', '@absoluteui/theme', '@absoluteui/icons', '@absoluteui/icons/set', '@absoluteui/icons/set/register', '@absoluteui/angular']);
  const styles = new Set<string>(['@absoluteui/theme/absolute-default.css', '@absoluteui/theme/fonts/noto-sans.css']);
  for (const c of content.components) {
    entryPoints.add(`@absoluteui/components/${c.name}`);
    styles.add(c.styleImport);
  }
  for (const a of content.addons) entryPoints.add(a.import);
  for (const m of content.api) entryPoints.add(m.import);
  for (const e of content.angular) entryPoints.add(e.import);
  for (const i of content.icons.icons) entryPoints.add(`@absoluteui/icons/set/${i.id}`);
  const events = new Set<string>();
  for (const c of content.components) for (const e of c.api.events ?? []) events.add(e.name);
  return {
    components: new Map(content.components.map((c) => [c.name, c])),
    entryPoints,
    styles,
    angular: new Map(content.angular.map((e) => [e.entry, e])),
    events,
  };
}

function checkImports(ctx: Context, cat: Catalog, list: readonly ImportStatement[], framework: 'ts' | 'angular'): ComponentEntry[] {
  const used: ComponentEntry[] = [];
  for (const imp of list) {
    const spec = imp.specifier;
    if (THIRD_PARTY_ICONS.some((p) => spec === p || spec.startsWith(`${p}/`))) {
      report(ctx, imp.offset, 'info', 'icon-set', `'${spec}' is a third-party icon library. AbsoluteUI has its own icon set; third-party icons work in components only through an icon adapter.`, { fix: 'Find an icon with search_icons and import it from @absoluteui/icons/set, or register the library through an icon adapter (Icons guide).', docUri: 'absoluteui://guide/guides/icons' });
      continue;
    }
    if (!spec.startsWith('@absoluteui/')) continue;
    if (/^@absoluteui\/(react|vue)(\/|$)/.test(spec)) {
      report(ctx, imp.offset, 'error', 'unavailable-adapter', `'${spec}' is not available. AbsoluteUI ships framework-neutral components and an Angular integration only.`, { fix: framework === 'angular' ? 'Use @absoluteui/angular.' : 'Use the component classes from @absoluteui/components/<name>.' });
      continue;
    }
    const component = /^@absoluteui\/components\/([a-z0-9-]+)(\/style\.css)?$/.exec(spec);
    const removed = component?.[1] && ctx.content.excluded.includes(component[1]);
    if (removed) {
      report(ctx, imp.offset, 'error', 'unknown-entry-point', `'${spec}' is not part of AbsoluteUI (removed or on hold).`, { fix: 'Find an alternative with search_docs.' });
      continue;
    }
    if (spec.endsWith('.css')) {
      if (!cat.styles.has(spec)) report(ctx, imp.offset, 'error', 'unknown-entry-point', `Unknown stylesheet '${spec}'.${hint(spec, [...cat.styles])}`);
      continue;
    }
    if (!cat.entryPoints.has(spec)) {
      report(ctx, imp.offset, 'error', 'unknown-entry-point', `'${spec}' is not a published entry point.${hint(spec, [...cat.entryPoints])}`, { fix: 'Import from the entry point the docs name (get_component returns it).' });
      continue;
    }
    if (spec.startsWith('@absoluteui/services/')) report(ctx, imp.offset, 'info', 'preview', `'${spec}' is in preview and not yet published.`);
    if (component?.[1]) {
      const c = cat.components.get(component[1]);
      if (c) {
        used.push(c);
        const className = /import\s*\{\s*([A-Za-z_$][\w$]*)/.exec(c.import)?.[1];
        for (const name of imp.names) if (className && name !== className && !/^[A-Z]/.test(name)) report(ctx, imp.offset, 'info', 'import-name', `'${name}' is not the component class of ${spec} ('${className}').`);
      }
    }
    for (const m of ctx.content.api.filter((x) => x.import === spec)) {
      for (const name of imp.names) {
        const item = m.items.find((i) => i.name === name);
        if (!item && m.items.length > 0) report(ctx, imp.offset, 'error', 'unknown-export', `'${name}' is not exported by ${spec}.${hint(name, m.items.map((i) => i.name))}`, { docUri: `absoluteui://api/${m.package}/${m.module ?? 'index'}` });
        else if (item?.deprecated) report(ctx, imp.offset, 'warning', 'deprecated', `'${name}' is deprecated: ${item.deprecated}`);
      }
    }
    if (framework === 'angular' && spec.startsWith('@absoluteui/angular')) {
      const entry = cat.angular.get(spec === '@absoluteui/angular' ? 'index' : spec.slice('@absoluteui/angular/'.length));
      const declared = entry ? entry.declarations.map((d) => stringOf(d.name)) : [];
      for (const name of imp.names) {
        if (entry && /^Aui[A-Z]/.test(name) && !declared.includes(name)) report(ctx, imp.offset, 'error', 'unknown-export', `'${name}' is not declared by ${spec}.${hint(name, declared)}`, { docUri: `absoluteui://angular/${entry.entry}` });
      }
    }
  }
  return used;
}

function hint(input: string, known: readonly string[]): string {
  const near = suggest(input, known);
  return near.length > 0 ? ` Did you mean ${near.map((n) => `'${n}'`).join(' or ')}?` : '';
}

function checkFactories(ctx: Context, code: string, used: readonly ComponentEntry[]): void {
  for (const c of used) {
    const className = c.api.factory.signature.split('.')[0] ?? '';
    if (!className) continue;
    const optionNames = c.api.options.map((o) => o.name);
    const memberNames = [...(c.api.methods ?? []), ...(c.api.properties ?? [])].map((m) => m.name);
    const instances: string[] = [];
    // className comes from the metadata (an identifier), never from input; every part is bounded.
    const call = new RegExp(`(?:\\b(?:const|let|var)\\s+([A-Za-z_$][\\w$]*)\\s*(?::[^=;]{0,200})?=\\s*)?\\b${className}\\.create\\s*\\(`, 'g');
    for (let m = call.exec(code); m !== null; m = call.exec(code)) {
      if (m[1]) instances.push(m[1]);
      const open = m.index + m[0].length - 1;
      const close = matching(code, open);
      if (close === -1) continue;
      const args = code.slice(open + 1, close);
      // Second argument: the first top-level comma, then an object literal.
      let depth = 0;
      let comma = -1;
      for (let k = 0; k < args.length; k++) {
        const ch = args[k];
        if (ch === '(' || ch === '{' || ch === '[') depth++;
        else if (ch === ')' || ch === '}' || ch === ']') depth--;
        else if (ch === ',' && depth === 0) {
          comma = k;
          break;
        }
      }
      if (comma === -1) continue;
      const brace = args.slice(comma + 1).search(/\S/);
      const braceAt = open + 1 + comma + 1 + brace;
      if (code[braceAt] !== '{') continue;
      const end = matching(code, braceAt);
      if (end === -1) continue;
      const { names, spread } = objectKeys(code, braceAt, end);
      for (const key of names) {
        if (optionNames.includes(key.name)) continue;
        const chart = key.name === 'style' && optionNames.includes('theme');
        report(ctx, key.offset, 'error', 'unknown-option', chart ? `${className} has no 'style' option: chart look and feel is the 'theme' option.` : `${className} has no option '${key.name}'.${hint(key.name, optionNames)}`, { docUri: `absoluteui://component/${c.name}`, ...(chart ? { fix: "Rename 'style' to 'theme'." } : {}) });
      }
      if (!spread) {
        for (const o of c.api.options.filter((x) => x.required === true)) {
          if (!names.some((k) => k.name === o.name)) {
            const label = /label|name/i.test(o.name);
            report(ctx, braceAt, label ? 'error' : 'warning', label ? 'accessible-name' : 'required-option', `${className} needs the option '${o.name}'${label ? ' (its accessible name)' : ''}.`, { docUri: `absoluteui://component/${c.name}` });
          }
        }
      }
    }
    // Member calls on the instances: plain text search, no regular expression built from input.
    for (const instance of instances) {
      const needle = `${instance}.`;
      for (let at = code.indexOf(needle); at !== -1; at = code.indexOf(needle, at + needle.length)) {
        if (at > 0 && /[\w$.]/.test(code[at - 1] ?? '')) continue;
        const name = /^([A-Za-z_$][\w$]*)\s*\(/.exec(code.slice(at + needle.length, at + needle.length + 130))?.[1];
        if (name !== undefined && !memberNames.includes(name)) report(ctx, at + needle.length, 'warning', 'unknown-method', `${className} has no method '${name}'.${hint(name, memberNames)}`, { docUri: `absoluteui://component/${c.name}` });
      }
    }
  }
}

function checkEvents(ctx: Context, cat: Catalog, source: string, strings: ReturnType<typeof mask>['strings'], code: string): void {
  const pattern = /\baddEventListener\s*\(\s*(['"])/g;
  for (let m = pattern.exec(code); m !== null; m = pattern.exec(code)) {
    const literal = strings.find((s) => s.start === m.index + m[0].length);
    if (!literal) continue;
    const name = source.slice(literal.start, literal.end);
    if (name.startsWith('aui-') && !cat.events.has(name)) report(ctx, literal.start, 'error', 'unknown-event', `No AbsoluteUI component emits '${name}'.${hint(name, [...cat.events])}`);
  }
}

function checkCsp(ctx: Context, code: string): void {
  const rules: readonly [RegExp, string][] = [
    [/\.\s*(innerHTML|outerHTML)\s*=(?!=)/g, 'Assigning innerHTML/outerHTML builds HTML from strings; it breaks under Trusted Types and risks XSS.'],
    [/\.\s*insertAdjacentHTML\s*\(/g, 'insertAdjacentHTML builds HTML from strings; it breaks under Trusted Types and risks XSS.'],
    [/\bdocument\s*\.\s*write(ln)?\s*\(/g, 'document.write is not allowed under the AbsoluteUI Content Security Policy.'],
    [/\b(setTimeout|setInterval)\s*\(\s*['"`]/g, 'String-based timers are evaluated code; pass a function.'],
    [/\bnew\s+Function\s*\(|\beval\s*\(/g, 'Evaluated code is not allowed under the AbsoluteUI Content Security Policy.'],
  ];
  for (const [pattern, message] of rules) {
    for (let m = pattern.exec(code); m !== null; m = pattern.exec(code)) report(ctx, m.index, 'error', 'csp', message, { fix: 'Build DOM with createElement and textContent, or pass text and render functions to the components.' });
  }
}

function checkStyles(ctx: Context, list: readonly ImportStatement[], used: readonly ComponentEntry[]): void {
  const specs = new Set(list.map((i) => i.specifier));
  for (const c of used) {
    if (!specs.has(c.styleImport)) {
      const at = list.find((i) => i.specifier === `@absoluteui/components/${c.name}`)?.offset ?? 0;
      report(ctx, at, 'warning', 'missing-style', `${c.displayName} needs its stylesheet.`, { fix: `import '${c.styleImport}';` });
    }
  }
  if (used.length > 0 && !specs.has('@absoluteui/theme/absolute-default.css')) report(ctx, 0, 'info', 'theme', 'Load the theme once in the application entry.', { fix: "import '@absoluteui/theme/absolute-default.css';" });
}

function checkAngularTemplates(ctx: Context, cat: Catalog, source: string, strings: ReturnType<typeof mask>['strings']): void {
  const bySelector = new Map<string, { entry: AngularEntry; declaration: JsonObject }>();
  for (const e of cat.angular.values()) for (const d of e.declarations) if (typeof d.selector === 'string' && /^aui-[a-z-]+$/.test(d.selector)) bySelector.set(d.selector, { entry: e, declaration: d });
  const templates = strings.filter((s) => s.quote === '`');
  for (const t of templates) {
    const text = source.slice(t.start, t.end);
    const tag = /<(aui-[a-z0-9-]+)([^>]*)>/g;
    for (let m = tag.exec(text); m !== null; m = tag.exec(text)) {
      const selector = m[1] ?? '';
      const at = t.start + m.index + 1;
      const found = bySelector.get(selector);
      if (!found) {
        if (ctx.content.excluded.includes(selector.slice(4))) report(ctx, at, 'error', 'unknown-selector', `<${selector}> is not part of AbsoluteUI (removed or on hold).`);
        else report(ctx, at, 'error', 'unknown-selector', `<${selector}> is not an AbsoluteUI Angular selector.${hint(selector, [...bySelector.keys()])}`);
        continue;
      }
      const d = found.declaration;
      const names = (key: string): string[] => (Array.isArray(d[key]) ? (d[key] as readonly JsonObject[]).map((x) => stringOf(x.name)) : []);
      const inputs = [...names('inputs'), ...names('models')];
      const outputs = [...names('outputs'), ...(Array.isArray(d.models) ? (d.models as readonly JsonObject[]).map((x) => stringOf(x.change)) : [])];
      const attributes = m[2] ?? '';
      const attr = /(\[\(|\[|\(|\*|#)?([A-Za-z][\w.-]*)(\)\]|\]|\))?(?=\s*=|\s|$|\/)/g;
      for (let a = attr.exec(attributes); a !== null; a = attr.exec(attributes)) {
        const kind = a[1] ?? '';
        const raw = a[2] ?? '';
        const name = raw.split('.')[0] ?? raw;
        if (kind === '*' || kind === '#' || name.startsWith('aria-') || name.startsWith('data-') || name.startsWith('attr') || name.startsWith('class') || name.startsWith('style') || ANGULAR_GENERIC_ATTRIBUTES.has(name.toLowerCase())) continue;
        const offset = t.start + m.index + 1 + selector.length + a.index + kind.length;
        if (kind === '(') {
          if (!outputs.includes(name)) report(ctx, offset, 'error', 'unknown-output', `<${selector}> has no output '${name}'.${hint(name, outputs)}`, { docUri: `absoluteui://angular/${found.entry.entry}` });
        } else if (!inputs.includes(name)) {
          report(ctx, offset, kind === '' ? 'warning' : 'error', 'unknown-input', `<${selector}> has no input '${name}'.${hint(name, inputs)}`, { docUri: `absoluteui://angular/${found.entry.entry}` });
        }
      }
    }
  }
}

export interface UsageResult {
  readonly diagnostics: readonly Diagnostic[];
  readonly componentsUsed: readonly string[];
}

export function validateUsage(content: Content, source: string, framework: 'ts' | 'angular'): UsageResult {
  const ctx: Context = { content, source, diagnostics: [] };
  const cat = catalog(content);
  const masked = mask(source);
  const list = imports(source, masked.code, masked.strings);
  const used = checkImports(ctx, cat, list, framework);
  checkCsp(ctx, masked.code);
  checkEvents(ctx, cat, source, masked.strings, masked.code);
  if (framework === 'ts') {
    checkFactories(ctx, masked.code, used);
    checkStyles(ctx, list, used);
  } else {
    checkAngularTemplates(ctx, cat, source, masked.strings);
  }
  const order: Record<Severity, number> = { error: 0, warning: 1, info: 2 };
  const diagnostics = [...ctx.diagnostics].sort((a, b) => order[a.severity] - order[b.severity] || a.line - b.line || a.column - b.column);
  return { diagnostics, componentsUsed: used.map((c) => c.name) };
}
