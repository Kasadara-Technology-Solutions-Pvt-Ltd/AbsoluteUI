import { test, type Page } from '@playwright/test';
import type { Stepper } from '@absoluteui/components/stepper';
import type { MenuBar } from '@absoluteui/components/menu-bar';
import type { ContextMenu } from '@absoluteui/components/context-menu';
import type { Sidebar, SidebarItem } from '@absoluteui/components/sidebar';
import type { HoverCard } from '@absoluteui/components/hover-card';
import type { BottomSheet } from '@absoluteui/components/bottom-sheet';
import type { SortableList } from '@absoluteui/components/sortable-list';
import { withinBudget } from './budget.js';

// R2 navigation and overlay budgets declared in metadata/*/component.json (SPEC section 15.2).
// Runs in the "performance" project, after all functional tests; the median of 5 runs is compared.

interface Harness {
  __aui: {
    Stepper: typeof Stepper;
    MenuBar: typeof MenuBar;
    ContextMenu: typeof ContextMenu;
    Sidebar: typeof Sidebar;
    HoverCard: typeof HoverCard;
    BottomSheet: typeof BottomSheet;
    SortableList: typeof SortableList;
  };
  __auiReady?: boolean;
}

async function open(page: Page): Promise<void> {
  await page.goto('/navigation');
  await page.waitForFunction(() => (window as unknown as Harness).__auiReady === true);
}

function median(values: number[]): number {
  const sorted = [...values].sort((a, b) => a - b);
  return sorted[Math.floor(sorted.length / 2)] ?? Number.NaN;
}

async function measure(page: Page, fn: () => number): Promise<number> {
  const results: number[] = [];
  for (let i = 0; i < 5; i++) results.push(await page.evaluate(fn));
  return median(results);
}

test.describe('navigation and overlay performance budgets', () => {
  test('Stepper.create (10 steps) < 5 ms; MenuBar.create (8 menus x 20 items) < 50 ms; Sidebar.create (200 items) < 50 ms', async ({ page }) => {
    await open(page);
    const stepper = await measure(page, () => {
      const { Stepper: S } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const steps = Array.from({ length: 10 }, (_, i) => ({ id: `s${i}`, label: `Step ${i + 1}`, ...(i < 4 ? { status: 'complete' as const } : {}) }));
      const t = performance.now();
      const s = S.create(host, { label: 'Perf', steps, value: 's4' });
      const elapsed = performance.now() - t;
      s.destroy();
      host.remove();
      return elapsed;
    });
    const menubar = await measure(page, () => {
      const { MenuBar: M } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const items = Array.from({ length: 8 }, (_, m) => ({ id: `m${m}`, label: `Menu ${m}`, items: Array.from({ length: 20 }, (_, i) => ({ id: `m${m}-${i}`, label: `Item ${i}` })) }));
      const t = performance.now();
      const bar = M.create(host, { label: 'Perf', items });
      const elapsed = performance.now() - t;
      bar.destroy();
      host.remove();
      return elapsed;
    });
    const sidebar = await measure(page, () => {
      const { Sidebar: S } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const items: SidebarItem[] = Array.from({ length: 20 }, (_, g) => ({
        type: 'group' as const,
        id: `g${g}`,
        label: `Group ${g}`,
        items: Array.from({ length: 9 }, (_, i) => ({ id: `g${g}-${i}`, label: `Page ${i}`, href: `#g${g}-${i}` })),
      }));
      const t = performance.now();
      const s = S.create(host, { label: 'Perf', items, value: 'g3-4', breakpoint: 0 });
      const elapsed = performance.now() - t;
      s.destroy();
      host.remove();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `Stepper.create(10): ${stepper.toFixed(2)} ms, MenuBar.create(8x20): ${menubar.toFixed(2)} ms, Sidebar.create(200): ${sidebar.toFixed(2)} ms` });
    withinBudget(stepper, 5, 'stepper');
    withinBudget(menubar, 50, 'menubar');
    withinBudget(sidebar, 50, 'sidebar');
  });

  test('ContextMenu create + open (200 items) < 100 ms; HoverCard.show and BottomSheet.open < 16 ms', async ({ page }) => {
    await open(page);
    const context = await measure(page, () => {
      const { ContextMenu: C } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      host.tabIndex = 0;
      document.body.append(host);
      const items = Array.from({ length: 200 }, (_, i) => ({ id: `i${i}`, label: `Action ${i}` }));
      const t = performance.now();
      const c = C.create(host, { items });
      c.open({ x: 20, y: 20 });
      const elapsed = performance.now() - t;
      c.destroy();
      host.remove();
      return elapsed;
    });
    const hover = await measure(page, () => {
      const { HoverCard: H } = (window as unknown as Harness).__aui;
      const a = document.createElement('a');
      a.href = '#x';
      a.textContent = 'Trigger';
      document.body.append(a);
      const card = H.create(a, { content: 'Preview text for the perf run.' });
      const t = performance.now();
      card.show();
      const elapsed = performance.now() - t;
      card.destroy();
      a.remove();
      return elapsed;
    });
    const sheet = await measure(page, () => {
      const { BottomSheet: B } = (window as unknown as Harness).__aui;
      const s = B.create({ title: 'Perf', content: 'Body', snapPoints: [0.5, 1] });
      const t = performance.now();
      s.open();
      const elapsed = performance.now() - t;
      s.destroy();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `ContextMenu create+open(200): ${context.toFixed(2)} ms, HoverCard.show: ${hover.toFixed(2)} ms, BottomSheet.open: ${sheet.toFixed(2)} ms` });
    withinBudget(context, 100, 'context');
    withinBudget(hover, 16, 'hover');
    withinBudget(sheet, 16, 'sheet');
  });

  test('SortableList.create (500 items) < 100 ms; one keyboard move with 500 items < 16 ms', async ({ page }) => {
    await open(page);
    const create = await measure(page, () => {
      const { SortableList: S } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const items = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, label: `Row ${i}` }));
      const t = performance.now();
      const l = S.create(host, { label: 'Perf', items });
      const elapsed = performance.now() - t;
      l.destroy();
      host.remove();
      return elapsed;
    });
    const move = await measure(page, () => {
      const { SortableList: S } = (window as unknown as Harness).__aui;
      const host = document.createElement('div');
      document.body.append(host);
      const items = Array.from({ length: 500 }, (_, i) => ({ id: `r${i}`, label: `Row ${i}` }));
      const l = S.create(host, { label: 'Perf', items });
      const handle = l.list.querySelector<HTMLButtonElement>('li[data-id="r250"] button');
      if (!handle) return Number.NaN;
      handle.focus();
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      const t = performance.now();
      handle.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      const elapsed = performance.now() - t;
      l.destroy();
      host.remove();
      return elapsed;
    });
    test.info().annotations.push({ type: 'perf', description: `SortableList.create(500): ${create.toFixed(2)} ms, keyboard move(500): ${move.toFixed(2)} ms` });
    withinBudget(create, 100, 'create');
    withinBudget(move, 16, 'move');
  });
});
