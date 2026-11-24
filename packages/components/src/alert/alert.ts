/**
 * Alert (SPEC section 18.9). A prominent message block for page- or section-level
 * status: tone icon, optional title, message, optional actions and dismiss
 * button. Tone is never conveyed by color alone: every alert has an icon and a
 * visually hidden, localized tone prefix ("Error:"). Static by default; opt in
 * to a live role (`status` or `alert`) for messages inserted or updated after load.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { applyVisuallyHidden } from '@absoluteui/utilities';
import { Button, type ButtonVariant } from '../button/button.js';

export type AlertTone = 'info' | 'success' | 'warning' | 'error';
export type AlertLive = 'off' | 'polite' | 'assertive';

export interface AlertConfig {
  dismissible: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    alert: AlertConfig & { locale: string };
  }
}

export const alertConfig = defineComponentConfig<AlertConfig, 'locale'>(
  'alert',
  { dismissible: { default: false, expected: 'boolean', validate: validators.isBoolean } },
  ['locale'],
);

registerMessages('alert', 'en', {
  info: 'Information:',
  success: 'Success:',
  warning: 'Warning:',
  error: 'Error:',
  dismiss: 'Dismiss',
});

export interface AlertIcons {
  info: IconRef;
  success: IconRef;
  warning: IconRef;
  error: IconRef;
  dismiss: IconRef;
}

export interface AlertAction {
  label: string;
  /** Sent in the `aui-action` event detail. */
  value: string;
  variant?: ButtonVariant;
}

export interface AlertOptions extends Partial<AlertConfig> {
  /** Default `info`. */
  tone?: AlertTone;
  /** Optional title (text only). */
  title?: string;
  /** Message. Strings are rendered as text, never parsed as HTML (section 14.5). */
  message: string | Node;
  /**
   * Live role. `off` (default): static content. `polite`: role=status. `assertive`: role=alert.
   * Live roles announce content inserted or changed after the page has loaded.
   */
  live?: AlertLive;
  actions?: readonly AlertAction[];
  locale?: string;
  icons?: Partial<AlertIcons>;
}

export interface AlertActionDetail {
  value: string;
}

export type AlertDismissReason = 'dismiss-button' | 'programmatic';

export interface AlertDismissDetail {
  reason: AlertDismissReason;
}

const TONES: readonly AlertTone[] = ['info', 'success', 'warning', 'error'];
const LIVE: readonly AlertLive[] = ['off', 'polite', 'assertive'];
const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'ghost', 'danger'];
const DEFAULT_ICONS: AlertIcons = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle', dismiss: 'close' };

export class Alert {
  readonly host: HTMLElement;
  #options: AlertOptions;
  #dismissed = false;
  #dismissButton: Button | null = null;
  #actionButtons: Button[] = [];
  #renderedActions: readonly AlertAction[] | undefined;
  readonly #doc: Document;
  readonly #icon: HTMLSpanElement;
  readonly #content: HTMLDivElement;
  readonly #tone: HTMLSpanElement;
  readonly #title: HTMLDivElement;
  readonly #message: HTMLDivElement;
  readonly #actions: HTMLDivElement;
  readonly #group = new DisposableGroup();

  /** Render an alert into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: AlertOptions): Alert {
    return new Alert(host, options);
  }

  private constructor(host: HTMLElement, options: AlertOptions) {
    Alert.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#doc;

    this.#icon = doc.createElement('span');
    this.#icon.className = 'aui-alert__icon';
    this.#content = doc.createElement('div');
    this.#content.className = 'aui-alert__content';
    this.#tone = doc.createElement('span');
    this.#tone.className = 'aui-alert__tone';
    applyVisuallyHidden(this.#tone);
    this.#title = doc.createElement('div');
    this.#title.className = 'aui-alert__title';
    this.#message = doc.createElement('div');
    this.#message.className = 'aui-alert__message';
    this.#actions = doc.createElement('div');
    this.#actions.className = 'aui-alert__actions';
    this.#content.append(this.#tone, this.#title, this.#message, this.#actions);

    // Render first: invalid options (including config) throw before anything is attached to the host.
    this.#render();
    host.classList.add('aui-alert');
    host.replaceChildren(this.#icon, this.#content);
    if (this.#dismissButton) host.append(this.#dismissButton.element);
    this.#group.add(alertConfig.subscribe(() => {
      this.#render();
    }));
  }

  get isDismissed(): boolean {
    return this.#dismissed;
  }

  get options(): Readonly<AlertOptions> {
    return this.#options;
  }

  update(options: Partial<AlertOptions>): void {
    const next = { ...this.#options, ...options };
    Alert.#assert(next);
    this.#options = next;
    this.#render();
  }

  /** Emits cancelable `aui-dismiss`; hides the alert unless prevented. Returns whether it was dismissed. */
  dismiss(): boolean {
    return this.#requestDismiss('programmatic');
  }

