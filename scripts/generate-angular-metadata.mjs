// docs/PLAN-R9-ANGULAR.md M8a item 2 (D24): Angular metadata per entry point, generated from the
// built declaration files (packages/angular/dist, so hand-written and generated declarations are
// read the same way and cannot drift) and enriched with the neutral component metadata
// (packages/components/metadata/<name>), the Angular conventions (scripts/angular-api.mjs), and
// the section 34 example of packages/components/docs/<name>.md. Output:
// packages/angular/metadata/<entry>.json (repository only; input for the R10 documentation site).
// --check fails when the committed files differ (run after npm run build).
import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import ts from 'typescript';
import { CONTROLS } from './adapter-components.mjs';
import { OUTPUT_OVERRIDES, OUTPUTS, PROJECTION, TEMPLATES } from './angular-api.mjs';
import { fail, readJson, root } from './lib.mjs';

const check = process.argv.includes('--check');
const pkgDir = join(root, 'packages', 'angular');
const dist = join(pkgDir, 'dist');
const outDir = join(pkgDir, 'metadata');
const componentsMeta = join(root, 'packages', 'components', 'metadata');
const componentsDocs = join(root, 'packages', 'components', 'docs');
const pkg = readJson(join(pkgDir, 'package.json'));
/** Server rendering per generated component, measured by scripts/angular-ssr-sweep.mjs (M8b). */
const sweepFile = join(pkgDir, 'metadata', 'server-rendering.json');
/** Files in metadata/ that are not entry points. */
const NOT_ENTRIES = new Set(['schema.json', 'server-rendering.json']);
const sweep = existsSync(sweepFile) ? readJson(sweepFile).components : {};

if (!existsSync(join(dist, 'index.d.ts'))) fail(['packages/angular/dist is missing; run npm run build first']);

/** Entry name -> declaration file. */
const entries = Object.entries(pkg.exports)
  .filter(([, target]) => typeof target === 'object' && typeof target.types === 'string')
  .map(([subpath, target]) => ({ entry: subpath === '.' ? 'index' : subpath.slice(2), specifier: subpath === '.' ? pkg.name : `${pkg.name}${subpath.slice(1)}`, file: join(pkgDir, target.types) }));

const program = ts.createProgram(
  entries.map((e) => e.file),
  { module: ts.ModuleKind.NodeNext, moduleResolution: ts.ModuleResolutionKind.NodeNext, target: ts.ScriptTarget.ES2022, strict: true, exactOptionalPropertyTypes: true, skipLibCheck: true, noEmit: true, types: [] },
);
const checker = program.getTypeChecker();
const FLAGS = ts.TypeFormatFlags.NoTruncation | ts.TypeFormatFlags.UseAliasDefinedOutsideCurrentScope | ts.TypeFormatFlags.WriteArrayAsGenericType;

const typeText = (node) => (node ? checker.typeToString(checker.getTypeFromTypeNode(node), undefined, FLAGS & ~ts.TypeFormatFlags.WriteArrayAsGenericType) : 'unknown');
const docOf = (symbol) => ts.displayPartsToString(symbol?.getDocumentationComment(checker) ?? []).trim() || undefined;
/** Metadata feeds the public documentation: no repository paths or internal decision/milestone ids (docs/PLAN-R10-DOCS.md R10-7). */
const INTERNAL = [/\b(?:packages|scripts|apps|docs)\/[\w./-]+/, /\b(?:D\d{1,2}|M\d{1,2}[ab]?)\b/];
/** Members tagged @internal serve the adapter itself; they are not documented. */
const isInternal = (node) => ts.getJSDocTags(node).some((t) => t.tagName.text === 'internal');
const literal = (node) => (node && ts.isLiteralTypeNode(node) && ts.isStringLiteral(node.literal) ? node.literal.text : null);

/** `{ "a": { "alias": "x"; "required": true; ... }; }` -> Map(property -> { alias, required }). */
function inputMap(node) {
  const out = new Map();
  if (!node || !ts.isTypeLiteralNode(node)) return out;
  for (const member of node.members) {
    if (!ts.isPropertySignature(member) || !member.type || !ts.isTypeLiteralNode(member.type)) continue;
    const name = member.name.text;
    const fields = Object.fromEntries(member.type.members.filter(ts.isPropertySignature).map((m) => [m.name.text, m.type]));
    const alias = literal(fields.alias) ?? name;
    const required = fields.required?.kind === ts.SyntaxKind.LiteralType && fields.required.literal.kind === ts.SyntaxKind.TrueKeyword;
    out.set(name, { alias, required });
  }
  return out;
}

