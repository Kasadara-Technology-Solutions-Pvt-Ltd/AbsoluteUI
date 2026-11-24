// Navigation and commands showcase: a document tree with lazy folders, drag-and-drop,
// rename, checkboxes, and a filter; a Tree Select for a department; and a command palette
// opened with Ctrl+K (Cmd+K) or a button, with nested pages and a simulated people search.
import { Button } from '@absoluteui/components/button';
import { CommandPalette, type Command, type CommandPaletteSelectDetail } from '@absoluteui/components/command-palette';
import { TextInput } from '@absoluteui/components/text-input';
import { TreeSelect, type TreeSelectChangeDetail } from '@absoluteui/components/tree-select';
import { TreeView, type TreeNode, type TreeViewSelectDetail } from '@absoluteui/components/tree-view';
import { action, choice, createShowcase, section, status, toggle, wait } from './kit.js';

const sc = createShowcase({
  title: 'Navigation and commands',
  description: 'Browse the company documents (folders load when opened), drag or cut and paste to reorganize, press F2 to rename, pick a department, and press Ctrl+K (Cmd+K) for the command palette.',
  simulated: true,
});

const DOCUMENTS: TreeNode[] = [
  { id: 'policies', label: 'Policies', icon: 'list-bulleted', children: [
    { id: 'leave', label: 'Leave policy', icon: 'file' },
    { id: 'travel', label: 'Travel policy', icon: 'file' },
    { id: 'expenses', label: 'Expenses policy', icon: 'file' },
    { id: 'remote', label: 'Remote work policy', icon: 'file' },
  ] },
  { id: 'handbook', label: 'Employee handbook', icon: 'list-bulleted', children: [
    { id: 'welcome', label: 'Welcome', icon: 'file' },
    { id: 'benefits', label: 'Benefits', icon: 'list-bulleted', children: [{ id: 'health', label: 'Health insurance', icon: 'file' }, { id: 'pension', label: 'Pension plan', icon: 'file' }] },
    { id: 'conduct', label: 'Code of conduct', icon: 'file' },
  ] },
  { id: 'payroll', label: 'Payroll (loads on open)', icon: 'list-bulleted', hasChildren: true },
  { id: 'archive', label: 'Archive (loads on open)', icon: 'list-bulleted', hasChildren: true },
  { id: 'legal', label: 'Legal hold (fails to load)', icon: 'list-bulleted', hasChildren: true },
  { id: 'board', label: 'Board minutes (restricted)', icon: 'file', disabled: true },
];

let failNext = true;
const docsArea = section(sc, 'Company documents', ['tree-view']);
const docsStatus = status(docsArea);
docsStatus.textContent = 'Nothing selected.';
const filterHost = document.createElement('div');
const treeHost = document.createElement('div');
docsArea.append(filterHost, treeHost);
const tree = TreeView.create(treeHost, {
  label: 'Company documents',
  nodes: DOCUMENTS,
  selection: 'single',
  expanded: ['policies'],
  draggable: true,
  renamable: true,
  height: '20rem',
  // Folders other than Policies and Handbook are leaves, so documents cannot be dropped into files.
  canDrop: (_source, target, position) => position !== 'inside' || target === null || target.icon === 'list-bulleted',
  loadChildren: async (node, { signal }) => {
    await wait(700, signal);
    if (node.id === 'legal' && failNext) {
      failNext = false;
      throw new Error('Simulated server error');
    }
    return Array.from({ length: node.id === 'archive' ? 60 : 6 }, (_, i) => ({ id: `${node.id}-${String(i + 1)}`, label: `${node.id === 'payroll' ? 'Payslip run' : 'Record'} ${String(2025 - Math.floor(i / 12))}-${String((i % 12) + 1).padStart(2, '0')}`, icon: 'file' }));
  },
});
sc.listen(treeHost, ['aui-select', 'aui-change', 'aui-expand', 'aui-move', 'aui-rename', 'aui-activate', 'aui-load-error'], 'tree');
treeHost.addEventListener('aui-select', (e) => {
  const id = (e as CustomEvent<TreeViewSelectDetail>).detail.selected[0];
  docsStatus.textContent = id === undefined ? 'Nothing selected.' : `Selected: ${tree.getNode(id)?.label ?? id}.`;
});
const filter = TextInput.create(filterHost, { label: 'Filter documents', type: 'search', description: 'Matches stay visible with the folders that contain them.' });
filterHost.addEventListener('aui-input', () => {
  tree.update({ filter: filter.value });
});

toggle(sc, 'Checkboxes', false, (checkboxes) => {
  tree.update({ checkboxes, selection: checkboxes ? 'none' : 'single' });
}, ['tree-view']);
toggle(sc, 'Multiple selection', false, (multiple) => {
  tree.update({ selection: multiple ? 'multiple' : 'single', selected: [] });
}, ['tree-view']);
toggle(sc, 'Drag and drop', true, (draggable) => {
  tree.update({ draggable });
}, ['tree-view']);
action(sc, 'Expand all', () => {
  tree.expandAll();
}, ['tree-view']);
action(sc, 'Collapse all', () => {
  tree.collapseAll();
}, ['tree-view']);
action(sc, 'Rename the selected document', () => {
  const id = tree.selected[0] ?? tree.activeId;
  if (id !== null) tree.rename(id);
}, ['tree-view']);

