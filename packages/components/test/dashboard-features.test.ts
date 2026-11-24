import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Dashboard, WidgetRegistry } from '../src/dashboard/index.js';
import { enableDashboardBuilder, type DashboardBuilder } from '../src/dashboard/builder/index.js';
import { registerBuiltInWidgets, toneFor } from '../src/dashboard/widgets/index.js';

const cleanup: (() => void)[] = [];

afterEach(() => {
  vi.useRealTimers();
  for (const c of cleanup.splice(0).reverse()) c();
  for (const d of document.querySelectorAll('dialog')) d.remove();
});

function make(definition: Record<string, unknown>, extra: Record<string, unknown> = {}): Dashboard {
  const host = document.createElement('div');
  host.style.inlineSize = '1200px';
  document.body.append(host);
  const registry = new WidgetRegistry();
  registerBuiltInWidgets(registry);
  const d = Dashboard.create(host, { definition: { schemaVersion: 1, id: 'd', title: 'Ops', ...definition }, registry, lazy: false, ...extra });
  cleanup.push(() => {
    d.destroy();
    host.remove();
  });
  return d;
}

const pages = {
  pages: [{ id: 'p1', title: 'Overview' }, { id: 'p2', title: 'Details' }, { id: 'p3', title: 'Costs' }],
  widgets: [
    { id: 'a', type: 'text', title: 'A', page: 'p1', options: { text: 'a' }, layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'b', type: 'text', title: 'B', page: 'p2', options: { text: 'b' }, layout: { x: 0, y: 0, w: 3, h: 2 } },
    { id: 'c', type: 'text', title: 'C', page: 'p3', options: { text: 'c' }, layout: { x: 0, y: 0, w: 3, h: 2 } },
  ],
};

describe('pages (S7)', () => {
  it('renders page tabs with the grid inside the selected tab panel', async () => {
    const d = make(pages);
    const tabs = [...d.host.querySelectorAll<HTMLButtonElement>('.aui-dashboard-root__pages [role="tab"]')];
    expect(tabs.map((t) => t.textContent.trim())).toEqual(['Overview', 'Details', 'Costs']);
    expect(d.widgetElement('a')?.closest('[role="tabpanel"]')).not.toBeNull();
    const details = tabs[1];
    if (details) await userEvent.click(details);
    expect(d.page).toBe('p2');
    expect(d.widgetElement('b')?.closest('[role="tabpanel"]')?.getAttribute('aria-labelledby')).toBe(details?.id);
  });

  it('adding a page later creates tabs; removing pages puts the grid back', () => {
    const d = make({ widgets: [{ id: 'a', type: 'text', title: 'A', options: { text: 'a' }, layout: { x: 0, y: 0, w: 3, h: 2 } }] });
    expect(d.host.querySelector('.aui-dashboard-root__pages')).toBeNull();
    d.setDefinition({ ...d.definition, pages: [{ id: 'main', title: 'Main' }], widgets: d.definition.widgets.map((w) => ({ ...w, page: 'main' })) });
    expect(d.host.querySelector('.aui-dashboard-root__pages [role="tab"]')?.textContent).toContain('Main');
    expect(d.widgetElement('a')?.closest('[role="tabpanel"]')).not.toBeNull();
    d.undo();
    expect(d.host.querySelector('.aui-dashboard-root__pages')).toBeNull();
    expect(d.widgetElement('a')?.closest('[role="tabpanel"]')).toBeNull();
  });
});

