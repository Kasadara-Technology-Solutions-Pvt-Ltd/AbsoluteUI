import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { TreeSelect, type TreeNode, type TreeSelectChangeDetail, type TreeSelectOptions } from '@absoluteui/components/tree-select';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const NODES: TreeNode[] = [
  { id: 'eng', label: 'Engineering', children: [{ id: 'web', label: 'Web' }, { id: 'platform', label: 'Platform' }] },
  { id: 'ops', label: 'Operations' },
];

function mount(options: Partial<TreeSelectOptions> = {}): TreeSelect {
  const host = document.createElement('div');
  document.body.append(host);
  return TreeSelect.create(host, { label: 'Department', nodes: NODES, ...options });
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
};

describe('TreeSelect', () => {
  it('renders a combobox with a tree popup and hidden inputs', () => {
    const field = mount({ name: 'dept', value: ['web'] });
    expect(field.input.getAttribute('role')).toBe('combobox');
    expect(field.input.getAttribute('aria-haspopup')).toBe('tree');
    expect(field.input.value).toBe('Web');
    expect(field.host.querySelector<HTMLInputElement>('input[type="hidden"]')?.value).toBe('web');
    expect(field.getFormValue()).toBe('web');
  });

  it('chooses a node in single mode, closes, and emits aui-change', () => {
    const field = mount();
    const events: TreeSelectChangeDetail[] = [];
    field.host.addEventListener('aui-change', (e) => events.push((e as CustomEvent<TreeSelectChangeDetail>).detail));
    field.open();
    expect(field.isOpen).toBe(true);
    const ops = field.tree?.getItemElement('ops');
    ops?.click();
    expect(field.value).toEqual(['ops']);
    expect(field.isOpen).toBe(false);
    expect(events).toEqual([{ value: ['ops'], added: ['ops'], removed: [] }]);
  });

  it('filters while typing and moves focus to the first match', () => {
    const field = mount();
    field.input.focus();
    field.input.value = 'plat';
    field.input.dispatchEvent(new Event('input'));
    expect(field.tree?.matches).toEqual(['platform']);
    press(field.input, 'ArrowDown');
    expect(document.activeElement).toBe(field.tree?.getItemElement('platform'));
  });

  it('keeps parents unselectable when selectableParents is false', () => {
    const field = mount({ selectableParents: false });
    field.open();
    field.tree?.getItemElement('eng')?.click();
    expect(field.value).toEqual([]);
  });

  it('uses tri-state checkboxes and tags in multiple mode', () => {
    const field = mount({ mode: 'multiple', value: ['web'] });
    expect(field.host.querySelectorAll('.aui-tree-select__tag')).toHaveLength(1);
    field.open();
    const platform = field.tree?.getItemElement('platform');
    platform?.click();
    expect(field.value.sort()).toEqual(['eng', 'platform', 'web']);
    expect([...field.host.querySelectorAll('.aui-tree-select__tag-label')].map((t) => t.textContent)).toEqual(['Engineering']);
    field.close();
    field.input.focus();
    press(field.input, 'Backspace');
    expect(field.value).toEqual([]);
  });

  it('validates required values after submit and clears', () => {
    const field = mount({ required: true });
    expect(field.reportValidity()).toBe(false);
    expect(field.input.getAttribute('aria-invalid')).toBe('true');
    field.setValue(['ops']);
    expect(field.reportValidity()).toBe(true);
    field.host.querySelector<HTMLButtonElement>('.aui-tree-select__clear')?.click();
    expect(field.value).toEqual([]);
  });

  it('rejects invalid options', () => {
    const host = document.createElement('div');
    expect(() => TreeSelect.create(host, { label: 'X', nodes: NODES, value: ['web', 'ops'] })).toThrow(AbsoluteUIError);
    expect(() => TreeSelect.create(host, { label: '', nodes: NODES })).toThrow(AbsoluteUIError);
  });
});
