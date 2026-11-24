// SPEC section 20, section 21, section 29: AI-readable metadata and documentation completeness gate.
// Validates metadata against its JSON Schemas and cross-checks it against the code:
// runtime config options, SCSS token usage, type-checked examples, and doc sections.
import { execFileSync } from 'node:child_process';
import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { root, readJson, fail, walk, packageNames } from './lib.mjs';

const componentsDir = join(root, 'packages', 'components');
const metaDir = join(componentsDir, 'metadata');
const docsDir = join(componentsDir, 'docs');
const COMPONENTS = ['button', 'combobox', 'dialog', 'date-input', 'text-input', 'select', 'form', 'form-field', 'error-summary', 'validation-message', 'textarea', 'number-input', 'checkbox', 'checkbox-group', 'radio-group', 'switch', 'popover', 'tooltip', 'menu', 'drawer', 'tabs', 'breadcrumb', 'pagination', 'alert', 'inline-message', 'toast', 'progress-bar', 'spinner', 'skeleton', 'accordion', 'button-group', 'layout', 'card', 'typography', 'calendar', 'date-picker', 'time-picker', 'date-time-picker', 'data-table', 'date-range-picker', 'month-picker', 'year-picker', 'quarter-picker', 'duration-picker', 'file-upload', 'upload-queue', 'password-input', 'otp-input', 'password-strength-meter', 'session-warning-dialog', 'stepper', 'menu-bar', 'context-menu', 'sidebar', 'hover-card', 'bottom-sheet', 'sortable-list', 'line-chart', 'bar-chart', 'pie-chart', 'sparkline', 'scatter-chart', 'combo-chart', 'waterfall-chart', 'histogram', 'heatmap', 'gauge', 'radar-chart', 'treemap', 'funnel-chart', 'box-plot', 'bullet-chart', 'dashboard', 'dashboard-grid', 'dashboard-widget', 'stat-card', 'rich-text-editor', 'pivot-grid', 'org-chart', 'business-calendar', 'recurrence-picker', 'schedule-picker', 'scheduler', 'kanban', 'gantt', 'multi-select', 'data-grid', 'badge', 'kbd', 'avatar', 'avatar-group', 'fieldset', 'collapsible', 'toggle-group', 'tag-group', 'slider', 'scroll-area', 'carousel', 'virtual-list', 'splitter', 'empty-state', 'chat', 'prompt-input', 'schema-form', 'form-builder', 'color-picker', 'rating', 'transfer-list', 'cascader', 'mention-input', 'signature-pad', 'masked-input', 'diagram', 'tree-view', 'tree-select', 'command-palette', 'candlestick-chart', 'network-graph', 'calendar-heatmap', 'timeline', 'tour', 'image-viewer', 'code-viewer', 'file-manager', 'discussion'];
// Entry points documented without metadata (pages built by apps/site from docs and .d.ts).
const ADDON_DOCS = ['chart-export', 'org-chart-export', 'data-grid-editors', 'data-grid-accessories', 'data-grid-export', 'data-grid-pdf', 'data-grid-formulas', 'data-grid-charts', 'data-grid-schema'];
const FILES = ['component', 'api', 'accessibility', 'tokens', 'examples'];

/** SPEC section 20.1: the 37 mandatory documentation sections. */
export const DOC_SECTIONS = [
  'Purpose', 'Anatomy', 'When to use', 'When not to use', 'Public properties', 'Methods', 'Events',
  'Slots/content areas', 'CSS parts/hooks', 'Design tokens', 'States', 'State transitions', 'Keyboard matrix',
  'ARIA contract', 'Accessibility notes', 'Responsive behavior', 'RTL behavior', 'Theme behavior',
  'Global configuration support', 'Component configuration support', 'Timezone behavior', 'Icon customization points',
  'Security behavior', 'Data handling behavior', 'Performance characteristics', 'Supported data scale', 'Usage examples',
  'Edge cases', 'Error behavior', 'Known limitations', 'Unsupported scenarios', 'TypeScript definitions',
  'Vanilla JS example', 'Angular example', 'React example', 'Vue example', 'Web Component-style usage example',
];

const errors = [];

function typeOf(v) {
  if (v === null) return 'null';
  if (Array.isArray(v)) return 'array';
  if (Number.isInteger(v)) return 'integer';
  return typeof v;
}