/** `{ "a": "aChange"; }` -> Map(property -> alias). */
function outputMap(node) {
  const out = new Map();
  if (!node || !ts.isTypeLiteralNode(node)) return out;
  for (const member of node.members) if (ts.isPropertySignature(member)) out.set(member.name.text, literal(member.type) ?? member.name.text);
  return out;
}

const tupleStrings = (node) => (node && ts.isTupleTypeNode(node) ? node.elements.map(literal).filter((s) => s !== null) : []);

/** The Angular declaration of a class: static ɵcmp / ɵdir type arguments. */
function angularDeclaration(cls) {
  for (const member of cls.members) {
    if (!ts.isPropertyDeclaration(member) || !member.type || !ts.isTypeReferenceNode(member.type)) continue;
    const name = member.name.getText();
    if (name !== 'ɵcmp' && name !== 'ɵdir') continue;
    const args = member.type.typeArguments ?? [];
    return { kind: name === 'ɵcmp' ? 'component' : 'directive', selector: literal(args[1]) ?? '', exportAs: tupleStrings(args[2]), inputs: inputMap(args[3]), outputs: outputMap(args[4]) };
  }
  return null;
}

const hasStatic = (cls, name) => cls.members.some((m) => ts.isPropertyDeclaration(m) && m.name.getText() === name);
const heritage = (cls) => (cls.heritageClauses ?? []).flatMap((h) => h.types.map((t) => t.expression.getText()));
const CVA = new Set(['writeValue', 'registerOnChange', 'registerOnTouched', 'setDisabledState', 'validate', 'registerOnValidatorChange', 'ngOnDestroy', 'ngOnInit', 'ngOnChanges', 'ngAfterViewInit']);

/** Neutral metadata of a component entry, when the entry is a component name. */
function neutral(entry) {
  const dir = join(componentsMeta, entry);
  if (!existsSync(join(dir, 'api.json'))) return null;
  const read = (file) => (existsSync(join(dir, file)) ? readJson(join(dir, file)) : null);
  return { api: read('api.json'), component: read('component.json'), accessibility: read('accessibility.json') };
}

/** The code blocks of section 34 of the component's documentation. */
function angularExample(entry) {
  const file = join(componentsDocs, `${entry}.md`);
  if (!existsSync(file)) return null;
  const text = readFileSync(file, 'utf8');
  const start = text.indexOf('\n## 34.');
  if (start < 0) return null;
  const end = text.indexOf('\n## 35.', start + 1);
  const section = text.slice(start, end < 0 ? undefined : end);
  const blocks = [...section.matchAll(/```(ts|html)\n([\s\S]*?)```/g)].map((m) => ({ language: m[1], code: m[2].trimEnd() }));
  return blocks.length ? blocks : null;
}

/** The neutral event an output re-emits (name, detail, description), from the conventions. */
function outputEvent(entry, outputName, api) {
  for (const event of api?.events ?? []) {
    const override = OUTPUT_OVERRIDES[entry]?.[event.name];
    const mapped = override === undefined ? OUTPUTS[event.name] : override;
    if (mapped === outputName) return event;
  }
  return undefined;
}

function outputDescription(entry, outputName, api) {
  if (!api) return undefined;
  const event = outputEvent(entry, outputName, api);
  if (event) return event.description;
  return undefined;
}

/** The type argument of InputSignal<T>, InputSignalWithTransform<T, W> (W: what a binding accepts), ModelSignal<T>, OutputEmitterRef<T>. */
function signalInfo(member) {
  if (!member.type || !ts.isTypeReferenceNode(member.type)) return null;
  const name = member.type.typeName.getText();
  const args = member.type.typeArguments ?? [];
  if (name === 'InputSignal') return { kind: 'input', type: typeText(args[0]) };
  // W is what a binding accepts; boolean inputs accept any value (attribute strings are coerced), so report T.
  if (name === 'InputSignalWithTransform') {
    const accepts = typeText(args[1] ?? args[0]);
    return { kind: 'input', type: accepts === 'unknown' ? typeText(args[0]) : accepts };
  }
  if (name === 'ModelSignal') return { kind: 'model', type: typeText(args[0]) };
  if (name === 'OutputEmitterRef') return { kind: 'output', type: typeText(args[0]) };
  return null;
}

