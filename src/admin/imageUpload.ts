import { keyOutWhiteBackground } from '../../shared/keyout';
import { api } from '../lib/api';

const MAX_INPUT_BYTES = 25 * 1024 * 1024;
const MIN_EDGE = 100;
// Kept small on purpose: photos are stored in the free 512 MB database.
const LARGE_EDGE = 1200;
const THUMB_EDGE = 480;
const MAX_LARGE_BYTES = 600 * 1024;

export interface UploadedImage {
  id: string;
  width: number;
  height: number;
  cutout: boolean;
}

async function decode(file: File): Promise<ImageBitmap | HTMLImageElement> {
  if ('createImageBitmap' in window) {
    try {
      return await createImageBitmap(file, { imageOrientation: 'from-image' });
    } catch {
      /* fall through to <img> decoding */
    }
  }
  const url = URL.createObjectURL(file);
  try {
    const img = new Image();
    img.decoding = 'async';
    img.src = url;
    await img.decode();
    return img;
  } finally {
    URL.revokeObjectURL(url);
  }
}

/**
 * True when the photo's left and right edges are near-white — a packshot on a
 * plain backdrop. Such images are shown contained on the store's studio backdrop.
 * (Top/bottom edges are ignored because garments often touch them.)
 * Keep in sync with scripts/cutout.ts.
 */
function hasPlainLightBackground(source: ImageBitmap | HTMLImageElement): boolean {
  const w = 48;
  const h = Math.max(8, Math.round((48 * source.height) / source.width));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: true });
  if (!ctx) return false;
  ctx.drawImage(source, 0, 0, w, h);
  const { data } = ctx.getImageData(0, 0, w, h);
  let light = 0;
  let total = 0;
  for (let y = 0; y < h; y++) {
    for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) {
      const i = (y * w + x) * 4;
      total++;
      if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 235) light++;
    }
  }
  return light / total >= 0.6;
}

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

async function render(source: ImageBitmap | HTMLImageElement, maxEdge: number, quality: number, cutout = false) {
  const sw = source.width;
  const sh = source.height;
  const scale = Math.min(1, maxEdge / Math.max(sw, sh));
  let w = Math.round(sw * scale);
  let h = Math.round(sh * scale);
  let canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d', { willReadFrequently: cutout });
  if (!ctx) throw new Error('Your browser could not process this image.');
  if (!cutout) {
    ctx.fillStyle = '#ffffff'; // flatten transparent PNGs
    ctx.fillRect(0, 0, w, h);
  }
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, w, h);

  if (cutout) {
    // Remove the plain backdrop so the product floats on the store's backgrounds,
    // then trim the empty margin so every cutout is framed consistently.
    const img = ctx.getImageData(0, 0, w, h);
    keyOutWhiteBackground(img.data, w, h);
    ctx.putImageData(img, 0, 0);
    let x0 = w, y0 = h, x1 = -1, y1 = -1;
    for (let y = 0; y < h; y++) {
      for (let x = 0; x < w; x++) {
        if (img.data[(y * w + x) * 4 + 3] > 8) {
          if (x < x0) x0 = x;
          if (x > x1) x1 = x;
          if (y < y0) y0 = y;
          if (y > y1) y1 = y;
        }
      }
    }
    if (x1 > x0 && y1 > y0) {
      const trimmed = document.createElement('canvas');
      trimmed.width = x1 - x0 + 1;
      trimmed.height = y1 - y0 + 1;
      trimmed.getContext('2d')!.drawImage(canvas, x0, y0, trimmed.width, trimmed.height, 0, 0, trimmed.width, trimmed.height);
      canvas = trimmed;
      w = trimmed.width;
      h = trimmed.height;
    }
  }

  // WebP where supported (much smaller); otherwise PNG for cutouts (keeps
  // transparency) and JPEG for regular photos.
  let blob = await toBlob(canvas, 'image/webp', quality);
  if (!blob || blob.type !== 'image/webp') blob = await toBlob(canvas, cutout ? 'image/png' : 'image/jpeg', quality);
  if (!blob) throw new Error('Could not compress this image.');
  return { blob, width: w, height: h };
}

/**
 * Resizes and compresses a photo in the browser (keeping proportions — never
 * stretched), then uploads a large + thumbnail version to the server.
 */
export async function compressAndUpload(file: File): Promise<UploadedImage> {
  if (!file.type.startsWith('image/') && !/\.(jpe?g|png|webp|heic|heif)$/i.test(file.name)) {
    throw new Error('This file is not a photo.');
  }
  if (file.size > MAX_INPUT_BYTES) throw new Error('Photo is too big (max 25 MB).');

  let source: ImageBitmap | HTMLImageElement;
  try {
    source = await decode(file);
  } catch {
    throw new Error(
      /hei[cf]/i.test(file.type + file.name)
        ? 'HEIC photos are not supported by this browser. On iPhone, choose "Most Compatible" in Settings → Camera → Formats, or share the photo as JPG.'
        : 'Could not open this photo. Use a JPG, PNG or WebP.',
    );
  }
  // Same minimum as the server (server/media.ts), so small photos from WhatsApp still work.
  if (source.width < MIN_EDGE || source.height < MIN_EDGE) throw new Error('Photo is too small. Use a bigger photo.');

  const cutout = hasPlainLightBackground(source);
  let large = await render(source, LARGE_EDGE, 0.8, cutout);
  for (const q of [0.74, 0.62]) {
    if (large.blob.size <= MAX_LARGE_BYTES) break;
    large = await render(source, LARGE_EDGE, q, cutout);
  }
  if (large.blob.size > MAX_LARGE_BYTES) large = await render(source, 1000, 0.7, cutout);
  const thumb = await render(source, THUMB_EDGE, 0.78, cutout);
  if ('close' in source) source.close();

  const form = new FormData();
  const ext = large.blob.type.split('/')[1] ?? 'jpg';
  form.append('large', large.blob, `large.${ext}`);
  form.append('thumb', thumb.blob, `thumb.${ext}`);
  form.append('width', String(large.width));
  form.append('height', String(large.height));
  if (cutout) form.append('cutout', '1');
  return api<UploadedImage>('/admin/media', { method: 'POST', body: form });
}
