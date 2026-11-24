import { Combobox, type ComboboxOptions } from '@absoluteui/components/combobox';
import { host, seed } from '../seed.js';

export default seed<ComboboxOptions>({
  options: {
    label: 'Reporting manager',
    options: [
      { value: 'e101', label: 'Amara Okafor', description: 'Head of Engineering' },
      { value: 'e102', label: 'Lukas Becker', description: 'Finance Director' },
      { value: 'e103', label: 'Priya Raman', description: 'People Partner' },
      { value: 'e104', label: 'Sofia Martins', description: 'Operations Lead' },
      { value: 'e105', label: 'Kenji Watanabe', description: 'On leave', disabled: true },
    ],
    name: 'managerId',
    placeholder: 'Type a name',
    description: 'Approves leave and expenses.',
    required: true,
    filter: 'contains',
  },
  call: 'Combobox.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Combobox.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
