import sharp from 'sharp';
import type { Db } from 'mongodb';
import { COLOR_PRESETS } from '../shared/catalog.ts';
import { storeImage } from '../server/media.ts';
import { createProduct } from '../server/products.ts';
import { parseProductInput } from '../server/validate.ts';
import { garmentSvg, type GarmentKind, type View } from './garments.ts';

const hex = (name: string) => COLOR_PRESETS.find((c) => c.name === name)!.hex;

interface Demo {
  name: string;
  category: string;
  kind: GarmentKind;
  price: number;
  originalPrice?: number;
  colors: string[];
  sizes: string[];
  /** 0 = whole product sold out; otherwise available */
  stock: number[] | 0;
  /** Colours switched to "Sold out" */
  soldOutColors?: string[];
  views?: View[];
  featured?: boolean;
  daysAgo: number;
  description: string;
}

const NOTE = 'Demo product for testing the store layout — replace it with your own product.';

const DEMOS: Demo[] = [
  { name: 'Heavyweight Oversized Tee', category: 'oversized-t-shirts', kind: 'oversized', price: 699, originalPrice: 999, colors: ['Black', 'Off White', 'Olive'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock: [4, 8, 6, 3, 0], views: ['front', 'detail'], featured: true, daysAgo: 2, description: '240 GSM combed cotton with a dropped shoulder and boxy, relaxed fit.\n\nRibbed crew neck. Pre-shrunk.' },
  { name: 'Back Print Boxy Tee', category: 'oversized-t-shirts', kind: 'oversized', price: 799, colors: ['Charcoal', 'Beige'], sizes: ['M', 'L', 'XL'], stock: [5, 5, 2], views: ['back', 'front'], featured: true, daysAgo: 5, description: 'Boxy oversized cut with a screen-printed graphic on the back.' },
  { name: 'Everyday Polo Tee', category: 't-shirts', kind: 'tee', price: 549, originalPrice: 799, colors: ['Black', 'White', 'Off White', 'Grey Melange', 'Charcoal', 'Navy', 'Olive', 'Beige', 'Brown', 'Maroon', 'Sky Blue', 'Light Wash', 'Mid Wash', 'Red', 'Green'], soldOutColors: ['Maroon', 'Red'], sizes: ['S', 'M', 'L', 'XL', 'XXL'], stock: [1, 1, 1, 1, 1], views: ['front'], featured: true, daysAgo: 0, description: 'Soft pique cotton polo in 15 colours. Pick your colour and size, then order on WhatsApp.' },
  { name: 'Essential Crew Tee', category: 't-shirts', kind: 'tee', price: 399, colors: ['White', 'Navy', 'Black', 'Maroon'], sizes: ['S', 'M', 'L', 'XL'], stock: [6, 10, 10, 4], views: ['front', 'detail'], daysAgo: 9, description: 'Regular-fit everyday tee in soft 180 GSM cotton.' },
  { name: 'Slub Cotton Tee', category: 't-shirts', kind: 'tee', price: 449, colors: ['Grey Melange'], sizes: ['S', 'M', 'L', 'XL'], stock: [0, 3, 0, 2], views: ['front'], daysAgo: 40, description: 'Textured slub cotton with a lived-in feel.' },
  { name: 'Heavy Fleece Hoodie', category: 'hoodies', kind: 'hoodie', price: 1499, originalPrice: 1899, colors: ['Black', 'Grey Melange'], sizes: ['M', 'L', 'XL', 'XXL'], stock: [3, 5, 4, 1], views: ['front', 'back', 'detail'], featured: true, daysAgo: 3, description: '400 GSM brushed fleece. Double-layer hood, kangaroo pocket, ribbed cuffs and hem.' },
  { name: 'Washed Pullover Hoodie', category: 'hoodies', kind: 'hoodie', price: 1599, colors: ['Olive', 'Brown'], sizes: ['S', 'M', 'L', 'XL'], stock: [2, 4, 4, 2], views: ['front', 'back'], daysAgo: 21, description: 'Garment-washed for a soft, faded finish.' },
  { name: 'Brushed Crewneck Sweatshirt', category: 'sweatshirts', kind: 'sweatshirt', price: 1199, colors: ['Navy', 'Beige'], sizes: ['S', 'M', 'L', 'XL'], stock: [3, 6, 6, 3], views: ['front', 'back'], featured: true, daysAgo: 14, description: 'Midweight brushed-back fleece crewneck with a V-insert at the neck.' },
  { name: 'Oxford Overshirt', category: 'shirts', kind: 'shirt', price: 1099, colors: ['Sky Blue', 'White'], sizes: ['S', 'M', 'L', 'XL'], stock: [2, 5, 5, 2], views: ['front', 'back'], daysAgo: 7, description: 'Relaxed oxford cotton shirt with a chest pocket. Wear it buttoned or open as a layer.' },
  { name: 'Relaxed Linen-Blend Shirt', category: 'shirts', kind: 'shirt', price: 1299, colors: ['Beige', 'Olive'], sizes: ['M', 'L', 'XL'], stock: [3, 3, 2], views: ['front'], daysAgo: 33, description: 'Breathable linen-cotton blend for warm days.' },
  { name: 'Utility Cargo Trousers', category: 'trousers', kind: 'cargo', price: 1399, colors: ['Olive', 'Black'], sizes: ['28', '30', '32', '34', '36'], stock: [2, 4, 5, 3, 1], views: ['front', 'back'], featured: true, daysAgo: 4, description: 'Straight-leg cargos with bellowed side pockets and a drawcord hem.' },
  { name: 'Pleated Wide Trousers', category: 'trousers', kind: 'trouser', price: 1199, colors: ['Charcoal', 'Beige'], sizes: ['30', '32', '34'], stock: [2, 3, 2], views: ['front'], daysAgo: 26, description: 'Single-pleat wide trousers with a clean, tailored drape.' },
  { name: 'Baggy Wide-Leg Jeans', category: 'jeans', kind: 'jeans', price: 1499, colors: ['Light Wash', 'Dark Wash'], sizes: ['28', '30', '32', '34', '36'], stock: [2, 4, 4, 3, 1], views: ['front', 'back'], featured: true, daysAgo: 1, description: 'Loose, wide-leg denim with a mid rise. 13 oz rigid cotton.' },
  { name: 'Straight Fit Jeans', category: 'jeans', kind: 'jeans', price: 1299, colors: ['Mid Wash'], sizes: ['30', '32', '34'], stock: 0, views: ['front', 'back'], daysAgo: 45, description: 'Classic straight-leg five-pocket denim.' },
];

async function renderImage(db: Db, kind: GarmentKind, color: string, view: View, seed: number) {
  const svg = Buffer.from(garmentSvg(kind, color, view, seed));
  const large = await sharp(svg).resize(1200, 1500).webp({ quality: 82 }).toBuffer();
  const thumb = await sharp(svg).resize(640, 800).webp({ quality: 78 }).toBuffer();
  return storeImage(db, large, thumb, 1200, 1500);
}

export async function seedDemo(db: Db, log = console.log): Promise<number> {
  let n = 0;
  for (const [i, d] of DEMOS.entries()) {
    const images: { id: string; color: string | null }[] = [];
    for (const [ci, colorName] of d.colors.entries()) {
      const views = ci === 0 ? (d.views ?? ['front']) : ['front' as View];
      for (const view of views) {
        const img = await renderImage(db, d.kind, hex(colorName), view, i + ci);
        images.push({ id: img.id, color: d.colors.length > 1 ? colorName : null });
      }
    }
    const input = parseProductInput({
      name: d.name,
      description: `${d.description}\n\n${NOTE}`,
      category: d.category,
      price: d.price,
      originalPrice: d.originalPrice ?? null,
      images,
      sizes: d.sizes,
      colors:
        d.colors.length > 1
          ? d.colors.map((name) => ({ name, hex: hex(name), soldOut: d.stock === 0 || !!d.soldOutColors?.includes(name) }))
          : [],
      soldOut: d.stock === 0,
      isActive: true,
      isFeatured: !!d.featured,
    });
    const product = await createProduct(db, input);
    const createdAt = new Date(Date.now() - d.daysAgo * 864e5);
    await db.collection('products').updateOne(
      { slug: product.slug },
      { $set: { isDemo: true, createdAt, updatedAt: createdAt } },
    );
    log(`  + ${d.name}`);
    n++;
  }
  return n;
}
