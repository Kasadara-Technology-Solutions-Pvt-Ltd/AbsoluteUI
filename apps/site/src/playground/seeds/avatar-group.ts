import { AvatarGroup, type AvatarGroupOptions } from '@absoluteui/components/avatar-group';
import { host, seed } from '../seed.js';

export default seed<AvatarGroupOptions>({
  options: {
    label: 'Hiring panel',
    items: [
      { name: 'Ada Lovelace', status: 'online' },
      { name: 'Grace Hopper', status: 'busy' },
      { name: 'Alan Turing' },
      { name: 'Barbara Liskov', status: 'away' },
      { name: 'Donald Knuth' },
      { name: 'Katherine Johnson' },
    ],
    max: 4,
    size: 'md',
  },
  call: 'AvatarGroup.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = AvatarGroup.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
