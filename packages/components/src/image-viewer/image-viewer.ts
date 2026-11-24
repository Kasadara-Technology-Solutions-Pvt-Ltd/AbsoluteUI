/**
 * Image Viewer (R20 P10). An inline viewer or a gallery lightbox (modal <dialog>) for photos,
 * scans, and screenshots: zoom by wheel, pinch, buttons, and + / - keys; pan by drag and arrow
 * keys; rotate; fit and actual size; previous and next with a thumbnail strip; and a crop mode
 * with aspect ratio presets that produces a canvas and a Blob (`aui-crop`). Every image needs
 * alt text (or `decorative: true`); URLs are limited to https:, blob:, raster data:image, and
 * the document's own origin. Transforms are custom properties set through the CSSOM.
 */
import { configurationError, createId, defineComponentConfig, DisposableGroup, emit, formatNumber, getMessage, registerMessages, runtimeError, validators, type Disposer } from '@absoluteui/core';
import { renderIcon, type IconRef } from '@absoluteui/icons';
import { chevronLeftIcon } from '@absoluteui/icons/set/chevron-left';
import { chevronRightIcon } from '@absoluteui/icons/set/chevron-right';
import { closeIcon } from '@absoluteui/icons/set/close';
import { cropIcon } from '@absoluteui/icons/set/crop';
import { downloadIcon } from '@absoluteui/icons/set/download';
import { imageOffIcon } from '@absoluteui/icons/set/image-off';
import { maximizeIcon } from '@absoluteui/icons/set/maximize';
import { minimizeIcon } from '@absoluteui/icons/set/minimize';
import { rotateIcon } from '@absoluteui/icons/set/rotate';
import { zoomInIcon } from '@absoluteui/icons/set/zoom-in';
import { zoomOutIcon } from '@absoluteui/icons/set/zoom-out';
import { announce, createFocusRestore, createRovingTabindex, lockScroll, observeResize, registerOverlayLayer, trackPointerFocus, type FocusRestore, type RovingTabindex } from '@absoluteui/utilities';
import { Button } from '../button/button.js';
import { initialCrop, moveCrop, reshapeCrop, resizeCrop, type CropCorner, type CropRect } from './crop.js';
import { isSafeImageUrl } from './url.js';

export interface ImageViewerConfig {
  /** Zoom factor of one zoom step (buttons, keys, wheel notch). */
  zoomStep: number;
  /** Smallest zoom (1 = actual size). Fit may go lower for very large images. */
  minZoom: number;
  /** Largest zoom. */
  maxZoom: number;
  /** Show the thumbnail strip when there are two or more images. */
  showThumbnails: boolean;
}

declare module '@absoluteui/core' {
  interface ComponentConfigMap {
    imageViewer: ImageViewerConfig & { locale: string };
  }
}

export const imageViewerConfig = defineComponentConfig<ImageViewerConfig, 'locale'>(
  'imageViewer',
  {
    zoomStep: { default: 1.25, expected: 'number from 1.05 to 4', validate: validators.numberInRange(1.05, 4) },
    minZoom: { default: 0.1, expected: 'number from 0.01 to 1', validate: validators.numberInRange(0.01, 1) },
    maxZoom: { default: 8, expected: 'number from 1 to 32', validate: validators.numberInRange(1, 32) },
    showThumbnails: { default: true, expected: 'boolean', validate: validators.isBoolean },
  },
  ['locale'],
);

registerMessages('imageViewer', 'en', {
  counter: '{index} of {count}',
  imageLabel: 'Image {index} of {count}: {alt}',
  untitled: 'Image {index}',
  zoom: 'Zoom {zoom}',
  rotated: 'Rotated to {degrees} degrees',
  previous: 'Previous image',
  next: 'Next image',
  zoomIn: 'Zoom in',
  zoomOut: 'Zoom out',
  fit: 'Fit to view',
  actualSize: 'Actual size',
  rotateLeft: 'Rotate left',
  rotateRight: 'Rotate right',
  crop: 'Crop',
  download: 'Download',
  close: 'Close',
  toolbar: 'Image tools',
  thumbnails: 'Images',
  cropArea: 'Crop area, {width} by {height} pixels',
  aspect: 'Aspect ratio',
  free: 'Free',
  applyCrop: 'Apply crop',
  cancelCrop: 'Cancel',
  cropped: 'Image cropped to {width} by {height} pixels',
  loading: 'Loading image',
  loadError: 'The image could not be loaded: {alt}',
  cropError: 'The image cannot be cropped: it was loaded from another origin without CORS permission.',
  help: 'Plus and minus zoom, 0 fits the image, 1 shows the actual size, R rotates, arrow keys pan a zoomed image or move between images.',
  cropHelp: 'Arrow keys move the crop area, Shift with arrow keys resizes it, Enter applies the crop, Escape cancels.',
});

/** One image of the viewer. */
export interface ImageViewerImage {
  /** https:, blob:, raster data:image, relative, or same-origin URL. */
  src: string;
  /** Alternative text (required unless `decorative`). */
  alt: string;
  /** Purely decorative: no alt text needed; announced as "Image n". */
  decorative?: boolean;
  /** Visible caption under the image (text). */
  caption?: string;
  /** Smaller image for the thumbnail strip (same URL rules). Default: `src`. */
  thumbnail?: string;
  /** Intrinsic width and height in pixels, used before the image has loaded (no layout shift). */
  width?: number;
  height?: number;
  /** Show a Download link that saves the image under this file name. */
  downloadName?: string;
}

/** An aspect ratio preset of the crop mode: width / height, or null for free. */
export interface ImageViewerAspectRatio {
  label: string;
  value: number | null;
}

export type ImageViewerMode = 'inline' | 'lightbox';
export type ImageViewerCropType = 'image/png' | 'image/jpeg' | 'image/webp';

export interface ImageViewerIcons {
  previous: IconRef;
  next: IconRef;
  zoomIn: IconRef;
  zoomOut: IconRef;
  fit: IconRef;
  actualSize: IconRef;
  rotate: IconRef;
  crop: IconRef;
  download: IconRef;
  close: IconRef;
  error: IconRef;
}

export interface ImageViewerOptions extends Partial<ImageViewerConfig> {
  /** Accessible name of the viewer, such as "Employee documents". */
  label: string;
  /** One or more images. */
  images: readonly ImageViewerImage[];
  /** `inline` renders into the host; `lightbox` renders a modal dialog opened with `open()`. Create-only. Default `inline`. */
  mode?: ImageViewerMode;
  /** Initially shown image. Default 0. */
  index?: number;
  /** Previous on the first image goes to the last, and next on the last to the first. Default false. */
  loop?: boolean;
  /** Show the Crop tool. Default false. */
  croppable?: boolean;
  /** Crop presets. Default Free, 1:1, 4:3, 16:9, 3:2. */
  aspectRatios?: readonly ImageViewerAspectRatio[];
  /** Blob type of the crop output. Default `image/png`. */
  cropType?: ImageViewerCropType;
  /** Quality from 0 to 1 for `image/jpeg` and `image/webp`. */
  cropQuality?: number;
  /** CORS mode of the image request; needed to crop cross-origin images. Default none. */
  crossOrigin?: 'anonymous' | 'use-credentials' | null;
  /** When the wheel zooms: `ctrl` (Ctrl or pinch gesture only), `always`, or `auto` (ctrl inline, always in the lightbox). Default `auto`. */
  wheelZoom?: 'auto' | 'ctrl' | 'always';
  locale?: string;
  icons?: Partial<ImageViewerIcons>;
}

