import { ObjectId, type Db } from 'mongodb';
import { imageBucket } from './db.ts';
import LIMITS from '../limits.config.json';
import { HttpError } from './http.ts';

/**
 * Product images live in MongoDB GridFS (bucket "images"). The admin browser
 * resizes and compresses each photo before upload, producing a large version
 * (~1200px) and a thumbnail (~480px). A `media` document ties the two files
 * together; products reference media ids, never raw binaries.
 */

// Netlify buffered functions accept ~6 MB per request (incl. encoding overhead).
const MAX_REQUEST_BYTES = 4.2 * 1024 * 1024;
const MAX_LARGE_BYTES = 3 * 1024 * 1024;
const MAX_THUMB_BYTES = 700 * 1024;
const ORPHAN_AGE_MS = 24 * 60 * 60 * 1000;
// Refuse uploads a little before the database limit (512 MB on Atlas free), so
// product edits still have room.
const DB_HARD_LIMIT_BYTES = LIMITS.dbLimitMB * 0.92 * 1024 * 1024;

export interface MediaDoc {
  _id: ObjectId;
  lg: ObjectId;
  sm: ObjectId;
  width: number;
  height: number;
  contentType: string;
  bytes: number;
  /** Product shot on a plain light background (shown contained on a studio backdrop). */
  cutout?: boolean;
  createdAt: Date;
}

export function imageLimitBytes(): number {
  // IMAGE_STORAGE_LIMIT_MB (env) overrides limits.config.json.
  const mb = Number(process.env.IMAGE_STORAGE_LIMIT_MB);
  return (Number.isFinite(mb) && mb > 0 ? mb : LIMITS.imageLimitMB) * 1024 * 1024;
}

function sniffType(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  if (buf[0] === 0xff && buf[1] === 0xd8 && buf[2] === 0xff) return 'image/jpeg';
  if (buf.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return 'image/png';
  if (buf.toString('ascii', 0, 4) === 'RIFF' && buf.toString('ascii', 8, 12) === 'WEBP') return 'image/webp';
  return null;
}

export async function storageUsage(db: Db): Promise<{ usedBytes: number; images: number }> {
  const [agg] = await db
    .collection('images.files')
    .aggregate<{ bytes: number }>([{ $group: { _id: null, bytes: { $sum: '$length' } } }])
    .toArray();
  return { usedBytes: agg?.bytes ?? 0, images: await db.collection('media').estimatedDocumentCount() };
}

async function assertStorageAvailable(db: Db, incoming: number): Promise<void> {
  const { usedBytes } = await storageUsage(db);
  if (usedBytes + incoming > imageLimitBytes()) {
    throw new HttpError(
      507,
      'Image storage is full. Delete old products or unused images before uploading more.',
    );
  }
  try {
    const stats = await db.command({ dbStats: 1 });
    if (Number(stats.dataSize) + Number(stats.indexSize) + incoming > DB_HARD_LIMIT_BYTES) {
      throw new HttpError(507, 'The database is nearly full. Delete old products before uploading more images.');
    }
  } catch (err) {
    if (err instanceof HttpError) throw err; // dbStats unavailable: rely on the image quota alone
  }
}

function writeFile(db: Db, buf: Buffer, filename: string, contentType: string, mediaId: ObjectId): Promise<ObjectId> {
  return new Promise((resolve, reject) => {
    const stream = imageBucket(db).openUploadStream(filename, { metadata: { contentType, mediaId } });
    stream.once('error', reject);
    stream.once('finish', () => resolve(stream.id as ObjectId));
    stream.end(buf);
  });
}

export async function uploadMedia(db: Db, req: Request): Promise<{ id: string; width: number; height: number }> {
  const len = Number(req.headers.get('content-length') ?? 0);
  if (len > MAX_REQUEST_BYTES) throw new HttpError(413, 'Image is too large. Please upload a smaller photo.');
  if (!(req.headers.get('content-type') ?? '').includes('multipart/form-data')) {
    throw new HttpError(415, 'Expected an image upload.');
  }
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    throw new HttpError(400, 'Upload could not be read. Please try again.');
  }
  const large = form.get('large');
  const thumb = form.get('thumb');
  if (!(large instanceof Blob) || !(thumb instanceof Blob)) throw new HttpError(400, 'Missing image data.');
  if (large.size > MAX_LARGE_BYTES || thumb.size > MAX_THUMB_BYTES) {
    throw new HttpError(413, 'Image is too large after compression. Try a different photo.');
  }
  const width = Number(form.get('width'));
  const height = Number(form.get('height'));
  if (!Number.isInteger(width) || !Number.isInteger(height) || width < 100 || height < 100 || width > 5000 || height > 5000) {
    throw new HttpError(400, 'Image dimensions are invalid (minimum 100×100 pixels).');
  }

  const cutout = form.get('cutout') === '1';
  const result = await storeImage(db, Buffer.from(await large.arrayBuffer()), Buffer.from(await thumb.arrayBuffer()), width, height, cutout);
  await cleanupOrphans(db).catch((err) => console.error('[media] orphan cleanup failed', err));
  return result;
}

