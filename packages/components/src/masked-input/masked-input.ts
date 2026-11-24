/**
 * Masked Input (R20 P9). A text field that formats what the user types against a pattern
 * mask: phone numbers, IBANs, postal codes, codes with fixed shapes. Tokens: `9` digit,
 * `a` letter, `*` letter or digit, `\` escapes a literal, plus custom tokens. Editing is
 * controlled through `beforeinput`: typed and pasted characters fill the next free slots
 * (characters that fit no slot are dropped), Backspace and Delete skip literals, a
 * selection is replaced, and the caret keeps its logical position across reformatting.
 * `value` is the raw text (slot characters only); `formattedValue` adds the literals.
 * Placeholder characters are never part of the value. A Form control with a hidden input
 * submitting the raw or the formatted value.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, validators } from '@absoluteui/core';
import type { IconRef } from '@absoluteui/icons';
import { applyVisuallyHidden } from '@absoluteui/utilities';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, setText, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkText, resolveValidity, runValidator, VALID, type FieldValidity, type Outcome } from '../internal/validation.js';

export interface MaskedInputConfig {
  validationTiming: ValidationTiming;
  /** Character shown in empty slots while the template is visible. */
  placeholderChar: string;
  /** Show the whole template (literals and placeholder characters) while focused. */
  showMaskOnFocus: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    maskedInput: MaskedInputConfig & { locale: string };
  }
}

