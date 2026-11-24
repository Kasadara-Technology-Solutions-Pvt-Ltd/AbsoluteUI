/**
 * Inline Message (SPEC section 18.9). A compact, one-line status shown next to the
 * content it describes, such as "Saved 2 minutes ago" or "Offline". Tone is
 * conveyed by an icon and a visually hidden, localized prefix, never by color
 * alone. Static by default; opt in to a live role for status that changes.
 */
import { configurationError, defineComponentConfig, getMessage, registerMessages, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { applyVisuallyHidden } from '@absoluteui/utilities';

export type InlineMessageTone = 'info' | 'success' | 'warning' | 'error';
export type InlineMessageLive = 'off' | 'polite' | 'assertive';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- only the inherited locale is configurable
export interface InlineMessageConfig {}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    inlineMessage: InlineMessageConfig & { locale: string };
  }
}

export const inlineMessageConfig = defineComponentConfig<InlineMessageConfig, 'locale'>('inlineMessage', {}, ['locale']);

registerMessages('inlineMessage', 'en', {
  info: 'Information:',
  success: 'Success:',
  warning: 'Warning:',
  error: 'Error:',
});

export interface InlineMessageIcons {
  info: IconRef;
  success: IconRef;
  warning: IconRef;
  error: IconRef;
}

export interface InlineMessageOptions {
  /** Default `info`. */
  tone?: InlineMessageTone;
  /** Message text (never parsed as HTML). */
  message: string;
  /**
   * Live role. `off` (default): static. `polite`: role=status. `assertive`: role=alert.
   * Live roles announce changes made after the page has loaded (use with `update()`).
   */
  live?: InlineMessageLive;
  locale?: string;
  icons?: Partial<InlineMessageIcons>;
}

const TONES: readonly InlineMessageTone[] = ['info', 'success', 'warning', 'error'];
const LIVE: readonly InlineMessageLive[] = ['off', 'polite', 'assertive'];
const DEFAULT_ICONS: InlineMessageIcons = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle' };

export class InlineMessage {
  readonly host: HTMLElement;
  #options: InlineMessageOptions;
  readonly #doc: Document;
  readonly #icon: HTMLSpanElement;
  readonly #tone: HTMLSpanElement;
  readonly #text: HTMLSpanElement;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). A `<span>` or `<div>` host works. */
  static create(host: HTMLElement, options: InlineMessageOptions): InlineMessage {
    return new InlineMessage(host, options);
  }

  private constructor(host: HTMLElement, options: InlineMessageOptions) {
    InlineMessage.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;
    this.#icon = doc.createElement('span');
    this.#icon.className = 'aui-inline-message__icon';
    this.#tone = doc.createElement('span');
    this.#tone.className = 'aui-inline-message__tone';
    applyVisuallyHidden(this.#tone);
    this.#text = doc.createElement('span');
    this.#text.className = 'aui-inline-message__text';

    // Render first: invalid options (including config) throw before anything is attached to the host.
    this.#render();
    host.classList.add('aui-inline-message');
    host.replaceChildren(this.#icon, this.#tone, this.#text);
    this.#group.add(inlineMessageConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<InlineMessageOptions> {
    return this.#options;
  }

  get message(): string {
    return this.#options.message;
  }

  update(options: Partial<InlineMessageOptions>): void {
    const next = { ...this.#options, ...options };
    InlineMessage.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.removeAttribute('role');
    this.host.classList.remove('aui-inline-message', ...TONES.map((t) => `aui-inline-message--${t}`));
  }

  static #assert(options: InlineMessageOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('INLINE_MESSAGE_OPTIONS', 'Invalid inline message options.', { component: 'inlineMessage', property: `inlineMessage.${property}`, expected });
    };
    if (options.tone !== undefined && !TONES.includes(options.tone)) fail('tone', '"info" | "success" | "warning" | "error"');
    if (options.live !== undefined && !LIVE.includes(options.live)) fail('live', '"off" | "polite" | "assertive"');
    const m: unknown = options.message;
    if (typeof m !== 'string' || m.trim() === '') fail('message', 'non-empty string');
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, icon resolution, messages) runs before the host is touched.
    const { locale } = inlineMessageConfig.resolve(o.locale === undefined ? {} : { locale: o.locale });
    const tone = o.tone ?? 'info';
    const icon = renderIcon(o.icons?.[tone] ?? DEFAULT_ICONS[tone], { doc: this.#doc });
    const toneText = getMessage('inlineMessage', tone, {}, locale);
    const host = this.host;

    for (const t of TONES) host.classList.toggle(`aui-inline-message--${t}`, t === tone);
    const live = o.live ?? 'off';
    if (live === 'assertive') host.setAttribute('role', 'alert');
    else if (live === 'polite') host.setAttribute('role', 'status');
    else host.removeAttribute('role');
    this.#icon.replaceChildren(icon);
    // Trailing space keeps the prefix and message separate words for assistive technology.
    this.#tone.textContent = `${toneText} `;
    this.#text.textContent = o.message;
  }
}
