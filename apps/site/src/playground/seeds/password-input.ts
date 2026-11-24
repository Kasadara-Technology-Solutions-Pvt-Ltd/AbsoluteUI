import { PasswordInput, type PasswordInputOptions } from '@absoluteui/components/password-input';
import { host, seed } from '../seed.js';

export default seed<PasswordInputOptions>({
  options: {
    label: 'New password',
    description: 'At least 12 characters. Avoid reusing a password from another site.',
    autocomplete: 'new-password',
    required: true,
    minLength: 12,
    capsLockWarning: true,
  },
  call: 'PasswordInput.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = PasswordInput.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); h.remove(); } };
  },
});
