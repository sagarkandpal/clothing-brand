/**
 * Adds a small, clearly-labelled DEMO catalogue to the database configured in
 * .env (MONGODB_URI). Demo products can be removed in one click from the admin
 * dashboard ("Remove demo products"). Usage: npm run seed:demo
 */
import 'dotenv/config';
import { getDb } from '../server/db.ts';
import { seedDemo } from './demo-data.ts';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Copy .env.example to .env and fill it in first.');
  process.exit(1);
}

const db = await getDb();
const existing = await db.collection('products').countDocuments({ isDemo: true });
if (existing && !process.argv.includes('--force')) {
  console.log(`${existing} demo products already exist. Run with --force to add another set.`);
  process.exit(0);
}
console.log('Seeding demo products…');
const n = await seedDemo(db);
console.log(`Done: ${n} demo products added.`);
process.exit(0);
