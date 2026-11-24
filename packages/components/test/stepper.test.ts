import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Stepper, type StepperChangeDetail, type StepperNavigateDetail, type StepperStep } from '@absoluteui/components/stepper';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const steps: StepperStep[] = [
  { id: 'cart', label: 'Cart', status: 'complete' },
  { id: 'shipping', label: 'Shipping', description: 'Address and method' },
  { id: 'gift', label: 'Gift options', optional: true },
  { id: 'payment', label: 'Payment' },
];

function mount(options: Partial<Parameters<typeof Stepper.create>[1]> = {}): Stepper {
  const host = document.createElement('div');
  document.body.append(host);
  return Stepper.create(host, { label: 'Checkout progress', steps, value: 'shipping', ...options });
}

const control = (s: Stepper, index: number): HTMLElement => s.host.querySelectorAll<HTMLElement>('.aui-stepper__control')[index]!;

describe('Stepper: semantics', () => {
  it('renders a labelled nav with an ordered list; the current step has aria-current="step"', () => {
    const s = mount();
    expect(s.nav.tagName).toBe('NAV');
    expect(s.nav.getAttribute('aria-label')).toBe('Checkout progress');
    expect(s.nav.querySelector('ol')).not.toBeNull();
    expect(s.host.querySelectorAll('li')).toHaveLength(4);
    expect(control(s, 1).getAttribute('aria-current')).toBe('step');
    expect(s.host.querySelectorAll('[aria-current]')).toHaveLength(1);
    expect(s.host.classList.contains('aui-stepper--horizontal')).toBe(true);
  });

  it('conveys states as text: completed, error, optional; indicators are hidden from AT', () => {
    const s = mount({ steps: [{ id: 'a', label: 'A', status: 'complete' }, { id: 'b', label: 'B', status: 'error' }, { id: 'c', label: 'C', optional: true }], value: 'c', linear: false });
    expect(control(s, 0).textContent).toContain('Completed');
    expect(control(s, 1).textContent).toContain('Error');
    expect(control(s, 2).textContent).toContain('Optional');
    for (const i of s.host.querySelectorAll('.aui-stepper__indicator')) expect(i.getAttribute('aria-hidden')).toBe('true');
    expect(s.state('a')).toBe('complete');
    expect(s.state('b')).toBe('error');
    expect(s.state('c')).toBe('current');
    expect(s.state('zzz')).toBeNull();
  });

  it('linear: earlier steps are buttons, later ones text until every step before them is complete', () => {
    const s = mount();
    expect(control(s, 0).tagName).toBe('BUTTON');
    expect(control(s, 1).tagName).toBe('SPAN');
    expect(control(s, 2).tagName).toBe('SPAN');
    expect(s.isReachable('gift')).toBe(false);
    s.update({ steps: steps.map((st) => (st.id === 'shipping' ? { ...st, status: 'complete' as const } : st)) });
    expect(s.isReachable('gift')).toBe(true);
    expect(s.isReachable('payment')).toBe(false);
    expect(control(s, 2).tagName).toBe('BUTTON');
  });

  it('non-linear: every other enabled step is reachable; disabled steps never are', () => {
    const s = mount({ linear: false, steps: steps.map((st) => (st.id === 'payment' ? { ...st, disabled: true } : st)) });
    expect(s.isReachable('gift')).toBe(true);
    expect(s.isReachable('payment')).toBe(false);
    expect(control(s, 3).tagName).toBe('SPAN');
    expect(s.host.querySelector('li:last-child')!.getAttribute('data-disabled')).toBe('true');
  });

  it('steps with href render as links', () => {
    const s = mount({ steps: steps.map((st) => ({ ...st, href: `#${st.id}` })) });
    const a = control(s, 0);
    expect(a.tagName).toBe('A');
    expect(a.getAttribute('href')).toBe('#cart');
  });
});

