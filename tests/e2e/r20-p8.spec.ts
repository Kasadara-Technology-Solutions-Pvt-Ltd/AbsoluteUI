import { test, expect, type Page } from '@playwright/test';
import { mod, wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P8: Diagram (docs/PLAN-R20.md).
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

async function open(page: Page, query = ''): Promise<string[]> {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
  await page.goto(`/r20-p8${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const nodes = (page: Page, name: string) => page.getByRole('listbox', { name: `${name}: nodes` });

test('r20-p8: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('diagram viewer: nodes are named options; arrows move focus spatially; Enter activates', async ({ page }) => {
  await open(page);
  const list = nodes(page, 'Leave approval');
  await expect(list.getByRole('option')).toHaveCount(6);
  const request = list.getByRole('option', { name: /^Leave request, ellipse/ });
  await request.focus();
  await page.keyboard.press('ArrowDown');
  const manager = list.getByRole('option', { name: /^Manager approval, decision, leads to HR check \(Yes\)/ });
  await expect(manager).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#view-log')).toHaveText('Activated: Manager approval');
  await page.keyboard.press('Space');
  await expect(manager).toHaveAttribute('aria-selected', 'true');
  const toggle = page.locator('#viewer').getByRole('button', { name: 'Show text description' });
  await toggle.click();
  await expect(page.locator('#viewer').getByRole('table', { name: 'Leave approval: nodes and connections' }).locator('tbody tr')).toHaveCount(6);
});

test('diagram viewer: canvas arrow keys pan, + zooms, 0 fits', async ({ page }) => {
  await open(page);
  const canvas = page.locator('#diagram-view .aui-diagram__viewport');
  const scene = page.locator('#diagram-view .aui-diagram__scene');
  await canvas.focus();
  const before = await scene.getAttribute('transform');
  await page.keyboard.press('ArrowRight');
  expect(await scene.getAttribute('transform')).not.toBe(before);
  await page.keyboard.press('+');
  await page.keyboard.press('0');
  await expect(page.locator('#diagram-view').getByRole('button', { name: 'Zoom in' })).toBeVisible();
});

test('diagram editor: keyboard connect, move mode, label, delete, undo', async ({ page }) => {
  await open(page);
  const list = nodes(page, 'Expense approval');
  const approved = list.getByRole('option', { name: /^Approved,/ });
  const request = list.getByRole('option', { name: /^Leave request,/ });
  // Connect Approved -> Leave request by keyboard.
  await approved.focus();
  await page.keyboard.press('c');
  await request.focus();
  await page.keyboard.press('c');
  await expect(page.locator('#edit-log')).toHaveText('connect: 6 nodes, 7 edges');
  // Move mode.
  await request.focus();
  await page.keyboard.press('m');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(page.locator('#edit-log')).toHaveText('move: 6 nodes, 7 edges');
  // Inline label (plain text).
  await page.keyboard.press('Enter');
  const editor = page.locator('#diagram-edit .aui-diagram__editor');
  await expect(editor).toBeFocused();
  await editor.fill('Expense claim');
  await page.keyboard.press('Enter');
  await expect(list.getByRole('option', { name: /^Expense claim,/ })).toBeFocused();
  // Delete and undo.
  await page.keyboard.press('Delete');
  await expect(page.locator('#edit-log')).toHaveText('delete: 5 nodes, 5 edges');
  // Mod+Z: Meta on Apple user agents (the WebKit project is Desktop Safari), Control elsewhere.
  await page.keyboard.press(`${await mod(page)}+z`);
  await expect(page.locator('#edit-log')).toHaveText('undo: 6 nodes, 7 edges');
});

test('diagram editor: palette click adds a node; marquee selects; port drag connects', async ({ page }) => {
  await open(page);
  const host = page.locator('#diagram-edit');
  await host.getByRole('button', { name: 'Decision' }).click();
  await expect(page.locator('#edit-log')).toHaveText('add: 7 nodes, 6 edges');
  await expect(nodes(page, 'Expense approval').getByRole('option', { name: /^Decision, decision/ })).toBeFocused();
  // Marquee from the top-left corner of the canvas over everything.
  // The drag must stay inside the browser window: Firefox ends a mouse drag that leaves it
  // (Chromium keeps delivering the moves), so scroll the canvas into view first.
  const viewport = host.locator('.aui-diagram__viewport');
  await viewport.scrollIntoViewIfNeeded();
  const box = await viewport.boundingBox();
  const win = page.viewportSize();
  if (!box || !win) throw new Error('no viewport');
  await page.keyboard.press('0');
  await page.mouse.move(box.x + 4, box.y + 4);
  await page.mouse.down();
  await page.mouse.move(Math.min(box.x + box.width, win.width) - 4, Math.min(box.y + box.height, win.height) - 4, { steps: 8 });
  await page.mouse.up();
  await expect(page.locator('#select-log')).toContainText('Selected: request');
  // Port drag: from Leave request's right port to Approved.
  const port = host.locator('[data-aui-node="request"] [data-aui-port="bottom"] .aui-diagram__port-hit');
  const target = host.locator('[data-aui-node="approved"] .aui-diagram__shape');
  await host.locator('[data-aui-node="request"]').hover();
  const p = await port.boundingBox();
  const t = await target.boundingBox();
  if (!p || !t) throw new Error('no port or target');
  await page.mouse.move(p.x + p.width / 2, p.y + p.height / 2);
  await page.mouse.down();
  await page.mouse.move(t.x + t.width / 2, t.y + t.height / 2, { steps: 10 });
  await page.mouse.up();
  await expect(page.locator('#edit-log')).toHaveText('connect: 7 nodes, 7 edges');
});

// Performance budgets: tests/e2e/perf-r20-p8.spec.ts (performance project).

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p8: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}

test('r20-p8: axe in RTL', async ({ page }) => {
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
});
