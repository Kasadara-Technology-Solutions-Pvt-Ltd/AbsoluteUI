/**
 * Prompt Input (R20 P5). The composer of a chat or assistant: an auto-growing textarea,
 * Enter to send and Shift+Enter for a new line (or Ctrl/Cmd+Enter to send, configurable),
 * attachments (button, paste, or drop) checked against type, size, and count limits, an
 * optional character or token counter, a Send button that turns into Stop while a reply
 * streams, and an optional suggestions popup for slash commands or mentions.
 *
 * A form control like Textarea: label, help text, validation (required, length), and
 * `Form` integration. Chat uses it as its composer; it also works on its own.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { paperclipIcon } from '@absoluteui/icons/set/paperclip';
import { sendIcon } from '@absoluteui/icons/set/send';
import { stopIcon } from '@absoluteui/icons/set/stop';
import { announce } from '@absoluteui/utilities';
import { Button } from '../button/button.js';
import { counterText, FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { fileKey, formatFileSize, matchesExtension, matchesMimeType } from '../internal/files.js';
import { checkText, resolveValidity, textLength, VALID, type FieldValidity } from '../internal/validation.js';

/** When the keyboard sends: Enter (Shift+Enter adds a line), or Ctrl/Cmd+Enter (Enter adds a line). */
export type PromptSubmitKey = 'enter' | 'mod-enter';

/** `idle`: ready; `sending`: waiting for the reply to start (input locked); `streaming`: a reply is arriving (Send becomes Stop). */
export type PromptInputStatus = 'idle' | 'sending' | 'streaming';

export interface PromptInputConfig {
  submitKey: PromptSubmitKey;
  validationTiming: ValidationTiming;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    promptInput: PromptInputConfig & { locale: string };
  }
}

export const promptInputConfig = defineComponentConfig<PromptInputConfig, 'locale'>(
  'promptInput',
  {
    submitKey: { default: 'enter', expected: '"enter" | "mod-enter"', validate: validators.oneOf(['enter', 'mod-enter'] as const) },
    validationTiming: validationTimingSpec,
  },
  ['locale'],
);

registerMessages('promptInput', 'en', {
  send: 'Send message',
  stop: 'Stop generating',
  attach: 'Attach files',
  attachments: 'Attachments',
  remove: 'Remove {name}',
  removed: '{name} removed',
  added: '{count} files attached',
  addedOne: '1 file attached',
  rejectedType: '{name} is not an accepted file type.',
  rejectedSize: '{name} is larger than {size}.',
  rejectedCount: 'You can attach up to {count} files.',
  suggestions: 'Suggestions',
  suggestionCount: '{count} suggestions available',
  suggestionCountOne: '1 suggestion available',
  noSuggestions: 'No suggestions',
  tokens: '{count} of {max} tokens',
  tokensOver: '{count} tokens too many',
  hintEnter: 'Enter to send, Shift+Enter for a new line',
  hintModEnter: 'Ctrl+Enter to send, Enter for a new line',
});

export interface PromptInputIcons {
  send: IconRef;
  stop: IconRef;
  attach: IconRef;
  remove: IconRef;
  file: IconRef;
  error: IconRef;
}

/** One entry of the suggestions popup. */
export interface PromptSuggestion {
  /** Text inserted in place of the trigger and the query (for example "/summarize " or "@Ada Lovelace "). */
  insert: string;
  /** Visible name of the entry (text only). */
  label: string;
  /** Optional second line (text only). */
  description?: string;
}

/** A trigger character that opens the suggestions popup, such as "/" for commands or "@" for mentions. */
export interface PromptTrigger {
  /** One character; it opens the popup at the start of the text or after a space. */
  char: string;
  /** Entries for the typed query (the text after the trigger). May return a promise; stale answers are ignored. */
  suggest: (query: string) => readonly PromptSuggestion[] | Promise<readonly PromptSuggestion[]>;
}

