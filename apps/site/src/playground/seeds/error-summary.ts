import { ErrorSummary, type ErrorSummaryOptions } from '@absoluteui/components/error-summary';
import { NumberInput } from '@absoluteui/components/number-input';
import { TextInput } from '@absoluteui/components/text-input';
import { host, seed } from '../seed.js';

export default seed<ErrorSummaryOptions>({
  options: {
    title: 'There is a problem with this invoice',
    description: 'Fix the following before submitting it for approval.',
    headingLevel: 3,
    // Off in the playground so the page does not jump to the summary on load.
    focusOnShow: false,
  },
  call: "const summary = ErrorSummary.create(host, $);\nsummary.show([{ message: 'Enter the supplier name', target: supplierInput }])",
  note: 'Activate an error link to move focus to its field.',
  mount(stage, options) {
    const h = host(stage);
    const supplierHost = host(stage);
    const amountHost = host(stage);
    const supplier = TextInput.create(supplierHost, { label: 'Supplier', required: true });
    const amount = NumberInput.create(amountHost, { label: 'Amount', min: 0.01, format: { style: 'currency', currency: 'EUR' } });
    const c = ErrorSummary.create(h, options);
    c.show([
      { message: 'Enter the supplier name', target: supplier.input, focus: () => { supplier.focus(); } },
      { message: 'Enter an amount greater than zero', target: amount.input, focus: () => { amount.focus(); } },
    ]);
    return {
      events: h,
      update: (p) => { c.update(p); },
      destroy: () => {
        c.destroy();
        supplier.destroy();
        amount.destroy();
        h.remove();
        supplierHost.remove();
        amountHost.remove();
      },
    };
  },
});
