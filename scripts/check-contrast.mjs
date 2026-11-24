// SPEC section 9.1.2: contrast release gate over every role-token pair of every shipped theme.
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import * as sass from 'sass';
import { transform } from 'esbuild';
import { root, fail } from './lib.mjs';

const { themes, evaluateThemeContrast } = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'index.js')).href);

const errors = [];
let checked = 0;
for (const theme of Object.values(themes)) {
  const report = evaluateThemeContrast(theme);
  checked += report.passed.length + report.failed.length;
  for (const e of report.errors) errors.push(e);
  for (const f of report.failed) {
    errors.push(`${theme.name}: ${f.pair.foreground} on ${f.pair.background} = ${f.ratio}:1 (needs ${f.required}:1, ${f.rule}, ${f.pair.usage}). ${f.remediation}`);
  }
}
// SPEC section 10.5: the built-in family must pass every required Theme Designer compliance rule,
// including component-token pairs, focus, and target size, in every mode.
const { assessCompliance, builtInFamily } = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'designer', 'index.js')).href);
const report = assessCompliance(builtInFamily());
for (const f of report.findings) {
  if (f.required && f.status !== 'pass' && f.status !== 'warn') errors.push(`compliance ${f.id}: ${f.message} = ${f.measured ?? 'not measurable'} (needs ${f.expected ?? '?'}, ${f.rule}). ${f.remediation ?? ''}`);
}
// SPEC section 10.6: exported SCSS compiles and exported JS/TS parse.
{
  const { toScss, toTypeScript, packageFiles } = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'designer', 'index.js')).href);
  const family = builtInFamily();
  try {
    sass.compileString(`${toScss(family)}
@use 'sass:map';
.x { a: map.get($aui-theme-absolute-default-modes, 'dark', 'tokens', 'color-text'); }`);
  } catch (e) {
    errors.push(`exported SCSS does not compile: ${e.message}`);
  }
  for (const [code, loader] of [[toTypeScript(family), 'ts'], [packageFiles(family).find((f) => f.path === 'index.js').content, 'js']]) {
    try {
      await transform(code, { loader, format: 'esm' });
    } catch (e) {
      errors.push(`exported ${loader} does not parse: ${e.message}`);
    }
  }
}
if (errors.length) fail(errors);
const advisories = report.findings.filter((f) => !f.required && f.status !== 'pass').length;
console.log(`check:contrast: ok (${checked} pairs across ${Object.keys(themes).length} themes; compliance ${report.findings.length} findings, 0 required failures, ${advisories} advisories)`);
