import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { readFileSync } from 'node:fs';
import { settled } from './settle.js';

// R1 pickers and data table page (SPEC section 18.7, section 18.10) under the strict CSP harness.
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
  await page.goto(`/data${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('data: no CSP violations or errors while exercising pickers and the table', async ({ page }) => {
  const errors = await open(page);
  await page.getByRole('button', { name: /Choose date|Change date/ }).first().click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Choose time' }).click();
  await page.keyboard.press('Escape');
  await page.getByRole('button', { name: 'Customer' }).click();
  await page.getByRole('table', { name: 'Orders' }).getByRole('checkbox', { name: 'Select all rows' }).check();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`data axe WCAG 2.2 AA: ${theme}`, () => {
    test('page with a selected row', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('checkbox', { name: /Select row ORD-1001/ }).check();
      expect(await axe(page)).toEqual([]);
    });

    test('date picker open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: /Choose date|Change date/ }).first().click();
      await expect(page.getByRole('dialog', { name: 'Choose date' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('data grid with an expanded row, a filter, and the column chooser open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      const grid = page.getByRole('table', { name: 'Employees' });
      await grid.getByRole('searchbox', { name: 'Filter Name' }).fill('a');
      await page.getByRole('button', { name: 'Columns' }).click();
      await expect(page.getByRole('menu')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('date-time picker open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: /date and time/ }).click();
      await expect(page.getByRole('dialog').last()).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('data: behavior', () => {
  test('calendar keyboard navigation and selection', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('grid');
    await grid.locator('[tabindex="0"]').focus();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-value')).toContainText('"day":19');
    await page.keyboard.press('PageDown');
    await expect(page.locator('#calendar [aria-live="polite"]')).toHaveText(/April 2026/);
  });

  test('date picker: keyboard opens the calendar, selection writes the field and returns focus', async ({ page }) => {
    await open(page);
    const button = page.getByRole('button', { name: /Change date/ }).first();
    await button.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('dialog', { name: 'Choose date' }).getByRole('grid')).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: 'Start date' }).getByRole('textbox', { name: 'Day' })).toHaveValue('09');
    await expect(button).toBeFocused();
  });

  test('date-time picker resolves a DST-gap time with the documented policy', async ({ page }) => {
    await open(page);
    const group = page.getByRole('group', { name: 'Meeting' });
    await group.getByRole('textbox', { name: 'Hour' }).fill('02');
    await group.getByRole('textbox', { name: 'Minute' }).fill('30');
    await group.getByRole('textbox', { name: 'AM/PM' }).fill('A');
    await expect(page.locator('#date-time-picker')).toContainText('Adjusted to');
  });

  test('data table: sorting, pagination, selection, and header semantics', async ({ page }) => {
    await open(page);
    const table = page.getByRole('table', { name: 'Orders' });
    await expect(table.getByRole('columnheader', { name: 'Order' })).toHaveAttribute('aria-sort', 'ascending');
    await table.getByRole('button', { name: 'Amount' }).click();
    await expect(table.getByRole('columnheader', { name: 'Amount' })).toHaveAttribute('aria-sort', 'ascending');
    await expect(table.getByRole('columnheader', { name: 'Order' })).not.toHaveAttribute('aria-sort', /.*/);
    const pager = page.getByRole('navigation', { name: 'Orders, pagination' });
    await pager.getByRole('button', { name: 'Page 2' }).click();
    await expect(table.getByRole('row')).toHaveCount(11);
    await table.getByRole('checkbox', { name: 'Select all rows' }).check();
    await expect(page.locator('#selected')).not.toHaveText('none');
    await expect(table.getByRole('rowheader').first()).toBeVisible();
  });

  test('data table scroll region is keyboard reachable and the page reflows at 320px', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const region = page.getByRole('region', { name: 'Orders' });
    await expect(region).toHaveAttribute('tabindex', '0');
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

test.describe('data grid: behavior', () => {
  test('no CSP violations or errors while exercising every grid feature, including the CSV download', async ({ page }) => {
    const errors = await open(page);
    const grid = page.getByRole('table', { name: 'Employees' });
    await page.getByRole('searchbox', { name: 'Search' }).fill('engineering');
    await grid.getByRole('button', { name: /^Start date/ }).click({ modifiers: ['Shift'] });
    await grid.getByRole('separator', { name: 'Resize Salary' }).focus();
    await page.keyboard.press('ArrowRight');
    await grid.getByRole('button', { name: /^Details for/ }).nth(1).click();
    await page.getByRole('button', { name: 'Columns' }).click();
    await page.getByRole('menuitemcheckbox', { name: 'Notes' }).click();
    await page.keyboard.press('Escape');
    const region = page.getByRole('region', { name: 'Readings' });
    await region.evaluate((el) => {
      el.scrollTop = 100_000;
    });
    const download = page.waitForEvent('download');
    await page.getByRole('button', { name: 'Export CSV' }).click();
    const file = await download;
    expect(file.suggestedFilename()).toBe('employees.csv');
    const text = readFileSync(await file.path(), 'utf8');
    expect(text.split('\r\n')[0]).toBe('Name,Department,Salary,Start date,Remote');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('multi-sort from the keyboard: Shift+Enter adds a column, priorities are exposed', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('table', { name: 'Employees' });
    await expect(grid.getByRole('columnheader', { name: /Department/ })).toHaveAttribute('aria-sort', 'ascending');
    await expect(grid.getByRole('button', { name: 'Salary sort priority 2, descending' })).toBeVisible();
    const start = grid.getByRole('button', { name: /^Start date/ });
    await start.focus();
    await page.keyboard.press('Shift+Enter');
    await expect(grid.getByRole('button', { name: 'Start date sort priority 3, ascending' })).toBeFocused();
    await expect(page.locator('#grid-events')).toHaveText('aui-sort-change');
    await page.keyboard.press('Enter');
    await expect(grid.getByRole('columnheader', { name: /Start date/ })).toHaveAttribute('aria-sort', 'descending');
    await expect(grid.locator('.aui-data-table__sort-priority:visible')).toHaveCount(0);
  });

  test('filters from the keyboard and announces the result count', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('table', { name: 'Employees' });
    await grid.getByRole('combobox', { name: 'Filter Department' }).selectOption('Finance');
    await grid.getByRole('spinbutton', { name: 'Minimum Salary' }).fill('100000');
    await page.keyboard.press('Enter');
    await expect(page.locator('#grid-events')).toHaveText('aui-filter-change');
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText(/^Results: \d+$/);
    for (const cell of await grid.locator('tbody tr.aui-data-table__row td:nth-child(4)').allTextContents()) expect(cell).toBe('Finance');
  });

  test('resizes columns with the keyboard and by pointer drag', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('table', { name: 'Employees' });
    const header = grid.getByRole('columnheader', { name: /Salary/ });
    const handle = grid.getByRole('separator', { name: 'Resize Salary' });
    const before = (await header.boundingBox())!.width;
    await handle.focus();
    await page.keyboard.press('Shift+ArrowRight');
    await expect.poll(async () => Math.round((await header.boundingBox())!.width)).toBe(Math.round(before) + 50);
    await expect(handle).toHaveAttribute('aria-valuenow', String(Math.round(before) + 50));
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2 - 40, box.y + box.height / 2, { steps: 4 });
    await page.mouse.up();
    await expect.poll(async () => Math.round((await header.boundingBox())!.width)).toBe(Math.round(before) + 10);
    await expect(page.locator('#grid-events')).toHaveText('aui-columns-change');
  });

  test('row expansion is a disclosure: aria-expanded, aria-controls, focus stays', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('table', { name: 'Employees' });
    const first = grid.getByRole('button', { name: /^Details for/ }).first();
    await expect(first).toHaveAttribute('aria-expanded', 'true');
    const second = grid.getByRole('button', { name: /^Details for/ }).nth(1);
    await second.focus();
    await page.keyboard.press('Enter');
    await expect(second).toHaveAttribute('aria-expanded', 'true');
    const id = await second.getAttribute('aria-controls');
    await expect(page.locator(`[id="${id ?? ''}"]`)).toContainText('works in');
    await expect(second).toBeFocused();
    await page.keyboard.press('Space');
    await expect(second).toHaveAttribute('aria-expanded', 'false');
  });

  test('column chooser: keyboard opens the menu, Space toggles a column, Escape returns focus', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Columns' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Name' })).toHaveAttribute('aria-disabled', 'true');
    await page.getByRole('menuitemcheckbox', { name: 'Notes' }).focus();
    await page.keyboard.press('Space');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Notes' })).toHaveAttribute('aria-checked', 'false');
    await expect(page.getByRole('table', { name: 'Employees' }).getByRole('columnheader', { name: 'Notes' })).toHaveCount(0);
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('pinned columns stay at the inline start edge while scrolling, in ltr and rtl', async ({ page }) => {
    await page.setViewportSize({ width: 600, height: 900 });
    await open(page);
    const region = page.getByRole('region', { name: 'Employees' });
    const name = page.getByRole('table', { name: 'Employees' }).getByRole('columnheader', { name: /^Name/ });
    const edge = async (): Promise<number> => {
      const r = (await region.boundingBox())!;
      const n = (await name.boundingBox())!;
      return (await region.evaluate((el) => getComputedStyle(el).direction)) === 'rtl' ? r.x + r.width - (n.x + n.width) : n.x - r.x;
    };
    const ltr = await edge();
    await region.evaluate((el) => {
      el.scrollLeft = 400;
    });
    expect(Math.abs((await edge()) - ltr)).toBeLessThan(2);
    await page.locator('#grid').evaluate((el) => {
      el.setAttribute('dir', 'rtl');
    });
    await region.evaluate((el) => {
      el.scrollLeft = -400;
    });
    expect(Math.abs((await edge()) - ltr)).toBeLessThan(2);
  });

  test('virtual rows: aria-rowcount, aria-rowindex after keyboard scrolling, focus kept', async ({ page }) => {
    await open(page);
    const table = page.getByRole('table', { name: 'Readings' });
    await expect(table).toHaveAttribute('aria-rowcount', '10001');
    expect(await table.locator('tbody tr.aui-data-table__row').count()).toBeLessThan(40);
    const firstBox = table.getByRole('checkbox', { name: 'Select row Sensor 1', exact: true });
    await firstBox.focus();
    await page.keyboard.press('Space');
    const region = page.getByRole('region', { name: 'Readings' });
    await region.focus();
    await page.keyboard.press('End');
    const last = table.getByRole('row', { name: /Sensor 10000/ });
    await expect(last).toHaveAttribute('aria-rowindex', '10001');
    await expect(firstBox).toHaveCount(0);
    await page.keyboard.press('Home');
    await expect(firstBox).toBeChecked();
    // The focused row stays rendered while far out of view.
    await firstBox.focus();
    await region.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });
    await expect(firstBox).toBeFocused();
    await page.keyboard.press('Space');
    await expect(firstBox).not.toBeChecked();
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`visual data: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1100, height: 1300 });
    await open(page, `?theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-data.png`);
  });
}