/** `aui-change` detail: the shown image changed. */
export interface ImageViewerChangeDetail {
  index: number;
  image: ImageViewerImage;
}

/** `aui-zoom` detail: zoom (1 = actual size) and whether the image is fitted. */
export interface ImageViewerZoomDetail {
  zoom: number;
  fit: boolean;
}

/** `aui-rotate` detail: rotation in degrees clockwise (0, 90, 180, 270). */
export interface ImageViewerRotateDetail {
  rotation: number;
  index: number;
}

/** A crop rectangle in natural pixels of the rotated image. */
export interface ImageViewerCropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** `aui-crop` detail and the result of `crop()`. */
export interface ImageViewerCropDetail {
  blob: Blob;
  canvas: HTMLCanvasElement;
  rect: ImageViewerCropRect;
  rotation: number;
  index: number;
  image: ImageViewerImage;
}

/** `aui-error` detail: an image failed to load, or a crop was refused. */
export interface ImageViewerErrorDetail {
  index: number;
  image: ImageViewerImage;
  reason: 'load' | 'crop';
  message: string;
}

/** `aui-open` and `aui-close` detail (lightbox). */
export interface ImageViewerOpenDetail {
  index: number;
}

const MODES: readonly ImageViewerMode[] = ['inline', 'lightbox'];
const CROP_TYPES: readonly ImageViewerCropType[] = ['image/png', 'image/jpeg', 'image/webp'];
const WHEEL: readonly NonNullable<ImageViewerOptions['wheelZoom']>[] = ['auto', 'ctrl', 'always'];
const CORNERS: readonly CropCorner[] = ['nw', 'ne', 'sw', 'se'];
const EPSILON = 1e-4;

const DEFAULT_ICONS: ImageViewerIcons = {
  previous: chevronLeftIcon,
  next: chevronRightIcon,
  zoomIn: zoomInIcon,
  zoomOut: zoomOutIcon,
  fit: minimizeIcon,
  actualSize: maximizeIcon,
  rotate: rotateIcon,
  crop: cropIcon,
  download: downloadIcon,
  close: closeIcon,
  error: imageOffIcon,
};

type ToolName = 'previous' | 'next' | 'zoomOut' | 'zoomIn' | 'fitToggle' | 'rotateLeft' | 'rotateRight' | 'crop' | 'download' | 'close';

interface Point {
  x: number;
  y: number;
}

export class ImageViewer {
  readonly host: HTMLElement;
  #options: ImageViewerOptions;
  readonly #doc: Document;
  readonly #mode: ImageViewerMode;
  /** The viewer element: the host (inline) or the dialog (lightbox). */
  readonly #root: HTMLElement;
  readonly #dialog: HTMLDialogElement | null;
  readonly #counter: HTMLSpanElement;
  readonly #toolbar: HTMLDivElement;
  readonly #zoomText: HTMLSpanElement;
  readonly #stage: HTMLDivElement;
  readonly #canvas: HTMLDivElement;
  readonly #img: HTMLImageElement;
  readonly #status: HTMLDivElement;
  readonly #statusIcon: HTMLSpanElement;
  readonly #statusText: HTMLSpanElement;
  readonly #cropBox: HTMLDivElement;
  readonly #caption: HTMLParagraphElement;
  readonly #cropBar: HTMLDivElement;
  readonly #aspectGroup: HTMLDivElement;
  readonly #thumbs: HTMLDivElement;
  readonly #help: HTMLSpanElement;
  readonly #cropHelp: HTMLSpanElement;
  readonly #tools = new Map<ToolName, Button<HTMLButtonElement | HTMLAnchorElement>>();
  #aspectButtons: Button[] = [];
  #cropButtons: Button[] = [];
  #thumbButtons: HTMLButtonElement[] = [];
  #thumbRoving: RovingTabindex | null = null;
  readonly #toolRoving: RovingTabindex;

  #index: number;
  #zoom = 1;
  #fit = true;
  #rotation = 0;
  #pan: Point = { x: 0, y: 0 };
  #natural: { width: number; height: number } | null = null;
  #state: 'loading' | 'loaded' | 'error' = 'loading';
  #crop: CropRect | null = null;
  #aspect: number | null = null;
  #dragging = false;
  readonly #pointers = new Map<number, Point>();
  #pinch: { distance: number; zoom: number } | null = null;
  #restore: FocusRestore | null = null;
  #unlockScroll: Disposer | null = null;
  #unregisterLayer: Disposer | null = null;
  readonly #group = new DisposableGroup();

  /** Render into `host` (inline: children are replaced; lightbox: a dialog is appended to the body). */
  static create(host: HTMLElement, options: ImageViewerOptions): ImageViewer {
    return new ImageViewer(host, options);
  }

