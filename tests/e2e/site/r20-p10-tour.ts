// R20 P10 page: Tour (docs/PLAN-R20.md), bundled against the built packages.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { Stack } from '@absoluteui/components/layout';
import { Tour, type TourFinishDetail, type TourSkipDetail, type TourStepChangeDetail, type TourStepMissingDetail } from '@absoluteui/components/tour';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });
// Push the last section below the fold so scrolling into view is exercised.
byId('far').style.setProperty('margin-block-start', '150vh');

const toolbar = byId('toolbar');
const startButton = Button.create({ text: 'Take the tour', variant: 'primary' });
startButton.element.id = 'start-tour';
const modalButton = Button.create({ text: 'Modal tour', variant: 'secondary' });
modalButton.element.id = 'start-modal';
const search = document.createElement('input');
search.id = 'search';
search.type = 'search';
search.setAttribute('aria-label', 'Search');
toolbar.append(startButton.element, modalButton.element, search);

const log = byId('tour-log');
const tourHost = byId('tour');
const tour = Tour.create(tourHost, {
  dots: true,
  steps: [
    { id: 'welcome', title: 'Welcome to PeopleHub', content: 'A short tour of your dashboard.' },
    { id: 'search', title: 'Search', content: 'Find people, documents, and pages.', target: '#search' },
    { id: 'missing', title: 'Missing', content: 'This target does not exist.', target: '#no-such-element' },
    { id: 'balance', title: 'Leave balance', content: 'Your remaining days.', target: '#balance', placement: 'right' },
    { id: 'reports', title: 'Reports', content: 'Scrolled into view.', target: '#reports', placement: 'top' },
  ],
});
tourHost.addEventListener('aui-step-change', (e) => {
  const d = (e as CustomEvent<TourStepChangeDetail>).detail;
  log.textContent = `Step ${d.stepId} (${String(d.index)}) ${d.direction}`;
});
tourHost.addEventListener('aui-step-missing', (e) => {
  const d = (e as CustomEvent<TourStepMissingDetail>).detail;
  log.dataset.missing = `${d.stepId}:${d.reason}`;
});
tourHost.addEventListener('aui-finish', (e) => {
  log.textContent = `Finished (completed ${String((e as CustomEvent<TourFinishDetail>).detail.completed)})`;
});
tourHost.addEventListener('aui-skip', (e) => {
  log.textContent = `Skipped by ${(e as CustomEvent<TourSkipDetail>).detail.reason}`;
});
startButton.element.addEventListener('click', () => {
  void tour.start();
});

const modalHost = byId('tour-modal');
const modal = Tour.create(modalHost, {
  modal: true,
  steps: [
    { id: 'm-search', title: 'Modal search', content: 'The page is blocked while this step is open.', target: '#search' },
    { id: 'm-done', title: 'All set', content: 'Finish to return.' },
  ],
});
modalHost.addEventListener('aui-finish', () => {
  log.textContent = 'Modal finished';
});
modalButton.element.addEventListener('click', () => {
  void modal.start();
});

Object.assign(window, { __auiReady: true, __tour: tour, __modalTour: modal });
