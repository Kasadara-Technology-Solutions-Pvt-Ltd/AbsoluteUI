import { test, expect, type Page } from '@playwright/test';
import { engine } from './browsers.js';

// SPEC section 13.6, section 16.2: short entry and exit transitions on overlays and popups, removed
// under prefers-reduced-motion. Checks computed transitions, which do not depend on timing.
declare global {
  interface Window {
    __auiReady?: boolean;
  }
}

async function open(page: Page, path: string, reducedMotion: 'reduce' | 'no-preference'): Promise<void> {
  await page.emulateMedia({ reducedMotion });
  await page.goto(path);
  await page.waitForFunction(() => window.__auiReady === true);
}

const motion = (page: Page, selector: string, pseudo?: string) =>
  page.evaluate(
    ([sel, ps]) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const cs = getComputedStyle(el, ps || null);
      return { duration: cs.transitionDuration, property: cs.transitionProperty, behavior: cs.transitionBehavior };
    },
    [selector, pseudo ?? ''] as const,
  );

interface Case {
  readonly name: string;
  readonly path: string;
  readonly selector: string;
  readonly pseudo?: string;
  openIt(page: Page): Promise<void>;
}

const cases: readonly Case[] = [
  { name: 'menu', path: '/overlays', selector: '.aui-menu', openIt: (p) => p.getByRole('button', { name: 'Actions' }).click() },
  { name: 'popover', path: '/overlays', selector: '.aui-popover', openIt: (p) => p.getByRole('button', { name: 'Filters' }).click() },
  { name: 'tooltip', path: '/overlays', selector: '.aui-tooltip', openIt: (p) => p.getByRole('button', { name: 'Help' }).focus() },
  { name: 'drawer', path: '/overlays', selector: '.aui-drawer', openIt: (p) => p.getByRole('button', { name: 'Open drawer' }).click() },
  { name: 'dialog', path: '/', selector: '.aui-dialog', openIt: (p) => p.getByRole('button', { name: 'Open dialog' }).click() },
  { name: 'dialog backdrop', path: '/', selector: '.aui-dialog[open]', pseudo: '::backdrop', openIt: (p) => p.getByRole('button', { name: 'Open dialog' }).click() },
  { name: 'combobox listbox', path: '/', selector: '.aui-combobox__popup', openIt: (p) => p.getByRole('combobox', { name: 'Country', exact: true }).press('ArrowDown') },
];

test.describe('motion (SPEC section 13.6, section 16.2)', () => {
  for (const c of cases) {
    test(`${c.name}: short opacity transition that also plays on exit`, async ({ page }) => {
      await open(page, c.path, 'no-preference');
      await c.openIt(page);
      const m = await motion(page, c.selector, c.pseudo);
      expect(m).not.toBeNull();
      expect(m?.property).toMatch(/opacity|transform/);
      const seconds = Math.max(...(m?.duration ?? '0s').split(',').map((d) => parseFloat(d)));
      expect(seconds).toBeGreaterThan(0);
      expect(seconds).toBeLessThanOrEqual(0.2);
      // Exit: display/overlay transition discretely so the element stays rendered while it fades.
      expect(m?.behavior).toContain('allow-discrete');
    });

    test(`${c.name}: no transition under prefers-reduced-motion`, async ({ page }) => {
      await open(page, c.path, 'reduce');
      await c.openIt(page);
      const m = await motion(page, c.selector, c.pseudo);
      expect(m).not.toBeNull();
      expect((m?.duration ?? '').split(',').every((d) => parseFloat(d) === 0)).toBe(true);
    });
  }

  test('a closing menu stays rendered while it fades out', async ({ page }) => {
    test.skip(engine(page) !== 'chromium', 'the CSS overlay transition is Chromium-only; elsewhere menus close at once (known difference)');
    await open(page, '/overlays', 'no-preference');
    await page.getByRole('button', { name: 'Actions' }).click();
    const displayAfterClose = await page.evaluate(() => {
      const menu = document.querySelector<HTMLElement>('.aui-menu:popover-open');
      if (!menu) return 'missing';
      menu.hidePopover();
      return getComputedStyle(menu).display;
    });
    expect(displayAfterClose).not.toBe('none');
    await expect(page.locator('.aui-menu').first()).toBeHidden();
  });
});
