import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { VirtualList, type VirtualListChangeDetail, type VirtualListOptions, type VirtualListRangeChangeDetail } from '@absoluteui/components/virtual-list';
import { Windowing } from '../src/internal/windowing.js';

// Unit tests do not load the stylesheet: give the list the layout rules its CSS would.
const CSS = `
.aui-virtual-list__viewport { position: relative; block-size: var(--_aui-virtual-list-height); overflow: auto; }
.aui-virtual-list__canvas { position: relative; block-size: var(--_aui-virtual-list-total); }
.aui-virtual-list__item { position: absolute; inset-inline: 0; inset-block-start: 0; box-sizing: border-box; block-size: var(--_aui-virtual-list-item); translate: 0 var(--_aui-virtual-list-y); }
.aui-virtual-list--variable .aui-virtual-list__item { block-size: auto; }
`;

beforeEach(() => {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
  for (const s of document.head.querySelectorAll('style')) s.remove();
});

interface Person {
  id: string;
  name: string;
}

const PEOPLE: Person[] = Array.from({ length: 100_000 }, (_, i) => ({ id: `p${String(i)}`, name: `Person ${String(i).padStart(6, '0')}` }));

function mount(options: Partial<VirtualListOptions<Person>> = {}): VirtualList<Person> {
  const host = document.createElement('div');
  document.body.append(host);
  return VirtualList.create<Person>(host, {
    label: 'People',
    items: PEOPLE,
    itemHeight: 40,
    height: '400px',
    itemKey: (p) => p.id,
    itemText: (p) => p.name,
    renderItem: (p) => document.createTextNode(p.name),
    ...options,
  });
}

const items = (l: VirtualList<Person>): HTMLElement[] => [...l.host.querySelectorAll<HTMLElement>('.aui-virtual-list__item')];
const viewport = (l: VirtualList<Person>): HTMLElement => l.host.querySelector<HTMLElement>('.aui-virtual-list__viewport')!;
const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => { resolve(); }));

describe('Windowing', () => {
  it('computes offsets, ranges, and scroll targets with measured sizes', () => {
    const w = new Windowing(100, 10);
    expect(w.total).toBe(1000);
    expect(w.indexAt(95)).toBe(9);
    expect(w.visible(0, 50)).toEqual({ start: 0, end: 5 });
    expect(w.rendered(500, 50, 2)).toEqual({ start: 48, end: 57 });
    expect(w.setSize(3, 30)).toBe(20);
    expect(w.offsetOf(4)).toBe(60);
    expect(w.total).toBe(1020);
    expect(w.indexAt(45)).toBe(3);
    expect(w.scrollFor(50, 0, 100, 'start')).toBe(520);
    expect(w.scrollFor(50, 0, 100, 'auto')).toBe(430);
    expect(w.scrollFor(50, 500, 100, 'auto')).toBe(500);
  });

  it('keeps measurements when the count grows with the same estimate', () => {
    const w = new Windowing(10, 10);
    w.setSize(2, 50);
    w.reset(20, 10);
    expect(w.sizeOf(2)).toBe(50);
    expect(w.total).toBe(240);
    w.reset(20, 12);
    expect(w.sizeOf(2)).toBe(12);
    expect(new Windowing(0, 10).visible(0, 100)).toEqual({ start: 0, end: 0 });
  });
});

