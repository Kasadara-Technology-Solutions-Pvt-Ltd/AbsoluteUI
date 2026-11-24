// Generates the Angular components (SPEC section 22, docs/PLAN-R9-ANGULAR.md D2/D5/D6/D7/D10)
// from AI-readable metadata (metadata/<name>/api.json), so Angular inputs can never drift
// from component options: every option becomes a typed signal input (or a model, for state
// the user changes), every event an action-named output, every public controller method a
// typed method. Component CSS is bundled with each component.
// Usage: node scripts/generate-angular.mjs [--check]   (--check fails on drift)
import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, readJson, fail } from './lib.mjs';
import { CONTROLS, HOSTS, GENERIC, EXCLUDE, STRIP, detailType } from './adapter-components.mjs';
import { OUTPUTS, OUTPUT_OVERRIDES, MODELS, HIDDEN_METHODS, TEMPLATES, PROJECTION, GENERIC_DETAILS, STATE, UNTRACKED_MODELS, elementSelector } from './angular-api.mjs';

const meta = join(root, 'packages', 'components', 'metadata');
const out = join(root, 'packages', 'angular', 'src');
const check = process.argv.includes('--check');

/** Hand-written companion directives re-exported from a generated subpath index. */
const EXTRA_EXPORTS = {
  'data-table': [
    "export { AuiDataTableColumnChooser } from './column-chooser.js';",
    "export { AuiColumn } from './column.js';",
    // Directives in an exported array must be importable from the same entry: an application's
    // AOT compiler imports them from the module that declares the array (NG3004 otherwise).
    "export { AuiCell, AuiEditor, AuiEmpty, AuiGroupHeader, AuiHeader, AuiRowDetail } from '../templates/index.js';",
    '/** The table, `<aui-column>`, and its templates, for `imports`. */',
    'export const AUI_DATA_TABLE = [AuiDataTable, AuiColumn, AuiCell, AuiHeader, AuiRowDetail, AuiEmpty, AuiGroupHeader, AuiEditor] as const;',
  ],
  card: [
    "export { AuiCardContent, AuiCardFooter, AuiCardMedia } from './parts.js';",
    '/** The card and its projected parts, for `imports`. */',
    'export const AUI_CARD = [AuiCard, AuiCardContent, AuiCardFooter, AuiCardMedia] as const;',
  ],
};

/** api.json methods that are module helpers or return other controllers (D6: no core objects). */
const SKIP_METHODS = {
  'schedule-picker': ['scheduleToString', 'parseSchedule'],
  'box-plot': ['boxStats', 'quantile'],
  'business-calendar': ['createBusinessCalendar'],
  scheduler: ['expandEvents', 'applyEdit', 'packColumns', 'packLanes'],
  'menu-bar': ['menu'],
  'data-table': ['downloadCsv'],
  pagination: ['getPageItems'],
};

/** Members of the bridge and of ControlValueAccessor/Validator: methods with these names are not generated. */
const RESERVED = new Set(['host', 'controller', 'init', 'initControl', 'syncModel', 'optionsApplied', 'formDisabled', 'writeValue', 'registerOnChange', 'registerOnTouched', 'setDisabledState', 'validate', 'registerOnValidatorChange']);

/** Component style sheets a component needs (docs header "Styles:"), in cascade order. */
function styleDeps(name) {
  const doc = readFileSync(join(root, 'packages', 'components', 'docs', `${name}.md`), 'utf8').split('\n').slice(0, 8).join('\n');
  const line = doc.split('\n').find((l) => l.includes('Styles:')) ?? '';
  const deps = [...line.matchAll(/@absoluteui\/components\/([\w-]+)\/style\.css/g)].map((m) => m[1]);
  return [...new Set(deps.length ? deps : [name])];
}

