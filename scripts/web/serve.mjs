// Local preview of the one website (dist/web) as Azure Static Web Apps serves it: the response
// headers of staticwebapp.config.json per path (scripts/web/build.mjs headersFor), trailingSlash
// "auto" (folders get a slash, /x.html is also served at /x), and the 404 page. Loopback only.
// Usage: npm run web:serve   (WEB_PORT, default 4380)
import { createReadStream, existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize, sep } from 'node:path';
import { headersFor, webDir } from './build.mjs';

const port = Number(process.env.WEB_PORT ?? 4380);
const TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.mjs': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json',
  '.xml': 'application/xml',
  '.txt': 'text/plain; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.webp': 'image/webp',
  '.webm': 'video/webm',
  '.woff2': 'font/woff2',
  '.woff': 'font/woff',
  '.pdf': 'application/pdf',
};
if (!existsSync(join(webDir, 'staticwebapp.config.json'))) {
  console.error('web:serve: no dist/web (run npm run web:build)');
  process.exit(1);
}
const config = JSON.parse(readFileSync(join(webDir, 'staticwebapp.config.json'), 'utf8'));
const types = { ...TYPES, ...config.mimeTypes };

createServer((req, res) => {
  let path;
  try {
    path = decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname);
  } catch {
    res.writeHead(400).end();
    return;
  }
  const search = new URL(req.url ?? '/', 'http://127.0.0.1').search;
  const target = normalize(join(webDir, path));
  if (!target.startsWith(webDir + sep) && target !== webDir) {
    res.writeHead(403).end();
    return;
  }
  const isDir = existsSync(target) && statSync(target).isDirectory();
  if (isDir && !path.endsWith('/') && existsSync(join(target, 'index.html'))) {
    res.writeHead(301, { Location: `${path}/${search}` }).end();
    return;
  }
  let file = isDir ? join(target, 'index.html') : target;
  if (!existsSync(file) && existsSync(`${target}.html`)) file = `${target}.html`;
  let status = 200;
  if (!existsSync(file) || statSync(file).isDirectory()) {
    status = 404;
    file = join(webDir, '404.html');
  }
  res.writeHead(status, { ...headersFor(path, config), 'Content-Type': types[extname(file)] ?? 'application/octet-stream', 'Cache-Control': 'no-store' });
  createReadStream(file).pipe(res);
}).listen(port, '127.0.0.1', () => {
  console.log(`One website (dist/web) on http://127.0.0.1:${String(port)}/`);
});
