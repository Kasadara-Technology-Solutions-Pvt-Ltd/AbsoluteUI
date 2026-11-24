import { MultiSelect, type MultiSelectOptions } from '@absoluteui/components/multi-select';
import { host, seed } from '../seed.js';

export default seed<MultiSelectOptions>({
  options: {
    label: 'Skills',
    options: [
      { value: 'ts', label: 'TypeScript' },
      { value: 'sql', label: 'SQL', description: 'PostgreSQL, SQL Server' },
      { value: 'payroll', label: 'Payroll processing' },
      { value: 'recruiting', label: 'Recruiting' },
      { value: 'excel', label: 'Spreadsheet modelling' },
      { value: 'legacy', label: 'COBOL', disabled: true },
    ],
    value: ['ts', 'sql'],
    name: 'skills',
    placeholder: 'Add skills',
    description: 'Choose up to four.',
    maxSelected: 4,
    selectAll: true,
  },
  call: 'MultiSelect.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = MultiSelect.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
