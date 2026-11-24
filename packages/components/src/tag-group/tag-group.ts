/**
 * Tag Group (R13-3). Interactive tags, such as applied filters, recipients, or
 * labels on a record: removable, selectable, or both. The tags form a one-row-per-tag
 * grid (the React Aria TagGroup pattern): one tag is in the tab sequence and the
 * arrow keys move between tags; Space selects; Delete or Backspace removes. Static
 * labels are Badge.
 */
import { configurationError, defineComponentConfig, emit, getCommonConfig, getMessage, registerMessages, validators, DisposableGroup } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, createRovingTabindex, type RovingTabindex } from '@absoluteui/utilities';

export type TagGroupSelection = 'none' | 'single' | 'multiple';
export type TagGroupSize = 'sm' | 'md';

export interface TagGroupConfig {
  size: TagGroupSize;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    tagGroup: TagGroupConfig & { locale: string };
  }
}

export const tagGroupConfig = defineComponentConfig<TagGroupConfig, 'locale'>(
  'tagGroup',
  { size: { default: 'md', expected: '"sm" | "md"', validate: validators.oneOf(['sm', 'md'] as const) } },
  ['locale'],
);

registerMessages('tagGroup', 'en', {
  remove: 'Remove {label}',
  removed: '{label} removed',
});

export interface TagGroupItem {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface TagGroupIcons {
  remove: IconRef;
}

export interface TagGroupOptions extends Partial<TagGroupConfig> {
  /** Accessible name of the group, such as "Applied filters". */
  label: string;
  items: readonly TagGroupItem[];
  /** Show a remove button and allow Delete/Backspace. */
  removable?: boolean;
  /** Selection mode. Default `none`. */
  selection?: TagGroupSelection;
  /** Selected values (selection `single` or `multiple`). */
  value?: readonly string[];
  locale?: string;
  icons?: Partial<TagGroupIcons>;
}

/** `aui-change` detail: the selected values after the user's change. */
export interface TagGroupChangeDetail {
  value: string[];
}

/** `aui-remove` detail. Cancelable: prevent it to keep the tag (for example to confirm first). */
export interface TagGroupRemoveDetail {
  value: string;
  item: TagGroupItem;
}

const MAX_ITEMS = 1000;
const SELECTIONS: readonly TagGroupSelection[] = ['none', 'single', 'multiple'];

interface Row {
  readonly item: TagGroupItem;
  readonly row: HTMLDivElement;
}

export class TagGroup {
  readonly host: HTMLElement;
  #options: TagGroupOptions;
  #items: TagGroupItem[];
  #value: string[];
  readonly #doc: Document;
  #rows: Row[] = [];
  #roving: RovingTabindex | null = null;
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: TagGroupOptions): TagGroup {
    return new TagGroup(host, options);
  }

