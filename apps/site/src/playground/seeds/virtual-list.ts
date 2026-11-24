import { VirtualList, type VirtualListOptions } from '@absoluteui/components/virtual-list';
import { host, seed } from '../seed.js';

const people = Array.from({ length: 10_000 }, (_, i) => `Employee ${String(i + 1)}`);

export default seed<VirtualListOptions<string>>({
  options: {
    label: 'Employees',
    items: people,
    selection: 'single',
    height: '16rem',
    renderItem: (name) => document.createTextNode(name),
  },
  call: 'VirtualList.create(host, $)',
  codeValues: {
    items: "Array.from({ length: 10_000 }, (_, i) => `Employee ${String(i + 1)}`)",
    renderItem: '(name) => document.createTextNode(name)',
  },
  hide: ['items'],
  mount(stage, options) {
    const h = host(stage);
    const c = VirtualList.create<string>(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
