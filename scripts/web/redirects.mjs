// Redirect-only sites for the retired domains (docs/PLAN-ONE-SITE.md OS-12). Each is a small folder
// deployed to the domain's existing Azure Static Web App, replacing that app's content:
//   dist/redirect-docs      aui-docs.kasadara.com/x      -> https://aui.kasadara.com/docs/x
//                           (/docs/x stays /docs/x; old /examples/... becomes /docs/examples/...)
//   dist/redirect-designer  aui-designer.kasadara.com/x  -> https://aui.kasadara.com/designer/x
// Static Web Apps documents fixed-path redirects only (no wildcard capture into the destination;
// https://learn.microsoft.com/en-us/azure/static-web-apps/configuration), so the root path gets a
// 301 from the configuration, and every other path is answered by a fallback page whose script
// sends the visitor to the same path on the new site (location.replace keeps query and hash).
// Usage: node scripts/web/redirects.mjs [--check]   (npm run web:redirects)
import { mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const SITE = 'https://aui.kasadara.com';

export const REDIRECTS = [
  { name: 'docs', host: 'aui-docs.kasadara.com', section: '/docs', fixed: { '/': '/docs/' } },
  { name: 'designer', host: 'aui-designer.kasadara.com', section: '/designer', fixed: { '/': '/designer/', '/frame.html': '/designer/frame.html' } },
];

/** New path for an old path (the same function runs in the fallback page). */
export function mapPath(section, path) {
  return path === section || path.startsWith(`${section}/`) ? path : `${section}${path}`;
}

const HEADERS = {
  'Content-Security-Policy': "default-src 'none'; script-src 'self'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'X-Robots-Tag': 'noindex',
  'Cache-Control': 'no-cache',
};

function files(r) {
  const config = {
    routes: Object.entries(r.fixed).map(([from, to]) => ({ route: from, redirect: `${SITE}${to}`, statusCode: 301 })),
    navigationFallback: { rewrite: '/index.html', exclude: ['/redirect.js'] },
    responseOverrides: { 404: { rewrite: '/index.html' } },
    globalHeaders: HEADERS,
  };
  const script = [
    `// ${r.host} moved to ${SITE}${r.section}/ (docs/PLAN-ONE-SITE.md OS-12).`,
    `const section = ${JSON.stringify(r.section)};`,
    mapPath.toString(),
    `location.replace(${JSON.stringify(SITE)} + mapPath(section, location.pathname) + location.search + location.hash);`,
    '',
  ].join('\n');
  const html = `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="robots" content="noindex">
<title>AbsoluteUI has moved</title>
<link rel="canonical" href="${SITE}${r.section}/">
<script type="module" src="/redirect.js"></script>
</head>
<body>
<p>This page moved to <a href="${SITE}${r.section}/">${SITE.replace('https://', '')}${r.section}/</a>.</p>
</body>
</html>
`;
  return { 'staticwebapp.config.json': `${JSON.stringify(config, null, 2)}\n`, 'redirect.js': script, 'index.html': html };
}

function check() {
  const cases = [
    ['/docs', '/', '/docs/'],
    ['/docs', '/docs/components/button/', '/docs/components/button/'],
    ['/docs', '/examples/button/basic.html', '/docs/examples/button/basic.html'],
    ['/docs', '/pagefind/pagefind.js', '/docs/pagefind/pagefind.js'],
    ['/designer', '/', '/designer/'],
    ['/designer', '/frame.html', '/designer/frame.html'],
  ];
  return cases.filter(([s, from, to]) => mapPath(s, from) !== to).map(([s, from, to]) => `${s}: ${from} -> ${mapPath(s, from)}, expected ${to}`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = check();
  if (problems.length) {
    console.error(`web:redirects: ${String(problems.length)} problem(s)\n  ${problems.join('\n  ')}`);
    process.exit(1);
  }
  if (!process.argv.includes('--check')) {
    for (const r of REDIRECTS) {
      const dir = join(root, 'dist', `redirect-${r.name}`);
      rmSync(dir, { recursive: true, force: true });
      mkdirSync(dir, { recursive: true });
      for (const [name, text] of Object.entries(files(r))) writeFileSync(join(dir, name), text);
    }
  }
  console.log(`web:redirects: ok (${REDIRECTS.map((r) => `${r.host} -> ${SITE}${r.section}/`).join(', ')}${process.argv.includes('--check') ? ', mapping checked' : '; dist/redirect-docs, dist/redirect-designer'})`);
}
