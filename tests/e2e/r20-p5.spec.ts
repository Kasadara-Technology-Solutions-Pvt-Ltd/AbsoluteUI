import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R20 P5: Chat and Prompt Input (docs/PLAN-R20.md).
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
  await page.goto(`/r20-p5${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

test('r20-p5: no CSP violations or errors, including while streaming', async ({ page }) => {
  const errors = await open(page);
  const composer = page.locator('#chat textarea');
  await composer.fill('How much leave do I have?');
  await composer.press('Enter');
  await expect(page.locator('#chat article.aui-chat__message--assistant').last()).toContainText('12 days');
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

test('chat: a log of named articles; day separators name the holiday', async ({ page }) => {
  await open(page);
  const log = page.getByRole('log', { name: 'Conversation with the HR assistant' });
  await expect(log).toHaveAttribute('aria-live', 'off');
  await expect(log.getByRole('article')).toHaveCount(3);
  await expect(log.locator('.aui-chat__day').first()).toHaveText('Yesterday (Founders Day)');
  await expect(log.getByRole('article').nth(1).getByRole('link', { name: 'the handbook' })).toHaveAttribute('rel', 'noopener noreferrer nofollow');
});

test('chat: send with Enter streams a Markdown reply; Stop keeps the partial text and offers Retry', async ({ page }) => {
  await open(page, '?delay=120');
  const composer = page.locator('#chat textarea');
  await composer.fill('Leave balance');
  await composer.press('Enter');
  await expect(page.locator('#chat-log')).toHaveText('send: Leave balance');
  const stop = page.getByRole('button', { name: 'Stop generating' });
  await expect(stop).toBeVisible();
  await expect(page.locator('#chat article.aui-chat__message--user').last()).toContainText('Leave balance');
  await stop.click();
  await expect(page.locator('#chat-log')).toHaveText('stop');
  const last = page.locator('#chat article.aui-chat__message--assistant').last();
  await expect(last.locator('.aui-chat__stopped')).toHaveText('Stopped.');
  await last.getByRole('button', { name: 'Retry' }).click();
  await expect(last.locator('strong')).toHaveText('12 days', { timeout: 10_000 });
  await expect(last.locator('pre code')).toHaveText('Policy HR-12');
});

test('chat: a failed reply shows an error and Retry recovers', async ({ page }) => {
  await open(page, '?fail=1');
  await page.getByRole('button', { name: 'How much leave do I have?' }).click();
  const last = page.locator('#chat article.aui-chat__message--assistant').last();
  await expect(last.locator('.aui-chat__error')).toContainText('Something went wrong');
  await expect(last).not.toContainText('simulated outage');
  await last.getByRole('button', { name: 'Retry' }).click();
  await expect(last.locator('.aui-chat__error')).toHaveCount(0);
  await expect(last).toContainText('12 days');
});

test('chat: keyboard reaches feedback; toggles are exclusive and reported', async ({ page }) => {
  await open(page);
  const answer = page.locator('#chat article.aui-chat__message--assistant').first();
  const up = answer.getByRole('button', { name: 'Good response' });
  await up.focus();
  await page.keyboard.press('Enter');
  await expect(up).toHaveAttribute('aria-pressed', 'true');
  await page.keyboard.press('Tab');
  await expect(answer.getByRole('button', { name: 'Bad response' })).toBeFocused();
  await page.keyboard.press('Space');
  await expect(up).toHaveAttribute('aria-pressed', 'false');
  await expect(page.locator('#chat-log')).toHaveText('feedback: down');
});

test('chat: scrolling up shows Jump to latest, which returns and focuses the newest message', async ({ page }) => {
  await open(page);
  const log = page.getByRole('log', { name: 'Support transcript' });
  await log.evaluate((el) => {
    el.scrollTop = 0;
  });
  const jump = page.locator('#transcript .aui-chat__jump');
  await expect(jump).toBeVisible();
  await jump.click();
  await expect(jump).toBeHidden();
  await expect(page.locator('#transcript article').last()).toBeFocused();
  await expect(page.locator('#transcript .aui-chat__typing')).toHaveText('Grace Hopper is typing');
});

test('prompt input: slash commands by keyboard; Shift+Enter adds a line; Enter sends', async ({ page }) => {
  await open(page);
  const field = page.getByRole('textbox', { name: 'Note to the team' });
  await field.click();
  await page.keyboard.type('/re');
  const listbox = page.locator('#prompt [role="listbox"]');
  await expect(listbox.getByRole('option')).toHaveCount(1);
  await page.keyboard.press('Enter');
  await expect(field).toHaveValue('/remind ');
  await page.keyboard.type('@gr');
  await page.keyboard.press('Tab');
  await expect(field).toHaveValue('/remind @Grace Hopper ');
  await page.keyboard.press('Shift+Enter');
  await page.keyboard.type('tomorrow');
  await page.keyboard.press('Enter');
  await expect(page.locator('#prompt-log')).toHaveText('/remind @Grace Hopper \ntomorrow');
  await expect(field).toHaveValue('');
});

test('prompt input: attachments by file chooser with a removable chip', async ({ page }) => {
  await open(page);
  const chooser = page.waitForEvent('filechooser');
  await page.locator('#prompt').getByRole('button', { name: 'Attach files' }).click();
  await (await chooser).setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  const remove = page.getByRole('button', { name: 'Remove notes.txt' });
  await expect(remove).toBeVisible();
  await remove.click();
  await expect(remove).toHaveCount(0);
  await expect(page.getByRole('textbox', { name: 'Note to the team' })).toBeFocused();
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`r20-p5: axe (WCAG 2.2 AA) in ${theme}`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    expect(await axe(page)).toEqual([]);
  });
}

test('r20-p5: axe with an open suggestions popup and an error message', async ({ page }) => {
  await open(page, '?fail=1');
  await page.getByRole('button', { name: 'Where is my payslip?' }).click();
  await expect(page.locator('#chat .aui-chat__error')).toBeVisible();
  await page.getByRole('textbox', { name: 'Note to the team' }).click();
  await page.keyboard.type('/');
  await expect(page.locator('#prompt [role="listbox"]')).toBeVisible();
  expect(await axe(page)).toEqual([]);
});
