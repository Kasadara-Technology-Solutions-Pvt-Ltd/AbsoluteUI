/**
 * Toast (SPEC section 18.9). Transient notifications stacked in a labelled region
 * (`<section aria-label="Notifications">`) rendered in the top layer with
 * `popover="manual"`, so it stays above page content. While a modal dialog is
 * open the region moves inside it, so new toasts render above the dialog and stay
 * interactive instead of inert. Toasts never steal focus. Each toast is announced once
 * through the shared live regions (polite for info/success, assertive for
 * warning/error); the visual toast is not itself a live region, which avoids
 * double announcements. Timers pause while the region is hovered or focused
 * (WCAG 2.2.1), error toasts persist by default, and a hotkey moves focus to the
 * newest toast; Escape there dismisses it and returns focus.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, getMessage, registerMessages, runtimeError, validators } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { announce, applyVisuallyHidden, focusElement, matchesHotkey } from '@absoluteui/utilities';
import { Button } from '../button/button.js';

export type ToastTone = 'info' | 'success' | 'warning' | 'error';
export type ToastPosition = 'bottom-end' | 'bottom-start' | 'top-end' | 'top-start' | 'top-center' | 'bottom-center';
export type ToastCloseReason = 'timeout' | 'dismiss' | 'action' | 'programmatic';

export interface ToastConfig {
  position: ToastPosition;
  /** Maximum number of visible toasts; further toasts wait in a first-in, first-out queue. */
  max: number;
  /** Auto-dismiss delay in ms; 0 keeps toasts until dismissed. Error toasts default to 0. */
  duration: number;
  /** Moves focus to the newest toast, e.g. `Alt+T`; `null` disables it. */
  hotkey: string | null;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    toast: ToastConfig & { locale: string };
  }
}

const POSITIONS: readonly ToastPosition[] = ['bottom-end', 'bottom-start', 'top-end', 'top-start', 'top-center', 'bottom-center'];
const TONES: readonly ToastTone[] = ['info', 'success', 'warning', 'error'];
const MAX_DURATION = 3_600_000;

export const toastConfig = defineComponentConfig<ToastConfig, 'locale'>(
  'toast',
  {
    position: { default: 'bottom-end', expected: '"bottom-end" | "bottom-start" | "top-end" | "top-start" | "top-center" | "bottom-center"', validate: validators.oneOf(POSITIONS) },
    max: { default: 3, expected: 'integer 1..20', validate: validators.integerInRange(1, 20) },
    duration: { default: 5000, expected: 'integer ms 0..3600000 (0 = persistent)', validate: validators.integerInRange(0, MAX_DURATION) },
    hotkey: { default: 'Alt+T', expected: 'hotkey string such as "Alt+T", or null', validate: validators.nullable(validators.isNonEmptyString) },
  },
  ['locale'],
);

registerMessages('toast', 'en', {
  region: 'Notifications',
  dismiss: 'Dismiss notification',
  info: 'Information:',
  success: 'Success:',
  warning: 'Warning:',
  error: 'Error:',
});

export interface ToastIcons {
  info: IconRef;
  success: IconRef;
  warning: IconRef;
  error: IconRef;
  dismiss: IconRef;
}

export interface ToastAction {
  label: string;
  /** Called on activation; the toast then closes with reason `action`. */
  onAction?: () => void;
}

export interface ToastOptions {
  /** Default `info`. */
  tone?: ToastTone;
  /** Optional title (text only). */
  title?: string;
  /** Message text (never parsed as HTML). */
  message: string;
  /** Overrides the configured duration in ms; 0 = persistent. */
  duration?: number;
  /** Optional single action button. */
  action?: ToastAction;
}

export interface ToastHandle {
  readonly id: string;
  /** Close the toast (reason `programmatic`), or drop it from the queue. */
  dismiss(): void;
  /** Merge options; a visible toast is re-announced and its timer restarts. */
  update(options: Partial<ToastOptions>): void;
}

export interface ToasterOptions extends Partial<ToastConfig> {
  locale?: string;
  icons?: Partial<ToastIcons>;
}

export interface ToastOpenDetail {
  id: string;
}

export interface ToastCloseDetail {
  id: string;
  reason: ToastCloseReason;
}

