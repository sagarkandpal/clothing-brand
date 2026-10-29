/**
 * API integration test against a real, temporary MongoDB (mongodb-memory-server).
 * Exercises the same handler that Netlify runs. Usage: npm run test:api
 */
import { MongoMemoryServer } from 'mongodb-memory-server';
import sharp from 'sharp';
import assert from 'node:assert/strict';

const mongo = await MongoMemoryServer.create();
process.env.MONGODB_URI = mongo.getUri();
process.env.MONGODB_DB_NAME = 'test_store';
process.env.SESSION_SECRET = 'test-secret-'.padEnd(48, 'x');
process.env.ADMIN_EMAIL = 'owner@example.com';
process.env.ADMIN_PASSWORD = 'correct-horse-battery';

const { handleApi } = await import('../server/api.ts');
const ORIGIN = 'http://localhost:5173';
let cookie = '';
let passed = 0;

async function call(method: string, path: string, body?: unknown, extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { origin: ORIGIN, host: 'localhost:5173', ...extra };
  if (cookie) headers.cookie = cookie;
  let payload: BodyInit | undefined;
  if (body instanceof FormData) payload = body;
  else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    payload = JSON.stringify(body);
  }
  const res = await handleApi(new Request(ORIGIN + '/api' + path, { method, headers, body: payload }), { ip: '127.0.0.1' });
  const set = res.headers.get('set-cookie');
  if (set) cookie = set.split(';')[0];
  const type = res.headers.get('content-type') ?? '';
  const data = type.includes('json') ? await res.json() : await res.arrayBuffer();
  return { status: res.status, data: data as any, headers: res.headers };
}

async function test(name: string, fn: () => Promise<void>) {
  try {
    await fn();
    passed++;
    console.log('  ✓', name);
  } catch (err) {
    console.error('  ✗', name);
    throw err;
  }
}

async function makeUpload(color: string) {
  const large = await sharp({ create: { width: 1200, height: 1500, channels: 3, background: color } }).webp({ quality: 80 }).toBuffer();
  const thumb = await sharp(large).resize(480).webp({ quality: 75 }).toBuffer();
  const fd = new FormData();
  fd.append('large', new Blob([large], { type: 'image/webp' }), 'large.webp');
  fd.append('thumb', new Blob([thumb], { type: 'image/webp' }), 'thumb.webp');
  fd.append('width', '1200');
  fd.append('height', '1500');
  return fd;
}

