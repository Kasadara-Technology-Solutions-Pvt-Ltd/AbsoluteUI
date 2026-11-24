import { Textarea, type TextareaOptions } from '@absoluteui/components/textarea';
import { host, seed } from '../seed.js';

export default seed<TextareaOptions>({
  options: {
    label: 'Reason for leave',
    name: 'leaveReason',
    placeholder: 'For example, family event or medical appointment',
    description: 'Visible to your manager and HR.',
    required: true,
    minLength: 10,
    maxLength: 280,
    showCounter: true,
    resize: 'auto',
    maxRows: 8,
  },
  call: 'Textarea.create(host, $)',
  mount(stage, options) {
    const h = host(stage);
    const c = Textarea.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
