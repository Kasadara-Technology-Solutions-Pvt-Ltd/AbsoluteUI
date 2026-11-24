// DOM helpers. Text is always set with textContent (CSP + Trusted Types safe).
import { Button, type ButtonOptions } from '@absoluteui/components/button';

export interface ElProps {
  readonly className?: string;
  readonly id?: string;
  readonly text?: string;
  readonly attrs?: Readonly<Record<string, string>>;
}

export function el<K extends keyof HTMLElementTagNameMap>(tag: K, props: ElProps = {}, ...children: (Node | string)[]): HTMLElementTagNameMap[K] {
  const node = document.createElement(tag);
  if (props.className) node.className = props.className;
  if (props.id) node.id = props.id;
  if (props.text !== undefined) node.textContent = props.text;
  for (const [name, value] of Object.entries(props.attrs ?? {})) node.setAttribute(name, value);
  node.append(...children);
  return node;
}

export function byId<T extends HTMLElement>(id: string, type: new () => T): T {
  const node = document.getElementById(id);
  if (!(node instanceof type)) throw new Error(`Missing #${id}`);
  return node;
}

export function host(parent: HTMLElement, className?: string): HTMLDivElement {
  const div = el('div', className ? { className } : {});
  parent.append(div);
  return div;
}

export function button(parent: HTMLElement, text: string, options: ButtonOptions = {}, onClick?: () => void): Button {
  const b = Button.create({ text, ...options });
  parent.append(b.element);
  if (onClick) b.element.addEventListener('click', onClick);
  return b;
}

/** Detail of an AbsoluteUI CustomEvent, checked against a guard. */
export function detail<T>(event: Event, guard: (v: unknown) => v is T): T | null {
  return event instanceof CustomEvent && guard(event.detail) ? event.detail : null;
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null;
export const hasValue = (v: unknown): v is { value: string } => isRecord(v) && typeof v.value === 'string';
export const hasNullableValue = (v: unknown): v is { value: string | null } => isRecord(v) && (typeof v.value === 'string' || v.value === null);
export const hasChecked = (v: unknown): v is { checked: boolean } => isRecord(v) && typeof v.checked === 'boolean';

/** Save text or bytes as a download through a short-lived object URL. */
export function download(filename: string, content: string | Uint8Array, type: string): void {
  const blob = new Blob([typeof content === 'string' ? content : new Uint8Array(content)], { type });
  const url = URL.createObjectURL(blob);
  const a = el('a', { attrs: { href: url, download: filename } });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => {
    URL.revokeObjectURL(url);
  }, 10_000);
}

/** A copy of `map` without `key`. */
export function omit(map: Readonly<Record<string, string>>, key: string): Record<string, string> {
  return Object.fromEntries(Object.entries(map).filter(([k]) => k !== key));
}

export function debounce(fn: () => void, ms: number): () => void {
  let timer: ReturnType<typeof setTimeout> | undefined;
  return () => {
    clearTimeout(timer);
    timer = setTimeout(fn, ms);
  };
}

/** Polite announcement for screen readers (the live region exists in index.html). */
export function announce(message: string): void {
  const region = document.getElementById('announcer');
  if (!region) return;
  region.textContent = '';
  setTimeout(() => {
    region.textContent = message;
  }, 50);
}
