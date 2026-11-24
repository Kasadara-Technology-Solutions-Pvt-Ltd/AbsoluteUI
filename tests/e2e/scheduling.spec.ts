import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, mod } from './browsers.js';
import { settled } from './settle.js';

// R3 phase 3a scheduling page (Scheduler, Schedule Picker, Recurrence Picker, Business Calendar)
// under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

interface SchedulingWindow {
  __aui: { scheduler: { events: { id: string; start: { epochMilliseconds?: number }; end: { epochMilliseconds?: number }; seriesId?: string; resourceId?: string }[]; view: string } };
}

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

async function open(page: Page, query = '', width = 1400): Promise<string[]> {
  const errors: string[] = [];
  // The page derives "today" (business calendar marker, recurrence previews) from the clock;
  // pin it to the date the expectations and snapshots were written for.
  await page.clock.setFixedTime(new Date('2026-09-29T10:00:00Z'));
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
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/scheduling${query}`);
  await page.waitForFunction(() => window.__auiReady === true);
  return errors;
}

async function axe(page: Page, include?: string): Promise<string[]> {
  await settled(page);
  const builder = wcagAxe(page);
  if (include) builder.include(include);
  const result = await builder.analyze();
  return result.violations.map((v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`);
}

const event = (page: Page, key: string) => page.locator(`#scheduler button.aui-scheduler__event[data-aui-key="${key}"]`);
const cell = (page: Page, label: string) => page.locator(`#scheduler td[aria-label^="${label}"]`).first();
const eventStart = (page: Page, id: string) => page.evaluate((i) => (window as unknown as SchedulingWindow).__aui.scheduler.events.find((e) => e.id === i)?.start.epochMilliseconds, id);
const standupKey = (iso: string): string => `standup@${String(Date.parse(iso))}`;

test('scheduling: no CSP violations or errors while navigating, editing, dragging, and using the pickers', async ({ page }) => {
  const errors = await open(page, '?edit=1');
  await page.getByRole('button', { name: 'Next week' }).click();
  await page.getByRole('button', { name: 'Previous week' }).click();
  await event(page, 'review').click();
  await page.keyboard.press(`${await mod(page)}+x`);
  await page.keyboard.press('Escape');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press(`${await mod(page)}+v`);
  await event(page, 'lunch').dragTo(cell(page, 'Wednesday 30 September, 14:00'));
  await event(page, standupKey('2026-10-01T08:00:00Z')).focus();
  await page.keyboard.press('Shift+ArrowDown');
  await page.getByRole('button', { name: 'This event' }).click();
  for (const name of ['Month', 'Agenda', 'Timeline', 'Day', 'Work week', 'Week']) await page.locator('.aui-scheduler__views').getByRole('button', { name, exact: true }).click();
  await page.locator('#schedule .aui-schedule-picker__checkbox').check();
  await page.locator('#schedule .aui-schedule-picker__checkbox').uncheck();
  await page.locator('#recurrence .aui-recurrence-picker__frequency').selectOption('weekly');
  await page.locator('#business td[aria-label^="Monday, 5 October 2026"]').click();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`scheduling axe WCAG 2.2 AA: ${theme} (week view editable, an event focused, pickers, business calendar)`, async ({ page }) => {
    await open(page, `?edit=1&theme=${theme}`);
    await event(page, 'review').focus();
    await page.keyboard.press(`${await mod(page)}+x`);
    expect(await axe(page)).toEqual([]);
  });
}

for (const view of ['month', 'agenda', 'timeline', 'day']) {
  test(`scheduling axe WCAG 2.2 AA: ${view} view`, async ({ page }) => {
    await open(page, `?view=${view}`);
    expect(await axe(page, '#scheduler')).toEqual([]);
  });
}

