import { Kbd, type KbdOptions } from '@absoluteui/components/kbd';
import { host, seed } from '../seed.js';

export default seed<KbdOptions>({
  options: { hotkey: 'Mod+Shift+K', platform: 'auto' },
  call: 'Kbd.create(host, $)',
  mount(stage, options) {
    const h = host(stage, 'span');
    const c = Kbd.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
