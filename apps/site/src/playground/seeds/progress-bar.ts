import { ProgressBar, type ProgressBarOptions } from '@absoluteui/components/progress-bar';
import { host, seed } from '../seed.js';

export default seed<ProgressBarOptions>({
  options: {
    label: 'Importing employee records',
    description: '159 of 248 records imported.',
    value: 159,
    max: 248,
  },
  call: 'ProgressBar.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = ProgressBar.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
