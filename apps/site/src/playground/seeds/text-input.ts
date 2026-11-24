import { TextInput, type TextInputOptions } from '@absoluteui/components/text-input';
import { host, seed } from '../seed.js';

export default seed<TextInputOptions>({
  options: {
    label: 'Work email',
    type: 'email',
    name: 'workEmail',
    placeholder: 'name@company.com',
    description: 'Use your company address; payslips are sent here.',
    required: true,
    maxLength: 60,
    showCounter: true,
    autocomplete: 'email',
    validate: (value) => (value === '' || value.endsWith('@company.com') ? null : 'Use an address ending in @company.com.'),
  },
  codeValues: {
    validate: "(value) => (value === '' || value.endsWith('@company.com') ? null : 'Use an address ending in @company.com.')",
  },
  call: 'TextInput.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = TextInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
