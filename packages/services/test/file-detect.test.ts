import { describe, expect, it } from 'vitest';
import { compressImage, detectFileType, detectFileTypeFromBytes, getImageDimensions, resizeImage, validateFiles } from '@absoluteui/services/file';
import { zipFiles } from '@absoluteui/services/zip';

const enc = new TextEncoder();
const a = (s: string): number[] => Array.from(s, (c) => c.charCodeAt(0));
const bytes = (...parts: (number[] | string)[]): Uint8Array<ArrayBuffer> => Uint8Array.from(parts.flatMap((p) => (typeof p === 'string' ? a(p) : p)));
const pad = (b: Uint8Array, n = 64): Uint8Array<ArrayBuffer> => {
  const out = new Uint8Array(Math.max(n, b.length));
  out.set(b);
  return out;
};
const ftyp = (major: string, ...compat: string[]): Uint8Array<ArrayBuffer> => {
  const size = 16 + compat.length * 4;
  return pad(bytes([0, 0, 0, size], 'ftyp', major, [0, 0, 0, 0], ...compat));
};
const tar = (): Uint8Array<ArrayBuffer> => {
  const b = new Uint8Array(512);
  b.set(a('file.txt'));
  b.set(a('ustar'), 257);
  return b;
};
const pe = (dll: boolean): Uint8Array<ArrayBuffer> => {
  const b = new Uint8Array(256);
  b.set(a('MZ'));
  b[0x3c] = 0x80;
  b.set(a('PE\0\0'), 0x80);
  if (dll) b[0x80 + 23] = 0x20; // characteristics high byte: IMAGE_FILE_DLL (0x2000)
  return b;
};

async function pngBlob(width: number, height: number, type = 'image/png'): Promise<Blob> {
  const canvas = new OffscreenCanvas(width, height);
  const ctx = canvas.getContext('2d')!;
  const grad = ctx.createLinearGradient(0, 0, width, height);
  grad.addColorStop(0, '#f00');
  grad.addColorStop(1, '#00f');
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, width, height);
  // Noise so JPEG sizes depend on quality.
  for (let i = 0; i < 400; i++) {
    ctx.fillStyle = `hsl(${(i * 37) % 360} 80% 50%)`;
    ctx.fillRect((i * 53) % width, (i * 97) % height, 3, 3);
  }
  return canvas.convertToBlob({ type });
}

