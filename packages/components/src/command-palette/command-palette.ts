/**
 * Command Palette (R20 P4). A modal search dialog opened with a keyboard shortcut (Ctrl+K,
 * Cmd+K on Apple platforms; configurable) or `open()`: a search field (a combobox) over a
 * grouped, virtualized listbox driven by `aria-activedescendant`, so focus stays in the field.
 * Fuzzy matching highlights the matched characters (text nodes, never HTML). Sections: recent
 * commands, the command groups, and async providers (debounced, aborted when the query
 * changes or the palette closes) with a loading state. Commands with children open a nested
 * page (Backspace on an empty field goes back). An Empty State explains when nothing matches.
 * Built on the native modal <dialog> with the shared focus-restore, scroll-lock, and overlay
 * stack (the same focus management as Dialog); shortcuts are shown with Kbd.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators, type Density, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { createFocusRestore, lockScroll, matchesHotkey, observeResize, registerOverlayLayer, trackPointerFocus, type FocusRestore } from '@absoluteui/utilities';
import { EmptyState } from '../empty-state/empty-state.js';
import { fuzzyMatch, highlightText, type MatchRange } from '../internal/highlight.js';
import { Windowing } from '../internal/windowing.js';
import { Kbd } from '../kbd/kbd.js';

export interface CommandPaletteConfig {
  /** Shortcut that opens and closes the palette, in `matchesHotkey` syntax; null for none. */
  shortcut: string | null;
  /** Milliseconds between the last keystroke and the provider searches. */
  debounce: number;
  /** Rows rendered beyond each edge of the visible area. */
  overscan: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    commandPalette: CommandPaletteConfig & { locale: string; density: Density };
  }
}

export const commandPaletteConfig = defineComponentConfig<CommandPaletteConfig, 'locale' | 'density'>(
  'commandPalette',
  {
    shortcut: { default: 'Mod+K', expected: 'hotkey string such as "Mod+K", or null', validate: (v: unknown): v is string | null => v === null || (typeof v === 'string' && v.trim() !== '' && v.length <= 40) },
    debounce: { default: 200, expected: 'integer 0 to 2000 (ms)', validate: validators.integerInRange(0, 2000) },
    overscan: { default: 6, expected: 'integer 0 to 100', validate: validators.integerInRange(0, 100) },
  },
  ['locale', 'density'],
);

registerMessages('commandPalette', 'en', {
  label: 'Command palette',
  search: 'Search commands',
  placeholder: 'Type a command or search',
  results: 'Results',
  recent: 'Recent',
  commands: 'Commands',
  noResults: 'No results for "{query}"',
  noResultsHint: 'Try a different word.',
  noResultsHintPage: 'Try a different word, or press Backspace to go back.',
  noCommands: 'No commands',
  loading: 'Loading results',
  providerFailed: 'Some results could not be loaded.',
  count: '{count} results',
  countOne: '1 result',
  navigate: 'to navigate',
  select: 'to select',
  close: 'to close',
  back: 'Back to {label}',
  backRoot: 'Back',
  inside: 'in {path}',
});

export interface Command {
  /** Unique, stable id (reported by `aui-select` and stored in the recent list). */
  readonly id: string;
  /** Text label (rendered as text, never as HTML). */
  readonly label: string;
  /** More words that find this command (not shown). */
  readonly keywords?: readonly string[];
  /** Section the command is listed under. Default "Commands". */
  readonly group?: string;
  /** Secondary text after the label. */
  readonly description?: string;
  /** Keyboard shortcut shown with Kbd, in `matchesHotkey` syntax (display only). */
  readonly shortcut?: string;
  readonly icon?: IconRef;
  /** Choosing the command opens these as a nested page. */
  readonly children?: readonly Command[];
  readonly disabled?: boolean;
  /** Called after the palette closed, unless an `aui-select` listener called preventDefault(). */
  readonly run?: () => void;
}

/** Context of a provider search: aborted when the query changes or the palette closes. */
export interface CommandProviderContext {
  readonly signal: AbortSignal;
}

export interface CommandProvider {
  readonly id: string;
  /** Section header of the provider's results, such as "Employees". */
  readonly label: string;
  /** Results for a query; matching is the provider's job (matches are highlighted when found). */
  readonly search: (query: string, context: CommandProviderContext) => Promise<readonly Command[]>;
  /** Shortest query that is searched. Default 1. */
  readonly minQueryLength?: number;
}

export interface CommandPaletteIcons {
  search: IconRef;
  loading: IconRef;
  back: IconRef;
  submenu: IconRef;
}

export interface CommandPaletteOptions extends Partial<CommandPaletteConfig> {
  commands: readonly Command[];
  /** Accessible name of the dialog. Default "Command palette". */
  label?: string;
  placeholder?: string;
  /** Async searches (top level only), listed after the commands. */
  providers?: readonly CommandProvider[];
  /** Ids shown in the Recent section while the query is empty. */
  recent?: readonly string[];
  /** Most recent commands remembered and shown (0 hides the section). Default 5. */
  recentLimit?: number;
  /** Most results per section. Default 50. */
  maxResults?: number;
  locale?: string;
  density?: Density;
  icons?: Partial<CommandPaletteIcons>;
}

