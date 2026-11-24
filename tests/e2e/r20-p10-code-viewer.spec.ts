import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P10: Code Viewer (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p10-code-viewer${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const region = (page: Page, name: string) => page.getByRole('region', { name });

test('r20-p10 code viewer: no CSP violations or errors while toggling and scrolling', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: 'Side by side' }).click();
  await page.getByRole('button', { name: 'Wrap lines' }).first().click();
  await region(page, 'Generated constants').evaluate((el) => {
    el.scrollTop = 100_000;
  });
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`code viewer: axe clean in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Side by side' }).click();
    expect(await axe(page)).toEqual([]);
  });
}

test('code viewer: highlighted tokens are text, the region is keyboard scrollable, and the summary describes it', async ({ page }) => {
  await open(page);
  const code = region(page, 'Leave request handler');
  await expect(code).toHaveAttribute('tabindex', '0');
  await expect(code.locator('.aui-code-viewer__t--keyword').first()).toHaveText('import');
  await expect(code.locator('.aui-code-viewer__line--highlight')).toHaveCount(1);
  await expect(code.locator('.aui-code-viewer__line--highlight .aui-visually-hidden')).toHaveText('Highlighted: ');
  const describedBy = await code.getAttribute('aria-describedby');
  await expect(page.locator(`#${describedBy ?? ''}`)).toHaveText('7 lines, TypeScript');
  const big = region(page, 'Generated constants');
  await big.focus();
  await page.keyboard.press('PageDown');
  await expect.poll(() => big.evaluate((el) => el.scrollTop)).toBeGreaterThan(0);
  await page.keyboard.press('End');
  await expect(big.locator('.aui-code-viewer__num', { hasText: /^10000$/ })).toBeVisible();
  expect(await big.locator('.aui-code-viewer__row').count()).toBeLessThan(200);
});

test('code viewer: wrap toggle by keyboard, copy, and announcements', async ({ page, context, browserName }) => {
  test.skip(browserName !== 'chromium', 'clipboard permissions are Chromium-only in Playwright');
  await context.grantPermissions(['clipboard-read', 'clipboard-write']);
  await open(page);
  const wrap = page.getByRole('button', { name: 'Wrap lines' }).first();
  await wrap.focus();
  await page.keyboard.press('Enter');
  await expect(wrap).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#code-log')).toHaveText('Wrap: true');
  await page.getByRole('button', { name: 'Copy code' }).first().click();
  await expect(page.locator('#code-log')).toHaveText(/^Copied \d+ characters$/);
  expect(await page.evaluate(() => navigator.clipboard.readText())).toContain('export async function requestLeave');
});

test('code viewer: diff marks changes with text and switches modes', async ({ page }) => {
  await open(page);
  const diff = region(page, 'Leave policy changes');
  await expect(diff.locator('.aui-code-viewer__line--insert').first().locator('.aui-visually-hidden')).toHaveText('Added: ');
  await expect(diff.locator('.aui-code-viewer__line--delete').first().locator('.aui-visually-hidden')).toHaveText('Removed: ');
  await expect(page.locator('#code-diff .aui-code-viewer__stats')).toHaveText('5 added, 3 removed');
  const split = page.getByRole('button', { name: 'Side by side' });
  await split.click();
  await expect(split).toHaveAttribute('aria-pressed', 'true');
  await expect(page.locator('#diff-log')).toHaveText('Mode: split');
  await expect(diff.locator('.aui-code-viewer__row--split').first()).toBeVisible();
  await page.getByRole('button', { name: 'Unified' }).click();
  await expect(page.locator('#diff-log')).toHaveText('Mode: unified');
});

test('code viewer: RTL mirrors the toolbar but keeps the code left to right', async ({ page }) => {
  await open(page, '?dir=rtl');
  const canvas = region(page, 'Leave request handler').locator('.aui-code-viewer__canvas');
  await expect(canvas).toHaveAttribute('dir', 'ltr');
  expect(await axe(page)).toEqual([]);
});
