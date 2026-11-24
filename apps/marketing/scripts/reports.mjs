// Downloadable PDF reports (docs/PLAN-R4.md C15): accessibility and performance, generated
// from the recorded evidence and shipped metadata with Playwright's page.pdf() (Chromium).
// Stamped with the date, library version, and commit of the recorded run. Output:
// public/reports/{accessibility,performance}-report.pdf (git-ignored, rebuilt with the site).
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { collectStats } from './lib/stats.mjs';
import { cacheDir, escapeHtml as h, publicDir } from './lib/shared.mjs';

const stats = await collectStats();
const ev = stats.evidence;
const outDir = join(publicDir, 'reports');
mkdirSync(outDir, { recursive: true });

const CSS = `
@page { size: A4; margin: 18mm 16mm 20mm; }
* { box-sizing: border-box; }
body { margin: 0; font-family: 'Segoe UI', 'Inter', system-ui, sans-serif; color: #0f172a; font-size: 10pt; line-height: 1.5; }
header { border-bottom: 2px solid #2563eb; padding-bottom: 10pt; margin-bottom: 16pt; }
header p { margin: 2pt 0; color: #475569; }
h1 { font-size: 20pt; margin: 0 0 4pt; letter-spacing: -0.01em; }
h2 { font-size: 13pt; margin: 18pt 0 6pt; color: #1e40af; }
table { width: 100%; border-collapse: collapse; margin: 6pt 0 10pt; font-size: 9pt; }
th, td { text-align: left; padding: 4pt 6pt; border-bottom: 1px solid #e2e8f0; vertical-align: top; }
thead th { background: #f1f5f9; color: #334155; }
td.num, th.num { text-align: right; font-variant-numeric: tabular-nums; }
tr { break-inside: avoid; }
.grid { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8pt; margin: 8pt 0 12pt; }
.tile { border: 1px solid #e2e8f0; border-radius: 6pt; padding: 8pt 10pt; }
.tile b { display: block; font-size: 15pt; }
.tile span { color: #475569; font-size: 8.5pt; }
.note { background: #fdf6ea; border-radius: 6pt; padding: 8pt 10pt; color: #7c2d12; }
.pass { color: #047857; font-weight: 600; }
.fail { color: #b91c1c; font-weight: 600; }
footer { margin-top: 18pt; color: #64748b; font-size: 8pt; }
`;

const stamp = () =>
  ev
    ? `Recorded run: ${h(ev.generatedAt.replace('T', ' ').slice(0, 16))} UTC, commit ${h(ev.commit)}. Library version ${h(stats.version)}.`
    : `No recorded run was available. Library version ${h(stats.version)}.`;
const environment = () =>
  ev
    ? `<table><tbody>
<tr><th>Machine</th><td>${h(ev.environment.cpu)}, ${ev.environment.cores} logical cores, ${ev.environment.memoryGb} GB RAM</td></tr>
<tr><th>System</th><td>${h(ev.environment.os)}, Node.js ${h(ev.environment.node)}</td></tr>
<tr><th>Browser</th><td>${h(ev.environment.browser)}, Playwright ${h(ev.environment.playwright)}</td></tr>
</tbody></table>`
    : '';
const doc = (title, body) => `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${h(title)}</title><style>${CSS}</style></head><body>
<header><h1>${h(title)}</h1><p>AbsoluteUI | Kasadara Technology Solutions Pvt Ltd</p><p>${stamp()}</p></header>
${body}
<footer>Generated from the recorded end-to-end evidence and shipped component metadata. Nothing in this report is hand-typed. Report generated ${h(new Date().toISOString().slice(0, 10))}.</footer>
</body></html>`;

