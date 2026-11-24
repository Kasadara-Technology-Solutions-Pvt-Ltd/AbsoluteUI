import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { TransferList, transferListConfig, type TransferListItem, type TransferListOptions, type TransferListValueDetail } from '@absoluteui/components/transfer-list';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const ITEMS: TransferListItem[] = [
  { value: 'a', label: 'Asha Rao', description: 'Engineering' },
  { value: 'b', label: 'Ben Okafor' },
  { value: 'c', label: 'Chen Wei' },
  { value: 'd', label: 'Dana Silva', disabled: true },
  { value: 'e', label: 'Eve Martin' },
];

function mount(options: Partial<TransferListOptions> = {}): TransferList {
  const host = document.createElement('div');
  host.style.width = '640px';
  document.body.append(host);
  return TransferList.create(host, { label: 'Team', items: ITEMS, ...options });
}

const lists = (t: TransferList): HTMLElement[] => [...t.host.querySelectorAll<HTMLElement>('[role="listbox"]')];
const labels = (list: HTMLElement): string[] => [...list.querySelectorAll('.aui-transfer-list__label')].map((l) => l.textContent);
const button = (t: TransferList, name: RegExp): HTMLButtonElement => [...t.host.querySelectorAll<HTMLButtonElement>('button')].find((b) => name.test(b.getAttribute('aria-label') ?? ''))!;

function changes(t: TransferList): TransferListValueDetail[] {
  const log: TransferListValueDetail[] = [];
  t.host.addEventListener('aui-change', (e) => log.push((e as CustomEvent<TransferListValueDetail>).detail));
  return log;
}

