import { Skeleton, type SkeletonOptions } from '@absoluteui/components/skeleton';
import { host, seed } from '../seed.js';

export default seed<SkeletonOptions>({
  options: { shape: 'text', lines: 3, width: '60%' },
  call: 'Skeleton.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Skeleton.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