test.describe('scheduler: behavior', () => {
  test('grid semantics, one tab stop, and keyboard movement into events', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('grid', { name: 'Team calendar, 28 Sept – 4 Oct 2026' });
    await expect(grid).toBeVisible();
    await page.locator('.aui-scheduler__views').getByRole('button', { name: 'Timeline' }).focus();
    await page.keyboard.press('Tab');
    await expect(page.locator('#scheduler td[tabindex="0"]')).toBeFocused();
    await expect(page.locator('#scheduler [tabindex="0"]')).toHaveCount(1);
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Tuesday 29 September, 08:00 to 08:30, non-working time');
    for (let i = 0; i < 4; i++) await page.keyboard.press('ArrowDown');
    await page.keyboard.press('Enter');
    await expect(event(page, 'review')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-event')).toHaveText('event-activate review');
    await page.keyboard.press('Escape');
    await page.keyboard.press('PageDown');
    await expect(page.locator('.aui-scheduler__title')).toHaveText(/^5\s?–\s?11 Oct 2026$/);
  });

  test('edit mode: dragging moves an event; Ctrl+Z undoes', async ({ page }) => {
    await open(page, '?edit=1');
    const before = await eventStart(page, 'lunch');
    // Grabbed at its top edge: the start lands where the pointer is dropped.
    await event(page, 'lunch').dragTo(cell(page, 'Thursday 1 October, 15:00'), { sourcePosition: { x: 10, y: 3 }, targetPosition: { x: 10, y: 4 } });
    expect(await eventStart(page, 'lunch')).toBe(Date.parse('2026-10-01T14:00:00Z'));
    await expect(page.locator('#last-event')).toHaveText('event-change move occurrence lunch');
    await event(page, 'lunch').focus();
    await page.keyboard.press(`${await mod(page)}+z`);
    expect(await eventStart(page, 'lunch')).toBe(before);
  });

  test('edit mode: the resize handle and Shift+Arrow change the end; read-only events stay', async ({ page }) => {
    await open(page, '?edit=1');
    const handle = event(page, 'interview').locator('.aui-scheduler__resize');
    const box = (await handle.boundingBox())!;
    const target = (await cell(page, 'Tuesday 29 September, 11:30').boundingBox())!;
    await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + box.width / 2, target.y + 2, { steps: 6 });
    await page.mouse.up();
    const end = await page.evaluate(() => (window as unknown as SchedulingWindow).__aui.scheduler.events.find((e) => e.id === 'interview')?.end.epochMilliseconds);
    expect(end).toBe(Date.parse('2026-09-29T10:30:00Z'));
    await event(page, 'deploy').focus();
    await page.keyboard.press('Shift+ArrowDown');
    expect(await page.evaluate(() => (window as unknown as SchedulingWindow).__aui.scheduler.events.find((e) => e.id === 'deploy')?.end.epochMilliseconds)).toBe(Date.parse('2026-10-01T14:00:00Z'));
  });

  test('recurring occurrence: the scope dialog creates an exception for "This event"', async ({ page }) => {
    await open(page, '?edit=1');
    await event(page, standupKey('2026-09-30T08:00:00Z')).focus();
    await page.keyboard.press(`${await mod(page)}+x`);
    await page.keyboard.press('Escape');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press(`${await mod(page)}+v`);
    const dialog = page.getByRole('dialog', { name: 'Change a recurring event' });
    await expect(dialog).toBeVisible();
    await dialog.getByRole('button', { name: 'This event' }).click();
    await expect(dialog).toBeHidden();
    const exceptions = await page.evaluate(() => (window as unknown as SchedulingWindow).__aui.scheduler.events.filter((e) => e.seriesId === 'standup').length);
    expect(exceptions).toBe(1);
  });

  test('toolbar Move / Move here moves with a single pointer', async ({ page }) => {
    await open(page, '?edit=1');
    await event(page, 'lunch').click();
    await page.getByRole('button', { name: 'Move', exact: true }).click();
    await cell(page, 'Friday 2 October, 09:00').click();
    await page.getByRole('button', { name: 'Move here' }).click();
    expect(await eventStart(page, 'lunch')).toBe(Date.parse('2026-10-02T08:00:00Z'));
  });

  test('Enter on an empty slot asks to create an event', async ({ page }) => {
    await open(page);
    await cell(page, 'Saturday 3 October, 15:00').click();
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-event')).toHaveText('slot-activate');
  });

  test('loadEvents: loading status, then events; failures offer Retry', async ({ page }) => {
    await open(page, '?load=1');
    await expect(event(page, 'review')).toBeVisible();
    await open(page, '?fail=1');
    await expect(page.locator('.aui-scheduler__status')).toContainText('Events could not be loaded.');
    await expect(page.getByRole('button', { name: 'Retry' })).toBeVisible();
    await expect(page.locator('#last-event')).toHaveText('load-error');
  });

  test('month view: bars, chips, and "+N more"; timeline rows per resource', async ({ page }) => {
    await open(page, '?view=month');
    await expect(page.getByRole('grid', { name: 'Team calendar, September 2026' })).toBeVisible();
    await expect(event(page, 'offsite')).toHaveClass(/aui-scheduler__event--bar/);
    await open(page, '?view=timeline');
    await expect(page.locator('#scheduler tbody th')).toHaveText(['Ada Lovelace', 'Room 4', 'Grace Hopper']);
    await expect(event(page, 'review')).toBeVisible();
  });

  test('reflow: at 320 px the page does not scroll sideways (the grid scrolls inside its body)', async ({ page }) => {
    await open(page, '', 320);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    const inner = await page.locator('.aui-scheduler__body').evaluate((el) => el.scrollWidth > el.clientWidth);
    expect(inner).toBe(true);
  });

  test('RTL: later days are to the left; ArrowLeft moves to the next day', async ({ page }) => {
    await open(page, '?dir=rtl');
    const tue = (await cell(page, 'Tuesday 29 September, 09:00').boundingBox())!;
    const wed = (await cell(page, 'Wednesday 30 September, 09:00').boundingBox())!;
    expect(wed.x).toBeLessThan(tue.x);
    await cell(page, 'Tuesday 29 September, 09:00').click();
    await page.keyboard.press('ArrowLeft');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', /^Wednesday 30 September, 09:00/);
  });

  test('forced colors: events are outlined', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    const border = await event(page, 'review').evaluate((el) => getComputedStyle(el).borderTopStyle);
    expect(border).toBe('solid');
  });
});

