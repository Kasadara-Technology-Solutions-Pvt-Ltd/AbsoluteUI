import { TextInput } from '@absoluteui/components/text-input';
import { ValidationMessage, type ValidationMessageOptions } from '@absoluteui/components/validation-message';
import { host, seed } from '../seed.js';

export default seed<ValidationMessageOptions>({
  options: {
    message: 'This cost centre is closed for new expenses.',
    tone: 'warning',
  },
  call: 'ValidationMessage.create(host, $)',
  codeValues: { for: "document.querySelector<HTMLInputElement>('#cost-centre')" },
  // The mount links the message to the input it creates.
  hide: ['for'],
  note: 'The message describes the cost centre input above it; the error tone also marks the input invalid.',
  mount(stage, options) {
    const inputHost = host(stage);
    const input = TextInput.create(inputHost, { label: 'Cost centre', value: 'CC-4410' });
    const h = host(stage);
    const c = ValidationMessage.create(h, { ...options, for: input.input });
    return {
      events: h,
      update: (p) => { c.update(p); },
      destroy: () => {
        c.destroy();
        input.destroy();
        h.remove();
        inputHost.remove();
      },
    };
  },
});
