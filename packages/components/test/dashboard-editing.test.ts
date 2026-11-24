import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Dashboard, WidgetRegistry, type DashboardChangeDetail } from '../src/dashboard/index.js';
import { freeSpot } from '../src/dashboard/dashboard.js';
import { DefinitionHistory } from '../src/dashboard/history.js';
import { registerBuiltInWidgets } from '../src/dashboard/widgets/index.js';

const hosts: HTMLElement[] = [];
const dashboards: Dashboard[] = [];

afterEach(() => {
  for (const d of dashboards.splice(0)) d.destroy();
  for (const h of hosts.splice(0)) h.remove();
});

const text = (id: string, x: number, extra: Record<string, unknown> = {}) => ({ id, type: 'text', title: `Widget ${id}`, options: { text: id }, layout: { x, y: 0, w: 3, h: 2 }, ...extra });

function make(extra: Record<string, unknown> = {}, definition: Record<string, unknown> = {}): { d: Dashboard; changes: DashboardChangeDetail[] } {
  const host = document.createElement('div');
  host.style.inlineSize = '1200px';
  document.body.append(host);
  hosts.push(host);
  const registry = new WidgetRegistry();
  registerBuiltInWidgets(registry);
  const changes: DashboardChangeDetail[] = [];
  host.addEventListener('aui-dashboard-change', (e) => changes.push((e as CustomEvent<DashboardChangeDetail>).detail));
  const d = Dashboard.create(host, { definition: { schemaVersion: 1, id: 'd', title: 'Ops', widgets: [text('a', 0), text('b', 3, { actions: { removable: true } })], ...definition }, registry, lazy: false, editable: true, ...extra });
  dashboards.push(d);
  return { d, changes };
}

const toolbarButton = (d: Dashboard, name: string): HTMLButtonElement | null => [...d.host.querySelectorAll<HTMLButtonElement>('.aui-dashboard-toolbar button')].find((b) => b.textContent.trim() === name) ?? null;

