// E2E harness server (SPEC section 14.6.2). Bundles the demo apps against the BUILT
// packages (resolved through package "exports") and serves them with a strict CSP.
import { build } from 'esbuild';
import { createServer } from 'node:http';
import { existsSync, readdirSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { extname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = fileURLToPath(new URL('.', import.meta.url));
const root = resolve(here, '../..');
// E2E_OUT gives side-by-side runs (E2E_PORT) their own build folder.
const out = process.env.E2E_OUT ? resolve(process.env.E2E_OUT) : join(here, '.out');
const site = join(here, 'site');
const port = Number(process.env.E2E_PORT ?? 4317);

const CSP = [
  "default-src 'self'",
  "script-src 'self'",
  "style-src 'self'",
  // blob: for Upload Queue image previews (object URLs), as documented for consumers.
  "img-src 'self' data: blob:",
  "object-src 'none'",
  "base-uri 'none'",
  "frame-ancestors 'none'",
  "require-trusted-types-for 'script'",
  'trusted-types absoluteui',
].join('; ');
// Vue's runtime creates its own Trusted Types policy named "vue" at startup (Vue's
// documented requirement); only the adapter page, which loads Vue, allows it.
const ADAPTER_CSP = CSP.replace('trusted-types absoluteui', 'trusted-types absoluteui vue');

// One bundle per page script: app.ts (R0 page) plus one per R1 phase page.
const pageScripts = readdirSync(site).filter((f) => f.endsWith('.ts'));
await build({
  entryPoints: pageScripts.map((f) => join(site, f)),
  outdir: out,
  bundle: true,
  format: 'esm',
  target: 'es2022',
  tsconfig: join(site, 'tsconfig.json'),
  // Production builds of the adapter frameworks (React, Vue), as consumers ship them.
  define: { 'process.env.NODE_ENV': '"production"', __VUE_OPTIONS_API__: 'false', __VUE_PROD_DEVTOOLS__: 'false', __VUE_PROD_HYDRATION_MISMATCH_DETAILS__: 'false' },
  logLevel: 'warning',
});

const componentsDist = join(root, 'packages/components/dist');
const routes = {
  '/': join(site, 'index.html'),
  '/theme.css': join(root, 'packages/theme/dist/absolute-default.css'),
  '/demo.css': join(site, 'demo.css'),
};
for (const f of readdirSync(site)) {
  if (f.endsWith('.html') && f !== 'index.html') routes[`/${f.slice(0, -5)}`] = join(site, f);
}
for (const f of pageScripts) routes[`/${f.replace(/\.ts$/, '.js')}`] = join(out, f.replace(/\.ts$/, '.js'));
// Component stylesheets: /<component>.css (R0 names kept for the R0 page).
for (const name of readdirSync(componentsDist)) {
  const css = join(componentsDist, name, 'style.css');
  if (existsSync(css)) routes[`/${name}.css`] = css;
}
const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8' };

createServer(async (req, res) => {
  const path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  const file = Object.hasOwn(routes, path) ? routes[path] : undefined;
  if (!file) {
    res.writeHead(404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(file)] ?? 'application/octet-stream',
      'Content-Security-Policy': path === '/adapters' ? ADAPTER_CSP : CSP,
      'X-Content-Type-Options': 'nosniff',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`e2e server on http://127.0.0.1:${port}`);
});
