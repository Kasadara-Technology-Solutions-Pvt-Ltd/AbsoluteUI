/**
 * Shared export helpers (chart-export, org-chart-export): rasterize standalone SVG
 * markup to PNG through a blob: URL, and save a Blob through a temporary object URL
 * and an `<a download>` click. Nothing is uploaded or stored (SPEC section 14.1).
 */
import { runtimeError } from '@absoluteui/core';

export interface ExportErrorContext {
  /** Component name in error details, for example `chartExport`. */
  readonly component: string;
  /** Error code prefix, for example `CHART_EXPORT`. */
  readonly code: string;
  /** What is being rasterized, for messages ("chart"). */
  readonly subject: string;
}

/** Rasterize SVG markup to a PNG Blob at `scale` device pixels per CSS px (needs `img-src blob:` under a CSP). */
export async function svgToPng(markup: string, doc: Document, scale: number, ctx: ExportErrorContext): Promise<Blob> {
  const view = doc.defaultView ?? window;
  const url = view.URL.createObjectURL(new Blob([markup], { type: 'image/svg+xml' }));
  try {
    const image = new view.Image();
    image.src = url;
    await image.decode();
    const canvas = doc.createElement('canvas');
    canvas.width = Math.ceil(image.naturalWidth * scale);
    canvas.height = Math.ceil(image.naturalHeight * scale);
    const context = canvas.getContext('2d');
    if (!context) throw runtimeError(`${ctx.code}_UNAVAILABLE`, 'Canvas 2D is not available.', { component: ctx.component });
    context.scale(scale, scale);
    context.drawImage(image, 0, 0);
    return await new Promise<Blob>((resolve, reject) => {
      canvas.toBlob((blob) => {
        if (blob) resolve(blob);
        else reject(runtimeError(`${ctx.code}_FAILED`, `The ${ctx.subject} could not be rasterized.`, { component: ctx.component }));
      }, 'image/png');
    });
  } finally {
    view.URL.revokeObjectURL(url);
  }
}

/** Save a Blob as `fileName` (the caller validates the name). */
export function saveBlob(blob: Blob, fileName: string, doc: Document): void {
  const view = doc.defaultView ?? window;
  const url = view.URL.createObjectURL(blob);
  const link = doc.createElement('a');
  link.href = url;
  link.download = fileName;
  link.hidden = true;
  doc.body.append(link);
  try {
    link.click();
  } finally {
    link.remove();
    // Some browsers read the URL after the click task; revoke it shortly after.
    view.setTimeout(() => {
      view.URL.revokeObjectURL(url);
    }, 1000);
  }
}
