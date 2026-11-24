import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P9: Masked Input (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p9-masked-input${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('masked input: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('masked input: typing formats, Backspace skips literals, caret follows', async ({ page }) => {
  await open(page);
  const field = page.getByRole('textbox', { name: /^Mobile phone/ });
  await field.click();
  await expect(field).toHaveValue('(___) ___-____');
  await page.keyboard.type('555a0');
  await expect(field).toHaveValue('(555) 0__-____');
  await expect(page.locator('#masked-output')).toHaveText('5550 (555) 0 incomplete');
  await page.keyboard.press('Backspace');
  await page.keyboard.press('Backspace');
  await expect(field).toHaveValue('(55_) ___-____');
  expect(await field.evaluate((el) => (el as HTMLInputElement).selectionStart)).toBe(3);
  await page.keyboard.type('50100199');
  await expect(page.locator('#masked-output')).toHaveText('5550100199 (555) 010-0199 complete');
  await page.keyboard.press('Tab');
  await expect(field).toHaveValue('(555) 010-0199');
});

test('masked input: the format hint describes the field; IBAN upper-cases', async ({ page }) => {
  await open(page);
  await expect(page.getByRole('textbox', { name: /^Mobile phone/ })).toHaveAccessibleDescription(/Format: \(999\) 999-9999/);
  const iban = page.getByRole('textbox', { name: 'IBAN' });
  await iban.click();
  await page.keyboard.type('de89370400440532013000');
  await page.keyboard.press('Tab');
  await expect(iban).toHaveValue('DE89 3704 0044 0532 0130 00');
  await expect(page.locator('input[type="hidden"][name="iban"]')).toHaveValue('DE89 3704 0044 0532 0130 00');
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`masked input: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}
