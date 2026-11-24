// Screenshot part of a generated contact sheet (for reviewing details at a high device scale).
//   node scripts/icons/sheet-shot.mjs <sheet> "<css selector>" <out.png> [scale=2] [index=0]
// Animations are disabled and reduced motion is emulated. Local only.
import { existsSync, readFileSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { dirname, extname, join, normalize, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from '@playwright/test';

const root = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const [sheet, selector, out, scale = '2', index = '0'] = process.argv.slice(2);
if (!sheet || !/^[a-z0-9-]{1,40}$/.test(sheet) || !selector || !out) throw new Error('usage: sheet-shot.mjs <sheet> <selector> <out.png> [scale] [index]');
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.css': 'text/css' };
const server = createServer((req, res) => {
  const file = normalize(join(root, decodeURIComponent(new URL(req.url ?? '/', 'http://127.0.0.1').pathname)));
  if (!file.startsWith(root + sep) || !existsSync(file) || !statSync(file).isFile()) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
const address = server.address();
const port = typeof address === 'object' && address ? address.port : 0;
const browser = await chromium.launch();
try {
  const page = await browser.newPage({ deviceScaleFactor: Number(scale), viewport: { width: 1600, height: 1000 }, reducedMotion: 'reduce' });
  await page.goto(`http://127.0.0.1:${String(port)}/.cache/icons/sheets/${sheet}.html`);
  await page.waitForSelector('body[data-ready="true"]', { state: 'attached' });
  await page.locator(selector).nth(Number(index)).screenshot({ path: out, animations: 'disabled' });
} finally {
  await browser.close();
  server.close();
}
console.log(out);