/** Validates and stores a large + thumbnail pair in GridFS. Also used by the demo seed script. */
export async function storeImage(
  db: Db,
  lgBuf: Buffer,
  smBuf: Buffer,
  width: number,
  height: number,
  cutout = false,
): Promise<{ id: string; width: number; height: number; cutout: boolean }> {
  const lgType = sniffType(lgBuf);
  const smType = sniffType(smBuf);
  if (!lgType || !smType) throw new HttpError(415, 'Only JPEG, PNG or WebP images are allowed.');

  await assertStorageAvailable(db, lgBuf.length + smBuf.length);

  const mediaId = new ObjectId();
  const lg = await writeFile(db, lgBuf, `${mediaId}-lg`, lgType, mediaId);
  let sm: ObjectId;
  try {
    sm = await writeFile(db, smBuf, `${mediaId}-sm`, smType, mediaId);
  } catch (err) {
    await imageBucket(db).delete(lg).catch(() => {});
    throw err;
  }
  const doc: MediaDoc = {
    _id: mediaId,
    lg,
    sm,
    width,
    height,
    contentType: lgType,
    bytes: lgBuf.length + smBuf.length,
    cutout,
    createdAt: new Date(),
  };
  await db.collection<MediaDoc>('media').insertOne(doc);
  return { id: mediaId.toHexString(), width, height, cutout };
}

export async function serveImage(db: Db, idRaw: string, size: string): Promise<Response> {
  if (!/^[a-f0-9]{24}$/i.test(idRaw) || (size !== 'lg' && size !== 'sm')) {
    return new Response('Not found', { status: 404 });
  }
  const media = await db.collection<MediaDoc>('media').findOne({ _id: new ObjectId(idRaw) });
  if (!media) return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  const fileId = size === 'sm' ? media.sm : media.lg;

  const chunks: Buffer[] = [];
  try {
    for await (const chunk of imageBucket(db).openDownloadStream(fileId)) chunks.push(chunk as Buffer);
  } catch {
    return new Response('Not found', { status: 404, headers: { 'Cache-Control': 'no-store' } });
  }
  const body = Buffer.concat(chunks);
  const type = sniffType(body) ?? 'application/octet-stream';
  // Media ids never change content, so they are cached forever at the edge.
  return new Response(body, {
    status: 200,
    headers: {
      'Content-Type': type,
      'Content-Length': String(body.length),
      'Cache-Control': 'public, max-age=31536000, immutable',
      'Netlify-CDN-Cache-Control': 'public, durable, max-age=31536000, immutable',
      ETag: `"${idRaw}-${size}"`,
      'X-Content-Type-Options': 'nosniff',
      'Content-Security-Policy': "default-src 'none'",
    },
  });
}

export async function resolveMedia(db: Db, ids: string[]): Promise<Map<string, MediaDoc>> {
  if (!ids.length) return new Map();
  const docs = await db
    .collection<MediaDoc>('media')
    .find({ _id: { $in: ids.map((id) => new ObjectId(id)) } })
    .toArray();
  return new Map(docs.map((d) => [d._id.toHexString(), d]));
}

async function isReferenced(db: Db, id: string): Promise<boolean> {
  if (await db.collection('products').findOne({ 'images.id': id }, { projection: { _id: 1 } })) return true;
  const settings = await db.collection('settings').findOne({ _id: 'store' as never }, { projection: { heroImageId: 1, aboutImageId: 1 } });
  return settings?.heroImageId === id || settings?.aboutImageId === id;
}

/**
 * Deletes media only when no product (and not the hero or About photo) still uses
 * it — images shared between products are never removed by accident.
 */
export async function deleteMediaIfUnreferenced(db: Db, ids: string[]): Promise<number> {
  let deleted = 0;
  for (const id of new Set(ids)) {
    if (!/^[a-f0-9]{24}$/i.test(id) || (await isReferenced(db, id))) continue;
    const media = await db.collection<MediaDoc>('media').findOneAndDelete({ _id: new ObjectId(id) });
    if (!media) continue;
    const bucket = imageBucket(db);
    await bucket.delete(media.lg).catch(() => {});
    await bucket.delete(media.sm).catch(() => {});
    deleted++;
  }
  return deleted;
}

/** Removes uploads that were never attached to a product within 24 hours. */
export async function cleanupOrphans(db: Db): Promise<void> {
  const stale = await db
    .collection<MediaDoc>('media')
    .find({ createdAt: { $lt: new Date(Date.now() - ORPHAN_AGE_MS) } }, { projection: { _id: 1 } })
    .limit(200)
    .toArray();
  const candidates: string[] = [];
  for (const m of stale) {
    const id = m._id.toHexString();
    if (!(await isReferenced(db, id))) candidates.push(id);
    if (candidates.length >= 20) break;
  }
  await deleteMediaIfUnreferenced(db, candidates);
}
