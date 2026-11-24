import { afterEach, describe, expect, it, vi } from 'vitest';
import { userEvent } from 'vitest/browser';
import { autoPosition, registerOverlayLayer, trackPointerDrag, type DragMove } from '@absoluteui/utilities';

afterEach(() => {
  document.body.replaceChildren();
});

function box(top: number): HTMLDivElement {
  const el = document.createElement('div');
  el.style.setProperty('position', 'fixed');
  el.style.setProperty('top', `${top}px`);
  el.style.setProperty('left', '20px');
  el.style.setProperty('width', '60px');
  el.style.setProperty('height', '40px');
  document.body.append(el);
  return el;
}

function pointer(type: string, target: EventTarget, x: number, y: number, init: PointerEventInit = {}): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, composed: true, pointerId: 7, isPrimary: true, pointerType: 'mouse', button: 0, clientX: x, clientY: y, ...init }));
}

describe('trackPointerDrag', () => {
  it('starts after the threshold, reports deltas, ends on release, and suppresses the click (real pointer)', async () => {
    const handle = box(20);
    const target = box(220);
    const events: string[] = [];
    let last: DragMove | undefined;
    const drag = trackPointerDrag(handle, {
      onStart: () => events.push('start'),
      onMove: (m) => {
        last = m;
      },
      onEnd: (m) => {
        last = m;
        events.push('end');
      },
      onCancel: () => events.push('cancel'),
    });
    const clicks = vi.fn();
    handle.addEventListener('click', clicks);
    await userEvent.dragAndDrop(handle, target);
    expect(events).toEqual(['start', 'end']);
    expect(last?.dy).toBe(200);
    expect(last?.dx).toBe(0);
    expect(drag.dragging).toBe(false);
    expect(clicks).not.toHaveBeenCalled();
    drag.dispose();
  });

  it('a press without movement stays a click', async () => {
    const handle = box(20);
    const onStart = vi.fn();
    const drag = trackPointerDrag(handle, { onStart });
    const clicks = vi.fn();
    handle.addEventListener('click', clicks);
    await userEvent.click(handle);
    expect(onStart).not.toHaveBeenCalled();
    expect(clicks).toHaveBeenCalledTimes(1);
    drag.dispose();
  });

  it('ignores movement below the threshold and non-primary buttons', () => {
    const handle = box(20);
    const onStart = vi.fn();
    const drag = trackPointerDrag(handle, { threshold: 10, onStart });
    pointer('pointerdown', handle, 30, 30);
    pointer('pointermove', document, 33, 34);
    expect(onStart).not.toHaveBeenCalled();
    pointer('pointerup', document, 33, 34);
    pointer('pointerdown', handle, 30, 30, { button: 2 });
    pointer('pointermove', document, 30, 80);
    expect(onStart).not.toHaveBeenCalled();
    drag.dispose();
  });

  it('canStart can veto a press', () => {
    const handle = box(20);
    const onStart = vi.fn();
    const drag = trackPointerDrag(handle, { canStart: () => false, onStart });
    pointer('pointerdown', handle, 30, 30);
    pointer('pointermove', document, 30, 90);
    expect(onStart).not.toHaveBeenCalled();
    drag.dispose();
  });

  it('Escape cancels a started drag and is consumed before the overlay stack', async () => {
    const handle = box(20);
    const layer = document.createElement('div');
    document.body.append(layer);
    // The handle is part of the overlay (like a sheet's drag handle).
    layer.append(handle);
    const onDismiss = vi.fn();
    const unregister = registerOverlayLayer(layer, { onDismiss });
    const onCancel = vi.fn();
    const onEnd = vi.fn();
    const drag = trackPointerDrag(handle, { onCancel, onEnd });
    handle.tabIndex = 0;
    handle.focus();
    pointer('pointerdown', handle, 30, 30);
    pointer('pointermove', document, 30, 60);
    expect(drag.dragging).toBe(true);
    await userEvent.keyboard('{Escape}');
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(onDismiss).not.toHaveBeenCalled();
    expect(drag.dragging).toBe(false);
    pointer('pointerup', document, 30, 60);
    expect(onEnd).not.toHaveBeenCalled();
    unregister();
    drag.dispose();
  });

  it('pointercancel cancels; dispose removes listeners and cancels an active drag', () => {
    const handle = box(20);
    const onCancel = vi.fn();
    const onStart = vi.fn();
    const drag = trackPointerDrag(handle, { onCancel, onStart });
    pointer('pointerdown', handle, 30, 30);
    pointer('pointermove', document, 30, 60);
    pointer('pointercancel', document, 30, 60);
    expect(onCancel).toHaveBeenCalledTimes(1);
    pointer('pointerdown', handle, 30, 30);
    pointer('pointermove', document, 30, 60);
    drag.dispose();
    expect(onCancel).toHaveBeenCalledTimes(2);
    pointer('pointerdown', handle, 30, 30);
    pointer('pointermove', document, 30, 90);
    expect(onStart).toHaveBeenCalledTimes(2);
  });
});

describe('autoPosition: virtual anchor', () => {
  it('positions next to a virtual anchor rectangle and re-reads it on update', async () => {
    const floating = document.createElement('div');
    floating.style.setProperty('width', '50px');
    floating.style.setProperty('height', '30px');
    document.body.append(floating);
    let x = 100;
    const stop = autoPosition({ getBoundingClientRect: () => ({ x, y: 80, width: 0, height: 0 }) }, floating, { placement: 'bottom-start', offset: 0 });
    expect(floating.style.getPropertyValue('left')).toBe('100px');
    expect(floating.style.getPropertyValue('top')).toBe('80px');
    x = 140;
    window.dispatchEvent(new Event('resize'));
    await new Promise((r) => requestAnimationFrame(() => {
      r(null);
    }));
    await new Promise((r) => requestAnimationFrame(() => {
      r(null);
    }));
    expect(floating.style.getPropertyValue('left')).toBe('140px');
    stop();
  });
});
