import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R13 new components (docs/PLAN-R13-COMPONENTS.md).
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
  await page.goto(`/r13${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('r13: no CSP violations or errors', async ({ page }) => {
  const errors = await open(page);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('badge: labels carry the meaning; decorations are hidden and not focusable', async ({ page }) => {
  await open(page);
  const row = page.locator('#badge-row');
  await expect(row.locator('.aui-badge')).toHaveCount(5);
  await expect(row).toHaveText('Draft In review Active Expiring Overdue');
  expect(await page.locator('.aui-badge > [aria-hidden="true"]:not([hidden])').count()).toBe(10);
  expect(await page.evaluate(() => [...document.querySelectorAll('.aui-badge')].some((b) => b.matches(':focus-visible, [tabindex]')))).toBe(false);
  // Outline badges draw their tone boundary.
  const border = await page.locator('#badge-outline-row .aui-badge--error').evaluate((el) => getComputedStyle(el).borderTopColor);
  expect(border).not.toBe('rgba(0, 0, 0, 0)');
});

test('kbd: nested kbd keycaps with spoken names for symbols', async ({ page }) => {
  await open(page);
  await expect(page.locator('#kbd-save kbd.aui-kbd__combo > kbd.aui-kbd__key')).toHaveText(['Ctrl', 'S']);
  const apple = page.locator('#kbd-apple');
  await expect(apple.locator('.aui-kbd__separator')).toHaveCount(0);
  // macOS symbols are hidden from assistive technology; a localized name follows each.
  await expect(apple.locator('.aui-kbd__key > [aria-hidden="true"]')).toHaveCount(2);
  await expect(apple.getByText('Command', { exact: true })).toHaveCount(1);
  await expect(apple.getByText('Shift', { exact: true })).toHaveCount(1);
  await expect(page.locator('#kbd-arrow .aui-kbd__key').nth(1)).toContainText('Down arrow');
});

test('avatar: named images with presence; group with overflow', async ({ page }) => {
  await open(page);
  await expect(page.locator('#avatar-row').getByRole('img', { name: 'Grace Hopper, Away' })).toHaveCount(1);
  await expect(page.locator('#avatar-row .aui-avatar__visual').first()).toHaveText('AL');
  await expect(page.locator('#avatar-decorative')).toHaveAttribute('aria-hidden', 'true');
  const group = page.getByRole('group', { name: 'Project members' });
  await expect(group.getByRole('img')).toHaveCount(4);
  await expect(group.getByRole('img', { name: '2 more' })).toHaveText('+2');
});

test('fieldset: named group with help; group error is described and focus moves to the first field', async ({ page }) => {
  await open(page);
  const group = page.getByRole('group', { name: 'Delivery address' });
  await expect(group).toHaveAccessibleDescription('Where we send the order');
  await page.getByRole('button', { name: 'Check address' }).click();
  await expect(group).toHaveAccessibleDescription('Where we send the order Enter a street and a city');
  await expect(page.getByRole('textbox', { name: 'Street' })).toBeFocused();
  expect(await axe(page)).toEqual([]);
});

test('collapsible: keyboard toggles the disclosure; the heading variant is in the outline', async ({ page }) => {
  await open(page);
  const trigger = page.getByRole('button', { name: 'How is the delivery date calculated?' });
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByText('Orders placed before 14:00')).toBeHidden();
  await trigger.focus();
  await page.keyboard.press('Enter');
  await expect(trigger).toHaveAttribute('aria-expanded', 'true');
  await expect(page.getByText('Orders placed before 14:00')).toBeVisible();
  await page.keyboard.press('Space');
  await expect(trigger).toHaveAttribute('aria-expanded', 'false');
  await expect(page.getByRole('heading', { level: 3, name: 'Advanced settings' })).toBeVisible();
  await expect(page.getByText('Proxy and cache options.')).toBeVisible();
});

test('toggle group: pressed state, arrow keys between buttons, required single choice', async ({ page }) => {
  await open(page);
  const align = page.getByRole('group', { name: 'Text alignment' });
  const start = align.getByRole('button', { name: 'Align start' });
  await expect(start).toHaveAttribute('aria-pressed', 'true');
  await start.focus();
  await page.keyboard.press('ArrowRight');
  const center = align.getByRole('button', { name: 'Align center' });
  await expect(center).toBeFocused();
  await page.keyboard.press('Space');
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  await expect(start).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#toggle-log')).toHaveText('center');
  // Required: pressing the pressed button keeps it pressed.
  await page.keyboard.press('Space');
  await expect(center).toHaveAttribute('aria-pressed', 'true');
  // Tab leaves the group in one step.
  await page.keyboard.press('Tab');
  await expect(page.getByRole('group', { name: 'Text style' }).getByRole('button', { name: 'Bold' })).toBeFocused();
  await page.keyboard.press('Enter');
  await expect(page.locator('#toggle-log')).toHaveText('bold');
});

test('tag group: Delete removes with focus moving on and an announcement; Space selects', async ({ page }) => {
  await open(page);
  const filters = page.getByRole('grid', { name: 'Applied filters' });
  await expect(filters.getByRole('row')).toHaveCount(3);
  await filters.getByRole('row', { name: 'Remote' }).focus();
  await page.keyboard.press('Delete');
  await expect(filters.getByRole('row')).toHaveCount(2);
  await expect(filters.getByRole('row', { name: 'Senior' })).toBeFocused();
  await expect(page.getByText('Remote removed')).toBeAttached();
  const categories = page.getByRole('grid', { name: 'Categories' });
  await categories.getByRole('row', { name: 'Sales' }).focus();
  await page.keyboard.press('Space');
  await expect(categories.getByRole('row', { name: 'Sales' })).toHaveAttribute('aria-selected', 'true');
  await expect(categories.getByRole('row', { name: 'Design' })).toHaveAttribute('aria-selected', 'true');
});

test('slider: keyboard and pointer change the value; range thumbs are limited by each other', async ({ page }) => {
  await open(page);
  const volume = page.getByRole('slider', { name: 'Volume' });
  await expect(volume).toHaveAttribute('aria-valuetext', '40%');
  await volume.focus();
  await page.keyboard.press('ArrowRight');
  await expect(volume).toHaveAttribute('aria-valuenow', '50');
  await page.keyboard.press('End');
  await expect(volume).toHaveAttribute('aria-valuenow', '100');
  const track = page.locator('#slider-volume .aui-slider__control');
  const box = (await track.boundingBox())!;
  await page.mouse.click(box.x + box.width * 0.2, box.y + box.height / 2);
  await expect(volume).toHaveAttribute('aria-valuenow', '20');
  const low = page.getByRole('slider', { name: 'Price Minimum' });
  const high = page.getByRole('slider', { name: 'Price Maximum' });
  await expect(low).toHaveAttribute('aria-valuemax', '300');
  await high.focus();
  await page.keyboard.press('Home');
  await expect(high).toHaveAttribute('aria-valuenow', '50');
  await expect(high).toHaveAttribute('aria-valuetext', '€50');
});

test('scroll area: a named, focusable region that scrolls with the keyboard; fades track the edges', async ({ page }) => {
  await open(page);
  const region = page.getByRole('region', { name: 'Release notes' });
  await expect(region).toHaveAttribute('tabindex', '0');
  await expect(region).toHaveAttribute('data-aui-scroll-bottom', '');
  await expect(region).not.toHaveAttribute('data-aui-scroll-top', '');
  await region.focus();
  await page.keyboard.press('End');
  await expect(region).toHaveAttribute('data-aui-scroll-top', '');
  await expect(region).not.toHaveAttribute('data-aui-scroll-bottom', '');
});

test('carousel: next moves the slide, hidden slides are inert, autoplay has a pause button first', async ({ page }) => {
  await open(page);
  const featured = page.getByRole('region', { name: 'Featured' });
  await expect(featured).toHaveAttribute('aria-roledescription', 'carousel');
  await expect(featured.getByRole('group', { name: '1 of 3: Spring sale' })).toBeVisible();
  await featured.getByRole('button', { name: 'Next slide' }).click();
  await expect(featured.getByRole('group', { name: '2 of 3' })).toBeVisible();
  await expect(featured.locator('.aui-carousel__slide').first()).toHaveAttribute('inert', '');
  await expect(featured.getByRole('button', { name: 'Go to slide 2' })).toHaveAttribute('aria-current', 'true');
  const auto = page.getByRole('region', { name: 'Announcements' });
  const pause = auto.getByRole('button', { name: 'Stop automatic slide show' });
  await expect(auto.locator('button').first()).toHaveAttribute('aria-label', 'Stop automatic slide show');
  await pause.click();
  await expect(auto.getByRole('button', { name: 'Start automatic slide show' })).toBeVisible();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r13: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}
