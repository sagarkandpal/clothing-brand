import { ObjectId, type Db, type Filter, type Sort } from 'mongodb';
import { CATEGORIES, NEW_ARRIVAL_DAYS, collectionBySlug, normalizeCategory, sortSizes } from '../shared/catalog.ts';
import type {
  AdminStats,
  CategorySummary,
  Product,
  ProductCard,
  ProductInput,
  ProductImage,
  ProductListResponse,
} from '../shared/types.ts';
import { HttpError } from './http.ts';
import { deleteMediaIfUnreferenced, imageLimitBytes, resolveMedia, storageUsage } from './media.ts';
import { escapeRegex, objectId, slugify } from './validate.ts';

interface ProductDoc extends Omit<Product, '_id' | 'createdAt' | 'updatedAt' | 'deletedAt'> {
  _id: ObjectId;
  stockSizes: string[];
  stockColors: string[];
  searchName: string;
  createdAt: Date;
  updatedAt: Date;
  /** Set while the product sits in the Trash. Missing or null = not deleted. */
  deletedAt?: Date | null;
  /** When the admin ticked "New Arrival"; the latest ticks show first on the homepage. */
  featuredAt?: Date | null;
}

const products = (db: Db) => db.collection<ProductDoc>('products');

/** Trashed products are permanently removed after this many days. */
export const TRASH_DAYS = 30;

/** `deletedAt: null` also matches documents that never had the field. */
const NOT_DELETED = { deletedAt: null } as const;
/** What customers can see: switched on and not in the Trash. */
const LIVE = { isActive: true, ...NOT_DELETED } as const;

const CARD_PROJECTION = {
  name: 1,
  slug: 1,
  category: 1,
  price: 1,
  originalPrice: 1,
  images: 1,
  colors: 1,
  sizes: 1,
  inStock: 1,
  isFeatured: 1,
  createdAt: 1,
} as const;

function toCard(d: ProductDoc): ProductCard {
  const all = d.images ?? [];
  const colorImages: Record<string, ProductImage> = {};
  for (const c of d.colors ?? []) {
    const img = all.find((i) => i.color === c.name);
    if (img) colorImages[c.name] = img;
  }
  return {
    _id: d._id.toHexString(),
    name: d.name,
    slug: d.slug,
    category: d.category,
    price: d.price,
    originalPrice: d.originalPrice ?? null,
    images: all.slice(0, 2),
    colorImages,
    colors: d.colors ?? [],
    sizes: d.sizes ?? [],
    inStock: !!d.inStock,
    isFeatured: !!d.isFeatured,
    createdAt: d.createdAt.toISOString(),
  };
}

function toProduct(d: ProductDoc): Product {
  const { stockSizes: _s, stockColors: _c, searchName: _n, featuredAt: _f, ...rest } = d;
  return {
    ...rest,
    _id: d._id.toHexString(),
    originalPrice: d.originalPrice ?? null,
    createdAt: d.createdAt.toISOString(),
    updatedAt: d.updatedAt.toISOString(),
    deletedAt: d.deletedAt ? d.deletedAt.toISOString() : null,
  };
}

// ------------------------------------------------------------ public list

function str(params: URLSearchParams, key: string, max = 60): string {
  return (params.get(key) ?? '').slice(0, max).trim();
}

