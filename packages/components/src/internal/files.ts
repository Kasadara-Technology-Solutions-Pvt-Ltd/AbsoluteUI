/**
 * Shared file helpers for File Upload and Upload Queue (SPEC section 18.16).
 * Internal: not a public subpath export.
 */
import { formatNumber } from '@absoluteui/core';

const UNITS = [
  { unit: 'gigabyte', size: 1e9 },
  { unit: 'megabyte', size: 1e6 },
  { unit: 'kilobyte', size: 1e3 },
] as const;

/**
 * Localized file size with decimal (SI) units, as Intl formats them:
 * 1 kB = 1,000 bytes. At most one fraction digit above 1 kB.
 */
export function formatFileSize(bytes: number, locale: string): string {
  for (const { unit, size } of UNITS) {
    if (bytes >= size) return formatNumber(bytes / size, { style: 'unit', unit, unitDisplay: 'short', maximumFractionDigits: 1 }, locale);
  }
  return formatNumber(bytes, { style: 'unit', unit: 'byte', unitDisplay: 'short' }, locale);
}

/** Lower-cased extension including the dot (`.pdf`), or '' when the name has none. */
export function fileExtension(name: string): string {
  const dot = name.lastIndexOf('.');
  return dot > 0 && dot < name.length - 1 ? name.slice(dot).toLowerCase() : '';
}

/** `type/subtype` or `type/*` (RFC 6838 token characters). */
export const MIME_RE = /^[a-z0-9][a-z0-9!#$&^_.+-]*\/(?:\*|[a-z0-9][a-z0-9!#$&^_.+-]*)$/i;
/** `.ext`: a dot followed by one or more characters that are not dots, slashes, or whitespace. */
export const EXTENSION_RE = /^\.[^./\\\s]+$/;

/** Whether a MIME type matches one of the accepted MIME types (`type/*` wildcards allowed). */
export function matchesMimeType(type: string, accepted: readonly string[]): boolean {
  const t = type.toLowerCase();
  if (t === '') return false;
  return accepted.some((a) => {
    const x = a.toLowerCase();
    return x.endsWith('/*') ? t.startsWith(x.slice(0, -1)) : t === x;
  });
}

/** Whether a file name ends with one of the accepted extensions (case-insensitive). */
export function matchesExtension(name: string, accepted: readonly string[]): boolean {
  const ext = fileExtension(name);
  return ext !== '' && accepted.some((a) => a.toLowerCase() === ext);
}

/** Identity used to ignore the same file selected twice (name, size, and modification time). */
export function fileKey(file: File): string {
  return `${file.name}\u0000${String(file.size)}\u0000${String(file.lastModified)}`;
}
