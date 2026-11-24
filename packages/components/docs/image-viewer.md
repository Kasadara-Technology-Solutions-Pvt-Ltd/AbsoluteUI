# Image Viewer

> Package: `@absoluteui/components/image-viewer` | Styles: `@absoluteui/components/button/style.css` and `@absoluteui/components/image-viewer/style.css` | Since 0.13.0 | Status: R20

## 1. Purpose

Shows photos, scans, and screenshots inline or in a gallery lightbox (a modal dialog). Users zoom by wheel, pinch, buttons, and keys; pan by dragging or with arrow keys; rotate in 90 degree steps; switch between fit and actual size; move between images with previous and next or the thumbnail strip; and, with `croppable`, crop to an aspect ratio preset. The crop produces a canvas and a Blob (`aui-crop`) for the application to upload. Every image needs alt text, and image URLs are limited to safe schemes.

## 2. Anatomy

```text
<div class="aui-image-viewer aui-image-viewer--inline" role="region" aria-label="Receipts">   (lightbox: <dialog class="aui-image-viewer aui-image-viewer--lightbox">)
  <div class="aui-image-viewer__header">
    <span class="aui-image-viewer__counter">2 of 5</span>
    <div class="aui-image-viewer__toolbar" role="toolbar" aria-label="Image tools" aria-controls="stage">
      <button class="aui-button aui-image-viewer__tool--previous" aria-label="Previous image">...</button>
      ... next, zoom out, <span class="aui-image-viewer__zoom">100%</span>, zoom in, fit or actual size,
      rotate left, rotate right, crop, <a download> download, close (lightbox)
    </div>
  </div>
  <div class="aui-image-viewer__stage" role="group" tabindex="0" aria-label="Image 2 of 5: Hotel invoice" aria-describedby="help">
    <div class="aui-image-viewer__canvas"><img class="aui-image-viewer__image" alt="Hotel invoice"></div>
    <div class="aui-image-viewer__status">Loading image</div>
    <div class="aui-image-viewer__crop" role="group" tabindex="0" aria-label="Crop area, 640 by 480 pixels">4 handles</div>
    <span class="aui-image-viewer__help">keyboard help (visually hidden)</span>
  </div>
  <p class="aui-image-viewer__caption">Hotel, two nights</p>
  <div class="aui-image-viewer__crop-bar">aspect presets (aria-pressed), Apply crop, Cancel</div>
  <div class="aui-image-viewer__thumbs" role="group" aria-label="Images">
    <button class="aui-image-viewer__thumb" aria-label="Taxi receipt" aria-current="true"><img alt=""></button> ...
  </div>
</div>
```

## 3. When to use

- Inspecting scanned documents, receipts, or ID photos that need zoom and rotation.
- A gallery of attachments opened from a list or a file manager.
- Cropping an uploaded photo (profile pictures, document scans) before saving it.

## 4. When not to use

- A single decorative image in content: use a plain `img`.
- A slideshow of marketing content: use Carousel.
- Editing images beyond crop and rotation (filters, drawing).

## 5. Public properties

| Property | Type | Description |
|---|---|---|
| `host` | `HTMLElement` | Host element. |
| `options` | `Readonly<ImageViewerOptions>` | Current options. |
| `index` | `number` | Index of the shown image. |
| `zoom` | `number` | Current zoom (1 = actual size). |
| `fitted` | `boolean` | Whether the image is fitted to the view. |
| `rotation` | `number` | Rotation in degrees clockwise: 0, 90, 180, or 270. |
| `cropping` | `boolean` | Whether crop mode is active. |
| `cropRect` | `ImageViewerCropRect \| null` | Crop rectangle in natural pixels of the rotated image. |
| `isOpen` | `boolean` | Lightbox: whether the dialog is open (inline: always `true`). |
| `dialog` | `HTMLDialogElement \| null` | The lightbox dialog (`null` inline). |

Options (`ImageViewerOptions`):

