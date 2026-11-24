// Theme Designer site (SPEC section 10): the bundle, the file routes, and the strict CSP of the
// preview app (SPEC section 14.6.2), shared by the dev server (serve.mjs), the static build
// (dist.mjs), and the one website's staticwebapp.config.json (scripts/web/build.mjs, /designer/).
// Run `npm run build` first: routes point at the BUILT packages.
import { build } from 'esbuild';
import { existsSync, readdirSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

export const here = fileURLToPath(new URL('.', import.meta.url));
export const root = resolve(here, '../..');
const out = join(here, '.out');

/**
 * The designer page may load Microsoft Clarity after consent (src/consent.ts): its hosts and the
 * narrow `default` Trusted Types policy that lets the Clarity loader add its script. The preview
 * frame has no analytics and keeps the original policy.
 */
const csp = ({ frameAncestors, analytics }) =>
  [
    "default-src 'self'",
    analytics ? "script-src 'self' https://www.clarity.ms https://scripts.clarity.ms" : "script-src 'self'",
    // Web fonts: Google Fonts and Bunny Fonts stylesheets and font files (preview frame only needs them).
    "style-src 'self' https://fonts.googleapis.com https://fonts.bunny.net",
    "font-src 'self' https://fonts.gstatic.com https://fonts.bunny.net",
    analytics ? "img-src 'self' data: blob: https://*.clarity.ms https://c.bing.com" : "img-src 'self' data: blob:",
    ...(analytics ? ["connect-src 'self' https://*.clarity.ms"] : []),
    "frame-src 'self'",
    "object-src 'none'",
    "base-uri 'none'",
    "form-action 'none'",
    `frame-ancestors ${frameAncestors}`,
    "require-trusted-types-for 'script'",
    analytics ? 'trusted-types absoluteui default' : 'trusted-types absoluteui',
  ].join('; ');
/** The designer page: never embedded; Clarity allowed after consent. */
export const pageCsp = csp({ frameAncestors: "'none'", analytics: true });
/** The preview frame: embedded by this origin only; no analytics. */
export const frameCsp = csp({ frameAncestors: "'self'", analytics: false });

export const types = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.svg': 'image/svg+xml',
  '.woff2': 'font/woff2',
  '.txt': 'text/plain; charset=utf-8',
};

/** Bundles the designer (app.ts) and the preview frame (frame.ts) into .out. */
export async function bundle() {
  await build({
    entryPoints: { app: join(here, 'app.ts'), frame: join(here, 'frame.ts') },
    outdir: out,
    bundle: true,
    format: 'esm',
    target: 'es2022',
    minify: true,
    tsconfig: join(here, 'tsconfig.json'),
    logLevel: 'warning',
  });
}

/** URL path to source file, for every file the designer serves. */
export function routes() {
  const marketingPublic = join(root, 'apps/marketing/public');
  const cairo = join(root, 'node_modules/@fontsource-variable/cairo');
  const map = {
    '/': join(here, 'index.html'),
    '/frame.html': join(here, 'frame.html'),
    '/app.js': join(out, 'app.js'),
    '/frame.js': join(out, 'frame.js'),
    '/designer.css': join(here, 'designer.css'),
    '/frame.css': join(here, 'frame.css'),
    '/theme.css': join(root, 'packages/theme/dist/absolute-default.css'),
    '/theme.schema.json': join(root, 'packages/theme/dist/theme.schema.json'),
    // Brand assets shared with the marketing site; Cairo is self-hosted (SIL OFL 1.1).
    '/favicon.svg': join(marketingPublic, 'favicon.svg'),
    '/logo-light.svg': join(marketingPublic, 'logo-light.svg'),
    '/fonts/cairo.css': join(cairo, 'wght.css'),
    '/fonts/LICENSE.txt': join(cairo, 'LICENSE'),
  };
  for (const name of readdirSync(join(cairo, 'files'))) {
    if (name.endsWith('-wght-normal.woff2')) map[`/fonts/files/${name}`] = join(cairo, 'files', name);
  }
  const componentsDist = join(root, 'packages/components/dist');
  for (const name of readdirSync(componentsDist)) {
    const css = join(componentsDist, name, 'style.css');
    if (existsSync(css)) map[`/c/${name}.css`] = css;
  }
  return map;
}