/** Minimal JSON Schema subset: type, required, properties, items, enum. */
function validate(schema, value, path) {
  if (schema.type) {
    const allowed = Array.isArray(schema.type) ? schema.type : [schema.type];
    const actual = typeOf(value);
    const ok = allowed.some((t) => t === actual || (t === 'number' && actual === 'integer'));
    if (!ok) {
      errors.push(`${path}: expected ${allowed.join('|')}, got ${actual}`);
      return;
    }
  }
  if (schema.enum && !schema.enum.some((e) => JSON.stringify(e) === JSON.stringify(value))) errors.push(`${path}: not in enum`);
  if (schema.required) for (const key of schema.required) if (!(key in value)) errors.push(`${path}: missing "${key}"`);
  if (schema.properties && typeOf(value) === 'object') {
    for (const [key, sub] of Object.entries(schema.properties)) if (key in value) validate(sub, value[key], `${path}.${key}`);
    for (const key of Object.keys(value)) if (!(key in schema.properties)) errors.push(`${path}: unknown property "${key}"`);
  }
  if (schema.items && Array.isArray(value)) value.forEach((item, i) => validate(schema.items, item, `${path}[${i}]`));
}

const schemas = Object.fromEntries(FILES.map((f) => [f, readJson(join(metaDir, 'schema', `${f}.schema.json`))]));
const { requiredTokenNames, componentTokenNames, getComponentToken } = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'index.js')).href);

/** Tokens referenced inside each theme SCSS mixin, so indirect token usage is documented too. */
/** Global tokens a stylesheet uses: `token('x')`, and `icon-size('sm')`, which reads `icon-size-sm` (docs/PLAN-R8.md D5). */
const tokensIn = (scss) => [...[...scss.matchAll(/(?<![\w-])token\('([a-z0-9-]+)'\)/g)].map((m) => m[1]), ...[...scss.matchAll(/(?<![\w-])icon-size\('([a-z]+)'\)/g)].map((m) => `icon-size-${m[1]}`)];

/** Component tokens a stylesheet uses: `ctoken('chart', 'grid-color')` (also inside theme mixins). */
const componentTokensIn = (scss) => [...scss.matchAll(/ctoken\('([a-z0-9-]+)', '([a-z0-9-]+)'\)/g)].map((m) => `${m[1]}-${m[2]}`);

const mixinTokens = new Map();
const mixinComponentTokens = new Map();
{
  const mixins = readFileSync(join(root, 'packages', 'theme', 'src', 'scss', '_mixins.scss'), 'utf8');
  for (const block of mixins.split(/^@mixin /m).slice(1)) {
    const mixinName = /^([a-z-]+)/.exec(block)?.[1];
    if (mixinName) {
      mixinTokens.set(mixinName, tokensIn(block));
      mixinComponentTokens.set(mixinName, componentTokensIn(block));
    }
  }
}

const examplesDir = join(root, '.cache', 'examples');
rmSync(examplesDir, { recursive: true, force: true });
mkdirSync(examplesDir, { recursive: true });
let exampleCount = 0;
const reactExamplesDir = join(root, '.cache', 'examples-react');
rmSync(reactExamplesDir, { recursive: true, force: true });
mkdirSync(reactExamplesDir, { recursive: true });
let reactExampleCount = 0;

