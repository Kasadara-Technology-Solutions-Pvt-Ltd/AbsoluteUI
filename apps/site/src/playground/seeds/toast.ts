import { Button } from '@absoluteui/components/button';
import { Toaster, type ToasterOptions } from '@absoluteui/components/toast';
import { seed } from '../seed.js';

export default seed<ToasterOptions>({
  options: { position: 'top-end', max: 2, duration: 8000 },
  call: "const toaster = Toaster.create($);\ntoaster.show({ tone: 'success', title: 'Leave approved', message: 'Ada Lovelace, 2 to 6 December.' })",
  note: 'Press Show toast to add a toast with the current Toaster options.',
  mount(stage, options) {
    const toaster = Toaster.create(options, document);
    const show = Button.create({ text: 'Show toast' }, document);
    let count = 0;
    show.element.addEventListener('click', () => {
      count += 1;
      toaster.show({
        tone: 'success',
        title: 'Leave approved',
        message: `Request ${String(count)}: Ada Lovelace, 2 to 6 December.`,
        action: { label: 'Undo' },
      });
    });
    stage.append(show.element);
    return {
      events: toaster.element,
      update: (p) => { toaster.update(p); },
      destroy: () => { toaster.clear(); toaster.destroy(); show.destroy(); show.element.remove(); },
    };
  },
});