const pickArea = section(sc, 'Department', ['tree-select']);
const pickStatus = status(pickArea);
const DEPARTMENTS: TreeNode[] = [
  { id: 'eng', label: 'Engineering', children: [{ id: 'eng-web', label: 'Web' }, { id: 'eng-platform', label: 'Platform' }, { id: 'eng-data', label: 'Data and AI' }] },
  { id: 'ops', label: 'Operations', children: [{ id: 'ops-facilities', label: 'Facilities' }, { id: 'ops-it', label: 'IT support' }, { id: 'ops-security', label: 'Security' }] },
  { id: 'people', label: 'People and Culture', children: [{ id: 'people-recruiting', label: 'Recruiting' }, { id: 'people-learning', label: 'Learning' }] },
  { id: 'finance', label: 'Finance', children: [{ id: 'finance-payroll', label: 'Payroll' }, { id: 'finance-tax', label: 'Tax' }] },
];
const selectHost = document.createElement('div');
pickArea.append(selectHost);
const department = TreeSelect.create(selectHost, { label: 'Department', name: 'department', required: true, placeholder: 'Choose a department', description: 'Type to filter; Down Arrow moves into the tree.', nodes: DEPARTMENTS });
sc.listen(selectHost, ['aui-change'], 'tree-select');
selectHost.addEventListener('aui-change', (e) => {
  const { value } = (e as CustomEvent<TreeSelectChangeDetail>).detail;
  pickStatus.textContent = value.length === 0 ? 'No department chosen.' : `Chosen: ${value.join(', ')}.`;
});
choice(sc, 'Department mode', [{ value: 'single', label: 'One department' }, { value: 'multiple', label: 'Several (checkboxes)' }], 'single', (mode) => {
  department.update({ mode, value: [] });
}, ['tree-select']);
toggle(sc, 'Teams only (parents open)', false, (teamsOnly) => {
  department.update({ selectableParents: !teamsOnly });
}, ['tree-select']);

const cmdArea = section(sc, 'Command palette', ['command-palette']);
const cmdStatus = status(cmdArea);
cmdStatus.textContent = 'Press Ctrl+K (Cmd+K) or the button.';
const PEOPLE = ['Ada Lovelace', 'Alan Turing', 'Barbara Liskov', 'Donald Knuth', 'Edsger Dijkstra', 'Grace Hopper', 'Katherine Johnson', 'Margaret Hamilton', 'Radia Perlman', 'Tim Berners-Lee'];
const commands: Command[] = [
  { id: 'go-dashboard', label: 'Go to dashboard', group: 'Navigation', icon: 'menu' },
  { id: 'go-directory', label: 'Go to directory', group: 'Navigation', keywords: ['people', 'employees'], icon: 'menu' },
  { id: 'go-documents', label: 'Go to documents', group: 'Navigation', icon: 'menu', run: () => { tree.focusNode('policies'); } },
  { id: 'request-leave', label: 'Request leave', group: 'Actions', shortcut: 'Mod+Shift+L', icon: 'calendar', keywords: ['vacation', 'holiday'] },
  { id: 'new-document', label: 'New document', group: 'Actions', shortcut: 'Mod+N', icon: 'plus' },
  { id: 'export', label: 'Export report (no permission)', group: 'Actions', icon: 'download', disabled: true },
  { id: 'theme', label: 'Change theme', group: 'Preferences', icon: 'eye', children: [
    { id: 'theme-light', label: 'Light' },
    { id: 'theme-dark', label: 'Dark' },
    { id: 'theme-contrast', label: 'High contrast' },
  ] },
  { id: 'density', label: 'Change density', group: 'Preferences', icon: 'align-justify', children: [
    { id: 'density-compact', label: 'Compact' },
    { id: 'density-comfortable', label: 'Comfortable' },
    { id: 'density-spacious', label: 'Spacious' },
  ] },
];
const paletteHost = document.createElement('div');
cmdArea.append(paletteHost);
const palette = CommandPalette.create(paletteHost, {
  commands,
  recent: ['go-directory'],
  placeholder: 'Search pages, actions, and people',
  providers: [{
    id: 'people',
    label: 'People',
    minQueryLength: 2,
    search: async (query, { signal }) => {
      await wait(350, signal);
      const q = query.toLowerCase();
      return PEOPLE.filter((p) => p.toLowerCase().includes(q)).map((p) => ({ id: `person-${p}`, label: p, description: 'Employee', icon: 'search' }));
    },
  }],
});
sc.listen(paletteHost, ['aui-select', 'aui-open', 'aui-close'], 'palette');
paletteHost.addEventListener('aui-select', (e) => {
  const d = (e as CustomEvent<CommandPaletteSelectDetail>).detail;
  cmdStatus.textContent = `Chose ${d.command.label}${d.path.length > 0 ? ` (in ${d.path.join(' / ')})` : ''}.`;
});
const openButton = Button.create({ text: 'Open command palette', icon: 'search', variant: 'secondary' });
openButton.element.addEventListener('click', () => {
  palette.open();
});
cmdArea.append(openButton.element);
choice(sc, 'Palette shortcut', [{ value: 'Mod+K', label: 'Ctrl+K / Cmd+K' }, { value: 'Mod+Shift+P', label: 'Ctrl+Shift+P / Cmd+Shift+P' }], 'Mod+K', (shortcut) => {
  palette.update({ shortcut });
}, ['command-palette']);
action(sc, 'Open on the theme page', () => {
  palette.open({ page: 'theme' });
}, ['command-palette']);