function render(name, kind) {
  const api = readJson(join(meta, name, 'api.json'));
  const cls = api.factory.name.split(/[.|]/)[0].trim();
  const index = readFileSync(join(root, 'packages', 'components', 'src', name, 'index.ts'), 'utf8');
  const exported = new Set([...index.matchAll(/\b([A-Z][A-Za-z]+)\b/g)].map((m) => m[1]));
  const O = GENERIC[name] ? `${cls}Options<${GENERIC[name]}>` : `${cls}Options`;
  const C = GENERIC[name] ? `${cls}<${GENERIC[name]}>` : cls;
  const control = kind === 'control' ? CONTROLS[name] : null;
  const valueOption = control ? (control.option ?? 'value') : null;
  const models = MODELS[name] ?? [];
  const modelOptions = new Set(models.map((m) => m.option));
  const options = api.options.filter((o) => o.name !== valueOption && !(EXCLUDE[name] ?? []).includes(o.name));
  const typeImports = new Set([`${cls}Options`, ...(control?.types ?? [])]);
  const errors = [];

  // Members that would collide with ControlValueAccessor/Validator methods keep the template name through an alias.
  const prop = (n) => (control && n === 'validate' ? 'validateFn' : n);
  // Explicit InputSignal/ModelSignal annotations keep emitted declarations portable.
  const inputs = options.map((o) => {
    const t = `${O}['${o.name}']`;
    if (modelOptions.has(o.name)) return `  readonly ${o.name}: ModelSignal<${t} | undefined> = model<${t}>();`;
    if (prop(o.name) !== o.name) return `  readonly ${prop(o.name)}: InputSignal<${t} | undefined> = input<${t}>(undefined, { alias: '${o.name}' });`;
    // Boolean options accept bare attributes like native ones (`<aui-text-input required>`).
    if (o.type === 'boolean' && !o.required) return `  readonly ${o.name}: InputSignalWithTransform<boolean | undefined, unknown> = input<boolean | undefined, unknown>(undefined, { transform: booleanInput });`;
    const required = o.required && PROJECTION[name]?.defaultSlot !== o.name && !(TEMPLATES[name]?.optional ?? []).includes(o.name);
    return required ? `  readonly ${o.name}: InputSignal<${t}> = input.required<${t}>();` : `  readonly ${o.name}: InputSignal<${t} | undefined> = input<${t}>();`;
  });
  for (const m of models) if (!options.some((o) => o.name === m.option)) errors.push(`${name}: model ${m.option} is not an option`);
  if (control) {
    inputs.push(
      `  /** The ${valueOption}: \`[(${valueOption})]\` without forms; with Angular forms, bind the form control instead. */`,
      `  readonly ${valueOption}: ModelSignal<${control.value} | undefined> = model<${control.value}>();`,
    );
  }

  const events = [];
  for (const e of api.events) {
    const override = OUTPUT_OVERRIDES[name]?.[e.name];
    const output = override === undefined ? OUTPUTS[e.name] : override;
    if (output === undefined) {
      errors.push(`${name}: no Angular output name for ${e.name} (scripts/angular-api.mjs OUTPUTS)`);
      continue;
    }
    const t = detailType(cls, e.name, exported);
    if (t) typeImports.add(t);
    const synced = models.filter((m) => m.event === e.name);
    if (synced.length && !t) errors.push(`${name}: model event ${e.name} has no exported detail type`);
    if (output !== null && models.some((m) => `${m.option}Change` === output)) errors.push(`${name}: output ${output} collides with a model; add an OUTPUT_OVERRIDES entry`);
    const typed = t && GENERIC[name] && GENERIC_DETAILS.has(t) ? `${t}<${GENERIC[name]}>` : t;
    events.push({ name: e.name, output, type: typed ?? 'unknown', synced });
  }
  const outputs = events.filter((e) => e.output !== null).map((e) => `  readonly ${e.output}: OutputEmitterRef<${e.type}> = output<${e.type}>();`);
  const handlers = events
    .filter((e) => e.output !== null || e.synced.length)
    .map((e) => {
      if (!e.synced.length) return [`          '${e.name}': emitTo(this.${e.output}),`];
      return [
        `          '${e.name}': (detail) => {`,
        `            const d = detail as ${e.type};`,
        ...e.synced.map((m) => `            this.syncModel(this.${m.option}, '${m.option}', ${m.read});`),
        ...(e.output === null ? [] : [`            this.${e.output}.emit(d);`]),
        `          },`,
      ];
    })
    .flat();

  const members = new Set([...options.map((o) => prop(o.name)), ...(valueOption ? [valueOption] : []), ...events.map((e) => e.output).filter(Boolean)]);
  // An entry may list several methods ("expandAll | collapseAll"), each with its own signature segment.
  const methodEntries = api.methods.flatMap((m) =>
    m.name
      .split(/\s*[|/,]\s*/)
      .filter((n) => /^[a-z]\w*$/.test(n))
      .map((n) => ({ name: n, description: m.description, ret: new RegExp(`(?:^|[;\\s])${n}\\([^;]*?\\)\\s*:\\s*([^;]+)`).exec(m.signature)?.[1]?.trim() ?? 'unknown' })),
  );
  const methods = methodEntries
    .filter((m) =>!HIDDEN_METHODS.has(m.name) && !(SKIP_METHODS[name] ?? []).includes(m.name) && !RESERVED.has(m.name) && !members.has(m.name))
    .filter((m, i, all) => all.findIndex((x) => x.name === m.name) === i)
    .map((m) => {
      const ret = m.ret;
      const doc = m.description ? [`  /** ${m.description.replace(/\*\//g, '* /')} */`] : [];
      if (ret === 'void')
        return [...doc, `  ${m.name}(...args: Parameters<${C}['${m.name}']>): void {`, `    this.controller?.${m.name}(...args);`, `    this.afterChange(true);`, `  }`];
      return [
        ...doc,
        `  ${m.name}(...args: Parameters<${C}['${m.name}']>): ReturnType<${C}['${m.name}']> | undefined {`,
        `    const result = this.controller?.${m.name}(...args);`,
        `    this.afterChange(true);`,
        `    return result;`,
        `  }`,
      ];
    });

  // Read-only state signals (D25) and models kept in line after typed methods (D26).
  const propertyDocs = new Map((api.properties ?? []).flatMap((p) => p.name.split(/\s*[|/]\s*/).map((n) => [n.trim(), p.description])));
  const methodNames = new Set(methodEntries.map((m) => m.name));
  const stateLines = Object.entries(STATE[name] ?? {}).flatMap(([signalName, initial]) => {
    if (members.has(signalName) || methodNames.has(signalName)) errors.push(`${name}: state signal ${signalName} collides with an input, output, or method`);
    if (!propertyDocs.has(signalName)) errors.push(`${name}: state signal ${signalName} is not a documented property (api.json properties)`);
    const doc = propertyDocs.get(signalName);
    return [...(doc ? [`  /** Read-only: ${doc.replace(/\*\//g, '* /')} */`] : []), `  readonly ${signalName}: Signal<${C}['${signalName}']> = this.stateSignal((c) => c.${signalName}, ${initial});`];
  });
  const trackedModels = models.filter((m) => propertyDocs.has(m.option) && !(UNTRACKED_MODELS[name] ?? []).includes(m.option)).map((m) => `    this.trackModel(this.${m.option}, '${m.option}', (c) => c.${m.option});`);
  const hasMethod = (m) => api.methods.some((x) => x.name === m);
  const templates = TEMPLATES[name];
  const projection = PROJECTION[name];
  const partEntries = Object.entries(projection?.parts ?? {});
  const projectionQueries = [
    ...partEntries.map(([option, dir]) => `protected readonly ${option}Part: Signal<ElementRef<HTMLElement> | undefined> = contentChild(${dir}, { read: ElementRef });`),
    ...(projection?.defaultSlot ? ["protected readonly defaultSlot: Signal<TemplateRef<unknown> | undefined> = viewChild<TemplateRef<unknown>>('slot');"] : []),
  ];
  const projectionOption = (o) => {
    if (projection?.parts?.[o.name]) return `this.${o.name}() ?? this.${o.name}Part()?.nativeElement`;
    if (projection?.defaultSlot === o.name) return `this.${o.name}() ?? this.projectedContent(this.defaultSlot())`;
    return undefined;
  };
  const templateOption = (o) => templates?.options[o.name]?.replace(/\bP\[/g, `Parameters<NonNullable<${O}['${o.name}']>>[`);
  const optionLines = options.map((o) =>
    templateOption(o) ? `            ${o.name}: ${templateOption(o)},` :
    projectionOption(o) ? `            ${o.name}: ${projectionOption(o)},` :
    o.name === 'disabled' && control
      ? `            disabled: this.formDisabled() ? true : this.disabled(),`
      : o.name === 'required' && control
        ? `            required: this.formRequired() ? true : this.required(),`
        : `            ${o.name}: this.${prop(o.name)}(),`,
  );
  const strip = STRIP.filter((a) => options.some((o) => o.name === a));
  const selector = elementSelector(name);
  const exportAs = `aui${cls}`;
  const dir = `Aui${cls}`;
  const omitted = [...(control ? [valueOption] : []), ...(EXCLUDE[name] ?? [])];
  const optionsType = omitted.length ? `Omit<${O}, ${omitted.map((k) => `'${k}'`).join(' | ')}>` : O;
  const styles = styleDeps(name).map((d) => `'../../../components/dist/${d}/style.css'`);
  const angularCore = [
    'ChangeDetectionStrategy',
    'Component',
    ...(control ? ['forwardRef'] : []),
    ...(inputs.some((l) => l.includes('= input')) ? ['input'] : []),
    ...(control || models.length ? ['model'] : []),
    ...(outputs.length ? ['output'] : []),
    ...(templates?.queries.some((q) => q.includes('contentChild(')) || partEntries.length ? ['contentChild'] : []),
    ...(partEntries.length ? ['ElementRef'] : []),
    ...(projection?.defaultSlot ? ['viewChild'] : []),
    ...(templates?.queries.some((q) => q.includes('contentChildren(')) ? ['contentChildren'] : []),
    'ViewEncapsulation',
  ];
  const angularTypes = [
    ...(inputs.some((l) => l.includes('InputSignal<')) ? ['InputSignal'] : []),
    ...(inputs.some((l) => l.includes('InputSignalWithTransform<')) ? ['InputSignalWithTransform'] : []),
    ...(control || models.length ? ['ModelSignal'] : []),
    ...(outputs.length ? ['OutputEmitterRef'] : []),
    ...(templates || projection || stateLines.length ? ['Signal'] : []),
    ...(projection?.defaultSlot ? ['TemplateRef'] : []),
  ];
  const bridgeImports = [
    ...(inputs.some((l) => l.includes('booleanInput')) ? ['booleanInput'] : []),
    control ? 'ControlBridge' : 'ComponentBridge',
    'defined',
    ...(handlers.some((h) => h.includes('emitTo(')) ? ['emitTo'] : []),
  ];

  const lines = [
    `// Generated by scripts/generate-angular.mjs from packages/components/metadata/${name}/api.json. Do not edit.`,
    `import { ${angularCore.join(', ')}, ${angularTypes.map((t) => `type ${t}`).join(', ')} } from '@angular/core';`,
    ...(control ? [`import { ${control.noValidity ? 'NG_VALUE_ACCESSOR' : 'NG_VALIDATORS, NG_VALUE_ACCESSOR'} } from '@angular/forms';`] : []),
    ...(control?.core ? [`import type { ${control.core.join(', ')} } from '@absoluteui/core';`] : []),
    `import { ${cls}, ${[...typeImports].sort().map((t) => `type ${t}`).join(', ')} } from '@absoluteui/components/${name}';`,
    `import { ${bridgeImports.join(', ')} } from '../internal/bridge.js';`,
    ...(templates ? [`import { ${templates.directives.join(', ')} } from '../templates/index.js';`] : []),
    ...(templates?.extraImports ?? []),
    ...(partEntries.length ? [`import { ${partEntries.map(([, d]) => d).join(', ')} } from '${projection.from}';`] : []),
    '',
    `/**`,
    ` * AbsoluteUI ${cls}: \`<${selector}>\`.`,
    ...(control ? [` * Implements ControlValueAccessor${control.noValidity ? '' : ' and Validator (error key `aui`)'}; \`[(${valueOption})]\` without forms.`] : []),
    ...(models.length ? [` * Two-way: ${models.map((m) => `\`[(${m.option})]\``).join(', ')}.`] : []),
    ...(templates ? [` * Templates: ${templates.directives.join(', ')} (\`@absoluteui/angular/templates\`).`] : []),
    ` */`,
    `@Component({`,
    `  selector: '${selector}',`,
    `  exportAs: '${exportAs}',`,
    projection?.defaultSlot ? "  template: '<ng-template #slot><ng-content /></ng-template>'," : `  template: '',`,
    `  styleUrls: [${styles.join(', ')}],`,
    `  styles: ['@layer aui.base{:where(${[selector, ...partEntries.map(([, d]) => d.replace(/[A-Z]/g, (c) => '-' + c.toLowerCase()).slice(1))].join(', ')}){display:block}}'],`,
    `  encapsulation: ViewEncapsulation.None,`,
    `  changeDetection: ChangeDetectionStrategy.OnPush,`,
    // D3: rendered on the server, re-created in the browser (Angular clears the host children).
    `  host: { ngSkipHydration: 'true' },`,
    ...(control
      ? [
          `  providers: [`,
          `    { provide: NG_VALUE_ACCESSOR, useExisting: forwardRef(() => ${dir}), multi: true },`,
          ...(control.noValidity ? [] : [`    { provide: NG_VALIDATORS, useExisting: forwardRef(() => ${dir}), multi: true },`]),
          `  ],`,
        ]
      : []),
    `})`,
    `export class ${dir}${GENERIC[name] ? `<${GENERIC[name]}>` : ''} extends ${control ? `ControlBridge<${C}, ${O}, ${control.value}>` : `ComponentBridge<${C}, ${O}>`} {`,
    ...inputs,
    ...outputs,
    ...stateLines,
    ...(templates?.queries.map((q) => `  ${q}`) ?? []),
    ...projectionQueries.map((q) => `  ${q}`),
    '',
    `  constructor() {`,
    `    super();`,
    `    this.${control ? 'initControl' : 'init'}(`,
    `      {`,
    `        create: (host, options) => ${cls}.create(host, options),`,
    `        configKey: '${api.configKey}',`,
    `        options: () =>`,
    `          defined<${optionsType}>({`,
    ...optionLines,
    `          }),`,
    ...(handlers.length ? [`        events: {`, ...handlers, `        },`] : []),
    ...(strip.length ? [`        strip: [${strip.map((a) => `'${a}'`).join(', ')}],`] : []),
    `      },`,
    ...(control
      ? [
          `      {`,
          `        read: (c) => ${control.read},`,
          `        write: (c, v) => {`,
          `          ${control.write};`,
          `        },`,
          `        event: '${control.event}',`,
          control.noValidity ? `        validity: () => ({ valid: true, message: '' }),` : `        validity: (c) => c.validity,`,
          `        model: this.${valueOption},`,
          ...(hasMethod('reset') ? [`        reset: (c) => {`, `          c.reset();`, `        },`] : []),
          ...(hasMethod('reportValidity') ? [`        report: (c) => {`, `          c.reportValidity();`, `        },`] : []),
          ...(hasMethod('setCustomError') ? [`        customError: (c, message) => {`, `          c.setCustomError(message);`, `        },`] : []),
          `      },`,
        ]
      : []),
    `    );`,
    ...trackedModels,
    `  }`,
    ...methods.flatMap((m) => ['', ...m]),
    `}`,
    ...(EXTRA_EXPORTS[name] ? ['', ...EXTRA_EXPORTS[name]] : []),
    '',
  ];
  return { code: lines.join('\n'), errors };
}

