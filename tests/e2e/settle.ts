import type { Page } from '@playwright/test';

/**
 * Wait until finite CSS transitions and animations have finished (SPEC section 16.2 motion), so
 * accessibility scans see the settled page rather than a popup mid-fade.
 */
export async function settled(page: Page): Promise<void> {
  // Infinite animations (spinners, indeterminate progress) never finish and are ignored.
  await page.waitForFunction(() => document.getAnimations().every((a) => a.playState !== 'running' || a.effect?.getTiming().iterations === Infinity));
}
