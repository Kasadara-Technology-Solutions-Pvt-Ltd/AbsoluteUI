import { Sidebar, type SidebarOptions } from '@absoluteui/components/sidebar';
import { host, seed } from '../seed.js';

export default seed<SidebarOptions>({
  options: {
    label: 'People',
    value: 'directory',
    items: [
      { id: 'home', label: 'Home', href: '#home', icon: 'menu' },
      {
        type: 'group',
        id: 'employees',
        label: 'Employees',
        items: [
          { id: 'directory', label: 'Directory', href: '#directory' },
          { id: 'org', label: 'Org chart', href: '#org' },
        ],
      },
      {
        type: 'group',
        id: 'time',
        label: 'Time off',
        items: [
          { id: 'requests', label: 'Requests', href: '#requests' },
          { id: 'calendar', label: 'Team calendar', href: '#calendar' },
          { id: 'policies', label: 'Policies', href: '#policies', disabled: true },
        ],
      },
      { id: 'payroll', label: 'Payroll', href: '#payroll' },
    ],
    breakpoint: 480,
  },
  call: 'Sidebar.create(host, $)',
  mount(stage, options) {
    const h = host(stage, 'aside');
    const c = Sidebar.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
