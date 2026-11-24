/**
 * Link destination guard shared by Link and Card. Only http(s) URLs and relative
 * references are accepted. Parsing uses the WHATWG URL parser, the same one the
 * browser uses to follow the link, so tricks such as `java\tscript:` or leading
 * control characters are normalized before the scheme is checked.
 */
const BASE = 'https://absoluteui.invalid/';
const MAX_LENGTH = 8192;

export function isSafeHref(value: unknown): value is string {
  if (typeof value !== 'string' || value.trim() === '' || value.length > MAX_LENGTH) return false;
  let url: URL;
  try {
    url = new URL(value, BASE);
  } catch {
    return false;
  }
  return url.protocol === 'http:' || url.protocol === 'https:';
}
