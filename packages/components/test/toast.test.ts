import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { toast, Toaster, type ToastCloseDetail, type ToasterOptions, type ToastOpenDetail } from '@absoluteui/components/toast';

const toasters: Toaster[] = [];

afterEach(() => {
  for (const t of toasters.splice(0)) t.destroy();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function create(options: ToasterOptions = {}): Toaster {
  const t = Toaster.create(options);
  toasters.push(t);
  return t;
}

const wait = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));
const nextFrame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => {
  resolve();
}));
const toastEls = (t: Toaster): HTMLElement[] => [...t.element.querySelectorAll<HTMLElement>('.aui-toast')];
const messages = (t: Toaster): string[] => toastEls(t).map((el) => el.querySelector('.aui-toast__message')!.textContent);
const liveText = (politeness: 'polite' | 'assertive'): string => document.querySelector(`[data-aui-live-region="${politeness}"]`)?.textContent ?? '';

function record(t: Toaster): { opened: string[]; closed: ToastCloseDetail[] } {
  const opened: string[] = [];
  const closed: ToastCloseDetail[] = [];
  t.element.addEventListener('aui-open', (event) => opened.push((event as CustomEvent<ToastOpenDetail>).detail.id));
  t.element.addEventListener('aui-close', (event) => closed.push((event as CustomEvent<ToastCloseDetail>).detail));
  return { opened, closed };
}

describe('Toaster: region and semantics', () => {
  it('creates a labelled, manual-popover region that is open only while it has toasts', () => {
    const t = create();
    const el = t.element;
    expect(el.tagName).toBe('SECTION');
    expect(el.getAttribute('aria-label')).toBe('Notifications');
    expect(el.popover).toBe('manual');
    expect(el.parentElement).toBe(document.body);
    expect(el.matches(':popover-open')).toBe(false);
    const h = t.show({ message: 'Saved', duration: 0 });
    expect(el.matches(':popover-open')).toBe(true);
    h.dismiss();
    expect(el.matches(':popover-open')).toBe(false);
  });

  it('renders tone icon, hidden prefix, title, message; the toast is a labelled group, not a live region', () => {
    const t = create();
    t.show({ tone: 'success', title: 'Upload complete', message: 'report.pdf', duration: 0 });
    const el = toastEls(t)[0]!;
    expect(el.classList).toContain('aui-toast--success');
    expect(el.getAttribute('role')).toBe('group');
    expect(el.tabIndex).toBe(-1);
    expect(document.getElementById(el.getAttribute('aria-labelledby')!)!.textContent).toBe('Success:Upload completereport.pdf');
    expect(el.querySelector('.aui-toast__icon svg')!.getAttribute('aria-hidden')).toBe('true');
    expect(t.element.querySelector('[aria-live], [role="status"], [role="alert"]')).toBeNull();
    expect(el.querySelector('.aui-toast__dismiss')!.getAttribute('aria-label')).toBe('Dismiss notification');
  });

  it('never steals focus', () => {
    const button = document.createElement('button');
    document.body.append(button);
    button.focus();
    const t = create();
    t.show({ message: 'Hello', duration: 0 });
    expect(document.activeElement).toBe(button);
  });

  it('renders text only', () => {
    const t = create();
    t.show({ message: '<img src=x>', title: '<b>t</b>', duration: 0 });
    expect(t.element.querySelector('img, b')).toBeNull();
  });
});

describe('Toaster: announcements', () => {
  it('announces info/success politely and warning/error assertively, after a frame', async () => {
    const t = create();
    t.show({ tone: 'success', title: 'Saved', message: 'Draft stored.', duration: 0 });
    await nextFrame();
    expect(liveText('polite')).toBe('Success: Saved Draft stored.');
    t.show({ tone: 'error', message: 'Upload failed.' });
    await nextFrame();
    expect(liveText('assertive')).toBe('Error: Upload failed.');
    t.show({ tone: 'warning', message: 'Storage almost full.', duration: 0 });
    await nextFrame();
    expect(liveText('assertive')).toBe('Warning: Storage almost full.');
  });

  it('announces queued toasts when they become visible, and re-announces updates', async () => {
    const t = create({ max: 1 });
    const first = t.show({ message: 'First', duration: 0 });
    const second = t.show({ message: 'Second', duration: 0 });
    await nextFrame();
    expect(liveText('polite')).toBe('Information: First');
    first.dismiss();
    await nextFrame();
    expect(liveText('polite')).toBe('Information: Second');
    second.update({ message: 'Second, updated' });
    await nextFrame();
    expect(liveText('polite')).toBe('Information: Second, updated');
    expect(messages(t)).toEqual(['Second, updated']);
  });
});