  destroy(): void {
    this.#group.dispose();
    this.#dismissButton?.destroy();
    for (const b of this.#actionButtons) b.destroy();
    this.host.replaceChildren();
    this.host.hidden = false;
    this.host.removeAttribute('role');
    this.host.classList.remove('aui-alert', 'aui-alert--dismissible', ...TONES.map((t) => `aui-alert--${t}`));
  }

  #config(): Readonly<AlertConfig & { locale: string }> {
    const o = this.#options;
    return alertConfig.resolve({
      ...(o.dismissible === undefined ? {} : { dismissible: o.dismissible }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  static #assert(options: AlertOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('ALERT_OPTIONS', 'Invalid alert options.', { component: 'alert', property: `alert.${property}`, expected });
    };
    if (options.tone !== undefined && !TONES.includes(options.tone)) fail('tone', '"info" | "success" | "warning" | "error"');
    if (options.live !== undefined && !LIVE.includes(options.live)) fail('live', '"off" | "polite" | "assertive"');
    const m: unknown = options.message;
    if (!(m instanceof Node) && (typeof m !== 'string' || m.trim() === '')) fail('message', 'non-empty string or Node');
    if (options.title !== undefined && typeof options.title !== 'string') fail('title', 'string');
    for (const a of options.actions ?? []) {
      if (typeof a.label !== 'string' || a.label.trim() === '') fail('actions.label', 'non-empty string');
      if (typeof a.value !== 'string') fail('actions.value', 'string');
      if (a.variant !== undefined && !VARIANTS.includes(a.variant)) fail('actions.variant', '"primary" | "secondary" | "ghost" | "danger"');
    }
  }

  #requestDismiss(reason: AlertDismissReason): boolean {
    if (this.#dismissed) return false;
    const proceed = emit(this.host, 'aui-dismiss', { reason } satisfies AlertDismissDetail, { cancelable: true, bubbles: false });
    if (!proceed) return false;
    this.#dismissed = true;
    this.host.hidden = true;
    return true;
  }

  #renderDismiss(dismissible: boolean, locale: string): void {
    const label = getMessage('alert', 'dismiss', {}, locale);
    const icon = this.#options.icons?.dismiss ?? DEFAULT_ICONS.dismiss;
    if (!dismissible) {
      this.#dismissButton?.destroy();
      this.#dismissButton?.element.remove();
      this.#dismissButton = null;
      return;
    }
    if (this.#dismissButton) {
      this.#dismissButton.update({ label, icon });
      return;
    }
    const b = Button.create({ variant: 'ghost', size: 'sm', icon, label }, this.#doc);
    b.element.classList.add('aui-alert__dismiss');
    b.element.addEventListener('click', () => {
      this.#requestDismiss('dismiss-button');
    });
    this.#dismissButton = b;
    // During construction the host is populated after the first render.
    if (this.host.contains(this.#content)) this.host.append(b.element);
  }

  #renderActions(): void {
    const actions = this.#options.actions;
    // Rebuild only when the actions change, so a focused action button keeps focus across updates.
    if (actions === this.#renderedActions) return;
    this.#renderedActions = actions;
    for (const b of this.#actionButtons) {
      b.destroy();
      b.element.remove();
    }
    this.#actionButtons = (actions ?? []).map((action) => {
      const b = Button.create({ text: action.label, variant: action.variant ?? 'secondary', size: 'sm' }, this.#doc);
      b.element.addEventListener('click', () => {
        emit(this.host, 'aui-action', { value: action.value } satisfies AlertActionDetail);
      });
      return b;
    });
    this.#actions.replaceChildren(...this.#actionButtons.map((b) => b.element));
    this.#actions.hidden = this.#actionButtons.length === 0;
  }

  #render(): void {
    const o = this.#options;
    // Everything that can throw (config, icon resolution, messages) runs before the host is touched.
    const config = this.#config();
    const tone = o.tone ?? 'info';
    const icon = renderIcon(o.icons?.[tone] ?? DEFAULT_ICONS[tone], { doc: this.#doc });
    const toneText = getMessage('alert', tone, {}, config.locale);
    const host = this.host;

    for (const t of TONES) host.classList.toggle(`aui-alert--${t}`, t === tone);
    host.classList.toggle('aui-alert--dismissible', config.dismissible);
    const live = o.live ?? 'off';
    if (live === 'assertive') host.setAttribute('role', 'alert');
    else if (live === 'polite') host.setAttribute('role', 'status');
    else host.removeAttribute('role');

    this.#icon.replaceChildren(icon);
    this.#tone.textContent = toneText;
    this.#title.textContent = o.title ?? '';
    this.#title.hidden = !o.title;
    this.#message.replaceChildren(typeof o.message === 'string' ? this.#doc.createTextNode(o.message) : o.message);
    this.#renderActions();
    this.#renderDismiss(config.dismissible, config.locale);
  }
}
