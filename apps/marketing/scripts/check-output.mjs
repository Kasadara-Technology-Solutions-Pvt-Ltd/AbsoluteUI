// Gate for the built marketing site (docs/PLAN-R4.md section 4.8, R4-5, R4-8): required pages exist,
// internal links and assets resolve, pages load nothing from third-party hosts, every inline
// script is hashed into a strict CSP, frames keep the library CSP, adapters are never shown,
// the colour tokens meet WCAG 2.2 AA, and (with --release) no link placeholder remains.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { join, relative, sep } from 'node:path';
import { pathToFileURL } from 'node:url';
import { inlineHashes } from './csp-inline.mjs';
import { appDir, distDir, loadLinks, placeholders, readJson, root, walk } from './lib/shared.mjs';
const blocksData = readJson(join(appDir, 'data', 'blocks.json'));

const release = process.argv.includes('--release');
const errors = [];
const warnings = [];

const files = walk(distDir);
const html = files.filter((f) => f.endsWith('.html'));
const urlOf = (file) => '/' + relative(distDir, file).split(sep).join('/');
const exists = (path) => {
  const clean = decodeURIComponent(path.split(/[?#]/)[0]);
  const target = join(distDir, clean);
  return existsSync(target) && (statSync(target).isFile() || existsSync(join(target, 'index.html')));
};

const links = loadLinks();
const allowedHosts = new Set(Object.values(links).filter((v) => typeof v === 'string' && /^https?:\/\//.test(v)).map((v) => new URL(v).host));
/** Sections of the one website built by other apps (docs/PLAN-ONE-SITE.md); `npm run web:check` resolves these links. */
const OTHER_SECTIONS = ['/docs/', '/designer/'];
const otherSection = (path) => OTHER_SECTIONS.some((s) => path === s || path.startsWith(s) || path === s.slice(0, -1));
if (exists('/designer/') || exists('/docs/')) errors.push('a page uses a path of the docs or designer section (/docs/, /designer/)');

const FORBIDDEN = [
  // Angular is public (R10-12, R14-3); React and Vue stay private and unmentioned.
  [/@absoluteui\/(react|vue)\b/, 'private framework adapter package'],
  [/\b(React|Vue)\b/, 'React or Vue mentioned (adapters are private)'],
  [/SPEC section \d/, 'internal specification reference'],
  [/DRAFT - NOT LEGAL ADVICE/, 'license draft note'],
];

const REQUIRED = ['/', '/components/', '/theme-designer/', '/accessibility/', '/performance/', '/blocks/', '/privacy/', '/terms/', '/notices/', '/.well-known/security.txt', '/enterprise/', '/demos/', '/license/', '/security/', '/advisory/', '/404.html', '/search.json'];
for (const page of REQUIRED) if (!exists(page)) errors.push(`missing page ${page}`);

for (const file of html) {
  const text = readFileSync(file, 'utf8');
  const page = urlOf(file);
  if (page.startsWith('/frames/')) {
    if (!text.includes("require-trusted-types-for 'script'")) errors.push(`${page}: frame without the library CSP`);
    continue;
  }
  const visible = text.replace(/<script[\s\S]*?<\/script>/g, '').replace(/<style[\s\S]*?<\/style>/g, '');
  for (const [re, what] of FORBIDDEN) if (re.test(visible)) errors.push(`${page}: ${what} (${re.exec(visible)[0]})`);

  const policy = /<meta http-equiv="content-security-policy" content="([^"]*)"/i.exec(text)?.[1];
  if (!policy) errors.push(`${page}: no CSP meta`);
  else {
    const { scripts, styles } = inlineHashes(text);
    for (const h of [...scripts, ...styles]) if (!policy.includes(h)) errors.push(`${page}: inline code not in CSP (${h})`);
    if (/'unsafe-(inline|eval)'/.test(policy)) errors.push(`${page}: unsafe CSP source`);
  }
  if (/\sstyle="/.test(visible)) errors.push(`${page}: style attribute (blocked by the CSP)`);
  const h1 = (visible.match(/<h1[\s>]/g) ?? []).length;
  if (h1 !== 1) errors.push(`${page}: ${h1} h1 elements, expected 1`);
  if (page === '/blocks/') {
    for (const b of blocksData.blocks) {
      for (const view of ['preview', 'ts', 'ng']) if (!visible.includes(`id="${b.id}-${view}"`)) errors.push(`/blocks/: ${b.id} has no ${view} view`);
      if (!exists(`/frames/block-${b.id}.html`)) errors.push(`/blocks/: no frame for ${b.id}`);
    }
  }
  // Shared legal footer (legal.json): every page links the legal pages and offers cookie settings.
  if (page !== '/404.html') {
    for (const path of ['/license/', '/privacy/', '/terms/', '/security/', '/notices/']) if (!visible.includes(`href="${path}"`)) errors.push(`${page}: footer has no link to ${path}`);
    if (!visible.includes('data-consent-reset')) errors.push(`${page}: no cookie settings control`);
  }
  // ASCII-only published text (keyboard characters; see the ASCII pass).
  const nonAscii = /[^\t\n\r\x20-\x7E]/.exec(text);
  if (nonAscii) errors.push(`${page}: non-ASCII character U+${nonAscii[0].codePointAt(0).toString(16).toUpperCase().padStart(4, '0')}`);

  for (const m of text.matchAll(/<(script|link|img|iframe|source|video|audio)\b[^>]*?\s(src|href|data-src|poster)="([^"]+)"/g)) {
    const [, tag, , url] = m;
    if (tag === 'link' && !/rel="(stylesheet|icon|preload|modulepreload|manifest)"/.test(m[0])) continue;
    if (/^(https?:)?\/\//.test(url)) errors.push(`${page}: third-party ${tag} ${url}`);
    else if (url.startsWith('/') && !exists(url)) errors.push(`${page}: missing ${tag} ${url}`);
  }
  for (const m of text.matchAll(/<a\b[^>]*?\shref="([^"]*)"/g)) {
    const href = m[1];
    if (href.startsWith('/')) {
      if (!otherSection(href.split(/[?#]/)[0]) && !exists(href)) errors.push(`${page}: broken link ${href}`);
    } else if (/^https?:\/\//.test(href)) {
      const host = new URL(href).host;
      if (!allowedHosts.has(host)) warnings.push(`${page}: external link to ${host}`);
    } else if (!/^(#|mailto:)/.test(href)) errors.push(`${page}: unexpected link ${href}`);
  }
}

// Every gallery card links to a docs page of a known component.
const gallery = readJson(join(appDir, 'src', 'generated', 'components.json'));
const components = readdirNames(join(root, 'packages', 'components', 'metadata'));
for (const c of gallery.components) if (!components.includes(c.name) || c.docsPath !== `/docs/components/${c.name}/`) errors.push(`gallery: bad docs mapping for ${c.name}`);
if (gallery.components.length !== components.length) errors.push(`gallery: ${gallery.components.length} entries for ${components.length} components`);

function readdirNames(dir) {
  return walk(dir)
    .filter((f) => f.endsWith(`${sep}component.json`))
    .map((f) => relative(dir, f).split(sep)[0])
    .sort();
}

// Colour tokens: text pairs at WCAG 2.2 AA (4.5:1 normal text, 3:1 UI components).
const { contrastRatio, parseColor } = await import(pathToFileURL(join(root, 'packages', 'theme', 'dist', 'index.js')).href);
const css = readFileSync(join(appDir, 'src', 'styles', 'app.css'), 'utf8');
const block = (selector) => {
  const start = css.indexOf(`${selector} {`);
  const body = css.slice(start, css.indexOf('}', start));
  return Object.fromEntries([...body.matchAll(/--([\w-]+):\s*(#[0-9a-f]{3,8})\s*;/gi)].map((m) => [m[1], m[2]]));
};
const light = block(':root');
const dark = { ...light, ...block(":root[data-theme='dark']") };
const TEXT = [
  ['text', 'bg'], ['text', 'surface'], ['text-2', 'bg'], ['text-2', 'surface'], ['text-2', 'surface-2'], ['text-2', 'tint-blue'], ['text-2', 'tint-green'],
  ['text-3', 'surface'], ['text-3', 'bg'], ['blue-text', 'surface'], ['blue-text', 'bg'], ['blue-text', 'tint-blue'], ['on-blue', 'blue'], ['on-blue', 'blue-strong'],
  ['green-text', 'surface'], ['green-text', 'tint-green'], ['teal-text', 'tint-cyan'], ['violet-text', 'tint-lavender'], ['amber-text', 'tint-sand'], ['amber-text', 'surface'], ['red-text', 'surface'],
  ['code-text', 'code-bg'], ['code-muted', 'code-bg'], ['code-keyword', 'code-bg'], ['code-string', 'code-bg'], ['code-number', 'code-bg'], ['code-name', 'code-bg'],
];
const UI = [['blue', 'surface'], ['blue', 'bg']];
for (const [name, tokens] of [['light', light], ['dark', dark]]) {
  for (const [fg, bg] of TEXT) {
    // Dark mode's primary-button hover uses a fixed #1d4ed8, not --blue-strong (global.css).
    if (name === 'dark' && fg === 'on-blue' && bg === 'blue-strong') continue;
    const ratio = contrastRatio(parseColor(tokens[fg]), parseColor(tokens[bg]));
    if (!(ratio >= 4.5)) errors.push(`contrast (${name}): --${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs 4.5:1`);
  }
  for (const [fg, bg] of UI) {
    const ratio = contrastRatio(parseColor(tokens[fg]), parseColor(tokens[bg]));
    if (!(ratio >= 3)) errors.push(`contrast (${name}): --${fg} on --${bg} is ${ratio.toFixed(2)}:1, needs 3:1`);
  }
}

const open = placeholders(links);
if (open.length) (release ? errors : warnings).push(...open.map((p) => `placeholder link ${p}`));

for (const w of [...new Set(warnings)]) console.warn(`check-output: warning: ${w}`);
const unique = [...new Set(errors)];
if (unique.length) {
  console.error(`check-output: ${unique.length} problem(s)`);
  for (const e of unique.slice(0, 100)) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`check-output: ok (${html.length} pages${release ? ', release' : ''})`);