try {
  console.log('Public API');
  await test('empty catalogue lists no products', async () => {
    const r = await call('GET', '/products');
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    assert.equal(r.headers.get('netlify-cache-tag'), 'catalog');
  });
  await test('settings fall back to brand defaults with no WhatsApp number', async () => {
    const r = await call('GET', '/settings');
    assert.equal(r.status, 200);
    assert.equal(r.data.whatsappNumber, null);
    assert.ok(r.data.storeName);
  });
  await test('unknown product returns 404', async () => {
    assert.equal((await call('GET', '/products/does-not-exist')).status, 404);
  });

  console.log('Authorization');
  await test('admin routes reject anonymous requests', async () => {
    assert.equal((await call('GET', '/admin/stats')).status, 401);
    assert.equal((await call('POST', '/admin/products', { name: 'x' })).status, 401);
    assert.equal((await call('POST', '/admin/media', await makeUpload('#000'))).status, 401);
  });
  await test('forged session cookie is rejected', async () => {
    cookie = 'admin_session=' + 'A'.repeat(43);
    assert.equal((await call('GET', '/admin/session')).status, 401);
    cookie = '';
  });
  await test('wrong password is rejected', async () => {
    const r = await call('POST', '/admin/login', { email: 'owner@example.com', password: 'nope-nope-nope' });
    assert.equal(r.status, 401);
  });
  await test('NoSQL operator injection in login is rejected', async () => {
    const r = await call('POST', '/admin/login', { email: { $gt: '' }, password: { $gt: '' } });
    assert.equal(r.status, 400);
  });
  await test('cross-origin POST is blocked', async () => {
    const r = await call('POST', '/admin/login', { email: 'a@b.c', password: 'x' }, { origin: 'https://evil.example' });
    assert.equal(r.status, 403);
  });
  await test('login with the .env email and password works', async () => {
    const r = await call('POST', '/admin/login', { email: 'Owner@Example.com', password: 'correct-horse-battery' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const sc = r.headers.get('set-cookie') ?? '';
    assert.match(sc, /HttpOnly/);
    assert.match(sc, /SameSite=Strict/);
    assert.equal((await call('GET', '/admin/session')).data.email, 'owner@example.com');
  });

  console.log('Images (GridFS)');
  let imgA = '';
  let imgB = '';
  await test('upload stores large + thumb and returns a media id', async () => {
    const r = await call('POST', '/admin/media', await makeUpload('#222222'));
    assert.equal(r.status, 201, JSON.stringify(r.data));
    imgA = r.data.id;
    imgB = (await call('POST', '/admin/media', await makeUpload('#e5e1d8'))).data.id;
    assert.match(imgA, /^[a-f0-9]{24}$/);
  });
  await test('non-image upload is refused', async () => {
    const fd = new FormData();
    fd.append('large', new Blob([Buffer.alloc(2000, 1)], { type: 'image/webp' }), 'x.webp');
    fd.append('thumb', new Blob([Buffer.alloc(2000, 1)], { type: 'image/webp' }), 'x.webp');
    fd.append('width', '1200');
    fd.append('height', '1500');
    assert.equal((await call('POST', '/admin/media', fd)).status, 415);
  });
  await test('image endpoint serves binary with immutable caching', async () => {
    const r = await call('GET', `/images/${imgA}/sm`);
    assert.equal(r.status, 200);
    assert.equal(r.headers.get('content-type'), 'image/webp');
    assert.match(r.headers.get('cache-control') ?? '', /immutable/);
    assert.equal((await call('GET', `/images/${'0'.repeat(24)}/lg`)).status, 404);
  });

  console.log('Products');
  const input = {
    name: 'Oversized Black T-shirt',
    description: '240 GSM cotton.\nBoxy fit.',
    category: 'upper',
    price: 499,
    originalPrice: 799,
    sizes: ['L', 'M', 'XL'],
    colors: [
      { name: 'Black', hex: '#111111' },
      { name: 'Off White', hex: '#e9e4d8', soldOut: true },
    ] as { name: string; hex: string; soldOut?: boolean }[],
    images: [
      { id: '', color: 'Black' },
      { id: '', color: 'Off White' },
    ],
    isActive: true,
    isFeatured: true,
  };
  let product: any;
  await test('invalid product data is rejected with a clear message', async () => {
    const r = await call('POST', '/admin/products', { ...input, images: [], price: -5 });
    assert.equal(r.status, 400);
    assert.ok(r.data.error);
    const r2 = await call('POST', '/admin/products', { ...input, images: [], originalPrice: 100 });
    assert.equal(r2.status, 400);
    const r3 = await call('POST', '/admin/products', { ...input, images: [], category: { $ne: null } });
    assert.equal(r3.status, 400);
  });
  await test('admin creates a product with colours (one sold out) and images', async () => {
    input.images[0].id = imgA;
    input.images[1].id = imgB;
    const r = await call('POST', '/admin/products', input);
    assert.equal(r.status, 201, JSON.stringify(r.data));
    product = r.data;
    assert.equal(product.slug, 'oversized-black-t-shirt');
    assert.deepEqual(product.sizes, ['M', 'L', 'XL']);
    assert.equal(product.variants.length, 6);
    assert.equal(product.totalStock, 3); // Black available in 3 sizes; Off White sold out
    assert.equal(product.colors[1].soldOut, true);
    assert.equal(product.colors[0].soldOut, undefined);
    assert.equal(product.images[0].width, 1200);
  });
  await test('product appears on storefront list, detail and category', async () => {
    const list = await call('GET', '/products');
    assert.equal(list.data.total, 1);
    assert.equal(list.data.items[0].images.length, 2);
    assert.deepEqual(list.data.facets.sizes, ['M', 'L', 'XL']);
    const detail = await call('GET', `/products/${product.slug}`);
    assert.equal(detail.status, 200);
    assert.equal(detail.data.product.price, 499);
    const cats = await call('GET', '/categories');
    const c = cats.data.find((x: any) => x.slug === 'upper');
    assert.equal(c.count, 1);
    assert.equal(c.imageId, imgA);
    assert.equal(list.data.items[0].colorImages.Black.id, imgA);
    assert.equal(list.data.items[0].colorImages['Off White'].id, imgB);
    assert.equal((await call('GET', '/products?category=new-arrivals')).data.total, 1);
  });
  await test('search, size, colour and stock filters work', async () => {
    await call('POST', '/admin/products', {
      ...input,
      name: 'Washed Grey Hoodie',
      category: 'hoodies', // old category name: stored as the Upper segment
      price: 1299,
      originalPrice: null,
      sizes: ['S'],
      colors: [],
      soldOut: true,
      images: [],
      isFeatured: false,
    });
    assert.equal((await call('GET', '/products?q=hood')).data.total, 1);
    assert.equal((await call('GET', '/products?q=' + encodeURIComponent('.*'))).data.total, 0);
    assert.equal((await call('GET', '/products?size=M')).data.total, 1);
    assert.equal((await call('GET', '/products?size=S')).data.total, 0); // hoodie is sold out
    assert.equal((await call('GET', '/products?color=Black')).data.total, 1);
    assert.equal((await call('GET', '/products?inStock=1')).data.total, 1);
    const asc = await call('GET', '/products?sort=price-asc');
    assert.deepEqual(asc.data.items.map((i: any) => i.price), [499, 1299]);
    const desc = await call('GET', '/products?sort=price-desc');
    assert.deepEqual(desc.data.items.map((i: any) => i.price), [1299, 499]);
    assert.equal((await call('GET', '/products?category=bottom')).data.total, 0);
    assert.equal((await call('GET', '/products?category=upper')).data.total, 2);
    assert.equal((await call('GET', '/products?category=jeans')).data.total, 0); // old link → Bottom segment
    assert.equal((await call('GET', '/products?limit=1&page=2')).data.items.length, 1);
  });
  await test('duplicate names get unique slugs', async () => {
    const r = await call('POST', '/admin/products', { ...input, images: [] });
    assert.equal(r.data.slug, 'oversized-black-t-shirt-2');
    await call('DELETE', `/admin/products/${r.data._id}`);
  });
  await test('edit switches a colour back to available; stale version is refused', async () => {
    const edited = { ...input, version: product.version, colors: input.colors.map((c) => ({ ...c, soldOut: false })) };
    const r = await call('PUT', `/admin/products/${product._id}`, edited);
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.totalStock, 6);
    assert.equal(r.data.version, product.version + 1);
    const stale = await call('PUT', `/admin/products/${product._id}`, edited);
    assert.equal(stale.status, 409);
    product = r.data;
    assert.equal(product.colors[1].soldOut, undefined);
  });
  await test('up to 20 colours are accepted, more are refused', async () => {
    const many = Array.from({ length: 20 }, (_, i) => ({ name: `Colour ${i + 1}`, hex: '#123456' }));
    const ok = await call('POST', '/admin/products', { ...input, name: 'Many Colours Tee', images: [], colors: many });
    assert.equal(ok.status, 201, JSON.stringify(ok.data));
    assert.equal(ok.data.colors.length, 20);
    const tooMany = await call('POST', '/admin/products', { ...input, images: [], colors: [...many, { name: 'Extra', hex: '#000000' }] });
    assert.equal(tooMany.status, 400);
    await call('DELETE', `/admin/products/${ok.data._id}`);
  });
  await test('deactivated product disappears from storefront', async () => {
    const r = await call('PATCH', `/admin/products/${product._id}`, { isActive: false });
    assert.equal(r.status, 200);
    assert.equal((await call('GET', `/products/${product.slug}`)).status, 404);
    product = (await call('PATCH', `/admin/products/${product._id}`, { isActive: true })).data;
    assert.equal((await call('GET', `/products/${product.slug}`)).status, 200);
  });
  await test('latest "New Arrival" tick shows first in new arrivals', async () => {
    const mk = async (name: string) =>
      (await call('POST', '/admin/products', { ...input, name, isFeatured: true, images: [{ id: imgA, color: null }] })).data;
    const first = await mk('Ticked First Tee');
    const second = await mk('Ticked Second Tee');
    const names = async () => (await call('GET', '/products?category=new-arrivals&limit=4')).data.items.map((i: any) => i.name);
    assert.equal((await names())[0], 'Ticked Second Tee');
    // Re-ticking the older product moves it to the front.
    await call('PATCH', `/admin/products/${first._id}`, { isFeatured: false });
    await call('PATCH', `/admin/products/${first._id}`, { isFeatured: true });
    assert.equal((await names())[0], 'Ticked First Tee');
    await call('DELETE', `/admin/products/${first._id}`);
    await call('DELETE', `/admin/products/${second._id}`);
  });
  await test('delete removes the product for good; shared photos survive', async () => {
    const copy = await call('POST', '/admin/products', { ...input, name: 'Shared Image Tee', images: [{ id: imgA, color: null }] });
    assert.equal(copy.status, 201);
    assert.equal((await call('DELETE', `/admin/products/${product._id}`)).status, 200);
    assert.equal((await call('GET', `/products/${product.slug}`)).status, 404, 'deleted product is gone from the shop');
    assert.equal((await call('GET', `/admin/products/${product._id}`)).status, 404, 'deleted product is gone from the admin');
    assert.equal((await call('GET', `/images/${imgA}/lg`)).status, 200, 'shared image must remain');
    assert.equal((await call('GET', `/images/${imgB}/lg`)).status, 404, 'unshared image must be removed');
    await call('DELETE', `/admin/products/${copy.data._id}`);
    assert.equal((await call('GET', `/images/${imgA}/lg`)).status, 404);
  });

  console.log('Usage, backup, health');
  await test('plan usage reports meters and limits', async () => {
    const r = await call('GET', '/admin/usage');
    assert.equal(r.status, 200);
    assert.ok(r.data.meters.length >= 1);
    assert.equal(r.data.warnPercent, 70);
    assert.ok(r.data.meters.every((m: any) => m.percent >= 0 && m.percent <= 100));
  });
  await test('backup downloads JSON without admin or session data', async () => {
    const r = await call('GET', '/admin/backup');
    assert.equal(r.status, 200);
    assert.match(r.headers.get('content-disposition') ?? '', /attachment; filename="store-backup-/);
    assert.ok(Array.isArray(r.data.products));
    assert.equal(r.data.admins, undefined);
    assert.equal(r.data.sessions, undefined);
  });
  await test('health check answers 200 when the database is up', async () => {
    const r = await call('GET', '/health');
    assert.equal(r.status, 200);
    assert.equal(r.data.ok, true);
  });

  console.log('Settings');
  await test('invalid WhatsApp number is rejected; valid one is normalised', async () => {
    assert.equal((await call('PUT', '/admin/settings', { whatsappNumber: '12345' })).status, 400);
    const r = await call('PUT', '/admin/settings', { whatsappNumber: '098765 43210', instagramHandle: '@my.store', announcements: ['Hello'] });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.whatsappNumber, '919876543210');
    assert.equal(r.data.instagramHandle, 'my.store');
    assert.equal((await call('GET', '/settings')).data.whatsappNumber, '919876543210');
  });
  await test('About page text is saved', async () => {
    const r = await call('PUT', '/admin/settings', { aboutHeadline: 'Our story', aboutText: 'Line one.\n\nLine two.' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal((await call('GET', '/settings')).data.aboutText, 'Line one.\n\nLine two.');
  });

  console.log('Session');
  await test('changing the .env login ends old sessions and the old password', async () => {
    const saved = cookie;
    process.env.ADMIN_PASSWORD = 'a-new-password';
    assert.equal((await call('GET', '/admin/stats')).status, 401, 'old session must end');
    cookie = '';
    assert.equal((await call('POST', '/admin/login', { email: 'owner@example.com', password: 'correct-horse-battery' })).status, 401);
    assert.equal((await call('POST', '/admin/login', { email: 'owner@example.com', password: 'a-new-password' })).status, 200);
    assert.notEqual(cookie, saved);
    assert.equal((await call('GET', '/admin/stats')).status, 200);
  });
  await test('logout invalidates the session server-side', async () => {
    const saved = cookie;
    await call('POST', '/admin/logout');
    cookie = saved; // replaying the old cookie must fail
    assert.equal((await call('GET', '/admin/stats')).status, 401);
    cookie = '';
  });
  await test('login is rate limited after repeated failures', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) {
      last = (await call('POST', '/admin/login', { email: 'owner@example.com', password: 'wrong-' + i })).status;
    }
    assert.equal(last, 429);
  });

  console.log(`\n${passed} API checks passed.`);
} finally {
  const { getDb } = await import('../server/db.ts');
  // Close the driver so the process can exit.
  const db = await getDb().catch(() => null);
  await (db as any)?.client?.close?.().catch?.(() => {});
  await mongo.stop();
  process.exit(process.exitCode ?? 0);
}
