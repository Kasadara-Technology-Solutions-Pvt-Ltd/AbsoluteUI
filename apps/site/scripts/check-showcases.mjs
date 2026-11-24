/* global document, window, HTMLAnchorElement -- callbacks passed to page.evaluate run in the browser. */
// Showcase gates (R19-6): every showcase frame of the built site passes axe WCAG 2.2 AA in each
// theme and in RTL, loads without CSP violations or errors, and survives its scripted key path.
// Serves apps/site/dist itself on SITE_PORT (default 4342), as static hosting would.
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import { createServer } from 'node:http';
import { extname, join, normalize } from 'node:path';
import { chromium } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';
import { SHOWCASES } from './lib/showcases.mjs';
import { BASE, EXAMPLES_URL, siteDir } from './lib/shared.mjs';

const dist = join(siteDir, 'dist');
const port = Number(process.env.SITE_SHOWCASE_PORT ?? 4342);
const base = `http://127.0.0.1:${port}`;
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.woff2': 'font/woff2', '.png': 'image/png', '.svg': 'image/svg+xml' };
const server = createServer((req, res) => {
  const path = decodeURIComponent(new URL(req.url ?? '/', base).pathname);
  // The build is served under the docs base (docs/PLAN-ONE-SITE.md OS-3): /docs/x is dist/x.
  if (!path.startsWith(`${BASE}/`)) return void res.writeHead(404).end();
  let file = normalize(join(dist, path.slice(BASE.length)));
  if (!file.startsWith(dist)) return void res.writeHead(403).end();
  if (existsSync(file) && statSync(file).isDirectory()) file = join(file, 'index.html');
  if (!existsSync(file)) return void res.writeHead(404).end();
  res.writeHead(200, { 'Content-Type': TYPES[extname(file)] ?? 'application/octet-stream' });
  res.end(readFileSync(file));
});
await new Promise((resolve) => server.listen(port, '127.0.0.1', resolve));

const WCAG = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];
const VARIANTS = ['theme=absolute-default', 'theme=absolute-dark', 'theme=absolute-high-contrast', 'dir=rtl'];

const button = (page, name) => page.getByRole('button', { name, exact: true });
const logHas = async (page, text) => (await page.locator('.sc__log-list').textContent())?.includes(text) ?? false;

