// Visual and accessibility check of every marketing page (docs/PLAN-R4.md C14): each page at
// 375, 768, 1280, 1440, 1920, and 3840 CSS px; axe WCAG 2.2 A/AA on each page (light and
// dark at 1440); no horizontal page scroll; no console errors or CSP violations; the reduced-
// motion setting removes transitions. Screenshots go to .cache/marketing/shots/<width>/.
//
// Options: --pages=/,/components/  --widths=1440,375  --no-axe  --no-shots
import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { AxeBuilder } from '@axe-core/playwright';
import { serve } from './lib/serve.mjs';
import { cacheDir, distDir, walk } from './lib/shared.mjs';

const arg = (name) => process.argv.find((a) => a.startsWith(`--${name}=`))?.split('=')[1];
const WIDTHS = (arg('widths') ?? '375,768,1280,1440,1920,3840').split(',').map(Number);
const HEIGHT = { 375: 812, 768: 1024, 1280: 800, 1440: 900, 1920: 1080, 3840: 2160 };
const axe = !process.argv.includes('--no-axe');
const shots = !process.argv.includes('--no-shots');

const allPages = walk(distDir)
  .filter((f) => f.endsWith('index.html') && !f.includes(`${join('dist', 'frames')}`))
  .map((f) => '/' + f.slice(distDir.length + 1).replace(/\\/g, '/').replace(/index\.html$/, ''))
  .sort();
const pages = arg('pages')?.split(',') ?? allPages;

const problems = [];
const { url, close } = await serve(distDir);
const browser = await chromium.launch();
try {
  for (const width of WIDTHS) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT[width] ?? 900 } });
    for (const path of pages) {
      const page = await context.newPage();
      const errors = [];
      page.on('console', (m) => {
        if (m.type() === 'error') errors.push(m.text());
      });
      page.on('pageerror', (e) => errors.push(e.message));
      // 'load', not 'networkidle': a video element can keep a media request open.
      await page.goto(url + path, { waitUntil: 'load' });
      // Load lazy frames by scrolling through the page, then return to the top.
      await page.evaluate(async () => {
        for (let y = 0; y < document.body.scrollHeight; y += innerHeight / 2) {
          scrollTo(0, y);
          await new Promise((r) => setTimeout(r, 60));
        }
        scrollTo(0, 0);
      });
      await page.waitForLoadState('networkidle', { timeout: 5000 }).catch(() => undefined);
      await page.waitForTimeout(400);
      const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
      if (overflow > 1) problems.push(`${path} @${width}: horizontal scroll (${overflow}px)`);
      for (const e of errors) problems.push(`${path} @${width}: console error: ${e.slice(0, 200)}`);
      if (shots) {
        const dir = join(cacheDir, 'shots', String(width));
        mkdirSync(dir, { recursive: true });
        const name = path === '/' ? 'home' : path.replace(/^\/|\/$/g, '').replace(/\//g, '_');
        await page.screenshot({ path: join(dir, `${name}.png`), fullPage: true });
      }
      if (axe && width === 1440) {
        for (const theme of ['light', 'dark']) {
          if (theme === 'dark') {
            await page.evaluate(() => {
              document.documentElement.dataset.theme = 'dark';
            });
            await page.waitForTimeout(150);
          }
          const result = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa']).exclude('iframe').analyze();
          for (const v of result.violations) problems.push(`${path} (${theme}): axe ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ')}`);
        }
      }
      await page.close();
    }
    await context.close();
  }
  // Reduced motion: transitions collapse to (near) zero.
  const context = await browser.newContext({ reducedMotion: 'reduce', viewport: { width: 1440, height: 900 } });
  const page = await context.newPage();
  await page.goto(url + '/', { waitUntil: 'networkidle' });
  const duration = await page.evaluate(() => getComputedStyle(document.querySelector('.button') ?? document.body).transitionDuration);
  if (!duration.split(',').every((d) => parseFloat(d) <= 0.001)) problems.push(`reduced motion: .button transition-duration is ${duration}`);
  await context.close();
} finally {
  await browser.close();
  await close();
}

if (problems.length) {
  console.error(`check-pages: ${problems.length} problem(s)`);
  for (const p of problems) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-pages: ok (${pages.length} pages x ${WIDTHS.length} widths${axe ? ', axe light and dark' : ''})`);