describe('Stepper: interaction', () => {
  it('activation emits cancelable aui-navigate, then moves the current step and emits aui-change', async () => {
    const s = mount();
    const nav: StepperNavigateDetail[] = [];
    const changes: StepperChangeDetail[] = [];
    s.host.addEventListener('aui-navigate', (e) => nav.push((e as CustomEvent<StepperNavigateDetail>).detail));
    s.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<StepperChangeDetail>).detail));
    await userEvent.click(control(s, 0));
    expect(nav).toEqual([{ id: 'cart', index: 0, step: steps[0], previous: 'shipping' }]);
    expect(changes).toEqual([{ value: 'cart', previous: 'shipping' }]);
    expect(s.value).toBe('cart');
    // Focus stays on the (now current) step instead of falling back to <body>.
    expect(document.activeElement).toBe(control(s, 0));
  });

  it('preventDefault on aui-navigate keeps the current step (guard)', async () => {
    const s = mount();
    s.host.addEventListener('aui-navigate', (e) => {
      e.preventDefault();
    });
    let changed = false;
    s.host.addEventListener('aui-change', () => {
      changed = true;
    });
    await userEvent.click(control(s, 0));
    expect(s.value).toBe('shipping');
    expect(changed).toBe(false);
  });

  it('keyboard: steps are reached with Tab and activated with Enter', async () => {
    const before = document.createElement('button');
    before.textContent = 'Before';
    document.body.append(before);
    const s = mount({ linear: false });
    before.focus();
    await userEvent.tab();
    expect(document.activeElement).toBe(control(s, 0));
    await userEvent.tab();
    expect(document.activeElement).toBe(control(s, 2));
    await userEvent.keyboard('{Enter}');
    expect(s.value).toBe('gift');
  });

  it('modified clicks on link steps stay native and are not reported', () => {
    const s = mount({ steps: steps.map((st) => ({ ...st, href: `#${st.id}` })) });
    let reported = false;
    s.host.addEventListener('aui-navigate', (e) => {
      reported = true;
      e.preventDefault();
    });
    const event = new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true });
    control(s, 0).addEventListener('click', (e) => {
      e.preventDefault();
    });
    control(s, 0).dispatchEvent(event);
    expect(reported).toBe(false);
  });

  it('select() changes the current step without events', () => {
    const s = mount();
    let events = 0;
    s.host.addEventListener('aui-change', () => events++);
    s.select('payment');
    expect(s.value).toBe('payment');
    expect(control(s, 3).getAttribute('aria-current')).toBe('step');
    expect(events).toBe(0);
    expect(() => {
      s.select('nope');
    }).toThrow(AbsoluteUIError);
  });
});

describe('Stepper: options', () => {
  it('orientation from global configuration and RTL direction', () => {
    configureAbsoluteUI({ components: { stepper: { orientation: 'vertical' } } });
    const s = mount({ direction: 'rtl' });
    expect(s.host.classList.contains('aui-stepper--vertical')).toBe(true);
    expect(s.nav.dir).toBe('rtl');
    s.update({ direction: 'ltr' });
    expect(s.nav.hasAttribute('dir')).toBe(false);
  });

  it('(regression) focus stays on the same step across update() and config changes', () => {
    const s = mount();
    control(s, 0).focus();
    s.update({ steps: steps.map((st) => (st.id === 'shipping' ? { ...st, status: 'error' as const } : st)) });
    expect(document.activeElement).toBe(control(s, 0));
    configureAbsoluteUI({ components: { stepper: { linear: false } } });
    expect(document.activeElement).toBe(control(s, 0));
  });

  it('strings render as text, never HTML', () => {
    const s = mount({ steps: [{ id: 'x', label: '<b>bold</b>', description: '<i>x</i>' }], value: 'x' });
    expect(s.host.querySelector('b, i')).toBeNull();
    expect(s.host.textContent).toContain('<b>bold</b>');
  });

  it('validates before rendering and destroys cleanly', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    const bad: Parameters<typeof Stepper.create>[1][] = [
      { label: '', steps },
      { label: 'x', steps: [] },
      { label: 'x', steps: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] },
      { label: 'x', steps, value: 'missing' },
      { label: 'x', steps: [{ id: 'a', label: 'A', href: 'javascript:alert(1)' }] },
      { label: 'x', steps: [{ id: 'a', label: 'A', status: 'done' as 'complete' }] },
      { label: 'x', steps, orientation: 'diagonal' as 'vertical' },
    ];
    for (const options of bad) expect(() => Stepper.create(host, options)).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const s = Stepper.create(host, { label: 'x', steps });
    expect(s.value).toBe('cart');
    s.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });
});
