/**
 * Button (SPEC section 18.4, R0 reference component).
 * Enhances a native <button>, or a link (<a href>) styled as a button (since 0.9.0); all
 * semantics stay native (section 13.3). The CSS classes also work without JavaScript:
 * <button class="aui-button aui-button--primary">.
 */
import { configurationError, defineComponentConfig, emit, getMessage, registerMessages, validators, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { applyVisuallyHidden } from '@absoluteui/utilities';

export type ButtonVariant = 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
export type ButtonSize = 'sm' | 'md' | 'lg';
/** Elements Button enhances: a native button, or a link styled as a button (since 0.9.0). */
export type ButtonHost = HTMLButtonElement | HTMLAnchorElement;

export interface ButtonConfig {
  variant: ButtonVariant;
  size: ButtonSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    button: ButtonConfig;
  }
}

export const buttonConfig = defineComponentConfig<ButtonConfig>('button', {
  variant: { default: 'secondary', expected: '"primary" | "secondary" | "outline" | "ghost" | "danger"', validate: validators.oneOf(['primary', 'secondary', 'outline', 'ghost', 'danger'] as const) },
  size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(['sm', 'md', 'lg'] as const) },
});

registerMessages('button', 'en', { loading: 'Loading' });

export interface ButtonIcons {
  loading: IconRef;
}

export interface ButtonOptions extends Partial<ButtonConfig> {
  /** Busy state: stays focusable, activation is blocked, spinner shown. */
  loading?: boolean;
  icon?: IconRef | null;
  iconPosition?: 'start' | 'end';
  /** Stretch to the full inline size of the container (since 0.9.0). */
  fullWidth?: boolean;
  /**
   * Disabled state (since 0.9.0). Links have no native `disabled`: a disabled link gets
   * `aria-disabled="true"`, leaves the tab order, and its activation is blocked; its href
   * stays. On a <button> it sets the native `disabled` property; unset leaves it alone.
   */
  disabled?: boolean;
  /**
   * Accessible name for icon-only buttons (required when the button has no text).
   * Enforced per SPEC section 7.3.
   */
  label?: string;
  /** Icon slot overrides (section 7.2). */
  icons?: Partial<ButtonIcons>;
  /**
   * Toggle button (R13-5, since 0.9.0): a boolean exposes aria-pressed and flips on each
   * activation, emitting `aui-change`; null or unset is an ordinary button. Buttons only.
   */
  pressed?: boolean | null;
}

/** `aui-change` detail of a toggle button: the state after the user's activation. */
export interface ButtonChangeDetail {
  pressed: boolean;
}

const VARIANTS: readonly ButtonVariant[] = ['primary', 'secondary', 'outline', 'ghost', 'danger'];
const SIZES: readonly ButtonSize[] = ['sm', 'md', 'lg'];

export class Button<E extends ButtonHost = HTMLButtonElement> {
  readonly element: E;
  #options: ButtonOptions;
  #iconEl: Element | null = null;
  #statusEl: HTMLSpanElement | null = null;
  readonly #group = new DisposableGroup();
  /** The link's own tabindex attribute before Button disabled it (undefined: untouched). */
  #savedTabIndex: string | null | undefined;

  /** Enhance an existing native button, or a link (<a href>) styled as a button. */
  static enhance<E extends ButtonHost = HTMLButtonElement>(element: E, options: ButtonOptions = {}): Button<E> {
    return new Button(element, options);
  }

  /** Create a new native button. Text is set via textContent (never parsed as HTML). */
  static create(options: ButtonOptions & { text?: string; type?: 'button' | 'submit' | 'reset' } = {}, doc: Document = document): Button {
    const el = doc.createElement('button');
    el.type = options.type ?? 'button';
    if (options.text) el.textContent = options.text;
    return new Button(el, options);
  }

