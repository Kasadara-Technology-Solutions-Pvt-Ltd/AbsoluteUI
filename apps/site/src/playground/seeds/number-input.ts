import { NumberInput, type NumberInputOptions } from '@absoluteui/components/number-input';
import { host, seed } from '../seed.js';

export default seed<NumberInputOptions>({
  options: {
    label: 'Annual salary',
    name: 'salary',
    value: 58500,
    description: 'Gross, before tax and deductions.',
    required: true,
    min: 0,
    max: 500000,
    step: 500,
    format: { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 },
  },
  call: 'NumberInput.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = NumberInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
