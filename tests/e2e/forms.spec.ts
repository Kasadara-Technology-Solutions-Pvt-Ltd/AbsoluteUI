import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, tabToLink } from './browsers.js';
import type { MultiSelect } from '@absoluteui/components/multi-select';
import { settled } from './settle.js';

// R1 forms page (SPEC section 18.5, section 18.8) under the strict CSP harness.
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
  await page.goto(`/forms${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function fillValid(page: Page): Promise<void> {
  await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com');
  // Password inputs have no ARIA role; locate them by their field host.
  await page.locator('#f-password input').fill('correct horse');
  await page.locator('#f-confirm input').fill('correct horse');
  await page.getByRole('textbox', { name: 'Username' }).fill('ada');
  await page.getByRole('spinbutton', { name: 'Age' }).fill('36');
  await page.getByRole('combobox', { name: 'Role' }).press('Enter');
  await page.getByRole('option', { name: 'Designer' }).click();
  await page.getByRole('combobox', { name: 'Country' }).fill('ind');
  await page.keyboard.press('ArrowDown');
  await page.keyboard.press('Enter');
  const start = page.getByRole('group', { name: 'Start date' });
  await start.getByRole('textbox', { name: 'Month' }).fill('05');
  await start.getByRole('textbox', { name: 'Day' }).fill('01');
  await start.getByRole('textbox', { name: 'Year' }).fill('2026');
  await page.getByRole('radio', { name: 'Team' }).check();
  await page.getByRole('checkbox', { name: 'Security' }).check();
  await page.getByRole('textbox', { name: 'ZIP code' }).fill('12345');
  await page.getByRole('checkbox', { name: 'I accept the terms' }).check();
}

test.describe('forms: CSP and Trusted Types', () => {
  test('no violations or errors through a full submit cycle', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await fillValid(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.locator('#form-result')).not.toHaveText('none');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`forms axe WCAG 2.2 AA: ${theme}`, () => {
    test('pristine form', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      expect(await axe(page)).toEqual([]);
    });

    test('after a failed submission (errors and summary shown)', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Create account' }).click();
      await expect(page.getByRole('region', { name: 'There is a problem' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('select listbox open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('combobox', { name: 'Role' }).press('ArrowDown');
      await expect(page.getByRole('listbox')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('multi select with chips and the listbox open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.evaluate(() => {
        const host = document.createElement('div');
        document.querySelector('main')?.append(host);
        (window as unknown as { __aui: { MultiSelect: typeof MultiSelect } }).__aui.MultiSelect.create(host, {
          label: 'Skills',
          description: 'Pick any.',
          selectAll: true,
          options: [
            { value: 'ts', label: 'TypeScript' },
            { value: 'sql', label: 'SQL', description: 'Queries' },
            { value: 'ux', label: 'UX research', disabled: true },
          ],
          value: ['ts'],
        });
      });
      await page.getByRole('combobox', { name: 'Skills' }).press('ArrowDown');
      await expect(page.getByRole('listbox')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('forms: keyboard and behavior', () => {
  test('failed submit focuses the error summary; links move focus to fields', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Create account' }).focus();
    await page.keyboard.press('Enter');
    const summary = page.getByRole('region', { name: 'There is a problem' });
    await expect(summary).toBeFocused();
    await tabToLink(page, summary.getByRole('link').first());
    await page.keyboard.press('Enter');
    await expect(page.getByRole('textbox', { name: 'Email' })).toBeFocused();
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveAttribute('aria-invalid', 'true');
  });

  test('cross-field and async validation, then a successful submit with serialized values', async ({ page }) => {
    await open(page);
    await fillValid(page);
    await page.locator('#f-confirm input').fill('different');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('link', { name: 'Confirm password: Passwords do not match.' })).toBeVisible();
    await page.locator('#f-confirm input').fill('correct horse');
    await page.getByRole('textbox', { name: 'Username' }).fill('admin');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('link', { name: 'Username: This username is taken.' })).toBeVisible();
    await page.getByRole('textbox', { name: 'Username' }).fill('ada');
    await page.getByRole('button', { name: 'Create account' }).click();
    // The simulated server check resolves asynchronously.
    await expect(page.locator('#form-result')).not.toHaveText('none');
    const result = JSON.parse((await page.locator('#form-result').textContent()) ?? '{}') as Record<string, unknown>;
    expect(result).toMatchObject({ email: 'ada@example.com', age: 36, role: 'design', country: 'in', start: '2026-05-01', plan: 'team', interests: ['sec'], zip: '12345', news: 'on', terms: 'on' });
  });

  test('blur message does not swallow the click on the submit button (regression)', async ({ page }) => {
    await open(page);
    await page.getByRole('textbox', { name: 'Email' }).fill('x');
    await page.getByRole('button', { name: 'Create account' }).click();
    await expect(page.getByRole('region', { name: 'There is a problem' })).toBeFocused();
  });

  test('reset restores initial values and clears messages', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    await page.getByRole('textbox', { name: 'Email' }).fill('ada@example.com');
    await page.getByRole('switch', { name: 'Email me product news' }).uncheck();
    await page.getByRole('button', { name: 'Reset' }).click();
    await expect(page.getByRole('textbox', { name: 'Email' })).toHaveValue('');
    await expect(page.getByRole('switch', { name: 'Email me product news' })).toBeChecked();
    await expect(page.getByRole('region', { name: 'There is a problem' })).toBeHidden();
    await expect(page.locator('[aria-invalid="true"]')).toHaveCount(0);
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await page.getByRole('button', { name: 'Create account' }).click();
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('forced colors keep checkbox and switch boundaries visible', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    for (const role of ['checkbox', 'switch'] as const) {
      const name = role === 'checkbox' ? 'I accept the terms' : 'Email me product news';
      const border = await page.getByRole(role, { name }).evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.borderTopStyle, width: parseFloat(s.borderTopWidth) };
      });
      expect(border.style).toBe('solid');
      expect(border.width).toBeGreaterThan(0);
    }
  });
});
