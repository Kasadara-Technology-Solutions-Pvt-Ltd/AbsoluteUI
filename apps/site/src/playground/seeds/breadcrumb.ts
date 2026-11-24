import { Breadcrumb, type BreadcrumbOptions } from '@absoluteui/components/breadcrumb';
import { host, seed } from '../seed.js';

export default seed<BreadcrumbOptions>({
  options: {
    items: [
      { label: 'Home', href: '#home' },
      { label: 'People', href: '#people' },
      { label: 'Engineering', href: '#engineering' },
      { label: 'Platform team', href: '#platform' },
      { label: 'Ada Lovelace' },
    ],
    maxItems: 4,
  },
  call: 'Breadcrumb.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Breadcrumb.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
