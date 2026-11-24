/**
 * Button Group (SPEC section 18). A visually attached set of related native buttons
 * inside a labelled `role="group"`. Keyboard interaction stays native: Tab
 * moves through every button. This is not a toolbar (no arrow-key roving
 * focus); a Toolbar component is planned for that pattern.
 */
import { configurationError, defineComponentConfig, DisposableGroup, emit, validators } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { Button, type ButtonSize, type ButtonVariant } from '../button/button.js';

export type ButtonGroupOrientation = 'horizontal' | 'vertical';

export interface ButtonGroupConfig {
  orientation: ButtonGroupOrientation;
  /** Shared borders and no inner radii; when false, buttons are spaced with a gap. */
  attached: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    buttonGroup: ButtonGroupConfig;
  }
}

export const buttonGroupConfig = defineComponentConfig<ButtonGroupConfig>('buttonGroup', {
  orientation: { default: 'horizontal', expected: '"horizontal" | "vertical"', validate: validators.oneOf(['horizontal', 'vertical'] as const) },
  attached: { default: true, expected: 'boolean', validate: validators.isBoolean },
});

export interface ButtonGroupButton {
  text?: string;
  icon?: IconRef;
  /** Accessible name; required for icon-only buttons. */
  label?: string;
  variant?: ButtonVariant;
  /** Reported in `aui-action`. Default: the button's index as a string. */
  value?: string;
  disabled?: boolean;
}

export interface ButtonGroupOptions extends Partial<ButtonGroupConfig> {
  /** Required accessible name of the group (aria-label). */
  label: string;
  /** Size of the Buttons the group creates or enhances. Default: the Button configuration. */
  size?: ButtonSize;
  /** create() only: the buttons to render. */
  buttons?: readonly ButtonGroupButton[];
}

export interface ButtonGroupActionDetail {
  value: string;
}

const HOST_CLASSES = ['aui-button-group', 'aui-button-group--horizontal', 'aui-button-group--vertical', 'aui-button-group--attached'];

export class ButtonGroup {
  readonly element: HTMLElement;
  #options: ButtonGroupOptions;
  /** Buttons this group created (create) or enhanced (enhance); destroyed with the group. */
  #owned: Button[] = [];
  #built = false;
  #builtButtons: readonly ButtonGroupButton[] | undefined;
  readonly #mode: 'create' | 'enhance';
  readonly #original: { role: string | null; label: string | null };
  readonly #group = new DisposableGroup();

  /** Render a group of Buttons into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: ButtonGroupOptions): ButtonGroup {
    return new ButtonGroup(host, options, 'create');
  }

  /**
   * Enhance an existing element that contains native buttons. Plain native
   * buttons are enhanced as Buttons (and restored on destroy); buttons that
   * already carry `aui-button` are left to their own controller.
   */
  static enhance(element: HTMLElement, options: ButtonGroupOptions): ButtonGroup {
    return new ButtonGroup(element, options, 'enhance');
  }

