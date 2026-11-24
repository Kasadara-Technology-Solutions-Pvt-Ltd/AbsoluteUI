import { Spinner, type SpinnerOptions } from '@absoluteui/components/spinner';
import { host, seed } from '../seed.js';

export default seed<SpinnerOptions>({
  options: { label: 'Loading payslips', showLabel: true, size: 'md' },
  call: 'Spinner.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Spinner.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
