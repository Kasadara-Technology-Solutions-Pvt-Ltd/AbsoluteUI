import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Badge, badgeConfig, type BadgeOptions } from '@absoluteui/components/badge';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<BadgeOptions> = {}): Badge {
  const host = document.createElement('span');
  document.body.append(host);
  return Badge.create(host, { label: 'Active', ...options });
}

describe('Badge', () => {
  it('renders the label with neutral, subtle, and md defaults', () => {
    const b = mount();
    expect(b.host.classList).toContain('aui-badge');
    expect(b.host.classList).toContain('aui-badge--neutral');
    expect(b.host.classList).toContain('aui-badge--subtle');
    expect(b.host.classList).toContain('aui-badge--md');
    expect(b.host.querySelector('.aui-badge__label')!.textContent).toBe('Active');
    expect(b.host.textContent).toBe('Active');
    expect(b.host.hasAttribute('role')).toBe(false);
    expect(b.host.hasAttribute('tabindex')).toBe(false);
  });

  it('shows a decorative dot or icon, never both', () => {
    const b = mount({ tone: 'success', dot: true });
    const dot = b.host.querySelector<HTMLElement>('.aui-badge__dot')!;
    expect(dot.hidden).toBe(false);
    expect(dot.getAttribute('aria-hidden')).toBe('true');
    b.update({ dot: false, icon: 'check' });
    const icon = b.host.querySelector<HTMLElement>('.aui-badge__icon')!;
    expect(icon.querySelector('svg')).not.toBeNull();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    expect(() => {
      b.update({ dot: true });
    }).toThrow(AbsoluteUIError);
    b.update({ icon: null });
    expect(b.host.querySelector<HTMLElement>('.aui-badge__dot')!.hidden).toBe(true);
  });

  it('updates tone, variant, and size in place', () => {
    const b = mount({ tone: 'warning' });
    const label = b.host.querySelector('.aui-badge__label');
    b.update({ tone: 'error', variant: 'outline', size: 'sm', label: 'Overdue' });
    expect(b.host.querySelector('.aui-badge__label')).toBe(label);
    expect(b.label).toBe('Overdue');
    expect(b.host.classList).toContain('aui-badge--error');
    expect(b.host.classList).not.toContain('aui-badge--warning');
    expect(b.host.classList).toContain('aui-badge--outline');
    expect(b.host.classList).toContain('aui-badge--sm');
  });

  it('takes variant and size from global configuration until set on the instance', () => {
    const b = mount();
    configureAbsoluteUI({ components: { badge: { variant: 'outline', size: 'sm' } } });
    expect(b.host.classList).toContain('aui-badge--outline');
    expect(b.host.classList).toContain('aui-badge--sm');
    b.update({ variant: 'subtle' });
    expect(b.host.classList).toContain('aui-badge--subtle');
    expect([...badgeConfig.optionNames].sort()).toEqual(['size', 'variant']);
  });

  it('renders text only (no HTML parsing)', () => {
    const b = mount({ label: '<b>new</b>' });
    expect(b.host.querySelector('b')).toBeNull();
    expect(b.label).toBe('<b>new</b>');
  });

  it('validates options before touching the host, and on update', () => {
    const host = document.createElement('span');
    const bad: unknown[] = [{ label: '' }, { label: 'x', tone: 'primary' }, { label: 'x', variant: 'solid' }, { label: 'x', size: 'lg' }, { label: 'x', dot: 'yes' }, { label: 'x', icon: 'nope' }, { label: 'x', dot: true, icon: 'check' }];
    for (const options of bad) expect(() => Badge.create(host, options as BadgeOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const b = mount();
    expect(() => {
      b.update({ label: ' ' });
    }).toThrow(AbsoluteUIError);
    expect(b.label).toBe('Active');
  });

  it('destroy removes rendering, classes, and subscriptions', () => {
    const b = mount({ tone: 'info', dot: true });
    b.destroy();
    expect(b.host.childNodes.length).toBe(0);
    expect(b.host.className).toBe('');
    configureAbsoluteUI({ components: { badge: { size: 'sm' } } });
    expect(b.host.className).toBe('');
  });
});
