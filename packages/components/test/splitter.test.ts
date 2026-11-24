import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, resetAbsoluteUIConfig } from '@absoluteui/core';
import { Splitter, type SplitterChangeDetail, type SplitterOptions } from '@absoluteui/components/splitter';

// Unit tests do not load the stylesheet: give the splitter the layout rules its CSS would.
const CSS = `
.aui-splitter { display: flex; inline-size: 1012px; block-size: 300px; }
.aui-splitter--vertical { flex-direction: column; inline-size: 400px; block-size: 612px; }
.aui-splitter__pane { flex: var(--_aui-splitter-grow, 1) 1 0px; min-inline-size: 0; min-block-size: 0; overflow: hidden; }
.aui-splitter__pane[hidden] { display: none; }
.aui-splitter__separator { flex: none; inline-size: 12px; }
.aui-splitter--vertical > .aui-splitter__separator { inline-size: auto; block-size: 12px; }
`;

beforeEach(() => {
  const style = document.createElement('style');
  style.textContent = CSS;
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
  document.documentElement.removeAttribute('dir');
  for (const s of document.head.querySelectorAll('style')) s.remove();
});

const pane = (text: string): HTMLElement => {
  const el = document.createElement('div');
  el.textContent = text;
  return el;
};

function mount(options: Partial<SplitterOptions> = {}): Splitter {
  const host = document.createElement('div');
  document.body.append(host);
  return Splitter.create(host, {
    panes: [
      { content: pane('Folders'), label: 'Folders', size: 250, min: 100, max: '50%', collapsible: true },
      { content: pane('Messages'), label: 'Messages', min: 200 },
    ],
    ...options,
  });
}

const separators = (s: Splitter): HTMLElement[] => [...s.host.querySelectorAll<HTMLElement>('.aui-splitter__separator')];

describe('Splitter', () => {
  it('renders panes and APG separators with values in percent', () => {
    const s = mount();
    const [sep] = separators(s);
    expect(s.paneElements).toHaveLength(2);
    expect(sep!.getAttribute('role')).toBe('separator');
    expect(sep!.tabIndex).toBe(0);
    expect(sep!.getAttribute('aria-orientation')).toBe('vertical');
    expect(sep!.getAttribute('aria-label')).toBe('Folders');
    expect(sep!.getAttribute('aria-controls')).toBe(s.paneElements[0]!.id);
    expect(sep!.getAttribute('aria-valuenow')).toBe('25');
    expect(sep!.getAttribute('aria-valuemin')).toBe('0');
    expect(sep!.getAttribute('aria-valuemax')).toBe('50');
    expect(s.sizes).toEqual([25, 75]);
    expect(Math.round(s.paneElements[0]!.getBoundingClientRect().width)).toBe(250);
  });

  it('arrow keys move by step, Home and End go to the limits, each emitting aui-change', async () => {
    const s = mount();
    const changes: SplitterChangeDetail[] = [];
    s.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<SplitterChangeDetail>).detail));
    separators(s)[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(s.sizes[0]).toBeCloseTo(26.6, 1);
    await userEvent.keyboard('{End}');
    expect(s.sizes[0]).toBe(50);
    await userEvent.keyboard('{Home}');
    expect(s.sizes[0]).toBe(10);
    expect(changes.map((c) => c.reason)).toEqual(['keyboard', 'keyboard', 'keyboard']);
    expect(changes.at(-1)).toMatchObject({ index: 0, collapsed: [false, false] });
  });

  it('Enter collapses and restores the collapsible pane', async () => {
    const s = mount();
    const reasons: string[] = [];
    s.host.addEventListener('aui-change', (e) => reasons.push((e as CustomEvent<SplitterChangeDetail>).detail.reason));
    const sep = separators(s)[0]!;
    sep.focus();
    await userEvent.keyboard('{Enter}');
    expect(s.collapsed).toEqual([true, false]);
    expect(s.paneElements[0]!.hidden).toBe(true);
    expect(sep.getAttribute('aria-valuenow')).toBe('0');
    expect(sep.getAttribute('aria-valuetext')).toBe('Folders, collapsed');
    await userEvent.keyboard('{Enter}');
    expect(s.collapsed).toEqual([false, false]);
    expect(s.sizes[0]).toBe(25);
    expect(sep.hasAttribute('aria-valuetext')).toBe(false);
    expect(reasons).toEqual(['collapse', 'expand']);
  });

  it('mirrors arrow keys in RTL and uses Up/Down for vertical splitters', async () => {
    document.documentElement.dir = 'rtl';
    const s = mount();
    separators(s)[0]!.focus();
    await userEvent.keyboard('{ArrowLeft}');
    expect(s.sizes[0]).toBeGreaterThan(25);
    document.documentElement.removeAttribute('dir');
    const v = mount({ orientation: 'vertical' });
    const sep = separators(v)[0]!;
    expect(sep.getAttribute('aria-orientation')).toBe('horizontal');
    sep.focus();
    await userEvent.keyboard('{ArrowDown}');
    const after = v.sizes[0];
    expect(after).toBeGreaterThan(25);
    // Left and Right do nothing on a vertical splitter.
    await userEvent.keyboard('{ArrowRight}');
    expect(v.sizes[0]).toBe(after);
  });

  it('restores persisted sizes, resets on double-click, and supports three panes', async () => {
    const s = mount({ sizes: [40, 60] });
    expect(s.sizes).toEqual([40, 60]);
    const reasons: string[] = [];
    s.host.addEventListener('aui-change', (e) => reasons.push((e as CustomEvent<SplitterChangeDetail>).detail.reason));
    await userEvent.dblClick(separators(s)[0]!);
    expect(reasons).toEqual(['reset']);
    expect(s.sizes).toEqual([25, 75]);
    const three = mount({ panes: [{ content: pane('a'), label: 'A' }, { content: pane('b'), label: 'B' }, { content: pane('c'), label: 'C' }] });
    expect(separators(three)).toHaveLength(2);
    expect(three.sizes.map((n) => Math.round(n))).toEqual([33, 33, 33]);
  });

  it('rejects invalid options before touching the host, and destroy cleans up', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    expect(() => Splitter.create(host, { panes: [{ content: pane('a'), label: 'A' }] })).toThrow(AbsoluteUIError);
    expect(() => Splitter.create(host, { panes: [{ content: pane('a'), label: 'A', min: '10em' }, { content: pane('b'), label: 'B' }] })).toThrow(/splitter/i);
    expect(() => Splitter.create(host, { panes: [{ content: pane('a'), label: 'A', collapsed: true }, { content: pane('b'), label: 'B' }] })).toThrow(AbsoluteUIError);
    expect(() => Splitter.create(host, { sizes: [100], panes: [{ content: pane('a'), label: 'A' }, { content: pane('b'), label: 'B' }] })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const s = mount();
    s.destroy();
    expect(s.host.childElementCount).toBe(0);
    expect(s.host.classList.contains('aui-splitter')).toBe(false);
  });
});
