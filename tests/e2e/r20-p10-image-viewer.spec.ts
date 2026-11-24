import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P10: Image Viewer (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p10-image-viewer${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const inline = (page: Page) => page.getByRole('region', { name: 'Office photos' });
const stage = (page: Page) => inline(page).locator('.aui-image-viewer__stage');

test('r20-p10 image viewer: no CSP violations or errors, including zoom, rotate, lightbox, and crop', async ({ page }) => {
  const errors = await open(page);
  await stage(page).focus();
  await page.keyboard.press('+');
  await page.keyboard.press('r');
  await page.getByRole('button', { name: 'Edit badge photo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Badge photo editor' });
  await dialog.getByRole('button', { name: 'Crop' }).click();
  await page.keyboard.press('Enter');
  await expect(page.locator('#lightbox-log')).toContainText('Cropped:');
  await page.keyboard.press('Escape');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`image viewer: axe in ${theme} (inline, lightbox, crop mode)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
    await page.getByRole('button', { name: 'Edit badge photo' }).click();
    await page.getByRole('dialog', { name: 'Badge photo editor' }).getByRole('button', { name: 'Crop' }).click();
    expect(await axe(page)).toEqual([]);
  });
}

test('image viewer: keyboard zoom, fit, actual size, rotation, and navigation', async ({ page }) => {
  await open(page);
  const region = inline(page);
  await expect(stage(page)).toHaveAttribute('aria-label', 'Image 1 of 3: Office lobby with a reception desk');
  await expect(region.locator('.aui-image-viewer__counter')).toHaveText('1 of 3');
  await stage(page).focus();
  await page.keyboard.press('1');
  await expect(page.locator('#inline-log')).toHaveText('Zoom: 100%');
  await page.keyboard.press('-');
  await expect(page.locator('#inline-log')).toHaveText('Zoom: 80%');
  await page.keyboard.press('0');
  await expect(page.locator('#inline-log')).toContainText('(fit)');
  await page.keyboard.press('r');
  await expect(page.locator('#inline-log')).toHaveText('Rotation: 90');
  await page.keyboard.press('Shift+R');
  await expect(page.locator('#inline-log')).toHaveText('Rotation: 0');
  await page.keyboard.press('ArrowRight');
  await expect(page.locator('#inline-log')).toHaveText('Shown: 2');
  await expect(stage(page)).toHaveAttribute('aria-label', 'Image 2 of 3: Signed contract, page one');
  await page.keyboard.press('End');
  await expect(page.locator('#inline-log')).toHaveText('Shown: 3');
  await expect(region.getByRole('button', { name: 'Next image' })).toHaveAttribute('aria-disabled', 'true');
  await page.keyboard.press('Home');
  await expect(region.getByRole('button', { name: 'Office lobby with a reception desk' })).toHaveAttribute('aria-current', 'true');
});

test('image viewer: toolbar and thumbnails use roving tabindex', async ({ page }) => {
  await open(page);
  const region = inline(page);
  await region.getByRole('button', { name: 'Previous image' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(region.getByRole('button', { name: 'Next image' })).toBeFocused();
  await page.keyboard.press('ArrowRight');
  await expect(region.getByRole('button', { name: 'Zoom out' })).toBeFocused();
  await page.keyboard.press('Enter');
  const thumb = region.getByRole('button', { name: 'Signed contract, page one' });
  await region.getByRole('button', { name: 'Office lobby with a reception desk' }).focus();
  await page.keyboard.press('ArrowRight');
  await expect(thumb).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(thumb).toHaveAttribute('aria-current', 'true');
});

test('image viewer: RTL mirrors arrow navigation', async ({ page }) => {
  await open(page, '?dir=rtl');
  await stage(page).focus();
  await page.keyboard.press('ArrowLeft');
  await expect(page.locator('#inline-log')).toHaveText('Shown: 2');
});

test('image viewer: wheel with Ctrl zooms, double click toggles actual size', async ({ page }) => {
  await open(page);
  const box = await stage(page).boundingBox();
  if (!box) throw new Error('no stage');
  await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
  await page.keyboard.down('Control');
  await page.mouse.wheel(0, -200);
  await page.keyboard.up('Control');
  await expect(page.locator('#inline-log')).toContainText('Zoom:');
  await page.keyboard.press('Escape');
  await stage(page).dblclick();
  await expect(page.locator('#inline-log')).toContainText('Zoom:');
});

test('image viewer: lightbox moves focus in, crops to 1:1 by keyboard, and restores focus on Escape', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('button', { name: 'Edit badge photo' });
  await trigger.click();
  const dialog = page.getByRole('dialog', { name: 'Badge photo editor' });
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.aui-image-viewer__stage')).toBeFocused();
  await dialog.getByRole('button', { name: 'Crop' }).click();
  const area = dialog.getByRole('group', { name: /^Crop area/ });
  await expect(area).toBeFocused();
  await dialog.getByRole('button', { name: '1:1' }).click();
  await expect(dialog.getByRole('button', { name: '1:1' })).toHaveAttribute('aria-pressed', 'true');
  await area.focus();
  await page.keyboard.press('Shift+ArrowLeft');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Enter');
  await expect(page.locator('#lightbox-log')).toHaveText(/^Cropped: (\d+)x\1 image\/png$/);
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
  await expect(trigger).toBeFocused();
});

test('image viewer: Escape in crop mode cancels the crop before closing the lightbox', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Edit badge photo' }).click();
  const dialog = page.getByRole('dialog', { name: 'Badge photo editor' });
  await dialog.getByRole('button', { name: 'Crop' }).click();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeVisible();
  await expect(dialog.locator('.aui-image-viewer__crop')).toBeHidden();
  await page.keyboard.press('Escape');
  await expect(dialog).toBeHidden();
});