  private constructor(host: HTMLElement, options: ImageViewerOptions) {
    const doc = host.ownerDocument;
    ImageViewer.#assert(options, doc);
    this.host = host;
    this.#doc = doc;
    this.#options = { ...options };
    this.#mode = options.mode ?? 'inline';
    this.#index = Math.min(options.index ?? 0, options.images.length - 1);
    trackPointerFocus(doc);

    const el = <K extends keyof HTMLElementTagNameMap>(tag: K, className: string): HTMLElementTagNameMap[K] => {
      const node = doc.createElement(tag);
      node.className = className;
      return node;
    };
    this.#dialog = this.#mode === 'lightbox' ? el('dialog', 'aui-image-viewer aui-image-viewer--lightbox') : null;
    this.#root = this.#dialog ?? host;

    const header = el('div', 'aui-image-viewer__header');
    this.#counter = el('span', 'aui-image-viewer__counter');
    this.#toolbar = el('div', 'aui-image-viewer__toolbar');
    this.#toolbar.setAttribute('role', 'toolbar');
    this.#zoomText = el('span', 'aui-image-viewer__zoom');
    this.#zoomText.setAttribute('aria-hidden', 'true');
    header.append(this.#counter, this.#toolbar);

    this.#stage = el('div', 'aui-image-viewer__stage');
    this.#stage.id = createId('aui-image-viewer-stage');
    this.#stage.tabIndex = 0;
    this.#stage.setAttribute('role', 'group');
    this.#canvas = el('div', 'aui-image-viewer__canvas');
    this.#img = el('img', 'aui-image-viewer__image');
    this.#img.decoding = 'async';
    this.#img.draggable = false;
    this.#canvas.append(this.#img);
    this.#status = el('div', 'aui-image-viewer__status');
    this.#statusIcon = el('span', 'aui-image-viewer__status-icon');
    this.#statusText = el('span', 'aui-image-viewer__status-text');
    this.#status.append(this.#statusIcon, this.#statusText);
    this.#cropBox = el('div', 'aui-image-viewer__crop');
    this.#cropBox.tabIndex = 0;
    this.#cropBox.setAttribute('role', 'group');
    this.#cropBox.hidden = true;
    for (const corner of CORNERS) {
      const handle = el('span', `aui-image-viewer__handle aui-image-viewer__handle--${corner}`);
      handle.dataset.corner = corner;
      this.#cropBox.append(handle);
    }
    this.#help = el('span', 'aui-image-viewer__help');
    this.#help.id = createId('aui-image-viewer-help');
    this.#cropHelp = el('span', 'aui-image-viewer__help');
    this.#cropHelp.id = createId('aui-image-viewer-crop-help');
    this.#stage.append(this.#canvas, this.#status, this.#cropBox, this.#help, this.#cropHelp);
    this.#stage.setAttribute('aria-describedby', this.#help.id);
    this.#cropBox.setAttribute('aria-describedby', this.#cropHelp.id);
    this.#toolbar.setAttribute('aria-controls', this.#stage.id);

    this.#caption = el('p', 'aui-image-viewer__caption');
    this.#cropBar = el('div', 'aui-image-viewer__crop-bar');
    this.#cropBar.hidden = true;
    this.#aspectGroup = el('div', 'aui-image-viewer__aspects');
    this.#aspectGroup.setAttribute('role', 'group');
    this.#cropBar.append(this.#aspectGroup);
    this.#thumbs = el('div', 'aui-image-viewer__thumbs');
    this.#thumbs.setAttribute('role', 'group');

    // Render first: invalid configuration or icons throw before the host is touched.
    this.#buildTools();
    this.#buildCropBar();
    this.#render();

    const parts = [header, this.#stage, this.#caption, this.#cropBar, this.#thumbs];
    if (this.#dialog) {
      this.#dialog.append(...parts);
      host.classList.add('aui-image-viewer-host');
      doc.body.append(this.#dialog);
    } else {
      host.classList.add('aui-image-viewer', 'aui-image-viewer--inline');
      host.setAttribute('role', 'region');
      host.replaceChildren(...parts);
    }
    // Keyboard helpers read the writing direction, so they start once the viewer is in the document.
    this.#buildThumbs();
    this.#toolRoving = createRovingTabindex(this.#toolbar, {
      orientation: 'horizontal',
      loop: false,
      direction: this.#direction(),
      getItems: () => [...this.#toolbar.querySelectorAll<HTMLElement>('.aui-button')].filter((b) => !b.hidden),
    });
    this.#group.add(() => {
      this.#toolRoving.dispose();
    });
    this.#bind();
    this.#load();
    this.#group.add(imageViewerConfig.subscribe(() => {
      this.#render();
      this.#layout();
    }));
  }

  get options(): Readonly<ImageViewerOptions> {
    return this.#options;
  }

  /** Index of the shown image. */
  get index(): number {
    return this.#index;
  }

  /** Current zoom (1 = actual size). */
  get zoom(): number {
    return this.#zoom;
  }

  /** Whether the image is fitted to the view. */
  get fitted(): boolean {
    return this.#fit;
  }

  /** Rotation in degrees clockwise: 0, 90, 180, or 270. */
  get rotation(): number {
    return this.#rotation;
  }

  get cropping(): boolean {
    return this.#crop !== null;
  }

  /** The crop rectangle in natural pixels of the rotated image, or null outside crop mode. */
  get cropRect(): ImageViewerCropRect | null {
    return this.#crop === null ? null : { ...this.#crop };
  }

  /** Lightbox: whether the dialog is open. Inline viewers are always open. */
  get isOpen(): boolean {
    return this.#dialog === null ? true : this.#dialog.open;
  }

  /** The dialog element of a lightbox (null inline). */
  get dialog(): HTMLDialogElement | null {
    return this.#dialog;
  }

  /** Lightbox: open the dialog, optionally at an image. Inline: show that image. */
  open(index?: number): void {
    if (index !== undefined) this.show(index);
    const dialog = this.#dialog;
    if (dialog === null || dialog.open) return;
    this.#restore = createFocusRestore(this.#doc);
    this.#unlockScroll = lockScroll(this.#doc);
    dialog.showModal();
    this.#unregisterLayer = registerOverlayLayer(dialog, {
      dismissOnOutsidePointer: false,
      onDismiss: (reason) => {
        if (reason !== 'escape') return;
        if (this.#crop !== null) this.cancelCrop();
        else this.close();
      },
    });
    this.#stage.focus();
    this.#layout();
    emit(this.host, 'aui-open', { index: this.#index } satisfies ImageViewerOpenDetail);
  }

  /** Lightbox: close the dialog and return focus to where it was. */
  close(): void {
    const dialog = this.#dialog;
    if (!dialog?.open) return;
    this.#endCrop(false);
    this.#unregisterLayer?.();
    this.#unregisterLayer = null;
    dialog.close();
    this.#unlockScroll?.();
    this.#unlockScroll = null;
    this.#restore?.restore();
    this.#restore = null;
    emit(this.host, 'aui-close', { index: this.#index } satisfies ImageViewerOpenDetail);
  }

  /** Show the image at `index` (clamped), fitted and unrotated. Emits `aui-change` when it changed. */
  show(index: number): void {
    const count = this.#options.images.length;
    const next = Math.max(0, Math.min(count - 1, Math.trunc(index)));
    if (next === this.#index) return;
    this.#index = next;
    this.#endCrop(false);
    this.#rotation = 0;
    this.#fit = true;
    this.#pan = { x: 0, y: 0 };
    this.#render();
    this.#load();
    const image = this.#image();
    announce(this.#imageLabel(), 'polite', this.#doc);
    emit(this.host, 'aui-change', { index: next, image } satisfies ImageViewerChangeDetail);
  }

  next(): void {
    const count = this.#options.images.length;
    if (this.#index < count - 1) this.show(this.#index + 1);
    else if (this.#options.loop === true && count > 1) this.show(0);
  }

  previous(): void {
    const count = this.#options.images.length;
    if (this.#index > 0) this.show(this.#index - 1);
    else if (this.#options.loop === true && count > 1) this.show(count - 1);
  }

  zoomIn(): void {
    this.#zoomTo(this.#zoom * this.#config().zoomStep, null, true);
  }

  zoomOut(): void {
    this.#zoomTo(this.#zoom / this.#config().zoomStep, null, true);
  }

  /** Set the zoom (1 = actual size), clamped to the zoom range, around the center. */
  setZoom(zoom: number): void {
    if (!Number.isFinite(zoom) || zoom <= 0) throw ImageViewer.#error('zoom', 'a positive number');
    this.#zoomTo(zoom, null, true);
  }

  /** Fit the whole image into the view. */
  fit(): void {
    this.#pan = { x: 0, y: 0 };
    this.#zoomTo(this.#fitZoom(), null, true);
  }

  /** Show the image at its natural size (zoom 1). */
  actualSize(): void {
    this.#zoomTo(1, null, true);
  }

  /** Rotate clockwise by a multiple of 90 degrees (negative turns counter-clockwise). */
  rotate(degrees = 90): void {
    if (!Number.isInteger(degrees) || degrees % 90 !== 0) throw ImageViewer.#error('rotate', 'a multiple of 90');
    if (this.#crop !== null) return;
    this.#rotation = (((this.#rotation + degrees) % 360) + 360) % 360;
    const wasFit = this.#fit;
    this.#pan = { x: 0, y: 0 };
    if (wasFit) this.#zoom = this.#fitZoom();
    this.#layout();
    announce(this.#m('rotated', { degrees: String(this.#rotation) }), 'polite', this.#doc);
    emit(this.host, 'aui-rotate', { rotation: this.#rotation, index: this.#index } satisfies ImageViewerRotateDetail);
  }

  /** Enter crop mode with an aspect ratio (width / height; null = free; default: the first preset). Needs a loaded image. */
  startCrop(aspect?: number | null): void {
    if (this.#state !== 'loaded' || this.#natural === null) return;
    if (aspect !== undefined && aspect !== null && !(Number.isFinite(aspect) && aspect > 0)) throw ImageViewer.#error('startCrop', 'a positive aspect ratio or null');
    const { width, height } = this.#rotated();
    this.#aspect = aspect === undefined ? (this.#aspectRatios()[0]?.value ?? null) : aspect;
    this.#pan = { x: 0, y: 0 };
    this.#zoom = this.#fitZoom();
    this.#fit = true;
    this.#crop = initialCrop(width, height, this.#aspect);
    this.#render();
    this.#layout();
    this.#cropBox.focus();
  }

  /** Leave crop mode without output. */
  cancelCrop(): void {
    this.#endCrop(true);
  }

  /** Crop the image to the crop rectangle: resolves with the canvas and Blob, emits `aui-crop`, and leaves crop mode. */
  async crop(): Promise<ImageViewerCropDetail> {
    const rect = this.#crop;
    const natural = this.#natural;
    if (rect === null || natural === null) throw runtimeError('IMAGE_VIEWER_NOT_CROPPING', 'crop() needs crop mode (startCrop) on a loaded image.', { component: 'image-viewer' });
    const o = this.#options;
    const index = this.#index;
    const image = this.#image();
    const rotation = this.#rotation;
    const { width: rw, height: rh } = this.#rotated();
    const canvas = this.#doc.createElement('canvas');
    canvas.width = rect.width;
    canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    if (ctx === null) throw runtimeError('IMAGE_VIEWER_CANVAS', 'A 2D canvas context is not available.', { component: 'image-viewer' });
    ctx.translate(-rect.x, -rect.y);
    ctx.translate(rw / 2, rh / 2);
    ctx.rotate((rotation * Math.PI) / 180);
    ctx.drawImage(this.#img, -natural.width / 2, -natural.height / 2, natural.width, natural.height);
    let blob: Blob;
    try {
      blob = await new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => {
          if (b === null) reject(new Error('empty canvas'));
          else resolve(b);
        }, o.cropType ?? 'image/png', o.cropQuality);
      });
    } catch (cause) {
      const message = this.#m('cropError');
      emit(this.host, 'aui-error', { index, image, reason: 'crop', message } satisfies ImageViewerErrorDetail);
      throw runtimeError('IMAGE_VIEWER_CROP', message, { component: 'image-viewer', remediation: String(cause) });
    }
    const detail: ImageViewerCropDetail = { blob, canvas, rect: { ...rect }, rotation, index, image };
    this.#endCrop(true);
    announce(this.#m('cropped', { width: String(rect.width), height: String(rect.height) }), 'polite', this.#doc);
    emit(this.host, 'aui-crop', detail);
    return detail;
  }

  update(options: Partial<ImageViewerOptions>): void {
    const next = { ...this.#options, ...options };
    if (next.mode !== undefined && next.mode !== this.#mode) throw ImageViewer.#error('mode', `${this.#mode} (mode is create-only)`);
    ImageViewer.#assert(next, this.#doc);
    const previous = { options: this.#options, index: this.#index };
    const src = this.#image().src;
    this.#options = next;
    if (options.index !== undefined) this.#index = options.index;
    this.#index = Math.min(this.#index, next.images.length - 1);
    try {
      if ('aspectRatios' in options || 'locale' in options) this.#buildCropBar();
      if ('images' in options || 'locale' in options) this.#buildThumbs();
      this.#render();
    } catch (error) {
      this.#options = previous.options;
      this.#index = previous.index;
      this.#buildCropBar();
      this.#buildThumbs();
      this.#render();
      throw error;
    }
    if (this.#image().src !== src) {
      this.#endCrop(false);
      this.#rotation = 0;
      this.#fit = true;
      this.#pan = { x: 0, y: 0 };
      this.#load();
    } else this.#layout();
  }

  destroy(): void {
    this.close();
    this.#thumbRoving?.dispose();
    this.#group.dispose();
    for (const b of [...this.#tools.values(), ...this.#aspectButtons, ...this.#cropButtons]) b.destroy();
    this.#img.removeAttribute('src');
    if (this.#dialog) {
      this.#dialog.remove();
      this.host.classList.remove('aui-image-viewer-host');
    } else {
      this.host.replaceChildren();
      this.host.removeAttribute('role');
      this.host.removeAttribute('aria-label');
      this.host.classList.remove('aui-image-viewer', 'aui-image-viewer--inline', 'aui-image-viewer--cropping', 'aui-image-viewer--zoomed');
    }
  }

  static #error(property: string, expected: string): Error {
    return configurationError('IMAGE_VIEWER_OPTIONS', 'Invalid image viewer options.', { component: 'image-viewer', property: `imageViewer.${property}`, expected });
  }

  static #assert(o: ImageViewerOptions, doc: Document): void {
    const fail = (property: string, expected: string): never => {
      throw ImageViewer.#error(property, expected);
    };
    const label: unknown = o.label;
    if (typeof label !== 'string' || label.trim() === '') fail('label', 'non-empty string (accessible name)');
    const images: unknown = o.images;
    if (!Array.isArray(images) || images.length === 0) fail('images', 'a non-empty array of ImageViewerImage');
    o.images.forEach((image: unknown, i) => {
      if (!validators.isRecord(image)) return fail(`images[${String(i)}]`, 'ImageViewerImage');
      const { src, alt, decorative, caption, thumbnail, width, height, downloadName } = image;
      if (typeof src !== 'string' || !isSafeImageUrl(src, doc)) fail(`images[${String(i)}].src`, 'https:, blob:, raster data:image, relative, or same-origin URL');
      if (decorative !== undefined && typeof decorative !== 'boolean') fail(`images[${String(i)}].decorative`, 'boolean');
      if (typeof alt !== 'string' || (decorative !== true && alt.trim() === '')) fail(`images[${String(i)}].alt`, 'non-empty alternative text (or decorative: true)');
      if (caption !== undefined && typeof caption !== 'string') fail(`images[${String(i)}].caption`, 'string');
      if (thumbnail !== undefined && (typeof thumbnail !== 'string' || !isSafeImageUrl(thumbnail, doc))) fail(`images[${String(i)}].thumbnail`, 'https:, blob:, raster data:image, relative, or same-origin URL');
      for (const [key, v] of [['width', width], ['height', height]] as const) {
        if (v !== undefined && !(typeof v === 'number' && Number.isFinite(v) && v > 0)) fail(`images[${String(i)}].${key}`, 'positive number');
      }
      if (downloadName !== undefined && (typeof downloadName !== 'string' || downloadName.trim() === '')) fail(`images[${String(i)}].downloadName`, 'non-empty string');
    });
    if (o.mode !== undefined && !MODES.includes(o.mode)) fail('mode', '"inline" | "lightbox"');
    const index: unknown = o.index;
    if (index !== undefined && !(typeof index === 'number' && Number.isInteger(index) && index >= 0 && index < o.images.length)) fail('index', 'integer index into images');
    for (const key of ['loop', 'croppable'] as const) {
      const v: unknown = o[key];
      if (v !== undefined && typeof v !== 'boolean') fail(key, 'boolean');
    }
    const ratios: unknown = o.aspectRatios;
    if (ratios !== undefined) {
      if (!Array.isArray(ratios) || ratios.length === 0) fail('aspectRatios', 'non-empty array of { label, value }');
      o.aspectRatios?.forEach((r: unknown, i) => {
        if (!validators.isRecord(r) || typeof r.label !== 'string' || r.label.trim() === '' || !(r.value === null || (typeof r.value === 'number' && Number.isFinite(r.value) && r.value > 0))) {
          fail(`aspectRatios[${String(i)}]`, '{ label: non-empty string, value: positive number | null }');
        }
      });
    }
    if (o.cropType !== undefined && !CROP_TYPES.includes(o.cropType)) fail('cropType', '"image/png" | "image/jpeg" | "image/webp"');
    const quality: unknown = o.cropQuality;
    if (quality !== undefined && !(typeof quality === 'number' && quality >= 0 && quality <= 1)) fail('cropQuality', 'number from 0 to 1');
    const cross: unknown = o.crossOrigin;
    if (cross !== undefined && cross !== null && cross !== 'anonymous' && cross !== 'use-credentials') fail('crossOrigin', '"anonymous" | "use-credentials" | null');
    if (o.wheelZoom !== undefined && !WHEEL.includes(o.wheelZoom)) fail('wheelZoom', '"auto" | "ctrl" | "always"');
    if (o.minZoom !== undefined && o.maxZoom !== undefined && o.minZoom > o.maxZoom) fail('minZoom', 'not greater than maxZoom');
  }

  #config(): Readonly<ImageViewerConfig & { locale: string }> {
    const o = this.#options;
    return imageViewerConfig.resolve({
      ...(o.zoomStep === undefined ? {} : { zoomStep: o.zoomStep }),
      ...(o.minZoom === undefined ? {} : { minZoom: o.minZoom }),
      ...(o.maxZoom === undefined ? {} : { maxZoom: o.maxZoom }),
      ...(o.showThumbnails === undefined ? {} : { showThumbnails: o.showThumbnails }),
      ...(o.locale === undefined ? {} : { locale: o.locale }),
    });
  }

  #m(key: string, params: Record<string, string> = {}): string {
    return getMessage('imageViewer', key, params, this.#config().locale);
  }

  #icons(): ImageViewerIcons {
    return { ...DEFAULT_ICONS, ...this.#options.icons };
  }

  #image(): ImageViewerImage {
    const image = this.#options.images[this.#index];
    if (image === undefined) throw runtimeError('IMAGE_VIEWER_INDEX', 'Image index out of range.', { component: 'image-viewer' });
    return image;
  }

  #altOf(image: ImageViewerImage, index: number): string {
    return image.decorative === true || image.alt.trim() === '' ? this.#m('untitled', { index: String(index + 1) }) : image.alt;
  }

  #imageLabel(): string {
    const count = this.#options.images.length;
    const alt = this.#altOf(this.#image(), this.#index);
    return count > 1 ? this.#m('imageLabel', { index: String(this.#index + 1), count: String(count), alt }) : alt;
  }

  #direction(): 'ltr' | 'rtl' {
    const view = this.#doc.defaultView;
    // defaultView is undefined in some server DOMs.
    return view != null && this.#root.isConnected && view.getComputedStyle(this.#root).direction === 'rtl' ? 'rtl' : 'ltr';
  }

  #aspectRatios(): readonly ImageViewerAspectRatio[] {
    return this.#options.aspectRatios ?? [
      { label: this.#m('free'), value: null },
      { label: '1:1', value: 1 },
      { label: '4:3', value: 4 / 3 },
      { label: '16:9', value: 16 / 9 },
      { label: '3:2', value: 3 / 2 },
    ];
  }

  // Building.

  #buildTools(): void {
    const icons = this.#icons();
    const tool = (name: ToolName, icon: IconRef, label: string): void => {
      const b = Button.create({ icon, label, variant: 'ghost', size: 'sm' }, this.#doc);
      b.element.classList.add('aui-image-viewer__tool', `aui-image-viewer__tool--${name}`);
      b.element.dataset.tool = name;
      this.#tools.set(name, b);
    };
    tool('previous', icons.previous, this.#m('previous'));
    tool('next', icons.next, this.#m('next'));
    tool('zoomOut', icons.zoomOut, this.#m('zoomOut'));
    tool('zoomIn', icons.zoomIn, this.#m('zoomIn'));
    tool('fitToggle', icons.actualSize, this.#m('actualSize'));
    tool('rotateLeft', icons.rotate, this.#m('rotateLeft'));
    tool('rotateRight', icons.rotate, this.#m('rotateRight'));
    tool('crop', icons.crop, this.#m('crop'));
    const link = this.#doc.createElement('a');
    const download = Button.enhance(link, { icon: icons.download, label: this.#m('download'), variant: 'ghost', size: 'sm' });
    link.classList.add('aui-image-viewer__tool', 'aui-image-viewer__tool--download');
    link.dataset.tool = 'download';
    this.#tools.set('download', download);
    if (this.#mode === 'lightbox') tool('close', icons.close, this.#m('close'));
    const order: ToolName[] = ['previous', 'next', 'zoomOut', 'zoomIn', 'fitToggle', 'rotateLeft', 'rotateRight', 'crop', 'download', 'close'];
    const nodes: Node[] = [];
    for (const name of order) {
      const b = this.#tools.get(name);
      if (!b) continue;
      if (name === 'zoomIn') nodes.push(this.#zoomText);
      nodes.push(b.element);
    }
    this.#toolbar.replaceChildren(...nodes);
  }

  #buildCropBar(): void {
    for (const b of [...this.#aspectButtons, ...this.#cropButtons]) b.destroy();
    const doc = this.#doc;
    this.#aspectButtons = this.#aspectRatios().map((r) => {
      const b = Button.create({ text: r.label, size: 'sm', variant: 'outline', pressed: r.value === this.#aspect }, doc);
      b.element.classList.add('aui-image-viewer__aspect');
      return b;
    });
    this.#aspectGroup.replaceChildren(...this.#aspectButtons.map((b) => b.element));
    const apply = Button.create({ text: this.#m('applyCrop'), size: 'sm', variant: 'primary' }, doc);
    apply.element.classList.add('aui-image-viewer__apply');
    const cancel = Button.create({ text: this.#m('cancelCrop'), size: 'sm', variant: 'secondary' }, doc);
    cancel.element.classList.add('aui-image-viewer__cancel');
    this.#cropButtons = [apply, cancel];
    const actions = doc.createElement('div');
    actions.className = 'aui-image-viewer__crop-actions';
    actions.append(apply.element, cancel.element);
    this.#cropBar.replaceChildren(this.#aspectGroup, actions);
  }

  #buildThumbs(): void {
    this.#thumbRoving?.dispose();
    this.#thumbRoving = null;
    const doc = this.#doc;
    this.#thumbButtons = this.#options.images.map((image, i) => {
      const b = doc.createElement('button');
      b.type = 'button';
      b.className = 'aui-image-viewer__thumb';
      b.dataset.index = String(i);
      b.setAttribute('aria-label', this.#altOf(image, i));
      const img = doc.createElement('img');
      img.alt = '';
      img.loading = 'lazy';
      img.decoding = 'async';
      img.draggable = false;
      img.src = image.thumbnail ?? image.src;
      b.append(img);
      return b;
    });
    this.#thumbs.replaceChildren(...this.#thumbButtons);
    this.#thumbRoving = createRovingTabindex(this.#thumbs, {
      orientation: 'horizontal',
      loop: false,
      direction: this.#direction(),
      getItems: () => this.#thumbButtons,
    });
    this.#thumbRoving.setActive(this.#index);
  }

  // Rendering.

  #render(): void {
    const o = this.#options;
    const config = this.#config();
    const icons = this.#icons();
    const count = o.images.length;
    const image = this.#image();
    const cropping = this.#crop !== null;

    const root = this.#root;
    root.setAttribute('aria-label', o.label);
    root.classList.toggle('aui-image-viewer--cropping', cropping);
    this.#counter.textContent = count > 1 ? this.#m('counter', { index: formatNumber(this.#index + 1, {}, config.locale), count: formatNumber(count, {}, config.locale) }) : '';
    this.#counter.hidden = count < 2;
    this.#toolbar.setAttribute('aria-label', this.#m('toolbar'));
    this.#stage.setAttribute('aria-label', this.#imageLabel());
    this.#help.textContent = this.#m('help');
    this.#cropHelp.textContent = this.#m('cropHelp');
    this.#img.alt = image.decorative === true ? '' : image.alt;
    this.#caption.textContent = image.caption ?? '';
    this.#caption.hidden = image.caption === undefined || image.caption === '';

    const loaded = this.#state === 'loaded';
    const disable = (name: ToolName, disabled: boolean): void => {
      const el = this.#tools.get(name)?.element;
      if (!el) return;
      if (disabled) el.setAttribute('aria-disabled', 'true');
      else el.removeAttribute('aria-disabled');
    };
    const hide = (name: ToolName, hidden: boolean): void => {
      const el = this.#tools.get(name)?.element;
      if (el) el.hidden = hidden;
    };
    const loop = o.loop === true && count > 1;
    hide('previous', count < 2);
    hide('next', count < 2);
    disable('previous', cropping || (!loop && this.#index === 0));
    disable('next', cropping || (!loop && this.#index === count - 1));
    const min = Math.min(config.minZoom, this.#fitZoom());
    disable('zoomOut', cropping || !loaded || this.#zoom <= min + EPSILON);
    disable('zoomIn', cropping || !loaded || this.#zoom >= config.maxZoom - EPSILON);
    disable('fitToggle', cropping || !loaded);
    disable('rotateLeft', cropping || !loaded);
    disable('rotateRight', cropping || !loaded);
    hide('crop', o.croppable !== true);
    disable('crop', cropping || !loaded);
    const fitToggle = this.#tools.get('fitToggle');
    const fitLabel = this.#fit ? this.#m('actualSize') : this.#m('fit');
    if (fitToggle && fitToggle.options.label !== fitLabel) fitToggle.update({ label: fitLabel, icon: this.#fit ? icons.actualSize : icons.fit });
    const download = this.#tools.get('download')?.element;
    if (download instanceof HTMLAnchorElement) {
      download.hidden = image.downloadName === undefined;
      if (image.downloadName === undefined) {
        download.removeAttribute('href');
        download.removeAttribute('download');
      } else {
        download.href = image.src;
        download.download = image.downloadName;
      }
    }
    this.#zoomText.textContent = formatNumber(this.#zoom, { style: 'percent', maximumFractionDigits: 0 }, config.locale);

    this.#cropBar.hidden = !cropping;
    this.#aspectGroup.setAttribute('aria-label', this.#m('aspect'));
    this.#aspectRatios().forEach((r, i) => {
      const b = this.#aspectButtons[i];
      if (b && b.pressed !== (r.value === this.#aspect)) b.update({ pressed: r.value === this.#aspect });
    });

    const thumbs = config.showThumbnails && count > 1;
    this.#thumbs.hidden = !thumbs;
    this.#thumbs.setAttribute('aria-label', this.#m('thumbnails'));
    this.#thumbButtons.forEach((b, i) => {
      if (i === this.#index) b.setAttribute('aria-current', 'true');
      else b.removeAttribute('aria-current');
      b.disabled = cropping;
    });

    const status = this.#state;
    this.#status.hidden = status === 'loaded';
    this.#status.classList.toggle('aui-image-viewer__status--error', status === 'error');
    this.#statusIcon.replaceChildren(status === 'error' ? renderIcon(icons.error, { doc: this.#doc }) : this.#doc.createTextNode(''));
    this.#statusText.textContent = status === 'error' ? this.#m('loadError', { alt: this.#altOf(image, this.#index) }) : this.#m('loading');
    this.#canvas.hidden = status === 'error';
  }

  /** Rotated natural size. */
  #rotated(): { width: number; height: number } {
    const n = this.#natural ?? { width: this.#image().width ?? 1, height: this.#image().height ?? 1 };
    return this.#rotation % 180 === 0 ? { width: n.width, height: n.height } : { width: n.height, height: n.width };
  }

  #stageSize(): { width: number; height: number } {
    return { width: this.#stage.clientWidth, height: this.#stage.clientHeight };
  }

  #fitZoom(): number {
    const stage = this.#stageSize();
    if (stage.width === 0 || stage.height === 0) return 1;
    const { width, height } = this.#rotated();
    return Math.min(1, stage.width / width, stage.height / height);
  }

  #clampPan(): void {
    const stage = this.#stageSize();
    const { width, height } = this.#rotated();
    const maxX = Math.max(0, (width * this.#zoom - stage.width) / 2);
    const maxY = Math.max(0, (height * this.#zoom - stage.height) / 2);
    this.#pan = { x: Math.max(-maxX, Math.min(maxX, this.#pan.x)), y: Math.max(-maxY, Math.min(maxY, this.#pan.y)) };
  }

  /** Apply zoom, pan, and rotation (custom properties through the CSSOM) and the crop box. */
  #layout(): void {
    if (this.#fit) this.#zoom = this.#fitZoom();
    this.#clampPan();
    const n = this.#natural ?? { width: this.#image().width ?? 0, height: this.#image().height ?? 0 };
    const s = this.#canvas.style;
    s.setProperty('--_aui-iv-w', `${String(n.width)}px`);
    s.setProperty('--_aui-iv-h', `${String(n.height)}px`);
    s.setProperty('--_aui-iv-x', `${String(this.#pan.x)}px`);
    s.setProperty('--_aui-iv-y', `${String(this.#pan.y)}px`);
    s.setProperty('--_aui-iv-scale', String(this.#zoom));
    s.setProperty('--_aui-iv-rotate', `${String(this.#rotation)}deg`);
    this.#canvas.classList.toggle('aui-image-viewer__canvas--dragging', this.#dragging);
    this.#root.classList.toggle('aui-image-viewer--zoomed', this.#zoom > this.#fitZoom() + EPSILON);

    const crop = this.#crop;
    this.#cropBox.hidden = crop === null;
    if (crop !== null) {
      const stage = this.#stageSize();
      const { width, height } = this.#rotated();
      const z = this.#zoom;
      const ox = (stage.width - width * z) / 2;
      const oy = (stage.height - height * z) / 2;
      const c = this.#cropBox.style;
      c.setProperty('--_aui-iv-crop-x', `${String(ox + crop.x * z)}px`);
      c.setProperty('--_aui-iv-crop-y', `${String(oy + crop.y * z)}px`);
      c.setProperty('--_aui-iv-crop-w', `${String(crop.width * z)}px`);
      c.setProperty('--_aui-iv-crop-h', `${String(crop.height * z)}px`);
      this.#cropBox.setAttribute('aria-label', this.#m('cropArea', { width: String(crop.width), height: String(crop.height) }));
    }
    this.#render();
  }

  /** Zoom to `zoom` (clamped) around `point` (relative to the stage center; null = center). */
  #zoomTo(zoom: number, point: Point | null, speak: boolean): void {
    if (this.#state !== 'loaded' || this.#crop !== null) return;
    const config = this.#config();
    const fit = this.#fitZoom();
    const next = Math.max(Math.min(config.minZoom, fit), Math.min(config.maxZoom, zoom));
    const previous = this.#zoom;
    const wasFit = this.#fit;
    const p = point ?? { x: 0, y: 0 };
    const ratio = next / previous;
    this.#pan = { x: p.x - (p.x - this.#pan.x) * ratio, y: p.y - (p.y - this.#pan.y) * ratio };
    this.#zoom = next;
    this.#fit = Math.abs(next - fit) < EPSILON;
    this.#layout();
    if (Math.abs(next - previous) < EPSILON && wasFit === this.#fit) return;
    if (speak) announce(this.#m('zoom', { zoom: formatNumber(next, { style: 'percent', maximumFractionDigits: 0 }, config.locale) }), 'polite', this.#doc);
    emit(this.host, 'aui-zoom', { zoom: next, fit: this.#fit } satisfies ImageViewerZoomDetail);
  }

  #load(): void {
    const image = this.#image();
    const img = this.#img;
    const cross = this.#options.crossOrigin ?? null;
    if (cross === null) img.removeAttribute('crossorigin');
    else img.crossOrigin = cross;
    this.#natural = image.width !== undefined && image.height !== undefined ? { width: image.width, height: image.height } : null;
    this.#state = 'loading';
    const same = img.getAttribute('src') === image.src;
    if (!same) img.src = image.src;
    this.#layout();
    if (same && img.complete) {
      if (img.naturalWidth > 0) this.#onLoad();
      else this.#onError();
    }
  }

  #onLoad(): void {
    this.#natural = { width: this.#img.naturalWidth, height: this.#img.naturalHeight };
    this.#state = 'loaded';
    this.#layout();
  }

  #onError(): void {
    this.#state = 'error';
    this.#layout();
    const image = this.#image();
    const message = this.#m('loadError', { alt: this.#altOf(image, this.#index) });
    announce(message, 'polite', this.#doc);
    emit(this.host, 'aui-error', { index: this.#index, image, reason: 'load', message } satisfies ImageViewerErrorDetail);
  }

  #endCrop(focus: boolean): void {
    if (this.#crop === null) return;
    this.#crop = null;
    this.#layout();
    if (focus) this.#stage.focus();
  }

  #setCrop(rect: CropRect): void {
    this.#crop = rect;
    this.#layout();
  }

  // Events.

  /** A point relative to the stage center. */
  #fromCenter(event: { clientX: number; clientY: number }): Point {
    const r = this.#stage.getBoundingClientRect();
    return { x: event.clientX - r.left - r.width / 2, y: event.clientY - r.top - r.height / 2 };
  }

  #bind(): void {
    const g = this.#group;
    g.listen(this.#img, 'load', () => {
      this.#onLoad();
    });
    g.listen(this.#img, 'error', () => {
      if (this.#img.getAttribute('src') !== null) this.#onError();
    });
    g.add(observeResize(this.#stage, () => {
      this.#layout();
    }));
    if (this.#dialog) {
      const dialog = this.#dialog;
      // Escape is handled by the overlay stack (crop first, then close); the native cancel never closes.
      g.listen(dialog, 'cancel', (event) => {
        event.preventDefault();
      });
      g.listen(dialog, 'close', () => {
        if (this.#unlockScroll) this.close();
      });
    }
    g.listen(this.#toolbar, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLElement>('[data-tool]') : null;
      if (!target || target.getAttribute('aria-disabled') === 'true') {
        if (target?.dataset.tool === 'download') event.preventDefault();
        return;
      }
      this.#runTool(target.dataset.tool);
    });
    g.listen(this.#thumbs, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest<HTMLButtonElement>('.aui-image-viewer__thumb') : null;
      if (!target || target.disabled) return;
      this.show(Number(target.dataset.index));
    });
    // The aspect toggle buttons are internal; their own change events stay inside.
    const stop = (event: Event): void => {
      event.stopPropagation();
    };
    this.#cropBar.addEventListener('aui-change', stop);
    g.add(() => {
      this.#cropBar.removeEventListener('aui-change', stop);
    });
    g.listen(this.#cropBar, 'click', (event) => {
      const target = event.target instanceof Element ? event.target.closest('button') : null;
      if (!target) return;
      const aspectIndex = this.#aspectButtons.findIndex((b) => b.element === target);
      if (aspectIndex >= 0) {
        const value = this.#aspectRatios()[aspectIndex]?.value ?? null;
        this.#aspect = value;
        const { width, height } = this.#rotated();
        if (this.#crop !== null) this.#setCrop(reshapeCrop(this.#crop, value, width, height));
        this.#render();
      } else if (target === this.#cropButtons[0]?.element) {
        void this.crop().catch(() => undefined);
      } else if (target === this.#cropButtons[1]?.element) {
        this.cancelCrop();
      }
    });
    g.listen(this.#stage, 'keydown', (event) => {
      if (event.target === this.#stage) this.#onStageKey(event);
    });
    g.listen(this.#cropBox, 'keydown', (event) => {
      this.#onCropKey(event);
    });
    g.listen(this.#stage, 'wheel', (event) => {
      this.#onWheel(event);
    }, { passive: false });
    g.listen(this.#stage, 'dblclick', (event) => {
      if (this.#crop !== null || this.#state !== 'loaded') return;
      if (this.#fit) this.#zoomTo(1, this.#fromCenter(event), true);
      else this.fit();
    });
    g.listen(this.#stage, 'pointerdown', (event) => {
      this.#onPointerDown(event);
    });
    g.listen(this.#stage, 'pointermove', (event) => {
      this.#onPointerMove(event);
    });
    const up = (event: PointerEvent): void => {
      this.#onPointerUp(event);
    };
    g.listen(this.#stage, 'pointerup', up);
    g.listen(this.#stage, 'pointercancel', up);
    g.listen(this.#stage, 'lostpointercapture', up);
  }

  #runTool(name: string | undefined): void {
    switch (name) {
      case 'previous':
        this.previous();
        break;
      case 'next':
        this.next();
        break;
      case 'zoomIn':
        this.zoomIn();
        break;
      case 'zoomOut':
        this.zoomOut();
        break;
      case 'fitToggle':
        if (this.#fit) this.actualSize();
        else this.fit();
        break;
      case 'rotateLeft':
        this.rotate(-90);
        break;
      case 'rotateRight':
        this.rotate(90);
        break;
      case 'crop':
        this.startCrop();
        break;
      case 'close':
        this.close();
        break;
      default:
        break;
    }
  }

  #onStageKey(event: KeyboardEvent): void {
    if (event.altKey || event.metaKey || (event.ctrlKey && event.key !== '+' && event.key !== '-' && event.key !== '=')) return;
    const rtl = this.#direction() === 'rtl';
    const zoomed = this.#zoom > this.#fitZoom() + EPSILON;
    const stage = this.#stageSize();
    const panBy = (dx: number, dy: number): void => {
      this.#pan = { x: this.#pan.x + dx, y: this.#pan.y + dy };
      this.#layout();
    };
    switch (event.key) {
      case '+':
      case '=':
        this.zoomIn();
        break;
      case '-':
      case '_':
        this.zoomOut();
        break;
      case '0':
        this.fit();
        break;
      case '1':
        this.actualSize();
        break;
      case 'r':
        this.rotate(90);
        break;
      case 'R':
        this.rotate(-90);
        break;
      case 'ArrowLeft':
      case 'ArrowRight': {
        const toLeft = event.key === 'ArrowLeft';
        if (zoomed) panBy((toLeft ? 1 : -1) * stage.width * 0.1, 0);
        else if (toLeft !== rtl) this.previous();
        else this.next();
        break;
      }
      case 'ArrowUp':
      case 'ArrowDown':
        if (!zoomed) return;
        panBy(0, (event.key === 'ArrowUp' ? 1 : -1) * stage.height * 0.1);
        break;
      case 'Home':
        if (zoomed) return;
        this.show(0);
        break;
      case 'End':
        if (zoomed) return;
        this.show(this.#options.images.length - 1);
        break;
      default:
        return;
    }
    event.preventDefault();
  }

  #onCropKey(event: KeyboardEvent): void {
    const crop = this.#crop;
    if (crop === null || event.target !== this.#cropBox) return;
    const { width, height } = this.#rotated();
    const step = Math.max(1, Math.round(Math.min(width, height) / 50));
    const deltas: Record<string, Point> = { ArrowLeft: { x: -step, y: 0 }, ArrowRight: { x: step, y: 0 }, ArrowUp: { x: 0, y: -step }, ArrowDown: { x: 0, y: step } };
    const d = deltas[event.key];
    if (d !== undefined) {
      event.preventDefault();
      this.#setCrop(event.shiftKey ? resizeCrop(crop, 'se', d.x, d.y, width, height, this.#aspect) : moveCrop(crop, d.x, d.y, width, height));
      const next = this.#crop ?? crop;
      announce(this.#m('cropArea', { width: String(next.width), height: String(next.height) }), 'polite', this.#doc);
    } else if (event.key === 'Enter') {
      event.preventDefault();
      void this.crop().catch(() => undefined);
    } else if (event.key === 'Escape') {
      // Inline viewers only: in a lightbox the overlay stack handles Escape first.
      event.preventDefault();
      this.cancelCrop();
    }
  }

  #wheelZooms(event: WheelEvent): boolean {
    const mode = this.#options.wheelZoom ?? 'auto';
    if (mode === 'always') return true;
    if (mode === 'ctrl') return event.ctrlKey;
    return this.#mode === 'lightbox' || event.ctrlKey;
  }

  #onWheel(event: WheelEvent): void {
    if (this.#crop !== null || this.#state !== 'loaded' || !this.#wheelZooms(event)) return;
    event.preventDefault();
    const delta = event.deltaMode === 1 ? event.deltaY * 16 : event.deltaY;
    this.#zoomTo(this.#zoom * Math.exp(-delta * 0.002), this.#fromCenter(event), false);
  }

  #onPointerDown(event: PointerEvent): void {
    if (event.button !== 0 || this.#state !== 'loaded') return;
    const target = event.target instanceof Element ? event.target : null;
    const crop = this.#crop;
    if (crop !== null) {
      if (!target || !this.#cropBox.contains(target)) return;
      const name = target instanceof HTMLElement ? target.dataset.corner : undefined;
      this.#startCropDrag(event, crop, CORNERS.find((c) => c === name) ?? null);
      return;
    }
    this.#pointers.set(event.pointerId, { x: event.clientX, y: event.clientY });
    this.#stage.setPointerCapture(event.pointerId);
    if (this.#pointers.size === 2) {
      const [a, b] = [...this.#pointers.values()];
      if (a && b) this.#pinch = { distance: Math.hypot(a.x - b.x, a.y - b.y), zoom: this.#zoom };
    }
    this.#dragging = true;
  }

  #onPointerMove(event: PointerEvent): void {
    const last = this.#pointers.get(event.pointerId);
    if (last === undefined) return;
    const now = { x: event.clientX, y: event.clientY };
    this.#pointers.set(event.pointerId, now);
    if (this.#pointers.size >= 2 && this.#pinch !== null) {
      const [a, b] = [...this.#pointers.values()];
      if (!a || !b || this.#pinch.distance === 0) return;
      const mid = this.#fromCenter({ clientX: (a.x + b.x) / 2, clientY: (a.y + b.y) / 2 });
      this.#zoomTo(this.#pinch.zoom * (Math.hypot(a.x - b.x, a.y - b.y) / this.#pinch.distance), mid, false);
      return;
    }
    if (this.#zoom <= this.#fitZoom() + EPSILON) return;
    this.#pan = { x: this.#pan.x + now.x - last.x, y: this.#pan.y + now.y - last.y };
    this.#layout();
  }

  #onPointerUp(event: PointerEvent): void {
    if (!this.#pointers.delete(event.pointerId)) return;
    if (this.#pointers.size < 2) this.#pinch = null;
    if (this.#pointers.size === 0) {
      this.#dragging = false;
      this.#layout();
    }
  }

  #startCropDrag(event: PointerEvent, start: CropRect, corner: CropCorner | null): void {
    event.preventDefault();
    event.stopPropagation();
    this.#cropBox.focus();
    const box = this.#cropBox;
    box.setPointerCapture(event.pointerId);
    const origin = { x: event.clientX, y: event.clientY };
    const { width, height } = this.#rotated();
    const z = this.#zoom;
    const move = (e: Event): void => {
      if (!(e instanceof PointerEvent) || e.pointerId !== event.pointerId) return;
      const dx = (e.clientX - origin.x) / z;
      const dy = (e.clientY - origin.y) / z;
      this.#setCrop(corner === null ? moveCrop(start, dx, dy, width, height) : resizeCrop(start, corner, dx, dy, width, height, this.#aspect));
    };
    const end = (e: Event): void => {
      if (e instanceof PointerEvent && e.pointerId !== event.pointerId) return;
      box.removeEventListener('pointermove', move);
      box.removeEventListener('pointerup', end);
      box.removeEventListener('pointercancel', end);
    };
    box.addEventListener('pointermove', move);
    box.addEventListener('pointerup', end);
    box.addEventListener('pointercancel', end);
  }
}
