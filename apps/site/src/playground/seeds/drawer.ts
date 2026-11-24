import { Button } from '@absoluteui/components/button';
import { Drawer, type DrawerOptions } from '@absoluteui/components/drawer';
import { seed } from '../seed.js';

export default seed<DrawerOptions>({
  options: {
    title: 'Leave request',
    description: 'Ada Lovelace, 2 to 6 December (5 business days).',
    content: 'Annual leave. Cover arranged with Grace Hopper. Balance after approval: 12 days.',
    actions: [
      { label: 'Reject', value: 'reject', variant: 'secondary' },
      { label: 'Approve', value: 'approve', variant: 'primary', autofocus: true },
    ],
  },
  call: 'const drawer = Drawer.create($);\ndrawer.open()',
  note: 'Press Open drawer to see the drawer with the current options.',
  mount(stage, options) {
    const drawer = Drawer.create(options, document);
    const open = Button.create({ text: 'Open drawer' }, document);
    open.element.addEventListener('click', () => { drawer.open(); });
    stage.append(open.element);
    return {
      events: drawer.element,
      update: (p) => { drawer.update(p); },
      destroy: () => { drawer.destroy(); open.destroy(); open.element.remove(); },
    };
  },
});