| Option | Type | Default | Global config | Description |
|---|---|---|---|---|
| `label` | `string` | - (required) | No | Accessible name of the viewer. |
| `images` | `readonly ImageViewerImage[]` | - (required) | No | One or more images (see section 32). |
| `mode` | `'inline' \| 'lightbox'` | `'inline'` | No | Inline renders into the host; lightbox renders a modal dialog opened with `open()`. Create-only. |
| `index` | `number` | `0` | No | Shown image. |
| `loop` | `boolean` | `false` | No | Previous and next wrap around. |
| `croppable` | `boolean` | `false` | No | Show the Crop tool. |
| `aspectRatios` | `readonly ImageViewerAspectRatio[]` | Free, 1:1, 4:3, 16:9, 3:2 | No | Crop presets `{ label, value }` (width / height, or `null` for free). |
| `cropType` | `'image/png' \| 'image/jpeg' \| 'image/webp'` | `'image/png'` | No | Blob type of the crop output. |
| `cropQuality` | `number` | - | No | Quality from 0 to 1 for JPEG and WebP. |
| `crossOrigin` | `'anonymous' \| 'use-credentials' \| null` | `null` | No | CORS mode of the image request; needed to crop cross-origin images. |
| `wheelZoom` | `'auto' \| 'ctrl' \| 'always'` | `'auto'` | No | When the wheel zooms: `auto` needs Ctrl (or a trackpad pinch) inline and always zooms in the lightbox. |
| `icons` | `Partial<ImageViewerIcons>` | - | No | Tool and error icons. |
| `zoomStep` | `number` | `1.25` | Yes | Zoom factor of one step, 1.05 to 4. |
| `minZoom` | `number` | `0.1` | Yes | Smallest zoom, 0.01 to 1 (fit may go lower for very large images). |
| `maxZoom` | `number` | `8` | Yes | Largest zoom, 1 to 32. |
| `showThumbnails` | `boolean` | `true` | Yes | Show the thumbnail strip for two or more images. |
| `locale` | `string` | common config | Yes (common) | Locale of the counter, zoom level, and messages. |

## 6. Methods

| Method | Description |
|---|---|
| `ImageViewer.create(host, options)` | Inline: render into `host` (children are replaced). Lightbox: append the dialog to the body; the host stays empty. |
| `open(index?)` | Lightbox: open the dialog, optionally at an image; focus moves to the stage. Inline: show that image. |
| `close()` | Lightbox: close and return focus to where it was. |
| `show(index)` | Show an image (clamped), fitted and unrotated. |
| `next()` / `previous()` | Next or previous image (wraps with `loop`). |
| `zoomIn()` / `zoomOut()` | Zoom by one step around the center. |
| `setZoom(zoom)` | Set the zoom (1 = actual size), clamped to the zoom range. |
| `fit()` / `actualSize()` | Fit the image into the view, or show it at 100%. |
| `rotate(degrees = 90)` | Rotate by a multiple of 90 degrees (negative is counter-clockwise). |
| `startCrop(aspect?)` | Enter crop mode with an aspect ratio (default: the first preset); needs a loaded image. |
| `cancelCrop()` | Leave crop mode without output. |
| `crop()` | Crop to the crop rectangle: resolves with `{ blob, canvas, rect, rotation, index, image }`, emits `aui-crop`, and leaves crop mode. |
| `update(options)` | Merge and apply options; a changed image source reloads and resets zoom and rotation. |
| `destroy()` | Close, remove rendering, buttons, and listeners. |

## 7. Events

| Event | Detail | When |
|---|---|---|
| `aui-change` | `{ index, image }` | The shown image changed (tools, keys, thumbnails, or `show()`). |
| `aui-zoom` | `{ zoom, fit }` | The zoom changed. |
| `aui-rotate` | `{ rotation, index }` | The image was rotated. |
| `aui-crop` | `{ blob, canvas, rect, rotation, index, image }` | A crop was applied. |
| `aui-error` | `{ index, image, reason: 'load' \| 'crop', message }` | An image failed to load, or a crop was refused because the canvas is tainted. |
| `aui-open` / `aui-close` | `{ index }` | The lightbox opened or closed. |

All events bubble from the host.

## 8. Slots/content areas

None. Images are given as data (`images`); captions are text.

## 9. CSS parts/hooks

`aui-image-viewer`, `aui-image-viewer--inline`, `aui-image-viewer--lightbox`, `aui-image-viewer--zoomed`, `aui-image-viewer--cropping`, `aui-image-viewer-host`, `aui-image-viewer__header`, `aui-image-viewer__counter`, `aui-image-viewer__toolbar`, `aui-image-viewer__tool--<name>`, `aui-image-viewer__zoom`, `aui-image-viewer__stage`, `aui-image-viewer__canvas`, `aui-image-viewer__image`, `aui-image-viewer__status` (`--error`), `aui-image-viewer__crop`, `aui-image-viewer__handle--nw|ne|sw|se`, `aui-image-viewer__caption`, `aui-image-viewer__crop-bar`, `aui-image-viewer__aspect`, `aui-image-viewer__apply`, `aui-image-viewer__cancel`, `aui-image-viewer__thumbs`, `aui-image-viewer__thumb`. The inline stage height is `--aui-image-viewer-height` (default `24rem`). All rules are in the `aui.components` layer.

