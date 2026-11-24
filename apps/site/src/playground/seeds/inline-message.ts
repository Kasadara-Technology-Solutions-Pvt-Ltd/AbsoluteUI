import { InlineMessage, type InlineMessageOptions } from '@absoluteui/components/inline-message';
import { host, seed } from '../seed.js';

export default seed<InlineMessageOptions>({
  options: { tone: 'success', message: 'Bank details saved. They apply from the next payroll run.' },
  call: 'InlineMessage.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = InlineMessage.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
