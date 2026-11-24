/** Image dimensions, resizing and compression on (Offscreen)Canvas. */
import { HelperError, ValidationError } from '@absoluteui/helpers/error';

export interface ImageDimensions {
  readonly width: number;
  readonly height: number;
}

interface Decoded extends ImageDimensions {
  readonly source: CanvasImageSource;
  close(): void;
}

const decodeError = (cause?: unknown): ValidationError => new ValidationError('SVC_FILE_IMAGE_DECODE', 'The image could not be read.', cause === undefined ? {} : { cause });

async function decodeWithElement(blob: Blob): Promise<Decoded> {
  if (typeof document === 'undefined' || typeof URL.createObjectURL !== 'function') throw new HelperError('SVC_FILE_IMAGE_UNSUPPORTED', 'Image decoding is not available here.', { kind: 'unsupported' });
  const url = URL.createObjectURL(blob);
  const img = new Image();
  img.decoding = 'async';
  img.src = url;
  try {
    await img.decode();
  } catch (e) {
    URL.revokeObjectURL(url);
    throw decodeError(e);
  }
  // Keep the URL alive until the element is no longer needed (drawImage).
  return { source: img, width: img.naturalWidth, height: img.naturalHeight, close: () => { URL.revokeObjectURL(url); } };
}

/** Decodes with EXIF orientation applied (`imageOrientation: 'from-image'`). SVG falls back to `<img>`. */
async function decode(blob: Blob): Promise<Decoded> {
  if (typeof createImageBitmap === 'function') {
    try {
      const bitmap = await createImageBitmap(blob, { imageOrientation: 'from-image' });
      return { source: bitmap, width: bitmap.width, height: bitmap.height, close: () => { bitmap.close(); } };
    } catch (e) {
      if (typeof document === 'undefined') throw decodeError(e);
    }
  }
  return decodeWithElement(blob);
}

/**
 * Width and height in pixels after EXIF orientation. Throws `SVC_FILE_IMAGE_DECODE` for non-images.
 * @example
 * declare const file: File; // an image chosen by the user
 * const { width, height } = await getImageDimensions(file);
 */
export async function getImageDimensions(blob: Blob): Promise<ImageDimensions> {
  const d = await decode(blob);
  d.close();
  return { width: d.width, height: d.height };
}

export type ImageOutputType = 'image/webp' | 'image/jpeg' | 'image/png';

interface Surface {
  readonly ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;
  encode(type: ImageOutputType, quality: number | undefined): Promise<Blob>;
}

const MAX_SIDE = 16_384;

function surface(width: number, height: number): Surface {
  if (typeof OffscreenCanvas === 'function') {
    const canvas = new OffscreenCanvas(width, height);
    const ctx = canvas.getContext('2d');
    if (ctx) return { ctx, encode: (type, quality) => canvas.convertToBlob(quality === undefined ? { type } : { type, quality }) };
  }
  if (typeof document === 'undefined') throw new HelperError('SVC_FILE_IMAGE_UNSUPPORTED', 'Canvas is not available here.', { kind: 'unsupported' });
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new HelperError('SVC_FILE_IMAGE_UNSUPPORTED', 'Canvas is not available here.', { kind: 'unsupported' });
  return {
    ctx,
    encode: (type, quality) =>
      new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((b) => { if (b) resolve(b); else reject(new ValidationError('SVC_FILE_IMAGE_ENCODE', 'The image could not be encoded.')); }, type, quality);
      }),
  };
}

export interface ResizeImageOptions {
  readonly maxWidth?: number;
  readonly maxHeight?: number;
  /** `contain` (default) fits inside the box; `cover` fills the box exactly and center-crops. */
  readonly fit?: 'contain' | 'cover';
  /** Default: the input type when it is PNG, JPEG or WebP, else PNG. */
  readonly type?: ImageOutputType;
  /** 0-1 for JPEG and WebP. Default 0.85. */
  readonly quality?: number;
  /** Allow upscaling smaller images. Default false. */
  readonly enlarge?: boolean;
  /** Fill for transparent pixels when encoding JPEG. Default `#fff`. */
  readonly background?: string;
}

/** A re-encoded image. */
export interface ProcessedImage extends ImageDimensions {
  readonly blob: Blob;
}

interface Plan {
  readonly width: number;
  readonly height: number;
  readonly sx: number;
  readonly sy: number;
  readonly sw: number;
  readonly sh: number;
}

function plan(src: ImageDimensions, o: ResizeImageOptions, scale = 1): Plan {
  const maxW = Math.min(o.maxWidth ?? src.width, MAX_SIDE);
  const maxH = Math.min(o.maxHeight ?? src.height, MAX_SIDE);
  if (!(maxW > 0) || !(maxH > 0)) throw new ValidationError('SVC_FILE_OPTION', 'maxWidth and maxHeight must be positive.');
  const fullRegion = { sx: 0, sy: 0, sw: src.width, sh: src.height };
  if (o.fit === 'cover' && o.maxWidth !== undefined && o.maxHeight !== undefined) {
    const s = Math.max(maxW / src.width, maxH / src.height);
    const k = o.enlarge === true ? s : Math.min(1, s);
    const width = Math.max(1, Math.round(Math.min(maxW, src.width * k) * scale));
    const height = Math.max(1, Math.round(Math.min(maxH, src.height * k) * scale));
    const sw = Math.min(src.width, (width / scale) / k);
    const sh = Math.min(src.height, (height / scale) / k);
    return { width, height, sx: (src.width - sw) / 2, sy: (src.height - sh) / 2, sw, sh };
  }
  const s = Math.min(maxW / src.width, maxH / src.height);
  const k = (o.enlarge === true ? s : Math.min(1, s)) * scale;
  return { width: Math.max(1, Math.round(src.width * k)), height: Math.max(1, Math.round(src.height * k)), ...fullRegion };
}