for (const name of COMPONENTS) {
  const meta = {};
  for (const file of FILES) {
    const path = join(metaDir, name, `${file}.json`);
    if (!existsSync(path)) {
      errors.push(`${name}: missing metadata/${name}/${file}.json`);
      continue;
    }
    meta[file] = readJson(path);
    validate(schemas[file], meta[file], `${name}/${file}.json`);
  }
  if (!meta.api || !meta.tokens || !meta.examples || !meta.accessibility) continue;

  // Runtime config options must match the documented globally-configurable options.
  const mod = await import(pathToFileURL(join(componentsDir, 'dist', name, 'index.js')).href);
  const handle = mod[`${meta.api.configKey}Config`];
  if (!handle) {
    errors.push(`${name}: dist does not export ${meta.api.configKey}Config`);
  } else {
    const documented = meta.api.options.filter((o) => o.globallyConfigurable).map((o) => o.name).sort();
    const runtime = [...handle.optionNames].sort();
    if (JSON.stringify(documented) !== JSON.stringify(runtime)) {
      errors.push(`${name}: globally configurable options drifted. docs=[${documented}] runtime=[${runtime}]`);
    }
    const inheritedDocs = meta.api.options.filter((o) => o.inheritedFromCommon).map((o) => o.name).sort();
    if (JSON.stringify(inheritedDocs) !== JSON.stringify([...handle.inheritedOptionNames].sort())) {
      errors.push(`${name}: inherited common options drifted. docs=[${inheritedDocs}] runtime=[${[...handle.inheritedOptionNames].sort()}]`);
    }
  }

  // Tokens documented must equal tokens used by the component stylesheet, and exist in the theme.
  // Shared internal partials (`@use '../internal/<partial>'`) count as the component's own styles.
  const own = readFileSync(join(componentsDir, 'src', name, 'style.scss'), 'utf8');
  const partials = [...own.matchAll(/@use '\.\.\/internal\/([a-z-]+)'/g)].map((m) => readFileSync(join(componentsDir, 'src', 'internal', `_${m[1]}.scss`), 'utf8'));
  const scss = [own, ...partials].join('\n');
  const direct = tokensIn(scss);
  const included = [...scss.matchAll(/@include aui\.([a-z-]+)/g)].map((m) => m[1]);
  const viaMixins = included.flatMap((mixin) => mixinTokens.get(mixin) ?? []);
  // Component tokens (SPEC section 10.2): `ctoken('button', 'radius')` also consumes its global fallback.
  // Shared mixins count too (the `chart` tokens of `chart-chrome`, R20-15).
  const componentUsed = [...new Set([...componentTokensIn(scss), ...included.flatMap((mixin) => mixinComponentTokens.get(mixin) ?? [])])].sort();
  const fallbacks = componentUsed.map((n) => getComponentToken(n)?.fallback).filter((f) => f !== undefined);
  const used = [...new Set([...direct, ...viaMixins, ...fallbacks])].sort();
  for (const n of componentUsed) if (!componentTokenNames.includes(n)) errors.push(`${name}: unknown component token ${n}`);
  const documentedComponentTokens = [...(meta.tokens.componentTokens ?? [])].sort();
  if (JSON.stringify(componentUsed) !== JSON.stringify(documentedComponentTokens)) {
    errors.push(`${name}: tokens.json componentTokens drifted from style.scss. missing=[${componentUsed.filter((t) => !documentedComponentTokens.includes(t))}] extra=[${documentedComponentTokens.filter((t) => !componentUsed.includes(t))}]`);
  }
  // Every registered component token of this component must be used by its stylesheet.
  const registered = componentTokenNames.filter((n) => getComponentToken(n)?.component === name);
  for (const n of registered) if (!componentUsed.includes(n)) errors.push(`${name}: registered component token ${n} is not used by style.scss`);
  const documentedTokens = [...meta.tokens.tokens].sort();
  if (JSON.stringify(used) !== JSON.stringify(documentedTokens)) {
    errors.push(`${name}: tokens.json drifted from style.scss. missing=[${used.filter((t) => !documentedTokens.includes(t))}] extra=[${documentedTokens.filter((t) => !used.includes(t))}]`);
  }
  for (const t of documentedTokens) if (!requiredTokenNames.includes(t)) errors.push(`${name}: unknown token ${t}`);

  if (meta.accessibility.keyboard.length === 0) errors.push(`${name}: keyboard matrix is empty`);
  if (meta.examples.examples.length === 0) errors.push(`${name}: no examples`);
  for (const ex of meta.examples.examples) {
    writeFileSync(join(examplesDir, `${name}-${ex.id}.ts`), `${ex.code}\nexport {};\n`);
    exampleCount++;
  }

  // Documentation completeness: every mandatory section heading present.
  const docPath = join(docsDir, `${name}.md`);
  if (!existsSync(docPath)) errors.push(`${name}: missing docs/${name}.md`);
  else {
    const doc = readFileSync(docPath, 'utf8');
    const headings = new Set([...doc.matchAll(/^##\s+(?:\d+\.\s+)?(.+?)\s*$/gm)].map((m) => m[1]));
    // The React example (section 35) is type-checked against the adapter too (SPEC section 22).
    const react = /^##\s+(?:\d+\.\s+)?React example\n+```tsx\n([\s\S]*?)\n```/m.exec(doc);
    if (react) {
      writeFileSync(join(reactExamplesDir, `${name}.tsx`), `${react[1]}\n`);
      reactExampleCount++;
    }
    for (const section of DOC_SECTIONS) if (!headings.has(section)) errors.push(`${name}: docs missing section "${section}"`);
    for (const n of registered) if (!doc.includes(`\`--aui-${n}\``)) errors.push(`${name}: docs do not document component token --aui-${n}`);
  }
}

// Add-on docs (no metadata): their complete TypeScript snippets (fences that start with an import) type-check too.
for (const name of ADDON_DOCS) {
  const docPath = join(docsDir, `${name}.md`);
  if (!existsSync(docPath)) {
    errors.push(`${name}: missing docs/${name}.md`);
    continue;
  }
  [...readFileSync(docPath, 'utf8').replace(/\r\n/g, '\n').matchAll(/```ts\n(import [\s\S]*?)```/g)].forEach((m, i) => {
    writeFileSync(join(examplesDir, `addon-${name}-${String(i + 1)}.ts`), `${m[1]}\nexport {};\n`);
    exampleCount++;
  });
}

// Component tokens (SPEC section 10.2) must not collide with custom properties components set themselves.
// Exception: the chart `theme` option (internal/chart/style.ts) writes the `chart` tokens on one
// chart host on purpose, as a per-instance override of the theme values (R20-15).
{
  const instanceOverrides = join('internal', 'chart', 'style.ts');
  const literal = new Set(walk(join(componentsDir, 'src'), (f) => /\.(ts|scss)$/.test(f) && !f.endsWith(instanceOverrides)).flatMap((f) => [...readFileSync(f, 'utf8').matchAll(/--aui-([a-z0-9-]+)/g)].map((m) => m[1])));
  for (const n of componentTokenNames) if (literal.has(n)) errors.push(`component token --aui-${n} collides with a custom property set in component source`);
}

// Examples must type-check under strict settings against the public API (§21.3).
writeFileSync(join(examplesDir, 'tsconfig.json'), JSON.stringify({
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    noEmit: true,
    paths: {
      '@absoluteui/core': ['../../packages/core/src/index.ts'],
      '@absoluteui/utilities': ['../../packages/utilities/src/index.ts'],
      '@absoluteui/theme': ['../../packages/theme/src/index.ts'],
      '@absoluteui/icons': ['../../packages/icons/src/index.ts'],
      '@absoluteui/components/*': ['../../packages/components/src/*/index.ts'],
    },
  },
  include: ['*.ts'],
}, null, 2));
try {
  execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(examplesDir, 'tsconfig.json')], { encoding: 'utf8' });
} catch (e) {
  errors.push(`examples failed to type-check:\n${e.stdout ?? e.message}`);
}