const stripUndefined = (type) => type.replace(/ \| undefined$/, '').replace(/^undefined \| /, '');

function describeClass(cls, entry, sourceEntry) {
  const symbol = checker.getSymbolAtLocation(cls.name);
  const declaration = angularDeclaration(cls);
  const extendsList = heritage(cls);
  const name = cls.name.text;
  const base = { name, description: docOf(symbol) };
  if (declaration) {
    const meta = neutral(entry);
    const options = new Map((meta?.api?.options ?? []).map((o) => [o.name, o]));
    const inputs = [];
    const models = [];
    const outputs = [];
    const properties = [];
    const methods = [];
    for (const member of cls.members) {
      const memberName = member.name?.getText();
      if (!memberName || memberName.startsWith('ɵ') || isInternal(member) || member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword || m.kind === ts.SyntaxKind.StaticKeyword)) continue;
      const memberSymbol = checker.getSymbolAtLocation(member.name);
      if (ts.isPropertyDeclaration(member)) {
        const info = signalInfo(member);
        // Inputs renamed in the class (validate -> validateFn) keep their neutral option name as the alias.
        const option = options.get(declaration.inputs.get(memberName)?.alias ?? memberName) ?? options.get(memberName);
        const neutralDoc = option?.description;
        if (info?.kind === 'input' && declaration.inputs.has(memberName)) {
          const { alias, required } = declaration.inputs.get(memberName);
          inputs.push({
            name: alias,
            type: required ? info.type : stripUndefined(info.type),
            required,
            ...(option?.default === undefined ? {} : { default: String(option.default) }),
            ...(option?.globallyConfigurable ? { configurable: true } : {}),
            description: docOf(memberSymbol) ?? neutralDoc,
          });
        } else if (info?.kind === 'model') {
          models.push({ name: declaration.inputs.get(memberName)?.alias ?? memberName, type: stripUndefined(info.type), change: declaration.outputs.get(memberName) ?? `${memberName}Change`, description: docOf(memberSymbol) ?? neutralDoc });
        } else if (info?.kind === 'output' && declaration.outputs.has(memberName)) {
          const outputName = declaration.outputs.get(memberName);
          const event = outputEvent(entry, outputName, meta?.api);
          // Untyped outputs carry the neutral event detail; record it so documentation can show the shape.
          outputs.push({ name: outputName, payload: info.type, ...(event ? { event: event.name } : {}), ...(event && info.type === 'unknown' ? { detail: event.detail } : {}), description: docOf(memberSymbol) ?? outputDescription(entry, memberName, meta?.api) });
        } else if (!info && member.type) {
          properties.push({ name: memberName, type: typeText(member.type), description: docOf(memberSymbol) });
        }
      } else if (ts.isMethodDeclaration(member) && !CVA.has(memberName)) {
        const signature = checker.getSignatureFromDeclaration(member);
        methods.push({ name: memberName, signature: signature ? `${memberName}${checker.signatureToString(signature, undefined, ts.TypeFormatFlags.NoTruncation)}` : memberName, description: docOf(memberSymbol) });
      }
    }
    const forms = extendsList.some((e) => e.startsWith('ControlBridge'));
    const valueModel = forms ? models.find((m) => m.name === 'value' || m.name === 'checked') : undefined;
    if (forms) {
      // Inherited from the forms layer (ControlBridge): the formState signals.
      const formState = checker.getPropertyOfType(checker.getTypeAtLocation(cls.name), 'formState');
      const decl = formState?.valueDeclaration;
      if (formState && decl) properties.push({ name: 'formState', type: checker.typeToString(checker.getTypeOfSymbolAtLocation(formState, decl), undefined, ts.TypeFormatFlags.NoTruncation), description: docOf(formState) });
    }
    const generated = existsSync(join(pkgDir, 'src', sourceEntry, 'index.ts')) && readFileSync(join(pkgDir, 'src', sourceEntry, 'index.ts'), 'utf8').startsWith('// Generated by scripts/generate-angular.mjs');
    const isElement = declaration.selector.startsWith('aui-');
    return {
      kind: declaration.kind,
      ...base,
      selector: declaration.selector,
      exportAs: declaration.exportAs,
      source: generated ? 'generated' : 'hand-written',
      ...(meta ? { component: entry, configKey: meta.api.configKey } : {}),
      ...(forms ? { forms: { controlValueAccessor: true, validator: CONTROLS[entry]?.noValidity !== true, valueType: valueModel?.type ?? 'unknown' } } : {}),
      inputs,
      models,
      outputs,
      ...(properties.length ? { properties } : {}),
      methods,
      ...(TEMPLATES[entry] && isElement ? { templates: TEMPLATES[entry].directives } : {}),
      ...(PROJECTION[entry] && isElement ? { projection: PROJECTION[entry] } : {}),
      // D3: element components render on the server unless the sweep found otherwise (M8b).
      serverRendering: generated ? (sweep[entry]?.mode ?? 'server') : declaration.selector === 'aui-icon' ? 'server' : 'browser',
      ...(generated && (sweep[entry]?.reason ?? sweep[entry]?.note) ? { serverRenderingNote: sweep[entry].reason ?? sweep[entry].note } : {}),
      ...(meta?.accessibility ? { accessibility: { pattern: meta.accessibility.pattern, source: `packages/components/metadata/${entry}/accessibility.json` } } : {}),
      ...(meta?.component?.limitations?.length ? { limitations: meta.component.limitations } : {}),
    };
  }
  const isService = hasStatic(cls, 'ɵprov');
  const isHarness = extendsList.some((e) => /Harness$/.test(e) || e === 'ComponentHarness');
  const methods = [];
  for (const member of cls.members) {
    const memberName = member.name?.getText();
    if (!memberName || !ts.isMethodDeclaration(member) || memberName.startsWith('ɵ') || isInternal(member) || CVA.has(memberName) || member.modifiers?.some((m) => m.kind === ts.SyntaxKind.PrivateKeyword || m.kind === ts.SyntaxKind.ProtectedKeyword)) continue;
    const signature = checker.getSignatureFromDeclaration(member);
    const isStatic = member.modifiers?.some((m) => m.kind === ts.SyntaxKind.StaticKeyword) ?? false;
    methods.push({ name: memberName, ...(isStatic ? { static: true } : {}), signature: signature ? `${memberName}${checker.signatureToString(signature, undefined, ts.TypeFormatFlags.NoTruncation)}` : memberName, description: docOf(checker.getSymbolAtLocation(member.name)) });
  }
  return { kind: isHarness ? 'harness' : isService ? 'service' : 'class', ...base, methods };
}

