/** Accessibility utilities (SPEC section 18.23). All styling uses the CSSOM (CSP-safe). */

const VISUALLY_HIDDEN: Readonly<Record<string, string>> = {
  position: 'absolute',
  width: '1px',
  height: '1px',
  padding: '0',
  margin: '-1px',
  overflow: 'hidden',
  'clip-path': 'inset(50%)',
  'white-space': 'nowrap',
  border: '0',
};

/** Hide an element visually while keeping it available to assistive technology. */
export function applyVisuallyHidden(el: HTMLElement): void {
  for (const [prop, value] of Object.entries(VISUALLY_HIDDEN)) el.style.setProperty(prop, value);
}

export type Politeness = 'polite' | 'assertive';

/**
 * The live region must live outside inert content: while a modal <dialog> is
 * open everything else is inert, so announcements go to a region inside the
 * topmost modal dialog (R1 fix), otherwise to one in <body>.
 */
function region(politeness: Politeness, doc: Document): HTMLElement {
  const modals = Array.from(doc.querySelectorAll('dialog')).filter((d) => d.matches(':modal'));
  const container: HTMLElement = modals[modals.length - 1] ?? doc.body;
  let el = Array.from(container.children).find((c): c is HTMLElement => c instanceof HTMLElement && c.dataset.auiLiveRegion === politeness);
  if (!el) {
    el = doc.createElement('div');
    el.setAttribute('aria-live', politeness);
    el.setAttribute('aria-atomic', 'true');
    el.dataset.auiLiveRegion = politeness;
    applyVisuallyHidden(el);
    container.appendChild(el);
  }
  return el;
}

/**
 * Announce a message through a shared live region. Text is set via textContent
 * (never parsed as HTML). Repeated identical messages are re-announced. Without a browser
 * window (server rendering) there is nobody to announce to: nothing happens.
 */
export function announce(message: string, politeness: Politeness = 'polite', doc?: Document): void {
  const target = doc ?? (typeof document === 'undefined' ? undefined : document);
  const view = target?.defaultView;
  if (!target || !view) return;
  const el = region(politeness, target);
  el.textContent = '';
  view.requestAnimationFrame(() => {
    el.textContent = message;
  });
}

/** Link an element to one or more describing elements without clobbering existing ids. */
export function addAriaReference(el: Element, attribute: 'aria-describedby' | 'aria-labelledby' | 'aria-controls' | 'aria-owns', id: string): void {
  const ids = new Set((el.getAttribute(attribute) ?? '').split(/\s+/).filter(Boolean));
  ids.add(id);
  el.setAttribute(attribute, [...ids].join(' '));
}

export function removeAriaReference(el: Element, attribute: 'aria-describedby' | 'aria-labelledby' | 'aria-controls' | 'aria-owns', id: string): void {
  const ids = (el.getAttribute(attribute) ?? '').split(/\s+/).filter((x) => x && x !== id);
  if (ids.length) el.setAttribute(attribute, ids.join(' '));
  else el.removeAttribute(attribute);
}
