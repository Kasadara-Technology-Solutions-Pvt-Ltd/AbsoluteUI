import { ImageViewer, type ImageViewerImage, type ImageViewerOptions } from '@absoluteui/components/image-viewer';
import { host, seed } from '../seed.js';

/** A picture-like PNG drawn on a canvas (the docs frame allows data: images). */
function picture(width: number, height: number, color: string): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (ctx) {
    ctx.fillStyle = color;
    ctx.fillRect(0, 0, width, height);
    ctx.fillStyle = '#ffffff';
    ctx.beginPath();
    ctx.arc(width * 0.3, height * 0.35, Math.min(width, height) * 0.12, 0, Math.PI * 2);
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0, height);
    ctx.lineTo(width * 0.45, height * 0.45);
    ctx.lineTo(width * 0.7, height * 0.75);
    ctx.lineTo(width, height * 0.5);
    ctx.lineTo(width, height);
    ctx.closePath();
    ctx.fill();
  }
  return canvas.toDataURL('image/png');
}

const images: ImageViewerImage[] = [
  { src: picture(960, 640, '#1d4ed8'), alt: 'Office lobby with a reception desk', caption: 'Lobby', downloadName: 'lobby.png' },
  { src: picture(600, 800, '#15803d'), alt: 'Signed employment contract, page one', caption: 'Contract scan' },
  { src: picture(720, 720, '#b45309'), alt: 'Employee badge photo', caption: 'Badge photo' },
];

export default seed<ImageViewerOptions>({
  options: { label: 'Employee documents', images, croppable: true },
  call: 'ImageViewer.create(host, $)',
  codeValues: {
    images: "[\n  { src: '/files/lobby.jpg', alt: 'Office lobby with a reception desk', caption: 'Lobby', downloadName: 'lobby.jpg' },\n  { src: '/files/contract.png', alt: 'Signed employment contract, page one', caption: 'Contract scan' },\n  { src: '/files/badge.jpg', alt: 'Employee badge photo', caption: 'Badge photo' },\n]",
  },
  hide: ['images'],
  mount(stage, options) {
    const h = host(stage);
    const c = ImageViewer.create(h, options);
    return { events: h, update: (p) => { c.update(p); }, destroy: () => { c.destroy(); } };
  },
});
