import { SortableList, type SortableListOptions } from '@absoluteui/components/sortable-list';
import { host, seed } from '../seed.js';

export default seed<SortableListOptions>({
  options: {
    label: 'Quarterly priorities',
    items: [
      { id: 'hiring', label: 'Hire two platform engineers' },
      { id: 'sso', label: 'Single sign-on for all tools' },
      { id: 'cost', label: 'Cut cloud cost by 15 %' },
      { id: 'a11y', label: 'Accessibility audit of the portal' },
      { id: 'docs', label: 'Rewrite onboarding docs' },
    ],
    dragFrom: 'handle',
  },
  call: 'SortableList.create(host, $)',
  note: 'Drag a handle, or focus it, press Space, move with the arrow keys, and press Space again.',
  mount(stage, options) {
    const h = host(stage);
    const c = SortableList.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
