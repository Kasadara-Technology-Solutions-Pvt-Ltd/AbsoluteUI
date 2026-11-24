import { Button } from '@absoluteui/components/button';
import { Tooltip, type TooltipOptions } from '@absoluteui/components/tooltip';
import { seed } from '../seed.js';

export default seed<TooltipOptions>({
  options: { content: 'Sends the payslips to all 248 employees by email.' },
  call: "const trigger = Button.create({ text: 'Send payslips' }).element;\nTooltip.create(trigger, $)",
  note: 'Hover or focus Send payslips to show the tooltip.',
  mount(stage, options) {
    const trigger = Button.create({ text: 'Send payslips' }, document);
    stage.append(trigger.element);
    const tooltip = Tooltip.create(trigger.element, options);
    return {
      events: tooltip.element,
      update: (p) => { tooltip.update(p); },
      destroy: () => { tooltip.destroy(); trigger.destroy(); trigger.element.remove(); },
    };
  },
});
