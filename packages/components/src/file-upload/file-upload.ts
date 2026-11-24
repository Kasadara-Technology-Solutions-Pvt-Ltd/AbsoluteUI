/**
 * File Upload (SPEC section 18.16): a file picker built on a native <input type="file">,
 * opened by a real button, plus an optional drag-and-drop zone around it (never
 * the only way to choose files). Selected files are validated against size,
 * total size, count, MIME type, and extension rules; files that break a rule are
 * not added and the reason is shown and announced. It is a `FormControl`; it never
 * reads file contents and never performs network requests.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce } from '@absoluteui/utilities';
import { EXTENSION_RE, fileKey, formatFileSize, matchesExtension, matchesMimeType, MIME_RE } from '../internal/files.js';
import { FieldChrome, FieldState, markTouched, observePointer, registerControl, setDescribedBy, setText, validationTimingSpec, type ControlValidity, type FormControl, type ValidationTiming } from '../internal/field.js';

export interface FileUploadConfig {
  validationTiming: ValidationTiming;
  /** Render the drag-and-drop zone around the button. */
  dropZone: boolean;
  /** Render a hint that lists the configured type, size, and count limits. */
  showConstraints: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    fileUpload: FileUploadConfig & { locale: string };
  }
}

export const fileUploadConfig = defineComponentConfig<FileUploadConfig, 'locale'>(
  'fileUpload',
  {
    validationTiming: validationTimingSpec,
    dropZone: { default: true, expected: 'boolean', validate: validators.isBoolean },
    showConstraints: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('fileUpload', 'en', {
  chooseFile: 'Choose file',
  chooseFiles: 'Choose files',
  dropPrompt: 'Drag a file here or',
  dropPromptMultiple: 'Drag files here or',
  required: 'Required',
  selectedFiles: 'Selected files',
  remove: 'Remove {name}',
  removed: '{name} removed',
  hintTypes: 'Allowed file types: {types}.',
  hintSize: 'Maximum {size} per file.',
  hintTotal: 'Maximum {size} in total.',
  hintCount: 'Up to {count} files.',
  valueMissing: 'Select a file.',
  valueMissingMultiple: 'Select at least one file.',
  fileTooLargeInvalid: 'Each file must be {max} or smaller.',
  fileTypeInvalid: 'Remove files of a type that is not allowed.',
  tooManyFilesInvalid: 'Select {max} files or fewer.',
  totalTooLargeInvalid: 'The files must be {max} or smaller in total.',
  rejectedTooLarge: 'The file is larger than {max}.',
  rejectedType: 'This file type is not allowed.',
  rejectedTooMany: 'You can select up to {max} files.',
  rejectedTooManyOne: 'You can select only 1 file.',
  rejectedTotal: 'The files would exceed {max} in total.',
  rejectedFolder: 'Folders cannot be added.',
  rejectedItem: '{name}: {reason}',
  rejectedOne: '{name} was not added. {reason}',
  rejectedMany: '{count} files were not added.',
});

export type FileUploadErrorCode = 'value-missing' | 'file-too-large' | 'file-type' | 'too-many-files' | 'total-too-large' | 'custom';
export type FileRejectionReason = 'file-too-large' | 'file-type' | 'too-many-files' | 'total-too-large' | 'folder';

export interface FileUploadValidity extends ControlValidity {
  readonly valid: boolean;
  readonly error: FileUploadErrorCode | null;
  readonly message: string;
}

export interface FileRejection {
  readonly file: File;
  readonly reason: FileRejectionReason;
  /** Localized reason, without the file name. */
  readonly message: string;
}

export interface FileUploadIcons {
  upload: IconRef;
  file: IconRef;
  remove: IconRef;
  error: IconRef;
}

export interface FileUploadOptions extends Partial<FileUploadConfig> {
  /** Visible label (required accessible name). */
  label: string;
  hideLabel?: boolean;
  /** Help text, referenced by aria-describedby (text only). */
  description?: string;
  /** Form field name; also set on the native input so native form submission includes the files. */
  name?: string;
  /** Allow several files. Default false (a new selection replaces the file). */
  multiple?: boolean;
  /** Initial files; `reset()` restores them. Default none. */
  value?: readonly File[];
  required?: boolean;
  disabled?: boolean;
  /** Accepted MIME types, e.g. `image/png` or `image/*`. Checked on every file (the `accept` attribute is only a hint). */
  acceptTypes?: readonly string[];
  /** Accepted extensions including the dot, e.g. `.pdf`. When both lists are set, a file must match both. */
  acceptExtensions?: readonly string[];
  /** Maximum size of each file in bytes. */
  maxFileSize?: number;
  /** Maximum combined size in bytes. */
  maxTotalSize?: number;
  /** Maximum number of files (multiple only). */
  maxFiles?: number;
  /** Button text. Default: localized "Choose file" / "Choose files". */
  buttonText?: string;
  /** Consumer validation over the selected files; return a message to mark the value invalid. */
  validate?: (files: readonly File[]) => string | null;
  locale?: string;
  icons?: Partial<FileUploadIcons>;
}

export interface FileUploadChangeDetail {
  /** All selected files, in selection order. */
  files: readonly File[];
  /** Files added by this change. */
  added: readonly File[];
  /** Files removed by this change. */
  removed: readonly File[];
  validity: FileUploadValidity;
}

export interface FileUploadRejectDetail {
  rejected: readonly FileRejection[];
}

const VALID: FileUploadValidity = Object.freeze({ valid: true, error: null, message: '' });
const DEFAULT_ICONS: FileUploadIcons = { upload: 'upload', file: 'file', remove: 'close', error: 'alert-circle' };
/** 2^53 - 1 bytes: any real file size. */
const isByteCount = (v: unknown): boolean => typeof v === 'number' && Number.isSafeInteger(v) && v > 0;

interface Row {
  readonly file: File;
  readonly item: HTMLLIElement;
  readonly remove: HTMLButtonElement;
  readonly issue: HTMLSpanElement;
}

export class FileUpload implements FormControl {
  readonly host: HTMLElement;
  /** The native file input (visually hidden; the button opens it). */
  readonly input: HTMLInputElement;
  /** The button that opens the file chooser. */
  readonly button: HTMLButtonElement;
  #options: FileUploadOptions;
  #files: File[];
  #initial: readonly File[];
  #rejections: FileRejection[] = [];
  #validity: FileUploadValidity = VALID;
  #rows: Row[] = [];
  #dragDepth = 0;
  readonly #doc: Document;
  readonly #chrome: FieldChrome;
  readonly #zone: HTMLDivElement;
  readonly #zoneIcon: HTMLSpanElement;
  readonly #prompt: HTMLSpanElement;
  readonly #buttonText: HTMLSpanElement;
  readonly #requiredHint: HTMLSpanElement;
  readonly #hint: HTMLDivElement;
  readonly #rejectBox: HTMLDivElement;
  readonly #rejectList: HTMLUListElement;
  readonly #list: HTMLUListElement;
  readonly #state = new FieldState();
  readonly #group = new DisposableGroup();

  /** Render a file upload field into an empty host element (the host's children are replaced). */
  static create(host: HTMLElement, options: FileUploadOptions): FileUpload {
    return new FileUpload(host, options);
  }

  private constructor(host: HTMLElement, options: FileUploadOptions) {
    FileUpload.#assert(options);
    this.host = host;
    this.#doc = host.ownerDocument;
    this.#options = { ...options };
    this.#initial = [...(options.value ?? [])];
    this.#files = [...this.#initial];
    const doc = this.#doc;

    this.#chrome = new FieldChrome(doc, 'label', 'aui-file-upload');
    this.#zone = doc.createElement('div');
    this.#zone.className = 'aui-file-upload__zone';
    this.#zoneIcon = doc.createElement('span');
    this.#zoneIcon.className = 'aui-file-upload__zone-icon';
    this.#prompt = doc.createElement('span');
    this.#prompt.className = 'aui-file-upload__prompt';
    this.#prompt.id = createId('aui-file-upload-prompt');

    this.button = doc.createElement('button');
    this.button.type = 'button';
    this.button.id = createId('aui-file-upload-button');
    this.button.className = 'aui-file-upload__button';
    this.#buttonText = doc.createElement('span');
    this.#buttonText.id = createId('aui-file-upload-button-text');
    this.button.append(this.#buttonText);
    // Name: "<label> <button text>". A button cannot carry aria-required, so the
    // required state is a visually hidden description instead.
    this.button.setAttribute('aria-labelledby', `${this.#chrome.label.id} ${this.#buttonText.id}`);
    (this.#chrome.label as HTMLLabelElement).htmlFor = this.button.id;
    this.#requiredHint = doc.createElement('span');
    this.#requiredHint.className = 'aui-visually-hidden';
    this.#requiredHint.id = createId('aui-file-upload-required');

    this.input = doc.createElement('input');
    this.input.type = 'file';
    this.input.className = 'aui-file-upload__input';
    this.input.hidden = true;
    this.input.tabIndex = -1;

    this.#hint = doc.createElement('div');
    this.#hint.className = 'aui-file-upload__hint';
    this.#hint.id = createId('aui-file-upload-hint');
    this.#zone.append(this.#zoneIcon, this.#prompt, this.button, this.#hint, this.#requiredHint, this.input);

    this.#rejectBox = doc.createElement('div');
    this.#rejectBox.className = 'aui-file-upload__rejections';
    this.#rejectBox.id = createId('aui-file-upload-rejections');
    this.#rejectBox.hidden = true;
    this.#rejectList = doc.createElement('ul');
    this.#rejectList.className = 'aui-file-upload__rejection-list';
    this.#rejectBox.append(this.#rejectList);

    this.#list = doc.createElement('ul');
    this.#list.className = 'aui-file-upload__list';

    host.classList.add('aui-field', 'aui-file-upload');
    host.replaceChildren(this.#chrome.label, this.#chrome.description, this.#zone, this.#chrome.error, this.#rejectBox, this.#list);

    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#render();
    this.#syncInput();
    this.#bindEvents();
    this.#group.add(registerControl(this));
    this.#group.add(fileUploadConfig.subscribe(() => {
      this.#render();
    }));
  }

  /** Selected files, in selection order. */
  get value(): readonly File[] {
    return this.#files;
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

  get validity(): FileUploadValidity {
    return this.#validity;
  }

  /** Files not added by the most recent selection, with reasons. Cleared by the next selection. */
  get rejections(): readonly FileRejection[] {
    return this.#rejections;
  }

  get dirty(): boolean {
    const a = this.#files;
    const b = this.#initial;
    return a.length !== b.length || a.some((f, i) => f !== b[i]);
  }

  get touched(): boolean {
    return this.#state.touched;
  }

  get options(): Readonly<FileUploadOptions> {
    return this.#options;
  }

  /** A copy of the selected files (`File[]`). Append them to a `FormData` to upload. */
  getFormValue(): File[] {
    return [...this.#files];
  }

  /** Replace the selection programmatically (no events). Files are not filtered; rule violations make the value invalid. */
  setValue(files: readonly File[]): void {
    FileUpload.#assertFiles(files);
    this.#files = [...files];
    this.#rejections = [];
    this.#state.customError = null;
    this.#syncInput();
    this.#render();
  }

  /** Remove one selected file (no events). */
  removeFile(file: File): void {
    const next = this.#files.filter((f) => f !== file);
    if (next.length !== this.#files.length) this.setValue(next);
  }

  update(options: Partial<FileUploadOptions>): void {
    const next = { ...this.#options, ...options };
    FileUpload.#assert(next);
    this.#options = next;
    if ('value' in options) {
      this.#initial = [...(options.value ?? [])];
      this.#files = [...this.#initial];
      this.#syncInput();
    }
    this.#render();
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

  /** Open the native file chooser (requires user activation in most browsers). */
  openPicker(): void {
    if (!this.disabled) this.input.click();
  }

  focus(): void {
    this.button.focus();
  }

  reset(): void {
    this.#files = [...this.#initial];
    this.#rejections = [];
    this.#state.reset();
    this.#syncInput();
    this.#render();
  }

  destroy(): void {
    this.#group.dispose();
    this.host.replaceChildren();
    this.host.classList.remove('aui-field', 'aui-file-upload', 'aui-file-upload--invalid', 'aui-file-upload--disabled', 'aui-file-upload--dragover', 'aui-file-upload--no-zone');
  }

  static #assert(o: FileUploadOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('FILE_UPLOAD_OPTIONS', 'Invalid file upload options.', { component: 'fileUpload', property: `fileUpload.${property}`, expected });
    };
    if (typeof o.label !== 'string' || o.label.trim() === '') fail('label', 'non-empty string (accessible name)');
    if (o.acceptTypes !== undefined && (!Array.isArray(o.acceptTypes) || o.acceptTypes.some((t) => typeof t !== 'string' || !MIME_RE.test(t)))) fail('acceptTypes', 'array of MIME types ("type/subtype" or "type/*")');
    if (o.acceptExtensions !== undefined && (!Array.isArray(o.acceptExtensions) || o.acceptExtensions.some((e) => typeof e !== 'string' || !EXTENSION_RE.test(e)))) fail('acceptExtensions', 'array of extensions starting with "." (e.g. ".pdf")');
    if (o.maxFileSize !== undefined && !isByteCount(o.maxFileSize)) fail('maxFileSize', 'positive integer (bytes)');
    if (o.maxTotalSize !== undefined && !isByteCount(o.maxTotalSize)) fail('maxTotalSize', 'positive integer (bytes)');
    if (o.maxFiles !== undefined && !validators.integerInRange(1, 10_000)(o.maxFiles)) fail('maxFiles', 'integer 1..10000');
    if (o.maxFiles !== undefined && !o.multiple) fail('maxFiles', 'multiple: true (a single-file upload holds one file)');
    if (o.validate !== undefined && typeof o.validate !== 'function') fail('validate', '(files: readonly File[]) => string | null');
    if (o.buttonText !== undefined && (typeof o.buttonText !== 'string' || o.buttonText.trim() === '')) fail('buttonText', 'non-empty string');
    if (o.value !== undefined) FileUpload.#assertFiles(o.value);
  }

  static #assertFiles(files: readonly File[]): void {
    if (!Array.isArray(files) || files.some((f) => !(f instanceof File))) {
      throw configurationError('FILE_UPLOAD_OPTIONS', 'Invalid file upload options.', { component: 'fileUpload', property: 'fileUpload.value', expected: 'array of File objects' });
    }
  }

  #config(): Readonly<FileUploadConfig & { locale: string }> {
    const o = this.#options;
    return fileUploadConfig.resolve({
      ...(o.validationTiming === undefined ? {} : { validationTiming: o.validationTiming }),
      ...(o.dropZone === undefined ? {} : { dropZone: o.dropZone }),
      ...(o.showConstraints === undefined ? {} : { showConstraints: o.showConstraints }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #bindEvents(): void {
    const g = this.#group;
    observePointer(this.#doc);
    g.listen(this.button, 'click', () => {
      this.openPicker();
    });
    g.listen(this.input, 'change', () => {
      const picked = Array.from(this.input.files ?? []);
      // The input mirrors the selection; a cancelled chooser (empty list) keeps it.
      if (picked.length > 0) this.#addFiles(picked, []);
      else this.#syncInput();
    });
    g.listen(this.host, 'focusout', (event) => {
      const next = event.relatedTarget;
      if (next instanceof Node && this.host.contains(next)) return;
      markTouched(this.#state, this.#doc, () => {
        if (!this.#group.disposed) this.#render();
      });
    });

    const zone = this.#zone;
    const hasFiles = (e: DragEvent): boolean => e.dataTransfer?.types.includes('Files') ?? false;
    const active = (): boolean => this.#config().dropZone && !this.disabled;
    g.listen(zone, 'dragenter', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      if (!active()) return;
      this.#dragDepth++;
      this.host.classList.add('aui-file-upload--dragover');
    });
    g.listen(zone, 'dragover', (e) => {
      if (!hasFiles(e)) return;
      // Always prevent the default so a drop never navigates the page to the file.
      e.preventDefault();
      if (e.dataTransfer) e.dataTransfer.dropEffect = active() ? 'copy' : 'none';
    });
    g.listen(zone, 'dragleave', () => {
      this.#dragDepth = Math.max(0, this.#dragDepth - 1);
      if (this.#dragDepth === 0) this.host.classList.remove('aui-file-upload--dragover');
    });
    g.listen(zone, 'drop', (e) => {
      if (!hasFiles(e)) return;
      e.preventDefault();
      this.#dragDepth = 0;
      this.host.classList.remove('aui-file-upload--dragover');
      if (!active() || !e.dataTransfer) return;
      const files: File[] = [];
      const folders: File[] = [];
      const items = Array.from(e.dataTransfer.items);
      Array.from(e.dataTransfer.files).forEach((file, i) => {
        // Dropped folders arrive as File objects that cannot be read.
        const item = items[i];
        const entry = item?.kind === 'file' ? item.webkitGetAsEntry() : null;
        (entry?.isDirectory ? folders : files).push(file);
      });
      this.#addFiles(files, folders);
      this.button.focus({ preventScroll: true });
    });
  }

  /** Per-file rule check (type and size). */
  #fileIssue(file: File): 'file-type' | 'file-too-large' | null {
    const o = this.#options;
    const types = o.acceptTypes ?? [];
    const extensions = o.acceptExtensions ?? [];
    if (types.length > 0 && !matchesMimeType(file.type, types)) return 'file-type';
    if (extensions.length > 0 && !matchesExtension(file.name, extensions)) return 'file-type';
    if (o.maxFileSize !== undefined && file.size > o.maxFileSize) return 'file-too-large';
    return null;
  }

  #addFiles(picked: readonly File[], folders: readonly File[]): void {
    const o = this.#options;
    const locale = this.#config().locale;
    const size = (n: number): string => formatFileSize(n, locale);
    const reject = (file: File, reason: FileRejectionReason): FileRejection => {
      const m = (key: string, params: Record<string, string> = {}): string => getMessage('fileUpload', key, params, locale);
      const message =
        reason === 'file-type' ? m('rejectedType')
        : reason === 'file-too-large' ? m('rejectedTooLarge', { max: size(o.maxFileSize ?? 0) })
        : reason === 'total-too-large' ? m('rejectedTotal', { max: size(o.maxTotalSize ?? 0) })
        : reason === 'folder' ? m('rejectedFolder')
        : o.multiple ? m('rejectedTooMany', { max: formatNumber(o.maxFiles ?? 1, {}, locale) }) : m('rejectedTooManyOne');
      return Object.freeze({ file, reason, message });
    };
    const rejected: FileRejection[] = folders.map((f) => reject(f, 'folder'));
    const previous = this.#files;
    // Single mode: a new selection replaces the file; extra dropped files are rejected.
    let next: File[] = o.multiple ? [...previous] : [];
    const seen = new Set(next.map(fileKey));
    let total = next.reduce((sum, f) => sum + f.size, 0);
    const max = o.multiple ? (o.maxFiles ?? Number.POSITIVE_INFINITY) : 1;
    for (const file of picked) {
      const key = fileKey(file);
      if (seen.has(key)) continue;
      const issue = this.#fileIssue(file);
      if (issue) rejected.push(reject(file, issue));
      else if (next.length >= max) rejected.push(reject(file, 'too-many-files'));
      else if (o.maxTotalSize !== undefined && total + file.size > o.maxTotalSize) rejected.push(reject(file, 'total-too-large'));
      else {
        next.push(file);
        seen.add(key);
        total += file.size;
      }
    }
    if (!o.multiple && next.length === 0) next = [...previous];
    const added = next.filter((f) => !previous.includes(f));
    const removed = previous.filter((f) => !next.includes(f));
    this.#files = next;
    this.#rejections = rejected;
    this.#state.dirty = true;
    this.#state.touched = true;
    this.#state.customError = null;
    this.#syncInput();
    this.#render();
    if (rejected.length > 0) {
      const first = rejected[0];
      const text = rejected.length === 1 && first
        ? getMessage('fileUpload', 'rejectedOne', { name: first.file.name, reason: first.message }, locale)
        : getMessage('fileUpload', 'rejectedMany', { count: formatNumber(rejected.length, {}, locale) }, locale);
      announce(text, 'polite', this.#doc);
      emit(this.host, 'aui-reject', { rejected } satisfies FileUploadRejectDetail);
    }
    if (added.length > 0 || removed.length > 0) this.#emitChange(added, removed);
  }

  #removeByUser(file: File, index: number): void {
    const locale = this.#config().locale;
    this.#files = this.#files.filter((f) => f !== file);
    this.#rejections = [];
    this.#state.dirty = true;
    this.#state.customError = null;
    this.#syncInput();
    this.#render();
    // Focus the next remove button, else the previous one, else the chooser button.
    const target = this.#rows[index] ?? this.#rows[index - 1];
    (target ? target.remove : this.button).focus();
    announce(getMessage('fileUpload', 'removed', { name: file.name }, locale), 'polite', this.#doc);
    this.#emitChange([], [file]);
  }

  #emitChange(added: readonly File[], removed: readonly File[]): void {
    emit(this.host, 'aui-change', { files: [...this.#files], added, removed, validity: this.#validity } satisfies FileUploadChangeDetail);
  }

  /** Mirror the selection into the native input so native form submission sends exactly these files. */
  #syncInput(): void {
    try {
      const dt = new DataTransfer();
      for (const f of this.#files) dt.items.add(f);
      this.input.files = dt.files;
    } catch {
      // Browsers without a DataTransfer constructor keep their own selection; getFormValue() stays authoritative.
    }
  }

  #computeValidity(locale: string): FileUploadValidity {
    const o = this.#options;
    const files = this.#files;
    const m = (key: string, params: Record<string, string> = {}): string => getMessage('fileUpload', key, params, locale);
    const invalid = (error: FileUploadErrorCode, message: string): FileUploadValidity => Object.freeze({ valid: false, error, message });
    if (files.length === 0) {
      if (o.required) return invalid('value-missing', m(o.multiple ? 'valueMissingMultiple' : 'valueMissing'));
    } else {
      const issues = files.map((f) => this.#fileIssue(f));
      if (issues.includes('file-type')) return invalid('file-type', m('fileTypeInvalid'));
      if (issues.includes('file-too-large')) return invalid('file-too-large', m('fileTooLargeInvalid', { max: formatFileSize(o.maxFileSize ?? 0, locale) }));
      const max = o.multiple ? o.maxFiles : 1;
      if (max !== undefined && files.length > max) return invalid('too-many-files', m('tooManyFilesInvalid', { max: formatNumber(max, {}, locale) }));
      if (o.maxTotalSize !== undefined && files.reduce((s, f) => s + f.size, 0) > o.maxTotalSize) return invalid('total-too-large', m('totalTooLargeInvalid', { max: formatFileSize(o.maxTotalSize, locale) }));
    }
    let custom: string | null = null;
    if (o.validate) {
      const result = o.validate(files);
      custom = typeof result === 'string' && result !== '' ? result : null;
    }
    const message = custom ?? this.#state.customError;
    return message ? invalid('custom', message) : VALID;
  }

  #hintText(locale: string): string {
    const o = this.#options;
    const m = (key: string, params: Record<string, string>): string => getMessage('fileUpload', key, params, locale);
    const parts: string[] = [];
    const types = [...(o.acceptExtensions ?? []), ...(o.acceptExtensions?.length ? [] : (o.acceptTypes ?? []))];
    if (types.length > 0) parts.push(m('hintTypes', { types: new Intl.ListFormat(locale, { type: 'conjunction', style: 'narrow' }).format(types) }));
    if (o.maxFileSize !== undefined) parts.push(m('hintSize', { size: formatFileSize(o.maxFileSize, locale) }));
    if (o.maxTotalSize !== undefined && o.multiple) parts.push(m('hintTotal', { size: formatFileSize(o.maxTotalSize, locale) }));
    if (o.maxFiles !== undefined) parts.push(m('hintCount', { count: formatNumber(o.maxFiles, {}, locale) }));
    return parts.join(' ');
  }

  #renderRejections(): void {
    const locale = this.#config().locale;
    const doc = this.#doc;
    this.#rejectList.replaceChildren(
      ...this.#rejections.map((r) => {
        const li = doc.createElement('li');
        li.append(
          renderIcon(this.#options.icons?.error ?? DEFAULT_ICONS.error, { className: 'aui-file-upload__rejection-icon', doc }),
          doc.createTextNode(getMessage('fileUpload', 'rejectedItem', { name: r.file.name, reason: r.message }, locale)),
        );
        return li;
      }),
    );
    this.#rejectBox.hidden = this.#rejections.length === 0;
  }

  #renderList(locale: string): void {
    const o = this.#options;
    const doc = this.#doc;
    // Rows are rebuilt only when the selection changed; renders on every validation pass stay cheap.
    const same = this.#rows.length === this.#files.length && this.#rows.every((r, i) => r.file === this.#files[i]);
    if (!same) {
      this.#rows = this.#files.map((file, index) => {
        const item = doc.createElement('li');
        item.className = 'aui-file-upload__item';
        const icon = renderIcon(o.icons?.file ?? DEFAULT_ICONS.file, { className: 'aui-file-upload__file-icon', doc });
        const body = doc.createElement('span');
        body.className = 'aui-file-upload__file';
        const name = doc.createElement('span');
        name.className = 'aui-file-upload__name';
        name.textContent = file.name;
        const meta = doc.createElement('span');
        meta.className = 'aui-file-upload__size';
        meta.textContent = formatFileSize(file.size, locale);
        const issue = doc.createElement('span');
        issue.className = 'aui-file-upload__issue';
        body.append(name, meta, issue);
        const remove = doc.createElement('button');
        remove.type = 'button';
        remove.className = 'aui-file-upload__remove';
        remove.append(renderIcon(o.icons?.remove ?? DEFAULT_ICONS.remove, { doc }));
        remove.addEventListener('click', () => {
          this.#removeByUser(file, index);
        });
        item.append(icon, body, remove);
        return { file, item, remove, issue };
      });
      this.#list.replaceChildren(...this.#rows.map((r) => r.item));
    }
    this.#list.hidden = this.#rows.length === 0;
    this.#list.setAttribute('aria-label', getMessage('fileUpload', 'selectedFiles', {}, locale));
    const m = (key: string, params: Record<string, string> = {}): string => getMessage('fileUpload', key, params, locale);
    for (const r of this.#rows) {
      r.remove.disabled = this.disabled;
      r.remove.setAttribute('aria-label', m('remove', { name: r.file.name }));
      const issue = this.#fileIssue(r.file);
      setText(r.issue, issue === 'file-type' ? m('rejectedType') : issue === 'file-too-large' ? m('rejectedTooLarge', { max: formatFileSize(o.maxFileSize ?? 0, locale) }) : '');
      r.issue.hidden = issue === null;
      r.item.classList.toggle('aui-file-upload__item--invalid', issue !== null);
    }
  }

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const locale = config.locale;
    const m = (key: string): string => getMessage('fileUpload', key, {}, locale);

    this.#chrome.render({ label: o.label, hideLabel: o.hideLabel, required: o.required, description: o.description });
    this.host.classList.toggle('aui-file-upload--no-zone', !config.dropZone);
    this.#zoneIcon.replaceChildren(renderIcon(o.icons?.upload ?? DEFAULT_ICONS.upload, { doc: this.#doc }));
    this.#zoneIcon.hidden = !config.dropZone;
    setText(this.#prompt, config.dropZone ? m(o.multiple ? 'dropPromptMultiple' : 'dropPrompt') : '');
    this.#prompt.hidden = !config.dropZone;
    setText(this.#buttonText, o.buttonText ?? m(o.multiple ? 'chooseFiles' : 'chooseFile'));
    setText(this.#requiredHint, o.required ? m('required') : '');
    const hint = config.showConstraints ? this.#hintText(locale) : '';
    setText(this.#hint, hint);
    this.#hint.hidden = hint === '';

    const input = this.input;
    input.multiple = o.multiple ?? false;
    input.disabled = o.disabled ?? false;
    const accept = [...(o.acceptTypes ?? []), ...(o.acceptExtensions ?? [])].join(',');
    if (accept) input.accept = accept;
    else input.removeAttribute('accept');
    if (o.name) input.name = o.name;
    else input.removeAttribute('name');
    this.button.disabled = o.disabled ?? false;

    this.#validity = this.#computeValidity(locale);
    this.#renderList(locale);
    this.#renderRejections();

    const show = !this.#validity.valid && this.#state.shouldShow(config.validationTiming);
    this.#chrome.setError(show ? this.#validity.message : '', o.icons?.error ?? DEFAULT_ICONS.error);
    const ids = [
      ...(this.#chrome.description.hidden ? [] : [this.#chrome.description.id]),
      ...(hint === '' ? [] : [this.#hint.id]),
      ...(o.required ? [this.#requiredHint.id] : []),
      ...(this.#chrome.error.hidden ? [] : [this.#chrome.error.id]),
      ...(this.#rejectBox.hidden ? [] : [this.#rejectBox.id]),
    ];
    setDescribedBy(this.button, ids);
    this.host.classList.toggle('aui-file-upload--invalid', show);
    this.host.classList.toggle('aui-file-upload--disabled', o.disabled ?? false);
  }
}
