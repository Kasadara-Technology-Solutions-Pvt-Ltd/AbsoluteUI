/**
 * Rich Text Editor (SPEC section 18.21). A contenteditable surface whose content is
 * owned by an internal document model: every edit arrives as an Input Events
 * `beforeinput` (or a key command), is cancelled, applied to the model, and the
 * affected blocks are re-rendered. The browser's editing engine never changes the
 * DOM, except during IME composition, which is reconciled from the DOM when it
 * ends. `document.execCommand` is not used (deprecated).
 *
 * Features: bold, italic, underline, strikethrough, inline code, headings 1-3,
 * bullet and numbered lists (nested with Tab), links (URL policy), block quotes,
 * code blocks, alignment, undo/redo, sanitized HTML and Markdown input/output,
 * Markdown typing shortcuts, a plain-text mode, and the form-control contract
 * (label, help text, required/min/max length, counter, validation).
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, sanitizeHtml, validators, type Direction } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, createRovingTabindex, matchesHotkey } from '@absoluteui/utilities';
import { isSafeHref } from '../internal/href.js';
import { counterText, FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setInvalid, validationTimingSpec, type FormControl, type ValidationTiming } from '../internal/field.js';
import { checkText, resolveValidity, runValidator, textLength, VALID, type FieldValidity } from '../internal/validation.js';
import { fromDom, fromHtml, RTE_SANITIZE_POLICY, toHtml } from './html.js';
import { fromMarkdown, toMarkdown } from './markdown.js';
import {
  asType,
  blockAttrs,
  blockLength,
  blockText,
  caret,
  clampPos,
  clearFormatting,
  comparePos,
  deleteRange,
  docText,
  emptyDoc,
  graphemeBoundary,
  hasMark,
  insertBlocks,
  insertText,
  isCollapsed,
  linkAround,
  mapBlocks,
  MAX_DEPTH,
  mergeWithPrevious,
  normalizeDoc,
  normalizeRuns,
  paragraph,
  sameDoc,
  setLink,
  setMark,
  sliceRuns,
  splitBlock,
  styleAt,
  toRange,
  wordBoundary,
  type RteAlign,
  type RteBlock,
  type RteDoc,
  type RteEdit,
  type RteHeadingLevel,
  type RteInlineStyle,
  type RteListType,
  type RteMark,
  type RteRange,
  type RteSelection,
} from './model.js';
import { RteView } from './view.js';

export type RichTextMode = 'rich' | 'plain';
export type RichTextValueFormat = 'html' | 'markdown' | 'text';
export type RichTextToolbarItem =
  | 'paragraph' | 'heading1' | 'heading2' | 'heading3'
  | 'bold' | 'italic' | 'underline' | 'strike' | 'code' | 'link'
  | 'bulletList' | 'orderedList' | 'quote' | 'codeBlock'
  | 'alignStart' | 'alignCenter' | 'alignEnd' | 'alignJustify'
  | 'undo' | 'redo' | 'clearFormatting' | '|';

export interface RichTextEditorConfig {
  validationTiming: ValidationTiming;
  /** Markdown typing shortcuts ("# ", "- ", "1. ", "> ", "```", **bold**, *italic*, `code`, ~~strike~~). Default true. */
  markdownShortcuts: boolean;
  /** Undo depth. Default 100. */
  historyLimit: number;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    richTextEditor: RichTextEditorConfig & { locale: string; direction: Direction };
  }
}

export const richTextEditorConfig = defineComponentConfig<RichTextEditorConfig, 'locale' | 'direction'>(
  'richTextEditor',
  {
    validationTiming: validationTimingSpec,
    markdownShortcuts: { default: true, expected: 'boolean', validate: validators.isBoolean },
    historyLimit: { default: 100, expected: 'integer from 0 to 1000', validate: validators.integerInRange(0, 1000) },
  },
  ['locale', 'direction'],
);

export interface RichTextEditorIcons {
  error: IconRef;
}

export interface RichTextEditorOptions extends Partial<RichTextEditorConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  /** Initial value in `valueFormat`. */
  value?: string;
  /** Format of `value`, `getFormValue()`, and events. Default "html" (rich) or "text" (plain). */
  valueFormat?: RichTextValueFormat;
  /** `plain`: no formatting, no toolbar; paragraphs and line breaks only. Default "rich". */
  mode?: RichTextMode;
  name?: string;
  placeholder?: string;
  description?: string;
  required?: boolean;
  disabled?: boolean;
  readOnly?: boolean;
  /** Text length limits (characters of the plain text). */
  minLength?: number;
  maxLength?: number;
  showCounter?: boolean;
  /** Toolbar items in order ("|" is a separator). Default: all. */
  toolbar?: readonly RichTextToolbarItem[];
  /** Heading levels offered and accepted from pasted HTML/Markdown. Default [1, 2, 3]. */
  headings?: readonly RteHeadingLevel[];
  /** URL schemes allowed in links besides relative URLs. Default ["http", "https", "mailto", "tel"]. */
  linkSchemes?: readonly string[];
  /** Minimum visible height in text rows. Default 6. */
  rows?: number;
  /** Maximum height in rows before the content scrolls. */
  maxRows?: number;
  spellcheck?: boolean;
  validate?: (value: string) => string | null;
  locale?: string;
  direction?: Direction;
  icons?: Partial<RichTextEditorIcons>;
}

export interface RichTextEditorValueDetail {
  value: string;
  validity: FieldValidity;
}

/** Selection formatting state (toolbar state), for custom toolbars. */
export interface RichTextEditorFormatState {
  marks: RteMark[];
  block: 'paragraph' | 'heading1' | 'heading2' | 'heading3' | 'quote' | 'codeBlock' | 'bulletList' | 'orderedList';
  align: RteAlign;
  link: string | null;
  canUndo: boolean;
  canRedo: boolean;
}

registerMessages('richTextEditor', 'en', {
  toolbar: 'Formatting',
  paragraph: 'Normal text',
  heading1: 'Heading 1',
  heading2: 'Heading 2',
  heading3: 'Heading 3',
  bold: 'Bold',
  italic: 'Italic',
  underline: 'Underline',
  strike: 'Strikethrough',
  code: 'Inline code',
  link: 'Link',
  bulletList: 'Bulleted list',
  orderedList: 'Numbered list',
  quote: 'Quote',
  codeBlock: 'Code block',
  alignStart: 'Align start',
  alignCenter: 'Align center',
  alignEnd: 'Align end',
  alignJustify: 'Justify',
  undo: 'Undo',
  redo: 'Redo',
  clearFormatting: 'Clear formatting',
  linkUrl: 'Link address',
  linkApply: 'Apply',
  linkRemove: 'Remove link',
  linkCancel: 'Cancel',
  linkInvalid: 'Enter a web address (http or https), an email (mailto:), or a relative link.',
  linkAdded: 'Link added.',
  linkRemoved: 'Link removed.',
  markOn: '{mark} on.',
  markOff: '{mark} off.',
  blockChanged: '{block}.',
  undone: 'Undone.',
  redone: 'Redone.',
  shortcutParagraph: 'P',
  shortcutHeading1: 'H1',
  shortcutHeading2: 'H2',
  shortcutHeading3: 'H3',
});

