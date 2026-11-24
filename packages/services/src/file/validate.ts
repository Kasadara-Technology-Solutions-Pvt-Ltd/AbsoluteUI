/** File validation against `accept`, sizes, counts, active content and image dimensions. */
import { formatBytes, type LocaleInput } from '@absoluteui/helpers/number';
import { detectFileType, type DetectedFileType } from './detect.js';
import { getImageDimensions } from './image.js';
import { splitFileName } from './names.js';

/** Stable codes for file validation errors. */
export type FileErrorCode =
  | 'SVC_FILE_TYPE_NOT_ALLOWED'
  | 'SVC_FILE_TYPE_MISMATCH'
  | 'SVC_FILE_ACTIVE_CONTENT'
  | 'SVC_FILE_EMPTY'
  | 'SVC_FILE_TOO_LARGE'
  | 'SVC_FILE_TOO_SMALL'
  | 'SVC_FILE_TOTAL_TOO_LARGE'
  | 'SVC_FILE_TOO_MANY'
  | 'SVC_FILE_IMAGE_TOO_SMALL'
  | 'SVC_FILE_IMAGE_TOO_LARGE'
  | 'SVC_FILE_IMAGE_UNREADABLE';

/** Values available to messages (limits are pre-formatted for the locale, sizes in the long style). */
export type FileMessageParams = Readonly<Record<string, string | number>>;

/**
 * Returns a message for a code, or `undefined` to use the English default. Messages never
 * include the file name; the UI prefixes it ("photo.png: The file is larger than 10 megabytes.").
 */
export type FileMessageCatalog = (code: FileErrorCode, params: FileMessageParams) => string | undefined;

export interface FileValidationError {
  readonly code: FileErrorCode;
  readonly message: string;
  readonly params: FileMessageParams;
}

export interface FileRejection<F extends File = File> {
  readonly file: F;
  readonly errors: readonly FileValidationError[];
}

export interface FileValidationResult<F extends File = File> {
  readonly accepted: F[];
  readonly rejected: FileRejection<F>[];
}

export interface ImageDimensionLimits {
  readonly minWidth?: number;
  readonly maxWidth?: number;
  readonly minHeight?: number;
  readonly maxHeight?: number;
}

export interface ValidateFilesOptions {
  /**
   * Same syntax as `<input accept>`: `'image/*,.pdf'`. Checked against the declared type or
   * extension AND the magic-byte type; a disagreement is `SVC_FILE_TYPE_MISMATCH`.
   */
  readonly accept?: string | readonly string[];
  readonly maxFileSize?: number;
  readonly minFileSize?: number;
  /** Files are accepted in order until the total would exceed this. */
  readonly maxTotalSize?: number;
  /** Files beyond this count (among otherwise valid files) are rejected. */
  readonly maxFiles?: number;
  /** Allow 0-byte files. Default false. */
  readonly allowEmpty?: boolean;
  /** Reject SVG, HTML and executables (detected or declared). Default false. */
  readonly rejectActiveContent?: boolean;
  /** Checked for raster images only. */
  readonly imageDimensions?: ImageDimensionLimits;
  /** Sniff magic bytes. Default true. */
  readonly detectType?: boolean;
  /** Locale for formatted sizes and numbers in messages. */
  readonly locale?: LocaleInput;
  readonly messages?: FileMessageCatalog;
}

const DEFAULT_MESSAGES: Record<FileErrorCode, (p: FileMessageParams) => string> = {
  SVC_FILE_TYPE_NOT_ALLOWED: (p) => `This file type is not allowed. Allowed types: ${p.accept}.`,
  SVC_FILE_TYPE_MISMATCH: (p) => `The file content does not match its type. Allowed types: ${p.accept}.`,
  SVC_FILE_ACTIVE_CONTENT: () => 'Files that can run code (such as SVG, HTML or programs) are not allowed.',
  SVC_FILE_EMPTY: () => 'The file is empty.',
  SVC_FILE_TOO_LARGE: (p) => `The file is larger than ${p.limitText}.`,
  SVC_FILE_TOO_SMALL: (p) => `The file is smaller than ${p.limitText}.`,
  SVC_FILE_TOTAL_TOO_LARGE: (p) => `Adding this file would exceed the total limit of ${p.limitText}.`,
  SVC_FILE_TOO_MANY: (p) => (p.limit === 1 ? 'Too many files. Select 1 file.' : `Too many files. Select up to ${p.limitText} files.`),
  SVC_FILE_IMAGE_TOO_SMALL: (p) => `The image must be at least ${p.minWidth} x ${p.minHeight} pixels.`,
  SVC_FILE_IMAGE_TOO_LARGE: (p) => `The image must be at most ${p.maxWidth} x ${p.maxHeight} pixels.`,
  SVC_FILE_IMAGE_UNREADABLE: () => 'The image could not be read.',
};

/**
 * English default message for a file error code (for building catalogs or custom flows).
 * @example
 * defaultFileMessage('SVC_FILE_TOO_LARGE', { limitText: '10 megabytes' }); // => 'The file is larger than 10 megabytes.'
 */
