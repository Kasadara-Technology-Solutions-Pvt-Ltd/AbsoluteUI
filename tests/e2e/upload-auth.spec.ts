import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { settled } from './settle.js';

// R2 upload and authentication UI page (SPEC section 18.16, section 18.22) under the strict CSP harness.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
    __harness: {
      progress(name: string, loaded: number): void;
      resolve(name: string): void;
      reject(name: string): void;
      aborted(name: string): boolean;
    };
  }
}

// 1x1 PNG, so the preview renders a real image.
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
const txt = (name: string, size = 1200): { name: string; mimeType: string; buffer: Buffer } => ({ name, mimeType: 'text/plain', buffer: Buffer.alloc(size, 97) });

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
  await page.goto(`/upload-auth${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page): Promise<string[]> {
  await settled(page);
  const result = await wcagAxe(page).analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

/** Queue three files and drive them into done, uploading (40%), and failed states. */
async function queueStates(page: Page): Promise<void> {
  await page.locator('#upload input[type="file"]').setInputFiles([
    { name: 'photo.png', mimeType: 'image/png', buffer: PNG },
    txt('notes.txt'),
    txt('report-final.pdf', 2_400),
  ]);
  const queue = page.locator('#queue');
  await expect(queue.getByRole('progressbar')).toHaveCount(3);
  await page.evaluate(() => {
    window.__harness.resolve('photo.png');
    window.__harness.progress('notes.txt', 480);
  });
  await expect(queue.getByRole('progressbar', { name: 'report-final.pdf' })).toHaveAttribute('aria-describedby', /.+/);
  await page.evaluate(() => {
    window.__harness.reject('report-final.pdf');
  });
  await expect(queue.locator('[data-status="failed"]')).toHaveCount(1);
  await expect(queue.getByRole('progressbar', { name: 'notes.txt' })).toHaveAttribute('aria-valuenow', '40');
}

/** Drop files on the zone the way a browser does (a DataTransfer on dragenter/dragover/drop). */
async function dropFiles(page: Page, files: { name: string; type: string; size: number }[]): Promise<void> {
  await page.locator('#upload .aui-file-upload__zone').evaluate((zone, list) => {
    const dt = new DataTransfer();
    for (const f of list) dt.items.add(new File([new Uint8Array(f.size)], f.name, { type: f.type }));
    for (const type of ['dragenter', 'dragover', 'drop']) zone.dispatchEvent(new DragEvent(type, { dataTransfer: dt, bubbles: true, cancelable: true }));
  }, files);
}

test.describe('upload-auth: CSP and Trusted Types', () => {
  test('no violations or errors while exercising every component (incl. blob: previews)', async ({ page }) => {
    const errors = await open(page);
    await queueStates(page);
    await expect(page.locator('#queue img')).toHaveCount(1);
    expect(await page.locator('#queue img').evaluate((img: HTMLImageElement) => img.complete && img.naturalWidth > 0)).toBe(true);
    await dropFiles(page, [{ name: 'setup.exe', type: 'application/x-msdownload', size: 10 }]);
    await page.locator('#new-password input').fill('abcDEF123456');
    await page.locator('#code input').fill('123456');
    await page.getByRole('button', { name: 'Show session warning' }).click();
    await page.getByRole('button', { name: 'Stay signed in' }).click();
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`upload-auth axe WCAG 2.2 AA: ${theme} (queue states, rejection, strength, errors)`, async ({ page }) => {
    await open(page, `?theme=${theme}`);
    await queueStates(page);
    await dropFiles(page, [{ name: 'setup.exe', type: 'application/x-msdownload', size: 10 }]);
    await page.locator('#new-password input').fill('abcDEF12');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#sign-in-result')).toHaveText('invalid');
    expect(await axe(page)).toEqual([]);
  });
}

test('upload-auth axe WCAG 2.2 AA: session warning dialog open', async ({ page }) => {
  await open(page);
  await page.getByRole('button', { name: 'Show session warning' }).click();
  await expect(page.getByRole('alertdialog', { name: 'Your session is about to expire' })).toBeVisible();
  expect(await axe(page)).toEqual([]);
});

test.describe('upload-auth: keyboard and behavior', () => {
  test('file upload: keyboard opens the chooser; queue actions keep focus in the row', async ({ page }) => {
    await open(page);
    const chooser = page.getByRole('button', { name: 'Attachments Choose files' });
    await chooser.focus();
    const [fileChooser] = await Promise.all([page.waitForEvent('filechooser'), page.keyboard.press('Enter')]);
    expect(fileChooser.isMultiple()).toBe(true);
    await fileChooser.setFiles([txt('a.txt'), txt('b.txt')]);
    const queue = page.locator('#queue');
    await expect(queue.getByRole('progressbar')).toHaveCount(2);
    await expect(page.locator('#queue .aui-upload-queue__summary')).toHaveText('0 of 2 uploaded');
    const cancel = queue.getByRole('button', { name: 'Cancel upload of a.txt' });
    await cancel.focus();
    await page.keyboard.press('Enter');
    await expect(queue.getByRole('button', { name: 'Retry upload of a.txt' })).toBeFocused();
    expect(await page.evaluate(() => window.__harness.aborted('a.txt'))).toBe(true);
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText('Upload of a.txt cancelled.');
    await page.keyboard.press('Tab');
    await expect(queue.getByRole('button', { name: 'Remove a.txt' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(queue.getByRole('button', { name: 'Cancel upload of b.txt' })).toBeFocused();
    await page.evaluate(() => {
      window.__harness.resolve('b.txt');
    });
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText('b.txt uploaded.');
  });

  test('file upload: drop is optional; rejected files are listed and announced, never trusted by name', async ({ page }) => {
    await open(page);
    await dropFiles(page, [
      { name: 'setup.exe', type: 'application/x-msdownload', size: 10 },
      { name: 'huge.pdf', type: 'application/pdf', size: 2_000_000 },
    ]);
    const rejections = page.locator('#upload .aui-file-upload__rejections li');
    await expect(rejections).toHaveText(['setup.exe: This file type is not allowed.', 'huge.pdf: The file is larger than 1 MB.']);
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText('2 files were not added.');
    await expect(page.getByRole('button', { name: 'Attachments Choose files' })).toBeFocused();
  });

  test('password input: toggle by keyboard with aria-pressed; value never announced', async ({ page }) => {
    await open(page);
    // Password inputs have no ARIA role; locate them by their field host.
    const input = page.locator('#password input');
    await input.fill('hunter2hunter2');
    await page.keyboard.press('Tab');
    const toggle = page.locator('#password').getByRole('button', { name: 'Show password' });
    await expect(toggle).toBeFocused();
    await expect(toggle).toHaveAttribute('aria-pressed', 'false');
    await page.keyboard.press('Space');
    await expect(toggle).toHaveAttribute('aria-pressed', 'true');
    await expect(input).toHaveAttribute('type', 'text');
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText('Password shown');
    await page.keyboard.press('Enter');
    await expect(input).toHaveAttribute('type', 'password');
    expect(await page.locator('[data-aui-live-region]').allTextContents()).not.toContain('hunter2hunter2');
  });

  test('OTP input: one labelled field, digits only, paste distributes, and the sign-in form validates', async ({ page }) => {
    await open(page);
    const otp = page.getByRole('textbox', { name: 'Verification code' });
    await expect(otp).toHaveAttribute('autocomplete', 'one-time-code');
    await expect(otp).toHaveAttribute('inputmode', 'numeric');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#sign-in-result')).toHaveText('invalid');
    await expect(page.locator('#password input')).toBeFocused();
    await otp.focus();
    await page.keyboard.type('12a3');
    await expect(otp).toHaveValue('123');
    await expect(page.locator('#code .aui-otp-input__cell--active')).toHaveCount(1);
    await otp.evaluate((el) => {
      const data = new DataTransfer();
      data.setData('text', '987 654');
      const event = new ClipboardEvent('paste', { clipboardData: data, bubbles: true, cancelable: true });
      // Firefox ignores clipboardData in the constructor of a synthetic event.
      Object.defineProperty(event, 'clipboardData', { value: data });
      el.dispatchEvent(event);
    });
    await expect(otp).toHaveValue('987654');
    await expect(page.locator('#code .aui-otp-input__cell')).toHaveText(['9', '8', '7', '6', '5', '4']);
    await page.locator('#password input').fill('secret-password');
    await page.getByRole('button', { name: 'Sign in' }).click();
    await expect(page.locator('#sign-in-result')).toHaveText('submitted');
  });

  test('strength meter follows the new password and announces after a pause', async ({ page }) => {
    await open(page);
    await page.locator('#new-password input').pressSequentially('abcDEF123456');
    await expect(page.locator('#strength .aui-password-strength-meter__rating')).toHaveText('Good');
    await expect(page.locator('#strength li')).toHaveText([/met$/, /met$/, /met$/, /met$/]);
    await expect(page.locator('[data-aui-live-region="polite"]')).toHaveText('Password strength: Good. 4 of 4 requirements met.');
    const describedBy = await page.locator('#new-password input').getAttribute('aria-describedby');
    expect(describedBy?.split(' ')).toContain(await page.locator('#strength .aui-password-strength-meter__body').getAttribute('id'));
  });

  test('session warning: focus, Escape extends, Sign out, focus restored', async ({ page }) => {
    await open(page);
    const trigger = page.getByRole('button', { name: 'Show session warning' });
    await trigger.focus();
    await page.keyboard.press('Enter');
    const dialog = page.getByRole('alertdialog', { name: 'Your session is about to expire' });
    await expect(dialog).toBeVisible();
    await expect(dialog.getByRole('button', { name: 'Stay signed in' })).toBeFocused();
    await expect(dialog.locator('.aui-session-warning__countdown')).toHaveText(/^Time remaining: 2 minutes/);
    await page.keyboard.press('Escape');
    await expect(dialog).toBeHidden();
    await expect(page.locator('#session-result')).toHaveText('extended');
    await expect(trigger).toBeFocused();
    await page.keyboard.press('Enter');
    await page.keyboard.press('Tab');
    await expect(dialog.getByRole('button', { name: 'Sign out' })).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#session-result')).toHaveText('signed out');
  });

  test('reflows at 320 CSS px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await page.setViewportSize({ width: 320, height: 640 });
    await open(page);
    await queueStates(page);
    await dropFiles(page, [{ name: 'a-very-long-file-name-without-spaces-that-must-wrap.exe', type: '', size: 1 }]);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('RTL: actions sit at the inline end; OTP cells stay left-to-right', async ({ page }) => {
    await open(page, '?dir=rtl');
    await queueStates(page);
    const row = await page.locator('#queue .aui-upload-queue__item').first().boundingBox();
    const actions = await page.locator('#queue .aui-upload-queue__actions').first().boundingBox();
    expect(actions!.x).toBeLessThan(row!.x + row!.width / 2);
    await page.locator('#code input').fill('123');
    const cells = page.locator('#code .aui-otp-input__cell');
    const first = await cells.nth(0).boundingBox();
    const second = await cells.nth(1).boundingBox();
    expect(first!.x).toBeLessThan(second!.x);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
  });

  test('forced colors keep the drop zone, OTP cells, and strength segments visible', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    for (const selector of ['#upload .aui-file-upload__zone', '#code .aui-otp-input__cell', '#strength .aui-password-strength-meter__segment']) {
      const border = await page.locator(selector).first().evaluate((el) => {
        const s = getComputedStyle(el);
        return { style: s.borderTopStyle, width: parseFloat(s.borderTopWidth) };
      });
      expect(border.style, selector).not.toBe('none');
      expect(border.width, selector).toBeGreaterThan(0);
    }
  });

  test('reduced motion removes transitions', async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page);
    const durations = await page.evaluate(() =>
      ['.aui-file-upload__zone', '.aui-otp-input__cell', '.aui-password-strength-meter__segment'].map((s) => getComputedStyle(document.querySelector(s)!).transitionDuration),
    );
    expect(durations.every((d) => d === '0s')).toBe(true);
  });
});

for (const theme of ['absolute-default', 'absolute-dark', 'absolute-high-contrast']) {
  test(`visual upload-auth: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await page.setViewportSize({ width: 900, height: 1700 });
    await open(page, `?theme=${theme}`);
    await queueStates(page);
    await dropFiles(page, [{ name: 'setup.exe', type: 'application/x-msdownload', size: 10 }]);
    await page.locator('#new-password input').fill('abcDEF12');
    await page.locator('#code input').fill('123');
    await page.locator('#code input').blur();
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-upload-auth.png`);
  });
}
