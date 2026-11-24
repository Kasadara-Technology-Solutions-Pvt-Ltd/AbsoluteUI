/**
 * Toggle Group (R13-5). A named group of toggle buttons (aria-pressed) for one setting
 * with a few choices, such as text alignment or a list/grid view switch: single
 * selection (at most one pressed) or multiple. One button is in the tab sequence;
 * arrow keys move between buttons (roving tabindex), Enter or Space toggles.
 */
import { configurationError, defineComponentConfig, emit, getCommonConfig, validators, DisposableGroup } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { createRovingTabindex, type RovingTabindex } from '@absoluteui/utilities';
import { Button, type ButtonChangeDetail, type ButtonSize } from '../button/button.js';

export interface ToggleGroupConfig {
  size: ButtonSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    toggleGroup: ToggleGroupConfig;
  }
}

export const toggleGroupConfig = defineComponentConfig<ToggleGroupConfig>('toggleGroup', {
  size: { default: 'md', expected: '"sm" | "md" | "lg"', validate: validators.oneOf(['sm', 'md', 'lg'] as const) },
});

export interface ToggleGroupItem {
  value: string;
  /** Visible text, or the accessible name of an icon-only item. */
  label: string;
  icon?: IconRef | null;
  /** Show only the icon; the label stays the accessible name. */
  iconOnly?: boolean;
  disabled?: boolean;
}

export interface ToggleGroupOptions extends Partial<ToggleGroupConfig> {
  /** Accessible name of the group, such as "Text alignment". */
  label: string;
  items: readonly ToggleGroupItem[];
  /** Pressed values. In single mode, at most one. */
  value?: readonly string[];
  /** Allow several pressed items. Default false (single selection). */
  multiple?: boolean;
  /** Single mode: the pressed item cannot be released (one stays pressed). */
  required?: boolean;
  orientation?: 'horizontal' | 'vertical';
  /** Join the buttons into one segmented control. */
  attached?: boolean;
  disabled?: boolean;
}

/** `aui-change` detail: the pressed values after the user's change. */
export interface ToggleGroupChangeDetail {
  value: string[];
  /** The item the user toggled. */
  changed: string;
}

const MAX_ITEMS = 100;

