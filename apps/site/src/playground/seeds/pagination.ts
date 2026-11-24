import { Pagination, type PaginationOptions } from '@absoluteui/components/pagination';
import { host, seed } from '../seed.js';

export default seed<PaginationOptions>({
  options: { page: 3, total: 248, pageSize: 20, pageSizes: [10, 20, 50], showFirstLast: true },
  call: 'Pagination.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Pagination.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
