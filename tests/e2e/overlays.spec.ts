import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R1 overlays and navigation page (SPEC section 18.12, section 18.13) under the strict CSP harness.
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
  await page.goto(`/overlays${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test.describe('overlays: CSP', () => {
  test('no violations or errors while exercising every component', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('button', { name: 'Filters' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Actions' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Help' }).hover();
    await page.getByRole('button', { name: 'Open drawer' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('tab', { name: 'Activity' }).click();
    await page.getByRole('button', { name: 'Page 4' }).click();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`overlays axe WCAG 2.2 AA: ${theme}`, () => {
    test('page', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      expect(await axe(page)).toEqual([]);
    });

    test('menu with submenu open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Actions' }).press('Enter');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('menuitem', { name: 'Email' })).toBeFocused();
      expect(await axe(page)).toEqual([]);
    });

    test('popover and tooltip open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Filters' }).click();
      await expect(page.getByRole('dialog', { name: 'Filters' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      // Reach Help with the keyboard: the tooltip opens on :focus-visible, and Firefox does not
      // treat a scripted focus() after a pointer click as keyboard focus.
      await page.getByRole('button', { name: 'Help' }).focus();
      await page.keyboard.press('Shift+Tab');
      await page.keyboard.press('Tab');
      await expect(page.getByRole('button', { name: 'Help' })).toBeFocused();
      await expect(page.getByRole('tooltip')).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('drawer open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Open drawer' }).click();
      await expect(page.getByRole('dialog', { name: 'Project details' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('overlays: keyboard and behavior', () => {
  test('menu: keyboard activation reports the item and returns focus to the trigger', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Actions' });
    await trigger.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await page.keyboard.press('End');
    await expect(page.getByRole('menuitem', { name: 'Delete' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-action')).toHaveText('delete');
    await expect(trigger).toBeFocused();
  });

  test('popover: Escape closes and restores focus; Tab moves into the popup content', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Filters' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('button', { name: 'Only active' })).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Filters' })).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('tooltip: shown on keyboard focus, dismissed by Escape without moving focus (WCAG 1.4.13)', async ({ page }) => {
    await open(page);
    await page.keyboard.press('Tab');
    const help = page.getByRole('button', { name: 'Help' });
    await help.focus();
    await expect(page.getByRole('tooltip')).toHaveText('Opens the help center');
    await page.keyboard.press('Escape');
    await expect(page.getByRole('tooltip')).toBeHidden();
    await expect(help).toBeFocused();
  });

  test('drawer: modal focus containment and focus restoration', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Open drawer' });
    await trigger.click();
    await expect(page.getByRole('button', { name: 'Cancel' })).toBeFocused();
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('main')?.contains(document.activeElement) ?? false)).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(trigger).toBeFocused();
  });

  test('Escape inside a dialog closes the topmost overlay first (overlay stack)', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Open dialog' }).click();
    await page.getByRole('combobox', { name: 'Owner' }).press('ArrowDown');
    await expect(page.getByRole('listbox', { name: 'Owner' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('listbox', { name: 'Owner' })).toBeHidden();
    await expect(page.getByRole('dialog', { name: 'Nested overlays' })).toBeVisible();
    await page.keyboard.press('Escape');
    await expect(page.getByRole('dialog', { name: 'Nested overlays' })).toBeHidden();
  });

  test('tabs: arrow keys move and select, skipping disabled; RTL mirrors arrows', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Overview' }).focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
    await expect(page.getByRole('tabpanel', { name: 'Activity' })).toBeVisible();
    await page.keyboard.press('End');
    await expect(page.getByRole('tab', { name: 'Settings' })).toBeFocused();
    await open(page, '?dir=rtl');
    await page.getByRole('tab', { name: 'Overview' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('tab', { name: 'Activity' })).toHaveAttribute('aria-selected', 'true');
  });

  test('pagination and breadcrumb semantics', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('navigation', { name: 'Breadcrumb' }).locator('[aria-current="page"]')).toHaveText('Harness');
    const pager = page.getByRole('navigation', { name: 'Pagination' });
    await expect(pager.getByRole('button', { name: 'Page 3' })).toHaveAttribute('aria-current', 'page');
    await pager.getByRole('button', { name: 'Next page' }).click();
    await expect(pager.getByRole('button', { name: 'Page 4' })).toHaveAttribute('aria-current', 'page');
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('reduced motion removes drawer transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: 'Open drawer' }).click();
    const property = await page.getByRole('dialog', { name: 'Project details' }).evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(property).toBe('none');
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test.describe(`visual overlays: ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 900, height: 700 });
    });

    test('page with menu open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Actions' }).press('Enter');
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-overlays-menu.png`);
    });

    test('drawer', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Open drawer' }).click();
      await expect(page.getByRole('dialog', { name: 'Project details' })).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-overlays-drawer.png`);
    });
  });
}