function describeEntry({ entry, specifier, file }) {
  const sourceFile = program.getSourceFile(file);
  const moduleSymbol = sourceFile && checker.getSymbolAtLocation(sourceFile);
  if (!moduleSymbol) fail([`${specifier}: declarations not found`]);
  const declarations = [];
  const functions = [];
  const constants = [];
  const types = [];
  const reexports = [];
  for (const exported of checker.getExportsOfModule(moduleSymbol)) {
    const target = exported.flags & ts.SymbolFlags.Alias ? checker.getAliasedSymbol(exported) : exported;
    const decl = target.declarations?.[0];
    if (!decl) continue;
    const declFile = decl.getSourceFile().fileName.replaceAll('\\', '/');
    const ownDir = file.replaceAll('\\', '/').replace(/\/index\.d\.ts$/, '/');
    const local = declFile.startsWith(ownDir) || declFile === file.replaceAll('\\', '/');
    // Declarations of another entry point (re-exports) are listed by name only.
    if (!local && entry !== 'index') {
      reexports.push(exported.name);
      continue;
    }
    if (!declFile.includes('/packages/angular/dist/')) {
      reexports.push(exported.name);
      continue;
    }
    const sourceEntry = declFile.split('/packages/angular/dist/')[1].split('/')[0];
    if (ts.isClassDeclaration(decl)) declarations.push(describeClass(decl, entry, sourceEntry.endsWith('.d.ts') ? '' : sourceEntry));
    else if (ts.isFunctionDeclaration(decl)) {
      const signature = checker.getSignatureFromDeclaration(decl);
      functions.push({ name: exported.name, signature: signature ? `${exported.name}${checker.signatureToString(signature, undefined, ts.TypeFormatFlags.NoTruncation)}` : exported.name, description: docOf(target) });
    } else if (ts.isVariableDeclaration(decl)) constants.push({ name: exported.name, type: checker.typeToString(checker.getTypeOfSymbolAtLocation(target, decl), undefined, ts.TypeFormatFlags.NoTruncation), description: docOf(target) });
    else if (ts.isInterfaceDeclaration(decl) || ts.isTypeAliasDeclaration(decl)) types.push({ name: exported.name, description: docOf(target) });
  }
  const example = angularExample(entry);
  return {
    schemaVersion: 1,
    entry: specifier,
    declarations,
    ...(functions.length ? { functions } : {}),
    ...(constants.length ? { constants } : {}),
    ...(types.length ? { types } : {}),
    ...(reexports.length ? { reexports: reexports.sort() } : {}),
    ...(example ? { example } : {}),
  };
}