  private constructor(host: HTMLElement, options: TagGroupOptions) {
    TagGroup.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#items = [...options.items];
    this.#value = this.#normalize(options.value ?? []);
    // Render first: invalid options (including config and icons) throw before the host is touched.
    const rows = this.#build();
    host.classList.add('aui-tag-group');
    this.#apply(rows, null);
    this.#group.listen(host, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    this.#group.listen(host, 'click', (event) => {
      this.#onClick(event);
    });
    this.#group.add(tagGroupConfig.subscribe(() => {
      this.#apply(this.#build(), this.#focusedValue());
    }));
  }

  get options(): Readonly<TagGroupOptions> {
    return this.#options;
  }

  /** The tags shown (after removals). */
  get items(): readonly TagGroupItem[] {
    return this.#items;
  }

  /** Selected values, in tag order. */
  get value(): readonly string[] {
    return this.#value;
  }

  /** Set the selected values (no event). */
  setValue(value: readonly string[]): void {
    this.update({ value });
  }

  update(options: Partial<TagGroupOptions>): void {
    const next = { ...this.#options, ...options };
    TagGroup.#assert(next);
    const focused = this.#focusedValue();
    const previous = { options: this.#options, items: this.#items, value: this.#value };
    this.#options = next;
    if (options.items !== undefined) this.#items = [...options.items];
    this.#value = this.#normalize(options.value ?? this.#value);
    let rows: Row[];
    try {
      rows = this.#build();
    } catch (error) {
      this.#options = previous.options;
      this.#items = previous.items;
      this.#value = previous.value;
      throw error;
    }
    this.#apply(rows, focused);
  }

  /** Focus the tag in the tab sequence. */
  focus(): void {
    this.#rows[this.#roving?.activeIndex ?? 0]?.row.focus();
  }

  destroy(): void {
    this.#group.dispose();
    this.#roving?.dispose();
    this.#roving = null;
    this.#rows = [];
    this.host.replaceChildren();
    for (const name of ['role', 'aria-label', 'aria-multiselectable']) this.host.removeAttribute(name);
    this.host.classList.remove('aui-tag-group', 'aui-tag-group--sm', 'aui-tag-group--md');
  }

  static #assert(options: TagGroupOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TAG_GROUP_OPTIONS', 'Invalid tag group options.', { component: 'tagGroup', property: `tagGroup.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string');
    const items: unknown = options.items;
    if (!Array.isArray(items) || items.length > MAX_ITEMS) fail('items', `array of { value, label } (at most ${String(MAX_ITEMS)})`);
    const seen = new Set<string>();
    for (const item of options.items) {
      if (typeof item.value !== 'string' || item.value === '' || seen.has(item.value)) fail('items', 'unique, non-empty string values');
      if (typeof item.label !== 'string' || item.label.trim() === '') fail('items', 'a non-empty label for every item');
      seen.add(item.value);
    }
    const selection: unknown = options.selection;
    if (selection !== undefined && !SELECTIONS.includes(selection as TagGroupSelection)) fail('selection', '"none" | "single" | "multiple"');
    const value: unknown = options.value;
    if (value !== undefined && (!Array.isArray(value) || value.some((v: unknown) => typeof v !== 'string'))) fail('value', 'array of strings');
    if (options.selection === 'single' && (options.value?.length ?? 0) > 1) fail('value', 'at most one value with selection "single"');
  }

  /** Selected values that exist, in tag order; none without selection. */
  #normalize(value: readonly string[]): string[] {
    const selection = this.#options.selection ?? 'none';
    if (selection === 'none') return [];
    const wanted = new Set(value);
    const out = this.#items.filter((i) => wanted.has(i.value)).map((i) => i.value);
    return selection === 'single' ? out.slice(0, 1) : out;
  }

  #focusedValue(): string | null {
    const active = this.#doc.activeElement;
    return this.#rows.find((r) => r.row === active || r.row.contains(active))?.item.value ?? null;
  }

  /** Build the rows off-document. Throws (config, icons, messages) before anything changes. */
  #build(): Row[] {
    const o = this.#options;
    const { locale } = tagGroupConfig.resolve(o.locale === undefined ? {} : { locale: o.locale });
    const removable = o.removable === true;
    const iconRef = o.icons?.remove ?? 'close';
    return this.#items.map((item) => {
      const row = this.#doc.createElement('div');
      row.className = 'aui-tag-group__tag';
      row.setAttribute('role', 'row');
      row.dataset.value = item.value;
      const cell = this.#doc.createElement('div');
      cell.className = 'aui-tag-group__cell';
      cell.setAttribute('role', 'gridcell');
      const text = this.#doc.createElement('span');
      text.className = 'aui-tag-group__label';
      text.textContent = item.label;
      cell.append(text);
      if (removable) {
        const remove = this.#doc.createElement('button');
        remove.type = 'button';
        remove.className = 'aui-tag-group__remove';
        // Reached with Delete/Backspace on the tag; the button is for pointers.
        remove.tabIndex = -1;
        remove.setAttribute('aria-label', getMessage('tagGroup', 'remove', { label: item.label }, locale));
        remove.append(renderIcon(iconRef, { doc: this.#doc }));
        if (item.disabled === true) remove.disabled = true;
        cell.append(remove);
      }
      row.append(cell);
      return { item, row };
    });
  }

  #apply(rows: Row[], focusValue: string | null): void {
    const o = this.#options;
    const { size } = tagGroupConfig.resolve(o.size === undefined ? {} : { size: o.size });
    const host = this.host;
    const selection = o.selection ?? 'none';
    host.classList.toggle('aui-tag-group--sm', size === 'sm');
    host.classList.toggle('aui-tag-group--md', size === 'md');
    // A grid needs rows, and a name needs a role: an empty group is a plain, unnamed container.
    if (rows.length > 0) {
      host.setAttribute('role', 'grid');
      host.setAttribute('aria-label', o.label);
    } else {
      host.removeAttribute('role');
      host.removeAttribute('aria-label');
    }
    if (selection === 'multiple') host.setAttribute('aria-multiselectable', 'true');
    else host.removeAttribute('aria-multiselectable');
    for (const { item, row } of rows) {
      if (selection === 'none') row.removeAttribute('aria-selected');
      else row.setAttribute('aria-selected', String(this.#value.includes(item.value)));
      if (item.disabled === true) row.setAttribute('aria-disabled', 'true');
      row.classList.toggle('aui-tag-group__tag--selected', this.#value.includes(item.value));
    }
    this.#roving?.dispose();
    this.#rows = rows;
    host.replaceChildren(...rows.map((r) => r.row));
    this.#roving = createRovingTabindex(host, {
      getItems: () => this.#rows.map((r) => r.row),
      orientation: 'both',
      loop: false,
      direction: getCommonConfig().direction,
    });
    const index = focusValue === null ? -1 : rows.findIndex((r) => r.item.value === focusValue);
    if (index >= 0) this.#roving.setActive(index, true);
  }

  #rowOf(target: EventTarget | null): Row | undefined {
    return target instanceof Node ? this.#rows.find((r) => r.row.contains(target)) : undefined;
  }

  #onKeyDown(event: KeyboardEvent): void {
    const row = this.#rowOf(event.target);
    if (!row || row.item.disabled === true) return;
    if ((event.key === 'Delete' || event.key === 'Backspace') && this.#options.removable === true) {
      event.preventDefault();
      this.#remove(row);
    } else if ((event.key === ' ' || event.key === 'Enter') && (this.#options.selection ?? 'none') !== 'none') {
      event.preventDefault();
      this.#toggle(row);
    }
  }

  #onClick(event: MouseEvent): void {
    const row = this.#rowOf(event.target);
    if (!row) return;
    this.#roving?.setActive(this.#rows.indexOf(row));
    if (row.item.disabled === true) return;
    if (event.target instanceof Element && event.target.closest('.aui-tag-group__remove')) this.#remove(row);
    else if ((this.#options.selection ?? 'none') !== 'none') this.#toggle(row);
  }

  #toggle(row: Row): void {
    const selection = this.#options.selection ?? 'none';
    const selected = this.#value.includes(row.item.value);
    const next = selection === 'single' ? (selected ? [] : [row.item.value]) : this.#normalize(selected ? this.#value.filter((v) => v !== row.item.value) : [...this.#value, row.item.value]);
    this.#value = next;
    this.#apply(this.#rows, row.item.value);
    emit(this.host, 'aui-change', { value: [...next] } satisfies TagGroupChangeDetail);
  }

  #remove(row: Row): void {
    const index = this.#rows.indexOf(row);
    const allowed = emit(this.host, 'aui-remove', { value: row.item.value, item: row.item } satisfies TagGroupRemoveDetail, { cancelable: true });
    if (!allowed) return;
    const { locale } = tagGroupConfig.resolve(this.#options.locale === undefined ? {} : { locale: this.#options.locale });
    this.#items = this.#items.filter((i) => i.value !== row.item.value);
    const wasSelected = this.#value.includes(row.item.value);
    this.#value = this.#value.filter((v) => v !== row.item.value);
    const rows = this.#rows.filter((r) => r !== row);
    // Focus moves to the tag that took its place, or the previous one.
    const next = rows[Math.min(index, rows.length - 1)];
    this.#apply(rows, next?.item.value ?? null);
    announce(getMessage('tagGroup', 'removed', { label: row.item.label }, locale), 'polite', this.#doc);
    if (wasSelected) emit(this.host, 'aui-change', { value: [...this.#value] } satisfies TagGroupChangeDetail);
  }
}