## 10. Design tokens

See `metadata/image-viewer/tokens.json` (verified in CI). Component tokens: `--aui-image-viewer-stage-bg` (`color-surface-sunken`), `--aui-image-viewer-crop-border` (`color-focus-ring`), `--aui-image-viewer-crop-overlay` (`color-backdrop`), `--aui-image-viewer-thumb-selected` (`color-primary`), and `--aui-image-viewer-radius` (`radius-md`). Tools use the Button tokens.

## 11. States

Inline; lightbox open or closed; loading, loaded, or load error; fitted or zoomed; rotated; cropping; a single image (no counter, navigation, or thumbnails) or a gallery.

## 12. State transitions

| From | Trigger | To |
|---|---|---|
| closed (lightbox) | `open()` | open; focus on the stage; `aui-open` |
| open (lightbox) | Escape, Close tool, `close()` | closed; focus restored; `aui-close` |
| loading | image loads | loaded (fitted) |
| loading | image fails | error state; `aui-error` (`load`) |
| fitted | zoom in, wheel, pinch, `1`, double click | zoomed; `aui-zoom` |
| zoomed | `0`, Fit tool, double click | fitted; `aui-zoom` |
| any image | previous, next, thumbnail, `show()` | another image (fitted, unrotated); `aui-change` |
| loaded | Crop tool, `startCrop()` | cropping (fitted; zoom, pan, rotation, and navigation paused) |
| cropping | Apply, Enter, `crop()` | loaded; `aui-crop`, or `aui-error` (`crop`) when the canvas is tainted |
| cropping | Cancel, Escape, `cancelCrop()` | loaded |

## 13. Keyboard matrix

| Key | Context | Action |
|---|---|---|
| + / = | Stage | Zoom in. |
| - | Stage | Zoom out. |
| 0 | Stage | Fit the image to the view. |
| 1 | Stage | Actual size (100%). |
| R / Shift+R | Stage | Rotate clockwise / counter-clockwise. |
| ArrowLeft / ArrowRight | Stage | Previous / next image (mirrored in RTL); pans when zoomed in. |
| ArrowUp / ArrowDown | Stage, zoomed in | Pan. |
| Home / End | Stage | First / last image. |
| ArrowLeft / ArrowRight / Home / End | Toolbar or thumbnails | Move between tools or thumbnails (roving tabindex). |
| Enter / Space | Tool or thumbnail | Activate the tool or show the image. |
| Arrow keys | Crop area | Move the crop area. |
| Shift+Arrow keys | Crop area | Resize the crop area (keeps the aspect ratio). |
| Enter | Crop area | Apply the crop. |
| Escape | Crop mode / lightbox | Cancel the crop; otherwise close the lightbox. |

## 14. ARIA contract

- Inline, the host is `role="region"` named by `label`; the lightbox is a modal `<dialog>` named by `label`.
- The toolbar is `role="toolbar"` with `aria-controls` pointing at the stage; unavailable tools have `aria-disabled="true"` and stay focusable.
- The stage is a focusable `role="group"` named "Image 2 of 5: alt text" and described by visually hidden keyboard help; the image has the image's alt text.
- Thumbnails are buttons named by alt text; the current one has `aria-current="true"`.
- The crop area is a focusable `role="group"` named with its size and described by the crop keyboard help; aspect presets are toggle buttons with `aria-pressed`.

## 15. Accessibility notes

- Alt text is required for every image; set `decorative: true` only for images that add nothing (they are announced as "Image n").
- Image changes, zoom steps, rotation, crop size changes, and load errors are announced politely.
- Pinch and drag have single-pointer and keyboard alternatives (buttons, keys, double click) for WCAG 2.5.1 and 2.5.7.
- The lightbox returns focus to the element that opened it.
- The e2e axe run covers three themes; manual screen-reader verification is pending.

## 16. Responsive behavior

The stage fills the available inline size; inline, its height is `--aui-image-viewer-height` (default `24rem`), and the lightbox fills the viewport. The toolbar and crop bar wrap, the thumbnail strip scrolls horizontally, and fit is recomputed when the stage resizes.

## 17. RTL behavior