  private constructor(element: E, options: ButtonOptions) {
    if (!(element instanceof HTMLButtonElement) && !(element instanceof HTMLAnchorElement)) {
      throw configurationError('BUTTON_HOST', 'Button requires a native <button> or <a> element.', { component: 'button', property: 'element', expected: 'HTMLButtonElement | HTMLAnchorElement' });
    }
    this.element = element;
    this.#options = { ...options };
    // Render first: invalid options throw before any listener or subscription is attached.
    this.#render();
    // Block activation while loading (or a disabled link). Capture phase runs before consumer
    // handlers, including router link handlers on the same element.
    this.#group.listen(element, 'click', (event) => {
      if (this.#blocked()) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    }, { capture: true });
    // Toggle buttons flip after the capture guard, so loading and disabled states never toggle.
    this.#group.listen(element, 'click', () => {
      const pressed = this.#options.pressed;
      if (typeof pressed !== 'boolean') return;
      this.#options = { ...this.#options, pressed: !pressed };
      this.#render();
      emit(this.element, 'aui-change', { pressed: !pressed } satisfies ButtonChangeDetail);
    });
    this.#group.add(buttonConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<ButtonOptions> {
    return this.#options;
  }

  /** Toggle state: true or false for a toggle button, null for an ordinary button. */
  get pressed(): boolean | null {
    return typeof this.#options.pressed === 'boolean' ? this.#options.pressed : null;
  }

  update(options: Partial<ButtonOptions>): void {
    const previous = this.#options;
    this.#options = { ...this.#options, ...options };
    try {
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
  }

  setLoading(loading: boolean): void {
    this.update({ loading });
  }

  destroy(): void {
    this.#group.dispose();
    this.#iconEl?.remove();
    this.#statusEl?.remove();
    this.element.removeAttribute('aria-pressed');
    this.element.classList.remove('aui-button', 'aui-button--icon-only', 'aui-button--full-width', 'aui-button--pressed', ...VARIANTS.map((v) => `aui-button--${v}`), ...SIZES.map((s) => `aui-button--${s}`));
    this.element.removeAttribute('aria-disabled');
    delete this.element.dataset.loading;
    this.#restoreTabIndex();
  }

  #isLink(): boolean {
    return this.element instanceof HTMLAnchorElement;
  }

  #blocked(): boolean {
    return (this.#options.loading ?? false) || (this.#isLink() && (this.#options.disabled ?? false));
  }

  #restoreTabIndex(): void {
    if (this.#savedTabIndex === undefined) return;
    if (this.#savedTabIndex === null) this.element.removeAttribute('tabindex');
    else this.element.setAttribute('tabindex', this.#savedTabIndex);
    this.#savedTabIndex = undefined;
  }

  #render(): void {
    const { variant, size } = buttonConfig.resolve({
      ...(this.#options.variant === undefined ? {} : { variant: this.#options.variant }),
      ...(this.#options.size === undefined ? {} : { size: this.#options.size }),
    });
    const el = this.element;
    const hasText = Array.from(el.childNodes).some((n) => n.nodeType === Node.TEXT_NODE && (n.nodeValue ?? '').trim() !== '') ||
      Array.from(el.children).some((c) => c !== this.#iconEl && c !== this.#statusEl && c.textContent.trim() !== '');
    const iconOnly = !hasText && (this.#options.icon ?? null) !== null;

    if (iconOnly && !this.#options.label && !el.getAttribute('aria-label') && !el.getAttribute('aria-labelledby')) {
      throw configurationError('BUTTON_ICON_ONLY_LABEL', 'Icon-only buttons require an accessible name.', {
        component: 'button',
        property: 'button.label',
        expected: 'non-empty string',
        remediation: 'Pass `label` or set aria-label/aria-labelledby on the button.',
      });
    }

    const pressed = this.#options.pressed;
    if (pressed != null && typeof pressed !== 'boolean') {
      throw configurationError('BUTTON_PRESSED', 'pressed must be a boolean or null.', { component: 'button', property: 'button.pressed', expected: 'boolean | null' });
    }
    if (typeof pressed === 'boolean' && this.#isLink()) {
      throw configurationError('BUTTON_PRESSED', 'Links cannot be toggle buttons.', { component: 'button', property: 'button.pressed', expected: 'a <button> host', remediation: 'Use a <button> for a toggle; links navigate.' });
    }

    el.classList.add('aui-button');
    el.classList.toggle('aui-button--pressed', pressed === true);
    if (typeof pressed === 'boolean') el.setAttribute('aria-pressed', String(pressed));
    else el.removeAttribute('aria-pressed');
    for (const v of VARIANTS) el.classList.toggle(`aui-button--${v}`, v === variant);
    for (const s of SIZES) el.classList.toggle(`aui-button--${s}`, s === size);
    el.classList.toggle('aui-button--icon-only', iconOnly);
    el.classList.toggle('aui-button--full-width', this.#options.fullWidth ?? false);
    const loading = this.#options.loading ?? false;
    const label = this.#options.label;
    if (label) el.setAttribute('aria-label', loading ? `${label}, ${getMessage('button', 'loading')}` : label);
    const disabled = this.#options.disabled;
    if (el instanceof HTMLButtonElement) {
      if (disabled !== undefined) el.disabled = disabled;
    } else if (disabled === true) {
      if (this.#savedTabIndex === undefined) this.#savedTabIndex = el.getAttribute('tabindex');
      el.setAttribute('tabindex', '-1');
    } else {
      this.#restoreTabIndex();
    }
    if (this.#blocked()) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
    if (loading) el.dataset.loading = '';
    else delete el.dataset.loading;

    this.#iconEl?.remove();
    this.#iconEl = null;
    const iconRef = loading ? (this.#options.icons?.loading ?? 'spinner') : (this.#options.icon ?? null);
    if (iconRef !== null) {
      this.#iconEl = renderIcon(iconRef, { className: loading ? 'aui-button__icon aui-button__spinner' : 'aui-button__icon', doc: el.ownerDocument });
      if ((this.#options.iconPosition ?? 'start') === 'start') el.prepend(this.#iconEl);
      else el.append(this.#iconEl);
    }

    // Loading state is exposed in the accessible name via visually hidden text.
    if (loading && !this.#statusEl) {
      this.#statusEl = el.ownerDocument.createElement('span');
      applyVisuallyHidden(this.#statusEl);
      el.append(this.#statusEl);
    }
    if (this.#statusEl) {
      if (loading) this.#statusEl.textContent = `, ${getMessage('button', 'loading')}`;
      else {
        this.#statusEl.remove();
        this.#statusEl = null;
      }
    }
  }
}
