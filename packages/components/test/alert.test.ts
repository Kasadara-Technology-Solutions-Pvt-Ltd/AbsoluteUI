import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Alert, type AlertActionDetail, type AlertDismissDetail, type AlertOptions } from '@absoluteui/components/alert';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<AlertOptions> = {}): Alert {
  const host = document.createElement('div');
  document.body.append(host);
  return Alert.create(host, { message: 'Your changes were saved.', ...options });
}

const dismissButton = (a: Alert): HTMLButtonElement | null => a.host.querySelector<HTMLButtonElement>('.aui-alert__dismiss');

describe('Alert: semantics', () => {
  it('renders an icon, a visually hidden tone prefix, title, and text message', () => {
    const a = mount({ tone: 'error', title: 'Upload failed' });
    expect(a.host.classList).toContain('aui-alert');
    expect(a.host.classList).toContain('aui-alert--error');
    expect(a.host.querySelector('.aui-alert__icon svg')!.getAttribute('aria-hidden')).toBe('true');
    const tone = a.host.querySelector<HTMLElement>('.aui-alert__tone')!;
    expect(tone.textContent).toBe('Error:');
    expect(tone.getBoundingClientRect().width).toBeLessThanOrEqual(1);
    expect(a.host.querySelector('.aui-alert__title')!.textContent).toBe('Upload failed');
    expect(a.host.querySelector('.aui-alert__message')!.textContent).toBe('Your changes were saved.');
  });

  it('is static by default and maps live to status/alert roles', () => {
    const a = mount();
    expect(a.host.hasAttribute('role')).toBe(false);
    a.update({ live: 'polite' });
    expect(a.host.getAttribute('role')).toBe('status');
    a.update({ live: 'assertive' });
    expect(a.host.getAttribute('role')).toBe('alert');
    a.update({ live: 'off' });
    expect(a.host.hasAttribute('role')).toBe(false);
  });

  it('renders strings as text, never HTML, and accepts Nodes', () => {
    const a = mount({ message: '<img src=x onerror=alert(1)>' });
    expect(a.host.querySelector('img')).toBeNull();
    const strong = document.createElement('strong');
    strong.textContent = 'Heads up';
    a.update({ message: strong });
    expect(a.host.querySelector('.aui-alert__message strong')).toBe(strong);
  });

  it('hides an empty title and uses default tone info', () => {
    const a = mount();
    expect(a.host.querySelector<HTMLElement>('.aui-alert__title')!.hidden).toBe(true);
    expect(a.host.classList).toContain('aui-alert--info');
    expect(a.host.querySelector('.aui-alert__tone')!.textContent).toBe('Information:');
  });

  it('validates options before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'original';
    const bad: unknown[] = [
      { message: ' ' },
      { message: 'x', tone: 'danger' },
      { message: 'x', live: 'loud' },
      { message: 'x', actions: [{ label: '', value: 'a' }] },
      { message: 'x', dismissible: 'yes' },
      { message: 'x', icons: { info: 'no-such-icon' } },
    ];
    for (const options of bad) expect(() => Alert.create(host, options as AlertOptions)).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('original');
    expect(host.className).toBe('');
  });
});