describe('Toaster: timing', () => {
  it('auto-dismisses after duration with reason timeout; events do not bubble', async () => {
    const t = create({ duration: 60 });
    const log = record(t);
    const outer = vi.fn();
    document.body.addEventListener('aui-close', outer);
    document.body.addEventListener('aui-open', outer);
    const h = t.show({ message: 'Bye soon' });
    expect(log.opened).toEqual([h.id]);
    await wait(150);
    expect(t.count).toBe(0);
    expect(log.closed).toEqual([{ id: h.id, reason: 'timeout' }]);
    expect(outer).not.toHaveBeenCalled();
  });

  it('keeps error toasts until dismissed by default; duration 0 is persistent', async () => {
    const t = create({ duration: 40 });
    t.show({ tone: 'error', message: 'Failed' });
    t.show({ message: 'Sticky', duration: 0 });
    t.show({ tone: 'error', message: 'Timed error', duration: 40 });
    // Poll rather than a fixed wait (regression: flaky under suite load, when timers run late);
    // the persistent toasts must still be there once the timed one has gone.
    await expect.poll(() => messages(t), { timeout: 2000 }).toEqual(['Failed', 'Sticky']);
    await wait(120);
    expect(messages(t)).toEqual(['Failed', 'Sticky']);
  });

  it('pauses while hovered and resumes with the remaining time', async () => {
    const away = document.createElement('button');
    away.textContent = 'Elsewhere';
    document.body.prepend(away);
    const t = create({ duration: 150 });
    // A persistent toast gives a stable hover target; the timed toast is shown while hovered.
    t.show({ message: 'Hover me', duration: 0 });
    await userEvent.hover(toastEls(t)[0]!);
    t.show({ message: 'Timed' });
    await wait(300);
    expect(messages(t)).toEqual(['Hover me', 'Timed']);
    // unhover() targets the body centre, where the unstyled region sits; move to a real element instead.
    await userEvent.hover(away);
    await wait(300);
    expect(messages(t)).toEqual(['Hover me']);
  });

  it('pauses while focus is inside the region', async () => {
    const outside = document.createElement('button');
    document.body.append(outside);
    const t = create({ duration: 150 });
    t.show({ message: 'Focus me' });
    toastEls(t)[0]!.querySelector<HTMLButtonElement>('.aui-toast__dismiss')!.focus();
    await wait(300);
    expect(t.count).toBe(1);
    outside.focus();
    await wait(300);
    expect(t.count).toBe(0);
  });
});

describe('Toaster: queueing', () => {
  it('shows at most `max` toasts and queues the rest first-in, first-out', async () => {
    const t = create({ max: 2, duration: 0 });
    const log = record(t);
    const a = t.show({ message: 'A' });
    const b = t.show({ message: 'B' });
    const c = t.show({ message: 'C' });
    const d = t.show({ message: 'D' });
    expect(messages(t)).toEqual(['A', 'B']);
    expect([t.count, t.queued]).toEqual([2, 2]);
    // Dropping a queued toast emits nothing: it was never shown.
    c.dismiss();
    a.dismiss();
    expect(messages(t)).toEqual(['B', 'D']);
    expect(log.opened).toEqual([a.id, b.id, d.id]);
    expect(log.closed).toEqual([{ id: a.id, reason: 'programmatic' }]);
    await userEvent.click(toastEls(t)[0]!.querySelector('.aui-toast__dismiss')!);
    expect(log.closed.at(-1)).toEqual({ id: b.id, reason: 'dismiss' });
  });

  it('follows global max and duration configuration; instance options win', () => {
    configureAbsoluteUI({ components: { toast: { max: 1, position: 'top-start' } } });
    const t = create();
    t.show({ message: 'A', duration: 0 });
    t.show({ message: 'B', duration: 0 });
    expect(t.count).toBe(1);
    expect(t.element.classList).toContain('aui-toaster--top-start');
    const u = create({ max: 5, position: 'bottom-center' });
    u.show({ message: 'A', duration: 0 });
    u.show({ message: 'B', duration: 0 });
    expect(u.count).toBe(2);
    expect(u.element.classList).toContain('aui-toaster--bottom-center');
  });

  it('keeps DOM order equal to visual order: newest nearest the edge', () => {
    const top = create({ position: 'top-end', duration: 0 });
    top.show({ message: 'old' });
    top.show({ message: 'new' });
    expect(messages(top)).toEqual(['new', 'old']);
    top.update({ position: 'bottom-end' });
    expect(messages(top)).toEqual(['old', 'new']);
  });
});

