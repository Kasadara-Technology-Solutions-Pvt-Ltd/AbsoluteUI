/**
 * Mention Input (R20 P9). A plain-text field (textarea, or a single-line input) that
 * opens suggestions when the user types a trigger character such as `@` (people) or
 * `#` (tags). Suggestions come from an async provider, debounced, with one
 * AbortController per query so stale answers are never shown. Inserted mentions are
 * kept as structured tokens `{ id, label, trigger, start, end }` whose offsets follow
 * every edit; editing inside a mention turns it back into plain text. Nothing is
 * rendered as HTML. A Form control with a hidden input carrying the JSON value.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getCommonConfig, getMessage, registerMessages, validators } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { announce, applyVisuallyHidden, autoPosition, openPopover, type PopoverHandle } from '@absoluteui/utilities';
import { counterText, FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkText, resolveValidity, runValidator, textLength, VALID, type FieldValidity } from '../internal/validation.js';

export interface MentionInputConfig {
  validationTiming: ValidationTiming;
  /** Milliseconds between the last keystroke and the provider call. */
  debounce: number;
  /** Most suggestions shown at once. */
  maxSuggestions: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    mentionInput: MentionInputConfig & { locale: string };
  }
}

export const mentionInputConfig = defineComponentConfig<MentionInputConfig, 'locale'>(
  'mentionInput',
  {
    validationTiming: validationTimingSpec,
    debounce: { default: 200, expected: 'integer 0..5000', validate: validators.integerInRange(0, 5000) },
    maxSuggestions: { default: 8, expected: 'integer 1..50', validate: validators.integerInRange(1, 50) },
  },
  ['locale'],
);

registerMessages('mentionInput', 'en', {
  suggestions: 'Suggestions',
  loading: 'Searching\u2026',
  noMatches: 'No matches',
  failed: 'Suggestions could not be loaded.',
  count: '{count} suggestions',
  countOne: '1 suggestion',
  inserted: '{label} mentioned',
  hint: 'Type {triggers} to mention.',
});

/** One suggestion returned by a provider. */
export interface MentionSuggestion {
  /** Stable id stored in the value (for example a user id). */
  readonly id: string;
  /** Text inserted after the trigger character. */
  readonly label: string;
  /** Secondary text in the list (not inserted). */
  readonly description?: string;
}

/** Answers a query; reject or ignore `signal` aborts (a newer query superseded this one). */
export type MentionProvider = (query: string, context: { readonly signal: AbortSignal; readonly trigger: string }) => Promise<readonly MentionSuggestion[]>;

export interface MentionTrigger {
  /** A single character, for example `@` or `#`. */
  readonly char: string;
  readonly provider: MentionProvider;
  /** Spoken name of the trigger in the hint, for example "@ for people". Default: the character. */
  readonly label?: string;
  /** Characters typed after the trigger before the provider is called. Default 0. */
  readonly minChars?: number;
}

/** A mention inside the text. Offsets are UTF-16 indices into `text`; `text.slice(start, end) === trigger + label`. */
export interface MentionToken {
  readonly id: string;
  readonly label: string;
  readonly trigger: string;
  readonly start: number;
  readonly end: number;
}

export interface MentionInputValue {
  readonly text: string;
  readonly mentions: readonly MentionToken[];
}

export interface MentionInputIcons {
  error: IconRef;
}

export interface MentionInputOptions extends Partial<MentionInputConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  placeholder?: string;
  /** Initial value: plain text, or text with mentions. */
  value?: MentionInputValue | string;
  name?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** true (default): a textarea; false: a single-line input. */
  multiline?: boolean;
  /** Visible rows of the textarea. Default 3. */
  rows?: number;
  /** Validated, not truncated. */
  maxLength?: number;
  /** Show a character counter; requires `maxLength`. */
  showCounter?: boolean;
  /** Trigger characters and their providers. */
  triggers: readonly MentionTrigger[];
  validate?: (value: MentionInputValue) => string | null;
  locale?: string;
  icons?: Partial<MentionInputIcons>;
}

