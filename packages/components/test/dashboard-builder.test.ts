import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { Dashboard, WidgetRegistry } from '../src/dashboard/index.js';
import { enableDashboardBuilder, fieldCandidates, pointerCandidates, type DashboardBuilder } from '../src/dashboard/builder/index.js';
import { registerBuiltInWidgets } from '../src/dashboard/widgets/index.js';

const cleanup: (() => void)[] = [];

afterEach(() => {
  for (const c of cleanup.splice(0).reverse()) c();
  for (const d of document.querySelectorAll('dialog')) d.remove();
});

function setup(definition: Record<string, unknown> = {}, fetcher?: () => Promise<unknown>): { d: Dashboard; b: DashboardBuilder } {
  const host = document.createElement('div');
  host.style.inlineSize = '1200px';
  document.body.append(host);
  const registry = new WidgetRegistry();
  registerBuiltInWidgets(registry);
  const d = Dashboard.create(host, {
    definition: { schemaVersion: 1, id: 'sales', title: 'Sales', widgets: [{ id: 'note', type: 'text', title: 'Note', options: { text: 'hi' }, layout: { x: 0, y: 0, w: 3, h: 2 } }], ...definition },
    registry,
    lazy: false,
    editable: true,
    mode: 'edit',
    ...(fetcher ? { fetcher } : {}),
  });
  const b = enableDashboardBuilder(d);
  cleanup.push(() => {
    b.destroy();
    d.destroy();
    host.remove();
  });
  return { d, b };
}

const openDialog = (): HTMLDialogElement | null => document.querySelector<HTMLDialogElement>('dialog[open]');
const dialogButton = (name: string): HTMLButtonElement | null => [...(openDialog()?.querySelectorAll<HTMLButtonElement>('button') ?? [])].find((b) => b.textContent.trim() === name) ?? null;

