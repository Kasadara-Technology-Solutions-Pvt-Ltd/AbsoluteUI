import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Accordion, type AccordionChangeDetail, type AccordionItem, type AccordionOptions } from '@absoluteui/components/accordion';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const ITEMS: readonly AccordionItem[] = [
  { id: 'a', title: 'Shipping', content: 'Ships in 2 days.' },
  { id: 'b', title: 'Returns', content: 'Free returns.' },
  { id: 'c', title: 'Warranty', content: 'Two years.' },
];

function mount(options: Partial<AccordionOptions> = {}): Accordion {
  const host = document.createElement('div');
  document.body.append(host);
  return Accordion.create(host, { items: ITEMS, ...options });
}

const triggers = (a: Accordion): HTMLButtonElement[] => Array.from(a.host.querySelectorAll<HTMLButtonElement>('.aui-accordion__trigger'));
const panels = (a: Accordion): HTMLElement[] => Array.from(a.host.querySelectorAll<HTMLElement>('.aui-accordion__panel'));
const expanded = (a: Accordion): string[] => triggers(a).map((t) => t.getAttribute('aria-expanded') ?? '');

describe('Accordion: semantics', () => {
  it('renders headings with buttons wired to labelled region panels', () => {
    const a = mount({ value: ['b'] });
    const headings = a.host.querySelectorAll('h3.aui-accordion__heading');
    expect(headings).toHaveLength(3);
    const [t0, t1] = triggers(a);
    const [p0, p1] = panels(a);
    expect(t0!.type).toBe('button');
    expect(t0!.getAttribute('aria-controls')).toBe(p0!.id);
    expect(p0!.getAttribute('aria-labelledby')).toBe(t0!.id);
    expect(p0!.getAttribute('role')).toBe('region');
    expect(expanded(a)).toEqual(['false', 'true', 'false']);
    expect(p0!.hidden).toBe(true);
    expect(p1!.hidden).toBe(false);
    expect(t1!.querySelector('.aui-accordion__icon')!.getAttribute('aria-hidden')).toBe('true');
    expect(a.panel('b')!.textContent).toBe('Free returns.');
    expect(a.panel('zzz')).toBeNull();
  });

  it('honours headingLevel and drops the region role above six items', () => {
    const items = Array.from({ length: 7 }, (_, i) => ({ id: `i${i}`, title: `Item ${i}`, content: `Body ${i}` }));
    const a = mount({ items, headingLevel: 2 });
    expect(a.host.querySelectorAll('h2')).toHaveLength(7);
    expect(panels(a).every((p) => !p.hasAttribute('role'))).toBe(true);
    a.update({ items: items.slice(0, 6) });
    expect(panels(a).every((p) => p.getAttribute('role') === 'region')).toBe(true);
  });

  it('renders string content as text, never HTML, and accepts nodes', () => {
    const node = document.createElement('p');
    node.textContent = 'Node content';
    const a = mount({ items: [{ id: 'x', title: '<b>t</b>', content: '<img src=x onerror=alert(1)>' }, { id: 'y', title: 'Y', content: node }] });
    expect(a.host.querySelector('img')).toBeNull();
    expect(a.host.querySelector('b')).toBeNull();
    expect(a.panel('x')!.textContent).toBe('<img src=x onerror=alert(1)>');
    expect(a.panel('y')!.firstChild).toBe(node);
  });

  it('validates options before rendering anything', () => {
    const host = document.createElement('div');
    expect(() => Accordion.create(host, { items: [{ id: 'a', title: 'A', content: '' }, { id: 'a', title: 'B', content: '' }] })).toThrow(/unique/);
    expect(() => Accordion.create(host, { items: [{ id: 'a', title: ' ', content: '' }] })).toThrow(AbsoluteUIError);
    expect(() => Accordion.create(host, { items: ITEMS, value: ['nope'] })).toThrow(/unknown/);
    expect(() => Accordion.create(host, { items: ITEMS, value: ['a', 'b'] })).toThrow(/at most one/);
    // @ts-expect-error invalid heading level
    expect(() => Accordion.create(host, { items: ITEMS, headingLevel: 1 })).toThrow(AbsoluteUIError);
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });
});