const DEFAULT_TOOLBAR: readonly RichTextToolbarItem[] = [
  'paragraph', 'heading1', 'heading2', 'heading3', '|',
  'bold', 'italic', 'underline', 'strike', 'code', 'link', '|',
  'bulletList', 'orderedList', 'quote', 'codeBlock', '|',
  'alignStart', 'alignCenter', 'alignEnd', 'alignJustify', '|',
  'undo', 'redo', 'clearFormatting',
];
const ITEMS = new Set<string>([...DEFAULT_TOOLBAR]);
const ICONS: Partial<Record<RichTextToolbarItem, string>> = {
  bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strikethrough', code: 'code', link: 'link',
  bulletList: 'list-bulleted', orderedList: 'list-numbered', quote: 'quote', codeBlock: 'code-block',
  alignStart: 'align-start', alignCenter: 'align-center', alignEnd: 'align-end', alignJustify: 'align-justify',
  undo: 'undo', redo: 'redo', clearFormatting: 'clear-format',
};
const TEXT_ITEMS: Partial<Record<RichTextToolbarItem, string>> = { paragraph: 'shortcutParagraph', heading1: 'shortcutHeading1', heading2: 'shortcutHeading2', heading3: 'shortcutHeading3' };
const MARK_ITEMS: Partial<Record<RichTextToolbarItem, RteMark>> = { bold: 'bold', italic: 'italic', underline: 'underline', strike: 'strike', code: 'code' };
const ALIGN_ITEMS: Partial<Record<RichTextToolbarItem, RteAlign>> = { alignStart: 'start', alignCenter: 'center', alignEnd: 'end', alignJustify: 'justify' };
const HOTKEYS: readonly (readonly [string, Exclude<RichTextToolbarItem, '|'>])[] = [
  ['mod+b', 'bold'], ['mod+i', 'italic'], ['mod+u', 'underline'], ['mod+shift+x', 'strike'], ['mod+e', 'code'], ['mod+k', 'link'],
  ['mod+shift+7', 'orderedList'], ['mod+shift+8', 'bulletList'], ['mod+alt+0', 'paragraph'], ['mod+alt+1', 'heading1'], ['mod+alt+2', 'heading2'], ['mod+alt+3', 'heading3'],
  ['mod+shift+l', 'alignStart'], ['mod+shift+e', 'alignCenter'], ['mod+shift+r', 'alignEnd'], ['mod+shift+j', 'alignJustify'],
];
const MODES: readonly RichTextMode[] = ['rich', 'plain'];
const FORMATS: readonly RichTextValueFormat[] = ['html', 'markdown', 'text'];
/** Typing within this window (ms) is one undo step. */
const COALESCE_MS = 1000;

interface HistoryEntry {
  readonly doc: RteDoc;
  readonly selection: RteSelection;
}

export class RichTextEditor implements FormControl {
  readonly host: HTMLElement;
  /** The contenteditable element (role="textbox"). */
  readonly content: HTMLDivElement;
  #options: RichTextEditorOptions;
  #doc: RteDoc = emptyDoc();
  #selection: RteSelection = caret({ block: 0, offset: 0 });
  #initial: RteDoc = emptyDoc();
  #focusDoc: RteDoc = emptyDoc();
  #stored: RteInlineStyle | null = null;
  #undo: HistoryEntry[] = [];
  #redo: HistoryEntry[] = [];
  #lastKind: string | null = null;
  #lastTime = 0;
  #composing = false;
  #tabExits = false;
  #validity: FieldValidity = VALID;
  #toolbarFrame = 0;
  readonly #document: Document;
  readonly #view: RteView;
  readonly #chrome: FieldChrome;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();
  readonly #toolbar: HTMLDivElement;
  readonly #surface: HTMLDivElement;
  readonly #hidden: HTMLInputElement;
  readonly #linkPanel: HTMLDivElement;
  readonly #linkInput: HTMLInputElement;
  readonly #linkError: HTMLDivElement;
  #linkRange: RteRange | null = null;
  #buttons = new Map<RichTextToolbarItem, HTMLButtonElement>();

  /** Render an editor into `host` (the host's children are replaced). */
  static create(host: HTMLElement, options: RichTextEditorOptions): RichTextEditor {
    return new RichTextEditor(host, options);
  }

