/**
 * Tree Select (R20 P4). A form control: a combobox-style field whose popup is a Tree View
 * (`aria-haspopup="tree"`). Typing filters the tree (the paths to matches stay visible);
 * Down Arrow moves focus into the tree, where the APG tree keys apply; Escape returns to the
 * field. Single selection closes the popup on choice; multiple selection uses tri-state
 * checkboxes and shows the values as tags before the input (like Multi Select). Lazy children,
 * a clear button, validation, and hidden inputs for native form submission. The popup renders
 * in the top layer (Popover API) and is positioned by the shared positioning engine.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators, type Density, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, autoPosition, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { FieldState, markTouched, observePointer, registerControl, renderError, renderLabel, type FormControl } from '../internal/field.js';
import { resolveValidity, VALID, type FieldValidity } from '../internal/validation.js';
import { TreeView, type TreeNode, type TreeViewChangeDetail, type TreeViewLoadContext, type TreeViewSelectDetail } from '../tree-view/tree-view.js';

export type TreeSelectMode = 'single' | 'multiple';

export interface TreeSelectConfig {
  /** Open the popup when the field receives focus. Default false. */
  openOnFocus: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    treeSelect: TreeSelectConfig & { locale: string; direction: 'ltr' | 'rtl' };
  }
}

export const treeSelectConfig = defineComponentConfig<TreeSelectConfig, 'locale' | 'direction'>(
  'treeSelect',
  { openOnFocus: { default: false, expected: 'boolean', validate: validators.isBoolean } },
  ['locale', 'direction'],
);

registerMessages('treeSelect', 'en', {
  showOptions: 'Show options',
  clear: 'Clear selection',
  remove: 'Remove {label}',
  selectedList: 'Selected',
  added: '{label} selected',
  removed: '{label} removed',
  cleared: 'Selection cleared',
  treeLabel: '{label} options',
});

export interface TreeSelectIcons {
  expand: IconRef;
  clear: IconRef;
  remove: IconRef;
  error: IconRef;
}

export interface TreeSelectOptions extends Partial<TreeSelectConfig> {
  /** Visible label (required accessible name). */
  label: string;
  nodes: readonly TreeNode[];
  /** `single` (default) or `multiple` (checkboxes and tags). */
  mode?: TreeSelectMode;
  /** Selected node ids (at most one in single mode). */
  value?: readonly string[];
  /** Form field name; one hidden input per selected id carries it. */
  name?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  invalid?: boolean;
  /** Shown and announced when `invalid` is true (text only). */
  errorMessage?: string;
  /** Show a button that clears the selection. Default true. */
  clearable?: boolean;
  /** Single mode: parents can be chosen (otherwise choosing a parent opens it). Default true. */
  selectableParents?: boolean;
  /** Multiple mode: checking a parent checks its descendants (tri-state parents). Default true. */
  cascade?: boolean;
  /** Ids expanded when the popup first opens (the selected nodes' ancestors are expanded too). */
  expanded?: readonly string[];
  /** Load the children of a node with `hasChildren` (see Tree View). */
  loadChildren?: ((node: TreeNode, context: TreeViewLoadContext) => Promise<readonly TreeNode[]>) | null;
  /** Labels of selected ids whose nodes are not loaded yet (lazy trees). */
  valueLabels?: Readonly<Record<string, string>>;
  /** Block size of the tree in the popup (CSS length). Default `'16rem'`. */
  popupHeight?: string;
  locale?: string;
  direction?: 'ltr' | 'rtl';
  density?: Density;
  icons?: Partial<TreeSelectIcons>;
}

export interface TreeSelectChangeDetail {
  value: string[];
  added: string[];
  removed: string[];
}

const MODES: readonly TreeSelectMode[] = ['single', 'multiple'];

function listenCustom(group: DisposableGroup, target: EventTarget, type: `aui-${string}`, handler: (event: Event) => void): void {
  target.addEventListener(type, handler);
  group.add(() => {
    target.removeEventListener(type, handler);
  });
}
const sameList = (a: readonly string[], b: readonly string[]): boolean => a.length === b.length && a.every((v, i) => v === b[i]);

