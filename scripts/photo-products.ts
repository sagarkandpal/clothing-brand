import sharp from 'sharp';
import { ObjectId, type Db } from 'mongodb';
import { storeImage } from '../server/media.ts';
import { createProduct, deleteDemoProducts, deleteProduct } from '../server/products.ts';
import { parseProductInput, slugify } from '../server/validate.ts';
import { isCutout, makeTransparent } from './cutout.ts';

/**
 * The vendor's sample catalogue, built from the original photos in
 * product-photos/. PRICES, SIZES AND STOCK ARE PLACEHOLDERS — update them in
 * the admin. To swap in better photos or mockups later, use Admin → Products → Edit.
 */
interface PhotoProduct {
  file: string;
  name: string;
  category: string;
  price: number;
  sizes: string[];
  description: string;
  featured?: boolean;
  /** Fraction of the photo height to crop from the top (hides faces). */
  cropTop?: number;
}

const TOPS = ['S', 'M', 'L', 'XL'];
const BOTTOMS = ['28', '30', '32', '34', '36'];

export const PHOTO_PRODUCTS: PhotoProduct[] = [
  { file: 'spider-back-print-oversized-tee.webp', name: 'Spider Back Print Oversized Tee', category: 'oversized-t-shirts', price: 699, sizes: TOPS, featured: true, description: 'Washed black oversized tee with a large red spider graphic on the back.' },
  { file: 'charcoal-essential-hoodie.webp', name: 'Charcoal Essential Hoodie', category: 'hoodies', price: 1299, sizes: TOPS, featured: true, description: 'Charcoal pullover hoodie with drawstring hood, kangaroo pocket and ribbed cuffs and hem.' },
  { file: 'spider-eyes-waffle-sweatshirt.jpg', name: 'Spider Eyes Waffle Sweatshirt', category: 'sweatshirts', price: 999, sizes: TOPS, featured: true, description: 'Black waffle-knit boxy sweatshirt with a mask-eyes motif on the chest and red sleeve print.' },
  { file: 'red-gingham-graphic-shirt.jpg', name: 'Red Gingham Graphic Shirt', category: 'shirts', price: 899, sizes: TOPS, featured: true, cropTop: 0.12, description: 'Red and white gingham half-sleeve shirt with a yellow and white typographic print on the front.' },
  { file: 'charcoal-waffle-henley.webp', name: 'Charcoal Waffle Henley', category: 't-shirts', price: 649, sizes: TOPS, cropTop: 0.05, description: 'Charcoal waffle-knit long-sleeve henley with a three-button placket.' },
  { file: 'brown-waffle-long-sleeve-tee.jpg', name: 'Brown Waffle Long Sleeve Tee', category: 't-shirts', price: 599, sizes: TOPS, featured: true, cropTop: 0.27, description: 'Brown waffle-knit crew-neck long-sleeve tee with ribbed cuffs.' },
  { file: 'mid-blue-wide-leg-jeans.webp', name: 'Mid Blue Wide-Leg Jeans', category: 'jeans', price: 1199, sizes: BOTTOMS, featured: true, description: 'Faded mid-blue wide-leg jeans with a classic five-pocket design.' },
  { file: 'vintage-wash-baggy-jeans.jpg', name: 'Vintage Wash Baggy Jeans', category: 'jeans', price: 1299, sizes: BOTTOMS, featured: true, description: 'Vintage-wash blue baggy jeans with a relaxed, stacked leg.' },
  { file: 'brown-washed-cargo-jeans.webp', name: 'Brown Washed Cargo Jeans', category: 'jeans', price: 1399, sizes: BOTTOMS, featured: true, description: 'Washed brown denim cargos with side flap pockets and a wide leg.' },
  { file: 'brown-side-stripe-wide-pants.jpg', name: 'Brown Side-Stripe Wide Pants', category: 'trousers', price: 799, sizes: TOPS, description: 'Brown wide-leg pants with an elastic waist and white side piping.' },
  { file: 'white-relaxed-track-pants.jpg', name: 'White Relaxed Track Pants', category: 'trousers', price: 799, sizes: TOPS, description: 'White straight-leg track pants with a drawstring waist and small chest-logo print.' },
];


/** Crops faces out, then upscales small photos (no distortion — aspect ratio is kept). */
async function prepare(path: string, cropTop = 0) {
  const meta = await sharp(path).metadata();
  const w = meta.width!;
  const h = meta.height!;
  const top = Math.round(h * cropTop);
  const cropped = sharp(path).extract({ left: 0, top, width: w, height: h - top });
  const scale = Math.min(2.5, Math.max(1, 1000 / Math.max(w, h - top)));
  const W = Math.round(w * scale);
  const H = Math.round((h - top) * scale);
  const base = await cropped.resize(W, H, { kernel: 'lanczos3' }).sharpen({ sigma: 0.7 }).toBuffer();
  const large = await sharp(base).webp({ quality: 88 }).toBuffer();
  const thumb = await sharp(base).resize({ width: Math.min(640, W) }).webp({ quality: 82 }).toBuffer();
  if (await isCutout(base)) return { ...(await makeTransparent(base)), cutout: true };
  return { large, thumb, width: W, height: H, cutout: false };
}

export async function seedPhotoProducts(db: Db, dir = 'product-photos', log = console.log): Promise<number> {
  const removedDemo = await deleteDemoProducts(db);
  if (removedDemo) log(`  - removed ${removedDemo} demo products`);

  let n = 0;
  for (const [i, p] of PHOTO_PRODUCTS.entries()) {
    // Re-running replaces the earlier copy instead of duplicating it.
    const existing = await db.collection('products').findOne({ slug: slugify(p.name) }, { projection: { _id: 1 } });
    if (existing) await deleteProduct(db, existing._id.toHexString());

    const img = await prepare(`${dir}/${p.file}`, p.cropTop);
    const media = await storeImage(db, img.large, img.thumb, img.width, img.height, img.cutout);
    const input = parseProductInput({
      name: p.name,
      description: p.description,
      category: p.category,
      price: p.price,
      originalPrice: null,
      images: [{ id: media.id, color: null, kind: 'photo' }],
      sizes: p.sizes,
      colors: [],
      isActive: true,
      isFeatured: !!p.featured,
    });
    const product = await createProduct(db, input);
    // Stagger creation times so "New Arrivals" has a stable order.
    const createdAt = new Date(Date.now() - i * 60_000);
    await db.collection('products').updateOne({ _id: new ObjectId(product._id) }, { $set: { createdAt, updatedAt: createdAt } });
    log(`  + ${p.name}  (${img.width}×${img.height}${img.cutout ? ', studio' : ''})`);
    n++;
  }
  return n;
}