The header, toolbar, crop bar, and thumbnails follow the writing direction; the previous and next chevrons are mirrored, and ArrowLeft shows the next image in RTL when the image is not zoomed. Image transforms (pan, rotation) are physical.

## 18. Theme behavior

The counter, caption, status text, crop outline, current thumbnail ring, and focus indicator are in the contrast gate in every theme. Forced colors draw the crop area and the current thumbnail in `Highlight`. Under reduced motion (or `animation: 'none'`), zoom and pan apply without transition.

## 19. Global configuration support

```ts
configureAbsoluteUI({ components: { imageViewer: { zoomStep: 1.5, maxZoom: 4, showThumbnails: false } } });
```

## 20. Component configuration support

Instance `zoomStep`, `minZoom`, `maxZoom`, and `showThumbnails` override configuration; `locale` falls back to the common configuration.

## 21. Timezone behavior

Not applicable.

## 22. Icon customization points

`icons`: `previous` (`chevron-left`), `next` (`chevron-right`), `zoomIn` (`zoom-in`), `zoomOut` (`zoom-out`), `fit` (`minimize`), `actualSize` (`maximize`), `rotate` (`rotate`, mirrored for rotate left), `crop` (`crop`), `download` (`download`), `close` (`close`), and `error` (`image-off`). Any registered `IconRef` works.

## 23. Security behavior

Image and thumbnail URLs are limited to `https:`, `blob:`, raster `data:image` URLs (png, jpeg, gif, webp, avif, bmp), and URLs on the document's own origin (relative URLs, or `http:` on a local development origin). `javascript:`, `file:`, cross-origin `http:`, and `data:image/svg+xml` URLs throw `IMAGE_VIEWER_OPTIONS`. Alt text and captions are set as text. Transforms are custom properties set through the CSSOM (`style.setProperty`), never style attributes, so the component runs under a strict CSP. A cross-origin image can only be cropped when it is served with CORS headers and `crossOrigin` is set; otherwise the canvas is tainted, `crop()` rejects, and `aui-error` reports `reason: 'crop'`.

## 24. Data handling behavior

No persistence, telemetry, or network access beyond loading the given images. The crop output (canvas and Blob) stays in memory for the application.

## 25. Performance characteristics

Zoom, pan, and rotation update five custom properties on one wrapper (a compositor transform); the image is never re-laid out. Thumbnails load lazily. The crop draws once into a canvas sized to the crop rectangle.

## 26. Supported data scale

