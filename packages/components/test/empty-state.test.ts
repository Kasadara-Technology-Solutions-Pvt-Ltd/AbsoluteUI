import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { EmptyState, type EmptyStateActionDetail, type EmptyStateOptions } from '@absoluteui/components/empty-state';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<EmptyStateOptions> = {}): EmptyState {
  const host = document.createElement('div');
  document.body.append(host);
  return EmptyState.create(host, { title: 'No employees found', description: 'Try another search.', ...options });
}

describe('EmptyState', () => {
  it('renders a title heading at level 3, a description, and a decorative icon', () => {
    const e = mount({ icon: 'search' });
    const title = e.host.querySelector('.aui-empty-state__title')!;
    expect(title.localName).toBe('h3');
    expect(title.textContent).toBe('No employees found');
    expect(e.host.querySelector('.aui-empty-state__description')!.textContent).toBe('Try another search.');
    const media = e.host.querySelector<HTMLElement>('.aui-empty-state__media')!;
    expect(media.getAttribute('aria-hidden')).toBe('true');
    expect(media.querySelector('svg')).not.toBeNull();
    expect(e.host.classList.contains('aui-empty-state--md')).toBe(true);
    expect(e.host.hasAttribute('role')).toBe(false);
  });

  it('headingLevel null renders a paragraph; live adds role=status; size follows config', () => {
    configureAbsoluteUI({ components: { emptyState: { size: 'sm' } } });
    const e = mount({ headingLevel: null, live: true });
    expect(e.host.querySelector('.aui-empty-state__title')!.localName).toBe('p');
    expect(e.host.getAttribute('role')).toBe('status');
    expect(e.host.classList.contains('aui-empty-state--sm')).toBe(true);
    e.update({ headingLevel: 2, size: 'lg' });
    expect(e.host.querySelector('.aui-empty-state__title')!.localName).toBe('h2');
    expect(e.host.classList.contains('aui-empty-state--lg')).toBe(true);
  });

  it('actions are buttons or links and emit aui-action', async () => {
    const e = mount({ primaryAction: { label: 'Clear filters' }, secondaryAction: { label: 'Help', href: '/help' } });
    const actions: string[] = [];
    e.host.addEventListener('aui-action', (ev) => {
      ev.preventDefault();
      actions.push((ev as CustomEvent<EmptyStateActionDetail>).detail.action);
    });
    const primary = e.host.querySelector<HTMLButtonElement>('.aui-empty-state__primary')!;
    const secondary = e.host.querySelector<HTMLAnchorElement>('.aui-empty-state__secondary')!;
    expect(primary.localName).toBe('button');
    expect(primary.classList.contains('aui-button--primary')).toBe(true);
    expect(secondary.localName).toBe('a');
    expect(secondary.getAttribute('href')).toBe('/help');
    secondary.addEventListener('click', (ev) => { ev.preventDefault(); });
    await userEvent.click(primary);
    await userEvent.click(secondary);
    expect(actions).toEqual(['primary', 'secondary']);
    e.update({ primaryAction: null, secondaryAction: null });
    expect(e.host.querySelector<HTMLElement>('.aui-empty-state__actions')!.hidden).toBe(true);
  });

  it('an illustration replaces the icon', () => {
    const img = document.createElement('img');
    img.alt = '';
    const e = mount({ icon: 'search', illustration: img });
    expect(e.host.querySelector('.aui-empty-state__media')!.firstChild).toBe(img);
  });

  it('rejects invalid options (unsafe href included) before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    expect(() => EmptyState.create(host, { title: '' })).toThrow(AbsoluteUIError);
    expect(() => EmptyState.create(host, { title: 'x', primaryAction: { label: 'Go', href: 'javascript:alert(1)' } })).toThrow(/empty state/i);
    expect(() => EmptyState.create(host, { title: 'x', headingLevel: 7 as unknown as 1 })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const e = mount();
    expect(() => { e.update({ title: ' ' }); }).toThrow(AbsoluteUIError);
    expect(e.host.querySelector('.aui-empty-state__title')!.textContent).toBe('No employees found');
    e.destroy();
    expect(e.host.childElementCount).toBe(0);
  });
});
