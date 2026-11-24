import { test, expect, type Page } from '@playwright/test';
import { wcagAxe } from './browsers.js';
import { readFileSync } from 'node:fs';

// SPEC section 10: the Theme Designer app (apps/theme-designer) under a strict CSP with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __clarityLoaded?: boolean;
  }
}

// Clarity is stubbed: the tag script adds a second script by assigning a plain string to
// script.src, as the real loader does, which needs the designer's narrow default Trusted Types policy.
const CLARITY_TAG = "const s = document.createElement('script'); s.async = true; s.src = 'https://scripts.clarity.ms/stub/clarity.js'; document.head.append(s);";
async function stubClarity(page: Page): Promise<string[]> {
  const requests: string[] = [];
  await page.route(/^https:\/\/([a-z]+\.)?clarity\.ms\//, (route) => {
    const url = route.request().url();
    requests.push(url);
    if (url.startsWith('https://www.clarity.ms/tag/')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: CLARITY_TAG });
    if (url.startsWith('https://scripts.clarity.ms/')) return route.fulfill({ status: 200, contentType: 'text/javascript', body: 'window.__clarityLoaded = true;' });
    return route.abort();
  });
  return requests;
}

const BASE = `http://127.0.0.1:${String(Number(process.env.DESIGNER_E2E_PORT ?? 4332))}`;

async function open(page: Page, width = 1600): Promise<string[]> {
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
    try {
      localStorage.clear();
    } catch {
      // Storage may be unavailable.
    }
  });
  // Web font hosts are stubbed: tests never depend on the network or send data to them.
  await page.route(/^https:\/\/fonts\.(googleapis\.com|gstatic\.com|bunny\.net)\//, (route) => route.fulfill({ status: 200, contentType: 'text/css', body: '/* stub */' }));
  await page.setViewportSize({ width, height: 1000 });
  // The load event waits for the preview frame; readiness is signalled by the flags below.
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  await page.waitForFunction(() => document.documentElement.dataset.designerReady === 'true');
  // The preview frames load lazily: on narrow viewports the first one starts below the fold, and
  // Firefox and WebKit load it only once it is near the viewport.
  await page.locator('iframe').first().scrollIntoViewIfNeeded();
  // The frame renders every component preview (about 90 since R20, a 1.5 MB bundle and 3,800
  // elements) before it reports ready, which takes longer than the default 5 s expect timeout
  // when the suite runs in parallel.
  await expect(page.locator('iframe').first().contentFrame().locator('html[data-preview-ready="true"]')).toHaveCount(1, { timeout: 20_000 });
  return errors;
}

const badge = (page: Page) => page.locator('#status-badge');
const frameVar = (page: Page, name: string) =>
  page.evaluate((n) => {
    const doc = document.querySelector('iframe')?.contentDocument;
    return doc ? getComputedStyle(doc.documentElement).getPropertyValue(n).trim() : '';
  }, name);

async function editToken(page: Page, token: string, value: string): Promise<void> {
  const input = page.locator(`.td-editor [data-token="${token}"] input[type="text"]`);
  await input.fill(value);
  await input.press('Tab');
}

async function openGroup(page: Page, title: RegExp): Promise<void> {
  await page.locator('#editor').getByRole('button', { name: title }).click();
}