export function defaultFileMessage(code: FileErrorCode, params: FileMessageParams): string {
  return DEFAULT_MESSAGES[code](params);
}

interface AcceptRule {
  readonly extensions: readonly string[];
  readonly mimes: readonly string[];
  readonly wildcards: readonly string[];
  readonly text: string;
}

function parseAccept(accept: string | readonly string[]): AcceptRule {
  const tokens = (typeof accept === 'string' ? accept.split(',') : accept).map((s) => s.trim().toLowerCase()).filter((s) => s !== '' && s.length <= 128);
  const extensions: string[] = [];
  const mimes: string[] = [];
  const wildcards: string[] = [];
  for (const tok of tokens) {
    if (tok.startsWith('.')) extensions.push(tok.slice(1));
    else if (tok.endsWith('/*')) wildcards.push(tok.slice(0, -1));
    else if (tok.includes('/')) mimes.push(tok);
  }
  return { extensions, mimes, wildcards, text: tokens.join(', ') };
}

// Extension aliases for matching accept tokens against detected types.
const ALIASES: Readonly<Record<string, readonly string[]>> = {
  jpg: ['jpg', 'jpeg', 'jpe', 'jfif'],
  tif: ['tif', 'tiff'],
  html: ['html', 'htm', 'xhtml'],
  mp4: ['mp4', 'm4v'],
  gz: ['gz', 'tgz', 'tar.gz'],
  heic: ['heic', 'heif'],
  heif: ['heif', 'heic'],
  txt: ['txt', 'text', 'log', 'md'],
};
const aliases = (ext: string): readonly string[] => ALIASES[ext] ?? [ext];

// ZIP containers: a detected plain ZIP is consistent with these declared extensions.
const ZIP_CONTAINERS = new Set(['zip', 'docx', 'xlsx', 'pptx', 'docm', 'xlsm', 'pptm', 'odt', 'ods', 'odp', 'epub', 'jar', 'apk', 'vsix', 'xpi', 'kmz']);
// Extensions whose content always has magic bytes: no detection means the content is not that type.
const MAGIC_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'heic', 'heif', 'bmp', 'ico', 'tif', 'tiff', 'pdf', 'zip', 'docx', 'xlsx', 'pptx', 'gz', '7z', 'rar', 'mp3', 'mp4', 'mov', 'webm', 'mkv', 'wav', 'ogg', 'flac', 'woff', 'woff2', 'ttf', 'otf', 'exe', 'dll', 'wasm', 'sqlite']);
const ACTIVE_EXTENSIONS = new Set(['svg', 'svgz', 'html', 'htm', 'xhtml', 'xht', 'shtml', 'mht', 'mhtml', 'hta', 'js', 'mjs', 'exe', 'dll', 'msi', 'bat', 'cmd', 'com', 'scr', 'ps1', 'vbs', 'jar', 'app', 'sh', 'elf', 'wasm']);
const ACTIVE_MIMES = new Set(['image/svg+xml', 'text/html', 'application/xhtml+xml', 'text/javascript', 'application/javascript', 'application/x-msdownload', 'application/vnd.microsoft.portable-executable', 'application/wasm']);
const RASTER = new Set(['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/avif', 'image/bmp', 'image/x-icon', 'image/tiff', 'image/heic', 'image/heif']);

function mimeMatches(rule: AcceptRule, mime: string): boolean {
  const m = mime.split(';')[0]?.trim().toLowerCase() ?? '';
  return m !== '' && (rule.mimes.includes(m) || rule.wildcards.some((w) => m.startsWith(w)));
}

function declaredMatches(rule: AcceptRule, file: File): boolean {
  const name = file.name.toLowerCase();
  if (rule.extensions.some((e) => name.endsWith(`.${e}`))) return true;
  return mimeMatches(rule, file.type);
}

function detectedMatches(rule: AcceptRule, d: DetectedFileType, declaredExt: string): boolean {
  if (mimeMatches(rule, d.mime)) return true;
  if (aliases(d.extension).some((e) => rule.extensions.includes(e))) return true;
  // A generic ZIP detection is consistent with an accepted ZIP-container extension (docx scan may miss).
  return d.extension === 'zip' && ZIP_CONTAINERS.has(declaredExt) && rule.extensions.includes(declaredExt);
}

const RASTER_EXTENSIONS = new Set(['png', 'jpg', 'jpeg', 'gif', 'webp', 'avif', 'bmp', 'ico', 'tif', 'tiff', 'heic', 'heif']);

/**
 * Declared extension agrees with the detected type. Raster images mislabelled as another raster
 * format (a PNG saved as .jpg) are tolerated; anything else (an SVG or executable named .png) is not.
 */
function consistent(d: DetectedFileType, declaredExt: string): boolean {
  if (!MAGIC_EXTENSIONS.has(declaredExt) && !RASTER_EXTENSIONS.has(declaredExt)) return !d.active || ACTIVE_EXTENSIONS.has(declaredExt);
  if (aliases(d.extension).includes(declaredExt)) return true;
  if (RASTER_EXTENSIONS.has(declaredExt) && RASTER.has(d.mime)) return true;
  return d.extension === 'zip' && ZIP_CONTAINERS.has(declaredExt);
}