describe('detectFileType', () => {
  const cases: [string, Uint8Array<ArrayBuffer>, string, string, boolean?][] = [
    ['png', bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 'image/png', 'png'],
    ['jpeg', bytes([0xff, 0xd8, 0xff, 0xe0]), 'image/jpeg', 'jpg'],
    ['gif', bytes('GIF89a'), 'image/gif', 'gif'],
    ['webp', bytes('RIFF', [0, 0, 0, 0], 'WEBPVP8 '), 'image/webp', 'webp'],
    ['wav', bytes('RIFF', [0, 0, 0, 0], 'WAVEfmt '), 'audio/wav', 'wav'],
    ['avif', ftyp('avif', 'mif1', 'miaf'), 'image/avif', 'avif'],
    ['avis', ftyp('avis'), 'image/avif', 'avif'],
    ['avif via mif1', ftyp('mif1', 'avif'), 'image/avif', 'avif'],
    ['heic', ftyp('heic', 'mif1'), 'image/heic', 'heic'],
    ['heif', ftyp('mif1'), 'image/heif', 'heif'],
    ['mp4', ftyp('isom', 'iso2', 'mp41'), 'video/mp4', 'mp4'],
    ['mov', ftyp('qt  '), 'video/quicktime', 'mov'],
    ['m4a', ftyp('M4A '), 'audio/mp4', 'm4a'],
    ['bmp', pad(bytes('BM', [0x46, 0, 0, 0, 0, 0, 0, 0, 0x36, 0, 0, 0])), 'image/bmp', 'bmp'],
    ['ico', pad(bytes([0, 0, 1, 0, 1, 0])), 'image/x-icon', 'ico'],
    ['tiff LE', bytes('II*\0'), 'image/tiff', 'tif'],
    ['tiff BE', bytes('MM\0*'), 'image/tiff', 'tif'],
    ['pdf', bytes('%PDF-1.7\n'), 'application/pdf', 'pdf'],
    ['gzip', bytes([0x1f, 0x8b, 0x08, 0]), 'application/gzip', 'gz'],
    ['7z', bytes([0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c]), 'application/x-7z-compressed', '7z'],
    ['rar', bytes('Rar!', [0x1a, 0x07, 0x01, 0x00]), 'application/vnd.rar', 'rar'],
    ['tar', tar(), 'application/x-tar', 'tar'],
    ['mp3 ID3', bytes('ID3', [4, 0]), 'audio/mpeg', 'mp3'],
    ['mp3 frame', bytes([0xff, 0xfb, 0x90, 0x64]), 'audio/mpeg', 'mp3'],
    ['webm', pad(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x84], 'webm')), 'video/webm', 'webm'],
    ['mkv', pad(bytes([0x1a, 0x45, 0xdf, 0xa3, 0x9f, 0x42, 0x82, 0x88], 'matroska')), 'video/x-matroska', 'mkv'],
    ['ogg', bytes('OggS', [0, 2]), 'audio/ogg', 'ogg'],
    ['flac', bytes('fLaC'), 'audio/flac', 'flac'],
    ['woff', bytes('wOFF'), 'font/woff', 'woff'],
    ['woff2', bytes('wOF2'), 'font/woff2', 'woff2'],
    ['ttf', bytes([0, 1, 0, 0, 0, 0x10]), 'font/ttf', 'ttf'],
    ['otf', bytes('OTTO'), 'font/otf', 'otf'],
    ['exe', pe(false), 'application/vnd.microsoft.portable-executable', 'exe', true],
    ['dll', pe(true), 'application/vnd.microsoft.portable-executable', 'dll', true],
    ['elf', bytes([0x7f], 'ELF', [2, 1, 1]), 'application/x-elf', 'elf', true],
    ['wasm', bytes([0, 0x61, 0x73, 0x6d, 1, 0, 0, 0]), 'application/wasm', 'wasm', true],
    ['sqlite', bytes('SQLite format 3\0'), 'application/vnd.sqlite3', 'sqlite'],
    ['svg', enc.encode('<svg xmlns="http://www.w3.org/2000/svg"></svg>'), 'image/svg+xml', 'svg', true],
    ['svg with prolog', enc.encode('\uFEFF<?xml version="1.0"?>\n<!-- c -->\n<!DOCTYPE svg PUBLIC "-//W3C//DTD SVG 1.1//EN" "x">\n<SVG>'), 'image/svg+xml', 'svg', true],
    ['html', enc.encode('  <!DOCTYPE html><html>'), 'text/html', 'html', true],
    ['zip', bytes([0x50, 0x4b, 0x05, 0x06]), 'application/zip', 'zip'],
  ];
  for (const [label, input, mime, extension, active = false] of cases) {
    it(`detects ${label}`, () => {
      expect(detectFileTypeFromBytes(input)).toEqual({ mime, extension, confidence: 'high', active });
    });
  }

  it('classifies text heuristically with low confidence', () => {
    expect(detectFileTypeFromBytes(enc.encode('{"a": 1}'))).toMatchObject({ mime: 'application/json', confidence: 'low' });
    expect(detectFileTypeFromBytes(enc.encode('a,b,c\n1,2,3\n4,5,6\n'))).toMatchObject({ mime: 'text/csv', confidence: 'low' });
    expect(detectFileTypeFromBytes(enc.encode('<?xml version="1.0"?><root/>'))).toMatchObject({ mime: 'application/xml', confidence: 'low' });
    expect(detectFileTypeFromBytes(enc.encode('Just some prose.\nSecond line'))).toMatchObject({ mime: 'text/plain', confidence: 'low' });
    expect(detectFileTypeFromBytes(Uint8Array.of(0xff, 0xfe, 0x61, 0))).toMatchObject({ mime: 'text/plain' });
    expect(detectFileTypeFromBytes(Uint8Array.of(1, 2, 3, 0, 0xfe, 0x99))).toBeUndefined();
    expect(detectFileTypeFromBytes(new Uint8Array(0))).toBeUndefined();
  });

  it('recognizes Office Open XML inside ZIP', async () => {
    const docx = await zipFiles([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: '_rels/.rels', data: '<r/>' }, { name: 'word/document.xml', data: '<w/>' }], { compression: 'store' });
    expect(await detectFileType(docx)).toMatchObject({ extension: 'docx' });
    const xlsx = await zipFiles([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'xl/workbook.xml', data: '<x/>' }]);
    expect(await detectFileType(xlsx)).toMatchObject({ extension: 'xlsx' });
    const pptx = await zipFiles([{ name: '[Content_Types].xml', data: '<Types/>' }, { name: 'ppt/presentation.xml', data: '<p/>' }]);
    expect(await detectFileType(pptx)).toMatchObject({ extension: 'pptx' });
    const plain = await zipFiles([{ name: 'word/readme.txt', data: 'no content types' }]);
    expect(await detectFileType(plain)).toMatchObject({ extension: 'zip' });
    expect(await detectFileType(new Uint8Array((await plain.arrayBuffer()).slice(0)))).toMatchObject({ extension: 'zip' });
  });
});

