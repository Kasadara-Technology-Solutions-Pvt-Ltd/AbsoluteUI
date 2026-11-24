import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Dialog } from '@absoluteui/components/dialog';
import { SortableList, type SortableListChangeDetail, type SortableListItem } from '@absoluteui/components/sortable-list';

const created: SortableList[] = [];

afterEach(() => {
  for (const l of created.splice(0)) l.destroy();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const items: SortableListItem[] = [
  { id: 'a', label: 'Apples' },
  { id: 'b', label: 'Bananas' },
  { id: 'c', label: 'Cherries' },
  { id: 'd', label: 'Dates' },
];

function mount(options: Partial<Parameters<typeof SortableList.create>[1]> = {}, parent: HTMLElement = document.body): SortableList {
  const host = document.createElement('div');
  // Real layout for pointer tests (component CSS is not loaded in unit tests).
  host.style.setProperty('inline-size', '300px');
  parent.append(host);
  const list = SortableList.create(host, { label: 'Fruit', items, ...options });
  for (const li of list.list.children) {
    if (li instanceof HTMLElement) {
      li.style.setProperty('display', 'flex');
      li.style.setProperty('block-size', '40px');
    }
  }
  created.push(list);
  return list;
}

const handle = (l: SortableList, id: string): HTMLButtonElement => l.list.querySelector<HTMLButtonElement>(`li[data-id="${id}"] .aui-sortable-list__handle`)!;
const liveText = async (): Promise<string> => {
  await new Promise((r) => requestAnimationFrame(() => {
    r(null);
  }));
  return document.querySelector('[data-aui-live-region="assertive"]')?.textContent ?? '';
};

function changes(l: SortableList): SortableListChangeDetail[] {
  const out: SortableListChangeDetail[] = [];
  l.host.addEventListener('aui-change', (e) => out.push((e as CustomEvent<SortableListChangeDetail>).detail));
  return out;
}

describe('SortableList: semantics', () => {
  it('renders a labelled list with a named handle button per item and hidden instructions', () => {
    const l = mount();
    expect(l.list.tagName).toBe('UL');
    expect(l.list.getAttribute('aria-label')).toBe('Fruit');
    const h = handle(l, 'b');
    expect(h.tagName).toBe('BUTTON');
    expect(h.getAttribute('aria-label')).toBe('Reorder Bananas');
    expect(h.getAttribute('aria-pressed')).toBe('false');
    const help = document.getElementById(h.getAttribute('aria-describedby')!)!;
    expect(help.textContent).toContain('Space or Enter');
    expect(l.order).toEqual(['a', 'b', 'c', 'd']);
  });
});

describe('SortableList: keyboard reordering', () => {
  it('Space grabs, arrows move (announced), Space drops and emits the new order; focus stays on the handle', async () => {
    const l = mount();
    const got = changes(l);
    handle(l, 'b').focus();
    await userEvent.keyboard(' ');
    expect(handle(l, 'b').getAttribute('aria-pressed')).toBe('true');
    expect(await liveText()).toBe('Grabbed Bananas. Current position 2 of 4.');
    await userEvent.keyboard('{ArrowDown}');
    expect(l.order).toEqual(['a', 'c', 'b', 'd']);
    expect(await liveText()).toBe('Bananas moved to position 3 of 4.');
    expect(document.activeElement).toBe(handle(l, 'b'));
    await userEvent.keyboard('{ArrowDown}{ArrowDown}');
    expect(l.order).toEqual(['a', 'c', 'd', 'b']);
    await userEvent.keyboard(' ');
    expect(await liveText()).toBe('Dropped Bananas at position 4 of 4.');
    expect(handle(l, 'b').getAttribute('aria-pressed')).toBe('false');
    expect(got).toEqual([{ order: ['a', 'c', 'd', 'b'], id: 'b', from: 1, to: 3 }]);
  });

  it('Home/End jump; Enter also grabs and drops; dropping in place emits nothing', async () => {
    const l = mount();
    const got = changes(l);
    handle(l, 'c').focus();
    await userEvent.keyboard('{Enter}{Home}');
    expect(l.order).toEqual(['c', 'a', 'b', 'd']);
    await userEvent.keyboard('{End}{Enter}');
    expect(l.order).toEqual(['a', 'b', 'd', 'c']);
    await userEvent.keyboard('{Enter}{Enter}');
    expect(got).toHaveLength(1);
  });

  it('Escape cancels and restores the original position without closing an enclosing dialog', async () => {
    const dialog = Dialog.create({ title: 'Order' });
    dialog.open();
    const l = mount({}, dialog.body);
    const got = changes(l);
    handle(l, 'a').focus();
    await userEvent.keyboard(' {ArrowDown}{ArrowDown}');
    expect(l.order).toEqual(['b', 'c', 'a', 'd']);
    await userEvent.keyboard('{Escape}');
    expect(l.order).toEqual(['a', 'b', 'c', 'd']);
    expect(dialog.isOpen).toBe(true);
    expect(await liveText()).toBe('Reorder canceled. Apples returned to position 1 of 4.');
    expect(got).toEqual([]);
    expect(document.activeElement).toBe(handle(l, 'a'));
    // The live region follows the modal (announcements inside a dialog are not lost).
    expect(dialog.element.querySelector('[data-aui-live-region]')).not.toBeNull();
    dialog.destroy();
  });

  it('Tab away while grabbed cancels', async () => {
    const l = mount();
    handle(l, 'a').focus();
    await userEvent.keyboard(' {ArrowDown}');
    await userEvent.tab();
    expect(l.order).toEqual(['a', 'b', 'c', 'd']);
    expect(l.isDragging).toBe(false);
  });

  it('disabled items cannot be grabbed; the whole list can be disabled', async () => {
    const l = mount({ items: items.map((i) => (i.id === 'a' ? { ...i, disabled: true } : i)) });
    expect(handle(l, 'a').disabled).toBe(true);
    handle(l, 'b').focus();
    await userEvent.keyboard(' {ArrowUp} ');
    // Other items can still move past a disabled one.
    expect(l.order).toEqual(['b', 'a', 'c', 'd']);
    l.update({ disabled: true });
    expect(handle(l, 'c').disabled).toBe(true);
    expect(l.host.classList.contains('aui-sortable-list--disabled')).toBe(true);
  });
});

describe('SortableList: pointer', () => {
  it('dragging the handle reorders with real pointer events and emits aui-change', async () => {
    const l = mount();
    const got = changes(l);
    // Drop just below the centre of the third item (a tie at the centre does not swap).
    await userEvent.dragAndDrop(handle(l, 'a'), handle(l, 'c'), { targetPosition: { x: 4, y: 20 } });
    expect(l.order).toEqual(['b', 'c', 'a', 'd']);
    expect(got).toEqual([{ order: ['b', 'c', 'a', 'd'], id: 'a', from: 0, to: 2 }]);
    const li = l.list.querySelector<HTMLElement>('li[data-id="a"]')!;
    expect(li.classList.contains('aui-sortable-list__item--dragging')).toBe(false);
    expect(li.style.getPropertyValue('--aui-sortable-list-offset')).toBe('');
  });

  it('a drag from the item body only starts with dragFrom: item (from global config)', async () => {
    const l = mount();
    const body = (id: string): HTMLElement => l.list.querySelector<HTMLElement>(`li[data-id="${id}"] .aui-sortable-list__content`)!;
    await userEvent.dragAndDrop(body('a'), body('c'));
    expect(l.order).toEqual(['a', 'b', 'c', 'd']);
    configureAbsoluteUI({ components: { sortableList: { dragFrom: 'item' } } });
    expect(l.host.classList.contains('aui-sortable-list--drag-item')).toBe(true);
    await userEvent.dragAndDrop(body('a'), body('c'), { targetPosition: { x: 4, y: 30 } });
    expect(l.order).toEqual(['b', 'c', 'a', 'd']);
  });

  it('Escape during a pointer drag restores the order', async () => {
    const l = mount();
    const h = handle(l, 'a');
    const r = h.getBoundingClientRect();
    const ev = (type: string, target: EventTarget, y: number): void => {
      target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 9, isPrimary: true, pointerType: 'touch', clientX: r.left + 5, clientY: y }));
    };
    ev('pointerdown', h, r.top + 5);
    ev('pointermove', document, r.top + 95);
    expect(l.order).toEqual(['b', 'c', 'a', 'd']);
    expect(l.isDragging).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(l.order).toEqual(['a', 'b', 'c', 'd']);
    expect(l.isDragging).toBe(false);
  });
});

