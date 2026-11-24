import { BottomSheet, type BottomSheetOptions } from '@absoluteui/components/bottom-sheet';
import { Button } from '@absoluteui/components/button';
import { seed } from '../seed.js';

export default seed<BottomSheetOptions>({
  options: {
    title: 'Clock in',
    description: 'Thursday, 9:02 at Head office.',
    content: 'Your shift runs 9:00 to 17:30 with a 30 minute break. Drag the handle to resize the sheet.',
    snapPoints: [0.4, 0.9],
  },
  call: 'const sheet = BottomSheet.create($);\nsheet.open()',
  note: 'Press Open sheet to see the bottom sheet with the current options.',
  mount(stage, options) {
    const sheet = BottomSheet.create(options, document);
    const open = Button.create({ text: 'Open sheet' }, document);
    open.element.addEventListener('click', () => { sheet.open(); });
    stage.append(open.element);
    return {
      events: sheet.element,
      update: (p) => { sheet.update(p); },
      destroy: () => { sheet.destroy(); open.destroy(); open.element.remove(); },
    };
  },
});