describe('validateFiles', () => {
  const png = (name = 'photo.png', type = 'image/png'): File => new File([pad(bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]), 200)], name, { type });
  const pdf = (name = 'doc.pdf'): File => new File([bytes('%PDF-1.7\n')], name, { type: 'application/pdf' });
  const codes = (r: Awaited<ReturnType<typeof validateFiles>>): string[][] => r.rejected.map((x) => x.errors.map((e) => e.code));

  it('accepts files matching accept by declared and detected type', async () => {
    const r = await validateFiles([png(), pdf(), new File(['a,b\n1,2\n'], 'data.csv', { type: 'text/csv' })], { accept: 'image/*,.pdf,.csv' });
    expect(r.accepted).toHaveLength(3);
    expect(r.rejected).toEqual([]);
  });

  it('rejects disallowed types and content that does not match its name', async () => {
    const r = await validateFiles([pdf('doc.pdf'), new File([enc.encode('<svg></svg>')], 'evil.png', { type: 'image/png' }), new File([enc.encode('plain text')], 'fake.jpg', { type: 'image/jpeg' }), new File([pe(false)], 'setup.pdf', { type: 'application/pdf' })], { accept: 'image/*,.pdf' });
    expect(r.accepted.map((f) => f.name)).toEqual(['doc.pdf']);
    expect(codes(r)).toEqual([['SVC_FILE_TYPE_MISMATCH'], ['SVC_FILE_TYPE_MISMATCH'], ['SVC_FILE_TYPE_MISMATCH']]);
    const notAllowed = await validateFiles([new File(['x'], 'a.txt', { type: 'text/plain' })], { accept: 'image/*' });
    expect(notAllowed.rejected[0]!.errors[0]).toMatchObject({ code: 'SVC_FILE_TYPE_NOT_ALLOWED', message: 'This file type is not allowed. Allowed types: image/*.' });
  });

  it('tolerates raster mislabels and generic ZIP detection for Office containers', async () => {
    const r = await validateFiles([png('really-png.jpg', 'image/jpeg')], { accept: 'image/*' });
    expect(r.accepted).toHaveLength(1);
    const zip = await zipFiles([{ name: 'word/document.xml', data: '<w/>' }]);
    const docx = new File([zip], 'letter.docx', { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
    expect((await validateFiles([docx], { accept: '.docx' })).accepted).toHaveLength(1);
  });

  it('checks sizes with spoken units and never includes the file name', async () => {
    const big = new File([new Uint8Array(11_000_000)], 'secret-name.bin');
    const r = await validateFiles([big, new File([], 'empty.txt'), new File(['ab'], 'tiny.txt')], { maxFileSize: 10_000_000, minFileSize: 5 });
    expect(r.rejected.map((x) => x.errors.map((e) => e.message))).toEqual([['The file is larger than 10 megabytes.'], ['The file is empty.'], ['The file is smaller than 5 bytes.']]);
    expect(JSON.stringify(r.rejected.map((x) => x.errors))).not.toContain('secret-name');
    expect((await validateFiles([new File([], 'e.txt')], { allowEmpty: true })).accepted).toHaveLength(1);
  });

  it('limits count and total size in order', async () => {
    const f = (n: string): File => new File([new Uint8Array(400)], n);
    const r = await validateFiles([f('1'), f('2'), f('3'), f('4')], { maxFiles: 3, maxTotalSize: 1000 });
    expect(r.accepted.map((x) => x.name)).toEqual(['1', '2']);
    expect(codes(r)).toEqual([['SVC_FILE_TOTAL_TOO_LARGE'], ['SVC_FILE_TOTAL_TOO_LARGE']]);
    const counted = await validateFiles([f('1'), f('2'), f('3')], { maxFiles: 2 });
    expect(counted.rejected[0]!.errors[0]!.message).toBe('Too many files. Select up to 2 files.');
    expect((await validateFiles([f('1'), f('2')], { maxFiles: 1 })).rejected[0]!.errors[0]!.message).toBe('Too many files. Select 1 file.');
  });

  it('rejects active content by detection or declaration', async () => {
    const r = await validateFiles([new File([enc.encode('<svg onload="x()"/>')], 'logo.svg', { type: 'image/svg+xml' }), new File([enc.encode('<!doctype html><script>')], 'notes.txt'), new File([pe(false)], 'tool.bin'), new File(['echo'], 'run.bat'), png()], { rejectActiveContent: true });
    expect(r.accepted.map((f) => f.name)).toEqual(['photo.png']);
    expect(codes(r).every((c) => c.includes('SVC_FILE_ACTIVE_CONTENT'))).toBe(true);
  });

  it('checks image dimensions and uses a message catalog', async () => {
    const small = new File([await pngBlob(40, 30)], 'small.png', { type: 'image/png' });
    const ok = new File([await pngBlob(300, 200)], 'ok.png', { type: 'image/png' });
    const broken = png('broken.png');
    const r = await validateFiles([small, ok, broken], {
      imageDimensions: { minWidth: 100, minHeight: 100, maxWidth: 1000, maxHeight: 1000 },
      messages: (code, p) => (code === 'SVC_FILE_IMAGE_TOO_SMALL' ? `Mindestens ${p.minWidth} × ${p.minHeight} Pixel.` : undefined),
      locale: 'de',
    });
    expect(r.accepted.map((f) => f.name)).toEqual(['ok.png']);
    expect(r.rejected[0]!.errors[0]).toMatchObject({ code: 'SVC_FILE_IMAGE_TOO_SMALL', message: 'Mindestens 100 × 100 Pixel.', params: { width: 40, height: 30 } });
    expect(r.rejected[1]!.errors[0]).toMatchObject({ code: 'SVC_FILE_IMAGE_UNREADABLE', message: 'The image could not be read.' });
  });
});