export interface PromptInputOptions extends Partial<PromptInputConfig> {
  /** Label and accessible name of the text field (required). */
  label: string;
  /** Visually hide the label (it stays the accessible name). Default false. */
  hideLabel?: boolean;
  value?: string;
  name?: string;
  placeholder?: string;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  required?: boolean;
  disabled?: boolean;
  /** Reply state: `sending` locks the field, `streaming` turns Send into Stop. Default `idle`. */
  status?: PromptInputStatus;
  /** Visible rows when empty (the minimum height). Default 1. */
  rows?: number;
  /** The field grows with its content up to this many rows, then scrolls. Default 8. */
  maxRows?: number;
  /** Limit in counter units (characters, or the units of `count`); validated, not truncated. */
  maxLength?: number;
  /** Show the counter; requires `maxLength`. */
  showCounter?: boolean;
  /** Counter hook, for example a tokenizer: returns the size of the text in its own units. */
  count?: (value: string) => number;
  /** Unit of `count` in the counter text. Default `characters` (or `tokens` when `count` is set). */
  counterUnit?: 'characters' | 'tokens';
  /** Show the attach button and accept pasted or dropped files. Default false. */
  attachments?: boolean;
  /** Accepted MIME types (`image/*`) or extensions (`.pdf`); empty accepts any. */
  accept?: readonly string[];
  /** Most files attached at once. Default 10. */
  maxFiles?: number;
  /** Largest file in bytes; null for no limit. Default null. */
  maxFileSize?: number | null;
  /** Suggestions popups for trigger characters (slash commands, mentions). */
  triggers?: readonly PromptTrigger[];
  /** Show the keyboard hint under the field. Default false. */
  showHint?: boolean;
  locale?: string;
  icons?: Partial<PromptInputIcons>;
}

/** `aui-send` detail (cancelable: prevent it to keep the text and files in the field). */
export interface PromptInputSendDetail {
  text: string;
  attachments: File[];
}

/** `aui-input` / `aui-change` detail. */
export interface PromptInputValueDetail {
  value: string;
  validity: FieldValidity;
}

/** A file that was not attached, and why. */
export interface PromptInputRejectedFile {
  file: File;
  reason: 'type' | 'size' | 'count';
}

/** `aui-attachment-change` detail: the attached files after the change, and files that were refused. */
export interface PromptInputAttachmentChangeDetail {
  attachments: File[];
  rejected: PromptInputRejectedFile[];
}

/** `aui-suggestion-select` detail. */
export interface PromptInputSuggestionSelectDetail {
  trigger: string;
  suggestion: PromptSuggestion;
}

const STATUSES: readonly PromptInputStatus[] = ['idle', 'sending', 'streaming'];
const MAX_SUGGESTIONS = 50;

const DEFAULT_ICONS: PromptInputIcons = { send: sendIcon, stop: stopIcon, attach: paperclipIcon, remove: 'close', file: 'file', error: 'alert-circle' };

function supportsFieldSizing(): boolean {
  return typeof CSS !== 'undefined' && typeof CSS.supports === 'function' && CSS.supports('field-sizing', 'content');
}

export class PromptInput implements FormControl {
  readonly host: HTMLElement;
  readonly textarea: HTMLTextAreaElement;
  #options: PromptInputOptions;
  #initialValue: string;
  #validity: FieldValidity = VALID;
  #files: File[] = [];
  #fileError = '';
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();
  readonly #box: HTMLDivElement;
  readonly #chips: HTMLUListElement;
  readonly #toolbar: HTMLDivElement;
  readonly #hint: HTMLDivElement;
  readonly #fileInput: HTMLInputElement;
  readonly #attach: Button;
  readonly #send: Button;
  readonly #popup: HTMLUListElement;
  #chipButtons: Button[] = [];
  #chipGroup = new DisposableGroup();
  #suggestions: readonly PromptSuggestion[] = [];
  #active = -1;
  #trigger: { char: string; start: number; query: string } | null = null;
  #suggestRequest = 0;
  #counterTimer: ReturnType<typeof setTimeout> | undefined;

