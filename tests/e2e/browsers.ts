// Cross-browser helpers for the e2e suite (docs/browser-support.json, R15-1).
import type { Locator, Page } from '@playwright/test';
import { AxeBuilder } from '@axe-core/playwright';

const WCAG_TAGS = ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'];

/** Engine of the page's browser: 'chromium', 'firefox', or 'webkit'. */
export function engine(page: Page): string {
  return page.context().browser()?.browserType().name() ?? 'chromium';
}

/**
 * axe with the WCAG 2.2 AA tags. Outside Chromium the color-contrast rule is off: axe's
 * background detection reports false positives in WebKit (the rendered pixels and computed
 * colors match Chromium), and contrast is checked in Chromium and by check:contrast.
 */
export function wcagAxe(page: Page): AxeBuilder {
  const builder = new AxeBuilder({ page }).withTags(WCAG_TAGS);
  return engine(page) === 'chromium' ? builder : builder.disableRules(['color-contrast']);
}

/** "Mod" key the library expects: Meta on Apple user agents (the WebKit project is Desktop Safari), Control elsewhere. */
export async function mod(page: Page): Promise<'Meta' | 'Control'> {
  const apple = await page.evaluate(() => /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(navigator.userAgent));
  return apple ? 'Meta' : 'Control';
}

/**
 * Move focus to the next link with Tab. Safari skips links on Tab by default (Option+Tab, or a
 * browser setting), and Playwright's WebKit does not tab to links, so it focuses the link directly.
 */
export async function tabToLink(page: Page, link: Locator): Promise<void> {
  if (engine(page) === 'webkit') await link.focus();
  else await page.keyboard.press('Tab');
}
