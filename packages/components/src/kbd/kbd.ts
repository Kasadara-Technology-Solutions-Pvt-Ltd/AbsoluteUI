/**
 * Kbd (R13-1). Shows a keyboard shortcut such as "Ctrl+S" as keycaps. It takes the
 * hotkey syntax of `matchesHotkey` ("Mod+Shift+K"), so a shortcut is written once and
 * displayed for the platform: on Apple platforms `Mod` is Command and modifiers show
 * as symbols (with their names for assistive technology); elsewhere `Mod` is Ctrl
 * and keys are joined by "+". Static text, never interactive.
 */
import { configurationError, defineComponentConfig, getMessage, registerMessages, validators, DisposableGroup } from '@absoluteui/core';
import { applyVisuallyHidden } from '@absoluteui/utilities';
import { subscribeWhileHosted } from '../internal/weak.js';

export type KbdPlatform = 'auto' | 'apple' | 'other';
export type KbdSize = 'sm' | 'md';

export interface KbdConfig {
  platform: KbdPlatform;
  size: KbdSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    kbd: KbdConfig & { locale: string };
  }
}

export const kbdConfig = defineComponentConfig<KbdConfig, 'locale'>(
  'kbd',
  {
    platform: { default: 'auto', expected: '"auto" | "apple" | "other"', validate: validators.oneOf(['auto', 'apple', 'other'] as const) },
    size: { default: 'md', expected: '"sm" | "md"', validate: validators.oneOf(['sm', 'md'] as const) },
  },
  ['locale'],
);

registerMessages('kbd', 'en', {
  command: 'Command',
  control: 'Control',
  option: 'Option',
  ctrl: 'Ctrl',
  alt: 'Alt',
  shift: 'Shift',
  meta: 'Meta',
  enter: 'Enter',
  escape: 'Esc',
  tab: 'Tab',
  space: 'Space',
  backspace: 'Backspace',
  delete: 'Delete',
  home: 'Home',
  end: 'End',
  pageUp: 'Page Up',
  pageDown: 'Page Down',
  arrowUp: 'Up arrow',
  arrowDown: 'Down arrow',
  arrowLeft: 'Left arrow',
  arrowRight: 'Right arrow',
});

export interface KbdOptions extends Partial<KbdConfig> {
  /** Shortcut in `matchesHotkey` syntax: modifiers and one key joined by "+", e.g. "Mod+Shift+K". Use "Plus" for the + key. */
  hotkey: string;
  locale?: string;
}

const PLATFORMS: readonly KbdPlatform[] = ['auto', 'apple', 'other'];
const SIZES: readonly KbdSize[] = ['sm', 'md'];

/** A rendered key: visible text, plus a spoken name when the visible text is a symbol. */
interface KeyLabel {
  readonly text: string;
  readonly spoken?: string;
}

const symbol = (code: number): string => String.fromCodePoint(code);
// Apple modifier symbols: Command, Option, Shift, Control.
const APPLE_SYMBOLS: Readonly<Record<string, number>> = { command: 0x2318, option: 0x2325, shift: 0x21e7, control: 0x2303 };
// Arrow symbols on every platform.
const ARROWS: Readonly<Record<string, [number, string]>> = { arrowup: [0x2191, 'arrowUp'], arrowdown: [0x2193, 'arrowDown'], arrowleft: [0x2190, 'arrowLeft'], arrowright: [0x2192, 'arrowRight'] };
// Named keys (lowercase hotkey token -> message key).
const NAMED: Readonly<Record<string, string>> = { enter: 'enter', escape: 'escape', esc: 'escape', tab: 'tab', space: 'space', backspace: 'backspace', delete: 'delete', home: 'home', end: 'end', pageup: 'pageUp', pagedown: 'pageDown' };

function isApplePlatform(): boolean {
  // Same signal as matchesHotkey (navigator.platform is deprecated).
  return typeof navigator !== 'undefined' && /Macintosh|Mac OS X|iPhone|iPad|iPod/.test(navigator.userAgent);
}

function parse(hotkey: string): string[] | null {
  const parts = hotkey.split('+').map((p) => p.trim());
  return parts.length > 0 && parts.every((p) => p !== '') ? parts : null;
}

