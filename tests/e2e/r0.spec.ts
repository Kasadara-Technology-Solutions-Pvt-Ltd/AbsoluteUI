import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
    __xss?: number;
  }
}


async function openHarness(page: Page, query = ''): Promise<string[]> {
  const pageErrors: string[] = [];
  page.on('pageerror', (e) => pageErrors.push(e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') pageErrors.push(m.text());
  });
  await page.addInitScript(() => {
    window.__csp = [];
    document.addEventListener('securitypolicyviolation', (e) => {
      window.__csp.push(`${e.violatedDirective} ${e.blockedURI} ${e.sample}`);
    });
  });
  await page.goto(`/${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return pageErrors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('CSP and Trusted Types (SPEC section 14.6.2)', () => {
  test('no violations or errors while exercising every reference component', async ({ page }) => {
    const errors = await openHarness(page);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await page.getByRole('combobox', { name: 'Country in dialog' }).press('ArrowDown');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await page.getByRole('combobox', { name: 'Country', exact: true }).fill('ind');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await page.getByRole('group', { name: 'Start date' }).getByRole('textbox', { name: 'Month' }).press('ArrowUp');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('the harness really enforces Trusted Types', async ({ page }) => {
    await openHarness(page);
    const outcome = await page.evaluate(() => {
      try {
        document.body.insertAdjacentHTML('beforeend', '<b>x</b>');
        return 'allowed';
      } catch {
        return 'blocked';
      }
    });
    expect(outcome).toBe('blocked');
  });

  test('sanitized untrusted HTML renders without executing script', async ({ page }) => {
    await openHarness(page);
    const box = page.locator('#sanitized');
    await expect(box.locator('strong')).toHaveText('world');
    await expect(box.locator('img')).toHaveCount(0);
    await expect(box.locator('a')).not.toHaveAttribute('href', /.*/);
    expect(await page.evaluate(() => window.__xss)).toBeUndefined();
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`axe WCAG 2.2 AA: ${theme}`, () => {
    test('page in default state', async ({ page }) => {
      await openHarness(page, `?theme=${theme}`);
      expect(await axe(page)).toEqual([]);
    });

    test('combobox open', async ({ page }) => {
      await openHarness(page, `?theme=${theme}`);
      await page.getByRole('combobox', { name: 'Country' }).press('ArrowDown');
      await expect(page.getByRole('listbox', { name: 'Country' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('dialog open', async ({ page }) => {
      await openHarness(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Open dialog' }).click();
      await expect(page.getByRole('dialog', { name: 'Choose a country' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('Dialog in a real browser', () => {
  test('keyboard: open, focus containment, Escape, focus restoration', async ({ page }) => {
    await openHarness(page);
    const trigger = page.getByRole('button', { name: 'Open dialog' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('dialog', { name: 'Choose a country' });
    await expect(dialog).toBeVisible();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    for (let i = 0; i < 8; i++) {
      await page.keyboard.press('Tab');
      const inBackground = await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement) ?? false);
      expect(inBackground).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(trigger).toBeFocused();
    await expect(page.locator('#dialog-result')).toHaveText('dismissed');
  });

  test('a combobox listbox renders above the modal dialog and Escape closes it first', async ({ page }) => {
    await openHarness(page);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    const input = page.getByRole('combobox', { name: 'Country in dialog' });
    await input.press('ArrowDown');
    const option = page.getByRole('option', { name: 'Japan' });
    await expect(option).toBeVisible();
    const box = await option.boundingBox();
    expect(box).not.toBeNull();
    const hit = await page.evaluate(([x, y]) => document.elementFromPoint(x ?? 0, y ?? 0)?.closest('[role="option"]')?.textContent ?? null, [box!.x + box!.width / 2, box!.y + box!.height / 2]);
    expect(hit).toContain('Japan');
    await page.keyboard.press('Escape');
    await expect(option).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Choose a country' })).toBeVisible();
  });
});

test.describe('Combobox in a real browser', () => {
  test('positions the listbox next to the input, flipping to stay within the viewport on mobile', async ({ page }) => {
    await page.setViewportSize({ width: 375, height: 667 });
    await openHarness(page);
    const input = page.getByRole('combobox', { name: 'Country' });
    await input.press('ArrowDown');
    const listbox = page.getByRole('listbox', { name: 'Country' });
    await expect(listbox).toBeVisible();
    const inputBox = (await input.boundingBox())!;
    const popupBox = (await page.locator('.aui-combobox__popup').first().boundingBox())!;
    const below = popupBox.y >= inputBox.y + inputBox.height;
    const above = popupBox.y + popupBox.height <= inputBox.y;
    expect(below || above).toBe(true);
    expect(popupBox.y).toBeGreaterThanOrEqual(0);
    expect(popupBox.y + popupBox.height).toBeLessThanOrEqual(667);
    expect(popupBox.x).toBeGreaterThanOrEqual(0);
    expect(popupBox.x + popupBox.width).toBeLessThanOrEqual(375);
  });

  test('selection updates the form value', async ({ page }) => {
    await openHarness(page);
    await page.getByRole('combobox', { name: 'Country' }).fill('ger');
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(page.locator('input[type=hidden][name=country]')).toHaveValue('de');
  });
});

test.describe('Responsive, motion, contrast modes', () => {
  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await openHarness(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('honours prefers-reduced-motion', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await openHarness(page);
    const animation = await page.locator('.aui-button__spinner').evaluate((el) => getComputedStyle(el).animationName);
    expect(animation).toBe('none');
  });

  test('keeps control boundaries in forced-colors mode', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await openHarness(page);
    const border = await page.locator('#btn-ghost').evaluate((el) => {
      const s = getComputedStyle(el);
      return { style: s.borderTopStyle, width: parseFloat(s.borderTopWidth) };
    });
    expect(border.style).toBe('solid');
    expect(border.width).toBeGreaterThan(0);
  });

  test('shows a visible focus indicator on keyboard focus', async ({ page }) => {
    await openHarness(page);
    await page.keyboard.press('Tab');
    const outline = await page.evaluate(() => {
      const s = getComputedStyle(document.activeElement ?? document.body);
      return { style: s.outlineStyle, width: parseFloat(s.outlineWidth) };
    });
    expect(outline.style).toBe('solid');
    expect(outline.width).toBeGreaterThanOrEqual(2);
  });

  test('applies the dark theme tokens', async ({ page }) => {
    await openHarness(page, '?theme=absolute-dark');
    const bg = await page.evaluate(() => getComputedStyle(document.body).backgroundColor);
    expect(bg).toBe('rgb(11, 18, 32)');
  });
});
