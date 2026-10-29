import { ObjectId } from 'mongodb';
import { normalizeCategory, sortSizes } from '../shared/catalog.ts';
import type { ImageKind, ProductColor, ProductInput, Variant } from '../shared/types.ts';
import { HttpError } from './http.ts';

/**
 * Hand-rolled validators. Every value is checked for its primitive type, so
 * operator objects such as {"$gt": ""} can never reach a MongoDB query.
 */

export function cleanText(v: unknown, field: string, { min = 0, max = 200, multiline = false } = {}): string {
  if (v === undefined || v === null) v = '';
  if (typeof v !== 'string') throw new HttpError(400, `${field} must be text.`, { [field]: 'Invalid value' });
  // Strip control characters (keep newlines/tabs in multiline fields).
  let s = v.replace(multiline ? /[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g : /[\u0000-\u001F\u007F]/g, '');
  s = multiline ? s.replace(/[ \t]+\n/g, '\n').replace(/\n{3,}/g, '\n\n').trim() : s.replace(/\s+/g, ' ').trim();
  if (s.length < min) throw new HttpError(400, `${field} must be at least ${min} characters.`, { [field]: 'Too short' });
  if (s.length > max) throw new HttpError(400, `${field} must be at most ${max} characters.`, { [field]: 'Too long' });
  return s;
}

export function wholeNumber(v: unknown, field: string, min: number, max: number): number {
  const n = typeof v === 'string' && v.trim() !== '' ? Number(v) : v;
  if (typeof n !== 'number' || !Number.isInteger(n) || n < min || n > max) {
    throw new HttpError(400, `${field} must be a whole number between ${min} and ${max}.`, { [field]: 'Invalid number' });
  }
  return n;
}

export function bool(v: unknown, field: string): boolean {
  if (typeof v !== 'boolean') throw new HttpError(400, `${field} must be true or false.`);
  return v;
}

export function objectId(v: unknown, what = 'id'): ObjectId {
  if (typeof v !== 'string' || !/^[a-f0-9]{24}$/i.test(v)) throw new HttpError(404, `Unknown ${what}.`);
  return new ObjectId(v);
}

export function escapeRegex(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

// Generous enough for ~15 colours with a photo each, plus a few shared photos.
export const MAX_COLORS = 20;
export const MAX_IMAGES = 30;

const SIZE_RE = /^[A-Za-z0-9][A-Za-z0-9 ./-]{0,11}$/;
const HEX_RE = /^#[0-9a-fA-F]{6}$/;

export function parseProductInput(body: Record<string, unknown>): ProductInput {
  const name = cleanText(body.name, 'Name', { min: 2, max: 120 });
  const description = cleanText(body.description, 'Description', { max: 3000, multiline: true });

  const category = typeof body.category === 'string' ? normalizeCategory(body.category) : null;
  if (!category) throw new HttpError(400, 'Please choose Upper Wear or Bottom Wear.', { category: 'Required' });

  const price = wholeNumber(body.price, 'Selling price', 1, 10_000_000);
  let originalPrice: number | null = null;
  if (body.originalPrice !== null && body.originalPrice !== undefined && body.originalPrice !== '') {
    originalPrice = wholeNumber(body.originalPrice, 'Original price', 1, 10_000_000);
    if (originalPrice <= price) {
      throw new HttpError(400, 'Original price must be higher than the selling price — or leave it empty.', {
        originalPrice: 'Must be higher than selling price',
      });
    }
  }

  // Sizes
  if (!Array.isArray(body.sizes) || body.sizes.length === 0) {
    throw new HttpError(400, 'Add at least one size.', { sizes: 'Required' });
  }
  if (body.sizes.length > 15) throw new HttpError(400, 'Too many sizes (max 15).');
  const sizeSet = new Set<string>();
  for (const s of body.sizes) {
    if (typeof s !== 'string' || !SIZE_RE.test(s.trim())) throw new HttpError(400, `Invalid size "${String(s)}".`);
    sizeSet.add(s.trim());
  }
  const sizes = sortSizes([...sizeSet]);

  // Colours
  const rawColors = body.colors ?? [];
  if (!Array.isArray(rawColors) || rawColors.length > MAX_COLORS) {
    throw new HttpError(400, `Up to ${MAX_COLORS} colours are allowed.`);
  }
  const colors: ProductColor[] = [];
  for (const c of rawColors) {
    if (!c || typeof c !== 'object') throw new HttpError(400, 'Invalid colour.');
    const { name: cn, hex, soldOut } = c as Record<string, unknown>;
    const colorName = cleanText(cn, 'Colour name', { min: 1, max: 30 });
    if (typeof hex !== 'string' || !HEX_RE.test(hex)) throw new HttpError(400, `Invalid colour code for ${colorName}.`);
    if (colors.some((x) => x.name.toLowerCase() === colorName.toLowerCase())) {
      throw new HttpError(400, `Colour "${colorName}" is listed twice.`);
    }
    colors.push({ name: colorName, hex: hex.toUpperCase(), ...(soldOut === true ? { soldOut: true } : {}) });
  }

  // Stock is a simple Available / Sold out switch, not a count:
  // each colour has its own switch, and a product without colours uses `soldOut`.
  // The sizes × colours grid gets stock 1 (available) or 0 (sold out), which keeps
  // the existing in-stock and filter logic working unchanged.
  const productSoldOut = body.soldOut === true;
  const variants: Variant[] = [];
  for (const size of sizes) {
    if (!colors.length) variants.push({ size, color: null, stock: productSoldOut ? 0 : 1 });
    for (const c of colors) variants.push({ size, color: c.name, stock: c.soldOut ? 0 : 1 });
  }

  // Images (ids are resolved against the media collection by the caller)
  const rawImages = body.images ?? [];
  if (!Array.isArray(rawImages) || rawImages.length > MAX_IMAGES) {
    throw new HttpError(400, `Up to ${MAX_IMAGES} photos per product.`);
  }
  const images: { id: string; color: string | null; kind: ImageKind }[] = [];
  for (const img of rawImages) {
    if (!img || typeof img !== 'object') throw new HttpError(400, 'Invalid image.');
    const { id, color, kind } = img as Record<string, unknown>;
    if (typeof id !== 'string' || !/^[a-f0-9]{24}$/i.test(id)) throw new HttpError(400, 'Invalid image reference.');
    if (images.some((i) => i.id === id)) continue;
    const imgColor = typeof color === 'string' && colors.some((c) => c.name === color) ? color : null;
    images.push({ id, color: imgColor, kind: kind === 'mockup' ? 'mockup' : 'photo' });
  }

  return {
    name,
    description,
    category,
    price,
    originalPrice,
    images,
    sizes,
    colors,
    variants,
    isActive: bool(body.isActive ?? true, 'Active'),
    isFeatured: bool(body.isFeatured ?? false, 'Featured'),
  };
}

export function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .normalize('NFKD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60) || 'product'
  );
}