  /** Render into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: PromptInputOptions): PromptInput {
    return new PromptInput(host, options);
  }

  private constructor(host: HTMLElement, options: PromptInputOptions) {
    PromptInput.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initialValue = options.value ?? '';
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-prompt-input');
    this.textarea = doc.createElement('textarea');
    this.textarea.id = createId('aui-prompt-input');
    this.textarea.className = 'aui-prompt-input__textarea';
    this.textarea.value = this.#initialValue;
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.textarea.id;

    this.#box = doc.createElement('div');
    this.#box.className = 'aui-prompt-input__box';
    this.#chips = doc.createElement('ul');
    this.#chips.className = 'aui-prompt-input__attachments';
    this.#chips.hidden = true;
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-prompt-input__toolbar';
    this.#fileInput = doc.createElement('input');
    this.#fileInput.type = 'file';
    this.#fileInput.multiple = true;
    this.#fileInput.className = 'aui-prompt-input__file';
    this.#fileInput.tabIndex = -1;
    this.#fileInput.setAttribute('aria-hidden', 'true');
    const attachEl = doc.createElement('button');
    attachEl.type = 'button';
    attachEl.className = 'aui-prompt-input__attach';
    attachEl.setAttribute('aria-label', '-');
    const sendEl = doc.createElement('button');
    sendEl.type = 'button';
    sendEl.className = 'aui-prompt-input__send';
    sendEl.setAttribute('aria-label', '-');
    const icons = this.#icons();
    this.#attach = Button.enhance(attachEl, { icon: icons.attach, variant: 'ghost', size: 'sm' });
    this.#send = Button.enhance(sendEl, { icon: icons.send, variant: 'primary', size: 'sm' });
    const spacer = doc.createElement('span');
    spacer.className = 'aui-prompt-input__spacer';
    this.#toolbar.append(attachEl, this.#fileInput, spacer, this.#chrome.counter, sendEl);
    this.#popup = doc.createElement('ul');
    this.#popup.className = 'aui-prompt-input__suggestions';
    this.#popup.id = createId('aui-prompt-input-suggestions');
    this.#popup.setAttribute('role', 'listbox');
    this.#popup.hidden = true;
    this.#box.append(this.#chips, this.textarea, this.#toolbar, this.#popup);
    this.#hint = doc.createElement('div');
    this.#hint.className = 'aui-prompt-input__hint';
    this.#hint.id = createId('aui-prompt-input-hint');

    try {
      // Render first: invalid options (including config and messages) throw before the host is touched.
      this.#render();
    } catch (error) {
      this.#attach.destroy();
      this.#send.destroy();
      throw error;
    }
    host.classList.add('aui-field', 'aui-prompt-input');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.#box, this.#hint, this.#chrome.error);
    this.#fitContent();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(promptInputConfig.subscribe(() => {
      this.#render();
    }));
  }

  get value(): string {
    return this.textarea.value;
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

  get status(): PromptInputStatus {
    return this.#options.status ?? 'idle';
  }

  /** Files attached now (a copy). */
  get attachments(): File[] {
    return [...this.#files];
  }

  get validity(): FieldValidity {
    return this.#validity;
  }

  get dirty(): boolean {
    return this.textarea.value !== this.#initialValue || this.#files.length > 0;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<PromptInputOptions> {
    return this.#options;
  }

  /** Whether the suggestions popup is open. */
  get suggestionsOpen(): boolean {
    return !this.#popup.hidden;
  }

  getFormValue(): string {
    return this.textarea.value;
  }

  /** Set the text programmatically (no events). */
  setValue(value: string): void {
    this.textarea.value = value;
    this.#state.customError = null;
    this.#closeSuggestions();
    this.#render();
    this.#fitContent();
  }

  /** Replace the attached files programmatically (no events; limits are not applied). */
  setAttachments(files: readonly File[]): void {
    this.#files = [...files];
    this.#fileError = '';
    this.#renderChips();
    this.#render();
  }

  /** Clear the text and the attachments (no events). */
  clear(): void {
    this.#files = [];
    this.#fileError = '';
    this.#renderChips();
    this.setValue('');
  }

  /**
   * Send what is in the field, as the Send button does: emits the cancelable `aui-send`
   * and clears the field unless the event is prevented. Returns false when nothing was sent
   * (empty, disabled, not idle, invalid, or prevented).
   */
  send(): boolean {
    if (!this.#canSend()) return false;
    if (!this.reportValidity()) return false;
    const detail: PromptInputSendDetail = { text: this.textarea.value, attachments: [...this.#files] };
    const proceed = emit(this.host, 'aui-send', detail, { cancelable: true });
    if (!proceed) return false;
    this.#files = [];
    this.#renderChips();
    this.textarea.value = '';
    this.#state.reset();
    this.#render();
    this.#fitContent();
    return true;
  }

  /** Open the file chooser (attachments must be enabled). */
  openFilePicker(): void {
    if (this.#options.attachments !== true || this.disabled) return;
    this.#fileInput.click();
  }

  /** Add files as if the user picked them: limits apply and `aui-attachment-change` is emitted. */
  addFiles(files: readonly File[]): PromptInputRejectedFile[] {
    const o = this.#options;
    const accept = o.accept ?? [];
    const maxFiles = o.maxFiles ?? 10;
    const known = new Set(this.#files.map(fileKey));
    const rejected: PromptInputRejectedFile[] = [];
    const added: File[] = [];
    for (const file of files) {
      if (known.has(fileKey(file))) continue;
      if (accept.length > 0 && !matchesMimeType(file.type, accept) && !matchesExtension(file.name, accept)) rejected.push({ file, reason: 'type' });
      else if (o.maxFileSize != null && file.size > o.maxFileSize) rejected.push({ file, reason: 'size' });
      else if (this.#files.length + added.length >= maxFiles) rejected.push({ file, reason: 'count' });
      else {
        added.push(file);
        known.add(fileKey(file));
      }
    }
    if (added.length === 0 && rejected.length === 0) return rejected;
    const locale = this.#config().locale;
    this.#files = [...this.#files, ...added];
    this.#fileError = rejected.map((r) => this.#rejectionText(r, locale)).filter((t, i, all) => all.indexOf(t) === i).join(' ');
    this.#renderChips();
    this.#render();
    if (added.length > 0) announce(added.length === 1 ? this.#m('addedOne') : this.#m('added', { count: formatNumber(added.length, {}, locale) }), 'polite', this.#doc);
    emit(this.host, 'aui-attachment-change', { attachments: [...this.#files], rejected } satisfies PromptInputAttachmentChangeDetail);
    return rejected;
  }

  update(options: Partial<PromptInputOptions>): void {
    const next = { ...this.#options, ...options };
    PromptInput.#assert(next);
    const previous = this.#options;
    this.#options = next;
    if ('value' in options) this.textarea.value = options.value ?? '';
    try {
      this.#render();
    } catch (error) {
      this.#options = previous;
      this.#render();
      throw error;
    }
    if (options.triggers !== undefined || options.disabled === true) this.#closeSuggestions();
    this.#renderChips();
    this.#fitContent();
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
    this.textarea.focus();
  }

  reset(): void {
    this.textarea.value = this.#initialValue;
    this.#files = [];
    this.#fileError = '';
    this.#state.reset();
    this.#closeSuggestions();
    this.#renderChips();
    this.#render();
    this.#fitContent();
  }

  destroy(): void {
    this.#group.dispose();
    this.#chipGroup.dispose();
    clearTimeout(this.#counterTimer);
    this.#suggestRequest += 1;
    for (const b of this.#chipButtons) b.destroy();
    this.#attach.destroy();
    this.#send.destroy();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-prompt-input', 'aui-prompt-input--invalid', 'aui-prompt-input--disabled', 'aui-prompt-input--streaming', 'aui-prompt-input--sending', 'aui-prompt-input--dragover', 'aui-prompt-input--auto-native');
  }

  static #assert(options: PromptInputOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('PROMPT_INPUT_OPTIONS', 'Invalid prompt input options.', { component: 'prompt-input', property: `promptInput.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const value: unknown = options.value;
    if (value !== undefined && typeof value !== 'string') fail('value', 'string');
    if (options.status !== undefined && !STATUSES.includes(options.status)) fail('status', '"idle" | "sending" | "streaming"');
    const isRows = validators.integerInRange(1, 40);
    if (options.rows !== undefined && !isRows(options.rows)) fail('rows', 'integer 1..40');
    if (options.maxRows !== undefined && !isRows(options.maxRows)) fail('maxRows', 'integer 1..40');
    if ((options.maxRows ?? 8) < (options.rows ?? 1)) fail('maxRows', 'maxRows >= rows');
    if (options.maxLength !== undefined && !validators.integerInRange(1, 10_000_000)(options.maxLength)) fail('maxLength', 'integer >= 1');
    if (options.showCounter === true && options.maxLength === undefined) fail('showCounter', 'maxLength to be set');
    const count: unknown = options.count;
    if (count !== undefined && typeof count !== 'function') fail('count', '(value: string) => number');
    const unit: unknown = options.counterUnit;
    if (unit !== undefined && unit !== 'characters' && unit !== 'tokens') fail('counterUnit', '"characters" | "tokens"');
    const accept: unknown = options.accept;
    if (accept !== undefined && (!Array.isArray(accept) || accept.some((a) => typeof a !== 'string' || a.trim() === ''))) fail('accept', 'string[] of MIME types or extensions');
    if (options.maxFiles !== undefined && !validators.integerInRange(1, 100)(options.maxFiles)) fail('maxFiles', 'integer 1..100');
    if (options.maxFileSize != null && !validators.integerInRange(1, Number.MAX_SAFE_INTEGER)(options.maxFileSize)) fail('maxFileSize', 'positive integer (bytes) or null');
    const triggers: unknown = options.triggers;
    if (triggers !== undefined) {
      if (!Array.isArray(triggers) || triggers.length > 10) fail('triggers', 'up to 10 { char, suggest }');
      const seen = new Set<string>();
      for (const t of options.triggers ?? []) {
        const char: unknown = t.char;
        const suggest: unknown = t.suggest;
        if (typeof char !== 'string' || Array.from(char).length !== 1 || /\s/.test(char) || seen.has(char)) fail('triggers', 'distinct single non-space characters');
        if (typeof suggest !== 'function') fail('triggers', 'suggest: (query) => PromptSuggestion[] | Promise<PromptSuggestion[]>');
        seen.add(t.char);
      }
    }
  }

  #config(): Readonly<PromptInputConfig & { locale: string }> {
    const o = this.#options;
    return promptInputConfig.resolve({
      ...(o.submitKey === undefined ? {} : { submitKey: o.submitKey }),
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #m(id: string, params: Record<string, string> = {}): string {
    return getMessage('promptInput', id, params, this.#config().locale);
  }

  #icons(): PromptInputIcons {
    return { ...DEFAULT_ICONS, ...this.#options.icons };
  }

  #canSend(): boolean {
    const o = this.#options;
    if (o.disabled === true || (o.status ?? 'idle') !== 'idle') return false;
    return this.textarea.value.trim() !== '' || this.#files.length > 0;
  }

  #rejectionText(r: PromptInputRejectedFile, locale: string): string {
    if (r.reason === 'type') return this.#m('rejectedType', { name: r.file.name });
    if (r.reason === 'size') return this.#m('rejectedSize', { name: r.file.name, size: formatFileSize(this.#options.maxFileSize ?? 0, locale) });
    return this.#m('rejectedCount', { count: formatNumber(this.#options.maxFiles ?? 10, {}, locale) });
  }

  #bindEvents(): void {
    const g = this.#group;
    const ta = this.textarea;
    observePointer(this.#doc);
    g.listen(ta, 'input', () => {
      this.#state.dirty = true;
      this.#state.customError = null;
      this.#render();
      this.#fitContent();
      this.#scheduleCounterAnnouncement();
      this.#updateTrigger();
      emit(this.host, 'aui-input', { value: ta.value, validity: this.#validity } satisfies PromptInputValueDetail);
    });
    g.listen(ta, 'change', () => {
      emit(this.host, 'aui-change', { value: ta.value, validity: this.#validity } satisfies PromptInputValueDetail);
    });
    g.listen(ta, 'keydown', (event) => {
      this.#onKeydown(event);
    });
    g.listen(ta, 'click', () => {
      this.#updateTrigger();
    });
    g.listen(ta, 'blur', () => {
      // Pointer selection in the popup keeps focus (mousedown is prevented), so blur closes it.
      this.#closeSuggestions();
    });
    g.listen(ta, 'paste', (event) => {
      if (this.#options.attachments !== true) return;
      const files = Array.from(event.clipboardData?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      this.addFiles(files);
    });
    g.listen(this.#box, 'dragover', (event) => {
      if (this.#options.attachments !== true || this.disabled || !event.dataTransfer?.types.includes('Files')) return;
      event.preventDefault();
      event.dataTransfer.dropEffect = 'copy';
      this.host.classList.add('aui-prompt-input--dragover');
    });
    g.listen(this.#box, 'dragleave', (event) => {
      if (event.relatedTarget instanceof Node && this.#box.contains(event.relatedTarget)) return;
      this.host.classList.remove('aui-prompt-input--dragover');
    });
    g.listen(this.#box, 'drop', (event) => {
      this.host.classList.remove('aui-prompt-input--dragover');
      if (this.#options.attachments !== true || this.disabled) return;
      const files = Array.from(event.dataTransfer?.files ?? []);
      if (files.length === 0) return;
      event.preventDefault();
      this.addFiles(files);
    });
    g.listen(this.#attach.element, 'click', () => {
      this.openFilePicker();
    });
    g.listen(this.#fileInput, 'change', () => {
      const files = Array.from(this.#fileInput.files ?? []);
      this.#fileInput.value = '';
      if (files.length > 0) this.addFiles(files);
      ta.focus();
    });
    g.listen(this.#send.element, 'click', () => {
      if (this.status === 'streaming') {
        emit(this.host, 'aui-stop', {});
        return;
      }
      if (this.send()) ta.focus();
    });
    g.listen(this.#popup, 'mousedown', (event) => {
      // Keep focus in the textarea while picking with the pointer.
      event.preventDefault();
    });
    g.listen(this.#popup, 'click', (event) => {
      const option = event.target instanceof Element ? event.target.closest<HTMLElement>('[role="option"]') : null;
      if (!option) return;
      const index = Number(option.dataset.index);
      if (Number.isInteger(index)) this.#accept(index);
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #onKeydown(event: KeyboardEvent): void {
    // Never act on keys that confirm an IME composition.
    if (event.isComposing || event.key === 'Process') return;
    if (!this.#popup.hidden && this.#suggestions.length > 0) {
      const count = this.#suggestions.length;
      if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
        event.preventDefault();
        const step = event.key === 'ArrowDown' ? 1 : -1;
        this.#setActive((this.#active + step + count) % count);
        return;
      }
      if (event.key === 'Enter' || event.key === 'Tab') {
        if (this.#active >= 0) {
          event.preventDefault();
          this.#accept(this.#active);
          return;
        }
      }
      if (event.key === 'Escape') {
        event.preventDefault();
        event.stopPropagation();
        this.#closeSuggestions();
        return;
      }
    } else if (event.key === 'Escape' && !this.#popup.hidden) {
      event.preventDefault();
      this.#closeSuggestions();
      return;
    }
    if (event.key !== 'Enter') return;
    const { submitKey } = this.#config();
    const mod = event.ctrlKey || event.metaKey;
    const sends = submitKey === 'enter' ? !event.shiftKey && !mod && !event.altKey : mod;
    if (!sends) return;
    event.preventDefault();
    this.send();
  }

  /** Detects a trigger character before the caret and asks for suggestions. */
  #updateTrigger(): void {
    const triggers = this.#options.triggers ?? [];
    const ta = this.textarea;
    if (triggers.length === 0 || ta.selectionStart !== ta.selectionEnd) {
      this.#closeSuggestions();
      return;
    }
    const before = ta.value.slice(0, ta.selectionStart);
    let found: { trigger: PromptTrigger; start: number; query: string } | null = null;
    for (const trigger of triggers) {
      const at = before.lastIndexOf(trigger.char);
      if (at === -1) continue;
      const query = before.slice(at + trigger.char.length);
      const preceding = at === 0 ? '' : before.charAt(at - 1);
      if ((preceding === '' || /\s/.test(preceding)) && !/\s/.test(query) && query.length <= 50 && (found === null || at > found.start)) found = { trigger, start: at, query };
    }
    if (!found) {
      this.#closeSuggestions();
      return;
    }
    const { trigger, start, query } = found;
    if (this.#trigger?.char === trigger.char && this.#trigger.start === start && this.#trigger.query === query && !this.#popup.hidden) return;
    this.#trigger = { char: trigger.char, start, query };
    const request = ++this.#suggestRequest;
    let result: readonly PromptSuggestion[] | Promise<readonly PromptSuggestion[]>;
    try {
      result = trigger.suggest(query);
    } catch {
      this.#closeSuggestions();
      return;
    }
    const show = (list: readonly PromptSuggestion[]): void => {
      if (request !== this.#suggestRequest || this.#group.disposed) return;
      const entries: unknown = list;
      this.#showSuggestions(Array.isArray(entries) ? (entries as readonly unknown[]).filter((s): s is PromptSuggestion => validators.isRecord(s) && typeof s.label === 'string' && typeof s.insert === 'string').slice(0, MAX_SUGGESTIONS) : []);
    };
    if (result instanceof Promise) {
      result.then(show, () => {
        if (request === this.#suggestRequest) this.#closeSuggestions();
      });
    } else show(result);
  }

  #showSuggestions(list: readonly PromptSuggestion[]): void {
    const doc = this.#doc;
    const locale = this.#config().locale;
    this.#suggestions = list;
    this.#popup.setAttribute('aria-label', this.#m('suggestions'));
    if (list.length === 0) {
      this.#closeSuggestions();
      announce(this.#m('noSuggestions'), 'polite', doc);
      return;
    }
    this.#popup.replaceChildren(...list.map((s, i) => {
      const li = doc.createElement('li');
      li.className = 'aui-prompt-input__suggestion';
      li.id = `${this.#popup.id}-${String(i)}`;
      li.dataset.index = String(i);
      li.setAttribute('role', 'option');
      li.setAttribute('aria-selected', 'false');
      const name = doc.createElement('span');
      name.className = 'aui-prompt-input__suggestion-label';
      name.textContent = s.label;
      li.append(name);
      if (s.description) {
        const d = doc.createElement('span');
        d.className = 'aui-prompt-input__suggestion-description';
        d.textContent = s.description;
        li.append(d);
      }
      return li;
    }));
    this.#popup.hidden = false;
    this.textarea.setAttribute('aria-controls', this.#popup.id);
    this.#setActive(0);
    announce(list.length === 1 ? this.#m('suggestionCountOne') : this.#m('suggestionCount', { count: formatNumber(list.length, {}, locale) }), 'polite', doc);
  }

  #setActive(index: number): void {
    this.#active = index;
    const options = Array.from(this.#popup.children);
    options.forEach((el, i) => {
      el.setAttribute('aria-selected', String(i === index));
      el.classList.toggle('aui-prompt-input__suggestion--active', i === index);
    });
    const active = options[index];
    if (active) {
      this.textarea.setAttribute('aria-activedescendant', active.id);
      active.scrollIntoView({ block: 'nearest' });
    } else this.textarea.removeAttribute('aria-activedescendant');
  }

  #closeSuggestions(): void {
    this.#suggestRequest += 1;
    this.#trigger = null;
    this.#suggestions = [];
    this.#active = -1;
    if (this.#popup.hidden) return;
    this.#popup.hidden = true;
    this.#popup.replaceChildren();
    this.textarea.removeAttribute('aria-activedescendant');
    this.textarea.removeAttribute('aria-controls');
  }

  #accept(index: number): void {
    const suggestion = this.#suggestions[index];
    const trigger = this.#trigger;
    if (!suggestion || !trigger) return;
    const ta = this.textarea;
    const end = trigger.start + trigger.char.length + trigger.query.length;
    const insert = suggestion.insert.endsWith(' ') ? suggestion.insert : `${suggestion.insert} `;
    ta.value = ta.value.slice(0, trigger.start) + insert + ta.value.slice(end);
    const caret = trigger.start + insert.length;
    ta.setSelectionRange(caret, caret);
    this.#closeSuggestions();
    this.#state.dirty = true;
    this.#render();
    this.#fitContent();
    emit(this.host, 'aui-suggestion-select', { trigger: trigger.char, suggestion } satisfies PromptInputSuggestionSelectDetail);
    emit(this.host, 'aui-input', { value: ta.value, validity: this.#validity } satisfies PromptInputValueDetail);
  }

  #renderChips(): void {
    const doc = this.#doc;
    const locale = this.#config().locale;
    const icons = this.#icons();
    for (const b of this.#chipButtons) b.destroy();
    this.#chipGroup.dispose();
    this.#chipGroup = new DisposableGroup();
    this.#chipButtons = [];
    this.#chips.setAttribute('aria-label', this.#m('attachments'));
    this.#chips.replaceChildren(...this.#files.map((file, index) => {
      const li = doc.createElement('li');
      li.className = 'aui-prompt-input__chip';
      const icon = renderIcon(icons.file, { className: 'aui-prompt-input__chip-icon', doc });
      const name = doc.createElement('span');
      name.className = 'aui-prompt-input__chip-name';
      name.textContent = file.name;
      const size = doc.createElement('span');
      size.className = 'aui-prompt-input__chip-size';
      size.textContent = formatFileSize(file.size, locale);
      const remove = doc.createElement('button');
      remove.type = 'button';
      remove.className = 'aui-prompt-input__chip-remove';
      const label = this.#m('remove', { name: file.name });
      remove.setAttribute('aria-label', label);
      const button = Button.enhance(remove, { icon: icons.remove, variant: 'ghost', size: 'sm', label, disabled: this.disabled });
      this.#chipButtons.push(button);
      this.#chipGroup.listen(remove, 'click', () => {
        this.#removeFile(index);
      });
      li.append(icon, name, size, remove);
      return li;
    }));
    this.#chips.hidden = this.#files.length === 0;
  }

  #removeFile(index: number): void {
    const file = this.#files[index];
    if (!file) return;
    this.#files = this.#files.filter((_, i) => i !== index);
    this.#fileError = '';
    this.#renderChips();
    this.#render();
    announce(this.#m('removed', { name: file.name }), 'polite', this.#doc);
    emit(this.host, 'aui-attachment-change', { attachments: [...this.#files], rejected: [] } satisfies PromptInputAttachmentChangeDetail);
    // Keep focus inside the composer: the next chip, or the text field.
    const next = this.#chipButtons[Math.min(index, this.#chipButtons.length - 1)];
    (next?.element ?? this.textarea).focus();
  }

  #scheduleCounterAnnouncement(): void {
    const max = this.#options.maxLength;
    if (this.#options.showCounter !== true || max === undefined) return;
    clearTimeout(this.#counterTimer);
    this.#counterTimer = setTimeout(() => {
      const used = this.#measure(this.textarea.value);
      if (max - used <= Math.max(1, Math.floor(max * 0.1))) announce(this.#counterText(used, max).text, 'polite', this.#doc);
    }, 750);
  }

  #measure(value: string): number {
    const count = this.#options.count;
    if (!count) return textLength(value);
    const n = count(value);
    return Number.isFinite(n) && n >= 0 ? Math.floor(n) : 0;
  }

  #unit(): 'characters' | 'tokens' {
    return this.#options.counterUnit ?? (this.#options.count ? 'tokens' : 'characters');
  }

  #counterText(used: number, max: number): { text: string; over: boolean } {
    const locale = this.#config().locale;
    if (this.#unit() === 'characters') return counterText(used, max, locale);
    if (used > max) return { text: this.#m('tokensOver', { count: formatNumber(used - max, {}, locale) }), over: true };
    return { text: this.#m('tokens', { count: formatNumber(used, {}, locale), max: formatNumber(max, {}, locale) }), over: false };
  }

  /** Auto-grow between `rows` and `maxRows`: native `field-sizing` where supported, else a CSSOM block size. */
  #fitContent(): void {
    const ta = this.textarea;
    // Server rendering (no window) and detached hosts have nothing to measure; the next input sizes it.
    const view = this.#doc.defaultView;
    if (this.host.classList.contains('aui-prompt-input--auto-native') || !ta.isConnected || typeof view?.getComputedStyle !== 'function') return;
    ta.style.setProperty('block-size', 'auto');
    const scroll = ta.scrollHeight;
    if (!scroll) {
      ta.style.removeProperty('block-size');
      return;
    }
    const cs = view.getComputedStyle(ta);
    const borders = (Number.parseFloat(cs.borderBlockStartWidth) || 0) + (Number.parseFloat(cs.borderBlockEndWidth) || 0);
    ta.style.setProperty('block-size', `${String(scroll + borders)}px`);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const icons = this.#icons();
    const m = (id: string): string => getMessage('promptInput', id, {}, config.locale);
    const labels = { send: m('send'), stop: m('stop'), attach: m('attach'), hint: m(config.submitKey === 'enter' ? 'hintEnter' : 'hintModEnter') };
    const ta = this.textarea;
    const status = o.status ?? 'idle';
    const disabled = o.disabled ?? false;

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    ta.placeholder = o.placeholder ?? '';
    ta.disabled = disabled;
    // While the request is sent the text stays readable but cannot change; while streaming the next message can be written.
    ta.readOnly = status === 'sending';
    ta.required = o.required ?? false;
    if (o.name) ta.name = o.name;
    else ta.removeAttribute('name');
    ta.rows = o.rows ?? 1;
    ta.style.setProperty('--aui-prompt-input-rows', String(o.rows ?? 1));
    ta.style.setProperty('--aui-prompt-input-max-rows', String(o.maxRows ?? 8));
    this.host.classList.toggle('aui-prompt-input--auto-native', supportsFieldSizing());
    // Enter sends: tell assistive technology the field still takes several lines.
    ta.setAttribute('aria-multiline', 'true');

    const value = ta.value;
    const used = this.#measure(value);
    const max = o.maxLength;
    const unitChars = this.#unit() === 'characters' && !o.count;
    const outcome = checkText(value, {
      ...(o.required === undefined ? {} : { required: o.required && this.#files.length === 0 }),
      ...(max === undefined || !unitChars ? {} : { maxLength: max }),
    });
    const over = max !== undefined && !unitChars && used > max ? this.#counterText(used, max).text : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale }, over, this.#state.customError ?? (this.#fileError === '' ? null : this.#fileError));

    if (o.showCounter === true && max !== undefined) {
      const c = this.#counterText(used, max);
      this.#chrome.setCounter(c.text, c.over);
    } else this.#chrome.setCounter(null, false);

    // File refusals show at once; other messages follow the validation timing.
    const show = !this.#validity.valid && (this.#fileError !== '' || this.#state.shouldShow(config.validationTiming));
    this.#chrome.setError(show ? this.#validity.message : '', icons.error);
    this.#hint.textContent = labels.hint;
    this.#hint.hidden = o.showHint !== true;
    setDescribedBy(ta, this.#chrome.describedBy(), o.showHint === true ? [this.#hint.id] : []);
    setInvalid(ta, show);

    const attachEl = this.#attach.element;
    attachEl.hidden = o.attachments !== true;
    attachEl.setAttribute('aria-label', labels.attach);
    this.#attach.update({ icon: icons.attach, label: labels.attach, disabled: disabled || status === 'sending' });
    const accept = o.accept ?? [];
    if (accept.length > 0) this.#fileInput.accept = accept.join(',');
    else this.#fileInput.removeAttribute('accept');

    const streaming = status === 'streaming';
    const sendLabel = streaming ? labels.stop : labels.send;
    const sendEl = this.#send.element;
    sendEl.setAttribute('aria-label', sendLabel);
    sendEl.title = sendLabel;
    const canSend = !disabled && status === 'idle' && (value.trim() !== '' || this.#files.length > 0);
    this.#send.update({
      icon: streaming ? icons.stop : icons.send,
      label: sendLabel,
      variant: streaming ? 'secondary' : 'primary',
      loading: status === 'sending',
      // Stays focusable while empty (aria-disabled), so keyboard users can find it; native disabled only when the field is.
      disabled,
    });
    if (!streaming && !canSend && status !== 'sending') sendEl.setAttribute('aria-disabled', 'true');
    else if (status !== 'sending') sendEl.removeAttribute('aria-disabled');

    this.host.classList.toggle('aui-prompt-input--invalid', show);
    this.host.classList.toggle('aui-prompt-input--disabled', disabled);
    this.host.classList.toggle('aui-prompt-input--streaming', streaming);
    this.host.classList.toggle('aui-prompt-input--sending', status === 'sending');
  }
}
