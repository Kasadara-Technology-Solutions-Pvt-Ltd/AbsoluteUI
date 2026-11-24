// R20 P4 page: Tree View, Tree Select, Command Palette (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { CommandPalette, type Command, type CommandPaletteSelectDetail } from '@absoluteui/components/command-palette';
import { Stack } from '@absoluteui/components/layout';
import { TreeSelect, type TreeSelectChangeDetail } from '@absoluteui/components/tree-select';
import { TreeView, type TreeNode, type TreeViewChangeDetail, type TreeViewMoveDetail, type TreeViewRenameDetail, type TreeViewSelectDetail } from '@absoluteui/components/tree-view';

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

const docs: TreeNode[] = [
  { id: 'policies', label: 'Policies', children: [
    { id: 'leave', label: 'Leave policy' },
    { id: 'travel', label: 'Travel policy' },
    { id: 'expenses', label: 'Expenses policy' },
  ] },
  { id: 'handbook', label: 'Handbook', children: [
    { id: 'welcome', label: 'Welcome' },
    { id: 'benefits', label: 'Benefits', children: [{ id: 'health', label: 'Health insurance' }, { id: 'pension', label: 'Pension' }] },
  ] },
  { id: 'archive', label: 'Archive', hasChildren: true },
  { id: 'broken', label: 'Broken folder', hasChildren: true },
  { id: 'locked', label: 'Locked file', disabled: true },
];

const log = byId('tree-log');
const tree = TreeView.create(byId('tree-docs'), {
  label: 'Documents',
  nodes: docs,
  selection: 'multiple',
  expanded: ['policies'],
  draggable: true,
  renamable: true,
  height: '16rem',
  loadChildren: async (node) => {
    await new Promise((r) => setTimeout(r, 150));
    if (node.id === 'broken') throw new Error('server error');
    return [{ id: `${node.id}-2024`, label: '2024' }, { id: `${node.id}-2025`, label: '2025' }];
  },
});
const docsHost = byId('tree-docs');
docsHost.addEventListener('aui-select', (e) => {
  log.textContent = `Selected: ${(e as CustomEvent<TreeViewSelectDetail>).detail.selected.join(', ')}`;
});
docsHost.addEventListener('aui-move', (e) => {
  const d = (e as CustomEvent<TreeViewMoveDetail>).detail;
  log.textContent = `Moved ${d.id} to ${d.parentId ?? 'root'} at ${String(d.index)} by ${d.source}`;
});
docsHost.addEventListener('aui-rename', (e) => {
  const d = (e as CustomEvent<TreeViewRenameDetail>).detail;
  log.textContent = `Renamed ${d.previousLabel} to ${d.label}`;
});
docsHost.addEventListener('aui-activate', (e) => {
  log.textContent = `Activated ${(e as CustomEvent<{ id: string }>).detail.id}`;
});

const checksHost = byId('tree-checks');
TreeView.create(checksHost, {
  label: 'Locations',
  checkboxes: true,
  checked: ['berlin'],
  expanded: ['emea', 'apac'],
  height: '12rem',
  nodes: [
    { id: 'emea', label: 'Europe', children: [{ id: 'berlin', label: 'Berlin' }, { id: 'paris', label: 'Paris' }, { id: 'zurich', label: 'Zurich' }] },
    { id: 'apac', label: 'Asia Pacific', children: [{ id: 'sydney', label: 'Sydney' }, { id: 'tokyo', label: 'Tokyo' }] },
  ],
});
checksHost.addEventListener('aui-change', (e) => {
  const d = (e as CustomEvent<TreeViewChangeDetail>).detail;
  byId('tree-checked').textContent = `Checked: ${d.checked.slice().sort().join(', ')}; mixed: ${d.indeterminate.join(', ')}`;
});

