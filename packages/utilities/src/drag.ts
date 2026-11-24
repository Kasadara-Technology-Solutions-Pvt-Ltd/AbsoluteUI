/**
 * Pointer drag primitive (SPEC section 18.20). Tracks one primary pointer from
 * `pointerdown` on an element: the drag starts only after the pointer moved past a
 * threshold, so a press without movement stays a click. Uses pointer capture when
 * available and listens on the document, so mouse, pen, and touch behave the same.
 * A drag that started suppresses the click that follows the release, and Escape
 * cancels it (the keydown is consumed so no overlay closes).
 *
 * Touch dragging also needs `touch-action: none` on the element (component CSS);
 * otherwise the browser takes the gesture for scrolling and sends `pointercancel`.
 */
import type { Disposer } from '@absoluteui/core';

export interface DragPoint {
  readonly x: number;
  readonly y: number;
}

export interface DragMove {
  /** Client coordinates of the pointerdown. */
  readonly start: DragPoint;
  /** Current client coordinates. */
  readonly point: DragPoint;
  readonly dx: number;
  readonly dy: number;
  readonly pointerType: string;
}

export interface PointerDragOptions {
  /** Distance in CSS px the pointer must move before the drag starts. Default 4. */
  threshold?: number;
  /** Called on pointerdown; return false to ignore this press (e.g. a disabled item). */
  canStart?: (event: PointerEvent) => boolean;
  onStart?: (move: DragMove) => void;
  onMove?: (move: DragMove) => void;
  /** The pointer was released after the drag started. */
  onEnd?: (move: DragMove) => void;
  /** Escape, pointercancel, lost capture, `cancel()`, or `dispose()` during a started drag. */
  onCancel?: () => void;
}

export interface PointerDrag {
  /** True between the threshold being passed and the release or cancel. */
  readonly dragging: boolean;
  /** Cancel a pending or started drag (calls `onCancel` when started). */
  cancel(): void;
  /** Remove all listeners; cancels an active drag. */
  dispose(): void;
}

export function trackPointerDrag(element: HTMLElement, options: PointerDragOptions): PointerDrag {
  const doc = element.ownerDocument;
  // Resolved when a drag is under way: creating the tracker needs no window (server rendering).
  const win = (): Window => doc.defaultView ?? window;
  const threshold = options.threshold ?? 4;
  let pointerId: number | null = null;
  let start: DragPoint = { x: 0, y: 0 };
  let pointerType = 'mouse';
  let started = false;
  let stopGesture: Disposer | null = null;

  // Read through a function: callbacks can change it, which flow analysis cannot see.
  const isStarted = (): boolean => started;

  const moveOf = (event: PointerEvent): DragMove => ({
    start,
    point: { x: event.clientX, y: event.clientY },
    dx: event.clientX - start.x,
    dy: event.clientY - start.y,
    pointerType,
  });

  const release = (): void => {
    stopGesture?.();
    stopGesture = null;
    if (pointerId !== null && element.hasPointerCapture(pointerId)) element.releasePointerCapture(pointerId);
    pointerId = null;
    started = false;
  };

  const cancel = (): void => {
    const wasStarted = started;
    release();
    if (wasStarted) options.onCancel?.();
  };

  /** The click that follows a drag release is not an activation. */
  const suppressClick = (): void => {
    const onClick = (event: MouseEvent): void => {
      event.preventDefault();
      event.stopPropagation();
    };
    win().addEventListener('click', onClick, { capture: true, once: true });
    win().setTimeout(() => {
      win().removeEventListener('click', onClick, { capture: true });
    }, 0);
  };

  const onPointerMove = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    const move = moveOf(event);
    if (!started) {
      if (Math.hypot(move.dx, move.dy) < threshold) return;
      started = true;
      options.onStart?.(move);
      // onStart may cancel (e.g. the component was destroyed).
      if (!isStarted()) return;
    }
    event.preventDefault();
    options.onMove?.(move);
  };

  const onPointerUp = (event: PointerEvent): void => {
    if (event.pointerId !== pointerId) return;
    const wasStarted = started;
    const move = moveOf(event);
    release();
    if (!wasStarted) return;
    suppressClick();
    options.onEnd?.(move);
  };

  const onPointerCancel = (event: PointerEvent): void => {
    if (event.pointerId === pointerId) cancel();
  };

  const onKeyDown = (event: KeyboardEvent): void => {
    if (event.key !== 'Escape' || !started) return;
    event.preventDefault();
    event.stopPropagation();
    cancel();
  };

  const onPointerDown = (event: PointerEvent): void => {
    if (pointerId !== null || !event.isPrimary) return;
    if (event.pointerType === 'mouse' && event.button !== 0) return;
    if (options.canStart && !options.canStart(event)) return;
    pointerId = event.pointerId;
    pointerType = event.pointerType || 'mouse';
    start = { x: event.clientX, y: event.clientY };
    started = false;
    try {
      element.setPointerCapture(event.pointerId);
    } catch {
      // Synthetic or already released pointers cannot be captured; document listeners still track them.
    }
    doc.addEventListener('pointermove', onPointerMove, true);
    doc.addEventListener('pointerup', onPointerUp, true);
    doc.addEventListener('pointercancel', onPointerCancel, true);
    element.addEventListener('lostpointercapture', onPointerCancel);
    // Window capture runs before the overlay stack's document listener.
    win().addEventListener('keydown', onKeyDown, true);
    stopGesture = () => {
      doc.removeEventListener('pointermove', onPointerMove, true);
      doc.removeEventListener('pointerup', onPointerUp, true);
      doc.removeEventListener('pointercancel', onPointerCancel, true);
      element.removeEventListener('lostpointercapture', onPointerCancel);
      win().removeEventListener('keydown', onKeyDown, true);
    };
  };

  element.addEventListener('pointerdown', onPointerDown);

  return {
    get dragging() {
      return started;
    },
    cancel,
    dispose() {
      cancel();
      element.removeEventListener('pointerdown', onPointerDown);
    },
  };
}
