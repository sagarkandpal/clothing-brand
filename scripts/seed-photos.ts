/**
 * Replaces the demo catalogue with products built from the vendor's photos in
 * product-photos/. Uses MONGODB_URI from .env. Usage: npm run seed:photos
 */
import 'dotenv/config';
import { getDb } from '../server/db.ts';
import { seedPhotoProducts } from './photo-products.ts';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

const db = await getDb();
console.log('Adding products from product-photos/ …');
const n = await seedPhotoProducts(db);
console.log(`Done: ${n} products. Prices, sizes and stock are placeholders — edit them in /admin.`);
process.exit(0);
