import type { Db } from 'mongodb';

/**
 * Full JSON backup of the store data: products (including the Trash) and settings.
 * Admin accounts, sessions and login attempts are never included.
 * Photos are NOT inside the backup (they stay in the database's image storage);
 * products keep their image ids.
 */
export async function exportBackup(db: Db) {
  const [products, settings, media] = await Promise.all([
    db.collection('products').find({}).toArray(),
    db.collection('settings').find({}).toArray(),
    db.collection('media').find({}).toArray(),
  ]);
  return {
    exportedAt: new Date().toISOString(),
    counts: { products: products.length, settings: settings.length, media: media.length },
    products,
    settings,
    media,
  };
}
