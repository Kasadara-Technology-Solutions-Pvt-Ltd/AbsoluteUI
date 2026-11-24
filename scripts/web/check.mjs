// Gate for the one website (docs/PLAN-ONE-SITE.md OS-8 to OS-11), run on dist/web after
// `npm run web:build`: internal links and resources resolve across sections, no root-level
// collisions, every HTML page has its section's CSP (meta for the home page and the docs, the
// configured header for the Theme Designer), security headers on every path, third-party sources
// only Microsoft Clarity's (loaded after consent), one Clarity project and one consent control,
// one security.txt, the sitemap index, robots.txt, and canonical links on the canonical host.
import { existsSync, readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { frameCsp, pageCsp } from '../../apps/theme-designer/site.mjs';
import { pagePaths } from '../legal.mjs';
import { SECTIONS, SITE, headersFor, root, walk, webDir } from './build.mjs';

const errors = [];
if (!existsSync(join(webDir, 'index.html'))) {
  console.error('web:check: no dist/web (run npm run web:build)');
  process.exit(1);
}
const config = JSON.parse(readFileSync(join(webDir, 'staticwebapp.config.json'), 'utf8'));
const files = walk(webDir);
const urlOf = (file) => `/${relative(webDir, file).split(sep).join('/')}`;
const exists = (path) => {
  const clean = decodeURIComponent(path.split(/[?#]/)[0]);
  const target = join(webDir, clean);
  if (!target.startsWith(webDir)) return false;
  if (existsSync(target)) return statSync(target).isFile() || existsSync(join(target, 'index.html'));
  // trailingSlash "auto" serves /x.html at /x as well.
  return existsSync(`${target}.html`);
};
const sectionOf = (path) => (path.startsWith('/docs/') ? 'docs' : path.startsWith('/designer/') ? 'designer' : 'marketing');
/** Live frames: the library's own pages under its strict CSP; their links are example content. */
const isFrame = (path) => path.startsWith('/docs/examples/') || path.startsWith('/frames/');
const CLARITY = /^https:\/\/([a-z*]+\.)?clarity\.ms$|^https:\/\/c\.bing\.com$/;

// Root-level collisions: every root entry comes from the marketing build or is a section or a site file.
const marketing = SECTIONS[0].dist;
const SITE_FILES = new Set(['docs', 'designer', 'staticwebapp.config.json', 'sitemap-index.xml', 'sitemap-site.xml', 'robots.txt', 'llms.txt', 'llms-full.txt']);
// llms.txt and llms-full.txt for AI assistants (R15-11), from the MCP content snapshot.
for (const name of ['llms.txt', 'llms-full.txt']) if (!existsSync(join(webDir, name))) errors.push(`/${name}: missing`);
for (const name of readdirSync(webDir)) if (!SITE_FILES.has(name) && !existsSync(join(marketing, name))) errors.push(`/${name}: root entry from no known build (collision?)`);
for (const name of ['_astro', 'pagefind', 'examples', 'images', 'favicon.svg', '404.html']) {
  // The docs build's own root files must sit under /docs/ (marketing has its own _astro, favicon, 404).
  if (existsSync(join(SECTIONS[1].dist, name)) && !existsSync(join(webDir, 'docs', name))) errors.push(`/docs/${name}: missing`);
}

// One security.txt, at the root; legal pages at the root (OS-11).
if (!existsSync(join(webDir, '.well-known', 'security.txt'))) errors.push('no /.well-known/security.txt');
for (const f of files) if (/[\\/]\.well-known[\\/]security\.txt$/.test(f) && urlOf(f) !== '/.well-known/security.txt') errors.push(`${urlOf(f)}: second security.txt`);
const legal = pagePaths();
for (const key of ['license', 'privacy', 'terms', 'security', 'notices']) if (!exists(legal[key])) errors.push(`legal page ${legal[key]} missing`);
const securityTxt = readFileSync(join(webDir, '.well-known', 'security.txt'), 'utf8');
if (!securityTxt.includes(`Canonical: ${SITE}/.well-known/security.txt`)) errors.push('security.txt: Canonical is not on the canonical host');

// Sitemap index and robots.txt for the whole site.
const robots = existsSync(join(webDir, 'robots.txt')) ? readFileSync(join(webDir, 'robots.txt'), 'utf8') : '';
if (!robots.includes(`Sitemap: ${SITE}/sitemap-index.xml`)) errors.push('robots.txt: no Sitemap line for the sitemap index');
const sitemapUrls = (file) => [...readFileSync(file, 'utf8').matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
const pathOn = (url) => (url.startsWith(`${SITE}/`) ? url.slice(SITE.length) : null);
for (const map of sitemapUrls(join(webDir, 'sitemap-index.xml'))) {
  const path = pathOn(map);
  if (!path || !exists(path)) {
    errors.push(`sitemap-index.xml: ${map} does not resolve`);
    continue;
  }
  for (const loc of sitemapUrls(join(webDir, path))) {
    const p = pathOn(loc);
    if (!p || !exists(p)) errors.push(`${path}: ${loc} does not resolve`);
  }
}
if (!sitemapUrls(join(webDir, 'sitemap-site.xml')).includes(`${SITE}/designer/`)) errors.push('sitemap-site.xml: no Theme Designer');

// The configuration: per-section headers (OS-9).
const MUST = ['Strict-Transport-Security', 'X-Content-Type-Options', 'Referrer-Policy', 'Content-Security-Policy'];
for (const path of ['/', '/docs/', '/docs/components/button/', '/designer/', '/designer/frame.html', '/designer/frame']) {
  const h = headersFor(path, config);
  for (const name of MUST) if (!h[name]) errors.push(`${path}: no ${name} header`);
}
if (headersFor('/designer/', config)['Content-Security-Policy'] !== pageCsp) errors.push('/designer/: header CSP differs from the designer page CSP (apps/theme-designer/site.mjs)');
for (const p of ['/designer/frame.html', '/designer/frame']) if (headersFor(p, config)['Content-Security-Policy'] !== frameCsp) errors.push(`${p}: header CSP differs from the designer frame CSP`);
if (config.trailingSlash !== 'auto') errors.push('staticwebapp.config.json: trailingSlash must be "auto" (/designer needs its slash)');
if (JSON.stringify(config).length > 20 * 1024) errors.push('staticwebapp.config.json: larger than the 20 KB limit');

const html = files.filter((f) => f.endsWith('.html'));
for (const f of files.filter((x) => x.endsWith('.js'))) for (const m of readFileSync(f, 'utf8').matchAll(/["'`]([a-z0-9]{10})["'`]/g)) if (['z3junpyl2f', 'z3ladlz1gm'].includes(m[1])) errors.push(`${urlOf(f)}: old Clarity project ${m[1]} (one project for the site, OS-10)`);
for (const f of files.filter((x) => x.endsWith('.js'))) {
  const text = readFileSync(f, 'utf8');
  if (/aui-(docs|designer)-analytics-consent/.test(text)) errors.push(`${urlOf(f)}: old per-site consent key (one consent for the site, OS-10)`);
}

let pages = 0;
for (const file of html) {
  const page = urlOf(file);
  const text = readFileSync(file, 'utf8');
  const section = sectionOf(page);
  const frame = isFrame(page);
  pages++;
  // CSP: meta on home and docs pages (hash-only), header on the designer; frames keep the library CSP.
  const meta = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(text)?.[1];
  if (frame) {
    if (!meta?.includes("require-trusted-types-for 'script'")) errors.push(`${page}: frame without the library CSP`);
  } else if (section === 'designer') {
    const csp = headersFor(page.replace(/index\.html$/, ''), config)['Content-Security-Policy'];
    if (csp !== (page === '/designer/frame.html' ? frameCsp : pageCsp)) errors.push(`${page}: designer CSP header not applied`);
  } else if (!meta) errors.push(`${page}: no CSP meta`);
  for (const policy of [meta, section === 'designer' ? headersFor(page, config)['Content-Security-Policy'] : undefined]) {
    if (!policy) continue;
    // Designer frame: web fonts the visitor adds to a theme load from Google Fonts or Bunny Fonts (TD-4, SPEC section 10).
    const allowed = (h) => CLARITY.test(h) || (section === 'designer' && /^https:\/\/(fonts\.googleapis\.com|fonts\.gstatic\.com|fonts\.bunny\.net)$/.test(h));
    const foreign = (policy.match(/https?:\/\/[^\s;]+/g) ?? []).filter((h) => !allowed(h));
    if (foreign.length) errors.push(`${page}: third-party CSP source (${foreign.join(', ')})`);
  }
  // Resources are same-origin and resolve; relative paths resolve against the page.
  for (const m of text.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*?\s(src|href|data-src|poster)="([^"]+)"/g)) {
    const [whole, tag, , url] = m;
    if (tag === 'link' && !/rel="(stylesheet|icon|shortcut icon|preload|modulepreload|manifest|sitemap)"/.test(whole)) continue;
    if (/^(https?:)?\/\//.test(url)) errors.push(`${page}: third-party ${tag} ${url}`);
    else if (!/^(data:|#)/.test(url) && !exists(new URL(url, `http://x${page}`).pathname)) errors.push(`${page}: missing ${tag} ${url}`);
  }
  if (frame) continue;
  // Internal links resolve across sections.
  for (const m of text.matchAll(/<a\b[^>]*?\shref="([^"#][^"]*)"/g)) {
    const href = m[1];
    if (/^(https?:|mailto:)/.test(href)) {
      // The policies name the retired domains (bare host links); pages must not link into them.
      if (/^https?:\/\/(aui-docs|aui-designer)\.kasadara\.com\/./.test(href)) errors.push(`${page}: link to a retired domain ${href}`);
      continue;
    }
    const target = new URL(href, `http://x${page}`).pathname;
    if (!exists(target)) errors.push(`${page}: broken link ${href}`);
  }
  // One consent control in every section's chrome (OS-10); the 404 page has the home footer.
  if (!/data-consent-reset/.test(text) && page !== '/designer/frame.html') errors.push(`${page}: no cookie settings control`);
  // Canonical links on the canonical host (OS-2).
  for (const m of text.matchAll(/<link rel="canonical" href="([^"]+)"/g)) if (!m[1].startsWith(`${SITE}/`)) errors.push(`${page}: canonical ${m[1]} not on ${SITE}`);
}

const unique = [...new Set(errors)];
if (unique.length) {
  console.error(`web:check: ${String(unique.length)} problem(s)`);
  for (const e of unique.slice(0, 150)) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`web:check: ok (${String(pages)} pages, ${String(files.length)} files; links across /, /docs/, /designer/; CSP per section; ${relative(root, webDir)})`);