describe('VirtualList', () => {
  it('renders only the window of 100,000 items as a plain list', () => {
    const l = mount();
    const vp = viewport(l);
    expect(vp.getAttribute('role')).toBe('list');
    expect(vp.getAttribute('aria-label')).toBe('People');
    expect(vp.tabIndex).toBe(0);
    // 400 / 40 = 10 visible + 5 overscan below.
    expect(items(l)).toHaveLength(15);
    expect(items(l)[0]!.getAttribute('role')).toBe('listitem');
    expect(items(l)[0]!.getAttribute('aria-setsize')).toBe('100000');
    expect(items(l)[3]!.getAttribute('aria-posinset')).toBe('4');
    expect(l.range).toEqual({ start: 0, end: 10 });
  });

  it('scrolling renders the new window and emits aui-range-change', async () => {
    const l = mount();
    const ranges: VirtualListRangeChangeDetail[] = [];
    l.host.addEventListener('aui-range-change', (e) => ranges.push((e as CustomEvent<VirtualListRangeChangeDetail>).detail));
    l.scrollToIndex(50_000, 'start');
    expect(l.range.start).toBe(50_000);
    expect(ranges.at(-1)).toMatchObject({ start: 50_000, end: 50_010, renderedStart: 49_995, renderedEnd: 50_015 });
    expect(items(l).map((el) => Number(el.dataset.index))).toEqual(Array.from({ length: 20 }, (_, i) => 49_995 + i));
    viewport(l).scrollTop = 0;
    await frame();
    await frame();
    expect(l.range.start).toBe(0);
  });

  it('is a listbox with a roving tab stop; arrows, End, and type-ahead move focus and keep it rendered', async () => {
    const l = mount({ selection: 'single' });
    const vp = viewport(l);
    expect(vp.getAttribute('role')).toBe('listbox');
    expect(vp.hasAttribute('aria-multiselectable')).toBe(false);
    expect(items(l).filter((el) => el.tabIndex === 0)).toHaveLength(1);
    await userEvent.tab();
    expect(document.activeElement).toBe(l.getItemElement(0));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(l.activeIndex).toBe(2);
    expect(document.activeElement).toBe(l.getItemElement(2));
    await userEvent.keyboard('{End}');
    expect(l.activeIndex).toBe(99_999);
    expect(document.activeElement).toBe(l.getItemElement(99_999));
    // Scrolling away keeps the focused item rendered (focus is never lost).
    vp.scrollTop = 0;
    await frame();
    await frame();
    expect(l.getItemElement(99_999)).not.toBeNull();
    expect(document.activeElement).toBe(l.getItemElement(99_999));
    await userEvent.keyboard('{Home}');
    await userEvent.keyboard('Person 00004');
    expect(l.activeIndex).toBe(40);
  });

  it('single selection selects with Space and click; selectionFollowsFocus selects on arrows', async () => {
    const l = mount({ selection: 'single' });
    const changes: VirtualListChangeDetail[] = [];
    l.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<VirtualListChangeDetail>).detail));
    await userEvent.click(l.getItemElement(3)!);
    expect(l.value).toEqual(['p3']);
    expect(l.getItemElement(3)!.getAttribute('aria-selected')).toBe('true');
    await userEvent.keyboard('{ArrowDown} ');
    expect(l.value).toEqual(['p4']);
    expect(changes.map((c) => c.index)).toEqual([3, 4]);
    l.update({ selectionFollowsFocus: true });
    await userEvent.keyboard('{ArrowDown}');
    expect(l.value).toEqual(['p5']);
  });

  it('multiple selection toggles, extends with Shift, and Ctrl+A selects all enabled items', async () => {
    const small = PEOPLE.slice(0, 20);
    const l = mount({ items: small, selection: 'multiple', isDisabled: (_p, i) => i === 3 });
    expect(viewport(l).getAttribute('aria-multiselectable')).toBe('true');
    await userEvent.click(l.getItemElement(0)!);
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}');
    // Item 3 is disabled: skipped by navigation and never selected.
    expect(l.activeIndex).toBe(4);
    expect(l.value).toEqual(['p0', 'p1', 'p2', 'p4']);
    expect(l.getItemElement(3)!.getAttribute('aria-disabled')).toBe('true');
    await userEvent.keyboard(' ');
    expect(l.value).toEqual(['p0', 'p1', 'p2']);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(l.value).toHaveLength(19);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(l.value).toEqual([]);
  });

  it('measures variable heights and keeps offsets consistent', () => {
    const l = mount({
      variableHeight: true,
      items: PEOPLE.slice(0, 1000),
      renderItem: (p) => {
        const el = document.createElement('div');
        el.textContent = p.name;
        el.style.blockSize = Number(p.id.slice(1)) % 2 === 0 ? '20px' : '60px';
        return el;
      },
    });
    const first = l.getItemElement(1)!;
    expect(first.style.getPropertyValue('--_aui-virtual-list-y')).toBe('20px');
    expect(l.getItemElement(2)!.style.getPropertyValue('--_aui-virtual-list-y')).toBe('80px');
  });

  it('shows the empty content without a listbox, and loads more with a polite status', async () => {
    let items1: Person[] = [];
    let calls = 0;
    const empty = document.createElement('p');
    empty.textContent = 'Nobody here';
    const l = mount({ items: items1, selection: 'single', empty, hasMore: false });
    expect(viewport(l).hidden).toBe(true);
    expect(viewport(l).hasAttribute('role')).toBe(false);
    expect(l.host.querySelector('.aui-virtual-list__empty')!.firstChild).toBe(empty);
    l.update({
      hasMore: true,
      loadMore: async () => {
        calls++;
        await Promise.resolve();
        items1 = [...items1, ...PEOPLE.slice(items1.length, items1.length + 5)];
        l.update({ items: items1, hasMore: items1.length < 10 });
      },
    });
    const status = l.host.querySelector('.aui-virtual-list__status')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.textContent).toBe('Loading more items');
    await new Promise((r) => setTimeout(r, 20));
    expect(calls).toBe(2);
    expect(status.textContent).toBe('10 items loaded');
    expect(items(l)[0]!.getAttribute('aria-setsize')).toBe('10');
  });

  it('rejects invalid options before touching the host, and destroy cleans up', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    const render = (p: Person): Node => document.createTextNode(p.name);
    expect(() => VirtualList.create<Person>(host, { label: ' ', items: [], renderItem: render })).toThrow(AbsoluteUIError);
    expect(() => VirtualList.create<Person>(host, { label: 'x', items: [], renderItem: render, itemHeight: 2 })).toThrow(/virtual list/i);
    expect(() => VirtualList.create<Person>(host, { label: 'x', items: [], renderItem: render, height: 'calc(1px)' })).toThrow(AbsoluteUIError);
    expect(() => VirtualList.create<Person>(host, { label: 'x', items: [], renderItem: render, selection: 'single', value: ['a', 'b'] })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const l = mount();
    expect(() => { l.update({ itemHeight: -1 }); }).toThrow(AbsoluteUIError);
    expect(items(l)).toHaveLength(15);
    l.destroy();
    expect(l.host.childElementCount).toBe(0);
    expect(l.host.classList.contains('aui-virtual-list')).toBe(false);
  });
});