// 10,000+ visible nodes: 100 groups of 120 leaves, all expanded.
const big: TreeNode[] = Array.from({ length: 100 }, (_, g) => ({
  id: `g${String(g)}`,
  label: `Group ${String(g + 1).padStart(3, '0')}`,
  children: Array.from({ length: 120 }, (_, i) => ({ id: `g${String(g)}-${String(i)}`, label: `Item ${String(g + 1)}.${String(i + 1).padStart(3, '0')}` })),
}));
const bigTree = TreeView.create(byId('tree-big'), { label: 'Large tree', nodes: big, selection: 'single', height: '12rem' });
bigTree.expandAll();

const departments: TreeNode[] = [
  { id: 'eng', label: 'Engineering', children: [{ id: 'eng-web', label: 'Web' }, { id: 'eng-platform', label: 'Platform' }] },
  { id: 'ops', label: 'Operations', children: [{ id: 'ops-facilities', label: 'Facilities' }, { id: 'ops-it', label: 'IT support' }] },
  { id: 'people', label: 'People' },
];
const selectLog = byId('select-log');
TreeSelect.create(byId('select-dept'), { label: 'Department', name: 'department', required: true, placeholder: 'Choose a department', nodes: departments });
TreeSelect.create(byId('select-locations'), {
  label: 'Locations',
  name: 'locations',
  mode: 'multiple',
  value: ['berlin'],
  nodes: [
    { id: 'emea', label: 'Europe', children: [{ id: 'berlin', label: 'Berlin' }, { id: 'paris', label: 'Paris' }] },
    { id: 'apac', label: 'Asia Pacific', hasChildren: true },
  ],
  loadChildren: async () => {
    await new Promise((r) => setTimeout(r, 100));
    return [{ id: 'sydney', label: 'Sydney' }, { id: 'tokyo', label: 'Tokyo' }];
  },
});
for (const id of ['select-dept', 'select-locations']) {
  byId(id).addEventListener('aui-change', (e) => {
    selectLog.textContent = `${id}: ${(e as CustomEvent<TreeSelectChangeDetail>).detail.value.join(', ')}`;
  });
}

const commands: Command[] = [
  { id: 'go-dashboard', label: 'Go to dashboard', group: 'Navigation' },
  { id: 'go-people', label: 'Go to people', group: 'Navigation', keywords: ['employees', 'directory'] },
  { id: 'go-leave', label: 'Go to leave', group: 'Navigation' },
  { id: 'request-leave', label: 'Request leave', group: 'Actions', shortcut: 'Mod+Shift+L' },
  { id: 'export', label: 'Export report', group: 'Actions', disabled: true },
  { id: 'theme', label: 'Change theme', group: 'Actions', children: [
    { id: 'theme-light', label: 'Light theme' },
    { id: 'theme-dark', label: 'Dark theme' },
  ] },
  ...Array.from({ length: 2000 }, (_, i): Command => ({ id: `record-${String(i)}`, label: `Record ${String(i + 1).padStart(4, '0')}`, group: 'Records' })),
];
const cmdkHost = byId('cmdk');
const palette = CommandPalette.create(cmdkHost, {
  commands,
  recent: ['go-people'],
  providers: [{
    id: 'people',
    label: 'People',
    minQueryLength: 2,
    search: async (query, { signal }) => {
      await new Promise((resolve, reject) => {
        const t = setTimeout(resolve, 150);
        signal.addEventListener('abort', () => {
          clearTimeout(t);
          reject(new DOMException('aborted', 'AbortError'));
        });
      });
      return ['Ada Lovelace', 'Alan Turing', 'Grace Hopper'].filter((n) => n.toLowerCase().includes(query.toLowerCase())).map((n) => ({ id: `person-${n}`, label: n }));
    },
  }],
});
cmdkHost.addEventListener('aui-select', (e) => {
  const d = (e as CustomEvent<CommandPaletteSelectDetail>).detail;
  byId('cmdk-log').textContent = `Command: ${d.id}${d.path.length > 0 ? ` in ${d.path.join('/')}` : ''}`;
});
const trigger = Button.create({ text: 'Search commands', variant: 'secondary' });
trigger.element.addEventListener('click', () => {
  palette.open();
});
byId('cmdk-trigger').append(trigger.element);

Object.assign(window, { __auiReady: true, __tree: tree });
