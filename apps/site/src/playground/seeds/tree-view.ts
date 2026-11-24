import { TreeView, type TreeViewOptions } from '@absoluteui/components/tree-view';
import { host, seed } from '../seed.js';

export default seed<TreeViewOptions>({
  options: {
    label: 'Documents',
    nodes: [
      { id: 'policies', label: 'Policies', children: [{ id: 'leave', label: 'Leave policy' }, { id: 'travel', label: 'Travel policy' }, { id: 'expenses', label: 'Expenses policy' }] },
      { id: 'handbook', label: 'Handbook', children: [{ id: 'welcome', label: 'Welcome' }, { id: 'benefits', label: 'Benefits', children: [{ id: 'health', label: 'Health insurance' }, { id: 'pension', label: 'Pension' }] }] },
      { id: 'archive', label: 'Archive', hasChildren: true },
      { id: 'locked', label: 'Locked file', disabled: true },
    ],
    selection: 'single',
    selected: ['leave'],
    expanded: ['policies'],
    checkboxes: false,
    draggable: true,
    renamable: true,
    filter: '',
    height: '16rem',
    loadChildren: async () => {
      await new Promise((r) => setTimeout(r, 400));
      return [{ id: 'archive-2024', label: '2024' }, { id: 'archive-2025', label: '2025' }];
    },
  },
  call: 'TreeView.create(host, $)',
  codeValues: {
    loadChildren: "async (node, { signal }) => (await fetch(`/api/folders/${node.id}`, { signal })).json()",
  },
  mount(stage, options) {
    const h = host(stage);
    const c = TreeView.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
