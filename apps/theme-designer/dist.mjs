// Theme Designer static build for the one website (docs/PLAN-ONE-SITE.md OS-5): served under
// /designer/ on https://aui.kasadara.com. Writes apps/theme-designer/dist with the same files as
// the dev server (site.mjs); `npm run web:build` copies it to dist/web/designer/ and sends the
// dev server's CSP and security headers from the one staticwebapp.config.json (scripts/web/build.mjs).
// The pages reference their files by relative paths, so they work at / (dev server) and /designer/.
// Then checks that every stylesheet, script, and image the pages reference is in the output.
// Run `npm run build` first.
import { copyFileSync, existsSync, mkdirSync, readFileSync, rmSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { bundle, here, routes } from './site.mjs';

const dist = join(here, 'dist');

await bundle();
rmSync(dist, { recursive: true, force: true });
for (const [path, source] of Object.entries(routes())) {
  const target = join(dist, path === '/' ? 'index.html' : path.slice(1));
  mkdirSync(dirname(target), { recursive: true });
  copyFileSync(source, target);
}

// Every local stylesheet, script, and image referenced by the pages exists, by a relative path
// (a root path would point outside /designer/ on the one website).
const errors = [];
for (const page of ['index.html', 'frame.html']) {
  const html = readFileSync(join(dist, page), 'utf8');
  for (const m of html.matchAll(/<(?:link|script|img)\b[^>]*?\s(?:href|src)="([^"]*)"/g)) {
    const url = m[1];
    if (/\srel="canonical"/.test(m[0])) continue;
    if (/^(https?:)?\/\//.test(url)) errors.push(`${page}: third-party resource ${url}`);
    else if (url.startsWith('/')) errors.push(`${page}: root path ${url} (use a path relative to the page)`);
    else if (!existsSync(join(dist, url))) errors.push(`${page}: missing ${url}`);
  }
}
if (errors.length) {
  console.error(`designer:build: ${String(errors.length)} problem(s)`);
  for (const e of errors) console.error(`  ${e}`);
  process.exit(1);
}
console.log(`designer:build: ok (${String(Object.keys(routes()).length)} files) in apps/theme-designer/dist`);
