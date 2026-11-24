import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P9: Cascader (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p9-cascader${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('cascader: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('cascader: keyboard through the levels selects a city and submits its value', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('combobox', { name: /Work location/ });
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await page.keyboard.press('ArrowDown');
  await expect(page.getByRole('listbox', { name: 'Country' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByRole('listbox', { name: 'State' })).toBeFocused();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(trigger).toBeFocused();
  await expect(trigger).toHaveText(/India \/ Kerala \/ Kochi/);
  await expect(page.locator('#location-log')).toHaveText('change: India > Kerala > Kochi');
  expect(await page.evaluate(() => new FormData(document.querySelector<HTMLFormElement>('#location-form')!).get('city'))).toBe('cok');
});

test('cascader: search lists paths across levels', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: /Work location/ }).click();
  await page.keyboard.type('mun');
  await expect(page.locator('#location .aui-cascader__result-list [role="option"]')).toHaveText(['Germany / Bavaria / Munich']);
  await page.keyboard.press('Enter');
  await expect(page.getByRole('combobox', { name: /Work location/ })).toHaveText(/Germany \/ Bavaria \/ Munich/);
});

test('cascader: lazy loading shows busy state, errors offer retry', async ({ page }) => {
  await open(page);
  await page.getByRole('combobox', { name: /Department/ }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowDown');
  // The busy state lasts only the simulated 150 ms request; polling for it can miss it on a
  // loaded machine, so record whether it was ever shown.
  await page.evaluate(() => {
    const root = document.getElementById('lazy');
    const seen = { busy: false };
    Object.assign(window, { __lazyBusy: seen });
    if (!root) return;
    new MutationObserver(() => {
      if (root.querySelector('[aria-busy="true"]')) seen.busy = true;
    }).observe(root, { subtree: true, childList: true, attributes: true, attributeFilter: ['aria-busy'] });
  });
  await page.keyboard.press('ArrowRight');
  await expect.poll(() => page.evaluate(() => (window as Window & { __lazyBusy?: { busy: boolean } }).__lazyBusy?.busy)).toBe(true);
  const retry = page.locator('#lazy').getByRole('button', { name: 'Retry' });
  await expect(retry).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.getByRole('listbox', { name: 'Team' })).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.getByRole('combobox', { name: /Department/ })).toBeFocused();
});

test('cascader: multiple selection chips can be removed', async ({ page }) => {
  await open(page);
  const remove = page.getByRole('button', { name: 'Remove India / Karnataka / Bengaluru' });
  await remove.click();
  await expect(remove).toHaveCount(0);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`cascader: axe (WCAG 2.2 AA) in ${theme}, closed and open`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
    await page.getByRole('combobox', { name: /Work location/ }).click();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    expect(await axe(page)).toEqual([]);
  });
}

test('cascader: right-to-left arrow keys', async ({ page }) => {
  await open(page, '?dir=rtl');
  await page.getByRole('combobox', { name: /Work location/ }).click();
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('ArrowLeft');
  await expect(page.getByRole('listbox', { name: 'State' })).toBeFocused();
  expect(await axe(page)).toEqual([]);
});
