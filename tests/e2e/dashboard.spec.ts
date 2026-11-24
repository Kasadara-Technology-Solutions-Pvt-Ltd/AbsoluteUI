import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, mod } from './browsers.js';
import { settled } from './settle.js';

// R3 dashboard page (SPEC section 18.17) under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

interface DashboardWindow {
  __aui: { grid: { items: { id: string; x: number; y: number; w: number; h: number }[]; breakpoint: { name: string } } };
}


const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

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
  await page.setViewportSize({ width: 1400, height: 1000 });
  await page.goto(`/dashboard${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const item = (page: Page, id: string) => page.evaluate((i) => (window as unknown as DashboardWindow).__aui.grid.items.find((x) => x.id === i), id);
const order = (page: Page) => page.locator('#grid > [data-aui-item]').evaluateAll((els) => els.map((e) => (e as HTMLElement).dataset.auiItem));

test('dashboard: no CSP violations or errors while editing, dragging, adding, maximizing', async ({ page }) => {
  const errors = await open(page, '?edit=1');
  const handle = page.getByRole('button', { name: 'Move Revenue', exact: true });
  const target = (await page.locator('[data-aui-item="notes"]').boundingBox())!;
  await handle.dragTo(page.locator('[data-aui-item="notes"]'), { targetPosition: { x: 20, y: target.height - 10 } });
  await page.getByRole('button', { name: 'Add KPI' }).click();
  await page.getByRole('button', { name: 'Maximize Tickets' }).click();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`dashboard axe WCAG 2.2 AA: ${theme} (edit mode, one item grabbed)`, async ({ page }) => {
    await open(page, `?edit=1&theme=${theme}`);
    await page.getByRole('button', { name: 'Move Active users', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Move Active users', exact: true })).toHaveAttribute('aria-pressed', 'true');
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('dashboard: behavior', () => {
  test('the harness grid uses the 12-column breakpoint at 1400 px', async ({ page }) => {
    await open(page);
    expect(await page.evaluate(() => (window as unknown as DashboardWindow).__aui.grid.breakpoint.name)).toBe('lg');
  });

  test('keyboard: grab, move, resize, drop; DOM order and focus follow; undo restores', async ({ page }) => {
    await open(page, '?edit=1');
    const handle = page.getByRole('button', { name: 'Move Revenue', exact: true });
    await handle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Enter');
    await expect(handle).toHaveAttribute('aria-pressed', 'false');
    await expect(handle).toBeFocused();
    const moved = await item(page, 'revenue');
    expect(moved?.w).toBe(4);
    expect((await order(page))[0]).not.toBe('revenue');
    await page.keyboard.press(`${await mod(page)}+z`);
    expect(await item(page, 'revenue')).toMatchObject({ x: 0, y: 0, w: 3 });
  });

  test('Escape cancels a keyboard move', async ({ page }) => {
    await open(page, '?edit=1');
    const handle = page.getByRole('button', { name: 'Move Notes', exact: true });
    const before = await item(page, 'notes');
    await handle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
    expect(await item(page, 'notes')).toEqual(before);
  });

  test('pointer: dragging the handle moves the item; the corner grip resizes it', async ({ page }) => {
    await open(page, '?edit=1');
    const before = (await item(page, 'notes'))!;
    const notes = page.locator('[data-aui-item="notes"]');
    const box = (await notes.boundingBox())!;
    const grip = notes.locator('.aui-dashboard__resize');
    const g = (await grip.boundingBox())!;
    await page.mouse.move(g.x + g.width / 2, g.y + g.height / 2);
    await page.mouse.down();
    await page.mouse.move(g.x + g.width / 2 + box.width / 2, g.y + g.height / 2 + 100, { steps: 10 });
    await page.mouse.up();
    const resized = await item(page, 'notes');
    expect(resized!.w).toBeGreaterThan(before.w);
    expect(resized!.h).toBeGreaterThan(before.h);
  });

  test('catalog: activating a template adds a widget and focuses its move handle', async ({ page }) => {
    await open(page, '?edit=1');
    await page.getByRole('button', { name: 'Add Note' }).click();
    await expect(page.getByRole('button', { name: 'Move Note 1', exact: true })).toBeFocused();
    await expect(page.locator('#last-event')).toHaveText('layout add note-1');
  });

  test('widget: collapse is a disclosure; maximize is a modal dialog that Escape restores; remove removes the item', async ({ page }) => {
    await open(page);
    const collapse = page.getByRole('button', { name: 'Collapse Notes' });
    await collapse.click();
    await expect(page.getByRole('button', { name: 'Expand Notes' })).toHaveAttribute('aria-expanded', 'false');
    await page.getByRole('button', { name: 'Maximize Tickets' }).click();
    const dialog = page.getByRole('dialog', { name: 'Tickets' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Restore Tickets' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(dialog).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Maximize Tickets' })).toBeFocused();
    await page.getByRole('button', { name: 'Remove Active users' }).click();
    await expect(page.locator('[data-aui-item="users"]')).toHaveCount(0);
    expect((await page.evaluate(() => (window as unknown as DashboardWindow).__aui.grid.items.map((i) => i.id))).includes('users')).toBe(false);
  });

  test('stat cards read value and a spelled-out change', async ({ page }) => {
    await open(page);
    const card = page.getByRole('group', { name: 'Revenue' }).last();
    await expect(card).toContainText('$128,400');
    await expect(card).toContainText('increase of 14.6%, favorable');
  });

  test('responsive: a narrow page switches to the single-column layout', async ({ page }) => {
    await open(page);
    await page.setViewportSize({ width: 360, height: 800 });
    await expect.poll(() => page.evaluate(() => (window as unknown as DashboardWindow).__aui.grid.breakpoint.name)).toBe('sm');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('RTL: Right arrow moves toward the inline end (left)', async ({ page }) => {
    await open(page, '?edit=1&dir=rtl');
    const handle = page.getByRole('button', { name: 'Move Notes', exact: true });
    await handle.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('Enter');
    expect((await item(page, 'notes'))!.x).toBe(1);
  });
});

for (const theme of THEMES) {
  test(`visual dashboard: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, `?edit=1&theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-dashboard.png`);
  });
}
