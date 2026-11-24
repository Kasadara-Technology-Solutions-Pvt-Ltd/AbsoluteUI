import { Diagram, type DiagramOptions } from '@absoluteui/components/diagram';
import { host, seed } from '../seed.js';

export default seed<DiagramOptions>({
  options: {
    label: 'Expense approval',
    editable: true,
    routing: 'orthogonal',
    layout: { algorithm: 'layered', direction: 'LR' },
    model: {
      nodes: [
        { id: 'claim', label: 'Expense claim', shape: 'ellipse', width: 144, height: 56 },
        { id: 'limit', label: 'Over 500?', shape: 'diamond', height: 96 },
        { id: 'manager', label: 'Manager approval' },
        { id: 'finance', label: 'Finance review' },
        { id: 'paid', label: 'Paid with payroll', shape: 'document' },
      ],
      edges: [
        { id: 'e1', from: 'claim', to: 'limit' },
        { id: 'e2', from: 'limit', to: 'manager', label: 'No' },
        { id: 'e3', from: 'limit', to: 'finance', label: 'Yes' },
        { id: 'e4', from: 'manager', to: 'paid' },
        { id: 'e5', from: 'finance', to: 'paid' },
      ],
    },
  },
  call: 'Diagram.create(host, $)',
  codeValues: { renderShape: '(node, { width, height, doc }) => doc.createElementNS(\'http://www.w3.org/2000/svg\', \'rect\')', canConnect: '(from, to) => from.id !== to.id' },
  hide: ['renderShape', 'canConnect'],
  mount(stage, options) {
    const h = host(stage);
    const c = Diagram.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
