import { test, expect, type Page } from '@playwright/test';
import { mod, wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P4: Tree View, Tree Select, Command Palette (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p4${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const node = (page: Page, tree: string, name: string) => page.getByRole('tree', { name: tree }).getByRole('treeitem', { name, exact: true });

test('r20-p4: no CSP violations or errors, including lazy loading and the palette', async ({ page }) => {
  const errors = await open(page);
  await node(page, 'Documents', 'Archive').locator('.aui-tree-view__twisty').click();
  await expect(node(page, 'Documents', '2024')).toBeVisible();
  await page.keyboard.press(`${await mod(page)}+k`);
  await page.keyboard.type('ada');
  await expect(page.getByRole('option', { name: 'Ada Lovelace' })).toBeVisible();
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('tree view: APG keys, type-ahead, * expands siblings, and multiple selection', async ({ page }) => {
  await open(page);
  const policies = node(page, 'Documents', 'Policies');
  await expect(policies).toHaveAttribute('aria-expanded', 'true');
  await expect(policies).toHaveAttribute('aria-level', '1');
  await policies.focus();
  await page.keyboard.press('ArrowDown');
  const leave = node(page, 'Documents', 'Leave policy');
  await expect(leave).toBeFocused();
  await expect(leave).toHaveAttribute('aria-level', '2');
  await expect(leave).toHaveAttribute('aria-posinset', '1');
  await expect(leave).toHaveAttribute('aria-setsize', '3');
  await page.keyboard.press('ArrowLeft');
  await expect(policies).toBeFocused();
  await page.keyboard.press('ArrowLeft');
  await expect(policies).toHaveAttribute('aria-expanded', 'false');
  await page.keyboard.press('*');
  await expect(policies).toHaveAttribute('aria-expanded', 'true');
  await expect(node(page, 'Documents', 'Handbook')).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('End');
  await expect(node(page, 'Documents', 'Locked file')).toBeFocused();
  await expect(node(page, 'Documents', 'Locked file')).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Home');
  await page.keyboard.type('Han');
  await expect(node(page, 'Documents', 'Handbook')).toBeFocused();
  await page.keyboard.press('Space');
  await page.keyboard.press('Shift+ArrowDown');
  await expect(page.locator('#tree-log')).toHaveText('Selected: handbook, welcome');
  await expect(page.getByRole('tree', { name: 'Documents' })).toHaveAttribute('aria-multiselectable', 'true');
});

test('tree view: lazy children show loading, then load; a failed load shows a retry message', async ({ page }) => {
  await open(page);
  const archive = node(page, 'Documents', 'Archive');
  await archive.focus();
  await page.keyboard.press('ArrowRight');
  await expect(archive).toHaveAttribute('aria-busy', 'true');
  await expect(node(page, 'Documents', '2025')).toBeVisible();
  await expect(archive).toHaveAttribute('aria-expanded', 'true');
  const broken = page.getByRole('tree', { name: 'Documents' }).getByRole('treeitem', { name: /Broken folder/ });
  await broken.focus();
  await page.keyboard.press('ArrowRight');
  await expect(broken).toContainText('Could not load. Press Enter to retry.');
  await expect(broken).toHaveClass(/aui-tree-view__item--error/);
});

test('tree view: keyboard move (cut and paste, Alt+Arrow) and rename', async ({ page }) => {
  await open(page);
  await node(page, 'Documents', 'Travel policy').focus();
  await page.keyboard.press('Alt+ArrowUp');
  await expect(page.locator('#tree-log')).toHaveText('Moved travel to policies at 0 by keyboard');
  await expect(node(page, 'Documents', 'Travel policy')).toHaveAttribute('aria-posinset', '1');
  await page.keyboard.press('Control+x');
  await expect(node(page, 'Documents', 'Travel policy')).toHaveClass(/aui-tree-view__item--cut/);
  await node(page, 'Documents', 'Handbook').focus();
  await page.keyboard.press('Control+v');
  await expect(page.locator('#tree-log')).toHaveText('Moved travel to handbook at 2 by keyboard');
  await expect(node(page, 'Documents', 'Travel policy')).toHaveAttribute('aria-level', '2');
  await expect(node(page, 'Documents', 'Travel policy')).toBeFocused();
  await page.keyboard.press('F2');
  const input = page.getByRole('textbox', { name: 'Rename Travel policy' });
  await expect(input).toBeFocused();
  await input.fill('Travel rules');
  await page.keyboard.press('Enter');
  await expect(page.locator('#tree-log')).toHaveText('Renamed Travel policy to Travel rules');
  await expect(node(page, 'Documents', 'Travel rules')).toBeFocused();
});

test('tree view: pointer drag reorders and reparents', async ({ page }) => {
  await open(page);
  const source = node(page, 'Documents', 'Expenses policy');
  const target = node(page, 'Documents', 'Handbook');
  const from = await source.boundingBox();
  const to = await target.boundingBox();
  if (!from || !to) throw new Error('no boxes');
  // (regression) x + 40 is the empty twisty of the leaf: a drag may start there, as on the rest of the row.
  await page.mouse.move(from.x + 40, from.y + from.height / 2);
  await page.mouse.down();
  await page.mouse.move(from.x + 60, from.y + from.height / 2 + 10, { steps: 4 });
  await page.mouse.move(to.x + 60, to.y + to.height / 2, { steps: 8 });
  await expect(target).toHaveClass(/aui-tree-view__item--drop-inside/);
  await page.mouse.up();
  await expect(page.locator('#tree-log')).toHaveText(/Moved expenses to handbook at \d by pointer/);
});

test('tree view: tri-state checkboxes cascade', async ({ page }) => {
  await open(page);
  const europe = node(page, 'Locations', 'Europe');
  await expect(europe).toHaveAttribute('aria-checked', 'mixed');
  await europe.focus();
  await page.keyboard.press('Space');
  await expect(europe).toHaveAttribute('aria-checked', 'true');
  await expect(page.locator('#tree-checked')).toHaveText('Checked: berlin, emea, paris, zurich; mixed: ');
  await node(page, 'Locations', 'Tokyo').click();
  await expect(node(page, 'Locations', 'Asia Pacific')).toHaveAttribute('aria-checked', 'mixed');
});

test('tree view: 12,000 visible nodes render a small window', async ({ page }) => {
  await open(page);
  const big = page.getByRole('tree', { name: 'Large tree' });
  expect(await big.getByRole('treeitem').count()).toBeLessThan(60);
  await big.getByRole('treeitem').first().focus();
  await page.keyboard.press('End');
  const last = big.getByRole('treeitem', { name: 'Item 100.120' });
  await expect(last).toBeFocused();
  await expect(last).toHaveAttribute('aria-posinset', '120');
});

test('tree view: filtering keeps paths to matches and highlights them', async ({ page }) => {
  await open(page);
  await page.evaluate(() => {
    (window as unknown as { __tree: { update(o: { filter: string }): void } }).__tree.update({ filter: 'pension' });
  });
  const tree = page.getByRole('tree', { name: 'Documents' });
  await expect(tree.getByRole('treeitem')).toHaveCount(3);
  await expect(node(page, 'Documents', 'Benefits')).toHaveAttribute('aria-expanded', 'true');
  await expect(tree.locator('mark.aui-tree-view__match')).toHaveText('Pension');
});

test('tree select: single choice through the tree, validation, and a hidden input', async ({ page }) => {
  await open(page);
  const field = page.getByRole('combobox', { name: 'Department' });
  await field.focus();
  await page.keyboard.press('Tab');
  await expect(page.locator('#select-dept')).toContainText('Select an option');
  await field.focus();
  await page.keyboard.type('plat');
  await expect(field).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  const platform = page.getByRole('tree', { name: 'Department options' }).getByRole('treeitem', { name: /Platform/ });
  await expect(platform).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(field).toBeFocused();
  await expect(field).toHaveValue('Platform');
  await expect(field).toHaveAttribute('aria-expanded', 'false');
  await expect(page.locator('#select-dept input[type="hidden"][name="department"]')).toHaveValue('eng-platform');
  await expect(page.locator('#select-log')).toHaveText('select-dept: eng-platform');
});

test('tree select: multiple choice with checkboxes, tags, and lazy children', async ({ page }) => {
  await open(page);
  const field = page.getByRole('combobox', { name: 'Locations' });
  await expect(page.locator('#select-locations .aui-tree-select__tag')).toHaveText(['Berlin']);
  // WebKit's focus() does not always scroll the field into view; the popup is anchored to it, so an off-screen field leaves the popup off-screen.
  await field.scrollIntoViewIfNeeded();
  await field.focus();
  await page.keyboard.press('ArrowDown');
  const tree = page.getByRole('tree', { name: 'Locations options' });
  await tree.getByRole('treeitem', { name: 'Paris' }).click();
  await expect(page.locator('#select-locations .aui-tree-select__tag')).toHaveText(['Europe']);
  await tree.getByRole('treeitem', { name: 'Asia Pacific' }).locator('.aui-tree-view__twisty').click();
  await expect(tree.getByRole('treeitem', { name: 'Tokyo' })).toBeVisible();
  await page.keyboard.press('Escape');
  await field.focus();
  await page.keyboard.press('Backspace');
  await expect(page.locator('#select-locations .aui-tree-select__tag')).toHaveCount(0);
});

test('command palette: Ctrl+K, fuzzy search with highlights, nested pages, Backspace, and focus restore', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('button', { name: 'Search commands' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  await expect(dialog).toBeVisible();
  const input = dialog.getByRole('combobox', { name: 'Search commands' });
  await expect(input).toBeFocused();
  await expect(dialog.getByText('Recent')).toBeVisible();
  await page.keyboard.type('gtp');
  const first = dialog.getByRole('option').first();
  await expect(first).toHaveText(/Go to people/);
  await expect(first.locator('mark')).toHaveCount(3);
  await expect(input).toHaveAttribute('aria-activedescendant', (await first.getAttribute('id')) ?? '');
  await input.fill('change');
  await page.keyboard.press('Enter');
  await expect(dialog.locator('.aui-command-palette__trail')).toHaveText('Change theme');
  await expect(dialog.getByRole('option', { name: 'Dark theme' })).toBeVisible();
  await page.keyboard.press('Backspace');
  await expect(dialog.locator('.aui-command-palette__crumbs')).toBeHidden();
  await input.fill('change');
  await page.keyboard.press('Enter');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeHidden();
  await expect(page.locator('#cmdk-log')).toHaveText('Command: theme-dark in theme');
  await expect(trigger).toBeFocused();
  await page.keyboard.press(`${await mod(page)}+k`);
  await expect(dialog).toBeVisible();
  await page.keyboard.type('zzzzqx');
  await expect(dialog.locator('.aui-empty-state')).toContainText('No results for "zzzzqx"');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});

test('command palette: 2,000 commands render a small window; disabled commands are skipped', async ({ page }) => {
  await open(page);
  await page.keyboard.press(`${await mod(page)}+k`);
  const dialog = page.getByRole('dialog', { name: 'Command palette' });
  expect(await dialog.getByRole('option').count()).toBeLessThan(40);
  await page.keyboard.type('export');
  await expect(dialog.getByRole('option', { name: 'Export report' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Enter');
  await expect(dialog).toBeVisible();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p4: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });

  test(`r20-p4: axe with the palette and a tree select popup open in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    const locations = page.getByRole('combobox', { name: 'Locations' });
    // WebKit's focus() does not always scroll the field into view; the popup is anchored to it, so an off-screen field leaves the popup off-screen.
    await locations.scrollIntoViewIfNeeded();
    await locations.focus();
    await page.keyboard.press('Alt+ArrowDown');
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.keyboard.press(`${await mod(page)}+k`);
    await page.keyboard.type('go');
    expect(await axe(page)).toEqual([]);
  });
}

test('r20-p4: axe in RTL', async ({ page }) => {
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
});
