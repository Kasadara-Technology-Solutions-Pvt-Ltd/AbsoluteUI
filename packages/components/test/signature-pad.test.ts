import { afterEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { SignaturePad, strokeSegments, type SignaturePadOptions, type SignaturePadValueDetail, type SignatureStroke } from '@absoluteui/components/signature-pad';
import { getFormControl } from '../src/internal/field.js';

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
});

function mount(options: Partial<SignaturePadOptions> = {}): SignaturePad {
  const host = document.createElement('div');
  host.style.width = '400px';
  document.body.append(host);
  return SignaturePad.create(host, { label: 'Signature', ...options });
}

const pad = (s: SignaturePad): HTMLElement => s.host.querySelector<HTMLElement>('.aui-signature-pad__pad')!;
const canvas = (s: SignaturePad): HTMLCanvasElement => s.host.querySelector('canvas')!;
const stroke: SignatureStroke = { points: [{ x: 0.1, y: 0.5, pressure: 0.5, t: 0 }, { x: 0.3, y: 0.4, pressure: 0.5, t: 16 }, { x: 0.5, y: 0.6, pressure: 0.5, t: 32 }] };

/**
 * Chromium's mouse pointer id. Synthetic events must use the id of an active pointer:
 * `setPointerCapture` throws NotFoundError for any other id.
 */
const MOUSE = 1;

/** Draws one stroke with synthetic pointer events (no CDP pointer path for pen pressure). */
function draw(s: SignaturePad, points: readonly [number, number][]): void {
  const r = pad(s).getBoundingClientRect();
  const at = (type: string, [x, y]: [number, number]): void => {
    pad(s).dispatchEvent(new PointerEvent(type, { bubbles: true, pointerId: MOUSE, button: 0, clientX: r.left + x * r.width, clientY: r.top + y * r.height, pointerType: 'mouse' }));
  };
  const [first, ...rest] = points;
  if (!first) return;
  at('pointerdown', first);
  for (const p of rest) at('pointermove', p);
  at('pointerup', rest.at(-1) ?? first);
}