/**
 * Validates files for upload: type (declared and magic bytes), sizes, count, total size, active
 * content and image dimensions. Messages are actionable, never contain the file name, and use
 * long size units ("10 megabytes") so screen readers read them correctly.
 * @example
 * const files = [
 *   new File([Uint8Array.of(0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x2e, 0x37)], 'contract.pdf', { type: 'application/pdf' }),
 *   new File(['name,email'], 'employees.csv', { type: 'text/csv' }),
 * ];
 * const { accepted, rejected } = await validateFiles(files, { accept: 'image/*,.pdf', maxFileSize: 10_000_000, maxFiles: 5 });
 * accepted.map((f) => f.name); // => ['contract.pdf']
 * rejected.map((r) => r.file.name); // => ['employees.csv']
 * const summary = rejected.map((r) => `${r.file.name}: ${r.errors.map((e) => e.message).join(' ')}`);
 */
export async function validateFiles<F extends File>(files: Iterable<F> | ArrayLike<F>, options: ValidateFilesOptions = {}): Promise<FileValidationResult<F>> {
  const { maxFileSize, minFileSize, maxTotalSize, maxFiles, allowEmpty = false, rejectActiveContent = false, imageDimensions, detectType = true, locale, messages } = options;
  const list = Array.from(files as Iterable<F>);
  const rule = options.accept === undefined ? undefined : parseAccept(options.accept);
  const size = (n: number): string => formatBytes(n, { locale, style: 'long' });
  const count = (n: number): string => new Intl.NumberFormat(locale).format(n);
  const error = (code: FileErrorCode, params: FileMessageParams = {}): FileValidationError => ({ code, params, message: messages?.(code, params) ?? DEFAULT_MESSAGES[code](params) });

  const accepted: F[] = [];
  const rejected: FileRejection<F>[] = [];
  let total = 0;
  for (const file of list) {
    const errors: FileValidationError[] = [];
    const declaredExt = splitFileName(file.name).extension.toLowerCase();
    const lastExt = declaredExt.slice(declaredExt.lastIndexOf('.') + 1);
    if (file.size === 0 && !allowEmpty) errors.push(error('SVC_FILE_EMPTY'));
    if (maxFileSize !== undefined && file.size > maxFileSize) errors.push(error('SVC_FILE_TOO_LARGE', { limit: maxFileSize, limitText: size(maxFileSize) }));
    if (minFileSize !== undefined && file.size < minFileSize && file.size > 0) errors.push(error('SVC_FILE_TOO_SMALL', { limit: minFileSize, limitText: size(minFileSize) }));
    const detected = detectType && file.size > 0 ? await detectFileType(file) : undefined;
    const strong = detected?.confidence === 'high' ? detected : undefined;
    if (rule) {
      const params = { accept: rule.text };
      if (!declaredMatches(rule, file)) errors.push(error('SVC_FILE_TYPE_NOT_ALLOWED', params));
      else if (detectType && file.size > 0) {
        const mismatch = strong ? !detectedMatches(rule, strong, lastExt) || !consistent(strong, lastExt) : MAGIC_EXTENSIONS.has(lastExt);
        if (mismatch) errors.push(error('SVC_FILE_TYPE_MISMATCH', params));
      }
    }
    if (rejectActiveContent) {
      const declaredActive = ACTIVE_EXTENSIONS.has(lastExt) || ACTIVE_MIMES.has(file.type.split(';')[0]?.trim().toLowerCase() ?? '');
      if (declaredActive || detected?.active === true) errors.push(error('SVC_FILE_ACTIVE_CONTENT'));
    }
    if (errors.length === 0 && imageDimensions && strong && RASTER.has(strong.mime)) {
      try {
        const { width, height } = await getImageDimensions(file);
        const { minWidth = 0, minHeight = 0, maxWidth = Infinity, maxHeight = Infinity } = imageDimensions;
        if (width < minWidth || height < minHeight) errors.push(error('SVC_FILE_IMAGE_TOO_SMALL', { width, height, minWidth: count(minWidth), minHeight: count(minHeight) }));
        if (width > maxWidth || height > maxHeight) errors.push(error('SVC_FILE_IMAGE_TOO_LARGE', { width, height, maxWidth: count(maxWidth), maxHeight: count(maxHeight) }));
      } catch {
        errors.push(error('SVC_FILE_IMAGE_UNREADABLE'));
      }
    }
    if (errors.length === 0 && maxFiles !== undefined && accepted.length >= maxFiles) errors.push(error('SVC_FILE_TOO_MANY', { limit: maxFiles, limitText: count(maxFiles) }));
    if (errors.length === 0 && maxTotalSize !== undefined && total + file.size > maxTotalSize) errors.push(error('SVC_FILE_TOTAL_TOO_LARGE', { limit: maxTotalSize, limitText: size(maxTotalSize) }));
    if (errors.length === 0) {
      accepted.push(file);
      total += file.size;
    } else {
      rejected.push({ file, errors });
    }
  }
  return { accepted, rejected };
}