export async function listProducts(db: Db, params: URLSearchParams): Promise<ProductListResponse> {
  const base: Filter<ProductDoc> = { ...LIVE };
  let sortKey = str(params, 'sort') || 'newest';

  const category = str(params, 'category');
  if (category) {
    const collection = collectionBySlug(category);
    const segment = normalizeCategory(category);
    if (segment) base.category = segment;
    else if (collection?.categories) base.category = { $in: collection.categories };
    else if (collection?.newArrivals) {
      // Products the admin marked "New Arrival"; if none are marked, the recent ones,
      // and failing that the newest products overall.
      const since = new Date(Date.now() - NEW_ARRIVAL_DAYS * 864e5);
      const marked = !!(await products(db).countDocuments({ ...LIVE, isFeatured: true }, { limit: 1 }));
      if (marked) {
        base.isFeatured = true;
      } else if (await products(db).countDocuments({ ...LIVE, createdAt: { $gte: since } }, { limit: 1 })) {
        base.createdAt = { $gte: since };
      }
      if (!params.get('sort')) sortKey = marked ? 'marked' : 'newest';
    } else throw new HttpError(404, 'Unknown category.');
  }

  const q = str(params, 'q');
  if (q) base.searchName = { $regex: escapeRegex(q.toLowerCase()) };
  if (params.get('featured') === '1') base.isFeatured = true;

  const filter: Filter<ProductDoc> = { ...base };
  const size = str(params, 'size', 12);
  if (size) filter.stockSizes = size;
  const color = str(params, 'color', 30);
  if (color) filter['colors.name'] = color;
  if (params.get('inStock') === '1') filter.inStock = true;

  const sorts: Record<string, Sort> = {
    newest: { createdAt: -1, _id: -1 },
    'price-asc': { price: 1, createdAt: -1 },
    'price-desc': { price: -1, createdAt: -1 },
    featured: { isFeatured: -1, createdAt: -1 },
    marked: { featuredAt: -1, createdAt: -1 },
  };
  const sort = sorts[sortKey] ?? sorts.newest;

  const limit = Math.min(Math.max(parseInt(params.get('limit') ?? '24', 10) || 24, 1), 48);
  const page = Math.min(Math.max(parseInt(params.get('page') ?? '1', 10) || 1, 1), 500);

  const [items, total, sizes, colorFacet] = await Promise.all([
    products(db)
      .find(filter, { projection: CARD_PROJECTION })
      .sort(sort)
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    products(db).countDocuments(filter),
    params.get('facets') === '0' ? Promise.resolve([]) : products(db).distinct('stockSizes', base),
    params.get('facets') === '0'
      ? Promise.resolve([])
      : products(db)
          .aggregate<{ _id: string; hex: string }>([
            { $match: base },
            { $unwind: '$colors' },
            { $group: { _id: '$colors.name', hex: { $first: '$colors.hex' } } },
            { $sort: { _id: 1 } },
            { $limit: 40 },
          ])
          .toArray(),
  ]);

  return {
    items: items.map(toCard),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
    facets: { sizes: sortSizes(sizes as string[]), colors: colorFacet.map((c) => ({ name: c._id, hex: c.hex })) },
  };
}

export async function getPublicProduct(db: Db, slug: string): Promise<{ product: Product; related: ProductCard[] }> {
  if (!/^[a-z0-9-]{1,80}$/.test(slug)) throw new HttpError(404, 'Product not found.');
  const doc = await products(db).findOne({ slug, ...LIVE });
  if (!doc) throw new HttpError(404, 'Product not found.');
  let related = await products(db)
    .find({ ...LIVE, category: doc.category, _id: { $ne: doc._id } }, { projection: CARD_PROJECTION })
    .sort({ inStock: -1, createdAt: -1 })
    .limit(8)
    .toArray();
  if (related.length < 4) {
    const more = await products(db)
      .find(
        { ...LIVE, _id: { $nin: [doc._id, ...related.map((r) => r._id)] } },
        { projection: CARD_PROJECTION },
      )
      .sort({ isFeatured: -1, createdAt: -1 })
      .limit(8 - related.length)
      .toArray();
    related = [...related, ...more];
  }
  return { product: toProduct(doc), related: related.map(toCard) };
}

export async function categorySummaries(db: Db): Promise<CategorySummary[]> {
  const rows = await products(db)
    .aggregate<{ _id: string; count: number; image: ProductImage | null }>([
      { $match: { ...LIVE } },
      { $sort: { isFeatured: -1, inStock: -1, createdAt: -1 } },
      {
        $group: {
          _id: '$category',
          count: { $sum: 1 },
          image: { $first: { $arrayElemAt: ['$images', 0] } },
        },
      },
    ])
    .toArray();
  const byCat = new Map(rows.map((r) => [r._id, r]));
  return CATEGORIES.map((c) => ({
    ...c,
    count: byCat.get(c.slug)?.count ?? 0,
    imageId: byCat.get(c.slug)?.image?.id ?? null,
    imageCutout: !!byCat.get(c.slug)?.image?.cutout,
  }));
}

// ------------------------------------------------------------------ admin