  private constructor(host: HTMLElement, options: RichTextEditorOptions) {
    RichTextEditor.#assert(options);
    this.host = host;
    this.#document = host.ownerDocument;
    this.#options = { ...options };
    const doc = this.#document;
    this.#config();
    // Parse the initial value before touching the host (invalid input throws first).
    this.#doc = this.#parse(options.value ?? '');
    this.#initial = this.#doc;
    this.#focusDoc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-rte');
    this.#toolbar = doc.createElement('div');
    this.#toolbar.className = 'aui-rte__toolbar';
    this.#toolbar.setAttribute('role', 'toolbar');
    this.#linkPanel = doc.createElement('div');
    this.#linkPanel.className = 'aui-rte__link-panel';
    this.#linkPanel.setAttribute('role', 'group');
    this.#linkPanel.hidden = true;
    this.#linkInput = doc.createElement('input');
    this.#linkError = doc.createElement('div');
    this.#surface = doc.createElement('div');
    this.#surface.className = 'aui-rte__surface';
    this.content = doc.createElement('div');
    this.content.className = 'aui-rte__content';
    this.content.id = createId('aui-rte');
    this.content.setAttribute('role', 'textbox');
    this.content.setAttribute('aria-multiline', 'true');
    this.content.setAttribute('aria-labelledby', this.#chrome.label.id);
    this.#surface.append(this.content);
    this.#hidden = doc.createElement('input');
    this.#hidden.type = 'hidden';
    this.#view = new RteView(this.content);
    this.#buildLinkPanel();

    host.classList.add('aui-field', 'aui-rte');
    host.replaceChildren(this.#chrome.label, this.#toolbar, this.#linkPanel, this.#surface, this.#chrome.description, this.#chrome.counter, this.#chrome.error, this.#hidden);
    this.#buildToolbar();
    this.#view.render(this.#doc);
    this.#render();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(richTextEditorConfig.subscribe(() => {
      this.#render();
    }));
  }

  // ---- FormControl -------------------------------------------------------------------------

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
    return !sameDoc(this.#doc, this.#initial);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  /** Value in `valueFormat`. */
  get value(): string {
    return this.#serialize(this.#format());
  }

  getFormValue(): string {
    return this.value;
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
    this.content.focus();
    this.#view.writeSelection(this.#selection);
  }

  reset(): void {
    this.#setDoc(this.#initial, caret({ block: 0, offset: 0 }));
    this.#undo = [];
    this.#redo = [];
    this.#state.reset();
    this.#render();
  }

  // ---- Value API ---------------------------------------------------------------------------

  /** Replace the content from a value in `valueFormat` (no events; clears history). */
  setValue(value: string): void {
    this.#replace(this.#parse(value));
  }

  getHTML(): string {
    return this.#serialize('html');
  }

  getMarkdown(): string {
    return this.#serialize('markdown');
  }

  getText(): string {
    return docText(this.#doc);
  }

  /** Replace the content with sanitized HTML (no events; clears history). */
  setHTML(html: string): void {
    this.#replace(this.#parse(html, 'html'));
  }

  setMarkdown(markdown: string): void {
    this.#replace(this.#parse(markdown, 'markdown'));
  }

  setText(text: string): void {
    this.#replace(this.#parse(text, 'text'));
  }

  update(options: Partial<RichTextEditorOptions>): void {
    const next = { ...this.#options, ...options };
    RichTextEditor.#assert(next);
    const previous = this.#options;
    this.#options = next;
    if (options.mode !== undefined && options.mode !== previous.mode && this.#plain()) this.#replace(this.#parse(docText(this.#doc), 'text'));
    if ('value' in options) this.#replace(this.#parse(options.value ?? ''));
    if (options.toolbar !== undefined || options.mode !== undefined || options.headings !== undefined || options.locale !== undefined) this.#buildToolbar();
    this.#render();
  }

  /** Current formatting at the selection. */
  get formatState(): RichTextEditorFormatState {
    return this.#formatState();
  }

  // ---- Commands ----------------------------------------------------------------------------

  /** Run a toolbar command (for custom toolbars and shortcuts). */
  command(item: Exclude<RichTextToolbarItem, '|'>): void {
    if (this.#readOnly()) return;
    this.#syncSelection();
    if (item === 'undo') {
      this.undo();
      return;
    }
    if (item === 'redo') {
      this.redo();
      return;
    }
    if (this.#plain()) return;
    const mark = MARK_ITEMS[item];
    if (mark) {
      this.#toggleMark(mark);
      return;
    }
    const align = ALIGN_ITEMS[item];
    if (align) {
      this.#apply({ doc: mapBlocks(this.#doc, toRange(this.#selection), (b) => (b.type === 'code' ? b : withAlign(b, align))), selection: this.#selection }, 'format');
      return;
    }
    switch (item) {
      case 'paragraph':
        this.#setBlock((b) => asType(b, 'paragraph'), 'paragraph');
        break;
      case 'heading1':
      case 'heading2':
      case 'heading3': {
        const level = HEADING_LEVELS[item];
        this.#setBlock((b) => (b.type === 'heading' && b.level === level ? asType(b, 'paragraph') : asType(b, 'heading', { level })), item);
        break;
      }
      case 'quote':
        this.#setBlock((b) => asType(b, b.type === 'quote' ? 'paragraph' : 'quote'), 'quote');
        break;
      case 'codeBlock':
        this.#setBlock((b) => asType(b, b.type === 'code' ? 'paragraph' : 'code'), 'codeBlock');
        break;
      case 'bulletList':
      case 'orderedList':
        this.#toggleList(item === 'bulletList' ? 'bullet' : 'ordered');
        break;
      case 'link':
        this.openLinkEditor();
        break;
      case 'clearFormatting':
        this.#stored = null;
        this.#apply({ doc: clearFormatting(this.#doc, toRange(this.#selection)), selection: this.#selection }, 'format');
        break;
      default:
        break;
    }
  }

  undo(): boolean {
    if (this.#readOnly()) return false;
    const entry = this.#undo.pop();
    if (!entry) return false;
    this.#redo.push({ doc: this.#doc, selection: this.#selection });
    this.#lastKind = null;
    this.#setDoc(entry.doc, entry.selection);
    announce(this.#msg('undone'));
    this.#changed();
    return true;
  }

  redo(): boolean {
    if (this.#readOnly()) return false;
    const entry = this.#redo.pop();
    if (!entry) return false;
    this.#undo.push({ doc: this.#doc, selection: this.#selection });
    this.#lastKind = null;
    this.#setDoc(entry.doc, entry.selection);
    announce(this.#msg('redone'));
    this.#changed();
    return true;
  }

  /** Insert text at the selection (replacing it) as if typed. */
  insertText(text: string): void {
    if (this.#readOnly()) return;
    this.#insertPlain(text, 'insert');
  }

  /** Open the link editor for the selection (Ctrl/Cmd+K). */
  openLinkEditor(): void {
    if (this.#readOnly() || this.#plain()) return;
    const range = toRange(this.#selection);
    const around = linkAround(this.#doc, range.start);
    this.#linkRange = isCollapsed(range) && around ? around.range : range;
    this.#linkInput.value = around?.href ?? '';
    this.#linkError.hidden = true;
    this.#linkInput.removeAttribute('aria-invalid');
    this.#linkPanel.hidden = false;
    this.#linkInput.focus();
    this.#linkInput.select();
  }

  destroy(): void {
    this.#group.dispose();
    cancelAnimationFrame(this.#toolbarFrame);
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-rte', 'aui-rte--invalid', 'aui-rte--disabled', 'aui-rte--readonly', 'aui-rte--plain', 'aui-rte--empty');
  }

  // ---- Options -----------------------------------------------------------------------------

  static #assert(o: RichTextEditorOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('RICH_TEXT_EDITOR_OPTIONS', 'Invalid rich text editor options.', { component: 'richTextEditor', property: `richTextEditor.${property}`, expected });
    };
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (o.value !== undefined && typeof o.value !== 'string') fail('value', 'string');
    if (o.mode !== undefined && !MODES.includes(o.mode)) fail('mode', '"rich" | "plain"');
    if (o.valueFormat !== undefined && !FORMATS.includes(o.valueFormat)) fail('valueFormat', '"html" | "markdown" | "text"');
    const isLength = validators.integerInRange(0, 10_000_000);
    if (o.minLength !== undefined && !isLength(o.minLength)) fail('minLength', 'integer >= 0');
    if (o.maxLength !== undefined && !isLength(o.maxLength)) fail('maxLength', 'integer >= 0');
    if (o.minLength !== undefined && o.maxLength !== undefined && o.minLength > o.maxLength) fail('minLength', 'minLength <= maxLength');
    if (o.showCounter && o.maxLength === undefined) fail('showCounter', 'maxLength to be set');
    const toolbar: unknown = o.toolbar;
    if (toolbar !== undefined && !(Array.isArray(toolbar) && toolbar.every((t) => typeof t === 'string' && ITEMS.has(t)))) fail('toolbar', 'RichTextToolbarItem[]');
    const headings: unknown = o.headings;
    if (headings !== undefined && !(Array.isArray(headings) && headings.length > 0 && headings.every((h) => h === 1 || h === 2 || h === 3))) fail('headings', 'non-empty (1 | 2 | 3)[]');
    const schemes: unknown = o.linkSchemes;
    if (schemes !== undefined && !(Array.isArray(schemes) && schemes.every((s) => typeof s === 'string' && /^[a-z][a-z0-9+.-]*$/.test(s) && s !== 'javascript' && s !== 'data' && s !== 'vbscript'))) fail('linkSchemes', 'URL schemes without ":" (javascript, data, vbscript are never allowed)');
    const isRows = validators.integerInRange(1, 100);
    if (o.rows !== undefined && !isRows(o.rows)) fail('rows', 'integer 1..100');
    if (o.maxRows !== undefined && !(isRows(o.maxRows) && o.maxRows >= (o.rows ?? 6))) fail('maxRows', 'integer >= rows');
    for (const key of ['hideLabel', 'required', 'disabled', 'readOnly', 'spellcheck', 'showCounter'] as const) if (o[key] !== undefined && typeof o[key] !== 'boolean') fail(key, 'boolean');
    for (const key of ['name', 'placeholder', 'description'] as const) if (o[key] !== undefined && typeof o[key] !== 'string') fail(key, 'string');
    if (o.validate !== undefined && typeof o.validate !== 'function') fail('validate', '(value: string) => string | null');
  }

  #config(): Readonly<RichTextEditorConfig & { locale: string; direction: Direction }> {
    const o = this.#options;
    const input: Partial<RichTextEditorConfig & { locale: string; direction: Direction }> = {};
    if (o.validationTiming !== undefined) input.validationTiming = o.validationTiming;
    if (o.markdownShortcuts !== undefined) input.markdownShortcuts = o.markdownShortcuts;
    if (o.historyLimit !== undefined) input.historyLimit = o.historyLimit;
    if (o.locale !== undefined) input.locale = o.locale;
    if (o.direction !== undefined) input.direction = o.direction;
    return richTextEditorConfig.resolve(input);
  }

  #msg(key: string, params: Readonly<Record<string, string>> = {}): string {
    return getMessage('richTextEditor', key, params, this.#config().locale);
  }

  #plain(): boolean {
    return this.#options.mode === 'plain';
  }

  #readOnly(): boolean {
    return this.#options.readOnly === true || this.#options.disabled === true;
  }

  #format(): RichTextValueFormat {
    return this.#options.valueFormat ?? (this.#plain() ? 'text' : 'html');
  }

  #headings(): readonly RteHeadingLevel[] {
    return this.#options.headings ?? [1, 2, 3];
  }

  /** URL policy for links: allowed schemes and relative URLs; returns the URL or null. */
  #checkUrl(url: string): string | null {
    const value = url.trim();
    if (value === '') return null;
    const schemes = this.#options.linkSchemes ?? ['http', 'https', 'mailto', 'tel'];
    const base = this.#document.baseURI;
    try {
      const parsed = new URL(value, base);
      const scheme = parsed.protocol.replace(/:$/, '');
      const relative = isSafeHref(value, 'https://relative.invalid/') && !/^[a-z][a-z0-9+.-]*:/i.test(value);
      if (relative) return value;
      return schemes.includes(scheme) ? value : null;
    } catch {
      return null;
    }
  }

  #parse(value: string, format: RichTextValueFormat = this.#format()): RteDoc {
    if (this.#plain() || format === 'text') {
      const blocks = value.replace(/\r\n?/g, '\n').split('\n').map((line) => paragraph(line));
      return normalizeDoc({ blocks });
    }
    if (format === 'markdown') return this.#filter(fromMarkdown(value, (u) => this.#checkUrl(u), this.#headings()));
    return this.#filter(fromHtml(value, this.#headings(), this.#document));
  }

  /** Drop links that the URL policy rejects and headings outside the allowed levels. */
  #filter(doc: RteDoc): RteDoc {
    const allowed = this.#headings();
    return normalizeDoc({
      blocks: doc.blocks.map((b) => {
        const runs = b.runs.map((r) => {
          if (r.link === undefined) return r;
          const url = this.#checkUrl(r.link);
          return url === null ? { text: r.text, marks: r.marks } : { ...r, link: url };
        });
        if (b.type === 'heading' && !allowed.includes(b.level ?? 1)) return { ...b, level: allowed.filter((l) => l <= (b.level ?? 1)).pop() ?? allowed[0] ?? 1, runs };
        return { ...b, runs };
      }),
    });
  }

  #serialize(format: RichTextValueFormat): string {
    if (format === 'text' || this.#plain()) return docText(this.#doc);
    if (this.#isEmpty()) return '';
    return format === 'markdown' ? toMarkdown(this.#doc) : toHtml(this.#doc);
  }

  #isEmpty(): boolean {
    return this.#doc.blocks.length === 1 && blockLength(this.#doc.blocks[0] ?? paragraph()) === 0 && this.#doc.blocks[0]?.type === 'paragraph';
  }

  // ---- State and rendering -----------------------------------------------------------------

  #replace(doc: RteDoc): void {
    this.#setDoc(doc, caret({ block: 0, offset: 0 }));
    this.#undo = [];
    this.#redo = [];
    this.#state.customError = null;
    this.#render();
  }

  #setDoc(doc: RteDoc, selection: RteSelection): void {
    this.#doc = doc;
    this.#selection = { anchor: clampPos(doc, selection.anchor), focus: clampPos(doc, selection.focus) };
    this.#view.render(doc);
    if (this.#document.activeElement === this.content) this.#view.writeSelection(this.#selection);
    this.#scheduleToolbar();
  }

  /** Commit an edit: history (typing coalesces), render, events. */
  #apply(edit: RteEdit, kind: string): void {
    if (sameDoc(edit.doc, this.#doc)) {
      this.#selection = edit.selection;
      if (this.#document.activeElement === this.content) this.#view.writeSelection(edit.selection);
      this.#scheduleToolbar();
      return;
    }
    const now = Date.now();
    const coalesce = (kind === 'type' || kind === 'delete') && this.#lastKind === kind && now - this.#lastTime < COALESCE_MS;
    if (!coalesce) {
      this.#undo.push({ doc: this.#doc, selection: this.#selection });
      const limit = this.#config().historyLimit;
      while (this.#undo.length > limit) this.#undo.shift();
    }
    this.#redo = [];
    this.#lastKind = kind;
    this.#lastTime = now;
    this.#setDoc(edit.doc, edit.selection);
    this.#changed();
  }

  #changed(): void {
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#render();
    const detail: RichTextEditorValueDetail = { value: this.value, validity: this.#validity };
    emit(this.host, 'aui-input', detail);
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const content = this.content;
    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    const editable = !(o.disabled ?? false) && !(o.readOnly ?? false);
    content.contentEditable = editable ? 'true' : 'false';
    // Disabled content is not focusable; read-only content stays focusable for reading.
    if (o.disabled) content.removeAttribute('tabindex');
    else content.tabIndex = 0;
    if (o.readOnly) content.setAttribute('aria-readonly', 'true');
    else content.removeAttribute('aria-readonly');
    if (o.disabled) content.setAttribute('aria-disabled', 'true');
    else content.removeAttribute('aria-disabled');
    if (o.required) content.setAttribute('aria-required', 'true');
    else content.removeAttribute('aria-required');
    if (o.placeholder) {
      content.setAttribute('aria-placeholder', o.placeholder);
      content.dataset.placeholder = o.placeholder;
    } else {
      content.removeAttribute('aria-placeholder');
      delete content.dataset.placeholder;
    }
    content.spellcheck = o.spellcheck ?? true;
    content.dir = config.direction === 'rtl' ? 'rtl' : 'auto';
    this.#surface.style.setProperty('--aui-rte-rows', String(o.rows ?? 6));
    if (o.maxRows === undefined) this.#surface.style.removeProperty('--aui-rte-max-rows');
    else this.#surface.style.setProperty('--aui-rte-max-rows', String(o.maxRows));
    this.#toolbar.hidden = this.#plain();
    this.#toolbar.setAttribute('aria-label', this.#msg('toolbar'));
    this.#toolbar.setAttribute('aria-controls', content.id);
    if (o.name) {
      this.#hidden.name = o.name;
      this.#hidden.value = this.value;
    } else {
      this.#hidden.removeAttribute('name');
    }
    this.host.classList.toggle('aui-rte--empty', this.#isEmpty());
    this.host.classList.toggle('aui-rte--plain', this.#plain());

    const text = docText(this.#doc);
    const outcome = checkText(text.trim() === '' ? '' : text, {
      ...(o.required === undefined ? {} : { required: o.required }),
      ...(o.minLength === undefined ? {} : { minLength: o.minLength }),
      ...(o.maxLength === undefined ? {} : { maxLength: o.maxLength }),
    });
    const custom = outcome.error === null ? runValidator(o.validate, this.value) : null;
    this.#validity = resolveValidity(outcome, { locale: config.locale }, custom, this.#state.customError);
    if (o.showCounter && o.maxLength !== undefined) {
      const c = counterText(textLength(text), o.maxLength, config.locale);
      this.#chrome.setCounter(c.text, c.over);
    } else {
      this.#chrome.setCounter(null, false);
    }
    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? 'alert-circle');
    setDescribedBy(content, this.#chrome.describedBy());
    setInvalid(content, show);
    this.host.classList.toggle('aui-rte--invalid', show);
    this.host.classList.toggle('aui-rte--disabled', o.disabled ?? false);
    this.host.classList.toggle('aui-rte--readonly', o.readOnly ?? false);
    this.#scheduleToolbar();
  }

  // ---- Toolbar -----------------------------------------------------------------------------

  #buildToolbar(): void {
    const doc = this.#document;
    this.#buttons = new Map();
    const items = (this.#options.toolbar ?? DEFAULT_TOOLBAR).filter((i) => {
      if (i === 'heading1' || i === 'heading2' || i === 'heading3') return this.#headings().includes(HEADING_LEVELS[i]);
      return true;
    });
    const nodes: HTMLElement[] = [];
    for (const item of items) {
      if (item === '|') {
        const sep = doc.createElement('div');
        sep.className = 'aui-rte__separator';
        sep.setAttribute('role', 'separator');
        sep.setAttribute('aria-orientation', 'vertical');
        nodes.push(sep);
        continue;
      }
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-rte__tool';
      b.dataset.command = item;
      const label = this.#msg(item);
      b.setAttribute('aria-label', label);
      b.title = label;
      b.tabIndex = -1;
      const text = TEXT_ITEMS[item];
      if (text) {
        b.classList.add('aui-rte__tool--text');
        b.textContent = this.#msg(text);
      } else {
        b.append(renderIcon(ICONS[item] ?? 'more-horizontal', { doc }));
      }
      if (item !== 'undo' && item !== 'redo' && item !== 'link' && item !== 'clearFormatting') b.setAttribute('aria-pressed', 'false');
      nodes.push(b);
      this.#buttons.set(item, b);
    }
    const first = nodes.find((n): n is HTMLButtonElement => n instanceof HTMLButtonElement);
    if (first) first.tabIndex = 0;
    this.#toolbar.replaceChildren(...nodes);
    this.#scheduleToolbar();
  }

  #scheduleToolbar(): void {
    const view = this.#document.defaultView;
    if (!view || this.#toolbarFrame) return;
    this.#toolbarFrame = view.requestAnimationFrame(() => {
      this.#toolbarFrame = 0;
      this.#syncToolbar();
    });
  }

  #formatState(): RichTextEditorFormatState {
    const range = toRange(this.#selection);
    const block = this.#doc.blocks[range.start.block] ?? paragraph();
    const style = isCollapsed(range) ? (this.#stored ?? styleAt(block, range.start.offset)) : null;
    const marks = style ? [...style.marks] : (['bold', 'italic', 'underline', 'strike', 'code'] as const).filter((m) => hasMark(this.#doc, range, m));
    const headingKind = { 1: 'heading1', 2: 'heading2', 3: 'heading3' } as const;
    const kind: RichTextEditorFormatState['block'] = block.type === 'heading' ? headingKind[block.level ?? 1] : block.type === 'code' ? 'codeBlock' : block.type === 'list' ? (block.list === 'ordered' ? 'orderedList' : 'bulletList') : block.type === 'quote' ? 'quote' : 'paragraph';
    return { marks, block: kind, align: block.align ?? 'start', link: linkAround(this.#doc, range.start)?.href ?? null, canUndo: this.#undo.length > 0, canRedo: this.#redo.length > 0 };
  }

  #syncToolbar(): void {
    if (this.#toolbar.hidden) return;
    const state = this.#formatState();
    const off = this.#readOnly();
    for (const [item, b] of this.#buttons) {
      let pressed: boolean | null = null;
      const mark = MARK_ITEMS[item];
      const align = ALIGN_ITEMS[item];
      if (mark) pressed = state.marks.includes(mark);
      else if (align) pressed = state.align === align;
      else if (item === 'paragraph' || item === 'heading1' || item === 'heading2' || item === 'heading3' || item === 'quote' || item === 'codeBlock' || item === 'bulletList' || item === 'orderedList') pressed = state.block === item;
      if (pressed !== null) b.setAttribute('aria-pressed', String(pressed));
      if (item === 'link') b.classList.toggle('aui-rte__tool--active', state.link !== null);
      const disabled = off || (item === 'undo' && !state.canUndo) || (item === 'redo' && !state.canRedo) || (state.block === 'codeBlock' && (mark !== undefined || item === 'link'));
      if (disabled) b.setAttribute('aria-disabled', 'true');
      else b.removeAttribute('aria-disabled');
    }
  }

  // ---- Link panel --------------------------------------------------------------------------

  #buildLinkPanel(): void {
    const doc = this.#document;
    const input = this.#linkInput;
    input.type = 'url';
    input.className = 'aui-rte__link-input';
    input.id = createId('aui-rte-link');
    input.spellcheck = false;
    const label = doc.createElement('label');
    label.className = 'aui-rte__link-label';
    label.htmlFor = input.id;
    this.#linkError.className = 'aui-rte__link-error aui-validation-message';
    this.#linkError.id = createId('aui-rte-link-error');
    this.#linkError.hidden = true;
    const button = (cls: string): HTMLButtonElement => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = `aui-rte__link-button ${cls}`;
      return b;
    };
    const apply = button('aui-rte__link-apply');
    const remove = button('aui-rte__link-remove');
    const cancel = button('aui-rte__link-cancel');
    const row = doc.createElement('div');
    row.className = 'aui-rte__link-row';
    row.append(input, apply, remove, cancel);
    this.#linkPanel.append(label, row, this.#linkError);
    const texts = (): void => {
      this.#linkPanel.setAttribute('aria-label', this.#msg('link'));
      label.textContent = this.#msg('linkUrl');
      apply.textContent = this.#msg('linkApply');
      remove.textContent = this.#msg('linkRemove');
      cancel.textContent = this.#msg('linkCancel');
      this.#linkError.textContent = this.#msg('linkInvalid');
    };
    texts();
    this.#group.add(richTextEditorConfig.subscribe(texts));
    apply.addEventListener('click', () => {
      this.#applyLink(input.value);
    });
    remove.addEventListener('click', () => {
      this.#applyLink(null);
    });
    cancel.addEventListener('click', () => {
      this.#closeLink();
    });
    input.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.#applyLink(input.value);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        this.#closeLink();
      }
    });
  }

  #applyLink(href: string | null): void {
    const range = this.#linkRange ?? toRange(this.#selection);
    if (href !== null && href.trim() === '') href = null;
    if (href !== null) {
      const url = this.#checkUrl(href);
      if (url === null) {
        this.#linkError.hidden = false;
        this.#linkInput.setAttribute('aria-invalid', 'true');
        this.#linkInput.setAttribute('aria-describedby', this.#linkError.id);
        this.#linkInput.focus();
        return;
      }
      if (isCollapsed(range)) {
        // No selected text: insert the address itself as the link text.
        const style = styleAt(this.#doc.blocks[range.start.block] ?? paragraph(), range.start.offset);
        this.#apply(insertText(this.#doc, range, url, { marks: style.marks, link: url }), 'format');
      } else {
        this.#apply({ doc: setLink(this.#doc, range, url), selection: { anchor: range.start, focus: range.end } }, 'format');
      }
      announce(this.#msg('linkAdded'));
    } else {
      this.#apply({ doc: setLink(this.#doc, range, null), selection: { anchor: range.start, focus: range.end } }, 'format');
      announce(this.#msg('linkRemoved'));
    }
    this.#closeLink();
  }

  #closeLink(): void {
    this.#linkPanel.hidden = true;
    this.#linkRange = null;
    this.#linkInput.removeAttribute('aria-describedby');
    this.focus();
  }

  // ---- Events ------------------------------------------------------------------------------

  #bindEvents(): void {
    const g = this.#group;
    const content = this.content;
    observePointer(this.#document);
    g.listen(this.#chrome.label, 'click', () => {
      this.focus();
    });
    g.listen(content, 'beforeinput', (e) => {
      this.#onBeforeInput(e);
    });
    g.listen(content, 'input', () => {
      // Only composition (and anything a browser did not announce) changes the DOM directly.
      if (!this.#composing) this.#reconcile();
    });
    g.listen(content, 'compositionstart', () => {
      this.#composing = true;
      // Composition replaces the selection: delete it through the model first.
      if (!isCollapsed(this.#selection)) this.#apply(deleteRange(this.#doc, toRange(this.#selection)), 'delete');
    });
    g.listen(content, 'compositionend', () => {
      this.#composing = false;
      this.#reconcile();
    });
    g.listen(content, 'keydown', (e) => {
      this.#onKeyDown(e);
    });
    g.listen(content, 'paste', (e) => {
      this.#onPaste(e);
    });
    g.listen(content, 'copy', (e) => {
      this.#onCopy(e, false);
    });
    g.listen(content, 'cut', (e) => {
      this.#onCopy(e, true);
    });
    g.listen(content, 'dragstart', (e) => {
      // Moving text by drag inside the editor is not supported (it would bypass the model).
      e.preventDefault();
    });
    g.listen(content, 'drop', (e) => {
      this.#onDrop(e);
    });
    g.listen(content, 'focus', () => {
      this.#focusDoc = this.#doc;
      this.#view.writeSelection(this.#selection);
    });
    g.listen(this.host, 'focusout', (e) => {
      const next = e.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      if (!sameDoc(this.#focusDoc, this.#doc)) {
        this.#focusDoc = this.#doc;
        const detail: RichTextEditorValueDetail = { value: this.value, validity: this.#validity };
        emit(this.host, 'aui-change', detail);
      }
      markTouched(this.#state, this.#document, () => {
        if (!this.#group.disposed) this.#render();
      });
    });
    g.listen(this.#document, 'selectionchange', () => {
      if (this.#composing) return;
      const sel = this.#view.readSelection();
      if (!sel) return;
      if (comparePos(sel.focus, this.#selection.focus) !== 0 || comparePos(sel.anchor, this.#selection.anchor) !== 0) {
        this.#selection = sel;
        this.#stored = null;
        this.#lastKind = null;
      }
      this.#scheduleToolbar();
    });
    // Toolbar: roving focus; mouse presses keep the editor's selection.
    const roving = createRovingTabindex(this.#toolbar, { getItems: () => [...this.#buttons.values()], orientation: 'horizontal', loop: true, direction: this.#config().direction });
    g.add(() => {
      roving.dispose();
    });
    g.listen(this.#toolbar, 'mousedown', (e) => {
      if (e.target instanceof Element && e.target.closest('button')) e.preventDefault();
    });
    g.listen(this.#toolbar, 'click', (e) => {
      const b = e.target instanceof Element ? e.target.closest<HTMLButtonElement>('button[data-command]') : null;
      if (!b || b.getAttribute('aria-disabled') === 'true') return;
      const item = b.dataset.command;
      if (!isCommand(item)) return;
      const fromKeyboard = this.#document.activeElement === b;
      this.command(item);
      if (item !== 'link') {
        if (fromKeyboard) this.focus();
        const mark = MARK_ITEMS[item];
        if (mark) announce(this.#msg(this.#formatState().marks.includes(mark) ? 'markOn' : 'markOff', { mark: this.#msg(item) }));
      }
    });
    g.listen(this.#toolbar, 'keydown', (e) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        this.focus();
      }
    });
  }

  /** Read the DOM selection now: selectionchange is asynchronous and may not have run yet. */
  #syncSelection(): void {
    const sel = this.#view.readSelection();
    if (!sel) return;
    if (comparePos(sel.anchor, this.#selection.anchor) !== 0 || comparePos(sel.focus, this.#selection.focus) !== 0) {
      this.#selection = sel;
      this.#stored = null;
    }
  }

  #onKeyDown(e: KeyboardEvent): void {
    if (e.key === 'Escape') {
      // Escape, then Tab, leaves a list instead of indenting it (no keyboard trap).
      this.#tabExits = true;
      return;
    }
    const exits = this.#tabExits;
    this.#tabExits = false;
    if (e.isComposing) return;
    if (matchesHotkey(e, 'alt+f10')) {
      e.preventDefault();
      const first = this.#toolbar.querySelector<HTMLElement>('button[tabindex="0"]') ?? this.#toolbar.querySelector('button');
      if (!this.#toolbar.hidden) first?.focus();
      return;
    }
    if (matchesHotkey(e, 'mod+z')) {
      e.preventDefault();
      this.undo();
      return;
    }
    if (matchesHotkey(e, 'mod+shift+z') || matchesHotkey(e, 'mod+y')) {
      e.preventDefault();
      this.redo();
      return;
    }
    if (this.#readOnly()) return;
    for (const [hotkey, item] of HOTKEYS) {
      if (matchesShortcut(e, hotkey)) {
        e.preventDefault();
        this.command(item);
        return;
      }
    }
    if (e.key === 'Tab' && !exits && !e.ctrlKey && !e.metaKey && !e.altKey && !this.#plain()) {
      const range = toRange(this.#selection);
      const inList = this.#doc.blocks.slice(range.start.block, range.end.block + 1).every((b) => b.type === 'list');
      if (inList) {
        e.preventDefault();
        this.#indent(e.shiftKey ? -1 : 1);
      }
    }
  }

  #onBeforeInput(e: InputEvent): void {
    if (this.#readOnly()) {
      e.preventDefault();
      return;
    }
    const type = e.inputType;
    // Composition changes the DOM natively (not cancelable); reconciled at compositionend.
    if (type === 'insertCompositionText' || type === 'deleteCompositionText' || type === 'insertFromComposition' || this.#composing) return;
    e.preventDefault();
    const targets = e.getTargetRanges();
    const target = targets[0] ? this.#view.rangeToPositions(targets[0]) : null;
    const selection = this.#view.readSelection() ?? this.#selection;
    this.#selection = selection;
    const range = toRange(selection);
    switch (type) {
      case 'insertText':
      case 'insertReplacementText': {
        const text = e.data ?? e.dataTransfer?.getData('text/plain') ?? '';
        this.#insertPlain(text, 'type', type === 'insertReplacementText' && target ? { start: target.start, end: target.end } : range);
        break;
      }
      case 'insertLineBreak':
        this.#insertPlain('\n', 'insert', range);
        break;
      case 'insertParagraph':
        this.#enter(range);
        break;
      case 'insertFromPaste':
      case 'insertFromDrop':
      case 'insertFromYank':
        this.#insertTransfer(e.dataTransfer, target ?? range);
        break;
      case 'deleteContentBackward':
      case 'deleteContentForward':
      case 'deleteWordBackward':
      case 'deleteWordForward':
      case 'deleteSoftLineBackward':
      case 'deleteSoftLineForward':
      case 'deleteHardLineBackward':
      case 'deleteHardLineForward':
      case 'deleteEntireSoftLine':
        this.#delete(type, range, target);
        break;
      case 'deleteByCut':
      case 'deleteByDrag':
      case 'deleteContent':
        if (!isCollapsed(range)) this.#apply(deleteRange(this.#doc, range), 'delete');
        break;
      case 'historyUndo':
        this.undo();
        break;
      case 'historyRedo':
        this.redo();
        break;
      case 'formatBold':
        this.command('bold');
        break;
      case 'formatItalic':
        this.command('italic');
        break;
      case 'formatUnderline':
        this.command('underline');
        break;
      case 'formatStrikeThrough':
        this.command('strike');
        break;
      case 'insertOrderedList':
        this.command('orderedList');
        break;
      case 'insertUnorderedList':
        this.command('bulletList');
        break;
      case 'formatJustifyLeft':
      case 'formatJustifyRight':
      case 'formatJustifyCenter':
      case 'formatJustifyFull': {
        const map: Readonly<Record<string, Exclude<RichTextToolbarItem, '|'>>> = { formatJustifyCenter: 'alignCenter', formatJustifyFull: 'alignJustify', formatJustifyLeft: this.#config().direction === 'rtl' ? 'alignEnd' : 'alignStart', formatJustifyRight: this.#config().direction === 'rtl' ? 'alignStart' : 'alignEnd' };
        const item = map[type];
        if (item) this.command(item);
        break;
      }
      case 'formatIndent':
        this.#indent(1);
        break;
      case 'formatOutdent':
        this.#indent(-1);
        break;
      case 'formatRemove':
        this.command('clearFormatting');
        break;
      default:
        // Every other mutation (formatFontColor, insertHorizontalRule, ...) is unsupported.
        break;
    }
  }

  /** Insert plain text with the current style; runs Markdown shortcuts. */
  #insertPlain(text: string, kind: string, range: RteRange = toRange(this.#selection)): void {
    if (text === '') return;
    const block = this.#doc.blocks[range.start.block] ?? paragraph();
    const style = this.#stored ?? styleAt(block, range.start.offset);
    const lines = this.#plain() ? text.replace(/\r\n?/g, '\n') : text;
    if (this.#plain() && lines.includes('\n') && kind !== 'insert') {
      // Plain mode: pasted/typed newlines are paragraphs.
      this.#insertBlocksPlain(lines, range);
      return;
    }
    this.#apply(insertText(this.#doc, range, lines, this.#plain() ? { marks: [] } : style), kind);
    if (kind === 'type' && !this.#plain() && this.#config().markdownShortcuts) this.#markdownRules(text);
  }

  #insertBlocksPlain(text: string, range: RteRange): void {
    const blocks = text.split('\n').map((l) => paragraph(l));
    this.#apply(insertBlocks(this.#doc, range, blocks), 'insert');
  }

  /** Markdown shortcuts after typing: block prefixes at the start of a paragraph, inline delimiters. */
  #markdownRules(typed: string): void {
    const pos = this.#selection.focus;
    const block = this.#doc.blocks[pos.block];
    if (!block) return;
    const text = blockText(block);
    const before = text.slice(0, pos.offset);
    if (typed === ' ' && block.type === 'paragraph') {
      const rules: readonly [RegExp, (m: RegExpExecArray) => RteBlock | null][] = [
        [/^(#{1,3}) $/, (m) => {
          const level = (m[1] ?? '#').length as RteHeadingLevel;
          return this.#headings().includes(level) ? asType(block, 'heading', { level }) : null;
        }],
        [/^[-*+] $/, () => asType(block, 'list', { list: 'bullet' })],
        [/^1[.)] $/, () => asType(block, 'list', { list: 'ordered' })],
        [/^> $/, () => asType(block, 'quote')],
      ];
      for (const [re, make] of rules) {
        const m = re.exec(before);
        if (!m) continue;
        const next = make(m);
        if (!next) continue;
        const stripped = { ...next, runs: normalizeRuns(sliceRuns(next.runs, m[0].length, blockLength(next))) };
        const blocks = this.#doc.blocks.slice();
        blocks[pos.block] = stripped;
        // A separate undo step: Ctrl+Z restores the typed characters.
        this.#lastKind = null;
        this.#apply({ doc: { blocks }, selection: caret({ block: pos.block, offset: pos.offset - m[0].length }) }, 'shortcut');
        this.#lastKind = null;
        return;
      }
    }
    if (block.type === 'code') return;
    // Closing delimiter just typed: "**text**", "__text__", "*text*", "_text_", "~~text~~", `code`.
    const inline: readonly [RegExp, RteMark][] = [
      [/(\*\*|__)(?=[^\s*_])([^*_]*[^\s*_])\1$/, 'bold'],
      [/(?<![*\w])(\*)(?=[^*\s])([^*]*[^*\s])\*$/, 'italic'],
      [/(?<![_\w])(_)(?=[^_\s])([^_]*[^_\s])_$/, 'italic'],
      [/(~~)(?=[^\s~])([^~]*[^\s~])~~$/, 'strike'],
      [/(`)([^`]+)`$/, 'code'],
    ];
    for (const [re, mark] of inline) {
      const m = re.exec(before);
      const delimiter = m?.[1];
      const inner = m?.[2];
      if (!m || delimiter === undefined || inner === undefined) continue;
      const startOffset = m.index;
      const d = delimiter.length;
      const range: RteRange = { start: { block: pos.block, offset: startOffset }, end: pos };
      // Replace the delimited text with the same runs carrying the mark (other marks kept).
      const pieces = sliceRuns(block.runs, startOffset + d, pos.offset - d);
      const cleared = deleteRange(this.#doc, range);
      const withText = insertBlocks(cleared.doc, { start: range.start, end: range.start }, [{ type: 'paragraph', runs: pieces }]);
      const end = { block: pos.block, offset: startOffset + inner.length };
      const marked = setMark(withText.doc, { start: range.start, end }, mark, true);
      this.#lastKind = null;
      this.#apply({ doc: marked, selection: caret(end) }, 'shortcut');
      this.#lastKind = null;
      // Typing continues without the mark.
      this.#stored = { marks: styleAt(marked.blocks[pos.block] ?? paragraph(), startOffset).marks.filter((x) => x !== mark) };
      return;
    }
  }

  #enter(range: RteRange): void {
    let doc = this.#doc;
    let pos = range.start;
    if (!isCollapsed(range)) {
      const cleared = deleteRange(doc, range);
      doc = cleared.doc;
      pos = cleared.selection.focus;
    }
    const block = doc.blocks[pos.block];
    if (!block) return;
    const text = blockText(block);
    if (this.#plain()) {
      this.#apply(splitBlock(doc, pos, () => ({ type: 'paragraph' })), 'insert');
      return;
    }
    if (block.type === 'code') {
      // Enter on an empty last line leaves the code block.
      if (pos.offset === text.length && text.endsWith('\n')) {
        const trimmed = { ...block, runs: normalizeRuns(sliceRuns(block.runs, 0, text.length - 1)) };
        const blocks = doc.blocks.slice();
        blocks.splice(pos.block, 1, trimmed, paragraph());
        this.#apply({ doc: { blocks }, selection: caret({ block: pos.block + 1, offset: 0 }) }, 'insert');
        return;
      }
      this.#apply(insertText(doc, { start: pos, end: pos }, '\n', { marks: [] }), 'insert');
      return;
    }
    if (this.#config().markdownShortcuts && block.type === 'paragraph' && /^```[\w-]*$/.test(text)) {
      const blocks = doc.blocks.slice();
      blocks[pos.block] = { type: 'code', runs: [] };
      this.#apply({ doc: { blocks }, selection: caret({ block: pos.block, offset: 0 }) }, 'shortcut');
      return;
    }
    if (text === '' && (block.type === 'list' || block.type === 'quote')) {
      // Enter on an empty item leaves the list (outdenting first) or the quote.
      const next = block.type === 'list' && (block.depth ?? 0) > 0 ? { ...block, depth: (block.depth ?? 0) - 1 } : asType(block, 'paragraph');
      const blocks = doc.blocks.slice();
      blocks[pos.block] = next;
      this.#apply({ doc: { blocks }, selection: caret(pos) }, 'format');
      return;
    }
    const atEnd = pos.offset === text.length;
    this.#stored = null;
    this.#apply(splitBlock(doc, pos, (b) => {
      if (b.type === 'heading' && atEnd) return b.align ? { type: 'paragraph', align: b.align } : { type: 'paragraph' };
      return blockAttrs(b);
    }), 'insert');
  }

  #delete(type: string, range: RteRange, target: RteRange | null): void {
    if (!isCollapsed(range)) {
      this.#apply(deleteRange(this.#doc, range), 'delete');
      return;
    }
    const pos = range.start;
    const block = this.#doc.blocks[pos.block];
    if (!block) return;
    const backward = type.endsWith('Backward');
    const text = blockText(block);
    if (backward && pos.offset === 0) {
      if (block.type === 'list') {
        const next = (block.depth ?? 0) > 0 ? { ...block, depth: (block.depth ?? 0) - 1 } : asType(block, 'paragraph');
        this.#apply({ doc: withBlockAt(this.#doc, pos.block, next), selection: caret(pos) }, 'format');
        return;
      }
      if (block.type === 'heading' || block.type === 'quote' || (block.type === 'code' && text === '')) {
        this.#apply({ doc: withBlockAt(this.#doc, pos.block, asType(block, 'paragraph')), selection: caret(pos) }, 'format');
        return;
      }
      if (pos.block > 0) this.#apply(mergeWithPrevious(this.#doc, pos.block), 'delete');
      return;
    }
    if (!backward && pos.offset === text.length) {
      if (pos.block < this.#doc.blocks.length - 1) this.#apply(mergeWithPrevious(this.#doc, pos.block + 1), 'delete');
      return;
    }
    // Prefer the browser's target range (grapheme and word boundaries it computed), within the block.
    let del: RteRange;
    if (target && !isCollapsed(target) && target.start.block === pos.block && target.end.block === pos.block) {
      del = target;
    } else {
      const locale = this.#config().locale;
      let other: number;
      if (type.includes('Word')) other = wordBoundary(text, pos.offset, backward ? -1 : 1, locale);
      else if (type.includes('Line')) other = backward ? 0 : text.length;
      else other = graphemeBoundary(text, pos.offset, backward ? -1 : 1, locale);
      del = backward ? { start: { block: pos.block, offset: other }, end: pos } : { start: pos, end: { block: pos.block, offset: other } };
    }
    this.#apply(deleteRange(this.#doc, del), 'delete');
  }

  #toggleMark(mark: RteMark): void {
    const range = toRange(this.#selection);
    const block = this.#doc.blocks[range.start.block];
    if (block?.type === 'code') return;
    if (isCollapsed(range)) {
      // No selection: the mark applies to the next typed text.
      const style = this.#stored ?? styleAt(block ?? paragraph(), range.start.offset);
      const on = !style.marks.includes(mark);
      this.#stored = { ...style, marks: on ? [...style.marks, mark] : style.marks.filter((m) => m !== mark) };
      this.#scheduleToolbar();
      return;
    }
    this.#apply({ doc: setMark(this.#doc, range, mark, !hasMark(this.#doc, range, mark)), selection: this.#selection }, 'format');
  }

  #setBlock(fn: (b: RteBlock) => RteBlock, item: RichTextToolbarItem): void {
    const range = toRange(this.#selection);
    this.#apply({ doc: mapBlocks(this.#doc, range, fn), selection: this.#selection }, 'format');
    announce(this.#msg('blockChanged', { block: this.#msg(this.#formatState().block === item ? item : 'paragraph') }));
  }

  #toggleList(kind: RteListType): void {
    const range = toRange(this.#selection);
    const blocks = this.#doc.blocks.slice(range.start.block, range.end.block + 1);
    const all = blocks.every((b) => b.type === 'list' && b.list === kind);
    this.#setBlock((b) => (all ? asType(b, 'paragraph') : b.type === 'list' ? { ...b, list: kind } : asType(b, 'list', { list: kind })), kind === 'bullet' ? 'bulletList' : 'orderedList');
  }

  #indent(step: 1 | -1): void {
    const range = toRange(this.#selection);
    this.#apply({
      doc: mapBlocks(this.#doc, range, (b) => (b.type === 'list' ? { ...b, depth: Math.max(0, Math.min(MAX_DEPTH, (b.depth ?? 0) + step)) } : b)),
      selection: this.#selection,
    }, 'format');
  }

  #insertTransfer(data: DataTransfer | null, range: RteRange): void {
    if (!data) return;
    const html = data.getData('text/html');
    const text = data.getData('text/plain');
    if (this.#plain() || html === '') {
      if (text === '') return;
      if (text.includes('\n')) this.#insertBlocksPlain(text.replace(/\r\n?/g, '\n'), range);
      else this.#insertPlain(text, 'insert', range);
      return;
    }
    const fragment = this.#filter({ blocks: fromDom(sanitizeHtml(html, RTE_SANITIZE_POLICY, this.#document), this.#headings()) }).blocks;
    if (fragment.length === 0) return;
    // Pasting into a code block keeps plain text only.
    const into = this.#doc.blocks[range.start.block];
    if (into?.type === 'code') {
      this.#apply(insertText(this.#doc, range, fragment.map(blockText).join('\n'), { marks: [] }), 'insert');
      return;
    }
    this.#apply(insertBlocks(this.#doc, range, fragment), 'insert');
  }

  #onPaste(e: ClipboardEvent): void {
    e.preventDefault();
    if (this.#readOnly()) return;
    const selection = this.#view.readSelection() ?? this.#selection;
    this.#selection = selection;
    this.#insertTransfer(e.clipboardData, toRange(selection));
  }

  #onDrop(e: DragEvent): void {
    e.preventDefault();
    if (this.#readOnly()) return;
    const pos = this.#view.posFromPoint(e.clientX, e.clientY) ?? this.#selection.focus;
    this.#insertTransfer(e.dataTransfer, { start: pos, end: pos });
    this.content.focus();
  }

  #onCopy(e: ClipboardEvent, cut: boolean): void {
    const range = toRange(this.#view.readSelection() ?? this.#selection);
    if (isCollapsed(range) || !e.clipboardData) return;
    e.preventDefault();
    const fragment = this.#fragment(range);
    e.clipboardData.setData('text/plain', docText(fragment));
    if (!this.#plain()) e.clipboardData.setData('text/html', toHtml(fragment));
    if (cut && !this.#readOnly()) this.#apply(deleteRange(this.#doc, range), 'delete');
  }

  /** The selected content as a standalone document. */
  #fragment(range: RteRange): RteDoc {
    const blocks: RteBlock[] = [];
    for (let i = range.start.block; i <= range.end.block; i++) {
      const b = this.#doc.blocks[i];
      if (!b) continue;
      const from = i === range.start.block ? range.start.offset : 0;
      const to = i === range.end.block ? range.end.offset : blockLength(b);
      blocks.push({ ...b, runs: normalizeRuns(b.type === 'code' ? sliceRuns(b.runs, from, to) : sliceRuns(b.runs, from, to)) });
    }
    return normalizeDoc({ blocks });
  }

  /** Bring the model in line with DOM text the browser changed itself (IME composition). */
  #reconcile(): void {
    const sel = this.#view.readSelection() ?? this.#selection;
    const index = sel.focus.block;
    const domText = this.#view.domText(index);
    const block = this.#doc.blocks[index];
    if (domText === null || !block) {
      // The structure changed beyond one block: re-render from the model.
      this.#setDoc(this.#doc, this.#selection);
      return;
    }
    const modelText = blockText(block);
    if (domText === modelText) return;
    let start = 0;
    while (start < domText.length && start < modelText.length && domText[start] === modelText[start]) start++;
    let endDom = domText.length;
    let endModel = modelText.length;
    while (endDom > start && endModel > start && domText[endDom - 1] === modelText[endModel - 1]) {
      endDom--;
      endModel--;
    }
    const inserted = domText.slice(start, endDom);
    const range: RteRange = { start: { block: index, offset: start }, end: { block: index, offset: endModel } };
    const style = this.#stored ?? styleAt(block, start);
    const edit = insertText(this.#doc, range, inserted, style);
    this.#apply({ doc: edit.doc, selection: caret({ block: index, offset: start + inserted.length }) }, 'type');
  }
}

function withAlign(block: RteBlock, align: RteAlign): RteBlock {
  if (align === 'start') {
    const attrs = blockAttrs(block);
    return {
      type: attrs.type,
      ...(attrs.level === undefined ? {} : { level: attrs.level }),
      ...(attrs.list === undefined ? {} : { list: attrs.list }),
      ...(attrs.depth === undefined ? {} : { depth: attrs.depth }),
      runs: block.runs,
    };
  }
  return { ...block, align };
}

function withBlockAt(doc: RteDoc, index: number, block: RteBlock): RteDoc {
  const blocks = doc.blocks.slice();
  blocks[index] = block;
  return { blocks };
}

function matchesShortcut(e: KeyboardEvent, hotkey: string): boolean {
  if (matchesHotkey(e, hotkey)) return true;
  // Shifted digits report their symbol as the key ("&" for Shift+7 on US layouts): match by code.
  const digit = /\+(\d)$/.exec(hotkey);
  return digit !== null && e.code === `Digit${digit[1] ?? ''}` && matchesHotkey(e, hotkey.replace(/\d$/, e.key.toLowerCase()));
}

const COMMANDS = new Set<string>(DEFAULT_TOOLBAR.filter((i) => i !== '|'));

function isCommand(value: string | undefined): value is Exclude<RichTextToolbarItem, '|'> {
  return value !== undefined && COMMANDS.has(value);
}

const HEADING_LEVELS: Readonly<Record<'heading1' | 'heading2' | 'heading3', RteHeadingLevel>> = { heading1: 1, heading2: 2, heading3: 3 };
