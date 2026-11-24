import { Button } from '@absoluteui/components/button';
import { Dialog, type DialogOptions } from '@absoluteui/components/dialog';
import { seed } from '../seed.js';

export default seed<DialogOptions>({
  options: {
    title: 'Discard changes?',
    description: 'Your edits to this profile have not been saved.',
    content: 'Discarding cannot be undone.',
    actions: [
      { label: 'Keep editing', value: 'keep', variant: 'secondary', autofocus: true },
      { label: 'Discard', value: 'discard', variant: 'danger' },
    ],
  },
  call: 'const dialog = Dialog.create($);\ndialog.open()',
  note: 'Press Open dialog to see the dialog with the current options.',
  mount(stage, options) {
    const dialog = Dialog.create(options, document);
    const open = Button.create({ text: 'Open dialog' }, document);
    open.element.addEventListener('click', () => { dialog.open(); });
    stage.append(open.element);
    return {
      events: dialog.element,
      update: (p) => { dialog.update(p); },
      destroy: () => { dialog.destroy(); open.destroy(); open.element.remove(); },
    };
  },
});
