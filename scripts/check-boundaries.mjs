// docs/PLAN-R9-ANGULAR.md M0: the framework-neutral packages never depend on a framework.
// Fails when neutral source or built output imports Angular, React, or Vue, or names an
// Angular-only concept. Adapters depend on the neutral packages, never the reverse.
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { root, walk, rel, fail, packageNames } from './lib.mjs';

const neutral = ['core', 'utilities', 'helpers', 'services', 'theme', 'icons', 'components'];
const frameworkImport = /(?:from\s*|import\s*\(\s*|import\s+|require\s*\(\s*)['"](@angular\/[^'"]*|react|react-dom(?:\/[^'"]*)?|vue)['"]/;
const angularConcept = /\b(TemplateRef|ViewContainerRef|EmbeddedViewRef|ControlValueAccessor|ChangeDetectorRef|NgZone|InjectionToken)\b/;

const errors = [];
let count = 0;
// R15: nothing depends on the MCP server package.
for (const name of ['core', 'utilities', 'helpers', 'services', 'theme', 'icons', 'components', 'angular', 'react', 'vue'].filter((n) => packageNames.includes(n))) {
  const pkg = JSON.parse(readFileSync(join(root, 'packages', name, 'package.json'), 'utf8'));
  for (const field of ['dependencies', 'peerDependencies', 'devDependencies']) if (pkg[field]?.['@absoluteui/mcp']) errors.push(`${pkg.name} must not depend on @absoluteui/mcp`);
  for (const file of walk(join(root, 'packages', name, 'src'), (f) => /\.(ts|mjs|js)$/.test(f))) if (readFileSync(file, 'utf8').includes('@absoluteui/mcp')) errors.push(`${rel(file)}: imports @absoluteui/mcp`);
}
for (const name of neutral) {
  const files = [
    ...walk(join(root, 'packages', name, 'src'), (f) => /\.(ts|mjs|js)$/.test(f)),
    ...walk(join(root, 'packages', name, 'dist'), (f) => /\.(js|d\.ts)$/.test(f)),
  ];
  for (const file of files) {
    count++;
    const text = readFileSync(file, 'utf8');
    const imp = frameworkImport.exec(text);
    if (imp) errors.push(`${rel(file)}: imports ${imp[1]} (neutral packages must not depend on a framework)`);
    const concept = angularConcept.exec(text);
    if (concept) errors.push(`${rel(file)}: names ${concept[1]} (Angular concept in a neutral package)`);
  }
}
if (errors.length) fail(errors);
console.log(`check:boundaries: ok (${count} files in ${neutral.length} neutral packages)`);