describe('Toaster: actions and dismissal', () => {
  it('runs the action, then closes with reason action', async () => {
    const t = create({ duration: 0 });
    const log = record(t);
    const onAction = vi.fn();
    const h = t.show({ message: 'Message archived', action: { label: 'Undo', onAction } });
    const button = toastEls(t)[0]!.querySelector<HTMLButtonElement>('.aui-toast__actions button')!;
    expect(button.textContent).toBe('Undo');
    await userEvent.click(button);
    expect(onAction).toHaveBeenCalledOnce();
    expect(log.closed).toEqual([{ id: h.id, reason: 'action' }]);
  });

  it('handle.update replaces content and action; handles are inert after close', () => {
    const t = create({ duration: 0 });
    const h = t.show({ message: 'Uploading' });
    expect(toastEls(t)[0]!.querySelector<HTMLElement>('.aui-toast__actions')!.hidden).toBe(true);
    h.update({ tone: 'success', message: 'Uploaded', action: { label: 'View' } });
    const el = toastEls(t)[0]!;
    expect(el.classList).toContain('aui-toast--success');
    expect(el.querySelector('.aui-toast__actions button')!.textContent).toBe('View');
    h.dismiss();
    expect(() => {
      h.update({ message: 'late' });
      h.dismiss();
    }).not.toThrow();
  });

  it('clear() dismisses visible and queued toasts', () => {
    const t = create({ max: 1, duration: 0 });
    const log = record(t);
    t.show({ message: 'A' });
    t.show({ message: 'B' });
    t.clear();
    expect([t.count, t.queued]).toEqual([0, 0]);
    expect(log.closed.map((c) => c.reason)).toEqual(['programmatic']);
  });
});

describe('Toaster: keyboard', () => {
  it('moves focus to the newest toast with the hotkey; Escape dismisses and returns focus', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    const t = create({ duration: 0 });
    const log = record(t);
    t.show({ message: 'Older' });
    const newest = t.show({ message: 'Newest' });
    field.focus();
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(document.activeElement).toBe(toastEls(t)[1]);
    await userEvent.keyboard('{Escape}');
    expect(log.closed).toEqual([{ id: newest.id, reason: 'dismiss' }]);
    expect(document.activeElement).toBe(field);
    expect(messages(t)).toEqual(['Older']);
  });

  it('Tab reaches toast buttons; Escape from a button dismisses that toast', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    const t = create({ duration: 0 });
    t.show({ message: 'Only', action: { label: 'Retry' } });
    field.focus();
    await userEvent.keyboard('{Alt>}t{/Alt}');
    await userEvent.tab();
    expect(document.activeElement?.textContent).toBe('Retry');
    await userEvent.tab();
    expect(document.activeElement?.classList).toContain('aui-toast__dismiss');
    await userEvent.keyboard('{Enter}');
    expect(t.count).toBe(0);
    expect(document.activeElement).toBe(field);
  });

  it('supports a custom hotkey, and null disables it', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    const t = create({ duration: 0, hotkey: 'Alt+Shift+N' });
    t.show({ message: 'Hi' });
    field.focus();
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(document.activeElement).toBe(field);
    await userEvent.keyboard('{Alt>}{Shift>}N{/Shift}{/Alt}');
    expect(document.activeElement).toBe(toastEls(t)[0]);
    field.focus();
    t.update({ hotkey: null });
    await userEvent.keyboard('{Alt>}{Shift>}N{/Shift}{/Alt}');
    expect(document.activeElement).toBe(field);
  });

  it('ignores the hotkey when there are no toasts', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    create();
    field.focus();
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(document.activeElement).toBe(field);
  });
});

