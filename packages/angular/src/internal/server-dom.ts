/**
 * Server DOM completion (docs/PLAN-R9-ANGULAR.md M6, D3/D20). Angular renders on the server
 * with a bundled DOM implementation that lacks a few standard members the components use.
 * Before the first server render, the missing members are added to that implementation's
 * prototypes with their standard behavior (layout and focus members are inert, as nothing is
 * laid out on the server). Working members are never replaced (only missing ones and ones that
 * throw "not implemented"), and the browser is never
 * touched: this only runs from server-side code paths.
 */

type Proto = Record<PropertyKey, unknown>;

const done = new WeakSet<object>();

/** The prototype in the chain of `node` that owns `member` (where a shim belongs), or null. */
function owner(node: object, member: string): Proto | null {
  let proto: unknown = Object.getPrototypeOf(node);
  while (proto && typeof proto === 'object') {
    if (Object.prototype.hasOwnProperty.call(proto, member)) return proto as Proto;
    proto = Object.getPrototypeOf(proto);
  }
  return null;
}

function define(proto: Proto | null, name: string, descriptor: PropertyDescriptor): void {
  if (!proto || name in proto) return;
  Object.defineProperty(proto, name, { configurable: true, ...descriptor });
}

function method(proto: Proto | null, name: string, fn: (...args: never[]) => unknown): void {
  define(proto, name, { writable: true, value: fn });
}

/** True when reading the member does not throw. */
function readable(read: () => unknown): boolean {
  try {
    read();
    return true;
  } catch {
    return false;
  }
}

function toNode(doc: Document, value: Node | string): Node {
  return typeof value === 'string' ? doc.createTextNode(value) : value;
}

const toAttr = (key: string): string => `data-${key.replace(/[A-Z]/g, (c) => `-${c.toLowerCase()}`)}`;
const toKey = (attr: string): string => attr.slice('data-'.length).replace(/-([a-z])/g, (_, c: string) => c.toUpperCase());

/** `element.dataset` as a live view of the data-* attributes. */
function dataset(el: Element): DOMStringMap {
  const target: DOMStringMap = {};
  return new Proxy(target, {
    get: (_t, key) => (typeof key === 'string' ? (el.getAttribute(toAttr(key)) ?? undefined) : undefined),
    set: (_t, key, value) => {
      if (typeof key !== 'string') return false;
      el.setAttribute(toAttr(key), String(value));
      return true;
    },
    deleteProperty: (_t, key) => {
      if (typeof key === 'string') el.removeAttribute(toAttr(key));
      return true;
    },
    has: (_t, key) => typeof key === 'string' && el.hasAttribute(toAttr(key)),
    ownKeys: () => el.getAttributeNames().filter((a) => a.startsWith('data-')).map(toKey),
    getOwnPropertyDescriptor: (_t, key) => {
      if (typeof key !== 'string' || !el.hasAttribute(toAttr(key))) return undefined;
      return { configurable: true, enumerable: true, writable: true, value: el.getAttribute(toAttr(key)) ?? '' };
    },
  });
}

interface ValidityState {
  message: string;
}
const validity = new WeakMap<Element, ValidityState>();