describe('Accordion: interaction', () => {
  it('single mode: expanding one collapses the others and emits aui-change', async () => {
    const a = mount({ value: ['a'] });
    const onChange = vi.fn<(d: AccordionChangeDetail) => void>();
    document.body.addEventListener('aui-change', (e) => {
      onChange((e as CustomEvent<AccordionChangeDetail>).detail);
    });
    await userEvent.click(triggers(a)[1]!);
    expect(a.value).toEqual(['b']);
    expect(expanded(a)).toEqual(['false', 'true', 'false']);
    expect(onChange).toHaveBeenLastCalledWith({ value: ['b'], id: 'b', expanded: true });
    // collapsible by default: the open item can be closed.
    await userEvent.click(triggers(a)[1]!);
    expect(a.value).toEqual([]);
    expect(onChange).toHaveBeenLastCalledWith({ value: [], id: 'b', expanded: false });
  });

  it('multiple mode keeps several panels open', async () => {
    const a = mount({ multiple: true, value: ['a', 'c'] });
    await userEvent.click(triggers(a)[1]!);
    expect(a.value).toEqual(['a', 'b', 'c']);
  });

  it('single non-collapsible mode locks the open header with aria-disabled', () => {
    const a = mount({ collapsible: false, value: ['a'] });
    const [t0, t1] = triggers(a);
    expect(t0!.getAttribute('aria-disabled')).toBe('true');
    expect(t1!.hasAttribute('aria-disabled')).toBe(false);
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    t0!.click();
    expect(a.value).toEqual(['a']);
    t1!.click();
    expect(a.value).toEqual(['b']);
    expect(t0!.hasAttribute('aria-disabled')).toBe(false);
    expect(t1!.getAttribute('aria-disabled')).toBe('true');
  });

  it('disabled items stay focusable but cannot be toggled by the user', () => {
    const a = mount({ items: [...ITEMS.slice(0, 2), { id: 'd', title: 'Disabled', content: 'x', disabled: true }] });
    const t = triggers(a)[2]!;
    expect(t.disabled).toBe(false);
    expect(t.getAttribute('aria-disabled')).toBe('true');
    // Playwright refuses to click aria-disabled elements; dispatch the click directly.
    t.click();
    expect(a.value).toEqual([]);
  });

  it('keyboard: Enter/Space toggle; arrows, Home and End move focus between headers', async () => {
    const a = mount();
    const [t0, t1, t2] = triggers(a);
    await userEvent.tab();
    expect(document.activeElement).toBe(t0);
    await userEvent.keyboard('{Enter}');
    expect(a.value).toEqual(['a']);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(t1);
    await userEvent.keyboard(' ');
    expect(a.value).toEqual(['b']);
    await userEvent.keyboard('{End}');
    expect(document.activeElement).toBe(t2);
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(t0);
    await userEvent.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(t2);
    await userEvent.keyboard('{Home}');
    expect(document.activeElement).toBe(t0);
  });

  it('arrow keys inside panel content are not intercepted', async () => {
    const input = document.createElement('input');
    const a = mount({ items: [{ id: 'f', title: 'Form', content: input }, ITEMS[1]!], value: ['f'] });
    input.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(input);
    expect(a.value).toEqual(['f']);
  });
});

describe('Accordion: programmatic API and configuration', () => {
  it('expand, collapse, toggle and update emit nothing', () => {
    const a = mount({ multiple: true });
    const onChange = vi.fn();
    a.host.addEventListener('aui-change', onChange);
    a.expand('a');
    a.toggle('b');
    expect(a.value).toEqual(['a', 'b']);
    a.collapse('a');
    expect(a.value).toEqual(['b']);
    a.update({ value: ['c'] });
    expect(expanded(a)).toEqual(['false', 'false', 'true']);
    expect(onChange).not.toHaveBeenCalled();
    expect(() => {
      a.expand('zzz');
    }).toThrow(AbsoluteUIError);
  });

  it('keeps focus on the same header when items are re-rendered', async () => {
    const a = mount({ headingLevel: 3 });
    await userEvent.click(triggers(a)[1]!);
    a.update({ headingLevel: 4 });
    expect(a.host.querySelectorAll('h4')).toHaveLength(3);
    expect(document.activeElement).toBe(triggers(a)[1]);
  });

  it('global config applies, instance options win, and switching to single mode keeps one open', () => {
    configureAbsoluteUI({ components: { accordion: { multiple: true, headingLevel: 5 } } });
    const a = mount({ value: ['a', 'b'] });
    expect(a.host.querySelectorAll('h5')).toHaveLength(3);
    const b = mount({ headingLevel: 2 });
    expect(b.host.querySelectorAll('h2')).toHaveLength(3);
    configureAbsoluteUI({ components: { accordion: { multiple: false } } });
    expect(a.value).toEqual(['a']);
    expect(a.host.querySelectorAll('h3')).toHaveLength(3);
  });

  it('destroy removes rendering, listeners, and subscriptions', async () => {
    const a = mount();
    const host = a.host;
    const trigger = triggers(a)[0]!;
    a.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.classList.contains('aui-accordion')).toBe(false);
    host.append(trigger);
    const onChange = vi.fn();
    host.addEventListener('aui-change', onChange);
    await userEvent.click(trigger);
    expect(onChange).not.toHaveBeenCalled();
    configureAbsoluteUI({ components: { accordion: { headingLevel: 6 } } });
    expect(host.querySelector('h6')).toBeNull();
  });
});
