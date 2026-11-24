/** URL policy for navigation components (SPEC section 14.5): only http(s) and scheme-less URLs render. */

const SAFE_PROTOCOLS = new Set(['http:', 'https:']);

/**
 * True for http(s) URLs and scheme-less (relative, path-absolute, fragment, query)
 * URLs. Parsing uses the URL standard, so obfuscations such as "java\tscript:" and
 * leading whitespace are normalized before the scheme is checked.
 */
export function isSafeHref(href: string, baseURI: string): boolean {
  let protocol: string | null;
  try {
    protocol = new URL(href, baseURI).protocol;
  } catch {
    // A base that cannot resolve relative URLs (about:blank documents, server rendering).
    protocol = null;
  }
  if (protocol !== null && SAFE_PROTOCOLS.has(protocol)) return true;
  try {
    // A non-http base (for example file: or about:blank) makes relative URLs inherit its scheme or
    // fail: accept the href when it has no scheme of its own, i.e. it follows two different bases.
    return new URL(href, 'http://base.invalid/').protocol === 'http:' && new URL(href, 'https://base.invalid/').protocol === 'https:';
  } catch {
    return false;
  }
}

/** A plain primary-button click; modified clicks (new tab/window, download) stay native. */
export function isPlainClick(event: MouseEvent): boolean {
  return event.button === 0 && !event.ctrlKey && !event.metaKey && !event.shiftKey && !event.altKey;
}
