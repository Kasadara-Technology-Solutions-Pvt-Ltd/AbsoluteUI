// Browser support page, generated from docs/browser-support.json (the matrix that
// scripts/check-browser-support.mjs enforces), the web-features dataset, and the e2e evidence.
import { existsSync } from 'node:fs';
import { join } from 'node:path';
import { features as webFeatures } from 'web-features';
import { browserSupport } from '../../../../scripts/browser-support.mjs';
import { cell, contentDir, dataDir, readJson, root, write } from './shared.mjs';

/** Playwright project per tested engine (playwright.config.ts). */
const PROJECTS = { Chromium: 'functional', Firefox: 'firefox', WebKit: 'webkit' };
const ENGINE = { chrome: 'Chromium', edge: 'Chromium', firefox: 'Firefox', safari: 'WebKit', safari_ios: 'WebKit' };

export function browserSupportPage() {
  const { config, used } = browserSupport();
  const dataset = readJson(join(root, 'node_modules', 'web-features', 'package.json')).version;
  const browsers = Object.entries(config.browsers);
  const evidenceFile = join(dataDir, 'evidence.json');
  const ev = existsSync(evidenceFile) ? readJson(evidenceFile) : null;

  const out = [
    '---',
    'title: Browser support',
    'description: The browsers and minimum versions AbsoluteUI supports, how they are tested, and what happens where a newer feature is missing.',
    '---',
    '',
    'AbsoluteUI supports current evergreen browsers from the versions below. It ships no polyfills, and older browsers are not supported.',
    '',
    '## Supported browsers',
    '',
    '| Browser | Minimum version | Tested engine |',
    '|---|---|---|',
    ...browsers.map(([id, b]) => `| ${b.name} | ${b.minimum} | ${ENGINE[id] ?? ''} |`),
    '',
    'Other browsers built on these engines (for example Opera, Brave, Vivaldi, and Samsung Internet on recent Chromium) are expected to work when their engine meets the minimum.',
    '',
    '## How it is tested',
    '',
    cell(config.tested.how),
    '',
  ];
  if (ev) {
    out.push('| Engine | Passed | Skipped (not applicable to the engine) | Failed |', '|---|---|---|---|');
    for (const [engine, project] of Object.entries(PROJECTS)) {
      const runs = ev.tests.filter((t) => t.project === project);
      const count = (status) => runs.filter((t) => t.status === status).length;
      const skipped = count('skipped');
      out.push(runs.length
        ? `| ${engine} | ${count('passed')} | ${skipped} | ${runs.length - count('passed') - skipped} |`
        : `| ${engine} | Not in the recorded run | | |`);
    }
    out.push('', `Recorded ${ev.generatedAt.slice(0, 10)}.`, '');
  }
  if (config.knownDifferences?.length) {
    out.push('## Known differences', '', ...config.knownDifferences.map((d) => `- ${cell(d)}`), '');
  }

  const required = used.filter((f) => !f.fallback);
  const optional = used.filter((f) => f.fallback);
  out.push(
    '## Where the minimum versions come from',
    '',
    `Each minimum is the newest version any required platform feature needs. Versions come from the web-features dataset (${dataset}), and the build fails if the library starts using a newer feature without a fallback.`,
    '',
    `| Feature | ${browsers.map(([, b]) => b.name).join(' | ')} |`,
    `|---|${browsers.map(() => '---').join('|')}|`,
    ...required.map((f) => `| ${cell(f.name)} | ${browsers.map(([id]) => webFeatures[f.id]?.status?.support?.[id] ?? '').join(' | ')} |`),
    '',
  );
  if (optional.length) {
    out.push(
      '## Features with fallbacks',
      '',
      'These newer features are used where the browser has them. Elsewhere the library falls back as described.',
      '',
      '| Feature | Without it |',
      '|---|---|',
      ...optional.map((f) => `| ${cell(f.name)} | ${cell(f.fallback)} |`),
      '',
    );
  }
  out.push(
    '## Time zones',
    '',
    'Time zone rules come from the ICU data built into each browser, so an outdated browser can apply outdated daylight-saving rules.',
    '',
  );
  write(join(contentDir, 'quality', 'browser-support.md'), out.join('\n'));
}
