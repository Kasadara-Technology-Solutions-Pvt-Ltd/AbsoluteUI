/**
 * Session Warning Dialog (SPEC section 18.22, WCAG 2.2.1 Timing Adjustable): an alert
 * dialog built on Dialog that counts down to a session deadline (an `Instant`)
 * and offers "Stay signed in" and "Sign out". Time is computed as a duration
 * from the deadline to the current clock on every tick, so it is timezone
 * independent and survives throttled background timers. Announcements are
 * throttled to thresholds (not every second).
 *
 * The component pauses, extends, and ends nothing on its own: it emits
 * `aui-extend`, `aui-sign-out`, and `aui-expire`, and the application talks to its
 * session service. AbsoluteUI is not an authentication provider.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, duration, emit, formatNumber, getMessage, registerMessages, validators, type Duration, type Instant } from '@absoluteui/core';
import { announce } from '@absoluteui/utilities';
import { Dialog, type DialogAction, type DialogCloseDetail } from '../dialog/dialog.js';
import { setText } from '../internal/field.js';

export interface SessionWarningDialogConfig {
  /** Announce the remaining time each time it crosses a multiple of this many seconds, and at 60, 30, and 10 seconds. */
  announceInterval: number;
  /** Escape means "Stay signed in" (it dismisses the warning). When false, Escape does nothing. */
  escapeExtends: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    sessionWarningDialog: SessionWarningDialogConfig & { locale: string };
  }
}

