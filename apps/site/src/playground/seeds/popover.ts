import { Button } from '@absoluteui/components/button';
import { Popover, type PopoverOptions } from '@absoluteui/components/popover';
import { seed } from '../seed.js';

export default seed<PopoverOptions>({
  options: {
    title: 'Leave balance',
    content: 'Annual leave: 14 days left. Sick leave: 6 days used this year. Balances update every night.',
    showCloseButton: true,
  },
  call: "const trigger = Button.create({ text: 'Leave balance' }).element;\nPopover.create(trigger, $)",
  note: 'Press Leave balance to open the popover.',
  mount(stage, options) {
    const trigger = Button.create({ text: 'Leave balance' }, document);
    stage.append(trigger.element);
    const popover = Popover.create(trigger.element, options);
    return {
      events: popover.element,
      update: (p) => { popover.update(p); },
      destroy: () => { popover.destroy(); trigger.destroy(); trigger.element.remove(); },
    };
  },
});
