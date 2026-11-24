import { Button, type ButtonOptions } from '@absoluteui/components/button';
import { seed } from '../seed.js';

type Options = ButtonOptions & { text?: string };

export default seed<Options>({
  options: { text: 'Approve leave', variant: 'primary', icon: 'check' },
  call: 'Button.create($, document)',
  hide: ['text'],
  mount(stage, options) {
    const c = Button.create(options, document);
    stage.append(c.element);
    return {
      events: c.element,
      update: (p) => { c.update(p); },
      destroy: () => { c.destroy(); c.element.remove(); },
    };
  },
});