/** `aui-input` (every edit) and `aui-change` (committed on blur, and on each inserted mention) detail. */
export interface MentionInputValueDetail {
  value: MentionInputValue;
  validity: FieldValidity;
}

/** `aui-mention` detail: a suggestion was inserted. */
export interface MentionInputMentionDetail {
  mention: MentionToken;
}

const MAX_QUERY = 50;
const EMPTY: MentionInputValue = Object.freeze({ text: '', mentions: Object.freeze([]) });

interface Query {
  trigger: MentionTrigger;
  /** Index of the trigger character. */
  start: number;
  query: string;
}

/** Validates and freezes a value; returns null when a mention does not match its text. */
function normalizeValue(value: MentionInputValue | string | undefined): MentionInputValue | null {
  if (value === undefined) return EMPTY;
  if (typeof value === 'string') return Object.freeze({ text: value, mentions: Object.freeze([]) });
  const text: unknown = value.text;
  const mentions: unknown = value.mentions;
  if (typeof text !== 'string' || !Array.isArray(mentions)) return null;
  const out: MentionToken[] = [];
  for (const m of mentions as unknown[]) {
    if (typeof m !== 'object' || m === null) return null;
    const t = m as Partial<Record<keyof MentionToken, unknown>>;
    if (typeof t.id !== 'string' || typeof t.label !== 'string' || typeof t.trigger !== 'string' || typeof t.start !== 'number' || typeof t.end !== 'number') return null;
    if (!Number.isInteger(t.start) || !Number.isInteger(t.end) || t.start < 0 || t.end > text.length || t.end <= t.start) return null;
    if (text.slice(t.start, t.end) !== t.trigger + t.label) return null;
    out.push(Object.freeze({ id: t.id, label: t.label, trigger: t.trigger, start: t.start, end: t.end }));
  }
  out.sort((a, b) => a.start - b.start);
  for (let i = 1; i < out.length; i++) if ((out[i]?.start ?? 0) < (out[i - 1]?.end ?? 0)) return null;
  return Object.freeze({ text, mentions: Object.freeze(out) });
}

/**
 * Moves mentions after an edit that replaced old[from, oldTo) with new text of length
 * `inserted`. Mentions before the edit stay, mentions after it shift, and mentions the
 * edit touches become plain text.
 */
export function shiftMentions(mentions: readonly MentionToken[], from: number, oldTo: number, inserted: number): MentionToken[] {
  const delta = inserted - (oldTo - from);
  const out: MentionToken[] = [];
  for (const m of mentions) {
    if (m.end <= from) out.push(m);
    else if (m.start >= oldTo) out.push(delta === 0 ? m : Object.freeze({ ...m, start: m.start + delta, end: m.end + delta }));
  }
  return out;
}

/** The replaced range between two texts, using the caret to resolve ambiguous repeats. */
export function diffRange(previous: string, next: string, caret: number): { from: number; oldTo: number; newTo: number } {
  const suffixFromCaret = next.length - caret;
  if (caret >= 0 && caret <= next.length && suffixFromCaret <= previous.length && previous.endsWith(next.slice(caret))) {
    const limit = Math.min(caret, previous.length - suffixFromCaret);
    let p = 0;
    while (p < limit && previous.charCodeAt(p) === next.charCodeAt(p)) p++;
    return { from: p, oldTo: previous.length - suffixFromCaret, newTo: caret };
  }
  let p = 0;
  const min = Math.min(previous.length, next.length);
  while (p < min && previous.charCodeAt(p) === next.charCodeAt(p)) p++;
  let s = 0;
  while (s < min - p && previous.charCodeAt(previous.length - 1 - s) === next.charCodeAt(next.length - 1 - s)) s++;
  return { from: p, oldTo: previous.length - s, newTo: next.length - s };
}