describe('Dashboard builder (D4)', () => {
  it('adds toolbar items and widget edit actions in edit mode', () => {
    const { d } = setup();
    const names = [...d.host.querySelectorAll('.aui-dashboard-toolbar button')].map((b) => b.textContent.trim());
    expect(names).toEqual(expect.arrayContaining(['Add widget', 'JSON']));
    expect(d.widgetElement('note')?.querySelector('button[aria-label="Edit Note"]')).not.toBeNull();
    d.setMode('view');
    expect(d.widgetElement('note')?.querySelector('button[aria-label="Edit Note"]')).toBeNull();
  });

  it('creates a widget from the form; the definition gains the generated JSON', async () => {
    const { d, b } = setup();
    b.openNew();
    const dialog = openDialog();
    expect(dialog).not.toBeNull();
    const title = [...(dialog?.querySelectorAll<HTMLInputElement>('input') ?? [])].find((i) => i.labels?.[0]?.textContent.trim().startsWith('Title') === true);
    expect(title).toBeDefined();
    if (title) {
      await userEvent.clear(title);
      await userEvent.type(title, 'Revenue KPI');
    }
    const save = dialogButton('Save');
    if (save) await userEvent.click(save);
    expect(openDialog()).toBeNull();
    const added = d.definition.widgets.at(-1);
    expect(added?.title).toBe('Revenue KPI');
    expect(added?.layout).toMatchObject({ x: 3, y: 0 });
    expect(d.canUndo).toBe(true);
  });

  it('keeps the drawer open and shows issues for an invalid widget', async () => {
    const { d, b } = setup();
    b.openNew();
    const title = [...(openDialog()?.querySelectorAll<HTMLInputElement>('input') ?? [])].find((i) => i.labels?.[0]?.textContent.trim().startsWith('Title') === true);
    if (title) await userEvent.clear(title);
    const save = dialogButton('Save');
    if (save) await userEvent.click(save);
    expect(openDialog()).not.toBeNull();
    expect(openDialog()?.textContent).toContain('/widgets/1/title');
    expect(d.definition.widgets.length).toBe(1);
  });

  it('edits through the JSON tab, including a new data source', async () => {
    const { d, b } = setup();
    b.openEdit('note');
    const jsonTab = [...(openDialog()?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find((t) => t.textContent.trim() === 'JSON');
    if (jsonTab) await userEvent.click(jsonTab);
    const area = openDialog()?.querySelector<HTMLTextAreaElement>('.aui-dashboard-builder__json textarea, .aui-dashboard-builder > .aui-dashboard-builder__field textarea');
    expect(area?.value).toContain('"id": "note"');
    if (area) {
      const doc = { widget: { id: 'note', type: 'list', title: 'Top regions', source: 'regions', options: { label: 'r' }, layout: { x: 0, y: 0, w: 4, h: 3 } }, dataSource: { kind: 'static', data: [{ r: 'EU' }] } };
      area.value = JSON.stringify(doc);
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const save = dialogButton('Save');
    if (save) await userEvent.click(save);
    expect(openDialog()).toBeNull();
    expect(d.definition.widgets[0]).toMatchObject({ id: 'note', type: 'list', title: 'Top regions', source: 'regions' });
    expect(d.definition.dataSources?.regions).toEqual({ kind: 'static', data: [{ r: 'EU' }] });
    expect(d.widgetElement('note')?.textContent).toContain('EU');
  });

  it('rejects forbidden headers typed into the JSON tab (R18-6)', async () => {
    const { d, b } = setup();
    b.openEdit('note');
    const jsonTab = [...(openDialog()?.querySelectorAll<HTMLButtonElement>('[role="tab"]') ?? [])].find((t) => t.textContent.trim() === 'JSON');
    if (jsonTab) await userEvent.click(jsonTab);
    const area = openDialog()?.querySelector<HTMLTextAreaElement>('.aui-dashboard-builder__json textarea, .aui-dashboard-builder > .aui-dashboard-builder__field textarea');
    if (area) {
      area.value = JSON.stringify({ widget: { id: 'note', type: 'kpi', title: 'K', source: 'api', layout: { x: 0, y: 0, w: 3, h: 2 } }, dataSource: { url: '/x', headers: { Authorization: 'Bearer secret' } } });
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const save = dialogButton('Save');
    if (save) await userEvent.click(save);
    expect(openDialog()?.textContent).toContain('/dataSources/api/headers/Authorization');
    expect(openDialog()?.textContent).not.toContain('secret');
    expect(d.definition.dataSources).toBeUndefined();
  });

  it('JSON editor validates live and applies a new definition (undoable)', async () => {
    const { d, b } = setup();
    b.openJson();
    const area = openDialog()?.querySelector<HTMLTextAreaElement>('.aui-dashboard-builder__json textarea, .aui-dashboard-builder > .aui-dashboard-builder__field textarea');
    expect(area?.value).toContain('"title": "Sales"');
    if (area) {
      area.value = '{ not json';
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    const apply = dialogButton('Apply');
    if (apply) await userEvent.click(apply);
    expect(openDialog()?.textContent).toContain('not valid JSON');
    if (area) {
      area.value = JSON.stringify({ ...d.definition, title: 'Sales 2' });
      area.dispatchEvent(new Event('input', { bubbles: true }));
    }
    if (apply) await userEvent.click(apply);
    expect(openDialog()).toBeNull();
    expect(d.definition.title).toBe('Sales 2');
    d.undo();
    expect(d.definition.title).toBe('Sales');
  });
});

describe('builder helpers', () => {
  it('lists pointers and fields from a sample response', () => {
    const sample = { total: 5, meta: { name: 'x' }, rows: [{ region: 'EU', amount: 1 }, { region: 'US', amount: 2, extra: true }] };
    expect(pointerCandidates(sample)).toEqual([
      { pointer: '/total', kind: 'number' },
      { pointer: '/meta', kind: 'object' },
      { pointer: '/meta/name', kind: 'string' },
      { pointer: '/rows', kind: 'array' },
      { pointer: '/rows/0', kind: 'object' },
      { pointer: '/rows/0/region', kind: 'string' },
      { pointer: '/rows/0/amount', kind: 'number' },
    ]);
    expect(fieldCandidates(sample)).toEqual(['region', 'amount', 'extra']);
    expect(pointerCandidates([1, 2])).toEqual([{ pointer: '', kind: 'array' }, { pointer: '/0', kind: 'number' }]);
  });
});
