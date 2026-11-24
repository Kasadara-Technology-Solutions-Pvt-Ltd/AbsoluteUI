/**
 * Validation Message (SPEC section 18.8). A standalone field message for controls
 * that AbsoluteUI does not render itself. It links itself to its target through
 * aria-describedby and, for errors, sets aria-invalid on the target. AbsoluteUI
 * inputs render the same markup internally (`aui-validation-message`).
 */
import { configurationError, createId, defineComponentConfig } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { addAriaReference, removeAriaReference } from '@absoluteui/utilities';

export type ValidationMessageTone = 'error' | 'warning' | 'success' | 'info';

// eslint-disable-next-line @typescript-eslint/no-empty-object-type -- no globally configurable options
export interface ValidationMessageConfig {}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    validationMessage: ValidationMessageConfig;
  }
}

export const validationMessageConfig = defineComponentConfig<ValidationMessageConfig>('validationMessage', {});

export interface ValidationMessageIcons {
  error: IconRef;
  warning: IconRef;
  success: IconRef;
  info: IconRef;
}

export interface ValidationMessageOptions {
  /** Message text (never parsed as HTML). Empty hides the message. */
  message?: string;
  tone?: ValidationMessageTone;
  /** Control described by the message. Receives aria-describedby, and aria-invalid for errors. */
  for?: HTMLElement | null;
  icons?: Partial<ValidationMessageIcons>;
}

const TONES: readonly ValidationMessageTone[] = ['error', 'warning', 'success', 'info'];
const DEFAULT_ICONS: ValidationMessageIcons = { error: 'alert-circle', warning: 'alert-triangle', success: 'check-circle', info: 'info' };

export class ValidationMessage {
  readonly host: HTMLElement;
  #options: ValidationMessageOptions;
  #linked: HTMLElement | null = null;
  #setInvalid = false;
  readonly #text: HTMLSpanElement;

  /** Render into `host` (children are replaced). The host receives an id if it has none. */
  static create(host: HTMLElement, options: ValidationMessageOptions = {}): ValidationMessage {
    return new ValidationMessage(host, options);
  }

  private constructor(host: HTMLElement, options: ValidationMessageOptions) {
    ValidationMessage.#assert(options);
    this.host = host;
    this.#options = { ...options };
    this.#text = host.ownerDocument.createElement('span');
    this.#text.className = 'aui-validation-message__text';
    if (!host.id) host.id = createId('aui-validation-message');
    this.#render();
  }

  get message(): string {
    return this.#options.message ?? '';
  }

  get tone(): ValidationMessageTone {
    return this.#options.tone ?? 'error';
  }

  setMessage(message: string, tone?: ValidationMessageTone): void {
    this.update({ message, ...(tone === undefined ? {} : { tone }) });
  }

  clear(): void {
    this.update({ message: '' });
  }

  update(options: Partial<ValidationMessageOptions>): void {
    const next = { ...this.#options, ...options };
    ValidationMessage.#assert(next);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#unlink();
    this.host.replaceChildren();
    this.host.hidden = false;
    this.host.classList.remove('aui-validation-message', ...TONES.map((t) => `aui-validation-message--${t}`));
  }

  static #assert(options: ValidationMessageOptions): void {
    if (options.tone !== undefined && !TONES.includes(options.tone)) {
      throw configurationError('VALIDATION_MESSAGE_OPTIONS', 'Invalid validation message options.', { component: 'validationMessage', property: 'validationMessage.tone', expected: '"error" | "warning" | "success" | "info"' });
    }
    if (options.for !== undefined && options.for !== null && !(options.for instanceof HTMLElement)) {
      throw configurationError('VALIDATION_MESSAGE_OPTIONS', 'Invalid validation message options.', { component: 'validationMessage', property: 'validationMessage.for', expected: 'HTMLElement | null' });
    }
  }

  #unlink(): void {
    if (!this.#linked) return;
    removeAriaReference(this.#linked, 'aria-describedby', this.host.id);
    if (this.#setInvalid) this.#linked.removeAttribute('aria-invalid');
    this.#linked = null;
    this.#setInvalid = false;
  }

  #render(): void {
    const tone = this.tone;
    const message = this.message;
    const host = this.host;
    host.classList.add('aui-validation-message');
    for (const t of TONES) host.classList.toggle(`aui-validation-message--${t}`, t === tone);
    this.#text.textContent = message;
    const icon = renderIcon(this.#options.icons?.[tone] ?? DEFAULT_ICONS[tone], { className: 'aui-validation-message__icon', doc: host.ownerDocument });
    host.replaceChildren(icon, this.#text);
    host.hidden = message === '';

    const target = this.#options.for ?? null;
    if (target !== this.#linked) this.#unlink();
    if (target && message !== '') {
      addAriaReference(target, 'aria-describedby', host.id);
      this.#linked = target;
      if (tone === 'error') {
        // Take ownership of aria-invalid only when the consumer had not already set it,
        // so clearing the message never removes a consumer-managed state.
        const consumerOwned = !this.#setInvalid && target.getAttribute('aria-invalid') === 'true';
        if (!consumerOwned) {
          target.setAttribute('aria-invalid', 'true');
          this.#setInvalid = true;
        }
      } else if (this.#setInvalid) {
        target.removeAttribute('aria-invalid');
        this.#setInvalid = false;
      }
    } else {
      this.#unlink();
    }
  }
}
