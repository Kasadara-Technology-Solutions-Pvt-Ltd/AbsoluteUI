import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { userEvent } from 'vitest/browser';
import { AbsoluteUIError, configureAbsoluteUI, resetAbsoluteUIConfig } from '@absoluteui/core';
import { ImageViewer, isSafeImageUrl, type ImageViewerChangeDetail, type ImageViewerCropDetail, type ImageViewerErrorDetail, type ImageViewerOptions, type ImageViewerZoomDetail } from '@absoluteui/components/image-viewer';
import { initialCrop, moveCrop, reshapeCrop, resizeCrop } from '../src/image-viewer/crop.js';

// Unit tests do not load the stylesheets: give the stage and canvas the layout rules style.scss would,
// so the stage has the configured height and the fit zoom is computed against it.
const CSS = `
.aui-image-viewer__stage { position: relative; overflow: hidden; block-size: var(--aui-image-viewer-height, 24rem); }
.aui-image-viewer__canvas { position: absolute; top: 50%; left: 50%; inline-size: var(--_aui-iv-w, 0); block-size: var(--_aui-iv-h, 0); }
.aui-image-viewer__image { display: block; inline-size: 100%; block-size: 100%; }
.aui-image-viewer__crop { position: absolute; }
`;

beforeEach(() => {
  const style = document.createElement('style');
  style.dataset.test = 'image-viewer';
  style.textContent = CSS;
  document.head.append(style);
});

afterEach(() => {
  resetAbsoluteUIConfig();
  document.body.replaceChildren();
  for (const style of document.head.querySelectorAll('style[data-test="image-viewer"]')) style.remove();
});

/** A solid PNG data URL of the given size. */
function png(width: number, height: number, color = '#2563eb'): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
  }
  return canvas.toDataURL('image/png');
}

const IMAGES = (): ImageViewerOptions['images'] => [
  { src: png(800, 600), alt: 'Blue rectangle', caption: 'First' },
  { src: png(400, 800, '#15803d'), alt: 'Green portrait' },
  { src: png(300, 300, '#b91c1c'), alt: 'Red square', downloadName: 'red.png' },
];

function mount(options: Partial<ImageViewerOptions> = {}): ImageViewer {
  const host = document.createElement('div');
  host.style.setProperty('--aui-image-viewer-height', '300px');
  host.style.width = '600px';
  document.body.append(host);
  return ImageViewer.create(host, { label: 'Gallery', images: IMAGES(), ...options });
}

async function loaded(v: ImageViewer): Promise<void> {
  const img = v.host.querySelector<HTMLImageElement>('.aui-image-viewer__image') ?? v.dialog?.querySelector<HTMLImageElement>('.aui-image-viewer__image');
  if (!img) throw new Error('no image');
  if (!img.complete) await new Promise((resolve) => { img.addEventListener('load', resolve, { once: true }); });
  // A repeated data URL can be complete at once while the load event (which the viewer waits for)
  // is still queued: wait until the viewer hides its loading status.
  const status = img.closest('.aui-image-viewer__stage')?.querySelector<HTMLElement>('.aui-image-viewer__status');
  for (let i = 0; i < 50 && status && !status.hidden; i++) await new Promise((resolve) => setTimeout(resolve, 5));
  await new Promise((resolve) => requestAnimationFrame(resolve));
}

function tool(v: ImageViewer, name: string): HTMLElement {
  const root = v.dialog ?? v.host;
  const el = root.querySelector<HTMLElement>(`[data-tool="${name}"]`);
  if (!el) throw new Error(`no tool ${name}`);
  return el;
}

describe('isSafeImageUrl', () => {
  it('accepts https, blob, raster data URLs, and same-origin URLs; rejects the rest', () => {
    expect(isSafeImageUrl('https://example.com/a.jpg', document)).toBe(true);
    expect(isSafeImageUrl('blob:https://example.com/123', document)).toBe(true);
    expect(isSafeImageUrl('data:image/png;base64,AAAA', document)).toBe(true);
    expect(isSafeImageUrl('data:image/webp;base64,AAAA', document)).toBe(true);
    expect(isSafeImageUrl('/files/a.png', document)).toBe(true);
    expect(isSafeImageUrl(`${location.origin}/a.png`, document)).toBe(true);
    expect(isSafeImageUrl('data:image/svg+xml,<svg></svg>', document)).toBe(false);
    expect(isSafeImageUrl('data:text/html,hi', document)).toBe(false);
    expect(isSafeImageUrl('javascript:alert(1)', document)).toBe(false);
    expect(isSafeImageUrl(' java\tscript:alert(1)', document)).toBe(false);
    expect(isSafeImageUrl('http://cross-origin.invalid/a.png', document)).toBe(false);
    expect(isSafeImageUrl('file:///etc/passwd', document)).toBe(false);
    expect(isSafeImageUrl('', document)).toBe(false);
  });
});

