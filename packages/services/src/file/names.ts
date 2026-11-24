/** File-name and size helpers. */
import { formatBytes, type FormatBytesOptions } from '@absoluteui/helpers/number';

// Compound extensions kept together by splitFileName/getExtension.
const COMPOUND = new Set(['tar.gz', 'tar.bz2', 'tar.xz', 'tar.zst', 'tar.br', 'tar.lz', 'tar.lzma', 'tar.z']);

/** A file name split into base and extension. */
export interface FileNameParts {
  readonly base: string;
  /** Extension without the leading dot, case preserved; `''` when none. */
  readonly extension: string;
}

const baseName = (name: string): string => name.slice(Math.max(name.lastIndexOf('/'), name.lastIndexOf('\\')) + 1);

/**
 * Splits a name into base and extension, keeping compound extensions (`tar.gz`) together.
 * Dotfiles (`.env`) have no extension. Directory parts are dropped.
 * @example
 * splitFileName('archive.tar.gz'); // => { base: 'archive', extension: 'tar.gz' }
 * splitFileName('.env'); // => { base: '.env', extension: '' }
 */
export function splitFileName(name: string): FileNameParts {
  const file = baseName(name);
  const last = file.lastIndexOf('.');
  if (last <= 0 || last === file.length - 1) return { base: file, extension: '' };
  const prev = file.lastIndexOf('.', last - 1);
  if (prev > 0 && COMPOUND.has(file.slice(prev + 1).toLowerCase())) return { base: file.slice(0, prev), extension: file.slice(prev + 1) };
  return { base: file.slice(0, last), extension: file.slice(last + 1) };
}

/**
 * Lowercase extension without the dot (`tar.gz` kept together); `undefined` when none.
 * @example
 * getExtension('Photo.JPG'); // => 'jpg'
 * getExtension('backup.TAR.GZ'); // => 'tar.gz'
 */
export function getExtension(name: string): string | undefined {
  const { extension } = splitFileName(name);
  return extension === '' ? undefined : extension.toLowerCase();
}

/**
 * Replaces (or removes, with `''`) the extension.
 * @example
 * withExtension('report.csv', 'xlsx'); // => 'report.xlsx'
 * withExtension('archive.tar.gz', '.zip'); // => 'archive.zip'
 */
export function withExtension(name: string, extension: string): string {
  const { base } = splitFileName(name);
  const ext = extension.startsWith('.') ? extension.slice(1) : extension;
  return ext === '' ? base : `${base}.${ext}`;
}

/**
 * Human-readable file size via `formatBytes`; use `style: 'long'` for screen readers.
 * @example
 * formatFileSize(2_400_000); // => '2.4 MB'
 * formatFileSize(2_400_000, { style: 'long' }); // => '2.4 megabytes'
 */
export function formatFileSize(bytes: number, options: FormatBytesOptions = {}): string {
  return formatBytes(bytes, options);
}
