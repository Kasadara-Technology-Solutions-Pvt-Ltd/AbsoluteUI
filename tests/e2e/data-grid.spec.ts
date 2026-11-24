import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, engine } from './browsers.js';
import { settled } from './settle.js';

// R11 Data Grid (docs/PLAN-R11-G1.md) under the strict CSP harness.
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
  await page.goto(`/data-grid${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`data grid axe WCAG 2.2 AA: ${theme}`, () => {
    test('pristine, sorted, and with a focused cell', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      expect(await axe(page)).toEqual([]);
      await page.getByRole('columnheader', { name: 'Salary' }).click();
      await page.getByRole('grid', { name: 'Employees' }).getByRole('gridcell').first().focus();
      expect(await axe(page)).toEqual([]);
    });

    test('filtering: floating row, search box, and open text and set filter panels', async ({ page }) => {
      // Several full axe scans of a large grid.
      test.slow();
      await open(page, `?theme=${theme}&filters=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      expect(await axe(page)).toEqual([]);
      await grid.getByRole('button', { name: 'Filter Name' }).click();
      const dialog = page.getByRole('dialog', { name: 'Name filter' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('textbox', { name: 'Condition 1 value' }).fill('00001');
      await expect(grid).toHaveAttribute('aria-rowcount', '14');
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await grid.getByRole('button', { name: 'Filter Department' }).click();
      await expect(page.getByRole('dialog', { name: 'Department filter' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('row selection: checkboxes, selected rows, and a mixed Select all', async ({ page }) => {
      await open(page, `?theme=${theme}&select=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.getByRole('checkbox', { name: 'Select Employee 000001' }).click();
      await grid.getByRole('checkbox', { name: 'Select Employee 000002' }).click();
      await expect(grid.getByRole('checkbox', { name: 'Select all rows' })).toHaveJSProperty('indeterminate', true);
      expect(await axe(page)).toEqual([]);
    });

    test('cell ranges: a keyboard range and a selected column', async ({ page }) => {
      await open(page, `?theme=${theme}&ranges=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.getByRole('gridcell', { name: 'Employee 000001', exact: true }).focus();
      await page.keyboard.press('Shift+ArrowDown');
      await page.keyboard.press('Shift+ArrowRight');
      await expect(grid.locator('[role="gridcell"][aria-selected="true"]')).toHaveCount(4);
      expect(await axe(page)).toEqual([]);
    });

    test('editing: an open editor and a blocked invalid value', async ({ page }) => {
      await open(page, `?theme=${theme}&ranges=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.getByRole('row', { name: /Employee 000001/ }).locator('[data-column="department"]').focus();
      await page.keyboard.press('F2');
      await expect(page.getByRole('textbox', { name: 'Department, Employee 000001' })).toBeFocused();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await grid.getByRole('row', { name: /Employee 000001/ }).locator('[data-column="salary"]').focus();
      await page.keyboard.type('-5');
      await page.keyboard.press('Enter');
      await expect(page.getByRole('textbox', { name: 'Salary, Employee 000001' })).toHaveAttribute('aria-invalid', 'true');
      expect(await axe(page)).toEqual([]);
    });

    test('row editing: editors across a row', async ({ page }) => {
      await open(page, `?theme=${theme}&rowedit=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.getByRole('row', { name: /Employee 000001/ }).locator('[data-column="department"]').focus();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('textbox', { name: 'Salary, Employee 000001' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('list editor: a Combobox editor with its list open; choosing commits through the grid', async ({ page }) => {
      const errors = await open(page, `?theme=${theme}&listedit=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const department = grid.getByRole('row', { name: /Employee 000001/ }).locator('[data-column="department"]');
      await department.focus();
      await page.keyboard.press('Enter');
      const input = page.getByRole('combobox', { name: 'Department, Employee 000001' });
      await expect(input).toBeFocused();
      await expect(page.getByRole('option', { name: 'Support' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.type('sup');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await page.keyboard.press('Enter');
      await expect(department).toHaveText('Support');
      expect(await page.evaluate(() => window.__csp)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('grouping: a treegrid with an expanded group and a grand total', async ({ page }) => {
      await open(page, `?theme=${theme}&group=1`);
      const grid = page.getByRole('treegrid', { name: 'Employees' });
      const engineering = grid.getByRole('row', { name: /Engineering \(100\)/ });
      await engineering.locator('[data-column="aui-group"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(engineering).toHaveAttribute('aria-expanded', 'true');
      await expect(page.getByRole('group', { name: 'Row groups' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('tree data: a treegrid; expand, move to a child, back to the parent', async ({ page }) => {
      await open(page, `?theme=${theme}&tree=1`);
      const grid = page.getByRole('treegrid', { name: 'Employees' });
      const root = grid.locator('[data-row-id="e0"]');
      await expect(root).toHaveAttribute('aria-expanded', 'false');
      await root.locator('[data-column="aui-group"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(root).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('ArrowDown');
      await expect(page.locator(':focus').locator('xpath=ancestor::*[@role="row"][1]')).toHaveAttribute('aria-level', '2');
      await page.keyboard.press('ArrowLeft');
      await expect(root.locator('[data-column="aui-group"]')).toBeFocused();
      expect(await axe(page)).toEqual([]);
    });

    test('master/detail: a detail row with a nested grid, entered and left by keyboard', async ({ page }) => {
      await open(page, `?theme=${theme}&detail=1`);
      const grid = page.getByRole('treegrid', { name: 'Employees' });
      const master = grid.locator('[data-row-id="e0"]');
      await master.locator('[data-column="aui-detail"]').focus();
      await page.keyboard.press('Enter');
      await expect(master).toHaveAttribute('aria-expanded', 'true');
      await page.keyboard.press('ArrowDown');
      const detail = grid.locator('[data-row-id="detail:e0"] > [role="gridcell"]');
      await expect(detail).toBeFocused();
      const nested = page.getByRole('grid', { name: 'Reviews of Employee 000000' });
      await expect(nested.getByRole('row')).toHaveCount(4);
      await page.keyboard.press('Enter');
      await expect(nested.locator(':focus')).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(detail).toBeFocused();
    });

    test('pivot mode: result column groups, totals, and the pivot panel', async ({ page }) => {
      await open(page, `?theme=${theme}&pivot=1`);
      const grid = page.getByRole('treegrid', { name: 'Employees' });
      await expect(grid.getByRole('columnheader', { name: 'Berlin' })).toBeVisible();
      await expect(grid.getByRole('row', { name: /^Total/ })).toHaveCount(1);
      const panel = page.getByRole('group', { name: 'Pivot' });
      await panel.getByRole('combobox', { name: 'Aggregate of Salary' }).selectOption('avg');
      await expect(page.locator('#last-event')).toHaveText('aui-pivot-change');
      await expect(grid.getByRole('columnheader', { name: 'Average of Salary' }).first()).toBeVisible();
      expect(await axe(page)).toEqual([]);
      // Dragging a pill from Rows to Columns (G7e3).
      const from = (await panel.locator('[data-zone="rows"] .aui-data-grid__group-pill[data-column="department"] > span').boundingBox())!;
      const to = (await panel.locator('[data-zone="columns"] .aui-data-grid__group-pill[data-column="city"]').boundingBox())!;
      await page.mouse.move(from.x + 4, from.y + from.height / 2);
      await page.mouse.down();
      await page.mouse.move(to.x + to.width - 2, to.y + to.height / 2, { steps: 6 });
      await expect(panel.locator('.aui-data-grid__group-pill--drop-after')).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
      await page.mouse.up();
      await expect(panel.locator('[data-zone="columns"] .aui-data-grid__group-pill')).toHaveCount(2);
      await expect(panel.locator('[data-zone="rows"] .aui-data-grid__group-pill')).toHaveCount(0);
    });

    test('server rows: a failed first block, Retry, loaded rows, and a server sort', async ({ page }) => {
      await open(page, `?theme=${theme}&server=1&fail=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await expect(grid.getByText('Rows could not load: Service unavailable')).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await grid.getByRole('button', { name: 'Retry' }).click();
      await expect(grid.locator('[data-row-id="e0"]')).toBeVisible();
      await expect(grid).toHaveAttribute('aria-rowcount', '502');
      await grid.getByRole('columnheader', { name: 'Name' }).click();
      await grid.getByRole('columnheader', { name: 'Name' }).click();
      await expect(grid.locator('[data-row-id="e499"]')).toBeVisible();
      await expect(grid).not.toHaveAttribute('aria-busy');
      expect(await axe(page)).toEqual([]);
    });

    test('server rows with selection: Select all covers rows not loaded', async ({ page }) => {
      await open(page, `?theme=${theme}&server=1&select=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await expect(grid.locator('[data-row-id="e1"]')).toBeVisible();
      await grid.getByRole('checkbox', { name: 'Select all rows' }).check();
      await expect(grid.locator('[data-row-id="e1"]')).toHaveAttribute('aria-selected', 'true');
      expect(await axe(page)).toEqual([]);
    });

    test('server groups: group rows from the server; a group loads its rows when expanded', async ({ page }) => {
      await open(page, `?theme=${theme}&server=1&group=1`);
      const grid = page.getByRole('treegrid', { name: 'Employees' });
      const engineering = grid.getByRole('row', { name: /Engineering \(100\)/ });
      await engineering.locator('[data-column="aui-group"]').focus();
      await page.keyboard.press('ArrowRight');
      await expect(engineering).toHaveAttribute('aria-expanded', 'true');
      await expect(grid.locator('[data-row-id="e0"]')).toHaveAttribute('aria-level', '2');
      await expect(grid).not.toHaveAttribute('aria-busy');
      expect(await axe(page)).toEqual([]);
    });

    test('row numbers: a click selects the row, Alt+ArrowDown resizes it', async ({ page }) => {
      await open(page, `?theme=${theme}&rownumbers=1&ranges=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const number = grid.locator('[data-row-id="e1"] [data-column="aui-row-number"]');
      await expect(number).toHaveText('2');
      await number.click();
      await expect(page.locator('#last-event')).toHaveText('aui-range-change');
      await number.focus();
      await page.keyboard.press('Alt+ArrowDown');
      await expect(page.locator('#last-event')).toHaveText('aui-row-resize');
      expect(await axe(page)).toEqual([]);
    });

    test('pinned rows: named sections, a pinned grand total, keyboard order from the header', async ({ page }) => {
      await open(page, `?theme=${theme}&pinned=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const top = grid.getByRole('rowgroup', { name: 'Pinned to top' });
      await expect(top.getByRole('row')).toHaveCount(1);
      await expect(grid.getByRole('rowgroup', { name: 'Pinned to bottom' }).getByRole('row', { name: /^Total/ })).toHaveCount(1);
      await grid.getByRole('columnheader', { name: 'Name' }).focus();
      await page.keyboard.press('ArrowDown');
      await expect(top.getByRole('gridcell').first()).toBeFocused();
      expect(await axe(page)).toEqual([]);
    });

    test('full-width rows and full-width group rows', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&fullwidth=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await expect(grid.locator('[data-row-id="e9"] [role="gridcell"]')).toHaveText('Section after Employee 000009');
      expect(await axe(page)).toEqual([]);
      await open(page, `?theme=${theme}&group=1&grouprows=1`);
      const tree = page.getByRole('treegrid', { name: 'Employees' });
      await expect(tree.locator('.aui-data-grid__header-cell[data-column="aui-group"]')).toHaveCount(0);
      await expect(tree.getByRole('row', { name: /Engineering \(100\)/ }).getByRole('gridcell')).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
    });

    test('row spans: merged department cells', async ({ page }) => {
      await open(page, `?theme=${theme}&spans=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const merged = grid.locator('[data-column="department"][aria-rowspan]').first();
      await expect(merged).toHaveAttribute('aria-rowspan', /\d+/);
      expect(await axe(page)).toEqual([]);
    });

    test('menus: the column menu from its button and the cell menu from Shift+F10', async ({ page }) => {
      // Three full axe scans and an Excel export.
      test.slow();
      const errors = await open(page, `?theme=${theme}&menus=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.getByRole('button', { name: 'Column menu, Salary' }).click();
      const menu = page.getByRole('menu', { name: 'Column menu, Salary' });
      await expect(menu).toBeVisible();
      await expect(menu.getByRole('menuitem', { name: 'Sort ascending' })).toBeFocused();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      await expect(page.locator('#last-event')).toHaveText('aui-sort-change');
      await grid.locator('[data-row-id] [data-column="name"]').first().focus();
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menu', { name: 'Cell menu' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      // Export > Excel downloads an .xlsx named after the grid (G8b).
      await page.keyboard.press('End');
      await expect(page.getByRole('menuitem', { name: 'Export' })).toBeFocused();
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('menuitem', { name: 'CSV (.csv)' })).toBeFocused();
      expect(await axe(page)).toEqual([]);
      const download = page.waitForEvent('download');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('Enter');
      const file = await download;
      expect(file.suggestedFilename()).toBe('Employees.xlsx');
      const stream = await file.createReadStream();
      const chunks: Buffer[] = [];
      for await (const chunk of stream) chunks.push(chunk as Buffer);
      const bytes = Buffer.concat(chunks);
      expect(bytes.subarray(0, 2).toString('latin1')).toBe('PK');
      expect(bytes.length).toBeGreaterThan(10_000);
      // Export > PDF (G10d).
      await grid.locator('[data-row-id] [data-column="name"]').first().focus();
      await page.keyboard.press('Shift+F10');
      await page.keyboard.press('End');
      await page.keyboard.press('ArrowRight');
      const pdfDownload = page.waitForEvent('download');
      await page.keyboard.press('End');
      await page.keyboard.press('Enter');
      const pdfFile = await pdfDownload;
      expect(pdfFile.suggestedFilename()).toBe('Employees.pdf');
      const pdfChunks: Buffer[] = [];
      for await (const chunk of await pdfFile.createReadStream()) pdfChunks.push(chunk as Buffer);
      expect(Buffer.concat(pdfChunks).subarray(0, 8).toString('latin1')).toBe('%PDF-1.7');
      expect(await page.evaluate(() => window.__csp)).toEqual([]);
      expect(errors).toEqual([]);
    });

    test('column chooser: a dialog from the column menu; hide a column by keyboard', async ({ page }) => {
      await open(page, `?theme=${theme}&menus=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.getByRole('button', { name: 'Column menu, Name' }).click();
      await page.getByRole('menu', { name: 'Column menu, Name' }).getByRole('menuitem', { name: 'Columns' }).click();
      await page.getByRole('menuitem', { name: 'Choose columns' }).click();
      const dialog = page.getByRole('dialog', { name: 'Choose columns' });
      await expect(dialog).toBeVisible();
      await dialog.getByRole('checkbox', { name: 'Salary' }).press('Space');
      await expect(page.locator('#last-event')).toHaveText('aui-columns-change');
      expect(await axe(page)).toEqual([]);
      await dialog.getByRole('button', { name: 'Done' }).click();
      await expect(dialog).toBeHidden();
    });

    test('status bar and toolbar: counts, range aggregates, a toolbar with one tab stop', async ({ page }) => {
      await open(page, `?theme=${theme}&panels=1&ranges=1`);
      const status = page.getByRole('group', { name: 'Grid status' });
      await expect(status).toContainText('Rows: 500');
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.locator('[data-row-id="e0"] [data-column="salary"]').click();
      await page.keyboard.press('Shift+ArrowDown');
      await expect(status).toContainText('Sum:');
      const bar = page.getByRole('toolbar', { name: 'Grid actions' });
      await expect(bar.getByRole('button', { name: 'Choose columns' })).toHaveAttribute('tabindex', '0');
      expect(await axe(page)).toEqual([]);
    });

    test('side bar: the Columns and Filters panels', async ({ page }) => {
      await open(page, `?theme=${theme}&side=1&filters=1`);
      const columns = page.getByRole('region', { name: 'Columns' });
      await expect(columns).toBeVisible();
      await columns.getByRole('button', { name: 'Group by Department' }).click();
      await expect(page.getByRole('treegrid', { name: 'Employees' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.getByRole('button', { name: 'Filters', exact: true }).click();
      const filters = page.getByRole('region', { name: 'Filters' });
      await filters.getByRole('button', { name: 'Name' }).click();
      await expect(filters.locator('.aui-data-grid__filter-panel--inline')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('tooltips, find, and notes', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&g7d=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.locator('[data-row-id="e1"] [data-column="name"]').focus();
      await expect(page.getByRole('tooltip')).toHaveText('Employee 000001');
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await expect(grid.locator('[data-row-id="e2"] [data-column="salary"]')).toHaveClass(/aui-data-grid__cell--note/);
      await grid.locator('[data-row-id="e2"] [data-column="salary"]').focus();
      await page.keyboard.press('Shift+F2');
      const dialog = page.getByRole('dialog', { name: 'Note' });
      await expect(dialog.getByRole('textbox', { name: 'Note' })).toHaveValue('Raise pending');
      expect(await axe(page)).toEqual([]);
      await dialog.getByRole('button', { name: 'Cancel' }).click();
      await page.getByRole('searchbox', { name: 'Find in grid' }).fill('000042');
      await expect(grid.locator('.aui-data-grid__cell--find-active')).toHaveCount(1);
      expect(await axe(page)).toEqual([]);
    });

    test('row dragging: pointer drag with a drop line, keyboard moves', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&drag=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const ids = (): Promise<string[]> => grid.locator('.aui-data-grid__body > .aui-data-grid__row').evaluateAll((rows) => rows.sort((a, b) => Number(a.getAttribute('aria-rowindex')) - Number(b.getAttribute('aria-rowindex'))).slice(0, 4).map((r) => (r as HTMLElement).dataset.rowId ?? ''));
      const first = await ids();
      const nameCell = (id: string | undefined) => grid.locator(`[data-row-id="${id ?? ''}"] [data-column="name"]`);
      const handle = nameCell(first[0]).locator('.aui-data-grid__drag-handle');
      const target = grid.locator(`.aui-data-grid__body > [data-row-id="${first[2] ?? ''}"]`);
      const h = (await handle.boundingBox())!;
      const r = (await target.boundingBox())!;
      await page.mouse.move(h.x + h.width / 2, h.y + h.height / 2);
      await page.mouse.down();
      await page.mouse.move(h.x + h.width / 2, r.y + r.height * 0.8, { steps: 5 });
      await expect(grid.locator('.aui-data-grid__drop-line')).toBeVisible();
      await expect(page.locator('.aui-data-grid__drag-ghost')).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.mouse.up();
      expect(await ids()).toEqual([first[1], first[2], first[0], first[3]]);
      await nameCell(first[0]).focus();
      await page.keyboard.press('Control+Shift+ArrowUp');
      expect(await ids()).toEqual([first[1], first[0], first[2], first[3]]);
      await expect(nameCell(first[0])).toBeFocused();
      expect(await axe(page)).toEqual([]);
      // An external drop zone.
      const zone = page.getByRole('region', { name: 'Archive' });
      const z = (await zone.boundingBox())!;
      const h2 = (await nameCell(first[3]).locator('.aui-data-grid__drag-handle').boundingBox())!;
      await page.mouse.move(h2.x + h2.width / 2, h2.y + h2.height / 2);
      await page.mouse.down();
      await page.mouse.move(z.x + z.width / 2, z.y + z.height / 2, { steps: 8 });
      await expect(zone).toHaveClass(/aui-data-grid-drop-zone--active/);
      expect(await axe(page)).toEqual([]);
      await page.mouse.up();
      await expect(page.locator('#last-event')).toHaveText(`archived ${first[3] ?? ''}`);
    });

    test('print: a static table alone in print media, in print colors', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&group=1`);
      await page.evaluate(() => {
        window.print = () => undefined;
        (window as unknown as { __grid: { print(o: object): void } }).__grid.print({ columns: ['aui-group', 'name', 'salary'] });
      });
      await page.emulateMedia({ media: 'print' });
      const table = page.getByRole('table', { name: 'Employees' });
      await expect(table).toBeVisible();
      await expect(page.getByRole('treegrid', { name: 'Employees' })).toBeHidden();
      await expect(table.getByRole('columnheader', { name: 'Salary' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.evaluate(() => window.dispatchEvent(new Event('afterprint')));
      await expect(table).toHaveCount(0);
      await page.emulateMedia({ media: 'screen' });
    });

    test('calculated columns: results, error cells with a spoken meaning, sorting', async ({ page }) => {
      await open(page, `?theme=${theme}&formulas=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const ratio = grid.locator('[data-row-id] [data-column="ratio"]').first();
      await expect(ratio).toHaveClass(/aui-data-grid__cell--formula-error/);
      await expect(ratio).toContainText('#DIV/0!');
      await expect(ratio.locator('.aui-data-grid__visually-hidden')).toHaveText(', division by zero');
      await expect(grid.locator('[data-row-id] [data-column="share"]').first()).toHaveText(/^\d+(\.\d+)?$/);
      expect(await axe(page)).toEqual([]);
      await grid.getByRole('columnheader', { name: 'Share' }).click();
      await expect(page.locator('#last-event')).toHaveText('aui-sort-change');
    });

    test('range chart: a docked region with a chart, type switch, Escape closes', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&chart=1`);
      const panel = page.getByRole('region', { name: 'Chart of Salaries' });
      await expect(panel).toBeVisible();
      await expect(panel.getByRole('img').first()).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await panel.getByRole('combobox', { name: 'Chart type' }).selectOption('line');
      await expect(panel.getByRole('img').first()).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await panel.getByRole('combobox', { name: 'Chart type' }).press('Escape');
      await expect(panel).toHaveCount(0);
    });

    test('sparklines in cells: named images, sortable', async ({ page }) => {
      await open(page, `?theme=${theme}&sparklines=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      const first = grid.locator('[data-row-id] [data-column="trend"] svg[role="img"]').first();
      await expect(first).toHaveAttribute('aria-label', /, last 6 months: 6 values, from/);
      expect(await axe(page)).toEqual([]);
      await grid.getByRole('columnheader', { name: 'Trend' }).click();
      await expect(page.locator('#last-event')).toHaveText('aui-sort-change');
    });

    test('formula editor: suggestions combobox, argument hint, formula bar', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&formulas=1`);
      const grid = page.getByRole('grid', { name: 'Employees' });
      await grid.locator('[data-row-id] [data-column="bonus"]').first().focus();
      await page.keyboard.press('F2');
      const input = grid.getByRole('combobox');
      await input.pressSequentially('=ROU');
      await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
      await expect(page.getByRole('option', { name: /^ROUND/ }).first()).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Enter');
      await expect(input).toHaveValue('=ROUND(');
      await expect(grid.locator('.aui-data-grid__formula-hint')).toHaveText('ROUND(number, [digits])');
      await input.pressSequentially('[Salary]/12, 2)');
      await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeHidden();
      await page.keyboard.press('Enter');
      await expect(page.getByRole('group', { name: 'Formula bar' })).toContainText(/=ROUND\(\[Salary\]\/12, 2\)/);
      expect(await axe(page)).toEqual([]);
    });

    test('aligned grids and the file drop overlay', async ({ page }) => {
      test.slow();
      await open(page, `?theme=${theme}&aligned=1`);
      const main = page.getByRole('grid', { name: 'Employees' });
      const totals = page.getByRole('grid', { name: 'Totals' });
      await expect(totals.getByRole('gridcell', { name: 'Total' })).toBeVisible();
      await page.locator('.aui-data-grid__viewport').nth(0).evaluate((v) => {
        v.scrollLeft = 300;
      });
      await expect.poll(() => page.locator('.aui-data-grid__viewport').nth(1).evaluate((v) => v.scrollLeft)).toBeGreaterThan(0);
      expect(await axe(page)).toEqual([]);
      await main.evaluate((host) => {
        const data = new DataTransfer();
        data.items.add(new File(['a,b'], 'sales.csv', { type: 'text/csv' }));
        host.dispatchEvent(new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data }));
      });
      await expect(page.locator('.aui-data-grid__file-drop')).toHaveText('Drop files to load');
      expect(await axe(page)).toEqual([]);
      await main.evaluate((host) => {
        const data = new DataTransfer();
        data.items.add(new File(['a,b'], 'sales.csv', { type: 'text/csv' }));
        host.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      });
      await expect(page.locator('#last-event')).toHaveText('files sales.csv');
    });

    test('grouping with row selection: tri-state group checkboxes', async ({ page }) => {
      await open(page, `?theme=${theme}&group=1&select=1`);
      const grid = page.getByRole('treegrid', { name: 'Employees' });
      await grid.getByRole('checkbox', { name: 'Select Finance' }).click();
      await expect(grid.getByRole('checkbox', { name: 'Select Finance' })).toBeChecked();
      expect(await axe(page)).toEqual([]);
    });

    test('advanced filter: expression bar, suggestions, error, and builder dialog', async ({ page }) => {
      // Several full axe scans of a large grid.
      test.slow();
      await open(page, `?theme=${theme}&advanced=1`);
      expect(await axe(page)).toEqual([]);
      const field = page.getByRole('combobox', { name: 'Filter' });
      await field.fill('[Sal');
      await expect(page.getByRole('listbox', { name: 'Suggestions' })).toBeVisible();
      await page.keyboard.press('ArrowDown');
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await field.fill('[Nope] = 1');
      await page.keyboard.press('Enter');
      await expect(field).toHaveAttribute('aria-invalid', 'true');
      expect(await axe(page)).toEqual([]);
      await page.getByRole('button', { name: 'Builder' }).click();
      await expect(page.getByRole('dialog', { name: 'Filter builder' })).toBeVisible();
      await page.getByRole('button', { name: 'Add condition to All rows' }).click();
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('data grid: behavior', () => {
  test('no CSP violations or errors while scrolling, sorting, moving, resizing, and collapsing', async ({ page }) => {
    const errors = await open(page);
    const grid = page.getByRole('grid', { name: 'Employees' });
    await grid.getByRole('columnheader', { name: 'Name' }).focus();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Control+End');
    await expect(page.locator(':focus')).toHaveAttribute('role', 'gridcell');
    await expect(page.locator(':focus').locator('xpath=..')).toHaveAttribute('aria-rowindex', '502');
    await page.keyboard.press('Control+Home');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Shift+ArrowRight');
    await page.keyboard.press('Alt+ArrowRight');
    await grid.getByRole('columnheader', { name: 'Organization' }).click();
    await expect(grid.getByRole('columnheader', { name: 'Organization' })).toHaveAttribute('aria-expanded', 'false');
    await grid.getByRole('columnheader', { name: 'Hired' }).click();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('filtering: panel, floating filters, and search box apply under the strict CSP; Escape returns focus', async ({ page }) => {
    const errors = await open(page, '?filters=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    const nameHeader = grid.getByRole('columnheader', { name: 'Name' });
    await nameHeader.focus();
    await page.keyboard.press('Alt+ArrowDown');
    const dialog = page.getByRole('dialog', { name: 'Name filter' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('combobox', { name: 'Condition 1 operator' })).toBeFocused();
    await dialog.getByRole('combobox', { name: 'Condition 1 operator' }).selectOption('endsWith');
    await dialog.getByRole('textbox', { name: 'Condition 1 value' }).fill('7');
    await expect(grid).toHaveAttribute('aria-rowcount', '53');
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(nameHeader).toBeFocused();
    await expect(grid.getByRole('columnheader', { name: 'Name, filtered' })).toHaveCount(1);
    await expect(page.locator('#last-event')).toHaveText('aui-filter-change');
    // Floating number syntax and the search box combine with the panel filter.
    await grid.getByRole('textbox', { name: 'Salary filter' }).fill('>=100000');
    await page.keyboard.press('Enter');
    const count = Number(await grid.getAttribute('aria-rowcount'));
    expect(count).toBeGreaterThan(3);
    expect(count).toBeLessThan(53);
    await page.getByRole('searchbox', { name: 'Search' }).fill('zzz');
    await expect(grid.getByRole('gridcell', { name: 'No matching rows' })).toBeVisible();
    await grid.getByRole('button', { name: 'Filter Name' }).click();
    await page.getByRole('dialog', { name: 'Name filter' }).getByRole('button', { name: 'Clear filter' }).click();
    await page.mouse.click(5, 5);
    await expect(page.getByRole('dialog')).toHaveCount(0);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('advanced filter: type-ahead, apply, builder round trip under the strict CSP', async ({ page }) => {
    const errors = await open(page, '?advanced=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    await expect(grid.getByRole('button', { name: 'Filter Name' })).toHaveCount(0);
    const field = page.getByRole('combobox', { name: 'Filter' });
    await field.click();
    await page.keyboard.type('[Dep');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(field).toHaveValue('[Department] ');
    await page.keyboard.type('is any of (');
    await expect(page.getByRole('option', { name: 'Finance' })).toBeVisible();
    await page.keyboard.type('"Sales") and [Salary] >= 100000');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Enter');
    const count = Number(await grid.getAttribute('aria-rowcount'));
    expect(count).toBeGreaterThan(3);
    expect(count).toBeLessThan(102);
    await expect(page.locator('#last-event')).toHaveText('aui-filter-change');
    await page.getByRole('button', { name: 'Builder' }).click();
    const dialog = page.getByRole('dialog', { name: 'Filter builder' });
    await expect(dialog.getByRole('combobox', { name: 'All rows: combine with' })).toBeFocused();
    await dialog.getByRole('button', { name: 'Remove Condition 2' }).click();
    await dialog.getByRole('button', { name: 'Apply' }).click();
    await expect(dialog).toBeHidden();
    await expect(field).toHaveValue('[Department] is any of ("Sales")');
    await expect(grid).toHaveAttribute('aria-rowcount', '102');
    await expect(page.getByRole('button', { name: 'Builder' })).toBeFocused();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('row selection by keyboard under the strict CSP; unselectable rows are skipped', async ({ page }) => {
    const errors = await open(page, '?select=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    await expect(grid).toHaveAttribute('aria-multiselectable', 'true');
    await grid.getByRole('gridcell', { name: 'Employee 000001', exact: true }).focus();
    await page.keyboard.press('Space');
    await expect(grid.getByRole('row', { name: /Employee 000001/ })).toHaveAttribute('aria-selected', 'true');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Shift+Space');
    await expect(page.locator('#last-event')).toHaveText('aui-selection-change');
    // Rows 1 to 3 selected; none of them is inactive (every 7th row is), so all three count.
    await expect(grid.locator('[role="row"][aria-selected="true"]')).toHaveCount(3);
    // Employee 000000 is inactive: its checkbox is disabled.
    await expect(grid.getByRole('checkbox', { name: 'Select Employee 000000' })).toBeDisabled();
    await page.keyboard.press('Control+a');
    const selected = await page.evaluate(() => (window as unknown as { __grid: { getSelected(): string[] } }).__grid.getSelected().length);
    // 500 rows, every 7th inactive (72): 428 selectable.
    expect(selected).toBe(428);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('cell ranges: keyboard extension, column selection, and Ctrl+C under the strict CSP', async ({ page, context }) => {
    test.skip(engine(page) !== 'chromium', 'Playwright grants clipboard permissions in Chromium only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page, '?ranges=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    await expect(grid).toHaveAttribute('aria-multiselectable', 'true');
    const start = grid.getByRole('gridcell', { name: 'Employee 000002', exact: true });
    await start.focus();
    await page.keyboard.press('Shift+ArrowDown');
    await expect(start).toBeFocused();
    await expect(page.locator('#last-event')).toHaveText('aui-range-change');
    await page.keyboard.press('Control+c');
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe('Employee 000002\r\nEmployee 000003');
    // Column selection: Enter on the header selects the column; Alt+Enter sorts.
    const header = grid.getByRole('columnheader', { name: 'Hired' });
    await header.focus();
    await page.keyboard.press('Enter');
    await expect(grid.getByRole('columnheader', { name: 'Hired' })).not.toHaveAttribute('aria-sort');
    await page.keyboard.press('Alt+Enter');
    await expect(grid.getByRole('columnheader', { name: 'Hired' })).toHaveAttribute('aria-sort', 'ascending');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('writes: copy and paste, Delete, and fill down by keyboard under the strict CSP', async ({ page, context }) => {
    test.skip(engine(page) !== 'chromium', 'Playwright grants clipboard permissions in Chromium only');
    await context.grantPermissions(['clipboard-read', 'clipboard-write']);
    const errors = await open(page, '?ranges=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    const row = (n: string): ReturnType<typeof grid.getByRole> => grid.getByRole('row', { name: new RegExp(`Employee ${n}`) });
    const salary = (n: string) => row(n).locator('[data-column="salary"]');
    const department = (n: string) => row(n).locator('[data-column="department"]');
    await department('000001').focus();
    await page.keyboard.press('Control+c');
    await department('000002').focus();
    await page.keyboard.press('Control+v');
    await expect(department('000002')).toHaveText('Finance');
    await expect(page.locator('#last-event')).toHaveText('aui-cells-change');
    // Read-only columns are not written: Name stays as it was.
    await grid.getByRole('gridcell', { name: 'Employee 000003', exact: true }).focus();
    await page.keyboard.press('Control+v');
    await expect(grid.getByRole('gridcell', { name: 'Employee 000003', exact: true })).toBeVisible();
    await salary('000004').focus();
    await page.keyboard.press('Delete');
    await expect(salary('000004')).toHaveText('');
    await expect(salary('000004')).toBeFocused();
    await salary('000005').focus();
    const first = await salary('000005').textContent();
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Shift+ArrowDown');
    await page.keyboard.press('Control+d');
    await expect(salary('000007')).toHaveText(first ?? '');
    await expect(grid.locator('.aui-data-grid__fill-handle')).toHaveCount(1);
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('editing by keyboard under the strict CSP: type, commit, Tab, validation, undo and redo', async ({ page }) => {
    const errors = await open(page, '?ranges=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    const row = (n: string) => grid.getByRole('row', { name: new RegExp(`Employee ${n}`) });
    const department = row('000003').locator('[data-column="department"]');
    await department.focus();
    await page.keyboard.type('Legal');
    await expect(page.getByRole('textbox', { name: 'Department, Employee 000003' })).toHaveValue('Legal');
    await page.keyboard.press('Tab');
    // Tab commits and edits the next editable cell (Salary).
    const salaryEditor = page.getByRole('textbox', { name: 'Salary, Employee 000003' });
    await expect(salaryEditor).toBeFocused();
    await expect(department).toHaveText('Legal');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('-1');
    await page.keyboard.press('Enter');
    await expect(salaryEditor).toHaveAttribute('aria-invalid', 'true');
    await expect(page.locator('.aui-data-grid__edit-error')).toHaveText('Enter 0 or more');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('12345');
    await page.keyboard.press('Enter');
    const salary = row('000003').locator('[data-column="salary"]');
    await expect(salary).toHaveText('€12,345.00');
    await expect(salary).toBeFocused();
    await page.keyboard.press('Control+z');
    await expect(salary).not.toHaveText('€12,345.00');
    await page.keyboard.press('Control+y');
    await expect(salary).toHaveText('€12,345.00');
    await expect(page.locator('#last-event')).toHaveText('aui-cells-change');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('row editing and batch editing under the strict CSP', async ({ page }) => {
    const errors = await open(page, '?rowedit=1');
    const grid = page.getByRole('grid', { name: 'Employees' });
    const row = (n: string) => grid.getByRole('row', { name: new RegExp(`Employee ${n}`) });
    await row('000002').locator('[data-column="department"]').focus();
    await page.keyboard.type('Legal');
    await page.keyboard.press('Tab');
    await expect(page.getByRole('textbox', { name: 'Salary, Employee 000002' })).toBeFocused();
    await page.keyboard.press('Control+a');
    await page.keyboard.type('1000');
    await page.keyboard.press('Enter');
    await expect(row('000002').locator('[data-column="department"]')).toHaveText('Legal');
    await expect(row('000002').locator('[data-column="salary"]')).toHaveText('€1,000.00');
    await page.evaluate(() => { (window as unknown as { __grid: { startBatch(): void } }).__grid.startBatch(); });
    // A batch keeps row mode: Enter starts the row edit, Enter commits it as pending values.
    const department = row('000004').locator('[data-column="department"]');
    await department.focus();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Control+a');
    await page.keyboard.type('Ops');
    await page.keyboard.press('Enter');
    await expect(department).toHaveText('Ops, edited');
    await page.evaluate(() => { (window as unknown as { __grid: { commitBatch(): void } }).__grid.commitBatch(); });
    await expect(department).toHaveText('Ops');
    await expect(page.locator('#last-event')).toHaveText('aui-cells-change');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('grouping by keyboard under the strict CSP: expand, move into a group, back to it, collapse', async ({ page }) => {
    const errors = await open(page, '?group=1');
    const grid = page.getByRole('treegrid', { name: 'Employees' });
    const finance = grid.getByRole('row', { name: /Finance \(100\)/ });
    await expect(finance).toHaveAttribute('aria-level', '1');
    await finance.locator('[data-column="aui-group"]').focus();
    await page.keyboard.press('Enter');
    await expect(finance).toHaveAttribute('aria-expanded', 'true');
    await expect(page.locator('#last-event')).toHaveText('aui-row-group-toggle');
    await page.keyboard.press('ArrowDown');
    const focusedRow = page.locator(':focus').locator('xpath=ancestor::*[@role="row"][1]');
    await expect(focusedRow).toHaveAttribute('aria-level', '2');
    await page.keyboard.press('ArrowLeft');
    await expect(finance.locator('[data-column="aui-group"]')).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await expect(finance).toHaveAttribute('aria-expanded', 'false');
    await expect(grid.getByRole('row', { name: /^Total/ })).toHaveCount(1);
    // The group panel: add a date hierarchy by keyboard, then remove the department group.
    const panel = page.getByRole('group', { name: 'Row groups' });
    await panel.getByRole('combobox', { name: 'Add a row group' }).selectOption('hired');
    await expect(page.locator('#last-event')).toHaveText('aui-group-change');
    await panel.getByRole('button', { name: 'Remove Department from the row groups' }).click();
    await expect(grid.getByRole('row', { name: /^20\d\d \(\d+\)/ }).first()).toBeVisible();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('pinned columns stay at their edges while the grid scrolls horizontally', async ({ page }) => {
    await open(page);
    const viewport = page.locator('.aui-data-grid__viewport');
    const name = page.locator('[role="gridcell"][data-column="name"]').first();
    const active = page.locator('[role="gridcell"][data-column="active"]').first();
    const before = { name: await name.boundingBox(), active: await active.boundingBox() };
    await viewport.evaluate((el) => {
      el.scrollLeft = 1500;
    });
    await settled(page);
    const after = { name: await name.boundingBox(), active: await active.boundingBox() };
    expect(after.name?.x).toBeCloseTo(before.name?.x ?? 0, 0);
    expect(after.active?.x).toBeCloseTo(before.active?.x ?? 0, 0);
    // Columns far to the right are now rendered; the first metric columns are gone.
    await expect(page.locator('[role="gridcell"][data-column="m10"]').first()).toBeVisible();
    await expect(page.locator('[role="gridcell"][data-column="m0"]')).toHaveCount(0);
  });

  test('reflows at 320 CSS px without page-level horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('mirrors pinned columns in right-to-left layouts', async ({ page }) => {
    await open(page, '?dir=rtl');
    const grid = await page.locator('.aui-data-grid__viewport').boundingBox();
    const name = await page.locator('[role="gridcell"][data-column="name"]').first().boundingBox();
    expect((name?.x ?? 0) + (name?.width ?? 0)).toBeGreaterThan((grid?.x ?? 0) + (grid?.width ?? 0) - 30);
  });
});
