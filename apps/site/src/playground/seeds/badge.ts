import { Badge, type BadgeOptions } from '@absoluteui/components/badge';
import { host, seed } from '../seed.js';

export default seed<BadgeOptions>({
  options: { label: 'Pending approval', tone: 'warning', dot: true },
  call: 'Badge.create(host, $)',
  mount(stage, options) {
    const h = host(stage, 'span');
    const c = Badge.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
