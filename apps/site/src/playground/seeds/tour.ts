import { Button } from '@absoluteui/components/button';
import { Tour, type TourOptions } from '@absoluteui/components/tour';
import { host, seed } from '../seed.js';

export default seed<TourOptions>({
  options: {
    steps: [
      { id: 'welcome', title: 'Welcome', content: 'A short tour of this example.' },
      { id: 'search', title: 'Search', content: 'Find people, documents, and pages.', target: '#pg-tour-search', placement: 'bottom' },
      { id: 'missing', title: 'Not on this page', content: 'Skipped: the target does not exist.', target: '#pg-tour-missing' },
      { id: 'save', title: 'Save', content: 'Saves your changes.', target: '#pg-tour-save', placement: 'right' },
    ],
    dots: true,
    skippable: true,
    keyboardNavigation: true,
    modal: false,
    closeOnEscape: true,
    showProgress: true,
    spotlight: true,
    spotlightPadding: 8,
  },
  call: 'const tour = Tour.create(host, $);\nbutton.addEventListener(\'click\', () => tour.start())',
  note: 'Press Start tour. The third step points at a missing element and is skipped (see aui-step-missing in the log).',
  mount(stage, options) {
    const bar = document.createElement('div');
    bar.className = 'pg-tour-bar';
    const start = Button.create({ text: 'Start tour', variant: 'primary' }, document);
    const search = document.createElement('input');
    search.id = 'pg-tour-search';
    search.type = 'search';
    search.setAttribute('aria-label', 'Search');
    const save = Button.create({ text: 'Save', variant: 'secondary' }, document);
    save.element.id = 'pg-tour-save';
    bar.append(start.element, search, save.element);
    stage.append(bar);
    const h = host(stage);
    const tour = Tour.create(h, options);
    start.element.addEventListener('click', () => { void tour.start(); });
    return {
      events: h,
      update: (p) => { tour.update(p); },
      destroy: () => { tour.destroy(); start.destroy(); save.destroy(); bar.remove(); },
    };
  },
});
