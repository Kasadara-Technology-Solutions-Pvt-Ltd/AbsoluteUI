// R20 P10 page: Image Viewer (docs/PLAN-R20.md), bundled against the built packages.
// Images are drawn on canvases at runtime and shown through blob: URLs, so no files are needed.
import { configureAbsoluteUI } from '@absoluteui/core';
import { startThemeRuntime } from '@absoluteui/theme';
import { Button } from '@absoluteui/components/button';
import { ImageViewer, type ImageViewerChangeDetail, type ImageViewerCropDetail, type ImageViewerImage, type ImageViewerZoomDetail } from '@absoluteui/components/image-viewer';
import { Stack } from '@absoluteui/components/layout';

const params = new URLSearchParams(location.search);
configureAbsoluteUI({ theme: params.get('theme') ?? 'absolute-default' });
if (params.get('dir') === 'rtl') document.documentElement.dir = 'rtl';
startThemeRuntime();

function byId(id: string): HTMLElement {
  const el = document.getElementById(id);
  if (!el) throw new Error(`missing #${id}`);
  return el;
}

Stack.apply(byId('main'), { gap: 6 });

/** A picture-like image: a colored background with a diagonal band, as a blob: URL. */
async function picture(width: number, height: number, color: string): Promise<string> {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('no 2d context');
  ctx.fillStyle = color;
  ctx.fillRect(0, 0, width, height);
  ctx.fillStyle = '#ffffff';
  ctx.beginPath();
  ctx.moveTo(0, height * 0.7);
  ctx.lineTo(width * 0.3, height);
  ctx.lineTo(width, height * 0.3);
  ctx.lineTo(width * 0.7, 0);
  ctx.closePath();
  ctx.fill();
  const blob = await new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((b) => {
      if (b) resolve(b);
      else reject(new Error('toBlob failed'));
    }, 'image/png');
  });
  return URL.createObjectURL(blob);
}

async function main(): Promise<void> {
  const images: ImageViewerImage[] = [
    { src: await picture(1200, 800, '#1d4ed8'), alt: 'Office lobby with a reception desk', caption: 'Lobby', width: 1200, height: 800, downloadName: 'lobby.png' },
    { src: await picture(600, 900, '#15803d'), alt: 'Signed contract, page one', caption: 'Contract scan', width: 600, height: 900 },
    { src: await picture(800, 800, '#b45309'), alt: 'Employee badge photo', caption: 'Badge photo', width: 800, height: 800 },
  ];

  const inlineHost = byId('viewer-inline');
  const inline = ImageViewer.create(inlineHost, { label: 'Office photos', images });
  const inlineLog = byId('inline-log');
  inlineHost.addEventListener('aui-change', (e) => {
    inlineLog.textContent = `Shown: ${String((e as CustomEvent<ImageViewerChangeDetail>).detail.index + 1)}`;
  });
  inlineHost.addEventListener('aui-zoom', (e) => {
    const d = (e as CustomEvent<ImageViewerZoomDetail>).detail;
    inlineLog.textContent = `Zoom: ${String(Math.round(d.zoom * 100))}%${d.fit ? ' (fit)' : ''}`;
  });
  inlineHost.addEventListener('aui-rotate', (e) => {
    inlineLog.textContent = `Rotation: ${String((e as CustomEvent<{ rotation: number }>).detail.rotation)}`;
  });

  const lightboxHost = byId('viewer-lightbox');
  const lightbox = ImageViewer.create(lightboxHost, { label: 'Badge photo editor', mode: 'lightbox', images, index: 2, croppable: true });
  const lightboxLog = byId('lightbox-log');
  lightboxHost.addEventListener('aui-crop', (e) => {
    const d = (e as CustomEvent<ImageViewerCropDetail>).detail;
    lightboxLog.textContent = `Cropped: ${String(d.rect.width)}x${String(d.rect.height)} ${d.blob.type}`;
  });
  lightboxHost.addEventListener('aui-close', () => {
    lightboxLog.textContent = `${lightboxLog.textContent} (closed)`.trim();
  });
  const trigger = Button.create({ text: 'Edit badge photo', variant: 'secondary' });
  trigger.element.addEventListener('click', () => {
    lightbox.open(2);
  });
  byId('lightbox-trigger').append(trigger.element);

  Object.assign(window, { __auiReady: true, __inline: inline, __lightbox: lightbox });
}

void main();
