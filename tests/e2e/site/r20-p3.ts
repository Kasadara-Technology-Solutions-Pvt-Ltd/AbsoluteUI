// R20 P3 page: Virtual List, Splitter, Empty State (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { EmptyState, type EmptyStateActionDetail } from '@absoluteui/components/empty-state';
import { Stack } from '@absoluteui/components/layout';
import { Splitter, type SplitterChangeDetail } from '@absoluteui/components/splitter';
import { VirtualList, type VirtualListChangeDetail } from '@absoluteui/components/virtual-list';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

interface Person {
  id: string;
  name: string;
}
const DEPARTMENTS = ['Engineering', 'Finance', 'Marketing', 'Operations', 'People', 'Sales'];
const people: Person[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `e${String(i + 1)}`, name: `Employee ${String(i + 1).padStart(6, '0')}` }));
const text = (s: string): Node => document.createTextNode(s);

VirtualList.create<Person>(byId('vl-people'), {
  label: 'Employees',
  items: people,
  selection: 'single',
  itemKey: (p) => p.id,
  itemText: (p) => p.name,
  renderItem: (p) => text(p.name),
  height: '16rem',
});
byId('vl-people').addEventListener('aui-change', (e) => {
  byId('vl-people-selected').textContent = `Selected: ${(e as CustomEvent<VirtualListChangeDetail>).detail.value.join(', ')}`;
});

VirtualList.create<string>(byId('vl-multi'), {
  label: 'Departments',
  items: DEPARTMENTS,
  selection: 'multiple',
  value: ['Finance'],
  isDisabled: (d) => d === 'Operations',
  renderItem: (d) => text(d),
  height: '12rem',
});

VirtualList.create<string>(byId('vl-plain'), {
  label: 'Audit log',
  items: Array.from({ length: 5000 }, (_, i) => `Line ${String(i + 1)}: record updated`),
  variableHeight: true,
  renderItem: (line, i) => {
    const p = document.createElement('p');
    p.className = 'demo-line';
    p.textContent = i % 7 === 0 ? `${line}. This entry has a longer note that wraps onto a second line when the list is narrow.` : line;
    return p;
  },
  height: '10rem',
});

let feed: string[] = [];
const infinite = VirtualList.create<string>(byId('vl-infinite'), {
  label: 'Activity',
  items: feed,
  renderItem: (s) => text(s),
  height: '10rem',
  loadMore: async () => {
    await new Promise((r) => setTimeout(r, 100));
    feed = [...feed, ...Array.from({ length: 30 }, (_, i) => `Activity ${String(feed.length + i + 1)}`)];
    infinite.update({ items: feed, hasMore: feed.length < 120 });
  },
});

const pane = (label: string): HTMLElement => {
  const el = document.createElement('div');
  el.className = 'demo-pane';
  el.textContent = label;
  return el;
};
const main = byId('split-main');
main.style.setProperty('block-size', '14rem');
Splitter.create(main, {
  panes: [
    { content: pane('Folders'), label: 'Folders', size: '30%', min: 120, max: '60%', collapsible: true },
    { content: pane('Messages'), label: 'Messages', min: 160 },
  ],
});
main.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<SplitterChangeDetail>).detail;
  byId('split-sizes').textContent = `${d.reason}: ${d.sizes.map((s) => Math.round(s)).join(' / ')}`;
});
const inner = document.createElement('div');
Splitter.create(inner, { orientation: 'vertical', panes: [{ content: pane('Editor'), label: 'Editor', min: 60 }, { content: pane('Console'), label: 'Console', size: '35%', collapsible: true }] });
const nested = byId('split-nested');
nested.style.setProperty('block-size', '16rem');
Splitter.create(nested, { panes: [{ content: pane('Files'), label: 'Files', size: 180, min: 120 }, { content: inner, label: 'Workspace' }] });

EmptyState.create(byId('empty-search'), {
  title: 'No employees match your filters',
  description: 'Try a different name or clear the filters.',
  icon: 'search',
  live: true,
  headingLevel: 3,
  primaryAction: { label: 'Clear filters' },
  secondaryAction: { label: 'Help', href: '#empty-states' },
});
byId('empty-search').addEventListener('aui-action', (e) => {
  byId('empty-log').textContent = `Action: ${(e as CustomEvent<EmptyStateActionDetail>).detail.action}`;
});
EmptyState.create(byId('empty-first'), { title: 'No projects yet', description: 'Projects group people and milestones.', icon: 'plus', size: 'sm', headingLevel: null });

Object.assign(window, { __auiReady: true });