const DEFAULT_ICONS: ToastIcons = { info: 'info', success: 'check-circle', warning: 'alert-triangle', error: 'alert-circle', dismiss: 'close' };

interface ToastRecord {
  readonly id: string;
  options: ToastOptions;
  state: 'queued' | 'visible' | 'closed';
  readonly item: HTMLLIElement;
  readonly el: HTMLDivElement;
  readonly icon: HTMLSpanElement;
  readonly tone: HTMLSpanElement;
  readonly title: HTMLParagraphElement;
  readonly message: HTMLParagraphElement;
  readonly actions: HTMLDivElement;
  dismissButton: Button | null;
  actionButton: Button | null;
  /** Remaining time in ms; Infinity for persistent toasts. */
  remaining: number;
  startedAt: number;
  timer: ReturnType<typeof setTimeout> | undefined;
}

const defaultToasters = new WeakMap<Document, Toaster>();

export class Toaster {
  /** The region (`<section>`), in the top layer while it has toasts. Lifecycle events fire here. */
  readonly element: HTMLElement;
  #options: ToasterOptions;
  #visible: ToastRecord[] = [];
  #queue: ToastRecord[] = [];
  #hovered = false;
  #focused = false;
  #returnTo: HTMLElement | null = null;
  #unwatchModal: (() => void) | null = null;
  readonly #doc: Document;
  readonly #list: HTMLOListElement;
  readonly #group = new DisposableGroup();

  /** Create a notification region appended to `doc.body`. */
  static create(options: ToasterOptions = {}, doc: Document = document): Toaster {
    return new Toaster(options, doc);
  }