describe('SortableList: options', () => {
  it('update keeps rows and content nodes; move() reorders without events', () => {
    const node = document.createElement('strong');
    node.textContent = 'Cherries!';
    const l = mount({ items: items.map((i) => (i.id === 'c' ? { ...i, content: node } : i)) });
    const got = changes(l);
    const before = l.list.querySelector('li[data-id="c"]');
    l.update({ items: [...l.options.items].reverse() });
    expect(l.order).toEqual(['d', 'c', 'b', 'a']);
    expect(l.list.querySelector('li[data-id="c"]')).toBe(before);
    expect(l.list.contains(node)).toBe(true);
    l.move('a', 0);
    expect(l.order).toEqual(['a', 'd', 'c', 'b']);
    expect(got).toEqual([]);
    expect(() => {
      l.move('zz', 0);
    }).toThrow(AbsoluteUIError);
  });

  it('(regression) a committed reorder survives later re-renders; focus survives a reordering update', async () => {
    const l = mount();
    handle(l, 'a').focus();
    await userEvent.keyboard(' {ArrowDown} ');
    expect(l.order).toEqual(['b', 'a', 'c', 'd']);
    l.update({ disabled: false });
    configureAbsoluteUI({ components: { sortableList: { dragFrom: 'item' } } });
    expect(l.order).toEqual(['b', 'a', 'c', 'd']);
    expect(l.options.items.map((i) => i.id)).toEqual(['b', 'a', 'c', 'd']);
    handle(l, 'c').focus();
    l.update({ items: [...l.options.items].reverse() });
    expect(document.activeElement).toBe(handle(l, 'c'));
  });

  it('strings render as text; validation before rendering; destroy cleans up', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    const bad: Parameters<typeof SortableList.create>[1][] = [
      { label: '', items },
      { label: 'x', items: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] },
      { label: 'x', items: [{ id: 'a', label: '' }] },
      { label: 'x', items, dragFrom: 'anywhere' as 'item' },
    ];
    for (const options of bad) expect(() => SortableList.create(host, options)).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const l = SortableList.create(host, { label: 'x', items: [{ id: 'a', label: '<b>A</b>' }] });
    expect(host.querySelector('b')).toBeNull();
    l.destroy();
    expect(host.childElementCount).toBe(0);
    expect(host.className).toBe('');
  });
});
