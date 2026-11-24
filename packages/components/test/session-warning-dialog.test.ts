import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, duration, instant, resetAbsoluteUIConfig } from '@absoluteui/core';
import { formatRemaining, SessionWarningDialog, type SessionWarningDialogOptions, type SessionWarningExtendDetail, type SessionWarningSignOutDetail } from '@absoluteui/components/session-warning-dialog';

// Fixed instant: tests never depend on the machine clock or timezone.
const T0 = Date.UTC(2026, 2, 8, 6, 30, 0);
let dialogs: SessionWarningDialog[] = [];

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout', 'Date'], now: T0 });
});

afterEach(() => {
  for (const d of dialogs) d.destroy();
  dialogs = [];
  vi.useRealTimers();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function create(options: Partial<SessionWarningDialogOptions> = {}): SessionWarningDialog {
  const d = SessionWarningDialog.create({ expiresAt: instant(T0 + 120_000), ...options });
  dialogs.push(d);
  return d;
}

const countdown = (d: SessionWarningDialog): string => d.element.querySelector('.aui-session-warning__countdown')!.textContent;
const buttons = (d: SessionWarningDialog): string[] => Array.from(d.element.querySelectorAll('.aui-dialog__footer button')).map((b) => b.textContent);
/** announce() writes on the next animation frame; frames are not faked. */
const announced = async (): Promise<string> => {
  await new Promise((r) => requestAnimationFrame(() => { r(null); }));
  return document.querySelector('dialog [data-aui-live-region="polite"]')?.textContent ?? '';
};

describe('SessionWarningDialog: semantics', () => {
  it('opens as an alert dialog described by the message and countdown, focusing "Stay signed in"', () => {
    const d = create();
    d.open();
    const el = d.element;
    expect(el.open).toBe(true);
    expect(el.getAttribute('role')).toBe('alertdialog');
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent).toBe('Your session is about to expire');
    const described = el.getAttribute('aria-describedby')!.split(' ').map((id) => document.getElementById(id)!.textContent);
    expect(described).toEqual(['You will be signed out soon because you have been inactive. Do you want to stay signed in?', 'Time remaining: 2 minutes']);
    expect(buttons(d)).toEqual(['Stay signed in', 'Sign out']);
    expect(document.activeElement?.textContent).toBe('Stay signed in');
    expect(el.querySelector('.aui-dialog__close')).toBeNull();
  });

  it('validates options (warnBefore must allow at least 20 seconds, WCAG 2.2.1)', () => {
    // @ts-expect-error runtime validation
    expect(() => SessionWarningDialog.create({ expiresAt: T0 })).toThrow(AbsoluteUIError);
    expect(() => SessionWarningDialog.create({ expiresAt: instant(T0), warnBefore: duration(5000) })).toThrow(/warnBefore/);
    expect(document.querySelector('dialog')).toBeNull();
  });

  it('formats remaining time with Intl units in the locale', () => {
    expect(formatRemaining(90, 'en-US')).toBe('1 minute, 30 seconds');
    expect(formatRemaining(3661, 'en-US')).toBe('1 hour, 1 minute, 1 second');
    expect(formatRemaining(0, 'en-US')).toBe('0 seconds');
    expect(formatRemaining(120, 'de-DE')).toBe('2 Minuten');
  });
});

describe('SessionWarningDialog: countdown and announcements', () => {
  it('updates the countdown every second and announces only at thresholds', async () => {
    const d = create({ expiresAt: instant(T0 + 125_000) });
    d.open();
    expect(countdown(d)).toBe('Time remaining: 2 minutes, 5 seconds');
    await vi.advanceTimersByTimeAsync(1000);
    expect(countdown(d)).toBe('Time remaining: 2 minutes, 4 seconds');
    expect(await announced()).toBe('');
    await vi.advanceTimersByTimeAsync(4000);
    expect(await announced()).toBe('Time remaining: 2 minutes');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(countdown(d)).toBe('Time remaining: 1 minute, 30 seconds');
    expect(await announced()).toBe('Time remaining: 2 minutes');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await announced()).toBe('Time remaining: 1 minute');
    await vi.advanceTimersByTimeAsync(30_000);
    expect(await announced()).toBe('Time remaining: 30 seconds');
    expect(d.remaining.milliseconds).toBe(30_000);
  });

  it('is timezone independent: only the deadline and the clock matter (survives throttled timers)', async () => {
    const d = create();
    d.open();
    // Simulate a background tab whose timers were paused: the clock jumps 90 s at once.
    vi.setSystemTime(T0 + 90_000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(countdown(d)).toBe('Time remaining: 29 seconds');
  });

  it('switches to the expired state, emits aui-expire, and offers only "Sign in again"', async () => {
    const d = create({ expiresAt: instant(T0 + 3000) });
    const events: string[] = [];
    d.element.addEventListener('aui-expire', () => events.push('expire'));
    d.element.addEventListener('aui-sign-out', (e) => events.push(`sign-out:${(e as CustomEvent<SessionWarningSignOutDetail>).detail.reason}`));
    d.open();
    await vi.advanceTimersByTimeAsync(3000);
    expect(events).toEqual(['expire']);
    expect(d.expired).toBe(true);
    expect(document.getElementById(d.element.getAttribute('aria-labelledby')!)!.textContent).toBe('Your session has expired');
    expect(buttons(d)).toEqual(['Sign in again']);
    expect(document.activeElement?.textContent).toBe('Sign in again');
    await new Promise((r) => requestAnimationFrame(() => { r(null); }));
    expect(document.querySelector('dialog [data-aui-live-region="assertive"]')?.textContent).toBe('You have been signed out. Sign in again to continue.');
    (document.activeElement as HTMLButtonElement).click();
    expect(events).toEqual(['expire', 'sign-out:expired']);
    expect(d.isOpen).toBe(false);
  });
});

describe('SessionWarningDialog: actions', () => {
  it('"Stay signed in", Escape, and "Sign out" emit non-bubbling events; nothing is extended on its own', async () => {
    const d = create();
    const events: string[] = [];
    const record = (e: Event): void => {
      events.push(`${e.type}:${(e as CustomEvent<SessionWarningExtendDetail>).detail.reason}`);
    };
    d.element.addEventListener('aui-extend', record);
    d.element.addEventListener('aui-sign-out', record);
    document.body.addEventListener('aui-extend', () => events.push('bubbled'));
    d.open();
    await userEvent.keyboard('{Enter}');
    expect(events).toEqual(['aui-extend:action']);
    expect(d.isOpen).toBe(false);
    d.open();
    await userEvent.keyboard('{Escape}');
    expect(events).toEqual(['aui-extend:action', 'aui-extend:escape']);
    d.open();
    await userEvent.keyboard('{Tab}{Enter}');
    expect(events).toEqual(['aui-extend:action', 'aui-extend:escape', 'aui-sign-out:action']);
    // The deadline is unchanged: extending is the application's job.
    expect(d.options.expiresAt.epochMilliseconds).toBe(T0 + 120_000);
  });

  it('escapeExtends: false keeps the dialog open on Escape', async () => {
    const d = create({ escapeExtends: false });
    d.open();
    await userEvent.keyboard('{Escape}');
    expect(d.isOpen).toBe(true);
  });

  it('warnBefore opens automatically; after an answer it waits for a new deadline', async () => {
    const d = create({ expiresAt: instant(T0 + 300_000), warnBefore: duration(60_000) });
    await vi.advanceTimersByTimeAsync(239_000);
    expect(d.isOpen).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.isOpen).toBe(true);
    d.element.querySelector<HTMLButtonElement>('.aui-dialog__footer button')!.click();
    await vi.advanceTimersByTimeAsync(5000);
    expect(d.isOpen).toBe(false);
    // The application extended the session: the next warning is armed for the new deadline.
    d.update({ expiresAt: instant(Date.now() + 120_000) });
    await vi.advanceTimersByTimeAsync(59_000);
    expect(d.isOpen).toBe(false);
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.isOpen).toBe(true);
  });

  it('re-sending an unchanged deadline does not reopen an answered warning (regression)', async () => {
    const d = create({ expiresAt: instant(T0 + 100_000), warnBefore: duration(60_000) });
    await vi.advanceTimersByTimeAsync(40_000);
    expect(d.isOpen).toBe(true);
    d.element.querySelector<HTMLButtonElement>('.aui-dialog__footer button')!.click();
    // Framework bindings pass every option again on each change.
    d.update({ expiresAt: instant(T0 + 100_000), warnBefore: duration(60_000), title: 'Still there?' });
    await vi.advanceTimersByTimeAsync(1000);
    expect(d.isOpen).toBe(false);
  });

  it('emits aui-expire at the deadline even while closed', async () => {
    const d = create({ expiresAt: instant(T0 + 10_000) });
    let expired = 0;
    d.element.addEventListener('aui-expire', () => expired++);
    await vi.advanceTimersByTimeAsync(10_000);
    expect(expired).toBe(1);
    expect(d.isOpen).toBe(false);
  });

  it('destroy removes the dialog and stops timers', async () => {
    const d = create({ expiresAt: instant(T0 + 10_000) });
    d.open();
    d.destroy();
    dialogs = [];
    expect(document.querySelector('dialog')).toBeNull();
    await vi.advanceTimersByTimeAsync(20_000);
  });
});