describe('images', () => {
  it('reads dimensions of PNG and SVG, and rejects non-images', async () => {
    expect(await getImageDimensions(await pngBlob(64, 48))).toEqual({ width: 64, height: 48 });
    const svg = new Blob(['<svg xmlns="http://www.w3.org/2000/svg" width="20" height="10"></svg>'], { type: 'image/svg+xml' });
    expect(await getImageDimensions(svg)).toEqual({ width: 20, height: 10 });
    await expect(getImageDimensions(new Blob(['nope']))).rejects.toMatchObject({ code: 'SVC_FILE_IMAGE_DECODE' });
  });

  it('resizes with contain and cover', async () => {
    const src = await pngBlob(400, 200);
    const contain = await resizeImage(src, { maxWidth: 100, maxHeight: 100 });
    expect([contain.width, contain.height]).toEqual([100, 50]);
    expect(contain.blob.type).toBe('image/png');
    expect(await getImageDimensions(contain.blob)).toEqual({ width: 100, height: 50 });
    const cover = await resizeImage(src, { maxWidth: 100, maxHeight: 100, fit: 'cover', type: 'image/jpeg', quality: 0.8 });
    expect([cover.width, cover.height]).toEqual([100, 100]);
    expect(cover.blob.type).toBe('image/jpeg');
    const noUpscale = await resizeImage(src, { maxWidth: 1000, maxHeight: 1000 });
    expect([noUpscale.width, noUpscale.height]).toEqual([400, 200]);
    const upscale = await resizeImage(src, { maxWidth: 800, maxHeight: 800, enlarge: true, type: 'image/webp' });
    expect([upscale.width, upscale.height]).toEqual([800, 400]);
    expect(upscale.blob.type).toBe('image/webp');
    await expect(resizeImage(src, { maxWidth: 0 })).rejects.toMatchObject({ code: 'SVC_FILE_OPTION' });
  });

  it('compresses to a byte budget with bounded work', async () => {
    const src = await pngBlob(800, 600);
    const r = await compressImage(src, { maxBytes: 30_000 });
    expect(r.withinLimit).toBe(true);
    expect(r.blob.size).toBeLessThanOrEqual(30_000);
    expect(r.blob.type).toBe('image/jpeg');
    const tiny = await compressImage(src, { maxBytes: 600, maxScaleSteps: 1 });
    expect(tiny.blob.size).toBeGreaterThan(0);
    if (!tiny.withinLimit) expect(tiny.blob.size).toBeGreaterThan(600);
    const unchanged = await compressImage(src, { maxBytes: src.size + 1 });
    expect(unchanged.blob).toBe(src);
    expect(unchanged.quality).toBeUndefined();
    const forced = await compressImage(src, { maxBytes: src.size + 1, force: true, type: 'image/png' });
    expect(forced.blob).not.toBe(src);
  });
});
