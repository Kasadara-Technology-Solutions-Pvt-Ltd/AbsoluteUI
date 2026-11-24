import { MaskedInput, MASK_PRESETS, type MaskedInputOptions } from '@absoluteui/components/masked-input';
import { host, seed } from '../seed.js';

export default seed<MaskedInputOptions>({
  options: { label: 'Mobile phone', name: 'phone', mask: MASK_PRESETS.phoneUs.mask, example: '(555) 010-0199', inputMode: 'tel', autocomplete: 'tel-national' },
  call: 'MaskedInput.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = MaskedInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