describe('crop math', () => {
  it('initial crop is centered and keeps the aspect ratio', () => {
    expect(initialCrop(1000, 500, null)).toEqual({ x: 100, y: 50, width: 800, height: 400 });
    expect(initialCrop(1000, 500, 1)).toEqual({ x: 300, y: 50, width: 400, height: 400 });
  });

  it('move stays inside; resize keeps the anchor, the minimum, and the aspect', () => {
    const r = { x: 100, y: 100, width: 200, height: 100 };
    expect(moveCrop(r, -500, 0, 1000, 500)).toEqual({ x: 0, y: 100, width: 200, height: 100 });
    expect(moveCrop(r, 2000, 2000, 1000, 500)).toEqual({ x: 800, y: 400, width: 200, height: 100 });
    expect(resizeCrop(r, 'se', 100, 0, 1000, 500, null)).toEqual({ x: 100, y: 100, width: 300, height: 100 });
    expect(resizeCrop(r, 'nw', 1000, 1000, 1000, 500, null)).toEqual({ x: 292, y: 192, width: 8, height: 8 });
    expect(resizeCrop(r, 'se', 100, 0, 1000, 500, 2)).toEqual({ x: 100, y: 100, width: 300, height: 150 });
    expect(reshapeCrop(r, 1, 1000, 500)).toEqual({ x: 100, y: 50, width: 200, height: 200 });
  });
});