/** `aui-select` detail (cancelable: preventDefault keeps `run` from being called). */
export interface CommandPaletteSelectDetail {
  id: string;
  command: Command;
  /** Ids of the pages (parent commands) the command was chosen in. */
  path: string[];
  query: string;
  /** The provider of the command, or null for `commands`. */
  providerId: string | null;
}

type Entry =
  | { readonly kind: 'header'; readonly label: string }
  | { readonly kind: 'command'; readonly command: Command; readonly ranges: readonly MatchRange[]; readonly path: readonly Command[]; readonly providerId: string | null };

const HEIGHT_BY_DENSITY: Readonly<Record<Density, number>> = { compact: 36, comfortable: 44, spacious: 52 };
const MAX_COMMANDS = 100_000;

export class CommandPalette {
  readonly host: HTMLElement;
  /** The native dialog element. */
  readonly dialog: HTMLDialogElement;
  readonly input: HTMLInputElement;
  #options: CommandPaletteOptions;
  readonly #doc: Document;
  readonly #id = createId('aui-cmdk');
  readonly #crumbs: HTMLDivElement;
  readonly #spinner: HTMLSpanElement;
  readonly #viewport: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #emptyHost: HTMLDivElement;
  readonly #status: HTMLDivElement;
  readonly #error: HTMLDivElement;
  readonly #footer: HTMLDivElement;
  #empty: EmptyState | null = null;
  readonly #win: Windowing;
  readonly #rows = new Map<number, HTMLDivElement>();
  readonly #pool: HTMLDivElement[] = [];
  readonly #group = new DisposableGroup();
  #entries: Entry[] = [];
  #active = -1;
  #pages: Command[] = [];
  #recent: string[];
  #provided = new Map<string, readonly Command[]>();
  #failed = new Set<string>();
  #pending = 0;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #announceTimer: ReturnType<typeof setTimeout> | undefined;
  #abort: AbortController | null = null;
  #restore: FocusRestore | null = null;
  #unlock: Disposer | null = null;
  #unregister: Disposer | null = null;
  #frame = 0;
  #resolved: Readonly<CommandPaletteConfig & { locale: string; density: Density }>;
  #height: number;

  /** Render into `host` (its children are replaced by the closed dialog). */
  static create(host: HTMLElement, options: CommandPaletteOptions): CommandPalette {
    return new CommandPalette(host, options);
  }

