import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, tabToLink } from './browsers.js';
import { settled } from './settle.js';
import type { ContextMenu as ContextMenuClass } from '@absoluteui/components/context-menu';
import type { MenuBar as MenuBarClass } from '@absoluteui/components/menu-bar';

// R2 navigation and overlays page (SPEC section 18.12, section 18.13, section 18.20) under the strict CSP harness.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

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
  await page.goto(`/navigation${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

async function live(page: Page): Promise<string> {
  return (await page.locator('[data-aui-live-region="assertive"]').last().textContent()) ?? '';
}

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1100, height: 800 });
});

test.describe('navigation: CSP', () => {
  test('no violations or errors while exercising every component', async ({ page }) => {
    const errors = await open(page);
    await page.getByRole('menuitem', { name: 'File' }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'report.pdf' }).click({ button: 'right' });
    await page.keyboard.press('Escape');
    await page.getByRole('link', { name: 'Ada Lovelace' }).hover();
    await expect(page.getByRole('link', { name: 'View profile' })).toBeVisible();
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await page.keyboard.press('Escape');
    await page.getByRole('button', { name: 'Reorder Search' }).press('Space');
    await page.keyboard.press('ArrowUp');
    await page.keyboard.press('Space');
    await page.getByRole('button', { name: 'Cart' }).click();
    await page.getByRole('button', { name: 'Reports' }).click();
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

for (const theme of THEMES) {
  test.describe(`navigation axe WCAG 2.2 AA: ${theme}`, () => {
    test('page', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      expect(await axe(page)).toEqual([]);
    });

    test('menu bar menu with submenu open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('menuitem', { name: 'File' }).focus();
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowDown');
      await page.keyboard.press('ArrowRight');
      await expect(page.getByRole('menuitem', { name: 'report.pdf' })).toBeFocused();
      expect(await axe(page)).toEqual([]);
    });

    test('context menu and hover card open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'report.pdf' }).focus();
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menu', { name: 'File actions' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
      await page.keyboard.press('Escape');
      await page.getByRole('link', { name: 'Ada Lovelace' }).focus();
      await expect(page.getByRole('link', { name: 'View profile' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('bottom sheet open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Share report' })).toBeVisible();
      expect(await axe(page)).toEqual([]);
    });

    test('sidebar rail and a grabbed sortable item', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await page.getByRole('button', { name: 'Reorder Billing' }).focus();
      await page.keyboard.press('Space');
      await expect(page.getByRole('button', { name: 'Reorder Billing' })).toHaveAttribute('aria-pressed', 'true');
      expect(await axe(page)).toEqual([]);
    });
  });
}

test.describe('navigation: keyboard and behavior', () => {
  test('menu bar: arrows move along the bar, open menus, and switch between them', async ({ page }) => {
    await open(page);
    const file = page.getByRole('menuitem', { name: 'File' });
    await file.focus();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.getByRole('menuitem', { name: 'Undo' })).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitemcheckbox', { name: 'Show grid' })).toBeFocused();
    await page.keyboard.press('ArrowLeft');
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('menuitem', { name: 'New' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-action')).toHaveText('new');
    await expect(file).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-action')).toHaveText('help');
    // One tab stop: Tab leaves the menubar.
    await page.keyboard.press('Tab');
    expect(await page.getByRole('menubar').evaluate((el) => el.contains(document.activeElement))).toBe(false);
  });

  test('menu bar: RTL mirrors the arrows', async ({ page }) => {
    await open(page, '?dir=rtl');
    await page.getByRole('menuitem', { name: 'File' }).focus();
    await page.keyboard.press('ArrowLeft');
    await expect(page.getByRole('menuitem', { name: 'Edit' })).toBeFocused();
  });

  test('context menu: right-click at the pointer, Shift+right-click keeps the native menu, keyboard opens at focus', async ({ page }) => {
    await open(page);
    const file = page.getByRole('button', { name: 'budget.xlsx' });
    const box = (await file.boundingBox())!;
    await page.mouse.click(box.x + 10, box.y + 10, { button: 'right' });
    const menu = page.getByRole('menu', { name: 'File actions' });
    await expect(menu).toBeVisible();
    const m = (await menu.boundingBox())!;
    expect(Math.abs(m.x - (box.x + 11))).toBeLessThanOrEqual(2);
    // Below the pointer, or flipped above it when the viewport has no room below.
    const below = Math.abs(m.y - (box.y + 11));
    const above = Math.abs(m.y + m.height - (box.y + 11));
    expect(Math.min(below, above)).toBeLessThanOrEqual(2);
    await expect(page.getByRole('menuitem', { name: 'Open' })).toBeFocused();
    await page.keyboard.press('End');
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-action')).toHaveText('delete-file:budget.xlsx');
    await page.getByRole('button', { name: 'report.pdf' }).focus();
    await page.keyboard.press('Shift+F10');
    await expect(menu).toBeVisible();
    await page.keyboard.press('ArrowDown');
    await page.keyboard.press('ArrowRight');
    await expect(page.getByRole('menuitem', { name: 'Email' })).toBeFocused();
    await page.keyboard.press('Escape');
    await page.keyboard.press('Escape');
    await expect(menu).toBeHidden();
    await expect(page.getByRole('button', { name: 'report.pdf' })).toBeFocused();
    // Shift+right-click is left to the browser: our menu does not open.
    const prevented = await page.getByRole('button', { name: 'report.pdf' }).evaluate((el) => {
      const r = el.getBoundingClientRect();
      return !el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, shiftKey: true, clientX: r.left + 5, clientY: r.top + 5 }));
    });
    expect(prevented).toBe(false);
    await expect(menu).toBeHidden();
  });

  test('stepper: Tab reaches only reachable steps; activation moves aria-current', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation', { name: 'Checkout progress' });
    await expect(nav.locator('[aria-current="step"]')).toContainText('Shipping');
    await nav.getByRole('button', { name: 'Cart' }).focus();
    await page.keyboard.press('Tab');
    // Upcoming steps in linear mode are not reachable: focus leaves the stepper.
    expect(await nav.evaluate((el) => el.contains(document.activeElement))).toBe(false);
    await nav.getByRole('button', { name: 'Cart' }).focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#current-step')).toHaveText('cart');
    await expect(nav.locator('[aria-current="step"]')).toContainText('Cart');
  });

  test('sidebar: groups disclose, aria-current follows activation, the rail keeps names and shows tooltips', async ({ page }) => {
    await open(page);
    const nav = page.getByRole('navigation', { name: 'Main' });
    const reports = nav.getByRole('button', { name: 'Reports' });
    await reports.focus();
    await page.keyboard.press('Enter');
    await expect(reports).toHaveAttribute('aria-expanded', 'true');
    await nav.getByRole('link', { name: 'Sales' }).focus();
    await page.keyboard.press('Enter');
    await expect(nav.getByRole('link', { name: 'Sales' })).toHaveAttribute('aria-current', 'page');
    await page.getByRole('button', { name: 'Collapse sidebar' }).click();
    await expect(nav.getByRole('link', { name: 'Search' })).toBeVisible();
    // The collapse animates inline-size: wait for the rail width rather than sampling mid-transition (regression).
    await expect.poll(() => page.locator('#sidebar').evaluate((el) => el.getBoundingClientRect().width)).toBeLessThan(80);
    await nav.getByRole('link', { name: 'Search' }).hover();
    await expect(page.getByRole('tooltip', { name: 'Search' })).toBeVisible();
  });

  test('hover card: hoverable, keyboard reachable, dismissible with Escape (WCAG 1.4.13)', async ({ page }) => {
    await open(page);
    const author = page.getByRole('link', { name: 'Ada Lovelace' });
    await author.hover();
    const profile = page.getByRole('link', { name: 'View profile' });
    await expect(profile).toBeVisible();
    await profile.hover();
    await page.waitForTimeout(200);
    await expect(profile).toBeVisible();
    await page.mouse.move(5, 790);
    await expect(profile).toBeHidden();
    await author.focus();
    await expect(profile).toBeVisible();
    await tabToLink(page, profile);
    await expect(profile).toBeFocused();
    await page.keyboard.press('Escape');
    await expect(profile).toBeHidden();
    await expect(author).toBeFocused();
  });

  test('bottom sheet: modal, slider handle changes the height, Escape restores focus', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Share', exact: true });
    await trigger.click();
    const sheet = page.getByRole('dialog', { name: 'Share report' });
    await expect(page.getByRole('button', { name: 'Close' })).toBeFocused();
    const low = (await sheet.boundingBox())!.height;
    expect(low).toBeGreaterThan(800 * 0.4 - 4);
    expect(low).toBeLessThan(800 * 0.4 + 4);
    const handle = page.getByRole('slider', { name: 'Sheet height' });
    await expect(handle).toHaveAttribute('aria-valuetext', '40% of screen height');
    await handle.focus();
    await page.keyboard.press('ArrowUp');
    await expect(handle).toHaveAttribute('aria-valuenow', '90');
    await expect.poll(async () => (await sheet.boundingBox())!.height).toBeGreaterThan(800 * 0.9 - 4);
    // Modal: Tab never reaches the page behind the sheet (it is inert).
    for (let i = 0; i < 6; i++) {
      await page.keyboard.press('Tab');
      expect(await page.evaluate(() => document.querySelector('.demo-shell')?.contains(document.activeElement) ?? false)).toBe(false);
    }
    await page.keyboard.press('Escape');
    await expect(sheet).toBeHidden();
    await expect(trigger).toBeFocused();
  });

  test('bottom sheet: dragging the handle down dismisses (pointer)', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const handle = page.getByRole('slider', { name: 'Sheet height' });
    const box = (await handle.boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, box.y + 200, { steps: 5 });
    await page.mouse.up();
    await expect(page.getByRole('dialog', { name: 'Share report' })).toBeHidden();
  });

  test('sortable list: keyboard reorder with announcements; pointer drag reorders', async ({ page }) => {
    await open(page);
    const handle = page.getByRole('button', { name: 'Reorder Billing' });
    await handle.focus();
    await page.keyboard.press('Space');
    await expect.poll(() => live(page)).toBe('Grabbed Billing. Current position 3 of 5.');
    await page.keyboard.press('ArrowUp');
    await expect.poll(() => live(page)).toBe('Billing moved to position 2 of 5.');
    await expect(handle).toBeFocused();
    await page.keyboard.press('Space');
    await expect(page.locator('#order')).toHaveText('security, billing, search, exports, audit');
    const from = (await page.getByRole('button', { name: 'Reorder Security review' }).boundingBox())!;
    const to = (await page.getByRole('button', { name: 'Reorder Exports' }).boundingBox())!;
    await page.mouse.move(from.x + from.width / 2, from.y + from.height / 2);
    await page.mouse.down();
    await page.mouse.move(from.x + from.width / 2, to.y + to.height / 2 + 8, { steps: 12 });
    await page.mouse.up();
    await expect(page.locator('#order')).toHaveText('billing, search, exports, security, audit');
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10); the sidebar becomes a drawer', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    await page.getByRole('button', { name: 'Open navigation' }).click();
    const drawer = page.getByRole('dialog', { name: 'Main' });
    await expect(drawer).toBeVisible();
    await expect(drawer.getByRole('navigation', { name: 'Main' })).toBeVisible();
    await drawer.getByRole('link', { name: 'Search' }).click();
    await expect(drawer).toBeHidden();
    await expect(page.locator('#last-action')).toHaveText('search');
  });

  test('reduced motion removes bottom sheet transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const property = await page.getByRole('dialog', { name: 'Share report' }).evaluate((el) => getComputedStyle(el).transitionProperty);
    expect(property).toBe('none');
  });

  test('forced colors keep stepper indicators and the current sidebar item distinguishable', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    const indicator = await page.locator('.aui-stepper__step[data-state="complete"] .aui-stepper__indicator').evaluate((el) => getComputedStyle(el).backgroundColor);
    const upcoming = await page.locator('.aui-stepper__step[data-state="upcoming"] .aui-stepper__indicator').first().evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(indicator).not.toBe(upcoming);
    const current = await page.locator('.aui-sidebar__item[aria-current="page"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    const other = await page.locator('.aui-sidebar__item[data-id="search"]').evaluate((el) => getComputedStyle(el).backgroundColor);
    expect(current).not.toBe(other);
  });
});

for (const theme of THEMES) {
  test.describe(`visual navigation: ${theme}`, () => {
    test.beforeEach(async ({ page }) => {
      await page.emulateMedia({ reducedMotion: 'reduce' });
      await page.setViewportSize({ width: 1000, height: 900 });
    });

    test('page with a menu bar menu open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('menuitem', { name: 'File' }).focus();
      await page.keyboard.press('ArrowDown');
      await expect(page.getByRole('menu')).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-navigation-page.png`);
    });

    test('bottom sheet', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Share', exact: true }).click();
      await expect(page.getByRole('dialog', { name: 'Share report' })).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-navigation-sheet.png`);
    });

    test('sidebar rail with a context menu open', async ({ page }) => {
      await open(page, `?theme=${theme}`);
      await page.getByRole('button', { name: 'Collapse sidebar' }).click();
      await page.getByRole('button', { name: 'report.pdf' }).focus();
      await page.keyboard.press('Shift+F10');
      await expect(page.getByRole('menu', { name: 'File actions' })).toBeVisible();
      await expect(page).toHaveScreenshot(`${theme}-navigation-rail-context.png`);
    });
  });
}

test.describe('menus that scroll (roving tabindex)', () => {
  test('a Context Menu and a Menu Bar menu with many items pass axe while they scroll', async ({ page }) => {
    await open(page);
    await page.evaluate(() => {
      const { ContextMenu, MenuBar } = (window as unknown as { __aui: { ContextMenu: typeof ContextMenuClass; MenuBar: typeof MenuBarClass } }).__aui;
      const items = Array.from({ length: 30 }, (_, i) => ({ id: `long-${String(i)}`, label: `Long item ${String(i + 1)}` }));
      const target = document.createElement('div');
      target.id = 'long-target';
      target.tabIndex = 0;
      target.textContent = 'Long menu target';
      document.querySelector('main')?.append(target);
      ContextMenu.create(target, { items, label: 'Long context menu' });
      const bar = document.createElement('div');
      bar.id = 'long-bar';
      document.querySelector('main')?.append(bar);
      MenuBar.create(bar, { label: 'Long bar', items: [{ id: 'many', label: 'Many', items }] });
    });
    await page.locator('#long-target').focus();
    await page.keyboard.press('Shift+F10');
    const menu = page.getByRole('menu', { name: 'Long context menu' });
    await expect(menu).toBeVisible();
    expect(await menu.evaluate((m) => m.scrollHeight > m.clientHeight)).toBe(true);
    await expect(menu.getByRole('menuitem', { name: 'Long item 1', exact: true })).toHaveAttribute('tabindex', '0');
    await page.keyboard.press('End');
    await expect(menu.getByRole('menuitem', { name: 'Long item 30' })).toHaveAttribute('tabindex', '0');
    await expect(menu.getByRole('menuitem', { name: 'Long item 1', exact: true })).toHaveAttribute('tabindex', '-1');
    expect(await axe(page)).toEqual([]);
    await page.keyboard.press('Escape');
    await page.getByRole('menubar', { name: 'Long bar' }).getByRole('menuitem', { name: 'Many' }).click();
    await expect(page.getByRole('menuitem', { name: 'Long item 1', exact: true }).last()).toBeFocused();
    expect(await axe(page)).toEqual([]);
  });
});
