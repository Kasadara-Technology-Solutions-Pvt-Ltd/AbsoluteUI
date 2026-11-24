import { TransferList, type TransferListOptions } from '@absoluteui/components/transfer-list';
import { host, seed } from '../seed.js';

export default seed<TransferListOptions>({
  options: {
    label: 'Project team',
    items: [
      { value: 'e1', label: 'Asha Rao', description: 'Engineering' },
      { value: 'e2', label: 'Ben Okafor', description: 'Design' },
      { value: 'e3', label: 'Chen Wei', description: 'Engineering' },
      { value: 'e4', label: 'Dana Silva', description: 'On leave', disabled: true },
      { value: 'e5', label: 'Eve Martin', description: 'Finance' },
      { value: 'e6', label: 'Farid Haddad', description: 'People' },
    ],
    value: ['e2'],
    titles: { available: 'Employees', selected: 'Team' },
  },
  call: 'TransferList.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = TransferList.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