describe('Alert: dismiss', () => {
  it('shows a localized dismiss button only when dismissible', () => {
    const a = mount();
    expect(dismissButton(a)).toBeNull();
    a.update({ dismissible: true });
    expect(dismissButton(a)!.getAttribute('aria-label')).toBe('Dismiss');
    a.update({ dismissible: false });
    expect(dismissButton(a)).toBeNull();
  });

  it('emits cancelable, non-bubbling aui-dismiss and hides', async () => {
    const a = mount({ dismissible: true });
    const outer = vi.fn();
    document.body.addEventListener('aui-dismiss', outer);
    const details: AlertDismissDetail[] = [];
    let block = true;
    a.host.addEventListener('aui-dismiss', (event) => {
      details.push((event as CustomEvent<AlertDismissDetail>).detail);
      if (block) event.preventDefault();
    });
    await userEvent.click(dismissButton(a)!);
    expect(a.isDismissed).toBe(false);
    expect(a.host.hidden).toBe(false);
    block = false;
    await userEvent.click(dismissButton(a)!);
    expect(a.isDismissed).toBe(true);
    expect(a.host.hidden).toBe(true);
    expect(details).toEqual([{ reason: 'dismiss-button' }, { reason: 'dismiss-button' }]);
    expect(outer).not.toHaveBeenCalled();
    expect(a.dismiss()).toBe(false);
  });

  it('dismiss() is programmatic and returns whether it hid the alert', () => {
    const a = mount();
    const reasons: string[] = [];
    a.host.addEventListener('aui-dismiss', (event) => reasons.push((event as CustomEvent<AlertDismissDetail>).detail.reason));
    expect(a.dismiss()).toBe(true);
    expect(reasons).toEqual(['programmatic']);
  });

  it('activates the dismiss button from the keyboard', async () => {
    const a = mount({ dismissible: true });
    dismissButton(a)!.focus();
    await userEvent.keyboard('{Enter}');
    expect(a.isDismissed).toBe(true);
  });
});

describe('Alert: actions', () => {
  it('renders action buttons that emit bubbling aui-action', async () => {
    const a = mount({ actions: [{ label: 'Retry', value: 'retry', variant: 'primary' }, { label: 'Details', value: 'details' }] });
    const values: string[] = [];
    document.body.addEventListener('aui-action', (event) => values.push((event as CustomEvent<AlertActionDetail>).detail.value));
    const buttons = [...a.host.querySelectorAll<HTMLButtonElement>('.aui-alert__actions button')];
    expect(buttons.map((b) => b.textContent)).toEqual(['Retry', 'Details']);
    expect(buttons[0]!.classList).toContain('aui-button--primary');
    await userEvent.click(buttons[0]!);
    buttons[1]!.focus();
    await userEvent.keyboard(' ');
    expect(values).toEqual(['retry', 'details']);
  });

  it('keeps a focused action button across unrelated updates (regression)', () => {
    const a = mount({ actions: [{ label: 'Retry', value: 'retry' }] });
    const button = a.host.querySelector<HTMLButtonElement>('.aui-alert__actions button')!;
    button.focus();
    a.update({ message: 'Still failing' });
    expect(document.activeElement).toBe(button);
    expect(a.host.querySelector<HTMLElement>('.aui-alert__actions')!.hidden).toBe(false);
  });
});

describe('Alert: configuration and localization', () => {
  it('honours global dismissible and instance precedence', () => {
    configureAbsoluteUI({ components: { alert: { dismissible: true } } });
    expect(dismissButton(mount())).not.toBeNull();
    expect(dismissButton(mount({ dismissible: false }))).toBeNull();
  });

  it('localizes the tone prefix and dismiss label, and re-renders on config change', () => {
    registerMessages('alert', 'fr', { error: 'Erreur :', dismiss: 'Fermer' });
    const a = mount({ tone: 'error', dismissible: true });
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(a.host.querySelector('.aui-alert__tone')!.textContent).toBe('Erreur :');
    expect(dismissButton(a)!.getAttribute('aria-label')).toBe('Fermer');
  });

  it('supports icon overrides', () => {
    const a = mount({ tone: 'warning', icons: { warning: 'info' } });
    expect(a.host.querySelector('.aui-alert__icon .aui-icon')).not.toBeNull();
  });
});

describe('Alert: destroy', () => {
  it('removes rendering, role, classes, and subscriptions', () => {
    const a = mount({ tone: 'success', live: 'polite', dismissible: true });
    a.destroy();
    expect(a.host.childElementCount).toBe(0);
    expect(a.host.className).toBe('');
    expect(a.host.hasAttribute('role')).toBe(false);
    configureAbsoluteUI({ locale: 'fr-FR' });
    expect(a.host.childElementCount).toBe(0);
  });
});
