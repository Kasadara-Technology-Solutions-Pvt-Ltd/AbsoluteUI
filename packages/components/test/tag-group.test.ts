import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { TagGroup, tagGroupConfig, type TagGroupChangeDetail, type TagGroupOptions, type TagGroupRemoveDetail } from '@absoluteui/components/tag-group';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

const FILTERS = [
  { value: 'london', label: 'London' },
  { value: 'remote', label: 'Remote' },
  { value: 'senior', label: 'Senior' },
];

function mount(options: Partial<TagGroupOptions> = {}): TagGroup {
  const host = document.createElement('div');
  document.body.append(host);
  return TagGroup.create(host, { label: 'Applied filters', items: FILTERS, ...options });
}

const rows = (g: TagGroup): HTMLElement[] => [...g.host.querySelectorAll<HTMLElement>('[role="row"]')];

describe('TagGroup', () => {
  it('renders a named grid with one row per tag and one tag in the tab sequence', () => {
    const g = mount();
    expect(g.host.getAttribute('role')).toBe('grid');
    expect(g.host.getAttribute('aria-label')).toBe('Applied filters');
    expect(rows(g).map((r) => r.textContent)).toEqual(['London', 'Remote', 'Senior']);
    expect(rows(g)[0]!.querySelector('[role="gridcell"]')).not.toBeNull();
    expect(rows(g).filter((r) => r.tabIndex === 0)).toHaveLength(1);
    expect(rows(g)[0]!.hasAttribute('aria-selected')).toBe(false);
    expect(g.host.querySelector('.aui-tag-group__remove')).toBeNull();
  });

  it('removes with Delete, moves focus to the next tag, and announces it', async () => {
    const g = mount({ removable: true });
    const removed: string[] = [];
    g.host.addEventListener('aui-remove', (e) => {
      removed.push((e as CustomEvent<TagGroupRemoveDetail>).detail.value);
    });
    const remove = rows(g)[0]!.querySelector('button')!;
    expect(remove.getAttribute('aria-label')).toBe('Remove London');
    expect(remove.tabIndex).toBe(-1);
    rows(g)[1]!.focus();
    await userEvent.keyboard('{Delete}');
    expect(removed).toEqual(['remote']);
    expect(g.items.map((i) => i.value)).toEqual(['london', 'senior']);
    expect(document.activeElement).toBe(rows(g)[1]);
    expect(document.activeElement!.textContent).toBe('Senior');
    await userEvent.keyboard('{Backspace}');
    expect(document.activeElement!.textContent).toBe('London');
    await vi.waitFor(() => {
      expect(document.body.textContent).toContain('Senior removed');
    });
  });

  it('a prevented aui-remove keeps the tag; the remove button removes on click', async () => {
    const g = mount({ removable: true });
    const keep = (e: Event): void => {
      e.preventDefault();
    };
    g.host.addEventListener('aui-remove', keep);
    await userEvent.click(rows(g)[0]!.querySelector('button')!);
    expect(g.items).toHaveLength(3);
    g.host.removeEventListener('aui-remove', keep);
    await userEvent.click(rows(g)[0]!.querySelector('button')!);
    expect(g.items.map((i) => i.value)).toEqual(['remote', 'senior']);
  });

  it('multiple selection with Space and click; aria-selected and aui-change', async () => {
    const g = mount({ selection: 'multiple', value: ['senior'] });
    expect(g.host.getAttribute('aria-multiselectable')).toBe('true');
    const changes: string[][] = [];
    g.host.addEventListener('aui-change', (e) => {
      changes.push((e as CustomEvent<TagGroupChangeDetail>).detail.value);
    });
    rows(g)[0]!.focus();
    await userEvent.keyboard(' ');
    await userEvent.click(rows(g)[2]!);
    expect(rows(g).map((r) => r.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false']);
    expect(changes).toEqual([['london', 'senior'], ['london']]);
  });

  it('single selection replaces the selected tag; arrow keys move focus; disabled tags do not change', async () => {
    const g = mount({ selection: 'single', items: [FILTERS[0]!, { ...FILTERS[1]!, disabled: true }, FILTERS[2]!] });
    rows(g)[0]!.focus();
    await userEvent.keyboard(' ');
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(rows(g)[2]);
    await userEvent.keyboard(' ');
    expect(g.value).toEqual(['senior']);
    // Playwright will not click an aria-disabled element; a DOM click still must not select it.
    rows(g)[1]!.click();
    expect(g.value).toEqual(['senior']);
  });

  it('update keeps focus on the same tag; size follows configuration; an empty group has no grid role', () => {
    const g = mount({ removable: true });
    rows(g)[2]!.focus();
    g.update({ items: [{ value: 'senior', label: 'Senior' }, ...FILTERS.slice(0, 2)] });
    expect(document.activeElement).toBe(rows(g)[0]);
    configureAbsoluteUI({ components: { tagGroup: { size: 'sm' } } });
    expect(g.host.classList).toContain('aui-tag-group--sm');
    g.update({ items: [] });
    expect(g.host.hasAttribute('role')).toBe(false);
    expect(g.host.hasAttribute('aria-label')).toBe(false);
    expect([...tagGroupConfig.optionNames].sort()).toEqual(['locale', 'size']);
  });

  it('validates options before touching the host, and keeps state on a failed update', () => {
    const host = document.createElement('div');
    const bad: unknown[] = [
      { label: '', items: FILTERS },
      { label: 'x', items: 'a' },
      { label: 'x', items: [{ value: 'a', label: 'A' }, { value: 'a', label: 'B' }] },
      { label: 'x', items: FILTERS, selection: 'many' },
      { label: 'x', items: FILTERS, selection: 'single', value: ['london', 'remote'] },
      { label: 'x', items: FILTERS, removable: true, icons: { remove: 'nope' } },
    ];
    for (const options of bad) expect(() => TagGroup.create(host, options as TagGroupOptions)).toThrow(AbsoluteUIError);
    expect(host.className).toBe('');
    expect(host.childNodes.length).toBe(0);
    const g = mount();
    expect(() => {
      g.update({ removable: true, icons: { remove: 'nope' } });
    }).toThrow(AbsoluteUIError);
    expect(g.host.querySelector('.aui-tag-group__remove')).toBeNull();
  });

  it('destroy removes rendering, attributes, and listeners', () => {
    const g = mount({ selection: 'multiple' });
    g.destroy();
    expect(g.host.childNodes.length).toBe(0);
    expect(g.host.getAttributeNames().filter((n) => n !== 'class')).toEqual([]);
  });
});
