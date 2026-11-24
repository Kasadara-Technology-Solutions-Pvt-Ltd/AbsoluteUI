import { afterEach, describe, expect, it, vi } from 'vitest';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ScrollArea, scrollAreaConfig, type ScrollAreaOptions } from '@absoluteui/components/scroll-area';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function box(lines: number): HTMLElement {
  const el = document.createElement('div');
  el.style.blockSize = '100px';
  el.style.inlineSize = '200px';
  // Unit tests do not load the stylesheet: give the box the overflow the CSS would.
  el.style.overflowY = 'auto';
  for (let i = 0; i < lines; i++) {
    const p = document.createElement('p');
    p.textContent = `Line ${String(i + 1)}`;
    p.style.margin = '0';
    p.style.blockSize = '20px';
    el.append(p);
  }
  document.body.append(el);
  return el;
}

function mount(lines: number, options: Partial<ScrollAreaOptions> = {}): ScrollArea {
  return ScrollArea.enhance(box(lines), { label: 'Release notes', ...options });
}

const frame = (): Promise<void> => new Promise((resolve) => requestAnimationFrame(() => { resolve(); }));

describe('ScrollArea', () => {
  it('is a named, focusable region while the content overflows', () => {
    const s = mount(20);
    expect(s.overflowing).toBe(true);
    expect(s.element.getAttribute('role')).toBe('region');
    expect(s.element.getAttribute('aria-label')).toBe('Release notes');
    expect(s.element.getAttribute('tabindex')).toBe('0');
    expect(s.edges).toEqual({ top: false, bottom: true, left: false, right: false });
    expect(s.element.hasAttribute('data-aui-scroll-bottom')).toBe(true);
    expect(s.element.classList).toContain('aui-scroll-area--shadows');
  });

  it('is not a tab stop when nothing overflows', () => {
    const s = mount(2);
    expect(s.overflowing).toBe(false);
    expect(s.element.hasAttribute('tabindex')).toBe(false);
    expect(s.element.hasAttribute('role')).toBe(false);
  });

  it('tracks the edges while scrolling', async () => {
    const s = mount(20);
    s.element.scrollTop = 100;
    s.element.dispatchEvent(new Event('scroll'));
    await frame();
    expect(s.edges.top).toBe(true);
    expect(s.edges.bottom).toBe(true);
    s.element.scrollTop = s.element.scrollHeight;
    s.refresh();
    expect(s.edges).toEqual({ top: true, bottom: false, left: false, right: false });
  });

  it('notices content added later', async () => {
    const s = mount(2);
    for (let i = 0; i < 20; i++) {
      const p = document.createElement('p');
      p.textContent = 'more';
      s.element.append(p);
    }
    await vi.waitFor(() => {
      expect(s.overflowing).toBe(true);
    });
    expect(s.element.getAttribute('tabindex')).toBe('0');
  });

  it('horizontal orientation tracks left and right, mirrored in RTL', () => {
    const el = document.createElement('div');
    el.style.inlineSize = '100px';
    el.style.whiteSpace = 'nowrap';
    el.style.overflowX = 'auto';
    el.textContent = 'A long line that is much wider than the box it lives in';
    el.dir = 'rtl';
    document.body.append(el);
    const s = ScrollArea.enhance(el, { label: 'Wide', orientation: 'horizontal' });
    // RTL starts at the right edge: hidden content is on the left.
    expect(s.edges.left).toBe(true);
    expect(s.edges.right).toBe(false);
  });

  it('applies maxBlockSize through the CSSOM and follows the shadows configuration', () => {
    const s = mount(20, { maxBlockSize: 'calc(100vh - 8rem)' });
    expect(s.element.style.getPropertyValue('--aui-scroll-area-max-block-size')).toBe('calc(100vh - 8rem)');
    configureAbsoluteUI({ components: { scrollArea: { shadows: false } } });
    expect(s.element.classList).not.toContain('aui-scroll-area--shadows');
    expect([...scrollAreaConfig.optionNames]).toEqual(['shadows']);
  });

  it('keeps the semantics of a list: named and focusable, but not a region', () => {
    const list = document.createElement('ul');
    list.style.blockSize = '60px';
    list.style.overflowY = 'auto';
    for (let i = 0; i < 10; i++) {
      const li = document.createElement('li');
      li.textContent = `Item ${String(i)}`;
      list.append(li);
    }
    document.body.append(list);
    const s = ScrollArea.enhance(list, { label: 'Out today' });
    expect(s.overflowing).toBe(true);
    expect(list.hasAttribute('role')).toBe(false);
    expect(list.getAttribute('aria-label')).toBe('Out today');
    expect(list.getAttribute('tabindex')).toBe('0');
  });

  it('keeps an existing tabindex and restores attributes on destroy', () => {
    const el = box(20);
    el.setAttribute('tabindex', '-1');
    el.setAttribute('role', 'log');
    const s = ScrollArea.enhance(el, { label: 'Log' });
    expect(el.getAttribute('tabindex')).toBe('-1');
    s.destroy();
    expect(el.getAttribute('role')).toBe('log');
    expect(el.hasAttribute('aria-label')).toBe(false);
    expect(el.className).toBe('');
    expect(el.hasAttribute('data-aui-scroll-bottom')).toBe(false);
  });

  it('validates options before touching the element', () => {
    const el = box(20);
    const bad: unknown[] = [{ label: '' }, { label: 'x', orientation: 'diagonal' }, { label: 'x', maxBlockSize: '10px; color: red' }, { label: 'x', maxBlockSize: 'url(x)' }];
    for (const options of bad) expect(() => ScrollArea.enhance(el, options as ScrollAreaOptions)).toThrow(AbsoluteUIError);
    expect(el.className).toBe('');
    expect(el.hasAttribute('tabindex')).toBe(false);
  });
});
