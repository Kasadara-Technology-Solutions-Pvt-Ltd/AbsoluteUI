// One website (docs/PLAN-ONE-SITE.md OS-8 to OS-11): assembles dist/web from the three builds,
// served by one Azure Static Web App at https://aui.kasadara.com:
//   /            apps/marketing/dist      (home page, legal pages, security.txt)
//   /docs/       apps/site/dist           (Astro base '/docs')
//   /designer/   apps/theme-designer/dist (relative paths)
// and writes the one staticwebapp.config.json (per-section headers: each section keeps the CSP and
// security headers it had as its own app), the sitemap index for the whole site, and robots.txt.
// `npm run web:build` builds the three apps first; this script alone only assembles.
import { cpSync, existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join, relative, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { frameCsp, pageCsp } from '../../apps/theme-designer/site.mjs';

export const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
export const webDir = join(root, 'dist', 'web');
/** Canonical host (OS-2). */
export const SITE = 'https://aui.kasadara.com';
/** Section mount points and their builds. Marketing is the root. */
export const SECTIONS = [
  { name: 'marketing', path: '/', dist: join(root, 'apps', 'marketing', 'dist') },
  { name: 'docs', path: '/docs/', dist: join(root, 'apps', 'site', 'dist') },
  { name: 'designer', path: '/designer/', dist: join(root, 'apps', 'theme-designer', 'dist') },
];

const IMMUTABLE = 'public, max-age=31536000, immutable';
/** Headers every response gets (the docs and marketing apps sent exactly these). */
const GLOBAL_HEADERS = {
  'Content-Security-Policy': "frame-ancestors 'self'",
  'Strict-Transport-Security': 'max-age=31536000',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
};
/** The Theme Designer's own headers (its former staticwebapp.config.json, TD-5): CSP from site.mjs. */
const designerHeaders = (csp) => ({ 'Content-Security-Policy': csp, 'Referrer-Policy': 'no-referrer', 'Cache-Control': 'no-cache' });

/**
 * The one staticwebapp.config.json. Static Web Apps applies the first matching route only and merges
 * its headers over globalHeaders, so the most specific routes come first. trailingSlash "auto" sends
 * /designer to /designer/, which the designer's relative paths need, and /x.html to /x (both forms of
 * the designer frame get the frame CSP).
 */
export function swaConfig() {
  return {
    trailingSlash: 'auto',
    responseOverrides: { 404: { rewrite: '/404.html' } },
    routes: [
      { route: '/designer/frame.html', headers: designerHeaders(frameCsp) },
      { route: '/designer/frame', headers: designerHeaders(frameCsp) },
      { route: '/designer/*', headers: designerHeaders(pageCsp) },
      { route: '/docs/_astro/*', headers: { 'Cache-Control': IMMUTABLE } },
      { route: '/_astro/*', headers: { 'Cache-Control': IMMUTABLE } },
    ],
    mimeTypes: {
      '.pagefind': 'application/octet-stream',
      '.pf_fragment': 'application/octet-stream',
      '.pf_index': 'application/octet-stream',
      '.pf_meta': 'application/octet-stream',
    },
    globalHeaders: GLOBAL_HEADERS,
  };
}

/** Effective response headers for a URL path, as Static Web Apps computes them from swaConfig(). */
export function headersFor(path, config = swaConfig()) {
  const match = config.routes.find((r) => (r.route.endsWith('/*') ? path.startsWith(r.route.slice(0, -1)) : path === r.route));
  return { ...config.globalHeaders, ...(match?.headers ?? {}) };
}

export function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
}

const write = (file, text) => {
  mkdirSync(dirname(file), { recursive: true });
  writeFileSync(file, text);
};

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Indexable marketing pages: every index.html except the live frames. */
function marketingUrls(dist) {
  return walk(dist)
    .filter((f) => f.endsWith(`${sep}index.html`))
    .map((f) => `/${relative(dist, dirname(f)).split(sep).join('/')}`.replace(/\/?$/, '/'))
    .filter((p) => !p.startsWith('/frames/'))
    .sort();
}

/** Sitemaps the docs build wrote (Starlight's sitemap-index.xml lists them). */
function docsSitemaps(dist) {
  const index = readFileSync(join(dist, 'sitemap-index.xml'), 'utf8');
  return [...index.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
}

export function assemble() {
  const problems = [];
  for (const s of SECTIONS) if (!existsSync(join(s.dist, 'index.html'))) problems.push(`${s.name}: no build in ${relative(root, s.dist)} (run npm run web:build)`);
  if (problems.length) return problems;
  const [marketing, docs, designer] = SECTIONS;
  // Root-level collisions: the marketing build must leave the section paths to the other builds.
  for (const s of [docs, designer]) {
    const name = s.path.slice(1, -1);
    if (existsSync(join(marketing.dist, name))) problems.push(`marketing build has /${name}, which is the ${s.name} section`);
  }
  if (problems.length) return problems;

  rmSync(webDir, { recursive: true, force: true });
  cpSync(marketing.dist, webDir, { recursive: true });
  cpSync(docs.dist, join(webDir, 'docs'), { recursive: true });
  cpSync(designer.dist, join(webDir, 'designer'), { recursive: true });
  // One configuration, one security.txt (the root's), one sitemap index (OS-8, OS-11).
  for (const stale of ['docs/staticwebapp.config.json', 'designer/staticwebapp.config.json', 'docs/.well-known', 'designer/.well-known']) rmSync(join(webDir, stale), { recursive: true, force: true });
  write(join(webDir, 'staticwebapp.config.json'), `${JSON.stringify(swaConfig(), null, 2)}\n`);

  const now = new Date().toISOString().slice(0, 10);
  const pages = [...marketingUrls(marketing.dist), designer.path];
  write(
    join(webDir, 'sitemap-site.xml'),
    `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${pages.map((p) => `<url><loc>${xml(SITE + p)}</loc><lastmod>${now}</lastmod></url>`).join('\n')}\n</urlset>\n`,
  );
  const maps = [`${SITE}/sitemap-site.xml`, ...docsSitemaps(docs.dist)];
  write(join(webDir, 'sitemap-index.xml'), `<?xml version="1.0" encoding="UTF-8"?>\n<sitemapindex xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${maps.map((m) => `<sitemap><loc>${xml(m)}</loc></sitemap>`).join('\n')}\n</sitemapindex>\n`);
  // Live example frames carry their own noindex; nothing is disallowed.
  write(join(webDir, 'robots.txt'), `User-agent: *\nAllow: /\n\nSitemap: ${SITE}/sitemap-index.xml\n`);
  // llms.txt and llms-full.txt for AI assistants (R15-11, R15-17), rendered as the MCP server renders them.
  execFileSync(process.execPath, [join(root, 'packages', 'mcp', 'scripts', 'build-llms.mjs'), webDir], { stdio: 'inherit' });
  return [];
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  const problems = assemble();
  if (problems.length) {
    console.error(`web:build: ${String(problems.length)} problem(s)`);
    for (const p of problems) console.error(`  ${p}`);
    process.exit(1);
  }
  console.log(`web:build: ok (${String(walk(webDir).length)} files in ${relative(root, webDir)}: / marketing, /docs/, /designer/)`);
}