export class TreeSelect implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: TreeSelectOptions;
  #value: string[];
  #initialValue: string[];
  #query = '';
  #popover: PopoverHandle | null = null;
  #stopPosition: Disposer | null = null;
  #tree: TreeView | null = null;
  readonly #doc: Document;
  readonly #label: HTMLLabelElement;
  readonly #control: HTMLDivElement;
  readonly #tags: HTMLUListElement;
  readonly #clear: HTMLButtonElement;
  readonly #toggle: HTMLButtonElement;
  readonly #popup: HTMLDivElement;
  readonly #treeHost: HTMLDivElement;
  readonly #hidden: HTMLSpanElement;
  readonly #descriptionEl: HTMLDivElement;
  readonly #errorEl: HTMLDivElement;
  readonly #labels = new Map<string, string>();
  readonly #group = new DisposableGroup();
  readonly #state = new FieldState();
  #validity: FieldValidity = VALID;

  /** Render a tree select into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: TreeSelectOptions): TreeSelect {
    return new TreeSelect(host, options);
  }

  private constructor(host: HTMLElement, options: TreeSelectOptions) {
    TreeSelect.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = this.#clean(options.value ?? []);
    this.#initialValue = [...this.#value];
    const doc = this.#doc;
    const inputId = createId('aui-tree-select-input');
    const popupId = createId('aui-tree-select-popup');

    this.#label = doc.createElement('label');
    this.#label.className = 'aui-tree-select__label';
    this.#label.htmlFor = inputId;
    this.#control = doc.createElement('div');
    this.#control.className = 'aui-tree-select__control';
    this.#tags = doc.createElement('ul');
    this.#tags.className = 'aui-tree-select__tags';
    this.input = doc.createElement('input');
    this.input.id = inputId;
    this.input.type = 'text';
    this.input.className = 'aui-tree-select__input';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-haspopup', 'tree');
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.setAttribute('aria-expanded', 'false');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.#clear = doc.createElement('button');
    this.#clear.type = 'button';
    this.#clear.className = 'aui-tree-select__clear';
    this.#toggle = doc.createElement('button');
    this.#toggle.type = 'button';
    this.#toggle.className = 'aui-tree-select__toggle';
    this.#toggle.tabIndex = -1;
    this.#toggle.setAttribute('aria-expanded', 'false');
    this.#control.append(this.#tags, this.input, this.#clear, this.#toggle);

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-tree-select__popup';
    this.#popup.id = popupId;
    this.#popup.popover = 'manual';
    this.#treeHost = doc.createElement('div');
    this.#treeHost.className = 'aui-tree-select__tree';
    this.#popup.append(this.#treeHost);

    this.#hidden = doc.createElement('span');
    this.#hidden.className = 'aui-tree-select__values';
    this.#hidden.hidden = true;
    this.#descriptionEl = doc.createElement('div');
    this.#descriptionEl.className = 'aui-tree-select__description';
    this.#descriptionEl.id = createId('aui-tree-select-desc');
    this.#errorEl = doc.createElement('div');
    this.#errorEl.className = 'aui-tree-select__error';
    this.#errorEl.id = createId('aui-tree-select-error');

    host.classList.add('aui-tree-select');
    host.replaceChildren(this.#label, this.#control, this.#descriptionEl, this.#errorEl, this.#hidden, this.#popup);
    // Render first: invalid options throw before listeners and subscriptions are attached.
    this.#tree = TreeView.create(this.#treeHost, this.#treeOptions());
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(treeSelectConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Selected node ids (a copy). */
  get value(): string[] {
    return [...this.#value];
  }

  get isOpen(): boolean {
    return this.#popover !== null;
  }

  /** The Tree View inside the popup (for expanding or focusing nodes programmatically). */
  get tree(): TreeView | null {
    return this.#tree;
  }

  get name(): string | null {
    return this.#options.name ?? null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.#options.disabled ?? false;
  }

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return !sameList(this.#value, this.#initialValue);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  getFormValue(): string[] | string | null {
    if (this.#mode() === 'multiple') return [...this.#value];
    return this.#value[0] ?? null;
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#renderValidity();
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#renderValidity();
  }

  focus(): void {
    this.input.focus();
  }

  reset(): void {
    this.close();
    this.#state.reset();
    this.#value = [...this.#initialValue];
    this.#query = '';
    this.#syncTree();
    this.#render();
  }

  /** Set the value programmatically (no `aui-change`). */
  setValue(value: readonly string[]): void {
    this.#value = this.#clean(value);
    this.#syncTree();
    this.#render();
  }

  update(options: Partial<TreeSelectOptions>): void {
    const next = { ...this.#options, ...options };
    TreeSelect.#assert(next);
    this.#options = next;
    if ('value' in options) this.#value = this.#clean(options.value ?? []);
    else if (this.#mode() === 'single' && this.#value.length > 1) this.#value = this.#value.slice(0, 1);
    this.#tree?.update(this.#treeOptions(options.nodes !== undefined || options.mode !== undefined || options.cascade !== undefined || options.loadChildren !== undefined));
    this.#render();
  }

  open(): void {
    if (this.#popover || this.#options.disabled || this.#options.readOnly) return;
    const direction = this.#config().direction;
    this.#popover = openPopover(this.#popup, {
      inside: [this.#control],
      onDismiss: () => {
        this.close();
      },
    });
    this.#stopPosition = autoPosition(this.#control, this.#popup, { placement: 'bottom-start', matchAnchorWidth: true, direction });
    this.input.setAttribute('aria-expanded', 'true');
    this.#toggle.setAttribute('aria-expanded', 'true');
    // Show the selected node: expand its ancestors and scroll it into view.
    const first = this.#value[0];
    if (first !== undefined && this.#tree?.getNode(first)) this.#tree.scrollToNode(first, 'center');
    emit(this.host, 'aui-open', null, { bubbles: false });
  }

  close(): void {
    if (!this.#popover) return;
    this.#stopPosition?.();
    this.#stopPosition = null;
    this.#popover.close();
    this.#popover = null;
    this.input.setAttribute('aria-expanded', 'false');
    this.#toggle.setAttribute('aria-expanded', 'false');
    if (this.#query !== '') {
      this.#query = '';
      this.#tree?.update({ filter: '' });
    }
    this.#renderInputText();
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    this.#tree?.destroy();
    this.#tree = null;
    this.host.replaceChildren();
    this.host.classList.remove('aui-tree-select', 'aui-tree-select--disabled', 'aui-tree-select--invalid', 'aui-tree-select--multiple');
  }

  static #assert(o: TreeSelectOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TREE_SELECT_OPTIONS', 'Invalid tree select options.', { component: 'tree-select', property: `treeSelect.${property}`, expected });
    };
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (!Array.isArray(o.nodes)) fail('nodes', 'array of { id, label, children? }');
    if (o.mode !== undefined && !MODES.includes(o.mode)) fail('mode', '"single" | "multiple"');
    const value: unknown = o.value;
    if (value !== undefined && (!Array.isArray(value) || !value.every((v) => typeof v === 'string'))) fail('value', 'array of node ids (strings)');
    if ((o.mode ?? 'single') === 'single' && (o.value?.length ?? 0) > 1) fail('value', 'at most one id in single mode');
    const labels: unknown = o.valueLabels;
    if (labels !== undefined && (typeof labels !== 'object' || labels === null || !Object.values(labels).every((v) => typeof v === 'string'))) fail('valueLabels', 'record of id to label');
    for (const name of ['clearable', 'selectableParents', 'cascade', 'required', 'disabled', 'readOnly', 'invalid'] as const) {
      const v: unknown = o[name];
      if (v !== undefined && typeof v !== 'boolean') fail(name, 'boolean');
    }
  }

  #config(): Readonly<TreeSelectConfig & { locale: string; direction: 'ltr' | 'rtl' }> {
    const o = this.#options;
    return treeSelectConfig.resolve({
      ...(o.openOnFocus === undefined ? {} : { openOnFocus: o.openOnFocus }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('treeSelect', id, params, this.#config().locale);
  }

  #mode(): TreeSelectMode {
    return this.#options.mode ?? 'single';
  }

  #clean(values: readonly string[]): string[] {
    const out: string[] = [];
    for (const v of values) if (!out.includes(v)) out.push(v);
    return this.#mode() === 'single' ? out.slice(0, 1) : out;
  }

  /** Tree View options; `structure` also passes nodes, mode-dependent settings, and the value. */
  #treeOptions(structure = true): Parameters<TreeView['update']>[0] & { label: string; nodes: readonly TreeNode[] } {
    const o = this.#options;
    const multiple = this.#mode() === 'multiple';
    const base = {
      label: this.#m('treeLabel', { label: o.label }),
      nodes: o.nodes,
      height: o.popupHeight ?? '16rem',
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.direction === undefined ? {} : { direction: o.direction }),
      ...(o.density === undefined ? {} : { density: o.density }),
      filter: this.#query,
    };
    if (!structure) return base;
    return {
      ...base,
      selection: multiple ? 'none' : 'single',
      checkboxes: multiple,
      cascade: o.cascade !== false,
      loadChildren: o.loadChildren ?? null,
      selected: multiple ? [] : this.#value,
      checked: multiple ? this.#value : [],
      expanded: [...(o.expanded ?? []), ...this.#ancestorsOf(this.#value, o.nodes)],
    };
  }

  /** Ids of the ancestors of `ids` in `nodes` (to expand the paths to the selection). */
  #ancestorsOf(ids: readonly string[], nodes: readonly TreeNode[]): string[] {
    const want = new Set(ids);
    const out = new Set<string>();
    const walk = (list: readonly TreeNode[], path: string[]): void => {
      for (const n of list) {
        if (want.has(n.id)) for (const p of path) out.add(p);
        if (n.children) walk(n.children, [...path, n.id]);
      }
    };
    walk(nodes, []);
    return [...out];
  }

  #syncTree(): void {
    const multiple = this.#mode() === 'multiple';
    this.#tree?.update(multiple ? { checked: this.#value } : { selected: this.#value });
    // Cascade may add parents (or descendants) of what was set; the tree is the source of truth.
    if (multiple && this.#tree) this.#value = this.#tree.checked;
  }

  #labelOf(id: string): string {
    const label = this.#tree?.getNode(id)?.label ?? this.#labels.get(id) ?? this.#options.valueLabels?.[id];
    if (label !== undefined) this.#labels.set(id, label);
    return label ?? id;
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'input', () => {
      this.#query = this.input.value;
      this.#tree?.update({ filter: this.#query });
      if (!this.#popover) this.open();
      emit(this.host, 'aui-input', { query: this.#query });
    });
    g.listen(this.input, 'keydown', (event) => {
      this.#onInputKey(event);
    });
    g.listen(this.input, 'focus', () => {
      if (this.#config().openOnFocus) this.open();
    });
    g.listen(this.input, 'click', () => {
      if (this.#config().openOnFocus) this.open();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      this.close();
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#renderValidity();
      });
    });
    g.listen(this.#toggle, 'click', () => {
      if (this.#popover) this.close();
      else this.open();
      this.input.focus();
    });
    g.listen(this.#clear, 'click', () => {
      if (this.#value.length === 0) return;
      this.#commit([]);
      announce(this.#m('cleared'), 'polite', this.#doc);
      this.input.focus();
    });
    g.listen(this.#tags, 'click', (event) => {
      const button = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('button[data-value]') : null;
      const value = button?.dataset.value;
      if (value === undefined || this.#options.disabled || this.#options.readOnly) return;
      this.#removeValue(value);
      this.input.focus();
    });
    // Keys inside the popup tree: Escape and Tab return to the field.
    g.listen(this.#popup, 'keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        event.stopPropagation();
        this.close();
        this.input.focus();
      } else if (event.key === 'Tab') {
        this.close();
        this.input.focus();
      }
    });
    listenCustom(g, this.#treeHost, 'aui-select', (event) => {
      event.stopPropagation();
      const { selected, id } = (event as CustomEvent<TreeViewSelectDetail>).detail;
      if (this.#mode() !== 'single') return;
      const node = this.#tree?.getNode(id);
      if (node && this.#options.selectableParents === false && (node.hasChildren === true || (node.children?.length ?? 0) > 0)) {
        // Parents only open; restore the tree selection to the value.
        this.#tree?.update({ selected: this.#value });
        void this.#tree?.expand(id);
        return;
      }
      if (node) this.#labels.set(id, node.label);
      this.#commit(selected.slice(0, 1));
      this.close();
      this.input.focus();
    });
    listenCustom(g, this.#treeHost, 'aui-change', (event) => {
      event.stopPropagation();
      if (this.#mode() !== 'multiple') return;
      const { checked, id } = (event as CustomEvent<TreeViewChangeDetail>).detail;
      const label = this.#labelOf(id);
      const added = !this.#value.includes(id) && checked.includes(id);
      this.#commit(checked);
      announce(this.#m(added ? 'added' : 'removed', { label }), 'polite', this.#doc);
    });
    // Tree events stay inside this control (its own aui-change has a different detail).
    for (const type of ['aui-expand', 'aui-activate', 'aui-range-change', 'aui-load-error'] as const) {
      listenCustom(g, this.#treeHost, type, (event) => {
        event.stopPropagation();
      });
    }
  }

  #onInputKey(event: KeyboardEvent): void {
    if (this.#options.disabled) return;
    const open = this.#popover !== null;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp': {
        if (this.#options.readOnly) return;
        event.preventDefault();
        if (!open) this.open();
        if (event.altKey) return;
        this.#focusTree(event.key === 'ArrowUp');
        return;
      }
      case 'Enter':
        if (!open) return;
        event.preventDefault();
        this.#focusTree(false);
        return;
      case 'Escape':
        if (open) {
          event.preventDefault();
          event.stopPropagation();
          this.close();
        } else if (this.#query !== '') {
          event.preventDefault();
          this.#query = '';
          this.#renderInputText();
        }
        return;
      case 'Backspace':
        if (this.#mode() === 'multiple' && this.input.value === '' && this.#value.length > 0 && !this.#options.readOnly) {
          event.preventDefault();
          const last = this.#value[this.#value.length - 1];
          if (last !== undefined) this.#removeValue(last);
        }
        return;
      default:
        return;
    }
  }

  /** Move focus into the tree: the selected node, the first match, or the first node. */
  #focusTree(last: boolean): void {
    const tree = this.#tree;
    if (!tree || tree.visibleCount === 0) return;
    const match = this.#query === '' ? undefined : tree.matches[0];
    if (match !== undefined) {
      tree.focusNode(match);
      return;
    }
    const target = this.#query === '' ? this.#value[0] : undefined;
    if (target !== undefined && tree.getNode(target)) {
      tree.focusNode(target);
      return;
    }
    const id = tree.activeId;
    if (id !== null && !last) {
      tree.focusNode(id);
      return;
    }
    const nodes = tree.nodes;
    const first = nodes[0];
    if (first) tree.focusNode(first.id);
    if (last) tree.getItemElement(first?.id ?? '')?.dispatchEvent(new KeyboardEvent('keydown', { key: 'End', bubbles: true }));
  }

  #removeValue(id: string): void {
    const label = this.#labelOf(id);
    if (this.#mode() === 'multiple' && this.#tree) {
      // Unchecking through the tree keeps cascade consistent (descendants and mixed parents).
      const checked = new Set(this.#tree.checked);
      checked.delete(id);
      this.#tree.update({ checked: [...checked].filter((c) => c !== id) });
      const node = this.#tree.getNode(id);
      const drop = new Set<string>([id]);
      const walk = (n: TreeNode | null | undefined): void => {
        for (const c of n?.children ?? []) {
          drop.add(c.id);
          walk(c);
        }
      };
      walk(node);
      const next = [...checked].filter((c) => !drop.has(c));
      this.#tree.update({ checked: next });
      this.#commit(this.#tree.checked);
    } else {
      this.#commit(this.#value.filter((v) => v !== id));
    }
    announce(this.#m('removed', { label }), 'polite', this.#doc);
  }

  #commit(next: string[]): void {
    const value = this.#clean(next);
    if (sameList(value, this.#value)) return;
    const added = value.filter((v) => !this.#value.includes(v));
    const removed = this.#value.filter((v) => !value.includes(v));
    for (const id of value) this.#labelOf(id);
    this.#value = value;
    this.#state.customError = null;
    if (this.#mode() === 'single') this.#tree?.update({ selected: value });
    else if (this.#tree && !sameList(this.#tree.checked, value)) this.#tree.update({ checked: value });
    this.#renderValue();
    this.#renderValidity();
    emit(this.host, 'aui-change', { value: [...value], added, removed } satisfies TreeSelectChangeDetail);
  }

  #render(): void {
    const o = this.#options;
    renderLabel(this.#label, o.label, o.required ?? false);
    this.input.disabled = o.disabled ?? false;
    this.input.readOnly = o.readOnly ?? false;
    if (o.required) this.input.setAttribute('aria-required', 'true');
    else this.input.removeAttribute('aria-required');
    const treeId = this.#treeHost.querySelector('[role="tree"]')?.id;
    if (treeId) {
      this.input.setAttribute('aria-controls', treeId);
      this.#toggle.setAttribute('aria-controls', treeId);
    }
    const locked = (o.disabled ?? false) || (o.readOnly ?? false);
    this.#toggle.disabled = locked;
    this.#toggle.setAttribute('aria-label', this.#m('showOptions'));
    this.#toggle.replaceChildren(renderIcon(o.icons?.expand ?? 'chevron-down', { doc: this.#doc }));
    this.#clear.setAttribute('aria-label', this.#m('clear'));
    this.#clear.replaceChildren(renderIcon(o.icons?.clear ?? 'close', { doc: this.#doc }));
    this.#descriptionEl.textContent = o.description ?? '';
    this.#descriptionEl.hidden = !o.description;
    this.host.classList.toggle('aui-tree-select--disabled', o.disabled ?? false);
    this.host.classList.toggle('aui-tree-select--multiple', this.#mode() === 'multiple');
    this.#renderValue();
    this.#renderValidity();
  }

  #renderInputText(): void {
    const o = this.#options;
    if (this.#mode() === 'single') {
      const id = this.#value[0];
      this.input.value = this.#query !== '' ? this.#query : id === undefined ? '' : this.#labelOf(id);
      this.input.placeholder = o.placeholder ?? '';
    } else {
      this.input.value = this.#query;
      this.input.placeholder = this.#value.length === 0 ? (o.placeholder ?? '') : '';
    }
  }

  /** Tags (multiple), input text (single), the clear button, and hidden inputs. */
  #renderValue(): void {
    const o = this.#options;
    const doc = this.#doc;
    const editable = !(o.disabled ?? false) && !(o.readOnly ?? false);
    const multiple = this.#mode() === 'multiple';
    if (multiple) {
      this.#tags.setAttribute('aria-label', `${this.#m('selectedList')}: ${o.label}`);
      this.#tags.replaceChildren(
        ...this.#displayed().map((id) => {
          const label = this.#labelOf(id);
          const li = doc.createElement('li');
          li.className = 'aui-tree-select__tag';
          const text = doc.createElement('span');
          text.className = 'aui-tree-select__tag-label';
          text.textContent = label;
          li.append(text);
          if (editable) {
            const remove = doc.createElement('button');
            remove.type = 'button';
            remove.className = 'aui-tree-select__remove';
            remove.dataset.value = id;
            remove.setAttribute('aria-label', this.#m('remove', { label }));
            remove.append(renderIcon(o.icons?.remove ?? 'close', { doc }));
            li.append(remove);
          }
          return li;
        }),
      );
    } else this.#tags.replaceChildren();
    this.#tags.hidden = !multiple || this.#value.length === 0;
    this.#clear.hidden = !(o.clearable ?? true) || !editable || this.#value.length === 0;
    this.#renderInputText();
    this.#hidden.replaceChildren(
      ...(o.name
        ? this.#value.map((v) => {
            const input = doc.createElement('input');
            input.type = 'hidden';
            input.name = o.name ?? '';
            input.value = v;
            return input;
          })
        : []),
    );
  }

  /** Tags shown: a fully checked parent stands for its checked descendants (cascade). */
  #displayed(): string[] {
    if (this.#options.cascade === false || !this.#tree) return [...this.#value];
    const set = new Set(this.#value);
    return this.#value.filter((id) => {
      let parent = this.#tree?.getParentId(id) ?? null;
      while (parent !== null) {
        if (set.has(parent)) return false;
        parent = this.#tree?.getParentId(parent) ?? null;
      }
      return true;
    });
  }

  #renderValidity(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    const consumerInvalid = o.invalid ?? false;
    const missing = (o.required ?? false) && this.#value.length === 0;
    this.#validity = consumerInvalid
      ? Object.freeze({ valid: false, error: 'custom', message: o.errorMessage ?? '' })
      : resolveValidity({ error: missing ? 'value-missing' : null, params: {} }, { locale, kind: 'choice' }, null, this.#state.customError);
    const show = consumerInvalid || (!this.#validity.valid && this.#state.shouldShow('blur'));
    const message = show ? this.#validity.message : '';
    renderError(this.#errorEl, message, o.icons?.error ?? 'alert-circle');
    this.#errorEl.hidden = message === '';
    const describedBy: string[] = [];
    if (o.description) describedBy.push(this.#descriptionEl.id);
    if (message) describedBy.push(this.#errorEl.id);
    if (describedBy.length) this.input.setAttribute('aria-describedby', describedBy.join(' '));
    else this.input.removeAttribute('aria-describedby');
    if (show) this.input.setAttribute('aria-invalid', 'true');
    else this.input.removeAttribute('aria-invalid');
    this.host.classList.toggle('aui-tree-select--invalid', show);
  }
}