function accessibility() {
  const pairs = stats.contrast.reduce((s, t) => s + t.checked, 0);
  const passed = stats.contrast.reduce((s, t) => s + t.passed, 0);
  const tiles = ev
    ? `<div class="grid">
<div class="tile"><b>${ev.axe.passed} / ${ev.axe.total}</b><span>axe WCAG 2.2 A/AA scans passed</span></div>
<div class="tile"><b>${ev.e2e.passed} / ${ev.e2e.total}</b><span>End-to-end tests passed</span></div>
<div class="tile"><b>${passed} / ${pairs}</b><span>Theme contrast pairs at AA</span></div>
<div class="tile"><b>${stats.components}</b><span>Components with an accessibility contract</span></div>
</div>`
    : '';
  return doc(
    'Accessibility test report',
    `<p>AbsoluteUI targets WCAG 2.2 Level AA and tests it automatically on every release. This report describes that automated testing and its results. It is not a conformance claim for any application built with AbsoluteUI.</p>
${tiles}
<h2>Scope and known limits</h2>
<p class="note">Automated tools detect only part of WCAG failures. No third-party manual audit has been performed yet, and screen-reader behaviour has not been manually verified with NVDA, JAWS, and VoiceOver. A VPAT/ACR is not yet available.</p>
<h2>What is tested on every release</h2>
<table><thead><tr><th>Gate</th><th>What it checks</th></tr></thead><tbody>
<tr><td>axe-core</td><td>WCAG 2.0, 2.1, and 2.2 A and AA rules on every component harness page, in the default, dark, and high-contrast themes, with popups and edit modes open</td></tr>
<tr><td>Keyboard flows</td><td>Documented keyboard matrix per component, focus order, focus return, no traps</td></tr>
<tr><td>Reflow</td><td>No horizontal scrolling at 320 CSS px (WCAG 1.4.10)</td></tr>
<tr><td>Reduced motion</td><td>Transitions and animations removed under prefers-reduced-motion</td></tr>
<tr><td>Forced colors</td><td>Boundaries, focus, and selection stay visible in Windows contrast themes</td></tr>
<tr><td>Contrast</td><td>Every role-token pair of every shipped theme against WCAG 1.4.3 and 1.4.11</td></tr>
<tr><td>Strict CSP</td><td>Every harness page runs with script-src 'self', no inline styles, and Trusted Types enforced</td></tr>
</tbody></table>
<h2>Theme contrast</h2>
<table><thead><tr><th>Theme</th><th class="num">Pairs</th><th class="num">Passed</th><th class="num">Failed</th></tr></thead><tbody>
${stats.contrast.map((t) => `<tr><td>${h(t.theme)}</td><td class="num">${t.checked}</td><td class="num">${t.passed}</td><td class="num ${t.failed ? 'fail' : 'pass'}">${t.failed}</td></tr>`).join('')}
</tbody></table>
<h2>Token-level assessment (Theme Designer engine)</h2>
<p>${h(stats.compliance.statement)}</p>
<table><thead><tr><th>Assessment</th><th class="num">Passed</th><th class="num">Failed</th><th class="num">Warnings</th></tr></thead><tbody>
${stats.compliance.categories.map((c) => `<tr><td>${h(c.label)}</td><td class="num">${c.passed}</td><td class="num">${c.failed}</td><td class="num">${c.warnings}</td></tr>`).join('')}
</tbody></table>
${stats.compliance.advisories.length ? `<p><b>Advisories (not required at AA):</b></p><ul>${stats.compliance.advisories.map((a) => `<li>${h(a.rule)}: ${h(a.message)}, measured ${h(a.measured)} (recommended ${h(a.expected)}).</li>`).join('')}</ul>` : ''}
${ev ? `<h2>Environment</h2>${environment()}` : ''}`,
  );
}

function performance() {
  const rows = ev
    ? ev.performance.measurements
        .map((m) => {
          const headroom = m.budget > 0 ? Math.round((1 - m.value / m.budget) * 100) : 0;
          return `<tr><td>${h(m.suite)}</td><td>${h(m.test)}</td><td>${h(m.label)}</td><td class="num">${m.value < 10 ? m.value.toFixed(2) : m.value.toFixed(1)} ms</td><td class="num">&lt; ${m.budget} ms</td><td class="num ${m.within ? 'pass' : 'fail'}">${headroom}%</td></tr>`;
        })
        .join('')
    : '';
  return doc(
    'Performance test report',
    `<p>Components declare performance budgets in their metadata. The end-to-end suite measures them in a production build under a strict Content Security Policy, one test at a time after all functional tests, and fails the release when a budget is exceeded.</p>
${ev ? `<div class="grid">
<div class="tile"><b>${ev.performance.within} / ${ev.performance.total}</b><span>Measurements within budget</span></div>
<div class="tile"><b>${stats.runtimeDependencies}</b><span>Third-party runtime dependencies</span></div>
<div class="tile"><b>${stats.components}</b><span>Components</span></div>
<div class="tile"><b>${ev.e2e.passed} / ${ev.e2e.total}</b><span>End-to-end tests passed</span></div>
</div>
<p class="note">Times are wall-clock milliseconds in headless Chromium on the machine below. They are comparable across releases on similar hardware, not with numbers published by other libraries.</p>
<h2>Environment</h2>${environment()}
<h2>Every measurement</h2>
<table><thead><tr><th>Suite</th><th>Test</th><th>Measurement</th><th class="num">Measured</th><th class="num">Budget</th><th class="num">Headroom</th></tr></thead><tbody>${rows}</tbody></table>` : '<p class="note">No recorded measurements were available for this report.</p>'}`,
  );
}

const browser = await chromium.launch();
try {
  const page = await browser.newPage();
  for (const [name, html] of [['accessibility', accessibility()], ['performance', performance()]]) {
    await page.setContent(html, { waitUntil: 'load' });
    if (process.argv.includes('--preview')) await page.screenshot({ path: join(cacheDir, `${name}-report.png`), fullPage: true });
    await page.pdf({ path: join(outDir, `${name}-report.pdf`), format: 'A4', printBackground: true, displayHeaderFooter: true, headerTemplate: '<span></span>', footerTemplate: `<div style="font-size:7pt;color:#64748b;width:100%;padding:0 16mm;display:flex;justify-content:space-between"><span>AbsoluteUI ${h(stats.version)} | ${name} report</span><span><span class="pageNumber"></span> / <span class="totalPages"></span></span></div>`, margin: { top: '18mm', bottom: '20mm', left: '16mm', right: '16mm' } });
  }
} finally {
  await browser.close();
}
console.log('reports: accessibility-report.pdf, performance-report.pdf');
