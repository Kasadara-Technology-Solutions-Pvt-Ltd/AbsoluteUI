import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Kbd, kbdConfig, type KbdOptions } from '@absoluteui/components/kbd';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<KbdOptions> = {}): Kbd {
  const host = document.createElement('span');
  document.body.append(host);
  return Kbd.create(host, { hotkey: 'Mod+S', platform: 'other', ...options });
}

const keys = (k: Kbd): string[] => [...k.host.querySelectorAll('.aui-kbd__key')].map((el) => el.textContent);

describe('Kbd', () => {
  it('renders nested kbd keycaps joined by + on non-Apple platforms (Mod is Ctrl)', () => {
    const k = mount({ hotkey: 'Mod+Shift+k' });
    expect(k.host.classList).toContain('aui-kbd');
    const combo = k.host.querySelector('kbd.aui-kbd__combo')!;
    expect(combo.querySelectorAll('kbd.aui-kbd__key')).toHaveLength(3);
    expect(keys(k)).toEqual(['Ctrl', 'Shift', 'K']);
    expect(k.host.querySelectorAll('.aui-kbd__separator')).toHaveLength(2);
    expect(k.text).toBe('Ctrl+Shift+K');
    expect(k.host.textContent).toBe('Ctrl+Shift+K');
  });

  it('shows Apple modifier symbols with spoken names and no separators', () => {
    const k = mount({ hotkey: 'Mod+Alt+Shift+Ctrl+P', platform: 'apple' });
    expect(k.host.querySelectorAll('.aui-kbd__separator')).toHaveLength(0);
    const first = k.host.querySelector('.aui-kbd__key')!;
    expect(first.querySelector('[aria-hidden="true"]')!.textContent).toBe(String.fromCodePoint(0x2318));
    expect(first.textContent).toContain('Command');
    expect(k.text).toBe([0x2318, 0x2325, 0x21e7, 0x2303].map((c) => String.fromCodePoint(c)).join('') + 'P');
    // Assistive technology hears the names.
    expect(k.host.textContent).toBe(`${String.fromCodePoint(0x2318)}Command${String.fromCodePoint(0x2325)}Option${String.fromCodePoint(0x21e7)}Shift${String.fromCodePoint(0x2303)}ControlP`);
  });

  it('names special keys and arrows', () => {
    const k = mount({ hotkey: 'Shift+ArrowDown' });
    expect(k.host.querySelectorAll('.aui-kbd__key')[1]!.textContent).toBe(`${String.fromCodePoint(0x2193)}Down arrow`);
    k.update({ hotkey: 'Esc' });
    expect(keys(k)).toEqual(['Esc']);
    k.update({ hotkey: 'Ctrl+Plus' });
    expect(keys(k)).toEqual(['Ctrl', '+']);
    k.update({ hotkey: 'Alt+PageDown' });
    expect(keys(k)).toEqual(['Alt', 'Page Down']);
  });

  it('follows the configured platform and size, and localizes names', () => {
    const host = document.createElement('span');
    document.body.append(host);
    const k = Kbd.create(host, { hotkey: 'Mod+Enter' });
    configureAbsoluteUI({ components: { kbd: { platform: 'apple', size: 'sm' } } });
    expect(k.host.querySelectorAll('.aui-kbd__separator')).toHaveLength(0);
    expect(k.host.classList).toContain('aui-kbd--sm');
    registerMessages('kbd', 'de', { enter: 'Eingabe', ctrl: 'Strg' });
    k.update({ platform: 'other', locale: 'de-DE' });
    expect(keys(k)).toEqual(['Strg', 'Eingabe']);
    expect([...kbdConfig.optionNames].sort()).toEqual(['locale', 'platform', 'size']);
  });

  it('validates options before touching the host, and on update', () => {
    const host = document.createElement('span');
    const bad: unknown[] = [{ hotkey: '' }, { hotkey: 'Ctrl+' }, { hotkey: '+S' }, { hotkey: 42 }, { hotkey: 'S', platform: 'mac' }, { hotkey: 'S', size: 'lg' }];
    for (const options of bad) expect(() => Kbd.create(host, options as KbdOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const k = mount();
    expect(() => {
      k.update({ hotkey: 'Ctrl++' });
    }).toThrow(AbsoluteUIError);
    expect(k.hotkey).toBe('Mod+S');
  });

  it('renders text only and is not focusable', () => {
    const k = mount({ hotkey: '<b>' });
    expect(k.host.querySelector('b')).toBeNull();
    expect(k.host.querySelector('[tabindex]')).toBeNull();
  });

  it('destroy removes rendering, classes, and subscriptions', () => {
    const k = mount();
    k.destroy();
    expect(k.host.childNodes.length).toBe(0);
    expect(k.host.className).toBe('');
    configureAbsoluteUI({ components: { kbd: { size: 'sm' } } });
    expect(k.host.className).toBe('');
  });
});