function outputType(blob: Blob, type: ImageOutputType | undefined): ImageOutputType {
  if (type) return type;
  return blob.type === 'image/jpeg' || blob.type === 'image/webp' ? blob.type : 'image/png';
}

function draw(d: Decoded, p: Plan, type: ImageOutputType, background: string): Surface {
  const s = surface(p.width, p.height);
  s.ctx.imageSmoothingEnabled = true;
  s.ctx.imageSmoothingQuality = 'high';
  if (type === 'image/jpeg') {
    s.ctx.fillStyle = background;
    s.ctx.fillRect(0, 0, p.width, p.height);
  }
  s.ctx.drawImage(d.source, p.sx, p.sy, p.sw, p.sh, 0, 0, p.width, p.height);
  return s;
}

/**
 * Resizes and re-encodes an image with EXIF orientation applied. Re-encoding strips metadata,
 * which removes EXIF GPS location (a privacy benefit for uploads).
 * @example
 * declare const photo: File;
 * const { blob } = await resizeImage(photo, { maxWidth: 1600, maxHeight: 1600, type: 'image/webp', quality: 0.8 });
 */
export async function resizeImage(blob: Blob, options: ResizeImageOptions = {}): Promise<ProcessedImage> {
  const d = await decode(blob);
  try {
    const p = plan(d, options);
    const type = outputType(blob, options.type);
    const out = await draw(d, p, type, options.background ?? '#fff').encode(type, type === 'image/png' ? undefined : (options.quality ?? 0.85));
    return { blob: out, width: p.width, height: p.height };
  } finally {
    d.close();
  }
}

export interface CompressImageOptions extends Omit<ResizeImageOptions, 'quality'> {
  /** Target maximum size in bytes. */
  readonly maxBytes: number;
  /** Lowest quality tried before downscaling. Default 0.4. */
  readonly minQuality?: number;
  /** Highest quality tried. Default 0.92. */
  readonly maxQuality?: number;
  /** Encode attempts per scale (binary search). Default 6. */
  readonly maxIterations?: number;
  /** Downscale steps (x0.75 area-based) when minimum quality is still too large. Default 3. */
  readonly maxScaleSteps?: number;
  /** Re-encode even when the input already fits (to strip metadata). Default false. */
  readonly force?: boolean;
}

/** Result of `compressImage`; `withinLimit` is false when the target could not be reached. */
export interface CompressedImage extends ProcessedImage {
  readonly quality: number | undefined;
  readonly withinLimit: boolean;
}

/**
 * Re-encodes an image to fit `maxBytes`: binary search over quality, then bounded downscaling.
 * Default type is JPEG (every browser encodes it; unsupported types silently become PNG).
 * Returns the input unchanged when it already fits and `force` is false.
 * @example
 * declare const photo: File;
 * const { blob, withinLimit } = await compressImage(photo, { maxBytes: 500_000, maxWidth: 2000, maxHeight: 2000 });
 */
export async function compressImage(blob: Blob, options: CompressImageOptions): Promise<CompressedImage> {
  const { maxBytes, minQuality = 0.4, maxQuality = 0.92, maxIterations = 6, maxScaleSteps = 3, force = false } = options;
  if (!(maxBytes > 0)) throw new ValidationError('SVC_FILE_OPTION', 'maxBytes must be positive.');
  const noResize = options.maxWidth === undefined && options.maxHeight === undefined;
  if (!force && noResize && blob.size <= maxBytes) {
    const dims = await getImageDimensions(blob);
    return { blob, ...dims, quality: undefined, withinLimit: true };
  }
  const type = options.type ?? 'image/jpeg';
  const d = await decode(blob);
  try {
    let best: CompressedImage | undefined;
    let scale = 1;
    for (let step = 0; step <= maxScaleSteps; step++) {
      const p = plan(d, options, scale);
      const s = draw(d, p, type, options.background ?? '#fff');
      if (type === 'image/png') {
        const out = await s.encode(type, undefined);
        best = { blob: out, width: p.width, height: p.height, quality: undefined, withinLimit: out.size <= maxBytes };
        if (best.withinLimit) return best;
      } else {
        let lo = minQuality;
        let hi = maxQuality;
        let fit: CompressedImage | undefined;
        for (let i = 0; i < maxIterations; i++) {
          const q = i === 0 ? hi : (lo + hi) / 2;
          const out = await s.encode(type, q);
          const candidate = { blob: out, width: p.width, height: p.height, quality: q, withinLimit: out.size <= maxBytes };
          if (candidate.withinLimit) {
            fit = candidate;
            if (i === 0) break;
            lo = q;
          } else {
            hi = q;
            if (best === undefined || out.size < best.blob.size) best = candidate;
          }
        }
        if (!fit && hi > minQuality) {
          const out = await s.encode(type, minQuality);
          const candidate = { blob: out, width: p.width, height: p.height, quality: minQuality, withinLimit: out.size <= maxBytes };
          if (candidate.withinLimit) fit = candidate;
          else if (best === undefined || out.size < best.blob.size) best = candidate;
        }
        if (fit) return fit;
      }
      // Area scales roughly with bytes; shrink toward the target with a margin.
      const ratio = best ? maxBytes / best.blob.size : 0.5;
      scale *= Math.min(0.75, Math.max(0.25, Math.sqrt(ratio) * 0.9));
    }
    if (!best) throw new ValidationError('SVC_FILE_IMAGE_ENCODE', 'The image could not be encoded.');
    return best;
  } finally {
    d.close();
  }
}