  private constructor(element: HTMLElement, options: ButtonGroupOptions, mode: 'create' | 'enhance') {
    this.#assertOptions(options, mode);
    this.element = element;
    this.#mode = mode;
    this.#options = { ...options };
    this.#original = { role: element.getAttribute('role'), label: element.getAttribute('aria-label') };
    // Render first: invalid options (including Button validation) throw before listeners are attached.
    this.#render();
    if (mode === 'create') {
      this.#group.listen(element, 'click', (event) => {
        const index = this.#owned.findIndex((b) => event.target instanceof Node && b.element.contains(event.target));
        const spec = this.#options.buttons?.[index];
        if (index < 0 || !spec) return;
        emit(element, 'aui-action', { value: spec.value ?? String(index) } satisfies ButtonGroupActionDetail);
      });
    }
    this.#group.add(buttonGroupConfig.subscribe(() => {
      this.#render();
    }));
  }

  get options(): Readonly<ButtonGroupOptions> {
    return this.#options;
  }

  /** The native buttons in the group, in DOM order. */
  get buttons(): HTMLButtonElement[] {
    return Array.from(this.element.querySelectorAll<HTMLButtonElement>(':scope > button'));
  }

  update(options: Partial<ButtonGroupOptions>): void {
    const next = { ...this.#options, ...options };
    this.#assertOptions(next, this.#mode);
    this.#options = next;
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    for (const b of this.#owned) b.destroy();
    if (this.#mode === 'create') this.element.replaceChildren();
    this.#owned = [];
    this.element.classList.remove(...HOST_CLASSES);
    this.#restore('role', this.#original.role);
    this.#restore('aria-label', this.#original.label);
  }

  #restore(name: string, value: string | null): void {
    if (value === null) this.element.removeAttribute(name);
    else this.element.setAttribute(name, value);
  }

  #config(): Readonly<ButtonGroupConfig> {
    const o = this.#options;
    return buttonGroupConfig.resolve({
      ...(o.orientation === undefined ? {} : { orientation: o.orientation }),
      ...(o.attached === undefined ? {} : { attached: o.attached }),
    });
  }

  #assertOptions(options: ButtonGroupOptions, mode: 'create' | 'enhance'): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('BUTTON_GROUP_OPTIONS', 'Invalid button group options.', { component: 'buttonGroup', property: `buttonGroup.${property}`, expected });
    };
    if (typeof options.label !== 'string' || options.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (options.size !== undefined && !['sm', 'md', 'lg'].includes(options.size)) fail('size', '"sm" | "md" | "lg"');
    if (mode === 'enhance' && options.buttons !== undefined) fail('buttons', 'create() only; enhance() uses the existing buttons');
  }

  #render(): void {
    const o = this.#options;
    const { orientation, attached } = this.#config();
    const el = this.element;
    if (this.#mode === 'create') {
      if (!this.#built || this.#builtButtons !== o.buttons) this.#buildButtons();
    } else if (!this.#built) {
      this.#enhanceButtons();
    }
    if (o.size !== undefined) {
      for (const b of this.#owned) if (b.options.size !== o.size) b.update({ size: o.size });
    }
    el.classList.add('aui-button-group');
    el.classList.toggle('aui-button-group--horizontal', orientation === 'horizontal');
    el.classList.toggle('aui-button-group--vertical', orientation === 'vertical');
    el.classList.toggle('aui-button-group--attached', attached);
    el.setAttribute('role', 'group');
    el.setAttribute('aria-label', o.label);
  }

  /** create(): build Buttons; if any fails validation, nothing is kept. */
  #buildButtons(): void {
    const doc = this.element.ownerDocument;
    const specs = this.#options.buttons ?? [];
    const created: Button[] = [];
    try {
      for (const spec of specs) {
        const b = Button.create({
          ...(spec.text === undefined ? {} : { text: spec.text }),
          ...(spec.icon === undefined ? {} : { icon: spec.icon }),
          ...(spec.label === undefined ? {} : { label: spec.label }),
          ...(spec.variant === undefined ? {} : { variant: spec.variant }),
          ...(this.#options.size === undefined ? {} : { size: this.#options.size }),
        }, doc);
        b.element.disabled = spec.disabled ?? false;
        if (spec.value !== undefined) b.element.value = spec.value;
        created.push(b);
      }
    } catch (error) {
      for (const b of created) b.destroy();
      throw error;
    }
    for (const b of this.#owned) b.destroy();
    this.#owned = created;
    this.#builtButtons = this.#options.buttons;
    this.#built = true;
    this.element.replaceChildren(...created.map((b) => b.element));
  }

  /** enhance(): enhance plain native buttons once; consumer-enhanced ones are untouched. */
  #enhanceButtons(): void {
    const plain = this.buttons.filter((b) => !b.classList.contains('aui-button'));
    const enhanced: Button[] = [];
    try {
      for (const el of plain) enhanced.push(Button.enhance(el, this.#options.size === undefined ? {} : { size: this.#options.size }));
    } catch (error) {
      for (const b of enhanced) b.destroy();
      throw error;
    }
    this.#owned = enhanced;
    this.#built = true;
  }
}