export class Kbd {
  readonly host: HTMLElement;
  #options: KbdOptions;
  readonly #doc: Document;
  readonly #combo: HTMLElement;
  #text = '';
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). A `<span>` host keeps it inline with text. */
  static create(host: HTMLElement, options: KbdOptions): Kbd {
    return new Kbd(host, options);
  }

  private constructor(host: HTMLElement, options: KbdOptions) {
    Kbd.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#combo = this.#doc.createElement('kbd');
    this.#combo.className = 'aui-kbd__combo';
    // Render first: invalid options (including config) throw before anything is attached to the host.
    this.#render();
    host.classList.add('aui-kbd');
    host.replaceChildren(this.#combo);
    // Weakly held: safe in renderers that discard nodes without destroy() (table cells).
    this.#group.add(subscribeWhileHosted(host, this, (listener) => kbdConfig.subscribe(listener), (kbd) => {
      kbd.#render();
    }));
  }

  get options(): Readonly<KbdOptions> {
    return this.#options;
  }

  get hotkey(): string {
    return this.#options.hotkey;
  }

  /** The shortcut as text for the resolved platform ("Ctrl+S", or the Apple symbols). */
  get text(): string {
    return this.#text;
  }

  update(options: Partial<KbdOptions>): void {
    const next = { ...this.#options, ...options };
    Kbd.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-kbd', ...SIZES.map((s) => `aui-kbd--${s}`));
  }

  static #assert(options: KbdOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('KBD_OPTIONS', 'Invalid kbd options.', { component: 'kbd', property: `kbd.${property}`, expected });
    };
    const hotkey: unknown = options.hotkey;
    if (typeof hotkey !== 'string' || parse(hotkey) === null) fail('hotkey', 'keys joined by "+", such as "Mod+S"');
    if (options.platform !== undefined && !PLATFORMS.includes(options.platform)) fail('platform', '"auto" | "apple" | "other"');
  }

  #label(part: string, apple: boolean, locale: string): KeyLabel {
    const key = part.toLowerCase();
    const message = (id: string): string => getMessage('kbd', id, {}, locale);
    const modifier: Readonly<Record<string, [string, string]>> = {
      mod: apple ? ['command', 'command'] : ['ctrl', 'ctrl'],
      meta: apple ? ['command', 'command'] : ['meta', 'meta'],
      ctrl: apple ? ['control', 'control'] : ['ctrl', 'ctrl'],
      alt: apple ? ['option', 'option'] : ['alt', 'alt'],
      shift: ['shift', 'shift'],
    };
    const mod = modifier[key];
    if (mod) {
      const code = apple ? APPLE_SYMBOLS[mod[0]] : undefined;
      return code === undefined ? { text: message(mod[1]) } : { text: symbol(code), spoken: message(mod[1]) };
    }
    const arrow = ARROWS[key];
    if (arrow) return { text: symbol(arrow[0]), spoken: message(arrow[1]) };
    const named = NAMED[key];
    if (named) return { text: message(named) };
    if (key === 'plus') return { text: '+' };
    return { text: part.length === 1 ? part.toUpperCase() : part };
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, messages) runs before the host is touched.
    const { platform, size, locale } = kbdConfig.resolve({
      ...(o.platform === undefined ? {} : { platform: o.platform }),
      ...(o.size === undefined ? {} : { size: o.size }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
    const apple = platform === 'apple' || (platform === 'auto' && isApplePlatform());
    const labels = (parse(o.hotkey) ?? []).map((part) => this.#label(part, apple, locale));
    const doc = this.#doc;
    const nodes: Node[] = [];
    labels.forEach((label, i) => {
      // Apple shortcuts are written without separators (Command-S as two keycaps side by side).
      if (i > 0 && !apple) {
        const separator = doc.createElement('span');
        separator.className = 'aui-kbd__separator';
        separator.textContent = '+';
        nodes.push(separator);
      }
      const key = doc.createElement('kbd');
      key.className = 'aui-kbd__key';
      if (label.spoken === undefined) key.textContent = label.text;
      else {
        const shown = doc.createElement('span');
        shown.setAttribute('aria-hidden', 'true');
        shown.textContent = label.text;
        const spoken = doc.createElement('span');
        spoken.textContent = label.spoken;
        applyVisuallyHidden(spoken);
        key.append(shown, spoken);
      }
      nodes.push(key);
    });
    for (const s of SIZES) this.host.classList.toggle(`aui-kbd--${s}`, s === size);
    this.#combo.replaceChildren(...nodes);
    this.#text = labels.map((l) => l.text).join(apple ? '' : '+');
  }
}
