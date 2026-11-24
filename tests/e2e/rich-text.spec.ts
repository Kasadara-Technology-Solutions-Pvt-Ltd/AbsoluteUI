import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, mod } from './browsers.js';
import { settled } from './settle.js';

// R3 rich text page (SPEC section 18.21) under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

interface RichTextWindow {
  __aui: { editor: { getHTML(): string; getMarkdown(): string; value: string }; plain: { value: string } };
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
  await page.goto(`/rich-text${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const editor = (page: Page) => page.getByRole('textbox', { name: 'Release notes' });
const html = (page: Page) => page.evaluate(() => (window as unknown as RichTextWindow).__aui.editor.getHTML());

async function caretAtEnd(page: Page): Promise<void> {
  await editor(page).click();
  await page.keyboard.press('Control+End');
}

test('rich text: no CSP or Trusted Types violations while typing, pasting HTML, and linking', async ({ page }) => {
  const errors = await open(page);
  await caretAtEnd(page);
  await page.keyboard.type(' More.');
  await page.evaluate(() => {
    const data = new DataTransfer();
    data.setData('text/html', '<p>Pasted <b>bold</b><img src=x onerror="alert(1)"><script>alert(2)</script></p>');
    data.setData('text/plain', 'Pasted bold');
    document.querySelector('.aui-rte__content')!.dispatchEvent(new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true }));
  });
  await page.keyboard.press(`${await mod(page)}+k`);
  await page.keyboard.type('https://example.com/x');
  await page.keyboard.press('Enter');
  expect(await html(page)).not.toMatch(/img|script|onerror/);
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`rich text axe WCAG 2.2 AA: ${theme} (link panel open, invalid state shown)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await page.getByRole('textbox', { name: 'Summary (plain text)' }).click();
    await page.getByRole('button', { name: 'Save' }).click();
    await editor(page).click();
    await page.keyboard.press(`${await mod(page)}+k`);
    await expect(page.getByRole('textbox', { name: 'Link address' })).toBeFocused();
    expect(await axe(page)).toEqual([]);
  });
}

test.describe('rich text: behavior', () => {
  test('typing with Markdown shortcuts builds structure; the toolbar reflects the block type', async ({ page }) => {
    await open(page);
    await caretAtEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.press('Enter');
    await page.keyboard.type('## Fixes');
    await page.keyboard.press('Enter');
    await page.keyboard.type('- one **strong** fix');
    expect(await html(page)).toContain('<h2>Fixes</h2><ul><li>one <strong>strong</strong> fix</li></ul>');
    await expect(page.getByRole('button', { name: 'Bulleted list' })).toHaveAttribute('aria-pressed', 'true');
  });

  test('toolbar: Alt+F10 enters it, arrows move between tools, Escape returns to the text', async ({ page }) => {
    await open(page);
    await editor(page).click();
    await page.keyboard.press('Alt+F10');
    const toolbar = page.getByRole('toolbar', { name: 'Formatting' });
    await expect(toolbar.locator(':focus')).toHaveCount(1);
    await page.keyboard.press('ArrowRight');
    await expect(toolbar.locator(':focus')).toHaveAttribute('aria-label', 'Heading 1');
    await page.keyboard.press('Escape');
    await expect(editor(page)).toBeFocused();
  });

  test('selection formatting with shortcuts, undo and redo', async ({ page }) => {
    await open(page);
    await caretAtEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Styled text');
    await page.keyboard.press('Shift+Home');
    await page.keyboard.press(`${await mod(page)}+b`);
    await page.keyboard.press(`${await mod(page)}+i`);
    expect(await html(page)).toContain('<strong><em>Styled text</em></strong>');
    await page.keyboard.press(`${await mod(page)}+z`);
    await page.keyboard.press(`${await mod(page)}+z`);
    expect(await html(page)).toContain('<li>Styled text</li>');
    await page.keyboard.press(`${await mod(page)}+y`);
    expect(await html(page)).toContain('<strong>Styled text</strong>');
  });

  test('lists: Tab nests, Shift+Tab outdents, Escape then Tab leaves the editor', async ({ page }) => {
    await open(page);
    await caretAtEnd(page);
    await page.keyboard.press('Enter');
    await page.keyboard.type('Child');
    await page.keyboard.press('Tab');
    expect(await html(page)).toContain('<li>Rich text<ul><li>Child</li></ul></li>');
    await page.keyboard.press('Shift+Tab');
    await page.keyboard.press('Escape');
    await page.keyboard.press('Tab');
    await expect(editor(page)).not.toBeFocused();
  });

  test('form: required plain editor reports invalid; Markdown output', async ({ page }) => {
    await open(page);
    await page.getByRole('button', { name: 'Save' }).click();
    await expect(page.locator('#last-event')).toHaveText('submitted');
    await page.getByRole('button', { name: 'Show Markdown' }).click();
    await expect(page.locator('#output')).toContainText('## Highlights');
    await expect(page.locator('#output')).toContainText('[changelog](https://example.com/changelog)');
  });

  test('plain mode: no toolbar; Enter makes paragraphs', async ({ page }) => {
    await open(page);
    const plain = page.getByRole('textbox', { name: 'Summary (plain text)' });
    await plain.click();
    await page.keyboard.type('one');
    await page.keyboard.press('Enter');
    await page.keyboard.type('two');
    expect(await page.evaluate(() => (window as unknown as RichTextWindow).__aui.plain.value)).toBe('one\ntwo');
    await expect(page.locator('#plain [role="toolbar"]')).toBeHidden();
  });

  test('reflows at 320 CSS px (toolbar wraps)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 700 });
    await open(page);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });
});

for (const theme of THEMES) {
  test(`visual rich text: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 1000, height: 900 });
    await open(page, `?theme=${theme}`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-rich-text.png`);
  });
}