export class MentionInput implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLTextAreaElement | HTMLInputElement;
  #options: MentionInputOptions;
  #value: MentionInputValue;
  #initial: MentionInputValue;
  #committed: MentionInputValue;
  #validity: FieldValidity = VALID;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #hint: HTMLSpanElement;
  readonly #popup: HTMLDivElement;
  readonly #list: HTMLUListElement;
  readonly #status: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();
  #popover: PopoverHandle | null = null;
  #stopPosition: (() => void) | null = null;
  #query: Query | null = null;
  /** Trigger position the user dismissed with Escape; suggestions stay closed until the caret leaves it. */
  #dismissedAt = -1;
  #suggestions: readonly MentionSuggestion[] = [];
  #active = -1;
  #timer: ReturnType<typeof setTimeout> | undefined;
  #controller: AbortController | null = null;
  #counterTimer: ReturnType<typeof setTimeout> | undefined;

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: MentionInputOptions): MentionInput {
    return new MentionInput(host, options);
  }

  private constructor(host: HTMLElement, options: MentionInputOptions) {
    const value = MentionInput.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#value = value;
    this.#initial = value;
    this.#committed = value;
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-mention-input');
    this.input = options.multiline === false ? doc.createElement('input') : doc.createElement('textarea');
    this.input.id = createId('aui-mention-input');
    this.input.className = 'aui-mention-input__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.value = value.text;
    if (this.input instanceof HTMLInputElement) {
      this.input.type = 'text';
      this.input.setAttribute('role', 'combobox');
      this.input.setAttribute('aria-expanded', 'false');
    }
    this.input.setAttribute('aria-autocomplete', 'list');
    this.input.autocomplete = 'off';

    this.#hint = doc.createElement('span');
    this.#hint.id = createId('aui-mention-input-hint');
    applyVisuallyHidden(this.#hint);

    this.#popup = doc.createElement('div');
    this.#popup.className = 'aui-mention-input__popup';
    // A popover from the start: closed popovers are not displayed (before, the empty popup showed as a box under the field).
    this.#popup.popover = 'manual';
    this.#list = doc.createElement('ul');
    this.#list.className = 'aui-mention-input__list';
    this.#list.id = createId('aui-mention-input-list');
    this.#list.setAttribute('role', 'listbox');
    // The suggestions are named by the field's label.
    this.#list.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#status = doc.createElement('div');
    this.#status.className = 'aui-mention-input__status';
    this.#popup.append(this.#list, this.#status);

    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    // Render first: invalid options (config, messages) throw before the host is touched.
    this.#render();
    host.classList.add('aui-field', 'aui-mention-input');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.input, this.#hint, this.#chrome.counter, this.#chrome.error, this.#popup, this.#hidden);
    this.#bind();
    this.#group.add(registerControl(this));
    this.#group.add(mentionInputConfig.subscribe(() => {
      this.#render();
    }));
  }

  get name(): string | null {
    return this.#options.name ?? null;
  }

  get label(): string {
    return this.#options.label;
  }

  get disabled(): boolean {
    return this.#options.disabled === true;
  }

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return !sameValue(this.#value, this.#initial);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<MentionInputOptions> {
    return this.#options;
  }

  /** Text plus mention tokens. */
  get value(): MentionInputValue {
    return this.#value;
  }

  /** Whether the suggestion list is open. */
  get expanded(): boolean {
    return this.#popover?.open === true;
  }

  getFormValue(): MentionInputValue {
    return this.#value;
  }

  /** Set the value (no event). A string clears the mentions. Invalid mentions throw. */
  setValue(value: MentionInputValue | string): void {
    const next = normalizeValue(value);
    if (next === null) this.#fail('value', '{ text, mentions } with each mention matching text.slice(start, end) === trigger + label');
    this.#close();
    this.#value = next;
    this.#committed = next;
    this.input.value = next.text;
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<MentionInputOptions>): void {
    const next = { ...this.#options, ...options };
    if (options.multiline !== undefined && !options.multiline !== this.input instanceof HTMLInputElement) this.#fail('multiline', 'unchanged after create (recreate the component)');
    const value = MentionInput.#assert('value' in options ? next : { ...next, value: this.#value });
    const previous = this.#options;
    this.#options = next;
    try {
      if ('value' in options) {
        this.#value = value;
        this.#committed = value;
        this.input.value = value.text;
      }
      if (next.disabled === true || next.readOnly === true) this.#close();
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
  }

  reportValidity(): boolean {
    this.#state.submitted = true;
    this.#render();
    return this.#validity.valid;
  }

  setCustomError(message: string | null): void {
    this.#state.customError = message === '' ? null : message;
    this.#render();
  }

  focus(): void {
    this.input.focus();
  }

  reset(): void {
    this.#close();
    this.#value = this.#initial;
    this.#committed = this.#initial;
    this.input.value = this.#initial.text;
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#close();
    clearTimeout(this.#counterTimer);
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-mention-input', 'aui-mention-input--invalid', 'aui-mention-input--disabled');
  }

  #fail(property: string, expected: string): never {
    return MentionInput.#throw(property, expected);
  }

  static #throw(property: string, expected: string): never {
    throw configurationError('MENTION_INPUT_OPTIONS', 'Invalid mention input options.', { component: 'mentionInput', property: `mentionInput.${property}`, expected });
  }

  static #assert(options: MentionInputOptions): MentionInputValue {
    const fail = MentionInput.#throw;
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const triggers: unknown = options.triggers;
    if (!Array.isArray(triggers) || triggers.length === 0) fail('triggers', 'non-empty array of { char, provider }');
    const seen = new Set<string>();
    for (const t of options.triggers) {
      const char: unknown = t.char;
      if (typeof char !== 'string' || Array.from(char).length !== 1 || /\s/.test(char)) fail('triggers', 'each char a single non-space character');
      if (seen.has(t.char)) fail('triggers', 'unique trigger characters');
      seen.add(t.char);
      if (typeof t.provider !== 'function') fail('triggers', 'each provider a function returning a Promise');
      if (t.minChars !== undefined && !validators.integerInRange(0, MAX_QUERY)(t.minChars)) fail('triggers', `minChars an integer 0..${String(MAX_QUERY)}`);
    }
    const isLength = validators.integerInRange(0, 1_000_000);
    if (options.maxLength !== undefined && !isLength(options.maxLength)) fail('maxLength', 'integer >= 0');
    if (options.showCounter === true && options.maxLength === undefined) fail('showCounter', 'maxLength to be set');
    if (options.rows !== undefined && !validators.integerInRange(1, 100)(options.rows)) fail('rows', 'integer 1..100');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value) => string | null');
    return normalizeValue(options.value) ?? fail('value', '{ text, mentions } with each mention matching text.slice(start, end) === trigger + label');
  }

  #config(): Readonly<MentionInputConfig & { locale: string }> {
    const o = this.#options;
    return mentionInputConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.debounce === undefined ? {} : { debounce: o.debounce }),
      ...(o.maxSuggestions === undefined ? {} : { maxSuggestions: o.maxSuggestions }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'input', () => {
      this.#onInput();
    });
    g.listen(this.input, 'keydown', (event) => {
      this.#onKeyDown(event);
    });
    // Caret moves (clicks, arrows when closed) can enter or leave a trigger.
    g.listen(this.input, 'keyup', (event) => {
      if (['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) this.#detect();
    });
    g.listen(this.input, 'click', () => {
      this.#detect();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && (this.host.contains(next) || this.#popup.contains(next))) return;
      this.#close();
      if (!sameValue(this.#value, this.#committed)) this.#commit();
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
    // Keep focus in the field while the pointer picks a suggestion.
    g.listen(this.#list, 'pointerdown', (event) => {
      event.preventDefault();
    });
    g.listen(this.#list, 'click', (event) => {
      const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      const index = option ? Number(option.dataset.index) : -1;
      if (index >= 0) this.#insert(index);
    });
    g.listen(this.#list, 'pointermove', (event) => {
      const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      const index = option ? Number(option.dataset.index) : -1;
      if (index >= 0 && index !== this.#active) this.#setActive(index);
    });
  }

  #onInput(): void {
    const text = this.input.value;
    const caret = this.input.selectionEnd ?? text.length;
    const previous = this.#value;
    const { from, oldTo, newTo } = diffRange(previous.text, text, caret);
    const mentions = shiftMentions(previous.mentions, from, oldTo, newTo - from);
    this.#value = Object.freeze({ text, mentions: Object.freeze(mentions) });
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    this.#scheduleCounterAnnouncement();
    emit(this.host, 'aui-input', { value: this.#value, validity: this.#validity } satisfies MentionInputValueDetail);
    this.#detect();
  }

  #onKeyDown(event: KeyboardEvent): void {
    if (event.isComposing) return;
    const open = this.expanded;
    if (!open) return;
    const count = this.#suggestions.length;
    switch (event.key) {
      case 'ArrowDown':
      case 'ArrowUp':
        if (count === 0) return;
        event.preventDefault();
        this.#setActive(event.key === 'ArrowDown' ? (this.#active + 1) % count : (this.#active - 1 + count) % count);
        return;
      case 'Enter':
      case 'Tab':
        if (this.#active < 0) return;
        event.preventDefault();
        this.#insert(this.#active);
        return;
      case 'Escape':
        event.preventDefault();
        event.stopPropagation();
        this.#dismissedAt = this.#query?.start ?? -1;
        this.#close();
        return;
      default:
    }
  }

  /** Finds the trigger the caret is in, if any, and starts or updates the query. */
  #detect(): void {
    const o = this.#options;
    if (o.disabled === true || o.readOnly === true || this.#doc.activeElement !== this.input) {
      this.#close();
      return;
    }
    const text = this.input.value;
    const caret = this.input.selectionStart ?? 0;
    if (caret !== (this.input.selectionEnd ?? caret)) {
      this.#close();
      return;
    }
    let found: Query | null = null;
    for (let i = caret - 1; i >= 0 && caret - i <= MAX_QUERY + 1; i--) {
      const ch = text.charAt(i);
      if (/\s/.test(ch)) break;
      const trigger = o.triggers.find((t) => t.char === ch);
      if (!trigger) continue;
      const before = i === 0 ? '' : text.charAt(i - 1);
      if (before !== '' && !/\s/.test(before)) continue;
      // Inside an existing mention: no new query.
      if (this.#value.mentions.some((m) => i >= m.start && i < m.end)) break;
      found = { trigger, start: i, query: text.slice(i + 1, caret) };
      break;
    }
    if (found === null || found.start === this.#dismissedAt) {
      if (found === null) this.#dismissedAt = -1;
      this.#close();
      return;
    }
    if (found.query.length < (found.trigger.minChars ?? 0)) {
      this.#close();
      return;
    }
    const same = this.#query !== null && this.#query.start === found.start && this.#query.query === found.query && this.#query.trigger === found.trigger;
    this.#query = found;
    if (same && this.expanded) return;
    this.#request(found);
  }

  #request(query: Query): void {
    clearTimeout(this.#timer);
    this.#controller?.abort();
    this.#controller = null;
    const { debounce, locale } = this.#config();
    this.#open();
    // Drop the previous query's suggestions: until this query answers, Enter must not insert
    // one of them (typing "@Al" and Enter quickly inserted the first match for "@A").
    this.#suggestions = [];
    this.#active = -1;
    this.#renderOptions();
    this.#showStatus(getMessage('mentionInput', 'loading', {}, locale), true);
    this.#timer = setTimeout(() => {
      const controller = new AbortController();
      this.#controller = controller;
      let result: Promise<readonly MentionSuggestion[]>;
      try {
        result = query.trigger.provider(query.query, { signal: controller.signal, trigger: query.trigger.char });
      } catch (error) {
        result = Promise.reject(error instanceof Error ? error : new Error(String(error)));
      }
      result.then(
        (items) => {
          if (controller.signal.aborted || this.#controller !== controller || this.#group.disposed) return;
          this.#controller = null;
          this.#showResults(Array.isArray(items) ? items.filter(isSuggestion) : []);
        },
        () => {
          if (controller.signal.aborted || this.#controller !== controller || this.#group.disposed) return;
          this.#controller = null;
          this.#suggestions = [];
          this.#renderOptions();
          this.#showStatus(getMessage('mentionInput', 'failed', {}, this.#config().locale), false);
          announce(getMessage('mentionInput', 'failed', {}, this.#config().locale), 'polite', this.#doc);
        },
      );
    }, debounce);
  }

  #showResults(items: readonly MentionSuggestion[]): void {
    const { maxSuggestions, locale } = this.#config();
    this.#suggestions = items.slice(0, maxSuggestions);
    this.#active = this.#suggestions.length > 0 ? 0 : -1;
    this.#renderOptions();
    const n = this.#suggestions.length;
    const message = n === 0 ? getMessage('mentionInput', 'noMatches', {}, locale) : n === 1 ? getMessage('mentionInput', 'countOne', {}, locale) : getMessage('mentionInput', 'count', { count: formatNumber(n, {}, locale) }, locale);
    this.#showStatus(n === 0 ? message : '', false);
    announce(message, 'polite', this.#doc);
  }

  #showStatus(text: string, busy: boolean): void {
    setText(this.#status, text);
    this.#status.hidden = text === '';
    if (busy) this.#popup.setAttribute('aria-busy', 'true');
    else this.#popup.removeAttribute('aria-busy');
  }

  #renderOptions(): void {
    const doc = this.#doc;
    this.#list.replaceChildren(
      ...this.#suggestions.map((s, i) => {
        const li = doc.createElement('li');
        li.id = `${this.#list.id}-${String(i)}`;
        li.className = 'aui-mention-input__option';
        li.setAttribute('role', 'option');
        li.dataset.index = String(i);
        const name = doc.createElement('span');
        name.className = 'aui-mention-input__option-label';
        name.textContent = `${this.#query?.trigger.char ?? ''}${s.label}`;
        li.append(name);
        if (s.description) {
          const d = doc.createElement('span');
          d.className = 'aui-mention-input__option-description';
          d.textContent = s.description;
          li.append(d);
        }
        return li;
      }),
    );
    this.#list.hidden = this.#suggestions.length === 0;
    this.#setActive(this.#active);
  }

  #setActive(index: number): void {
    this.#active = index;
    for (const [i, el] of Array.from(this.#list.children).entries()) {
      const on = i === index;
      el.classList.toggle('aui-mention-input__option--active', on);
      el.setAttribute('aria-selected', String(on));
      if (on) (el as HTMLElement).scrollIntoView({ block: 'nearest' });
    }
    const option = index >= 0 ? this.#list.children[index] : undefined;
    if (option) this.input.setAttribute('aria-activedescendant', option.id);
    else this.input.removeAttribute('aria-activedescendant');
  }

  #open(): void {
    if (this.expanded) return;
    this.#list.setAttribute('aria-label', getMessage('mentionInput', 'suggestions', {}, this.#config().locale));
    this.#popover = openPopover(this.#popup, {
      inside: [this.input],
      onDismiss: () => {
        this.#dismissedAt = this.#query?.start ?? -1;
        this.#close();
      },
    });
    this.#stopPosition = autoPosition(this.input, this.#popup, { placement: 'bottom-start', direction: getCommonConfig().direction });
    this.input.setAttribute('aria-controls', this.#list.id);
    if (this.input instanceof HTMLInputElement) this.input.setAttribute('aria-expanded', 'true');
  }

  #close(): void {
    clearTimeout(this.#timer);
    this.#controller?.abort();
    this.#controller = null;
    this.#query = null;
    this.#suggestions = [];
    this.#active = -1;
    this.#stopPosition?.();
    this.#stopPosition = null;
    const popover = this.#popover;
    this.#popover = null;
    popover?.close();
    this.#list.replaceChildren();
    this.input.removeAttribute('aria-activedescendant');
    this.input.removeAttribute('aria-controls');
    if (this.input instanceof HTMLInputElement) this.input.setAttribute('aria-expanded', 'false');
  }

  #insert(index: number): void {
    const query = this.#query;
    const suggestion = this.#suggestions[index];
    if (!query || !suggestion) return;
    const text = this.input.value;
    const caret = this.input.selectionEnd ?? text.length;
    const insertText = `${query.trigger.char}${suggestion.label}`;
    const tail = text.slice(caret);
    const space = tail.startsWith(' ') ? '' : ' ';
    const replacement = `${insertText}${space}`;
    const next = text.slice(0, query.start) + replacement + tail;
    const kept = shiftMentions(this.#value.mentions, query.start, caret, replacement.length);
    const mention: MentionToken = Object.freeze({ id: suggestion.id, label: suggestion.label, trigger: query.trigger.char, start: query.start, end: query.start + insertText.length });
    const mentions = [...kept, mention].sort((a, b) => a.start - b.start);
    this.#close();
    this.input.value = next;
    const position = query.start + replacement.length + (space === '' ? 1 : 0);
    this.input.setSelectionRange(position, position);
    this.#value = Object.freeze({ text: next, mentions: Object.freeze(mentions) });
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    announce(getMessage('mentionInput', 'inserted', { label: suggestion.label }, this.#config().locale), 'polite', this.#doc);
    emit(this.host, 'aui-input', { value: this.#value, validity: this.#validity } satisfies MentionInputValueDetail);
    emit(this.host, 'aui-mention', { mention } satisfies MentionInputMentionDetail);
    this.#commit();
  }

  #commit(): void {
    this.#committed = this.#value;
    emit(this.host, 'aui-change', { value: this.#value, validity: this.#validity } satisfies MentionInputValueDetail);
  }

  #scheduleCounterAnnouncement(): void {
    const max = this.#options.maxLength;
    if (this.#options.showCounter !== true || max === undefined) return;
    clearTimeout(this.#counterTimer);
    this.#counterTimer = setTimeout(() => {
      const length = textLength(this.input.value);
      if (max - length <= Math.max(1, Math.floor(max * 0.1))) announce(counterText(length, max, this.#config().locale).text, 'polite', this.#doc);
    }, 750);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const triggers = o.triggers.map((t) => t.label ?? t.char).join(', ');
    const hint = getMessage('mentionInput', 'hint', { triggers }, locale);
    const input = this.input;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    setText(this.#hint, hint);
    input.placeholder = o.placeholder ?? '';
    input.disabled = o.disabled === true;
    input.readOnly = o.readOnly === true;
    input.required = o.required === true;
    input.spellcheck = true;
    if (input instanceof HTMLTextAreaElement) input.rows = o.rows ?? 3;

    const value = this.#value;
    const outcome = checkText(value.text, {
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.maxLength === undefined ? {} : { maxLength: o.maxLength }),
    });
    const custom = outcome.error === null ? runValidator(o.validate, value) : null;
    this.#validity = resolveValidity(outcome, { locale }, custom, this.#state.customError);
    if (o.showCounter === true && o.maxLength !== undefined) {
      const c = counterText(textLength(value.text), o.maxLength, locale);
      this.#chrome.setCounter(c.text, c.over);
    } else this.#chrome.setCounter(null, false);
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(input, this.#chrome.describedBy(), o.readOnly === true || o.disabled === true ? [] : [this.#hint.id]);
    setInvalid(input, show);
    this.host.classList.toggle('aui-mention-input--invalid', show);
    this.host.classList.toggle('aui-mention-input--disabled', o.disabled === true);

    const name = o.name ?? null;
    this.#hidden.disabled = name === null || o.disabled === true;
    if (name === null) this.#hidden.removeAttribute('name');
    else this.#hidden.name = name;
    this.#hidden.value = JSON.stringify(value);
  }
}

function isSuggestion(s: unknown): s is MentionSuggestion {
  if (typeof s !== 'object' || s === null) return false;
  const v = s as Partial<Record<keyof MentionSuggestion, unknown>>;
  return typeof v.id === 'string' && typeof v.label === 'string' && v.label !== '' && (v.description === undefined || typeof v.description === 'string');
}

function sameValue(a: MentionInputValue, b: MentionInputValue): boolean {
  if (a.text !== b.text || a.mentions.length !== b.mentions.length) return false;
  return a.mentions.every((m, i) => {
    const n = b.mentions[i];
    if (!n) return false;
    return m.id === n.id && m.start === n.start && m.end === n.end && m.trigger === n.trigger;
  });
}