export const sessionWarningDialogConfig = defineComponentConfig<SessionWarningDialogConfig, 'locale'>(
  'sessionWarningDialog',
  {
    announceInterval: { default: 60, expected: 'integer 15..3600 (seconds)', validate: validators.integerInRange(15, 3600) },
    escapeExtends: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('sessionWarningDialog', 'en', {
  title: 'Your session is about to expire',
  message: 'You will be signed out soon because you have been inactive. Do you want to stay signed in?',
  remaining: 'Time remaining: {time}',
  extend: 'Stay signed in',
  signOut: 'Sign out',
  expiredTitle: 'Your session has expired',
  expiredMessage: 'You have been signed out. Sign in again to continue.',
  signIn: 'Sign in again',
});

export interface SessionWarningDialogOptions extends Partial<SessionWarningDialogConfig> {
  /** When the session ends (an exact instant; compare with the server's expiry). */
  expiresAt: Instant;
  /** Open automatically this long before `expiresAt`. Without it, call `open()`. */
  warnBefore?: Duration;
  /** Default: localized "Your session is about to expire". */
  title?: string;
  /** Default: localized inactivity message. Text only. */
  message?: string;
  /** Additional body content below the countdown. Strings are rendered as text. */
  content?: Node | string;
  /** Default: localized "Stay signed in". */
  extendLabel?: string;
  /** Default: localized "Sign out". */
  signOutLabel?: string;
  /** Shown after expiry. Default: localized "Your session has expired". */
  expiredTitle?: string;
  expiredMessage?: string;
  /** The single action after expiry (emits `aui-sign-out` with reason `expired`). Default: localized "Sign in again". */
  signInLabel?: string;
  locale?: string;
}

export interface SessionWarningExtendDetail {
  reason: 'action' | 'escape';
}

export interface SessionWarningSignOutDetail {
  reason: 'action' | 'expired';
}

const MAX_TIMEOUT = 2_147_483_647;
const FINAL_THRESHOLDS = [60, 30, 10];
const isInstant = (v: unknown): v is Instant => typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'Instant' && Number.isFinite((v as { epochMilliseconds?: unknown }).epochMilliseconds);
const isDuration = (v: unknown): v is Duration => typeof v === 'object' && v !== null && (v as { kind?: unknown }).kind === 'Duration' && Number.isFinite((v as { milliseconds?: unknown }).milliseconds);
const isCloseDetail = (v: unknown): v is DialogCloseDetail => typeof v === 'object' && v !== null && typeof (v as { returnValue?: unknown }).returnValue === 'string' && typeof (v as { reason?: unknown }).reason === 'string';
const optionalText = (v: unknown): boolean => v === undefined || (typeof v === 'string' && v.trim() !== '');

function fail(property: string, expected: string): never {
  throw configurationError('SESSION_WARNING_DIALOG_OPTIONS', 'Invalid session warning dialog options.', { component: 'sessionWarningDialog', property: `sessionWarningDialog.${property}`, expected });
}

/** "1 minute, 30 seconds" in the locale (Intl unit formatting, no Intl.DurationFormat dependency). */
export function formatRemaining(seconds: number, locale: string): string {
  const s = Math.max(0, Math.ceil(seconds));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const unit = (value: number, u: 'hour' | 'minute' | 'second'): string => formatNumber(value, { style: 'unit', unit: u, unitDisplay: 'long' }, locale);
  const parts = [...(h > 0 ? [unit(h, 'hour')] : []), ...(m > 0 ? [unit(m, 'minute')] : []), ...(sec > 0 || s === 0 ? [unit(sec, 'second')] : [])];
  return new Intl.ListFormat(locale, { type: 'unit', style: 'long' }).format(parts);
}

export class SessionWarningDialog {
  /** The underlying Dialog (alert dialog). */
  readonly dialog: Dialog;
  #options: SessionWarningDialogOptions;
  #expired = false;
  /** Auto-open is suspended after the user answers, until `expiresAt` changes. */
  #suspended = false;
  #lastSeconds = Number.POSITIVE_INFINITY;
  #tickTimer: ReturnType<typeof setTimeout> | undefined;
  #scheduleTimer: ReturnType<typeof setTimeout> | undefined;
  readonly #doc: Document;
  readonly #body: HTMLDivElement;
  readonly #message: HTMLParagraphElement;
  readonly #countdown: HTMLParagraphElement;
  readonly #extra: HTMLDivElement;
  readonly #group = new DisposableGroup();

  static create(options: SessionWarningDialogOptions, doc: Document = document): SessionWarningDialog {
    return new SessionWarningDialog(options, doc);
  }

  private constructor(options: SessionWarningDialogOptions, doc: Document) {
    SessionWarningDialog.#assert(options);
    this.#doc = doc;
    this.#options = { ...options };
    this.#config();

    this.#body = doc.createElement('div');
    this.#body.className = 'aui-session-warning';
    this.#message = doc.createElement('p');
    this.#message.className = 'aui-session-warning__message';
    this.#message.id = createId('aui-session-warning-message');
    this.#countdown = doc.createElement('p');
    this.#countdown.className = 'aui-session-warning__countdown';
    this.#countdown.id = createId('aui-session-warning-countdown');
    this.#extra = doc.createElement('div');
    this.#extra.className = 'aui-session-warning__content';
    this.#body.append(this.#message, this.#countdown, this.#extra);
    this.#setContent(options.content);

    this.#expired = this.#remainingMs() <= 0;
    this.dialog = Dialog.create({ ...this.#dialogOptions(), content: this.#body }, doc);
    this.dialog.element.classList.add('aui-session-warning-dialog');
    this.#render();

    const onClose = (event: Event): void => {
      this.#stopTick();
      const detail: unknown = event instanceof CustomEvent ? event.detail : null;
      if (!isCloseDetail(detail) || detail.reason === 'programmatic') return;
      this.#suspended = true;
      // Keep watching the deadline while closed, so `aui-expire` still fires if the session is not extended.
      this.#schedule();
      if (detail.returnValue === 'sign-out') emit(this.element, 'aui-sign-out', { reason: this.#expired ? 'expired' : 'action' } satisfies SessionWarningSignOutDetail, { bubbles: false });
      else if (detail.returnValue === 'extend' || detail.reason === 'escape') emit(this.element, 'aui-extend', { reason: detail.reason === 'escape' ? 'escape' : 'action' } satisfies SessionWarningExtendDetail, { bubbles: false });
    };
    const el = this.dialog.element;
    el.addEventListener('aui-close', onClose);
    this.#group.add(() => {
      el.removeEventListener('aui-close', onClose);
    });
    this.#group.add(sessionWarningDialogConfig.subscribe(() => {
      this.dialog.update(this.#dialogOptions());
      this.#render();
    }));
    this.#schedule();
  }

  /** The <dialog> element; events are dispatched on it. */
  get element(): HTMLDialogElement {
    return this.dialog.element;
  }

  get isOpen(): boolean {
    return this.dialog.isOpen;
  }

  /** Time left until `expiresAt` (never negative). */
  get remaining(): Duration {
    return duration(Math.max(0, this.#remainingMs()));
  }

  get expired(): boolean {
    return this.#remainingMs() <= 0;
  }

  get options(): Readonly<SessionWarningDialogOptions> {
    return this.#options;
  }

  /** Open the warning now (focus moves to "Stay signed in"). */
  open(): void {
    if (this.dialog.isOpen || this.#group.disposed) return;
    this.#syncExpired();
    this.#lastSeconds = Math.ceil(this.#remainingMs() / 1000);
    this.#render();
    this.dialog.open();
    this.#tick();
  }

  close(): void {
    this.#stopTick();
    this.dialog.close();
  }

  /** Merge options. A new `expiresAt` (for example after the session was extended) re-arms auto-open and expiry. */
  update(options: Partial<SessionWarningDialogOptions>): void {
    const previous = this.#options;
    const next = { ...previous, ...options };
    SessionWarningDialog.#assert(next);
    this.#options = next;
    this.#config();
    if ('content' in options) this.#setContent(options.content);
    // Only a changed deadline re-arms: framework bindings re-send unchanged options (regression found by the Angular adapter).
    const rearm = next.expiresAt.epochMilliseconds !== previous.expiresAt.epochMilliseconds || next.warnBefore?.milliseconds !== previous.warnBefore?.milliseconds;
    if (rearm) {
      this.#suspended = false;
      this.#lastSeconds = Math.ceil(this.#remainingMs() / 1000);
    }
    this.#syncExpired(false);
    this.dialog.update(this.#dialogOptions());
    this.#render();
    this.#schedule();
    if (this.dialog.isOpen) this.#tick();
  }

  destroy(): void {
    this.#stopTick();
    clearTimeout(this.#scheduleTimer);
    this.#group.dispose();
    this.dialog.destroy();
  }

  static #assert(o: SessionWarningDialogOptions): void {
    if (!isInstant(o.expiresAt)) fail('expiresAt', 'Instant (e.g. instant(epochMilliseconds))');
    if (o.warnBefore !== undefined && (!isDuration(o.warnBefore) || o.warnBefore.milliseconds < 20_000)) fail('warnBefore', 'Duration of at least 20 seconds (WCAG 2.2.1)');
    for (const key of ['title', 'message', 'extendLabel', 'signOutLabel', 'expiredTitle', 'expiredMessage', 'signInLabel'] as const) {
      if (!optionalText(o[key])) fail(key, 'non-empty string');
    }
    if (o.content !== undefined && typeof o.content !== 'string' && !(o.content instanceof Node)) fail('content', 'Node | string');
  }

  #config(): Readonly<SessionWarningDialogConfig & { locale: string }> {
    const o = this.#options;
    return sessionWarningDialogConfig.resolve({
      ...(o.announceInterval === undefined ? {} : { announceInterval: o.announceInterval }),
      ...(o.escapeExtends === undefined ? {} : { escapeExtends: o.escapeExtends }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #m(key: string, params: Record<string, string> = {}): string {
    return getMessage('sessionWarningDialog', key, params, this.#config().locale);
  }

  #remainingMs(): number {
    return this.#options.expiresAt.epochMilliseconds - Date.now();
  }

  #setContent(content: Node | string | undefined): void {
    if (content === undefined) this.#extra.replaceChildren();
    else this.#extra.replaceChildren(typeof content === 'string' ? this.#doc.createTextNode(content) : content);
    this.#extra.hidden = content === undefined;
  }

  #dialogOptions(): { title: string; role: 'alertdialog'; size: 'sm'; showCloseButton: false; closeOnBackdrop: false; closeOnEscape: boolean; actions: DialogAction[] } {
    const o = this.#options;
    const actions: DialogAction[] = this.#expired
      ? [{ label: o.signInLabel ?? this.#m('signIn'), value: 'sign-out', variant: 'primary', autofocus: true }]
      : [
          // "Stay signed in" is the least destructive choice and receives initial focus.
          { label: o.extendLabel ?? this.#m('extend'), value: 'extend', variant: 'primary', autofocus: true },
          { label: o.signOutLabel ?? this.#m('signOut'), value: 'sign-out', variant: 'secondary' },
        ];
    return {
      title: this.#expired ? (o.expiredTitle ?? this.#m('expiredTitle')) : (o.title ?? this.#m('title')),
      role: 'alertdialog',
      size: 'sm',
      showCloseButton: false,
      closeOnBackdrop: false,
      closeOnEscape: !this.#expired && this.#config().escapeExtends,
      actions,
    };
  }

  /** Move into or out of the expired state. Emits `aui-expire` once per deadline. */
  #syncExpired(notify = true): void {
    const expired = this.#remainingMs() <= 0;
    if (expired === this.#expired) return;
    this.#expired = expired;
    this.dialog.update(this.#dialogOptions());
    this.#render();
    if (expired && notify) {
      if (this.dialog.isOpen) announce(this.#options.expiredMessage ?? this.#m('expiredMessage'), 'assertive', this.#doc);
      emit(this.element, 'aui-expire', null, { bubbles: false });
    }
  }

  #render(): void {
    const o = this.#options;
    const locale = this.#config().locale;
    if (this.#expired) {
      setText(this.#message, o.expiredMessage ?? this.#m('expiredMessage'));
      this.#countdown.hidden = true;
    } else {
      setText(this.#message, o.message ?? this.#m('message'));
      setText(this.#countdown, this.#m('remaining', { time: formatRemaining(this.#remainingMs() / 1000, locale) }));
      this.#countdown.hidden = false;
    }
    // Dialog manages aria-describedby only for its `description`; this dialog describes itself with the body text.
    this.element.setAttribute('aria-describedby', this.#expired ? this.#message.id : `${this.#message.id} ${this.#countdown.id}`);
  }

  /** Announce when a threshold is crossed: each multiple of the interval, then 60 s, 30 s, and 10 s. */
  #maybeAnnounce(seconds: number): void {
    const previous = this.#lastSeconds;
    this.#lastSeconds = seconds;
    if (!(seconds < previous) || seconds <= 0) return;
    const interval = this.#config().announceInterval;
    const crossed = Math.ceil(seconds / interval) < Math.ceil(previous / interval) || FINAL_THRESHOLDS.some((t) => previous > t && seconds <= t);
    if (crossed) announce(this.#m('remaining', { time: formatRemaining(seconds, this.#config().locale) }), 'polite', this.#doc);
  }

  #tick(): void {
    this.#stopTick();
    if (!this.dialog.isOpen || this.#group.disposed) return;
    this.#syncExpired();
    const ms = this.#remainingMs();
    if (ms <= 0) {
      this.#render();
      return;
    }
    this.#maybeAnnounce(Math.ceil(ms / 1000));
    this.#render();
    // Wake on the next whole-second boundary of the remaining time.
    const next = ms % 1000 || 1000;
    this.#tickTimer = setTimeout(() => {
      this.#tick();
    }, next);
  }

  #stopTick(): void {
    clearTimeout(this.#tickTimer);
    this.#tickTimer = undefined;
  }

  /** While closed: open at `expiresAt - warnBefore` (unless suspended) and emit expiry at the deadline. */
  #schedule(): void {
    clearTimeout(this.#scheduleTimer);
    if (this.#group.disposed || this.dialog.isOpen) return;
    const ms = this.#remainingMs();
    if (ms <= 0) {
      this.#syncExpired();
      return;
    }
    const warn = this.#options.warnBefore?.milliseconds;
    const autoOpen = warn !== undefined && !this.#suspended;
    const delay = autoOpen ? Math.max(0, ms - warn) : ms;
    this.#scheduleTimer = setTimeout(() => {
      if (this.dialog.isOpen) return;
      if (autoOpen && this.#remainingMs() <= warn + 50) this.open();
      else this.#schedule();
    }, Math.min(delay, MAX_TIMEOUT));
  }
}