test.describe('theme designer', () => {
  // The preview frame (about 90 component previews since R20, 78 requests) shares the page's
  // process; in Firefox its load alone takes about 7 s, so the default 30 s is too tight in parallel runs.
  test.describe.configure({ timeout: 60_000 });
  test('loads under CSP and Trusted Types, previews the built-in family, and meets the baseline', async ({ page }) => {
    const errors = await open(page);
    await expect(badge(page)).toHaveText('Meets baseline');
    expect(await frameVar(page, '--aui-color-primary')).toBe('#1E40AF');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
  });

  test('axe WCAG 2.2 AA on the designer and the preview frame', async ({ page }) => {
    // axe over the whole preview frame (every component, about 3,800 elements) takes 15-25 s.
    test.slow();
    await open(page);
    const result = await wcagAxe(page).analyze();
    expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
  });

  for (const mode of ['Dark', 'High contrast'] as const) {
    test(`axe WCAG 2.2 AA on the preview frame in ${mode}`, async ({ page }) => {
      test.slow();
      await open(page);
      await page.getByRole('combobox', { name: 'Mode' }).click();
      await page.getByRole('option', { name: mode }).click();
      await expect.poll(() => page.evaluate(() => document.querySelector('iframe')?.contentDocument?.documentElement.dataset.auiTheme)).toMatch(/-(dark|high-contrast)$/);
      const result = await wcagAxe(page).include('iframe').analyze();
      expect(result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`)).toEqual([]);
    });
  }

  test('a token edit updates the preview and compliance; undo restores it (SPEC section 10.3-§10.5)', async ({ page }) => {
    await open(page);
    await openGroup(page, /^Colors/);
    await editToken(page, 'color-primary', '#93C5FD');
    await expect(badge(page)).toHaveText('Not compliant');
    await expect.poll(() => frameVar(page, '--aui-color-primary')).toBe('#93C5FD');
    const finding = page.locator('.td-finding').filter({ hasText: 'color-on-primary on color-primary' }).first();
    await expect(finding).toContainText('WCAG 2.2 1.4.3');
    await expect(finding).toContainText('needs 4.5:1');
    await expect(finding).toContainText('button');
    await expect(page.locator('.td-disclosure')).toContainText('not compliant');
    await page.getByRole('button', { name: 'Undo (Ctrl+Z)' }).click();
    await expect(badge(page)).toHaveText('Meets baseline');
    await expect.poll(() => frameVar(page, '--aui-color-primary')).toBe('#1E40AF');
  });

  test('rejects unsafe values without applying them', async ({ page }) => {
    await open(page);
    await openGroup(page, /^Colors/);
    await editToken(page, 'color-text', 'red; background: url(x)');
    await expect(page.locator('.td-editor [data-token="color-text"]')).toContainText('url(), braces, and semicolons are not allowed');
    expect(await frameVar(page, '--aui-color-text')).toBe('#0F172A');
  });

  test('web fonts: Noto Sans by default, add a Bunny font, preview loads it (SPEC section 10.1)', async ({ page }) => {
    await open(page);
    const links = () => page.evaluate(() => [...(document.querySelector('iframe')?.contentDocument?.querySelectorAll('link[rel="stylesheet"][href^="https://"]') ?? [])].map((l) => l.getAttribute('href')));
    await expect.poll(links).toEqual([expect.stringContaining('https://fonts.googleapis.com/css2?family=Noto+Sans')]);
    await openGroup(page, /^Typography: font stacks/);
    await page.getByRole('textbox', { name: 'Stylesheet URL' }).fill('https://fonts.bunny.net/css?family=inter:400,600');
    await page.getByRole('textbox', { name: 'Font family' }).fill('Inter');
    await page.getByRole('button', { name: 'Add font' }).click();
    await expect(page.locator('.td-list').filter({ hasText: 'Inter | Bunny Fonts' })).toHaveCount(1);
    await expect.poll(() => frameVar(page, '--aui-font-family-sans')).toMatch(/^"Inter", "Noto Sans"/);
    await expect.poll(links).toContain('https://fonts.bunny.net/css?family=inter:400,600');
    await page.getByRole('textbox', { name: 'Stylesheet URL' }).fill('http://insecure.example/a.css');
    await page.getByRole('textbox', { name: 'Font family' }).fill('Bad');
    await page.getByRole('button', { name: 'Add font' }).click();
    await expect(page.locator('.td-editor')).toContainText('an https URL without quotes, spaces, or backslashes');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
  });

  test('a finding opens the token it names', async ({ page }) => {
    await open(page);
    await openGroup(page, /^Colors/);
    await editToken(page, 'color-border-strong', '#E2E8F0');
    await expect(badge(page)).toHaveText('Not compliant');
    await page.locator('#compliance').getByRole('button', { name: 'Edit color-border-strong' }).first().click();
    await expect(page.locator('.td-editor [data-token="color-border-strong"] input[type="text"]')).toBeFocused();
  });

  test('component overrides apply to one component (SPEC section 10.2)', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Components' }).click();
    const input = page.locator('.td-editor [data-token="button-radius"] input[type="text"]');
    await input.fill('12px');
    await input.press('Tab');
    await expect.poll(() => page.evaluate(() => {
      const b = document.querySelector('iframe')?.contentDocument?.querySelector('.aui-button');
      return b ? getComputedStyle(b).borderTopLeftRadius : '';
    })).toBe('12px');
    expect(await page.evaluate(() => {
      const c = document.querySelector('iframe')?.contentDocument?.querySelector('.aui-select__combobox');
      return c ? getComputedStyle(c).borderTopLeftRadius : '';
    })).toBe('6px');
  });

  test('seeds re-derive colors and the result meets the baseline', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Seeds' }).click();
    await page.getByRole('button', { name: 'Derive every color from the seeds' }).click();
    await expect(badge(page)).toHaveText('Meets baseline');
    const seed = page.locator('.td-editor [data-token="primary"] input[type="text"]');
    await seed.fill('#DB2777');
    await seed.press('Tab');
    await expect.poll(() => frameVar(page, '--aui-color-primary')).not.toBe('#1E40AF');
    await expect(badge(page)).toHaveText('Meets baseline');
  });

  test('preview modes, densities, and the matrix view (no viewport option)', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('combobox', { name: 'Viewport' })).toHaveCount(0);
    await page.getByRole('combobox', { name: 'Mode' }).click();
    await page.getByRole('option', { name: 'Dark' }).click();
    await expect.poll(() => page.evaluate(() => document.querySelector('iframe')?.contentDocument?.documentElement.dataset.auiTheme)).toBe('absolute-default-dark');
    await page.getByRole('combobox', { name: 'Density' }).click();
    await page.getByRole('option', { name: 'Compact' }).click();
    await expect.poll(() => page.evaluate(() => document.querySelector('iframe')?.contentDocument?.documentElement.dataset.auiDensity)).toBe('compact');
    await page.getByRole('switch', { name: 'All modes and densities' }).check();
    await expect(page.locator('iframe')).toHaveCount(9);
    await expect(page.locator('iframe').nth(8)).toHaveAttribute('title', /High contrast, Spacious/);
  });

  test('exports the package and re-imports the theme JSON (SPEC section 10.6, section 10.7)', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Files' }).click();
    const [zip] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download package (.zip)' }).click()]);
    expect(zip.suggestedFilename()).toBe('absolute-default-1.0.0.zip');
    const bytes = readFileSync(await zip.path());
    expect(bytes.subarray(0, 4)).toEqual(Buffer.from([0x50, 0x4b, 0x03, 0x04]));
    const [json] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Theme JSON' }).click()]);
    const text = readFileSync(await json.path(), 'utf8');
    const edited = text.replace('"name": "absolute-default"', '"name": "acme"');
    await page.locator('#import-file').setInputFiles({ name: 'acme.theme.json', mimeType: 'application/json', buffer: Buffer.from(edited) });
    await expect(page.locator('#family-title')).toHaveText('acme 1.0.0');
    await expect.poll(() => page.evaluate(() => document.querySelector('iframe')?.contentDocument?.documentElement.dataset.auiTheme)).toBe('acme');
  });

  test('lists every problem of an invalid import with its path', async ({ page }) => {
    await open(page);
    await page.getByRole('tab', { name: 'Files' }).click();
    const bad = JSON.stringify({ schemaVersion: 2, name: 'Bad Name', version: 'x', modes: {} });
    await page.locator('#import-file').setInputFiles({ name: 'bad.json', mimeType: 'application/json', buffer: Buffer.from(bad) });
    const alert = page.locator('.aui-alert').filter({ hasText: 'Not imported' });
    await expect(alert).toContainText('name:');
    await expect(alert).toContainText('version:');
    await expect(alert).toContainText('modes.light');
    await expect(page.locator('#family-title')).toHaveText('absolute-default 1.0.0');
  });

  test('analytics: nothing from Clarity before consent; Accept loads it under Trusted Types', async ({ page }) => {
    const requests = await stubClarity(page);
    const errors = await open(page);
    const consent = page.getByRole('region', { name: 'Analytics consent' });
    await expect(consent).toBeVisible();
    expect(requests).toEqual([]);
    await consent.getByRole('button', { name: 'Accept analytics' }).click();
    await expect(consent).toHaveCount(0);
    await page.waitForFunction(() => window.__clarityLoaded === true);
    expect(requests).toEqual(['https://www.clarity.ms/tag/z3l6x2l3z2', 'https://scripts.clarity.ms/stub/clarity.js']);
    expect(await page.evaluate(() => localStorage.getItem('aui-site-analytics-consent'))).toBe('granted');
    expect(await page.evaluate(() => window.__csp)).toEqual([]);
    expect(errors).toEqual([]);
    // The default policy accepts Clarity script URLs only; any other script URL stays blocked.
    const other = await page.evaluate(() => {
      try {
        document.createElement('script').src = 'https://example.com/x.js';
        return 'allowed';
      } catch {
        return 'blocked';
      }
    });
    expect(other).toBe('blocked');
  });

  test('analytics: Decline loads nothing; the footer control asks again', async ({ page }) => {
    const requests = await stubClarity(page);
    await open(page);
    await page.getByRole('region', { name: 'Analytics consent' }).getByRole('button', { name: 'Decline' }).click();
    await expect(page.getByRole('region', { name: 'Analytics consent' })).toHaveCount(0);
    expect(await page.evaluate(() => localStorage.getItem('aui-site-analytics-consent'))).toBe('denied');
    await page.getByRole('button', { name: 'Cookie settings' }).click();
    await page.waitForFunction(() => document.documentElement.dataset.designerReady === 'true');
    await expect(page.getByRole('region', { name: 'Analytics consent' })).toBeVisible();
    expect(requests).toEqual([]);
  });

  test('reflows at 320px without horizontal scrolling (WCAG 1.4.10)', async ({ page }) => {
    await open(page, 320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth)).toBe(true);
  });

  test('keyboard: undo and redo shortcuts outside text fields', async ({ page }) => {
    await open(page);
    await openGroup(page, /^Colors/);
    await editToken(page, 'color-link', '#1D4ED8');
    await expect.poll(() => frameVar(page, '--aui-color-link')).toBe('#1D4ED8');
    await page.getByRole('button', { name: 'Start over from the built-in theme' }).focus();
    await page.keyboard.press('Control+z');
    await expect.poll(() => frameVar(page, '--aui-color-link')).toBe('#2563EB');
    await page.keyboard.press('Control+y');
    await expect.poll(() => frameVar(page, '--aui-color-link')).toBe('#1D4ED8');
  });
});