  private constructor(host: HTMLElement, options: CommandPaletteOptions) {
    CommandPalette.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    trackPointerFocus(this.#doc);
    this.#options = { ...options };
    this.#resolved = this.#resolve();
    this.#height = HEIGHT_BY_DENSITY[this.#resolved.density];
    this.#recent = [...(options.recent ?? [])];
    this.#win = new Windowing(0, this.#height);
    const doc = this.#doc;
    const listId = `${this.#id}-list`;

    this.dialog = doc.createElement('dialog');
    this.dialog.className = 'aui-command-palette__dialog';
    const search = doc.createElement('div');
    search.className = 'aui-command-palette__search';
    this.#crumbs = doc.createElement('div');
    this.#crumbs.className = 'aui-command-palette__crumbs';
    const searchIcon = doc.createElement('span');
    searchIcon.className = 'aui-command-palette__search-icon';
    searchIcon.setAttribute('aria-hidden', 'true');
    searchIcon.append(renderIcon(options.icons?.search ?? 'search', { doc }));
    this.input = doc.createElement('input');
    this.input.type = 'text';
    this.input.className = 'aui-command-palette__input';
    this.input.setAttribute('role', 'combobox');
    this.input.setAttribute('aria-expanded', 'true');
    this.input.setAttribute('aria-controls', listId);
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.autocomplete = 'off';
    this.input.spellcheck = false;
    this.#spinner = doc.createElement('span');
    this.#spinner.className = 'aui-command-palette__spinner';
    this.#spinner.setAttribute('aria-hidden', 'true');
    this.#spinner.hidden = true;
    this.#spinner.append(renderIcon(options.icons?.loading ?? 'spinner', { doc }));
    search.append(searchIcon, this.#crumbs, this.input, this.#spinner);

    this.#viewport = doc.createElement('div');
    this.#viewport.className = 'aui-command-palette__list';
    this.#viewport.id = listId;
    this.#viewport.setAttribute('role', 'listbox');
    this.#canvas = doc.createElement('div');
    this.#canvas.className = 'aui-command-palette__canvas';
    this.#canvas.setAttribute('role', 'none');
    this.#viewport.append(this.#canvas);
    this.#emptyHost = doc.createElement('div');
    this.#emptyHost.className = 'aui-command-palette__empty';
    this.#emptyHost.hidden = true;
    this.#error = doc.createElement('div');
    this.#error.className = 'aui-command-palette__error';
    this.#error.hidden = true;
    this.#status = doc.createElement('div');
    this.#status.className = 'aui-command-palette__status';
    this.#status.setAttribute('role', 'status');
    this.#footer = doc.createElement('div');
    this.#footer.className = 'aui-command-palette__footer';
    this.#footer.setAttribute('aria-hidden', 'true');
    this.dialog.append(search, this.#viewport, this.#emptyHost, this.#error, this.#footer, this.#status);

    this.#render();
    host.classList.add('aui-command-palette');
    host.replaceChildren(this.dialog);
    this.#bind();
  }

  get options(): Readonly<CommandPaletteOptions> {
    return this.#options;
  }

  get isOpen(): boolean {
    return this.dialog.open;
  }

  /** The current search text. */
  get query(): string {
    return this.input.value;
  }

  /** Recent command ids, most recent first. */
  get recent(): string[] {
    return [...this.#recent];
  }

  /** Ids of the open nested pages (parent commands), outermost first. */
  get path(): string[] {
    return this.#pages.map((c) => c.id);
  }

  /** Open the palette (optionally on a nested page of a command with children, and with a query). */
  open(options: { page?: string; query?: string } = {}): void {
    if (!this.dialog.open) {
      this.#restore = createFocusRestore(this.#doc);
      this.#unlock = lockScroll(this.#doc);
      this.dialog.showModal();
      // Join the shared overlay stack, so Escape reaches only the topmost overlay.
      this.#unregister = registerOverlayLayer(this.dialog, {
        dismissOnOutsidePointer: false,
        onDismiss: (reason) => {
          if (reason === 'escape') this.close();
        },
      });
      emit(this.host, 'aui-open', null, { bubbles: false });
    }
    this.#pages = options.page === undefined ? [] : this.#pathTo(options.page);
    this.input.value = options.query ?? '';
    this.#refresh();
    this.input.focus();
  }

  close(): void {
    if (!this.dialog.open) return;
    this.#cancelSearch();
    clearTimeout(this.#announceTimer);
    this.#unregister?.();
    this.#unregister = null;
    this.dialog.close();
    this.#unlock?.();
    this.#unlock = null;
    this.#restore?.restore();
    this.#restore = null;
    this.#pages = [];
    this.input.value = '';
    emit(this.host, 'aui-close', null, { bubbles: false });
  }

  toggle(): void {
    if (this.dialog.open) this.close();
    else this.open();
  }

  /** Replace the search text (runs the search). */
  setQuery(query: string): void {
    this.input.value = query;
    this.#refresh();
  }

  update(options: Partial<CommandPaletteOptions>): void {
    const next = { ...this.#options, ...options };
    CommandPalette.#assert(next);
    this.#options = next;
    this.#resolved = this.#resolve();
    if (options.recent !== undefined) this.#recent = [...options.recent];
    this.#trimRecent();
    if (options.density !== undefined) this.#relayout();
    this.#render();
    if (this.dialog.open) this.#refresh();
  }

  destroy(): void {
    this.close();
    this.#group.dispose();
    this.#cancelSearch();
    clearTimeout(this.#announceTimer);
    this.#empty?.destroy();
    this.#empty = null;
    this.#rows.clear();
    this.#pool.length = 0;
    this.host.replaceChildren();
    this.host.classList.remove('aui-command-palette');
  }

  static #assert(o: CommandPaletteOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('COMMAND_PALETTE_OPTIONS', 'Invalid command palette options.', { component: 'command-palette', property: `commandPalette.${property}`, expected });
    };
    if (!Array.isArray(o.commands)) fail('commands', 'array of { id, label }');
    const seen = new Set<string>();
    const stack: { list: readonly unknown[]; path: string }[] = [{ list: o.commands, path: 'commands' }];
    while (stack.length > 0) {
      const frame = stack.pop();
      if (!frame) break;
      for (const [i, c] of frame.list.entries()) {
        const path = `${frame.path}[${String(i)}]`;
        if (typeof c !== 'object' || c === null) fail(path, '{ id: string, label: string }');
        const cmd = c as { id?: unknown; label?: unknown; children?: unknown; run?: unknown; keywords?: unknown };
        if (typeof cmd.id !== 'string' || cmd.id === '') fail(`${path}.id`, 'non-empty string');
        if (typeof cmd.label !== 'string' || cmd.label.trim() === '') fail(`${path}.label`, 'non-empty string');
        const id = cmd.id as string;
        if (seen.has(id)) fail(`${path}.id`, `unique id (duplicate "${id}")`);
        seen.add(id);
        if (seen.size > MAX_COMMANDS) fail('commands', `at most ${String(MAX_COMMANDS)} commands`);
        if (cmd.run !== undefined && typeof cmd.run !== 'function') fail(`${path}.run`, 'function');
        if (cmd.keywords !== undefined && (!Array.isArray(cmd.keywords) || !cmd.keywords.every((k) => typeof k === 'string'))) fail(`${path}.keywords`, 'array of strings');
        if (cmd.children !== undefined) {
          if (!Array.isArray(cmd.children)) fail(`${path}.children`, 'array of commands');
          stack.push({ list: cmd.children as unknown[], path: `${path}.children` });
        }
      }
    }
    const providers: unknown = o.providers;
    if (providers !== undefined) {
      if (!Array.isArray(providers)) fail('providers', 'array of { id, label, search }');
      for (const [i, p] of (providers as unknown[]).entries()) {
        const pr = p as { id?: unknown; label?: unknown; search?: unknown };
        if (typeof p !== 'object' || p === null || typeof pr.id !== 'string' || typeof pr.label !== 'string' || typeof pr.search !== 'function') fail(`providers[${String(i)}]`, '{ id: string, label: string, search: (query, { signal }) => Promise<commands> }');
      }
    }
    const recent: unknown = o.recent;
    if (recent !== undefined && (!Array.isArray(recent) || !recent.every((r) => typeof r === 'string'))) fail('recent', 'array of command ids');
    for (const name of ['recentLimit', 'maxResults'] as const) {
      const v: unknown = o[name];
      if (v !== undefined && (typeof v !== 'number' || !Number.isInteger(v) || v < 0 || v > 1000)) fail(name, 'integer 0 to 1000');
    }
    const label: unknown = o.label;
    if (label !== undefined && (typeof label !== 'string' || label.trim() === '')) fail('label', 'non-empty string');
  }

  #resolve(): Readonly<CommandPaletteConfig & { locale: string; density: Density }> {
    const o = this.#options;
    return commandPaletteConfig.resolve({
      ...(o.shortcut === undefined ? {} : { shortcut: o.shortcut }),
      ...(o.debounce === undefined ? {} : { debounce: o.debounce }),
      ...(o.overscan === undefined ? {} : { overscan: o.overscan }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
      ...(o.density === undefined ? {} : { density: o.density }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('commandPalette', id, params, this.#resolved.locale);
  }

  #bind(): void {
    const g = this.#group;
    g.listen(this.#doc, 'keydown', (event) => {
      const shortcut = this.#resolved.shortcut;
      if (shortcut === null || event.defaultPrevented || event.repeat) return;
      if (!matchesHotkey(event, shortcut)) return;
      event.preventDefault();
      this.toggle();
    });
    g.listen(this.input, 'input', () => {
      this.#refresh();
    });
    g.listen(this.input, 'keydown', (event) => {
      this.#onKey(event);
    });
    g.listen(this.dialog, 'keydown', (event) => {
      if (event.key === 'Escape' && !event.defaultPrevented) {
        event.preventDefault();
        this.close();
      }
    });
    g.listen(this.dialog, 'cancel', (event) => {
      event.preventDefault();
    });
    // A click on the backdrop (the dialog element outside its box) closes.
    g.listen(this.dialog, 'click', (event) => {
      if (event.target !== this.dialog) return;
      const r = this.dialog.getBoundingClientRect();
      const inside = event.clientX >= r.left && event.clientX <= r.right && event.clientY >= r.top && event.clientY <= r.bottom;
      if (!inside) this.close();
    });
    g.listen(this.dialog, 'close', () => {
      // A native close (for example by the browser) keeps the state in sync.
      if (this.#unlock) this.close();
    });
    g.listen(this.#viewport, 'pointerdown', (event) => {
      // Keep focus in the search field.
      event.preventDefault();
    });
    g.listen(this.#viewport, 'pointermove', (event) => {
      const index = this.#indexOf(event.target);
      if (index >= 0 && index !== this.#active && this.#selectable(index)) this.#setActive(index, false);
    });
    g.listen(this.#viewport, 'click', (event) => {
      const index = this.#indexOf(event.target);
      if (index >= 0) this.#choose(index);
    });
    g.listen(this.#crumbs, 'click', (event) => {
      if (event.target instanceof Element && event.target.closest('button')) {
        this.#back();
        this.input.focus();
      }
    });
    g.listen(this.#viewport, 'scroll', () => {
      this.#schedule();
    }, { passive: true });
    g.add(observeResize(this.#viewport, () => {
      this.#schedule();
    }));
    g.add(commandPaletteConfig.subscribe(() => {
      this.#resolved = this.#resolve();
      this.#relayout();
      this.#render();
    }));
    g.add(() => {
      if (this.#frame) this.#doc.defaultView?.cancelAnimationFrame(this.#frame);
    });
  }

  #relayout(): void {
    this.#height = HEIGHT_BY_DENSITY[this.#resolved.density];
    for (const el of [...this.#rows.values()]) this.#recycle(el);
    this.#win.reset(this.#entries.length, this.#height);
    this.host.style.setProperty('--_aui-command-palette-row', `${String(this.#height)}px`);
    this.#paint();
  }

  /** Labels, placeholder, and the footer hints. */
  #render(): void {
    const o = this.#options;
    const doc = this.#doc;
    const label = o.label ?? this.#m('label');
    this.dialog.setAttribute('aria-label', label);
    this.input.setAttribute('aria-label', this.#m('search'));
    this.input.placeholder = o.placeholder ?? this.#m('placeholder');
    this.#viewport.setAttribute('aria-label', this.#m('results'));
    this.host.style.setProperty('--_aui-command-palette-row', `${String(this.#height)}px`);
    const hint = (keys: readonly string[], text: string): HTMLElement => {
      const span = doc.createElement('span');
      span.className = 'aui-command-palette__hint';
      for (const key of keys) {
        const k = doc.createElement('span');
        Kbd.create(k, { hotkey: key, size: 'sm', ...(o.locale === undefined ? {} : { locale: o.locale }) });
        span.append(k);
      }
      const t = doc.createElement('span');
      t.textContent = text;
      span.append(t);
      return span;
    };
    this.#footer.replaceChildren(hint(['ArrowUp', 'ArrowDown'], this.#m('navigate')), hint(['Enter'], this.#m('select')), hint(['Escape'], this.#m('close')));
  }

  // ---- data ------------------------------------------------------------------------------------

  #all(): Map<string, { command: Command; path: Command[] }> {
    const map = new Map<string, { command: Command; path: Command[] }>();
    const walk = (list: readonly Command[], path: Command[]): void => {
      for (const c of list) {
        map.set(c.id, { command: c, path });
        if (c.children) walk(c.children, [...path, c]);
      }
    };
    walk(this.#options.commands, []);
    return map;
  }

  #pathTo(id: string): Command[] {
    const found = this.#all().get(id);
    if (!found?.command.children) return [];
    return [...found.path, found.command];
  }

  #trimRecent(): void {
    const limit = this.#options.recentLimit ?? 5;
    if (this.#recent.length > limit) this.#recent = this.#recent.slice(0, limit);
  }

  /** The query changed or the palette opened: recompute local results and start provider searches. */
  #refresh(): void {
    this.#renderCrumbs();
    this.#compute();
    this.#search();
  }

  #compute(): void {
    const o = this.#options;
    const locale = this.#resolved.locale;
    const query = this.input.value.trim();
    const max = o.maxResults ?? 50;
    const entries: Entry[] = [];
    const page = this.#pages[this.#pages.length - 1];
    const list = page ? (page.children ?? []) : o.commands;
    const root = !page;
    const groups = new Map<string, Entry[]>();
    const defaultGroup = this.#m('commands');
    const add = (group: string, entry: Entry): void => {
      let arr = groups.get(group);
      if (!arr) {
        arr = [];
        groups.set(group, arr);
      }
      arr.push(entry);
    };
    if (query === '') {
      if (root && (o.recentLimit ?? 5) > 0) {
        const all = this.#all();
        const recent = this.#recent.map((id) => all.get(id)).filter((r): r is { command: Command; path: Command[] } => r !== undefined && r.command.disabled !== true);
        if (recent.length > 0) {
          entries.push({ kind: 'header', label: this.#m('recent') });
          for (const r of recent) entries.push({ kind: 'command', command: r.command, ranges: [], path: r.path, providerId: null });
        }
      }
      for (const c of list) add(c.group ?? defaultGroup, { kind: 'command', command: c, ranges: [], path: this.#pages, providerId: null });
      for (const [label, items] of groups) {
        entries.push({ kind: 'header', label }, ...items.slice(0, Math.max(max, list.length)));
      }
    } else {
      // Search the current page; the top level also finds nested commands (shown with their path).
      const scored: { entry: Entry & { kind: 'command' }; score: number; group: string }[] = [];
      const visit = (items: readonly Command[], path: Command[]): void => {
        for (const c of items) {
          const hit = fuzzyMatch(c.label, query, locale);
          let score = hit?.score ?? -Infinity;
          for (const k of c.keywords ?? []) {
            const kw = fuzzyMatch(k, query, locale);
            if (kw && kw.score - 2 > score) score = kw.score - 2;
          }
          if (score > -Infinity) scored.push({ entry: { kind: 'command', command: c, ranges: hit?.ranges ?? [], path, providerId: null }, score, group: (path[0]?.group ?? c.group) ?? defaultGroup });
          if (root && c.children) visit(c.children, [...path, c]);
        }
      };
      visit(list, this.#pages);
      scored.sort((a, b) => b.score - a.score);
      for (const s of scored) add(s.group, s.entry);
      for (const [label, items] of groups) entries.push({ kind: 'header', label }, ...items.slice(0, max));
      if (root) {
        for (const p of o.providers ?? []) {
          const results = this.#provided.get(p.id);
          if (!results || results.length === 0) continue;
          entries.push({ kind: 'header', label: p.label });
          for (const c of results.slice(0, max)) entries.push({ kind: 'command', command: c, ranges: fuzzyMatch(c.label, query, locale)?.ranges ?? [], path: [], providerId: p.id });
        }
      }
    }
    this.#setEntries(entries);
  }

  #search(): void {
    this.#cancelSearch();
    const providers = this.#options.providers ?? [];
    const query = this.input.value.trim();
    this.#provided = new Map();
    this.#failed = new Set();
    const active = this.#pages.length === 0 ? providers.filter((p) => query.length >= (p.minQueryLength ?? 1)) : [];
    this.#renderError();
    if (active.length === 0) {
      this.#setLoading(false);
      return;
    }
    this.#setLoading(true);
    this.#timer = setTimeout(() => {
      const controller = new AbortController();
      this.#abort = controller;
      this.#pending = active.length;
      for (const p of active) {
        let promise: Promise<readonly Command[]>;
        try {
          promise = p.search(query, { signal: controller.signal });
        } catch (error) {
          promise = Promise.reject(error instanceof Error ? error : new Error(String(error)));
        }
        promise.then(
          (results) => {
            if (controller.signal.aborted || this.#group.disposed) return;
            if (Array.isArray(results) && results.every((r: unknown) => typeof r === 'object' && r !== null && typeof (r as Command).id === 'string' && typeof (r as Command).label === 'string')) this.#provided.set(p.id, results);
            else this.#failed.add(p.id);
            this.#settle(controller);
          },
          () => {
            if (controller.signal.aborted || this.#group.disposed) return;
            this.#failed.add(p.id);
            this.#settle(controller);
          },
        );
      }
    }, this.#resolved.debounce);
  }

  #settle(controller: AbortController): void {
    this.#pending--;
    if (this.#pending <= 0) {
      this.#abort = controller === this.#abort ? null : this.#abort;
      this.#setLoading(false);
    }
    this.#compute();
    this.#renderError();
  }

  #cancelSearch(): void {
    clearTimeout(this.#timer);
    this.#abort?.abort();
    this.#abort = null;
    this.#pending = 0;
  }

  #setLoading(loading: boolean): void {
    this.#spinner.hidden = !loading;
    if (loading) this.#viewport.setAttribute('aria-busy', 'true');
    else this.#viewport.removeAttribute('aria-busy');
    this.dialog.classList.toggle('aui-command-palette__dialog--loading', loading);
    this.#renderEmpty();
  }

  #renderError(): void {
    const failed = this.#failed.size > 0;
    this.#error.hidden = !failed;
    this.#error.textContent = failed ? this.#m('providerFailed') : '';
  }

  // ---- list ------------------------------------------------------------------------------------

  #setEntries(entries: Entry[]): void {
    const activeId = this.#activeCommand()?.id;
    this.#entries = entries;
    this.#win.reset(entries.length, this.#height);
    for (const el of [...this.#rows.values()]) this.#recycle(el);
    let next = -1;
    if (activeId !== undefined && this.input.value.trim() === '') next = entries.findIndex((e) => e.kind === 'command' && e.command.id === activeId);
    if (next < 0) next = this.#firstSelectable(0, 1);
    this.#active = next;
    this.#viewport.scrollTop = 0;
    this.#viewport.hidden = entries.length === 0;
    this.#renderEmpty();
    this.#paint();
    this.#syncActive();
    this.#scheduleAnnounce();
  }

  #renderEmpty(): void {
    const loading = !this.#spinner.hidden;
    const show = this.#entries.length === 0 && !loading;
    this.#emptyHost.hidden = !show;
    if (!show) return;
    const query = this.input.value.trim();
    const options = query === '' ? { title: this.#m('noCommands'), icon: 'search', headingLevel: null, size: 'sm' as const } : { title: this.#m('noResults', { query }), description: this.#m(this.#pages.length > 0 ? 'noResultsHintPage' : 'noResultsHint'), icon: 'search', headingLevel: null, size: 'sm' as const };
    if (this.#empty) this.#empty.update({ description: '', ...options });
    else this.#empty = EmptyState.create(this.#emptyHost, options);
  }

  #scheduleAnnounce(): void {
    clearTimeout(this.#announceTimer);
    this.#announceTimer = setTimeout(() => {
      if (!this.dialog.open) return;
      const n = this.#entries.filter((e) => e.kind === 'command').length;
      const query = this.input.value.trim();
      this.#status.textContent = n === 0 ? (query === '' ? this.#m('noCommands') : this.#m('noResults', { query })) : n === 1 ? this.#m('countOne') : this.#m('count', { count: formatNumber(n, {}, this.#resolved.locale) });
    }, 500);
  }

  #selectable(index: number): boolean {
    const e = this.#entries[index];
    return e?.kind === 'command' && e.command.disabled !== true;
  }

  #firstSelectable(from: number, step: 1 | -1): number {
    for (let i = from; i >= 0 && i < this.#entries.length; i += step) if (this.#selectable(i)) return i;
    return -1;
  }

  #activeCommand(): Command | null {
    const e = this.#entries[this.#active];
    return e?.kind === 'command' ? e.command : null;
  }