test.describe('pickers and business calendar: behavior', () => {
  test('schedule picker: moving the start keeps the duration; the form value is iCalendar text', async ({ page }) => {
    await open(page);
    const hour = page.locator('#schedule .aui-schedule-picker__part--start input').nth(3);
    await hour.click();
    await page.keyboard.press('ArrowUp');
    const value = await page.evaluate(() => new FormData(document.querySelector('form')!).get('when'));
    expect(value).toBe('DTSTART;TZID=Europe/London:20260929T100000\nDTEND;TZID=Europe/London:20260929T113000\nRRULE:FREQ=WEEKLY;BYDAY=TU');
  });

  test('recurrence picker: weekday toggles are pressed buttons and the summary is live', async ({ page }) => {
    await open(page);
    await page.locator('#recurrence .aui-recurrence-picker__frequency').selectOption('weekly');
    await page.locator('#recurrence').getByRole('button', { name: 'Friday' }).click();
    await expect(page.locator('#recurrence').getByRole('button', { name: 'Friday' })).toHaveAttribute('aria-pressed', 'true');
    await expect(page.locator('#recurrence .aui-recurrence-picker__summary')).toHaveText('Every week on Wednesday and Friday, 6 times');
  });

  test('business calendar: arrows move across months; Enter toggles in edit mode', async ({ page }) => {
    await open(page, '?edit=1');
    const today = page.locator('#business td[aria-current="date"]');
    await today.focus();
    await page.keyboard.press('ArrowDown');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Tuesday, 6 October 2026, working day');
    await page.keyboard.press('Enter');
    await expect(page.locator(':focus')).toHaveAttribute('aria-label', 'Tuesday, 6 October 2026, non-working day (changed)');
  });
});

for (const theme of THEMES) {
  test(`visual scheduling: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, `?theme=${theme}`);
    await page.locator('.aui-scheduler__body').evaluate((el) => {
      el.scrollTop = 0;
    });
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-scheduling.png`);
  });
}

test('visual scheduler month and timeline', async ({ page }) => {
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await open(page, '?view=month');
  await expect(page.locator('#scheduler')).toHaveScreenshot('scheduler-month.png');
  await open(page, '?view=timeline');
  await expect(page.locator('#scheduler')).toHaveScreenshot('scheduler-timeline.png');
});