async function buildDoc(db: Db, input: ProductInput) {
  const media = await resolveMedia(db, input.images.map((i) => i.id));
  const images: ProductImage[] = [];
  for (const img of input.images) {
    const m = media.get(img.id);
    if (!m) throw new HttpError(400, 'One of the images is no longer available. Please upload it again.');
    images.push({ id: img.id, width: m.width, height: m.height, color: img.color, kind: img.kind, ...(m.cutout ? { cutout: true } : {}) });
  }
  const totalStock = input.variants.reduce((sum, v) => sum + v.stock, 0);
  const inStockVariants = input.variants.filter((v) => v.stock > 0);
  return {
    ...input,
    images,
    totalStock,
    inStock: totalStock > 0,
    stockSizes: [...new Set(inStockVariants.map((v) => v.size))],
    stockColors: [...new Set(inStockVariants.map((v) => v.color).filter((c): c is string => !!c))],
    searchName: input.name.toLowerCase(),
  };
}

async function uniqueSlug(db: Db, name: string): Promise<string> {
  const base = slugify(name);
  const taken = new Set(
    (
      await products(db)
        .find({ slug: { $regex: `^${escapeRegex(base)}(-\\d+)?$` } }, { projection: { slug: 1 } })
        .toArray()
    ).map((d) => d.slug),
  );
  if (!taken.has(base)) return base;
  for (let i = 2; ; i++) if (!taken.has(`${base}-${i}`)) return `${base}-${i}`;
}

export async function createProduct(db: Db, input: ProductInput): Promise<Product> {
  const now = new Date();
  const fields = await buildDoc(db, input);
  for (let attempt = 0; attempt < 3; attempt++) {
    const doc: ProductDoc = {
      _id: new ObjectId(),
      ...fields,
      slug: await uniqueSlug(db, input.name),
      version: 1,
      createdAt: now,
      updatedAt: now,
      featuredAt: fields.isFeatured ? now : null,
    };
    try {
      await products(db).insertOne(doc);
      return toProduct(doc);
    } catch (err) {
      if ((err as { code?: number }).code !== 11000) throw err; // retry on slug race
    }
  }
  throw new HttpError(409, 'Could not create a unique link for this product. Try a different name.');
}

/**
 * Updates use optimistic concurrency: the client sends the version it loaded,
 * so an edit made in another tab is never silently overwritten (stock included).
 */
