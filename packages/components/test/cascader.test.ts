import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Cascader, cascaderConfig, type CascaderOption, type CascaderOptions, type CascaderValueDetail } from '@absoluteui/components/cascader';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const TREE: CascaderOption[] = [
  {
    value: 'in',
    label: 'India',
    children: [
      { value: 'ka', label: 'Karnataka', children: [{ value: 'blr', label: 'Bengaluru' }, { value: 'mys', label: 'Mysuru' }] },
      { value: 'kl', label: 'Kerala', children: [{ value: 'cok', label: 'Kochi' }] },
    ],
  },
  { value: 'de', label: 'Germany', children: [{ value: 'be', label: 'Berlin', children: [{ value: 'ber', label: 'Berlin' }] }] },
  { value: 'xx', label: 'Closed region', disabled: true },
];

function mount(options: Partial<CascaderOptions> = {}): Cascader {
  const host = document.createElement('div');
  document.body.append(host);
  return Cascader.create(host, { label: 'Location', options: TREE, levelLabels: ['Country', 'State', 'City'], ...options });
}

function changes(c: Cascader): CascaderValueDetail[] {
  const log: CascaderValueDetail[] = [];
  c.host.addEventListener('aui-change', (e) => log.push((e as CustomEvent<CascaderValueDetail>).detail));
  return log;
}

const level = (c: Cascader, name: string): HTMLElement => c.host.querySelector<HTMLElement>(`[role="listbox"][aria-label="${name}"]`)!;
const active = (list: HTMLElement): string => document.getElementById(list.getAttribute('aria-activedescendant')!)!.querySelector('.aui-cascader__option-label')!.textContent;

