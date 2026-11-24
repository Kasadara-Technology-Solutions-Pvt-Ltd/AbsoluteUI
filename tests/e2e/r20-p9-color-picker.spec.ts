import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P9: Color Picker.
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
  await page.goto(`/r20-p9-color-picker${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('color picker: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('color picker: the closed popup panel is not displayed (regression)', async ({ page }) => {
  await open(page);
  const panels = page.locator('.aui-color-picker--popup .aui-color-picker__panel');
  expect(await panels.count()).toBeGreaterThan(0);
  for (const panel of await panels.all()) await expect(panel).toHaveCSS('display', 'none');
});

test('color picker: popup opens from the keyboard, the area moves with arrows, Escape returns focus', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('button', { name: /^Brand color/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  const dialog = page.getByRole('dialog', { name: /Brand color/ });
  await expect(dialog).toBeVisible();
  const area = dialog.getByRole('slider', { name: 'Saturation and brightness' });
  await expect(area).toBeFocused();
  const before = await area.getAttribute('aria-valuetext');
  await page.keyboard.press('ArrowDown');
  await expect(area).not.toHaveAttribute('aria-valuetext', before ?? '');
  await expect(page.locator('#cp-log')).not.toHaveText('');
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('color picker: typed text commits; invalid text shows an error', async ({ page }) => {
  await open(page);
  const field = page.locator('#cp-inline .aui-color-picker__input');
  await field.fill('#ff000080');
  await field.press('Enter');
  await expect(page.locator('#cp-log')).toHaveText('#ff000080');
  await field.fill('nope');
  await field.press('Enter');
  await expect(page.locator('#cp-inline .aui-field__error')).toContainText('Enter a color');
  await expect(field).toHaveAttribute('aria-invalid', 'true');
});

test('color picker: hue slider follows APG keys; swatches select by name', async ({ page }) => {
  await open(page);
  const hue = page.locator('#cp-inline').getByRole('slider', { name: 'Hue' });
  await hue.focus();
  await page.keyboard.press('End');
  await expect(hue).toHaveAttribute('aria-valuenow', '359');
  await page.keyboard.press('Home');
  await expect(hue).toHaveAttribute('aria-valuenow', '0');
  await page.locator('#cp-inline').getByRole('button', { name: 'Green' }).click();
  await expect(page.locator('#cp-log')).toHaveText('#16a34aff');
  await expect(page.locator('#cp-inline').getByRole('button', { name: 'Green' })).toHaveAttribute('aria-pressed', 'true');
});

test('color picker: read-only and disabled', async ({ page }) => {
  await open(page);
  const ro = page.locator('#cp-readonly').getByRole('slider', { name: 'Saturation and brightness' });
  await ro.focus();
  const before = await ro.getAttribute('aria-valuetext');
  await page.keyboard.press('ArrowUp');
  await expect(ro).toHaveAttribute('aria-valuetext', before ?? '');
  await expect(page.getByRole('button', { name: /^Disabled color/ })).toBeDisabled();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`color picker: axe (WCAG 2.2 AA) in ${theme}, popup open`, async ({ page, browserName }) => {
    // Two full axe scans of a page with several pickers take 8-22 s each in Firefox.
    test.slow(browserName === 'firefox', 'two axe scans are slow in Firefox');
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: /^Brand color/ }).click();
    await expect(page.getByRole('dialog')).toBeVisible();
    expect(await axe(page)).toEqual([]);
  });
}

test('color picker: axe in right-to-left', async ({ page, browserName }) => {
  test.slow(browserName === 'firefox', 'axe scans of this page are slow in Firefox');
  await open(page, '?dir=rtl');
  expect(await axe(page)).toEqual([]);
});
