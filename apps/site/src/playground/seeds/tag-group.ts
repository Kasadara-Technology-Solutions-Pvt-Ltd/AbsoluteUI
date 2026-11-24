import { TagGroup, type TagGroupOptions } from '@absoluteui/components/tag-group';
import { host, seed } from '../seed.js';

export default seed<TagGroupOptions>({
  options: {
    label: 'Skills',
    items: [
      { value: 'ts', label: 'TypeScript' },
      { value: 'sql', label: 'PostgreSQL' },
      { value: 'lead', label: 'Team leadership' },
      { value: 'hire', label: 'Interviewing' },
      { value: 'a11y', label: 'Accessibility', disabled: true },
    ],
    selection: 'multiple',
    value: ['ts'],
    removable: true,
  },
  call: 'TagGroup.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = TagGroup.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