const drift = [];
const all = [...Object.keys(CONTROLS).map((n) => [n, 'control']), ...HOSTS.map((n) => [n, 'host'])];
for (const [name, kind] of all) {
  if (!existsSync(join(meta, name, 'api.json'))) {
    drift.push(`${name}: missing metadata`);
    continue;
  }
  const file = join(out, name, 'index.ts');
  const { code, errors } = render(name, kind);
  drift.push(...errors);
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== code) drift.push(`${name}: packages/angular/src/${name}/index.ts is out of date`);
  } else {
    mkdirSync(join(out, name), { recursive: true });
    writeFileSync(file, code);
  }
}
// Component configuration keys, for the development diagnostic on unknown keys (M8a, D27).
{
  const { readdirSync } = await import('node:fs');
  const keys = [...new Set(readdirSync(meta).filter((n) => existsSync(join(meta, n, 'api.json'))).map((n) => readJson(join(meta, n, 'api.json')).configKey).filter((k) => typeof k === 'string'))].sort();
  const code = [
    '// Generated by scripts/generate-angular.mjs from packages/components/metadata/*/api.json. Do not edit.',
    '/** Component configuration keys (`components: { <key>: ... }`), for development diagnostics. */',
    `export const COMPONENT_CONFIG_KEYS: ReadonlySet<string> = new Set([${keys.map((k) => `'${k}'`).join(', ')}]);`,
    '',
  ].join('\n');
  const file = join(out, 'internal', 'config-keys.ts');
  if (check) {
    if (!existsSync(file) || readFileSync(file, 'utf8') !== code) drift.push('packages/angular/src/internal/config-keys.ts is out of date');
  } else writeFileSync(file, code);
}
if (drift.length) fail([...drift, 'Run: node scripts/generate-angular.mjs']);
console.log(`generate-angular: ${check ? 'up to date' : 'wrote'} (${all.length} components)`);