  private constructor(options: ToasterOptions, doc: Document) {
    this.#doc = doc;
    this.#options = { ...options };
    const el = doc.createElement('section');
    el.className = 'aui-toaster';
    // Manual popover from the start, so the region never renders inline (HANDOVER section 6).
    el.popover = 'manual';
    this.element = el;
    this.#list = doc.createElement('ol');
    this.#list.className = 'aui-toaster__list';
    el.append(this.#list);
    // Render first: invalid options throw before listeners/subscriptions are attached.
    this.#renderRegion();

    const g = this.#group;
    g.listen(el, 'pointerenter', () => {
      this.#hovered = true;
      this.#syncTimers();
    });
    g.listen(el, 'pointerleave', () => {
      this.#hovered = false;
      this.#syncTimers();
    });
    g.listen(el, 'focusin', (event) => {
      const from = event.relatedTarget;
      if (!(from instanceof Node && el.contains(from))) this.#returnTo = from instanceof HTMLElement ? from : this.#returnTo;
      this.#focused = true;
      this.#syncTimers();
    });
    g.listen(el, 'focusout', (event) => {
      const to = event.relatedTarget;
      if (to instanceof Node && el.contains(to)) return;
      this.#focused = false;
      this.#returnTo = null;
      this.#syncTimers();
    });
    g.listen(el, 'keydown', (event) => {
      if (event.key !== 'Escape' || event.defaultPrevented) return;
      const target = event.target;
      const record = this.#visible.find((r) => target instanceof Node && r.el.contains(target));
      if (!record) return;
      event.preventDefault();
      this.#close(record, 'dismiss');
    });
    g.listen(doc, 'keydown', (event) => {
      const hotkey = this.#config().hotkey;
      if (hotkey === null || event.defaultPrevented || !el.isConnected || !matchesHotkey(event, hotkey)) return;
      const newest = this.#visible[this.#visible.length - 1];
      if (!newest) return;
      event.preventDefault();
      const active = doc.activeElement;
      if (active instanceof HTMLElement && active !== doc.body && !el.contains(active)) this.#returnTo = active;
      newest.el.focus();
    });
    g.add(toastConfig.subscribe(() => {
      this.#renderRegion();
      for (const r of [...this.#visible, ...this.#queue]) this.#renderToast(r);
      this.#fill();
    }));
    doc.body.append(el);
  }

  /** Number of visible toasts. */
  get count(): number {
    return this.#visible.length;
  }

  /** Toasts waiting for a free slot. */
  get queued(): number {
    return this.#queue.length;
  }

  get options(): Readonly<ToasterOptions> {
    return this.#options;
  }

  update(options: Partial<ToasterOptions>): void {
    const next = { ...this.#options, ...options };
    const previous = this.#options;
    this.#options = next;
    try {
      this.#renderRegion();
    } catch (error) {
      this.#options = previous;
      throw error;
    }
    for (const r of [...this.#visible, ...this.#queue]) this.#renderToast(r);
    this.#fill();
  }

  /** Show a toast, or queue it when `max` toasts are visible. */
  show(options: ToastOptions): ToastHandle {
    if (this.#group.disposed) {
      throw runtimeError('TOASTER_DESTROYED', 'Toaster has been destroyed.', { component: 'toast', remediation: 'Create a new Toaster, or use toast().' });
    }
    Toaster.#assert(options);
    const record = this.#createRecord({ ...options });
    this.#queue.push(record);
    this.#fill();
    return {
      id: record.id,
      dismiss: () => {
        this.#close(record, 'programmatic');
      },
      update: (next) => {
        this.#updateRecord(record, next);
      },
    };
  }

  /** Dismiss every visible and queued toast (reason `programmatic`). */
  clear(): void {
    this.#queue = [];
    for (const r of [...this.#visible]) this.#close(r, 'programmatic');
  }

  /** Remove the region, timers, listeners, and subscriptions. No close events are emitted. */
  destroy(): void {
    if (this.#group.disposed) return;
    this.#group.dispose();
    this.#unwatchModal?.();
    this.#unwatchModal = null;
    for (const r of [...this.#visible, ...this.#queue]) {
      clearTimeout(r.timer);
      r.state = 'closed';
      r.dismissButton?.destroy();
      r.actionButton?.destroy();
    }
    this.#visible = [];
    this.#queue = [];
    if (this.element.matches(':popover-open')) this.element.hidePopover();
    this.element.remove();
    if (defaultToasters.get(this.#doc) === this) defaultToasters.delete(this.#doc);
  }

  #config(): Readonly<ToastConfig & { locale: string }> {
    const o = this.#options;
    return toastConfig.resolve({
      ...(o.position === undefined ? {} : { position: o.position }),
      ...(o.max === undefined ? {} : { max: o.max }),
      ...(o.duration === undefined ? {} : { duration: o.duration }),
      ...(o.hotkey === undefined ? {} : { hotkey: o.hotkey }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  static #assert(options: ToastOptions): void {
    const fail = (property: string, expected: string): never => {
      throw configurationError('TOAST_OPTIONS', 'Invalid toast options.', { component: 'toast', property: `toast.${property}`, expected });
    };
    if (options.tone !== undefined && !TONES.includes(options.tone)) fail('tone', '"info" | "success" | "warning" | "error"');
    const m: unknown = options.message;
    if (typeof m !== 'string' || m.trim() === '') fail('message', 'non-empty string');
    if (options.title !== undefined && typeof options.title !== 'string') fail('title', 'string');
    if (options.duration !== undefined && !validators.integerInRange(0, MAX_DURATION)(options.duration)) fail('duration', 'integer ms 0..3600000');
    const a = options.action;
    if (a !== undefined) {
      if (typeof a.label !== 'string' || a.label.trim() === '') fail('action.label', 'non-empty string');
      if (a.onAction !== undefined && typeof a.onAction !== 'function') fail('action.onAction', 'function');
    }
  }

  #paused(): boolean {
    return this.#hovered || this.#focused;
  }

  #isTop(): boolean {
    return this.#config().position.startsWith('top');
  }

  #createRecord(options: ToastOptions): ToastRecord {
    const doc = this.#doc;
    const id = createId('aui-toast');
    const item = doc.createElement('li');
    item.className = 'aui-toaster__item';
    const el = doc.createElement('div');
    el.className = 'aui-toast';
    el.id = id;
    el.tabIndex = -1;
    el.setAttribute('role', 'group');
    const icon = doc.createElement('span');
    icon.className = 'aui-toast__icon';
    const text = doc.createElement('div');
    text.className = 'aui-toast__text';
    text.id = `${id}-text`;
    el.setAttribute('aria-labelledby', text.id);
    const tone = doc.createElement('span');
    tone.className = 'aui-toast__tone';
    applyVisuallyHidden(tone);
    const title = doc.createElement('p');
    title.className = 'aui-toast__title';
    const message = doc.createElement('p');
    message.className = 'aui-toast__message';
    text.append(tone, title, message);
    const actions = doc.createElement('div');
    actions.className = 'aui-toast__actions';
    el.append(icon, text, actions);
    item.append(el);
    const record: ToastRecord = { id, options, state: 'queued', item, el, icon, tone, title, message, actions, dismissButton: null, actionButton: null, remaining: Infinity, startedAt: 0, timer: undefined };
    this.#renderToast(record);
    return record;
  }

  #renderRegion(): void {
    const config = this.#config();
    const label = getMessage('toast', 'region', {}, config.locale);
    const el = this.element;
    for (const p of POSITIONS) el.classList.toggle(`aui-toaster--${p}`, p === config.position);
    el.setAttribute('aria-label', label);
    // DOM order follows visual order: the newest toast is nearest the viewport edge.
    const items = this.#visible.map((r) => r.item);
    this.#list.replaceChildren(...(this.#isTop() ? items.reverse() : items));
  }

  #renderToast(r: ToastRecord): void {
    const o = r.options;
    const config = this.#config();
    const tone = o.tone ?? 'info';
    const icons = this.#options.icons;
    r.icon.replaceChildren(renderIcon(icons?.[tone] ?? DEFAULT_ICONS[tone], { doc: this.#doc }));
    for (const t of TONES) r.el.classList.toggle(`aui-toast--${t}`, t === tone);
    r.tone.textContent = getMessage('toast', tone, {}, config.locale);
    r.title.textContent = o.title ?? '';
    r.title.hidden = !o.title;
    r.message.textContent = o.message;

    const action = o.action;
    if (action) {
      if (!r.actionButton) {
        const b = Button.create({ text: action.label, variant: 'secondary', size: 'sm' }, this.#doc);
        b.element.addEventListener('click', () => {
          try {
            r.options.action?.onAction?.();
          } finally {
            this.#close(r, 'action');
          }
        });
        r.actionButton = b;
        r.actions.append(b.element);
      } else {
        r.actionButton.element.textContent = action.label;
      }
    } else if (r.actionButton) {
      r.actionButton.destroy();
      r.actionButton.element.remove();
      r.actionButton = null;
    }
    r.actions.hidden = !r.actionButton;

    const dismissLabel = getMessage('toast', 'dismiss', {}, config.locale);
    const dismissIcon = icons?.dismiss ?? DEFAULT_ICONS.dismiss;
    if (r.dismissButton) {
      r.dismissButton.update({ label: dismissLabel, icon: dismissIcon });
    } else {
      const b = Button.create({ variant: 'ghost', size: 'sm', icon: dismissIcon, label: dismissLabel }, this.#doc);
      b.element.classList.add('aui-toast__dismiss');
      b.element.addEventListener('click', () => {
        this.#close(r, 'dismiss');
      });
      r.dismissButton = b;
      r.el.append(b.element);
    }
  }

  #announcement(r: ToastRecord): string {
    const o = r.options;
    return [r.tone.textContent, o.title ?? '', o.message].filter((s) => s.trim() !== '').join(' ');
  }

  #announce(r: ToastRecord): void {
    const tone = r.options.tone ?? 'info';
    announce(this.#announcement(r), tone === 'error' || tone === 'warning' ? 'assertive' : 'polite', this.#doc);
  }

  #effectiveDuration(o: ToastOptions): number {
    const ms = o.duration ?? ((o.tone ?? 'info') === 'error' ? 0 : this.#config().duration);
    return ms === 0 ? Infinity : ms;
  }

  #fill(): void {
    const max = this.#config().max;
    while (this.#visible.length < max) {
      const next = this.#queue.shift();
      if (!next) break;
      this.#reveal(next);
    }
  }

  #reveal(r: ToastRecord): void {
    r.state = 'visible';
    this.#visible.push(r);
    if (this.#isTop()) this.#list.prepend(r.item);
    else this.#list.append(r.item);
    this.#syncOpen();
    r.remaining = this.#effectiveDuration(r.options);
    this.#announce(r);
    emit(this.element, 'aui-open', { id: r.id } satisfies ToastOpenDetail, { bubbles: false });
    this.#syncTimers();
  }

  #updateRecord(r: ToastRecord, options: Partial<ToastOptions>): void {
    if (r.state === 'closed') return;
    const next = { ...r.options, ...options };
    Toaster.#assert(next);
    r.options = next;
    this.#renderToast(r);
    if (r.state !== 'visible') return;
    this.#stopTimer(r);
    r.remaining = this.#effectiveDuration(next);
    this.#announce(r);
    this.#syncTimers();
  }

  #close(r: ToastRecord, reason: ToastCloseReason): void {
    if (r.state === 'queued') {
      r.state = 'closed';
      this.#queue = this.#queue.filter((q) => q !== r);
      return;
    }
    if (r.state !== 'visible') return;
    r.state = 'closed';
    clearTimeout(r.timer);
    r.timer = undefined;
    const hadFocus = r.item.contains(this.#doc.activeElement);
    // Captured before removal in case the browser reports focusout for the removed element.
    const returnTo = this.#returnTo;
    this.#visible = this.#visible.filter((v) => v !== r);
    r.item.remove();
    r.dismissButton?.destroy();
    r.actionButton?.destroy();
    emit(this.element, 'aui-close', { id: r.id, reason } satisfies ToastCloseDetail, { bubbles: false });
    if (this.#group.disposed) return;
    this.#fill();
    if (hadFocus) this.#restoreFocus(returnTo);
    this.#syncOpen();
    this.#syncTimers();
  }

  /** Focus left a removed toast: return it to where it was, else to the newest remaining toast. */
  #restoreFocus(target: HTMLElement | null): void {
    if (focusElement(target)) return;
    const newest = this.#visible[this.#visible.length - 1];
    if (newest) {
      newest.el.focus();
      return;
    }
    // The focused element was removed without a focusout event.
    this.#focused = false;
    this.#returnTo = null;
  }

  #syncOpen(): void {
    const el = this.element;
    if (this.#visible.length === 0) {
      if (el.matches(':popover-open')) el.hidePopover();
      return;
    }
    this.#placeRegion();
    if (!el.matches(':popover-open')) el.showPopover();
  }

  /**
   * Everything outside an open modal dialog is inert (not focusable, not
   * clickable, hidden from assistive technology). While one is open, the region
   * therefore lives inside it; re-showing it there puts it above the dialog in
   * the top layer. It moves back when that dialog closes.
   */
  #placeRegion(): void {
    const doc = this.#doc;
    const el = this.element;
    const active = doc.activeElement;
    const modals = [...doc.querySelectorAll('dialog')].filter((d) => d.matches(':modal'));
    const target = modals.find((d) => d.contains(active)) ?? modals[modals.length - 1] ?? doc.body;
    // Never move the region while it holds focus (moving would drop focus).
    if (el.parentNode === target || el.contains(active)) return;
    this.#unwatchModal?.();
    this.#unwatchModal = null;
    if (el.matches(':popover-open')) el.hidePopover();
    target.append(el);
    if (target instanceof HTMLDialogElement) {
      const onClose = (): void => {
        this.#unwatchModal?.();
        this.#unwatchModal = null;
        if (this.#group.disposed) return;
        this.#placeRegion();
        this.#syncOpen();
      };
      target.addEventListener('close', onClose);
      this.#unwatchModal = () => {
        target.removeEventListener('close', onClose);
      };
    }
  }

  #stopTimer(r: ToastRecord): void {
    if (r.timer === undefined) return;
    clearTimeout(r.timer);
    r.timer = undefined;
    r.remaining = Math.max(0, r.remaining - (Date.now() - r.startedAt));
  }

  #syncTimers(): void {
    const paused = this.#paused();
    for (const r of this.#visible) {
      if (paused) {
        this.#stopTimer(r);
      } else if (r.timer === undefined && r.remaining !== Infinity) {
        r.startedAt = Date.now();
        r.timer = setTimeout(() => {
          r.timer = undefined;
          this.#close(r, 'timeout');
        }, r.remaining);
      }
    }
  }
}

/**
 * Show a toast in the default Toaster for `doc`, created lazily with the global
 * configuration (and re-created if it was destroyed or its region removed).
 */
export function toast(options: ToastOptions, doc: Document = document): ToastHandle {
  let toaster = defaultToasters.get(doc);
  if (toaster && !toaster.element.isConnected) {
    toaster.destroy();
    toaster = undefined;
  }
  if (!toaster) {
    toaster = Toaster.create({}, doc);
    defaultToasters.set(doc, toaster);
  }
  return toaster.show(options);
}