describe('Cascader', () => {
  it('renders a combobox trigger with a dialog popup and shows the selected path', () => {
    const c = mount({ value: ['in', 'ka', 'blr'] });
    expect(c.trigger.getAttribute('role')).toBe('combobox');
    expect(c.trigger.getAttribute('aria-haspopup')).toBe('dialog');
    expect(c.trigger.getAttribute('aria-expanded')).toBe('false');
    expect(c.trigger.textContent).toContain('India / Karnataka / Bengaluru');
    // Text that contributes to the accessible name: the label's asterisk is aria-hidden (visual only).
    const nameText = (el: Element): string => [...el.childNodes].map((n) => (n instanceof Element ? (n.getAttribute('aria-hidden') === 'true' ? '' : nameText(n)) : (n.textContent ?? ''))).join('');
    const names = c.trigger.getAttribute('aria-labelledby')!.split(' ').map((id) => nameText(document.getElementById(id)!));
    expect(names).toEqual(['Location', 'India / Karnataka / Bengaluru']);
    expect(c.value).toEqual(['in', 'ka', 'blr']);
    expect(c.getFormValue()).toBe('blr');
  });

  it('keyboard: open, move within a level, open the next level, select a leaf', async () => {
    const c = mount({ searchable: false });
    const log = changes(c);
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    expect(c.open).toBe(true);
    const countries = level(c, 'Country');
    expect(document.activeElement).toBe(countries);
    expect(active(countries)).toBe('India');
    await userEvent.keyboard('{ArrowRight}');
    const states = level(c, 'State');
    expect(document.activeElement).toBe(states);
    await userEvent.keyboard('{ArrowDown}');
    expect(active(states)).toBe('Kerala');
    await userEvent.keyboard('{ArrowRight}{Enter}');
    expect(c.value).toEqual(['in', 'kl', 'cok']);
    expect(log[0]).toMatchObject({ value: ['in', 'kl', 'cok'], labels: ['India', 'Kerala', 'Kochi'] });
    expect(c.open).toBe(false);
    expect(document.activeElement).toBe(c.trigger);
  });

  it('ArrowLeft goes back; disabled options are skipped; Escape closes and restores focus', async () => {
    const c = mount({ searchable: false });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    await userEvent.keyboard('{ArrowLeft}');
    const countries = level(c, 'Country');
    expect(document.activeElement).toBe(countries);
    await userEvent.keyboard('{End}');
    expect(active(countries)).toBe('Germany');
    await userEvent.keyboard('{Escape}');
    expect(c.open).toBe(false);
    expect(document.activeElement).toBe(c.trigger);
  });

  it('arrow keys follow the reading direction in RTL', async () => {
    configureAbsoluteUI({ common: { direction: 'rtl' } });
    const c = mount({ searchable: false });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowLeft}');
    expect(document.activeElement).toBe(level(c, 'State'));
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(level(c, 'Country'));
  });

  it('search lists matching paths across levels and selects with Enter', async () => {
    const c = mount();
    await userEvent.click(c.trigger);
    expect(document.activeElement).toBe(c.host.querySelector('input[type="search"]'));
    await userEvent.keyboard('berl');
    const results = [...c.host.querySelectorAll('.aui-cascader__result-list [role="option"]')].map((o) => o.textContent);
    expect(results).toEqual(['Germany / Berlin / Berlin']);
    expect(c.host.querySelector('.aui-cascader__results [role="status"]')!.textContent).toBe('1 result');
    await userEvent.keyboard('{Enter}');
    expect(c.value).toEqual(['de', 'be', 'ber']);
  });

  it('lazy loading shows a busy level, then focuses the loaded children', async () => {
    let resolve: (v: CascaderOption[]) => void = () => undefined;
    const paths: (readonly string[])[] = [];
    const c = mount({
      searchable: false,
      options: [{ value: 'ops', label: 'Operations' }],
      levelLabels: ['Division', 'Team'],
      loadChildren: (_o, { path }) => {
        paths.push(path);
        return new Promise((r) => {
          resolve = r;
        });
      },
    });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    expect(c.host.querySelector('[aria-busy="true"]')).not.toBeNull();
    expect(c.host.querySelector('.aui-cascader__status--loading')!.textContent).toContain('Loading');
    expect(paths).toEqual([['ops']]);
    resolve([{ value: 'sre', label: 'Reliability', isLeaf: true }]);
    await new Promise((r) => setTimeout(r, 0));
    expect(document.activeElement).toBe(level(c, 'Team'));
    await userEvent.keyboard('{Enter}');
    expect(c.value).toEqual(['ops', 'sre']);
  });

  it('a failed load shows an error with a focused Retry that loads again', async () => {
    let calls = 0;
    const c = mount({
      searchable: false,
      options: [{ value: 'ops', label: 'Operations' }],
      loadChildren: () => {
        calls++;
        return calls === 1 ? Promise.reject(new Error('offline')) : Promise.resolve([{ value: 'sre', label: 'Reliability', isLeaf: true }]);
      },
    });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}');
    await new Promise((r) => setTimeout(r, 0));
    expect(c.host.querySelector('.aui-cascader__status--error')!.textContent).toContain('Could not load options.');
    expect(document.activeElement!.textContent).toBe('Retry');
    await userEvent.keyboard('{Enter}');
    await new Promise((r) => setTimeout(r, 0));
    expect(calls).toBe(2);
    expect(c.host.querySelector('.aui-cascader__status--error')).toBeNull();
  });

  it('closing aborts a pending load', async () => {
    let signal: AbortSignal | null = null;
    const c = mount({
      searchable: false,
      options: [{ value: 'ops', label: 'Operations' }],
      loadChildren: (_o, ctx) => {
        signal = ctx.signal;
        return new Promise(() => undefined);
      },
    });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{Escape}');
    expect((signal as AbortSignal | null)?.aborted).toBe(true);
  });

  it('multiple: toggles paths, shows chips with remove buttons, stays open', async () => {
    const c = mount({ multiple: true, searchable: false, name: 'cities' });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{ArrowRight}{ArrowRight}{Enter}{ArrowDown}{Enter}');
    expect(c.open).toBe(true);
    expect(c.value).toEqual([['in', 'ka', 'blr'], ['in', 'ka', 'mys']]);
    expect(c.getFormValue()).toEqual(['blr', 'mys']);
    await userEvent.keyboard('{Escape}');
    const remove = c.host.querySelector<HTMLButtonElement>('button[aria-label="Remove India / Karnataka / Bengaluru"]')!;
    await userEvent.click(remove);
    expect(c.value).toEqual([['in', 'ka', 'mys']]);
  });

  it('changeOnSelect allows selecting a node with Enter', async () => {
    const c = mount({ changeOnSelect: true, searchable: false });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}{Enter}');
    expect(c.value).toEqual(['in']);
  });

  it('required validation, clear button, hidden inputs, and Form discovery', async () => {
    const form = document.createElement('form');
    document.body.append(form);
    const host = document.createElement('div');
    form.append(host);
    const c = Cascader.create(host, { label: 'Location', options: TREE, name: 'city', value: ['in', 'kl', 'cok'] });
    expect(getFormControl(host)).toBe(c);
    expect(new FormData(form).get('city')).toBe('cok');
    const clear = host.querySelector<HTMLButtonElement>('button[aria-label="Clear selection"]')!;
    expect(clear.hidden).toBe(false);
    await userEvent.click(clear);
    expect(c.value).toBeNull();
    c.update({ required: true });
    expect(c.reportValidity()).toBe(false);
    expect(c.trigger.getAttribute('aria-required')).toBe('true');
    expect(c.trigger.getAttribute('aria-invalid')).toBe('true');
    expect(host.querySelector('.aui-field__error')!.textContent).toBe('Select an option.');
  });

  it('read-only and disabled do not open', async () => {
    const c = mount({ readOnly: true });
    await userEvent.click(c.trigger);
    expect(c.open).toBe(false);
    expect(c.trigger.getAttribute('aria-readonly')).toBe('true');
    c.update({ readOnly: false, disabled: true });
    expect(c.trigger.disabled).toBe(true);
  });

  it('reset and dirty; configuration', () => {
    configureAbsoluteUI({ components: { cascader: { validationTiming: 'submit' } } });
    expect(cascaderConfig.resolve({}).validationTiming).toBe('submit');
    const c = mount({ value: ['in', 'ka', 'blr'] });
    c.setValue(['de', 'be', 'ber']);
    expect(c.dirty).toBe(true);
    c.reset();
    expect(c.value).toEqual(['in', 'ka', 'blr']);
  });

  it('throws on invalid options before touching the host; invalid update keeps state', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => Cascader.create(host, { label: '', options: [] })).toThrow(AbsoluteUIError);
    expect(() => Cascader.create(host, { label: 'x', options: TREE, value: [['in']] })).toThrow(/Invalid cascader options/);
    expect(host.textContent).toBe('keep');
    const c = mount({ value: ['in'] });
    expect(() => {
      c.update({ maxResults: 0 });
    }).toThrow(AbsoluteUIError);
    expect(c.value).toEqual(['in']);
  });

  it('destroy closes, removes rendering and the registration', async () => {
    const c = mount();
    await userEvent.click(c.trigger);
    c.destroy();
    expect(c.host.childElementCount).toBe(0);
    expect(getFormControl(c.host)).toBeUndefined();
  });
});

describe('Cascader search label', () => {
  it('names the search field before the popup first opens (regression)', () => {
    const c = mount();
    expect(c.host.querySelector('.aui-cascader__search')?.getAttribute('aria-label')).toBe('Search');
  });
});

describe('Cascader focused level', () => {
  it('keeps the same focused listbox element while moving within and across levels (regression)', async () => {
    const c = mount({ searchable: false });
    c.trigger.focus();
    await userEvent.keyboard('{ArrowDown}');
    const countries = level(c, 'Country');
    let focusEvents = 0;
    countries.addEventListener('focus', () => focusEvents++);
    await userEvent.keyboard('{ArrowDown}{ArrowUp}');
    expect(countries.isConnected).toBe(true);
    expect(document.activeElement).toBe(countries);
    expect(focusEvents).toBe(0);
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}');
    expect(level(c, 'Country')).toBe(countries);
    expect(document.activeElement).toBe(countries);
  });
});
