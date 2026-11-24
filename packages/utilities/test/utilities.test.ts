import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import {
  announce,
  computePosition,
  createFocusRestore,
  createFocusTrap,
  createRovingTabindex,
  createTypeahead,
  getFocusableElements,
  getNextIndex,
  getOverlayDepth,
  isScrollLocked,
  isTopOverlay,
  lockScroll,
  matchesHotkey,
  openPopover,
  registerOverlayLayer,
  trackPointerFocus,
} from '@absoluteui/utilities';

afterEach(() => {
  document.body.replaceChildren();
});

function mount(html: string): HTMLElement {
  const host = document.createElement('div');
  // Test fixture markup is static and authored here (not user input).
  host.innerHTML = html;
  document.body.appendChild(host);
  return host;
}

describe('keyboard: getNextIndex', () => {
  const base = { orientation: 'vertical', loop: false } as const;

  it('moves vertically and respects bounds without loop', () => {
    expect(getNextIndex('ArrowDown', 0, 3, base)).toBe(1);
    expect(getNextIndex('ArrowDown', 2, 3, base)).toBe(2);
    expect(getNextIndex('ArrowUp', 0, 3, base)).toBe(0);
    expect(getNextIndex('ArrowLeft', 0, 3, base)).toBeNull();
  });

  it('wraps with loop and skips disabled items', () => {
    const opts = { ...base, loop: true, isDisabled: (i: number) => i === 0 };
    expect(getNextIndex('ArrowDown', 2, 3, opts)).toBe(1);
    expect(getNextIndex('Home', 2, 3, opts)).toBe(1);
    expect(getNextIndex('End', 1, 3, opts)).toBe(2);
  });

  it('mirrors horizontal arrows in RTL', () => {
    const h = { orientation: 'horizontal', loop: false } as const;
    expect(getNextIndex('ArrowRight', 1, 3, h)).toBe(2);
    expect(getNextIndex('ArrowRight', 1, 3, { ...h, direction: 'rtl' })).toBe(0);
  });

  it('pages by pageSize', () => {
    expect(getNextIndex('PageDown', 0, 50, { ...base, pageSize: 10 })).toBe(10);
    expect(getNextIndex('PageUp', 5, 50, { ...base, pageSize: 10 })).toBe(0);
  });
});

describe('keyboard: typeahead', () => {
  it('finds the next match, accumulates, and cycles on repeated characters', () => {
    const t = createTypeahead();
    const labels = ['Apple', 'Banana', 'Blueberry', 'Cherry'];
    expect(t.handle('b', labels, -1)).toBe(1);
    expect(t.handle('l', labels, 1)).toBe(2);
    t.reset();
    expect(t.handle('b', labels, 1)).toBe(2);
    expect(t.handle('b', labels, 2)).toBe(1);
    t.reset();
    expect(t.handle('z', labels, 0)).toBe(-1);
  });

  it('is case and accent insensitive', () => {
    const t = createTypeahead();
    expect(t.handle('e', ['Zebra', 'École'], 0)).toBe(1);
  });
});

describe('keyboard: hotkeys', () => {
  it('matches modifiers exactly', () => {
    const e = new KeyboardEvent('keydown', { key: 'K', shiftKey: true, ctrlKey: true });
    expect(matchesHotkey(e, 'Ctrl+Shift+K')).toBe(true);
    expect(matchesHotkey(e, 'Ctrl+K')).toBe(false);
  });
});

describe('keyboard: roving tabindex', () => {
  it('keeps one tab stop and moves focus with arrows', async () => {
    const host = mount('<div role="toolbar"><button>A</button><button>B</button><button aria-disabled="true">C</button><button>D</button></div>');
    const toolbar = host.firstElementChild as HTMLElement;
    const items = () => Array.from(toolbar.querySelectorAll('button'));
    const roving = createRovingTabindex(toolbar, { getItems: items, orientation: 'horizontal', loop: true });
    expect(items().map((b) => b.tabIndex)).toEqual([0, -1, -1, -1]);
    items()[0]!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(items()[1]);
    await userEvent.keyboard('{ArrowRight}');
    expect(document.activeElement).toBe(items()[3]);
    expect(items().map((b) => b.tabIndex)).toEqual([-1, -1, -1, 0]);
    roving.dispose();
  });
});

describe('focus engine', () => {
  it('finds tabbable elements, skipping disabled, hidden, inert', () => {
    const host = mount(`
      <button>a</button>
      <button disabled>b</button>
      <input type="hidden">
      <a href="#">c</a>
      <div tabindex="-1">d</div>
      <fieldset disabled><input></fieldset>
      <div inert><button>e</button></div>
      <button hidden>f</button>
      <span tabindex="0">g</span>`);
    expect(getFocusableElements(host).map((el) => el.textContent.trim() || el.localName)).toEqual(['a', 'c', 'g']);
  });

  it('restores focus', () => {
    const host = mount('<button id="t">t</button><button id="o">o</button>');
    const trigger = host.querySelector<HTMLButtonElement>('#t')!;
    trigger.focus();
    const restore = createFocusRestore();
    host.querySelector<HTMLButtonElement>('#o')!.focus();
    expect(restore.restore()).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('restores focus to the element pressed with a pointer when the press did not focus it (Safari)', () => {
    const host = mount('<button id="t">t<span>label</span></button><button id="o">o</button>');
    const trigger = host.querySelector<HTMLButtonElement>('#t')!;
    trackPointerFocus();
    if (document.activeElement instanceof HTMLElement) document.activeElement.blur();
    host.querySelector('span')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, composed: true }));
    const restore = createFocusRestore();
    host.querySelector<HTMLButtonElement>('#o')!.focus();
    expect(restore.restore()).toBe(true);
    expect(document.activeElement).toBe(trigger);
  });

  it('traps Tab and Shift+Tab inside the container and restores on deactivate', async () => {
    const host = mount('<button id="outside">out</button><div id="trap"><button id="first">1</button><button id="last">2</button></div>');
    const outside = host.querySelector<HTMLButtonElement>('#outside')!;
    outside.focus();
    const trap = createFocusTrap(host.querySelector<HTMLElement>('#trap')!);
    trap.activate();
    expect(document.activeElement?.id).toBe('first');
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement?.id).toBe('last');
    await userEvent.keyboard('{Tab}');
    expect(document.activeElement?.id).toBe('first');
    await userEvent.keyboard('{Shift>}{Tab}{/Shift}');
    expect(document.activeElement?.id).toBe('last');
    trap.deactivate();
    expect(document.activeElement).toBe(outside);
  });
});