export async function updateProduct(db: Db, idRaw: string, input: ProductInput, version: number): Promise<Product> {
  const _id = objectId(idRaw, 'product');
  const existing = await products(db).findOne({ _id, ...NOT_DELETED });
  if (!existing) throw new HttpError(404, 'This product no longer exists.');
  if (existing.version !== version) {
    throw new HttpError(
      409,
      'This product was changed somewhere else since you opened it. Reload to see the latest details, then make your changes again.',
    );
  }
  const fields = await buildDoc(db, input);
  const now = new Date();
  const featuredAt = !fields.isFeatured ? null : existing.isFeatured ? (existing.featuredAt ?? null) : now;
  const updated = await products(db).findOneAndUpdate(
    { _id, version },
    { $set: { ...fields, featuredAt, updatedAt: now }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new HttpError(409, 'This product was just changed somewhere else. Reload and try again.');
  const removed = existing.images.map((i) => i.id).filter((id) => !fields.images.some((i) => i.id === id));
  await deleteMediaIfUnreferenced(db, removed);
  return toProduct(updated);
}

export async function patchProductFlags(db: Db, idRaw: string, body: Record<string, unknown>): Promise<Product> {
  const _id = objectId(idRaw, 'product');
  const $set: Partial<ProductDoc> = {};
  if (typeof body.isActive === 'boolean') $set.isActive = body.isActive;
  if (typeof body.isFeatured === 'boolean') $set.isFeatured = body.isFeatured;
  if (!Object.keys($set).length) throw new HttpError(400, 'Nothing to update.');
  if ($set.isFeatured === false) $set.featuredAt = null;
  else if ($set.isFeatured === true) {
    const existing = await products(db).findOne({ _id, ...NOT_DELETED }, { projection: { isFeatured: 1 } });
    if (existing && !existing.isFeatured) $set.featuredAt = new Date();
  }
  const updated = await products(db).findOneAndUpdate(
    { _id, ...NOT_DELETED },
    { $set: { ...$set, updatedAt: new Date() }, $inc: { version: 1 } },
    { returnDocument: 'after' },
  );
  if (!updated) throw new HttpError(404, 'This product no longer exists.');
  return toProduct(updated);
}

/** Permanent delete: removes the product and any photos no other product uses. */
export async function deleteProduct(db: Db, idRaw: string): Promise<void> {
  const _id = objectId(idRaw, 'product');
  const doc = await products(db).findOneAndDelete({ _id });
  if (!doc) throw new HttpError(404, 'This product no longer exists.');
  await deleteMediaIfUnreferenced(db, doc.images.map((i) => i.id));
}

/**
 * Products deleted while the admin still had a Trash were only hidden; this removes
 * them for good once they are older than TRASH_DAYS.
 */
export async function purgeOldTrash(db: Db): Promise<number> {
  const cutoff = new Date(Date.now() - TRASH_DAYS * 864e5);
  const old = await products(db).find({ deletedAt: { $lt: cutoff } }, { projection: { _id: 1 } }).toArray();
  for (const d of old) await deleteProduct(db, d._id.toHexString());
  return old.length;
}

export async function deleteDemoProducts(db: Db): Promise<number> {
  const demos = await products(db).find({ isDemo: true }, { projection: { _id: 1 } }).toArray();
  for (const d of demos) await deleteProduct(db, d._id.toHexString());
  return demos.length;
}

export async function getAdminProduct(db: Db, idRaw: string): Promise<Product> {
  const doc = await products(db).findOne({ _id: objectId(idRaw, 'product'), ...NOT_DELETED });
  if (!doc) throw new HttpError(404, 'Product not found.');
  return toProduct(doc);
}

export async function listAdminProducts(db: Db, params: URLSearchParams) {
  const filter: Filter<ProductDoc> = { ...NOT_DELETED };
  const q = str(params, 'q');
  if (q) filter.searchName = { $regex: escapeRegex(q.toLowerCase()) };
  const status = str(params, 'status');
  if (status === 'active') filter.isActive = true;
  else if (status === 'inactive') filter.isActive = false;
  else if (status === 'out-of-stock') filter.inStock = false;
  else if (status === 'featured') filter.isFeatured = true;
  const category = normalizeCategory(str(params, 'category'));
  if (category) filter.category = category;

  const limit = 30;
  const page = Math.min(Math.max(parseInt(params.get('page') ?? '1', 10) || 1, 1), 500);
  const [docs, total] = await Promise.all([
    products(db)
      .find(filter, {
        projection: { name: 1, slug: 1, category: 1, price: 1, originalPrice: 1, images: { $slice: 1 }, totalStock: 1, inStock: 1, isActive: 1, isFeatured: 1, isDemo: 1, createdAt: 1, updatedAt: 1, version: 1, sizes: 1, colors: 1 },
      })
      .sort({ createdAt: -1, _id: -1 })
      .skip((page - 1) * limit)
      .limit(limit)
      .toArray(),
    products(db).countDocuments(filter),
  ]);
  return {
    items: docs.map((d) => ({ ...d, _id: d._id.toHexString(), createdAt: d.createdAt.toISOString(), updatedAt: d.updatedAt.toISOString() })),
    total,
    page,
    pages: Math.max(1, Math.ceil(total / limit)),
  };
}

export async function adminStats(db: Db): Promise<AdminStats> {
  const col = products(db);
  const [total, active, outOfStock, featured, demo, recent, usage] = await Promise.all([
    col.countDocuments({ ...NOT_DELETED }),
    col.countDocuments({ ...LIVE }),
    col.countDocuments({ inStock: false, ...NOT_DELETED }),
    col.countDocuments({ isFeatured: true, ...NOT_DELETED }),
    col.countDocuments({ isDemo: true, ...NOT_DELETED }),
    col
      .find({ ...NOT_DELETED }, { projection: { name: 1, slug: 1, price: 1, createdAt: 1, images: { $slice: 1 }, inStock: 1, isActive: 1 } })
      .sort({ createdAt: -1 })
      .limit(6)
      .toArray(),
    storageUsage(db),
  ]);
  return {
    total,
    active,
    outOfStock,
    featured,
    demo,
    recent: recent.map((d) => ({
      _id: d._id.toHexString(),
      name: d.name,
      slug: d.slug,
      price: d.price,
      createdAt: d.createdAt.toISOString(),
      images: d.images,
      inStock: d.inStock,
      isActive: d.isActive,
    })),
    storage: { ...usage, limitBytes: imageLimitBytes() },
  };
}
