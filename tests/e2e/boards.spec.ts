import { test, expect, type Page } from '@playwright/test';
import { wcagAxe, mod } from './browsers.js';
import { settled } from './settle.js';

// R3 phase 3b boards page (Kanban, Gantt) under the strict CSP harness with Trusted Types.
declare global {
  interface Window {
    __csp: string[];
    __auiReady?: boolean;
  }
}

interface BoardsWindow {
  __aui: {
    kanban: { positionOf(id: string): { columnId: string; laneId: string | null; index: number } | null; columns: { id: string }[]; pending: string[] };
    gantt: { tasks: { id: string; start: { year: number; month: number; day: number }; duration: number }[]; dependencies: { from: string; to: string }[]; schedule: { tasks: Map<string, { start: { month: number; day: number } }> } };
  };
}

const THEMES = ['absolute-default', 'absolute-dark', 'absolute-high-contrast'];

async function open(page: Page, query = '', width = 1400): Promise<string[]> {
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
  await page.setViewportSize({ width, height: 1000 });
  await page.goto(`/boards${query}`);
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

const card = (page: Page, id: string) => page.locator(`#kanban [data-aui-card="${id}"]`);
const cell = (page: Page, column: string, lane = 'web') => page.locator(`#kanban .aui-kanban__cell[data-aui-column="${column}"][data-aui-lane="${lane}"]`);
const row = (page: Page, id: string) => page.locator(`#gantt [role="row"][data-aui-task="${id}"]`);
const bar = (page: Page, id: string) => page.locator(`#gantt .aui-gantt__bar[data-aui-task="${id}"] .aui-gantt__fill`);
const position = (page: Page, id: string) => page.evaluate((i) => (window as unknown as BoardsWindow).__aui.kanban.positionOf(i), id);
const taskStart = (page: Page, id: string) => page.evaluate((i) => {
  const s = (window as unknown as BoardsWindow).__aui.gantt.schedule.tasks.get(i)?.start;
  return s ? `${String(s.month)}-${String(s.day)}` : '';
}, id);

test('boards: no CSP violations or errors while moving cards, reordering, collapsing, editing and linking tasks', async ({ page }) => {
  const errors = await open(page, '?histogram=1');
  await card(page, 'k1').focus();
  await page.keyboard.press('Space');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('ArrowRight');
  await page.keyboard.press('Space');
  await card(page, 'k2').dragTo(cell(page, 'review'));
  await page.locator('#kanban [data-aui-column="todo"] .aui-kanban__column-toggle').click();
  await page.locator('#kanban [data-aui-column="todo"] .aui-kanban__column-toggle').click();
  await page.locator('#kanban [data-aui-lane="app"] .aui-kanban__lane-toggle').click();
  await row(page, 't3').focus();
  await page.keyboard.press('Control+ArrowRight');
  await page.keyboard.press('Shift+ArrowRight');
  await page.getByRole('button', { name: 'Link tasks' }).click();
  await row(page, 't6').focus();
  await page.keyboard.press('Enter');
  for (const name of ['Zoom out', 'Zoom out', 'Zoom in']) await page.getByRole('button', { name, exact: true }).click();
  expect(await page.evaluate(() => window.__csp)).toEqual([]);
  expect(errors).toEqual([]);
});

for (const theme of THEMES) {
  test(`boards axe WCAG 2.2 AA: ${theme} (a card picked up, a task focused, histogram)`, async ({ page }) => {
    await open(page, `?theme=${theme}&histogram=1`);
    await card(page, 'k3').focus();
    await page.keyboard.press('Space');
    await row(page, 't4').focus();
    expect(await axe(page)).toEqual([]);
  });
}

test('boards axe WCAG 2.2 AA: read-only board without swimlanes, month scale', async ({ page }) => {
  await open(page, '?edit=0&lanes=0&scale=month');
  expect(await axe(page)).toEqual([]);
});

test.describe('kanban: behavior', () => {
  test('headings, lists, WIP text, and one tab stop', async ({ page }) => {
    await open(page);
    await expect(page.getByRole('group', { name: 'Sprint 12', exact: true })).toBeVisible();
    await expect(page.locator('#kanban [role="heading"]').filter({ hasText: 'In progress' })).toContainText('3 of 2');
    await expect(page.locator('#kanban [data-aui-column="doing"] .aui-kanban__over')).toHaveText('Over limit');
    await expect(page.getByRole('list', { name: 'To do, Web' })).toBeVisible();
    await expect(page.locator('#kanban .aui-kanban__card[tabindex="0"]')).toHaveCount(1);
    await card(page, 'k1').focus();
    await page.keyboard.press('ArrowDown');
    await expect(card(page, 'k2')).toBeFocused();
    await page.keyboard.press('ArrowRight');
    await expect(card(page, 'k3')).toBeFocused();
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-board')).toHaveText('card-activate k3');
  });

  test('keyboard move across columns and swimlanes; Escape cancels', async ({ page }) => {
    await open(page);
    await card(page, 'k2').focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowDown');
    await expect(page.getByRole('list', { name: 'To do, Mobile app' }).locator('[data-aui-card="k2"]')).toBeVisible();
    await page.keyboard.press('Escape');
    expect(await position(page, 'k2')).toEqual({ columnId: 'todo', laneId: 'web', index: 1 });
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    await expect(page.locator('#last-board')).toHaveText('card-move k2 doing');
    expect(await position(page, 'k2')).toMatchObject({ columnId: 'doing', laneId: 'web' });
    await expect(card(page, 'k2')).toBeFocused();
  });

  test('pointer drag moves a card; a failed save rolls it back', async ({ page }) => {
    await open(page, '?fail=1');
    await card(page, 'k1').dragTo(cell(page, 'review'));
    expect((await position(page, 'k1'))?.columnId).toBe('review');
    await expect(page.locator('#last-board')).toHaveText('move-error k1');
    expect(await position(page, 'k1')).toEqual({ columnId: 'todo', laneId: 'web', index: 0 });
  });

  test('single pointer: Move card, then click the target', async ({ page }) => {
    await open(page);
    await card(page, 'k1').click();
    await page.getByRole('button', { name: 'Move card' }).click();
    await cell(page, 'review').click();
    expect((await position(page, 'k1'))?.columnId).toBe('review');
    await page.getByRole('button', { name: 'Undo move' }).click();
    expect((await position(page, 'k1'))?.columnId).toBe('todo');
  });

  test('locked columns refuse cards; columns reorder by keyboard', async ({ page }) => {
    await open(page);
    await card(page, 'k3').dragTo(cell(page, 'done'));
    expect((await position(page, 'k3'))?.columnId).toBe('doing');
    await page.getByRole('button', { name: 'Move column To do' }).focus();
    await page.keyboard.press('Space');
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('Space');
    expect(await page.evaluate(() => (window as unknown as BoardsWindow).__aui.kanban.columns.map((c) => c.id))).toEqual(['doing', 'todo', 'review', 'done']);
    await expect(page.getByRole('button', { name: 'Move column To do' })).toBeFocused();
  });

  test('reflow at 320 px: the board scrolls inside its container', async ({ page }) => {
    await open(page, '', 320);
    const overflow = await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth);
    expect(overflow).toBeLessThanOrEqual(0);
    expect(await page.locator('.aui-kanban__board').evaluate((el) => el.scrollWidth > el.clientWidth)).toBe(true);
  });

  test('RTL: ArrowLeft moves to the next column', async ({ page }) => {
    await open(page, '?dir=rtl');
    const todo = (await cell(page, 'todo').boundingBox())!;
    const doing = (await cell(page, 'doing').boundingBox())!;
    expect(doing.x).toBeLessThan(todo.x);
    await card(page, 'k1').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(card(page, 'k3')).toBeFocused();
  });
});

