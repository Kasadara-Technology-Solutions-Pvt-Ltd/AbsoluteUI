import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R2 advanced pickers page (SPEC section 18.7) under the strict CSP harness.
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
  await page.goto(`/pickers${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const POPUPS = [
  { name: 'date range picker', button: /Change dates/, dialog: 'Choose dates' },
  { name: 'month picker', button: /Change month/, dialog: 'Choose month' },
  { name: 'year picker', button: /Change year/, dialog: 'Choose year' },
  { name: 'quarter picker', button: /Change quarter/, dialog: 'Choose quarter' },
] as const;

test('pickers: no CSP violations or errors while exercising every picker', async ({ page }) => {
  const errors = await open(page);
  for (const p of POPUPS) {
    await page.getByRole('button', { name: p.button }).click();
    await expect(page.getByRole('dialog', { name: p.dialog })).toBeVisible();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Escape');
  }
  const duration = page.getByRole('group', { name: 'Estimate' });
  await duration.getByRole('spinbutton', { name: 'Minutes' }).press('ArrowUp');
  await page.getByRole('grid', { name: 'Project dates, March 2026' }).locator('[tabindex="0"]').click();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`pickers axe WCAG 2.2 AA: ${theme}`, () => {
    test('page (range calendar, fields, duration)', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      expect(await axe(page)).toEqual([]);
    });

    test('range calendar with a pending first day and a preview', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      const grid = page.getByRole('grid', { name: 'Project dates, March 2026' });
      await grid.getByRole('gridcell', { name: 'Monday, March 16, 2026' }).click();
      await grid.getByRole('gridcell', { name: 'Thursday, March 19, 2026' }).hover();
      await expect(page.locator('#range-calendar .aui-calendar__day--preview')).toHaveCount(3);
      expect(await axe(page)).toEqual([]);
    });

    for (const p of POPUPS) {
      test(`${p.name} open`, async ({ page }) => {
        await open(page, `?theme=${theme}`);
        await page.getByRole('button', { name: p.button }).click();
        await expect(page.getByRole('dialog', { name: p.dialog })).toBeVisible();
        expect(await axe(page)).toEqual([]);
      });
    }

    test('invalid fields after reportValidity', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      const range = page.getByRole('group', { name: 'Check-out' });
      await range.getByRole('textbox', { name: 'Day' }).fill('10');
      await page.getByRole('group', { name: 'Estimate' }).getByRole('spinbutton', { name: 'Minutes' }).fill('20');
      await page.getByRole('group', { name: 'Billing month' }).getByRole('textbox', { name: 'Month' }).fill('');
      await page.getByRole('heading', { name: 'Periods and durations' }).click();
      await expect(page.getByText('Enter an end date on or after the start date.')).toBeVisible();
      await expect(page.getByText('Enter a duration in steps of 15 min.')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('pickers: keyboard and behavior', () => {
  test('date range picker: keyboard range selection writes both fields and returns focus', async ({ page }) => {
    await open(page);
    const button = page.getByRole('button', { name: /Change dates/ });
    await button.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Choose dates' });
    await expect(dialog.getByRole('gridcell', { name: 'Friday, March 20, 2026, start of range' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Enter');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(button).toBeFocused();
    await expect(page.getByRole('group', { name: 'Check-in' }).getByRole('textbox', { name: 'Day' })).toHaveValue('21');
    await expect(page.getByRole('group', { name: 'Check-out' }).getByRole('textbox', { name: 'Day' })).toHaveValue('28');
    await expect(button).toHaveAccessibleName('Change dates, March 21, 2026 to March 28, 2026');
  });

  test('date range picker shows two months on a wide viewport and one at 320px', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /Change dates/ }).click();
    await expect(page.getByRole('dialog', { name: 'Choose dates' }).getByRole('grid')).toHaveCount(2);
    await page.keyboard.press('Escape');
    await page.setViewportSize({ width: 320, height: 640 });
    await page.getByRole('button', { name: /Change dates/ }).click();
    const dialog = page.getByRole('dialog', { name: 'Choose dates' });
    await expect(dialog.getByRole('grid')).toHaveCount(1);
    const box = await dialog.boundingBox();
    expect(box).not.toBeNull();
    expect((box?.x ?? -1) >= 0 && (box?.x ?? 0) + (box?.width ?? 0) <= 320).toBe(true);
  });

  test('month picker: Alt+ArrowDown opens, arrows move, Enter picks', async ({ page }) => {
    await open(page);
    const group = page.getByRole('group', { name: 'Billing month' });
    await group.getByRole('textbox', { name: 'Month' }).focus();
    await page.keyboard.press('Alt+ArrowDown');
    const dialog = page.getByRole('dialog', { name: 'Choose month' });
    await expect(dialog.getByRole('gridcell', { name: 'March 2026' })).toBeFocused();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(dialog).toBeHidden();
    await expect(group.getByRole('textbox', { name: 'Month' })).toHaveValue('06');
    await expect(page.locator('#last-value')).toContainText('"month":6');
  });

  test('year picker pages by decade; quarter picker moves by year', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: /Change year/ }).click();
    const years = page.getByRole('dialog', { name: 'Choose year' });
    await expect(years.getByText('2020 to 2029')).toBeVisible();
    await page.keyboard.press('PageDown');
    await expect(years.getByText('2030 to 2039')).toBeVisible();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('group', { name: 'Fiscal year' }).getByRole('textbox', { name: 'Year' })).toHaveValue('2036');
    await page.getByRole('button', { name: /Change quarter/ }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-value')).toContainText('"quarter":4');
    await expect(page.locator('#last-value')).toContainText('"year":2027');
  });

  test('duration picker: spinbutton stepping carries into hours', async ({ page }) => {
    await open(page);
    const minutes = page.getByRole('group', { name: 'Estimate' }).getByRole('spinbutton', { name: 'Minutes' });
    await expect(minutes).toHaveAttribute('aria-valuetext', '30 minutes');
    await minutes.press('ArrowUp');
    await minutes.press('ArrowUp');
    await expect(page.locator('#last-value')).toHaveText('PT2H');
    await expect(page.getByRole('group', { name: 'Estimate' }).getByRole('spinbutton', { name: 'Hours' })).toHaveAttribute('aria-valuenow', '2');
  });

  test('RTL: range calendar mirrors arrows and the popup stays inside the viewport', async ({ page }) => {
    await open(page, '?dir=rtl');
    const grid = page.getByRole('grid', { name: 'Project dates, March 2026' });
    await grid.getByRole('gridcell', { name: /Monday, March 9, 2026/ }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(grid.getByRole('gridcell', { name: /Tuesday, March 10, 2026/ })).toBeFocused();
    await page.getByRole('button', { name: /Change month/ }).click();
    const box = await page.getByRole('dialog', { name: 'Choose month' }).boundingBox();
    const width = page.viewportSize()?.width ?? 0;
    expect(box && box.x >= 0 && box.x + box.width <= width).toBe(true);
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('reduced motion removes transitions from picker controls', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const durations = await page.evaluate(() =>
      ['.aui-period-picker__button', '.aui-date-range-picker__button', '.aui-duration-picker__group', '.aui-calendar__day'].map((s) => getComputedStyle(document.querySelector(s)!).transitionDuration),
    );
    expect(durations.every((d) => d === '0s')).toBe(true);
  });

  test('forced colors keep selected periods and range days distinguishable', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    const inRange = await page.locator('#range-calendar .aui-calendar__day--in-range:not(.aui-calendar__day--selected)').first().evaluate((el) => getComputedStyle(el).outlineStyle);
    expect(inRange).toBe('dashed');
    await page.getByRole('button', { name: /Change month/ }).click();
    const selected = await page.getByRole('gridcell', { name: 'March 2026' }).evaluate((el) => {
      const s = getComputedStyle(el);
      return { bg: s.backgroundColor, color: s.color };
    });
    expect(selected.bg).not.toBe(selected.color);
    const border = await page.getByRole('group', { name: 'Estimate' }).evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(border).toBe('solid');
  });
});
