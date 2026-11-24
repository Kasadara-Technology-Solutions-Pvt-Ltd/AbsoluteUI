// Gate for the built site (R4-5, R4-8): every component has a page, internal links
// and frames resolve, no framework-adapter content is published, no specification
// references or placeholders leak, and pages load nothing from third-party hosts.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { BASE, EXAMPLES_URL, componentNames, generatedDir, readJson, siteDir } from './lib/shared.mjs';
import { pagePaths } from '../../../scripts/legal.mjs';
import { inlineHashes } from './csp-inline.mjs';
import { angularEntries } from './lib/angular.mjs';
import { angularFrames } from './lib/angular-frames.mjs';
import { ADDONS } from './lib/components.mjs';

const dist = join(siteDir, 'dist');
const errors = [];

function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const file = join(dir, name);
    if (statSync(file).isDirectory()) walk(file, out);
    else out.push(file);
  }
  return out;
}

const files = walk(dist);
const html = files.filter((f) => f.endsWith('.html'));
// The build is served under the docs base (docs/PLAN-ONE-SITE.md OS-3): dist/x is /docs/x.
const urlOf = (file) => `${BASE}/` + relative(dist, file).split(sep).join('/');
const inDocs = (path) => path === BASE || path.startsWith(`${BASE}/`);
const exists = (path) => {
  const clean = decodeURIComponent(path.split(/[?#]/)[0]);
  if (!inDocs(clean)) return false;
  const target = join(dist, clean.slice(BASE.length));
  return existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
};

// The Angular adapter is documented (R10-12); React and Vue stay hidden. stats.json says whether this build includes Angular.
const angular = readJson(join(generatedDir, 'stats.json')).angular === true;
const FORBIDDEN = [
  angular ? [/@absoluteui\/(react|vue)\b/, 'framework adapter package'] : [/@absoluteui\/(react|vue|angular)\b/, 'framework adapter package'],
  angular ? [/\b(React|Vue) example\b/, 'framework example section'] : [/\b(Angular|React|Vue) example\b/, 'framework example section'],
  [/Web Component-style usage/, 'web component section'],
  [/SPEC section \d/, 'internal specification reference'],
  [/\[(COMPANY|PRODUCT URL|YEAR|AMOUNT|CITY)[^\]]*\]/, 'unfilled placeholder'],
];

// Angular pages are written for application developers: no internal ids or repository paths (R10-9).
const ANGULAR_FORBIDDEN = [
  [/\b(?:D\d{1,2}|M\d{1,2}[ab]?|R10-\d+)\b/, 'internal decision or milestone id'],
  [/\b(?:packages|scripts|apps|docs)\/[\w./-]+\.(?:md|ts|mjs|json)\b/, 'repository path'],
];

/** Angular frames referenced from the Angular pages (R12-5 coverage). */
// One website (docs/PLAN-ONE-SITE.md OS-11): the legal pages and security.txt live once at the site
// root (the home page's build), so the docs link them by path and write no security.txt of their own.
const legalPaths = pagePaths();
const LEGAL_LINKS = [legalPaths.license, legalPaths.privacy, legalPaths.terms, legalPaths.security, legalPaths.notices];
if (existsSync(join(dist, '.well-known'))) errors.push(`${BASE}/.well-known/: the site root serves security.txt`);
/** Links that leave the docs section; `npm run web:check` resolves them in the combined site. */
const CROSS_SECTION = new Set(['/', '/designer/', ...Object.values(legalPaths)]);
const shownFrames = new Set();

for (const file of html) {
  const text = readFileSync(file, 'utf8');
  const page = urlOf(file);
  // Examples pages are the library's own output; their text is checked through the docs pages.
  const isExample = page.startsWith(`${EXAMPLES_URL}/`);
  if (!isExample) {
    const visible = text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
    for (const [re, what] of FORBIDDEN) if (re.test(visible)) errors.push(`${page}: ${what} (${re.exec(visible)[0]})`);
    // Shared legal footer (legal.json): every docs page links the license, privacy, and terms pages.
    for (const url of LEGAL_LINKS) if (!visible.includes(`href="${url}"`)) errors.push(`${page}: footer has no link to ${url}`);
    // Internal release ids (R1, R3 phase 3b) mean nothing to readers; text only, since markup carries ids and path data.
    const words = visible.replace(/<[^>]*>/g, ' ');
    const release = /.{0,40}\bR\d+\b.{0,20}/.exec(words);
    if (release) errors.push(`${page}: internal release id (${release[0].trim()})`);
    if (!angular && page.startsWith('/docs/angular/')) errors.push(`${page}: Angular page in a build generated with --no-angular`);
    if (page.startsWith('/docs/angular/')) {
      // Text only: markup carries ids and SVG path data such as "M5".
      const words = visible.replace(/<[^>]*>/g, ' ');
      for (const [re, what] of ANGULAR_FORBIDDEN) if (re.test(words)) errors.push(`${page}: ${what} (${re.exec(words)[0]})`);
    }
  }
  // Hash-only CSP: every inline script and style is hashed; 'unsafe-inline' only for style attributes.
  if (!isExample) {
    const policy = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(text)?.[1];
    if (!policy) errors.push(`${page}: no CSP meta`);
    else {
      const { scripts, styles } = inlineHashes(text);
      for (const h of [...scripts, ...styles]) if (!policy.includes(h)) errors.push(`${page}: inline code not in CSP (${h})`);
      const unsafe = policy.split(';').filter((d) => /'unsafe-(inline|eval)'/.test(d) && !/^\s*style-src-attr\s/.test(d));
      if (unsafe.length) errors.push(`${page}: unsafe CSP source (${unsafe.join('; ')})`);
      // The only third-party hosts are Microsoft Clarity's, loaded after analytics consent (R14-7).
      const hosts = policy.match(/https?:\/\/[^\s;]+/g) ?? [];
      const foreign = hosts.filter((h) => !/^https:\/\/([a-z*]+\.)?clarity\.ms$|^https:\/\/c\.bing\.com$/.test(h));
      if (foreign.length) errors.push(`${page}: third-party CSP source (${foreign.join(', ')})`);
    }
  } else if (!text.includes("require-trusted-types-for 'script'")) errors.push(`${page}: example page without the library CSP`);
  // Angular frames (R12) add only style hashes to the library CSP: no unsafe sources.
  else if (page.startsWith(`${EXAMPLES_URL}/angular/`) && /'unsafe-/.test(text)) errors.push(`${page}: unsafe CSP source in an Angular frame`);
  // Resources must be same-origin and inside the docs section (no docs-root paths outside /docs/).
  for (const m of text.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*?\s(src|href)="([^"]+)"/g)) {
    const [, tag, , url] = m;
    if (tag === 'link' && !/rel="(stylesheet|icon|preload|modulepreload|manifest)"/.test(m[0])) continue;
    if (/^(https?:)?\/\//.test(url)) errors.push(`${page}: third-party ${tag} ${url}`);
    else if (url.startsWith('/') && !inDocs(url)) errors.push(`${page}: ${tag} ${url} outside ${BASE}/`);
    else if (url.startsWith('/') && !exists(url)) errors.push(`${page}: missing ${tag} ${url}`);
  }
  // Example frames (their src is set by the toolbar script from data-src).
  for (const m of text.matchAll(/<iframe\b[^>]*?\sdata-src="([^"]+)"/g)) {
    if (!exists(m[1])) errors.push(`${page}: missing example ${m[1]}`);
    if (page.startsWith('/docs/angular/')) shownFrames.add(m[1]);
  }
  // Internal links resolve (links inside examples are example content).
  if (!isExample) for (const m of text.matchAll(/<a\b[^>]*?\shref="(\/[^"]*)"/g)) {
    const target = m[1].split(/[?#]/)[0];
    if (!inDocs(target)) {
      if (!CROSS_SECTION.has(target)) errors.push(`${page}: link ${m[1]} outside ${BASE}/ (old docs-root path?)`);
    } else if (!exists(m[1])) errors.push(`${page}: broken link ${m[1]}`);
  }
}

for (const name of [...componentNames(), ...ADDONS]) {
  if (!exists(`/docs/components/${name}/`)) errors.push(`missing component page: ${name}`);
}
for (const page of ['/docs/quality/performance/', '/docs/quality/accessibility/', '/docs/api/core/', ...(angular ? ['/docs/angular/'] : [])]) if (!exists(page)) errors.push(`missing page: ${page}`);

// Every Angular example has a frame, shown on its Angular page (R12-5).
if (angular) {
  for (const [entry, list] of angularFrames(angularEntries())) {
    for (const { id } of list) if (!shownFrames.has(`${EXAMPLES_URL}/angular/${id}/`)) errors.push(`Angular example without a frame on its page: ${entry} (${id})`);
  }
}

const unique = [...new Set(errors)];
if (unique.length) {
  console.error(`check-output: ${unique.length} problem(s)`);
  for (const e of unique.slice(0, 100)) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-output: ok (${html.length} pages${angular ? `, with Angular, ${shownFrames.size} Angular frames` : ', without Angular'})`);
