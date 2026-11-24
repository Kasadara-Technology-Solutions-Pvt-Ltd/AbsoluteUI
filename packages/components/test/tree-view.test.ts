import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { TreeView, type TreeNode, type TreeViewChangeDetail, type TreeViewMoveDetail, type TreeViewOptions, type TreeViewSelectDetail } from '@absoluteui/components/tree-view';
import { findSubstring, fuzzyMatch, highlightText } from '../src/internal/highlight.js';

// Unit tests do not load the stylesheet: give the tree the layout rules its CSS would.
const CSS = `
.aui-tree-view__viewport { position: relative; block-size: var(--_aui-tree-view-height); overflow: auto; }
.aui-tree-view__canvas { position: relative; block-size: var(--_aui-tree-view-total); }
.aui-tree-view__item { position: absolute; inset-inline: 0; inset-block-start: 0; box-sizing: border-box; block-size: var(--_aui-tree-view-item); translate: 0 var(--_aui-tree-view-y); }
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

const NODES: TreeNode[] = [
  { id: 'a', label: 'Alpha', children: [{ id: 'a1', label: 'Apple' }, { id: 'a2', label: 'Apricot' }] },
  { id: 'b', label: 'Beta', children: [{ id: 'b1', label: 'Banana', children: [{ id: 'b1x', label: 'Berry' }] }] },
  { id: 'c', label: 'Gamma', hasChildren: true },
  { id: 'd', label: 'Delta', disabled: true },
];

function mount(options: Partial<TreeViewOptions> = {}): TreeView {
  const host = document.createElement('div');
  document.body.append(host);
  return TreeView.create(host, { label: 'Tree', nodes: NODES, itemHeight: 32, height: '320px', ...options });
}

const item = (tree: TreeView, id: string): HTMLElement => {
  const el = tree.getItemElement(id);
  if (!el) throw new Error(`not rendered: ${id}`);
  return el;
};

const press = (el: Element, key: string, init: KeyboardEventInit = {}): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
};

const tick = (ms = 0): Promise<void> => new Promise((r) => setTimeout(r, ms));

describe('TreeView', () => {
  it('renders a flat tree with levels, positions, and expansion state', () => {
    const tree = mount({ expanded: ['a'] });
    expect(tree.host.querySelector('[role="tree"]')?.getAttribute('aria-label')).toBe('Tree');
    const a1 = item(tree, 'a1');
    expect(a1.getAttribute('role')).toBe('treeitem');
    expect(a1.getAttribute('aria-level')).toBe('2');
    expect(a1.getAttribute('aria-posinset')).toBe('1');
    expect(a1.getAttribute('aria-setsize')).toBe('2');
    expect(item(tree, 'a').getAttribute('aria-expanded')).toBe('true');
    expect(item(tree, 'b').getAttribute('aria-expanded')).toBe('false');
    expect(a1.hasAttribute('aria-expanded')).toBe(false);
    expect(tree.visibleCount).toBe(6);
  });

  it('follows the APG arrow keys and roving tabindex', () => {
    const tree = mount();
    const a = item(tree, 'a');
    expect(a.tabIndex).toBe(0);
    a.focus();
    press(a, 'ArrowRight');
    expect(tree.expanded).toEqual(['a']);
    press(item(tree, 'a'), 'ArrowRight');
    expect(document.activeElement).toBe(item(tree, 'a1'));
    press(item(tree, 'a1'), 'ArrowLeft');
    expect(document.activeElement).toBe(item(tree, 'a'));
    press(item(tree, 'a'), 'End');
    expect(document.activeElement).toBe(item(tree, 'd'));
    press(item(tree, 'd'), 'Home');
    press(item(tree, 'a'), '*');
    expect(tree.expanded.sort()).toEqual(['a', 'b']);
  });

  it('selects singly and by ranges, and emits aui-select', () => {
    const tree = mount({ selection: 'multiple', expanded: ['a'] });
    const events: TreeViewSelectDetail[] = [];
    tree.host.addEventListener('aui-select', (e) => events.push((e as CustomEvent<TreeViewSelectDetail>).detail));
    item(tree, 'a').focus();
    press(item(tree, 'a'), ' ');
    press(item(tree, 'a'), 'ArrowDown', { shiftKey: true });
    press(item(tree, 'a1'), 'ArrowDown', { shiftKey: true });
    expect(tree.selected.sort()).toEqual(['a', 'a1', 'a2']);
    expect(events.length).toBe(3);
    press(item(tree, 'a2'), 'a', { ctrlKey: true });
    expect(tree.selected).not.toContain('d');
  });

  it('cascades checkboxes with mixed parents', () => {
    const tree = mount({ checkboxes: true, expanded: ['a', 'b'], checked: ['a1'] });
    expect(item(tree, 'a').getAttribute('aria-checked')).toBe('mixed');
    const changes: TreeViewChangeDetail[] = [];
    tree.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<TreeViewChangeDetail>).detail));
    item(tree, 'a').focus();
    press(item(tree, 'a'), ' ');
    expect(tree.checked.sort()).toEqual(['a', 'a1', 'a2']);
    expect(item(tree, 'a').getAttribute('aria-checked')).toBe('true');
    tree.setChecked(['b']);
    expect(tree.checked.sort()).toEqual(['b', 'b1', 'b1x']);
    expect(changes).toHaveLength(1);
  });

  it('loads lazy children and shows the error state on failure', async () => {
    let fail = true;
    const tree = mount({
      loadChildren: async () => {
        await tick(5);
        if (fail) throw new Error('nope');
        return [{ id: 'c1', label: 'Child' }];
      },
    });
    const errors: unknown[] = [];
    tree.host.addEventListener('aui-load-error', (e) => errors.push(e));
    await tree.expand('c');
    expect(item(tree, 'c').classList.contains('aui-tree-view__item--error')).toBe(true);
    expect(errors).toHaveLength(1);
    fail = false;
    await tree.reload('c');
    expect(item(tree, 'c1').textContent).toBe('Child');
    expect(tree.getParentId('c1')).toBe('c');
  });

  it('keeps focus on the focused node when lazy children above it finish loading (regression)', async () => {
    const tree = mount({
      loadChildren: async () => {
        await tick(5);
        return [{ id: 'c1', label: 'Child' }, { id: 'c2', label: 'Child 2' }];
      },
    });
    const a = item(tree, 'a');
    a.focus();
    // * expands Gamma (lazy); End moves focus to Delta before the children arrive.
    press(a, '*');
    press(item(tree, 'a'), 'End');
    expect(document.activeElement).toBe(item(tree, 'd'));
    await tick(30);
    expect(item(tree, 'c1').textContent).toContain('Child');
    expect(document.activeElement).toBe(item(tree, 'd'));
  });

  it('moves nodes with the keyboard and lets aui-move cancel', async () => {
    const tree = mount({ draggable: true, expanded: ['a'] });
    const moves: TreeViewMoveDetail[] = [];
    tree.host.addEventListener('aui-move', (e) => moves.push((e as CustomEvent<TreeViewMoveDetail>).detail));
    item(tree, 'a2').focus();
    press(item(tree, 'a2'), 'ArrowUp', { altKey: true });
    await tick();
    expect(tree.nodes[0]?.children?.map((n) => n.id)).toEqual(['a2', 'a1']);
    press(item(tree, 'a2'), 'x', { ctrlKey: true });
    item(tree, 'b').focus();
    press(item(tree, 'b'), 'v', { ctrlKey: true });
    await tick();
    expect(tree.getParentId('a2')).toBe('b');
    expect(moves.map((m) => m.source)).toEqual(['keyboard', 'keyboard']);
    tree.host.addEventListener('aui-move', (e) => {
      e.preventDefault();
    });
    press(item(tree, 'a2'), 'ArrowUp', { altKey: true });
    await tick();
    expect(tree.nodes[1]?.children?.map((n) => n.id)).toEqual(['b1', 'a2']);
  });

  it('never moves a node into its own descendant', async () => {
    const tree = mount({ draggable: true, expanded: ['b'] });
    item(tree, 'b').focus();
    press(item(tree, 'b'), 'x', { ctrlKey: true });
    item(tree, 'b1').focus();
    press(item(tree, 'b1'), 'v', { ctrlKey: true });
    await tick();
    expect(tree.getParentId('b1')).toBe('b');
    expect(tree.getParentId('b')).toBeNull();
  });

  it('renames through a text input and emits a cancelable aui-rename', () => {
    const tree = mount({ renamable: true });
    item(tree, 'a').focus();
    press(item(tree, 'a'), 'F2');
    const input = document.activeElement as HTMLInputElement;
    expect(input.tagName).toBe('INPUT');
    expect(input.getAttribute('aria-label')).toBe('Rename Alpha');
    input.value = '<b>Omega</b>';
    press(input, 'Enter');
    expect(tree.getNode('a')?.label).toBe('<b>Omega</b>');
    expect(item(tree, 'a').querySelector('b')).toBeNull();
  });

  it('filters, keeps the paths to matches, and highlights with text nodes', () => {
    const tree = mount({ filter: 'berr' });
    expect(tree.visibleCount).toBe(3);
    expect(tree.matches).toEqual(['b1x']);
    const mark = item(tree, 'b1x').querySelector('mark');
    expect(mark?.textContent).toBe('Berr');
    tree.update({ filter: 'zzz' });
    expect(tree.visibleCount).toBe(0);
    expect(tree.host.querySelector('.aui-tree-view__empty')?.textContent).toBe('No matching items');
  });

  it('virtualizes 10,000+ visible nodes', () => {
    const big: TreeNode[] = Array.from({ length: 100 }, (_, g) => ({ id: `g${String(g)}`, label: `G${String(g)}`, children: Array.from({ length: 110 }, (_, i) => ({ id: `g${String(g)}-${String(i)}`, label: `N${String(i)}` })) }));
    const tree = mount({ nodes: big });
    tree.expandAll();
    expect(tree.visibleCount).toBe(11_100);
    expect(tree.host.querySelectorAll('[role="treeitem"]').length).toBeLessThan(40);
    tree.focusNode('g99-109');
    expect(document.activeElement?.getAttribute('aria-posinset')).toBe('110');
  });

  it('rejects invalid options before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => TreeView.create(host, { label: 'T', nodes: [{ id: 'x', label: 'X' }, { id: 'x', label: 'Y' }] })).toThrow(AbsoluteUIError);
    expect(() => TreeView.create(host, { label: ' ', nodes: [] })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
  });
});

describe('highlight helpers', () => {
  it('finds accent-insensitive substrings and fuzzy subsequences', () => {
    expect(findSubstring('Crème brûlée', 'creme', 'en')).toEqual([0, 5]);
    expect(fuzzyMatch('Go to people', 'gtp', 'en')?.ranges).toEqual([[0, 1], [3, 4], [6, 7]]);
    expect(fuzzyMatch('Go to people', 'xyz', 'en')).toBeNull();
    const a = fuzzyMatch('People', 'peo', 'en')?.score ?? 0;
    const b = fuzzyMatch('Open settings', 'peo', 'en')?.score ?? 0;
    expect(a).toBeGreaterThan(b);
  });

  it('builds marks from text nodes', () => {
    const frag = highlightText(document, '<img>', [[0, 2]], 'm');
    const div = document.createElement('div');
    div.append(frag);
    expect(div.querySelector('img')).toBeNull();
    expect(div.querySelector('mark')?.textContent).toBe('<i');
  });
});
