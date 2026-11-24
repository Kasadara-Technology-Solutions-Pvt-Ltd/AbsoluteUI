// Theme Designer dev server (SPEC section 10). Bundles the designer against the BUILT packages
// and serves it with the strict CSP of the preview app (site.mjs). Run `npm run build` first.
// Usage: node apps/theme-designer/serve.mjs            (DESIGNER_PORT, default 4330)
//        node apps/theme-designer/serve.mjs --build    (bundle only, for CI)
// Served at http://127.0.0.1:4330/ and http://127.0.0.1:4330/designer/ (as on the one website).
// Static build (copied to /designer/ by `npm run web:build`): node apps/theme-designer/dist.mjs
import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname } from 'node:path';
import { bundle, frameCsp, pageCsp, routes as siteRoutes, types } from './site.mjs';

const port = Number(process.env.DESIGNER_PORT ?? 4330);

await bundle();
if (process.argv.includes('--build')) process.exit(0);

const routes = siteRoutes();

createServer(async (req, res) => {
  let path = new URL(req.url ?? '/', 'http://127.0.0.1').pathname;
  // The one website serves the designer under /designer/ (docs/PLAN-ONE-SITE.md OS-5); the dev
  // server answers there too, and at / for the e2e suite. The pages use relative paths.
  if (path === '/designer') {
    res.writeHead(301, { Location: '/designer/' }).end();
    return;
  }
  if (path.startsWith('/designer/')) path = path.slice('/designer'.length);
  const file = Object.hasOwn(routes, path) ? routes[path] : undefined;
  if (!file || req.method !== 'GET') {
    res.writeHead(file ? 405 : 404).end();
    return;
  }
  try {
    const body = await readFile(file);
    res.writeHead(200, {
      'Content-Type': types[extname(path === '/' ? file : path)] ?? 'application/octet-stream',
      // Only the preview frame may be embedded, and only by this origin.
      'Content-Security-Policy': path === '/frame.html' ? frameCsp : pageCsp,
      'X-Content-Type-Options': 'nosniff',
      'Referrer-Policy': 'no-referrer',
      'Cache-Control': 'no-store',
    });
    res.end(body);
  } catch {
    res.writeHead(500).end();
  }
}).listen(port, '127.0.0.1', () => {
  console.log(`AbsoluteUI Theme Designer on http://127.0.0.1:${port}`);
});