/** One key path per showcase: each returns a list of problems (empty when it passed). */
const SMOKE = {
  async forms(page) {
    const out = [];
    await button(page, 'Submit empty').click();
    if (!(await page.locator('.aui-error-summary').isVisible())) out.push('Submit empty shows no error summary');
    await button(page, 'Fill sample data').click();
    await button(page, 'Save profile').click();
    await page.waitForTimeout(200);
    if (!(await logHas(page, 'form aui-submit'))) out.push('a filled form does not submit');
    await page.getByRole('switch', { name: 'Disabled' }).check();
    if (!(await page.getByRole('textbox', { name: /^Full name/ }).isDisabled())) out.push('Disabled does not disable the fields');
    return out;
  },
  async 'rich-text'(page) {
    const out = [];
    const editor = page.getByRole('textbox', { name: /^Announcement/ });
    await editor.click();
    await page.keyboard.press('End');
    await page.keyboard.type(' Showcase check.');
    if (!(await page.locator('pre[aria-label="Sanitized HTML"]').textContent())?.includes('Showcase check.')) out.push('typed text does not reach the HTML output');
    await page.getByRole('switch', { name: 'Read-only' }).check();
    if ((await editor.getAttribute('aria-readonly')) !== 'true') out.push('Read-only does not apply');
    return out;
  },
  async 'schema-form'(page) {
    const out = [];
    const published = page.locator('.aui-schema-form').last();
    await button(page, 'Start empty').click();
    await button(page, 'Build leave request').click();
    if (!(await published.getByRole('combobox', { name: /^Leave type/ }).count())) out.push('the published form does not render the leave request');
    await page.getByRole('button', { name: 'Text', exact: true }).first().click();
    if (!(await logHas(page, 'builder aui-change'))) out.push('adding a field from the palette logs no builder change');
    await button(page, 'Fill sample answers').click();
    await published.getByRole('button', { name: 'Request leave' }).click();
    await page.waitForTimeout(200);
    if (!(await logHas(page, 'form aui-submit'))) out.push('the published form does not submit');
    if (!(await page.locator('.sc-status').last().textContent())?.includes('"type":"annual"')) out.push('the submitted JSON value is not shown');
    return out;
  },
  async buttons(page) {
    const out = [];
    await button(page, 'Italic').click();
    if (!(await logHas(page, 'formatting aui-change'))) out.push('formatting toggle logs no change');
    await button(page, 'Pin').click();
    if ((await button(page, 'Pin').getAttribute('aria-pressed')) !== 'true') out.push('toggle button does not press');
    await page.getByRole('switch', { name: 'Disabled' }).check();
    if (!(await button(page, 'Primary').isDisabled())) out.push('Disabled does not disable buttons');
    return out;
  },
  async datetime(page) {
    const out = [];
    const text = await page.locator('.sc-status').first().textContent();
    if (!text?.includes('working days')) out.push('no working-day summary');
    await page.getByRole('switch', { name: 'Disabled' }).check();
    await page.waitForTimeout(100);
    if ((await page.locator('[aria-disabled="true"], :disabled').count()) === 0) out.push('Disabled does not disable the pickers');
    return out;
  },
  async periods(page) {
    const out = [];
    if (!(await page.locator('.sc-status').first().textContent())?.includes('2026-10')) out.push('summary does not show the month');
    await page.getByRole('switch', { name: 'Disabled' }).check();
    if ((await page.locator(':disabled, [aria-disabled="true"]').count()) === 0) out.push('Disabled does not apply');
    return out;
  },
  async recurrence(page) {
    const out = [];
    if ((await page.locator('.sc__stage').textContent())?.trim() === '') out.push('nothing rendered');
    await page.getByRole('switch', { name: 'Disabled' }).check();
    if ((await page.locator(':disabled, [aria-disabled="true"]').count()) === 0) out.push('Disabled does not apply');
    return out;
  },
  async auth(page) {
    const out = [];
    await page.getByLabel(/^Password/).first().fill('correct horse battery');
    await button(page, 'Continue').click();
    await page.waitForTimeout(700);
    if (!(await logHas(page, 'password accepted'))) out.push('the demo password is not accepted');
    await page.keyboard.type('135790');
    await page.waitForTimeout(700);
    if (!(await logHas(page, 'signed in'))) out.push('the demo code does not sign in');
    return out;
  },
  async upload(page) {
    const out = [];
    await page.locator('#sc-failure-rate, .sc__control').first().waitFor();
    await button(page, 'Add sample files').click();
    await page.waitForTimeout(5000);
    if (!(await logHas(page, 'queue aui-change'))) out.push('the queue does not report progress');
    return out;
  },
  async navigation(page) {
    const out = [];
    await page.getByRole('button', { name: 'Teams', exact: true }).click();
    if ((await page.locator('.sc-shell__title').textContent()) !== 'Teams') out.push('sidebar selection does not update the page');
    await page.getByRole('tab', { name: 'Onboarding' }).click();
    if (!(await logHas(page, 'tabs aui-change'))) out.push('tabs log no change');
    await page.getByRole('button', { name: 'Actions' }).click();
    if (!(await page.getByRole('menuitem', { name: 'Invite people' }).isVisible())) out.push('actions menu does not open');
    await page.keyboard.press('Escape');
    return out;
  },
  async overlays(page) {
    const out = [];
    await button(page, 'Edit name').click();
    if (!(await page.locator('dialog[open]').isVisible())) out.push('dialog does not open');
    await page.keyboard.press('Escape');
    await page.waitForTimeout(200);
    if (await page.locator('dialog[open]').count()) out.push('Escape does not close the dialog');
    await button(page, 'Open filters drawer').click();
    if (!(await page.locator('dialog[open]').isVisible())) out.push('drawer does not open');
    await page.keyboard.press('Escape');
    return out;
  },
  async feedback(page) {
    const out = [];
    await button(page, 'Show toast').click();
    await page.waitForTimeout(300);
    if ((await page.locator('.aui-toast').count()) === 0) out.push('no toast shown');
    await button(page, 'Run export').click();
    await page.waitForTimeout(3200);
    if (!(await logHas(page, 'export finished'))) out.push('the export does not finish');
    return out;
  },
  async layout(page) {
    const out = [];
    if ((await page.locator('.aui-card').count()) < 4) out.push('member cards missing');
    await page.getByRole('switch', { name: 'Sunken cards' }).check();
    return out;
  },
  async disclosure(page) {
    const out = [];
    await page.getByRole('button', { name: 'Where is my payslip?' }).click();
    if (!(await logHas(page, 'accordion aui-change'))) out.push('accordion logs no change');
    await page.getByRole('button', { name: /next/i }).first().click();
    if (!(await logHas(page, 'carousel aui-change'))) out.push('carousel does not move');
    return out;
  },
  async preferences(page) {
    const out = [];
    const rating = page.getByRole('slider', { name: 'How was your onboarding?' });
    await rating.focus();
    await page.keyboard.press('ArrowLeft');
    if (!(await logHas(page, 'rating aui-change'))) out.push('rating keys log no change');
    await page.getByRole('combobox', { name: /^Office/ }).click();
    await page.getByRole('option', { name: /^India/ }).click();
    await page.getByRole('option', { name: /^Karnataka/ }).click();
    await page.waitForTimeout(900);
    if (!(await logHas(page, 'server answered'))) out.push('cascader does not load cities');
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Type', exact: true }).click();
    await page.getByRole('textbox', { name: 'Type your full name' }).fill('Ana Ruiz');
    await page.getByRole('textbox', { name: 'Type your full name' }).press('Tab');
    if (!(await page.locator('.sc-status').last().textContent())?.includes('Signed as Ana Ruiz')) out.push('typed signature not summarized');
    await page.getByRole('switch', { name: 'Disabled' }).check();
    await page.waitForTimeout(100);
    if ((await rating.getAttribute('aria-disabled')) !== 'true') out.push('Disabled does not disable the rating');
    return out;
  },
  async 'data-table'(page) {
    const out = [];
    await page.getByRole('button', { name: /^Salary/ }).first().click();
    if (!(await logHas(page, 'table aui-sort-change'))) out.push('sorting logs nothing');
    await page.getByRole('switch', { name: 'Simulated server' }).check();
    await page.waitForTimeout(800);
    if (!(await logHas(page, 'server answered'))) out.push('server mode does not load');
    return out;
  },
  async 'data-grid'(page) {
    const out = [];
    if ((await page.locator('[role="row"]').count()) < 5) out.push('grid rows missing');
    return out;
  },
  async pivot(page) {
    const out = [];
    if (!(await page.locator('.sc__stage').textContent())?.includes('Engineering')) out.push('pivot shows no departments');
    return out;
  },
  async sortable(page) {
    const out = [];
    await button(page, 'Move first to bottom').click();
    if (!(await page.locator('.sc-status').textContent())?.includes('5. Hire two platform engineers')) out.push('move does not reorder');
    return out;
  },
  async workspace(page) {
    const out = [];
    const list = page.getByRole('listbox', { name: 'Employees' });
    if ((await list.getByRole('option').count()) > 60) out.push('the virtual list renders too many items');
    await list.getByRole('option').first().click();
    if (!(await logHas(page, 'list aui-change'))) out.push('selecting logs no change');
    await page.keyboard.press('End');
    if (!(await page.locator('.sc-status').textContent())?.includes('of 10,000')) out.push('End does not reach the last employee');
    const separator = page.getByRole('separator', { name: 'Employees' });
    await separator.focus();
    await page.keyboard.press('ArrowRight');
    if (!(await logHas(page, 'splitter aui-change'))) out.push('the separator does not resize');
    await page.getByRole('combobox', { name: 'Department' }).click();
    await page.getByRole('option', { name: 'Legal (no one)' }).click();
    if (!(await page.getByText('No employees in this department').isVisible())) out.push('an empty filter shows no empty state');
    return out;
  },
  async diagram(page) {
    const out = [];
    const list = page.getByRole('listbox', { name: 'Leave approval: nodes' });
    if ((await list.getByRole('option').count()) !== 6) out.push('the workflow does not show six nodes');
    await page.getByRole('combobox', { name: 'Layout direction' }).click();
    await page.getByRole('option', { name: 'Left to right' }).click();
    if (!(await logHas(page, 'diagram aui-change'))) out.push('changing the direction does not lay out');
    await page.getByRole('switch', { name: 'Edit mode' }).check();
    await list.getByRole('option', { name: /^Approved: / }).focus();
    await page.keyboard.press('Delete');
    if ((await list.getByRole('option').count()) !== 5) out.push('Delete does not remove the node');
    await page.getByRole('button', { name: 'Undo', exact: true }).first().click();
    if ((await list.getByRole('option').count()) !== 6) out.push('undo does not restore the node');
    if (!(await page.locator('.sc-json').textContent())?.includes('"manager"')) out.push('the model JSON is not shown');
    return out;
  },
  async documents(page) {
    const out = [];
    const files = page.locator('.aui-file-manager__viewport').first();
    const photos = files.getByRole('option', { name: /^Badge photos/ });
    await photos.waitFor({ timeout: 10000 }).catch(() => out.push('the file manager lists no folders'));
    await photos.dblclick();
    await files.getByRole('option', { name: /^Ada Lovelace/ }).waitFor({ timeout: 10000 }).catch(() => out.push('opening a folder does not list its files'));
    if (!(await logHas(page, 'file-manager aui-navigate'))) out.push('opening a folder logs no aui-navigate');
    await files.getByRole('option', { name: /^Grace Hopper/ }).dblclick();
    await page.getByRole('img', { name: 'Badge photo of Grace Hopper' }).first().waitFor({ state: 'visible', timeout: 10000 }).catch(() => out.push('opening a photo does not show it in the image viewer'));
    if (!(await page.locator('.aui-code-viewer').first().textContent())?.includes('halfDays')) out.push('the code viewer shows no diff');
    await button(page, 'Start tour').click();
    if (!(await page.getByRole('dialog', { name: 'Welcome to the document center' }).isVisible())) out.push('the tour does not start');
    await page.keyboard.press('Escape');
    if (!(await logHas(page, 'tour aui-skip'))) out.push('Escape does not skip the tour');
    await page.getByRole('button', { name: /^Show \d+ older/ }).click();
    if (!(await logHas(page, 'timeline aui-toggle'))) out.push('showing older activity logs no aui-toggle');
    return out;
  },
  async tree(page) {
    const out = [];
    const tree = page.getByRole('tree', { name: 'Company documents' });
    const payroll = tree.getByRole('treeitem', { name: /^Payroll/ });
    await payroll.locator('.aui-tree-view__twisty').click();
    await tree.getByRole('treeitem', { name: /Payslip run/ }).first().waitFor({ timeout: 10000 }).catch(() => out.push('a lazy folder does not load'));
    if (!(await logHas(page, 'tree aui-expand'))) out.push('expanding logs no aui-expand');
    await tree.getByRole('treeitem', { name: 'Travel policy' }).click();
    if (!(await logHas(page, 'tree aui-select'))) out.push('selecting logs no aui-select');
    await page.keyboard.press('Alt+ArrowUp');
    if (!(await logHas(page, 'tree aui-move'))) out.push('Alt+ArrowUp does not move the node');
    const field = page.getByRole('combobox', { name: 'Department', exact: true });
    await field.fill('plat');
    await field.press('ArrowDown');
    await page.keyboard.press('Enter');
    if (!(await logHas(page, 'tree-select aui-change'))) out.push('choosing a department logs no aui-change');
    await button(page, 'Open command palette').click();
    const dialog = page.getByRole('dialog', { name: 'Command palette' });
    if (!(await dialog.isVisible())) out.push('the command palette does not open');
    await page.keyboard.type('leave');
    await page.keyboard.press('Enter');
    if (!(await logHas(page, 'palette aui-select'))) out.push('choosing a command logs no aui-select');
    return out;
  },
  async 'org-chart'(page) {
    const out = [];
    await page.waitForTimeout(800);
    if (!(await page.locator('.sc__stage').textContent())?.includes('Ada Lovelace')) out.push('chart shows no root');
    return out;
  },
  async 'charts-basic'(page) {
    const out = [];
    if ((await page.locator('svg').count()) < 4) out.push('charts missing');
    await page.getByRole('switch', { name: 'Patterns' }).check();
    // R20-15: annotations, synchronized charts, and the opt-in animation switch.
    if ((await page.locator('.aui-chart__annotations').count()) < 2) out.push('annotations missing');
    await page.getByRole('switch', { name: 'Animate (respects reduced motion)' }).check();
    if ((await page.locator('.aui-chart--animate').count()) < 4) out.push('animation switch has no effect');
    return out;
  },
  async 'charts-advanced'(page) {
    const out = [];
    if ((await page.locator('svg').count()) < 6) out.push('charts missing');
    return out;
  },
  async 'charts-kpi'(page) {
    const out = [];
    if ((await page.locator('svg').count()) < 5) out.push('charts missing');
    return out;
  },
  async 'charts-special'(page) {
    const out = [];
    if ((await page.locator('svg.aui-chart__svg').count()) < 3) out.push('charts missing');
    await page.locator('.aui-candlestick-chart').getByRole('button', { name: 'Reset zoom' }).click();
    if (!(await logHas(page, 'candles aui-zoom'))) out.push('candlestick reset zoom logs nothing');
    const node = page.locator('.aui-network-graph [tabindex="0"]');
    await node.focus();
    await page.keyboard.press('Shift+ArrowRight');
    if (!(await logHas(page, 'network aui-node-pin'))) out.push('network Shift+Arrow does not pin');
    if ((await page.locator('.aui-calendar-heatmap__cell--holiday').count()) < 3) out.push('calendar holidays not marked');
    return out;
  },
  async dashboard(page) {
    const out = [];
    await page.waitForTimeout(800);
    if ((await page.locator('[data-aui-status="ready"]').count()) < 3) out.push('widgets do not load');
    if ((await page.locator('[data-aui-status="error"]').count()) > 0) out.push('a widget shows an error');
    await page.getByRole('switch', { name: 'Edit dashboard' }).check();
    await page.waitForTimeout(200);
    if (!(await logHas(page, 'aui-mode-change'))) out.push('edit mode logs nothing');
    return out;
  },
  async scheduler(page) {
    const out = [];
    await page.waitForTimeout(800);
    if (!(await page.locator('.sc__stage').textContent())?.includes('Design review')) out.push('events do not load');
    return out;
  },
  async kanban(page) {
    const out = [];
    if (!(await page.locator('.sc__stage').textContent())?.includes('Ada K.')) out.push('cards missing');
    return out;
  },
  async gantt(page) {
    const out = [];
    if (!(await page.locator('.sc__stage').textContent())?.includes('User research')) out.push('tasks missing');
    await page.getByRole('switch', { name: 'Baselines' }).check();
    return out;
  },
  async chat(page) {
    const out = [];
    await page.getByRole('button', { name: 'How much leave do I have?', exact: true }).click();
    const reply = page.locator('article.aui-chat__message--assistant').last();
    await reply.locator('strong', { hasText: '14 days' }).waitFor({ timeout: 15000 }).catch(() => out.push('the streamed reply does not arrive'));
    if (!(await logHas(page, 'chat aui-suggestion'))) out.push('choosing a suggestion logs no aui-suggestion');
    await reply.getByRole('button', { name: 'Good response' }).click();
    if (!(await logHas(page, 'chat aui-feedback'))) out.push('rating a reply logs no aui-feedback');
    await button(page, 'Fail the next reply').click();
    const field = page.getByRole('textbox', { name: 'Message' });
    await field.fill('Where is my payslip?');
    await field.press('Enter');
    const failed = page.locator('article.aui-chat__message--assistant').last();
    await failed.locator('.aui-chat__error').waitFor({ timeout: 15000 }).catch(() => out.push('a failed reply shows no error'));
    await failed.getByRole('button', { name: 'Retry' }).click().catch(() => out.push('no Retry on a failed reply'));
    await failed.locator('.aui-chat__error').waitFor({ state: 'detached', timeout: 15000 }).catch(() => out.push('Retry does not recover'));
    if (!(await logHas(page, 'chat aui-retry'))) out.push('Retry logs no aui-retry');
    return out;
  },
  async discussion(page) {
    const out = [];
    const stage = page.locator('.sc__stage');
    if ((await stage.locator('.aui-discussion__replying').count()) === 0) out.push('the seeded thread is not deeper than the indentation cap');
    if ((await stage.locator('.aui-discussion__comment--deleted').count()) === 0) out.push('no deleted placeholder');
    await stage.getByRole('button', { name: 'Reply to Katherine Johnson' }).first().click();
    const box = stage.getByRole('textbox', { name: /^Reply to Katherine Johnson/ });
    await box.fill('Count me in');
    await box.press('Control+Enter');
    await stage.getByRole('article').filter({ hasText: 'Count me in' }).waitFor({ timeout: 5000 }).catch(() => out.push('a reply at depth is not added'));
    if (!(await logHas(page, 'discussion aui-reply'))) out.push('replying logs no aui-reply');
    const composer = stage.getByRole('textbox', { name: /^Add a comment/ });
    await composer.fill('x'.repeat(300));
    await button(page, 'Comment').click();
    if ((await composer.getAttribute('aria-invalid')) !== 'true') out.push('an over-limit comment is not blocked');
    const mine = stage.getByRole('article').filter({ hasText: 'Count me in' });
    await mine.getByRole('button', { name: 'Delete comment by Ada Lovelace' }).click();
    await stage.getByRole('group', { name: 'Delete this comment?' }).getByRole('button', { name: 'Delete', exact: true }).click();
    if (!(await logHas(page, 'discussion aui-delete'))) out.push('deleting logs no aui-delete');
    await stage.getByRole('button', { name: 'Show 3 replies' }).click();
    await stage.getByText('Six chargers').waitFor({ timeout: 5000 }).catch(() => out.push('lazy replies do not load'));
    return out;
  },
};