  #schedule(): void {
    const view = this.#doc.defaultView;
    if (!view || this.#frame) return;
    this.#frame = view.requestAnimationFrame(() => {
      this.#frame = 0;
      this.#paint();
    });
  }

  #recycle(el: HTMLDivElement): void {
    el.remove();
    el.replaceChildren();
    const index = Number(el.dataset.index);
    this.#rows.delete(index);
    this.#pool.push(el);
  }

  #paint(): void {
    const vp = this.#viewport;
    this.#viewport.style.setProperty('--_aui-command-palette-total', `${String(this.#win.total)}px`);
    const view = vp.clientHeight > 0 ? vp.clientHeight : this.#height * 10;
    const range = this.#win.rendered(vp.scrollTop, view, this.#resolved.overscan);
    const wanted = new Set<number>();
    for (let i = range.start; i < range.end; i++) wanted.add(i);
    // The active option stays rendered, so aria-activedescendant always points at an element.
    if (this.#active >= 0) wanted.add(this.#active);
    for (const [index, el] of [...this.#rows]) if (!wanted.has(index)) this.#recycle(el);
    let added = false;
    for (const index of wanted) {
      if (this.#rows.has(index)) continue;
      const el = this.#pool.pop() ?? this.#doc.createElement('div');
      this.#fill(el, index);
      this.#rows.set(index, el);
      added = true;
    }
    if (added) {
      const order = [...this.#rows].sort((a, b) => a[0] - b[0]);
      let cursor = this.#canvas.firstElementChild;
      for (const [, el] of order) {
        if (el === cursor) cursor = cursor.nextElementSibling;
        else this.#canvas.insertBefore(el, cursor);
      }
    }
    for (const [index, el] of this.#rows) el.style.setProperty('--_aui-command-palette-y', `${String(this.#win.offsetOf(index))}px`);
  }

  #fill(el: HTMLDivElement, index: number): void {
    const entry = this.#entries[index];
    const doc = this.#doc;
    el.dataset.index = String(index);
    el.id = `${this.#id}-${String(index)}`;
    if (!entry) return;
    if (entry.kind === 'header') {
      el.className = 'aui-command-palette__header';
      el.setAttribute('role', 'presentation');
      // Rows are recycled: an option's ARIA must not stay on a header (it would override role="presentation").
      el.removeAttribute('aria-selected');
      el.removeAttribute('aria-disabled');
      el.removeAttribute('aria-haspopup');
      el.textContent = entry.label;
      return;
    }
    const { command } = entry;
    el.className = 'aui-command-palette__option';
    el.setAttribute('role', 'option');
    el.setAttribute('aria-selected', String(index === this.#active));
    if (command.disabled === true) el.setAttribute('aria-disabled', 'true');
    else el.removeAttribute('aria-disabled');
    const parts: Node[] = [];
    const icon = doc.createElement('span');
    icon.className = 'aui-command-palette__icon';
    icon.setAttribute('aria-hidden', 'true');
    if (command.icon !== undefined) icon.append(renderIcon(command.icon, { doc }));
    parts.push(icon);
    const text = doc.createElement('span');
    text.className = 'aui-command-palette__text';
    const label = doc.createElement('span');
    label.className = 'aui-command-palette__label';
    if (entry.ranges.length > 0) label.append(highlightText(doc, command.label, entry.ranges, 'aui-command-palette__match'));
    else label.textContent = command.label;
    text.append(label);
    const nested = entry.path.length > this.#pages.length ? entry.path.slice(this.#pages.length).map((c) => c.label).join(' / ') : '';
    const description = [command.description, nested === '' ? undefined : this.#m('inside', { path: nested })].filter((d): d is string => d !== undefined && d !== '').join(' - ');
    if (description !== '') {
      const d = doc.createElement('span');
      d.className = 'aui-command-palette__description';
      d.textContent = description;
      text.append(d);
    }
    parts.push(text);
    if (command.shortcut !== undefined) {
      const k = doc.createElement('span');
      k.className = 'aui-command-palette__shortcut';
      try {
        Kbd.create(k, { hotkey: command.shortcut, size: 'sm', ...(this.#options.locale === undefined ? {} : { locale: this.#options.locale }) });
        parts.push(k);
      } catch {
        // An invalid display shortcut is skipped rather than breaking the list.
      }
    }
    if (command.children) {
      const sub = doc.createElement('span');
      sub.className = 'aui-command-palette__submenu';
      sub.setAttribute('aria-hidden', 'true');
      sub.append(renderIcon(this.#options.icons?.submenu ?? 'chevron-right', { doc }));
      parts.push(sub);
      el.setAttribute('aria-haspopup', 'listbox');
    } else el.removeAttribute('aria-haspopup');
    el.replaceChildren(...parts);
  }

  #syncActive(): void {
    for (const [index, el] of this.#rows) {
      if (this.#entries[index]?.kind !== 'command') continue;
      const active = index === this.#active;
      el.setAttribute('aria-selected', String(active));
      el.classList.toggle('aui-command-palette__option--active', active);
    }
    const el = this.#rows.get(this.#active);
    if (el) this.input.setAttribute('aria-activedescendant', el.id);
    else this.input.removeAttribute('aria-activedescendant');
  }

  #setActive(index: number, scroll: boolean): void {
    this.#active = index;
    if (scroll && index >= 0) {
      const vp = this.#viewport;
      // Keep the section header above the first option visible.
      const top = this.#entries[index - 1]?.kind === 'header' ? index - 1 : index;
      vp.scrollTop = this.#win.scrollFor(top, vp.scrollTop, vp.clientHeight, 'auto');
      vp.scrollTop = this.#win.scrollFor(index, vp.scrollTop, vp.clientHeight, 'auto');
    }
    this.#paint();
    this.#syncActive();
  }

  #indexOf(target: EventTarget | null): number {
    if (!(target instanceof Element)) return -1;
    const el = target.closest<HTMLElement>('.aui-command-palette__option');
    if (!el || !this.#canvas.contains(el)) return -1;
    const index = Number(el.dataset.index);
    return Number.isInteger(index) ? index : -1;
  }

  #onKey(event: KeyboardEvent): void {
    if (!this.dialog.open) return;
    const count = this.#entries.length;
    const move = (from: number, step: 1 | -1, loop: boolean): void => {
      event.preventDefault();
      let next = this.#firstSelectable(from, step);
      if (next < 0 && loop) next = this.#firstSelectable(step > 0 ? 0 : count - 1, step);
      if (next >= 0) this.#setActive(next, true);
    };
    switch (event.key) {
      case 'ArrowDown':
        move(this.#active + 1, 1, true);
        return;
      case 'ArrowUp':
        move(this.#active < 0 ? count - 1 : this.#active - 1, -1, true);
        return;
      case 'PageDown':
      case 'PageUp': {
        const page = Math.max(1, Math.floor(this.#viewport.clientHeight / this.#height) - 1);
        if (event.key === 'PageDown') move(Math.min(count - 1, this.#active + page), 1, false);
        else move(Math.max(0, this.#active - page), -1, false);
        return;
      }
      case 'Home':
      case 'End':
        if (!event.ctrlKey && !event.metaKey) return;
        move(event.key === 'Home' ? 0 : count - 1, event.key === 'Home' ? 1 : -1, false);
        return;
      case 'Enter':
        if (event.isComposing) return;
        event.preventDefault();
        if (this.#active >= 0) this.#choose(this.#active);
        return;
      case 'Backspace':
        if (this.input.value === '' && this.#pages.length > 0) {
          event.preventDefault();
          this.#back();
        }
        return;
      default:
        return;
    }
  }

  #back(): void {
    const left = this.#pages.pop();
    this.input.value = '';
    this.#refresh();
    if (left) {
      const index = this.#entries.findIndex((e) => e.kind === 'command' && e.command.id === left.id);
      if (index >= 0) this.#setActive(index, true);
    }
  }

  #renderCrumbs(): void {
    const doc = this.#doc;
    const pages = this.#pages;
    this.#crumbs.hidden = pages.length === 0;
    if (pages.length === 0) {
      this.#crumbs.replaceChildren();
      this.input.removeAttribute('aria-description');
      return;
    }
    const back = doc.createElement('button');
    back.type = 'button';
    back.className = 'aui-command-palette__back';
    back.tabIndex = -1;
    const parent = pages[pages.length - 2];
    back.setAttribute('aria-label', parent ? this.#m('back', { label: parent.label }) : this.#m('backRoot'));
    back.append(renderIcon(this.#options.icons?.back ?? 'chevron-left', { doc }));
    const trail = doc.createElement('span');
    trail.className = 'aui-command-palette__trail';
    trail.textContent = pages.map((p) => p.label).join(' / ');
    this.#crumbs.replaceChildren(back, trail);
    this.input.setAttribute('aria-description', trail.textContent);
  }

  #choose(index: number): void {
    const entry = this.#entries[index];
    if (entry?.kind !== 'command' || entry.command.disabled === true) return;
    const { command } = entry;
    if (command.children) {
      this.#pages = [...entry.path, command];
      this.input.value = '';
      this.#refresh();
      return;
    }
    const detail: CommandPaletteSelectDetail = { id: command.id, command, path: entry.path.map((c) => c.id), query: this.input.value, providerId: entry.providerId };
    const proceed = emit(this.host, 'aui-select', detail, { cancelable: true });
    if (entry.providerId === null && (this.#options.recentLimit ?? 5) > 0) {
      this.#recent = [command.id, ...this.#recent.filter((id) => id !== command.id)];
      this.#trimRecent();
    }
    this.close();
    if (proceed) command.run?.();
  }
}