test.describe('gantt: behavior', () => {
  test('treegrid semantics, expand/collapse, and text for bars', async ({ page }) => {
    await open(page);
    const grid = page.getByRole('treegrid', { name: 'Website relaunch' });
    await expect(grid).toBeVisible();
    await expect(row(page, 't2')).toHaveAttribute('aria-level', '2');
    await expect(row(page, 't4').locator('.aui-gantt__cell--name')).toContainText('Critical');
    await expect(row(page, 't6').locator('.aui-gantt__cell--name')).toContainText('Dependency not met');
    await expect(row(page, 't2').locator('.aui-gantt__cell--name')).toContainText('2 working days ahead of baseline.');
    await row(page, 'p1').focus();
    await page.keyboard.press('ArrowLeft');
    await expect(row(page, 'p1')).toHaveAttribute('aria-expanded', 'false');
    await expect(row(page, 't1')).toHaveCount(0);
    await page.keyboard.press('ArrowRight');
    await page.keyboard.press('ArrowRight');
    await expect(row(page, 't1')).toBeFocused();
  });

  test('keyboard edits reschedule successors and announce; undo restores', async ({ page }) => {
    await open(page);
    const before = await taskStart(page, 't4');
    await row(page, 't3').focus();
    await page.keyboard.press('Control+ArrowRight');
    await expect(page.locator('#last-plan')).toHaveText('task-change move');
    expect(await taskStart(page, 't4')).not.toBe(before);
    await page.keyboard.press(`${await mod(page)}+z`);
    expect(await taskStart(page, 't4')).toBe(before);
  });

  test('pointer: drag a bar later by two days', async ({ page }) => {
    await open(page);
    // Interviews has no predecessors: its requested start follows the pointer (Monday 28 → Wednesday 30).
    const box = (await bar(page, 't1').boundingBox())!;
    await page.mouse.move(box.x + 6, box.y + box.height / 2);
    await page.mouse.down();
    await page.mouse.move(box.x + 6 + 64, box.y + box.height / 2, { steps: 6 });
    await page.mouse.up();
    const start = await page.evaluate(() => (window as unknown as BoardsWindow).__aui.gantt.tasks.find((t) => t.id === 't1')?.start);
    expect(start).toMatchObject({ month: 9, day: 30 });
  });

  test('link by toolbar: Link tasks, then Enter on the successor', async ({ page }) => {
    await open(page);
    await row(page, 't1').focus();
    await page.getByRole('button', { name: 'Link tasks' }).click();
    await expect(page.getByRole('button', { name: 'Link tasks' })).toHaveAttribute('aria-pressed', 'true');
    await row(page, 't5').focus();
    await page.keyboard.press('Enter');
    await expect(page.locator('#last-plan')).toHaveText('task-change link');
    expect(await page.evaluate(() => (window as unknown as BoardsWindow).__aui.gantt.dependencies.some((x) => x.from === 't1' && x.to === 't5'))).toBe(true);
  });

  test('histogram lists load as text', async ({ page }) => {
    await open(page, '?histogram=1');
    await expect(page.locator('.aui-gantt__load-summary').first()).toContainText('Peak');
  });

  test('reflow at 320 px and RTL mirroring', async ({ page }) => {
    await open(page, '', 320);
    expect(await page.evaluate(() => document.documentElement.scrollWidth - document.documentElement.clientWidth)).toBeLessThanOrEqual(0);
    await open(page, '?dir=rtl');
    const design = (await bar(page, 't3').boundingBox())!;
    const build = (await bar(page, 't4').boundingBox())!;
    expect(build.x + build.width).toBeLessThan(design.x + design.width);
  });

  test('forced colors: bars are outlined', async ({ page }) => {
    await page.emulateMedia({ forcedColors: 'active' });
    await open(page);
    expect(await bar(page, 't3').evaluate((el) => getComputedStyle(el).borderTopStyle)).toBe('solid');
  });
});

for (const theme of THEMES) {
  test(`visual boards: ${theme}`, async ({ page }) => {
    await page.emulateMedia({ reducedMotion: 'reduce' });
    await open(page, `?theme=${theme}&histogram=1`);
    await expect(page.locator('main')).toHaveScreenshot(`${theme}-boards.png`);
  });
}
