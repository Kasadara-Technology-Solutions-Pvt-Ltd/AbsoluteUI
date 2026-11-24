import { afterEach, describe, expect, it } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { AvatarGroup, avatarGroupConfig, type AvatarGroupOptions } from '@absoluteui/components/avatar-group';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const PEOPLE = ['Ada Lovelace', 'Grace Hopper', 'Alan Turing', 'Edsger Dijkstra', 'Barbara Liskov', 'Donald Knuth'].map((name) => ({ name }));

function mount(options: Partial<AvatarGroupOptions> = {}): AvatarGroup {
  const host = document.createElement('div');
  document.body.append(host);
  return AvatarGroup.create(host, { label: 'Project members', items: PEOPLE, ...options });
}

describe('AvatarGroup', () => {
  it('is a named group of avatars with the overflow announced as "N more"', () => {
    const g = mount();
    expect(g.host.getAttribute('role')).toBe('group');
    expect(g.host.getAttribute('aria-label')).toBe('Project members');
    const avatars = g.host.querySelectorAll('.aui-avatar:not(.aui-avatar-group__more)');
    expect(avatars).toHaveLength(4);
    expect(avatars[0]!.getAttribute('aria-label')).toBe('Ada Lovelace');
    const more = g.host.querySelector('.aui-avatar-group__more')!;
    expect(more.getAttribute('role')).toBe('img');
    expect(more.getAttribute('aria-label')).toBe('2 more');
    expect(more.textContent).toBe('+2');
    expect(g.overflow).toBe(2);
  });

  it('shows everyone without a chip when within max', () => {
    const g = mount({ max: 6 });
    expect(g.host.querySelectorAll('.aui-avatar')).toHaveLength(6);
    expect(g.host.querySelector('.aui-avatar-group__more')).toBeNull();
    expect(g.overflow).toBe(0);
  });

  it('passes size and shape to every avatar and the chip; follows configuration', () => {
    const g = mount({ size: 'sm' });
    for (const el of g.host.querySelectorAll('.aui-avatar')) expect(el.classList).toContain('aui-avatar--sm');
    configureAbsoluteUI({ components: { avatarGroup: { max: 2 }, avatar: { shape: 'square' } } });
    expect(g.host.querySelectorAll('.aui-avatar:not(.aui-avatar-group__more)')).toHaveLength(2);
    expect(g.host.querySelector('.aui-avatar-group__more')!.getAttribute('aria-label')).toBe('4 more');
    expect(g.host.querySelector('.aui-avatar')!.classList).toContain('aui-avatar--square');
    expect([...avatarGroupConfig.optionNames].sort()).toEqual(['locale', 'max']);
  });

  it('keeps the previous rendering when an update is invalid', () => {
    const g = mount();
    expect(() => {
      g.update({ items: [{ name: 'Ok' }, { name: 'Bad', src: 'javascript:alert(1)' }] });
    }).toThrow(AbsoluteUIError);
    expect(g.host.querySelectorAll('.aui-avatar:not(.aui-avatar-group__more)')).toHaveLength(4);
    g.update({ items: [{ name: 'Linus Torvalds' }], label: 'Owner' });
    expect(g.host.getAttribute('aria-label')).toBe('Owner');
    expect(g.host.querySelectorAll('.aui-avatar')).toHaveLength(1);
  });

  it('validates options before touching the host', () => {
    const host = document.createElement('div');
    const bad: unknown[] = [{ label: '', items: [] }, { label: 'x', items: 'Ada' }, { label: 'x', items: [], max: 0 }, { label: 'x', items: [{ name: '' }] }];
    for (const options of bad) expect(() => AvatarGroup.create(host, options as AvatarGroupOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
  });

  it('destroy removes rendering, attributes, and subscriptions', () => {
    const g = mount();
    g.destroy();
    expect(g.host.childNodes.length).toBe(0);
    expect(g.host.getAttributeNames().filter((n) => n !== 'class')).toEqual([]);
    configureAbsoluteUI({ components: { avatarGroup: { max: 1 } } });
    expect(g.host.childNodes.length).toBe(0);
  });
});
