import { MenuBar, type MenuBarOptions } from '@absoluteui/components/menu-bar';
import { host, seed } from '../seed.js';

export default seed<MenuBarOptions>({
  options: {
    label: 'Employee record',
    items: [
      {
        id: 'file',
        label: 'File',
        items: [
          { id: 'new', label: 'New employee', shortcut: 'Ctrl+N' },
          { id: 'export', label: 'Export', items: [{ id: 'export-csv', label: 'CSV' }, { id: 'export-pdf', label: 'PDF' }] },
          { type: 'separator' },
          { id: 'archive', label: 'Archive record', tone: 'danger' },
        ],
      },
      {
        id: 'view',
        label: 'View',
        items: [
          { type: 'checkbox', id: 'show-salary', label: 'Show salary', checked: false },
          { type: 'separator' },
          { type: 'radio', id: 'density-comfortable', label: 'Comfortable', group: 'density', checked: true },
          { type: 'radio', id: 'density-compact', label: 'Compact', group: 'density', checked: false },
        ],
      },
      { id: 'help', label: 'Help' },
    ],
  },
  call: 'MenuBar.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = MenuBar.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