500 images per viewer; images up to 8,000 by 8,000 pixels (crop canvases are limited by the browser's maximum canvas size).

## 27. Usage examples

```ts
import { ImageViewer } from '@absoluteui/components/image-viewer';

const host = document.querySelector<HTMLElement>('#scan');
if (host) {
  const viewer = ImageViewer.create(host, {
    label: 'Passport scan',
    croppable: true,
    aspectRatios: [{ label: 'Photo page', value: 125 / 88 }, { label: 'Free', value: null }],
    images: [{ src: '/files/passport.jpg', alt: 'Passport photo page of Ada Lovelace' }],
  });
  host.addEventListener('aui-crop', () => {
    viewer.fit();
  });
}
```

More examples, type-checked in CI: `metadata/image-viewer/examples.json`.

## 28. Edge cases

- With one image, the counter, previous, next, and thumbnails are hidden.
- An image smaller than the stage is fitted at 100% (fit never upscales).
- `width` and `height` reserve the image size before it loads; without them the stage shows "Loading image".
- A failed image shows the error state with its alt text; zoom, rotation, and crop are unavailable for it.
- Rotating keeps fit when the image was fitted; crop rectangles are in pixels of the rotated image.
- While cropping, zoom, pan, rotation, and navigation are paused.

## 29. Error behavior

| Code | Category | Cause |
|---|---|---|
| `IMAGE_VIEWER_OPTIONS` | configuration | Blank label, no images, an unsafe or missing `src` or `thumbnail`, missing alt text on a non-decorative image, an invalid index, aspect ratio, crop type or quality, cross-origin mode, wheel mode, `minZoom` above `maxZoom`, changing `mode` after creation, or an invalid `setZoom`, `rotate`, or `startCrop` argument. |
| `IMAGE_VIEWER_NOT_CROPPING` | runtime | `crop()` outside crop mode. |
| `IMAGE_VIEWER_CROP` | runtime | The canvas could not produce a Blob (a cross-origin image without CORS). |
| `CFG_INVALID_VALUE` / `CFG_UNKNOWN_OPTION` | configuration | Invalid or unknown configuration. |
| `ICON_UNKNOWN` | configuration | An icon names an icon that is not registered. |

Invalid options throw before the host is modified; an invalid `update()` leaves the previous state intact.

## 30. Known limitations

- Rotation is in steps of 90 degrees.
- Crop rectangles are axis aligned.
- The download link uses the `download` attribute, which browsers ignore for cross-origin URLs.
- Manual screen-reader verification is pending.

## 31. Unsupported scenarios

- SVG images and other script-capable formats.
- Image editing beyond crop and rotation (filters, drawing, perspective correction).

## 32. TypeScript definitions

```ts
interface ImageViewerConfig { zoomStep: number; minZoom: number; maxZoom: number; showThumbnails: boolean }
interface ImageViewerImage {
  src: string;
  alt: string;
  decorative?: boolean;
  caption?: string;
  thumbnail?: string;
  width?: number;
  height?: number;
  downloadName?: string;
}
interface ImageViewerAspectRatio { label: string; value: number | null }
type ImageViewerMode = 'inline' | 'lightbox';
type ImageViewerCropType = 'image/png' | 'image/jpeg' | 'image/webp';
interface ImageViewerOptions extends Partial<ImageViewerConfig> {
  label: string;
  images: readonly ImageViewerImage[];
  mode?: ImageViewerMode;
  index?: number;
  loop?: boolean;
  croppable?: boolean;
  aspectRatios?: readonly ImageViewerAspectRatio[];
  cropType?: ImageViewerCropType;
  cropQuality?: number;
  crossOrigin?: 'anonymous' | 'use-credentials' | null;
  wheelZoom?: 'auto' | 'ctrl' | 'always';
  locale?: string;
  icons?: Partial<ImageViewerIcons>;
}
interface ImageViewerChangeDetail { index: number; image: ImageViewerImage }
interface ImageViewerZoomDetail { zoom: number; fit: boolean }
interface ImageViewerRotateDetail { rotation: number; index: number }
interface ImageViewerCropRect { x: number; y: number; width: number; height: number }
interface ImageViewerCropDetail { blob: Blob; canvas: HTMLCanvasElement; rect: ImageViewerCropRect; rotation: number; index: number; image: ImageViewerImage }
interface ImageViewerErrorDetail { index: number; image: ImageViewerImage; reason: 'load' | 'crop'; message: string }
interface ImageViewerOpenDetail { index: number }
function isSafeImageUrl(src: string, doc: Document): boolean;
```

## 33. Vanilla JS example

```ts
import { ImageViewer } from '@absoluteui/components/image-viewer';
import '@absoluteui/components/button/style.css';
import '@absoluteui/components/image-viewer/style.css';

const host = document.querySelector<HTMLElement>('#gallery');
const open = document.querySelector<HTMLButtonElement>('#open-gallery');
if (host && open) {
  const viewer = ImageViewer.create(host, {
    label: 'Office photos',
    mode: 'lightbox',
    images: [
      { src: '/images/office-lobby.png', alt: 'Lobby with reception desk', caption: 'Lobby' },
      { src: '/images/office-kitchen.png', alt: 'Shared kitchen with long table', caption: 'Kitchen' },
    ],
  });
  open.addEventListener('click', () => {
    viewer.open(0);
  });
}
```

## 34. Angular example

```ts
import { Component } from '@angular/core';
import type { ImageViewerCropDetail, ImageViewerImage } from '@absoluteui/components/image-viewer';
import { AuiImageViewer } from '@absoluteui/angular/image-viewer';

@Component({
  selector: 'app-photo-crop',
  imports: [AuiImageViewer],
  template: `<aui-image-viewer label="Profile photo" [images]="images" [croppable]="true" (cropped)="onCrop($event)"></aui-image-viewer>`,
})
export class PhotoCropComponent {
  readonly images: ImageViewerImage[] = [{ src: '/images/people-ada.png', alt: 'Ada Lovelace smiling' }];
  size = '';
  onCrop(detail: ImageViewerCropDetail): void {
    this.size = `${String(detail.rect.width)} x ${String(detail.rect.height)}`;
  }
}
```

## 35. React example

Not available: AbsoluteUI has no published React adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 36. Vue example

Not available: AbsoluteUI has no published Vue adapter. Use the vanilla API (section 33) or the Web Component-style usage (section 37).

## 37. Web Component-style usage example

Not supported. Components are controller classes that render light DOM (SPEC section 4.4); custom-element wrappers are not shipped.