const browser = await chromium.launch();
const context = await browser.newContext({ viewport: { width: 1024, height: 900 } });
await context.addInitScript(() => {
  const log = [];
  Object.defineProperty(window, '__problems', { value: log });
  document.addEventListener('securitypolicyviolation', (e) => log.push(`CSP ${e.violatedDirective} ${e.blockedURI}`));
  window.addEventListener('error', (e) => log.push(`error ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => log.push(`rejection ${String(e.reason)}`));
});

const problems = [];
for (const sc of SHOWCASES) {
  const url = `${EXAMPLES_URL}/showcase/${sc.id}.html`;
  for (const variant of VARIANTS) {
    const page = await context.newPage();
    page.on('console', (m) => {
      if (m.type() === 'error') problems.push(`${sc.id} (${variant}): console ${m.text().slice(0, 160)}`);
    });
    await page.goto(`${base}${url}?${variant}`, { waitUntil: 'load' });
    await page.waitForSelector('.sc__stage', { timeout: 5000 }).catch(() => problems.push(`${sc.id} (${variant}): no showcase rendered`));
    await page.waitForTimeout(300);
    const result = await new AxeBuilder({ page }).withTags(WCAG).analyze();
    for (const v of result.violations) problems.push(`${sc.id} (${variant}): axe ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ') ?? ''}`);
    if (variant === VARIANTS[0]) {
      const smoke = SMOKE[sc.id];
      if (!smoke) problems.push(`${sc.id}: no smoke test`);
      else for (const p of await smoke(page).catch((e) => [`smoke failed: ${String(e).slice(0, 200)}`])) problems.push(`${sc.id}: ${p}`);
    }
    for (const p of await page.evaluate(() => window.__problems)) problems.push(`${sc.id} (${variant}): ${p}`);
    await page.close();
  }
}
// Focus mode (R20-26): each component page embeds its part of a multi-component showcase
// (`?focus=<name>`). At least one section shows, every visible section declares the component
// (or sits inside one that does), nothing else is on the stage, the note links the full
// showcase, and the page loads without errors or CSP violations and passes axe.
const focusPairs = SHOWCASES.filter((sc) => sc.components.length > 1).flatMap((sc) => sc.components.map((name) => ({ sc, name })));
for (const { sc, name } of focusPairs) {
  const label = `${sc.id} (focus=${name})`;
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`${label}: console ${m.text().slice(0, 160)}`);
  });
  await page.goto(`${base}${EXAMPLES_URL}/showcase/${sc.id}.html?focus=${name}&${VARIANTS[0]}`, { waitUntil: 'load' });
  await page.waitForSelector('.sc__stage', { timeout: 5000 }).catch(() => problems.push(`${label}: no showcase rendered`));
  await page.waitForTimeout(300);
  const state = await page.evaluate((focus) => {
    const stage = document.querySelector('.sc__stage');
    if (!stage) return null;
    const visible = (el) => el.checkVisibility();
    const declares = (el) => (el.getAttribute('data-components') ?? '').split(' ').includes(focus);
    const covered = (el) => {
      for (let e = el; e && stage.contains(e) && e !== stage; e = e.parentElement?.closest('[data-components]') ?? null) if (declares(e)) return true;
      return false;
    };
    const name = (el) => el.querySelector(':scope > h2, :scope > legend')?.textContent?.trim() || el.getAttribute('data-components') || el.className || el.tagName.toLowerCase();
    const shown = [...stage.querySelectorAll('[data-components]')].filter(visible);
    const stray = [...stage.children].filter((c) => visible(c) && !c.matches('[data-components]') && !c.querySelector('[data-components]'));
    const link = document.querySelector('.sc__focus a');
    return {
      focused: document.querySelector('.sc')?.classList.contains('sc--focus') === true,
      declaring: shown.filter(declares).length,
      wrong: shown.filter((p) => !covered(p)).map(name),
      stray: stray.map(name),
      link: link instanceof HTMLAnchorElement && link.target === '_blank' && !new URL(link.href).searchParams.has('focus'),
    };
  }, name);
  if (!state) problems.push(`${label}: no stage`);
  else {
    if (!state.focused) problems.push(`${label}: focus mode not applied (no section declares ${name})`);
    if (state.declaring === 0) problems.push(`${label}: no visible section declares ${name}`);
    for (const w of state.wrong) problems.push(`${label}: visible section "${w}" does not declare ${name}`);
    for (const w of state.stray) problems.push(`${label}: content outside an annotated section stays visible: ${w}`);
    if (!state.link) problems.push(`${label}: the note does not link the full showcase in a new tab`);
  }
  for (const v of (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations) problems.push(`${label}: axe ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ') ?? ''}`);
  for (const p of await page.evaluate(() => window.__problems)) problems.push(`${label}: ${p}`);
  await page.close();
}