/** Drop undefined values so the JSON is stable. */
const clean = (value) => JSON.parse(JSON.stringify(value));

/** Validates against metadata/schema.json (the subset of JSON Schema it uses). */
function validate(value, schema, defs, path, errors) {
  if (schema.$ref) return validate(value, defs[schema.$ref.replace('#/$defs/', '')], defs, path, errors);
  if ('const' in schema && value !== schema.const) errors.push(`${path}: expected ${JSON.stringify(schema.const)}`);
  if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: expected one of ${schema.enum.join(', ')}`);
  const type = schema.type;
  if (type === 'object') {
    if (typeof value !== 'object' || value === null || Array.isArray(value)) return errors.push(`${path}: expected an object`);
    for (const key of schema.required ?? []) if (!(key in value)) errors.push(`${path}: missing ${key}`);
    for (const [key, v] of Object.entries(value)) {
      const sub = schema.properties?.[key];
      if (sub) validate(v, sub, defs, `${path}.${key}`, errors);
      else if (schema.additionalProperties === false) errors.push(`${path}: unexpected ${key}`);
    }
  } else if (type === 'array') {
    if (!Array.isArray(value)) return errors.push(`${path}: expected an array`);
    value.forEach((v, i) => validate(v, schema.items ?? {}, defs, `${path}[${String(i)}]`, errors));
  } else if (type === 'string') {
    if (typeof value !== 'string') errors.push(`${path}: expected a string`);
    else if (schema.pattern && !new RegExp(schema.pattern).test(value)) errors.push(`${path}: does not match ${schema.pattern}`);
  } else if (type === 'boolean' && typeof value !== 'boolean') errors.push(`${path}: expected a boolean`);
  return undefined;
}

const schema = readJson(join(outDir, 'schema.json'));
const files = new Map();
const schemaErrors = [];
for (const e of entries) {
  const data = clean(describeEntry(e));
  validate(data, schema, schema.$defs, e.entry, schemaErrors);
  files.set(`${e.entry}.json`, `${JSON.stringify(data, null, 2)}\n`);
}
if (schemaErrors.length) fail(schemaErrors.map((m) => `schema: ${m}`));

/** Every description is public documentation text. */
const internalErrors = [];
const scan = (value, path) => {
  if (Array.isArray(value)) value.forEach((v, i) => scan(v, `${path}[${String(i)}]`));
  else if (value && typeof value === 'object') {
    for (const [key, v] of Object.entries(value)) {
      if (key === 'description' && typeof v === 'string') for (const re of INTERNAL) if (re.test(v)) internalErrors.push(`${path}.description: internal reference "${re.exec(v)[0]}" (fix the source comment)`);
      else scan(v, `${path}.${key}`);
    }
  }
};
for (const [name, content] of files) scan(JSON.parse(content), name);
if (internalErrors.length) fail(internalErrors);

if (check) {
  const errors = [];
  const existing = existsSync(outDir) ? readdirSync(outDir).filter((f) => f.endsWith('.json') && !NOT_ENTRIES.has(f)) : [];
  for (const [name, content] of files) {
    const path = join(outDir, name);
    if (!existsSync(path) || readFileSync(path, 'utf8') !== content) errors.push(`packages/angular/metadata/${name} is out of date; run npm run generate:angular-metadata`);
  }
  for (const name of existing) if (!files.has(name)) errors.push(`packages/angular/metadata/${name} has no entry point; run npm run generate:angular-metadata`);
  if (errors.length) fail(errors);
  console.log(`check:angular-metadata: ok (${files.size} entry points)`);
} else {
  mkdirSync(outDir, { recursive: true });
  for (const name of readdirSync(outDir)) if (name.endsWith('.json') && !NOT_ENTRIES.has(name) && !files.has(name)) rmSync(join(outDir, name));
  for (const [name, content] of files) writeFileSync(join(outDir, name), content);
  console.log(`generate-angular-metadata: wrote ${files.size} entry points`);
}