describe('SignaturePad', () => {
  it('renders a labelled group, mode toggle buttons, and a named canvas image', () => {
    const s = mount();
    const box = s.host.querySelector('.aui-signature-pad__box')!;
    expect(box.getAttribute('role')).toBe('group');
    expect(document.getElementById(box.getAttribute('aria-labelledby')!)!.textContent).toContain('Signature');
    const modes = [...s.host.querySelectorAll('.aui-signature-pad__mode')];
    expect(modes.map((m) => [m.textContent, m.getAttribute('aria-pressed')])).toEqual([['Draw', 'true'], ['Type', 'false']]);
    expect(canvas(s).getAttribute('role')).toBe('img');
    expect(canvas(s).getAttribute('aria-label')).toBe('Signature pad, empty');
    expect(s.isEmpty).toBe(true);
    expect(s.value).toBeNull();
  });

  it('canvas uses the device pixel ratio', () => {
    const s = mount();
    const r = pad(s).getBoundingClientRect();
    expect(canvas(s).width).toBe(Math.round(r.width * devicePixelRatio));
  });

  it('drawing adds strokes with relative points and emits aui-change; undo and clear', () => {
    const s = mount();
    const log: unknown[] = [];
    s.host.addEventListener('aui-change', (e) => log.push((e as CustomEvent<SignaturePadValueDetail>).detail.value));
    draw(s, [[0.1, 0.5], [0.2, 0.4], [0.3, 0.6]]);
    draw(s, [[0.5, 0.5], [0.6, 0.5]]);
    const v = s.value;
    expect(v?.mode).toBe('draw');
    if (v?.mode === 'draw') {
      expect(v.strokes).toHaveLength(2);
      expect(v.strokes[0]!.points[0]!.x).toBeCloseTo(0.1, 1);
    }
    expect(canvas(s).getAttribute('aria-label')).toBe('Signature pad, signature drawn with 2 strokes');
    s.undo();
    expect(s.value?.mode === 'draw' && s.value.strokes.length).toBe(1);
    s.clear();
    expect(s.value).toBeNull();
    expect(log).toHaveLength(4);
  });

  it('pointer cancel discards the stroke in progress', () => {
    const s = mount();
    const r = pad(s).getBoundingClientRect();
    pad(s).dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerId: MOUSE, button: 0, pointerType: 'mouse', clientX: r.left + 10, clientY: r.top + 10 }));
    // The stroke started (placeholder hidden while drawing), so the cancel below is what discards it.
    expect(s.host.querySelector<HTMLElement>('.aui-signature-pad__placeholder')!.hidden).toBe(true);
    pad(s).dispatchEvent(new PointerEvent('pointercancel', { bubbles: true, pointerId: MOUSE, pointerType: 'mouse' }));
    expect(s.isEmpty).toBe(true);
  });

  it('typed alternative: Type focuses the labelled name field and the name becomes the value', async () => {
    const s = mount();
    await userEvent.click(s.host.querySelectorAll<HTMLElement>('.aui-signature-pad__mode')[1]!);
    const input = s.host.querySelector<HTMLInputElement>('.aui-signature-pad__typed-input')!;
    expect(document.activeElement).toBe(input);
    expect(input.labels?.[0]?.textContent).toBe('Type your full name');
    await userEvent.keyboard('Ana Ruiz');
    expect(s.value).toEqual({ mode: 'type', text: 'Ana Ruiz' });
    expect(canvas(s).getAttribute('aria-label')).toBe('Signature pad, typed signature: Ana Ruiz');
    expect(s.toSVG()).toContain('>Ana Ruiz</text>');
  });

  it('exports PNG and SVG data URLs; SVG escapes the typed name', () => {
    const s = mount({ value: { mode: 'draw', strokes: [stroke] } });
    expect(s.toDataURL()).toMatch(/^data:image\/png;base64,/);
    expect(s.toDataURL('svg')).toMatch(/^data:image\/svg\+xml;charset=utf-8,/);
    expect(s.toSVG()).toContain('<path d="M');
    s.setValue({ mode: 'type', text: '<b>&</b>' });
    expect(s.toSVG()).toContain('&lt;b&gt;&amp;&lt;/b&gt;');
  });

  it('strokeSegments: one segment per point after the first; pressure widens pens', () => {
    const segs = strokeSegments(stroke.points, 100, 50, 2);
    expect(segs).toHaveLength(2);
    const pen = strokeSegments(stroke.points.map((p) => ({ ...p, pressure: 1 })), 100, 50, 2);
    expect(pen[1]!.width).toBeGreaterThan(segs[1]!.width - 1);
    expect(strokeSegments([], 10, 10, 2)).toEqual([]);
  });

  it('required: invalid while empty; hidden input carries the data URL', () => {
    const s = mount({ required: true, name: 'sig', submit: 'svg' });
    expect(s.reportValidity()).toBe(false);
    expect(s.host.querySelector('.aui-field__error')!.textContent).toContain('This field is required.');
    s.setValue({ mode: 'draw', strokes: [stroke] });
    expect(s.validity.valid).toBe(true);
    const input = s.host.querySelector<HTMLInputElement>('input[type="hidden"]')!;
    expect(input.name).toBe('sig');
    expect(input.value).toMatch(/^data:image\/svg\+xml/);
    expect(s.getFormValue()).toBe(input.value);
    expect(getFormControl(s.host)).toBe(s);
  });

  it('read-only hides editing controls and ignores drawing', () => {
    const s = mount({ readOnly: true, value: { mode: 'draw', strokes: [stroke] } });
    expect(s.host.querySelector<HTMLElement>('.aui-signature-pad__modes')!.hidden).toBe(true);
    expect(s.host.querySelector<HTMLElement>('.aui-signature-pad__action')!.hidden).toBe(true);
    draw(s, [[0.2, 0.2], [0.4, 0.4]]);
    expect(s.value?.mode === 'draw' && s.value.strokes.length).toBe(1);
  });

  it('undo and clear are disabled when there is nothing to remove', () => {
    const s = mount();
    const [undo, clear] = [...s.host.querySelectorAll<HTMLButtonElement>('.aui-signature-pad__action')];
    expect(undo!.disabled).toBe(true);
    expect(clear!.disabled).toBe(true);
    expect(undo!.getAttribute('aria-label')).toBe('Undo last stroke');
  });

  it('reset restores the initial value', () => {
    const s = mount({ value: { mode: 'type', text: 'Ana' } });
    s.clear();
    expect(s.isEmpty).toBe(true);
    s.reset();
    expect(s.value).toEqual({ mode: 'type', text: 'Ana' });
  });

  it('penWidth is globally configurable and validated', () => {
    configureAbsoluteUI({ components: { signaturePad: { penWidth: 4 } } });
    const s = mount();
    expect(s.options.penWidth).toBeUndefined();
    expect(() => {
      configureAbsoluteUI({ components: { signaturePad: { penWidth: 50 } } });
    }).toThrow(AbsoluteUIError);
  });

  it('invalid options throw before the host is touched; invalid update keeps state', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    expect(() => SignaturePad.create(host, { label: '' })).toThrow(AbsoluteUIError);
    expect(() => SignaturePad.create(host, { label: 'X', penColor: 'not-a-color' })).toThrow(AbsoluteUIError);
    expect(() => SignaturePad.create(host, { label: 'X', typedFont: 'x;}' })).toThrow(AbsoluteUIError);
    expect(host.textContent).toBe('keep');
    const s = mount();
    expect(() => {
      s.update({ mode: 'paint' as 'draw' });
    }).toThrow(AbsoluteUIError);
    expect(s.mode).toBe('draw');
  });

  it('destroy removes rendering and the form registration', () => {
    const s = mount();
    const host = s.host;
    s.destroy();
    expect(host.childElementCount).toBe(0);
    expect(getFormControl(host)).toBeUndefined();
  });
});
