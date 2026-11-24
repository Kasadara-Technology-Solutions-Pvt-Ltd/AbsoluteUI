/**
 * Image URL policy of the Image Viewer (R20 P10). Accepted: https:, blob:, raster data:image
 * URLs (png, jpeg, gif, webp, avif, bmp; never svg+xml, which can carry script), and URLs
 * on the document's own origin (relative URLs, or http: on a local development origin).
 * Everything else (javascript:, file:, cross-origin http:, svg data URLs) is rejected.
 */

const RASTER_DATA = /^data:image\/(?:png|jpeg|jpg|gif|webp|avif|bmp)(?:;[a-z0-9=._+-]+)*(?:;base64)?,/i;

/** The origin of a document, or null when it has none (about:blank, server rendering). */
function originOf(doc: Document): string | null {
  const origin = doc.defaultView?.location.origin;
  return origin === undefined || origin === 'null' ? null : origin;
}

/** True when `src` may be shown by the Image Viewer (see the module comment). */
export function isSafeImageUrl(src: string, doc: Document): boolean {
  const value = src.trim();
  if (value === '') return false;
  if (/^data:/i.test(value)) return RASTER_DATA.test(value);
  let url: URL | null;
  try {
    url = new URL(value, doc.baseURI);
  } catch {
    url = null;
  }
  if (url !== null) {
    if (url.protocol === 'https:' || url.protocol === 'blob:') return true;
    const origin = originOf(doc);
    return url.protocol === 'http:' && origin !== null && url.origin === origin;
  }
  // A base that cannot resolve relative URLs: accept a URL without a scheme of its own.
  try {
    return new URL(value, 'https://base.invalid/').origin === 'https://base.invalid';
  } catch {
    return false;
  }
}
