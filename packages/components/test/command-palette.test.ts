import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { CommandPalette, type Command, type CommandPaletteOptions, type CommandPaletteSelectDetail } from '@absoluteui/components/command-palette';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const ran: string[] = [];
const COMMANDS: Command[] = [
  { id: 'home', label: 'Go to dashboard', group: 'Navigation', run: () => ran.push('home') },
  { id: 'people', label: 'Go to people', group: 'Navigation', keywords: ['employees'] },
  { id: 'leave', label: 'Request leave', group: 'Actions', shortcut: 'Mod+Shift+L' },
  { id: 'off', label: 'Disabled action', group: 'Actions', disabled: true },
  { id: 'theme', label: 'Change theme', group: 'Actions', children: [{ id: 'light', label: 'Light' }, { id: 'dark', label: 'Dark' }] },
];

function mount(options: Partial<CommandPaletteOptions> = {}): CommandPalette {
  const host = document.createElement('div');
  document.body.append(host);
  return CommandPalette.create(host, { commands: COMMANDS, ...options });
}

const press = (el: Element, key: string, init: KeyboardEventInit = {}): void => {
  el.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init }));
};

const type = (p: CommandPalette, text: string): void => {
  p.input.value = text;
  p.input.dispatchEvent(new Event('input'));
};

const options = (p: CommandPalette): string[] => [...p.dialog.querySelectorAll('[role="option"]')].map((o) => o.querySelector('.aui-command-palette__label')?.textContent ?? '');

describe('CommandPalette', () => {
  it('opens with the shortcut and lists grouped commands', () => {
    const p = mount();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'k', ctrlKey: !/Mac|iPhone|iPad/.test(navigator.userAgent), metaKey: /Mac|iPhone|iPad/.test(navigator.userAgent), bubbles: true, cancelable: true }));
    expect(p.isOpen).toBe(true);
    expect(document.activeElement).toBe(p.input);
    expect([...p.dialog.querySelectorAll('.aui-command-palette__header')].map((h) => h.textContent)).toEqual(['Navigation', 'Actions']);
    expect(p.input.getAttribute('aria-activedescendant')).toBe(p.dialog.querySelector('[role="option"]')?.id);
  });

  it('fuzzy matches labels and keywords with highlighted marks', () => {
    const p = mount();
    p.open();
    type(p, 'gtd');
    expect(options(p)[0]).toBe('Go to dashboard');
    expect(p.dialog.querySelectorAll('[role="option"]')[0]?.querySelectorAll('mark')).toHaveLength(3);
    type(p, 'employ');
    expect(options(p)).toEqual(['Go to people']);
  });

  it('runs a command after closing and emits a cancelable aui-select', () => {
    const p = mount({ recent: [] });
    const events: CommandPaletteSelectDetail[] = [];
    p.host.addEventListener('aui-select', (e) => events.push((e as CustomEvent<CommandPaletteSelectDetail>).detail));
    p.open();
    type(p, 'dashboard');
    press(p.input, 'Enter');
    expect(p.isOpen).toBe(false);
    expect(ran).toContain('home');
    expect(events[0]?.id).toBe('home');
    expect(p.recent).toEqual(['home']);
  });

  it('opens nested pages and goes back with Backspace', () => {
    const p = mount();
    p.open();
    type(p, 'change');
    press(p.input, 'Enter');
    expect(p.path).toEqual(['theme']);
    expect(options(p)).toEqual(['Light', 'Dark']);
    type(p, '');
    press(p.input, 'Backspace');
    expect(p.path).toEqual([]);
  });

  it('clears option ARIA from a recycled row reused as a group header (regression)', () => {
    const p = mount({ recent: [] });
    p.open();
    type(p, 'change');
    expect(p.dialog.querySelector('[role="option"]')?.getAttribute('aria-haspopup')).toBe('listbox');
    type(p, '');
    const headers = [...p.dialog.querySelectorAll('.aui-command-palette__header')];
    expect(headers.length).toBeGreaterThan(0);
    for (const h of headers) {
      expect(h.getAttribute('role')).toBe('presentation');
      expect(h.hasAttribute('aria-haspopup')).toBe(false);
      expect(h.hasAttribute('aria-selected')).toBe(false);
    }
  });

  it('skips disabled commands and shows an Empty State without results', () => {
    const p = mount();
    p.open();
    type(p, 'disabled');
    expect(p.input.hasAttribute('aria-activedescendant')).toBe(false);
    type(p, 'qqqqzz');
    const empty = p.dialog.querySelector<HTMLElement>('.aui-command-palette__empty');
    expect(empty?.hidden).toBe(false);
    expect(empty?.textContent).toContain('No results for "qqqqzz"');
  });

  it('debounces and aborts provider searches', async () => {
    const signals: AbortSignal[] = [];
    const p = mount({
      debounce: 10,
      providers: [{ id: 'people', label: 'People', search: async (query, { signal }) => {
        signals.push(signal);
        await new Promise((r) => setTimeout(r, 30));
        return [{ id: `p-${query}`, label: `Person ${query}` }];
      } }],
    });
    p.open();
    type(p, 'ab');
    await new Promise((r) => setTimeout(r, 20));
    type(p, 'abc');
    await new Promise((r) => setTimeout(r, 80));
    expect(signals[0]?.aborted).toBe(true);
    expect(options(p)).toContain('Person abc');
  });

  it('rejects invalid commands', () => {
    const host = document.createElement('div');
    expect(() => CommandPalette.create(host, { commands: [{ id: 'a', label: 'A' }, { id: 'a', label: 'B' }] })).toThrow(AbsoluteUIError);
    expect(() => CommandPalette.create(host, { commands: [{ id: 'a', label: '' }] })).toThrow(AbsoluteUIError);
  });
});