describe('ImageViewer', () => {
  it('renders a labelled region, toolbar, stage, caption, counter, and thumbnails', async () => {
    const v = mount();
    await loaded(v);
    expect(v.host.getAttribute('role')).toBe('region');
    expect(v.host.getAttribute('aria-label')).toBe('Gallery');
    expect(v.host.querySelector('[role="toolbar"]')!.getAttribute('aria-label')).toBe('Image tools');
    const stage = v.host.querySelector<HTMLElement>('.aui-image-viewer__stage')!;
    expect(stage.getAttribute('aria-label')).toBe('Image 1 of 3: Blue rectangle');
    expect(stage.tabIndex).toBe(0);
    expect(v.host.querySelector('.aui-image-viewer__image')!.getAttribute('alt')).toBe('Blue rectangle');
    expect(v.host.querySelector('.aui-image-viewer__caption')!.textContent).toBe('First');
    expect(v.host.querySelector('.aui-image-viewer__counter')!.textContent).toBe('1 of 3');
    const thumbs = v.host.querySelectorAll<HTMLButtonElement>('.aui-image-viewer__thumb');
    expect(thumbs).toHaveLength(3);
    expect(thumbs[0]!.getAttribute('aria-current')).toBe('true');
    expect(thumbs[1]!.getAttribute('aria-label')).toBe('Green portrait');
    expect(tool(v, 'previous').getAttribute('aria-disabled')).toBe('true');
    expect(tool(v, 'crop').hidden).toBe(true);
  });

  it('validates options before touching the host', () => {
    const host = document.createElement('div');
    host.textContent = 'keep';
    document.body.append(host);
    const bad: unknown[] = [
      { label: '', images: IMAGES() },
      { label: 'x', images: [] },
      { label: 'x', images: [{ src: 'javascript:alert(1)', alt: 'x' }] },
      { label: 'x', images: [{ src: 'data:image/svg+xml,<svg/>', alt: 'x' }] },
      { label: 'x', images: [{ src: 'https://example.com/a.png', alt: '' }] },
      { label: 'x', images: IMAGES(), index: 9 },
      { label: 'x', images: IMAGES(), aspectRatios: [{ label: 'bad', value: -1 }] },
      { label: 'x', images: IMAGES(), minZoom: 1, maxZoom: 0.5 },
    ];
    for (const options of bad) {
      expect(() => ImageViewer.create(host, options as ImageViewerOptions)).toThrow(AbsoluteUIError);
    }
    expect(host.textContent).toBe('keep');
    // Decorative images need no alt text.
    expect(() => ImageViewer.create(host, { label: 'x', images: [{ src: png(10, 10), alt: '', decorative: true }] })).not.toThrow();
  });

  it('fits by default, zooms by buttons and keys, and emits aui-zoom', async () => {
    const v = mount();
    await loaded(v);
    expect(v.fitted).toBe(true);
    expect(v.zoom).toBeCloseTo(0.5, 2);
    const zooms: ImageViewerZoomDetail[] = [];
    v.host.addEventListener('aui-zoom', (e) => zooms.push((e as CustomEvent<ImageViewerZoomDetail>).detail));
    tool(v, 'zoomIn').click();
    expect(v.zoom).toBeCloseTo(0.625, 3);
    expect(v.fitted).toBe(false);
    const stage = v.host.querySelector<HTMLElement>('.aui-image-viewer__stage')!;
    stage.focus();
    await userEvent.keyboard('1');
    expect(v.zoom).toBe(1);
    await userEvent.keyboard('0');
    expect(v.fitted).toBe(true);
    await userEvent.keyboard('-');
    expect(v.zoom).toBeCloseTo(0.4, 3);
    expect(zooms.length).toBeGreaterThanOrEqual(4);
    expect(v.host.querySelector('.aui-image-viewer__canvas')!.hasAttribute('style')).toBe(true);
  });

  it('clamps zoom to the configured range', async () => {
    configureAbsoluteUI({ components: { imageViewer: { maxZoom: 2 } } });
    const v = mount();
    await loaded(v);
    v.setZoom(50);
    expect(v.zoom).toBe(2);
    expect(tool(v, 'zoomIn').getAttribute('aria-disabled')).toBe('true');
    expect(() => {
      v.setZoom(-1);
    }).toThrow(AbsoluteUIError);
  });

  it('rotates with R and Shift+R and emits aui-rotate', async () => {
    const v = mount();
    await loaded(v);
    const rotations: number[] = [];
    v.host.addEventListener('aui-rotate', (e) => rotations.push((e as CustomEvent<{ rotation: number }>).detail.rotation));
    v.host.querySelector<HTMLElement>('.aui-image-viewer__stage')!.focus();
    await userEvent.keyboard('r');
    expect(v.rotation).toBe(90);
    await userEvent.keyboard('{Shift>}R{/Shift}');
    expect(v.rotation).toBe(0);
    tool(v, 'rotateLeft').click();
    expect(v.rotation).toBe(270);
    expect(rotations).toEqual([90, 0, 270]);
  });

  it('moves between images with arrows, Home, End, and thumbnails, emitting aui-change', async () => {
    const v = mount();
    await loaded(v);
    const changes: number[] = [];
    v.host.addEventListener('aui-change', (e) => changes.push((e as CustomEvent<ImageViewerChangeDetail>).detail.index));
    v.host.querySelector<HTMLElement>('.aui-image-viewer__stage')!.focus();
    await userEvent.keyboard('{ArrowRight}');
    expect(v.index).toBe(1);
    await userEvent.keyboard('{End}');
    expect(v.index).toBe(2);
    expect(tool(v, 'next').getAttribute('aria-disabled')).toBe('true');
    expect(tool(v, 'download').getAttribute('download')).toBe('red.png');
    await userEvent.keyboard('{Home}');
    expect(v.index).toBe(0);
    v.host.querySelectorAll<HTMLButtonElement>('.aui-image-viewer__thumb')[1]!.click();
    expect(v.index).toBe(1);
    expect(changes).toEqual([1, 2, 0, 1]);
  });

  it('mirrors arrow navigation in RTL', async () => {
    document.documentElement.dir = 'rtl';
    try {
      const v = mount();
      await loaded(v);
      v.host.querySelector<HTMLElement>('.aui-image-viewer__stage')!.focus();
      await userEvent.keyboard('{ArrowLeft}');
      expect(v.index).toBe(1);
    } finally {
      document.documentElement.dir = '';
    }
  });

  it('loops with loop: true', async () => {
    const v = mount({ loop: true });
    await loaded(v);
    v.previous();
    expect(v.index).toBe(2);
    v.next();
    expect(v.index).toBe(0);
  });

  it('shows an error state and emits aui-error when an image fails', async () => {
    const broken = URL.createObjectURL(new Blob(['not an image'], { type: 'image/png' }));
    const host = document.createElement('div');
    document.body.append(host);
    const errors: ImageViewerErrorDetail[] = [];
    host.addEventListener('aui-error', (e) => errors.push((e as CustomEvent<ImageViewerErrorDetail>).detail));
    ImageViewer.create(host, { label: 'Broken', images: [{ src: broken, alt: 'Missing scan' }] });
    await new Promise((resolve) => setTimeout(resolve, 300));
    expect(errors[0]?.reason).toBe('load');
    const status = host.querySelector<HTMLElement>('.aui-image-viewer__status')!;
    expect(status.hidden).toBe(false);
    expect(status.textContent).toContain('Missing scan');
    URL.revokeObjectURL(broken);
  });

  it('crops to an aspect ratio by keyboard and resolves a Blob', async () => {
    const v = mount({ croppable: true });
    await loaded(v);
    tool(v, 'crop').click();
    expect(v.cropping).toBe(true);
    expect(v.cropRect).toEqual({ x: 80, y: 60, width: 640, height: 480 });
    const box = v.host.querySelector<HTMLElement>('.aui-image-viewer__crop')!;
    expect(document.activeElement).toBe(box);
    expect(box.getAttribute('aria-label')).toBe('Crop area, 640 by 480 pixels');
    // 1:1 preset.
    v.host.querySelectorAll<HTMLButtonElement>('.aui-image-viewer__aspect')[1]!.click();
    expect(v.cropRect!.width).toBe(v.cropRect!.height);
    await userEvent.keyboard('{ArrowLeft}');
    expect(v.cropRect!.x).toBeLessThan(160);
    let event: ImageViewerCropDetail | null = null;
    v.host.addEventListener('aui-crop', (e) => {
      event = (e as CustomEvent<ImageViewerCropDetail>).detail;
    });
    const result = await v.crop();
    expect(result.blob.type).toBe('image/png');
    expect(result.canvas.width).toBe(result.rect.width);
    expect(event).not.toBeNull();
    expect(v.cropping).toBe(false);
  });

  it('Escape cancels an inline crop', async () => {
    const v = mount({ croppable: true });
    await loaded(v);
    v.startCrop(null);
    await userEvent.keyboard('{Escape}');
    expect(v.cropping).toBe(false);
  });

  it('lightbox: opens a modal dialog, restores focus, closes on Escape', async () => {
    const trigger = document.createElement('button');
    trigger.textContent = 'Open';
    document.body.append(trigger);
    trigger.focus();
    const v = mount({ mode: 'lightbox' });
    expect(v.host.childElementCount).toBe(0);
    const opened: number[] = [];
    v.host.addEventListener('aui-open', (e) => opened.push((e as CustomEvent<{ index: number }>).detail.index));
    v.open(1);
    expect(v.isOpen).toBe(true);
    expect(v.dialog!.getAttribute('aria-label')).toBe('Gallery');
    expect(document.activeElement).toBe(v.dialog!.querySelector('.aui-image-viewer__stage'));
    expect(opened).toEqual([1]);
    await userEvent.keyboard('{Escape}');
    expect(v.isOpen).toBe(false);
    expect(document.activeElement).toBe(trigger);
    v.destroy();
    expect(document.querySelector('dialog.aui-image-viewer')).toBeNull();
  });

  it('update() replaces images and rejects a mode change; destroy() cleans up', async () => {
    const v = mount();
    await loaded(v);
    v.update({ images: [{ src: png(100, 100), alt: 'Only one' }] });
    expect(v.index).toBe(0);
    expect(v.host.querySelector<HTMLElement>('.aui-image-viewer__thumbs')!.hidden).toBe(true);
    expect(() => {
      v.update({ mode: 'lightbox' });
    }).toThrow(AbsoluteUIError);
    v.destroy();
    expect(v.host.childElementCount).toBe(0);
    expect(v.host.hasAttribute('role')).toBe(false);
  });
});