/** Add the missing standard members to the DOM implementation behind `doc` (idempotent). */
export function completeServerDom(doc: Document): void {
  const div = doc.createElement('div');
  const elementProto = owner(div, 'getAttribute');
  if (!elementProto || done.has(elementProto)) return;
  done.add(elementProto);

  const parents = [elementProto, owner(doc, 'getElementById'), owner(doc.createDocumentFragment(), 'querySelector') ?? Object.getPrototypeOf(doc.createDocumentFragment()) as Proto];
  for (const proto of parents) {
    method(proto, 'append', function (this: ParentNode & Node, ...nodes: (Node | string)[]) {
      for (const n of nodes) this.appendChild(toNode(this.ownerDocument ?? doc, n));
    });
    method(proto, 'prepend', function (this: ParentNode & Node, ...nodes: (Node | string)[]) {
      const first = this.firstChild;
      for (const n of nodes) this.insertBefore(toNode(this.ownerDocument ?? doc, n), first);
    });
    method(proto, 'replaceChildren', function (this: ParentNode & Node, ...nodes: (Node | string)[]) {
      while (this.firstChild) this.removeChild(this.firstChild);
      for (const n of nodes) this.appendChild(toNode(this.ownerDocument ?? doc, n));
    });
  }
  const nodeProto = owner(div, 'appendChild');
  // `baseURI` exists but throws (not implemented): the document URL, or the <base href> resolved against it.
  // The inherited member cannot be redefined: elements and documents get their own, which shadows it.
  if (!readable(() => div.baseURI)) {
    for (const proto of [elementProto, owner(doc, 'getElementById')]) {
      if (!proto || Object.prototype.hasOwnProperty.call(proto, 'baseURI')) continue;
      Object.defineProperty(proto, 'baseURI', {
        configurable: true,
        get(this: Node) {
          const d = this.ownerDocument ?? doc;
          const address = readable(() => d.documentURI) ? d.documentURI : 'about:blank';
          const href = d.querySelector('base[href]')?.getAttribute('href');
          if (href === undefined || href === null) return address;
          try {
            return new URL(href, address).href;
          } catch {
            return address;
          }
        },
      });
    }
  }
  method(nodeProto, 'getRootNode', function (this: Node) {
    let root = this.parentNode ?? this;
    while (root.parentNode) root = root.parentNode;
    return root;
  });
  define(elementProto, 'dataset', {
    get(this: Element) {
      return dataset(this);
    },
  });
  define(elementProto, 'inert', {
    get(this: Element) {
      return this.hasAttribute('inert');
    },
    set(this: Element, value: unknown) {
      this.toggleAttribute('inert', Boolean(value));
    },
  });
  // Layout, focus, and animation do not exist on the server.
  method(elementProto, 'getBoundingClientRect', () => ({ x: 0, y: 0, top: 0, left: 0, right: 0, bottom: 0, width: 0, height: 0, toJSON: () => ({}) }));
  method(elementProto, 'scrollIntoView', () => undefined);
  method(elementProto, 'animate', () => ({ cancel: () => undefined, finish: () => undefined, finished: Promise.resolve(), onfinish: null }));

  const inputProto = owner(doc.createElement('input'), 'value');
  const controls = [inputProto, owner(doc.createElement('textarea'), 'value'), owner(doc.createElement('select'), 'value'), owner(doc.createElement('button'), 'type')];
  for (const proto of controls) {
    method(proto, 'setCustomValidity', function (this: Element, message: string) {
      validity.set(this, { message });
    });
    define(proto, 'validationMessage', {
      get(this: Element) {
        return validity.get(this)?.message ?? '';
      },
    });
    define(proto, 'validity', {
      get(this: Element) {
        const custom = (validity.get(this)?.message ?? '') !== '';
        return { valid: !custom, customError: custom, valueMissing: false, typeMismatch: false, patternMismatch: false, tooLong: false, tooShort: false, rangeUnderflow: false, rangeOverflow: false, stepMismatch: false, badInput: false };
      },
    });
    method(proto, 'checkValidity', function (this: Element) {
      return (validity.get(this)?.message ?? '') === '';
    });
    method(proto, 'reportValidity', function (this: Element) {
      return (validity.get(this)?.message ?? '') === '';
    });
    define(proto, 'labels', {
      get() {
        return [];
      },
    });
  }
  for (const proto of [inputProto, owner(doc.createElement('textarea'), 'value')]) {
    method(proto, 'select', () => undefined);
    method(proto, 'setSelectionRange', () => undefined);
    define(proto, 'selectionStart', {
      get(this: HTMLInputElement) {
        return this.value.length;
      },
      set: () => undefined,
    });
    define(proto, 'selectionEnd', {
      get(this: HTMLInputElement) {
        return this.value.length;
      },
      set: () => undefined,
    });
  }
}
