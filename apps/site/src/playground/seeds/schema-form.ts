import { SchemaForm, type SchemaFormOptions } from '@absoluteui/components/schema-form';
import { host, seed } from '../seed.js';

export default seed<SchemaFormOptions>({
  options: {
    schema: {
      type: 'object',
      title: 'Leave request',
      required: ['type', 'from'],
      properties: {
        type: { type: 'string', title: 'Leave type', oneOf: [{ const: 'annual', title: 'Annual leave' }, { const: 'sick', title: 'Sick leave' }, { const: 'other', title: 'Other' }] },
        reason: { type: 'string', title: 'Reason', maxLength: 500 },
        from: { type: 'string', title: 'First day', format: 'date' },
        days: { type: 'integer', title: 'Working days', minimum: 1, maximum: 30 },
      },
    },
    uiSchema: { columns: 2, fields: { reason: { widget: 'textarea', span: 2, visibleIf: { field: 'type', equals: 'other' } } } },
    submitLabel: 'Request leave',
  },
  call: 'SchemaForm.create(host, $)',
  hide: ['validate', 'businessCalendar'],
  mount(stage, options) {
    const h = host(stage);
    const c = SchemaForm.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