describe('positioning engine', () => {
  const viewport = { x: 0, y: 0, width: 800, height: 600 };
  const anchor = { x: 100, y: 100, width: 200, height: 40 };

  it('places bottom-start by default', () => {
    const r = computePosition(anchor, { width: 150, height: 100 }, viewport);
    expect(r).toMatchObject({ x: 100, y: 144, placement: 'bottom-start' });
  });

  it('flips to top when space below is insufficient', () => {
    const low = { ...anchor, y: 520 };
    const r = computePosition(low, { width: 150, height: 100 }, viewport);
    expect(r.placement).toBe('top-start');
    expect(r.y).toBe(520 - 100 - 4);
  });

  it('shifts within the viewport padding', () => {
    const edge = { ...anchor, x: 750 };
    const r = computePosition(edge, { width: 150, height: 100 }, viewport);
    expect(r.x).toBe(800 - 8 - 150);
  });

  it('maps logical start to the right edge in RTL', () => {
    const r = computePosition(anchor, { width: 150, height: 100 }, viewport, { direction: 'rtl' });
    expect(r.x).toBe(100 + 200 - 150);
  });

  it('reports available height on the final side', () => {
    const r = computePosition(anchor, { width: 150, height: 100 }, viewport);
    expect(r.availableHeight).toBe(600 - 140 - 4 - 8);
  });
});

describe('overlay engine', () => {
  it('prunes layers whose element left the document without unregistering (regression)', () => {
    const stale = document.createElement('div');
    const live = document.createElement('div');
    document.body.append(live);
    const unregisterLive = registerOverlayLayer(live, {});
    document.body.append(stale);
    const unregisterStale = registerOverlayLayer(stale, {});
    stale.remove();
    expect(isTopOverlay(live)).toBe(true);
    unregisterStale();
    unregisterLive();
  });

  it('opens in the top layer and dismisses only the topmost on Escape', async () => {
    const host = mount('<div id="a">A</div><div id="b">B</div>');
    const onA = vi.fn();
    const onB = vi.fn();
    const a = openPopover(host.querySelector<HTMLElement>('#a')!, { onDismiss: onA });
    const b = openPopover(host.querySelector<HTMLElement>('#b')!, { onDismiss: onB });
    expect(host.querySelector('#a')!.matches(':popover-open')).toBe(true);
    expect(getOverlayDepth()).toBe(2);
    await userEvent.keyboard('{Escape}');
    expect(onB).toHaveBeenCalledWith('escape');
    expect(onA).not.toHaveBeenCalled();
    b.close();
    a.close();
    expect(getOverlayDepth()).toBe(0);
    expect(host.querySelector('#a')!.matches(':popover-open')).toBe(false);
  });

  it('dismisses on outside pointer but not on inside elements', () => {
    const host = mount('<button id="trigger">t</button><div id="pop">p</div><div id="elsewhere">x</div>');
    const onDismiss = vi.fn();
    const handle = openPopover(host.querySelector<HTMLElement>('#pop')!, { onDismiss, inside: [host.querySelector('#trigger')!] });
    host.querySelector('#trigger')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    host.querySelector('#pop')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onDismiss).not.toHaveBeenCalled();
    host.querySelector('#elsewhere')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(onDismiss).toHaveBeenCalledWith('outside-pointer');
    handle.close();
  });
});

describe('scroll lock and live region', () => {
  it('announces inside the topmost modal dialog, where the page is not inert (regression)', async () => {
    const dialog = document.createElement('dialog');
    document.body.append(dialog);
    dialog.showModal();
    announce('Saved');
    await new Promise((r) => requestAnimationFrame(r));
    const region = dialog.querySelector<HTMLElement>('[data-aui-live-region="polite"]');
    expect(region?.textContent).toBe('Saved');
    dialog.close();
  });

  it('reference-counts scroll locks', () => {
    const r1 = lockScroll();
    const r2 = lockScroll();
    expect(document.documentElement.style.overflow).toBe('hidden');
    r1();
    expect(isScrollLocked()).toBe(true);
    r2();
    expect(isScrollLocked()).toBe(false);
    expect(document.documentElement.style.overflow).toBe('');
  });

  it('announces via a polite live region using text only', async () => {
    announce('<b>Saved</b>');
    await new Promise((r) => requestAnimationFrame(r));
    const region = document.querySelector('[data-aui-live-region="polite"]')!;
    expect(region.getAttribute('aria-live')).toBe('polite');
    expect(region.textContent).toBe('<b>Saved</b>');
    expect(region.children).toHaveLength(0);
  });
});
