/**
 * Upgrades already-uploaded packshots (plain light background) to transparent
 * cutouts so they float on the store's backdrops. Creates new image files,
 * points products at them and removes the old files. Prices, stock and all other
 * product data are untouched. Safe to re-run. Usage: npm run images:backfill
 */
import 'dotenv/config';
import sharp from 'sharp';
import { getDb, imageBucket } from '../server/db.ts';
import { deleteMediaIfUnreferenced, storeImage, type MediaDoc } from '../server/media.ts';
import { isCutout, makeTransparent } from './cutout.ts';

if (!process.env.MONGODB_URI) {
  console.error('MONGODB_URI is not set. Add it to .env first.');
  process.exit(1);
}

async function download(db: Awaited<ReturnType<typeof getDb>>, id: MediaDoc['lg']) {
  const chunks: Buffer[] = [];
  for await (const c of imageBucket(db).openDownloadStream(id)) chunks.push(c as Buffer);
  return Buffer.concat(chunks);
}

const db = await getDb();
const media = await db.collection<MediaDoc>('media').find({}).toArray();
let converted = 0;
for (const m of media) {
  const lg = await download(db, m.lg);
  if ((await sharp(lg).metadata()).hasAlpha) continue; // already a cutout
  if (!(await isCutout(lg))) {
    await db.collection('media').updateOne({ _id: m._id }, { $set: { cutout: false } });
    continue;
  }
  const t = await makeTransparent(lg);
  const fresh = await storeImage(db, t.large, t.thumb, t.width, t.height, true);
  const oldId = m._id.toHexString();
  await db.collection('products').updateMany(
    { 'images.id': oldId },
    {
      $set: {
        'images.$[img].id': fresh.id,
        'images.$[img].width': fresh.width,
        'images.$[img].height': fresh.height,
        'images.$[img].cutout': true,
      },
    },
    { arrayFilters: [{ 'img.id': oldId }] },
  );
  await db.collection('settings').updateOne({ _id: 'store' as never, heroImageId: oldId }, { $set: { heroImageId: fresh.id } });
  await deleteMediaIfUnreferenced(db, [oldId]);
  converted++;
}
console.log(`Checked ${media.length} images: ${converted} converted to transparent cutouts.`);
process.exit(0);