export class ToggleGroup {
  readonly host: HTMLElement;
  #options: ToggleGroupOptions;
  #value: string[];
  readonly #doc: Document;
  #buttons: { item: ToggleGroupItem; button: Button }[] = [];
  #roving: RovingTabindex | null = null;
  #builtItems: readonly ToggleGroupItem[] | null = null;
  /** Listeners of the current buttons, released when they are rebuilt. */
  #items = new DisposableGroup();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: ToggleGroupOptions): ToggleGroup {
    return new ToggleGroup(host, options);
  }

  private constructor(host: HTMLElement, options: ToggleGroupOptions) {
    ToggleGroup.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = ToggleGroup.#normalize(options);
    // Render first: invalid options (including config and icons) throw before the host is touched.
    const nodes = this.#build();
    host.classList.add('aui-toggle-group');
    host.setAttribute('role', 'group');
    host.replaceChildren(...nodes);
    this.#sync();
    this.#group.add(toggleGroupConfig.subscribe(() => {
      this.#sync();
    }));
  }

  get options(): Readonly<ToggleGroupOptions> {
    return this.#options;
  }

  /** Pressed values, in item order. */
  get value(): readonly string[] {
    return this.#value;
  }

  /** Set the pressed values (no event). */
  setValue(value: readonly string[]): void {
    this.update({ value });
  }

  update(options: Partial<ToggleGroupOptions>): void {
    const next = { ...this.#options, ...options };
    ToggleGroup.#assert(next);
    const nodes = next.items !== this.#builtItems ? this.#build(next) : null;
    this.#options = next;
    if (options.value !== undefined || options.items !== undefined || options.multiple !== undefined) this.#value = ToggleGroup.#normalize(next);
    if (nodes) this.host.replaceChildren(...nodes);
    this.#sync();
  }

  /** Focus the button in the tab sequence. */
  focus(): void {
    const active = this.#buttons[this.#roving?.activeIndex ?? 0]?.button.element;
    active?.focus();
  }

  destroy(): void {
    this.#group.dispose();
    this.#teardown();
    this.host.replaceChildren();
    for (const name of ['role', 'aria-label', 'aria-orientation', 'aria-disabled']) this.host.removeAttribute(name);
    this.host.classList.remove('aui-toggle-group', 'aui-toggle-group--vertical', 'aui-toggle-group--attached');
  }

  static #assert(options: ToggleGroupOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TOGGLE_GROUP_OPTIONS', 'Invalid toggle group options.', { component: 'toggleGroup', property: `toggleGroup.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const items: unknown = options.items;
    if (!Array.isArray(items) || items.length === 0 || items.length > MAX_ITEMS) fail('items', `1 to ${String(MAX_ITEMS)} items { value, label }`);
    const seen = new Set<string>();
    for (const item of options.items) {
      if (typeof item.value !== 'string' || item.value === '' || seen.has(item.value)) fail('items', 'unique, non-empty string values');
      if (typeof item.label !== 'string' || item.label.trim() === '') fail('items', 'a non-empty label for every item');
      seen.add(item.value);
    }
    const value: unknown = options.value;
    if (value !== undefined && (!Array.isArray(value) || value.some((v: unknown) => typeof v !== 'string' || !seen.has(v)))) fail('value', 'values of the items');
    if (options.multiple !== true && (options.value?.length ?? 0) > 1) fail('value', 'at most one value in single mode');
    const orientation: unknown = options.orientation;
    if (orientation !== undefined && orientation !== 'horizontal' && orientation !== 'vertical') fail('orientation', '"horizontal" | "vertical"');
  }

  /** Pressed values in item order; single mode keeps at most one, and `required` presses the first enabled item. */
  static #normalize(options: ToggleGroupOptions): string[] {
    const wanted = new Set(options.value ?? []);
    const value = options.items.filter((i) => wanted.has(i.value)).map((i) => i.value);
    const single = options.multiple !== true;
    if (single && value.length > 1) value.length = 1;
    if (single && options.required === true && value.length === 0) {
      const first = options.items.find((i) => i.disabled !== true);
      if (first) value.push(first.value);
    }
    return value;
  }

  #teardown(): void {
    this.#items.dispose();
    this.#items = new DisposableGroup();
    this.#roving?.dispose();
    this.#roving = null;
    for (const { button } of this.#buttons) button.destroy();
    this.#buttons = [];
  }

  /** Create the buttons off-document; the previous ones are destroyed only on success. */
  #build(options: ToggleGroupOptions = this.#options): HTMLButtonElement[] {
    const { size } = toggleGroupConfig.resolve(options.size === undefined ? {} : { size: options.size });
    const created: { item: ToggleGroupItem; button: Button }[] = [];
    try {
      for (const item of options.items) {
        const el = this.#doc.createElement('button');
        el.type = 'button';
        el.className = 'aui-toggle-group__item';
        if (item.iconOnly !== true || item.icon == null) el.textContent = item.label;
        const button = Button.enhance(el, {
          pressed: false,
          size,
          icon: item.icon ?? null,
          ...(item.iconOnly === true && item.icon != null ? { label: item.label } : {}),
        });
        created.push({ item, button });
      }
    } catch (error) {
      for (const { button } of created) button.destroy();
      throw error;
    }
    this.#teardown();
    this.#buttons = created;
    this.#builtItems = options.items;
    for (const [index, { item, button }] of created.entries()) {
      const el = button.element;
      // The group owns the state: the button's own change event stays inside the group.
      const onChange = (event: Event): void => {
        event.stopPropagation();
        this.#toggled(item, (event as CustomEvent<ButtonChangeDetail>).detail.pressed);
      };
      el.addEventListener('aui-change', onChange);
      this.#items.add(() => {
        el.removeEventListener('aui-change', onChange);
      });
      this.#items.listen(el, 'click', () => {
        this.#roving?.setActive(index);
      });
    }
    this.#roving = createRovingTabindex(this.host, {
      getItems: () => this.#buttons.map((b) => b.button.element),
      orientation: (options.orientation ?? 'horizontal') === 'vertical' ? 'vertical' : 'horizontal',
      loop: true,
      direction: getCommonConfig().direction,
    });
    return created.map((b) => b.button.element);
  }

  #toggled(item: ToggleGroupItem, pressed: boolean): void {
    const o = this.#options;
    const single = o.multiple !== true;
    let next: string[];
    if (pressed) next = single ? [item.value] : o.items.filter((i) => i.value === item.value || this.#value.includes(i.value)).map((i) => i.value);
    else if (single && o.required === true) next = [item.value];
    else next = this.#value.filter((v) => v !== item.value);
    const changed = next.length !== this.#value.length || next.some((v, i) => v !== this.#value[i]);
    this.#value = next;
    this.#sync();
    if (changed) emit(this.host, 'aui-change', { value: [...next], changed: item.value } satisfies ToggleGroupChangeDetail);
  }

  #sync(): void {
    const o = this.#options;
    const { size } = toggleGroupConfig.resolve(o.size === undefined ? {} : { size: o.size });
    const host = this.host;
    host.setAttribute('aria-label', o.label);
    const vertical = o.orientation === 'vertical';
    host.classList.toggle('aui-toggle-group--vertical', vertical);
    if (vertical) host.setAttribute('aria-orientation', 'vertical');
    else host.removeAttribute('aria-orientation');
    host.classList.toggle('aui-toggle-group--attached', o.attached === true);
    if (o.disabled === true) host.setAttribute('aria-disabled', 'true');
    else host.removeAttribute('aria-disabled');
    for (const { item, button } of this.#buttons) {
      button.update({ pressed: this.#value.includes(item.value), size, disabled: o.disabled === true || item.disabled === true });
    }
  }
}
