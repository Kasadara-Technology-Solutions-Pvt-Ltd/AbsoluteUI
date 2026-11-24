/**
 * HTML sanitization engine (SPEC section 14.5).
 *
 * 1. Plain text by default: components only call this when HTML is explicitly opted in.
 * 2. Input is parsed in an inert DOMParser document (no scripts run, no resources load).
 * 3. Output is rebuilt node-by-node from an allowlist; input nodes are never adopted.
 * 4. Dangerous elements/attributes/URL schemes are denied.
 * 5. Trusted Types compatible: the only HTML sink used is the inert parse,
 *    routed through the private "absoluteui" policy.
 *
 * R0 limitations (documented per section 2.4): `style` attributes cannot be allowlisted;
 * the native Sanitizer API is not used until it is available across the
 * published browser matrix.
 */
import { validationError } from '../errors.js';

export interface SanitizePolicy {
  /** Allowed elements mapped to their allowed attributes. Replaces the default map when provided. */
  readonly elements?: Readonly<Record<string, readonly string[]>>;
  /** Attributes allowed on every allowed element. */
  readonly globalAttributes?: readonly string[];
  /** Allowed URL schemes for URL attributes, without the trailing colon. */
  readonly urlSchemes?: readonly string[];
  /** Allow scheme-less (relative) URLs. Default: true. */
  readonly allowRelativeUrls?: boolean;
  /** Maximum accepted input length in characters. Default: 1,000,000. */
  readonly maxLength?: number;
}

const HTML_NS = 'http://www.w3.org/1999/xhtml';

export const defaultSanitizePolicy = Object.freeze({
  elements: Object.freeze({
    p: [], br: [], hr: [], strong: [], b: [], em: [], i: [], u: [], s: [], sub: [], sup: [], mark: [], small: [], span: [],
    h1: [], h2: [], h3: [], h4: [], h5: [], h6: [],
    ul: [], ol: [], li: [], blockquote: ['cite'], pre: [], code: [],
    a: ['href', 'title'],
  }),
  globalAttributes: Object.freeze(['lang', 'dir']),
  urlSchemes: Object.freeze(['http', 'https', 'mailto']),
  allowRelativeUrls: true,
  maxLength: 1_000_000,
} satisfies Required<SanitizePolicy>);

/** Never allowed, even when a consumer allowlists them. Content is dropped. */
const FORBIDDEN_ELEMENTS = new Set([
  'script', 'style', 'template', 'iframe', 'frame', 'frameset', 'object', 'embed', 'applet', 'base', 'link', 'meta',
  'noscript', 'noembed', 'noframes', 'param', 'svg', 'math', 'xmp', 'plaintext', 'listing',
]);

/** Not allowlisted by default and dropped with their content (rather than unwrapped). */
const DROP_WITH_CONTENT = new Set(['title', 'textarea', 'select', 'option', 'form', 'button', 'input', 'img', 'video', 'audio', 'source', 'track', 'canvas', 'picture', 'dialog', 'portal', 'head']);

const FORBIDDEN_ATTRIBUTES = new Set(['style', 'srcdoc', 'formaction', 'action', 'xmlns', 'is']);
const URL_ATTRIBUTES = new Set(['href', 'src', 'cite', 'poster', 'background', 'longdesc', 'usemap', 'data']);
const MAX_DEPTH = 256;

interface TrustedTypePolicyLike {
  createHTML(input: string): unknown;
}
interface TrustedTypesLike {
  createPolicy(name: string, rules: { createHTML: (input: string) => string }): TrustedTypePolicyLike;
}

let parsePolicy: TrustedTypePolicyLike | null | undefined;

/**
 * Private Trusted Types policy used ONLY to parse untrusted input into an inert
 * document that is then rebuilt from the allowlist. Never exported.
 */
function toParsable(html: string): string {
  if (parsePolicy === undefined) {
    const tt = (globalThis as { trustedTypes?: TrustedTypesLike }).trustedTypes;
    parsePolicy = tt ? tt.createPolicy('absoluteui', { createHTML: (input) => input }) : null;
  }
  // TrustedHTML is accepted wherever a string is by DOMParser; the cast bridges lib.dom typing.
  return parsePolicy ? (parsePolicy.createHTML(html) as string) : html;
}

function resolvePolicy(policy: SanitizePolicy | undefined): Required<SanitizePolicy> {
  return {
    elements: policy?.elements ?? defaultSanitizePolicy.elements,
    globalAttributes: policy?.globalAttributes ?? defaultSanitizePolicy.globalAttributes,
    urlSchemes: (policy?.urlSchemes ?? defaultSanitizePolicy.urlSchemes).map((s) => s.toLowerCase()),
    allowRelativeUrls: policy?.allowRelativeUrls ?? defaultSanitizePolicy.allowRelativeUrls,
    maxLength: policy?.maxLength ?? defaultSanitizePolicy.maxLength,
  };
}