export const maskedInputConfig = defineComponentConfig<MaskedInputConfig, 'locale'>(
  'maskedInput',
  {
    validationTiming: validationTimingSpec,
    placeholderChar: { default: '_', expected: 'a single character', validate: (v: unknown): v is string => typeof v === 'string' && Array.from(v).length === 1 },
    showMaskOnFocus: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('maskedInput', 'en', {
  format: 'Format: {format}.',
  formatExample: 'Format: {format}, for example {example}.',
  legendDigit: '9 is a digit',
  legendLetter: 'a is a letter',
  legendAlphanumeric: '* is a letter or digit',
  incomplete: 'Enter the value in the format {format}.',
});

/** A custom mask token. */
export interface MaskToken {
  /** Tests one character (no anchors needed; tested against the single character). */
  readonly pattern: RegExp;
  /** Maps an accepted character, for example to upper case. */
  readonly transform?: (char: string) => string;
  /** Spoken legend entry for the format hint, for example "A is a letter". */
  readonly description?: string;
}

/** A ready-made mask: spread it into the options (`{ label, ...MASK_PRESETS.phoneUs }`). */
export interface MaskPreset {
  readonly mask: string;
  readonly tokens?: Readonly<Record<string, MaskToken>>;
  readonly minLength?: number;
  readonly inputMode?: 'numeric' | 'text' | 'tel';
  readonly autocomplete?: string;
  readonly example?: string;
}

const upper = (c: string): string => c.toLocaleUpperCase('en-US');

/** Common masks. Variable formats (for example UK postcodes) are better served by Text Input with `pattern`. */
export const MASK_PRESETS = Object.freeze({
  phoneUs: Object.freeze<MaskPreset>({ mask: '(999) 999-9999', inputMode: 'tel', autocomplete: 'tel-national', example: '(555) 010-0199' }),
  phoneInternational: Object.freeze<MaskPreset>({ mask: '+99 999 999 9999', inputMode: 'tel', autocomplete: 'tel', example: '+44 207 946 0958', minLength: 9 }),
  iban: Object.freeze<MaskPreset>({
    mask: 'AA99 XXXX XXXX XXXX XXXX XXXX XXXX XX',
    tokens: Object.freeze({
      A: Object.freeze<MaskToken>({ pattern: /\p{L}/u, transform: upper, description: 'A is a letter' }),
      X: Object.freeze<MaskToken>({ pattern: /[\p{L}\p{N}]/u, transform: upper, description: 'X is a letter or digit' }),
    }),
    // IBANs are 15 to 34 characters long, depending on the country.
    minLength: 15,
    inputMode: 'text',
    example: 'DE89 3704 0044 0532 0130 00',
  }),
  zipUs: Object.freeze<MaskPreset>({ mask: '99999', inputMode: 'numeric', autocomplete: 'postal-code', example: '12345' }),
  zipUs4: Object.freeze<MaskPreset>({ mask: '99999-9999', inputMode: 'numeric', autocomplete: 'postal-code', example: '12345-6789', minLength: 5 }),
  dateIso: Object.freeze<MaskPreset>({ mask: '9999-99-99', inputMode: 'numeric', example: '2026-11-22' }),
  date: Object.freeze<MaskPreset>({ mask: '99/99/9999', inputMode: 'numeric' }),
});

export interface MaskedInputIcons {
  error: IconRef;
}

export interface MaskedInputOptions extends Partial<MaskedInputConfig> {
  label: string;
  hideLabel?: boolean;
  description?: string;
  /** Pattern: `9` digit, `a` letter, `*` letter or digit, custom token characters, `\` escapes; anything else is a literal. */
  mask: string;
  /** Custom tokens (override the built-in ones with the same character). */
  tokens?: Readonly<Record<string, MaskToken>>;
  /** Raw value (slot characters only); a formatted string is accepted too. */
  value?: string;
  /** Raw characters needed for a complete value. Default: every slot. */
  minLength?: number;
  name?: string;
  /** Hidden input value. Default `raw`. */
  submit?: 'raw' | 'formatted';
  /** Shown while empty and unfocused. Default: the template with placeholder characters. */
  placeholder?: string;
  /** Example value read in the format hint. */
  example?: string;
  /** Replaces the generated format hint (read by screen readers with the field). */
  formatHint?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Default: `numeric` when every slot is a digit, otherwise `text`. */
  inputMode?: 'numeric' | 'text' | 'tel' | 'decimal';
  autocomplete?: string;
  /** Text direction of the value. Default `ltr` (phone numbers, codes, and IBANs read left to right in every locale). */
  direction?: 'ltr' | 'rtl' | 'auto';
  /** Consumer validation, run on complete or incomplete values. */
  validate?: (value: string, context: { readonly formattedValue: string; readonly complete: boolean }) => string | null;
  locale?: string;
  icons?: Partial<MaskedInputIcons>;
}

export interface MaskedInputValueDetail {
  value: string;
  formattedValue: string;
  complete: boolean;
  validity: FieldValidity;
}

type Slot = { readonly literal: string } | { readonly token: string; readonly test: (c: string) => boolean; readonly transform: (c: string) => string };

const BUILT_IN: Readonly<Record<string, MaskToken>> = {
  '9': { pattern: /\p{Nd}/u },
  a: { pattern: /\p{L}/u },
  '*': { pattern: /[\p{L}\p{N}]/u },
};

/** A compiled mask. Exported for tests and for formatting values outside the field. */
export class Mask {
  readonly slots: readonly Slot[];
  /** Index in `slots` of each token slot. */
  readonly tokenIndex: readonly number[];
  /** The mask as people read it (escapes removed). */
  readonly display: string;

  constructor(mask: string, tokens: Readonly<Record<string, MaskToken>> = {}) {
    const all = { ...BUILT_IN, ...tokens };
    const slots: Slot[] = [];
    let display = '';
    const chars = Array.from(mask);
    for (let i = 0; i < chars.length; i++) {
      let ch = chars[i] ?? '';
      if (ch === '\\') {
        i++;
        ch = chars[i] ?? '';
        if (ch === '') break;
        slots.push({ literal: ch });
        display += ch;
        continue;
      }
      const token = all[ch];
      if (token) {
        const re = new RegExp(token.pattern.source, token.pattern.flags.replace(/[gy]/g, ''));
        const transform = token.transform ?? ((c: string): string => c);
        slots.push({ token: ch, test: (c) => re.test(c), transform });
      } else slots.push({ literal: ch });
      display += ch;
    }
    this.slots = slots;
    this.tokenIndex = slots.flatMap((s, i) => ('token' in s ? [i] : []));
    this.display = display;
  }

  get capacity(): number {
    return this.tokenIndex.length;
  }

  /** Literal text before the first slot (for example "+1 ("). */
  get prefix(): string {
    let out = '';
    for (const s of this.slots) {
      if ('token' in s) break;
      out += s.literal;
    }
    return out;
  }

  /** Fits characters into the slots from `start`, dropping characters that fit no slot. */
  fit(text: string, start = 0): string {
    let out = '';
    let k = start;
    for (const c of text) {
      const index = this.tokenIndex[k];
      if (index === undefined) break;
      const slot = this.slots[index];
      if (slot && 'token' in slot && slot.test(c)) {
        const mapped = slot.transform(c);
        out += mapped.length === 1 || Array.from(mapped).length === 1 ? mapped : c;
        k++;
      }
    }
    return out;
  }

  /** Raw characters from a raw or formatted string (a leading literal prefix is skipped). */
  parse(text: string): string {
    const prefix = this.prefix;
    let rest = text;
    if (prefix !== '' && text.startsWith(prefix)) rest = text.slice(prefix.length);
    else if (prefix.trim() !== '' && text.startsWith(prefix.trim())) rest = text.slice(prefix.trim().length);
    return this.fit(rest);
  }

  /** Formatted text: literals up to the last filled slot, or the whole template with `placeholder`. */
  format(raw: string, placeholder: string | null): string {
    let out = '';
    let k = 0;
    const chars = Array.from(raw);
    for (const s of this.slots) {
      if ('literal' in s) {
        if (placeholder === null && k >= chars.length) break;
        out += s.literal;
        continue;
      }
      const c = chars[k];
      if (c === undefined) {
        if (placeholder === null) break;
        out += placeholder;
      } else out += c;
      k++;
    }
    return out;
  }

  /** Raw index for a caret position in the formatted text. */
  rawIndexAt(position: number, rawLength: number): number {
    let n = 0;
    for (const i of this.tokenIndex) if (i < position) n++;
    return Math.min(n, rawLength);
  }

  /** Caret position in the formatted text for a raw index. */
  positionOf(rawIndex: number): number {
    const index = this.tokenIndex[rawIndex];
    if (index !== undefined) return index;
    const last = this.tokenIndex[this.tokenIndex.length - 1];
    return last === undefined ? 0 : last + 1;
  }

  /** Whether every slot is a built-in digit slot. */
  get numeric(): boolean {
    return this.slots.every((s) => 'literal' in s || s.token === '9');
  }
}

export class MaskedInput implements FormControl {
  readonly host: HTMLElement;
  readonly input: HTMLInputElement;
  #options: MaskedInputOptions;
  #mask: Mask;
  #raw: string;
  #initial: string;
  #committed: string;
  #validity: FieldValidity = VALID;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #hint: HTMLSpanElement;
  readonly #hidden: HTMLInputElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: MaskedInputOptions): MaskedInput {
    return new MaskedInput(host, options);
  }

  private constructor(host: HTMLElement, options: MaskedInputOptions) {
    this.#mask = MaskedInput.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#raw = this.#mask.parse(options.value ?? '');
    this.#initial = this.#raw;
    this.#committed = this.#raw;
    const doc = this.#doc;
    this.#chrome = new FieldChrome(doc, 'label', 'aui-masked-input');
    this.input = doc.createElement('input');
    this.input.type = 'text';
    this.input.id = createId('aui-masked-input');
    this.input.className = 'aui-masked-input__input';
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.input.id;
    this.input.spellcheck = false;
    this.#hint = doc.createElement('span');
    this.#hint.id = createId('aui-masked-input-hint');
    applyVisuallyHidden(this.#hint);
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';

    this.#render();
    host.classList.add('aui-field', 'aui-masked-input');
    host.replaceChildren(this.#chrome.label, this.input, this.#hint, this.#chrome.description, this.#chrome.error, this.#hidden);
    this.#bind();
    this.#group.add(registerControl(this));
    this.#group.add(maskedInputConfig.subscribe(() => {
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
    return this.#raw !== this.#initial;
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<MaskedInputOptions> {
    return this.#options;
  }

  /** Raw value: slot characters only, no literals or placeholder characters. */
  get value(): string {
    return this.#raw;
  }

  /** The value with literals, up to the last filled slot. */
  get formattedValue(): string {
    return this.#mask.format(this.#raw, null);
  }

  /** Whether at least `minLength` (default: every) slot is filled. */
  get complete(): boolean {
    return Array.from(this.#raw).length >= (this.#options.minLength ?? this.#mask.capacity);
  }

  getFormValue(): string {
    return this.#options.submit === 'formatted' ? this.formattedValue : this.#raw;
  }

  /** Set the value from raw or formatted text; characters that fit no slot are dropped (no event). */
  setValue(value: string): void {
    this.#raw = this.#mask.parse(value);
    this.#committed = this.#raw;
    this.#state.customError = null;
    this.#render();
  }

  update(options: Partial<MaskedInputOptions>): void {
    const next = { ...this.#options, ...options };
    const mask = MaskedInput.#assert(next);
    const previous = { options: this.#options, mask: this.#mask, raw: this.#raw };
    this.#options = next;
    this.#mask = mask;
    // A new mask re-fits the current value.
    this.#raw = mask.parse('value' in options ? (options.value ?? '') : mask === previous.mask ? this.#raw : mask.fit(this.#raw));
    if ('value' in options) this.#committed = this.#raw;
    try {
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#mask = previous.mask;
      this.#raw = previous.raw;
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
    this.#raw = this.#initial;
    this.#committed = this.#initial;
    this.#state.reset();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-masked-input', 'aui-masked-input--invalid', 'aui-masked-input--disabled');
  }

  static #assert(options: MaskedInputOptions): Mask {
    const fail = (property: string, expected: string): never => {
      throw configurationError('MASKED_INPUT_OPTIONS', 'Invalid masked input options.', { component: 'maskedInput', property: `maskedInput.${property}`, expected });
    };
    const label: unknown = options.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const tokens: unknown = options.tokens;
    if (tokens !== undefined) {
      if (typeof tokens !== 'object' || tokens === null) fail('tokens', 'Record<char, { pattern: RegExp, transform? }>');
      for (const [key, t] of Object.entries(options.tokens ?? {})) {
        if (Array.from(key).length !== 1 || key === '\\') fail('tokens', 'single-character keys other than "\\"');
        if (!(t.pattern instanceof RegExp)) fail('tokens', `tokens["${key}"].pattern a RegExp`);
        if (t.transform !== undefined && typeof t.transform !== 'function') fail('tokens', `tokens["${key}"].transform a function`);
      }
    }
    const maskText: unknown = options.mask;
    if (typeof maskText !== 'string' || maskText === '') fail('mask', 'non-empty pattern string');
    const mask = new Mask(options.mask, options.tokens);
    if (mask.capacity === 0) fail('mask', 'at least one token (9, a, *, or a custom token)');
    if (options.minLength !== undefined && !validators.integerInRange(1, mask.capacity)(options.minLength)) fail('minLength', `integer 1..${String(mask.capacity)}`);
    if (options.value !== undefined && typeof options.value !== 'string') fail('value', 'string');
    const submit: unknown = options.submit;
    if (submit !== undefined && submit !== 'raw' && submit !== 'formatted') fail('submit', '"raw" | "formatted"');
    if (options.direction !== undefined && !['ltr', 'rtl', 'auto'].includes(options.direction)) fail('direction', '"ltr" | "rtl" | "auto"');
    if (options.validate !== undefined && typeof options.validate !== 'function') fail('validate', '(value, context) => string | null');
    return mask;
  }

  #config(): Readonly<MaskedInputConfig & { locale: string }> {
    const o = this.#options;
    return maskedInputConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.placeholderChar === undefined ? {} : { placeholderChar: o.placeholderChar }),
      ...(o.showMaskOnFocus === undefined ? {} : { showMaskOnFocus: o.showMaskOnFocus }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #focused(): boolean {
    return this.#doc.activeElement === this.input;
  }

  #display(): string {
    const { placeholderChar, showMaskOnFocus } = this.#config();
    const editable = this.#options.disabled !== true && this.#options.readOnly !== true;
    if (this.#focused() && showMaskOnFocus && editable) return this.#mask.format(this.#raw, placeholderChar);
    return this.#mask.format(this.#raw, null);
  }

  #placeCaret(rawIndex: number): void {
    const position = Math.min(this.#mask.positionOf(rawIndex), this.input.value.length);
    this.input.setSelectionRange(position, position);
  }

  #bind(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.input, 'beforeinput', (event) => {
      this.#onBeforeInput(event);
    });
    // Fallback for edits beforeinput cannot cancel (IME composition, some autofill): re-parse the field.
    const reparse = (): void => {
      const raw = this.#mask.parse(stripPlaceholders(this.input.value, this.#config().placeholderChar));
      const caret = this.#mask.rawIndexAt(this.input.selectionEnd ?? this.input.value.length, Array.from(raw).length);
      this.#apply(raw, caret);
    };
    g.listen(this.input, 'input', (event) => {
      // Leave an IME composition alone until it commits.
      if (event instanceof InputEvent && event.isComposing) return;
      reparse();
    });
    g.listen(this.input, 'compositionend', reparse);
    g.listen(this.input, 'focus', () => {
      this.#syncDisplay();
      this.#placeCaret(Array.from(this.#raw).length);
    });
    // A click lands anywhere in the template; keep the caret within the filled part.
    g.listen(this.input, 'click', () => {
      const filled = this.#mask.positionOf(Array.from(this.#raw).length);
      const start = this.input.selectionStart ?? 0;
      if (start === (this.input.selectionEnd ?? start) && start > filled) this.input.setSelectionRange(filled, filled);
    });
    g.listen(this.input, 'blur', () => {
      this.#syncDisplay();
      if (this.#raw !== this.#committed) {
        this.#committed = this.#raw;
        emit(this.host, 'aui-change', this.#detail());
      }
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
  }

  #syncDisplay(): void {
    const display = this.#display();
    if (this.input.value !== display) this.input.value = display;
  }

  #onBeforeInput(event: InputEvent): void {
    const o = this.#options;
    if (o.disabled === true || o.readOnly === true) return;
    const type = event.inputType;
    // Composition text cannot be cancelled; the input fallback handles it.
    if (type === 'insertCompositionText') return;
    event.preventDefault();
    if (type === 'historyUndo' || type === 'historyRedo' || type === 'insertLineBreak' || type === 'insertParagraph') return;
    const chars = Array.from(this.#raw);
    const length = chars.length;
    const start = this.input.selectionStart ?? this.input.value.length;
    const end = this.input.selectionEnd ?? start;
    const rs = this.#mask.rawIndexAt(start, length);
    const re = Math.max(rs, this.#mask.rawIndexAt(end, length));
    // A selection that covers only literals between two slots removes nothing.
    const collapsed = rs === re;
    if (type.startsWith('delete')) {
      let from = rs;
      let to = re;
      if (collapsed) {
        if (type.includes('Backward')) from = Math.max(0, rs - 1);
        else to = Math.min(length, rs + 1);
      }
      const next = [...chars.slice(0, from), ...chars.slice(to)].join('');
      this.#apply(this.#mask.fit(next), from);
      return;
    }
    let text = event.data ?? event.dataTransfer?.getData('text/plain') ?? '';
    if (text === '') return;
    // Pasted values often include the literal prefix (for example "+1 ").
    if (rs === 0) {
      const prefix = this.#mask.prefix.trim();
      if (prefix !== '' && text.startsWith(prefix)) text = text.slice(prefix.length);
    }
    const before = chars.slice(0, rs).join('');
    const inserted = this.#mask.fit(text, rs);
    if (inserted === '') {
      // Nothing fits (for example a letter in a digit slot): keep the value, keep the caret.
      this.#placeCaret(rs);
      return;
    }
    const insertedLength = Array.from(inserted).length;
    const after = chars.slice(re).join('');
    const next = this.#mask.fit(before + inserted + after);
    this.#apply(next, rs + insertedLength);
  }

  #apply(raw: string, caret: number): void {
    const changed = raw !== this.#raw;
    this.#raw = raw;
    if (changed) {
      this.#state.dirty = true;
      this.#state.customError = null;
    }
    this.#render();
    if (this.#focused()) this.#placeCaret(Math.min(caret, Array.from(raw).length));
    if (changed) emit(this.host, 'aui-input', this.#detail());
  }

  #detail(): MaskedInputValueDetail {
    return { value: this.#raw, formattedValue: this.formattedValue, complete: this.complete, validity: this.#validity };
  }

  #hintText(locale: string): string {
    const o = this.#options;
    if (o.formatHint !== undefined && o.formatHint !== '') return o.formatHint;
    const used = new Set(this.#mask.slots.flatMap((s) => ('token' in s ? [s.token] : [])));
    const legend: string[] = [];
    for (const key of used) {
      const custom = o.tokens?.[key];
      if (custom) {
        if (custom.description) legend.push(custom.description);
      } else if (key === '9') legend.push(getMessage('maskedInput', 'legendDigit', {}, locale));
      else if (key === 'a') legend.push(getMessage('maskedInput', 'legendLetter', {}, locale));
      else if (key === '*') legend.push(getMessage('maskedInput', 'legendAlphanumeric', {}, locale));
    }
    const format = this.#mask.display;
    const head = o.example ? getMessage('maskedInput', 'formatExample', { format, example: o.example }, locale) : getMessage('maskedInput', 'format', { format }, locale);
    return legend.length > 0 ? `${head} ${legend.join(', ')}.` : head;
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const input = this.input;
    const hint = this.#hintText(locale);
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    setText(this.#hint, hint);
    input.disabled = o.disabled === true;
    input.readOnly = o.readOnly === true;
    input.required = o.required === true;
    input.dir = o.direction ?? 'ltr';
    input.placeholder = o.placeholder ?? this.#mask.format('', config.placeholderChar);
    input.inputMode = o.inputMode ?? (this.#mask.numeric ? 'numeric' : 'text');
    input.setAttribute('autocomplete', o.autocomplete ?? 'off');
    const display = this.#display();
    if (input.value !== display) input.value = display;

    const raw = this.#raw;
    const complete = this.complete;
    let outcome: Outcome = checkText(raw, { ...(o.required === undefined ? {} : { required: o.required }) });
    if (outcome.error === null && raw !== '' && !complete) outcome = { error: 'custom', params: { message: getMessage('maskedInput', 'incomplete', { format: this.#mask.display }, locale) } };
    const custom = outcome.error === null ? runValidator(o.validate ? (v: string) => o.validate?.(v, { formattedValue: this.formattedValue, complete }) ?? null : undefined, raw) : null;
    this.#validity = resolveValidity(outcome, { locale }, custom, this.#state.customError);
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(input, [this.#hint.id, ...this.#chrome.describedBy()]);
    setInvalid(input, show);
    this.host.classList.toggle('aui-masked-input--invalid', show);
    this.host.classList.toggle('aui-masked-input--disabled', o.disabled === true);

    const name = o.name ?? null;
    this.#hidden.disabled = name === null || o.disabled === true;
    if (name === null) this.#hidden.removeAttribute('name');
    else this.#hidden.name = name;
    this.#hidden.value = o.submit === 'formatted' ? this.formattedValue : raw;
  }
}

function stripPlaceholders(text: string, placeholder: string): string {
  return text.split(placeholder).join('');
}
