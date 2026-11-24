// Figures quoted on the marketing site and in the PDF reports (docs/PLAN-R4.md C10, C15).
// Every number comes from recorded evidence or shipped metadata; nothing is hand-typed.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { componentNames, evidenceFile, readJson, root } from './shared.mjs';

function loadEvidence() {
  if (!existsSync(evidenceFile)) return null;
  const ev = readJson(evidenceFile);
  for (const t of ev.tests) if (!t.file.startsWith('tests/')) t.file = `tests/e2e/${t.file}`;
  return ev;
}

const pretty = (label) =>
  label
    .replace(/^(results|r|t|times|m)\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .toLowerCase();

export async function collectStats() {
  const ev = loadEvidence();
  const names = componentNames();
  const version = readJson(join(root, 'packages', 'components', 'package.json')).version;
  // Public modules are the package's subpath exports (`@absoluteui/helpers/date`, ...).
  const helperModules = Object.keys(readJson(join(root, 'packages', 'helpers', 'package.json')).exports ?? {}).filter((k) => /^\.\/[a-z-]+$/.test(k)).length;
  const runtimeDeps = ['core', 'utilities', 'helpers', 'theme', 'icons', 'components']
    .map((p) => Object.keys(readJson(join(root, 'packages', p, 'package.json')).dependencies ?? {}).filter((d) => !d.startsWith('@absoluteui/')))
    .flat().length;

  const theme = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'index.js')).href);
  const designer = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'designer', 'index.js')).href);
  const contrast = Object.values(theme.themes).map((t) => {
    const r = theme.evaluateThemeContrast(t);
    return { theme: t.name, checked: r.passed.length + r.failed.length, passed: r.passed.length, failed: r.failed.length };
  });
  const compliance = designer.assessCompliance(designer.builtInFamily());

  const stats = {
    version,
    components: names.length,
    helperModules,
    runtimeDependencies: runtimeDeps,
    contrast,
    compliance: {
      statement: compliance.statement,
      compliant: compliance.compliant,
      // Findings that are not required at AA (for example AAA pairings in high contrast).
      advisories: compliance.findings.filter((f) => f.status !== 'pass').map((f) => ({ rule: f.rule, message: f.message, measured: String(f.measured), expected: String(f.expected) })),
      categories: compliance.categories.map((c) => ({ label: c.label, passed: c.passed, failed: c.failed, warnings: c.warnings })),
    },
    evidence: null,
  };
  if (ev) {
    const functional = ev.tests.filter((t) => t.project === 'functional');
    const perf = ev.tests.filter((t) => t.measurements.length);
    const measurements = perf.flatMap((t) =>
      t.measurements.map((m) => ({ suite: t.suite || t.file.replace(/^tests\/e2e\//, '').replace(/\.spec\.ts$/, ''), test: t.title, label: pretty(m.label), value: m.value, budget: m.budget, within: m.value < m.budget })),
    );
    const axe = functional.filter((t) => /\baxe\b/i.test(t.title));
    stats.evidence = {
      generatedAt: ev.generatedAt,
      commit: ev.commit,
      environment: ev.environment,
      e2e: { total: functional.length, passed: functional.filter((t) => t.status === 'passed').length, failed: functional.filter((t) => t.status === 'failed').length, skipped: functional.filter((t) => t.status === 'skipped').length },
      axe: { total: axe.length, passed: axe.filter((t) => t.status === 'passed').length },
      performance: { total: measurements.length, within: measurements.filter((m) => m.within).length, measurements },
    };
  }
  return stats;
}
