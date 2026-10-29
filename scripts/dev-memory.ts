/**
 * Try the whole store locally WITHOUT a MongoDB Atlas account.
 * Starts a local MongoDB (data kept in .localdb/), seeds demo products on first
 * run, and launches the Vite dev server with the API. Usage: npm run dev:memory
 */
import 'dotenv/config';
import { mkdirSync } from 'node:fs';
import { MongoMemoryServer } from 'mongodb-memory-server';
import { createServer } from 'vite';

const dbPath = process.env.LOCAL_DB_PATH || '.localdb';
mkdirSync(dbPath, { recursive: true });
const mongo = await MongoMemoryServer.create({
  instance: { dbPath, storageEngine: 'wiredTiger', port: Number(process.env.LOCAL_DB_PORT) || 27099 },
});
process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB_NAME ||= 'store';

// Local-only fallbacks so the admin works out of the box. Never used in production.
if (!process.env.SESSION_SECRET || process.env.SESSION_SECRET.length < 32) {
  process.env.SESSION_SECRET = 'local-dev-only-session-secret-change-me-0123456789';
}
const adminEmail = process.env.ADMIN_EMAIL || process.env.ADMIN_INITIAL_EMAIL;
const adminPassword = process.env.ADMIN_PASSWORD || process.env.ADMIN_INITIAL_PASSWORD;
const usingDevAdmin = !adminEmail || !adminPassword;
if (usingDevAdmin) {
  process.env.ADMIN_EMAIL = 'admin@local.test';
  process.env.ADMIN_PASSWORD = 'local-admin-123';
}

const { getDb } = await import('../server/db.ts');
const db = await getDb();
if ((await db.collection('products').estimatedDocumentCount()) === 0 && !process.argv.includes('--empty')) {
  const { seedPhotoProducts } = await import('./photo-products.ts');
  console.log('First run: adding products from product-photos/ …');
  await seedPhotoProducts(db);
}

const server = await createServer({ server: { port: Number(process.env.PORT) || 5173 } });
await server.listen();
server.printUrls();
console.log('\n  Local MongoDB:', mongo.getUri(), '(data in .localdb/)');
console.log(
  usingDevAdmin
    ? '  Admin (local only): admin@local.test / local-admin-123  →  /admin'
    : `  Admin: ${adminEmail} (password from .env)  →  /admin`,
);

const stop = async () => {
  await server.close();
  await mongo.stop({ doCleanup: false });
  process.exit(0);
};
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