describe('kiosk (S8)', () => {
  it('hides the toolbar, rotates pages, pauses with a toggle button, and exits', async () => {
    vi.useFakeTimers();
    const d = make(pages, { editable: true, mode: 'edit' });
    d.startKiosk({ rotate: 10 });
    expect(d.mode).toBe('view');
    expect(d.host.classList.contains('aui-dashboard-root--kiosk')).toBe(true);
    const pause = [...d.host.querySelectorAll<HTMLButtonElement>('.aui-dashboard-kiosk button')].find((b) => b.textContent.includes('Pause'));
    expect(pause?.getAttribute('aria-pressed')).toBe('false');
    vi.advanceTimersByTime(10_000);
    expect(d.page).toBe('p2');
    vi.advanceTimersByTime(10_000);
    expect(d.page).toBe('p3');
    vi.advanceTimersByTime(10_000);
    expect(d.page).toBe('p1');
    pause?.click();
    expect(pause?.getAttribute('aria-pressed')).toBe('true');
    vi.advanceTimersByTime(30_000);
    expect(d.page).toBe('p1');
    const exit = [...d.host.querySelectorAll<HTMLButtonElement>('.aui-dashboard-kiosk button')].find((b) => b.textContent.includes('Exit'));
    exit?.click();
    expect(d.kiosk).toBe(false);
    expect(d.host.querySelector('.aui-dashboard-kiosk')).toBeNull();
    await Promise.resolve();
  });

  it('clamps rotation to at least 10 seconds and needs more than one page for it', () => {
    vi.useFakeTimers();
    const d = make(pages);
    d.startKiosk({ rotate: 1 });
    vi.advanceTimersByTime(9_000);
    expect(d.page).toBe('p1');
    vi.advanceTimersByTime(1_000);
    expect(d.page).toBe('p2');
    d.stopKiosk();
    const single = make({ widgets: [] });
    single.startKiosk({ rotate: 10 });
    expect(single.host.querySelector('.aui-dashboard-kiosk button[aria-pressed]')).toBeNull();
  });
});

describe('templates (S6)', () => {
  function withBuilder(): { d: Dashboard; b: DashboardBuilder } {
    const d = make({ widgets: [] }, { editable: true, mode: 'edit' });
    const b = enableDashboardBuilder(d, {
      widgetTemplates: [
        {
          id: 'revenue',
          label: 'Revenue KPI',
          widget: { type: 'kpi', title: 'Revenue', map: { value: '/total' }, options: { format: { style: 'currency', currency: 'EUR' } } },
          dataSource: { id: 'revenue', definition: { kind: 'static', data: { total: 1234 } } },
        },
      ],
      dashboardTemplates: [{ id: 'empty-ops', label: 'Operations', definition: { schemaVersion: 1, id: 'ops', title: 'Operations', widgets: [] } }],
    });
    cleanup.push(() => {
      b.destroy();
    });
    return { d, b };
  }

  const dialogButton = (name: string): HTMLButtonElement | null => [...(document.querySelector('dialog[open]')?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((x) => x.textContent.trim() === name) ?? null;

  it('a widget template adds the widget and its data source', async () => {
    const { d, b } = withBuilder();
    b.openTemplate('revenue');
    const save = dialogButton('Save');
    if (save) await userEvent.click(save);
    const w = d.definition.widgets[0];
    expect(w).toMatchObject({ type: 'kpi', title: 'Revenue', source: 'revenue', map: { value: '/total' } });
    expect(d.definition.dataSources?.revenue).toEqual({ kind: 'static', data: { total: 1234 } });
    await new Promise((r) => setTimeout(r, 10));
    expect(d.widgetElement(w?.id ?? '')?.textContent).toContain('1,234');
  });

  it('the JSON editor offers dashboard templates', async () => {
    const { d, b } = withBuilder();
    b.openJson();
    const select = document.querySelector('dialog[open] .aui-dashboard-builder > .aui-dashboard-builder__field');
    expect(select?.textContent).toContain('Start from');
    // Choosing the template fills the editor; apply replaces the definition.
    select?.dispatchEvent(new CustomEvent('aui-change', { detail: { value: 'empty-ops' }, bubbles: false }));
    const area = document.querySelector<HTMLTextAreaElement>('dialog[open] textarea');
    expect(area?.value).toContain('"title": "Operations"');
    const apply = dialogButton('Apply');
    if (apply) await userEvent.click(apply);
    expect(d.definition.title).toBe('Operations');
  });
});

describe('thresholds (S5)', () => {
  it('picks the first matching threshold and marks the widget tone', async () => {
    const t = [{ below: 0, tone: 'danger' as const }, { above: 100, tone: 'success' as const }];
    expect(toneFor(-5, t)).toBe('danger');
    expect(toneFor(150, t)).toBe('success');
    expect(toneFor(50, t)).toBeNull();
    expect(toneFor(null, t)).toBeNull();
    const d = make({ dataSources: { s: { kind: 'static', data: { v: -3 } } }, widgets: [{ id: 'k', type: 'kpi', title: 'Margin', source: 's', map: { value: '/v' }, options: { thresholds: t }, layout: { x: 0, y: 0, w: 3, h: 2 } }] });
    await new Promise((r) => setTimeout(r, 10));
    expect(d.widgetElement('k')?.dataset.auiTone).toBe('danger');
  });
});
