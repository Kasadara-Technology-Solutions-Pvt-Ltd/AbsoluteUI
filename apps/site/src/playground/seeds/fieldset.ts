import { Checkbox } from '@absoluteui/components/checkbox';
import { Fieldset, type FieldsetOptions } from '@absoluteui/components/fieldset';
import { host, seed } from '../seed.js';

export default seed<FieldsetOptions>({
  options: {
    legend: 'Payslip delivery',
    description: 'Choose at least one way to receive your monthly payslip.',
    required: true,
    error: 'Choose at least one delivery method',
  },
  call: 'Fieldset.enhance(fieldsetElement, $)',
  mount(stage, options) {
    const el = host(stage, 'fieldset');
    const boxes = [
      Checkbox.create(host(el), { label: 'Email', name: 'delivery', value: 'email' }),
      Checkbox.create(host(el), { label: 'Employee portal', name: 'delivery', value: 'portal' }),
      Checkbox.create(host(el), { label: 'Printed copy', name: 'delivery', value: 'print' }),
    ];
    const c = Fieldset.enhance(el, options);
    return {
      events: el,
      update: (p) => { c.update(p); },
      destroy: () => {
        c.destroy();
        for (const b of boxes) b.destroy();
        el.remove();
      },
    };
  },
});
