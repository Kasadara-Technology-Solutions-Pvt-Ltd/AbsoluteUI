import { OtpInput, type OtpInputOptions } from '@absoluteui/components/otp-input';
import { host, seed } from '../seed.js';

export default seed<OtpInputOptions>({
  options: {
    label: 'Recovery code',
    description: 'Enter the 8-character code from your recovery sheet.',
    length: 8,
    type: 'alphanumeric',
    uppercase: true,
    groupSize: 4,
  },
  call: 'OtpInput.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = OtpInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
