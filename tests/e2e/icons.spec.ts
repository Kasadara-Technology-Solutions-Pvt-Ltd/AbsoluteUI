import { test, expect, type Page } from '@playwright/test';

// docs/PLAN-R16-ICONS.md M3: the icon set runtime in every engine of the browser support matrix
// (functional, firefox, webkit projects): CSS and Web Animations presets, the curated morph,
// reduced motion, overlay knockout masks, and RTL mirroring.
const open = async (page: Page): Promise<void> => {
  await page.goto('/icons');
  await page.waitForFunction(() => window.__auiReady === true);
};

/** Running animations on the element matching `selector` and its subtree. */
const running = (page: Page, selector: string): Promise<number> =>
  page.evaluate((s) => {
    const el = document.querySelector(s);
    return el ? el.getAnimations({ subtree: true }).filter((a) => a.playState === 'running').length : -1;
  }, selector);

test.describe('icon set runtime (R16)', () => {
  test('spin (CSS) and bounce (Web Animations, accent layer) follow the loading state', async ({ page }) => {
    await open(page);
    expect(await running(page, '.spin')).toBe(0);
    await page.evaluate(() => {
      window.__icons?.spin.setState('loading');
      window.__icons?.bounce.setState('loading');
    });
    await expect.poll(() => running(page, '.spin')).toBeGreaterThan(0);
    await expect.poll(() => running(page, '.bounce g[data-layer="accent"]')).toBeGreaterThan(0);
    expect(await page.evaluate(() => window.__icons?.spin.state)).toBe('running');
    await page.evaluate(() => {
      window.__icons?.spin.setState('idle');
    });
    await expect.poll(() => running(page, '.spin')).toBe(0);
  });

  test('menu morphs into close and back', async ({ page }) => {
    await open(page);
    const first = (): Promise<string | null> => page.evaluate(() => document.querySelector('.morph path')?.getAttribute('d') ?? null);
    const start = await first();
    await page.evaluate(() => {
      window.__icons?.morph.play();
    });
    await expect.poll(first).toBe('M6 6L18 18');
    await page.evaluate(() => {
      window.__icons?.morph.play();
    });
    await expect.poll(first).toBe(start);
  });

  test('reduced motion shows the static icon', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    await page.evaluate(() => {
      window.__icons?.spin.setState('loading');
      window.__icons?.bounce.setState('loading');
    });
    expect(await running(page, '.spin')).toBe(0);
    expect(await running(page, '.bounce')).toBe(0);
  });

  test('overlays cut their icon with a mask of their own, at 16 and 24px', async ({ page }) => {
    await open(page);
    const ids = await page.evaluate(() => ['.locked-a', '.locked-b'].map((s) => document.querySelector(`${s} mask`)?.id ?? ''));
    expect(ids.every((id) => id.length > 0)).toBe(true);
    expect(new Set(ids).size).toBe(2);
    expect(await page.locator('.locked-a [data-overlay="lock"]').count()).toBe(1);
    expect(await page.locator('.locked-a').evaluate((el) => Math.round(el.getBoundingClientRect().width))).toBe(16);
  });

  test('directional icons mirror in right-to-left layouts only', async ({ page }) => {
    await open(page);
    const transform = (s: string): Promise<string> => page.locator(`${s} .aui-icon`).evaluate((el) => getComputedStyle(el).transform);
    expect(await transform('#ltr')).toBe('none');
    expect(await transform('#rtl')).toMatch(/^matrix\(-1, 0, 0, 1, 0, 0\)$/);
  });
});