writeFileSync(join(reactExamplesDir, 'tsconfig.json'), JSON.stringify({
  extends: '../../tsconfig.base.json',
  compilerOptions: {
    noEmit: true,
    jsx: 'react-jsx',
    paths: {
      '@absoluteui/core': ['../../packages/core/src/index.ts'],
      '@absoluteui/utilities': ['../../packages/utilities/src/index.ts'],
      '@absoluteui/theme': ['../../packages/theme/src/index.ts'],
      '@absoluteui/icons': ['../../packages/icons/src/index.ts'],
      '@absoluteui/components/*': ['../../packages/components/src/*/index.ts'],
      '@absoluteui/react/*': ['../../packages/react/src/*/index.ts'],
    },
  },
  include: ['*.tsx'],
}, null, 2));
// The public source snapshot has no React adapter (scripts/export-public.mjs): its doc examples are checked here only.
if (packageNames.includes('react')) {
  try {
    execFileSync(process.execPath, [join(root, 'node_modules', 'typescript', 'bin', 'tsc'), '-p', join(reactExamplesDir, 'tsconfig.json')], { encoding: 'utf8' });
  } catch (e) {
    errors.push(`React doc examples failed to type-check:\n${e.stdout ?? e.message}`);
  }
} else reactExampleCount = 0;

if (errors.length) fail(errors);
console.log(`check:metadata: ok (${COMPONENTS.length} components, ${exampleCount} type-checked examples, ${reactExampleCount} type-checked React doc examples, ${DOC_SECTIONS.length} doc sections each)`);
