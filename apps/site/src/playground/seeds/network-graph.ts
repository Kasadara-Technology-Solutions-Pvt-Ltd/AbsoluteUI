import { NetworkGraph, type NetworkGraphOptions } from '@absoluteui/components/network-graph';
import { host, seed } from '../seed.js';

export default seed<NetworkGraphOptions>({
  options: {
    label: 'Team collaboration',
    nodes: [
      { id: 'ana', label: 'Ana', group: 'design' },
      { id: 'ben', label: 'Ben', group: 'eng' },
      { id: 'chi', label: 'Chi', group: 'eng' },
      { id: 'dev', label: 'Dev', group: 'product' },
      { id: 'eli', label: 'Eli', group: 'eng' },
      { id: 'fay', label: 'Fay', group: 'design' },
    ],
    edges: [
      { source: 'ana', target: 'ben', weight: 3 },
      { source: 'ben', target: 'chi', weight: 5 },
      { source: 'chi', target: 'dev' },
      { source: 'dev', target: 'ana' },
      { source: 'eli', target: 'ben' },
      { source: 'fay', target: 'ana', weight: 2 },
    ],
    groups: [
      { id: 'design', label: 'Design' },
      { id: 'eng', label: 'Engineering' },
      { id: 'product', label: 'Product' },
    ],
    seed: 1,
  },
  call: 'NetworkGraph.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = NetworkGraph.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
