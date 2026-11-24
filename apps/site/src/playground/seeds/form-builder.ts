import { FormBuilder, type FormBuilderOptions } from '@absoluteui/components/form-builder';
import { host, seed } from '../seed.js';

export default seed<FormBuilderOptions>({
  options: {
    label: 'Leave request form',
    schema: {
      type: 'object',
      title: 'Leave request',
      required: ['from'],
      properties: {
        type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual leave' }, { const: 'sick', title: 'Sick leave' }] },
        from: { type: 'string', title: 'First day', format: 'date' },
      },
    },
  },
  call: 'FormBuilder.create(host, $)',
  hide: ['icons'],
  mount(stage, options) {
    const h = host(stage);
    const c = FormBuilder.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