/** Mirrors WHATWG URL preprocessing: strips tab/newline anywhere and C0/space at the ends. */
function isSafeUrl(value: string, schemes: readonly string[], allowRelative: boolean): boolean {
  // eslint-disable-next-line no-control-regex -- intentional C0 control handling
  const cleaned = value.replace(/[\t\n\r]/g, '').replace(/^[\u0000- ]+|[\u0000- ]+$/g, '');
  const scheme = /^([a-zA-Z][a-zA-Z0-9+.-]*):/.exec(cleaned)?.[1];
  if (scheme === undefined) {
    if (!allowRelative) return false;
    try {
      const resolved = new URL(cleaned, 'https://absoluteui.invalid/');
      return resolved.protocol === 'https:';
    } catch {
      return false;
    }
  }
  if (!schemes.includes(scheme.toLowerCase())) return false;
  try {
    return schemes.includes(new URL(cleaned).protocol.slice(0, -1).toLowerCase());
  } catch {
    return false;
  }
}

function copyAttributes(source: Element, target: Element, allowed: readonly string[], policy: Required<SanitizePolicy>): void {
  for (const attr of Array.from(source.attributes)) {
    const name = attr.name.toLowerCase();
    if (attr.namespaceURI !== null) continue;
    if (name.startsWith('on') || FORBIDDEN_ATTRIBUTES.has(name)) continue;
    if (!allowed.includes(name) && !policy.globalAttributes.includes(name)) continue;
    if (URL_ATTRIBUTES.has(name) && !isSafeUrl(attr.value, policy.urlSchemes, policy.allowRelativeUrls)) continue;
    if (name === 'dir' && !['ltr', 'rtl', 'auto'].includes(attr.value.toLowerCase())) continue;
    target.setAttribute(name, attr.value);
  }
  if (target.localName === 'a' && target.hasAttribute('target')) {
    target.setAttribute('rel', 'noopener noreferrer');
  }
}

function rebuild(source: Node, parent: Node, doc: Document, policy: Required<SanitizePolicy>, depth: number): void {
  if (depth > MAX_DEPTH) return;
  for (const node of Array.from(source.childNodes)) {
    if (node.nodeType === Node.TEXT_NODE) {
      parent.appendChild(doc.createTextNode(node.nodeValue ?? ''));
      continue;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) continue;
    const el = node as Element;
    const name = el.localName.toLowerCase();
    if (el.namespaceURI !== HTML_NS || FORBIDDEN_ELEMENTS.has(name)) continue;
    const allowed = Object.hasOwn(policy.elements, name) ? policy.elements[name] : undefined;
    if (allowed) {
      const copy = doc.createElement(name);
      copyAttributes(el, copy, allowed, policy);
      parent.appendChild(copy);
      rebuild(el, copy, doc, policy, depth + 1);
    } else if (!DROP_WITH_CONTENT.has(name)) {
      rebuild(el, parent, doc, policy, depth + 1);
    }
  }
}

/**
 * Sanitize untrusted HTML into a DocumentFragment owned by `targetDocument`.
 * Prefer this over string output: the result can be inserted with
 * `element.replaceChildren(fragment)` without any HTML sink.
 */
export function sanitizeHtml(html: string, policy?: SanitizePolicy, targetDocument: Document = document): DocumentFragment {
  const resolved = resolvePolicy(policy);
  if (typeof html !== 'string') {
    throw validationError('SAN_INVALID_INPUT', 'Sanitizer input must be a string.', { property: 'html', expected: 'string' });
  }
  if (html.length > resolved.maxLength) {
    throw validationError('SAN_INPUT_TOO_LARGE', 'Sanitizer input exceeds the maximum length.', { property: 'html', expected: `at most ${resolved.maxLength} characters` });
  }
  // Pass 1 applies the allowlist. Unwrapping disallowed elements can yield trees the
  // HTML parser would restructure (e.g. <ul> inside <p>), so pass 2 re-parses the
  // allowlisted serialization and rebuilds it. The result is a parser-normalized tree
  // that is stable under serialization and re-sanitization (mXSS defense).
  const firstPass = parseAndRebuild(html, resolved, targetDocument);
  const container = targetDocument.createElement('div');
  container.appendChild(firstPass);
  return parseAndRebuild(container.innerHTML, resolved, targetDocument);
}

function parseAndRebuild(html: string, policy: Required<SanitizePolicy>, doc: Document): DocumentFragment {
  // Explicit <body> puts the parser in "in body" mode so leading whitespace is preserved.
  const inert = new DOMParser().parseFromString(toParsable(`<body>${html}`), 'text/html');
  const fragment = doc.createDocumentFragment();
  rebuild(inert.body, fragment, doc, policy, 0);
  return fragment;
}

/** Sanitize and serialize. Output is stable: sanitizing it again yields the same string. */
export function sanitizeHtmlToString(html: string, policy?: SanitizePolicy): string {
  const container = document.createElement('div');
  container.appendChild(sanitizeHtml(html, policy));
  return container.innerHTML;
}

/** Replace an element's children with sanitized content. */
export function setSanitizedHtml(element: Element, html: string, policy?: SanitizePolicy): void {
  element.replaceChildren(sanitizeHtml(html, policy, element.ownerDocument));
}
