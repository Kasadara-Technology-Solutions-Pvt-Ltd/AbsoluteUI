import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P3: Virtual List, Splitter, Empty State (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p3${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('r20-p3: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('virtual list: 100,000 items render a small window; keyboard keeps focus while scrolling', async ({ page }) => {
  await open(page);
  const list = page.getByRole('listbox', { name: 'Employees' });
  expect(await list.locator('[role="option"]').count()).toBeLessThan(40);
  await list.getByRole('option').first().focus();
  await page.keyboard.press('End');
  const last = list.getByRole('option', { name: 'Employee 100000' });
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('aria-posinset', '100000');
  await expect(last).toHaveAttribute('aria-setsize', '100000');
  await list.evaluate((el) => { el.scrollTop = 0; });
  await page.waitForTimeout(100);
  await expect(last).toBeFocused();
  await page.keyboard.press('Home');
  // Type-ahead includes the space; "Employee 00005" is the prefix of Employee 000050 to 000059.
  await page.keyboard.type('Employee 00005');
  await expect(list.getByRole('option', { name: 'Employee 000050' })).toBeFocused();
  // Space within the type-ahead window continues the query; after it, Space selects.
  await page.waitForTimeout(600);
  await page.keyboard.press('Space');
  await expect(page.locator('#vl-people-selected')).toHaveText('Selected: e50');
  await expect(list.getByRole('option', { name: 'Employee 000050' })).toHaveAttribute('aria-selected', 'true');
});

test('virtual list: multiple selection with Shift ranges and disabled items', async ({ page }) => {
  await open(page);
  const list = page.getByRole('listbox', { name: 'Departments' });
  await expect(list).toHaveAttribute('aria-multiselectable', 'true');
  await list.getByRole('option', { name: 'Engineering' }).click();
  // Engineering -> Finance -> Marketing -> (Operations, disabled, skipped) -> People.
  await page.keyboard.press('Shift+ArrowDown');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(list.getByRole('option', { name: 'Marketing' })).toBeFocused();
  await page.keyboard.press('Shift+ArrowDown');
  // Operations is disabled: skipped by the keyboard and never selected.
  await expect(list.getByRole('option', { name: 'People' })).toBeFocused();
  await expect(list.getByRole('option', { name: 'Operations' })).toHaveAttribute('aria-selected', 'false');
  await expect(list.getByRole('option', { selected: true })).toHaveCount(4);
});

test('virtual list: plain list and infinite scroll with a polite status', async ({ page }) => {
  await open(page);
  const plain = page.getByRole('list', { name: 'Audit log' });
  await expect(plain).toHaveAttribute('tabindex', '0');
  await expect(plain.getByRole('listitem').first()).toBeVisible();
  const feed = page.getByRole('list', { name: 'Activity' });
  await expect(feed.getByRole('listitem').first()).toHaveText('Activity 1');
  await feed.evaluate((el) => { el.scrollTop = el.scrollHeight; });
  await expect(page.locator('#vl-infinite .aui-virtual-list__status')).toHaveText(/items loaded/);
  await expect.poll(async () => feed.evaluate((el) => el.querySelector('[aria-posinset]')?.getAttribute('aria-setsize'))).toMatch(/^(-1|\d+)$/);
});

test('splitter: APG separator with keyboard resize and collapse', async ({ page }) => {
  await open(page);
  const sep = page.locator('#split-main').getByRole('separator', { name: 'Folders' });
  await expect(sep).toHaveAttribute('aria-valuenow', '30');
  await expect(sep).toHaveAttribute('aria-orientation', 'vertical');
  await sep.focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#split-sizes')).toHaveText(/^keyboard: /);
  expect(Number(await sep.getAttribute('aria-valuenow'))).toBeGreaterThan(30);
  await page.keyboard.press('End');
  await expect(sep).toHaveAttribute('aria-valuenow', '60');
  await page.keyboard.press('Enter');
  await expect(sep).toHaveAttribute('aria-valuetext', 'Folders, collapsed');
  await expect(page.locator('#split-main .aui-splitter__pane').first()).toBeHidden();
  await page.keyboard.press('Enter');
  await expect(sep).not.toHaveAttribute('aria-valuetext', /collapsed/);
  await sep.dblclick();
  await expect(page.locator('#split-sizes')).toHaveText('reset: 30 / 70');
});

test('splitter: pointer drag resizes; nested splitters work independently; RTL mirrors keys', async ({ page }) => {
  await open(page);
  const sep = page.locator('#split-main').getByRole('separator', { name: 'Folders' });
  // page.mouse works in viewport coordinates and does not scroll: bring the separator into view first.
  await sep.scrollIntoViewIfNeeded();
  const box = await sep.boundingBox();
  if (!box) throw new Error('no separator box');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.mouse.down();
  await page.mouse.move(box.x + 80, box.y + box.height / 2, { steps: 5 });
  await page.mouse.up();
  await expect(page.locator('#split-sizes')).toHaveText(/^drag: /);
  const inner = page.locator('#split-nested').getByRole('separator', { name: 'Editor' });
  await expect(inner).toHaveAttribute('aria-orientation', 'horizontal');
  await inner.focus();
  await page.keyboard.press('ArrowUp');
  expect(Number(await inner.getAttribute('aria-valuenow'))).toBeLessThan(65);

  await open(page, '?dir=rtl');
  const rtl = page.locator('#split-main').getByRole('separator', { name: 'Folders' });
  await rtl.focus();
  await page.keyboard.press('ArrowLeft');
  expect(Number(await rtl.getAttribute('aria-valuenow'))).toBeGreaterThan(30);
});

test('empty state: heading, description, actions, and a status region', async ({ page }) => {
  await open(page);
  const search = page.locator('#empty-search');
  await expect(search).toHaveAttribute('role', 'status');
  await expect(search.getByRole('heading', { level: 3, name: 'No employees match your filters' })).toBeVisible();
  await expect(search.locator('.aui-empty-state__media')).toHaveAttribute('aria-hidden', 'true');
  await page.keyboard.press('Tab');
  await search.getByRole('button', { name: 'Clear filters' }).click();
  await expect(page.locator('#empty-log')).toHaveText('Action: primary');
  await expect(search.getByRole('link', { name: 'Help' })).toHaveAttribute('href', '#empty-states');
  await expect(page.locator('#empty-first').getByRole('heading')).toHaveCount(0);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p3: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}

test('r20-p3: axe in RTL', async ({ page }) => {
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
});
