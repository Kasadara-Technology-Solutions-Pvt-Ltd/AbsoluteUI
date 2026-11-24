import { Avatar, type AvatarOptions } from '@absoluteui/components/avatar';
import { host, seed } from '../seed.js';

export default seed<AvatarOptions>({
  options: { name: 'Grace Hopper', status: 'online', size: 'lg' },
  call: 'Avatar.create(host, $)',
  mount(stage, options) {
    const h = host(stage, 'span');
    const c = Avatar.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
