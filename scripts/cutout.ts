import sharp from 'sharp';
import { keyOutWhiteBackground } from '../shared/keyout.ts';

/**
 * Node version of the admin's browser check (src/admin/imageUpload.ts): a photo
 * is a "cutout" when its left and right edges are near-white (a packshot on a
 * plain backdrop). Top/bottom edges are ignored because garments often touch them.
 */
export async function isCutout(buf: Buffer): Promise<boolean> {
  const w = 48;
  const { data, info } = await sharp(buf).resize({ width: w }).removeAlpha().raw().toBuffer({ resolveWithObject: true });
  let light = 0;
  let total = 0;
  for (let y = 0; y < info.height; y++) {
    for (const x of [0, 1, 2, w - 3, w - 2, w - 1]) {
      const i = (y * w + x) * 3;
      total++;
      if (0.2126 * data[i] + 0.7152 * data[i + 1] + 0.0722 * data[i + 2] > 235) light++;
    }
  }
  return light / total >= 0.6;
}

/**
 * Turns a packshot on a white backdrop into a transparent WebP (large + thumb),
 * so the product can float on any background with a real drop shadow.
 */
export async function makeTransparent(buf: Buffer, maxEdge = 1400) {
  const { data, info } = await sharp(buf)
    .resize({ width: maxEdge, height: maxEdge, fit: 'inside', withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  keyOutWhiteBackground(data, info.width, info.height);
  const keyed = sharp(data, { raw: { width: info.width, height: info.height, channels: 4 } });
  // Trim the empty margin so every product is framed consistently by CSS.
  const trimmed = await keyed.png().toBuffer();
  const { data: tdata, info: tinfo } = await sharp(trimmed).trim({ threshold: 1 }).toBuffer({ resolveWithObject: true });
  const large = await sharp(tdata).webp({ quality: 88, alphaQuality: 92 }).toBuffer();
  const thumb = await sharp(tdata).resize({ width: Math.min(640, tinfo.width) }).webp({ quality: 82, alphaQuality: 90 }).toBuffer();
  return { large, thumb, width: tinfo.width, height: tinfo.height };
}
