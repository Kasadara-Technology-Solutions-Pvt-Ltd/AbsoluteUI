import { Button } from '@absoluteui/components/button';
import { HoverCard, type HoverCardOptions } from '@absoluteui/components/hover-card';
import { seed } from '../seed.js';

export default seed<HoverCardOptions>({
  options: {
    content: 'Grace Hopper, Engineering manager, Platform team. Based in Boston; on leave until 9 December.',
    placement: 'bottom',
  },
  call: "const trigger = Button.create({ text: 'Grace Hopper', variant: 'ghost' }).element;\nHoverCard.create(trigger, $)",
  note: 'Hover or focus Grace Hopper to show the card.',
  mount(stage, options) {
    const trigger = Button.create({ text: 'Grace Hopper', variant: 'ghost' }, document);
    stage.append(trigger.element);
    const card = HoverCard.create(trigger.element, options);
    return {
      events: card.element,
      update: (p) => { card.update(p); },
      destroy: () => { card.destroy(); trigger.destroy(); trigger.element.remove(); },
    };
  },
});
