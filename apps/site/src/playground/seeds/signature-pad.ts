import { SignaturePad, type SignaturePadOptions } from '@absoluteui/components/signature-pad';
import { host, seed } from '../seed.js';

export default seed<SignaturePadOptions>({
  options: { label: 'Signature', description: 'Draw with a mouse, pen, or finger, or choose Type to enter your name.', required: true },
  call: 'SignaturePad.create(host, $)',
  note: 'Draw on the pad, or choose Type to sign with your name.',
  mount(stage, options) {
    const h = host(stage);
    const c = SignaturePad.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