describe('Toaster: modal dialogs', () => {
  it('moves into an open modal dialog so toasts stay above it and interactive, then moves back', async () => {
    const dialog = document.createElement('dialog');
    const inside = document.createElement('button');
    dialog.append(inside);
    document.body.append(dialog);
    dialog.showModal();
    inside.focus();
    const t = create({ duration: 0 });
    t.show({ message: 'Saved' });
    expect(t.element.parentElement).toBe(dialog);
    expect(t.element.matches(':popover-open')).toBe(true);
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(document.activeElement).toBe(toastEls(t)[0]);
    await userEvent.keyboard('{Escape}');
    expect(dialog.open).toBe(true);
    expect(document.activeElement).toBe(inside);
    t.show({ message: 'Still here' });
    dialog.close();
    await wait(50);
    expect(t.element.parentElement).toBe(document.body);
    expect(t.element.matches(':popover-open')).toBe(true);
  });
});

describe('Toaster: validation, localization, lifecycle', () => {
  it('rejects invalid toaster options before appending anything', () => {
    const bad: unknown[] = [{ max: 0 }, { duration: -1 }, { position: 'middle' }, { hotkey: '' }];
    for (const options of bad) expect(() => Toaster.create(options as ToasterOptions)).toThrow(AbsoluteUIError);
    expect(document.body.querySelector('.aui-toaster')).toBeNull();
  });

  it('rejects invalid toast options without showing anything', () => {
    const t = create();
    const bad: unknown[] = [{ message: '' }, { message: 'x', tone: 'neutral' }, { message: 'x', duration: 1.5 }, { message: 'x', action: { label: ' ' } }];
    for (const options of bad) expect(() => t.show(options as { message: string })).toThrow(AbsoluteUIError);
    expect(t.count + t.queued).toBe(0);
  });

  it('localizes region label, prefixes, and dismiss label', async () => {
    registerMessages('toast', 'fr', { region: 'Notifications FR', dismiss: 'Fermer la notification', error: 'Erreur :' });
    const t = create({ duration: 0 });
    t.show({ tone: 'error', message: 'Échec' });
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(t.element.getAttribute('aria-label')).toBe('Notifications FR');
    expect(t.element.querySelector('.aui-toast__dismiss')!.getAttribute('aria-label')).toBe('Fermer la notification');
    t.show({ tone: 'error', message: 'Encore' });
    await nextFrame();
    expect(liveText('assertive')).toBe('Erreur : Encore');
  });

  it('toast() uses one lazily created default Toaster per document', () => {
    const a = toast({ message: 'One', duration: 0 });
    const b = toast({ message: 'Two', duration: 0 });
    const regions = document.querySelectorAll('.aui-toaster');
    expect(regions.length).toBe(1);
    expect(regions[0]!.querySelectorAll('.aui-toast').length).toBe(2);
    expect(a.id).not.toBe(b.id);
    document.body.replaceChildren();
    const c = toast({ message: 'Three', duration: 0 });
    expect(document.querySelectorAll('.aui-toaster').length).toBe(1);
    c.dismiss();
  });

  it('destroy removes the region, timers, and the hotkey listener without emitting', async () => {
    const field = document.createElement('input');
    document.body.append(field);
    const t = Toaster.create({ duration: 40 });
    const log = record(t);
    t.show({ message: 'A' });
    t.destroy();
    expect(t.element.isConnected).toBe(false);
    await wait(100);
    expect(log.closed).toEqual([]);
    field.focus();
    await userEvent.keyboard('{Alt>}t{/Alt}');
    expect(document.activeElement).toBe(field);
    expect(() => t.show({ message: 'late' })).toThrow(AbsoluteUIError);
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(t.element.childElementCount).toBe(1);
  });
});
