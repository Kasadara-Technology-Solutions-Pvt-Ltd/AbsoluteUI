import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Tour, type TourFinishDetail, type TourOptions, type TourSkipDetail, type TourStepChangeDetail, type TourStepMissingDetail } from '@absoluteui/components/tour';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function setup(options: Partial<TourOptions> = {}): { tour: Tour; start: HTMLButtonElement; a: HTMLButtonElement; b: HTMLInputElement } {
  const start = document.createElement('button');
  start.textContent = 'Take the tour';
  const a = document.createElement('button');
  a.id = 'tour-a';
  a.textContent = 'Target A';
  const b = document.createElement('input');
  b.id = 'tour-b';
  b.setAttribute('aria-label', 'Target B');
  const host = document.createElement('div');
  document.body.append(start, a, b, host);
  const tour = Tour.create(host, {
    steps: [
      { id: 'welcome', title: 'Welcome', content: 'A short tour.' },
      { id: 'a', title: 'First target', content: 'This is A.', target: '#tour-a' },
      { id: 'b', title: 'Second target', content: 'This is B.', target: () => b, placement: 'right' },
    ],
    ...options,
  });
  return { tour, start, a, b };
}

function events<T>(host: HTMLElement, name: string): T[] {
  const out: T[] = [];
  host.addEventListener(name, (e) => out.push((e as CustomEvent<T>).detail));
  return out;
}

