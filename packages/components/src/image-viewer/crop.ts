/**
 * Crop rectangle math of the Image Viewer (R20 P10), in natural pixels of the rotated image.
 * Pure functions, so the pointer and keyboard paths share one set of rules.
 */

export interface CropRect {
  x: number;
  y: number;
  width: number;
  height: number;
}

/** Which corner a resize drags. The opposite corner stays put. */
export type CropCorner = 'nw' | 'ne' | 'sw' | 'se';

/** Smallest crop side in natural pixels. */
export const MIN_CROP = 8;

/** The largest rectangle of `aspect` (width / height; null = free) centered in the image, inset by 10%. */
export function initialCrop(width: number, height: number, aspect: number | null): CropRect {
  let w = width * 0.8;
  let h = height * 0.8;
  if (aspect !== null) {
    if (w / h > aspect) w = h * aspect;
    else h = w / aspect;
  }
  return round({ x: (width - w) / 2, y: (height - h) / 2, width: w, height: h });
}

function round(r: CropRect): CropRect {
  return { x: Math.round(r.x), y: Math.round(r.y), width: Math.round(r.width), height: Math.round(r.height) };
}

/** Move the rectangle by (dx, dy), kept inside the image. */
export function moveCrop(r: CropRect, dx: number, dy: number, width: number, height: number): CropRect {
  return round({
    x: Math.min(Math.max(0, r.x + dx), width - r.width),
    y: Math.min(Math.max(0, r.y + dy), height - r.height),
    width: r.width,
    height: r.height,
  });
}

/**
 * Resize by dragging `corner` by (dx, dy). With an aspect ratio, the height follows the width.
 * The result stays inside the image and at least MIN_CROP on each side.
 */
export function resizeCrop(r: CropRect, corner: CropCorner, dx: number, dy: number, width: number, height: number, aspect: number | null): CropRect {
  const west = corner === 'nw' || corner === 'sw';
  const north = corner === 'nw' || corner === 'ne';
  // The fixed (anchor) corner and the room available from it.
  const ax = west ? r.x + r.width : r.x;
  const ay = north ? r.y + r.height : r.y;
  const roomX = west ? ax : width - ax;
  const roomY = north ? ay : height - ay;
  let w = Math.min(roomX, Math.max(MIN_CROP, r.width + (west ? -dx : dx)));
  let h = Math.min(roomY, Math.max(MIN_CROP, r.height + (north ? -dy : dy)));
  if (aspect !== null) {
    // Follow the larger relative change, then fit the room.
    if (Math.abs(dx) / Math.max(1, r.width) >= Math.abs(dy) / Math.max(1, r.height)) h = w / aspect;
    else w = h * aspect;
    if (w > roomX) {
      w = roomX;
      h = w / aspect;
    }
    if (h > roomY) {
      h = roomY;
      w = h * aspect;
    }
  }
  return round({ x: west ? ax - w : ax, y: north ? ay - h : ay, width: w, height: h });
}

/** Apply a new aspect ratio around the current center, kept inside the image. */
export function reshapeCrop(r: CropRect, aspect: number | null, width: number, height: number): CropRect {
  if (aspect === null) return r;
  const cx = r.x + r.width / 2;
  const cy = r.y + r.height / 2;
  let w = r.width;
  let h = w / aspect;
  if (h > height) {
    h = height;
    w = h * aspect;
  }
  if (w > width) {
    w = width;
    h = w / aspect;
  }
  return round({ x: Math.min(Math.max(0, cx - w / 2), width - w), y: Math.min(Math.max(0, cy - h / 2), height - h), width: w, height: h });
}
