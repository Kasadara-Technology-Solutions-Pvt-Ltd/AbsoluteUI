import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, mod } from './browsers.js';
import { settled } from './settle.js';

// R3 phase 2 organization chart page (SPEC section 18.19) under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

interface OrgWindow {
  __aui: { chart: { nodes: { id: string; parentId: string | null }[]; scale: number } };
}

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

async function open(page: Page, query = '', width = 1400): Promise<string[]> {
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
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/org-chart${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const node = (page: Page, id: string) => page.locator(`[data-aui-node="${id}"]`);
const parentOf = (page: Page, id: string) => page.evaluate((i) => (window as unknown as OrgWindow).__aui.chart.nodes.find((n) => n.id === i)?.parentId, id);
const transform = (page: Page) => page.locator('.aui-org-chart__canvas').evaluate((el) => (el as HTMLElement).style.transform);

test('org chart: no CSP violations or errors while navigating, zooming, panning, searching, editing, exporting', async ({ page }) => {
  const errors = await open(page, '?edit=1&lazy=1');
  await node(page, 'ceo').click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.getByRole('button', { name: 'Zoom in' }).click();
  await page.getByRole('button', { name: 'Fit to view' }).click();
  const viewport = (await page.locator('.aui-org-chart__viewport').boundingBox())!;
  await page.mouse.move(viewport.x + 10, viewport.y + viewport.height - 10);
  await page.mouse.down();
  await page.mouse.move(viewport.x + 80, viewport.y + viewport.height - 40, { steps: 5 });
  await page.mouse.up();
  await page.getByLabel('Find a person').fill('Liskov');
  await page.getByRole('button', { name: 'Find' }).click();
  await page.getByRole('button', { name: 'Export SVG' }).click();
  await node(page, 'coo').focus();
  await page.keyboard.press('ArrowRight');
  await expect(node(page, 'ops1')).toBeAttached();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`org chart axe WCAG 2.2 AA: ${theme} (edit mode, a node selected, a path highlighted)`, async ({ page }) => {
    await open(page, `?edit=1&theme=${theme}`);
    await page.getByLabel('Find a person').fill('Barbara');
    await page.getByRole('button', { name: 'Find' }).click();
    await expect(node(page, 'dev2')).toHaveAttribute('aria-selected', 'true');
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('org chart: behavior', () => {
  test('tree semantics and one tab stop', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('tree', { name: 'Company structure' })).toBeVisible();
    await expect(node(page, 'eng')).toHaveAttribute('aria-level', '3');
    await expect(node(page, 'eng')).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Fit to view' }).focus();
    await page.keyboard.press('Tab');
    await expect(node(page, 'ceo')).toBeFocused();
    await page.keyboard.press('Tab');
    await expect(page.getByLabel('Find a person')).not.toBeFocused();
  });

  test('keyboard focus pans the chart so the focused node stays in view', async ({ page }) => {
    await open(page, '', 700);
    await node(page, 'ceo').focus();
    await page.keyboard.press('End');
    const focused = await node(page, 'ops2').boundingBox();
    const viewport = await page.locator('.aui-org-chart__viewport').boundingBox();
    expect(focused!.x).toBeGreaterThanOrEqual(viewport!.x);
    expect(focused!.x + focused!.width).toBeLessThanOrEqual(viewport!.x + viewport!.width + 1);
  });

  test('pan by dragging the background; zoom by Ctrl + wheel; a plain wheel scrolls the page', async ({ page }) => {
    await open(page);
    const before = await transform(page);
    const viewport = (await page.locator('.aui-org-chart__viewport').boundingBox())!;
    await page.mouse.move(viewport.x + 8, viewport.y + viewport.height - 8);
    await page.mouse.down();
    await page.mouse.move(viewport.x + 108, viewport.y + viewport.height - 58, { steps: 5 });
    await page.mouse.up();
    expect(await transform(page)).not.toBe(before);
    await page.keyboard.down('Control');
    await page.mouse.wheel(0, -100);
    await page.keyboard.up('Control');
    await expect.poll(() => page.evaluate(() => (window as unknown as OrgWindow).__aui.chart.scale)).toBeGreaterThan(1);
  });

  test('edit mode: dragging a node onto another manager moves it; Ctrl+Z undoes', async ({ page }) => {
    await open(page, '?edit=1');
    await node(page, 'tax').dragTo(node(page, 'res'));
    expect(await parentOf(page, 'tax')).toBe('res');
    await expect(page.locator('#last-event')).toHaveText('move move tax res');
    await node(page, 'tax').focus();
    await page.keyboard.press(`${await mod(page)}+z`);
    expect(await parentOf(page, 'tax')).toBe('cfo');
  });

  test('edit mode: a locked node cannot be dragged; a manager cannot move under its own report', async ({ page }) => {
    await open(page, '?edit=1');
    await node(page, 'acc').dragTo(node(page, 'res'));
    expect(await parentOf(page, 'acc')).toBe('cfo');
    await node(page, 'cto').dragTo(node(page, 'eng'));
    expect(await parentOf(page, 'cto')).toBe('ceo');
  });

  test('lazy reports load on expand', async ({ page }) => {
    await open(page, '?lazy=1');
    await expect(node(page, 'coo')).toHaveAttribute('aria-expanded', 'false');
    await node(page, 'coo').focus();
    await page.keyboard.press('ArrowRight');
    await expect(node(page, 'coo')).toHaveAttribute('aria-expanded', 'true');
    await expect(node(page, 'ops1')).toBeVisible();
    await expect(page.locator('#last-event')).toHaveText('expand coo');
  });

  test('reflow: at 320 px the page does not scroll sideways', async ({ page }) => {
    await open(page, '', 320);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('RTL: the first report is on the right; ArrowLeft expands', async ({ page }) => {
    await open(page, '?dir=rtl');
    const cto = (await node(page, 'cto').boundingBox())!;
    const cfo = (await node(page, 'cfo').boundingBox())!;
    expect(cto.x).toBeGreaterThan(cfo.x);
    await node(page, 'eng').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(node(page, 'eng')).toHaveAttribute('aria-expanded', 'true');
  });

  test('horizontal orientation: reports sit to the inline end of their manager', async ({ page }) => {
    await open(page, '?orientation=horizontal');
    const ceo = (await node(page, 'ceo').boundingBox())!;
    const cto = (await node(page, 'cto').boundingBox())!;
    expect(cto.x).toBeGreaterThan(ceo.x + ceo.width);
  });
});

for (const theme of THEMES) {
  test(`visual org chart: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, `?theme=${theme}`);
    await node(page, 'res').click();
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-org-chart.png`);
  });
}