describe('TransferList', () => {
  it('renders two labelled multi-select listboxes with counts', () => {
    const t = mount({ value: ['b'] });
    const [available, selected] = lists(t);
    expect(available!.getAttribute('aria-multiselectable')).toBe('true');
    expect(document.getElementById(available!.getAttribute('aria-labelledby')!)!.textContent).toBe('Available');
    expect(document.getElementById(selected!.getAttribute('aria-labelledby')!)!.textContent).toBe('Selected');
    expect(labels(available!)).toEqual(['Asha Rao', 'Chen Wei', 'Dana Silva', 'Eve Martin']);
    expect(labels(selected!)).toEqual(['Ben Okafor']);
    expect(document.getElementById(available!.getAttribute('aria-describedby')!)!.textContent).toBe('4 items');
    expect(t.host.querySelector('[role="group"]')!.getAttribute('aria-labelledby')).toBe(t.host.querySelector('.aui-field__label')!.id);
    expect(t.value).toEqual(['b']);
  });

  it('keyboard: arrows move the active option, Space checks, Enter moves and announces', async () => {
    const t = mount();
    const log = changes(t);
    const [available, selected] = lists(t);
    available!.focus();
    await userEvent.keyboard('{ArrowDown}{ }');
    expect(available!.querySelector('[aria-selected="true"]')!.textContent).toContain('Ben Okafor');
    await userEvent.keyboard('{Enter}');
    expect(t.value).toEqual(['b']);
    expect(labels(selected!)).toEqual(['Ben Okafor']);
    expect(log[0]).toMatchObject({ value: ['b'], moved: ['b'], to: 'selected' });
    expect(document.activeElement).toBe(available);
  });

  it('Shift+arrows check a range, skipping disabled items; Ctrl+A toggles all visible', async () => {
    const t = mount();
    const [available] = lists(t);
    available!.focus();
    await userEvent.keyboard('{Shift>}{ArrowDown}{ArrowDown}{ArrowDown}{/Shift}');
    expect([...available!.querySelectorAll('[aria-selected="true"]')].map((o) => o.textContent)).toEqual(['Asha RaoEngineering', 'Ben Okafor', 'Chen Wei']);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(available!.querySelectorAll('[aria-selected="true"]')).toHaveLength(4);
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(available!.querySelectorAll('[aria-selected="true"]')).toHaveLength(0);
  });

  it('move buttons are disabled until something can move; move all skips disabled items', async () => {
    const t = mount();
    const moveChecked = button(t, /^Move checked items to Selected/);
    const moveAll = button(t, /^Move all items to Selected/);
    const removeAll = button(t, /^Move all items to Available/);
    expect(moveChecked.disabled).toBe(true);
    expect(removeAll.disabled).toBe(true);
    await userEvent.click(moveAll);
    expect(t.value).toEqual(['a', 'b', 'c', 'e']);
    expect(labels(lists(t)[0]!)).toEqual(['Dana Silva']);
    expect(moveAll.disabled).toBe(true);
    await userEvent.click(removeAll);
    expect(t.value).toEqual([]);
  });

  it('search filters a list and updates the count; move all moves only matches', async () => {
    const t = mount();
    const search = t.host.querySelector<HTMLInputElement>('input[aria-label="Search Available"]')!;
    await userEvent.type(search, 'chen');
    const [available] = lists(t);
    expect(labels(available!)).toEqual(['Chen Wei']);
    expect(document.getElementById(available!.getAttribute('aria-describedby')!)!.textContent).toBe('1 of 5');
    await userEvent.click(button(t, /^Move all items to Selected/));
    expect(t.value).toEqual(['c']);
  });

  it('double-click moves an item; click toggles; disabled items never check', async () => {
    const t = mount();
    const [available] = lists(t);
    const dana = [...available!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === 'Dana Silva')!;
    // Playwright refuses to click aria-disabled elements, so the click is dispatched directly.
    dana.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
    expect(dana.getAttribute('aria-selected')).toBe('false');
    const eve = [...available!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === 'Eve Martin')!;
    await userEvent.dblClick(eve);
    expect(t.value).toEqual(['e']);
  });

  it('maxSelected refuses moves beyond the limit', async () => {
    const t = mount({ maxSelected: 2, value: ['a'] });
    const [available] = lists(t);
    available!.focus();
    await userEvent.keyboard('{Control>}a{/Control}');
    expect(button(t, /^Move checked items to Selected/).disabled).toBe(true);
    await userEvent.keyboard('{Enter}');
    expect(t.value).toEqual(['a']);
  });

  it('validates required and minSelected; shows the message after blur; Form discovers it', () => {
    const t = mount({ required: true, minSelected: 2 });
    expect(getFormControl(t.host)).toBe(t);
    expect(t.validity).toMatchObject({ valid: false, error: 'value-missing' });
    expect(t.host.querySelector<HTMLElement>('.aui-field__error')!.hidden).toBe(true);
    expect(t.reportValidity()).toBe(false);
    expect(t.host.querySelector('.aui-field__error')!.textContent).toBe('Select an option.');
    expect(lists(t)[1]!.getAttribute('aria-invalid')).toBe('true');
    t.setValue(['a']);
    expect(t.validity).toMatchObject({ valid: false, error: 'too-few-selected' });
    t.setValue(['a', 'b']);
    expect(t.validity.valid).toBe(true);
  });

  it('native forms receive one hidden input per value; disabled submits nothing', () => {
    const form = document.createElement('form');
    document.body.append(form);
    const host = document.createElement('div');
    form.append(host);
    const t = TransferList.create(host, { label: 'Team', items: ITEMS, name: 'team', value: ['c', 'a'] });
    expect(new FormData(form).getAll('team')).toEqual(['c', 'a']);
    t.update({ disabled: true });
    expect(new FormData(form).getAll('team')).toEqual([]);
    expect(lists(t)[0]!.getAttribute('aria-disabled')).toBe('true');
  });

  it('read-only: lists are browsable but nothing moves', async () => {
    const t = mount({ readOnly: true, value: ['a'] });
    const [available] = lists(t);
    expect(available!.getAttribute('aria-readonly')).toBe('true');
    available!.focus();
    await userEvent.keyboard('{ }{Enter}');
    expect(t.value).toEqual(['a']);
    expect(button(t, /^Move all items to Selected/).disabled).toBe(true);
  });

  it('windows long lists: only visible rows render, with posinset and setsize', async () => {
    const items = Array.from({ length: 10_000 }, (_, i) => ({ value: `v${String(i)}`, label: `Item ${String(i + 1)}` }));
    // Unit tests load no component stylesheets; the listbox only scrolls (so the window can follow
    // the active row) with these layout rules of style.scss.
    const style = document.createElement('style');
    style.textContent = '.aui-transfer-list{--_aui-transfer-list-row:32px}.aui-transfer-list__list{box-sizing:content-box;block-size:calc(var(--_aui-transfer-list-rows,8)*var(--_aui-transfer-list-row));padding:0;margin:0;overflow-y:auto}.aui-transfer-list__list::before,.aui-transfer-list__list::after{display:block;content:""}.aui-transfer-list__list::before{block-size:var(--_aui-transfer-list-before,0)}.aui-transfer-list__list::after{block-size:var(--_aui-transfer-list-after,0)}.aui-transfer-list__option{box-sizing:border-box;block-size:var(--_aui-transfer-list-row)}';
    document.body.append(style);
    const t = mount({ items });
    const [available] = lists(t);
    const rendered = available!.querySelectorAll('[role="option"]').length;
    expect(rendered).toBeGreaterThan(0);
    expect(rendered).toBeLessThan(60);
    expect(available!.querySelector('[role="option"]')!.getAttribute('aria-setsize')).toBe('10000');
    available!.focus();
    await userEvent.keyboard('{End}');
    const active = document.getElementById(available!.getAttribute('aria-activedescendant')!)!;
    expect(active.textContent).toBe('Item 10000');
    expect(active.getAttribute('aria-posinset')).toBe('10000');
  });

  it('reset restores the initial value; dirty tracks changes', async () => {
    const t = mount({ value: ['a'] });
    await userEvent.click(button(t, /^Move all items to Selected/));
    expect(t.dirty).toBe(true);
    t.reset();
    expect(t.value).toEqual(['a']);
    expect(t.dirty).toBe(false);
  });

  it('localizes through messages and configuration', () => {
    configureAbsoluteUI({ components: { transferList: { validationTiming: 'input' } } });
    expect(transferListConfig.resolve({}).validationTiming).toBe('input');
    const t = mount({ titles: { available: 'Employees', selected: 'Team' } });
    expect(button(t, /^Move checked items to Team$/)).toBeDefined();
  });

  it('throws on invalid options before touching the host; invalid update keeps state', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => TransferList.create(host, { label: ' ', items: [] })).toThrow(AbsoluteUIError);
    expect(() => TransferList.create(host, { label: 'x', items: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] })).toThrow(/Invalid transfer list options/);
    expect(host.textContent).toBe('keep');
    const t = mount({ value: ['a'] });
    expect(() => {
      t.update({ maxSelected: 0 });
    }).toThrow(AbsoluteUIError);
    expect(t.value).toEqual(['a']);
  });

  it('destroy removes rendering and the form registration', () => {
    const t = mount();
    t.destroy();
    expect(t.host.childElementCount).toBe(0);
    expect(getFormControl(t.host)).toBeUndefined();
    expect(t.host.classList.contains('aui-transfer-list')).toBe(false);
  });
});

describe('TransferList option nodes', () => {
  it('the first click on an unfocused list checks the option; re-renders keep the clicked node (regression)', async () => {
    const t = mount();
    const [available] = lists(t);
    const chen = [...available!.querySelectorAll<HTMLElement>('[role="option"]')].find((o) => o.textContent === 'Chen Wei')!;
    // Focusing the list on mousedown re-renders it; a replaced node under the pointer used to drop the click.
    await userEvent.click(chen);
    expect(chen.isConnected).toBe(true);
    expect(chen.getAttribute('aria-selected')).toBe('true');
    await userEvent.click(chen);
    expect(chen.getAttribute('aria-selected')).toBe('false');
  });
});
