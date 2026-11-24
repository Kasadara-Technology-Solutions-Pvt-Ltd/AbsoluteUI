import { ButtonGroup, type ButtonGroupOptions } from '@absoluteui/components/button-group';
import { host, seed } from '../seed.js';

export default seed<ButtonGroupOptions>({
  options: {
    label: 'Timesheet actions',
    buttons: [
      { text: 'Save draft', value: 'save' },
      { text: 'Submit', value: 'submit', variant: 'primary' },
      { text: 'Withdraw', value: 'withdraw', disabled: true },
    ],
    attached: true,
  },
  call: 'ButtonGroup.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = ButtonGroup.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
