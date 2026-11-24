import { PasswordInput } from '@absoluteui/components/password-input';
import { PasswordStrengthMeter, type PasswordStrengthMeterOptions } from '@absoluteui/components/password-strength-meter';
import { host, seed } from '../seed.js';

export default seed<PasswordStrengthMeterOptions>({
  options: { label: 'Password strength', showRequirements: true },
  call: "const password = PasswordInput.create(inputHost, { label: 'New password', autocomplete: 'new-password' });\nconst meter = PasswordStrengthMeter.create(host, $);\nmeter.attach(password);\npassword.update({ describedBy: [meter.describedById] })",
  hide: ['input'],
  note: 'Type a password in the field; the meter follows it.',
  mount(stage, options) {
    const inputHost = host(stage);
    const password = PasswordInput.create(inputHost, { label: 'New password', autocomplete: 'new-password' });
    const h = host(stage);
    const meter = PasswordStrengthMeter.create(h, options);
    meter.attach(password);
    password.update({ describedBy: [meter.describedById] });
    return {
      events: h,
      update: (p) => { meter.update(p); },
      destroy: () => { meter.destroy(); password.destroy(); h.remove(); inputHost.remove(); },
    };
  },
});
