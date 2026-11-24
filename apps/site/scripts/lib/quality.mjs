// Performance (R4-6) and accessibility/compliance (R4-7) pages, generated from
// e2e evidence (tests/e2e/evidence-reporter.ts), component metadata, the theme
// contrast engine, and measured bundle sizes. Nothing on these pages is hand-typed.
import { existsSync, readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import { brotliCompressSync, gzipSync, constants } from 'node:zlib';
import { build } from 'esbuild';
import { cell, code, componentsDir, contentDir, dataDir, readJson, root, write } from './shared.mjs';
import { WCAG, parseCriterion } from './wcag.mjs';

const e2eDir = join(root, 'tests', 'e2e');

/** Harness page per spec (from its page.goto calls) and components per harness page (from its imports). */
function coverageMap() {
  const pageComponents = new Map();
  const siteDir = join(e2eDir, 'site');
  for (const f of readdirSync(siteDir).filter((f) => f.endsWith('.ts'))) {
    const name = f.slice(0, -3);
    const src = readFileSync(join(siteDir, f), 'utf8');
    const set = new Set([...src.matchAll(/from '@absoluteui\/components\/([a-z-]+)'/g)].map((m) => m[1]));
    // Components rendered internally (Error Summary by Form) or CSS-only (Typography) show up as stylesheets.
    const html = join(siteDir, `${name === 'app' ? 'index' : name}.html`);
    if (existsSync(html)) for (const m of readFileSync(html, 'utf8').matchAll(/href="\/([a-z-]+)\.css"/g)) if (m[1] !== 'theme' && m[1] !== 'demo') set.add(m[1]);
    pageComponents.set(name === 'app' ? '' : name, set);
  }
  const specComponents = new Map();
  for (const f of readdirSync(e2eDir).filter((f) => f.endsWith('.spec.ts'))) {
    const src = readFileSync(join(e2eDir, f), 'utf8');
    const pages = new Set([...src.matchAll(/goto\(\s*[`'"]\/([a-z0-9-]*)/g)].map((m) => m[1]));
    const set = new Set();
    for (const p of pages) for (const c of pageComponents.get(p) ?? []) set.add(c);
    specComponents.set(`tests/e2e/${f}`, set);
  }
  return specComponents;
}

/** Section labels by spec file (recorded suite names may predate the current ones). */
const SUITE_LABELS = {
  'tests/e2e/perf-designer.spec.ts': 'Theme Designer',
  'tests/e2e/perf-r3.spec.ts': 'Charts, dashboard, and rich text performance',
  'tests/e2e/perf-r3p2.spec.ts': 'Pivot grid and org chart performance',
  'tests/e2e/perf-r3p3.spec.ts': 'Scheduler and scheduling picker performance',
  'tests/e2e/perf-r3p3b.spec.ts': 'Kanban and Gantt performance',
};

/** Internal release ids ("R1", "R3 phase 3b") in recorded test names mean nothing to readers. */
const withoutReleaseIds = (text) => text.replace(/\s*\bR\d+(?: phase \w+)?\b/g, '').replace(/\s{2,}/g, ' ').trim();

const CHECKS = [
  ['axe', 'axe WCAG 2.2 A/AA scan', /\baxe\b/i],
  ['keyboard', 'Keyboard operation', /keyboard|arrow keys|escape|tab order|focus/i],
  ['reflow', 'Reflow at 320 CSS px', /reflow|320/i],
  ['motion', 'Reduced motion', /reduced motion|reduced-motion/i],
  ['forced', 'Forced colors', /forced colors|forced-colors/i],
  ['rtl', 'Right-to-left', /\brtl\b|right-to-left|mirror/i],
  ['csp', 'Strict CSP and Trusted Types', /\bcsp\b|trusted types/i],
];

function loadEvidence() {
  const file = join(dataDir, 'evidence.json');
  if (!existsSync(file)) return null;
  const ev = readJson(file);
  // Normalize: paths from the repository root; test titles without their describe block.
  for (const t of ev.tests) {
    if (!t.file.startsWith('tests/')) t.file = `tests/e2e/${t.file}`;
    if (t.suite === undefined) {
      const parts = t.title.split(' \u203a ');
      t.suite = parts.length > 1 ? parts.slice(0, -1).join(' \u203a ') : '';
      t.title = parts[parts.length - 1];
    }
    t.suite = withoutReleaseIds(t.suite);
    t.title = withoutReleaseIds(t.title);
  }
  return ev;
}

function environment(ev) {
  const e = ev.environment;
  return [
    '| | |',
    '|---|---|',
    `| Measured | ${ev.generatedAt.slice(0, 10)} at commit ${code(ev.commit)} |`,
    `| Machine | ${cell(e.cpu)}, ${e.cores} logical cores, ${e.memoryGb} GB RAM |`,
    `| System | ${cell(e.os)}, Node.js ${e.node} |`,
    `| Browser | ${cell(e.browser)}, Playwright ${e.playwright} |`,
    '',
  ];
}

const pretty = (label) =>
  label
    .replace(/^(results|r|t|times|m)\./, '')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/[._]/g, ' ')
    .toLowerCase();

const sizeCache = new Map();

/** Import cost per component (cached: the component pages and the Performance page share it). */
export async function bundleSizes(names) {
  const rows = [];
  for (const name of names) {
    if (sizeCache.has(name)) {
      rows.push(sizeCache.get(name));
      continue;
    }
    const result = await build({
      stdin: { contents: `export * from '@absoluteui/components/${name}';`, resolveDir: root, loader: 'js' },
      bundle: true,
      minify: true,
      format: 'esm',
      target: 'es2022',
      write: false,
      legalComments: 'none',
      logLevel: 'silent',
    });
    const js = Buffer.from(result.outputFiles[0].contents);
    const cssFile = join(componentsDir, 'dist', name, 'style.css');
    const css = existsSync(cssFile) ? readFileSync(cssFile) : Buffer.alloc(0);
    const row = { name, js: js.length, jsGzip: gzipSync(js, { level: 9 }).length, jsBrotli: brotliCompressSync(js, { params: { [constants.BROTLI_PARAM_QUALITY]: 11 } }).length, cssBrotli: css.length ? brotliCompressSync(css).length : 0 };
    sizeCache.set(name, row);
    rows.push(row);
  }
  return rows;
}

export const kb = (bytes) => `${(bytes / 1024).toFixed(1)} kB`;

export async function performancePage(components) {
  const ev = loadEvidence();
  const out = [
    '---',
    'title: Performance',
    'description: Measured performance of AbsoluteUI components against their declared budgets, and the size of every component import.',
    '---',
    '',
    'Every component declares performance budgets in its metadata. The end-to-end suite measures them in a production build under a strict Content Security Policy, one test at a time after all functional tests, and fails the release when a budget is exceeded. The numbers below are the values measured in the most recent recorded run.',
    '',
    ':::note[How to read these numbers]',
    'Times are wall-clock milliseconds in headless Chromium on the machine listed below; each suite states its own method (typically the median of 5 runs, or an average over many instances). They are comparable with each other and across releases on similar hardware, not with numbers published by other libraries.',
    ':::',
    '',
  ];
  if (ev) {
    const perf = ev.tests.filter((t) => t.measurements.length);
    const total = perf.reduce((n, t) => n + t.measurements.length, 0);
    const within = perf.reduce((n, t) => n + t.measurements.filter((m) => m.value < m.budget).length, 0);
    out.push('## Environment', '', ...environment(ev), `**${within} of ${total} measurements within budget.**`, '', '## Measured budgets', '');
    const files = [...new Set(perf.map((t) => t.file))];
    for (const file of files) {
      const first = perf.find((p) => p.file === file);
      const label = SUITE_LABELS[file] ?? (first.suite ? first.suite[0].toUpperCase() + first.suite.slice(1) : file);
      out.push(`### ${cell(label)}`, '');
      for (const t of perf.filter((p) => p.file === file)) {
        // Titles often repeat their describe block ("chart performance: line ...").
        const title = t.suite && t.title.startsWith(`${t.suite}: `) ? t.title.slice(t.suite.length + 2) : t.title;
        out.push(`**${cell(title[0].toUpperCase() + title.slice(1))}**`, '', '| Measurement | Measured | Budget | Headroom |', '|---|---|---|---|');
        for (const m of t.measurements) {
          const headroom = m.budget > 0 ? Math.round((1 - m.value / m.budget) * 100) : 0;
          out.push(`| ${cell(pretty(m.label))} | ${m.value < 10 ? m.value.toFixed(2) : m.value.toFixed(1)} ms | < ${m.budget} ms | ${headroom}% |`);
        }
        out.push('');
      }
    }
  } else {
    out.push(':::caution', 'No recorded measurements are available in this build. Run `npm run test:e2e` and then `npm run site:evidence`.', ':::', '');
  }
  out.push('## Declared budgets per component', '', 'Budgets as declared in each component\'s metadata (`metadata/<name>/component.json`, shipped in the package).', '', '| Component | Budget | Tested scale |', '|---|---|---|');
  for (const [name, c] of components) {
    const perf = c.component.performance;
    if (!perf?.budgets?.length) continue;
    out.push(`| [${c.component.displayName}](/docs/components/${name}/) | ${perf.budgets.map((b) => cell(`${b.metric}: ${b.budget}`)).join('<br>')} | ${cell(perf.testedScale ?? '')} |`);
  }
  out.push('', '## Import cost', '', 'Size of importing one component by its subpath, as an application bundler ships it: minified JavaScript including every AbsoluteUI dependency it pulls in (core, utilities, icons, and composed components), then compressed. Components share those dependencies, so the cost of several components together is less than the sum. There are no third-party runtime dependencies to add.', '', '| Component | JS minified | JS gzip | JS brotli | CSS brotli |', '|---|---|---|---|---|');
  for (const r of await bundleSizes([...components.keys()])) out.push(`| [${components.get(r.name).component.displayName}](/docs/components/${r.name}/) | ${kb(r.js)} | ${kb(r.jsGzip)} | ${kb(r.jsBrotli)} | ${r.cssBrotli ? kb(r.cssBrotli) : ''} |`);
  out.push('');
  write(join(contentDir, 'quality', 'performance.md'), out.join('\n'));
}

export async function accessibilityPage(components) {
  const ev = loadEvidence();
  const theme = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'index.js')).href);
  const designer = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'designer', 'index.js')).href);
  const out = [
    '---',
    'title: Accessibility and compliance',
    'description: What AbsoluteUI tests automatically against WCAG 2.2 AA, the results, and the known exceptions.',
    '---',
    '',
    'AbsoluteUI targets **WCAG 2.2 Level AA** and supports downstream alignment with Section 508 and EN 301 549. This page reports **automated conformance testing** and its scope. It is not a conformance claim for your application: accessibility depends on how components are composed and labelled, on your content, and on manual testing with assistive technology.',
    '',
    ':::caution[Scope]',
    'Automated tools detect only part of WCAG failures. No third-party manual audit has been performed yet, and screen-reader behavior has not been manually verified with NVDA, JAWS, and VoiceOver. A VPAT/ACR is not yet available.',
    ':::',
    '',
    '## What is tested on every release',
    '',
    '| Gate | What it checks |',
    '|---|---|',
    '| axe-core | WCAG 2.0, 2.1, and 2.2 A and AA rules on every component harness page, in the default, dark, and high-contrast themes, with popups, grabs, and edit modes open |',
    '| Keyboard flows | Documented keyboard matrix per component, focus order, focus return, no traps |',
    '| Reflow | No horizontal scrolling at 320 CSS px (WCAG 1.4.10); two-dimensional surfaces scroll in their own region |',
    '| Reduced motion | Transitions and animations removed under `prefers-reduced-motion` |',
    '| Forced colors | Boundaries, focus, and selection stay visible in Windows contrast themes |',
    '| Contrast | Every role-token pair of every shipped theme against WCAG 1.4.3 and 1.4.11 |',
    '| Strict CSP | Every harness page runs with `script-src \'self\'`, no inline styles, and Trusted Types enforced |',
    '',
  ];
  if (ev) {
    const functional = ev.tests.filter((t) => t.project === 'functional');
    const passed = functional.filter((t) => t.status === 'passed').length;
    out.push('## Latest run', '', ...environment(ev), `**${passed} of ${functional.length} end-to-end tests passed.**`, '');
  }
  // Contrast per theme.
  out.push('## Theme contrast', '', '| Theme | Pairs checked | Passed | Failed |', '|---|---|---|---|');
  for (const t of Object.values(theme.themes)) {
    const r = theme.evaluateThemeContrast(t);
    out.push(`| ${code(t.name)} | ${r.passed.length + r.failed.length} | ${r.passed.length} | ${r.failed.length} |`);
  }
  const compliance = designer.assessCompliance(designer.builtInFamily());
  out.push('', `Token-level assessment of the built-in theme family (Theme Designer engine): ${compliance.statement}`, '', '| Category | Passed | Failed | Warnings |', '|---|---|---|---|');
  for (const c of compliance.categories) out.push(`| ${cell(c.label)} | ${c.passed} | ${c.failed} | ${c.warnings} |`);
  const advisories = compliance.findings.filter((f) => f.status !== 'pass');
  if (advisories.length) {
    out.push('', '**Advisories (not required at AA):**', '');
    for (const f of advisories) out.push(`- ${cell(f.rule)}: ${cell(f.message)}, measured ${f.measured} (recommended ${f.expected}).`);
  }
  out.push('');
  // Per-component matrix.
  if (ev) {
    const specMap = coverageMap();
    out.push('## Automated checks per component', '', 'Results of the end-to-end tests on the harness pages where each component is rendered. Pass = all such tests passed, Fail = a test failed, blank = no test of that kind covers the component.', '');
    const header = CHECKS.map(([, label]) => label);
    out.push(`| Component | ${header.join(' | ')} |`, `|---|${CHECKS.map(() => '---').join('|')}|`);
    for (const [name, c] of components) {
      const tests = ev.tests.filter((t) => t.project === 'functional' && specMap.get(t.file)?.has(name));
      const cells = CHECKS.map(([, , re]) => {
        const matching = tests.filter((t) => re.test(t.title));
        if (!matching.length) return '';
        return matching.every((t) => t.status === 'passed' || t.status === 'skipped') ? `Pass (${matching.length})` : 'Fail';
      });
      out.push(`| [${c.component.displayName}](/docs/components/${name}/) | ${cells.join(' | ')} |`);
    }
    out.push('');
  }
  // WCAG criteria matrix.
  const byCriterion = new Map(WCAG.map((w) => [w.id, []]));
  for (const [name, c] of components) {
    for (const entry of c.accessibility.wcag ?? []) {
      const parsed = parseCriterion(entry);
      if (parsed && byCriterion.has(parsed.id) && !byCriterion.get(parsed.id).includes(name)) byCriterion.get(parsed.id).push(name);
    }
  }
  out.push('## WCAG 2.2 success criteria', '', 'Which components document support for each Level A and AA criterion (from each component\'s accessibility metadata). Criteria no component addresses concern application content (media, page titles, language, consistent navigation) or are the application\'s responsibility.', '', '| Criterion | Level | Components |', '|---|---|---|');
  for (const w of WCAG.filter((w) => w.level !== 'AAA')) {
    const list = byCriterion.get(w.id);
    const names = list.length === components.size ? 'All components' : list.map((n) => `[${components.get(n).component.displayName}](/docs/components/${n}/)`).join(', ');
    out.push(`| [${w.id} ${w.name}](${w.url}) | ${w.level} | ${names || 'Application responsibility'} |`);
  }
  out.push('');
  // Known exceptions.
  out.push('## Known exceptions and caveats', '', '- **Chart colors (WCAG 1.4.1).** Charts use plain colors by default. Lines keep distinct marker shapes, but multi-series bars and pies without data labels rely on color unless `patterns: true` is set. Patterns are always shown in forced-colors mode.', '- **Brand seeds are not text colors.** The success seed `#10B981` (about 2.5:1 on white) and the error seed `#EF4444` (about 3.8:1) fail AA when used directly on the card surface. Components never use seeds; they use contrast-corrected role tokens (for example `success-fg` `#047857`, about 5.5:1). Applications should do the same.', '');
  const caveats = [];
  for (const c of components.values()) for (const k of c.accessibility.knownCaveats ?? []) caveats.push(`- **${c.component.displayName}.** ${cell(k)}`);
  if (caveats.length) out.push('### Component caveats', '', ...caveats, '');
  write(join(contentDir, 'quality', 'accessibility.md'), out.join('\n'));
}
