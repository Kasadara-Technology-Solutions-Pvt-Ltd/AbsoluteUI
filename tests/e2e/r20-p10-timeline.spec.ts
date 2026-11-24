import { test, expect, type Page } from '@playwright/test';
import { tabToLink, wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P10: Timeline (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p10-timeline${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const activity = (page: Page) => page.getByRole('list', { name: 'Document activity' });

test('r20-p10 timeline: no CSP violations or errors, including loading and a failing source', async ({ page }) => {
  const errors = await open(page);
  await page.locator('#tl-activity .aui-timeline__toggle').click();
  await page.locator('#tl-activity .aui-timeline__load').click();
  await expect(page.locator('#tl-log')).toHaveText('Loaded 3, more: true');
  await page.locator('#tl-failing .aui-timeline__load').click();
  await expect(page.locator('#tl-failing .aui-timeline__error')).toHaveText('Could not load older items.');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('timeline: ordered list grouped by day with business-calendar day names', async ({ page }) => {
  await open(page);
  await expect(activity(page)).toBeVisible();
  await expect(page.getByRole('heading', { name: 'Today' }).first()).toBeVisible();
  await expect(page.getByRole('list', { name: 'Today' }).first().getByRole('listitem')).toHaveCount(3);
  await expect(page.locator('#tl-horizontal .aui-timeline__day', { hasText: 'Founders Day' })).toBeVisible();
  // Tone is shown by a word, not color only.
  await expect(page.locator('#tl-activity [data-id="scan"] .aui-timeline__status')).toHaveText('Blocked');
  await expect(page.locator('#tl-activity [data-id="approved"] time')).toHaveAttribute('datetime', '2026-11-23T14:00:00.000Z');
});

test('timeline: keyboard reaches actions, Show older moves focus, Load older appends and ends', async ({ page }) => {
  await open(page);
  // The alternate timeline repeats these items, so the queries are scoped to the activity list.
  const actions = activity(page).getByRole('group', { name: 'Policy approved' });
  await actions.getByRole('button', { name: 'Open' }).focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tl-log')).toHaveText('Action open on approved');
  await page.keyboard.press('Tab');
  await expect(actions.getByRole('button', { name: 'Download' })).toBeFocused();
  const review = activity(page).getByRole('link', { name: 'Review requested' });
  await tabToLink(page, review);
  await expect(review).toBeFocused();

  const toggle = page.locator('#tl-activity .aui-timeline__toggle');
  await expect(toggle).toHaveText(/Show 3 older/);
  await expect(toggle).toHaveAttribute('aria-expanded', 'false');
  await toggle.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tl-activity [data-id="comment"]')).toBeFocused();
  await expect(page.locator('#tl-log')).toHaveText('Expanded: true');

  const load = page.locator('#tl-activity .aui-timeline__load');
  await load.focus();
  await page.keyboard.press('Enter');
  await expect(page.locator('#tl-activity [data-id="older-1-0"]')).toBeFocused();
  await page.locator('#tl-activity .aui-timeline__load').click();
  await expect(page.locator('#tl-log')).toHaveText('Loaded 3, more: true');
  await page.locator('#tl-activity .aui-timeline__load').click();
  await expect(page.locator('#tl-log')).toHaveText('Loaded 0, more: false');
  await expect(page.locator('#tl-activity .aui-timeline__load')).toHaveCount(0);
});

// (regression) Browsers map Home and End to vertical scrolling only; the component scrolls the
// horizontal region to its inline start and end, mirrored in RTL.
for (const dir of ['ltr', 'rtl']) {
  test(`timeline: the horizontal timeline is a focusable region that scrolls with the keyboard (${dir})`, async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 800 });
    await open(page, dir === 'rtl' ? '?dir=rtl' : '');
    const region = page.getByRole('region', { name: 'Onboarding plan' });
    await region.focus();
    await expect(region).toBeFocused();
    await expect.poll(() => region.evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
    expect(await region.evaluate((el) => el.scrollLeft)).toBe(0);
    await page.keyboard.press('End');
    await expect.poll(() => region.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
    await expect.poll(() => region.evaluate((el) => Math.abs(Math.abs(el.scrollLeft) - (el.scrollWidth - el.clientWidth)))).toBeLessThanOrEqual(1);
    await page.keyboard.press('Home');
    await expect.poll(() => region.evaluate((el) => Math.abs(el.scrollLeft))).toBe(0);
    await page.keyboard.press(dir === 'rtl' ? 'ArrowLeft' : 'ArrowRight');
    await expect.poll(() => region.evaluate((el) => Math.abs(el.scrollLeft))).toBeGreaterThan(0);
  });
}

test('timeline: alternate layout puts every second item on the other side; RTL mirrors', async ({ page }) => {
  await open(page, '?dir=rtl');
  const items = page.locator('#tl-alternate .aui-timeline__item');
  await expect(items.nth(1)).toHaveClass(/aui-timeline__item--end/);
  const marker = await page.locator('#tl-activity [data-id="approved"] .aui-timeline__marker').boundingBox();
  const content = await page.locator('#tl-activity [data-id="approved"] .aui-timeline__content').boundingBox();
  expect(marker && content && marker.x > content.x).toBe(true);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p10 timeline: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });

  test(`r20-p10 timeline: axe with older items, loading error, and loaded items in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.locator('#tl-activity .aui-timeline__toggle').click();
    await page.locator('#tl-activity .aui-timeline__load').click();
    await expect(page.locator('#tl-log')).toHaveText('Loaded 3, more: true');
    await page.locator('#tl-failing .aui-timeline__load').click();
    await expect(page.locator('#tl-failing .aui-timeline__error')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}

test('r20-p10 timeline: axe in RTL', async ({ page }) => {
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
});