// Playgrounds (R20-7): load without errors, every on/off option switched once without the
// component rejecting it, and axe before and after.
const pgDir = join(dist, 'examples', 'playground');
const pgNames = existsSync(pgDir) ? readdirSync(pgDir).filter((f) => f.endsWith('.html')).map((f) => f.slice(0, -5)) : [];
for (const name of pgNames) {
  const page = await context.newPage();
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`playground ${name}: console ${m.text().slice(0, 160)}`);
  });
  await page.goto(`${base}${EXAMPLES_URL}/playground/${name}.html?${VARIANTS[0]}`, { waitUntil: 'load' });
  await page.waitForSelector('.pg__options', { timeout: 5000 }).catch(() => problems.push(`playground ${name}: not rendered`));
  await page.waitForTimeout(200);
  const rejected = async (when) => {
    const text = await page.locator('.pg__stage-wrap').textContent().catch(() => '');
    if (text?.includes('The component rejected these options')) problems.push(`playground ${name}: options rejected ${when}`);
  };
  await rejected('at start');
  for (const v of (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations) problems.push(`playground ${name}: axe ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ') ?? ''}`);
  const switches = page.locator('.pg__options [role="switch"]');
  const count = await switches.count();
  for (let i = 0; i < count; i++) {
    const label = await switches.nth(i).getAttribute('aria-labelledby').catch(() => null);
    await switches.nth(i).click({ timeout: 2000 }).catch(() => problems.push(`playground ${name}: switch ${String(i)} not clickable`));
    await page.keyboard.press('Escape');
    await rejected(`after switch ${label ?? String(i)}`);
  }
  if (count) for (const v of (await new AxeBuilder({ page }).withTags(WCAG).analyze()).violations) problems.push(`playground ${name} (after switching): axe ${v.id}: ${v.help} (${v.nodes.length}) ${v.nodes[0]?.target.join(' ') ?? ''}`);
  for (const p of await page.evaluate(() => window.__problems)) problems.push(`playground ${name}: ${p}`);
  await page.close();
}

await browser.close();
server.close();

if (problems.length) {
  console.error(`check-showcases: ${problems.length} problem(s)`);
  for (const p of [...new Set(problems)]) console.error(`  ${p}`);
  process.exit(1);
}
console.log(`check-showcases: ok (${SHOWCASES.length} showcases x ${VARIANTS.length} variants, axe WCAG 2.2 AA, smoke paths; ${focusPairs.length} focus views; ${pgNames.length} playgrounds)`);