describe('Tour', () => {
  it('renders a closed panel and overlay as manual popovers', () => {
    const { tour } = setup();
    expect(tour.host.classList.contains('aui-tour')).toBe(true);
    expect(tour.panel.popover).toBe('manual');
    expect(tour.panel.getAttribute('role')).toBe('dialog');
    expect(tour.panel.matches(':popover-open')).toBe(false);
    expect(tour.active).toBe(false);
    expect(tour.index).toBe(-1);
  });

  it('start shows the first step as a named dialog with progress, focused, and emits start and step-change', async () => {
    const { tour, start } = setup();
    start.focus();
    const started = events<{ index: number }>(tour.host, 'aui-start');
    const changes = events<TourStepChangeDetail>(tour.host, 'aui-step-change');
    await tour.start();
    expect(tour.active).toBe(true);
    expect(tour.panel.matches(':popover-open')).toBe(true);
    const title = tour.panel.querySelector('.aui-tour__title')!;
    expect(title.textContent).toBe('Welcome');
    expect(tour.panel.getAttribute('aria-labelledby')).toBe(title.id);
    expect(tour.panel.querySelector('.aui-tour__progress')!.textContent).toBe('1 of 3');
    expect(document.activeElement).toBe(tour.panel);
    expect(tour.host.classList.contains('aui-tour--centered')).toBe(true);
    expect(tour.panel.querySelector<HTMLElement>('.aui-tour__back')!.hidden).toBe(true);
    expect(started).toEqual([{ index: 0 }]);
    expect(changes[0]).toEqual({ index: 0, stepId: 'welcome', previousIndex: null, direction: 'forward' });
  });

  it('anchored steps describe the target while shown and set the spotlight through custom properties', async () => {
    const { tour, a } = setup();
    await tour.start(1);
    expect(tour.target).toBe(a);
    const content = tour.panel.querySelector('.aui-tour__content')!;
    expect(a.getAttribute('aria-describedby')).toContain(content.id);
    const spot = tour.host.querySelector<HTMLElement>('.aui-tour__spotlight')!;
    expect(spot.style.getPropertyValue('--_aui-tour-w')).toMatch(/px$/);
    expect(spot.hasAttribute('style')).toBe(true);
    await tour.next();
    expect(a.getAttribute('aria-describedby') ?? '').not.toContain(content.id);
    tour.finish();
  });

  it('Next becomes Finish on the last step; finishing restores focus and emits aui-finish', async () => {
    const { tour, start } = setup();
    start.focus();
    const finished = events<TourFinishDetail>(tour.host, 'aui-finish');
    await tour.start();
    await tour.next();
    await tour.next();
    const next = tour.panel.querySelector<HTMLButtonElement>('.aui-tour__next')!;
    expect(next.textContent).toBe('Finish');
    expect(tour.panel.querySelector<HTMLElement>('.aui-tour__skip')!.hidden).toBe(true);
    await userEvent.click(next);
    expect(tour.active).toBe(false);
    expect(finished).toEqual([{ index: 2, completed: true }]);
    expect(document.activeElement).toBe(start);
  });

  it('Escape skips the tour (closeOnEscape) and restores focus', async () => {
    const { tour, start } = setup();
    start.focus();
    const skipped = events<TourSkipDetail>(tour.host, 'aui-skip');
    await tour.start();
    await userEvent.keyboard('{Escape}');
    expect(tour.active).toBe(false);
    expect(skipped).toEqual([{ index: 0, stepId: 'welcome', reason: 'escape' }]);
    expect(document.activeElement).toBe(start);
  });

  it('closeOnEscape false keeps the tour open; the Skip button skips', async () => {
    const { tour } = setup({ closeOnEscape: false });
    const skipped = events<TourSkipDetail>(tour.host, 'aui-skip');
    await tour.start();
    await userEvent.keyboard('{Escape}');
    expect(tour.active).toBe(true);
    await userEvent.click(tour.panel.querySelector<HTMLButtonElement>('.aui-tour__skip')!);
    expect(skipped[0]?.reason).toBe('skip-button');
  });

  it('arrow keys move between steps on the panel (mirrored in RTL)', async () => {
    const { tour } = setup();
    await tour.start();
    await userEvent.keyboard('{ArrowRight}');
    expect(tour.index).toBe(1);
    await userEvent.keyboard('{ArrowLeft}');
    expect(tour.index).toBe(0);
    tour.finish();
    document.documentElement.dir = 'rtl';
    try {
      await tour.start();
      await userEvent.keyboard('{ArrowLeft}');
      expect(tour.index).toBe(1);
    } finally {
      document.documentElement.dir = '';
      tour.finish();
    }
  });

  it('skips steps whose target is missing or hidden with aui-step-missing (regression: no console errors)', async () => {
    const { tour, a } = setup();
    a.hidden = true;
    const missing = events<TourStepMissingDetail>(tour.host, 'aui-step-missing');
    tour.update({ steps: [...tour.steps.slice(0, 1), { id: 'gone', title: 'Gone', target: '#does-not-exist' }, ...tour.steps.slice(1)] });
    await tour.start();
    await tour.next();
    expect(tour.steps[tour.index]?.id).toBe('b');
    expect(missing).toEqual([
      { index: 1, stepId: 'gone', reason: 'not-found' },
      { index: 2, stepId: 'a', reason: 'hidden' },
    ]);
    // Back skips the missing steps too.
    await tour.back();
    expect(tour.index).toBe(0);
    tour.finish();
  });

  it('ends with completed false when no later step can be shown', async () => {
    const host = document.createElement('div');
    document.body.append(host);
    const tour = Tour.create(host, { steps: [{ id: 'one', title: 'One' }, { id: 'two', title: 'Two', target: '#nope' }] });
    const finished = events<TourFinishDetail>(host, 'aui-finish');
    await tour.start();
    await tour.next();
    expect(tour.active).toBe(false);
    expect(finished).toEqual([{ index: 0, completed: false }]);
  });

  it('onBeforeShow runs before the lookup; a rejection skips the step', async () => {
    const host = document.createElement('div');
    const late = document.createElement('button');
    late.textContent = 'Late';
    document.body.append(host);
    const missing = events<TourStepMissingDetail>(host, 'aui-step-missing');
    const tour = Tour.create(host, {
      steps: [
        { id: 'fail', title: 'Fails', onBeforeShow: () => Promise.reject(new Error('no')) },
        { id: 'late', title: 'Late target', target: () => late, onBeforeShow: () => { document.body.append(late); } },
      ],
    });
    await tour.start();
    expect(missing[0]).toEqual({ index: 0, stepId: 'fail', reason: 'error' });
    expect(tour.target).toBe(late);
    tour.finish();
  });

  it('modal steps set aria-modal and trap Tab inside the panel', async () => {
    const { tour } = setup({ modal: true });
    await tour.start(1);
    expect(tour.panel.getAttribute('aria-modal')).toBe('true');
    expect(tour.host.classList.contains('aui-tour--modal')).toBe(true);
    for (let i = 0; i < 4; i++) {
      await userEvent.keyboard('{Tab}');
      expect(tour.panel.contains(document.activeElement)).toBe(true);
    }
    tour.update({ modal: false });
    expect(tour.panel.hasAttribute('aria-modal')).toBe(false);
    tour.finish();
  });

  it('follows configuration and locale messages; dots are decorative', async () => {
    configureAbsoluteUI({ components: { tour: { showProgress: false, spotlight: false } } });
    const { tour } = setup({ dots: true });
    await tour.start();
    expect(tour.panel.querySelector<HTMLElement>('.aui-tour__progress')!.hidden).toBe(true);
    expect(tour.host.classList.contains('aui-tour--no-spotlight')).toBe(true);
    const dots = tour.panel.querySelector<HTMLElement>('.aui-tour__dots')!;
    expect(dots.getAttribute('aria-hidden')).toBe('true');
    expect(dots.children.length).toBe(3);
    expect(dots.querySelectorAll('.aui-tour__dot--active').length).toBe(1);
    tour.finish();
  });

  it('Node content is inserted as given; string content as text', async () => {
    const node = document.createElement('strong');
    node.textContent = 'Bold';
    const host = document.createElement('div');
    document.body.append(host);
    const tour = Tour.create(host, { steps: [{ id: 'n', title: 'Node', content: node }, { id: 's', title: 'Text', content: '<b>not html</b>' }] });
    await tour.start();
    expect(tour.panel.querySelector('.aui-tour__content strong')).toBe(node);
    await tour.next();
    const content = tour.panel.querySelector('.aui-tour__content')!;
    expect(content.textContent).toBe('<b>not html</b>');
    expect(content.querySelector('b')).toBeNull();
    tour.finish();
  });

  it('a newer step change cancels a slow hook (no outdated step is shown)', async () => {
    let release: () => void = () => undefined;
    const host = document.createElement('div');
    document.body.append(host);
    const tour = Tour.create(host, {
      steps: [
        { id: 'one', title: 'One' },
        { id: 'slow', title: 'Slow', onBeforeShow: () => new Promise<void>((r) => { release = r; }) },
        { id: 'three', title: 'Three' },
      ],
    });
    await tour.start();
    const pending = tour.next();
    await tour.goTo(2);
    release();
    await pending;
    expect(tour.steps[tour.index]?.id).toBe('three');
    tour.finish();
  });

  it('invalid options throw TOUR_OPTIONS before the host is touched; invalid update keeps state', async () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    const bad: unknown[] = [
      { steps: [] },
      { steps: [{ id: 'a', title: 'A' }, { id: 'a', title: 'B' }] },
      { steps: [{ id: 'a', title: ' ' }] },
      { steps: [{ id: 'a', title: 'A', target: '##bad' }] },
      { steps: [{ id: 'a', title: 'A', placement: 'middle' }] },
      { steps: [{ id: 'a', title: 'A', spotlightPadding: 100 }] },
      { steps: [{ id: 'a', title: 'A' }], dots: 'yes' },
    ];
    for (const options of bad) {
      expect(() => Tour.create(host, options as TourOptions)).toThrow(AbsoluteUIError);
    }
    expect(host.textContent).toBe('keep');
    const { tour } = setup();
    expect(() => {
      tour.update({ steps: [] });
    }).toThrow(/Invalid tour options/);
    expect(tour.steps.length).toBe(3);
    await expect(tour.goTo(9)).rejects.toThrow(AbsoluteUIError);
  });

  it('destroy ends the tour without events and clears the host', async () => {
    const { tour } = setup();
    const finished = events<TourFinishDetail>(tour.host, 'aui-finish');
    await tour.start(1);
    const host = tour.host;
    tour.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-tour')).toBe(false);
    expect(finished).toEqual([]);
    expect(document.getElementById('tour-a')!.hasAttribute('aria-describedby')).toBe(false);
  });

  it('a configuration change after the host left the document reports no error (regression)', async () => {
    const { tour } = setup();
    await tour.start();
    tour.host.remove();
    // Config listener errors are reported through reportError (a window error event), not thrown.
    const errors: unknown[] = [];
    const onError = (e: ErrorEvent): void => {
      errors.push(e.error);
      e.preventDefault();
    };
    window.addEventListener('error', onError);
    try {
      configureAbsoluteUI({ components: { tour: { showProgress: false } } });
      expect(tour.panel.querySelector<HTMLElement>('.aui-tour__progress')!.hidden).toBe(true);
      tour.destroy();
      resetAbsoluteUIConfig();
    } finally {
      window.removeEventListener('error', onError);
    }
    expect(errors).toEqual([]);
  });
  it('a left or right step on a full-width target is placed below it, inside the viewport (regression)', async () => {
    const wide = document.createElement('p');
    wide.textContent = 'Leave balance: 12 days';
    const narrow = document.createElement('button');
    narrow.textContent = 'Narrow';
    const host = document.createElement('div');
    document.body.append(wide, narrow, host);
    const tour = Tour.create(host, {
      steps: [
        { id: 'wide', title: 'Wide target', content: 'Placed right, but there is no room beside it.', target: () => wide, placement: 'right' },
        { id: 'narrow', title: 'Narrow target', content: 'Room on the right.', target: () => narrow, placement: 'right' },
      ],
    });
    await tour.start();
    await new Promise((r) => requestAnimationFrame(r));
    expect(tour.panel.dataset.placement).toMatch(/^(bottom|top)$/);
    const panel = tour.panel.getBoundingClientRect();
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(window.innerWidth);
    await tour.next();
    await new Promise((r) => requestAnimationFrame(r));
    expect(tour.panel.dataset.placement).toBe('right');
    tour.destroy();
  });
});
