import { MongoClient, type Db, GridFSBucket } from 'mongodb';
import { LEGACY_CATEGORIES } from '../shared/catalog.ts';
import { HttpError } from './http.ts';

// Cached across invocations of a warm function instance.
let clientPromise: Promise<MongoClient> | null = null;
let indexesPromise: Promise<void> | null = null;

export async function getDb(): Promise<Db> {
  const uri = process.env.MONGODB_URI;
  if (!uri) throw new HttpError(503, 'The store database is not configured yet.');
  if (!clientPromise) {
    // A small pool per instance keeps total connections well under Atlas limits.
    const client = new MongoClient(uri, { maxPoolSize: 5, serverSelectionTimeoutMS: 7000, appName: 'clothing-store' });
    clientPromise = client.connect().catch((err) => {
      clientPromise = null;
      throw err;
    });
  }
  const client = await clientPromise;
  const db = client.db(process.env.MONGODB_DB_NAME || 'store');
  if (!indexesPromise) {
    indexesPromise = ensureIndexes(db).catch((err) => {
      indexesPromise = null;
      throw err;
    });
  }
  await indexesPromise;
  return db;
}

export function imageBucket(db: Db): GridFSBucket {
  return new GridFSBucket(db, { bucketName: 'images', chunkSizeBytes: 255 * 1024 });
}

async function ensureIndexes(db: Db): Promise<void> {
  await Promise.all([
    db.collection('products').createIndexes([
      { key: { slug: 1 }, unique: true, name: 'slug_unique' },
      { key: { isActive: 1, category: 1, createdAt: -1 }, name: 'active_category_new' },
      { key: { isActive: 1, createdAt: -1 }, name: 'active_new' },
      { key: { isActive: 1, price: 1 }, name: 'active_price' },
      { key: { isActive: 1, isFeatured: 1, createdAt: -1 }, name: 'active_featured' },
      { key: { 'images.id': 1 }, name: 'image_refs' },
    ]),
    db.collection('admins').createIndex({ email: 1 }, { unique: true, name: 'email_unique' }),
    db.collection('sessions').createIndexes([
      { key: { tokenHash: 1 }, unique: true, name: 'token_unique' },
      { key: { expiresAt: 1 }, expireAfterSeconds: 0, name: 'session_ttl' },
    ]),
    db.collection('login_attempts').createIndexes([
      { key: { key: 1, createdAt: -1 }, name: 'key_time' },
      { key: { createdAt: 1 }, expireAfterSeconds: 60 * 30, name: 'attempt_ttl' },
    ]),
    db.collection('media').createIndex({ createdAt: 1 }, { name: 'created' }),
  ]);
  await migrateCategories(db);
}

/** Moves products from the old categories (T-Shirts, Jeans…) to the Upper / Bottom segments. */
async function migrateCategories(db: Db): Promise<void> {
  const bySegment = new Map<string, string[]>();
  for (const [old, seg] of Object.entries(LEGACY_CATEGORIES)) bySegment.set(seg, [...(bySegment.get(seg) ?? []), old]);
  for (const [seg, olds] of bySegment) {
    await db.collection('products').updateMany({ category: { $in: olds } }, { $set: { category: seg } });
  }
}
