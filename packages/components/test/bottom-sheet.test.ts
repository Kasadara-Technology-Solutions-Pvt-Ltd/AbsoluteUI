import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { isScrollLocked } from '@absoluteui/utilities';
import { BottomSheet, type BottomSheetCloseDetail, type BottomSheetSnapChangeDetail } from '@absoluteui/components/bottom-sheet';

const created: BottomSheet[] = [];

afterEach(() => {
  // Destroy (not just remove) so scroll locks and overlay layers are released.
  for (const s of created.splice(0)) s.destroy();
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function make(options: Parameters<typeof BottomSheet.create>[0]): BottomSheet {
  const s = BottomSheet.create(options);
  created.push(s);
  return s;
}

function opener(): HTMLButtonElement {
  const b = document.createElement('button');
  b.textContent = 'Open';
  document.body.append(b);
  b.focus();
  return b;
}

function closes(sheet: BottomSheet): BottomSheetCloseDetail[] {
  const out: BottomSheetCloseDetail[] = [];
  sheet.element.addEventListener('aui-close', (e) => out.push((e as CustomEvent<BottomSheetCloseDetail>).detail));
  return out;
}

function pointer(type: string, target: EventTarget, y: number): void {
  target.dispatchEvent(new PointerEvent(type, { bubbles: true, cancelable: true, pointerId: 3, isPrimary: true, pointerType: 'touch', clientX: 100, clientY: y }));
}

describe('BottomSheet', () => {
  it('renders a named native dialog; strings render as text', () => {
    const s = make({ title: 'Share', description: 'Pick a target.', content: '<b>x</b>' });
    expect(s.element.tagName).toBe('DIALOG');
    expect(document.getElementById(s.element.getAttribute('aria-labelledby')!)!.textContent).toBe('Share');
    expect(document.getElementById(s.element.getAttribute('aria-describedby')!)!.textContent).toBe('Pick a target.');
    expect(s.body.querySelector('b')).toBeNull();
    // Without snap points the handle is decorative (Escape and the close button dismiss).
    expect(s.handle.getAttribute('aria-hidden')).toBe('true');
    expect(s.handle.hasAttribute('tabindex')).toBe(false);
  });

  it('modal: showModal, scroll lock, focus inside; Escape closes and restores focus', async () => {
    const b = opener();
    const s = make({ title: 'Share' });
    const got = closes(s);
    s.open();
    expect(s.element.matches(':modal')).toBe(true);
    expect(isScrollLocked()).toBe(true);
    expect(s.element.contains(document.activeElement)).toBe(true);
    expect(document.activeElement?.getAttribute('aria-label')).toBe('Close');
    await userEvent.keyboard('{Escape}');
    expect(s.isOpen).toBe(false);
    expect(isScrollLocked()).toBe(false);
    expect(document.activeElement).toBe(b);
    expect(got).toEqual([{ reason: 'escape' }]);
  });

  it('non-modal: show(), page stays interactive, focus returns only when it was inside', () => {
    const b = opener();
    const s = make({ title: 'Now playing', modal: false });
    s.open();
    expect(s.element.matches(':modal')).toBe(false);
    expect(s.modal).toBe(false);
    b.focus();
    s.close();
    expect(document.activeElement).toBe(b);
  });

  it('aui-cancel can keep the sheet open; the close button requests close', async () => {
    opener();
    const s = make({ title: 'Edit' });
    let block = true;
    s.element.addEventListener('aui-cancel', (e) => {
      if (block) e.preventDefault();
    });
    s.open();
    await userEvent.click(s.element.querySelector('.aui-bottom-sheet__close')!);
    expect(s.isOpen).toBe(true);
    block = false;
    await userEvent.click(s.element.querySelector('.aui-bottom-sheet__close')!);
    expect(s.isOpen).toBe(false);
  });

  it('snap points: the handle is a slider; arrows, Home, End and click change the height', async () => {
    opener();
    const s = make({ title: 'Details', snapPoints: [0.4, 0.7, 1], showCloseButton: false });
    const got: BottomSheetSnapChangeDetail[] = [];
    s.element.addEventListener('aui-snap-change', (e) => got.push((e as CustomEvent<BottomSheetSnapChangeDetail>).detail));
    s.open();
    const h = s.handle;
    expect(h.getAttribute('role')).toBe('slider');
    expect(h.getAttribute('aria-label')).toBe('Sheet height');
    expect(h.getAttribute('aria-valuenow')).toBe('40');
    expect(h.getAttribute('aria-valuemin')).toBe('40');
    expect(h.getAttribute('aria-valuemax')).toBe('100');
    expect(h.getAttribute('aria-valuetext')).toBe('40% of screen height');
    expect(s.element.style.getPropertyValue('--aui-bottom-sheet-snap')).toBe('0.4');
    h.focus();
    await userEvent.keyboard('{ArrowUp}');
    expect(s.snap).toBe(1);
    await userEvent.keyboard('{End}');
    expect(s.snap).toBe(2);
    await userEvent.keyboard('{ArrowUp}');
    expect(s.snap).toBe(2);
    await userEvent.keyboard('{Home}');
    expect(s.snap).toBe(0);
    // Single-pointer alternative to dragging (WCAG 2.5.7): a click cycles the heights.
    // Programmatic click: without component CSS the handle strip has no size in unit tests.
    h.click();
    expect(s.snap).toBe(1);
    expect(got.map((d) => d.index)).toEqual([1, 2, 0, 1]);
    expect(got[0]?.value).toBe(0.7);
  });

  it('dragging the handle down past the threshold requests close (reason drag); a short drag snaps back', () => {
    opener();
    const s = make({ title: 'Share' });
    const got = closes(s);
    s.open();
    const h = s.handle;
    pointer('pointerdown', h, 300);
    pointer('pointermove', document, 330);
    expect(s.element.classList.contains('aui-bottom-sheet--dragging')).toBe(true);
    expect(s.element.style.getPropertyValue('--aui-bottom-sheet-offset')).toBe('30px');
    pointer('pointerup', document, 330);
    expect(s.isOpen).toBe(true);
    expect(s.element.classList.contains('aui-bottom-sheet--dragging')).toBe(false);
    expect(s.element.style.getPropertyValue('--aui-bottom-sheet-offset')).toBe('');
    pointer('pointerdown', h, 300);
    pointer('pointermove', document, 700);
    pointer('pointerup', document, 700);
    expect(s.isOpen).toBe(false);
    expect(got).toEqual([{ reason: 'drag' }]);
  });

  it('with snap points a drag picks the nearest height; closeOnDragDown: false never closes', () => {
    opener();
    const s = make({ title: 'Details', snapPoints: [0.3, 0.9], closeOnDragDown: false });
    s.open();
    const vh = document.documentElement.clientHeight;
    const h = s.handle;
    pointer('pointerdown', h, 500);
    pointer('pointermove', document, 500 - vh * 0.5);
    pointer('pointerup', document, 500 - vh * 0.5);
    expect(s.snap).toBe(1);
    pointer('pointerdown', h, 100);
    pointer('pointermove', document, 100 + vh);
    pointer('pointerup', document, 100 + vh);
    expect(s.isOpen).toBe(true);
    expect(s.snap).toBe(0);
  });

  it('Escape during a drag cancels the drag, not the sheet', async () => {
    opener();
    const s = make({ title: 'Share' });
    s.open();
    pointer('pointerdown', s.handle, 300);
    pointer('pointermove', document, 360);
    await userEvent.keyboard('{Escape}');
    expect(s.isOpen).toBe(true);
    expect(s.element.classList.contains('aui-bottom-sheet--dragging')).toBe(false);
  });

  it('content is inserted once; config changes re-render without replacing the body', () => {
    configureAbsoluteUI({ components: { bottomSheet: { showCloseButton: false } } });
    const node = document.createElement('p');
    const s = make({ title: 'x', content: node });
    expect(s.element.querySelector('.aui-bottom-sheet__close')).toBeNull();
    s.update({ title: 'y' });
    expect(s.body.firstChild).toBe(node);
  });

  it('(regression) new snap points without a new snap clamp the index instead of throwing', () => {
    const s = make({ title: 'x', snapPoints: [0.3, 0.6, 0.9], snap: 2 });
    s.update({ snapPoints: [0.5, 1] });
    expect(s.snap).toBe(1);
  });

  it('validates before rendering and destroys cleanly', () => {
    const before = document.body.childElementCount;
    expect(() => BottomSheet.create({ title: '' })).toThrow(AbsoluteUIError);
    expect(() => BottomSheet.create({ title: 'x', snapPoints: [0.5, 0.4] })).toThrow(AbsoluteUIError);
    expect(() => BottomSheet.create({ title: 'x', snapPoints: [0, 1] })).toThrow(AbsoluteUIError);
    expect(() => BottomSheet.create({ title: 'x', snapPoints: [0.5, 1.2] })).toThrow(AbsoluteUIError);
    expect(() => BottomSheet.create({ title: 'x', snapPoints: [0.5, 1], snap: 2 })).toThrow(AbsoluteUIError);
    expect(() => BottomSheet.create({ title: 'x', closeOnEscape: 'yes' as unknown as boolean })).toThrow(AbsoluteUIError);
    expect(document.body.childElementCount).toBe(before);
    const s = make({ title: 'x' });
    s.open();
    s.destroy();
    expect(document.querySelector('dialog')).toBeNull();
    expect(isScrollLocked()).toBe(false);
  });
});
