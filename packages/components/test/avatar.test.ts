import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, registerMessages, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Avatar, avatarConfig, avatarInitials, isSafeImageSrc, type AvatarOptions } from '@absoluteui/components/avatar';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<AvatarOptions> = {}): Avatar {
  const host = document.createElement('span');
  document.body.append(host);
  return Avatar.create(host, { name: 'Ada Lovelace', ...options });
}

// A 1x1 transparent PNG.
const PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

describe('Avatar', () => {
  it('shows initials and is one named image to assistive technology', () => {
    const a = mount();
    expect(a.shows).toBe('initials');
    expect(a.host.getAttribute('role')).toBe('img');
    expect(a.host.getAttribute('aria-label')).toBe('Ada Lovelace');
    const visual = a.host.querySelector('.aui-avatar__visual')!;
    expect(visual.textContent).toBe('AL');
    expect(visual.getAttribute('aria-hidden')).toBe('true');
    expect(a.host.classList).toContain('aui-avatar--md');
    expect(a.host.classList).toContain('aui-avatar--circle');
  });

  it('derives initials from words, letters, and digits', () => {
    expect(avatarInitials('grace hopper', 'en-US')).toBe('GH');
    expect(avatarInitials('Linus')).toBe('L');
    expect(avatarInitials('Jean-Luc Picard')).toBe('JP');
    expect(avatarInitials('  ops@example.com ')).toBe('OC');
    expect(avatarInitials('Émile Zola')).toBe('ÉZ');
    expect(avatarInitials('---')).toBe('');
  });

  it('shows a safe image and falls back to initials when it fails to load', () => {
    const a = mount({ src: PNG });
    expect(a.shows).toBe('image');
    const img = a.host.querySelector('img')!;
    expect(img.alt).toBe('');
    expect(img.getAttribute('referrerpolicy')).toBe('no-referrer');
    expect(img.getAttribute('loading')).toBe('lazy');
    img.dispatchEvent(new Event('error'));
    expect(a.shows).toBe('initials');
    expect(a.host.querySelector('img')).toBeNull();
    // A new src is tried again.
    a.update({ src: `${PNG}=` });
    expect(a.shows).toBe('image');
  });

  it('rejects unsafe image sources', () => {
    expect(isSafeImageSrc('https://cdn.example.com/a.png')).toBe(true);
    expect(isSafeImageSrc('/avatars/ada.webp')).toBe(true);
    expect(isSafeImageSrc('blob:https://app.example.com/1234')).toBe(true);
    expect(isSafeImageSrc(PNG)).toBe(true);
    for (const bad of ['javascript:alert(1)', 'java\tscript:alert(1)', 'data:image/svg+xml;base64,PHN2Zz4=', 'data:text/html;base64,PGI+', 'vbscript:x', '', 42]) expect(isSafeImageSrc(bad)).toBe(false);
    expect(() => mount({ src: 'javascript:alert(1)' })).toThrow(AbsoluteUIError);
  });

  it('uses the icon when the name has no initials, else the first character', () => {
    const a = mount({ name: '---', icon: 'menu' });
    expect(a.shows).toBe('icon');
    expect(a.host.querySelector('.aui-avatar__visual svg')).not.toBeNull();
    a.update({ icon: null });
    expect(a.shows).toBe('initials');
    expect(a.host.querySelector('.aui-avatar__visual')!.textContent).toBe('-');
  });

  it('names the status and shows its dot; decorative avatars are hidden', () => {
    const a = mount({ status: 'away' });
    expect(a.host.getAttribute('aria-label')).toBe('Ada Lovelace, Away');
    expect(a.host.querySelector<HTMLElement>('.aui-avatar__status')!.hidden).toBe(false);
    expect(a.host.classList).toContain('aui-avatar--status-away');
    a.update({ status: null, decorative: true });
    expect(a.host.getAttribute('aria-hidden')).toBe('true');
    expect(a.host.hasAttribute('role')).toBe(false);
    expect(a.host.hasAttribute('aria-label')).toBe(false);
    expect(a.host.querySelector<HTMLElement>('.aui-avatar__status')!.hidden).toBe(true);
  });

  it('follows configuration for size, shape, and locale', () => {
    const a = mount({ status: 'busy' });
    registerMessages('avatar', 'de', { busy: 'Beschäftigt' });
    configureAbsoluteUI({ common: { locale: 'de-DE' }, components: { avatar: { size: 'lg', shape: 'square' } } });
    expect(a.host.classList).toContain('aui-avatar--lg');
    expect(a.host.classList).toContain('aui-avatar--square');
    expect(a.host.getAttribute('aria-label')).toBe('Ada Lovelace, Beschäftigt');
    expect([...avatarConfig.optionNames].sort()).toEqual(['locale', 'shape', 'size']);
  });

  it('validates options before touching the host, and on update', () => {
    const host = document.createElement('span');
    const bad: unknown[] = [{ name: '' }, { name: 'x', status: 'idle' }, { name: 'x', size: 'xxl' }, { name: 'x', shape: 'hex' }, { name: 'x', decorative: 'yes' }, { name: 'x', src: 'ftp://x/y.png' }];
    for (const options of bad) expect(() => Avatar.create(host, options as AvatarOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const a = mount();
    expect(() => {
      a.update({ name: ' ' });
    }).toThrow(AbsoluteUIError);
    expect(a.name).toBe('Ada Lovelace');
  });

  it('destroy removes rendering, attributes, classes, and subscriptions', () => {
    const a = mount({ status: 'online', src: PNG });
    a.destroy();
    expect(a.host.childNodes.length).toBe(0);
    expect(a.host.className).toBe('');
    expect(a.host.getAttributeNames().filter((n) => n !== 'class')).toEqual([]);
    configureAbsoluteUI({ components: { avatar: { size: 'sm' } } });
    expect(a.host.className).toBe('');
  });
});