describe('Dashboard editing (D3)', () => {
  it('toolbar: the edit switch toggles mode; edit-only actions show in edit mode', async () => {
    const { d } = make();
    const toolbar = d.host.querySelector('.aui-dashboard-toolbar');
    expect(toolbar?.getAttribute('role')).toBe('group');
    expect(toolbar?.getAttribute('aria-label')).toBe('Ops controls');
    expect(toolbarButton(d, 'Undo')?.hidden).toBe(true);
    const sw = d.host.querySelector<HTMLInputElement>('.aui-dashboard-toolbar__edit input');
    expect(sw).not.toBeNull();
    if (sw) await userEvent.click(sw);
    expect(d.mode).toBe('edit');
    expect(d.host.classList.contains('aui-dashboard-root--editing')).toBe(true);
    expect(toolbarButton(d, 'Undo')?.hidden).toBe(false);
    const undo = toolbarButton(d, 'Undo');
    expect(undo?.disabled === true || undo?.getAttribute('aria-disabled') === 'true').toBe(true);
    expect(d.grid?.handleFor('a')).not.toBeNull();
  });

  it('without editable there is no switch and edit mode is refused', () => {
    const { d } = make({ editable: false });
    expect(d.host.querySelector('.aui-dashboard-toolbar__edit')).toBeNull();
    expect(toolbarButton(d, 'Undo')).toBeNull();
    expect(() => {
      d.setMode('edit');
    }).toThrow(/editable/);
  });

  it('toolbar: false hides the toolbar; item options hide items', () => {
    expect(make({ toolbar: false }).d.host.querySelector('.aui-dashboard-toolbar')).toBeNull();
    const { d } = make({ toolbar: { refresh: false, undo: false } });
    expect(toolbarButton(d, 'Refresh')).toBeNull();
    expect(toolbarButton(d, 'Undo')).toBeNull();
    expect(toolbarButton(d, 'Reset')).not.toBeNull();
  });

  it('keyboard moves update the definition; Ctrl+Z and Ctrl+Y undo and redo them', async () => {
    const { d, changes } = make({ mode: 'edit' }, { grid: { compaction: 'none' } });
    d.grid?.handleFor('a')?.focus();
    await userEvent.keyboard('{Enter}{ArrowDown}{ArrowDown}{Enter}');
    const moved = d.definition.layouts?.lg ?? d.definition.widgets.find((w) => w.id === 'a')?.layout;
    expect(changes.at(-1)?.reason).toBe('layout');
    expect(d.definition.widgets.find((w) => w.id === 'a')?.layout.y).toBe(2);
    expect(moved).toBeDefined();
    expect(d.canUndo).toBe(true);
    d.grid?.handleFor('a')?.focus();
    await userEvent.keyboard('{Control>}z{/Control}');
    expect(d.definition.widgets.find((w) => w.id === 'a')?.layout.y).toBe(0);
    expect(changes.at(-1)?.reason).toBe('undo');
    await userEvent.keyboard('{Control>}y{/Control}');
    expect(d.definition.widgets.find((w) => w.id === 'a')?.layout.y).toBe(2);
    expect(d.dirty).toBe(true);
    d.reset();
    expect(d.definition.widgets.find((w) => w.id === 'a')?.layout.y).toBe(0);
    expect(d.dirty).toBe(false);
    expect(d.undo()).toBe(true); // reset is undoable
    expect(d.dirty).toBe(true);
  });

  it('adds widgets in the first free spot, removes them, and undoes both', () => {
    const { d, changes } = make({ mode: 'edit' });
    expect(d.addWidget({ id: 'c', type: 'kpi', title: 'New KPI' })).toEqual([]);
    const c = d.definition.widgets.find((w) => w.id === 'c');
    expect(c?.layout).toEqual({ x: 6, y: 0, w: 3, h: 2 });
    expect(d.widgetElement('c')).toBeDefined();
    expect(changes.at(-1)?.reason).toBe('add');
    expect(d.addWidget({ id: 'c', type: 'kpi', title: 'Dup' }).map((i) => i.code)).toContain('duplicate-id');
    expect(d.removeWidget('a')).toBe(true);
    expect(d.widgetElement('a')).toBeUndefined();
    d.undo();
    expect(d.widgetElement('a')).toBeDefined();
    d.undo();
    expect(d.widgetElement('c')).toBeUndefined();
    d.redo();
    expect(d.widgetElement('c')).toBeDefined();
  });

  it('the widget remove button appears only in edit mode and removes the widget', async () => {
    const { d } = make();
    const removeButton = (): HTMLButtonElement | null => d.widgetElement('b')?.querySelector<HTMLButtonElement>('button[aria-label^="Remove"]') ?? null;
    expect(removeButton()).toBeNull();
    d.setMode('edit');
    const button = removeButton();
    expect(button).not.toBeNull();
    if (button) await userEvent.click(button);
    expect(d.definition.widgets.map((w) => w.id)).toEqual(['a']);
  });

  it('updateWidget re-renders the widget and keeps data without refetching', async () => {
    let calls = 0;
    const { d } = make({ fetcher: () => (calls++, Promise.resolve({ total: 7 })) }, { dataSources: { api: { url: '/x' } }, widgets: [{ id: 'k', type: 'kpi', title: 'K', source: 'api', map: { value: '/total' }, layout: { x: 0, y: 0, w: 3, h: 2 } }] });
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(1);
    const k = d.definition.widgets[0];
    if (!k) throw new Error('no widget');
    expect(d.updateWidget('k', { ...k, title: 'Revenue' })).toEqual([]);
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(1);
    expect(d.widgetElement('k')?.textContent).toContain('Revenue');
    expect(d.widgetStatus('k')).toBe('ready');
  });

  it('renders variable controls in the toolbar and applies their changes', async () => {
    const { d } = make({}, { variables: [{ id: 'region', kind: 'select', label: 'Region', options: [{ value: 'eu', label: 'Europe' }, { value: 'us', label: 'Americas' }] }, { id: 'q', kind: 'text', label: 'Search' }] });
    expect(d.host.querySelector('[data-aui-variable="region"]')).not.toBeNull();
    const input = d.host.querySelector<HTMLInputElement>('[data-aui-variable="q"] input');
    expect(input).not.toBeNull();
    if (input) {
      await userEvent.type(input, 'acme');
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
    expect(d.variables.q).toBe('acme');
  });
});

describe('editing helpers', () => {
  it('freeSpot finds the first gap row by row', () => {
    expect(freeSpot([], 12, 3, 2)).toEqual({ x: 0, y: 0 });
    expect(freeSpot([{ x: 0, y: 0, w: 12, h: 2 }], 12, 3, 2)).toEqual({ x: 0, y: 2 });
    expect(freeSpot([{ x: 0, y: 0, w: 4, h: 2 }, { x: 8, y: 0, w: 4, h: 2 }], 12, 4, 2)).toEqual({ x: 4, y: 0 });
    expect(freeSpot([{ x: 0, y: 0, w: 4, h: 2 }, { x: 8, y: 0, w: 4, h: 2 }], 12, 5, 2)).toEqual({ x: 0, y: 2 });
  });

  it('DefinitionHistory stores patches and respects the limit', () => {
    const h = new DefinitionHistory(2);
    h.record({ a: 1 }, { a: 2 });
    h.record({ a: 2 }, { a: 3 });
    h.record({ a: 3 }, { a: 4 });
    expect(h.undo({ a: 4 })).toEqual({ a: 3 });
    expect(h.undo({ a: 3 })).toEqual({ a: 2 });
    expect(h.undo({ a: 2 })).toBeUndefined();
    expect(h.redo({ a: 2 })).toEqual({ a: 3 });
    h.record({ a: 3 }, { a: 9 });
    expect(h.canRedo).toBe(false);
    h.record({ a: 9 }, { a: 9 });
    expect(h.undo({ a: 9 })).toEqual({ a: 3 });
  });
});
